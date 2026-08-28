import { describe, expect, test } from 'bun:test'
import { offered } from '@/app/t/[slug]/rooms-rail'
import type { PlayableXp } from '@/domain/xps/playable'

/**
 * Which levels a room's picker floats to the top, and why that is a sort.
 *
 * docs/xp/backlog.md §1c. The rest of the rail needs a browser; this is the one
 * decision in it that does not, which is why it is a function outside the
 * component rather than three lines inside the render.
 */

const level = (over: Partial<PlayableXp> & { ref: string }): PlayableXp => ({
  name: over.ref,
  blurb: null,
  cover: null,
  finish: null,
  hue: null,
  source: 'space',
  draft: true,
  copiedFrom: null,
  preset: 'freestyle',
  sides: null,
  scoreLimit: null,
  timeLimit: null,
  players: { min: 1, max: 8 },
  capabilities: [],
  framed: false,
  ...over,
})

const SOURCE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('the offers a room has', () => {
  test('a copy of what this room plays is marked and comes first', () => {
    const rows = offered(
      [
        level({ ref: 'p-aaaa-v1' }),
        level({ ref: `p-${OTHER}-v1`, copiedFrom: SOURCE, name: 'mine' }),
      ],
      `p-${SOURCE}-v3`,
    )

    expect(rows.map((row) => row.level.name)).toEqual(['mine', 'p-aaaa-v1'])
    expect(rows.map((row) => row.forThisRoom)).toEqual([true, false])
  })

  /**
   * The trap this function exists to avoid.
   *
   * A room names a *version* and a copy is taken from the *project*, so a
   * string comparison marks nothing the moment an author saves a v4 — and the
   * failure is silent: the offer is still in the list, just no longer findable.
   */
  test('the version the room is on does not matter', () => {
    const mine = level({ ref: `p-${OTHER}-v1`, copiedFrom: SOURCE })

    for (const playing of [`p-${SOURCE}-v1`, `p-${SOURCE}-v4`, `p-${SOURCE}-v99`]) {
      expect(offered([mine], playing)[0]?.forThisRoom).toBe(true)
    }
  })

  test('a copy of some other project is not an offer to this room', () => {
    const rows = offered([level({ ref: 'p-bbbb-v1', copiedFrom: OTHER })], `p-${SOURCE}-v1`)
    expect(rows[0]?.forThisRoom).toBe(false)
  })

  test('a project copied from nothing is not an offer either', () => {
    const rows = offered([level({ ref: 'p-cccc-v1' })], `p-${SOURCE}-v1`)
    expect(rows[0]?.forThisRoom).toBe(false)
  })

  /**
   * A builtin has no row, so nothing can have been copied from it — and the
   * honest answer is "no offers" rather than "everything with a null source".
   */
  test('a room playing one of ours has no offers, and the list still lists', () => {
    const rows = offered([level({ ref: 'first-room', source: 'builtin' }), level({ ref: 'p-a-v1' })], 'first-room')
    expect(rows.every((row) => !row.forThisRoom)).toBe(true)
    expect(rows).toHaveLength(2)
  })

  test('a room playing nothing at all is the same', () => {
    const rows = offered([level({ ref: 'p-a-v1', copiedFrom: SOURCE })], null)
    expect(rows[0]?.forThisRoom).toBe(false)
  })

  /**
   * The sort is stable, which is what keeps `listPlayableXps`'s own order —
   * newest first, this space's before the store's — intact inside each group.
   * An unstable sort would reshuffle the whole picker every time it opened.
   */
  test('everything else keeps the order the list arrived in', () => {
    const rows = offered(
      [
        level({ ref: 'a' }),
        level({ ref: 'b' }),
        level({ ref: 'c', copiedFrom: SOURCE }),
        level({ ref: 'd' }),
        level({ ref: 'e', copiedFrom: SOURCE }),
      ],
      `p-${SOURCE}-v1`,
    )

    expect(rows.map((row) => row.level.ref)).toEqual(['c', 'e', 'a', 'b', 'd'])
  })

  test('the list handed in is not reordered under its owner', () => {
    const levels = [level({ ref: 'a' }), level({ ref: 'b', copiedFrom: SOURCE })]
    offered(levels, `p-${SOURCE}-v1`)
    // React state, held by the rail. Sorting it in place would mean the picker
    // reordered itself on a render that only meant to read it.
    expect(levels.map((entry) => entry.ref)).toEqual(['a', 'b'])
  })
})
