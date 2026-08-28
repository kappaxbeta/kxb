import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BattleLobby } from '@/app/t/[slug]/battle/battle-lobby'
import { fightable } from '@/domain/battle/xp-rules'
import { countRunningBattles, listBattles } from '@/domain/battle/queries'
import { limitFor } from '@/domain/billing/quota'
import { closeStaleBattles } from '@/domain/battle/sweep'
import { readShelf } from '@/domain/magazine/shelf'
import { hasRoomFor } from '@/domain/billing/quota'
import { listRooms } from '@/domain/rooms/queries'
import { battlesProjection } from '@/domain/battle/projection'
import { listBattlefields } from '@/domain/battlefields/queries'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { listScores } from '@/domain/tournament/queries'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import { runProjection } from '@/es/projection'
import { battleOpen, canWrite, hasRole, requireFeature, requireTenant, xpOpen } from '@/lib/tenant'
import { battleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: battleDict(await readLocale()).title }
}

export const dynamic = 'force-dynamic'

/**
 * The way in to everything competitive.
 *
 * The lounge stays what it is - a play area where sparring is always on and
 * nothing is at stake. This is the other thing: matches with a roster, a start,
 * and a winner worth writing down.
 */
export default async function BattleHubPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug, { guests: 'event', surface: 'battle' })
  const { supabase, tenant } = context

  requireFeature(context, 'battle')
  // And the space's own switch. `notFound` rather than a sentence, which is the
  // rule `requireFeature` writes down: a link is not a permission, and a page
  // explaining what it would have been is an advertisement. A match already
  // running is deliberately still reachable - see `battleOpen`.
  if (!battleOpen(context)) notFound()

  await runProjection(supabase, battlesProjection, tenant.id)
  await runProjection(supabase, battlefieldsProjection, tenant.id)

  /*
   * The day-later backstop, asked as a question rather than run as a job.
   *
   * Before the lists are read, so a room somebody opened on Friday is closed by
   * the same render that would otherwise show it as still waiting for players.
   * It answers nothing almost every time - see `closeStaleBattles`.
   */
  await closeStaleBattles(supabase, tenant.id)

  /*
   * Three sources, one list - see `domain/xps/playable.ts`. This used to be a
   * directory listing, which is why a space could build a level and then have
   * nowhere to play it.
   */
  /*
   * The shelf rather than the flat playable list.
   *
   * Same three sources underneath - `readShelf` calls `listPlayableXps` - but
   * it also says which of them this space has actually *taken in*, and the
   * wizard now leads with that. A space's own shelf should have standing in the
   * surface where it matters most, and it had none: everything publishable
   * anywhere arrived as one undifferentiated grid.
   */
  const shelf = await readShelf(supabase, tenant.id, xpOpen(context))

  /*
   * Every row the wizard can actually summon on, with the shelf's answer
   * attached. Rows whose level is gone are dropped - the shelf keeps them so it
   * can say "not here any more", and there is nothing to fight inside.
   */
  const playable = {
    xps: [...shelf.inMagazine, ...shelf.catalogue]
      /*
       * And nothing that is a place rather than a match.
       *
       * `fightable` is the same question `createBattle` refuses on, asked here
       * so the café is not a card somebody can pick, name, set a time limit for
       * and only then be told about. A cartridge that declares no `match` has
       * no match in it - see the note there.
       */
      .filter((row) => row.xp !== null && fightable(row.xp))
      .map((row) => ({ ...row.xp!, shelved: row.shelvedAs !== null })),
    hidden: shelf.hidden,
  }

  const [open, recent, arenas, scores, running] = await Promise.all([
    listBattles(supabase, tenant.id, ['open', 'live']),
    listBattles(supabase, tenant.id, ['ended', 'cancelled'], 8),
    listBattlefields(supabase, tenant.id),
    listScores(supabase, tenant.id),
    /*
      What the door is about to be refused for, asked before it is pressed.

      `summonBattle` counts exactly this and turns somebody away with "this
      space already has N matches running" - which is the right sentence in the
      wrong place: it arrives after four steps of a wizard, at the moment the
      match was supposed to exist. The count is cheap and the page is already
      dynamic, so the ceiling can be on the door instead.

      The same query the action uses, deliberately: two ways of counting a
      running match is two answers to "may I", and the one that dims the button
      would be the one nobody tests.
    */
    countRunningBattles(supabase, tenant.id),
  ])

  /*
   * Is there an XP place free?
   *
   * The store half of the picker offers two different things and this is what
   * tells them apart. Taking one in is free and unlimited on every tier -
   * `docs/product/pricing.md` §3 - and *putting one out* is the metered act.
   * Saying so on the card is the whole point: the wall lands where somebody
   * already wants the level, rather than as a refusal after four steps.
   *
   * `includePrivate` for the reason `placesFull` gives: without it a space
   * holds as many private levels as it likes and the cap is not a cap.
   */
  const rooms = await listRooms(supabase, tenant.id, { includePrivate: true })
  const { allowed: placeFree } = await hasRoomFor(
    supabase,
    tenant.id,
    tenant.tier,
    'xpPlaces',
    rooms.filter((room) => room.xpRef !== null).length,
  )

  /**
   * The cap in force for this space, or null for no cap at all.
   *
   * `limitFor` and not the tier's own number: a space can carry an override or
   * sit under an installation ceiling, and a door dimmed against the tier alone
   * would be dimmed against a number this space is not actually held to.
   */
  const matchCap = await limitFor(supabase, tenant.id, tenant.tier, 'matches')

  const names = await readUsernames(
    supabase,
    scores.map((score) => score.userId),
  )

  const t = battleDict(await readLocale())

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">{t.heading}</h2>
          <p className="text-sm text-ink-muted">{t.body}</p>
        </div>
        <div className="flex gap-5 text-sm text-ink-muted">
          {/*
            Not for guests, because neither page will have them: both call
            `requireTenant` without the guest option and turn them away. An
            event can hand out matches without handing out the standings and
            the inter-space challenge board - which is the usual shape, since
            a weekend crowd has no other space to be challenged by - and until
            these were hidden that read as two broken links rather than a
            deliberately smaller room.
          */}
          {tenant.role !== 'guest' && (
            <>
              <Link href={`/t/${slug}/battle/tournaments`} className="transition hover:text-ink">
                {t.tournaments}
              </Link>
              <Link href={`/t/${slug}/battle/challenges`} className="transition hover:text-ink">
                {t.challenges}
              </Link>
            </>
          )}
          {/* The catalogue, from the room where a stage gets chosen. Behind the
              flag, and not for guests - the same reasoning as the two links
              above: a guest has no space to pull a world into. */}
          {tenant.role !== 'guest' && context.features.worlds && (
            <Link href={`/t/${slug}/worlds`} className="transition hover:text-ink">
              {t.worlds}
            </Link>
          )}
          <Link
            href={`/t/${slug}/battle/battlefields`}
            className="font-medium text-ink transition hover:text-accent"
          >
            {t.battlefields}
          </Link>
        </div>
      </div>

      <BattleLobby
        slug={slug}
        open={open}
        recent={recent}
        arenas={arenas}
        xps={playable.xps}
        hidden={playable.hidden}
        placeFree={placeFree}
        /*
          The flag is on but the plan is not: show the xp fork, locked, with the
          price on it. `xps` is already empty in that case - `xpOpen` is false -
          so this is the only thing that tells the wizard the difference between
          "not for sale here" and "not bought yet".
        */
        xpOffered={context.features.xp && !xpOpen(context)}
        xpOnSale={context.features.xp_sales}
        canCreate={canWrite(context)}
        /*
          Closing somebody else's match is staff work, not writer work.
          `cancelBattle` already draws the same line - it passes `asStaff` for
          an owner or an admin and lets the decider decide - so this only has
          to agree with it about who to *offer* it to.
        */
        canClose={hasRole(context, ['owner', 'admin'])}
        running={running}
        matchCap={matchCap}
      />

      {/*
        Counts, not a ladder.

        Ordered by how much somebody has turned up rather than how often they
        won, and phrased as a tally rather than a rank - see the note in
        20260803070000_tournaments.sql for why this deliberately does not
        become a leaderboard.
      */}
      {scores.length > 0 && (
        <section className="flex flex-wrap items-center gap-3">
          <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
            {t.scraps}
          </h3>
          <ul className="flex flex-wrap gap-2 text-xs">
            {scores.map((score) => (
              <li
                key={score.userId}
                className="rounded-full border border-line/40 bg-surface-raised/40 px-3 py-1.5"
              >
                <span className="font-medium">
                  {displayNameFrom(names, score.userId)}
                </span>
                <span className="ml-2 font-mono text-ink-muted">
                  {fill(t.wonOf, { won: score.won, played: score.played })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
