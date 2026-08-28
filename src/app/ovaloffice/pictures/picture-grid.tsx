'use client'

import { Check, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Picture } from '@/domain/pictures/catalogue'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * The picture list, grouped by folder.
 *
 * A client component for two small reasons that both matter here: the filter,
 * which is instant on a few hundred files and pointless as a round trip, and
 * copying a path, which is the one thing anybody does with this page that is
 * not looking.
 */
export function PictureGrid({ pictures }: { pictures: Picture[] }) {
  const [copied, setCopied] = useState<string | null>(null)

  // Path, folder and file name are what an operator scans for - the folder to
  // narrow to a set, the name to find one file. A bigger page suits image tiles.
  const view = useTableView(
    pictures,
    (picture) => `${picture.path} ${picture.folder} ${picture.name}`,
    { pageSize: 48 },
  )

  // Group only the current page, so a folder heading counts what is on screen.
  const groups = useMemo(() => {
    const byFolder = new Map<string, Picture[]>()
    for (const picture of view.pageRows) {
      byFolder.set(picture.folder, [...(byFolder.get(picture.folder) ?? []), picture])
    }
    return [...byFolder.entries()]
  }, [view.pageRows])

  return (
    <div className="space-y-6">
      <TableToolbar view={view} placeholder="Filter by path" unit="pictures" />

      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nothing matches that.
        </p>
      )}

      {groups.map(([folder, items]) => (
        <section key={folder} className="space-y-2">
          <h3 className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            {folder} · {items.length}
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {items.map((picture) => (
              <li
                key={picture.path}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                {/* Plain <img>: static files, fixed box, nothing for the
                    optimiser to save on a page only admins open. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={picture.path}
                  alt={picture.name}
                  loading="lazy"
                  className="aspect-square w-full bg-secondary/40 object-cover"
                />
                <div className="flex items-center gap-1 p-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                    {picture.name}
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(picture.path)
                      setCopied(picture.path)
                    }}
                    aria-label={`Copy ${picture.path}`}
                    className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    {copied === picture.path ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <Copy className="size-3.5" aria-hidden />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Pager view={view} />
    </div>
  )
}
