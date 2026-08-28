import localFont from 'next/font/local'

/**
 * The face the headline is set in.
 *
 * A pixel font, so it carries the voxel room the page is selling in the first
 * line of type rather than waiting for the render below the fold. Loaded
 * through `next/font/local` rather than an `@font-face` in globals.css: that
 * inlines the `@font-face` with a hashed, preloaded URL and reserves the right
 * metrics up front, so the headline does not reflow once the file lands.
 *
 * Exposed as a CSS variable rather than as a `className`, because the variable
 * is what `--font-pixel` in globals.css reads to mint the `font-pixel` Tailwind
 * utility. `.variable` goes on `<html>` once, in the root layout; every use
 * after that is `font-pixel` in the markup, like any other Tailwind font.
 *
 * Reach for it on display type only. Pixel faces have one weight and one size
 * they are drawn for; at body copy sizes the stems collapse into mush, and a
 * `font-semibold` on top synthesises bold by smearing the pixels sideways.
 */
const pixelMillennium = localFont({
  src: '../../../../public/font/PixelMillennium.ttf',
  display: 'swap',
  variable: '--font-pixel-millennium',
  // Bitmap letterforms already carry their own sidebearings, and the fallback
  // metric override Next computes from Arial would squeeze them together while
  // the file loads.
  adjustFontFallback: false,
})

export default pixelMillennium
