/**
 * Pointing at a menu that is in the room rather than on the page.
 *
 * ---------------------------------------------------------------------------
 * Why this has to exist at all
 * ---------------------------------------------------------------------------
 * A headset draws what the renderer draws and nothing else. The lounge's chrome
 * - the Creative/Battle switch, the block picker - is ordinary DOM outside the
 * Canvas, so the moment somebody puts a headset on it is simply gone. Reported
 * by the user after testing the room in VR: walking works, building and
 * breaking work, and there is no way to change mode or choose a block, because
 * both controls are on a page nobody in a headset can see.
 *
 * The ray already exists. `<Targeting>` casts one from the pointing hand and
 * everything downstream consumes the `Target` it produces without caring where
 * it came from, which is why breaking a block already works in VR. What is
 * missing is something for that ray to *hit* that is not the world.
 *
 * ---------------------------------------------------------------------------
 * Why the maths is here and not in the component
 * ---------------------------------------------------------------------------
 * Ray-into-plane and plane-into-cell is where the sign errors live, and a sign
 * error here is a menu that highlights the tile to the left of the one you are
 * pointing at - which is not a crash, is perfectly consistent, and is
 * indistinguishable from a tracking problem when you are wearing the thing. It
 * is also the one part that can be checked without a headset.
 *
 * Everything below works in the panel's **own space**: the panel lies in the
 * `z = 0` plane, facing +z, with the origin at its centre. The caller does the
 * one line of three.js that gets a world ray into that space
 * (`panel.worldToLocal`), which keeps quaternions out of here entirely.
 */

/** A point or a direction in the panel's own space. */
export interface Local {
  x: number
  y: number
  z: number
}

/** How the panel is divided up. Metres and counts, not pixels. */
export interface Grid {
  width: number
  height: number
  columns: number
  rows: number
}

/**
 * Where a ray crosses the panel's plane, or null if it never does.
 *
 * Null covers three genuinely different situations that all mean "not pointing
 * at it", and they are worth naming because only the first is obvious: the ray
 * is parallel to the panel, the panel is *behind* the hand, and the crossing is
 * outside the panel's edges. The second is the one that bites - a ray pointing
 * directly away from a panel still meets its infinite plane, at a negative
 * distance, and a hit test that forgets to check the sign lights up a menu
 * behind the wearer's shoulder.
 */
export function pointOn(origin: Local, direction: Local, grid: Grid): { x: number; y: number } | null {
  // Parallel, or as near as makes no difference. A tiny `z` would otherwise
  // divide into an enormous distance and land the hit somewhere absurd.
  if (Math.abs(direction.z) < 1e-6) return null

  const distance = -origin.z / direction.z
  // Behind the hand. See above: the infinite plane is still crossed, backwards.
  if (distance < 0) return null

  const x = origin.x + direction.x * distance
  const y = origin.y + direction.y * distance

  const halfWidth = grid.width / 2
  const halfHeight = grid.height / 2
  if (x < -halfWidth || x > halfWidth || y < -halfHeight || y > halfHeight) return null

  return { x, y }
}

/**
 * Which cell a point on the panel falls in, counting left to right, top to
 * bottom.
 *
 * Reading order, because the grid is drawn in reading order - the alternative
 * is a menu whose second tile is below its first, which nobody expects from
 * something laid out like a page.
 *
 * The `y` flip is the part that is easy to get wrong and impossible to see: in
 * the panel's space +y is *up*, and row 0 is at the *top*. Forgetting it does
 * not break anything visibly - the menu still highlights a real tile, and it is
 * the one mirrored about the middle row.
 */
export function cellFor(point: { x: number; y: number }, grid: Grid): number | null {
  if (grid.columns <= 0 || grid.rows <= 0) return null

  const across = (point.x + grid.width / 2) / grid.width
  const down = 1 - (point.y + grid.height / 2) / grid.height

  const column = Math.floor(across * grid.columns)
  const row = Math.floor(down * grid.rows)

  // The far edge lands exactly on `columns`, which is one past the last cell.
  // Clamped rather than refused: a point on the border is on the panel, and
  // rejecting it would give a one-pixel dead line down the right-hand side.
  const inColumn = Math.min(Math.max(column, 0), grid.columns - 1)
  const inRow = Math.min(Math.max(row, 0), grid.rows - 1)

  return inRow * grid.columns + inColumn
}

/**
 * The whole question, in one call: which cell is this ray pointing at?
 *
 * Returns null for "none of them", which the caller draws as no highlight and
 * treats as nothing to select. Both halves are exported separately as well,
 * because the component wants the *point* too - a highlight that snaps to a
 * cell reads as sluggish next to a cursor that follows the hand.
 */
export function aimedCell(origin: Local, direction: Local, grid: Grid): number | null {
  const point = pointOn(origin, direction, grid)
  return point ? cellFor(point, grid) : null
}

/**
 * Where a cell sits on the panel, in the panel's own space.
 *
 * The inverse of `cellFor`, and it exists so the drawing and the hit test
 * cannot disagree: a component that laid tiles out with its own arithmetic
 * would be a second copy of "where is cell seven", and the first sign of the
 * two drifting is a menu that highlights the wrong tile.
 */
export function cellSpot(cell: number, grid: Grid): { x: number; y: number } {
  const column = cell % grid.columns
  const row = Math.floor(cell / grid.columns)
  const cellWidth = grid.width / grid.columns
  const cellHeight = grid.height / grid.rows
  return {
    x: -grid.width / 2 + (column + 0.5) * cellWidth,
    // Row 0 at the top, matching `cellFor`.
    y: grid.height / 2 - (row + 0.5) * cellHeight,
  }
}
