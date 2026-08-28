/**
 * The line drawings /play, /create and /share are labelled with.
 *
 * ---------------------------------------------------------------------------
 * The same hand as the rail, deliberately
 * ---------------------------------------------------------------------------
 * `src/app/t/[slug]/rail-icons.tsx` already draws this alphabet for the inside
 * of a space: 16x16, one stroke weight, `currentColor`, no fills. These are the
 * marketing half of the same set, and the constant below is copied from it
 * verbatim so the two cannot drift - a visitor who reads /play and then walks
 * into a space should meet the same drawing for "café" in both places.
 *
 * Not imported from the rail because that file lives under a route segment and
 * carries the rail's own vocabulary (`fold`, `signOut`, `billing`); this one
 * carries the arcade's (`football`, `races`, `catalogue`). Where a name exists
 * in both - `lounge`, `cafe`, `home`, `studio`, `members` - the path data is the
 * same path data, on purpose.
 *
 * Drawn by hand rather than pulled from a library for the reason the landing
 * page's chips are: two dozen small strokes are not worth a dependency, and a
 * library's house style is not this one.
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

export type MarkName =
  // /play
  | 'battles'
  | 'boardgames'
  | 'football'
  | 'races'
  | 'tournaments'
  | 'cafe'
  | 'home'
  | 'lounge'
  | 'momentum'
  | 'owner'
  | 'sweep'
  | 'clock'
  // /create
  | 'modes'
  | 'palette'
  | 'studio'
  | 'pieces'
  | 'rules'
  | 'script'
  | 'together'
  | 'gauge'
  | 'roadmap'
  // /share
  | 'members'
  | 'rooms'
  | 'link'
  | 'knock'
  | 'window'
  | 'catalogue'
  // furniture
  | 'notYet'

/**
 * One drawing, by name.
 *
 * A component rather than a bare element so callers read as markup and so the
 * `aria-hidden` cannot be forgotten at a call site - every one of these sits
 * beside a word that already says what it is.
 */
export function Mark({ name }: { name: MarkName }) {
  return MARKS[name]
}

const MARKS: Record<MarkName, React.ReactElement> = {
  /** Crossed swords: two blades, two hilts. The rail's `battle`. */
  battles: (
    <svg {...ICON}>
      <path d="M13.4 2.2 6.8 8.8M2.6 2.2l6.6 6.6" />
      <path d="M2 11.4 4.6 14M14 11.4 11.4 14" />
      <path d="m4.4 9.6 2 2M11.6 9.6l-2 2" />
    </svg>
  ),

  /** A ball: the outline and one panel. The landing page's football chip. */
  football: (
    <svg {...ICON}>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 4.6 11.2 7l-1.2 3.7H6L4.8 7 8 4.6Z" />
    </svg>
  ),

  /** A pennant on a pole - a finish line rather than a starting gun. */
  /**
   * A board: a grid with one counter standing on it.
   *
   * Not a die, which is the obvious draw and the wrong one - a die is chance,
   * and the thing this section is about is that nothing here moves a piece for
   * you. The counter on the square is the whole promise.
   */
  boardgames: (
    <svg {...ICON}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M2 6h12M2 10h12M6 2v12M10 2v12" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),

  races: (
    <svg {...ICON}>
      <path d="M3.5 2v12" />
      <path d="M3.5 3h9l-2 2.6 2 2.6h-9" />
    </svg>
  ),

  /**
   * A bracket: four entries narrowing to one.
   *
   * A trophy was the first draw and was wrong on this page - nothing here ranks
   * anybody, and a cup is the icon for a season. A bracket is the icon for an
   * afternoon.
   */
  tournaments: (
    <svg {...ICON}>
      <path d="M1.6 3.2h2.6v3.4h2.6M1.6 12.8h2.6V9.4h2.6" />
      <path d="M6.8 6.6h1.6v2.8H6.8" />
      <path d="M8.4 8h5.9" />
      <circle cx="14.3" cy="8" r="1.1" />
    </svg>
  ),

  /** A cup with a handle and steam. The rail's `cafe`. */
  cafe: (
    <svg {...ICON}>
      <path d="M2.5 5.5h8.5V10a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10V5.5Z" />
      <path d="M11 6.5h1.3a1.9 1.9 0 1 1 0 3.8H11" />
      <path d="M5.2 3.4c.6-.6 0-1 .5-1.6M8 3.4c.6-.6 0-1 .5-1.6" />
    </svg>
  ),

  /** A house with a door. The rail's `home`. */
  home: (
    <svg {...ICON}>
      <path d="M2.2 6.8 8 2.2l5.8 4.6V13a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1V6.8Z" />
      <path d="M6.4 14V9.6h3.2V14" />
    </svg>
  ),

  /** A couch, seen head on. The rail's `lounge`. */
  lounge: (
    <svg {...ICON}>
      <path d="M3 7.2V5.4A1.4 1.4 0 0 1 4.4 4h7.2A1.4 1.4 0 0 1 13 5.4v1.8" />
      <path d="M2.2 7.2h11.6a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2.2a1 1 0 0 1-1-1V8.2a1 1 0 0 1 1-1Z" />
      <path d="M3.4 12v1.4M12.6 12v1.4M8 7.2V12" />
    </svg>
  ),

  /** A ball with speed behind it: hit it harder, it goes further. */
  momentum: (
    <svg {...ICON}>
      <circle cx="10.6" cy="8" r="3.6" />
      <path d="M5.4 4.8H1.8M4.2 8H1.2M5.4 11.2H2.4" />
    </svg>
  ),

  /** One browser window with a dot lit: the client that holds the ball. */
  owner: (
    <svg {...ICON}>
      <rect x="1.6" y="3" width="12.8" height="10" rx="1.5" />
      <path d="M1.6 6h12.8" />
      <circle cx="4.2" cy="4.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  ),

  /** A path swept between two points, rather than two sampled dots. */
  sweep: (
    <svg {...ICON}>
      <path d="M2 11.5C4.5 4.5 11 3 14 3" />
      <path d="M11.4 12.6h3.2M13 11v3.2" />
      <circle cx="2" cy="11.5" r="1.1" />
    </svg>
  ),

  /** A clock, at ten past. */
  clock: (
    <svg {...ICON}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.6V8l2.6 1.6" />
    </svg>
  ),

  /** A switch, thrown. Creative on one side, battle on the other. */
  modes: (
    <svg {...ICON}>
      <rect x="1.4" y="4.6" width="13.2" height="6.8" rx="3.4" />
      <circle cx="11.2" cy="8" r="2" />
    </svg>
  ),

  /** Three blocks, stacked the way the palette stacks them. */
  palette: (
    <svg {...ICON}>
      <rect x="1.6" y="8.6" width="5.8" height="5.8" rx="1" />
      <rect x="8.6" y="8.6" width="5.8" height="5.8" rx="1" />
      <rect x="5.1" y="1.6" width="5.8" height="5.8" rx="1" />
    </svg>
  ),

  /** A clapperboard, open. The rail's `studio`. */
  studio: (
    <svg {...ICON}>
      <path d="M2.5 6.5h13v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6.5Z" />
      <path d="M2.8 6.4 3.9 3.3l12.3 1.1-.4 2.1" />
      <path d="m6.6 3.6.7 2.8M10.4 3.9l.7 2.8" />
    </svg>
  ),

  /** One piece, in perspective - a thing you drag in and let go of. */
  pieces: (
    <svg {...ICON}>
      <path d="M8 1.8 14 5v6l-6 3.2L2 11V5l6-3.2Z" />
      <path d="M2 5l6 3.2L14 5M8 8.2v6" />
    </svg>
  ),

  /** Rows in a panel, with the first one true: rules are rows, not code. */
  rules: (
    <svg {...ICON}>
      <rect x="1.6" y="2.4" width="12.8" height="11.2" rx="1.5" />
      <path d="M4.2 6.2 5.4 7.4 7.6 5" />
      <path d="M9.4 6.2h2.6M4.2 10.4h7.8" />
    </svg>
  ),

  /** Two angle brackets. The one place code is meant. */
  script: (
    <svg {...ICON}>
      <path d="M5.6 4.4 2 8l3.6 3.6M10.4 4.4 14 8l-3.6 3.6" />
    </svg>
  ),

  /** Two people. The rail's `members`, and here it means "and somebody else". */
  together: (
    <svg {...ICON}>
      <circle cx="6.2" cy="5.4" r="2.4" />
      <path d="M1.8 13.6c0-2.4 2-3.8 4.4-3.8s4.4 1.4 4.4 3.8" />
      <path d="M10.8 3.4a2.4 2.4 0 0 1 0 4.6M12 10.2c1.4.5 2.2 1.7 2.2 3.4" />
    </svg>
  ),

  /** A dial with a needle: these numbers were measured, not chosen. */
  gauge: (
    <svg {...ICON}>
      <path d="M1.8 12a6.2 6.2 0 1 1 12.4 0" />
      <path d="M8 12 11 7.4" />
      <path d="M1.8 12h1.6M12.6 12h1.6" />
    </svg>
  ),

  /** A dashed run up to a flag: what ships now, and what is next. */
  roadmap: (
    <svg {...ICON}>
      <path d="M1.6 13h1.8M6 13h1.8M10.4 13h1.8" />
      <path d="M12.6 13V2.8" />
      <path d="M12.6 3.4h-5l1.2 1.9-1.2 1.9h5" />
    </svg>
  ),

  /** Two people. Your people, on /share. */
  members: (
    <svg {...ICON}>
      <circle cx="6.2" cy="5.4" r="2.4" />
      <path d="M1.8 13.6c0-2.4 2-3.8 4.4-3.8s4.4 1.4 4.4 3.8" />
      <path d="M10.8 3.4a2.4 2.4 0 0 1 0 4.6M12 10.2c1.4.5 2.2 1.7 2.2 3.4" />
    </svg>
  ),

  /** Two doors off one corridor. */
  rooms: (
    <svg {...ICON}>
      <rect x="1.6" y="2.2" width="5.4" height="11.6" rx="1" />
      <rect x="9" y="2.2" width="5.4" height="11.6" rx="1" />
      <path d="M5.2 8.2v.1M12.6 8.2v.1" />
    </svg>
  ),

  /** Two links of a chain. A door somebody props open. */
  link: (
    <svg {...ICON}>
      <path d="M6.6 9.4 9.4 6.6" />
      <path d="M9.2 4.6l.9-.9a2.7 2.7 0 0 1 3.8 3.8l-.9.9" />
      <path d="M6.8 11.4l-.9.9a2.7 2.7 0 0 1-3.8-3.8l.9-.9" />
    </svg>
  ),

  /** A hand at a door: somebody standing outside waiting to be let in. */
  knock: (
    <svg {...ICON}>
      <path d="M3 2.4h7.4a1 1 0 0 1 1 1v9.2a1 1 0 0 1-1 1H3" />
      <path d="M8.6 8v.1" />
      <path d="M13.2 6.4v3.2M14.8 6.4v3.2" />
    </svg>
  ),

  /** A window with a bar across it: you can look, you cannot come in. */
  window: (
    <svg {...ICON}>
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.4" />
      <path d="M2.2 8h11.6M8 2.2v11.6" />
    </svg>
  ),

  /** A shelf of worlds, one pulled forward. */
  catalogue: (
    <svg {...ICON}>
      <rect x="1.4" y="2.2" width="4" height="8" rx="0.9" />
      <rect x="6.4" y="2.2" width="4" height="8" rx="0.9" />
      <path d="M11.4 3.4l3 .9-1.9 6.4" />
      <path d="M1.4 13.4h13.2" />
    </svg>
  ),

  /** A circle with the bottom half still open. Honest about being unfinished. */
  notYet: (
    <svg {...ICON}>
      <path d="M8 1.8a6.2 6.2 0 0 1 0 12.4" />
      <path d="M4.6 3.1a6.2 6.2 0 0 0-2.6 4M2 9.4a6.2 6.2 0 0 0 2.6 4" />
    </svg>
  ),
}
