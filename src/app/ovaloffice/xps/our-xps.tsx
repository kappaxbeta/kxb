'use client'

import { useActionState, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'
import {
  clearBuiltinOverlay,
  revertBuiltin,
  setBuiltinPublished,
  uploadBuiltinDocument,
  type BuiltinResult,
} from '@/domain/xps/builtin-actions'
import type { BuiltinRow } from '@/domain/xps/builtins'

/**
 * One row per level we ship, and everything you can do to one.
 *
 * ---------------------------------------------------------------------------
 * The row is a link first
 * ---------------------------------------------------------------------------
 * Same argument the review queue makes and for the same reason: a level has
 * rules in it, and neither a screenshot nor a byte count can tell you the
 * finish line is reachable. So the name goes to the player and the buttons come
 * after it.
 *
 * ---------------------------------------------------------------------------
 * Why "put in" is a file input rather than a text area
 * ---------------------------------------------------------------------------
 * Because the thing on the other end is a *download*. Save in the creator's
 * editor writes `<id>.xp.json` to disk, and the shortest honest round trip is
 * to hand that same file straight back. A paste box would work and would also
 * invite half a document.
 */

type Result = BuiltinResult | null

function useWrite(run: (formData: FormData) => Promise<BuiltinResult>) {
  return useActionState(async (_previous: Result, formData: FormData) => run(formData), null)
}

function Refusal({ state }: { state: Result }) {
  if (!state || state.ok) return null
  return (
    <p role="alert" className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-red-400">
      {state.error}
    </p>
  )
}

const BUTTON =
  'rounded-lg border border-neutral-700 px-2.5 py-1 text-xs transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40'

export function OurXps({ rows, canWrite }: { rows: BuiltinRow[]; canWrite: boolean }) {
  // Name, id and blurb are what an operator scans this list for.
  const view = useTableView(rows, (row) => `${row.name} ${row.id} ${row.blurb ?? ''}`)

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-5 text-sm text-neutral-400">
        Nothing under <code>public/xp/xps/</code>.
      </p>
    )
  }

  return (
    <div>
      <TableToolbar view={view} placeholder="Search by name or id…" unit="levels" />
      <ul className="space-y-3">
        {view.pageRows.map((row) => (
          <li key={row.id}>
            <Row row={row} canWrite={canWrite} />
          </li>
        ))}
      </ul>
      <Pager view={view} />
    </div>
  )
}

function Row({ row, canWrite }: { row: BuiltinRow; canWrite: boolean }) {
  const [publishState, publish, publishing] = useWrite(setBuiltinPublished)
  const [uploadState, upload, uploading] = useWrite(uploadBuiltinDocument)
  const [revertState, revert, reverting] = useWrite(revertBuiltin)
  const [clearState, clear, clearing] = useWrite(clearBuiltinOverlay)

  const fileId = useId()
  const form = useRef<HTMLFormElement>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  const broken = row.problems.length > 0

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-md bg-neutral-950">
          {row.cover ? (
            /* eslint-disable-next-line @next/next/no-img-element -- a static
               shot under /public, drawn by `bun run xp:shot`. */
            <img src={row.cover} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[10px] text-neutral-600">
              no shot
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-medium">
            {/* Into the player, not into a detail page: the question this list
                cannot answer is what it is like to be in there. */}
            <Link href={`/xp/${row.id}`} className="hover:underline">
              {row.name}
            </Link>
          </h3>

          <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
            {row.id}.xp.json · {formatBytes(row.bytes)} ·{' '}
            {new Date(row.updatedAt).toLocaleDateString()}
          </p>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={row.published ? 'good' : 'muted'}>
              {row.published ? 'listed' : 'unlisted'}
            </Badge>
            {row.overridden && <Badge tone="warn">overridden</Badge>}
            {!row.shipped && <Badge tone="warn">not in the repo</Badge>}
            {row.framed && <Badge tone="muted">cartridge</Badge>}
            {row.needs.map((need) => (
              <Badge key={need} tone="muted">
                needs {need}
              </Badge>
            ))}
            {!broken && !row.framed && (
              <Badge tone="muted">
                {row.pieces} pieces · {row.things} things
              </Badge>
            )}
          </div>

          {row.blurb && !broken && (
            <p className="mt-2 line-clamp-2 text-sm text-neutral-300">{row.blurb}</p>
          )}

          {broken && (
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-amber-900/60 bg-amber-950/20 p-2 font-mono text-[11px] leading-relaxed text-amber-300">
              {row.problems.join('\n')}
            </pre>
          )}

          {row.overridden && (
            <p className="mt-2 text-xs leading-relaxed text-amber-400/90">
              Being served from the database, not from the image. A deploy will not
              change what players get until this is put back.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
        <Link href={`/xp/${row.id}`} className={BUTTON}>
          Open
        </Link>
        <Link href={`/xp/${row.id}/edit`} className={BUTTON}>
          Edit
        </Link>
        {/* A plain link rather than a form: the route reads through the overlay,
            so this is the document being served and not the possibly-stale file
            next door under /public. */}
        <a href={`/api/xp/builtin/${row.id}`} className={BUTTON} download>
          Download
        </a>

        {canWrite && (
          <>
            <form action={publish} className="contents">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="published" value={row.published ? 'false' : 'true'} />
              <button type="submit" className={BUTTON} disabled={publishing}>
                {row.published ? 'Unlist' : 'List'}
              </button>
            </form>

            <form ref={form} action={upload} className="contents">
              <input type="hidden" name="id" value={row.id} />
              <input
                id={fileId}
                type="file"
                name="document"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  setChosen(event.target.files?.[0]?.name ?? null)
                  // Submitted on choice rather than behind a second button: the
                  // file picker is already a confirmation, and a chosen-but-not-
                  // submitted file is the state people leave the page in.
                  form.current?.requestSubmit()
                }}
              />
              <label htmlFor={fileId} className={`${BUTTON} cursor-pointer`}>
                {uploading ? 'Putting in…' : 'Put a document in'}
              </label>
            </form>

            {row.overridden && (
              <form action={revert} className="contents">
                <input type="hidden" name="id" value={row.id} />
                <button type="submit" className={BUTTON} disabled={reverting}>
                  Put the shipped one back
                </button>
              </form>
            )}

            {!row.shipped && !row.overridden && (
              <form action={clear} className="contents">
                <input type="hidden" name="id" value={row.id} />
                <button type="submit" className={BUTTON} disabled={clearing}>
                  Clear this row
                </button>
              </form>
            )}
          </>
        )}

        {chosen && !uploading && (
          <span className="text-xs text-neutral-500">{chosen}</span>
        )}
      </div>

      <Refusal state={publishState} />
      <Refusal state={uploadState} />
      <Refusal state={revertState} />
      <Refusal state={clearState} />
    </article>
  )
}

function Badge({
  tone,
  children,
}: {
  tone: 'good' | 'warn' | 'muted'
  children: React.ReactNode
}) {
  const colour =
    tone === 'good'
      ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-300'
      : tone === 'warn'
        ? 'border-amber-900/70 bg-amber-950/30 text-amber-300'
        : 'border-neutral-800 bg-neutral-900 text-neutral-400'

  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${colour}`}>
      {children}
    </span>
  )
}

/** Bytes as something readable. Whole KB below a megabyte, one decimal above. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
}
