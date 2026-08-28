import { describe, expect, test } from 'bun:test'
import { aimedCell, cellFor, cellSpot, pointOn, type Grid } from './vr-menu'

/**
 * Pointing at a menu in the room, checked without a headset.
 *
 * Every failure this guards against is silent. A sign error does not crash and
 * does not look broken - it highlights a real tile, consistently, one row or
 * one column away from the one being pointed at, and the only symptom is
 * somebody in a headset saying the tracking feels off. None of it needs
 * hardware, and hardware is the most expensive place to find it.
 */

/** Three across, two down, and not square - so a transposed axis cannot pass. */
const GRID: Grid = { width: 0.6, height: 0.4, columns: 3, rows: 2 }

/** A hand half a metre in front of the panel, looking back at it. */
const from = (x: number, y: number) => ({ x, y, z: 0.5 })
const forward = { x: 0, y: 0, z: -1 }

describe('where a ray meets the panel', () => {
  test('straight at the middle', () => {
    expect(pointOn(from(0, 0), forward, GRID)).toEqual({ x: 0, y: 0 })
  })

  test('off to one side lands off to that side', () => {
    const hit = pointOn(from(0.1, -0.05), forward, GRID)
    expect(hit?.x).toBeCloseTo(0.1, 6)
    expect(hit?.y).toBeCloseTo(-0.05, 6)
  })

  test('an angled ray lands where the angle takes it', () => {
    // Half a metre out, angled so it travels +0.1 across on the way in.
    const hit = pointOn(from(0, 0), { x: 0.2, y: 0, z: -1 }, GRID)
    expect(hit?.x).toBeCloseTo(0.1, 6)
  })

  test('past the edge is a miss, not a clamp', () => {
    // Beyond the panel is *not pointing at the menu*, and clamping it would make
    // the whole room a giant version of whichever tile is nearest the edge.
    expect(pointOn(from(0.4, 0), forward, GRID)).toBeNull()
    expect(pointOn(from(0, 0.3), forward, GRID)).toBeNull()
  })

  test('a ray pointing away from the panel is a miss', () => {
    /**
     * The one that bites. A ray pointing directly away still meets the panel's
     * *infinite plane* — at a negative distance — so a hit test that forgets the
     * sign lights up a menu behind the wearer's shoulder, which in a headset is
     * a menu that reacts to nothing you can see.
     */
    expect(pointOn(from(0, 0), { x: 0, y: 0, z: 1 }, GRID)).toBeNull()
  })

  test('and one running parallel to it never arrives', () => {
    // A tiny `z` would otherwise divide into an enormous distance and put the
    // hit somewhere absurd rather than nowhere.
    expect(pointOn(from(0, 0), { x: 1, y: 0, z: 0 }, GRID)).toBeNull()
  })
})

describe('which cell a point is in', () => {
  test('reading order: left to right, top to bottom', () => {
    /**
     * Reading order because the grid is *drawn* in reading order. The
     * alternative is a menu whose second tile is below its first, which nobody
     * expects of something laid out like a page.
     */
    expect(cellFor({ x: -0.25, y: 0.15 }, GRID)).toBe(0)
    expect(cellFor({ x: 0, y: 0.15 }, GRID)).toBe(1)
    expect(cellFor({ x: 0.25, y: 0.15 }, GRID)).toBe(2)
    expect(cellFor({ x: -0.25, y: -0.15 }, GRID)).toBe(3)
    expect(cellFor({ x: 0.25, y: -0.15 }, GRID)).toBe(5)
  })

  test('up is +y and row zero is the top', () => {
    /**
     * The flip that is easy to get wrong and impossible to see. Getting it
     * backwards still highlights a real tile — the one mirrored about the middle
     * row — so nothing looks broken and every choice is wrong.
     */
    const top = cellFor({ x: -0.25, y: 0.19 }, GRID)
    const bottom = cellFor({ x: -0.25, y: -0.19 }, GRID)
    expect(top).toBe(0)
    expect(bottom).toBe(3)
  })

  test('the far edges belong to the last cell rather than to nothing', () => {
    // A point exactly on the border is on the panel. Refusing it would leave a
    // dead line down the right-hand side that nobody could explain.
    expect(cellFor({ x: 0.3, y: 0.2 }, GRID)).toBe(2)
    expect(cellFor({ x: 0.3, y: -0.2 }, GRID)).toBe(5)
  })

  test('an empty grid has no cells rather than dividing by zero', () => {
    expect(cellFor({ x: 0, y: 0 }, { ...GRID, columns: 0 })).toBeNull()
    expect(cellFor({ x: 0, y: 0 }, { ...GRID, rows: 0 })).toBeNull()
  })
})

describe('the layout and the hit test agree', () => {
  test('every cell centre lands back in its own cell', () => {
    /**
     * The property that matters more than any single number: the arithmetic
     * that *draws* a tile and the arithmetic that *hits* it are inverses. Two
     * copies of "where is cell seven" is how a menu comes to highlight one tile
     * and select another — consistently, so it reads as a mis-click rather than
     * a bug.
     */
    for (let cell = 0; cell < GRID.columns * GRID.rows; cell++) {
      expect({ cell, back: cellFor(cellSpot(cell, GRID), GRID) }).toEqual({ cell, back: cell })
    }
  })

  test('and a ray aimed at a cell centre picks that cell', () => {
    // End to end, through the same call the component makes.
    for (let cell = 0; cell < GRID.columns * GRID.rows; cell++) {
      const spot = cellSpot(cell, GRID)
      expect({ cell, aimed: aimedCell(from(spot.x, spot.y), forward, GRID) }).toEqual({
        cell,
        aimed: cell,
      })
    }
  })

  test('a ray past the panel picks nothing at all', () => {
    expect(aimedCell(from(1, 1), forward, GRID)).toBeNull()
  })
})

describe('a single-row menu, which is what the mode switch is', () => {
  const ROW: Grid = { width: 0.4, height: 0.1, columns: 2, rows: 1 }

  test('two halves, and the middle belongs to the right one', () => {
    expect(aimedCell(from(-0.1, 0), forward, ROW)).toBe(0)
    expect(aimedCell(from(0.1, 0), forward, ROW)).toBe(1)
    expect(aimedCell(from(0, 0), forward, ROW)).toBe(1)
  })

  test('and the round trip still holds', () => {
    for (let cell = 0; cell < 2; cell++) {
      expect(cellFor(cellSpot(cell, ROW), ROW)).toBe(cell)
    }
  })
})
