import localFont from 'next/font/local'

/**
 * OpenDyslexic, the face the reading aid can switch the prose into.
 *
 * The letterforms are weighted at the bottom and each one is drawn to be hard
 * to confuse with its mirror - b/d, p/q - which is the whole claim the face
 * makes. Whether it helps is contested in the literature and not settled; it
 * is offered because readers who want it know they want it, and it costs a
 * button.
 *
 * `preload: false` on purpose. Every page in the app inherits this variable
 * from `<html>` - that is how `next/font/local` works and how the pixel face
 * next door is set up - but almost no page will ever draw a glyph in it, and
 * a preload link would put 115kB on the wire for all of them. Nothing is
 * fetched until a rule actually asks for the family, which happens when a
 * reader presses the button and not before.
 *
 * ---------------------------------------------------------------------------
 * It does cover Bulgarian, whatever the filename says
 * ---------------------------------------------------------------------------
 * The file is called `-latin-` because that is what Fontsource names the cut,
 * and the name is misleading: measured in Chrome against the whole Bulgarian
 * alphabet, upper and lower, plus the quotes and dashes the prose uses, every
 * character is drawn from this file and none falls through. So the Bulgarian
 * edition switches face along with the other two, and the second Cyrillic
 * font that was vendored for it has been taken back out.
 *
 * Worth re-measuring rather than assuming if this file is ever updated - the
 * pixel headline face next door has exactly this gap, and a Bulgarian chapter
 * silently reverting to Times is the kind of thing nobody who reads English
 * would ever see. `CSS.getPlatformFontsForNode` over CDP names the font that
 * actually drew each glyph, which is the only answer worth having.
 *
 * The two weights are the real files rather than one weight with a synthetic
 * bold, because faking bold on a face this heavy fills the counters in.
 */
const openDyslexic = localFont({
  src: [
    {
      path: '../../../../public/font/opendyslexic-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../../../public/font/opendyslexic-latin-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-dyslexic',
  // The metrics are nothing like Arial's - the face sits large on the body and
  // low on the baseline - so Next's computed fallback override would hold a
  // space the wrong shape and then jump when the file lands.
  adjustFontFallback: false,
})

export default openDyslexic
