import type { Metadata } from 'next'
import { WorldViewer } from '@/app/w/world-viewer'
import { decodeWorld } from '@/domain/builder/share'

/**
 * Somebody else's world, from a link.
 *
 * The reason the builder exists at all is to show a customer what they get
 * before they have signed anything, and a PNG only half does that - it is the
 * one angle you happened to choose. This is the other half: the same world,
 * theirs to turn around.
 *
 * ---------------------------------------------------------------------------
 * Why this is public, and why that is safe
 * ---------------------------------------------------------------------------
 * Public because a link you have to log in to open is not a link you can send a
 * customer. Safe because the world is *in* the link and nothing else is: there
 * is no id, so there is nothing to enumerate, and no row, so there is nothing
 * to leak. The only thing a crafted link can ask for is a model, and
 * `decodeWorld` runs every one of them through the shipped catalogue before the
 * renderer sees it - so the worst a hand-written link achieves is a picture of
 * some blocks.
 *
 * It is not secret. Anybody with the link sees the world, which is the whole
 * point of a link, and there is no expiry - the URL is the document, so it
 * works for exactly as long as somebody keeps it.
 */

export const metadata: Metadata = {
  title: 'A world',
  // These are sent to individual customers, not published. Keeping them out of
  // the index costs nothing and stops a half-finished pitch turning up in a
  // search for the company.
  robots: { index: false, follow: false },
}

export default async function WorldPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>
}) {
  const { d } = await searchParams
  const world = decodeWorld(d)
  const empty = world.placements.length === 0

  return (
    <main className="flex min-h-dvh flex-col bg-[oklch(0.14_0.02_285)]">
      <header className="flex items-baseline justify-between gap-4 px-5 py-3">
        <h1 className="text-sm font-medium text-ink">{world.name}</h1>
        <p className="text-xs text-ink-muted">drag to turn · scroll to zoom</p>
      </header>

      {empty ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="max-w-sm text-center text-sm text-ink-muted">
            {d
              ? // The failure this page is most likely to see: a chat client
                // wrapped the link and the tail never arrived.
                'This link did not survive the trip — it looks cut short. Ask for it again, or for the file.'
              : 'Nothing to show. This page needs a world in its link.'}
          </p>
        </div>
      ) : (
        <div className="flex-1">
          <WorldViewer world={world} />
        </div>
      )}
    </main>
  )
}
