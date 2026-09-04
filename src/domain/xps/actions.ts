'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { templateById } from '@kxb/xp'
import { mayDo, type XpAction } from '@/domain/xps/access'
import { nameForCopy, nameInSpace } from '@/domain/xps/naming'
import { xpDecider } from '@/domain/xps/aggregate'
import {
  createXpSchema,
  reasonSchema,
  renameXpSchema,
  rollBackXpSchema,
  setXpAccessSchema,
  shareXpSchema,
  priceXpSchema,
  submitXpSchema,
  type XpCommand,
} from '@/domain/xps/commands'
import { readGrant } from '@/domain/xps/grants'
import { listMembers } from '@/domain/tenants/queries'
import { coverFor } from '@/domain/xps/manifest'
import { moveProject } from '@/domain/xps/move'
import type { XpSpacePolicy } from '@/domain/xps/events'
import { chargeSubmission } from '@/domain/xps/dues'
import { payForRemix, remixPriceOf } from '@/domain/xps/royalties'
import { xpsProjection } from '@/domain/xps/projection'
import { loadPlayableXp } from '@/domain/xps/playable'
import { findXpProject, listSpaceXps, readXpVersion, type XpProjectRow } from '@/domain/xps/queries'
import { parseXpRef } from '@/domain/xps/ref'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { canWrite, requireTenant, type TenantContext } from '@/lib/tenant'
import { hasRoomFor } from '@/domain/billing/quota'
import type { FlaggedLimitKey } from '@/domain/billing/limits'
import { tierLimit } from '@/domain/billing/tiers'

/**
 * A project's lifecycle, from a form.
 *
 * ---------------------------------------------------------------------------
 * Every one of these re-checks, and hiding a button hides nothing
 * ---------------------------------------------------------------------------
 * A Server Action is a public endpoint. The library decides what to *draw* with
 * the same `mayDo` these call, and that is a courtesy to the person reading the
 * page rather than a boundary - somebody who never loads the page can still
 * post to the action. So the ladder runs again here, on the server, with the
 * project read fresh rather than passed in.
 *
 * The decider then checks what only it can see: that the project exists, that
 * it is not archived, that the caller owns it, that a rollback names a version
 * review actually approved. Three layers, and each one knows something the
 * others do not - `commands.ts` says which is which.
 */

export type XpActionResult =
  /**
   * `events` is what the command actually appended, by type.
   *
   * Empty is a real and ordinary answer: several arms of this decider no-op on
   * a legitimate repeat, and `ok` alone cannot tell that from a change. Only
   * callers that must act exactly once - the ones that move coins - read it.
   */
  | { ok: true; events?: readonly string[] }
  | { ok: false; error: string }

function toResult(error: unknown): XpActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'That project changed elsewhere. Reload and try again.' }
  }
  throw error
}

/**
 * Membership, the tier, billing, and the ladder — resolved once.
 *
 * Returns the pieces every action needs or the reason it may not run. The
 * project is loaded with the caller's own session, so RLS has already decided
 * whether they may see it at all; this decides what they may do to it.
 */
type Guarded =
  | { ok: false; error: string }
  | { ok: true; context: TenantContext; project: XpProjectRow }

async function guard(slug: string, xpId: string, action: XpAction): Promise<Guarded> {
  const context = await requireTenant(slug)

  const project = await findXpProject(context.supabase, xpId)
  if (!project) return { ok: false, error: 'That project could not be found' }

  // The one check a cross-tenant guess would otherwise get past. `executeCommand`
  // runs with the caller's tenant id, so RLS on `events` would refuse the write
  // anyway - this turns an opaque database error into an answer.
  if (project.tenantId !== context.tenant.id) {
    return { ok: false, error: 'That project is not in this space' }
  }

  const verdict = mayDo(project, action, {
    accountId: context.user.id,
    space: context,
    grant: await readGrant(context.supabase, xpId, context.user.id),
    operator: false,
  })
  if (!verdict.allowed) return { ok: false, error: verdict.reason }

  return { ok: true, context, project }
}

/**
 * What this space is already calling its projects.
 *
 * Every path that names a new one goes through here, so "no two projects in a
 * space share a name" is one rule rather than three that drift - a typed name, a
 * copy's derived name and a remix's inherited name are the same question asked
 * from three doors.
 *
 * Read with the caller's own client, so RLS decides what counts as taken: a
 * member who cannot see a private project cannot collide with it either. The
 * archived and removed are already out of `listSpaceXps`, which is right - a
 * name nobody can see in the library is a name worth reusing.
 */
async function namesInSpace(context: TenantContext): Promise<string[]> {
  const projects = await listSpaceXps(context.supabase, context.tenant.id)
  return projects.map((project) => project.name)
}

async function run(
  context: TenantContext,
  xpId: string,
  command: XpCommand,
): Promise<XpActionResult> {
  try {
    const appended = await executeCommand({
      supabase: context.supabase,
      decider: xpDecider,
      tenantId: context.tenant.id,
      streamId: xpId,
      command,
    })
    await runProjection(context.supabase, xpsProjection, context.tenant.id)
    /*
      The events are handed back because "the command succeeded" and "the
      command did anything" are not the same answer here, and one caller needs
      the difference. Several arms of this decider return `[]` for a legitimate
      repeat - submitting something already submitted, sharing with somebody who
      already has the grant - and a caller that charged money on `ok` alone
      would charge for the repeat too. See `submitXp`.
    */
    return { ok: true, events: appended.map((event) => event.type) }
  } catch (error) {
    return toResult(error)
  }
}

/**
 * Start one.
 *
 * The stream id is minted here rather than by the database, which is what lets
 * the decider refuse a second `CreateXp` on the same stream as a collision
 * rather than treating it as a retry.
 *
 * `redirect` throws, so it is outside the try in `run` — a redirect caught as an
 * error would report "that project changed elsewhere" on a perfectly successful
 * create, which is a bug this codebase has met before.
 */
/**
 * Room for one more project in this space, or the sentence refusing it.
 *
 * Replaces `hasTier(context, 'xp')` at every creation path, and that is a
 * product change rather than a refactor. Projects used to be a *half of the
 * product* you either had or did not: xo was told "projects are part of xp" and
 * shown the door. They are a quantity now - xo holds three, xp holds as many as
 * it likes, free holds none - so the question stopped being *which tier* and
 * became *how many*, and the answer moved from a gate at the top of the action
 * to a count beside the create.
 *
 * `state not in (archived, removed)` matches what `listXpProjects` counts as a
 * project that exists. An archived project is not editable and should not be
 * occupying a slot - which also gives somebody over their cap a way down that
 * destroys nothing, the same instinct as the shelving rules in
 * `docs/product/pricing.md` §6.
 *
 * Fails open on a broken count, like everything else that guards a cap.
 */
/**
 * What a new project is visible to on this tier, and which cap it counts
 * against.
 *
 * ---------------------------------------------------------------------------
 * The conflict this resolves
 * ---------------------------------------------------------------------------
 * A project is private until its owner says otherwise - `XpCreated` sets no
 * policy and `none` is the default, which is the safe direction and has been
 * since the aggregate was written. Free holds **zero** private projects.
 * Together those two facts say a free space may never create anything at all,
 * which is not a plan, it is a broken one.
 *
 * It is not a mistake in either half. Free holding no private projects is the
 * tier's whole story - *free is public by default, and paying is what buys
 * privacy* - and defaulting to private is right everywhere that privacy is on
 * offer. What was missing is the sentence connecting them, which is this:
 *
 *   **On a tier that holds no private projects, a new one is team-visible.**
 *
 * So a free space keeps working exactly as it did, its wall stays where it
 * always was (one project), and "zero private" means what it says - you cannot
 * *hide* one here - rather than "you cannot make one".
 */
function openingVisibility(tier: TenantContext['tenant']['tier']): {
  policy: XpSpacePolicy
  key: FlaggedLimitKey
  /** The `space_policy` values a row must have to count against `key`. */
  counts: readonly string[]
} {
  return tierLimit(tier, 'privateXps') === 0
    ? { policy: 'view', key: 'projects', counts: ['view', 'edit'] }
    : { policy: 'none', key: 'privateXps', counts: ['none'] }
}

/**
 * Is there room for one more project of this visibility?
 *
 * Counts only rows of the *same* kind, which is the whole point of the split:
 * a space that has published ten levels has not used up its private drafts, and
 * a plan that said otherwise would be selling three numbers and enforcing one.
 *
 * `null` on a failed count, which lifts the cap - the direction `quota.ts`
 * argues for at length. A lookup that broke must not be the thing that stops
 * somebody making a level.
 */
async function visibilityFull(
  context: TenantContext,
  kind: { key: FlaggedLimitKey; counts: readonly string[] },
): Promise<string | null> {
  const { count, error } = await context.supabase
    .from('xps_read_model')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', context.tenant.id)
    .in('space_policy', [...kind.counts])
    .not('state', 'in', '("archived","removed")')

  if (error) return null

  const { allowed, limit } = await hasRoomFor(
    context.supabase,
    context.tenant.id,
    context.tenant.tier,
    kind.key,
    count ?? 0,
  )

  if (allowed) return null

  return limit === 0
    ? `${context.tenant.name} is on a plan without projects. Upgrade to make one.`
    : `${context.tenant.name} is using all ${limit} of its projects. Archive one, buy one more, or upgrade.`
}

/** The create paths' question: room for one more, at whatever this tier opens them as. */
async function projectsFull(context: TenantContext): Promise<string | null> {
  return visibilityFull(context, openingVisibility(context.tenant.tier))
}

export async function createXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const context = await requireTenant(slug)

  if (!canWrite(context)) {
    return { ok: false, error: `${context.tenant.name} cannot be written to right now` }
  }

  const full = await projectsFull(context)
  if (full) return { ok: false, error: full }

  const parsed = createXpSchema.safeParse({
    name: formData.get('name'),
    template: formData.get('template') || undefined,
    // Empty string is "they left it on auto", which is the absence of a choice
    // rather than a choice of zero - and zero is red.
    finish: formData.get('finish') || undefined,
    hue: formData.get('hue') || undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check that form' }
  }

  /**
   * An id nobody offered is dropped rather than recorded.
   *
   * The field is there for the funnel, and the editor answers an unknown id
   * with the empty room — so writing one down would be a row claiming somebody
   * started from a template they were never given and did not get. Refusing
   * instead would be an error message for a case only a hand-posted form can
   * reach. Silence keeps the log and the level agreeing.
   */
  const template = parsed.data.template && templateById(parsed.data.template)

  const xpId = randomUUID()
  const result = await run(context, xpId, {
    type: 'CreateXp',
    actorId: context.user.id,
    /*
     * Numbered rather than refused, which is the difference between a form that
     * helps and a form that argues. Somebody who typed the name of a project
     * that already exists is usually making the second one on purpose - a
     * message sending them back to invent a word is a worse answer than a "2"
     * they can rename in the panel they are about to open.
     */
    name: nameInSpace(parsed.data.name, await namesInSpace(context)),
    ...(template ? { template: template.id } : {}),
    /*
      Carried into the log rather than written into a document, because there
      is no document yet - `CreateXp` mints a project before anything is saved.
      The editor reads these back when it builds the starter and stamps them
      on, after which they live in `XpDocument` where they belong. Same slot as
      `template`, same reasoning.
    */
    ...(parsed.data.finish ? { finish: parsed.data.finish } : {}),
    ...(parsed.data.hue === undefined ? {} : { hue: parsed.data.hue }),
  })
  if (!result.ok) return result

  /*
    Open it to the space, on a tier that holds no private projects.

    `XpCreated` records no policy and `none` is the default, which is right
    wherever privacy is on offer. On free it is not: that tier holds zero
    private projects, so a project left at the default would be one the space
    is not allowed to have - and the check above would have refused the create
    that just succeeded.

    A second command rather than a field on `CreateXp`, because this is not a
    property of *creating* a project - it is what this space's plan permits, and
    the decider has no idea what tier anything is on. `openingVisibility` is the
    one place that decision is made; this is it being carried out.

    A failure here leaves a private project on a tier that should not hold one.
    Reported rather than swallowed: it is the owner's own project either way,
    and the honest answer is that it was made but not shared.
  */
  const opening = openingVisibility(context.tenant.tier)
  if (opening.policy !== 'none') {
    const shared = await run(context, xpId, {
      type: 'SetXpAccess',
      actorId: context.user.id,
      spacePolicy: opening.policy,
    })
    if (!shared.ok) return shared
  }

  revalidatePath(`/t/${slug}/browse`)
  /**
   * Into the editor, not onto the project page.
   *
   * A project that was minted a second ago has nothing the workbench can say
   * about it - no saved version, no release, nobody to share it with - so
   * landing there is a page of dashes with one button on it, and the button is
   * this link. Somebody who just named a thing wants to build it.
   *
   * The shelf is revalidated first because that is where they come back to, and
   * the editor opens a project with nothing saved on a starter document rather
   * than refusing - see `SpaceEditorPage`, which was written as the other half
   * of minting a project before there is anything in it.
   */
  redirect(`/t/${slug}/studio/xp/${xpId}`)
}

/**
 * What this level costs: to play once, and to fork.
 *
 * `docs/product/economy.md` §9. The owner's, like sharing - what a thing is
 * worth is not a decision the space it happens to live in gets to make, and
 * `guard(…, 'own')` is what says so.
 *
 * The split is not settable from here yet, and that is deliberate rather than
 * forgotten: `XpPriced` carries one and the decider validates it, but naming
 * collaborators needs a person-picker and a story about what happens when one
 * of them leaves the space. Setting a price is the useful half and it ships
 * without them; the remainder is the owner's, which is what an absent split
 * already means.
 */
export async function priceXp(
  slug: string,
  input: { xpId: string; once: number; remix: number },
): Promise<XpActionResult> {
  const parsed = priceXpSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check those prices' }
  }

  const guarded = await guard(slug, parsed.data.xpId, 'own')
  if (!guarded.ok) return guarded

  const result = await run(guarded.context, parsed.data.xpId, {
    type: 'PriceXp',
    actorId: guarded.context.user.id,
    once: parsed.data.once,
    remix: parsed.data.remix,
  })

  if (result.ok) revalidatePath(`/t/${slug}/browse/${parsed.data.xpId}`)
  return result
}

/** Put it forward for review. */
export async function submitXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const parsed = submitXpSchema.safeParse({
    xpId: formData.get('xpId'),
    note: formData.get('note') || undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check that form' }
  }

  const guarded = await guard(slug, parsed.data.xpId, 'submit')
  if (!guarded.ok) return guarded

  const result = await run(guarded.context, parsed.data.xpId, {
    type: 'SubmitXp',
    actorId: guarded.context.user.id,
    ...(parsed.data.note ? { note: parsed.data.note } : {}),
  })
  if (!result.ok) return result

  /*
    The fee, charged only when a submission was actually written.

    `ok` is not enough on its own: the decider returns `[]` for somebody
    submitting a project that is already in the queue, and charging on `ok`
    would take 300 coins for a second click that did nothing. Withdrawing and
    submitting again *does* charge again, and should - each trip through the
    queue is a trip a person has to read.

    Charged *after* the append rather than before it, which is the opposite of
    the order this economy usually uses. The reason is that the queue is the
    thing being protected: a submission that landed and a fee that did not is a
    reviewer's time somebody got for free, which is recoverable and visible. A
    fee taken for a submission that then failed to append is money for nothing,
    and the submitter would have no way to tell.

    A refusal here is reported, and the submission stands. It is not a reason to
    unpick a decision the log has already recorded - see `chargeSubmission`.
  */
  if (result.events?.includes('XpSubmitted')) {
    const paid = await chargeSubmission(
      guarded.context.supabase,
      guarded.context.tenant.id,
      guarded.context.user.id,
      guarded.project.name,
    )
    if (!paid.ok) {
      revalidatePath(`/t/${slug}/browse/${parsed.data.xpId}`)
      return { ok: false, error: `Submitted, but the fee could not be taken: ${paid.error}` }
    }
  }

  revalidatePath(`/t/${slug}/browse/${parsed.data.xpId}`)
  return result
}

/** Take a submission back before anybody has read it. */
export async function withdrawXp(slug: string, xpId: string): Promise<XpActionResult> {
  const guarded = await guard(slug, xpId, 'submit')
  if (!guarded.ok) return guarded

  const result = await run(guarded.context, xpId, {
    type: 'WithdrawXp',
    actorId: guarded.context.user.id,
  })
  if (result.ok) revalidatePath(`/t/${slug}/browse/${xpId}`)
  return result
}

/**
 * Call it something else.
 *
 * ---------------------------------------------------------------------------
 * Numbered rather than refused, the same as creating one
 * ---------------------------------------------------------------------------
 * `nameInSpace` decides, with this project left out of what counts as taken —
 * otherwise renaming "Minigolf" to "Minigolf" (or only fixing its capitals)
 * would collide with itself and come back as "Minigolf 2". The answer is
 * returned rather than assumed, because the caller has the name on screen and a
 * title bar still showing what somebody typed after the space adjusted it is a
 * title bar that is lying.
 *
 * `own`, so it is the project's owner and nobody else — an editor's grant lets
 * them build in it, not rename somebody else's work out from under them.
 */
export async function renameXp(
  slug: string,
  xpId: string,
  name: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const parsed = renameXpSchema.safeParse({ xpId, name })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check that name' }
  }

  const guarded = await guard(slug, parsed.data.xpId, 'own')
  if (!guarded.ok) return guarded

  const others = await listSpaceXps(guarded.context.supabase, guarded.context.tenant.id)
  const wanted = nameInSpace(
    parsed.data.name,
    others.filter((project) => project.id !== parsed.data.xpId).map((project) => project.name),
  )

  const result = await run(guarded.context, parsed.data.xpId, {
    type: 'RenameXp',
    actorId: guarded.context.user.id,
    name: wanted,
  })
  if (!result.ok) return result

  revalidatePath(`/t/${slug}/browse`)
  revalidatePath(`/t/${slug}/browse/${parsed.data.xpId}`)
  return { ok: true, name: wanted }
}

/**
 * Put an earlier release back.
 *
 * Guarded as `own` rather than as a publish, and that is the whole design: every
 * version this can reach has already been read and approved, so it is movement
 * inside what review permitted rather than a way around it. The decider refuses
 * anything that was never released, which is the line that keeps it true.
 */
export async function rollBackXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const parsed = rollBackXpSchema.safeParse({
    xpId: formData.get('xpId'),
    to: Number(formData.get('to')),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Pick a release' }
  }

  const guarded = await guard(slug, parsed.data.xpId, 'own')
  if (!guarded.ok) return guarded

  const result = await run(guarded.context, parsed.data.xpId, {
    type: 'RollBackXp',
    actorId: guarded.context.user.id,
    to: parsed.data.to,
  })

  if (result.ok) {
    revalidatePath(`/t/${slug}/browse/${parsed.data.xpId}`)
    // The store serves a different version now, so its pages are stale.
    revalidatePath('/browse')
    revalidatePath(`/browse/xp/${parsed.data.xpId}`)
  }
  return result
}

/**
 * The space's owner taking a project out of their space.
 *
 * The one action where the caller is deliberately not the project's owner. It
 * removes and never takes: the project leaves this library and stops costing
 * this space bytes, and whoever owns it keeps their copy and their export.
 */
export async function removeXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const xpId = String(formData.get('xpId') ?? '')
  const reason = reasonSchema.safeParse(formData.get('reason'))
  if (!reason.success) {
    return { ok: false, error: reason.error.issues[0]?.message ?? 'Say why' }
  }

  const guarded = await guard(slug, xpId, 'remove')
  if (!guarded.ok) return guarded

  const result = await run(guarded.context, xpId, {
    type: 'RemoveXp',
    actorId: guarded.context.user.id,
    reason: reason.data,
  })
  if (result.ok) revalidatePath(`/t/${slug}/browse`)
  return result
}

/**
 * Duplicate a project.
 *
 * ---------------------------------------------------------------------------
 * A copy costs no bytes, and that is not a coincidence
 * ---------------------------------------------------------------------------
 * The assets are content-addressed per space (`xp_files`), so every blob the
 * original refers to is already held by this tenant under exactly the hash the
 * copy's manifest names. Duplicating a 40MB project therefore writes two rows
 * and moves nothing — the same property that makes a save a diff, seen from the
 * other end.
 *
 * That is also why this is a same-space operation. Copying *across* spaces
 * means re-keying every blob under the target tenant's prefix, which is the
 * expensive half of the move described in docs/xp/backend.md §7.0 and belongs
 * with it rather than here.
 *
 * ---------------------------------------------------------------------------
 * You may copy what you may edit, which is narrower than what you may read
 * ---------------------------------------------------------------------------
 * Guarded as `edit` deliberately. Copying something you can only *see* is a
 * fork, and forking somebody else's work into your own name is a different act
 * with a credit question attached — §12.5 leaves it open and this does not
 * quietly answer it. Widening this one word is the whole change if we decide to.
 *
 * The copy is a fresh draft owned by whoever pressed the button, with no
 * releases and no submission. Nothing about the original's standing carries
 * over, because a copy has not been reviewed.
 */
export async function copyXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const made = await duplicateXp(slug, String(formData.get('xpId') ?? ''))
  if (!made.ok) return made

  revalidatePath(`/t/${slug}/browse`)
  redirect(`/t/${slug}/browse/${made.copyId}`)
}

export type DuplicateResult = { ok: true; copyId: string } | { ok: false; error: string }

/**
 * The copy itself, without deciding where the person who asked for it goes.
 *
 * Split out of `copyXp` for docs/xp/backlog.md §1c, which needs the same copy
 * from a different surface and with a different ending: a member standing in a
 * room takes their own copy of the level being played and wants to be *in the
 * editor on it*, not on the project page. `copyXp` redirects, and a redirect is
 * a `throw` — so there was no way to reuse it without inheriting its
 * destination.
 *
 * Everything that decides *whether* the copy may happen is in here rather than
 * in either caller, which is the point of the split: `guard(…, 'edit')` is the
 * boundary, and a second entrance that repeated it would be a second place for
 * §7.4's ladder to be got wrong.
 */
export async function duplicateXp(slug: string, xpId: string): Promise<DuplicateResult> {
  const guarded = await guard(slug, xpId, 'edit')
  if (!guarded.ok) return guarded

  const { context, project } = guarded
  if (project.currentVersion === 0) {
    return { ok: false, error: 'There is nothing saved to copy yet' }
  }

  // A duplicate is a project. Checked here as well as at the other two doors,
  // because "the caller checked" is the arrangement that fails the day there
  // are three callers - which there now are.
  const full = await projectsFull(context)
  if (full) return { ok: false, error: full }

  const source = await readXpVersion(context.supabase, xpId, project.currentVersion)
  if (!source) return { ok: false, error: 'That version could not be read' }

  const copyId = randomUUID()

  // The read model row has to exist before a version can reference it, so the
  // projection runs between the two rather than once at the end.
  const created = await run(context, copyId, {
    type: 'CreateXp',
    actorId: context.user.id,
    /*
     * The copy rule proposes and the space disposes. `nameForCopy` stops
     * "Minigolf copy copy"; this stops two separate "Minigolf copy"s, which is
     * what duplicating the same project twice used to produce.
     */
    name: nameInSpace(nameForCopy(project.name), await namesInSpace(context)),
    copiedFrom: xpId,
  })
  if (!created.ok) return created

  const { error } = await context.supabase.from('xp_versions').insert({
    xp_id: copyId,
    version: 1,
    document: source.document as never,
    manifest: source.manifest as never,
    bytes: source.bytes,
    files: source.files,
    created_by: context.user.id,
  })
  if (error) return { ok: false, error: 'Could not copy that version' }

  const saved = await run(context, copyId, {
    type: 'SaveXpVersion',
    actorId: context.user.id,
    bytes: source.bytes,
    files: source.files,
    cover: coverFor(source.manifest, project.coverPath ?? undefined),
  })
  if (!saved.ok) return saved

  return { ok: true, copyId }
}

export type RemixResult = { ok: true; xpId: string } | { ok: false; error: string }

/**
 * Take one of the levels we ship and make it this space's own.
 *
 * ---------------------------------------------------------------------------
 * The feature `copyRoomXp` refused to do quietly
 * ---------------------------------------------------------------------------
 * That action's own note named this and declined it: *"a builtin has no project
 * to copy… making one into a project is a real feature — an import — and doing
 * it quietly here would put a second way to create a project behind a button
 * that says copy."* It was right to wait, and this is the feature it was
 * waiting for, with its own name and its own front door.
 *
 * It is **not** `duplicateXp` with a different source. That one guards `edit` on
 * a project and copies a version row; there is no project and no row here. What
 * this is, exactly, is `createXp` with a document already in it - so it asks
 * `createXp`'s two questions (is this space on the tier, may it be written to)
 * and nothing else. A level we ship is readable by everybody, so there is no
 * third question to ask about the source.
 *
 * ---------------------------------------------------------------------------
 * Why a level can be unplayable until somebody does this
 * ---------------------------------------------------------------------------
 * `steal-a-plant` declares `needs: persistence`, `xp_store.xp_id` is a foreign
 * key into `xps_read_model`, and a builtin is a file with a slug rather than a
 * row with an id - so that level was refused at the door on every screen in the
 * app, since it shipped. **This is what fixes it**, and not by adding a store to
 * the file: the copy is a project, a project has a row, and a row is the thing
 * the store has been asking for all along. See `OFFERED_IN_A_ROOM`.
 *
 * ---------------------------------------------------------------------------
 * An empty manifest is the truth rather than a stub
 * ---------------------------------------------------------------------------
 * A manifest lists the blobs a save uploaded. A shipped level has none - its
 * models come out of `public/xp/packs/` by pack id, which is why these
 * documents are a few hundred kilobytes of JSON and not the 40MB projects
 * `duplicateXp`'s note is about. So `{}` and `files: 0` are what actually
 * happened, and `bytes` is the document's own size, which is what the space's
 * quota should be charged for.
 *
 * ---------------------------------------------------------------------------
 * Provenance rides in the document, because it is already there
 * ---------------------------------------------------------------------------
 * The copy keeps the document's own `id` - `steal-a-plant` - which is a field
 * the format has always had and which nothing derives a project from (the
 * studio writes `id: 'draft'` for a new one). So "where did this come from" is
 * answerable by reading the level.
 *
 * What is deliberately *not* written is `copiedFrom`, which holds a project
 * uuid and is read as one, and `template`, which names a starter shape for the
 * editor to generate when nothing has been saved yet - and something has been
 * saved here. Recording a builtin in either would be a field lying about what
 * it means; a remix worth indexing wants a column of its own.
 */
/**
 * Take this space's own copy of any level it may play.
 *
 * Was `remixBuiltinXp` and took a filename, which made "remix" a thing you
 * could only do to the eight levels we ship. That was never the rule it looked
 * like - it was the shape of the argument. A builtin is a file, so copying one
 * needed no permission beyond being able to read it, and the shelf's Remix
 * button was hidden for everything else rather than refused.
 *
 * The reference is the generalisation, because `loadPlayableXp` already answers
 * the question that was being avoided. It resolves a builtin from disk and a
 * project through `loadProject`, which applies the one version rule - this
 * space's own at `current_version`, everybody else's at `published_version`. So
 * a published project can be remixed and an unpublished one cannot, and neither
 * this function nor the button in front of it has to know why.
 *
 * That is deliberately *not* the same permission as `duplicateXp`, which guards
 * on `edit` and is for copying your own work. Remixing somebody else's
 * published level is a thing publishing is *for*; requiring edit would have
 * meant the only way to fork a published level was to be able to change the
 * original.
 */
export async function remixXp(slug: string, reference: string): Promise<RemixResult> {
  const context = await requireTenant(slug)

  if (!canWrite(context)) {
    return { ok: false, error: `${context.tenant.name} cannot be written to right now` }
  }

  const full = await projectsFull(context)
  if (full) return { ok: false, error: full }

  const parsed = parseXpRef(reference)
  if (!parsed) return { ok: false, error: 'That is not a level' }

  /**
   * Through the reference rather than the slug, so the one loader decides.
   *
   * `loadPlayableXp` is what the room and the wizard open a level with, and it
   * parses before answering - so a document that no longer parses is refused
   * here exactly as it is refused there, rather than being copied into
   * somebody's space as a project that will not open. For a project it is also
   * the whole of the authorisation: a draft in another space resolves to
   * nothing, which is the same null as a level that does not exist.
   */
  const document = await loadPlayableXp(context.supabase, context.tenant.id, reference)
  if (!document) return { ok: false, error: 'That is not a level this space can take' }

  /*
    Pay whoever made it, if they asked to be paid.

    Before the copy is made rather than after: a level handed over and a charge
    that did not land is a level somebody got for free out of a network error,
    and it is unrecoverable - there is nothing left to charge them for. Failing
    the other way costs the price of a level, which is in the log with a name on
    it. The same ordering `xp_purchases` keeps for the one-time play price.

    Only a project can be priced. A builtin is one of ours and there is nobody
    to pay, which `remixPriceOf` answers with `null` - so the whole thing is a
    no-op for the case that is by far the most common.
  */
  if (parsed.kind === 'project') {
    const price = await remixPriceOf(context.supabase, parsed.xpId)
    if (price) {
      const paid = await payForRemix(
        context.supabase,
        context.tenant.id,
        context.user.id,
        price,
      )
      if (!paid.ok) return { ok: false, error: paid.error }
    }
  }

  /**
   * A cartridge cannot be remixed, because there is nothing in it to change.
   *
   * A framed document names a game the host runs rather than describing a world
   * - see `packages/xp/src/document/frame.ts`. Its content is a *package*: the
   * rules, the wire protocol and the art are code, and none of it is in the
   * file. So a copy would duplicate a pointer, and the result is a second name
   * for the same game that the editor cannot open and whose new owner cannot
   * change a single thing about.
   *
   * Refused here rather than only in the UI, because this is a server action
   * and the shelf is not the only way to reach it.
   */
  if (document.frame) {
    return {
      ok: false,
      error: `${document.name} is a game rather than a level, so there is nothing to remix - it is played, not edited.`,
    }
  }

  const xpId = randomUUID()
  const created = await run(context, xpId, {
    type: 'CreateXp',
    actorId: context.user.id,
    /*
     * Where it came from, for a project.
     *
     * A builtin has no id to point at - it is a file, and the eight of them are
     * not rows. A project does, and recording it is what makes a fork legible
     * afterwards as a fork rather than as a level somebody happened to write
     * that looks identical. `duplicateXp` sets the same field for the same
     * reason.
     */
    ...(parsed.kind === 'project' ? { copiedFrom: parsed.xpId } : {}),
    /*
     * The level's own name, not "Steal a Plant copy" - and numbered if this
     * space already has one.
     *
     * `nameForCopy` is right for duplicating your own work, where the stutter it
     * prevents is somebody's fourth pass at one thing. A remix is a fork of
     * somebody else's, and the first time this space has had this level at all,
     * so calling it a copy would be describing our filing rather than their
     * game. `nameInSpace` is what keeps the second fork tellable from the first,
     * which matters more here than anywhere else: nobody types a name on this
     * path, so without it two remixes are two rows reading "Steal a Plant".
     */
    name: nameInSpace(document.name, await namesInSpace(context)),
  })
  if (!created.ok) return created

  const body = JSON.stringify(document)

  // The read model row has to exist before a version can reference it, which is
  // why `run` above is not batched with this. Same order as `duplicateXp`.
  const { error } = await context.supabase.from('xp_versions').insert({
    xp_id: xpId,
    version: 1,
    document: document as never,
    manifest: {} as never,
    bytes: Buffer.byteLength(body),
    files: 0,
    created_by: context.user.id,
  })
  if (error) return { ok: false, error: 'Could not put that level in this space' }

  const saved = await run(context, xpId, {
    type: 'SaveXpVersion',
    actorId: context.user.id,
    bytes: Buffer.byteLength(body),
    files: 0,
  })
  if (!saved.ok) return saved

  revalidatePath(`/t/${slug}/browse`)
  return { ok: true, xpId }
}


// ---------------------------------------------------------------------------
// B6: sharing, and moving between spaces
// ---------------------------------------------------------------------------

/**
 * Share it with somebody in this space.
 *
 * Guarded as `share`, which only the owner has. Sharing is the owner's power
 * and not the space's, and the reason is worth keeping in front of whoever
 * changes this: if a space admin could grant access to a project they do not
 * own, they could hand somebody else's work to a third party without asking.
 *
 * The grantee has to already be a member. §7.5 is explicit that an invitation
 * to a project *is* an invitation to the space — a non-member cannot read the
 * stream, so a parallel invite path would be a half-built copy of
 * `tenant_invitations` that still had to end by making them a member.
 */
export async function shareXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const parsed = shareXpSchema.safeParse({
    xpId: formData.get('xpId'),
    account: formData.get('account'),
    right: formData.get('right'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Pick somebody' }
  }

  const guarded = await guard(slug, parsed.data.xpId, 'share')
  if (!guarded.ok) return guarded

  // Checked here rather than in the decider, which cannot see a roster. A grant
  // to somebody outside the space would be a row that grants nothing, because
  // RLS on the stream refuses them anyway - and a permission that silently does
  // nothing is worse than a refusal.
  const members = await listMembers(guarded.context.supabase, guarded.context.tenant.id)
  if (!members.some((member) => member.userId === parsed.data.account)) {
    return { ok: false, error: 'That person is not in this space yet. Invite them first.' }
  }

  const result = await run(guarded.context, parsed.data.xpId, {
    type: 'ShareXp',
    actorId: guarded.context.user.id,
    account: parsed.data.account,
    right: parsed.data.right,
  })
  if (result.ok) revalidatePath(`/t/${slug}/browse/${parsed.data.xpId}`)
  return result
}

export async function unshareXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const xpId = String(formData.get('xpId') ?? '')
  const account = String(formData.get('account') ?? '')

  const guarded = await guard(slug, xpId, 'share')
  if (!guarded.ok) return guarded

  const result = await run(guarded.context, xpId, {
    type: 'UnshareXp',
    actorId: guarded.context.user.id,
    account,
  })
  if (result.ok) revalidatePath(`/t/${slug}/browse/${xpId}`)
  return result
}

/** What everybody in the space may do, over and above their own grants. */
export async function setXpAccess(slug: string, formData: FormData): Promise<XpActionResult> {
  const parsed = setXpAccessSchema.safeParse({
    xpId: formData.get('xpId'),
    spacePolicy: formData.get('spacePolicy'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Pick an access level' }
  }

  const guarded = await guard(slug, parsed.data.xpId, 'own')
  if (!guarded.ok) return guarded

  const result = await run(guarded.context, parsed.data.xpId, {
    type: 'SetXpAccess',
    actorId: guarded.context.user.id,
    spacePolicy: parsed.data.spacePolicy,
  })
  if (result.ok) revalidatePath(`/t/${slug}/browse/${parsed.data.xpId}`)
  return result
}

/**
 * Hand it over for good.
 *
 * The one action that ends the caller's own rights, so it is deliberately not
 * reversible from here: after this, only the new owner can transfer it back.
 * That is the correct shape - an owner who could take a project back after
 * giving it away would make "yours" mean nothing - and it is why the panel asks
 * for confirmation rather than being a dropdown that applies on change.
 */
export async function transferXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const xpId = String(formData.get('xpId') ?? '')
  const to = String(formData.get('to') ?? '')

  const guarded = await guard(slug, xpId, 'own')
  if (!guarded.ok) return guarded

  const members = await listMembers(guarded.context.supabase, guarded.context.tenant.id)
  if (!members.some((member) => member.userId === to)) {
    return { ok: false, error: 'You can only hand a project to somebody in this space' }
  }

  const result = await run(guarded.context, xpId, {
    type: 'TransferXp',
    actorId: guarded.context.user.id,
    to,
  })
  if (result.ok) revalidatePath(`/t/${slug}/browse/${xpId}`)
  return result
}

/**
 * Move it to another space you are in.
 *
 * Two spaces have to agree to this and only one person can ask: the project's
 * owner, who must also be a member of the target. That second check is the one
 * worth naming — without it, an owner could push a project into any space whose
 * id they could guess, and the receiving space would find itself billed for
 * bytes it never accepted.
 *
 * The target has to be able to *hold* it too, which is the same `canWrite` and
 * tier pair every other write asks about. Moving a project into a space that
 * cannot open it would be a working move that produced an unusable project.
 */
export async function moveXp(slug: string, formData: FormData): Promise<XpActionResult> {
  const xpId = String(formData.get('xpId') ?? '')
  const toSlug = String(formData.get('toSlug') ?? '')

  const guarded = await guard(slug, xpId, 'own')
  if (!guarded.ok) return guarded

  let target: TenantContext
  try {
    target = await requireTenant(toSlug)
  } catch {
    // `requireTenant` 404s a non-member, which is the right answer and the
    // wrong shape here: this is a form field, and a thrown 404 would replace
    // the page rather than telling somebody they picked the wrong space.
    return { ok: false, error: 'You are not in that space' }
  }

  if (!canWrite(target)) {
    return { ok: false, error: `${target.tenant.name} cannot be written to right now` }
  }

  // The receiving space pays for it. A move is the one door where the project
  // already exists, so counting the *destination* is the whole check - and
  // skipping it would make moving the way to get a fourth project onto a plan
  // that allows three.
  const full = await projectsFull(target)
  if (full) return { ok: false, error: full }

  const moved = await moveProject(
    guarded.context.supabase,
    guarded.project,
    { id: target.tenant.id, slug: target.tenant.slug },
    guarded.context.user.id,
  )
  if (!moved.ok) return moved

  revalidatePath(`/t/${slug}/browse`)
  revalidatePath(`/t/${target.tenant.slug}/browse`)
  redirect(`/t/${target.tenant.slug}/browse/${moved.xpId}`)
}
