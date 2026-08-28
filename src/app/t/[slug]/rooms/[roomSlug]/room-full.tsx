'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { openOverflowRoom } from '@/domain/rooms/actions'
import type { RoomOccupancy } from '@/domain/rooms/occupancy'
import type { RoomView } from '@/domain/rooms/queries'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Every room is full.
 *
 * Two quite different pages depending on `canOverflow`, and they are one
 * component because the fallback matters: if opening a room fails - the event
 * hit its room ceiling between the render and the click, somebody else
 * overflowed first - the person is already looking at the queue they need.
 *
 * ----------------------------------------------------------------------------
 * Why the overflow fires on mount
 * ----------------------------------------------------------------------------
 * Because "we opened another room and put you in it" is the behaviour, and a
 * button asking somebody to confirm a decision the event has already made is
 * ceremony. It is not done during the render on the server for the reason
 * `openOverflowRoom` sets out - Next prefetches routes, so a render that opened
 * rooms would open them on hover.
 *
 * The guard against firing twice is a ref rather than state, because React runs
 * effects twice in development and two rooms opening for one arrival is exactly
 * the bug that would not show up until an event was running.
 */
export function RoomFull({
  slug,
  room,
  rooms,
  occupancy,
  canOverflow,
}: {
  slug: string
  room: RoomView
  rooms: RoomView[]
  occupancy: Record<string, RoomOccupancy>
  canOverflow: boolean
}) {
  const refusal = useRefusal()
  const t = workspaceDict(useLocale()).rooms
  const router = useRouter()
  const fired = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(canOverflow)

  useEffect(() => {
    if (!canOverflow || fired.current) return
    fired.current = true

    void (async () => {
      const result = await openOverflowRoom(slug)
      if (!result.ok) {
        setError(refusal(result.error))
        setOpening(false)
        return
      }
      router.replace(`/t/${slug}/rooms/${result.slug}`)
    })()
  }, [canOverflow, router, slug, refusal])

  /**
   * Poll while somebody waits.
   *
   * Ten seconds, matching the heartbeat: a place freed by somebody closing
   * their tab shows up within one TTL either way, so a faster poll would only
   * re-render the same numbers. `router.refresh()` rather than a fetch, because
   * the occupancy is computed on the server and this page has no other state to
   * keep.
   */
  useEffect(() => {
    if (opening) return
    const timer = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(timer)
  }, [opening, router])

  return (
    <div className="mx-auto max-w-lg space-y-6 py-12">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">
          {opening ? t.openingAnother : fill(t.isFull, { name: room.name })}
        </h2>
        <p className="text-sm text-ink-muted">
          {opening ? t.openingAnotherBody : t.cappedBody}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
          {error}
        </p>
      )}

      {!opening && (
        <>
          <ul className="space-y-2">
            {rooms.map((other) => {
              const here = occupancy[other.roomId]
              const full = here?.full ?? false

              return (
                <li key={other.roomId}>
                  <Link
                    href={`/t/${slug}/rooms/${other.slug}`}
                    aria-disabled={full}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm transition ${
                      full
                        ? 'pointer-events-none border-line/60 opacity-50'
                        : 'border-accent/50 bg-accent/10 hover:border-accent'
                    }`}
                  >
                    <span className="truncate font-medium">{other.name}</span>
                    <span className="shrink-0 tabular-nums text-xs text-ink-muted">
                      {here?.cap != null ? `${here.count} / ${here.cap}` : ''}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <p className="text-xs text-ink-muted">
            {t.otherRoomsNote}
          </p>

          <Link href={`/t/${slug}/lounge`} className="nav-link text-sm">
            &larr; Wait in the lounge
          </Link>
        </>
      )}
    </div>
  )
}
