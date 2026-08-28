import { describe, expect, test } from 'bun:test'
import { NEVER_PLAYED, playsById, playsByProject, type PrefixTotals } from '@/domain/xps/plays'
import { formatXpRef, projectRefPrefix } from '@/domain/xps/ref'

const ONE = '550e8400-e29b-41d4-a716-446655440000'
const TWO = '11111111-2222-3333-4444-555555555555'

const totals = (over: Partial<PrefixTotals> & { prefix: string }): PrefixTotals => ({
  plays: 0,
  seconds: 0,
  last_played: null,
  ...over,
})

describe('keying the log back to a world', () => {
  test('a project gets its own figures', () => {
    const found = playsByProject(
      [ONE],
      [totals({ prefix: projectRefPrefix(ONE), plays: 12, seconds: 3600, last_played: 'x' })],
    )

    expect(found.get(ONE)).toEqual({ plays: 12, seconds: 3600, lastPlayed: 'x' })
  })

  test('a world nobody has played is a zero, not a missing key', () => {
    // The whole reason the function left-joins: a caller that has to remember
    // to default is a caller that eventually does not.
    const found = playsByProject([ONE, TWO], [])
    expect(found.get(ONE)).toEqual(NEVER_PLAYED)
    expect(found.get(TWO)).toEqual(NEVER_PLAYED)
  })

  test('every version of a world folds into one figure', () => {
    /**
     * The prefix is what does this, so the test asserts the prefix is really
     * the start of a reference rather than trusting that it is: two versions of
     * one project both begin with it, and another project's does not.
     */
    const prefix = projectRefPrefix(ONE)
    expect(formatXpRef({ kind: 'project', xpId: ONE, version: 1 }).startsWith(prefix)).toBe(true)
    expect(formatXpRef({ kind: 'project', xpId: ONE, version: 240 }).startsWith(prefix)).toBe(true)
    expect(formatXpRef({ kind: 'project', xpId: TWO, version: 1 }).startsWith(prefix)).toBe(false)
  })

  test('a builtin never lands under a project, whatever it is called', () => {
    // `p-` is in the builtin alphabet, so a document on disk could be named
    // something that looks like the start of a reference. The `-v` is what
    // keeps it out; `projectRefPrefix` carries it for exactly this.
    expect(formatXpRef({ kind: 'builtin', id: 'p-550e8400' }).startsWith(projectRefPrefix(ONE)))
      .toBe(false)
  })

  test('a row for something nobody asked about is dropped', () => {
    const found = playsByProject([ONE], [totals({ prefix: projectRefPrefix(TWO), plays: 99 })])
    expect(found.size).toBe(1)
    expect(found.get(ONE)).toEqual(NEVER_PLAYED)
  })

  test('bigints that arrive as strings are still numbers', () => {
    const found = playsByProject(
      [ONE],
      [
        totals({
          prefix: projectRefPrefix(ONE),
          plays: '4200' as unknown as number,
          seconds: '90000' as unknown as number,
        }),
      ],
    )
    expect(found.get(ONE)?.plays).toBe(4200)
    expect(found.get(ONE)?.seconds).toBe(90000)
  })
})

describe('the space-facing fold, keyed by id', () => {
  test('a world gets its figures and an unasked row is dropped', () => {
    const found = playsById(
      [ONE],
      [
        { xp_id: ONE, plays: 3, seconds: 720, last_played: 'x' },
        { xp_id: TWO, plays: 99, seconds: 1, last_played: 'y' },
      ],
    )

    expect(found.size).toBe(1)
    expect(found.get(ONE)).toEqual({ plays: 3, seconds: 720, lastPlayed: 'x' })
  })

  test('a world the caller may not see is a zero, not an absence', () => {
    /**
     * `xp_play_totals_mine` returns no row for a project the caller neither
     * owns nor shares a space with, which is the same shape as a project
     * nobody has played. Both come back as zero on purpose: a page that could
     * tell those apart would be a page that answers "does this exist" for
     * somebody with no standing to ask.
     */
    expect(playsById([ONE], []).get(ONE)).toEqual(NEVER_PLAYED)
  })
})
