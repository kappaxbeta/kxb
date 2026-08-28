import type { Metadata } from 'next'
import { CanyonScene } from '@/app/components/canyon/canyon-scene'

export const metadata: Metadata = {
  title: 'Canyon',
  description: 'A corridor of black glass with an aurora falling into the end of it.',
  // Scenery, not a page anybody should arrive at from a search result.
  robots: { index: false, follow: false },
}

/**
 * Somewhere to look at the canyon.
 *
 * The scene fills its parent rather than the viewport, which is what makes it
 * usable as a background elsewhere - dropping <CanyonScene /> into any
 * positioned element is the whole of mounting it. Here it has the screen to
 * itself, which is the honest way to judge it.
 */
export default function ExperimentPage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0a0616]">
      <CanyonScene />
    </main>
  )
}
