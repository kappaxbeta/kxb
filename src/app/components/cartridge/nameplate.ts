import * as THREE from 'three'
import { loadPixelFace } from '@/app/components/fonts/pixel-face'
import { CART } from '@/app/components/cartridge/model'

/**
 * The level's name, under its cartridge, as a texture.
 *
 * ---------------------------------------------------------------------------
 * A canvas rather than drei's `<Text>`
 * ---------------------------------------------------------------------------
 * The same call `world/_canvas/nameplate.tsx` made, for the same reason and one
 * more. Troika ships with no font configured and fetches one over the network
 * at first render, which is a request in the middle of a scene and a blank
 * label until it lands. And the font this shelf wants is not a Google one: it
 * is `PixelMillennium`, the face the whole product sets its headings in, which
 * is already on disk.
 *
 * ---------------------------------------------------------------------------
 * Every plate is the same rectangle
 * ---------------------------------------------------------------------------
 * The canvas is a fixed size and the *text* shrinks to fit it, rather than the
 * canvas growing to fit the text. A shelf whose plates were each as wide as
 * their name would have a ragged column of labels under a tidy grid of
 * cartridges, and the eye reads that as the grid being crooked.
 *
 * Past `MIN_PX` the name is cut instead of shrunk further, because a name set
 * small enough to fit is not a label any more.
 */

/** Drawn at twice the display size, so it survives a HiDPI screen. */
const SCALE = 2

/** The plate, in the same world units the cartridge is authored in. */
export const PLATE_WIDTH = CART.width
export const PLATE_HEIGHT = 0.2

/** Texels per world unit, before `SCALE`. */
const PX_PER_UNIT = 220

const START_PX = 30
const MIN_PX = 19

export interface Nameplate {
  texture: THREE.CanvasTexture
  width: number
  height: number
}

/**
 * Paints one plate. Null where there is no 2D context to paint into - a
 * server render, or a browser that has run out of canvases.
 *
 * The pixel face has to be *awaited before* this is called: a canvas does not
 * reflow, so a plate drawn in the fallback stays in the fallback for as long as
 * the texture lives. See `loadPixelFace`.
 */
export function paintNameplate(name: string, tint: string): Nameplate | null {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null

  canvas.width = Math.round(PLATE_WIDTH * PX_PER_UNIT * SCALE)
  canvas.height = Math.round(PLATE_HEIGHT * PX_PER_UNIT * SCALE)

  const room = canvas.width - 16 * SCALE
  const font = (px: number) => `${px * SCALE}px PixelMillennium, ui-monospace, monospace`

  let size = START_PX
  context.font = font(size)
  while (context.measureText(name).width > room && size > MIN_PX) {
    size -= 1
    context.font = font(size)
  }

  let label = name
  if (context.measureText(label).width > room) {
    // Cut from the end and keep the ellipsis inside the measurement, so the
    // result is never one character wider than the plate it is cut to fit.
    while (label.length > 1 && context.measureText(`${label}…`).width > room) {
      label = label.slice(0, -1)
    }
    label = `${label}…`
  }

  context.textAlign = 'center'
  context.textBaseline = 'middle'

  /*
   * A soft shadow of the same colour under the glyphs.
   *
   * The plate has no slab behind it - a solid bar under every cartridge would
   * turn a shelf into a spreadsheet - so the name is floating over whatever the
   * scene's background happens to be, and this is what keeps it readable
   * without one.
   */
  context.shadowColor = tint
  context.shadowBlur = 10 * SCALE
  context.fillStyle = '#f4f2ff'
  context.fillText(label, canvas.width / 2, canvas.height / 2 + SCALE)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.anisotropy = 4

  return { texture, width: PLATE_WIDTH, height: PLATE_HEIGHT }
}

/** The face, then the plate. Callers are effects, so this is the whole dance. */
export async function makeNameplate(name: string, tint: string): Promise<Nameplate | null> {
  await loadPixelFace()
  return paintNameplate(name, tint)
}
