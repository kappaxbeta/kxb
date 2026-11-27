import type { Metadata } from 'next'

import { readLocale } from '@/app/i18n/preference'
import { worldDict } from '@/app/i18n/world'
import { InkPad } from '@/app/world/_ink'

export const metadata: Metadata = {
  title: 'Xoinggan',
  description: 'Neon ink you can write with, and the words it understands.',
  // Scenery and workbench, like the canyon and the water next door. Not
  // something anybody should arrive at from a search result.
  robots: { index: false, follow: false },
}

/**
 * Somewhere to write, with nothing else on the screen.
 *
 * The pad itself is `world/_ink` and is dropped into the store page as well;
 * this route is the version with no page around it, which is where the letters
 * were tuned and the quickest way to look at one thing at a time.
 */
export default async function PenPage() {
  const dict = worldDict(await readLocale())
  return (
    <main className="grid min-h-dvh w-full place-items-center p-4">
      <InkPad
        labels={dict.ink}
        words={{ free: 'Free', chase: 'Chase', idle: 'write anything', written: 'written' }}
        className="max-w-3xl"
      />
    </main>
  )
}
