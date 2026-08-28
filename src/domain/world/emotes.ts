/**
 * The emote sheet, and the one number that travels.
 *
 * `public/xo/emotes48.png` is a 624x336 atlas of 48px tiles - thirteen across,
 * seven down, ninety-one faces. Everything here is derived from those four
 * numbers rather than written out, so re-cropping the sheet is a change to the
 * constants and nothing else.
 *
 * ---------------------------------------------------------------------------
 * Why an index and not a name
 * ---------------------------------------------------------------------------
 * An emote goes on the wire as its position in the sheet. Naming ninety-one
 * faces would mean inventing ninety-one names nobody agrees on - is the second
 * one "smile" or "happy"? - and the names would then be load-bearing: a wire
 * format is a contract, and renaming `smile` to `happy` a month from now would
 * silently stop rendering for anyone on the old tab.
 *
 * The index has the opposite failure mode, and a better one. It is stable as
 * long as the sheet's *layout* is, which is a file nobody edits casually, and a
 * peer on an older build who receives an index past the end of their sheet gets
 * nothing rather than a broken tile - see `isEmote`.
 *
 * The cost is honest: reordering the atlas rewrites what every stored index
 * means.
 *
 * ---------------------------------------------------------------------------
 * The sheet may only be appended to
 * ---------------------------------------------------------------------------
 * That cost used to be free. An emote in the world lives for three seconds and
 * is never written to the log, so the blast radius of a re-crop was whoever was
 * looking right at that moment.
 *
 * The pinboard changed that. A reaction on a notice is a stored index - it is
 * in the event log as `PostReacted`, and in `board_posts_read_model.reactions`
 * as a key - and it is meant to still mean the same face next year. So the
 * atlas *layout* is now a persisted contract, and the rule that keeps it one:
 *
 *   New faces go on the end. A new row leaves every existing `row * 13 + col`
 *   exactly where it was. Never reorder the sheet, and above all never change
 *   EMOTE_COLUMNS - that one silently rewrites the meaning of all ninety-one.
 *
 * Re-cropping in any other way is a data migration over every reaction ever
 * stored, not a change to the constants below.
 */

/** Pixel size of one tile in the atlas. */
export const EMOTE_TILE = 48

/** How the atlas is laid out. */
export const EMOTE_COLUMNS = 13
export const EMOTE_ROWS = 7

/** Where the atlas lives, for both the DOM picker and the 3D bubble. */
export const EMOTE_SHEET = '/xo/emotes48.png'

export const EMOTE_SHEET_WIDTH = EMOTE_COLUMNS * EMOTE_TILE
export const EMOTE_SHEET_HEIGHT = EMOTE_ROWS * EMOTE_TILE

/** How many faces there are. */
export const EMOTE_COUNT = EMOTE_COLUMNS * EMOTE_ROWS

/**
 * One face, as its index into the sheet, counted left to right and top to
 * bottom from zero.
 */
export type EmoteId = number

/**
 * How long a face hangs over somebody's head, in milliseconds.
 *
 * Lives here rather than in the renderer because both ends need it: the sender
 * shows their own immediately and the receiver starts the clock when the packet
 * lands, and the two only agree if they are reading the same number.
 */
export const EMOTE_DURATION_MS = 3000

/**
 * Is this something we can draw?
 *
 * The guard exists for the wire, not for our own callers. A packet is whatever
 * the other end sent - an older build with a shorter sheet, a newer one with a
 * longer, or a hand-crafted frame - and an out-of-range index would otherwise
 * sample past the edge of the texture and draw a stripe of whatever is next to
 * it in memory. Refusing here means an emote we do not understand is an emote
 * nobody sees, which is the correct amount of nothing.
 */
export function isEmote(value: unknown): value is EmoteId {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < EMOTE_COUNT
  )
}

/** Which column and row a face sits in. */
export function emoteCell(id: EmoteId): { column: number; row: number } {
  return { column: id % EMOTE_COLUMNS, row: Math.floor(id / EMOTE_COLUMNS) }
}

/**
 * The CSS `background-position` that shows one face out of the sheet.
 *
 * Negative offsets, because the background is being slid *under* a 48px window
 * rather than the window being moved across it. Paired with a
 * `background-size` of the full sheet, which is what `EMOTE_SHEET_WIDTH` and
 * `EMOTE_SHEET_HEIGHT` are for.
 */
export function emoteBackgroundPosition(id: EmoteId): string {
  const { column, row } = emoteCell(id)
  return `${-column * EMOTE_TILE}px ${-row * EMOTE_TILE}px`
}

/**
 * The texture offset that shows one face, in UV space.
 *
 * three.js puts the origin at the *bottom* left and the sheet counts rows from
 * the top, so the row is flipped here. Getting that wrong is the bug where
 * every emote renders as the one vertically mirrored across the sheet, which
 * looks close enough to right to survive a casual glance.
 */
export function emoteUvOffset(id: EmoteId): { x: number; y: number } {
  const { column, row } = emoteCell(id)
  return {
    x: column / EMOTE_COLUMNS,
    y: 1 - (row + 1) / EMOTE_ROWS,
  }
}

/**
 * Every background property needed to draw one face at an arbitrary size.
 *
 * `emoteBackgroundPosition` above assumes the tile is drawn at its native 48px,
 * which is what the picker and the 3D bubble both want. The landing page draws
 * them smaller, and at several sizes at once, because its peeps are scaled to
 * fake depth. Scaling a sprite sheet means scaling the offset and the sheet by
 * the same factor - do one and not the other and you sample the seam between two
 * faces, which looks like a rendering glitch rather than like the off-by-one it
 * is. Both come from here so they cannot disagree.
 */
export function emoteTileStyle(id: EmoteId, size: number) {
  const { column, row } = emoteCell(id)
  const factor = size / EMOTE_TILE
  return {
    width: `${size}px`,
    height: `${size}px`,
    backgroundImage: `url(${EMOTE_SHEET})`,
    backgroundSize: `${EMOTE_SHEET_WIDTH * factor}px ${EMOTE_SHEET_HEIGHT * factor}px`,
    backgroundPosition: `${-column * size}px ${-row * size}px`,
  }
}

/** Every face, for the picker to lay out. */
export const ALL_EMOTES: EmoteId[] = Array.from(
  { length: EMOTE_COUNT },
  (_, index) => index,
)
