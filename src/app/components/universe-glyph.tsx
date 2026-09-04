/**
 * The channel's mark at the size of an icon.
 *
 * ---------------------------------------------------------------------------
 * Not a smaller `UniverseMark`
 * ---------------------------------------------------------------------------
 * `universe-mark.tsx` is a wordmark: "XO · UNIVERSE" in the pixel face with a
 * globe drawn behind the letters, and a globe that turns towards the pointer.
 * All of that is right on a marketing band and wrong in a 14-pixel box - the
 * words would be illegible, and the pointer tracking would put an
 * `IntersectionObserver` and a listener on a control that is a single glyph.
 *
 * So this is the *picture* without the name: a planet with a ring, which is
 * what somebody recognises at this size, sitting next to a label that already
 * says which channel it is. Two marks for one identity is a cost, and the
 * alternative - shrinking the wordmark until neither the word nor the mark
 * reads - is not cheaper, it is just less obviously wrong.
 *
 * Static, and deliberately: no state, no effect, no client boundary of its
 * own. It renders inside a Client Component and inside a Server one without
 * either having to know.
 *
 * `currentColor` throughout, so it takes the colour of whatever it sits in -
 * the ink of the rainbow pill here, and whatever comes next elsewhere.
 */
export function UniverseGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      // Decoration beside a label that already names the destination. A title
      // here would be read out twice by a screen reader on one control.
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="4" />
      {/* The ring, tilted, drawn as an ellipse rotated about the planet's
          centre rather than a path - it stays a true ellipse at any size, and
          the rotation is the only thing that makes a circle read as an orbit
          seen edge-on. */}
      <ellipse cx="8" cy="8" rx="7.2" ry="2.6" transform="rotate(-24 8 8)" />
    </svg>
  )
}
