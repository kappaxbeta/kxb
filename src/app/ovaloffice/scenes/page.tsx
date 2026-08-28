import Link from 'next/link'
import { resolveFeatures } from '@/domain/flags/queries'
import { listScenes } from '@/domain/scenes/queries'
import { requireBackofficeSection } from '@/lib/backoffice'
import { ScenesList } from './scenes-list'

export const metadata = { title: 'Scenes' }

/**
 * Everything the studio has kept.
 *
 * Names and nothing else. A page like this one must not mount a WebGL canvas
 * per card - twenty scenes would be twenty renderers, forty glTFs and a tab
 * that stops responding before the list has finished laying out - so a card is
 * a link, and the 3D starts when you open one.
 */
export default async function ScenesPage() {
  const { supabase } = await requireBackofficeSection('scenes')
  const [scenes, features] = await Promise.all([
    listScenes(supabase, { tenantId: null }),
    resolveFeatures(supabase),
  ])

  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Scenes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved from the motion studio. Opening one edits that scene rather
            than a copy of it.
          </p>
        </div>
        <Link
          href="/ovaloffice/studio?v="
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-secondary"
        >
          New scene
        </Link>
      </header>

      {scenes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing saved yet. Compose something in the studio and press save.
        </p>
      ) : (
        <ScenesList scenes={scenes} showRender={features.renders} />
      )}
    </section>
  )
}
