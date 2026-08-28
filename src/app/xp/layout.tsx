import type { Viewport } from 'next'
import { LocaleProvider } from '@/app/i18n/locale-context'
import { readLocale } from '@/app/i18n/preference'
import { FixedSurface } from '@/app/xp/fixed'

/**
 * These routes are surfaces, not documents, and the phone has to be told.
 *
 * ---------------------------------------------------------------------------
 * Here and not in the root layout, which is the whole point
 * ---------------------------------------------------------------------------
 * `userScalable: false` on `src/app/layout.tsx` would take pinch-zoom off the
 * landing page, the Impressum and every workspace panel - pages made of text,
 * where being able to zoom is an accessibility affordance and not a defect. Next
 * resolves `viewport` per route segment, so declaring it on this layout covers
 * `/xp` and `/xp/<id>` and `/xp/<id>/edit` and reaches nothing else.
 *
 * What it stops: a pinch scaling the editor's panels and the level's HUD, a
 * double-tap zooming into a gizmo, and - once either of those had happened - the
 * page panning under a drag that was meant to turn the camera or move a crate.
 *
 * `maximumScale` as well as `userScalable`, because the two are read by
 * different browsers and neither alone covers both. Neither covers Safari on
 * iOS at all, which ignores both by design; `FixedSurface` is that half.
 *
 * `viewportFit: 'cover'` goes with the `black-translucent` status bar the root
 * layout already asks for: without it an installed level is letterboxed by the
 * notch it was meant to run under.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

/**
 * The language every level is played in.
 *
 * These routes sit outside `/t/[slug]`, which is where the app's other
 * `LocaleProvider` lives, so without this the whole XP runtime would read the
 * default and every German player would get an English controls panel over a
 * German level. A layout rather than a wrapper on each page, because the
 * runtime is mounted from three of them and a fourth is one PR away.
 *
 * No markup of its own. It is a provider and a pair of viewport decisions, so
 * nothing here changes how a canvas is sized or where the HUD sits over it -
 * `FixedSurface` renders null and only ever touches `<html>`.
 */
export default async function XpLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider locale={await readLocale()}>
      <FixedSurface />
      {children}
    </LocaleProvider>
  )
}
