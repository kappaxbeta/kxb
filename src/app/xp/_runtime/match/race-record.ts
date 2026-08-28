import type { Run } from '@/app/xp/_runtime/match/race'

/**
 * A finished run, on its way into the level's own record.
 *
 * `append` got a host in `20261030000000_xp_streams.sql` and had nobody calling
 * it — the same state `put` was in until a checkpoint wanted it. This is the
 * caller, and a race time is the obvious first one: it is the only number the
 * runtime already produces that somebody would be upset to lose, and
 * `docs/xp/scenes.md` §3.3 names exactly this case when it says a game that
 * wants history calls `append` rather than `put`.
 *
 * ---------------------------------------------------------------------------
 * Why this is not `store.put('shared:best', …)`
 * ---------------------------------------------------------------------------
 * Because a best time overwrites and a run does not. `shared:best` is a fine
 * place for *the* best — one row, last-write-wins, `board()` reads everybody's —
 * and it answers "who is fastest" while forgetting every run that was not. A
 * course somebody has run forty times has forty results, and the only reason to
 * throw thirty-nine of them away is that the store cannot hold them.
 *
 * The two are not alternatives and a level may want both. This one is the half
 * that cannot be reconstructed afterwards.
 *
 * ---------------------------------------------------------------------------
 * Its own module, for a boundary rather than for tidiness
 * ---------------------------------------------------------------------------
 * The decision below is four lines and the file around it is a scene with a
 * canvas in it. Kept apart because this is the part with a *rule* in it — what
 * is worth recording, and to what precision — and a rule inside a component is
 * a rule with no test.
 */

/**
 * The stream a level's race results go in.
 *
 * A plain word rather than a scoped key: `append` takes a stream name and the
 * store's `get`/`put` take a `player:` / `space:` / `shared:` prefix, and the
 * difference is real. A prefix says who may read afterwards, and a stream has
 * one answer to that already — the space it lives in, per the table's policy.
 */
export const RACE_STREAM = 'race'

/** What one finished run looks like once it is written down. */
export interface RaceRecord {
  /** Hundredths, and see below for why not more. */
  seconds: number
  /** Whether this run was the fastest this player had managed here. */
  best: boolean
}

/**
 * What to append for a run that has just finished, or `null` for one not worth
 * recording.
 *
 * ---------------------------------------------------------------------------
 * Hundredths, because that is what was on the screen
 * ---------------------------------------------------------------------------
 * `formatRunTime` shows two decimal places and the clock is accumulated from
 * clamped frame deltas, so the digits past that are the frame rate rather than
 * the run. Recording them would mean a stored result that disagrees with the
 * number the player was shown, which is the shape of every argument a
 * leaderboard has ever had. Two people tying at 12.40 tied.
 *
 * ---------------------------------------------------------------------------
 * `best` is stored even though it is derivable
 * ---------------------------------------------------------------------------
 * It is `min` over the stream, so a reader could work it out — and would have to
 * read the whole stream to do it, per player, to answer a question the writer
 * already knew the answer to. One boolean is cheaper than the fold, and it is
 * the *player's* best rather than the course's: this stream carries everybody's
 * runs, and "the fastest I have gone here" is not a thing the rows can say
 * without knowing whose they are.
 */
export function raceRecord(run: Run): { type: string; data: RaceRecord } | null {
  if (run.phase !== 'finished') return null

  /**
   * Rounded with the formatter's own operation, not with `Math.round(x * 100)`.
   *
   * They disagree on exact halves — `61.005` is `61.01` to one and `1:01.00` to
   * the other, because a float's real value is not the decimal that was typed —
   * and a stored time that reads differently from the time on the screen is the
   * whole thing this rounding exists to prevent. Using `toFixed` here makes the
   * agreement structural rather than something a test has to keep noticing.
   */
  const seconds = Number(run.time.toFixed(2))

  /**
   * A run of no length is not a result.
   *
   * `stepRun` needs a start crossing before a finish counts, so this should not
   * arrive — and a course whose start and finish frames overlap would produce it
   * every time somebody walked through, filling the ceiling with zeroes and
   * costing that player their real history. A guard against a level being
   * strange is cheaper than a rule about what a level may be.
   */
  if (!Number.isFinite(seconds) || seconds <= 0) return null

  return {
    type: 'finished',
    // `best` is assigned from `time` by `stepRun`, so the comparison is against
    // the same float rather than a rounded copy of it.
    data: { seconds, best: run.best !== null && run.time <= run.best },
  }
}
