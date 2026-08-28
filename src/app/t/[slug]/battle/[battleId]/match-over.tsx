'use client'

import Link from 'next/link'
import { wantRematch } from '@/domain/battle/actions'
import type { BattleParticipantView, BattleView } from '@/domain/battle/queries'
import type { BattleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'

/**
 * What is said when it is over, and the two ways to go again.
 *
 * Ninety-eight lines of markup out of `battle-room.tsx`, from the middle of a
 * component that is otherwise about a match in progress. Nothing here runs
 * while anybody is playing: it is drawn once, at the end, over a world that has
 * stopped mattering.
 *
 * The rematch half is the part with rules in it, and both are about *not*
 * making the host special:
 *
 *  - offered only to people who were in it, and only while there is still an it
 *    to go again from. Once somebody has started the rematch this becomes a
 *    door to that match rather than a vote about it.
 *  - **anybody who opted in may start it, not only whoever set the first one
 *    up.** They may have lost and left, and a rematch only they could call is
 *    one that usually cannot be called. The decider enforces the same rule, so
 *    this is not the button being generous.
 */
export function MatchOver({
  battle,
  slug,
  t,
  dict,
  iWon,
  joined,
  resultLine,
  rematchers,
  iWantRematch,
  pending,
  act,
  goRematch,
  onLookAround,
}: {
  battle: BattleView
  slug: string
  t: BattleDict['room']
  dict: BattleDict
  iWon: boolean
  /** Whether we were in it. A spectator is not offered a rematch. */
  joined: boolean
  /** The sentence under the headline, which each mode words its own way. */
  resultLine: string
  rematchers: readonly BattleParticipantView[]
  iWantRematch: boolean
  pending: boolean
  /** Run a server action, show a refusal, refresh. The room's. */
  act: (run: () => Promise<{ ok: boolean; error?: string }>) => void
  /** Make the rematch and walk into it - it navigates, so the room keeps it. */
  goRematch: () => void
  onLookAround: () => void
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-md rounded-3xl border border-white/15 bg-black/85 px-8 py-6 text-center text-white backdrop-blur-sm">
        <p className="text-3xl font-medium">
          {battle.status === 'cancelled'
            ? dict.xpRoom.calledOff
            : iWon
              ? t.youWon
              : battle.winner === null
                ? t.aDraw
                : t.matchOver}
        </p>

        <p className="mt-3 text-sm text-white/70">{resultLine}</p>

        {/*
          Going again.

          Offered to the people who were in it, and only while there is
          still an it to go again from - once somebody has started the
          rematch this becomes a door to it instead of a vote about it.
        */}
        {battle.status === 'ended' && joined && (
          <div className="mt-5 border-t border-white/15 pt-4">
            {battle.rematchBattleId ? (
              <Link
                href={`/t/${slug}/battle/${battle.rematchBattleId}`}
                className="inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-medium text-black transition hover:bg-amber-300"
              >
                {t.rematchOn}
              </Link>
            ) : (
              <>
                <p className="text-xs text-white/50">
                  {rematchers.length === 0
                    ? t.nobodyAskedRematch
                    : fill(
                        rematchers.length === 1 ? t.wantsAnotherGo : t.wantAnotherGo,
                        { names: rematchers.map((p) => p.name).join(', ') },
                      )}
                </p>

                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {!iWantRematch && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => wantRematch(slug, battle.id))}
                      className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:opacity-50"
                    >
                      {t.rematch}
                    </button>
                  )}

                  {/*
                    Startable by anybody who opted in, not just the host -
                    whoever set the match up may have lost and left, and a
                    rematch only they could call is one that usually cannot
                    be called. The decider enforces the same rule.
                  */}
                  {iWantRematch && rematchers.length >= 2 && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={goRematch}
                      className="rounded-full bg-amber-400 px-5 py-2 text-sm font-medium text-black transition hover:bg-amber-300 disabled:opacity-50"
                    >
                      {t.startRematch}
                    </button>
                  )}

                  {iWantRematch && rematchers.length < 2 && (
                    <p className="self-center text-xs text-white/50">
                      {t.waitingForOneMore}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => onLookAround()}
            className="rounded-full border border-white/25 px-5 py-2 text-sm transition hover:bg-white/10"
          >
            {t.lookAround}
          </button>
          <Link
            href={`/t/${slug}/battle`}
            className="rounded-full border border-white/25 px-5 py-2 text-sm transition hover:bg-white/10"
          >
            {t.leave}
          </Link>
        </div>
      </div>
    </div>
  )
}
