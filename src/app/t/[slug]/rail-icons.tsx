/**
 * The rail's line drawings.
 *
 * One file rather than glyphs inline in the sidebar, because the glyphs were
 * the problem: `◈ ☕ ⌂ ❦` are font characters, so their weight, size and
 * baseline are whatever the system font decides, and they sat at four different
 * heights in a column that is meant to read as one list.
 *
 * All of them are 16x16, stroked at the same width, and inherit `currentColor`
 * - so a row tints its icon by setting a text colour, and nothing here has to
 * know about the palette. Drawn by hand for the same reason the landing page's
 * chips are: a dozen small line drawings are not worth a dependency, and these
 * are deliberately in that same hand.
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

export type IconName =
  | 'dashboard'
  | 'pages'
  | 'tasks'
  | 'battle'
  | 'lounge'
  | 'cafe'
  | 'home'
  | 'garden'
  | 'world'
  | 'studio'
  | 'thing'
  | 'streak'
  | 'fold'
  | 'unfold'
  | 'members'
  | 'profile'
  | 'billing'
  | 'settings'
  | 'switch'
  | 'signOut'
  | 'close'
  | 'edit'
  | 'copy'
  | 'copied'
  | 'code'
  | 'revoke'

export function Icon({ name }: { name: IconName }) {
  return ICONS[name]
}

const ICONS: Record<IconName, React.ReactElement> = {
  /** Four panes. The universal "everything at a glance". */
  dashboard: (
    <svg {...ICON}>
      <rect x="2" y="2" width="5" height="5" rx="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" />
    </svg>
  ),

  /** A sheet with writing on it. */
  pages: (
    <svg {...ICON}>
      <rect x="3" y="1.8" width="10" height="12.4" rx="1.6" />
      <path d="M5.5 5.5h5M5.5 8.2h5M5.5 10.9h3" />
    </svg>
  ),

  /** A list with the first line ticked off. */
  tasks: (
    <svg {...ICON}>
      <path d="M2.2 4.4 3.5 5.7 6 3.2" />
      <path d="M8 4.4h6" />
      <path d="M2.4 9.5h2.4M8 9.5h6" />
      <path d="M2.4 13h2.4M8 13h6" />
    </svg>
  ),

  /** Crossed swords: two blades, two hilts. */
  battle: (
    <svg {...ICON}>
      <path d="M13.4 2.2 6.8 8.8M2.6 2.2l6.6 6.6" />
      <path d="M2 11.4 4.6 14M14 11.4 11.4 14" />
      <path d="m4.4 9.6 2 2M11.6 9.6l-2 2" />
    </svg>
  ),

  /** A couch, seen head on - the commons, and the one room with seating. */
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

  /** A sprig. The garden between the house and the café. */
  garden: (
    <svg {...ICON}>
      <path d="M8 14V6.4" />
      <path d="M8 8.2C5.6 8.2 4 6.8 4 4.4c2.4 0 4 1.4 4 3.8Z" />
      <path d="M8 6.6c0-2.4 1.6-3.8 4-3.8 0 2.4-1.6 3.8-4 3.8Z" />
    </svg>
  ),

  /**
   * A globe: the outline, the equator, one meridian.
   *
   * Three strokes and no more. A second meridian is what turns a globe into a
   * smudge at 16px, and the grid is not the point - the round thing is.
   *
   * Distinct from `garden`, which the outdoor room still uses: a world is a
   * place you can publish and hand to somebody else, and a sprig read as "the
   * plot behind your house" every time.
   */
  world: (
    <svg {...ICON}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4" />
      <path d="M8 1.8a3.6 6.2 0 0 1 0 12.4a3.6 6.2 0 0 1 0-12.4" />
    </svg>
  ),

  /**
   * A clapperboard, open.
   *
   * The one glyph in this rail that names a *tool* rather than a place, which
   * is what the studio is - you go there to make something and come back with
   * it, rather than to be somewhere.
   */
  studio: (
    <svg {...ICON}>
      <path d="M2.5 6.5h13v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6.5Z" />
      <path d="M2.8 6.4 3.9 3.3l12.3 1.1-.4 2.1" />
      <path d="m6.6 3.6.7 2.8M10.4 3.9l.7 2.8" />
    </svg>
  ),

  /**
   * A flame: the streak leaderboard.
   *
   * One tongue, stroked like the rest of the set rather than filled - the
   * dashboard badge is the one that fills its flame to say "yours is lit"; a nav
   * row is a place you go, not a state, so it stays an outline like its
   * neighbours.
   */
  /**
   * A crate on a shelf line.
   *
   * A *thing*, drawn as the most thing-like object the packs contain - a box -
   * standing on the line that makes it a shelf rather than a floating cube.
   * Deliberately not another world glyph: the thingiverse is not a place you
   * go, it is a drawer you open.
   */
  thing: (
    <svg {...ICON}>
      <path d="M1.8 13.5h12.4" />
      <path d="M4 4.2h8v7H4z" />
      <path d="M4 6.6h8" />
      <path d="M8 4.2v7" />
    </svg>
  ),

  streak: (
    <svg {...ICON}>
      <path d="M8 1.8c.5 2.6 2.4 3.5 3.5 5.3a4.9 4.9 0 1 1-8.4 3.4c0-2.1 1.2-3.2 2-4.2.6 1.1 1.3 1.4 1.8 1.2C6.1 9.8 6.5 6.6 8 1.8Z" />
      <path d="M8 13.8a2.6 2.6 0 0 0 1.6-4.7" />
    </svg>
  ),

  /** A panel with its contents sliding out to the left. */
  fold: (
    <svg {...ICON}>
      <path d="M3 3.5h12a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H3" />
      <path d="M6.5 3.5v11" />
      <path d="m4.6 7.4-2 1.6 2 1.6" />
    </svg>
  ),

  /** The same, coming back. */
  unfold: (
    <svg {...ICON}>
      <path d="M3 3.5h12a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H3" />
      <path d="M6.5 3.5v11" />
      <path d="m2.6 7.4 2 1.6-2 1.6" />
    </svg>
  ),

  /** Two people. */
  members: (
    <svg {...ICON}>
      <circle cx="6.2" cy="5.4" r="2.4" />
      <path d="M1.8 13.6c0-2.4 2-3.8 4.4-3.8s4.4 1.4 4.4 3.8" />
      <path d="M10.8 3.4a2.4 2.4 0 0 1 0 4.6M12 10.2c1.4.5 2.2 1.7 2.2 3.4" />
    </svg>
  ),

  /** One person - the members icon with the second body taken off. */
  profile: (
    <svg {...ICON}>
      <circle cx="8" cy="5.4" r="2.6" />
      <path d="M2.8 13.8c0-2.6 2.3-4.2 5.2-4.2s5.2 1.6 5.2 4.2" />
    </svg>
  ),

  /** A card with a stripe. */
  billing: (
    <svg {...ICON}>
      <rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1.6" />
      <path d="M1.6 6.6h12.8M4.2 10.2h2.6" />
    </svg>
  ),

  /** A gear, at six teeth - any more is mush at this size. */
  settings: (
    <svg {...ICON}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.6v1.8M8 12.6v1.8M13.5 8h-1.8M4.3 8H2.5M11.9 4.1l-1.3 1.3M5.4 10.6l-1.3 1.3M11.9 11.9l-1.3-1.3M5.4 5.4 4.1 4.1" />
    </svg>
  ),

  /** Two arrows passing: somewhere else, of the same kind. */
  switch: (
    <svg {...ICON}>
      <path d="M2.4 5.4h9.2l-2.4-2.6M13.6 10.6H4.4l2.4 2.6" />
    </svg>
  ),

  /** Out through the door. */
  signOut: (
    <svg {...ICON}>
      <path d="M6.2 2.4H3.6a1.2 1.2 0 0 0-1.2 1.2v8.8a1.2 1.2 0 0 0 1.2 1.2h2.6" />
      <path d="M10 5.2 12.8 8 10 10.8M12.8 8H6" />
    </svg>
  ),

  close: (
    <svg {...ICON}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),

  /*
   * The three on a guest link's row.
   *
   * Drawings rather than the words they replace, and that is a translation
   * decision before it is a visual one: `Copy / Show code / Revoke` is 22
   * characters and `Kopieren / Code zeigen / Zurückziehen` is 36, on a row that
   * has 15.5rem for all of it and a label on the other end. The verbs ran out
   * of road in German and Bulgarian and pushed the card wider than the rail.
   * A glyph is the same width in every language; the verb moves into the
   * accessible name, where it is read out in full.
   */

  /** A pencil, laid on the line it is about to change. */
  edit: (
    <svg {...ICON}>
      <path d="M10.4 2.9a1.5 1.5 0 0 1 2.1 2.1l-6.6 6.6-2.8.7.7-2.8z" />
      <path d="M2.6 14h10.8" />
    </svg>
  ),

  /** Two sheets, one behind the other. */
  copy: (
    <svg {...ICON}>
      <rect x="5.4" y="5.4" width="8" height="8" rx="1.4" />
      <path d="M10.6 5.4V4a1.4 1.4 0 0 0-1.4-1.4H4a1.4 1.4 0 0 0-1.4 1.4v5.2A1.4 1.4 0 0 0 4 10.6h1.4" />
    </svg>
  ),

  /** It is on the clipboard: the same answer every copy button gives. */
  copied: (
    <svg {...ICON}>
      <path d="M3 8.4 6.4 12 13 4.6" />
    </svg>
  ),

  /** A QR square, said with the three finders that make one recognisable. */
  code: (
    <svg {...ICON}>
      <rect x="2.4" y="2.4" width="4.4" height="4.4" rx="1" />
      <rect x="9.2" y="2.4" width="4.4" height="4.4" rx="1" />
      <rect x="2.4" y="9.2" width="4.4" height="4.4" rx="1" />
      <path d="M9.2 9.2h1.8M13.6 9.2v1.8M11.4 11.6h2.2M9.2 13.6h4.4" />
    </svg>
  ),

  /** A link with its middle cut: the chain, broken on purpose. */
  revoke: (
    <svg {...ICON}>
      <path d="M6.6 9.4 4.9 11a2.6 2.6 0 0 1-3.7-3.7l1.7-1.7" />
      <path d="M9.4 6.6 11.1 5a2.6 2.6 0 0 1 3.7 3.7l-1.7 1.7" />
      <path d="m3.4 3.4 9.2 9.2" />
    </svg>
  ),
}
