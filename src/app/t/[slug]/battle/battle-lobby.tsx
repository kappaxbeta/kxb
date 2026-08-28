'use client'

import Link from 'next/link'
import { cancelBattle } from '@/domain/battle/actions'
import { useRef, useState, useTransition } from 'react'
import { DoorMark, SparkMark } from '@/app/t/[slug]/battle/marks'
import { SummonWizard, type XpChoice } from '@/app/t/[slug]/battle/summon-wizard'
import { MAX_PLAYERS } from '@/domain/battle/events'
import type { BattleView } from '@/domain/battle/queries'
import type { BattlefieldView } from '@/domain/battlefields/queries'
import { battleDict, type BattleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The hub, as two doors and two lists.
 *
 * It used to open with the whole creation form - eight controls, unfolded, above
 * the matches that were actually running. That put the least common action
 * (hosting) in front of the most common one (joining something already on), and
 * it meant the page could not answer "is anything happening" without scrolling.
 *
 * So the form went into a wizard behind a door (./summon-wizard.tsx) and the
 * lists came up. The two doors are deliberately unequal in colour rather than in
 * size: fuchsia is this app's interactive colour and cyan is its cold one, so
 * summoning reads as the loud thing to do and joining as the easy one, without
 * either being the small print.
 */

export function BattleLobby({
  slug,
  open,
  recent,
  arenas,
  xps,
  hidden,
  placeFree,
  xpOffered,
  xpOnSale,
  canCreate,
  canClose,
  running,
  matchCap,
}: {
  slug: string
  /**
   * Whether this reader may call somebody else's match off.
   *
   * Staff, and only staff - `cancelBattle` already draws that line, passing
   * `asStaff` for an owner or an admin and leaving the rest to the decider. All
   * this decides is whether the button is *offered*, which is the half a client
   * is allowed to have an opinion about.
   */
  canClose?: boolean
  open: BattleView[]
  recent: BattleView[]
  arenas: BattlefieldView[]
  /** The XPs a match may be fought inside, or empty when the flag is off. */
  xps: XpChoice[]
  /** Projects the picker.s cap left out, passed straight to the wizard. */
  hidden: number
  /** Is there an XP place free? The store half of the picker says so. */
  placeFree: boolean
  /**
   * Show the xp fork with a price on it, rather than not at all.
   *
   * True when the installation has XPs but this space is on xo. Passed straight
   * through to the wizard, which is the only thing that renders it - see
   * `xpOffered` there.
   */
  xpOffered: boolean
  /** Whether the xp plan can be bought yet. Passed straight to the wizard. */
  xpOnSale: boolean
  canCreate: boolean
  /**
   * How many matches this space has running, counted the way the cap counts.
   *
   * Not `open.length`: that list is what this page shows, capped and filtered,
   * and a door dimmed against a page's worth of rows would disagree with the
   * action the moment either changed.
   */
  running: number
  /**
   * The ceiling, or null for none.
   *
   * Zero is a real answer and a different sentence: a plan with no matches in
   * it at all is not a space that has used them up.
   */
  matchCap: number | null
}) {
  const dict = battleDict(useLocale())
  const t = dict.lobby
  const [summoning, setSummoning] = useState(false)
  const onNow = useRef<HTMLElement>(null)

  /**
   * Whether the door would be refused if it were pressed.
   *
   * Asked here rather than left to `summonBattle`, which asks the same question
   * and answers it with a sentence at the end of a four-step wizard - after
   * picking a mode, an arena, the rules and the fighters. Everything about that
   * is right except when it happens.
   *
   * The action still refuses, and that is not redundancy: this is a number
   * rendered at some moment, and somewhere between reading it and pressing the
   * door somebody else in the space can start a match. The dimming is the
   * courtesy; the refusal is the rule.
   */
  const full = matchCap !== null && running >= matchCap

  return (
    <div className="space-y-10">
      <div
        className={`grid gap-4 ${canCreate ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}
      >
        {canCreate && (
          <button
            type="button"
            disabled={full}
            onClick={() => setSummoning(true)}
            /*
              Dimmed and unpressable at the cap, rather than loud and refused.

              The sweep and the bob come off with it - `summon-door` and
              `summon-bob` are what make this the thing your eye goes to, and a
              door that animates at you and then says no is worse than one that
              never invited you. What stays is the card, the title and the line
              underneath, which now carries the reason.
            */
            className={
              full
                ? 'group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-surface/60 p-5 text-left opacity-60 sm:p-6'
                : 'summon-door group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-accent/60 bg-accent/10 p-5 text-left transition hover:border-accent sm:p-6'
            }
          >
            <span
              aria-hidden
              className={
                full
                  ? 'grid size-12 shrink-0 place-items-center rounded-xl border border-line text-ink-muted'
                  : 'summon-bob grid size-12 shrink-0 place-items-center rounded-xl border border-accent/60 text-accent'
              }
            >
              <SparkMark />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-semibold">{t.summon}</span>
              {/*
                The ceiling, in the line that used to describe the wizard.

                Both numbers, because "3 of 3" answers the question the dimming
                raises - how many is too many - and a bare "no room" leaves
                somebody to work out whether one finishing is enough.
              */}
              <span className="mt-0.5 block text-sm text-ink-muted">
                {full
                  ? matchCap === 0
                    ? t.noMatches
                    : fill(t.someRunning, { running, cap: matchCap })
                  : t.fourSteps}
              </span>
            </span>
            <span className="shrink-0 font-mono text-xs uppercase tracking-[0.2em] text-ink-muted transition group-hover:text-ink">
              {full ? (
                t.full
              ) : (
                <>
                  {t.open}{' '}
                  <span className="inline-block transition group-hover:translate-x-0.5">→</span>
                </>
              )}
            </span>
          </button>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-accent-2/40 bg-accent-2/5 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-accent-2">
            <span
              aria-hidden
              className={`size-1.5 rounded-full bg-accent-2 ${
                open.length > 0 ? 'summon-live' : 'opacity-40'
              }`}
            />
            {open.length > 0 ? fill(t.liveNow, { n: open.length }) : t.nothingLive}
          </p>
          <p className="text-sm text-ink-muted">
            {open.length > 0
              ? t.jumpIn
              : canCreate
                ? t.nobodyFighting
                : t.nobodyFightingYet}
          </p>
          {open.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onNow.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-accent-2/60 px-4 py-3 text-sm font-medium text-accent-2 transition hover:bg-accent-2/10"
            >
              <DoorMark />
              {t.joinAMatch}
            </button>
          )}
        </div>
      </div>

      <section ref={onNow} className="space-y-3 scroll-mt-6">
        <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
          {t.onNow}
        </h3>
        {open.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {t.nothingRunning} {canCreate ? t.summonOneAbove : ''}
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((battle) => (
              <li key={battle.id} className="flex items-center gap-2">
                <Link
                  href={`/t/${slug}/battle/${battle.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line/50 bg-surface-raised/30 px-4 py-3.5 transition hover:border-accent-2/60 hover:bg-surface-raised/60"
                >
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full bg-accent-2 ${
                      battle.status === 'live' ? 'summon-live' : 'opacity-40'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mr-2 font-semibold">{battle.name}</span>
                    <span className="font-mono text-xs text-ink-muted">
                      {fill(t.meta, {
                        mode: dict.modes[battle.mode],
                        arena: arenaName(battle, arenas, t),
                        n: battle.participants.length,
                        cap: MAX_PLAYERS,
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-accent-2/60 px-4 py-1.5 text-sm text-accent-2 transition group-hover:bg-accent-2/10">
                    {battle.status === 'live' ? t.watch : t.join}
                  </span>
                </Link>
                {/*
                  Outside the link rather than inside it.

                  A button nested in an anchor is a click that does both - the
                  match closes *and* you are taken into it, which is the one
                  place this could be genuinely confusing. So the row is the
                  link and this sits beside it.
                */}
                {canClose ? <CloseMatch slug={slug} battle={battle} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section className="space-y-1">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
            {t.lately}
          </h3>
          <ul>
            {recent.map((battle) => (
              <li
                key={battle.id}
                className="flex items-baseline justify-between gap-3 border-b border-line/25 py-3 last:border-0"
              >
                <Link
                  href={`/t/${slug}/battle/${battle.id}`}
                  className="truncate hover:underline"
                >
                  {battle.name}
                </Link>
                <span className="shrink-0 font-mono text-xs text-ink-muted">
                  {outcome(battle, t)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summoning && (
        <SummonWizard
          slug={slug}
          arenas={arenas}
          xps={xps}
          hidden={hidden}
          placeFree={placeFree}
          xpOffered={xpOffered}
          xpOnSale={xpOnSale}
          onClose={() => setSummoning(false)}
        />
      )}
    </div>
  )
}

/**
 * What the meta line calls the ground a match is on.
 *
 * A match in the host's own lounge carries the tenant id as its world id (see
 * `createBattle`), which is the only case that has no row to look up. Arenas the
 * space owns - including the template grounds it has stood up - are on the page
 * already; anything else is somebody else's world, which this page has no name
 * for and does not fetch one for, because a match's own room shows it.
 */
function arenaName(
  battle: BattleView,
  arenas: BattlefieldView[],
  t: BattleDict['lobby'],
): string {
  if (battle.worldId === battle.tenantId) return t.theLounge
  // An arena's own name is never translated - it is what somebody called it.
  return arenas.find((arena) => arena.worldId === battle.worldId)?.name ?? t.anArena
}

function outcome(battle: BattleView, t: BattleDict['lobby']): string {
  if (battle.status === 'cancelled') return t.calledOff

  /*
   * Abandoned reads differently depending on whether there was anything on the
   * board, and both readings are honest.
   *
   * A match the backstop closed at 2-1 really was 2-1, so it says so and marks
   * that nobody blew the whistle. One with no score has no result to report,
   * and "a draw" would be a lie about a game nobody finished - "nobody came
   * back" is what actually happened.
   */
  if (battle.abandoned) {
    if (battle.winner === null) return t.nobodyCameBack
    const ahead =
      battle.winner.type === 'player' ? winnerName(battle, t) : battle.winner.id
    return t.aheadAbandoned.replace('{name}', ahead)
  }

  if (battle.winner === null) return t.aDraw
  if (battle.winner.type === 'player') {
    return t.won.replace('{name}', winnerName(battle, t))
  }
  // A team id - `red` or `blue` - which the scoreboard already prints as it is.
  return t.won.replace('{name}', battle.winner.id)
}

function winnerName(battle: BattleView, t: BattleDict['lobby']): string {
  const id = battle.winner?.id
  return battle.participants.find((p) => p.userId === id)?.name ?? t.somebody
}

/**
 * Call a match off from the list, without going into it.
 *
 * Asked for as an admin control on the overview: the only way to stop a match
 * was to walk into it, which for a room full of stale ones is a lot of walking.
 *
 * **Confirmed once.** Cancelling is not undoable and it is somebody else's game
 * - the two together are exactly the case a bare click is wrong for, and the
 * confirmation is inline rather than a dialog because the row is small and a
 * modal over a list of ten is heavier than the thing it guards.
 */
function CloseMatch({ slug, battle }: { slug: string; battle: BattleView }) {
  const refusal = useRefusal()
  const t = battleDict(useLocale()).lobby
  const [asked, setAsked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (error) {
    return (
      <span className="shrink-0 font-mono text-[11px] text-rose-300" role="alert">
        {error}
      </span>
    )
  }

  if (!asked) {
    return (
      <button
        type="button"
        onClick={() => setAsked(true)}
        className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted transition hover:border-rose-400/60 hover:text-rose-200"
      >
        {t.close}
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await cancelBattle(slug, battle.id)
            // The list is a server component, so a success repaints it on its
            // own. Only a refusal has anywhere to go.
            if (!result.ok) setError(refusal(result.error))
          })
        }
        className="rounded-full border border-rose-400/60 bg-rose-400/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
      >
        {pending ? t.closing : t.really}
      </button>
      <button
        type="button"
        onClick={() => setAsked(false)}
        className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted transition hover:border-ink-muted"
      >
        {t.keep}
      </button>
    </span>
  )
}
