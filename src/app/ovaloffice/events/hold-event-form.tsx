'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { localDate } from '@/app/ovaloffice/events/new-event-form'
import { scheduleEvent } from '@/domain/events/actions'
import { DEFAULT_PRESET, EVENT_PRESETS } from '@/domain/events/presets'
import type { EventableSpace } from '@/domain/events/queries'
import { ErrorNote } from '@/app/components/error-note'

/**
 * An event, held in a space that already exists.
 *
 * The sibling of `NewEventForm`, and the two are separate on purpose even
 * though they end up writing the same row. What you are choosing is different:
 * that one asks what to *call* the new space, this one asks *which* space, and
 * a single form with a "new or existing" toggle would spend half its fields
 * disabled whichever way the toggle went.
 *
 * It also does less, which is the point. No space is created, no rooms are
 * stood up and nobody's ownership changes - this space has all of that already,
 * and an operator running a hackathon in a year-old workspace does not want
 * four halls called "Hall 1" appearing in it.
 */
export function HoldEventForm({ spaces }: { spaces: EventableSpace[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestUrl, setGuestUrl] = useState<string | null>(null)

  const [tenantId, setTenantId] = useState('')
  const [filter, setFilter] = useState('')
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [opensAt, setOpensAt] = useState(() => localDate(0))
  const [closesAt, setClosesAt] = useState(() => localDate(2))

  const chosen = EVENT_PRESETS.find((entry) => entry.key === preset)

  // Filtered in the browser: this is every unarchived space, which is a list
  // measured in hundreds, and a round trip per keystroke to narrow it would be
  // slower than the filter it replaced.
  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return spaces
    return spaces.filter(
      (space) =>
        space.name.toLowerCase().includes(needle) ||
        space.slug.toLowerCase().includes(needle),
    )
  }, [spaces, filter])

  function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await scheduleEvent({
        tenantId,
        preset,
        // The inputs are `datetime-local`, which has no timezone. Converted
        // here so what the operator typed is read in *their* clock and stored
        // as an instant.
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setGuestUrl(result.guestUrl)
      setTenantId('')
      router.refresh()
    })
  }

  if (guestUrl) {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">
        <p className="text-sm font-medium text-emerald-200">
          That space is holding an event.
        </p>
        <p className="text-xs text-ink-muted">
          Everything already in it is untouched. This is the link that goes in
          the invite; it expires when the event closes.
        </p>
        <input
          readOnly
          value={guestUrl}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => setGuestUrl(null)}
          className="text-xs text-ink-muted underline"
        >
          Do another
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={spaces.length === 0}
        title={
          spaces.length === 0
            ? 'Every space is already holding an event, or is archived'
            : undefined
        }
        className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50"
      >
        Hold an event in an existing space
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      // `w-full` because the two entry points sit in a flex row while they are
      // still buttons, and an opened form has to break out of it onto a line of
      // its own rather than sharing one with the button beside it.
      className="w-full space-y-4 rounded-xl border border-line bg-surface-raised/40 p-4"
    >
      <ErrorNote>{error}</ErrorNote>

      <div>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Which space</span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a space by name or URL…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </label>

        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {matches.map((space) => (
            <li key={space.tenantId}>
              <button
                type="button"
                onClick={() => setTenantId(space.tenantId)}
                aria-pressed={tenantId === space.tenantId}
                className={`flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  tenantId === space.tenantId
                    ? 'border-accent bg-accent/10'
                    : 'border-line hover:border-accent/60'
                }`}
              >
                <span className="min-w-0 truncate">{space.name}</span>
                <span className="shrink-0 font-mono text-xs text-ink-muted">/{space.slug}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-1 py-2 text-xs text-ink-muted">
              Nothing matching “{filter}”.
            </li>
          )}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Opens</span>
          <input
            type="datetime-local"
            value={opensAt}
            onChange={(event) => setOpensAt(event.target.value)}
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Closes</span>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(event) => setClosesAt(event.target.value)}
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm text-ink-muted">What kind of event</legend>
        {EVENT_PRESETS.map((entry) => (
          <label
            key={entry.key}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition ${
              preset === entry.key ? 'border-accent bg-accent/10' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name="hold-preset"
              value={entry.key}
              checked={preset === entry.key}
              onChange={() => setPreset(entry.key)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{entry.label}</span>
              <span className="block text-xs text-ink-muted">{entry.blurb}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/*
        Said before the button, not after it.

        The preset's flags are a real edit to a space somebody else owns -
        `guest_limit` most of all, because an event in a space that allows five
        guests is not an event. An operator should know that is happening while
        they can still choose a different preset.
      */}
      {chosen && (
        <p className="text-xs text-ink-muted">
          Allows {chosen.roomMax} rooms at {chosen.roomCap} people each and up to{' '}
          {chosen.guestLimit} visitors at once. This overwrites the space’s
          feature flags with the preset’s — nothing built in it is touched, and
          its rooms and members stay exactly as they are.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !tenantId}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? 'Scheduling…' : 'Hold the event here'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
