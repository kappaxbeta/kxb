import type { Metadata } from 'next'
import { InkScene } from '@/app/components/ink/ink-scene'
import { settingsFromQuery } from '@/app/components/ink/ink-settings'

export const metadata: Metadata = {
  title: 'Ink',
  description: 'Red ink in black water, with something pale swimming through it.',
  // Scenery, not a page anybody should arrive at from a search result.
  robots: { index: false, follow: false },
}

/**
 * Somewhere to look at the ink.
 *
 * Like the canyon next door, the scene fills its parent rather than the
 * viewport, so it can be dropped behind anything positioned. Here it has the
 * whole screen and takes the pointer, because the point of this one is to
 * put a hand in it. The query can carry a look - `?mode=neon&blob=1` - which
 * is read here on the server so the first frame is already that look.
 */
export default async function InkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  // `?warm=30` opens onto water that has been going for half a minute.
  const warm = Number(Array.isArray(query.warm) ? query.warm[0] : query.warm)
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black">
      <InkScene initial={settingsFromQuery(query)} warm={Number.isFinite(warm) ? Math.min(60, Math.max(0, warm)) : undefined} />
    </main>
  )
}
