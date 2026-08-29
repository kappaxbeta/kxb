import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingShell } from '@/app/components/marketing-shell'
import { XpShelf, type StoreCartridge } from '@/app/browse/xp-shelf'
import { WorldCard } from '@/app/worlds/world-card'
import { listXpCatalogue, type XpSummary } from '@/domain/xps/catalogue'
import { readXpViewer, type XpViewer } from '@/domain/xps/viewer'
import { listPublicWorlds } from '@/domain/worlds/queries'
import { createClient, getUser } from '@/lib/supabase/server'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'
import { storeDict, type StoreDict } from '@/app/i18n/store'
import type { Locale } from '@/domain/i18n/locale'
import { workspaceDict } from '@/app/i18n/workspace'

/**
 * The store.
 *
 * ---------------------------------------------------------------------------
 * Why this is not /worlds with a section added
 * ---------------------------------------------------------------------------
 * A world is somewhere to stand and an XP is something to play, and a page
 * called `/worlds` with games at the top of it is a page whose name argues with
 * its content every time somebody reads the URL. So this is its own route and
 * `/worlds` stays exactly as it was - the full catalogue, its filters, the
 * saved list, the tag links people have shared. Two pages, one of which is the
 * front of the shop and the other the whole shelf.
 *
 * ---------------------------------------------------------------------------
 * The order is the argument
 * ---------------------------------------------------------------------------
 * XP first, at the widest size the design system has, and everything else under
 * one heading. That is not a ranking of quality - some of the worlds here took
 * far longer to build than any of the XPs. It is a claim about what somebody
 * arriving cold can *do*: an XP is a thing you press play on, and a world is a
 * thing you have to already have a space to use.
 *
 * The rest is one section rather than three, because the honest description of
 * it is "and also these", and three headed sections would imply three things as
 * important as the first.
 *
 * ---------------------------------------------------------------------------
 * Signed out, and public
 * ---------------------------------------------------------------------------
 * Same posture as `/worlds`, and the reasoning there transfers whole: this is
 * the page that answers "what is this thing" for somebody who has not made an
 * account. Nothing on it is behind a session. The only thing the signed-in
 * state changes is where one link points - see `domain/xps/viewer.ts`.
 */

/** The tab. `generateMetadata` because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  const t = storeDict(await readLocale())
  return { title: t.metaTitle, description: t.metaBody }
}

export const dynamic = 'force-dynamic'

/** How much of the world catalogue the store shows before handing over to it. */
const MISC_LIMIT = 6

export default async function BrowsePage() {
  /*
    The card's own words. The page around it is still English - see the note in
    the session that found this - but a card that says `· 3× genutzt` inside an
    English page is better than one that cannot, and it is the same card the
    workspace draws.
  */
  const locale = await readLocale()
  const t = storeDict(locale)
  const worldWords = workspaceDict(locale).worlds
  const supabase = await createClient()
  const user = await getUser()

  const [xps, worlds, viewer] = await Promise.all([
    // The client, so the operator's overlay is applied: a level taken off the
    // shelf in /ovaloffice/xps is not in the shop window.
    listXpCatalogue(supabase),
    listPublicWorlds(supabase, { sort: 'used' }),
    readXpViewer(supabase, user?.id ?? null),
  ])

  const misc = worlds.slice(0, MISC_LIMIT)

  return (
    <MarketingShell locale={locale}>
      <div className="pb-4">
        <header className="pt-6 sm:pt-10">
          <h1 className="font-pixel text-[clamp(1.5rem,5.2vw,2.75rem)] uppercase leading-[1.18]">
            {t.heading}
          </h1>
          <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            {t.body}
          </p>
        </header>

        {/* --- the games ------------------------------------------------- */}
        <section className="mt-12" aria-labelledby="xp-heading">
          {/* The line sits under the heading rather than across from it. Pushed
              to the far edge of a six-xl container it stops being a subtitle and
              becomes a caption for nothing - there is a thousand pixels of dark
              between the two things that belong together. */}
          <h2 id="xp-heading" className="font-pixel text-2xl uppercase leading-tight">
            {t.xp}
          </h2>
          <p className="mt-2 max-w-[62ch] text-sm text-ink-muted">
            {t.xpBody}
          </p>

          {/*
            A shelf, not a grid of cards. See `xp-shelf.tsx` for why this page
            was the last to change and what the trade was.
          */}
          <div className="mt-6">
            <XpShelf xps={xps.map((xp) => storeCartridge(xp, t, locale))} t={t} />
          </div>

          {/*
            The create door, under the shelf rather than the last tile in it.

            It was a tile because the grid had a hole to fill - a store with five
            things in it must look like one that just opened rather than one that
            failed - and a shelf has no hole: an unfinished row of cartridges
            reads as a shelf with room on it, which is exactly right. So the door
            can stop pretending to be a game and be a door.
          */}
          <div className="mt-6 sm:max-w-md">
            <MakeOne viewer={viewer} t={t} />
          </div>
        </section>

        {/* --- everything else -------------------------------------------- */}
        <section className="mt-16" aria-labelledby="misc-heading">
          <div className="border-t border-line/40 pt-8">
            <h2 id="misc-heading" className="font-pixel text-2xl uppercase leading-tight">
              {t.misc}
            </h2>
            <p className="mt-2 max-w-[62ch] text-sm text-ink-muted">
              {t.miscBody}
            </p>
          </div>

          {misc.length === 0 ? (
            <p className="mt-6 rounded-xl border border-line bg-surface/40 px-4 py-6 text-sm text-ink-muted">
              {t.nothingPublished}
            </p>
          ) : (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {misc.map((world) => (
                  <WorldCard
                    key={world.id}
                    world={world}
                    href={`/worlds/${world.id}`}
                    t={worldWords}
                    locale={locale}
                  />
                ))}
              </div>

              {/* The shelf, from the shop front. `/worlds` keeps every filter,
                  the saved list and the shared tag links; this section is a
                  window onto it and should say so rather than reimplement it. */}
              <p className="mt-5 text-sm text-ink-muted">
                {worlds.length > misc.length
                  ? fill(t.worldsInCatalogue, { n: worlds.length.toLocaleString(locale) })
                  : ''}
                <Link href="/worlds" className="text-accent transition hover:opacity-80">
                  {t.seeAllWorlds}
                </Link>
              </p>
            </>
          )}
        </section>
      </div>
    </MarketingShell>
  )
}

/**
 * One published level, as the shelf needs it.
 *
 * The counts and the capability words are composed here rather than in the
 * browser, which is the call every other shelf made: they are finished the
 * moment the page renders and never change again, and shipping `fill` plus a
 * dictionary into the client to reassemble them is a second bill on a component
 * already paying for a WebGL context.
 */
function storeCartridge(xp: XpSummary, t: StoreDict, locale: Locale): StoreCartridge {
  return {
    id: xp.id,
    name: xp.name,
    blurb: xp.blurb,
    cover: xp.cover,
    finish: xp.finish,
    hue: xp.hue,
    href: `/browse/xp/${xp.id}`,
    /*
      Pieces before things, and both before whether it is scripted, because
      "how big" and "is anything happening" are the two questions a summary can
      answer and the rest is trivia until you open it. The card made this
      argument first; the ordering is its.
    */
    facts: `${fill(xp.pieces === 1 ? t.pieceOne : t.pieces, {
      n: xp.pieces.toLocaleString(locale),
    })} · ${fill(xp.things === 1 ? t.thingOne : t.things, {
      n: xp.things.toLocaleString(locale),
    })}${xp.scripted ? ` ${t.scripted}` : ''}`,
    chips: xp.capabilities.map((capability) => CAPABILITY_WORDS[capability] ?? capability),
  }
}

/**
 * A short word per capability, which the long ones in `describeCapability` are
 * not: that function writes a sentence for an operator picking a level out of a
 * dropdown, and this is a chip on a panel somebody is scanning.
 *
 * Moved here with the card it used to live on.
 */
const CAPABILITY_WORDS: Record<string, string> = {
  freeplay: 'wander',
  match: 'match',
  football: 'football',
  competition: 'timed',
}

/**
 * The one control on this page that differs by who is looking.
 *
 * Three destinations, one shape. The copy names the next step rather than the
 * state it is reporting - "start one" and "open your space" are things to do,
 * where "you need the xp tier" is a thing to be told, and a card at the end of
 * a grid of games is not the place to tell somebody they cannot have one.
 */
function MakeOne({ viewer, t }: { viewer: XpViewer; t: StoreDict }) {
  const { href, title, body, action } = destinationFor(viewer, t)

  return (
    <Link
      href={href}
      className="box box-interactive flex flex-col justify-end"
      // The accent hue, and the only card on the page that gets it: fuchsia
      // means actionable here (DESIGN.md), so the tile that is an action wears
      // it and the tiles that are things do not.
      style={{ '--box-hue': 322 } as React.CSSProperties}
    >
      {/*
        An empty lit room where the other tiles have a photograph. Both the
        floor and the horizon are absolute against their *nearest* positioned
        ancestor and the floor claims the bottom 60% of it, so they belong to
        this frame and not to the card - put them on the card and the horizon
        line strikes through the copy, which is the exact failure the rule's own
        comment in globals.css warns about.

        The frame also matches the picture height on a real card, so a row of
        three keeps its baselines.
      */}
      <div className="relative isolate -m-7 mb-5 aspect-[16/10] overflow-hidden">
        <span aria-hidden className="neon-horizon" />
        <span aria-hidden className="neon-floor" />
      </div>

      <h3 className="text-lg font-medium leading-snug">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
      <p className="mt-auto pt-5 text-sm font-medium text-accent">{action} →</p>
    </Link>
  )
}

function destinationFor(
  viewer: XpViewer,
  t: StoreDict,
): {
  href: string
  title: string
  body: string
  action: string
} {
  if (viewer.operator) {
    return { href: '/xp/new', title: t.makeOne, body: t.operatorBody, action: t.startOne }
  }

  if (viewer.buildIn) {
    return {
      href: '/create/xp',
      title: t.makeOne,
      body: fill(t.buildInBody, { space: viewer.buildIn.name }),
      action: t.seeTheCreator,
    }
  }

  if (viewer.upgradable) {
    return {
      href: `/t/${viewer.upgradable.slug}/billing`,
      title: t.makeOne,
      body: fill(t.upgradableBody, { space: viewer.upgradable.name }),
      action: t.comparePlans,
    }
  }

  return {
    href: '/create/xp',
    title: t.makeOne,
    body: t.strangerBody,
    action: t.seeHowItWorks,
  }
}
