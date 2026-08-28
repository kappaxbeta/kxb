/**
 * What an XP says it can be used for.
 *
 * The other half of the document's contract with the world. `backend.needs`
 * points *down*: what an XP asks of whatever it is plugged into - an identity,
 * a channel, somewhere to write a score. This points *up*: what the product may
 * do with the XP. Can this be the ground for a match? Can a tournament rank two
 * runs of it? Can somebody wander around it alone?
 *
 * ---------------------------------------------------------------------------
 * A capability is a claim that gets checked
 * ---------------------------------------------------------------------------
 * This is the whole design, and it is why `capabilities` is not a list of tags.
 *
 * A tag is a promise nobody verifies. An XP tagged `football` with no goals in
 * it is picked by the match lobby, loads, starts, and then twenty people stand
 * around a pitch that cannot be scored on - and the failure surfaces at kickoff,
 * in front of everybody, as "the game is broken" rather than as "this level was
 * never finished".
 *
 * So every capability names what the world must actually contain, and
 * `capabilityProblems` checks it at parse time. A document that claims
 * `football` without two goals is refused with a sentence saying so, in the
 * editor, by the author, before anybody is invited.
 *
 * The precedent is already in the repo: `@/domain/lounge/templates` carries
 * `football: boolean` and `race?: boolean` on each starting world, and the
 * battle lobby reads them to decide what a match defaults to. Those two
 * booleans are this idea, hardcoded for three worlds and unchecked. This is the
 * same thing for documents somebody else writes, which is exactly when
 * unchecked stops being good enough.
 *
 * ---------------------------------------------------------------------------
 * Why these four
 * ---------------------------------------------------------------------------
 * They are the flows the product already has or is about to: the battle lobby,
 * the tournament, the lounge you can just be in. A capability is worth adding
 * when there is a flow that would read it - not when a game mode exists. Modes
 * are `rules.preset` (§8); capabilities are about who may *schedule* this XP.
 */

import type { Mark, XpWorld } from './format'

/** What a mark is for. The vocabulary the lounge's goals already use. */
/**
 * What a mark is *for*.
 *
 * Four of these mean something to the runtime: two team goals, a race's start
 * and finish, and where a person arrives. `point` means none of those - it is a
 * named place and nothing else, which is exactly what a board's fields are.
 *
 * It exists because `advance` walks a track of named marks and every kind on
 * this list already had a job. Numbering forty fields as `spawn` would have put
 * players on random squares of the board; as `finish`, a level with no race in
 * it would be full of finish lines. A kind that means nothing is the honest one,
 * and its absence was the reason a board game could not be laid out.
 */
export type MarkKind = 'red' | 'blue' | 'start' | 'finish' | 'spawn' | 'point'

export const CAPABILITIES = ['freeplay', 'match', 'football', 'competition'] as const

export type Capability = (typeof CAPABILITIES)[number]

const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES)

export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value)
}

/** The capabilities a document declares, as a set with no duplicates. */
export type XpCapabilities = readonly Capability[]

/** One line for a picker, so an operator can see what a level is good for. */
export function describeCapability(capability: Capability): string {
  switch (capability) {
    case 'freeplay':
      return 'Can be wandered around with no score and no end'
    case 'match':
      return 'Two sides, a score and an end condition - the battle lobby can set a match here'
    case 'football':
      return 'Has a goal at each end, so a ball game can be scored'
    case 'competition':
      return 'Has a start and a finish, so two runs of it can be ranked'
  }
}

/**
 * What the world has to contain for a claim to hold.
 *
 * Deliberately about *marks* rather than about geometry. Whether a room is fun
 * is not checkable and should not be; whether it has the two goals a ball game
 * needs to be scored is, and that is the class of mistake that ruins an evening
 * rather than merely disappointing one.
 */
function marksOf(world: XpWorld, kind: MarkKind): number {
  return world.marks.filter((mark) => mark.kind === kind).length
}

/**
 * Why a declared capability does not hold, or an empty list if it does.
 *
 * Returns every reason rather than the first, for the same reason `parseXp`
 * collects problems: an author who has forgotten both goals should be told
 * about both goals.
 */
export function capabilityProblems(
  capability: Capability,
  world: XpWorld,
): string[] {
  const problems: string[] = []

  switch (capability) {
    case 'freeplay':
      // Nothing to check. A world you can be in is a world - which is why this
      // is the one capability that is never a lie, and why it is the sensible
      // default for a document that declares none.
      break

    case 'match': {
      /**
       * Two sides need somewhere to start apart from each other. One shared
       * spawn is not a match, it is a scrum: everybody arrives inside everybody
       * else and the first ten seconds are spent untangling.
       */
      const spawns = marksOf(world, 'spawn')
      if (spawns < 2) {
        problems.push(
          `a match needs a spawn for each side; this has ${spawns === 0 ? 'none' : 'one'}`,
        )
      }
      break
    }

    case 'football': {
      if (marksOf(world, 'red') < 1) problems.push('no red goal to score in')
      if (marksOf(world, 'blue') < 1) problems.push('no blue goal to score in')
      break
    }

    case 'competition': {
      if (marksOf(world, 'start') < 1) problems.push('no start, so a run has no beginning')
      if (marksOf(world, 'finish') < 1) {
        problems.push('no finish, so a run never ends and cannot be timed')
      }
      break
    }
  }

  return problems
}

/**
 * Whether the host can schedule this XP into a given flow.
 *
 * The read side of all this, and the reason the checking matters: a lobby
 * filters the list of grounds by what it needs, and a level that claims
 * something it cannot do would otherwise be offered and then fail.
 */
export function supports(capabilities: XpCapabilities, wanted: Capability): boolean {
  return capabilities.includes(wanted)
}

/**
 * The mark a name points at, explicit or implicit.
 *
 * Two ways in, and the second is what makes this worth having in one function
 * rather than at each call site: an explicit `name` on the mark, or a *kind*
 * that appears exactly once in the document. `to: "finish"` in a course with one
 * finish is unambiguous, and making an author name the only finish there is
 * would be ceremony.
 *
 * Ambiguity resolves to nothing rather than to the first match. A level with two
 * spawns and a `to: "spawn"` has asked a question with two answers, and picking
 * one silently is how a level works in testing and sends half the players
 * somewhere else on the night.
 */
export function markByName(marks: readonly Mark[], name: string): Mark | null {
  const named = marks.filter((mark) => mark.name === name)
  if (named.length === 1) return named[0]!
  if (named.length > 1) return null

  const byKind = marks.filter((mark) => mark.kind === name)
  return byKind.length === 1 ? byKind[0]! : null
}

/**
 * The nearest named spot to a point, which is where a thing put down lands.
 *
 * ---------------------------------------------------------------------------
 * Why a drop snaps at all
 * ---------------------------------------------------------------------------
 * A board has fields, and a piece is on one of them or it is being moved. Left
 * exactly where the hand let go, a piece sits a few centimetres off its square
 * and the board slowly stops being readable - and worse, "which field is that
 * piece on" stops having an answer, which is the question every rule about a
 * board asks.
 *
 * It is also what makes a drop *shareable*. A position is three floats that
 * would have to be broadcast and reconciled; a field is a name, so a piece
 * moving is one short fact the table can agree on once - the same trade
 * `WorldShare` already makes by carrying no positions at all.
 *
 * Only `point` marks with names, because those are the fields an author drew.
 * A spawn is where people arrive, not somewhere a piece belongs, and an unnamed
 * mark is one nothing can be said about afterwards.
 *
 * Squared distances, and no limit: every drop lands on a field, because on a
 * board there is nowhere else for it to be.
 */
export function nearestMark(
  marks: readonly Mark[],
  at: { x: number; y: number; z: number },
): Mark | null {
  let best: Mark | null = null
  let closest = Infinity
  for (const mark of marks) {
    if (mark.kind !== 'point' || !mark.name) continue
    const dx = mark.x - at.x
    const dy = mark.y - at.y
    const dz = mark.z - at.z
    const span = dx * dx + dy * dy + dz * dz
    if (span < closest) {
      closest = span
      best = mark
    }
  }
  return best
}
