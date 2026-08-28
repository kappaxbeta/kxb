import type { BattleParticipantView, BattleView } from '@/domain/battle/queries'

/**
 * What the roster says about you and everybody else.
 *
 * Four readings that lived inline in `battle-room.tsx`, each a `useMemo` or an
 * expression in the middle of 955 lines of code. None of them were hard; all of
 * them were unreachable, and each carries a rule that reads as arbitrary until
 * you know what it is protecting against.
 *
 * The **reading half** of `domain/battle/aggregate.ts`, which makes the same
 * distinctions when it decides who is left standing. That file writes the
 * events; this one reads the row they produced. Both are rules about a roster,
 * so both are here rather than one of them being in a component.
 *
 * Nothing in this module touches the network, a clock or the DOM: it is a
 * roster in, an answer out, which is what makes the paragraphs below checkable.
 */

/**
 * Everybody fighting alongside you, including you.
 *
 * **You are always in the set**, even standing in a match you are not on the
 * roster of — a guest who followed a link is their own only ally, not an ally
 * of everybody. The alternative is an empty set, which reads downstream as
 * *everybody is an enemy* and paints the whole room as a target.
 *
 * In a mode with no sides, everybody is on their own: `side` is null for every
 * participant, so the loop that adds side-mates never runs and the answer is
 * the set holding only you. That falls out rather than being special-cased,
 * which is why free-for-all needs no branch here.
 */
export function alliesOf(
  participants: readonly BattleParticipantView[],
  userId: string,
): ReadonlySet<string> {
  const set = new Set<string>([userId])

  const mine = participants.find((p) => p.userId === userId)?.side
  if (mine) {
    for (const p of participants) {
      if (p.side === mine) set.add(p.userId)
    }
  }

  return set
}

/**
 * Which of the two football sides somebody is on, for spotting an own goal.
 *
 * Only `red` and `blue`. A spectator, somebody not on the roster, or a player
 * whose mode uses sides for something else all come back undefined — which is
 * how a stray touch from somebody who is not playing stays out of the scoring
 * rather than being credited to whichever side the code guessed.
 *
 * Deliberately narrower than the aggregate's own `sideOf`, which answers for
 * every mode because it is deciding who is left standing. This one is asked
 * only about a ball.
 */
export function footballSide(
  participants: readonly BattleParticipantView[],
  userId: string,
): 'red' | 'blue' | undefined {
  const side = participants.find((p) => p.userId === userId)?.side
  return side === 'red' || side === 'blue' ? side : undefined
}

/**
 * Did we win?
 *
 * Two shapes of answer, because the modes draw sides differently: a
 * free-for-all names a *person*, a team match names a *side*. Reading only one
 * of the two is how a winning team is shown a losing screen — the id matches
 * nobody's user id, so the answer is silently no.
 *
 * `mySide` is passed rather than looked up so that a caller who already has the
 * participant does not walk the roster twice, and so this stays answerable for
 * somebody who is not on it: a spectator has no side, and a spectator has not
 * won.
 */
export function wonBy(
  winner: BattleView['winner'],
  userId: string,
  mySide: string | null | undefined,
): boolean {
  if (winner === null) return false
  return winner.type === 'player' ? winner.id === userId : mySide === winner.id
}

/**
 * Everybody who is home, in the order they got there.
 *
 * **Sorted by place rather than trusted in roster order**, which is by when
 * people joined. The two have nothing to do with each other, and a podium
 * listed in join order is a podium in the wrong order — which looks like a
 * scoring bug rather than a sorting one, because the names are all correct.
 *
 * A null place is a did-not-finish once the race is over, so it is left out
 * entirely rather than sorted to the end: this is the list of people who
 * finished, and somebody still running is not on it.
 */
export function homeInOrder(
  participants: readonly BattleParticipantView[],
): readonly BattleParticipantView[] {
  return participants
    .filter((p) => p.place !== null)
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0))
}
