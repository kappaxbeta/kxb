/**
 * Where everything sits, on each of the two canvases.
 *
 * These are the numbers App Store Connect asks for - a 6.9" iPhone and a 13"
 * iPad - and every measurement below is in real output pixels rather than in
 * percentages, because the one thing this file has to be able to answer is
 * "where exactly do I paste the screenshot", and a percentage cannot be typed
 * into a crop box.
 *
 * The vertical order is fixed and it is an argument, not a habit: the hook
 * first (mark, pixel headline, stance), then the cast, then the capture, then
 * the explanation, then a row of colour to stop the panel ending on grey. A
 * reader scanning a row of six thumbnails reads the top third of each and
 * nothing else, so the joke and the picture have to be above the fold of a
 * thumbnail - which is roughly the first 40% of the canvas.
 */
import type { DeviceKey, SlotLayout, SlotRect } from '@/domain/banners/spec'

export interface DeviceGeometry {
  label: string
  w: number
  h: number
  padX: number
  logoH: number
  headTop: number
  headlineTop: number
  headlineSize: number
  /** The headline shrinks until its wrapped block fits above this line. */
  headReserve: number
  tagSize: number
  charY: number
  charH: number
  /** The cast box, as a fraction of the content width. */
  charW: number
  heroSize: number
  slot: { x: number; y: number; w: number; h: number }
  /** Height of the caption strip over each slot, when a panel has more than one. */
  slotLabelH: number
  /** A three-slot panel narrows on the iPad - see `slotRects`. */
  slotNarrowW: number
  titleTop: number
  titleSize: number
  bodyTop: number
  bodySize: number
  bodyH: number
  bandY: number
  bandH: number
  bandGap: number
  bandCount: number
}

/**
 * The two layouts that were laid out by hand.
 *
 * Everything else is one of these scaled, which is honest rather than lazy:
 * the three iPhone canvases are 1290×2796, 1284×2778 and 1242×2688, and their
 * aspect ratios agree to within two parts in a thousand. Three hand-tuned
 * copies of the same column would be three things to keep in step for a
 * difference nobody can see.
 */
const IPHONE_BASE: DeviceGeometry = {
  label: 'iPhone 6.9" — 1290 × 2796',
  w: 1290, h: 2796, padX: 78,
  logoH: 118, headTop: 112, headlineTop: 268, headlineSize: 92, headReserve: 600, tagSize: 44,
  charY: 560, charH: 420, charW: 0.72, heroSize: 320,
  slot: { x: 78, y: 1006, w: 1134, h: 1150 },
  slotLabelH: 44, slotNarrowW: 1134,
  titleTop: 2200, titleSize: 72, bodyTop: 2374, bodySize: 39, bodyH: 224,
  bandY: 2614, bandH: 146, bandGap: 24, bandCount: 7,
}

const IPAD_BASE: DeviceGeometry = {
  label: 'iPad 13" — 2064 × 2752',
  w: 2064, h: 2752, padX: 150,
  logoH: 136, headTop: 128, headlineTop: 300, headlineSize: 108, headReserve: 620, tagSize: 52,
  charY: 590, charH: 448, charW: 0.66, heroSize: 360,
  slot: { x: 150, y: 1058, w: 1764, h: 1080 },
  slotLabelH: 52, slotNarrowW: 1180,
  titleTop: 2180, titleSize: 86, bodyTop: 2364, bodySize: 45, bodyH: 210,
  bandY: 2590, bandH: 150, bandGap: 32, bandCount: 9,
}

/**
 * The same column, on a canvas of a different size.
 *
 * Horizontal lengths scale with the width and vertical ones with the height, so
 * a canvas that is proportionally shorter loses the height from the gaps rather
 * than from one unlucky element. Type scales with the *width*, because what
 * decides whether a headline fits is how many characters go across - the
 * headline fitter then re-measures against the real font anyway, so a size that
 * comes out a pixel large is corrected rather than clipped.
 */
function scaled(base: DeviceGeometry, label: string, w: number, h: number): DeviceGeometry {
  const sx = w / base.w
  const sy = h / base.h
  const rx = (n: number) => Math.round(n * sx)
  const ry = (n: number) => Math.round(n * sy)
  return {
    label,
    w,
    h,
    padX: rx(base.padX),
    logoH: rx(base.logoH),
    headTop: ry(base.headTop),
    headlineTop: ry(base.headlineTop),
    headlineSize: rx(base.headlineSize),
    headReserve: ry(base.headReserve),
    tagSize: rx(base.tagSize),
    charY: ry(base.charY),
    charH: ry(base.charH),
    charW: base.charW,
    heroSize: rx(base.heroSize),
    slot: { x: rx(base.slot.x), y: ry(base.slot.y), w: rx(base.slot.w), h: ry(base.slot.h) },
    slotLabelH: ry(base.slotLabelH),
    slotNarrowW: rx(base.slotNarrowW),
    titleTop: ry(base.titleTop),
    titleSize: rx(base.titleSize),
    bodyTop: ry(base.bodyTop),
    bodySize: rx(base.bodySize),
    bodyH: ry(base.bodyH),
    bandY: ry(base.bandY),
    bandH: ry(base.bandH),
    bandGap: rx(base.bandGap),
    bandCount: base.bandCount,
  }
}

export const DEVICES: Record<DeviceKey, DeviceGeometry> = {
  iphone69: IPHONE_BASE,
  // The 6.5" slot takes either of these two and refuses 1290 × 2796, which is
  // the whole reason they are here.
  iphone67: scaled(IPHONE_BASE, 'iPhone 6.7" — 1284 × 2778', 1284, 2778),
  iphone65: scaled(IPHONE_BASE, 'iPhone 6.5" — 1242 × 2688', 1242, 2688),
  ipad13: IPAD_BASE,
  ipad129: scaled(IPAD_BASE, 'iPad 12.9" — 2048 × 2732', 2048, 2732),
}

/**
 * The rectangles a capture gets pasted into.
 *
 * One slot is the whole area. More than one either stacks as strips or stands
 * side by side, and which one is a real decision rather than a preference:
 * strips suit an editor screenshot and columns suit a phone screenshot, so the
 * wrong choice crops the picture rather than merely arranging it oddly.
 *
 * Stacked strips narrow on the iPad, because a strip the full width of that
 * canvas is six to one and nothing anybody screenshots is that shape. Columns
 * do not, because the narrowing they need is the split itself.
 *
 * The same arithmetic answers both "draw the frame" and "tell me the
 * coordinates", so the numbers printed beside the preview are the numbers on
 * the picture rather than a second guess at them.
 */
export function slotRects(
  device: DeviceKey,
  slots: number,
  labels: string[] = [],
  layout: SlotLayout = 'rows',
): SlotRect[] {
  const d = DEVICES[device]
  const n = Math.max(1, Math.min(3, slots))
  if (n === 1) return [{ ...d.slot, label: labels[0] ?? null }]

  const lh = d.slotLabelH
  const gap = Math.round(d.w / 58)

  if (layout === 'columns') {
    const w = Math.floor((d.slot.w - gap * (n - 1)) / n)
    const h = d.slot.h - lh
    return Array.from({ length: n }, (_, i) => ({
      x: d.slot.x + i * (w + gap),
      y: d.slot.y + lh,
      w,
      h,
      label: labels[i] ?? null,
    }))
  }

  /* Trimmed to the canvas's own parity, so the centring is exact rather than
   * half a pixel out. Nobody sees half a pixel, but `slots.json` prints these
   * numbers as the place to paste a capture, and a coordinate that is rounded
   * off its own geometry is a coordinate that is quietly wrong. */
  const wide = d.slotNarrowW - ((d.w - d.slotNarrowW) % 2)
  const x = (d.w - wide) / 2
  const h = Math.floor((d.slot.h - n * lh - (n - 1) * gap) / n)
  return Array.from({ length: n }, (_, i) => ({
    x,
    y: d.slot.y + i * (lh + h + gap) + lh,
    w: wide,
    h,
    label: labels[i] ?? null,
  }))
}
