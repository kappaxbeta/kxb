import { describe, expect, test } from 'bun:test'

import { DEVICES, slotRects } from '@/domain/banners/devices'
import type { DeviceKey } from '@/domain/banners/spec'

/* Every canvas, so a size added for a new App Store slot is covered the moment
 * it exists rather than whenever somebody remembers to extend a list. */
const ALL = Object.keys(DEVICES) as DeviceKey[]

/**
 * The slot arithmetic, which is the one piece of this that can be wrong in a
 * way nobody sees until the listing is live.
 *
 * The numbers these return are printed on the page as "paste your capture at
 * x, y" *and* used to draw the frame somebody pastes into. If the two ever
 * disagree the picture looks fine and the instructions are a lie, so what is
 * worth pinning down is that the rectangles stay inside the area they were
 * given and never overlap each other.
 */
describe('slotRects', () => {
  test('one slot is the whole area', () => {
    for (const device of ALL) {
      const [only] = slotRects(device, 1)
      expect(only).toMatchObject(DEVICES[device].slot)
      expect(only.label).toBeNull()
    }
  })

  test('a label is carried through to the rectangle it belongs to', () => {
    const rects = slotRects('iphone69', 3, ['XO STUDIO', 'XP EDITOR', 'P5 SKETCH'])
    expect(rects.map((r) => r.label)).toEqual(['XO STUDIO', 'XP EDITOR', 'P5 SKETCH'])
  })

  test('columns stand side by side inside the area and never overlap', () => {
    for (const device of ALL) {
      const area = DEVICES[device].slot
      for (const count of [2, 3]) {
        const rects = slotRects(device, count, [], 'columns')
        expect(rects).toHaveLength(count)

        for (const rect of rects) {
          // Room above every column for its caption, and no column reaching
          // past the bottom of the area.
          expect(rect.y).toBeGreaterThanOrEqual(area.y + DEVICES[device].slotLabelH)
          expect(rect.y + rect.h).toBeLessThanOrEqual(area.y + area.h)
          expect(rect.x).toBeGreaterThanOrEqual(area.x)
          expect(rect.x + rect.w).toBeLessThanOrEqual(area.x + area.w)
        }
        for (let i = 1; i < count; i++) {
          expect(rects[i].x).toBeGreaterThanOrEqual(rects[i - 1].x + rects[i - 1].w)
        }
        // Columns are portrait, which is the whole reason to choose them.
        expect(rects[0].h).toBeGreaterThan(rects[0].w)
      }
    }
  })

  test('stacked slots stay inside the area and never overlap', () => {
    for (const device of ALL) {
      const area = DEVICES[device].slot
      for (const count of [2, 3]) {
        const rects = slotRects(device, count)
        expect(rects).toHaveLength(count)

        // Every strip leaves room above itself for its own caption.
        expect(rects[0].y).toBeGreaterThanOrEqual(area.y + DEVICES[device].slotLabelH)
        // And the last one ends inside the area it was given.
        const last = rects[count - 1]
        expect(last.y + last.h).toBeLessThanOrEqual(area.y + area.h)

        for (let i = 1; i < count; i++) {
          const gap = rects[i].y - (rects[i - 1].y + rects[i - 1].h)
          // A gap wide enough for the next caption, so a label never lands on
          // the frame above it.
          expect(gap).toBeGreaterThanOrEqual(DEVICES[device].slotLabelH)
        }
      }
    }
  })

  test('stacked slots are centred on the canvas', () => {
    for (const device of ALL) {
      const d = DEVICES[device]
      for (const rect of slotRects(device, 3)) {
        expect(rect.x + rect.w / 2).toBeCloseTo(d.w / 2, 0)
        expect(rect.w).toBeLessThanOrEqual(d.w - d.padX)
      }
    }
  })

  test('every canvas is a size App Store Connect accepts', () => {
    // The store refuses anything else, and the refusal names four numbers
    // without saying which slot it meant.
    const ACCEPTED = new Set([
      '1290x2796', '1284x2778', '1242x2688', '2064x2752', '2048x2732',
    ])
    for (const device of ALL) {
      const d = DEVICES[device]
      expect(ACCEPTED.has(`${d.w}x${d.h}`)).toBe(true)
    }
  })

  test('a scaled canvas keeps everything on it', () => {
    for (const device of ALL) {
      const d = DEVICES[device]
      // Rounding a scaled layout must not push the bottom row off the canvas
      // or the slot through the copy underneath it.
      expect(d.slot.x + d.slot.w).toBeLessThanOrEqual(d.w)
      expect(d.slot.y + d.slot.h).toBeLessThan(d.titleTop)
      expect(d.bodyTop + d.bodyH).toBeLessThanOrEqual(d.bandY)
      expect(d.bandY + d.bandH).toBeLessThanOrEqual(d.h)
      expect(d.headlineTop).toBeLessThan(d.headReserve)
      expect(d.headReserve).toBeLessThanOrEqual(d.charY + d.charH)
    }
  })

  test('a count outside one to three is clamped rather than trusted', () => {
    expect(slotRects('iphone69', 0)).toHaveLength(1)
    expect(slotRects('iphone69', 9)).toHaveLength(3)
  })
})
