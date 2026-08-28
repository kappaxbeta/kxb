'use client'

/**
 * PixelMillennium, loaded so a `<canvas>` can draw in it.
 *
 * ---------------------------------------------------------------------------
 * Why a canvas cannot just ask for the face by name
 * ---------------------------------------------------------------------------
 * `next/font/local` declares the face in CSS and hands back a hashed family
 * name in a variable - see `components/fonts/pixel.ts`. A 2D context takes a
 * font *shorthand string*, so drawing in it would mean reading the computed
 * variable off an element and hoping the shorthand parser accepts whatever came
 * back. Loading a second copy under a name we chose is shorter, and it is the
 * name that ends up in the `context.font` string.
 *
 * **Awaited before the first paint, because a canvas does not reflow.** Text
 * drawn before the face has loaded is drawn in the fallback and stays that way
 * until something else invalidates the frame - which for a texture uploaded to
 * the GPU is never.
 *
 * One promise for the whole document. The hero stage in the backoffice and
 * every cartridge nameplate on a shelf are the same font arriving once.
 */

let pixelFace: Promise<void> | null = null

export function loadPixelFace(): Promise<void> {
  if (pixelFace) return pixelFace

  pixelFace = (async () => {
    if (typeof FontFace === 'undefined') return
    const face = new FontFace('PixelMillennium', 'url(/font/PixelMillennium.ttf)')
    await face.load()
    document.fonts.add(face)
  })().catch(() => {
    // A missing face is a label set in the monospace fallback, which is worse
    // looking and still a working screen. Failing over it would not be.
  })

  return pixelFace
}
