'use client'

/**
 * Whether the thing in your hands has anywhere to go.
 *
 * The preview draws a box the size of what you are holding - see `CarryBox` -
 * and until now that box was only ever a *measurement*. It said how much room
 * the bench needs and nothing about whether the room is there, so a bench could
 * be put down inside a wall, inside the floor, or inside another bench, and the
 * only way to find out was to walk into it afterwards.
 *
 * ---------------------------------------------------------------------------
 * Why this is a question about cells and not about boxes
 * ---------------------------------------------------------------------------
 * Everything solid in this world answers `isSolid(x, y, z)`: the blocks by
 * construction, and the things because the renderer rasterises each one into
 * the cells it covers (`cellsIn`). So "does it fit" is the same question asked
 * of the cells the *preview* covers - a set lookup each, over a set that is
 * usually a handful and never more than a few dozen.
 *
 * Testing boxes against boxes would be more exact and worse: it would be a
 * second collision model, disagreeing with the one that actually stops people
 * walking, and a bench that looked like it fitted and then could not be walked
 * past would be the result.
 */

/**
 * How much of a thing may be inside something else before it is "inside".
 *
 * None of it. This is deliberately not a tolerance: a bench that overlaps one
 * cell of a wall is a bench standing in a wall, and the cells were already
 * rounded *inward* when they were measured (see `cellsIn`), so anything that
 * reaches this is a real overlap rather than a rounding one.
 */
export function fits(
  cells: readonly string[],
  /** The blocks, and anything already standing. Both answer `has`. */
  solid: readonly { has: (key: string) => boolean }[],
): boolean {
  for (const key of cells) {
    for (const world of solid) {
      if (world.has(key)) return false
    }
  }
  return true
}

/**
 * The same question, answered for a thing that is *already* standing there.
 *
 * A thing being carried is not in its own way: it was picked up, so the cells
 * it used to fill are its own and it may be put back into them. `except` is
 * what it covered before, and it is why moving a crate one cell to the left
 * does not report the crate as being in the way of itself.
 */
export function fitsBeside(
  cells: readonly string[],
  solid: readonly { has: (key: string) => boolean }[],
  except: ReadonlySet<string>,
): boolean {
  return fits(
    cells.filter((key) => !except.has(key)),
    solid,
  )
}
