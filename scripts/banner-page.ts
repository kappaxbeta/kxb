/**
 * The browser half of `render-banners.ts`.
 *
 * Not a route and not imported by any page - it exists so the render script has
 * something to bundle. It puts the painter on `window` and nothing else, so the
 * script and the backoffice draw through exactly the same code: one template,
 * one config, two ways of asking for a picture.
 */
import { paintBanner } from '@/app/ovaloffice/banners/paint'
import { PANELS, TAGLINE } from '@/domain/banners/panels'
import { bannerSeed } from '@/domain/banners/seed'
import type { BannerSpec, DeviceKey } from '@/domain/banners/spec'
import type { Locale } from '@/domain/i18n/locale'

declare global {
  interface Window {
    paint: (
      panelId: string, locale: Locale, device: DeviceKey, captures: (string | null)[],
    ) => Promise<string>

  }
}

window.paint = async (panelId, locale, device, captures) => {
  const p = PANELS.find((x) => x.id === panelId)
  if (!p) throw new Error(`no panel ${panelId}`)
  const spec: BannerSpec = {
    device,
    locale,
    copy: p.copy[locale],
    character: p.character,
    hero: p.hero,
    band: p.band,
    slots: p.slots,
    slotLayout: p.slotLayout ?? 'rows',
    slotLabels: p.slotLabels ? p.slotLabels[locale].slice(0, p.slots) : [],
    // From disk, so always filled edge to edge: a file somebody put in
    // `marketing/captures/` for a named frame was cropped for that frame.
    captures: Array.from({ length: p.slots }, (_, i) => {
      const src = captures[i]
      return src ? { src, fit: 'cover' as const } : null
    }),
    // The script draws the set as it ships. A word on the picture and a
    // different colour for it are compositional choices somebody makes one
    // panel at a time, which is what the page is for.
    slotTexts: Array.from({ length: p.slots }, () => null),
    slotTextColor: '#5ce8e0',
    slotTextPlace: 'over' as const,
    jaunty: false,
    sparkles: true,
    tagline: TAGLINE[locale],
    seed: bannerSeed(p.id),
  }
  const canvas = document.createElement('canvas')
  await paintBanner(canvas, spec)
  return canvas.toDataURL('image/png')
}
