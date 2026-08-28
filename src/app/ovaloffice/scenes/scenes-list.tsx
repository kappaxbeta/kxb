'use client'

import { Clapperboard } from 'lucide-react'
import Link from 'next/link'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'
import type { SceneSummary } from '@/domain/scenes/queries'
import { RenderButton } from './render-button'

export function ScenesList({
  scenes,
  showRender,
}: {
  scenes: SceneSummary[]
  showRender: boolean
}) {
  // Haystack: name, blurb, visibility, id — what an operator scans a scene by.
  const view = useTableView(
    scenes,
    (scene) =>
      `${scene.name} ${scene.blurb ?? ''} ${scene.visibility} ${scene.id}`,
  )

  return (
    <div>
      <TableToolbar view={view} placeholder="Search scenes…" unit="scenes" />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {view.pageRows.map((scene) => (
          <li
            key={scene.id}
            className="overflow-hidden rounded-2xl border border-border transition hover:border-accent/60"
          >
            {/* The card is a link and the render button is not inside it -
                a button nested in an anchor is invalid, and more to the point
                a click that queues work must not also be a click that
                navigates away from where you would see it. */}
            <Link
              href={`/ovaloffice/studio?scene=${scene.id}`}
              className="group block"
            >
              {/* No thumbnail. A scene is its document and its id - see the
                  note in 20260904030000_scene_poster_out.sql - so a card is a
                  name until somebody opens it and the renderer starts. */}
              <span className="flex aspect-video w-full items-center justify-center bg-secondary/60 transition group-hover:bg-secondary">
                <Clapperboard className="size-8 text-muted-foreground" aria-hidden />
              </span>
              <span className="flex items-baseline gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{scene.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {scene.seconds}s
                </span>
              </span>
              {scene.blurb && (
                <span className="block px-3 pb-2 text-xs leading-relaxed text-muted-foreground">
                  {scene.blurb}
                </span>
              )}
              <span className="flex items-center gap-2 px-3 pb-2.5 text-xs text-muted-foreground">
                <span>
                  {scene.castSize} {scene.castSize === 1 ? 'animal' : 'animals'}
                </span>
                {scene.visibility === 'public' && <span className="text-accent">shared</span>}
              </span>
            </Link>
            {showRender && (
              <div className="border-t border-border px-3 py-2">
                <RenderButton sceneId={scene.id} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <Pager view={view} />
    </div>
  )
}
