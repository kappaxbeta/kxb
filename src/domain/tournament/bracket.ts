/**
 * Single-elimination brackets, as a pure function.
 *
 * Framework-free and side-effect free for the same reason physics.ts and
 * combat.ts are: the interesting cases here are all about awkward numbers -
 * five entrants, one entrant, a power of two - and those are far easier to
 * enumerate in a unit test than to discover in a running tournament.
 *
 * Deliberately *not* seeded by skill. Nothing in this feature ranks anybody,
 * so there is no rating to seed from and pairing is simply the order people
 * signed up in. A friendly bracket that pretends to know who is better would
 * be inventing information it does not have.
 */

/** One slot in a round. Null means a bye - nobody to fight. */
export type Slot = string | null

export interface Match {
  /** The two entrants, or a bye. */
  a: Slot
  b: Slot
  /** Who went through. Null while undecided. */
  winner: Slot
  /** Set once a battle has been created for this match. */
  battleId: string | null
}

export type Round = Match[]

/**
 * How many entrants the first round has room for: the next power of two at or
 * above the field. Everything left over becomes a bye.
 */
export function bracketSize(entrants: number): number {
  if (entrants <= 1) return entrants
  let size = 1
  while (size < entrants) size *= 2
  return size
}

/**
 * Lay out the first round.
 *
 * Byes are spread rather than bunched: entrant 0 plays the last entrant, 1
 * plays the second-to-last, and so on, so the padding lands on separate
 * matches. Bunching them would let two people with byes meet in round two while
 * everybody else had already fought twice.
 */
export function firstRound(entrants: readonly string[]): Round {
  const size = bracketSize(entrants.length)
  if (size < 2) return []

  const padded: Slot[] = [...entrants]
  while (padded.length < size) padded.push(null)

  const matches: Round = []
  for (let i = 0; i < size / 2; i++) {
    const a = padded[i] ?? null
    const b = padded[size - 1 - i] ?? null
    matches.push({
      a,
      b,
      // A match against nobody is already decided. Recorded at layout time so
      // that a bye never needs a battle created for it.
      winner: b === null ? a : a === null ? b : null,
      battleId: null,
    })
  }
  return matches
}

/**
 * The round after this one, or null if this round decides the tournament.
 *
 * Returns null while the round is still being played - a bracket cannot be
 * extended past a match nobody has won yet.
 */
export function nextRound(round: Round): Round | null {
  if (round.length <= 1) return null
  if (round.some((match) => match.winner === null)) return null

  const matches: Round = []
  for (let i = 0; i < round.length; i += 2) {
    const a = round[i]?.winner ?? null
    const b = round[i + 1]?.winner ?? null
    matches.push({
      a,
      b,
      winner: b === null ? a : a === null ? b : null,
      battleId: null,
    })
  }
  return matches
}

/** Whoever won the final, or null while the bracket is unfinished. */
export function champion(rounds: readonly Round[]): Slot {
  const last = rounds.at(-1)
  if (!last || last.length !== 1) return null
  return last[0]?.winner ?? null
}

/**
 * Build every round that can be built from the results so far.
 *
 * Called after each recorded result rather than once at the start, because a
 * round's pairings are not knowable until the previous round is over. Byes make
 * this immediately non-trivial: a first round that is all byes decides several
 * rounds at once, and this keeps unrolling until it reaches one that has to be
 * fought.
 */
export function extend(rounds: readonly Round[]): Round[] {
  const built = rounds.map((round) => round.map((match) => ({ ...match })))

  for (;;) {
    const last = built.at(-1)
    if (!last) break
    const next = nextRound(last)
    if (!next) break
    built.push(next)
  }

  return built
}

/** Matches that still need fighting, as (roundIndex, matchIndex) pairs. */
export function pendingMatches(
  rounds: readonly Round[],
): { round: number; match: number }[] {
  const pending: { round: number; match: number }[] = []
  rounds.forEach((round, roundIndex) => {
    round.forEach((match, matchIndex) => {
      // A slot that is still null is waiting on an earlier round, not ready.
      if (match.winner === null && match.a !== null && match.b !== null) {
        pending.push({ round: roundIndex, match: matchIndex })
      }
    })
  })
  return pending
}
