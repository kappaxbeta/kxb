/**
 * A hand, small and flat, for lists.
 *
 * The chart needs twenty-six hands on one screen and the phrasebook another
 * twenty-eight, and every one of them drawn with `<HandView>` would be fifty
 * WebGL contexts on a page. Browsers cap that somewhere around sixteen and then
 * start silently dropping the oldest, so the honest version of "just reuse the
 * 3D one" is a chart whose first rows go blank as you scroll.
 *
 * It is also simply better at this size. Twelve pixels of glowing tube is a
 * smudge; five bars, four up and one down, is a hand you can read across a
 * room. The 3D one is for the hand you are *holding*, where the motion is the
 * whole point; this is for the hand you are *looking up*.
 *
 * No `'use client'` and no hooks: it is an SVG built out of its props, so it
 * renders on the server with the page around it.
 */

import { FINGERS, isRaised, type Pose } from '@/app/world/_hand/fingers'

/** The same two hues the neon hand burns. See `_ink/palette.ts`. */
const LIT = 'hsl(300 100% 68%)'
const DIM = 'hsl(188 100% 62%)'

/** Where each of the four fingers stands, and how tall it is when raised. */
const COLUMNS = [
  { x: 9.5, reach: 20 },
  { x: 15, reach: 23 },
  { x: 20.5, reach: 21 },
  { x: 26, reach: 16 },
]

/** How long a folded finger looks. Not zero: a folded finger is still there. */
const FOLDED = 6

export function HandGlyph({
  pose,
  className,
  title,
}: {
  pose: Pose
  className?: string
  /** Read out instead of the picture, for anybody not looking at it. */
  title?: string
}) {
  const thumbUp = isRaised(pose, 'thumb')

  return (
    <svg
      viewBox="0 0 40 48"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* The palm, which is always there and never says anything. */}
      <rect x="7.5" y="26" width="23" height="15" rx="5" fill={DIM} opacity="0.22" />

      {COLUMNS.map((column, index) => {
        // FINGERS is thumb-first, so the four columns start one along.
        const up = isRaised(pose, FINGERS[index + 1])
        const height = up ? column.reach : FOLDED
        return (
          <rect
            key={column.x}
            x={column.x}
            y={28 - height}
            width="4.2"
            height={height + 4}
            rx="2.1"
            fill={up ? LIT : DIM}
            opacity={up ? 1 : 0.3}
          />
        )
      })}

      {/*
        The thumb is drawn rather than stacked, because it does not stand up
        alongside the others - it swings out from the side of the palm when it
        is raised and lies across it when it is not. Two rectangles at two
        angles is the smallest thing that reads as that difference.
      */}
      <rect
        x="-2.1"
        width="4.2"
        y={thumbUp ? -14 : -7}
        height={thumbUp ? 15 : 8}
        rx="2.1"
        fill={thumbUp ? LIT : DIM}
        opacity={thumbUp ? 1 : 0.3}
        /* Drawn upwards from a knuckle low on the palm, then swung out. Raised
           it stands clear of the hand; folded it lies almost flat across it,
           which is the difference a thumb actually makes. */
        transform={`translate(8.5 35) rotate(${thumbUp ? -38 : -84})`}
      />
    </svg>
  )
}
