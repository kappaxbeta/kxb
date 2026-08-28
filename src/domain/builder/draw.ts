/**
 * The drawing tools, as arithmetic.
 *
 * Every tool is the same shape: two cells the mouse dragged between, a few
 * numbers off the toolbar, and a list of cells out. No three.js, no React, no
 * document - which is what lets the interesting part be tested rather than
 * eyeballed, and the interesting part is entirely "does a diagonal wall have
 * gaps in it".
 *
 * ---------------------------------------------------------------------------
 * Why the tools are cells and not placements
 * ---------------------------------------------------------------------------
 * A placement carries a model, a rotation and a scale; a tool has nothing to
 * say about any of those - a circle is a circle whatever you are drawing it
 * out of. Keeping the two apart means adding a tool costs one pure function
 * and adding a model costs nothing, instead of every tool needing to know how
 * the document is shaped.
 *
 * ---------------------------------------------------------------------------
 * Why everything goes through `line`
 * ---------------------------------------------------------------------------
 * Bresenham on a grid gives a run with no diagonal gaps, which matters because
 * a wall you can see through is not a wall. Rectangles are four of them,
 * circles are a midpoint walk, and all of them extrude upward the same way. One
 * place to get the stepping right.
 */

/** A cell on the lattice. `y` is the floor level; 0 is the ground plane. */
export interface Cell {
  x: number
  y: number
  z: number
}

/**
 * Nine tools, and the two axes they are laid out on.
 *
 * Flat or extruded is one axis - `line`/`wall`, `rect`/`box`, `circle`/
 * `cylinder` are the same footprint with and without a height - and outline or
 * solid is the other, which is the `filled` flag rather than six more tools.
 * Making height a flag too was the other option and it is worse: the height
 * stepper is the control you leave set while drawing twenty walls, so the flat
 * tools would spend their lives fighting a number meant for the tall ones.
 */
export const TOOLS = [
  'brush',
  'line',
  'wall',
  'rect',
  'box',
  'circle',
  'cylinder',
  'text',
  'erase',
] as const

export type Tool = (typeof TOOLS)[number]

/** Whether a tool draws upward from the level it is on. */
export const EXTRUDES: ReadonlySet<Tool> = new Set<Tool>([
  'brush',
  'wall',
  'box',
  'cylinder',
  'erase',
])

/** Whether a tool's outline can be filled in. */
export const FILLABLE: ReadonlySet<Tool> = new Set<Tool>(['rect', 'box', 'circle', 'cylinder'])

/** Whether a tool is drawn by dragging between two cells, rather than by one click. */
export const DRAGGED: ReadonlySet<Tool> = new Set<Tool>([
  'line',
  'wall',
  'rect',
  'box',
  'circle',
  'cylinder',
  'erase',
])

/** What a tool needs beyond the two dragged corners. */
export interface DrawOptions {
  /** How many cells tall, for the tools that extrude. One is flat. */
  height?: number
  /**
   * Whether a shape's inside is filled at the level it is drawn on.
   *
   * Separate from `height`, and both are real: a hollow box four tall is a
   * room, a filled box four tall is a plinth, and a hollow box one tall is a
   * rectangle you can walk into.
   */
  filled?: boolean
}

const key = (cell: Cell) => `${cell.x},${cell.y},${cell.z}`

/**
 * Drop repeats, keeping the first of each.
 *
 * Rectangles double up at all four corners and a thick circle doubles up along
 * every axis, and a duplicate cell is a second model in the same hole - which
 * on a transparent block reads as a colour change and on an opaque one reads as
 * nothing at all until you delete one and the other is still there.
 */
function unique(cells: Cell[]): Cell[] {
  const seen = new Set<string>()
  const out: Cell[] = []
  for (const cell of cells) {
    const id = key(cell)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(cell)
  }
  return out
}

/**
 * Stack a flat footprint upward.
 *
 * Height counts cells, not offsets, so 1 is the footprint itself and 0 is
 * nothing - which is what the toolbar's minimum enforces, but a shot at a
 * pasted document is cheap.
 */
export function extrude(footprint: Cell[], height: number): Cell[] {
  const levels = Math.max(0, Math.floor(height))
  const out: Cell[] = []
  for (let level = 0; level < levels; level += 1) {
    for (const cell of footprint) out.push({ x: cell.x, y: cell.y + level, z: cell.z })
  }
  return out
}

/**
 * A gapless run between two cells, Bresenham in the xz plane.
 *
 * Both ends inclusive: a drag that starts and stops on the same cell is one
 * cell, which is the same thing the brush does, and a tool that quietly does
 * nothing at zero length is a tool people think is broken.
 */
export function line(from: Cell, to: Cell): Cell[] {
  const x0 = Math.round(from.x)
  const z0 = Math.round(from.z)
  const x1 = Math.round(to.x)
  const z1 = Math.round(to.z)
  const y = Math.round(from.y)

  const dx = Math.abs(x1 - x0)
  const dz = Math.abs(z1 - z0)
  const stepX = x0 < x1 ? 1 : -1
  const stepZ = z0 < z1 ? 1 : -1

  let error = dx - dz
  let x = x0
  let z = z0
  const out: Cell[] = []

  // Bounded rather than `while (true)`: this runs on whatever two cells a
  // pasted document claims were dragged, and an unbounded walk over a bad pair
  // is a hung tab. The cap is the longest run the grid allows plus slack.
  for (let guard = 0; guard <= dx + dz + 1; guard += 1) {
    out.push({ x, y, z })
    if (x === x1 && z === z1) break
    const doubled = error * 2
    if (doubled > -dz) {
      error -= dz
      x += stepX
    }
    if (doubled < dx) {
      error += dx
      z += stepZ
    }
  }

  return out
}

/** The four sides of the box the drag spans. */
export function rect(from: Cell, to: Cell): Cell[] {
  const x0 = Math.min(Math.round(from.x), Math.round(to.x))
  const x1 = Math.max(Math.round(from.x), Math.round(to.x))
  const z0 = Math.min(Math.round(from.z), Math.round(to.z))
  const z1 = Math.max(Math.round(from.z), Math.round(to.z))
  const y = Math.round(from.y)

  const out: Cell[] = []
  for (let x = x0; x <= x1; x += 1) {
    out.push({ x, y, z: z0 })
    out.push({ x, y, z: z1 })
  }
  for (let z = z0; z <= z1; z += 1) {
    out.push({ x: x0, y, z })
    out.push({ x: x1, y, z })
  }
  return unique(out)
}

/** Every cell in the box the drag spans. */
export function area(from: Cell, to: Cell): Cell[] {
  const x0 = Math.min(Math.round(from.x), Math.round(to.x))
  const x1 = Math.max(Math.round(from.x), Math.round(to.x))
  const z0 = Math.min(Math.round(from.z), Math.round(to.z))
  const z1 = Math.max(Math.round(from.z), Math.round(to.z))
  const y = Math.round(from.y)

  const out: Cell[] = []
  for (let x = x0; x <= x1; x += 1) {
    for (let z = z0; z <= z1; z += 1) out.push({ x, y, z })
  }
  return out
}

/**
 * An ellipse inscribed in the box the drag spans, as a ring one cell thick.
 *
 * Drawn by scanning rows rather than by walking the midpoint algorithm around
 * eight octants, and the reason is that this has to handle *ellipses* - a drag
 * is rarely square, and the octant trick only closes for a circle. Per row, the
 * two x where the ellipse crosses it; per column, the two z. Together they
 * close the ring at the poles, where a row-only scan leaves the flat top and
 * bottom of the shape as two single cells with a gap either side.
 */
export function circle(from: Cell, to: Cell): Cell[] {
  const x0 = Math.min(Math.round(from.x), Math.round(to.x))
  const x1 = Math.max(Math.round(from.x), Math.round(to.x))
  const z0 = Math.min(Math.round(from.z), Math.round(to.z))
  const z1 = Math.max(Math.round(from.z), Math.round(to.z))
  const y = Math.round(from.y)

  // Centres, which land on a half-cell for an even span. That is correct and
  // deliberate: a four-wide circle is symmetric about the seam between its two
  // middle columns, not about either of them.
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const rx = (x1 - x0) / 2
  const rz = (z1 - z0) / 2

  // A degenerate drag is a line, which is a better answer than nothing.
  if (rx === 0 || rz === 0) return area(from, to)

  const out: Cell[] = []

  for (let z = z0; z <= z1; z += 1) {
    const t = (z - cz) / rz
    const inside = 1 - t * t
    if (inside < 0) continue
    const spread = rx * Math.sqrt(inside)
    out.push({ x: Math.round(cx - spread), y, z })
    out.push({ x: Math.round(cx + spread), y, z })
  }

  for (let x = x0; x <= x1; x += 1) {
    const t = (x - cx) / rx
    const inside = 1 - t * t
    if (inside < 0) continue
    const spread = rz * Math.sqrt(inside)
    out.push({ x, y, z: Math.round(cz - spread) })
    out.push({ x, y, z: Math.round(cz + spread) })
  }

  return unique(out)
}

/** The ellipse above, filled in. */
export function disc(from: Cell, to: Cell): Cell[] {
  const x0 = Math.min(Math.round(from.x), Math.round(to.x))
  const x1 = Math.max(Math.round(from.x), Math.round(to.x))
  const z0 = Math.min(Math.round(from.z), Math.round(to.z))
  const z1 = Math.max(Math.round(from.z), Math.round(to.z))
  const y = Math.round(from.y)

  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const rx = (x1 - x0) / 2
  const rz = (z1 - z0) / 2

  if (rx === 0 || rz === 0) return area(from, to)

  const out: Cell[] = []
  for (let x = x0; x <= x1; x += 1) {
    for (let z = z0; z <= z1; z += 1) {
      const dx = (x - cx) / rx
      const dz = (z - cz) / rz
      // The half-cell of slack is what keeps the filled disc's silhouette the
      // same as the ring's - without it the outline sits a cell proud of the
      // fill on the diagonals, which is glaring when you draw one on the other.
      if (dx * dx + dz * dz <= 1 + 1e-9) out.push({ x, y, z })
    }
  }

  // The ring is unioned in rather than trusted to fall out of the scan: at the
  // poles the ellipse crosses a row between two cells and neither is inside it,
  // which leaves a filled disc with four notches in it.
  return unique([...out, ...circle(from, to)])
}

/**
 * A tool's cells, from a drag and the toolbar.
 *
 * The one entry point the editor calls, so "which tool does what" is a table
 * here rather than a switch in a component.
 */
export function cellsFor(tool: Tool, from: Cell, to: Cell, options: DrawOptions = {}): Cell[] {
  const height = Math.max(1, Math.floor(options.height ?? 1))
  const filled = options.filled ?? false

  switch (tool) {
    case 'brush':
      return extrude([{ x: Math.round(to.x), y: Math.round(to.y), z: Math.round(to.z) }], height)

    // A wall is a line with a height, and it is its own tool rather than a
    // checkbox on `line` because it is the one people reach for constantly -
    // "draw me a room" is four drags and no dialog.
    case 'line':
      return line(from, to)
    case 'wall':
      return extrude(line(from, to), height)

    case 'rect':
      return filled ? area(from, to) : rect(from, to)
    case 'box':
      return extrude(filled ? area(from, to) : rect(from, to), height)

    case 'circle':
      return filled ? disc(from, to) : circle(from, to)
    case 'cylinder':
      return extrude(filled ? disc(from, to) : circle(from, to), height)

    // Erasing takes a volume, and the volume is what the box tool would fill -
    // so the same drag rubs out exactly what it would have drawn.
    case 'erase':
      return extrude(area(from, to), height)

    // Not a drag. See `stampText` in ./glyphs - it needs a string, and giving
    // it a fake signature to fit here would mean every caller passing an
    // argument the other eight tools ignore.
    case 'text':
      return []
  }
}

/**
 * The cells a tool would touch, capped.
 *
 * A drag across the whole grid at height 24 is tens of thousands of models, and
 * the browser finds that out by locking up. The cap is applied here rather than
 * in the editor so that every path into a tool - drag, paste, keyboard repeat -
 * gets it.
 */
export const MAX_CELLS_PER_STROKE = 6000

export function cellsForCapped(
  tool: Tool,
  from: Cell,
  to: Cell,
  options: DrawOptions = {},
): { cells: Cell[]; clipped: boolean } {
  const cells = cellsFor(tool, from, to, options)
  if (cells.length <= MAX_CELLS_PER_STROKE) return { cells, clipped: false }
  return { cells: cells.slice(0, MAX_CELLS_PER_STROKE), clipped: true }
}
