'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  closeRoom,
  createRoom,
  setRoomCap,
  setRoomGuestBuild,
} from '@/domain/rooms/actions'
import type { RoomView } from '@/domain/rooms/queries'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The rooms of a space, and the door to open another.
 *
 * Two audiences on one page, which is why the create form is not a separate
 * screen: most people come here to walk into a room, and the handful who can
 * open one are the same people who came to walk into a room. Hiding the form
 * behind a wizard would be ceremony for a text field.
 */
export function RoomsPanel({
  slug,
  rooms,
  occupancy,
  isEvent,
  canManage,
}: {
  slug: string
  rooms: RoomView[]
  /**
   * How full each room is, keyed by room id.
   *
   * A plain object rather than the Map the server built, because a Map does not
   * survive the serialization boundary into a client component - it arrives as
   * `{}` with no error, which is the kind of bug that looks like "the badges
   * just never show".
   *
   * Empty for a space with no caps at all, which is every space that is not an
   * event, and the badges simply do not render.
   */
  occupancy: Record<string, { count: number; cap: number | null; full: boolean }>
  /**
   * Is this space an event? Decides whether the per-room controls appear at
   * all - a cap and a guest-build rule have nothing to act on otherwise.
   */
  isEvent: boolean
  /** Owner or admin, and the space can still write. */
  canManage: boolean
}) {
  const refusal = useRefusal()
  const t = workspaceDict(useLocale()).rooms
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function open(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createRoom(slug, name)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      setName('')
      // Refresh before navigating, so the rail beside the new page already has
      // the room in it. `revalidatePath` marked the layout stale on the server;
      // this is what sends the client to fetch it.
      router.refresh()
      // Straight in. A room opens empty - no floor, nothing to stand on - and
      // the first thing anybody wants to do is lay one, which is a click away
      // once you are inside it.
      router.push(`/t/${slug}/rooms/${result.slug}`)
    })
  }

  return (
    <div className="space-y-8">
      <ErrorNote>{error}</ErrorNote>

      {canManage && (
        <form onSubmit={open} className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={60}
            className="min-w-56 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending || name.trim().length === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {pending ? t.opening : t.openRoom}
          </button>
        </form>
      )}

      {rooms.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {canManage ? t.emptyCanManage : t.empty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rooms.map((room) => {
            const here = occupancy[room.roomId]
            const full = here?.full ?? false

            return (
            <li
              key={room.roomId}
              className={`rounded-xl border bg-surface-raised/40 p-4 transition ${
                full
                  ? 'border-line/60 opacity-60'
                  : 'border-line hover:border-accent-2/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/t/${slug}/rooms/${room.slug}`}
                  className="block truncate font-medium hover:underline"
                >
                  {room.name}
                </Link>

                {/*
                  Shown only where there is a cap, so an ordinary space's rooms
                  look exactly as they always have. `n / cap` rather than a
                  percentage or a bar: somebody deciding which room to walk into
                  wants the two numbers, and "80% full" does not say whether one
                  more person fits.
                */}
                {here && here.cap !== null && (
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums ${
                      full
                        ? 'border-amber-400/40 text-amber-300'
                        : 'border-line text-ink-muted'
                    }`}
                  >
                    {full ? t.full : `${here.count} / ${here.cap}`}
                  </span>
                )}
              </div>

              <p className="mt-1 text-xs text-ink-muted">
                {full ? t.fullBody : t.ownWorld}
              </p>

              {canManage && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    // The blocks survive - closing only takes it off the list -
                    // but saying so in a confirm would be longer than the
                    // reassurance is worth. Same call `archiveBattlefield` makes.
                    //
                    // A level room has no blocks to survive, so it is a delete
                    // and is named one - see the same pair of sentences in the
                    // rooms rail.
                    if (
                      !confirm(
                        fill(room.xpRef ? t.confirmDelete : t.confirmClose, {
                          name: room.name,
                        }),
                      )
                    ) {
                      return
                    }
                    setError(null)
                    startTransition(async () => {
                      const result = await closeRoom(slug, room.roomId)
                      if (!result.ok) setError(refusal(result.error))
                      else router.refresh()
                    })
                  }}
                  className="mt-3 rounded-lg border border-red-400/40 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
                >
                  {room.xpRef ? t.delete : t.close}
                </button>
              )}

              {/*
                Only where there is an event, because a cap and a guest-build
                rule are meaningless in an ordinary space - nobody is a guest
                there for long, and no cap is in force. An ordinary rooms page
                looks exactly as it always has.
              */}
              {canManage && isEvent && (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs">
                  <label className="flex items-center gap-2">
                    <span className="text-ink-muted">{t.cap}</span>
                    <input
                      type="number"
                      min={2}
                      max={40}
                      defaultValue={room.cap ?? ''}
                      placeholder={String(here?.cap ?? '')}
                      disabled={pending}
                      onBlur={(input) => {
                        const raw = input.target.value.trim()
                        const next = raw === '' ? null : Number(raw)
                        if (next === room.cap) return
                        setError(null)
                        startTransition(async () => {
                          const result = await setRoomCap(slug, room.roomId, next)
                          if (!result.ok) setError(refusal(result.error))
                          else router.refresh()
                        })
                      }}
                      className="w-16 rounded border border-line bg-surface px-2 py-1 tabular-nums"
                    />
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      defaultChecked={room.guestBuild}
                      disabled={pending}
                      onChange={(input) => {
                        const allowed = input.target.checked
                        setError(null)
                        startTransition(async () => {
                          const result = await setRoomGuestBuild(slug, room.roomId, allowed)
                          if (!result.ok) setError(refusal(result.error))
                          else router.refresh()
                        })
                      }}
                    />
                    <span className="text-ink-muted">{t.guestsMayBuild}</span>
                  </label>
                </div>
              )}
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
