import { describe, expect, test } from 'bun:test'
import { cellsIn, deckCells, ThingSolids } from '@/app/world/lounge/_sim/thing-solids'

/**
 * A box around a thing standing in the middle of cell `(cx, cz)`.
 *
 * The half-cell offsets are the world's, not this test's: a thing is drawn
 * centred in its cell - see `thingTransform` - so a bench 1.2 wide in cell 3
 * really does reach a tenth of a cell into 2 and into 4, and that is the case
 * the threshold exists for.
 */
function around(
  cx: number,
  cz: number,
  { width, height, depth }: { width: number; height: number; depth: number },
  floor = 0,
) {
  return {
    minX: cx + 0.5 - width / 2,
    maxX: cx + 0.5 + width / 2,
    minY: floor,
    maxY: floor + height,
    minZ: cz + 0.5 - depth / 2,
    maxZ: cz + 0.5 + depth / 2,
  }
}

describe('what a measured box claims', () => {
  test('a thing that fits its cell claims one cell', () => {
    expect(cellsIn(around(3, 7, { width: 1, height: 1, depth: 1 }))).toEqual(['3,0,7'])
  })

  /**
   * The complaint this threshold exists for. A bench 1.2 across used to claim
   * its neighbours on both sides for the sake of a tenth of a cell each - two
   * thirds of what stopped you was air.
   */
  test('a slight overhang does not claim the cell next door', () => {
    const keys = cellsIn(around(3, 7, { width: 1.2, height: 1, depth: 1.2 }))
    expect(keys).toEqual(['3,0,7'])
  })

  test('an overhang worth walking into still does', () => {
    const keys = cellsIn(around(3, 7, { width: 2.4, height: 1, depth: 1 }))
    expect(new Set(keys)).toEqual(new Set(['2,0,7', '3,0,7', '4,0,7']))
  })

  /**
   * The special case that keeps fences standing. A panel a tenth of a cell
   * thick can never fill three tenths of one, so asking it to would make every
   * thin wall in the product walk-through.
   */
  test('a panel thinner than the threshold is still a wall', () => {
    const keys = cellsIn(around(3, 7, { width: 1, height: 2, depth: 0.1 }))
    expect(new Set(keys)).toEqual(new Set(['3,0,7', '3,1,7']))
  })

  test('a low thing claims the cell it stands in and not the one above', () => {
    const keys = cellsIn(around(3, 7, { width: 1, height: 1.05, depth: 1 }))
    expect(keys).toEqual(['3,0,7'])
  })

  test('a thing smaller than a cell is still solid somewhere', () => {
    const keys = cellsIn(around(3, 7, { width: 0.2, height: 0.2, depth: 0.2 }))
    expect(keys).toEqual(['3,0,7'])
  })

  test('a mover leaves the cell its surface sits inside for the rider', () => {
    // A deck at 1.3: solid up to 1, and 1.3 is published as a `Deck` instead.
    const keys = deckCells(around(3, 7, { width: 1, height: 1.3, depth: 1 }))
    expect(keys).toEqual(['3,0,7'])
  })
})

/**
 * Two legs and the air between them, which is the whole reason a blueprint may
 * hand over boxes rather than being measured. The renderer rasterises each box
 * on its own and unions the cells - see `footprint` - so this is that union.
 */
describe('a thing blocked out by hand', () => {
  test('an arch is solid at its legs and open in the middle', () => {
    const solids = new ThingSolids()
    const left = cellsIn(around(2, 7, { width: 0.4, height: 3, depth: 0.4 }))
    const right = cellsIn(around(4, 7, { width: 0.4, height: 3, depth: 0.4 }))

    solids.set('arch', [...left, ...right])

    expect(solids.has('2,0,7')).toBe(true)
    expect(solids.has('4,0,7')).toBe(true)
    // The doorway, which the measured bounds of one arch model would have
    // filled from leg to leg.
    expect(solids.has('3,0,7')).toBe(false)
  })

  test('taking it away leaves the cells another thing shares', () => {
    const solids = new ThingSolids()
    solids.set('table', ['3,0,7'])
    solids.set('lamp', ['3,0,7', '3,1,7'])

    solids.drop('lamp')

    expect(solids.has('3,0,7')).toBe(true)
    expect(solids.has('3,1,7')).toBe(false)
  })
})
