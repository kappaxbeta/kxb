'use client'

import { useMemo, useState } from 'react'

/**
 * Search and paging for a backoffice list, done in the browser.
 *
 * ---------------------------------------------------------------------------
 * Why client-side, and when that stops being right
 * ---------------------------------------------------------------------------
 * Every list under `/ovaloffice` is already fetched whole and handed to a
 * client component as an array - the queries cap themselves (200 links, 200
 * errors, and so on) and the operator reads the lot. So the cheapest thing
 * that gives every one of those pages a search box and a pager is to filter
 * and slice the array that is already in the browser. No new query, no new
 * round trip, and the typing feels instant - which is the whole point of a
 * filter an operator uses to *find* a row rather than to page through history.
 *
 * The line this is on the right side of: the list is bounded and already
 * loaded. The day a list is genuinely unbounded - `page_views`, say, or the
 * full event log - the cap upstream is doing the real work and this only
 * searches the page that cap returned, which is a lie worth avoiding. Those
 * pages want a `?q=` that reaches the database instead. This is for the many
 * lists that are a few hundred rows at most, which is almost all of them.
 *
 * ---------------------------------------------------------------------------
 * Shape
 * ---------------------------------------------------------------------------
 * `haystack` turns a row into the text a query is matched against - usually a
 * few fields joined with spaces. It is called once per row per keystroke, so
 * keep it to reading fields, not formatting them. Matching is case-insensitive
 * and splits the query on whitespace into terms that must *all* appear (AND),
 * because "acme revoked" meaning "the acme rows that are revoked" is what an
 * operator expects and "the rows containing that exact phrase" is not.
 *
 * Paging resets to the first page whenever the query changes, because page 4
 * of a search that now returns two rows is an empty screen that reads as a
 * bug.
 */
export interface TableView<T> {
  /** The current search text, for a controlled `<TableToolbar>` input. */
  query: string
  setQuery: (value: string) => void
  /** Rows on the current page - what the list actually renders. */
  pageRows: T[]
  /** How many rows matched the query, across every page. */
  matchCount: number
  /** How many rows there are in total, before the query. */
  totalCount: number
  page: number
  setPage: (value: number) => void
  pageCount: number
  pageSize: number
}

export function useTableView<T>(
  rows: readonly T[],
  haystack: (row: T) => string,
  { pageSize = 25 }: { pageSize?: number } = {},
): TableView<T> {
  const [query, setQueryRaw] = useState('')
  const [page, setPage] = useState(0)

  // A query change is also a page reset - see the header. Wrapping the setter
  // rather than leaning on an effect keeps the two in one render and avoids the
  // flash of page 4 before the effect corrects it.
  const setQuery = (value: string) => {
    setQueryRaw(value)
    setPage(0)
  }

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return rows
    return rows.filter((row) => {
      const hay = haystack(row).toLowerCase()
      return terms.every((term) => hay.includes(term))
    })
    // `haystack` is defined inline at every call site and would change identity
    // every render; the rows and the query are what actually move the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  // A stale page can outlive its rows when the underlying list shrinks (a
  // revoke, a delete) without the query changing. Clamp on read rather than
  // storing the correction, so the source of truth stays the raw setter.
  const safePage = Math.min(page, pageCount - 1)
  const start = safePage * pageSize

  return {
    query,
    setQuery,
    pageRows: filtered.slice(start, start + pageSize),
    matchCount: filtered.length,
    totalCount: rows.length,
    page: safePage,
    setPage,
    pageCount,
    pageSize,
  }
}

const INPUT =
  'w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-accent'

const PAGER_BUTTON =
  'rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40'

/**
 * The search box above a list, with a live count of what it matched.
 *
 * The count is the honest half: "12 of 340" tells an operator both that the
 * filter caught something and how much it hid, which a bare filtered list does
 * not. When nothing is typed it just states the size, so an empty toolbar is
 * never a blank promise.
 */
export function TableToolbar<T>({
  view,
  placeholder = 'Search…',
  unit = 'rows',
  children,
}: {
  view: TableView<T>
  placeholder?: string
  /** Plural noun for the count, e.g. "links", "reports". */
  unit?: string
  /** Optional controls (extra filters, a "new" button) shown beside the box. */
  children?: React.ReactNode
}) {
  const count =
    view.query && view.matchCount !== view.totalCount
      ? `${view.matchCount} of ${view.totalCount} ${unit}`
      : `${view.totalCount} ${unit}`

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="min-w-[12rem] flex-1">
        <input
          type="search"
          value={view.query}
          onChange={(event) => view.setQuery(event.target.value)}
          placeholder={placeholder}
          className={INPUT}
          aria-label={placeholder}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
      {children}
    </div>
  )
}

/**
 * Prev / next and where you are, shown only when there is more than one page.
 *
 * Hidden at a single page rather than shown disabled: a pager under a list that
 * fits on one screen is chrome that means nothing, and its absence is the
 * clearest way to say "this is all of it".
 */
export function Pager<T>({ view }: { view: TableView<T> }) {
  if (view.pageCount <= 1) return null

  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <button
        type="button"
        className={PAGER_BUTTON}
        onClick={() => view.setPage(view.page - 1)}
        disabled={view.page === 0}
      >
        ← Prev
      </button>
      <span className="tabular-nums">
        Page {view.page + 1} of {view.pageCount}
      </span>
      <button
        type="button"
        className={PAGER_BUTTON}
        onClick={() => view.setPage(view.page + 1)}
        disabled={view.page >= view.pageCount - 1}
      >
        Next →
      </button>
    </div>
  )
}
