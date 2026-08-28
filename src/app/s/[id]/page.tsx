import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { WatchScene } from '@/app/s/[id]/watch-scene'
import { findScene } from '@/domain/scenes/queries'
import { encodeShot } from '@/domain/studio/shot'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * A scene, to watch.
 *
 * The whole of "send it to a friend". No account, no space, no chrome: a page
 * that plays one scene and says who made it, at an address short enough to
 * paste into a message.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the editor with the panels hidden
 * ---------------------------------------------------------------------------
 * Because the audience is different in a way that changes what the page *is*.
 * A viewer cannot edit, so there is nothing to protect and nothing to load: no
 * timeline, no inspector, no recorder, none of the several hundred inputs that
 * make the editor a heavy page. They also arrive from a link on a phone, which
 * is the case the editor is worst at.
 *
 * ---------------------------------------------------------------------------
 * Who may see it
 * ---------------------------------------------------------------------------
 * Not decided here. `findScene` goes through the row-level policy, which lets
 * anonymous readers see `visibility = 'public'` and nothing else - so a private
 * scene 404s for a stranger and opens for its author, from the same code. The
 * `notFound()` is deliberately the same answer for "no such scene" and "not
 * yours": a link that said "this exists but you may not watch it" would be
 * telling a stranger something about somebody else's drafts.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const scene = await findScene(supabase, id)
  if (!scene) return { title: 'Scene' }

  return {
    title: scene.name,
    description: scene.blurb ?? `A ${Math.round(scene.seconds)}-second scene.`,
    // No image. There is no stored still any more - see
    // 20260904030000_scene_poster_out.sql - and a card with a broken picture in
    // it is worse than a card with none.
    openGraph: { title: scene.name, description: scene.blurb ?? undefined },
  }
}

export default async function WatchScenePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const scene = await findScene(supabase, id)
  if (!scene) notFound()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-medium">{scene.name}</h1>
        {scene.blurb && <p className="mt-1 text-sm text-ink-muted">{scene.blurb}</p>}
      </header>

      {/* The document is handed over as the studio's own encoding, so the
          viewer parses it with exactly the parser that wrote it. */}
      <WatchScene document={encodeShot(scene.document)} name={scene.name} />

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
        <span>
          {scene.castSize} {scene.castSize === 1 ? 'animal' : 'animals'} ·{' '}
          {Math.round(scene.seconds)}s
        </span>
        <span className="flex-1" />
        <Link href="/" className="underline-offset-2 hover:underline">
          Made with kxb.team
        </Link>
      </footer>
    </main>
  )
}
