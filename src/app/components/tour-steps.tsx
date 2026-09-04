/**
 * What each panel of the tour shows: a picture, a glyph, and which flag has to
 * be on for the panel to be true.
 *
 * Separate from the words, which are in `@/app/i18n/tour` in two languages. The
 * split is the same one the landing page makes between `USE_CASES` and its
 * dictionary, and for the same reason: the art direction is one decision per
 * panel and the copy is two, so keeping them in one table means every image
 * dimension is written twice.
 *
 * The pictures are the renders already sitting in `public/xo/scenes` - the same
 * ones the landing page and the events sheet draw from. Deliberately not new
 * artwork: these are photographs of the actual product taken in its own studio
 * (see src/domain/studio), so a tour built from them cannot promise a room that
 * does not look like that. Drawing six illustrations instead would be six
 * chances to describe software that no longer exists.
 */

import type { FeatureKey } from '@/domain/flags/keys'
import type { TourStepId } from '@/app/i18n/tour'

export interface TourStep {
  id: TourStepId
  /**
   * The flag that has to be on for this panel to be worth showing, or null for
   * surface that has no flag and cannot be switched off.
   *
   * This is what stops the tour selling something the install has withdrawn.
   * The filtering is done where the flags are known - a server component - and
   * the tour itself takes whatever list it is handed, so the same component can
   * run on a marketing page that has no tenant and no flags to resolve.
   */
  feature: FeatureKey | null
  /** A file in `public/xo/scenes`, without the extension. */
  scene: string
  /** The render's real pixel size. Both required by next/image. */
  width: number
  height: number
  /** Tints the panel's frame and its glyph. Matches the landing page's hues. */
  hue: number
}

export const TOUR_STEPS: TourStep[] = [
  /*
    Money first, in a space that has any.

    This displaces the lounge, whose own note argued for going first because it
    is the one surface every space opens into - and that argument still holds
    for every space where this panel does not appear. `economy` is off by
    default, so the ordinary tour is unchanged and still opens on the room.

    Where it *is* on, coins come first because they are not a feature sitting
    alongside the others - they are a fact about how all of them behave. Somebody
    who learns about the lounge, the pitch and the workshop and *then* finds out
    that entering a battle costs something has been told the rules in the wrong
    order. This is the shortest panel in the tour for the same reason: it is
    context, not a destination.
  */
  { id: 'coins', feature: 'economy', scene: 'summon', width: 1280, height: 720, hue: 45 },
  // The lounge, and with no flag on it in practice: `lounge` is the one surface
  // every space opens into, and a tour that can begin somewhere else would
  // begin somewhere most people never go.
  { id: 'lounge', feature: 'lounge', scene: 'crew', width: 1600, height: 900, hue: 285 },
  {
    id: 'build',
    feature: 'worlds',
    scene: 'venue-3-fitout',
    width: 1400,
    height: 1000,
    hue: 200,
  },
  {
    id: 'play',
    feature: 'battle',
    scene: 'football-duel',
    width: 1500,
    height: 1000,
    hue: 145,
  },
  {
    id: 'rooms',
    feature: 'cafe',
    scene: 'cafe-counter',
    width: 1500,
    height: 1000,
    hue: 55,
  },
  /**
   * No flag. Guest links are not behind one - `guest_limit` caps how many may
   * stand in a space at once, which is a number rather than a switch, and every
   * space can be joined by invitation regardless. So this panel is always true.
   */
  {
    id: 'invite',
    feature: null,
    scene: 'instant-link',
    width: 1500,
    height: 1000,
    hue: 320,
  },
  {
    id: 'studio',
    feature: 'scenes',
    scene: 'party-club',
    width: 862,
    height: 564,
    hue: 265,
  },
]

/**
 * The panels this install can honestly show.
 *
 * Called from a server component that has already resolved the flags. Passing
 * `null` - a marketing page, where there is no tenant to resolve them against -
 * keeps every panel, which is the right answer there: the landing page is
 * selling the product rather than describing one deployment of it.
 */
export function visibleTourSteps(
  features: Partial<Record<FeatureKey, boolean>> | null,
): TourStep[] {
  if (!features) return TOUR_STEPS
  return TOUR_STEPS.filter((step) => step.feature === null || features[step.feature])
}

/**
 * The glyphs, at 24px.
 *
 * The rail's icons (src/app/t/[slug]/rail-icons.tsx) are the same hand and the
 * same weight, but they are hard-coded to 16px because a navigation row is the
 * only place they appear. These sit beside a heading in a panel, where 16px
 * reads as a smudge - so the set is redrawn at the size it is used rather than
 * scaled up, which would thin the strokes to nothing.
 */
const ICON = {
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export const TOUR_ICONS: Record<TourStepId, React.ReactElement> = {
  /**
   * A coin, three-quarters on, with a second behind it.
   *
   * Two rather than one, because a single circle at this size reads as a dot or
   * a clock face - and because the panel is about a currency rather than about
   * a coin. The offset is what makes it legible as money at 24px.
   */
  coins: (
    <svg {...ICON}>
      <ellipse cx="10.5" cy="14" rx="6.5" ry="4" />
      <path d="M4 14v2.6c0 2.2 2.9 4 6.5 4s6.5-1.8 6.5-4V14" />
      <path d="M13.5 10.4c1-.5 1.6-1.3 1.6-2.2 0-1.8-2.4-3.2-5.3-3.2-1.3 0-2.5.3-3.4.8" />
    </svg>
  ),

  /** A couch, seen head on - the same drawing as the rail's, redrawn larger. */
  lounge: (
    <svg {...ICON}>
      <path d="M4.5 10.8V8.1A2.1 2.1 0 0 1 6.6 6h10.8a2.1 2.1 0 0 1 2.1 2.1v2.7" />
      <path d="M3.3 10.8h17.4a1.5 1.5 0 0 1 1.5 1.5v4.2a1.5 1.5 0 0 1-1.5 1.5H3.3a1.5 1.5 0 0 1-1.5-1.5v-4.2a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M5.1 18v2.1M18.9 18v2.1M12 10.8V18" />
    </svg>
  ),

  /** Three cubes stacking themselves into a corner. */
  build: (
    <svg {...ICON}>
      <path d="M12 2.6 18 6v6.8l-6 3.4-6-3.4V6l6-3.4Z" />
      <path d="M6 6l6 3.4L18 6M12 9.4v6.8" />
      <path d="M3.2 15.6v4.2L7 21.6M20.8 15.6v4.2L17 21.6" />
    </svg>
  ),

  /** A ball, and the arc of a kick over it. */
  play: (
    <svg {...ICON}>
      <circle cx="12" cy="14.5" r="6.2" />
      <path d="M12 8.3l2.6 2v3.2l-2.6 1.8-2.6-1.8v-3.2l2.6-2Z" />
      <path d="M4.6 6.4c3-3 8.4-4 12.8-2.2" />
    </svg>
  ),

  /** A cup with steam - the café, and the rest of the rooms behind it. */
  rooms: (
    <svg {...ICON}>
      <path d="M3.6 8.4h12.2v6.8a5 5 0 0 1-5 5H8.6a5 5 0 0 1-5-5V8.4Z" />
      <path d="M15.8 9.9h1.9a2.7 2.7 0 1 1 0 5.4h-1.9" />
      <path d="M7.4 5.4c.9-.9 0-1.5.7-2.4M11.4 5.4c.9-.9 0-1.5.7-2.4" />
    </svg>
  ),

  /** A link, with a doorway on the far end of it. */
  invite: (
    <svg {...ICON}>
      <path d="M10.2 13.8a3.4 3.4 0 0 1 0-4.8l2-2a3.4 3.4 0 0 1 4.8 4.8l-.9.9" />
      <path d="M13.8 10.2a3.4 3.4 0 0 1 0 4.8l-2 2a3.4 3.4 0 0 1-4.8-4.8l.9-.9" />
    </svg>
  ),

  /** A clapperboard, open. */
  studio: (
    <svg {...ICON}>
      <path d="M3.8 9.8h19.5v10.4a1.5 1.5 0 0 1-1.5 1.5H5.3a1.5 1.5 0 0 1-1.5-1.5V9.8Z" />
      <path d="M4.2 9.6 5.8 5l18.4 1.6-.6 3.2" />
      <path d="m9.9 5.4 1 4.2M15.6 5.9l1 4.2" />
    </svg>
  ),
}
