import type { Metadata } from 'next'
import { Clapperboard, Code2, Gamepad2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { listScenes } from '@/domain/scenes/queries'
import type { Locale } from '@/domain/i18n/locale'
import { RecentWork, type RecentItem } from '@/app/t/[slug]/studio/recent-work'
import { TemplatePicker } from '@/app/t/[slug]/studio/template-picker'
import { ProjectShelf } from '@/app/t/[slug]/browse/project-shelf'
import { cartridgeOf } from '@/app/t/[slug]/browse/project-cartridge'
import { mayDo } from '@/domain/xps/access'
import { xpsProjection } from '@/domain/xps/projection'
import { shellsOf, listSpaceXps, needsOf, type XpProjectRow } from '@/domain/xps/queries'
import { runProjection } from '@/es/projection'
import {
  projectsOpen,
  requireFeature,
  requireTenant,
  xpOpen,
  type TenantContext,
} from '@/lib/tenant'
import { browseDict } from '@/app/i18n/browse'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'
import { xpDict } from '@/app/i18n/xp'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).studio.metaStudio }
}

export const dynamic = 'force-dynamic'

/**
 * The three studios, and what this space has made with them.
 *
 * A chooser rather than a redirect to one of them. The three make different
 * things - a still, a video, a banner - and they are not variants of one
 * editor with a mode switch: each has its own document, its own parser and its
 * own address. Landing straight in one of them would make the other two
 * findable only by knowing they exist.
 *
 * The kind is a path segment rather than a query key for exactly that reason.
 * `?v=` said "this is the video studio" *and* carried the whole document, so
 * the one thing you might want to link to - the video studio, empty - was the
 * one thing you could not name.
 */
export default async function SpaceStudioPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug)
  requireFeature(context, 'scenes')

  /**
   * Whether this space has a shelf of games at all.
   *
   * The same question the workbench asks at its door (`requireProjects` on
   * /browse): projects are a quantity, not a rung, so the *allowance* decides
   * whether there is a list - and not `xpOpen`, which is the narrower question
   * of whether the space may *run* one in a match. The two can differ, which
   * is the whole reason there are two helpers.
   */
  const holdsGames = context.features.worlds && projectsOpen(context)

  const [scenes, games] = await Promise.all([
    listScenes(context.supabase, {
      tenantId: context.tenant.id,
      limit: 12,
    }),
    holdsGames
      ? runProjection(context.supabase, xpsProjection, context.tenant.id).then(() =>
          listSpaceXps(context.supabase, context.tenant.id),
        )
      : Promise.resolve([]),
  ])
  const [needs, shells] = await Promise.all([
    needsOf(context.supabase, games),
    // Beside `needsOf` for the reason it gives: one query for the page rather
    // than one per cartridge. See `shellsOf`.
    shellsOf(context.supabase, games),
  ])

  const locale = await readLocale()
  const t = workspaceDict(locale).studio
  const browseWords = browseDict(locale)
  const needWords = xpDict(locale).needs

  /**
   * The two kinds, merged and sorted by when they were last touched.
   *
   * Sorted on the raw timestamp and *then* worded, which is the only order that
   * works: `when` is "3 days ago" by the time the component sees it, and
   * sorting those strings alphabetically puts a week before a day.
   *
   * Every string is finished here rather than in the browser - the version
   * number, the duration, and the relative time in the reader's own language.
   * A date formatted on the client would disagree with the server's first
   * paint, which is a hydration warning bought for nothing.
   *
   * Capped, because this is the *short* answer: the two lists underneath are
   * the long one, and a recents strip as long as the thing it summarises has
   * stopped summarising anything.
   */
  const recent: RecentItem[] = [
    ...games.map((project) => ({
      at: project.updatedAt,
      item: {
        id: project.id,
        kind: 'game' as const,
        name: project.name,
        href: gameHref(slug, project, context),
        detail:
          project.currentVersion === 0
            ? browseWords.neverSaved
            : `v${project.currentVersion}`,
        when: ago(locale, project.updatedAt),
        badge: project.state === 'published' ? browseWords.states.live : null,
      },
    })),
    ...scenes.map((scene) => ({
      at: scene.updatedAt,
      item: {
        id: scene.id,
        kind: 'movie' as const,
        name: scene.name,
        href: `/t/${slug}/studio/video?scene=${scene.id}`,
        detail: `${scene.seconds}s`,
        when: ago(locale, scene.updatedAt),
        badge: scene.visibility === 'public' ? t.sharedChip : null,
      },
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECENT)
    .map((entry) => entry.item)

  /*
    The order is the pitch: the suite first (video, and the still that used
    to be its own card - the route at studio/image stays, the door went),
    then the two creators, then the banner last. The picture door was folded
    into the suite because a still is one frame of what it already does, and
    four cards where one is a subset of another read as a quiz.
  */
  const doors = [
    { href: `/t/${slug}/studio/video`, ...t.doors.video, icon: Clapperboard },
    /**
     * The fourth door, and the reason it is a door rather than a section.
     *
     * docs/xp/backlog.md §1b: video, picture and banner each have their own
     * document, parser and address, and a game is a fourth of exactly that
     * shape - so it belongs *beside* them rather than inside one. This is the
     * screen somebody is on when they want to make something, and until now it
     * chose between three things that are all scenes; making a game meant
     * knowing that `/browse` existed.
     *
     * It leads to the list that already exists rather than to a second one.
     * That page is the workbench - this space's projects, the ones you own
     * elsewhere, and the button that starts a new one - and building a
     * shorter version of it here is how two lists come to disagree.
     *
     * Absent rather than locked when the space cannot use it: `xpOpen` is the
     * operator's flag and the plan together, and a card offering an upgrade
     * belongs where somebody went looking for the thing, which is the battle
     * wizard. A chooser is the wrong place to be sold to.
     */
    ...(xpOpen(context)
      ? [
          { href: `/t/${slug}/browse`, ...t.doors.game, icon: Gamepad2 },
          /*
            Straight to a new sketch rather than to the workbench: the door
            says "p5.js", and the person who pressed it has already answered
            the one question the form's engine pills ask.
          */
          { href: `/t/${slug}/browse/new?engine=p5`, ...t.doors.sketch, icon: Code2 },
        ]
      : []),
    { href: `/t/${slug}/studio/hero`, ...t.doors.banner, icon: Sparkles },
  ]

  return (
    <div className="mt-6 space-y-8">
      <header>
        <h1 className="text-lg font-medium">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.body}</p>
      </header>

      {/*
        Two across on a phone and the full row on a laptop, so a fourth door
        does not squeeze the three that were here into a strip.

        Each door wears its own icon twice: once at plate size, where it is a
        label, and once blown up into the top-right corner at a tenth of the
        ink, where it is the card's face. The big one is what tells the four
        apart at a glance - they cannot differ by colour, because fuchsia is
        this app's word for "you can press this" and four hues would spend that
        on decoration. `.studio-door` in globals.css carries the rest.
      */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {doors.map((door) => (
          <li key={door.href}>
            <Link href={door.href} className="studio-door">
              {/*
                Thin-stroked, because a 2px lucide stroke at 7.5rem reads as a
                fat cartoon outline; at 1 it reads as a drawing of the icon,
                which is what a watermark should be.
              */}
              <door.icon className="studio-door-ghost" strokeWidth={1} aria-hidden />
              <span className="studio-door-plate">
                <door.icon className="size-5" aria-hidden />
              </span>
              <span className="studio-door-title">{door.title}</span>
              <span className="studio-door-blurb">{door.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/*
        The examples, one line instead of ten rows.

        They were permanently open directly under the doors - the right amount
        of room for the hardest problem the studio has, an empty one, and far
        too much for everybody after their first afternoon. See
        `TemplatePicker` for what they gave up and what they kept.
      */}
      <TemplatePicker slug={slug} t={t} />

      {/*
        What this space was last making, both kinds in one order.

        Above the two lists rather than instead of them: those are for
        browsing, and this is the short answer to "where was I" - which is the
        question somebody opening the studio usually has. See `RecentWork`.
      */}
      <RecentWork items={recent} t={t} />

      {/*
        The games, here as well as on the workbench.

        The door above says the list lives on /browse and gives a good reason
        for not copying it - two lists come to disagree. This is not a second
        list: it is the same query and the same card the workbench draws, so
        the two cannot say different things about a project. What it changes is
        the *distance*: the studio is the page somebody is on when they want to
        keep making the thing they made yesterday, and a game of theirs was two
        navigations away through a page that is mostly other people's work.

        Each row opens straight in the editor when this person may edit it, and
        on the project page otherwise - the same ladder `/browse/[xpId]` climbs
        before it offers its Edit button, asked once here for the whole list.
      */}
      {holdsGames && (
        <section className="space-y-3" aria-labelledby="studio-games">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2
              id="studio-games"
              className="font-mono text-xs tracking-[0.2em] text-ink-muted uppercase"
            >
              {t.games}
            </h2>
            <div className="flex items-baseline gap-3 text-xs">
              <span className="text-ink-muted tabular-nums">
                {games.length === 0 ? t.noGames : fill(t.gamesCount, { n: games.length })}
              </span>
              <Link
                href={`/t/${slug}/browse/new`}
                className="new-project rounded-full border border-accent/60 px-3 py-1 text-accent transition hover:bg-accent/10"
              >
                {t.newGame}
              </Link>
            </div>
          </div>

          {games.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line/60 p-6 text-sm text-ink-muted">
              {t.gamesEmpty}
            </p>
          ) : (
            /*
              The same shelf the workbench draws, from the same mapper.

              Which is the point rather than a saving: the studio's own comment
              above explains that this list is /browse's query so the two cannot
              disagree about a project, and drawing it as a card here while it is
              a cartridge there would have made them disagree about the one thing
              a person actually recognises it by.
            */
            <ProjectShelf
              projects={games.map((project) =>
                cartridgeOf(
                  project,
                  gameHref(slug, project, context),
                  needs,
                  shells,
                  browseWords,
                  needWords,
                ),
              )}
              label={t.games}
              openIt={browseWords.openProject}
              closeLabel={browseWords.closeSheet}
              noPicture={browseWords.noPicture}
            />
          )}

          <p className="text-xs text-ink-muted">
            <Link href={`/t/${slug}/browse`} className="text-accent hover:opacity-80">
              {t.allGames}
            </Link>
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-mono text-xs tracking-[0.2em] text-ink-muted uppercase">{t.kept}</h2>
        {scenes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line/60 p-6 text-sm text-ink-muted">
            {t.empty}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {scenes.map((scene) => (
              <li key={scene.id}>
                <Link
                  href={`/t/${slug}/studio/video?scene=${scene.id}`}
                  className="flex items-center gap-3 rounded-xl border border-line/50 bg-surface-raised/30 px-3 py-2.5 transition hover:border-accent/60"
                >
                  <Clapperboard className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{scene.name}</span>
                  <span className="shrink-0 font-mono text-xs text-ink-muted">
                    {scene.seconds}s
                  </span>
                  {scene.visibility === 'public' && (
                    <span className="shrink-0 font-mono text-[10px] text-accent">shared</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * How many rows the recents strip shows.
 *
 * Eight is two full columns on a laptop and eight rows on a phone - enough to
 * hold a week of work and short enough that the lists underneath are still
 * worth scrolling to.
 */
const RECENT = 8

/**
 * "3 days ago", in the reader's own language.
 *
 * `Intl.RelativeTimeFormat` rather than a date, because the question this
 * answers is "was I in the middle of this" and not "what was the date". The
 * steps stop at a week: past that the difference between eleven days and
 * thirteen stops meaning anything on a page about what you were last doing.
 *
 * Rounded toward zero and floored at one, so something saved forty seconds ago
 * does not read as "in 0 seconds" - `Intl` is happy to say that and it is a
 * sentence nobody wants to meet.
 */
function ago(locale: Locale, when: string): string {
  const seconds = (Date.parse(when) - Date.now()) / 1000
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [Number.POSITIVE_INFINITY, 'week'],
  ]

  let size = 1
  for (const [limit, unit] of steps) {
    if (Math.abs(seconds) < limit) {
      const value = seconds / size
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
        Math.min(-1, Math.round(value)),
        unit,
      )
    }
    size = limit
  }

  return when
}

/**
 * Where a game opens from here: the editor if you may edit it, the project
 * page if you may only look.
 *
 * `grant: null` on purpose. A grant is permission handed to somebody *outside*
 * the space, and everybody reading this page is inside it - so for them the
 * ladder is owner-or-policy, which `mayDo` answers from the row alone. Reading
 * `xp_grants` per project would be a query per card for a fact that cannot
 * change the answer for a member.
 */
function gameHref(slug: string, project: XpProjectRow, context: TenantContext): string {
  const viewer = { accountId: context.user.id, space: context, grant: null, operator: false }
  return mayDo(project, 'edit', viewer).allowed
    ? `/t/${slug}/studio/xp/${project.id}`
    : `/t/${slug}/browse/${project.id}`
}
