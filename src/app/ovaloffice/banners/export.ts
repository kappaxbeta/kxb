'use client'

import { DEVICES, slotRects, type BannerSpec } from '@/domain/banners'

/**
 * Getting the picture off the page.
 *
 * A canvas is already the delivered size, so there is nothing to scale on the
 * way out - `toBlob` and a click on an object URL is the whole of it. PNG
 * rather than JPEG because App Store Connect takes both and one of these is a
 * flat-shaded panel with hard-edged pixel type on it, which is the exact case
 * JPEG ringing is visible on.
 */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    // Revoked on the next turn: revoking in the same tick can beat the click.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}

/** `play_en_iphone.png` - panel, language, canvas, in the order you sort by. */
export function bannerFilename(panelId: string, spec: BannerSpec): string {
  return `${panelId}_${spec.locale}_${spec.device}.png`
}

/**
 * Where to paste the captures, as text.
 *
 * The whole point of the frames is that somebody drops a screenshot into them
 * afterwards, and "somewhere in the middle" is not a crop box. This is the
 * paste list for one banner, in the units an image editor asks for.
 */
export function slotNote(panelId: string, spec: BannerSpec): string {
  // A tilted frame is not at these coordinates any more, and a list of numbers
  // that quietly stopped being true is worse than no list.
  const d = DEVICES[spec.device]
  const rects = slotRects(spec.device, spec.slots, spec.slotLabels, spec.slotLayout)
  const lines = rects.map((r, i) => {
    const name = r.label ?? `slot ${i + 1}`
    return `  ${name}: x ${r.x}, y ${r.y}, ${r.w} × ${r.h}`
  })
  const head = `${panelId}_${spec.locale}_${spec.device} — canvas ${d.w} × ${d.h}`
  const tail = spec.jaunty ? ['', '  (frames are tilted — these are their upright positions)'] : []
  return [head, ...lines, ...tail].join('\n')
}
