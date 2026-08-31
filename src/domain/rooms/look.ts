/**
 * What a room looks like in a list: an icon, and a colour.
 *
 * The *vocabulary* only. No SVG and no CSS - those are in the app layer, in
 * `src/app/t/[slug]/room-icons.tsx`, and this file is what both the command
 * schema and the drawing agree on. `src/domain` may not import `@/app/*` (see
 * the lint rule), which is what forces the split, and the split is right
 * anyway: the set of names a room may carry is a fact about the data, and how a
 * `desk` is drawn is a fact about a stylesheet.
 *
 * ---------------------------------------------------------------------------
 * Why a name and not a picture, and a token and not a colour
 * ---------------------------------------------------------------------------
 * The obvious shapes for "pick an icon" and "pick a colour" are an upload and a
 * hex field, and both are worse here than they look:
 *
 *   * An uploaded glyph is an asset to store, serve, cache, moderate and draw
 *     at 16px beside twelve others that were drawn by somebody who knew they
 *     were being drawn at 16px. What this control is for is telling two rooms
 *     apart at a glance, and a small fixed set does that better than an
 *     unbounded one.
 *   * A hex colour is a way to make a room invisible. The rail is dark glass;
 *     `#0b0b12` is a legal colour and an unreadable row. A token resolves to a
 *     shade chosen against that background - see `.room-tint-*` - so every
 *     choice is one somebody can still read.
 *
 * Both are nullable, and null is what every room standing today is: the rail's
 * own icon, in the rail's own colour. Nothing had to be backfilled.
 */

/**
 * The icons a room may wear.
 *
 * Chosen as *kinds of room* rather than as a clipart set: a space names its
 * rooms after what happens in them, and this is a list of the things that
 * happen - plus the handful of things a space names a room after that are not
 * rooms at all (a sun, a moon, a star).
 *
 * Twenty-five, in five groups of five, and the grouping is why a list this long
 * is still scannable: somebody looking for the games room's icon does not read
 * twenty-five unrelated glyphs, they find the row with a ball in it. The picker
 * draws them in this order and the comments below are the rows.
 *
 * Append-only in spirit. A name that leaves this list is a room somewhere
 * drawing nothing, so the reader falls back to the default rather than the
 * picker having to be right forever - see `roomIcon()` below.
 */
export const ROOM_ICONS = [
  // Places to be
  'lounge',
  'cafe',
  'home',
  'hearth',
  'stage',
  // Outside, and above it
  'garden',
  'plant',
  'sun',
  'moon',
  'globe',
  // Things to do
  'desk',
  'board',
  'flask',
  'music',
  'chat',
  // Things to play
  'ball',
  'club',
  'battle',
  'watergun',
  'cards',
  // Everything else
  'trophy',
  'tools',
  'book',
  'rocket',
  'star',
] as const

export type RoomIcon = (typeof ROOM_ICONS)[number]

/** What a room with no icon of its own is drawn as: the rail's own room glyph. */
export const DEFAULT_ROOM_ICON: RoomIcon = 'lounge'

/**
 * The colours a room may wear.
 *
 * Eight, and they are hues rather than meanings - no `danger`, no `success`.
 * A room is not a status, and a palette whose names carried one would be a
 * palette somebody has to translate before they can use it to tell the design
 * room from the games room.
 *
 * The first is the rail's own accent, so "pick a colour" and "leave it alone"
 * do not look like two different products on the same list.
 */
export const ROOM_TINTS = [
  'violet',
  'cyan',
  'emerald',
  'lime',
  'amber',
  'rose',
  'fuchsia',
  'sky',
] as const

export type RoomTint = (typeof ROOM_TINTS)[number]

/**
 * Read an icon name off a row, tolerantly.
 *
 * A value this build does not recognise reads as the default rather than as an
 * error, which is the same rule `toView` applies to every other narrowed column
 * in the rooms read model: a room drawn with the wrong glyph is a room somebody
 * can still walk into, and a room that throws is a rail that does not render.
 */
export function roomIcon(value: string | null | undefined): RoomIcon | null {
  if (!value) return null
  return (ROOM_ICONS as readonly string[]).includes(value)
    ? (value as RoomIcon)
    : DEFAULT_ROOM_ICON
}

/**
 * And a tint, the same way - except that an unknown one reads as *no tint*
 * rather than as a default one.
 *
 * The asymmetry with `roomIcon` is deliberate. Every row needs some glyph, so
 * an unrecognised icon has to become one; nothing needs a colour, so an
 * unrecognised colour becomes the absence of one, which is a row that looks
 * exactly like every room that never picked.
 */
export function roomTint(value: string | null | undefined): RoomTint | null {
  if (!value) return null
  return (ROOM_TINTS as readonly string[]).includes(value) ? (value as RoomTint) : null
}
