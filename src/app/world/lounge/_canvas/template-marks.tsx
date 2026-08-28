import type { ReactNode } from 'react'

/**
 * The little drawings on the template cards.
 *
 * These lived in `domain/lounge/templates` until the catalogue stopped being a
 * `.tsx`. Keeping them there meant a Server Action that only wanted
 * `findTemplate` - to look up a planner and lay some blocks - pulled a module
 * full of React elements along with it, and it meant the one file in
 * `src/domain/` that imported `react` was a table of SVG paths.
 *
 * Splitting them costs an id lookup at the two places that draw a card, and
 * buys a domain catalogue that is plain data. The marks are keyed by template
 * id rather than exported individually so that adding a template is still one
 * entry here and one entry there.
 *
 * Drawn rather than rendered from the world, for the reason the catalogue used
 * to give: a thumbnail of a template would mean generating a world to
 * photograph it, and these have to be recognisable at 40px on a phone, which a
 * top-down render of grass is not.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function PitchMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-full">
      <g {...STROKE}>
        <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
        <path d="M12 4.5v15" />
        <circle cx="12" cy="12" r="3" />
        <path d="M2.5 8.5h3v7h-3M21.5 8.5h-3v7h3" />
      </g>
    </svg>
  )
}

function FlatsMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-full">
      <g {...STROKE}>
        <path d="M12 4.5 21.5 10 12 15.5 2.5 10z" />
        <path d="M2.5 14 12 19.5 21.5 14" opacity="0.5" />
      </g>
    </svg>
  )
}

function CageMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-full">
      <g {...STROKE}>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4" opacity="0.6" />
        <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
      </g>
    </svg>
  )
}

/** A hall with a lit floor in it, drawn as a room and a rig over it. */
function ClubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-full">
      <g {...STROKE}>
        <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
        <path d="M3 8h18" />
        <path d="M7 8v-3.5M12 8v-3.5M17 8v-3.5" opacity="0.6" />
        <rect x="7.5" y="11" width="9" height="6" rx="0.8" opacity="0.9" />
        <path d="M7.5 14h9M12 11v6" opacity="0.5" />
      </g>
    </svg>
  )
}

/** A sofa, seen from the front. The one shape nothing else here could be. */
function LivingRoomMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-full">
      <g {...STROKE}>
        <path d="M4 16v-5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V16" />
        <path d="M2.5 16.5a1.5 1.5 0 0 1 1.5-1.5h16a1.5 1.5 0 0 1 1.5 1.5V19h-19z" />
        <path d="M7 8.5V13M17 8.5V13" opacity="0.5" />
      </g>
    </svg>
  )
}

/** An island with a mast on it: the demo's plaza, from above the water. */
function DemoIslandMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-full">
      <g {...STROKE}>
        <circle cx="12" cy="14" r="7.5" />
        <circle cx="12" cy="14" r="3.5" opacity="0.5" />
        <path d="M12 10.5V3M12 3l4 1.5-4 1.5" opacity="0.9" />
      </g>
    </svg>
  )
}

function RaceMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-full">
      <g {...STROKE}>
        {/* A chequered flag on a post, and three pads leading to it - the two
            things a race is: somewhere to get to, and hops to get there. */}
        <path d="M5 20.5V4.5" />
        <path d="M5 5h7v5H5zM12 10h7V5h-7" opacity="0.85" />
        <path d="M3.5 20.5h3M9.5 20.5h3M15.5 20.5h3" opacity="0.6" />
      </g>
    </svg>
  )
}

function EmptyMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-full">
      <g {...STROKE}>
        {/* A dashed square: the ground taken away, not laid flat - the
            difference between this and FlatsMark. */}
        <rect
          x="3.5"
          y="3.5"
          width="17"
          height="17"
          rx="1.5"
          strokeDasharray="3 2.5"
          opacity="0.7"
        />
      </g>
    </svg>
  )
}

const MARKS: Record<string, ReactNode> = {
  pitch: <PitchMark />,
  race: <RaceMark />,
  cage: <CageMark />,
  club: <ClubMark />,
  'living-room': <LivingRoomMark />,
  'demo-island': <DemoIslandMark />,
  flats: <FlatsMark />,
  empty: <EmptyMark />,
}

/**
 * The mark for a template, or nothing.
 *
 * Null rather than a placeholder for an unknown id: the card still lays out,
 * and a template added without a drawing should look unfinished rather than
 * look like some other ground.
 */
export function templateMark(id: string): ReactNode {
  return MARKS[id] ?? null
}
