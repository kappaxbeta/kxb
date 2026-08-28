/**
 * Shooting stars crossing the sky behind the page.
 *
 * The static starfield lives on `body` as tiled gradients, because a few
 * thousand fixed dots have no business being elements. These do: each one is a
 * streak that has to travel, and travel is one element with one transform on
 * it — which the compositor can run without touching layout or paint.
 *
 * Six, not sixty. A sky with constant traffic reads as a screensaver; the long
 * staggered delays below mean most of the time nothing is happening, and a
 * streak is something you catch out of the corner of your eye.
 *
 * Mounted by the landing page and by the workspace shell, so the sky is the
 * same on both sides of the front door. Not in the root layout: it would then
 * also be behind the login and legal pages, which are text and want no weather
 * at all.
 *
 * It is `position: fixed` at `z-index: -1`, so on the surfaces that fill the
 * viewport with a canvas - the lounge, the café - it is simply covered rather
 * than fighting them for the compositor.
 */

type Streak = {
  /** Where it enters, as a percentage across and down the viewport. */
  x: number
  y: number
  /** How long the streak is, in rem. */
  length: number
  /** Seconds for one crossing, and how long before the first one. */
  duration: number
  delay: number
  /** The neon it burns, as an oklch hue. */
  hue: number
}

const STREAKS: Streak[] = [
  { x: 12, y: 8, length: 11, duration: 2.6, delay: 0, hue: 320 },
  { x: 68, y: 3, length: 14, duration: 3.1, delay: 4.5, hue: 235 },
  { x: 88, y: 22, length: 9, duration: 2.2, delay: 9, hue: 285 },
  { x: 34, y: 34, length: 12, duration: 2.9, delay: 13.5, hue: 200 },
  { x: 55, y: 14, length: 10, duration: 2.4, delay: 19, hue: 340 },
  { x: 5, y: 44, length: 13, duration: 3.4, delay: 24, hue: 260 },
]

export function ShootingStars() {
  return (
    <div className="sky" aria-hidden="true">
      {STREAKS.map((streak) => (
        <span
          key={`${streak.x}-${streak.y}`}
          className="streak"
          style={
            {
              '--x': `${streak.x}%`,
              '--y': `${streak.y}%`,
              '--length': `${streak.length}rem`,
              '--duration': `${streak.duration}s`,
              '--delay': `${streak.delay}s`,
              '--hue': streak.hue,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
