'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteWorld, saveWorld } from '@/domain/worlds/actions'
import type { WorldSummary } from '@/domain/worlds/queries'
import { tagLabel } from '@/domain/worlds/tags'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * The platform's own worlds, as a list you can act on.
 *
 * Three verbs, and only three: open it in the builder, change whether anybody
 * can see it, or delete it. Everything else about a world - its name, its
 * blurb, its tags - is edited where it is drawn, because those decisions want
 * the world on screen next to them. A list that could also rename things would
 * be a second, worse editor.
 *
 * Publishing is a toggle here rather than a trip through the builder because
 * it is the one property that is genuinely about the *catalogue* rather than
 * about the world: "take that down" is a thing you decide while looking at the
 * list of what is up.
 */
export function CataloguePanel({ worlds }: { worlds: WorldSummary[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  /** Which row is asking twice. One latch, because only one question fits on screen. */
  const [confirming, setConfirming] = useState<string | null>(null)

  function setVisibility(world: WorldSummary, visibility: 'private' | 'public'): void {
    setNote(null)
    startTransition(async () => {
      // The details are sent back as they are: this action is a whole-row save,
      // and omitting them would blank the blurb and the tags to change one
      // boolean. The document is left out, which is what keeps it from
      // round-tripping a megabyte to flip a switch.
      const result = await saveWorld({
        scope: { kind: 'platform' },
        id: world.id,
        details: {
          name: world.name,
          blurb: world.blurb ?? undefined,
          tags: world.tags,
          visibility,
        },
      })
      setNote(
        result.ok
          ? `“${world.name}” is ${visibility === 'public' ? 'in the catalogue' : 'no longer listed'}`
          : result.error,
      )
      if (result.ok) router.refresh()
    })
  }

  function remove(world: WorldSummary): void {
    setNote(null)
    setConfirming(null)
    startTransition(async () => {
      const result = await deleteWorld({ scope: { kind: 'platform' }, id: world.id })
      setNote(result.ok ? `deleted “${world.name}”` : result.error)
      if (result.ok) router.refresh()
    })
  }

  // Name, blurb and tag labels are what an operator scans the catalogue for.
  const view = useTableView(
    worlds,
    (world) => `${world.name} ${world.blurb ?? ''} ${world.tags.map(tagLabel).join(' ')}`,
  )

  if (worlds.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-secondary/40 px-4 py-6 text-sm text-muted-foreground">
        Nothing published from here yet.{' '}
        <Link href="/ovaloffice/builder" className="underline">
          Build one
        </Link>
        , or run <code className="font-mono">bun run worlds:seed</code> to publish the
        starters.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      <TableToolbar view={view} placeholder="Search by name or tag…" unit="worlds" />

      <ul className="space-y-2">
        {view.pageRows.map((world) => (
          <li
            key={world.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <Link href={`/worlds/${world.id}`} className="hover:underline">
                  {world.name}
                </Link>
                {world.visibility === 'private' && (
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    draft
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                {world.blocks.toLocaleString()} blocks · used {world.uses.toLocaleString()}× ·
                seen {world.views.toLocaleString()}×
                {world.tags.length > 0 && ` · ${world.tags.map(tagLabel).join(', ')}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/ovaloffice/builder?world=${world.id}`}
                className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary"
              >
                Open
              </Link>

              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  setVisibility(world, world.visibility === 'public' ? 'private' : 'public')
                }
                className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-40"
              >
                {world.visibility === 'public' ? 'Take down' : 'Publish'}
              </button>

              {/* Asked twice, unlike everything else in this panel: taking a
                  world down is undone by pressing the other button, and
                  deleting one is not undone at all. */}
              {confirming === world.id ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(world)}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40"
                >
                  Delete for good
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirming(world.id)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary disabled:opacity-40"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Pager view={view} />
    </div>
  )
}
