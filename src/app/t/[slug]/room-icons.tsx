import { DEFAULT_ROOM_ICON, type RoomIcon, type RoomTint } from '@/domain/rooms/look'

/**
 * The twenty-five faces a room can wear.
 *
 * A second file beside `rail-icons.tsx` rather than twenty-five more entries in
 * it, and the split is the one the two sets already are: those are the app's
 * *navigation* - one glyph per surface, drawn once each, and adding one means
 * adding a page. These are a *palette* somebody picks from, they are all
 * interchangeable, and the list is expected to grow whenever a space wants a
 * room this one cannot describe.
 *
 * Same hand, same size, same weight - 16x16, stroked at 1.4, inheriting
 * `currentColor`. That is not a coincidence to be maintained by hand: the
 * attributes come from `ICON` below, which is the same block `rail-icons.tsx`
 * opens with, because a picked icon sits in the same column as the lounge's and
 * a row where one glyph is a hair heavier than the one above it is exactly the
 * sort of thing nobody names and everybody sees.
 *
 * `currentColor` is also how the tint works. Nothing here knows a colour: the
 * row sets one with `.room-tint-*` (globals.css) and the drawing follows.
 */

/** Shared attributes: the whole set is one weight at one size. */
const ICON = {
  viewBox: '0 0 16 16',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/**
 * One room's glyph.
 *
 * `null` is a room that never picked, and it gets the default rather than
 * nothing - a blank slot in a column of icons reads as a row that failed to
 * load. Same fallback an unrecognised name gets, which `roomIcon()` has already
 * applied by the time a name reaches here.
 */
export function RoomGlyph({ name }: { name: RoomIcon | null }) {
  return ROOM_GLYPHS[name ?? DEFAULT_ROOM_ICON]
}

/**
 * The class that colours a row's icon, or nothing.
 *
 * A class rather than an inline `style`, because the shades are chosen against
 * the rail's dark glass and belong beside it - see `.room-tint-*` in
 * globals.css. An inline colour would be the one place in the app where a
 * palette value is written in a component.
 */
export function tintClass(tint: RoomTint | null): string {
  return tint ? `room-tint-${tint}` : ''
}

const ROOM_GLYPHS: Record<RoomIcon, React.ReactElement> = {
  // --- Places to be --------------------------------------------------------

  /** A couch, seen head on. The same drawing the rail's own lounge row uses. */
  lounge: (
    <svg {...ICON}>
      <path d="M3 7.2V5.4A1.4 1.4 0 0 1 4.4 4h7.2A1.4 1.4 0 0 1 13 5.4v1.8" />
      <path d="M2.2 7.2h11.6a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2.2a1 1 0 0 1-1-1V8.2a1 1 0 0 1 1-1Z" />
      <path d="M3.4 12v1.4M12.6 12v1.4M8 7.2V12" />
    </svg>
  ),

  /** A cup with a handle and steam. */
  cafe: (
    <svg {...ICON}>
      <path d="M2.5 5.5h8.5V10a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10V5.5Z" />
      <path d="M11 6.5h1.3a1.9 1.9 0 1 1 0 3.8H11" />
      <path d="M5.2 3.4c.6-.6 0-1 .5-1.6M8 3.4c.6-.6 0-1 .5-1.6" />
    </svg>
  ),

  /** A house with a door. */
  home: (
    <svg {...ICON}>
      <path d="M2.2 6.8 8 2.2l5.8 4.6V13a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1V6.8Z" />
      <path d="M6.4 14V9.6h3.2V14" />
    </svg>
  ),

  /**
   * A fireplace: the arch, the mantel, one flame.
   *
   * Not a bonfire. The room this is for is the one a space keeps for sitting
   * around in, and an open fire in a frame says "indoors, and warm" where three
   * bare flames say "outdoors, and possibly on purpose".
   */
  hearth: (
    <svg {...ICON}>
      <path d="M1.6 4.2h12.8" />
      <path d="M2.8 4.2V13a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1V4.2" />
      <path d="M8 12.2c1.5 0 2.4-1 2.4-2.3 0-1.7-1.7-2-1.5-3.6-1 .5-1.6 1.3-1.6 2.2-.5-.2-.8-.7-.8-1.3-.8.7-1 1.7-1 2.5 0 1.4 1 2.5 2.5 2.5Z" />
    </svg>
  ),

  /** A stage: the boards, the curtain, and the light on them. */
  stage: (
    <svg {...ICON}>
      <path d="M1.6 11.4h12.8" />
      <path d="M3 11.4V14M13 11.4V14" />
      <path d="M8 1.8v2.4" />
      <path d="m4.6 11.4 3-6.4h.8l3 6.4" />
    </svg>
  ),

  // --- Outside, and above it -----------------------------------------------

  /** A sprig. The same one the rail's outdoor place wears. */
  garden: (
    <svg {...ICON}>
      <path d="M8 14V6.4" />
      <path d="M8 8.2C5.6 8.2 4 6.8 4 4.4c2.4 0 4 1.4 4 3.8Z" />
      <path d="M8 6.6c0-2.4 1.6-3.8 4-3.8 0 2.4-1.6 3.8-4 3.8Z" />
    </svg>
  ),

  /**
   * A plant in a pot, which is a different room from a garden.
   *
   * The pot is the whole distinction and is why this is worth having beside
   * `garden`: a sprig is somewhere you go outside to, and a pot is something
   * standing in the corner of somewhere you are already in.
   */
  plant: (
    <svg {...ICON}>
      <path d="M4.4 9.4h7.2l-.8 4.2a1 1 0 0 1-1 .8H6.2a1 1 0 0 1-1-.8L4.4 9.4Z" />
      <path d="M8 9.4V5.6" />
      <path d="M8 7.2C6.4 7.2 5.4 6.2 5.4 4.6c1.6 0 2.6 1 2.6 2.6Z" />
      <path d="M8 6.4c0-1.8 1-2.8 2.6-2.8 0 1.8-1 2.8-2.6 2.8Z" />
    </svg>
  ),

  /** A sun: the disc and six rays. */
  sun: (
    <svg {...ICON}>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6" />
      <path d="m3.4 3.4 1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
    </svg>
  ),

  /**
   * A crescent, cut rather than drawn.
   *
   * One closed path with a bite out of it, which is the only way a crescent
   * survives at this size - two arcs meeting at a point turn into a smudge the
   * moment the stroke is wider than the gap between them.
   */
  moon: (
    <svg {...ICON}>
      <path d="M13.2 9.8A5.8 5.8 0 0 1 6.2 2.8a5.9 5.9 0 1 0 7 7Z" />
    </svg>
  ),

  /** A globe: the outline, the equator, one meridian. Three strokes, no more. */
  globe: (
    <svg {...ICON}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4" />
      <path d="M8 1.8a3.6 6.2 0 0 1 0 12.4a3.6 6.2 0 0 1 0-12.4" />
    </svg>
  ),

  // --- Things to do --------------------------------------------------------

  /** A desk: a top, two legs, and a drawer. */
  desk: (
    <svg {...ICON}>
      <path d="M1.6 6.2h12.8" />
      <path d="M3 6.2V13M13 6.2V13" />
      <path d="M6 8.4h6a.8.8 0 0 1 .8.8v1.4H6V8.4Z" />
    </svg>
  ),

  /** A board on an easel, with a line of writing across it. */
  board: (
    <svg {...ICON}>
      <rect x="1.8" y="2.2" width="12.4" height="8.4" rx="1.2" />
      <path d="M4.6 5.4h6.8M4.6 7.8h4" />
      <path d="m5.6 13.8 2.4-3.2 2.4 3.2" />
    </svg>
  ),

  /** A flask, with what is in it. */
  flask: (
    <svg {...ICON}>
      <path d="M6.4 1.8v4.4L2.9 12a1.2 1.2 0 0 0 1 1.9h8.2a1.2 1.2 0 0 0 1-1.9L9.6 6.2V1.8" />
      <path d="M5.4 1.8h5.2" />
      <path d="M4.6 10.2h6.8" />
    </svg>
  ),

  /** Two notes, beamed. */
  music: (
    <svg {...ICON}>
      <path d="M6 12V3.4l7-1.2V11" />
      <circle cx="4.4" cy="12" r="1.8" />
      <circle cx="11.4" cy="11" r="1.8" />
    </svg>
  ),

  /** A speech bubble with a tail. */
  chat: (
    <svg {...ICON}>
      <path d="M2 4.4a1.6 1.6 0 0 1 1.6-1.6h8.8A1.6 1.6 0 0 1 14 4.4v5.2a1.6 1.6 0 0 1-1.6 1.6H6.6L3.2 14v-2.8a1.6 1.6 0 0 1-1.2-1.6V4.4Z" />
    </svg>
  ),

  // --- Things to play ------------------------------------------------------

  /**
   * A football: the ball, and the centre panel.
   *
   * The pentagon and three seams, and no more of them. A full ball is twelve
   * panels, and twelve panels at 16px is a grey circle.
   */
  ball: (
    <svg {...ICON}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="m8 4.6 2.7 2-1 3.2H6.3l-1-3.2 2.7-2Z" />
      <path d="M8 1.8v2.8M13.9 6.6l-3.2 2.4M2.1 6.6l3.2 2.4M5.3 9.8 4 13.2M10.7 9.8l1.3 3.4" />
    </svg>
  ),

  /**
   * A club crest: a shield, with the ball on it.
   *
   * The one glyph here that names an *institution* rather than a place or a
   * thing - a space that runs a football club has a room for the club, which is
   * not the same room as the one the matches are played in.
   */
  club: (
    <svg {...ICON}>
      <path d="M8 1.8 13.4 3.4v4.7c0 3-2.2 5.2-5.4 6.1-3.2-.9-5.4-3.1-5.4-6.1V3.4L8 1.8Z" />
      <circle cx="8" cy="7.4" r="2.2" />
    </svg>
  ),

  /** Crossed swords: two blades, two hilts. The rail's own battle glyph. */
  battle: (
    <svg {...ICON}>
      <path d="M13.4 2.2 6.8 8.8M2.6 2.2l6.6 6.6" />
      <path d="M2 11.4 4.6 14M14 11.4 11.4 14" />
      <path d="m4.4 9.6 2 2M11.6 9.6l-2 2" />
    </svg>
  ),

  /**
   * A water pistol: the tank, the barrel, the grip, and the trigger.
   *
   * Blunt and round on purpose. The one thing this drawing must not be at 16px
   * is a gun, and what keeps it from being one is the tank sitting on top -
   * that silhouette belongs to exactly one object and it is a toy.
   */
  watergun: (
    <svg {...ICON}>
      <path d="M5.6 4.2h3.6a1.4 1.4 0 0 1 1.4 1.4v.6h3.2v2.2h-3.2v.4a1.6 1.6 0 0 1-1.6 1.6H7.8l-1 3.4a.9.9 0 0 1-.9.6H4.6a.9.9 0 0 1-.8-1.2l1-2.8a1.6 1.6 0 0 1-.8-1.4V5.6a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M6.6 4.2V2.8h2.6v1.4" />
      <path d="M6.4 10.4h2" />
    </svg>
  ),

  /** Two cards, one behind the other. */
  cards: (
    <svg {...ICON}>
      <rect x="5.4" y="3.4" width="8" height="10.4" rx="1.4" />
      <path d="M4.2 12.2A1.4 1.4 0 0 1 3 10.8V4a1.4 1.4 0 0 1 1-1.3l1.8-.5" />
      <path d="M9.4 6.6v3.6" />
    </svg>
  ),

  // --- Everything else -----------------------------------------------------

  /** A cup with handles, on a foot. */
  trophy: (
    <svg {...ICON}>
      <path d="M4.6 2.2h6.8v4a3.4 3.4 0 0 1-6.8 0v-4Z" />
      <path d="M4.6 3.4H2.8v1.4a2.2 2.2 0 0 0 1.9 2.2M11.4 3.4h1.8v1.4a2.2 2.2 0 0 1-1.9 2.2" />
      <path d="M8 9.6V12M5.4 14h5.2l-.6-2H6l-.6 2Z" />
    </svg>
  ),

  /** A spanner, laid across. */
  tools: (
    <svg {...ICON}>
      <path d="M10.4 1.9a3.6 3.6 0 0 0-3 5.5l-5 5a1.3 1.3 0 0 0 1.8 1.8l5-5a3.6 3.6 0 0 0 4.5-4.6l-2 2-1.9-1.9 2-2a3.6 3.6 0 0 0-1.4-.8Z" />
    </svg>
  ),

  /** An open book. */
  book: (
    <svg {...ICON}>
      <path d="M8 4.2C6.8 3 5.2 2.6 2.4 2.6a.8.8 0 0 0-.8.8v8.2c0 .4.4.8.8.8 2.8 0 4.4.4 5.6 1.6" />
      <path d="M8 4.2c1.2-1.2 2.8-1.6 5.6-1.6a.8.8 0 0 1 .8.8v8.2c0 .4-.4.8-.8.8-2.8 0-4.4.4-5.6 1.6" />
      <path d="M8 4.2V14" />
    </svg>
  ),

  /** A rocket, pointing up, with a window and two fins. */
  rocket: (
    <svg {...ICON}>
      <path d="M8 1.4c2.2 1.8 3.4 4.4 3.4 7.2l-1.2 2.6H5.8L4.6 8.6C4.6 5.8 5.8 3.2 8 1.4Z" />
      <circle cx="8" cy="6.4" r="1.4" />
      <path d="M5.4 9.6 3.4 11v2.2l2.2-1.2M10.6 9.6l2 1.4v2.2l-2.2-1.2" />
    </svg>
  ),

  /** A star, five points. */
  star: (
    <svg {...ICON}>
      <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8Z" />
    </svg>
  ),
}
