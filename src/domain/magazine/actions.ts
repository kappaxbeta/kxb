'use server'

import { revalidatePath } from 'next/cache'
import { magazineDecider } from '@/domain/magazine/aggregate'
import { takeInSchema, xpRefSchema } from '@/domain/magazine/commands'
import { magazineStreamId } from '@/domain/magazine/events'
import { magazineProjection } from '@/domain/magazine/projection'
import { readShelf, resolveForMagazine } from '@/domain/magazine/shelf'
import { parseXpRef } from '@/domain/xps/ref'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { requireTenant, writeBlockedReason, xpOpen } from '@/lib/tenant'

/**
 * Putting an XP on the space's shelf, and taking it off again.
 *
 * ---------------------------------------------------------------------------
 * No cap check, and that is not an omission
 * ---------------------------------------------------------------------------
 * The magazine is the one limit in `TierLimits` that is unlimited on every tier
 * including free, and the one with no flag behind it - see `LIMIT_FLAGS`. There
 * is no number for an operator to raise, so there is nothing here to enforce.
 *
 * That is deliberate rather than unfinished: it is what makes the other caps
 * defensible. A shelved XP costs storage; a loaded one costs frames and a
 * Realtime topic; an editable one costs edit surface. Three real costs, priced
 * apart, and the cheapest of them free. `docs/product/pricing.md` §3.
 */

export type MagazineResult = { ok: true } | { ok: false; error: string }

function toResult(error: unknown): MagazineResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'The magazine changed elsewhere. Try again.' }
  }
  throw error
}

/**
 * Guests may read the shelf and may not change it.
 *
 * `writeBlockedReason` without `guestsAllowed`, which is the default and is the
 * right one here. A guest is somebody on a link, and what they can do is look
 * around and join a match; deciding what this space collects is the space's own
 * business. Note this is *not* an admin-only action - any member may add to it,
 * because a shelf everybody plays from and only an owner may fill is a shelf
 * that stays empty.
 */
export async function takeInXp(slug: string, xpRef: string): Promise<MagazineResult> {
  const reference = xpRefSchema.safeParse(xpRef)
  if (!reference.success) {
    return { ok: false, error: reference.error.issues[0]?.message ?? 'That is not an XP' }
  }

  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  if (!xpOpen(context)) {
    return { ok: false, error: 'XP is not switched on for this space' }
  }

  /**
   * Resolved, rather than taken from the caller.
   *
   * The header above says `xpRef` is "validated as a shape here and resolved as
   * a *thing* in the action", and this is that half - it was written before
   * there was a surface to call it from. `pinXp` makes the same call for the
   * same two reasons, and both matter more here because a magazine row is
   * *shared*: everybody in the space reads this list.
   *
   * The reference has to be one this space may actually play, or a member could
   * shelve a private draft belonging to another space - a row nobody here can
   * open, naming something they were never shown. And the name has to be the
   * level's own, or the same member could put any 120 characters they liked on
   * a shelf everybody sees, under a name the log would then keep forever.
   *
   * `resolveForMagazine` rather than the picker's own list, and see its header
   * for why: the picker's cap is a reading aid, and using it here would refuse
   * a space its own twenty-fifth project from that project's own page.
   */
  const chosen = await resolveForMagazine(supabase, tenant.id, reference.data)
  if (!chosen) return { ok: false, error: 'That is not an XP this space can take in' }

  const parsed = takeInSchema.safeParse({ xpRef: chosen.ref, name: chosen.name })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That is not an XP' }
  }

  try {
    await executeCommand({
      supabase,
      decider: magazineDecider,
      tenantId: tenant.id,
      streamId: magazineStreamId(tenant.id),
      command: { type: 'TakeInXp', xpRef: parsed.data.xpRef, name: parsed.data.name },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, magazineProjection, tenant.id)
  revalidatePath(`/t/${slug}/browse`)
  return { ok: true }
}

/**
 * Swap a shelf entry for the newest version of the same level.
 *
 * The caller names what it was looking at and nothing else. Which version is
 * "newest" is resolved here through `resolveForMagazine`, exactly as taking one
 * in resolves the reference it is given - a client that could name the
 * destination could shelve any version it liked, including one this space was
 * never shown, which is the same hole and gets the same answer.
 *
 * Not restricted to whoever took it in. The shelf belongs to the space, so any
 * member may keep it current for the same reason any member may fill it - a
 * shelf only its filler may update is a shelf that goes stale the day they stop
 * reading it.
 */
export async function restockXp(slug: string, shelvedAs: string): Promise<MagazineResult> {
  const parsed = xpRefSchema.safeParse(shelvedAs)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That is not an XP' }
  }

  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  if (!xpOpen(context)) {
    return { ok: false, error: 'XP is not switched on for this space' }
  }

  const here = parseXpRef(parsed.data)
  if (!here || here.kind !== 'project') {
    // A builtin is the file we ship. There is no newer one to move to, and a
    // caller asking is a caller that got the row wrong.
    return { ok: false, error: 'That has no versions to update' }
  }

  /*
   * The newest this space may play, found the same way the shelf finds it.
   *
   * `readShelf` rather than a fresh version lookup, because the rule for which
   * version a space may play - its own at `current_version`, everybody else's
   * at `published_version` - lives in `listPlayableXps` and must not be
   * restated here. A second opinion about that is how a draft reaches somebody
   * who should not see it.
   */
  const shelf = await readShelf(supabase, tenant.id, true)
  const row = shelf.inMagazine.find((entry) => entry.shelvedAs === parsed.data)

  if (!row) return { ok: false, error: 'That is not in this magazine' }
  if (!row.update) return { ok: false, error: 'That is already the newest version' }

  try {
    await executeCommand({
      supabase,
      decider: magazineDecider,
      tenantId: tenant.id,
      streamId: magazineStreamId(tenant.id),
      command: { type: 'RestockXp', from: parsed.data, to: row.ref, name: row.name },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, magazineProjection, tenant.id)
  revalidatePath(`/t/${slug}/browse`)
  return { ok: true }
}

export async function putBackXp(slug: string, xpRef: string): Promise<MagazineResult> {
  const parsed = xpRefSchema.safeParse(xpRef)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That is not an XP' }
  }

  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  try {
    await executeCommand({
      supabase,
      decider: magazineDecider,
      tenantId: tenant.id,
      streamId: magazineStreamId(tenant.id),
      command: { type: 'PutBackXp', xpRef: parsed.data },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, magazineProjection, tenant.id)
  revalidatePath(`/t/${slug}/browse`)
  return { ok: true }
}

/**
 * Follow new versions without asking, or stop.
 *
 * Any member, like everything else about the shelf. The shelf belongs to the
 * space, and a setting only an owner may change is a setting that stays wrong
 * in every space whose owner has stopped reading.
 */
export async function setShelfFollow(slug: string, on: boolean): Promise<MagazineResult> {
  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  try {
    await executeCommand({
      supabase,
      decider: magazineDecider,
      tenantId: tenant.id,
      streamId: magazineStreamId(tenant.id),
      command: { type: 'SetShelfFollow', on },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, magazineProjection, tenant.id)
  revalidatePath(`/t/${slug}/browse`)
  return { ok: true }
}

/**
 * Bring every stale entry up to date, if this shelf follows.
 *
 * Called from the shelf when it is opened, rather than run during the read that
 * draws it. A read that wrote would fire for every visitor - including a guest,
 * who may not write at all - and fill the log with restocks nobody performed.
 * This is a write that a member's own visit asks for, which is a different
 * thing, and it no-ops for everybody the write block already refuses.
 *
 * Refuses to do anything at all when `follow` is off, so the client cannot use
 * it as an "update everything" button the space never agreed to. The manual
 * path is `restockXp`, one level at a time, which is what a shelf that does not
 * follow is supposed to make you do.
 */
export async function catchUpShelf(slug: string): Promise<MagazineResult> {
  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context
  if (!xpOpen(context)) return { ok: true }

  const shelf = await readShelf(supabase, tenant.id, true)
  if (!shelf.follow) return { ok: true }

  const stale = shelf.inMagazine.filter((row) => row.update && row.shelvedAs)
  if (stale.length === 0) return { ok: true }

  /*
   * One command per entry, in sequence.
   *
   * Sequential because they all write to the one magazine stream, and
   * `executeCommand` appends at an expected version - firing six at once would
   * have five of them lose the race and come back as concurrency errors. Six
   * round trips on the rare visit where six levels moved is the cheaper half of
   * that trade.
   */
  for (const row of stale) {
    try {
      await executeCommand({
        supabase,
        decider: magazineDecider,
        tenantId: tenant.id,
        streamId: magazineStreamId(tenant.id),
        command: { type: 'RestockXp', from: row.shelvedAs!, to: row.ref, name: row.name },
        metadata: { actorId: user.id },
      })
    } catch (error) {
      /*
       * One failure does not abandon the rest.
       *
       * The likely cause is somebody else catching up the same shelf a moment
       * earlier, which makes this entry's restock a no-op the decider has
       * already refused - and the other five are still behind.
       */
      const result = toResult(error)
      if (!result.ok && stale.indexOf(row) === stale.length - 1) return result
    }
  }

  await runProjection(supabase, magazineProjection, tenant.id)
  revalidatePath(`/t/${slug}/browse`)
  return { ok: true }
}
