/**
 * A match, and the moment it is over.
 *
 * The thing nothing in this project produced until now. `xp-match-room.tsx` has
 * said so in its own header comment since it was written: it has no clock, no
 * full-time whistle and no result, because every one of those reads a result out
 * of the scene and an XP did not report one. So the roster strip, the rematch
 * and the team counters were all waiting on one sentence - "the match is over,
 * and this is why".
 *
 * ---------------------------------------------------------------------------
 * What this does and does not decide
 * ---------------------------------------------------------------------------
 * It decides **when**, and **why**, and - since the arbiter arrived - **who**.
 *
 * That last one was refused here for a long time and the refusal named its own
 * condition: *"nothing assigns a player to a side and nothing puts another
 * player's score on the wire, so a `winner` field here would be a field that
 * always said you."* Both halves are now false. `sideOf` assigns, and
 * `xp_arbitrate` puts every player's score somewhere every client can read it
 * (docs/xp/server-authority.md §4.1), so the totals can be handed in and the
 * question has a second answer.
 *
 * **The totals are handed in rather than computed.** This module does not know
 * what a kill is, who is in the room, or which side anybody is on - that join is
 * ../_runtime/standings, and keeping it out here is what lets a match be ended
 * in a test by passing two numbers.
 *
 * ---------------------------------------------------------------------------
 * Pure, like ./race
 * ---------------------------------------------------------------------------
 * The runtime cannot be watched: the Browser pane is always `document.hidden`,
 * so `requestAnimationFrame` never fires and the canvas stays black. "Did the
 * goal on the whistle count" is a question a screenshot cannot answer and
 * ./match.test.ts can.
 */

import type { XpRules } from '@kxb/xp'

/** Why a match stopped. */
export type Ending = 'finish' | 'score' | 'time'

export interface Match {
  phase: 'playing' | 'over'
  /** Points the level has produced, from its own `score` verbs. */
  score: number
  /** Seconds since the level started. */
  elapsed: number
  /**
   * Seconds left, or null when the mode has no clock.
   *
   * Held rather than derived so a HUD does not have to know the rules to draw
   * the one number a player watches hardest.
   */
  remaining: number | null
  /** Why it ended, or null while it is still going. */
  ending: Ending | null
  /**
   * Which side won, when the level has sides and one of them did.
   *
   * Undefined in three different situations that are all honestly "no winner":
   * a level with no sides at all, a match still being played, and a **draw** -
   * two sides level when the clock stopped. A draw returning the first of the
   * tied sides would be inventing a result, and full time in a 2-2 is a fact
   * worth being able to say.
   */
  winner?: string
  /**
   * How many times this match has ended.
   *
   * A counter for the reason `Run.finishes` is one: "it is over" is an *event*
   * and React props are state, so a rematch that ends the same way with the same
   * score has to be distinguishable from the first. It is also what a rematch
   * will increment against rather than reset.
   */
  ends: number
}

/**
 * A match, before anything has happened in it.
 *
 * Takes the rules rather than being a constant, because `remaining` is a fact
 * about the mode from the first frame - a HUD that showed `—` for a beat and
 * then `5:00` would be reporting the load rather than the match.
 */
export function kickoff(rules: XpRules): Match {
  return {
    phase: 'playing',
    score: 0,
    elapsed: 0,
    remaining: rules.timeLimit ?? null,
    ending: null,
    ends: 0,
  }
}

export interface MatchStep {
  /** How long this frame was, in seconds. Clamped, like everything else. */
  delta: number
  /** Points scored this frame, summed from the frame's `score` effects. */
  scored: number
  /**
   * Every side's total, as this client last saw it.
   *
   * Empty or absent for a level with no sides, which is most of them, and that
   * is what selects the rule below: with sides, the limit belongs to the
   * *side*, and without them it belongs to the player reading the screen.
   *
   * Handed in every frame rather than accumulated, because it is not a delta -
   * it is the arbiter's own number, and a difference against what we last saw
   * would drift the moment one poll was missed.
   */
  sides?: readonly { side: string; kills: number }[]

  /**
   * A run was completed this frame.
   *
   * Only ends a `parkour` match. A finish line in a deathmatch level is scenery,
   * and a mode system that ended a gunfight because somebody wandered through a
   * gate would be reading the world instead of the rules.
   */
  finished?: boolean
}

/**
 * The match, one frame on.
 *
 * A pure transition, so the arguments - a goal on the whistle, a point after
 * full time, a clock that overshoots its own limit - are settled in a test
 * rather than by playing a match and disagreeing about what happened.
 */
export function stepMatch(match: Match, rules: XpRules, step: MatchStep): Match {
  /**
   * Nothing accrues after full time.
   *
   * Which is the whole value of having a `phase` at all: a target shot after the
   * whistle does not count, a clock that has stopped stays stopped, and a result
   * somebody is looking at does not change under them. Returning the same object
   * also means the component above can compare by identity and stay quiet.
   */
  if (match.phase === 'over') return match

  const score = match.score + step.scored
  let elapsed = match.elapsed + step.delta

  /**
   * The side in front, and by how much.
   *
   * `leader` is what a score limit is compared against in a team game: first
   * side to ten, not first *player* to ten. Comparing this client's own score
   * would end a 9-1 team match the moment one player got their tenth, and end
   * it for everybody.
   */
  const sides = step.sides ?? []
  const leader = sides.reduce((most, side) => Math.max(most, side.kills), 0)
  const drawn = sides.filter((side) => side.kills === leader).length > 1
  const winner = sides.length > 0 && !drawn && leader > 0
    ? sides.find((side) => side.kills === leader)?.side
    : undefined

  /**
   * Why it ended, in the order the endings beat each other.
   *
   * A **finish** first, because arriving is not arguable - somebody is standing
   * past the line. Then the **score**, because a point scored on the whistle is
   * a point: the alternative is telling somebody the clock beat them by a frame
   * they cannot see, which is the class of decision football has spent a century
   * getting angry about. **Time** last, and only when neither of the above
   * happened in the same frame.
   */
  let ending: Ending | null = null
  if (step.finished && rules.preset === 'parkour') ending = 'finish'
  else if (rules.scoreLimit !== undefined && (sides.length > 0 ? leader : score) >= rules.scoreLimit)
    ending = 'score'
  else if (rules.timeLimit !== undefined && elapsed >= rules.timeLimit) ending = 'time'

  /**
   * A match that ended on the clock ended *at* the clock.
   *
   * Without this the final readout says 300.03 on a five-minute match, because
   * the frame that crossed the limit is still a whole frame long. A result with
   * three hundredths of nonsense in it is a result somebody asks about.
   *
   * Deliberately not applied to the other two endings: a match won on points at
   * 4:12 ended at 4:12, and rounding that to anything would be inventing a time.
   */
  if (ending === 'time' && rules.timeLimit !== undefined) elapsed = rules.timeLimit

  return {
    phase: ending === null ? 'playing' : 'over',
    score,
    elapsed,
    remaining: rules.timeLimit === undefined ? null : Math.max(0, rules.timeLimit - elapsed),
    ending,
    // Only on a match that has actually stopped. A leader while the game is
    // still being played is not a winner, and a HUD handed one would say so.
    ...(ending !== null && winner !== undefined ? { winner } : {}),
    ends: ending === null ? match.ends : match.ends + 1,
  }
}

/**
 * What to put on the screen when it stops.
 *
 * Words rather than a code, because the only consumer is a person and the
 * difference between "full time" and "first to twenty" is the difference between
 * running out of time and winning.
 */
export function describeEnding(
  ending: Ending,
  /**
   * The words, defaulted to English.
   *
   * Passed in rather than looked up here: this file is the match machine and
   * has no business importing the app's i18n tree for one record. The HUD is
   * the only caller that draws the answer, and it already knows the language.
   */
  words: Record<Ending, string> = { finish: 'finished', score: 'score limit', time: 'full time' },
): string {
  return words[ending]
}

/**
 * Whether this document is playing a match at all.
 *
 * `freestyle` is a world to be in - §8 is explicit that it has no score and no
 * timer - so a level that says so gets no clock, no counter and no whistle. Not
 * a match with every limit switched off: that would still put a zero on the
 * screen and a "playing" phase in the tree, and a room is not a match with the
 * scoring turned down.
 */
export function isMatch(rules: XpRules): boolean {
  if (rules.preset !== 'freestyle') return true

  /**
   * Unless somebody has put a clock or a target on it.
   *
   * Reported as *"timer didnt start from the wizard"*, and the wizard was
   * innocent: it wrote `timeLimit` onto the match's rules block exactly as its
   * Clock field says it does, `applyMatchRules` merged it into the document
   * server-side, and this line then threw it away because the *preset* was
   * still freestyle.
   *
   * A preset and a limit are different statements. `freestyle` says the
   * document does not describe a mode of its own - which is true of a level
   * that decides its own ending in a `flow`, like the football does - and it
   * has never meant "refuse a clock somebody set". Filling that field in is an
   * unambiguous request for one, and a control that silently does nothing is
   * worse than a control that is not there.
   *
   * The paragraph above still holds for the case it was written about: a
   * freestyle level with **no** limits gets no clock, no counter and no
   * whistle, because a room is not a match with the scoring turned down.
   */
  return rules.timeLimit !== undefined || rules.scoreLimit !== undefined
}
