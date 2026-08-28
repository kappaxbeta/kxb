'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  cancelTournament,
  enterTournament,
  playMatch,
  recordMatchResult,
  replayMatch,
  startTournament,
  withdrawFromTournament,
} from '@/domain/tournament/actions'
import type { Match } from '@/domain/tournament/bracket'
import { battleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

const BUTTON =
  'rounded-lg border border-line px-3 py-1.5 text-xs transition hover:bg-surface-raised disabled:opacity-50'

export function BracketPanel({
  slug,
  tournamentId,
  status,
  rounds,
  entrants,
  names,
  winnerId,
  isHost,
  isEntrant,
  canAct,
}: {
  slug: string
  tournamentId: string
  status: 'open' | 'live' | 'ended' | 'cancelled'
  rounds: Match[][]
  entrants: readonly string[]
  /** userId -> handle. Ids with no entry fall back to a short form. */
  names: Record<string, string>
  winnerId: string | null
  isHost: boolean
  isEntrant: boolean
  canAct: boolean
}) {
  const refusal = useRefusal()
  const locale = useLocale()
  const t = battleDict(locale).bracket
  const router = useRouter()
  const [pending, startPending] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function act(run: () => Promise<{ ok: boolean; error?: string; battleId?: string }>) {
    setError(null)
    startPending(async () => {
      const result = await run()
      if (!result.ok) {
        setError(refusal(result.error ?? battleDict(locale).bracket.thatDidNotWork))
        return
      }
      if (result.battleId) router.push(`/t/${slug}/battle/${result.battleId}`)
      else router.refresh()
    })
  }

  /** A handle, or something stable to call somebody we could not name. */
  function nameOf(id: string | null): string {
    if (id === null) return '—'
    return names[id] ?? `${id.slice(0, 8)}…`
  }

  return (
    <div className="space-y-6">
      <ErrorNote>{error}</ErrorNote>

      {status === 'ended' && (
        <p className="rounded-xl border border-line bg-surface-raised/40 p-4 text-sm">
          🏆 <span className="font-medium">{nameOf(winnerId)}</span> {t.tookIt}
        </p>
      )}

      {canAct && status === 'open' && (
        <div className="flex flex-wrap gap-2">
          {isEntrant ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => withdrawFromTournament(slug, tournamentId))}
              className={BUTTON}
            >
              {t.withdraw}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => enterTournament(slug, tournamentId))}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {t.enterIt}
            </button>
          )}

          {isHost && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(() => startTournament(slug, tournamentId))}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black transition hover:bg-amber-300 disabled:opacity-50"
              >
                {t.drawBracket}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(() => cancelTournament(slug, tournamentId))}
                className={BUTTON}
              >
                {t.callItOff}
              </button>
            </>
          )}
        </div>
      )}

      {status === 'open' && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-ink-muted">{t.entrants}</h3>
          {entrants.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.nobodyYet}</p>
          ) : (
            <ol className="flex flex-wrap gap-2 text-xs">
              {entrants.map((id, index) => (
                <li key={id} className="rounded-full bg-surface-raised px-2 py-1">
                  {/* Sign-up order is the seeding, so showing it is honest
                      rather than decorative. */}
                  <span className="mr-1 text-ink-muted">{index + 1}.</span>
                  {nameOf(id)}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {rounds.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {rounds.map((round, roundIndex) => (
            <section key={roundIndex} className="min-w-56 shrink-0 space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {round.length === 1 ? t.final : fill(t.round, { n: roundIndex + 1 })}
              </h3>

              {round.map((match, matchIndex) => {
                const ready = match.a !== null && match.b !== null
                const decided = match.winner !== null

                return (
                  <div
                    key={matchIndex}
                    className="rounded-xl border border-line bg-surface-raised/40 p-3 text-sm"
                  >
                    <p className={match.winner === match.a ? 'font-medium' : ''}>
                      {nameOf(match.a)}
                    </p>
                    <p className={match.winner === match.b ? 'font-medium' : ''}>
                      {nameOf(match.b)}
                    </p>

                    {status === 'live' && !decided && ready && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {isHost && !match.battleId && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              act(() =>
                                playMatch(slug, tournamentId, roundIndex, matchIndex),
                              )
                            }
                            className={BUTTON}
                          >
                            {t.putItOn}
                          </button>
                        )}
                        {match.battleId && (
                          <>
                            <a
                              href={`/t/${slug}/battle/${match.battleId}`}
                              className={BUTTON}
                            >
                              {t.goFight}
                            </a>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                act(() =>
                                  recordMatchResult(
                                    slug,
                                    tournamentId,
                                    roundIndex,
                                    matchIndex,
                                  ),
                                )
                              }
                              className={BUTTON}
                            >
                              {t.takeResult}
                            </button>
                            {/*
                              The way out of a match that decided nothing - level
                              at full time, or a roster the result cannot be read
                              off. Without it the slot kept its battle forever
                              and the bracket could never move past it. The
                              action refuses when the match did have a winner, so
                              this is not a way to erase a defeat.
                            */}
                            {isHost && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  act(() =>
                                    replayMatch(
                                      slug,
                                      tournamentId,
                                      roundIndex,
                                      matchIndex,
                                    ),
                                  )
                                }
                                className={BUTTON}
                              >
                                {t.replayIt}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {!ready && !decided && (
                      <p className="mt-1 text-xs text-ink-muted">
                        {t.waitingOnEarlier}
                      </p>
                    )}
                    {decided && match.b === null && (
                      <p className="mt-1 text-xs text-ink-muted">{t.bye}</p>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
