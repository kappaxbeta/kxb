import { describe, expect, test } from 'bun:test'
import {
  area,
  type Cell,
  cellsFor,
  cellsForCapped,
  circle,
  disc,
  DRAGGED,
  EXTRUDES,
  extrude,
  FILLABLE,
  line,
  MAX_CELLS_PER_STROKE,
  rect,
  type Tool,
  TOOLS,
} from '@/domain/builder/draw'

const at = (x: number, y: number, z: number): Cell => ({ x, y, z })

/** Cells as sortable strings, so a failure prints coordinates and not objects. */
const ids = (cells: Cell[]) => cells.map((cell) => `${cell.x},${cell.y},${cell.z}`).sort()

/** True when no two cells in the run are more than one step apart. */
function gapless(cells: Cell[]): boolean {
  return cells.every((cell, index) => {
    if (index === 0) return true
    const previous = cells[index - 1]
    return Math.abs(cell.x - previous.x) <= 1 && Math.abs(cell.z - previous.z) <= 1
  })
}

const noDuplicates = (cells: Cell[]) => new Set(ids(cells)).size === cells.length

describe('line', () => {
  test('a drag that never moved is one cell', () => {
    expect(line(at(2, 0, 3), at(2, 0, 3))).toEqual([at(2, 0, 3)])
  })

  test('runs along an axis, both ends included', () => {
    expect(line(at(0, 0, 0), at(3, 0, 0))).toEqual([
      at(0, 0, 0),
      at(1, 0, 0),
      at(2, 0, 0),
      at(3, 0, 0),
    ])
  })

  test('goes backwards as happily as forwards', () => {
    expect(ids(line(at(3, 0, 0), at(0, 0, 0)))).toEqual(ids(line(at(0, 0, 0), at(3, 0, 0))))
  })

  // The whole reason this is Bresenham and not two loops: a wall with a hole in
  // it on every diagonal is the bug you only notice from inside the world.
  test('a diagonal has no gaps', () => {
    const cells = line(at(0, 0, 0), at(9, 0, 4))
    expect(gapless(cells)).toBe(true)
    expect(noDuplicates(cells)).toBe(true)
    expect(cells.at(-1)).toEqual(at(9, 0, 4))
  })

  test('a shallow diagonal is as long as its longer axis', () => {
    expect(line(at(0, 0, 0), at(20, 0, 3))).toHaveLength(21)
  })

  test('takes its level from the start cell', () => {
    expect(line(at(0, 5, 0), at(2, 0, 0)).every((cell) => cell.y === 5)).toBe(true)
  })

  test('fractional cells are rounded, not truncated', () => {
    expect(line(at(0.6, 0, 0.6), at(0.6, 0, 0.6))).toEqual([at(1, 0, 1)])
  })
})

describe('rect and area', () => {
  test('an outline is hollow', () => {
    const cells = rect(at(0, 0, 0), at(3, 0, 2))
    // 4x3 box: 12 cells if solid, 10 around the edge.
    expect(cells).toHaveLength(10)
    expect(ids(cells)).not.toContain('1,0,1')
  })

  test('corners are not doubled up', () => {
    expect(noDuplicates(rect(at(0, 0, 0), at(4, 0, 4)))).toBe(true)
  })

  test('a one-cell-wide outline is just the run', () => {
    expect(ids(rect(at(0, 0, 0), at(0, 0, 4)))).toEqual(ids(area(at(0, 0, 0), at(0, 0, 4))))
  })

  test('area fills the whole span', () => {
    expect(area(at(0, 0, 0), at(3, 0, 2))).toHaveLength(12)
  })

  test('dragging up-left is the same box as dragging down-right', () => {
    expect(ids(area(at(3, 0, 2), at(0, 0, 0)))).toEqual(ids(area(at(0, 0, 0), at(3, 0, 2))))
  })
})

describe('circle', () => {
  test('the ring closes', () => {
    const cells = circle(at(0, 0, 0), at(10, 0, 10))
    expect(noDuplicates(cells)).toBe(true)

    // Every row and every column the shape spans has at least one cell in it -
    // which is the property a row-only scan breaks at the poles.
    for (let z = 0; z <= 10; z += 1) {
      expect(cells.some((cell) => cell.z === z)).toBe(true)
    }
    for (let x = 0; x <= 10; x += 1) {
      expect(cells.some((cell) => cell.x === x)).toBe(true)
    }
  })

  test('the middle is empty', () => {
    expect(ids(circle(at(0, 0, 0), at(10, 0, 10)))).not.toContain('5,0,5')
  })

  test('an ellipse is allowed, not squared off', () => {
    const cells = circle(at(0, 0, 0), at(20, 0, 6))
    const xs = cells.map((cell) => cell.x)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(20)
    // A rectangle of the same span would be 54 cells around its edge; an
    // ellipse is comfortably fewer.
    expect(cells.length).toBeLessThan(54)
  })

  test('a flat drag degrades to a line rather than to nothing', () => {
    expect(circle(at(0, 0, 0), at(4, 0, 0))).toHaveLength(5)
  })

  test('a disc contains its own ring', () => {
    const ring = ids(circle(at(-4, 0, -4), at(4, 0, 4)))
    const filled = ids(disc(at(-4, 0, -4), at(4, 0, 4)))
    for (const cell of ring) expect(filled).toContain(cell)
  })

  test('a disc has no holes in it', () => {
    const cells = disc(at(0, 0, 0), at(8, 0, 8))
    expect(noDuplicates(cells)).toBe(true)
    // Row by row, a filled disc is a contiguous run - a notch at the poles
    // shows up here as a row whose span is wider than its count.
    for (let z = 0; z <= 8; z += 1) {
      const row = cells.filter((cell) => cell.z === z).map((cell) => cell.x)
      if (row.length === 0) continue
      expect(Math.max(...row) - Math.min(...row) + 1).toBe(row.length)
    }
  })
})

describe('extrude', () => {
  test('height one is the footprint itself', () => {
    expect(extrude([at(0, 3, 0)], 1)).toEqual([at(0, 3, 0)])
  })

  test('stacks upward from the level drawn on', () => {
    expect(extrude([at(0, 2, 0)], 3)).toEqual([at(0, 2, 0), at(0, 3, 0), at(0, 4, 0)])
  })

  test('height zero is nothing', () => {
    expect(extrude([at(0, 0, 0)], 0)).toEqual([])
  })
})

describe('cellsFor', () => {
  test('every tool is handled', () => {
    for (const tool of TOOLS) {
      expect(Array.isArray(cellsFor(tool, at(0, 0, 0), at(2, 0, 2), { height: 2 }))).toBe(true)
    }
  })

  test('a wall is its line, four cells tall', () => {
    const cells = cellsFor('wall', at(0, 0, 0), at(5, 0, 0), { height: 4 })
    expect(cells).toHaveLength(24)
    expect(new Set(cells.map((cell) => cell.y))).toEqual(new Set([0, 1, 2, 3]))
  })

  test('the flat tools ignore the height stepper', () => {
    const flat: Tool[] = ['line', 'rect', 'circle']
    for (const tool of flat) {
      const cells = cellsFor(tool, at(0, 0, 0), at(6, 0, 6), { height: 9 })
      expect(cells.every((cell) => cell.y === 0)).toBe(true)
    }
  })

  test('a hollow box is a room and a filled one is a plinth', () => {
    const room = cellsFor('box', at(0, 0, 0), at(4, 0, 4), { height: 3 })
    const plinth = cellsFor('box', at(0, 0, 0), at(4, 0, 4), { height: 3, filled: true })
    expect(room).toHaveLength(16 * 3)
    expect(plinth).toHaveLength(25 * 3)
  })

  test('erase takes the volume the box tool would fill', () => {
    const rubbed = cellsFor('erase', at(0, 0, 0), at(3, 0, 3), { height: 2 })
    const drawn = cellsFor('box', at(0, 0, 0), at(3, 0, 3), { height: 2, filled: true })
    expect(ids(rubbed)).toEqual(ids(drawn))
  })

  test('the brush ignores where the drag started', () => {
    expect(cellsFor('brush', at(9, 0, 9), at(1, 2, 1), { height: 1 })).toEqual([at(1, 2, 1)])
  })

  test('text needs a string, so it draws nothing from a drag', () => {
    expect(cellsFor('text', at(0, 0, 0), at(5, 0, 5))).toEqual([])
  })

  test('a height under one still draws the footprint', () => {
    expect(cellsFor('wall', at(0, 0, 0), at(2, 0, 0), { height: 0 })).toHaveLength(3)
  })
})

describe('the stroke cap', () => {
  test('an ordinary drag is untouched', () => {
    const { cells, clipped } = cellsForCapped('box', at(0, 0, 0), at(10, 0, 10), { height: 2 })
    expect(clipped).toBe(false)
    expect(cells.length).toBeGreaterThan(0)
  })

  test('a drag across the whole grid is clipped rather than drawn', () => {
    const { cells, clipped } = cellsForCapped('erase', at(-40, 0, -40), at(40, 0, 40), {
      height: 24,
    })
    expect(clipped).toBe(true)
    expect(cells).toHaveLength(MAX_CELLS_PER_STROKE)
  })
})

describe('the tool tables', () => {
  test('describe tools that exist', () => {
    for (const set of [EXTRUDES, FILLABLE, DRAGGED]) {
      for (const tool of set) expect(TOOLS).toContain(tool)
    }
  })

  test('a flat tool is never extruded', () => {
    for (const tool of ['line', 'rect', 'circle', 'text'] as Tool[]) {
      expect(EXTRUDES.has(tool)).toBe(false)
    }
  })
})
