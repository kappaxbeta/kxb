import { describe, expect, test } from 'bun:test'
import { CART } from '@/app/components/cartridge/model'
import {
  columnsFor,
  placeOnShelf,
  SHELF_MARGIN,
  shelfExtent,
} from '@/app/components/cartridge/grid'

/**
 * The grid, which is the one part of the shelf a test can reach.
 *
 * The rest of it is a WebGL context and a pointer. This is the arithmetic that
 * decides whether the last row is centred, whether two cartridges ever overlap,
 * and whether turning a phone changes how many there are - all of which are
 * wrong in ways a screenshot at one width would not show.
 */

describe('columnsFor', () => {
  test('never draws one per row, however narrow', () => {
    // A single column is a list, and a list is what the shelf replaced.
    expect(columnsFor(200)).toBeGreaterThanOrEqual(2)
    expect(columnsFor(1)).toBeGreaterThanOrEqual(2)
    expect(columnsFor(0)).toBeGreaterThanOrEqual(2)
  })

  test('stops widening, so a cartridge on a big screen stays an object', () => {
    expect(columnsFor(4000)).toBe(columnsFor(10000))
  })

  test('grows with the container and never shrinks', () => {
    let last = 0
    for (let width = 0; width <= 2000; width += 37) {
      const columns = columnsFor(width)
      expect(columns).toBeGreaterThanOrEqual(last)
      last = columns
    }
  })
})

describe('columnsFor, given a size', () => {
  test('a bigger cartridge means fewer of them', () => {
    // The store's whole reason for the knob: the same container, three
    // cartridges instead of six, because the page is arguing rather than
    // listing.
    expect(columnsFor(1200, 330)).toBeLessThan(columnsFor(1200))
  })

  test('the floor and the ceiling still hold', () => {
    expect(columnsFor(200, 330)).toBeGreaterThanOrEqual(2)
    expect(columnsFor(9000, 40)).toBe(columnsFor(9000, 10))
  })
})

describe('placeOnShelf', () => {
  test('centres the grid on the origin', () => {
    const { columns, rows } = shelfExtent(6, 3)
    const spots = Array.from({ length: 6 }, (_, index) => placeOnShelf(index, columns, rows))

    const middleX = spots.reduce((sum, spot) => sum + spot[0], 0) / spots.length
    const middleY = spots.reduce((sum, spot) => sum + spot[1], 0) / spots.length

    expect(Math.abs(middleX)).toBeLessThan(1e-9)
    expect(Math.abs(middleY)).toBeLessThan(1e-9)
  })

  test('reads left to right and top to bottom', () => {
    const first = placeOnShelf(0, 3, 2)
    const second = placeOnShelf(1, 3, 2)
    const fourth = placeOnShelf(3, 3, 2)

    expect(second[0]).toBeGreaterThan(first[0])
    expect(second[1]).toBe(first[1])
    // The next row is *below*, which in a Y-up scene means a smaller number.
    expect(fourth[1]).toBeLessThan(first[1])
  })

  test('leaves a gap between neighbours rather than butting them together', () => {
    const gap = placeOnShelf(1, 3, 1)[0] - placeOnShelf(0, 3, 1)[0]
    expect(gap).toBeGreaterThan(CART.width)
  })

  test('a short last row starts at the left edge rather than centring itself', () => {
    // Seven into three is two full rows and a single. It belongs under the
    // first column, not under the middle one - a centred orphan reads as a
    // caption for the grid above it.
    const { columns, rows } = shelfExtent(7, 3)
    expect(rows).toBe(3)
    expect(placeOnShelf(6, columns, rows)[0]).toBe(placeOnShelf(0, columns, rows)[0])
  })
})

describe('shelfExtent', () => {
  test('leaves room around the outermost cartridge for it to lean into', () => {
    /*
      The clipping guard. The camera is fitted to this rectangle, so a corner
      cartridge that grows as it lifts has to have somewhere to grow into -
      otherwise the first thing anybody sees when they point at one is its
      corner being sliced off by the edge of the canvas.
    */
    for (const [count, columns] of [
      [5, 5],
      [8, 3],
      [1, 2],
    ] as const) {
      const frame = shelfExtent(count, columns)
      const spots = Array.from({ length: count }, (_, index) =>
        placeOnShelf(index, frame.columns, frame.rows),
      )

      const rightmost = Math.max(...spots.map((spot) => spot[0])) + CART.width / 2
      const highest = Math.max(...spots.map((spot) => spot[1])) + CART.height / 2

      expect(frame.width / 2 - rightmost).toBeGreaterThanOrEqual(SHELF_MARGIN)
      expect(frame.height / 2 - highest).toBeGreaterThanOrEqual(SHELF_MARGIN)
    }
  })

  test('always has a row, so an empty shelf is not a zero-height element', () => {
    expect(shelfExtent(0, 3).rows).toBe(1)
    expect(shelfExtent(0, 3).height).toBeGreaterThan(0)
  })

  test('covers every item', () => {
    for (let count = 1; count <= 40; count += 1) {
      const { columns, rows } = shelfExtent(count, 4)
      expect(columns * rows).toBeGreaterThanOrEqual(count)
    }
  })
})
