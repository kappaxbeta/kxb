import type { Metadata } from 'next'
import Link from 'next/link'
import { BrowseTabs } from '@/app/t/[slug]/browse/browse-tabs'
import { MagazineSection } from '@/app/t/[slug]/browse/magazine-section'
import { ShelfFollow } from '@/app/t/[slug]/browse/shelf-follow'
import { ProjectShelf, type ProjectCartridge } from '@/app/t/[slug]/browse/project-shelf'
import { cartridgeOf } from '@/app/t/[slug]/browse/project-cartridge'
import { WorldCard } from '@/app/worlds/world-card'
import { readShelf } from '@/domain/magazine/shelf'
import { listSpaceWorlds } from '@/domain/worlds/queries'
import { xpsProjection } from '@/domain/xps/projection'
import {
  shellsOf,
  listOwnedXps,
  listSpaceXps,
  needsOf,
  type XpProjectRow,
} from '@/domain/xps/queries'
import { runProjection } from '@/es/projection'
import {
  requireFeature,
  requireTenant,
  requireProjects,
  writeBlockedReason,
  xpOpen,
} from '@/lib/tenant'
import { browseDict, type BrowseDict } from '@/app/i18n/browse'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'
import { xpDict } from '@/app/i18n/xp'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: browseDict(await readLocale()).title }
}

export const dynamic = 'force-dynamic'

/**
 * The workbench.
 *
 * ---------------------------------------------------------------------------
 * Not a version of the public store
 * ---------------------------------------------------------------------------
 * `/browse` is a shop window: published work only, read by people with no
 * account, and the one surface that can bring somebody in who has never heard
 * of this. This is the opposite of all three. It is mostly drafts, everybody
 * reading it is already inside, and the useful controls are the ones nobody
 * outside the space may press.
 *
 * That is why they are two pages rather than one that adapts. A single route
 * doing both would be a weak shop window wrapped around a weak workbench, and
 * the compromise would land on the shop window, which is the half that has to
 * persuade a stranger.
 *
 * ---------------------------------------------------------------------------
 * Two lists, because a project has two homes
 * ---------------------------------------------------------------------------
 * A project is owned by an *account* and lives in a *space* - see
 * docs/xp/backend.md §7.0 - so the honest answer to "what are my projects" is
 * two lists and not one. What is in this space includes work owned by people
 * who have left; what you own includes work sitting in spaces you are barely
 * in. Merging them would lose whichever fact the merge chose against.
 *
 * The second list is `§7.6`'s profile list, shown here rather than only on an
 * account page, because this is where somebody is when they wonder where they
 * put something.
 */
export default async function SpaceBrowsePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')
  /**
   * The tier gate is what makes this page a *replacement* for Worlds rather
   * than an addition to it: a space that can hold projects has one place its
   * work lives, and a space that cannot keeps the plain Worlds page. See the
   * sidebar, which routes on the same question.
   *
   * The allowance rather than a rung, which is where that argument ends up.
   * Projects stopped being a half of the product somebody had or did not and
   * became a quantity, and this line was still reading the old ladder - so
   * `free`, which now holds one project, was 404'd out of the page listing the
   * project it is entitled to. `projectsFull` decides how many, at the door
   * where one is made; docs/product/pricing.md §8 puts the wall on "new
   * project" and nowhere else, and a shelf that 404s is a wall in front of
   * something a space already has.
   */
  requireProjects(context)

  const { supabase, tenant, user } = context

  // The shelf is a projection, and a projection can be behind the log - see
  // the editor page for the 404 that taught this. A no-op when current.
  await runProjection(supabase, xpsProjection, tenant.id)

  const [projects, owned, worlds, shelf] = await Promise.all([
    listSpaceXps(supabase, tenant.id),
    listOwnedXps(supabase, user.id),
    listSpaceWorlds(supabase, tenant.id),
    /*
     * What this space took in, and everything it could. Both halves out of one
     * call - see `readShelf`, which is where the two lists are joined so that
     * the two surfaces drawing them cannot disagree about which is which.
     */
    readShelf(supabase, tenant.id, xpOpen(context)),
  ])

  /**
   * What each of these asks of its host, for the line on the card.
   *
   * After the three above rather than beside them, because it takes the
   * projects as input - one query for the whole page, not one per row. A level
   * that asks for nothing has no entry and the card draws nothing, which is
   * most of them (§7.3).
   */
  const [needs, shells] = await Promise.all([
    needsOf(supabase, [...projects, ...owned]),
    // Beside `needsOf` and for the same reason: one query for the whole page
    // rather than one per cartridge. See `shellsOf`.
    shellsOf(supabase, [...projects, ...owned]),
  ])

  // Only the ones that are somewhere else. A project of yours in this space is
  // already above, and printing it twice would make the second list read as a
  // filter of the first rather than as a different question.
  const elsewhere = owned.filter((project) => project.tenantId !== tenant.id)
  const locale = await readLocale()
  const t = browseDict(locale)
  const needWords = xpDict(locale).needs
  const worldWords = workspaceDict(locale).worlds

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <header className="mb-8">
        <h1 className="font-pixel text-2xl uppercase leading-tight">{t.heading}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-ink-muted">{t.body}</p>
      </header>

      {/*
        Three verbs, three tabs.

        The shelf you own, the shelf you could have, and the thing you are
        building. They used to be stacked in that order with the store in the
        middle, which is the longest list of the three - so an empty magazine
        was two lines above eleven rows of catalogue and read as a section that
        did not work. See `BrowseTabs`.
      */}
      <BrowseTabs
        tabs={[
          {
            id: 'magazine',
            label: t.tabs.magazine,
            count: shelf.inMagazine.length,
            panel: (
              <section aria-label={t.tabs.magazine}>
                <p className="mb-4 max-w-[62ch] text-xs text-ink-muted">{t.magazineBody}</p>
                <ShelfFollow
                  slug={slug}
                  following={shelf.follow}
                  stale={shelf.inMagazine.filter((row) => row.update).length}
                />
                <MagazineSection
                  slug={slug}
                  inMagazine={shelf.inMagazine}
                  catalogue={shelf.catalogue}
                  hidden={shelf.hidden}
                  blocked={writeBlockedReason(context)}
                  show="shelf"
                />
              </section>
            ),
          },
          {
            id: 'store',
            label: t.tabs.store,
            count: shelf.catalogue.length,
            panel: (
              <section aria-label={t.tabs.store}>
                <p className="mb-4 max-w-[62ch] text-xs text-ink-muted">{t.storeBody}</p>
                <MagazineSection
                  slug={slug}
                  inMagazine={shelf.inMagazine}
                  catalogue={shelf.catalogue}
                  hidden={shelf.hidden}
                  blocked={writeBlockedReason(context)}
                  show="catalogue"
                />
              </section>
            ),
          },
          {
            id: 'projects',
            label: t.tabs.projects,
            count: projects.length,
            panel: (
              <ProjectsPanel
                slug={slug}
                projects={projects.map((project) =>
                  cartridgeOf(project, hrefFor(slug, project), needs, shells, t, needWords),
                )}
                t={t}
              />
            ),
          },
        ]}
      />

      {elsewhere.length > 0 && (
        <section className="mt-10" aria-labelledby="elsewhere-heading">
          <div className="mb-3 border-t border-line/40 pt-6">
            <h2 id="elsewhere-heading" className="text-base font-medium">
              {t.elsewhere}
            </h2>
            <p className="mt-1 max-w-[62ch] text-xs text-ink-muted">{t.elsewhereBody}</p>
          </div>

          {/* No slug of the other space is resolved here — that would be a
              query per row for a link most people never follow. The project
              page redirects to wherever it actually lives. */}
          <ProjectShelf
            projects={elsewhere.map((project) =>
              cartridgeOf(project, `/browse/xp/${project.id}`, needs, shells, t, needWords),
            )}
            label={t.elsewhere}
            openIt={t.openProject}
            closeLabel={t.closeSheet}
            noPicture={t.noPicture}
          />
        </section>
      )}

      <section className="mt-10" aria-labelledby="worlds-heading">
        <div className="mb-3 border-t border-line/40 pt-6">
          <h2 id="worlds-heading" className="text-base font-medium">
            {t.misc}
          </h2>
          <p className="mt-1 max-w-[62ch] text-xs text-ink-muted">{t.miscBody}</p>
        </div>

        {worlds.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface/40 px-4 py-5 text-sm text-ink-muted">
            {t.nothingBuilt}
            <Link href={`/t/${slug}/builder`} className="text-accent hover:opacity-80">
              {t.openBuilder}
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.slice(0, 6).map((world) => (
              <WorldCard
                key={world.id}
                world={world}
                href={`/t/${slug}/worlds/${world.id}`}
                t={worldWords}
                locale={locale}
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-ink-muted">
          <Link href={`/t/${slug}/worlds`} className="text-accent hover:opacity-80">
            {t.allWorlds}
          </Link>
          {' · '}
          <Link href="/browse" className="hover:text-ink">
            {t.publicStore}
          </Link>
        </p>
      </section>
    </main>
  )
}

/**
 * The projects half, lifted out of the page so the tab list stays readable.
 *
 * Still a server component, though what it renders no longer is: `ProjectShelf`
 * is a canvas and draws in the browser. The heading, the count and the door to
 * a new project stay here, where they cost nothing.
 */
function ProjectsPanel({
  slug,
  projects,
  t,
}: {
  slug: string
  /**
   * Already shaped for the shelf, by `cartridgeOf`.
   *
   * The panel used to take rows and hand each one to a card. It takes finished
   * cartridges now because the mapping needs two maps that belong to the page's
   * own query - and threading those through a component that only counts them
   * and draws a heading is how a prop list becomes a pipe.
   */
  projects: ProjectCartridge[]
  /** Resolved by the page. Both halves of this file are server components. */
  t: BrowseDict
}) {
  return (
    <section aria-labelledby="projects-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="projects-heading" className="sr-only">
          {t.projects}
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-xs text-ink-muted tabular-nums">
              {projects.length === 0
                ? t.noneYet
                : fill(t.countHere, { n: projects.length })}
            </p>
            {/*
              The second project was unreachable. "Start one" lived in the empty
              state, so the door closed behind the first thing anybody built —
              the only way back to /browse/new was to type it. The invitation
              stays where it is when there is nothing here, because a heading
              with a small button beside it is a worse first screen than a
              paragraph explaining what a project is; this is its sibling for
              every screen after that.

              `new-project` is the shimmer and nothing else — the pill is still
              the pill. See globals.css for why a sweep rather than a fill: this
              row already has a heading in it, and the button that makes
              something should be findable without outranking it.
            */}
            {projects.length > 0 && (
              <Link
                href={`/t/${slug}/browse/new`}
                className="new-project rounded-full border border-accent/60 px-3 py-1 text-xs text-accent transition hover:bg-accent/10"
              >
                {t.newProject}
              </Link>
            )}
          </div>
        </div>

        {projects.length === 0 ? (
          <Empty slug={slug} t={t} />
        ) : (
          <ProjectShelf
            projects={projects}
            label={t.projectShelf}
            openIt={t.openProject}
            closeLabel={t.closeSheet}
            noPicture={t.noPicture}
          />
        )}
    </section>
  )
}


/**
 * Where a project opens.
 *
 * Its own function because there will shortly be two answers — the editor for
 * something you may edit, the project page for something you may only look at —
 * and the permission ladder is what decides. Until the tenant editor exists
 * (docs/xp/backend.md B3's other half) there is one answer, and it is better
 * for that to be obviously temporary than to be spread across three call sites.
 */
function hrefFor(slug: string, project: XpProjectRow): string {
  return `/t/${slug}/browse/${project.id}`
}



/**
 * The empty state, which is the design problem rather than the full one.
 *
 * On the day this ships every space has nothing here. A library with nothing in
 * it must read as a workbench nobody has used yet, not as a feature that
 * failed — so it carries the invitation rather than a grid of empty cells.
 */
function Empty({ slug, t }: { slug: string; t: BrowseDict }) {
  return (
    <div className="rounded-xl border border-line bg-surface/40 px-5 py-8">
      <p className="text-sm">{t.emptyTitle}</p>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
        {t.emptyBody}
      </p>
      <p className="mt-4 text-sm">
        <Link href={`/t/${slug}/browse/new`} className="text-accent hover:opacity-80">
          {t.startOne}
        </Link>
      </p>
    </div>
  )
}
