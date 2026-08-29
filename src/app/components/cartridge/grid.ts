import { CART } from '@/app/components/cartridge/model'
import { PLATE_HEIGHT } from '@/app/components/cartridge/nameplate'

/**
 * Where the cartridges go, as arithmetic.
 *
 * ---------------------------------------------------------------------------
 * Why not `@react-three/flex`
 * ---------------------------------------------------------------------------
 * It is the obvious reach and it is the wrong one: unmaintained, its last
 * release predates React 18, and it peer-requires React ^18 against this app's
 * 19 - so it arrives as a forced install plus a yoga wasm build, to lay out a
 * **uniform grid**, which is the two multiplications below. If the shelf ever
 * needs mixed cartridge sizes or text wrapping around a caption, this is the
 * paragraph to delete; today it would be a dependency and a wasm payload bought
 * with nothing.
 *
 * In its own module rather than in the component so it can be tested without a
 * WebGL context, which is the other half of the same argument.
 *
 * ---------------------------------------------------------------------------
 * `grid.ts`, and not `layout.ts`
 * ---------------------------------------------------------------------------
 * It was `layout.ts` for about an hour, and CI refused the build: everything
 * under `src/app/` is a route to Next, `layout` is one of its reserved
 * filenames, and a layout with no default export is a type error in the
 * generated route validator. It is a shared component rather than a route and
 * the name has to stay out of that namespace - along with `page`, `template`,
 * `error`, `loading`, `not-found`, `route` and `default`.
 */

/** Column pitch: the shell, plus a gap wide enough to read as a gap. */
export const PITCH_X = CART.width + 0.3

/** Row pitch: the shell, the name under it, and the same gap again. */
export const PITCH_Y = CART.height + PLATE_HEIGHT + 0.05 + 0.34

/**
 * Roughly how wide one cartridge wants to be on screen, in CSS pixels.
 *
 * A default rather than a constant, because how big a cartridge should be is a
 * question about the *surface* and not about cartridges. In a picker inside a
 * wizard it is a thing you are choosing between and wants to be small enough
 * that a dozen fit; in the shop window it is the argument the page is making
 * and wants to be big enough to look at.
 */
const IDEAL_PX = 190

const MIN_COLUMNS = 2
const MAX_COLUMNS = 6

/**
 * Clearance between the outermost cartridges and the edge of the frame.
 *
 * Not decoration - without it the shelf clips. The camera is fitted to the grid
 * exactly, and a cartridge *moves*: it leans toward the pointer and lifts
 * toward the camera, and under a perspective camera lifting makes it bigger. So
 * the one in the corner grows past the edge of the frustum at the exact moment
 * somebody points at it, and the first thing they see is a cartridge with its
 * corner sliced off.
 *
 * Sized off the worst case rather than by eye: the full lift is about 4% of the
 * distance to the camera, and 4% of half a wide grid is a little under a fifth
 * of a cartridge.
 */
export const SHELF_MARGIN = 0.28

/**
 * How many across, for a container this wide.
 *
 * Rounded rather than floored, so a container that is 1.8 cartridges wide draws
 * two slightly small ones instead of one enormous one. The floor at two is what
 * keeps a phone from drawing a single cartridge per row, which is a list.
 */
export function columnsFor(width: number, ideal: number = IDEAL_PX): number {
  if (width <= 0) return MIN_COLUMNS
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.round(width / ideal)))
}

/** Where one cartridge sits, given its place in the list and the grid's shape. */
export function placeOnShelf(
  index: number,
  columns: number,
  rows: number,
): [number, number, number] {
  const column = index % columns
  const row = Math.floor(index / columns)

  // Centred on the origin, because that is where the camera looks and because
  // it makes the frustum fit exact - see the shelf's own note.
  return [(column - (columns - 1) / 2) * PITCH_X, ((rows - 1) / 2 - row) * PITCH_Y, 0]
}

/**
 * The world rectangle the camera is fitted to. Drives the element's aspect.
 *
 * The grid plus `SHELF_MARGIN` on every side, and symmetric - so `placeOnShelf`
 * can go on centring the cartridges on the origin without knowing this exists.
 */
export function shelfExtent(
  count: number,
  columns: number,
): { columns: number; rows: number; width: number; height: number } {
  const rows = Math.max(1, Math.ceil(count / columns))
  return {
    columns,
    rows,
    width: columns * PITCH_X + SHELF_MARGIN * 2,
    height: rows * PITCH_Y + SHELF_MARGIN * 2,
  }
}
