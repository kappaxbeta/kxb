'use client'

import Link from 'next/link'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'
import type { EventListItem } from '@/domain/events/queries'

export function EventsList({ events }: { events: EventListItem[] }) {
  // Haystack: name, slug, preset, phase — what an operator scans an event by.
  const view = useTableView(
    events,
    (event) =>
      `${event.name} ${event.slug} ${event.preset} ${event.phase}${event.archived ? ' archived' : ''}`,
  )

  return (
    <div>
      <TableToolbar view={view} placeholder="Search events…" unit="events" />

      <ul className="space-y-2">
        {view.pageRows.map((event) => (
          <li key={event.tenantId}>
            <Link
              href={`/ovaloffice/events/${event.tenantId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised/40 p-4 transition hover:border-accent/60"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{event.name}</span>
                <span className="block text-xs text-ink-muted">
                  /{event.slug} · {event.preset} ·{' '}
                  {new Date(event.opensAt).toLocaleDateString()} –{' '}
                  {new Date(event.closesAt).toLocaleDateString()}
                </span>
              </span>

              <PhaseBadge phase={event.phase} archived={event.archived} />
            </Link>
          </li>
        ))}
      </ul>

      <Pager view={view} />
    </div>
  )
}

/**
 * Running, upcoming or over.
 *
 * Computed from the clock rather than stored, exactly as `event_open()` does in
 * SQL, so this badge and the door a guest is refused at can never disagree
 * about what time it is.
 */
function PhaseBadge({
  phase,
  archived,
}: {
  phase: 'upcoming' | 'running' | 'ended'
  archived: boolean
}) {
  if (archived) {
    return (
      <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
        Archived
      </span>
    )
  }

  const styles = {
    running: 'border-emerald-400/40 text-emerald-300',
    upcoming: 'border-sky-400/40 text-sky-300',
    ended: 'border-line text-ink-muted',
  } as const

  const labels = { running: 'Running', upcoming: 'Upcoming', ended: 'Ended' } as const

  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${styles[phase]}`}>
      {labels[phase]}
    </span>
  )
}
