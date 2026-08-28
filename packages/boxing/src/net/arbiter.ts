/**
 * `@kxb/boxing/arbiter` - the one thing no client may decide.
 *
 * ---------------------------------------------------------------------------
 * Why a result is different from everything else in this package
 * ---------------------------------------------------------------------------
 * `../rules/fight.ts` hands damage to the defender and the round clock to the
 * red corner, and both of those are fine because being wrong about them is
 * *visible and self-correcting*: a position that disagrees is snapped straight
 * by the next packet, a bell that rings 100ms early is a bell.
 *
 * A result is neither. It is written down, it is read back by somebody who was
 * not there, and nothing later corrects it. `@kxb/xp/host` puts exactly that
 * class of thing behind `XpArbiter`, and the sentence in `XpPersistence` is the
 * one that decides this file: *a score that can be overwritten is a score
 * somebody can overwrite.*
 *
 * ---------------------------------------------------------------------------
 * One action, and it is idempotent
 * ---------------------------------------------------------------------------
 * Both clients watch the same fight end. Both of them could report it, one of
 * them will have a worse connection, and `XpRefusal` has a whole state -
 * `lost` - for "no answer came back, ask again". So the rule below has to be
 * safe to run twice with the same match id and different callers, and it is:
 * the first report wins and the second is handed back the *stored* outcome
 * rather than an error.
 *
 * That is deliberately not a refusal. A client that asked twice because its
 * first ask was lost has done nothing wrong, and telling it "refused" would put
 * an error on screen at the end of a match somebody just won.
 */

import type { XpArbiter, XpHost, XpVerdict } from '@kxb/xp/host'
import { Refused, type MemoryArbiter, type MemoryRuling } from '@kxb/xp/host'

import type { Verdict } from '../rules/fight'

/** The only action this game asks an authority for. */
export const REPORT = 'boxing:report'

/** What is asked. */
export interface Report {
  /** The room, which is what makes two reports of the same fight the same fight. */
  match: string
  verdict: Verdict
}

/** What comes back, whether this call was the one that wrote it or not. */
export interface Recorded {
  match: string
  verdict: Verdict
  /** Who reported it first. */
  by: string
  /** False when this call found the result already there. */
  fresh: boolean
}

const stored = (match: string) => `boxing:result:${match}`

/**
 * Teach a `memoryArbiter` this game's rules.
 *
 * The memory arbiter is the SDK's second implementation of `XpArbiter`, and the
 * reason it exists is exactly this: the rule below can be tested for the two
 * things that matter - that a result cannot be overwritten, and that a stranger
 * cannot report one - in microseconds, with no database anywhere.
 *
 * A real host implements the same two rules in a transaction. What must not
 * happen is a real host implementing *different* ones, which is what this
 * function existing in the game package rather than the host is meant to
 * prevent: the rules travel with the game.
 */
export function boxingArbiter(arbiter: MemoryArbiter, fighters: readonly string[]): MemoryArbiter {
  return arbiter.decides(REPORT, (ruling: MemoryRuling): Recorded => {
    const report = readReport(ruling.payload)
    if (!report) throw new Refused('not a result')

    // Only somebody who was in the fight may say how it went. Taken from
    // `ruling.by` - the arbiter's own record of who asked - rather than from
    // the payload, for the reason `MemoryRuling` gives: a client that names its
    // own id in the body of an ask is a client that can report for somebody
    // else.
    if (!fighters.includes(ruling.by.id)) throw new Refused('not in this fight')

    const already = ruling.state.get(stored(report.match)) as Recorded | undefined
    // The second report of the same fight is answered, not refused. See header.
    if (already) return { ...already, fresh: false }

    const record: Recorded = {
      match: report.match,
      verdict: report.verdict,
      by: ruling.by.id,
      fresh: true,
    }
    ruling.state.set(stored(report.match), record)
    return record
  })
}

/**
 * Report a finished fight, and keep a copy.
 *
 * Two ports, doing two different jobs, which is why this is one function rather
 * than a call to each:
 *
 *   - `arbiter.ask` is the *agreement*. It can refuse, it can be lost, and its
 *     answer is what both clients show.
 *   - `persistence.append` is the *record*. Append-only and ordered, per
 *     `XpPersistence`, so a fighter's history is a log rather than a column
 *     somebody's next win overwrites.
 *
 * Both are optional on `XpHost`, and neither being there is a real case rather
 * than a broken one: two tabs on a laptop have no authority and nowhere to
 * write. So the return says which of them happened instead of throwing - a
 * friendly match that could not be recorded is still a match that was won.
 */
export async function reportFight(
  host: XpHost,
  match: string,
  verdict: Verdict,
): Promise<{ agreed: XpVerdict<Recorded> | null; kept: boolean }> {
  const agreed = host.arbiter
    ? await host.arbiter.ask<Recorded>(REPORT, { match, verdict } satisfies Report)
    : null

  let kept = false
  if (host.persistence?.append) {
    // Written even when there was no authority to agree it. On a host with
    // storage and no arbiter - which is what `localHost` is - this is the whole
    // record, and refusing to keep it because nobody countersigned would throw
    // away the only copy.
    await host.persistence.append(`boxing:${match}`, 'fight.finished', verdict)
    kept = true
  }

  return { agreed, kept }
}

/** What this client is entitled to know about the match, from whoever decides. */
export async function readFight(arbiter: XpArbiter): Promise<unknown> {
  return arbiter.view()
}

function readReport(payload: unknown): Report | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>
  if (typeof wire.match !== 'string' || wire.match.length === 0) return null
  if (typeof wire.verdict !== 'object' || wire.verdict === null) return null

  const verdict = wire.verdict as Record<string, unknown>
  const how = verdict.how
  if (how !== 'ko' && how !== 'tko' && how !== 'decision' && how !== 'draw') return null
  const winner = verdict.winner
  if (winner !== null && winner !== 'red' && winner !== 'blue') return null
  if (!Array.isArray(verdict.cards)) return null

  return {
    match: wire.match,
    verdict: { winner, how, cards: verdict.cards as Verdict['cards'] },
  }
}
