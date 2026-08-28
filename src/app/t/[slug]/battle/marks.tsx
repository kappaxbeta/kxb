/**
 * The battle hub's marks.
 *
 * Drawn here rather than pulled from an icon set for the reason the world
 * templates give for theirs (domain/lounge/templates.ts): these have to be
 * legible at 16px inside a bordered tile, they carry `currentColor` so a
 * selected tile lights its mark with the rest of itself, and there is no
 * general-purpose icon for "one champion against everybody".
 *
 * Every one of them is a 16-unit box with a 1.5 stroke, so they sit at the same
 * visual weight when a mode tile and an arena tile end up side by side.
 */

const BOX = 'size-4'

/** All against all - the four-point spark. Also the summoning mark itself. */
export function SparkMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <path
        d="M8 2c.4 2.9 3.1 5.6 6 6-2.9.4-5.6 3.1-6 6-.4-2.9-3.1-5.6-6-6 2.9-.4 5.6-3.1 6-6Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Teams - two squares, overlapping, because a side is a thing you are inside. */
export function TeamsMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5.5" y="5.5" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** One against everyone - the one in the middle of the ring. */
export function ChampionMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.75" fill="currentColor" />
    </svg>
  )
}

/** Football - the ball, as two rings and a seam. */
export function BallMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** A race - the flag at the end of it, on its pole. */
export function FlagMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <path
        d="M4 14V2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4 2.5h8.5l-2 3 2 3H4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The lounge - open floor with people already on it. */
export function MeleeMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <path
        d="M1.5 11 8 14.5 14.5 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="6" r="1.75" fill="currentColor" />
      <circle cx="10.5" cy="7.5" r="1.75" fill="currentColor" />
    </svg>
  )
}

/** A tournament - the cup, because a bracket ends in exactly one of them. */
export function CupMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <path
        d="M4.5 2.5h7v3.25a3.5 3.5 0 0 1-7 0V2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 3.75H2.5v.75a2.5 2.5 0 0 0 2 2.45M11.5 3.75h2v.75a2.5 2.5 0 0 1-2 2.45"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 9.25v2.25M5.5 13.5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A challenge - two spaces, and the line drawn between them. */
export function ChallengeMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <circle cx="3.75" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12.25" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.25 8h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Joining - the doorway you walk through into a match already running. */
export function DoorMark() {
  return (
    <svg viewBox="0 0 16 16" className={BOX} fill="none" aria-hidden>
      <path
        d="M9.5 2.5h3v11h-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8h5.5M6.5 5.5 9 8l-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
