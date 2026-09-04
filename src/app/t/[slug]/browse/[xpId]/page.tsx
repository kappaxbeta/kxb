import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CopyPanel,
  HandOverPanel,
  ReleasePanel,
  PricePanel,
  RemovePanel,
  SharePanel,
  SubmitPanel,
} from '@/app/t/[slug]/browse/[xpId]/project-controls'
import { MagazinePanel } from '@/app/t/[slug]/browse/[xpId]/magazine-panel'
import { shelvedProject } from '@/domain/magazine/queries'
import { mayDo } from '@/domain/xps/access'
import { xpsProjection } from '@/domain/xps/projection'
import { runProjection } from '@/es/projection'
import { formatXpRef } from '@/domain/xps/ref'
import { projectCover } from '@/domain/xps/covers'
import { type Finish, isFinish } from '@kxb/xp'
import { CartridgePanel } from '@/app/t/[slug]/browse/[xpId]/cartridge-panel'
import { NEVER_PLAYED, readMyPlayTotals, type PlayTotals } from '@/domain/xps/plays'
import { listGrants, readGrant } from '@/domain/xps/grants'
import { listMembers, listMyTenants } from '@/domain/tenants/queries'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import {
  findXpProject,
  listReleases,
  readXpVersion,
  storeOverview,
} from '@/domain/xps/queries'
import { requireFeature, requireTenant } from '@/lib/tenant'
import { browseDict, type BrowseDict } from '@/app/i18n/browse'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; xpId: string }>
}): Promise<Metadata> {
  const { slug, xpId } = await params
  const context = await requireTenant(slug)
  const project = await findXpProject(context.supabase, xpId)
  // A project's own name is never translated; the absence of one is.
  return {
    title: project ? project.name : browseDict(await readLocale()).project.notFound,
  }
}

/**
 * One project, on the workbench.
 *
 * ---------------------------------------------------------------------------
 * What decides what is on this page
 * ---------------------------------------------------------------------------
 * `mayDo` — once, at the top, for each thing that can be done — and every panel
 * below is drawn or not drawn on the answer. That is a courtesy to whoever is
 * reading rather than a boundary: the actions re-check on the server, because a
 * Server Action is a public endpoint and hiding a button hides nothing.
 *
 * The one thing worth noticing is how *few* of the panels are the owner's. A
 * space admin sees the project, its releases and a Remove control, and cannot
 * rename it, submit it or roll it back. That asymmetry is the ownership bargain
 * made visible, and it is the reason a space admin reading this page should
 * come away understanding that the project belongs to somebody.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; xpId: string }>
}) {
  const { slug, xpId } = await params

  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')
  /*
    No tier gate here, unlike the shelf and the create form.

    Those two are places a project is *found* and *made*, and a plan can have
    something to say about both. This is a project that already exists, and
    `mayDo` below is the whole of who may see it - deliberately without a tier
    in it, see `spaceCanHold`. A space that dropped to free holding three
    projects must still be able to open them; docs/product/pricing.md §6 says
    nothing is deleted, and a page that 404s deletes it just as well.
  */

  // Caught up before it is looked up - see the editor page for the 404 this
  // prevents. A no-op when the read model is current.
  await runProjection(context.supabase, xpsProjection, context.tenant.id)

  const project = await findXpProject(context.supabase, xpId)
  // A project in another space is a 404 here rather than a redirect: this route
  // is scoped to a space, and confirming that an id exists elsewhere is a fact
  // worth not confirming.
  if (!project || project.tenantId !== context.tenant.id) notFound()

  const grant = await readGrant(context.supabase, xpId, context.user.id)
  const viewer = { accountId: context.user.id, space: context, grant, operator: false }

  if (!mayDo(project, 'read', viewer).allowed) notFound()

  const owns = mayDo(project, 'own', viewer).allowed
  const canEdit = mayDo(project, 'edit', viewer).allowed
  const canSubmit = mayDo(project, 'submit', viewer).allowed
  const canRemove = mayDo(project, 'remove', viewer).allowed
  const canExport = mayDo(project, 'export', viewer).allowed

  const [releases, current, shelvedAs, grants, members, myTenants] = await Promise.all([
    listReleases(context.supabase, xpId),
    project.currentVersion > 0
      ? readXpVersion(context.supabase, xpId, project.currentVersion)
      : Promise.resolve(null),
    // By project rather than by reference - see `shelvedProject`. Asked for
    // everybody who can read the page, because taking one in is a member's to
    // do and not an owner's.
    shelvedProject(context.supabase, context.tenant.id, xpId),
    // Only the owner ever sees these two, so they are only fetched for them —
    // a member picker is two queries and a page that loads them for everybody
    // pays for a panel most readers will never be shown.
    owns ? listGrants(context.supabase, xpId) : Promise.resolve([]),
    owns ? listMembers(context.supabase, context.tenant.id) : Promise.resolve([]),
    owns ? listMyTenants(context.supabase, context.user.id) : Promise.resolve([]),
  ])

  /**
   * What players have stored here — sizes and keys, never contents.
   *
   * docs/xp/state.md §7.5 Reading A. Fetched only for an owner because the
   * function refuses everybody else anyway (`tenant_role in ('owner','admin')`),
   * so asking as a member is a round trip whose answer is always empty.
   *
   * The whole space in one call and filtered here rather than a per-project
   * query, because it is one small grouped read either way and the same call
   * is what a space-wide screen will want when there is one.
   */
  const stored = owns
    ? (await storeOverview(context.supabase, context.tenant.id)).filter(
        (line) => line.xpId === xpId,
      )
    : []

  /**
   * How much it was played, as a number and never as the people.
   *
   * Asked for everybody who can see this page rather than for the owner only,
   * unlike the store overview above: that one is what players have *stored*,
   * which is theirs, and this is what happened to the world, which is the
   * space's. `xp_play_totals_mine` enforces both readings on its own, so this
   * is a call rather than a branch.
   */
  const played = (await readMyPlayTotals(context.supabase, [xpId])).get(xpId) ?? NEVER_PLAYED

  const grantNames = await readUsernames(
    context.supabase,
    grants.map((grant) => grant.accountId),
  )

  // Everybody except the owner, who already has it and cannot be granted to.
  const shareable = members
    .filter((member) => member.userId !== project.ownerId)
    .map((member) => ({ userId: member.userId, username: member.username }))

  // Somewhere else of theirs to move it to. This space is excluded because
  // moving a project to where it already is has no meaning.
  const elsewhere = myTenants
    .filter((tenant) => tenant.id !== context.tenant.id && !tenant.archived)
    .map((tenant) => ({ slug: tenant.slug, name: tenant.name }))

  const locale = await readLocale()
  const t = browseDict(locale).project

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <p className="text-sm">
        <Link href={`/t/${slug}/browse`} className="text-ink-muted transition hover:text-ink">
          {t.back}
        </Link>
      </p>

      <header className="mt-5">
        <h1 className="font-pixel text-2xl uppercase leading-tight">{project.name}</h1>
        {project.blurb && (
          <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            {project.blurb}
          </p>
        )}
      </header>

      {/*
        The two numbers, side by side and explained.

        "v6, v4 live" is the state machine's main rule in one line: the draft
        moves and the store does not. Printing them without the explanation
        would make somebody think their save failed.
      */}
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        <Fact
          label={t.savedLabel}
          value={project.currentVersion === 0 ? '—' : `v${project.currentVersion}`}
          note={project.currentVersion === 0 ? t.neverSavedNote : t.editingNote}
        />
        <Fact
          label={t.liveLabel}
          value={project.publishedVersion === null ? '—' : `v${project.publishedVersion}`}
          note={
            project.publishedVersion === null
              ? t.notPublished
              : project.publishedVersion === project.currentVersion
                ? t.upToDate
                : t.storeServes
          }
        />
        <Fact
          label={t.filesLabel}
          value={current ? String(current.files) : '—'}
          note={t.inFolder}
        />
        <Fact
          label={t.sizeLabel}
          value={describeSize(project.bytes)}
          note={t.countsAgainst}
        />
        {/*
          Beside the versions and the size rather than in a panel of its own,
          because it is the same kind of fact: something true about the project
          that standing in it cannot tell you. docs/xp/creator.md §18.1 — the
          number is the signal, and it needs no fund behind it to be worth
          showing.
        */}
        <Fact
          label={t.playedLabel}
          value={played.plays === 0 ? '—' : played.plays.toLocaleString(locale)}
          note={describePlayed(played, t)}
        />
      </dl>

      {canEdit && (
        <section className="mt-8 rounded-xl border border-line bg-surface/40 px-5 py-4">
          <h2 className="text-sm font-medium">{t.editing}</h2>
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            {project.currentVersion === 0
              ? t.neverSaved
              : fill(t.opensOn, { v: project.currentVersion })}{' '}
            {t.oneAtATime}
          </p>
          <Link
            href={`/t/${slug}/studio/xp/${xpId}`}
            className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:opacity-90"
          >
            {t.openEditor}
          </Link>
          <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            {t.playNote}
          </p>
        </section>
      )}

      {/*
        The cartridge, on the page of the thing it is a cartridge of.

        Above the magazine panel, because the order is the question somebody is
        answering: what this looks like, then whether to put it on the shelf.

        `isFinish` rather than a cast - the document is a JSON column, so what
        comes back is whatever was stored rather than whatever the type says.
        A level saved by an older editor, or edited by hand, can have anything
        here, and anything unrecognised is "it never said", which draws as
        plastic. See `readFinish`, which makes the same call at the parser.
      */}
      <Panel title={t.cartridge}>
        <CartridgePanel
          xpId={xpId}
          name={project.name}
          cover={projectCover(xpId, project.coverPath)}
          finish={
            current !== null && isFinish((current.document as { finish?: unknown }).finish)
              ? (current.document as { finish: Finish }).finish
              : null
          }
          editHref={canEdit ? `/t/${slug}/studio/xp/${xpId}` : null}
          note={t.cartridgeNote}
          changeIt={t.changeTheFinish}
        />
      </Panel>

      {/*
        The shelf, on the page of the thing being shelved.

        Not behind `canEdit`, unlike the panel above it: putting something on
        the space's shelf is a member's to do - the same rule `takeInXp` states
        and the same one that keeps a shelf everybody plays from from being a
        shelf only an owner may fill.
      */}
      <Panel title={t.magazine}>
        <MagazinePanel
          slug={slug}
          reference={
            /*
              What this space would play, which for its own project is whatever
              it has saved. `versionFor` is the authority on that rule and this
              is the one place a surface spells the same thing - zero is the
              absence of a version rather than a version, so a project nobody
              has saved has no reference at all.
            */
            project.currentVersion > 0
              ? formatXpRef({ kind: 'project', xpId, version: project.currentVersion })
              : null
          }
          shelvedAs={shelvedAs}
        />
      </Panel>

      {owns && stored.length > 0 && (
        <Panel title={t.saved}>
          {/*
            The rule this panel is built around, said out loud rather than left
            to be inferred from an empty column: §3.4 gives an XP's owner the
            game and not the people playing it. Sizes and dates for everybody's
            progress, field names only where the space can already read them.
          */}
          <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            {t.savedNote}
          </p>
          <dl className="mt-4 space-y-3">
            {stored.map((line) => (
              <div key={line.scope}>
                <dt className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">
                  {t.scopes[line.scope]}
                </dt>
                <dd className="mt-1 text-sm tabular-nums">
                  {line.rows === 1 ? t.oneSave : fill(t.manySaves, { n: line.rows })} ·{' '}
                  {describeSize(line.bytes)} · {t.lastWritten}{' '}
                  {new Date(line.lastWrite).toLocaleDateString(locale)}
                  {line.keys && line.keys.length > 0 && (
                    <span className="text-ink-muted"> · {line.keys.join(', ')}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}

      {canSubmit && project.state !== 'published' && (
        <Panel title={t.review}>
          {/*
            `economy` decides whether the fee is drawn, not whether the button
            works. A price shown in a space that charges nothing would be a
            threat the product does not carry out.
          */}
          <SubmitPanel
            slug={slug}
            xpId={xpId}
            submitted={project.state === 'submitted'}
            economy={context.features.economy}
          />
        </Panel>
      )}

      {releases.length > 0 && (
        <Panel title={t.releases}>
          {owns ? (
            <ReleasePanel
              slug={slug}
              xpId={xpId}
              releases={releases}
              live={project.publishedVersion}
            />
          ) : (
            // Read-only for everybody who is not the owner. Which versions
            // shipped is useful context for a collaborator; deciding which one
            // the world sees is not theirs.
            <ul className="space-y-1 text-sm text-ink-muted tabular-nums">
              {releases.map((release) => (
                <li key={release.version}>
                  v{release.version}
                  {release.version === project.publishedVersion && ' — live'}
                  {release.withdrawnAt && ' — was taken down'}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {owns && (
        <Panel title={t.whoElse}>
          <SharePanel
            slug={slug}
            xpId={xpId}
            policy={project.spacePolicy}
            grants={grants.map((grant) => ({
              ...grant,
              name: displayNameFrom(grantNames, grant.accountId),
            }))}
            members={shareable}
          />
        </Panel>
      )}

      {/*
        What it costs somebody else, under who can see it.

        That order is the reading order: sharing decides *whether* anybody else
        can get at this, and a price only means anything once they can. An owner
        who has kept a level private and priced it has done something with no
        effect, and putting the price second is the cheapest way to say so.
      */}
      {owns && (
        <Panel title="Prices">
          <PricePanel
            slug={slug}
            xpId={xpId}
            once={project.priceOnce}
            remix={project.priceRemix}
          />
        </Panel>
      )}

      {owns && (shareable.length > 0 || elsewhere.length > 0) && (
        <Panel title={t.handOver}>
          <HandOverPanel
            slug={slug}
            xpId={xpId}
            members={shareable}
            spaces={elsewhere}
          />
        </Panel>
      )}

      {canEdit && project.currentVersion > 0 && (
        <Panel title={t.copy}>
          <CopyPanel slug={slug} xpId={xpId} />
        </Panel>
      )}

      {canExport && project.currentVersion > 0 && (
        <Panel title={t.export}>
          <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            {t.exportNote}
          </p>
          {/*
            A plain link rather than a form. The response is a file, and a
            server action cannot hand one back — it would have to return a URL
            for the browser to follow, which is this link with a step in front
            of it.
          */}
          <a
            href={`/api/xp/${xpId}/export`}
            className="mt-3 inline-block rounded-full border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-ink"
          >
            {t.download}
          </a>
        </Panel>
      )}

      {canRemove && (
        <Panel title={t.remove} tone="danger">
          <RemovePanel slug={slug} xpId={xpId} owned={owns} />
        </Panel>
      )}
    </main>
  )
}

function Panel({
  title,
  tone = 'normal',
  children,
}: {
  title: string
  tone?: 'normal' | 'danger'
  children: React.ReactNode
}) {
  return (
    <section
      className={`mt-8 rounded-xl border px-5 py-4 ${
        // A hairline in the danger hue, not a coloured slab. DESIGN.md's status
        // colours are lifted, not replaced, and a destructive panel that shouts
        // is one people stop reading.
        tone === 'danger' ? 'border-danger/40 bg-danger/5' : 'border-line bg-surface/40'
      }`}
    >
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * The note under the count, which carries the rule rather than the arithmetic.
 *
 * `never played` where there is nothing, because on a page about your own work
 * `0` and *nobody has been in here yet* are not the same sentence. Where there
 * is something, it says **sessions** — one person playing twice is two — so
 * nobody reads the figure as an audience.
 */
function describePlayed(played: PlayTotals, t: BrowseDict['project']): string {
  if (played.plays === 0) return t.neverPlayed
  if (played.seconds < 3600) return played.plays === 1 ? t.sessionOne : t.sessionMany
  return fill(t.sessionHours, { n: Math.round(played.seconds / 360) / 10 })
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-lg tabular-nums">{value}</dd>
      <dd className="mt-0.5 text-xs leading-snug text-ink-muted">{note}</dd>
    </div>
  )
}

/** Said as what the scope *is*, because "player" and "shared" are ours. */
function describeSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}
