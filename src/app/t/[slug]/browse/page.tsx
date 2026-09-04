import type { Metadata } from 'next'
import Link from 'next/link'
import { BrowseTabs } from '@/app/t/[slug]/browse/browse-tabs'
import { MagazineSection } from '@/app/t/[slug]/browse/magazine-section'
import { ShelfFollow } from '@/app/t/[slug]/browse/shelf-follow'
import { ProjectShelf, type ProjectCartridge } from '@/app/t/[slug]/browse/project-shelf'
import { cartridgeOf } from '@/app/t/[slug]/browse/project-cartridge'
import { ClipsPanel } from '@/app/t/[slug]/thingiverse/clips-panel'
import { EmoteTreeEditor } from '@/app/t/[slug]/thingiverse/emote-tree-editor'
import { DOORS } from '@/app/t/[slug]/thingiverse/doors'
import { Hub } from '@/app/t/[slug]/thingiverse/hub'
import { RehearsalProvider } from '@/app/t/[slug]/thingiverse/rehearsal'
import { SetsPanel } from '@/app/t/[slug]/thingiverse/sets-panel'
import { Shelf } from '@/app/t/[slug]/thingiverse/shelf'
import { Showcase } from '@/app/t/[slug]/thingiverse/showcase'
import { PacksPanel } from '@/app/t/[slug]/thingiverse/workbench'
import { WorldCard } from '@/app/worlds/world-card'
import { readShelf } from '@/domain/magazine/shelf'
import { thingiverseProjection } from '@/domain/thingiverse/projection'
import { readAvatarHere } from '@/domain/profile/avatar-queries'
import { readXpBody } from '@/domain/skins/queries'
import { walk } from '@/domain/thingiverse/emote-tree'
import { MODEL_COUNT } from '@/domain/thingiverse/models'
import { STARTER_SETS } from '@/domain/thingiverse/starters'
import { coinsOf, nextPrice } from '@/domain/bank/next'
import {
  countBlueprints,
  countClips,
  countVehicles,
  listBlueprints,
  listClips,
  readEmoteTree,
} from '@/domain/thingiverse/queries'
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
  requireProjects,
  requireTenant,
  thingiverseOpen,
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
  searchParams,
}: {
  params: Promise<{ slug: string }>
  /**
   * The thingiverse tab's own filter, carried in the URL.
   *
   * Client state everywhere else on this page - see `BrowseTabs` - and a query
   * string here for the one reason that argument allows: 5,770 models cannot be
   * searched in the browser, so the search is a plain `method="get"` form and
   * the answer has to come back from the server. It lands on the first tab,
   * which is the tab that asked, so the round trip returns where it left.
   *
   * `door` is the second, and it is here for the other reason a URL is allowed
   * to carry state: somebody is being *sent* somewhere. The rail links straight
   * at the clips, and without a word for which door to open the link lands on
   * the shelf with the thing it promised one press away. Which door is still
   * client state once the page is up - see `Hub` - this only says where to
   * start.
   */
  searchParams: Promise<{ q?: string; pack?: string; door?: string }>
}) {
  const { slug } = await params
  const { q, pack, door } = await searchParams

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

  /**
   * The thingiverse's own shelf, or null when this space has no thingiverse.
   *
   * `thingiverseOpen`, exactly as the page it came from ran it and as the
   * layout runs it for the rail. It used to be two gates spelled here, the
   * installation flag *and* `xo`; the tier half is gone, and the helper in
   * `lib/tenant.ts` carries why.
   *
   * Null rather than an empty list, so the tab is absent rather than empty. A
   * tab that exists and says nothing is a promise of a feature this space does
   * not have, which is the rule the whole surface is gated on.
   *
   * Its own await rather than a fifth entry in the `Promise.all` above: the
   * projection has to be caught up before the shelf is read, and putting a
   * two-step sequence into a list of independent queries is how one of them
   * quietly starts reading a table the other has not finished writing.
   */
  const things =
    thingiverseOpen(context)
      ? await (async () => {
          await runProjection(supabase, thingiverseProjection, tenant.id)

          /**
           * The shelf, the clips and the body, together.
           *
           * The projection first and on its own - see above - then four
           * independent reads at once. The body is two of them because an
           * account has two and keeps both: the animal, which every space draws
           * by default, and the XP skin, which one draws only when asked. See
           * `readXpBody` and the note there about why conflating the two put a
           * Knight in the lounge.
           */
          const [shelf, clips, menu, avatar, body, drawn, kept, driven] = await Promise.all([
            listBlueprints(supabase, tenant.id, user.id),
            listClips(supabase, tenant.id, user.id),
            readEmoteTree(supabase, tenant.id),
            readAvatarHere(supabase, user.id, tenant.id),
            readXpBody(supabase, user.id),
            /*
              The *space's* counts, which are not `shelf.length` and `clips.length`.
              Those two are filtered to what this person may see - public, plus
              their own - and a quota is about what the space holds. Somebody
              whose colleague keeps ten private blueprints would otherwise be
              told there is room for ten more than there is, and find out by
              being charged.
            */
            countBlueprints(supabase, tenant.id),
            countClips(supabase, tenant.id),
            countVehicles(supabase, tenant.id),
          ])

          // What one more of each costs, from the same helper the two create
          // actions charge from - so the button and the purse cannot disagree.
          const prices = {
            // `drawn` counts every row, vehicles included, because that is
            // what the platform ceiling wants. The plan wants them apart -
            // see `priceLine`, which does the same subtraction on the way in.
            blueprint: coinsOf(
              await nextPrice(
                supabase,
                tenant.id,
                tenant.tier,
                'blueprints',
                Math.max(0, drawn - driven),
              ),
            ),
            vehicle: coinsOf(
              await nextPrice(supabase, tenant.id, tenant.tier, 'vehicles', driven),
            ),
            clip: coinsOf(await nextPrice(supabase, tenant.id, tenant.tier, 'clips', kept)),
          }

          return { shelf, clips, menu, avatar, body, prices }
        })()
      : null

  const locale = await readLocale()
  const t = browseDict(locale)
  const needWords = xpDict(locale).needs
  const worldWords = workspaceDict(locale).worlds
  const thingWords = workspaceDict(locale).thingiverse

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
          /*
            The thingiverse, first.

            First because `BrowseTabs` opens on `tabs[0]` and this is the tab
            somebody arriving is most often after: the magazine and the store are
            catalogues you visit, and this is a workbench you *use*. It also had
            a row of its own in the navigation, which is what it replaces - a
            surface with one shelf on it did not earn a permanent line beside
            Dashboard and Battle, and it belongs in here with the other two
            answers to "what is this space made of".

            Spread rather than a `show` flag, because `BrowseTabs` takes a list
            and a hole in it would be a tab that renders as nothing. See
            `things`, which is null when this space has no thingiverse.
          */
          ...(things
            ? [
                {
                  id: 'thingiverse',
                  label: thingWords.heading,
                  count: things.shelf.length,
                  panel: (
                    /*
                      Around the pair, so a clip can reach the body.

                      The mirror and the clips list are on two sides of a server
                      boundary - the panels below are server components this page
                      renders and hands to the hub - so there is no client
                      component holding both that could pass a prop between them.
                      One provider with a `useState` in it is the smallest thing
                      that lets a play button three doors down drive the canvas at
                      the top. It draws nothing, so the section keeps its own
                      spacing. See `RehearsalProvider`.
                    */
                    <RehearsalProvider>
                    <section aria-label={thingWords.heading} className="space-y-6">
                      {/*
                        Who you are, above what you make.

                        Everything behind the three doors is measured against a
                        body - a seat is where one stands, a clip is what one
                        does, a held item hangs off one's hand - so the body is
                        the first thing on the page. See `Showcase`.
                      */}
                      <Showcase
                        slug={slug}
                        avatar={things.avatar}
                        skin={things.body.model}
                        inLounge={things.body.inLounge}
                        hasShop={context.features.skin_shop}
                        t={thingWords.you}
                      />

                      <Hub
                        slug={slug}
                        /*
                          Where to start, when somebody was sent here. Checked
                          against the doors that exist rather than cast: `door`
                          is whatever is in the address bar, and a typo would
                          otherwise open a door with no panel behind it and draw
                          an empty section with a heading of `undefined`.
                        */
                        initial={DOORS.find((one) => one === door)}
                        prices={things.prices}
                        t={thingWords}
                        counts={{
                          blueprints: things.shelf.filter((one) => !one.spec.vehicle).length,
                          sets: STARTER_SETS.length,
                          vehicles: things.shelf.filter((one) => one.spec.vehicle).length,
                          clips: things.clips.length,
                          emotes: walk(things.menu.tree).length,
                          models: MODEL_COUNT,
                        }}
                        /*
                          Rendered here rather than inside the hub, because all
                          three are server components reading this page's data
                          and the hub is only the client that switches between
                          them. Just the open one is mounted; the other two cost
                          their markup in the payload and nothing else.
                        */
                        panels={{
                          /*
                            Without the vehicles, which have a door of their
                            own. One thing behind one door: a kart listed here
                            *and* there would make each door's count disagree
                            with what the other shows, and "where did my car
                            go" has to have one answer.
                          */
                          blueprints: (
                            <Shelf
                              slug={slug}
                              shelf={things.shelf.filter((one) => !one.spec.vehicle)}
                              // The names only; the row's clip pickers need no
                              // samples. See `ClipPick`.
                              clips={things.clips.map((one) => one.name)}
                              t={thingWords}
                              headed={false}
                            />
                          ),
                          sets: <SetsPanel slug={slug} t={thingWords} />,
                          /*
                            The same shelf, filtered the other way. A vehicle
                            *is* a blueprint - one row, one spec, with a
                            `vehicle` block on it - so this is a view of the
                            list rather than a second list, and every control
                            on a row keeps working.
                          */
                          vehicles: (
                            <Shelf
                              slug={slug}
                              shelf={things.shelf.filter((one) => one.spec.vehicle)}
                              clips={things.clips.map((one) => one.name)}
                              t={thingWords}
                              headed={false}
                            />
                          ),
                          clips: (
                            <ClipsPanel
                              slug={slug}
                              clips={things.clips}
                              t={thingWords.clips}
                              labels={thingWords}
                            />
                          ),
                          emotes: (
                            <EmoteTreeEditor
                              slug={slug}
                              tree={things.menu.tree}
                              clips={things.clips}
                              t={thingWords.emotes}
                            />
                          ),
                          models: (
                            <PacksPanel
                              shelf={things.shelf}
                              q={q}
                              pack={pack}
                              t={thingWords}
                              href={`/t/${slug}/browse`}
                            />
                          ),
                        }}
                      />
                    </section>
                    </RehearsalProvider>
                  ),
                },
              ]
            : []),
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
