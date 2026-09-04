'use client'

/**
 * The three faces the painter draws with, loaded under names it can rely on.
 *
 * A canvas cannot use the app's own font variables: `ctx.font` takes a family
 * name, and what `next/font` mints is a hashed one that changes between builds.
 * So the tool loads its own copies out of `public/font` under fixed names, and
 * the painter says `700 92px KxbPixel` and gets what it asked for.
 *
 * Two pixel faces rather than one, and that is not a preference. The brand face
 * has no Cyrillic at all - a Bulgarian headline set in it falls back to a serif
 * and the panel stops looking like the other eleven. Handjet is the closest
 * pixel face that covers Cyrillic, so it draws the Bulgarian headlines and the
 * brand face draws the rest.
 */

export const PIXEL = 'KxbPixel'
export const PIXEL_CYRILLIC = 'KxbPixelCyr'
export const SANS = 'KxbSans'

const FACES: { family: string; src: string; descriptors?: FontFaceDescriptors }[] = [
  { family: PIXEL, src: "url('/font/PixelMillennium.ttf')" },
  { family: PIXEL_CYRILLIC, src: "url('/font/Handjet-cyrillic.woff2') format('woff2')", descriptors: { weight: '700' } },
  { family: PIXEL_CYRILLIC, src: "url('/font/Handjet-latin.woff2') format('woff2')", descriptors: { weight: '700' } },
  { family: SANS, src: "url('/font/Inter-cyrillic.woff2') format('woff2')", descriptors: { weight: '100 900' } },
  { family: SANS, src: "url('/font/Inter-latin.woff2') format('woff2')", descriptors: { weight: '100 900' } },
]

let pending: Promise<void> | null = null

/**
 * Load them once, and hand every later caller the same promise.
 *
 * The painter awaits this before it measures anything. Measuring against a
 * fallback and drawing against the real face is the classic way to get a
 * headline that wraps in the wrong place - the numbers come from one font and
 * the pixels from another.
 */
export function loadBannerFonts(): Promise<void> {
  if (pending) return pending
  pending = (async () => {
    await Promise.all(
      FACES.map(async ({ family, src, descriptors }) => {
        const face = new FontFace(family, src, descriptors)
        await face.load()
        document.fonts.add(face)
      }),
    )
    await document.fonts.ready
  })()
  return pending
}

/** Which pixel face a language is set in. */
export function pixelFamily(locale: string): string {
  return locale === 'bg' ? PIXEL_CYRILLIC : PIXEL
}
