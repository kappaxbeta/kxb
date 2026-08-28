'use client'

import Link from 'next/link'
import type { Frequency } from '@/domain/analytics/frequency'
import { SORT_LABELS, SORTS, type Sort } from '@/domain/analytics/frequency-sort'
import { sectionLabel } from '@/domain/analytics/sections'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'
import { lastSeenAt } from '../parts'

/**
 * The Pages frequency table, with a client-side search box and pager over the
 * rows the server already sorted and capped. The query never reaches the
 * database - it filters the bounded list handed down. See `_table/table-view`.
 *
 * Sorting and the folded/paths switch stay server-driven through the URL, so
 * `sort` and `folded` arrive as props and only shape how a row is drawn.
 */
export function PagesList({
  rows,
  folded,
  sort,
}: {
  rows: Frequency[]
  folded: boolean
  sort: Sort
}) {
  // Haystack: what an operator scans for - the raw path, the route key, and its
  // friendly label.
  const view = useTableView(
    rows,
    (row) => `${row.path ?? ''} ${row.section} ${sectionLabel(row.section)}`,
    { pageSize: 50 },
  )

  return (
    <>
      <TableToolbar view={view} unit="rows" placeholder="Search pages…" />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs text-muted-foreground">
            <tr>
              {SORTS.map((column) => (
                <th
                  key={column}
                  className={`px-3 py-2 font-medium ${
                    column === 'path' ? '' : 'text-right'
                  }`}
                >
                  {/* Sorting through the URL, so a sorted table is a link you
                      can send and it works with JavaScript off. */}
                  <Link
                    href={`/ovaloffice/analytics/pages?view=${
                      folded ? 'sections' : 'paths'
                    }&sort=${column}`}
                    className={`transition hover:text-foreground ${
                      column === sort ? 'text-foreground underline underline-offset-4' : ''
                    }`}
                  >
                    {column === 'path' && folded ? 'Route' : SORT_LABELS[column as Sort]}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.pageRows.map((row) => (
              <tr
                key={row.path ?? row.section}
                className="border-t border-border hover:bg-secondary"
              >
                <td className="px-3 py-2">
                  {folded ? (
                    <>
                      {sectionLabel(row.section)}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {row.section}
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-xs">{row.path}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.day || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.week || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.month || '—'}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{row.year}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {row.visitors}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">
                  {lastSeenAt(row.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing recorded in the past year.
          </p>
        )}
      </div>

      <Pager view={view} />
    </>
  )
}
