import { describe, expect, test } from 'bun:test'
import {
  bracketSize,
  champion,
  extend,
  firstRound,
  nextRound,
  pendingMatches,
  type Round,
} from '@/domain/tournament/bracket'

describe('bracketSize', () => {
  test('a power of two needs no padding', () => {
    expect(bracketSize(8)).toBe(8)
    expect(bracketSize(4)).toBe(4)
    expect(bracketSize(2)).toBe(2)
  })

  test('anything else rounds up to the next power of two', () => {
    expect(bracketSize(3)).toBe(4)
    expect(bracketSize(5)).toBe(8)
    expect(bracketSize(9)).toBe(16)
  })

  test('a field too small to fight is left alone', () => {
    expect(bracketSize(0)).toBe(0)
    expect(bracketSize(1)).toBe(1)
  })
})

describe('the first round', () => {
  test('pairs first against last', () => {
    expect(firstRound(['a', 'b', 'c', 'd'])).toEqual([
      { a: 'a', b: 'd', winner: null, battleId: null },
      { a: 'b', b: 'c', winner: null, battleId: null },
    ])
  })

  /**
   * The reason byes are spread rather than bunched: if 'a' and 'b' both had one,
   * they would meet in round two having fought nobody while everyone else had
   * fought once.
   */
  test('spreads byes across separate matches', () => {
    const round = firstRound(['a', 'b', 'c'])
    expect(round).toHaveLength(2)
    // Three entrants in a bracket of four: exactly one bye.
    expect(round.filter((match) => match.a === null || match.b === null)).toHaveLength(1)
  })

  test('a bye is already won, so no battle is ever needed for it', () => {
    const round = firstRound(['a', 'b', 'c'])
    const bye = round.find((match) => match.b === null || match.a === null)
    expect(bye?.winner).toBe('a')
  })

  test('a field of one has nothing to play', () => {
    expect(firstRound(['a'])).toEqual([])
  })

  test('an empty field has nothing to play', () => {
    expect(firstRound([])).toEqual([])
  })
})

describe('advancing', () => {
  test('a round with an undecided match cannot be extended', () => {
    const round: Round = [
      { a: 'a', b: 'b', winner: 'a', battleId: null },
      { a: 'c', b: 'd', winner: null, battleId: null },
    ]
    expect(nextRound(round)).toBeNull()
  })

  test('winners pair up into the next round', () => {
    const round: Round = [
      { a: 'a', b: 'b', winner: 'a', battleId: null },
      { a: 'c', b: 'd', winner: 'c', battleId: null },
    ]
    expect(nextRound(round)).toEqual([
      { a: 'a', b: 'c', winner: null, battleId: null },
    ])
  })

  test('a final has no round after it', () => {
    const round: Round = [{ a: 'a', b: 'b', winner: 'a', battleId: null }]
    expect(nextRound(round)).toBeNull()
  })
})

describe('extend', () => {
  test('unrolls every round the results allow', () => {
    // Four entrants, first round decided: extend should add the final.
    const rounds = extend([
      [
        { a: 'a', b: 'd', winner: 'a', battleId: null },
        { a: 'b', b: 'c', winner: 'c', battleId: null },
      ],
    ])

    expect(rounds).toHaveLength(2)
    expect(rounds[1]).toEqual([{ a: 'a', b: 'c', winner: null, battleId: null }])
  })

  test('stops at the first round that still has to be fought', () => {
    const rounds = extend([
      [
        { a: 'a', b: 'b', winner: null, battleId: null },
        { a: 'c', b: 'd', winner: null, battleId: null },
      ],
    ])
    expect(rounds).toHaveLength(1)
  })

  /**
   * Two entrants in a bracket of four is two byes, and the whole thing is
   * decided down to the final without anybody fighting - so extend has to keep
   * unrolling rather than advance one round per call.
   */
  test('unrolls through consecutive byes in one pass', () => {
    const rounds = extend([firstRound(['a', 'b'])])
    expect(champion(rounds)).toBeNull()
    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toEqual([{ a: 'a', b: 'b', winner: null, battleId: null }])
  })

  test('does not mutate the rounds it was given', () => {
    const original: Round[] = [[{ a: 'a', b: 'b', winner: 'a', battleId: null }]]
    const copy = structuredClone(original)
    extend(original)
    expect(original).toEqual(copy)
  })
})

describe('champion', () => {
  test('is whoever won the final', () => {
    expect(champion([[{ a: 'a', b: 'b', winner: 'a', battleId: null }]])).toBe('a')
  })

  test('is nobody while the final is unfought', () => {
    expect(champion([[{ a: 'a', b: 'b', winner: null, battleId: null }]])).toBeNull()
  })

  test('is nobody while more than one match remains', () => {
    expect(
      champion([
        [
          { a: 'a', b: 'b', winner: 'a', battleId: null },
          { a: 'c', b: 'd', winner: 'c', battleId: null },
        ],
      ]),
    ).toBeNull()
  })
})

describe('pendingMatches', () => {
  test('lists only matches with both slots filled and no winner', () => {
    const rounds: Round[] = [
      [
        { a: 'a', b: 'b', winner: 'a', battleId: null },
        { a: 'c', b: 'd', winner: null, battleId: null },
      ],
      [{ a: 'a', b: null, winner: null, battleId: null }],
    ]

    // The second round's match is waiting on the first, not ready to fight.
    expect(pendingMatches(rounds)).toEqual([{ round: 0, match: 1 }])
  })

  test('a bye is never pending', () => {
    expect(pendingMatches([firstRound(['a', 'b', 'c'])])).toEqual([
      { round: 0, match: 1 },
    ])
  })
})

describe('a whole five-entrant tournament', () => {
  /**
   * Five is the awkward case worth walking end to end: a bracket of eight,
   * three byes, and a champion who has to fight twice rather than three times.
   */
  test('plays out to one champion', () => {
    const entrants = ['a', 'b', 'c', 'd', 'e']
    let rounds = extend([firstRound(entrants)])

    expect(rounds[0]).toHaveLength(4)
    // Three byes among the four opening matches.
    expect(
      rounds[0]!.filter((match) => match.a === null || match.b === null),
    ).toHaveLength(3)

    // Settle every real match by letting the first slot win.
    for (let guard = 0; guard < 10 && champion(rounds) === null; guard++) {
      const pending = pendingMatches(rounds)
      if (pending.length === 0) break
      for (const { round, match } of pending) {
        rounds[round]![match]!.winner = rounds[round]![match]!.a
      }
      rounds = extend(rounds)
    }

    expect(champion(rounds)).toBe('a')
  })
})
