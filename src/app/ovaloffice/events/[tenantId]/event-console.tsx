'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  closeEventNow,
  configureEvent,
  featureEvent,
  retireEvent,
} from '@/domain/events/actions'
import {
  budgetVerdict,
  EVENT_CAPABILITIES,
  EVENT_CAPABILITY_LABELS,
  EVENT_SURFACE_LABELS,
  EVENT_SURFACES,
  type EventCapability,
  type EventSurface,
} from '@/domain/events/presets'
import type { EventView } from '@/domain/events/queries'
import { ErrorNote } from '@/app/components/error-note'

interface RoomRow {
  roomId: string
  name: string
  cap: number | null
  guestBuild: boolean
  count: number
  effectiveCap: number | null
}

export function EventConsole({
  tenantId,
  slug,
  event,
  rooms,
  staffSwitches,
}: {
  tenantId: string
  slug: string
  event: EventView
  rooms: RoomRow[]
  staffSwitches: Array<{ key: string; label: string; on: boolean }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [opensAt, setOpensAt] = useState(() => toLocal(event.opensAt))
  const [closesAt, setClosesAt] = useState(() => toLocal(event.closesAt))
  const [writes, setWrites] = useState<EventCapability[]>(event.guestWrites)
  const [surfaces, setSurfaces] = useState<EventSurface[]>(event.surfaces)
  const [roomCap, setRoomCap] = useState(event.roomCap)
  const [roomMax, setRoomMax] = useState(event.roomMax)
  const [roomOverflow, setRoomOverflow] = useState(event.roomOverflow)
  /**
   * Held locally as well as re-read on refresh, because this button toggles
   * rather than submits: the label is the state, and waiting for the round trip
   * to relabel it makes a control that looks like it did not take the press.
   */
  const [featured, setFeatured] = useState(event.featured)

  const budget = budgetVerdict(roomMax, roomCap)

  function save(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await configureEvent({
        tenantId,
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
        guestWrites: writes,
        surfaces,
        roomCap,
        roomMax,
        roomOverflow,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <ErrorNote>{error}</ErrorNote>
      {saved && (
        <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          Saved. It takes effect on the next page anybody loads.
        </p>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">The window</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Opens</span>
            <input
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Closes</span>
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2"
            />
          </label>
        </div>
        <p className="text-xs text-ink-muted">
          Closing stops new arrivals and stops guests writing. Nobody standing in
          the space is thrown out — their passes run out on their own, so the
          room empties instead of emptying mid-sentence.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">What a visitor may do</h3>
        <p className="text-xs text-ink-muted">
          The ceiling. The event&rsquo;s own admins can switch any of these off
          during the day, but never on beyond what is ticked here.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EVENT_CAPABILITIES.map((capability) => (
            <label key={capability} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={writes.includes(capability)}
                onChange={() => setWrites(toggle(writes, capability))}
              />
              {EVENT_CAPABILITY_LABELS[capability]}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Where a visitor may go</h3>
        <p className="text-xs text-ink-muted">
          One anonymous link opens all of these. Members, billing and settings
          are never on this list.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EVENT_SURFACES.map((surface) => (
            <label key={surface} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={surfaces.includes(surface)}
                onChange={() => setSurfaces(toggle(surfaces, surface))}
              />
              {EVENT_SURFACE_LABELS[surface]}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Rooms</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">People per room</span>
            <input
              type="number"
              min={2}
              max={40}
              value={roomCap}
              onChange={(e) => setRoomCap(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 tabular-nums"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Most rooms</span>
            <input
              type="number"
              min={1}
              max={64}
              value={roomMax}
              onChange={(e) => setRoomMax(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 tabular-nums"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={roomOverflow}
              onChange={(e) => setRoomOverflow(e.target.checked)}
            />
            Open another when full
          </label>
        </div>

        {/*
          The number that stops an event melting.

          A full venue costs SEND_HZ x cap x (cap-1) per room, summed over the
          rooms, and the budget is per *tenant* - so a configuration over it
          does not slow the crowded room down, it drops frames for everybody in
          the space at once. That failure is invisible from the inside, which is
          why it is spelled out here rather than left to be discovered.
        */}
        <p
          className={`rounded-lg border px-3 py-2 text-xs ${
            budget.over
              ? 'border-amber-400/50 bg-amber-500/10 text-amber-200'
              : 'border-line text-ink-muted'
          }`}
        >
          {roomMax} rooms × {roomCap} people, everybody moving at once, is{' '}
          <strong className="tabular-nums">
            {budget.worstCase.toLocaleString()}
          </strong>{' '}
          messages a second against a budget of{' '}
          <span className="tabular-nums">{budget.budget.toLocaleString()}</span>.
          {budget.over
            ? ' Over. Lower the cap, or raise the Realtime limit on the box this runs on.'
            : ' Comfortable.'}
        </p>

        {rooms.length > 0 && (
          <ul className="space-y-1 text-xs">
            {rooms.map((room) => (
              <li
                key={room.roomId}
                className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
              >
                <span className="truncate">{room.name}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {room.count} / {room.effectiveCap ?? '∞'}
                  {room.cap !== null && ' (own cap)'}
                  {!room.guestBuild && ' · no guest building'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">What the staff have switched on</h3>
        <p className="text-xs text-ink-muted">
          Read-only here. These belong to the event&rsquo;s own admins, who set
          them in the space at{' '}
          <a href={`/t/${slug}/settings/space`} className="underline">
            /t/{slug}/settings/space
          </a>
          . A visitor may do something only when both halves say yes.
        </p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {staffSwitches.map((entry) => (
            <li key={entry.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">{entry.label}</span>
              <span className={entry.on ? 'text-emerald-300' : 'text-amber-300'}>
                {entry.on ? 'on' : 'off'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/*
        The front page, which is the one thing on this console that is about us
        rather than about them.

        Its own switch and its own action rather than a field on the form
        above, because it is not part of the event's terms and saving the terms
        should not be how it changes. It is also the only control here whose
        effect is outside the event entirely - somebody pressing it is putting a
        customer's banner in front of every visitor to kxb.team.
      */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">The front page</h3>
        <p className="text-xs text-ink-muted">
          Shows this event&rsquo;s banner on kxb.team, over the button its host
          chose. Nothing happens until they have composed one and put it on{' '}
          <a href={`/e/${slug}`} className="underline">
            /e/{slug}
          </a>
          , so this can be set in advance.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const result = await featureEvent(tenantId, !featured)
              if (!result.ok) setError(result.error)
              else {
                setFeatured(!featured)
                router.refresh()
              }
            })
          }}
          className={`rounded-lg border px-4 py-2 text-sm transition disabled:opacity-50 ${
            featured
              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
              : 'border-line text-ink-muted hover:border-accent/60 hover:text-ink'
          }`}
        >
          {featured ? 'On the front page — take it off' : 'Put it on the front page'}
        </button>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>

        {event.phase !== 'ended' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm('Close this event now? Nobody new can join afterwards.')) return
              setError(null)
              startTransition(async () => {
                const result = await closeEventNow(tenantId)
                if (!result.ok) setError(result.error)
                else router.refresh()
              })
            }}
            className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
          >
            Close now
          </button>
        )}

        {/*
          The other ending, and a different one.

          Close moves the closing time to now: the row stays, so this is still
          an event - one that is over - and a guest holding a live pass keeps
          reading what they spent the weekend making. Retire deletes the row, so
          the space stops being an event at all and carries on as an ordinary
          workspace. That is the outcome /events is selling, which is why it is
          a button somebody presses on purpose and not something the clock does.

          Offered at any phase, because an event cancelled the week before it
          opens wants this too.
        */}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                'Keep the space and drop the event?\n\n' +
                  'Nothing built in it is touched — the worlds, rooms, pages, chat and members all stay. ' +
                  'It simply stops being an event, so visitors lose what the event let them write.',
              )
            )
              return
            setError(null)
            startTransition(async () => {
              const result = await retireEvent(tenantId)
              if (!result.ok) setError(result.error)
              // Back to the list rather than refreshing: this page is the
              // console for an event that no longer exists.
              else router.push('/ovaloffice/events')
            })
          }}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-muted transition hover:bg-surface-raised disabled:opacity-50"
        >
          Keep as a normal space
        </button>
      </div>

      <p className="text-xs text-ink-muted">
        Retiring leaves the preset&rsquo;s feature flags where they are — they
        are ordinary tenant overrides, editable on the flags page.
      </p>
    </form>
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

/** UTC instant to what `datetime-local` wants: the operator's own clock. */
function toLocal(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
