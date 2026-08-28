import { describe, expect, test } from 'bun:test'
import {
  ALL_EMOTES,
  EMOTE_COLUMNS,
  EMOTE_COUNT,
  EMOTE_DURATION_MS,
  EMOTE_ROWS,
  EMOTE_SHEET,
  EMOTE_SHEET_HEIGHT,
  EMOTE_SHEET_WIDTH,
  EMOTE_TILE,
  emoteBackgroundPosition,
  emoteCell,
  emoteUvOffset,
  isEmote,
  noEmote,
  showEmote,
} from '@/app/xp/_runtime/body/emotes'

/**
 * Copied with the module it tests, per docs/xp/creator.md §1.2: *"Copy the
 * tests with the module. A copied `physics.ts` without `physics.test.ts` is how
 * a copy silently rots."*
 *
 * The blocks below through `emoteUvOffset` are the sibling's, unchanged. What
 * is added at the end is this copy's own: the sheet it points at, and the slot.
 */

/**
 * The sheet's real dimensions, asserted rather than assumed.
 *
 * `public/xp/emotes48.png` is 624x336. If somebody swaps in a different atlas
 * without touching the constants, every emote silently renders as a slice of
 * two neighbours - which reads as a rendering glitch and sends you looking in
 * the shader. This is the test that says "the file changed" instead.
 */
describe('the sheet', () => {
  test('matches the atlas that ships', () => {
    expect(EMOTE_SHEET_WIDTH).toBe(624)
    expect(EMOTE_SHEET_HEIGHT).toBe(336)
    expect(EMOTE_TILE).toBe(48)
    expect(EMOTE_COUNT).toBe(91)
  })

  /**
   * This creator's own copy, which is the point of the copy.
   *
   * `/xo/` is the lounge's address space; pointing at it would make re-cropping
   * one sheet change what the other world draws, which is exactly what
   * docs/xp/creator.md §1.3 separates the packs to prevent.
   */
  test('is addressed in the XP creator’s own space', () => {
    expect(EMOTE_SHEET).toBe('/xp/emotes48.png')
  })
})

describe('isEmote', () => {
  test('accepts every index the sheet actually has', () => {
    for (const id of ALL_EMOTES) expect(isEmote(id)).toBe(true)
  })

  test('refuses what a hostile or older peer might send', () => {
    for (const value of [
      -1,
      EMOTE_COUNT,
      EMOTE_COUNT + 1000,
      1.5,
      NaN,
      Infinity,
      '3',
      null,
      undefined,
      {},
      [],
    ]) {
      expect(isEmote(value)).toBe(false)
    }
  })
})

describe('emoteCell', () => {
  test('reads left to right, then top to bottom', () => {
    expect(emoteCell(0)).toEqual({ column: 0, row: 0 })
    expect(emoteCell(EMOTE_COLUMNS - 1)).toEqual({
      column: EMOTE_COLUMNS - 1,
      row: 0,
    })
    // First tile of the second row, which is the one an off-by-one gets wrong.
    expect(emoteCell(EMOTE_COLUMNS)).toEqual({ column: 0, row: 1 })
    expect(emoteCell(EMOTE_COUNT - 1)).toEqual({
      column: EMOTE_COLUMNS - 1,
      row: EMOTE_ROWS - 1,
    })
  })

  test('never points outside the sheet', () => {
    for (const id of ALL_EMOTES) {
      const { column, row } = emoteCell(id)
      expect(column).toBeGreaterThanOrEqual(0)
      expect(column).toBeLessThan(EMOTE_COLUMNS)
      expect(row).toBeGreaterThanOrEqual(0)
      expect(row).toBeLessThan(EMOTE_ROWS)
    }
  })
})

describe('emoteBackgroundPosition', () => {
  test('slides the sheet under the window, so offsets are negative', () => {
    expect(emoteBackgroundPosition(0)).toBe('0px 0px')
    expect(emoteBackgroundPosition(1)).toBe('-48px 0px')
    expect(emoteBackgroundPosition(EMOTE_COLUMNS)).toBe('0px -48px')
  })

  test('the last tile lands exactly one tile short of the far edge', () => {
    expect(emoteBackgroundPosition(EMOTE_COUNT - 1)).toBe(
      `${-(EMOTE_SHEET_WIDTH - EMOTE_TILE)}px ${-(EMOTE_SHEET_HEIGHT - EMOTE_TILE)}px`,
    )
  })
})

describe('emoteUvOffset', () => {
  /**
   * The flip is the whole point of this block. three.js counts V from the
   * bottom; the sheet counts rows from the top. Get it wrong and the atlas
   * renders mirrored vertically - close enough to plausible that it survives a
   * glance, which is exactly why it is pinned here.
   */
  test('puts the first tile at the top-left of the sheet', () => {
    const { x, y } = emoteUvOffset(0)
    expect(x).toBe(0)
    expect(y).toBeCloseTo(1 - 1 / EMOTE_ROWS, 10)
  })

  test('puts the last tile at the bottom-right, flush with the origin', () => {
    const { x, y } = emoteUvOffset(EMOTE_COUNT - 1)
    expect(x).toBeCloseTo((EMOTE_COLUMNS - 1) / EMOTE_COLUMNS, 10)
    expect(y).toBeCloseTo(0, 10)
  })

  test('every tile sits fully inside the texture', () => {
    for (const id of ALL_EMOTES) {
      const { x, y } = emoteUvOffset(id)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      // Plus one tile's worth of repeat must still land on the sheet.
      expect(x + 1 / EMOTE_COLUMNS).toBeLessThanOrEqual(1 + 1e-9)
      expect(y + 1 / EMOTE_ROWS).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

/**
 * The slot, which the sibling keeps in `presence-core.ts` and this copy keeps
 * beside the sheet - there being no presence module here to put it in.
 */
describe('a face going up', () => {
  test('an empty slot is not showing anything, at any time', () => {
    const slot = noEmote()
    expect(slot.id).toBeNull()
    // The deadline is in the past for every clock, which is what makes "is it
    // still up" answerable without a null check at the reading end.
    expect(slot.until).toBe(0)
  })

  test('is written into the slot rather than replacing it', () => {
    const slot = noEmote()
    const same = slot
    showEmote(slot, 4, 1_000)

    // The renderer holds this object in a ref; returning a new one would leave
    // it reading the old slot forever.
    expect(same).toBe(slot)
    expect(slot.id).toBe(4)
    expect(slot.until).toBe(1_000 + EMOTE_DURATION_MS)
  })

  test('a second face restarts the clock rather than queueing', () => {
    const slot = noEmote()
    showEmote(slot, 4, 1_000)
    showEmote(slot, 9, 2_000)

    expect(slot.id).toBe(9)
    expect(slot.until).toBe(2_000 + EMOTE_DURATION_MS)
  })

  /**
   * The property the renderer's early-out depends on: a deadline is compared
   * against the clock and nothing ticks it down, so a tab that was asleep for a
   * minute comes back to an emote that is simply over.
   */
  test('is over once the clock passes the deadline', () => {
    const slot = noEmote()
    showEmote(slot, 0, 1_000)

    const live = (now: number) => slot.id !== null && now < slot.until
    expect(live(1_000)).toBe(true)
    expect(live(1_000 + EMOTE_DURATION_MS - 1)).toBe(true)
    expect(live(1_000 + EMOTE_DURATION_MS)).toBe(false)
    expect(live(60_000)).toBe(false)
  })
})
