'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createEvent } from '@/domain/events/actions'
import { DEFAULT_PRESET, EVENT_PRESETS } from '@/domain/events/presets'
import { ErrorNote } from '@/app/components/error-note'

/**
 * One form, one press, a standing event.
 *
 * It creates the space, writes its terms, applies the preset's feature flags,
 * pre-creates the rooms and mints the guest link. Splitting that into five
 * steps would be more honest about what happens and much worse to use: every
 * one of them is implied by the other four, and an operator who did four of the
 * five has an event that does not work.
 */
export function NewEventForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestUrl, setGuestUrl] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [opensAt, setOpensAt] = useState(() => localDate(0))
  const [closesAt, setClosesAt] = useState(() => localDate(2))

  const chosen = EVENT_PRESETS.find((entry) => entry.key === preset)

  function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createEvent({
        name,
        slug,
        preset,
        // The inputs are `datetime-local`, which has no timezone. Converted here
        // rather than sent as-is, so what the operator typed is read in *their*
        // clock and stored as an instant - a naked local string would be read as
        // UTC by Postgres and an event would open an hour early in summer.
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setGuestUrl(result.guestUrl)
      setName('')
      setSlug('')
      router.refresh()
    })
  }

  if (guestUrl) {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">
        <p className="text-sm font-medium text-emerald-200">The event is standing.</p>
        <p className="text-xs text-ink-muted">
          This is the link that goes in the calendar invite. It expires when the
          event closes, so it cannot admit anybody the week after.
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
          Create another
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium"
      >
        Set up an event
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="w-full space-y-4 rounded-xl border border-line bg-surface-raised/40 p-4">
      <ErrorNote>{error}</ErrorNote>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">What it is called</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              // Only while the operator has not touched the URL themselves.
              // Overwriting a slug somebody typed would be the kind of helpful
              // that loses work.
              if (!slug || slug === slugify(name)) setSlug(slugify(event.target.value))
            }}
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Its URL</span>
          <input
            value={slug}
            onChange={(event) => setSlug(slugify(event.target.value))}
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs"
          />
        </label>

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
              name="preset"
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

      {chosen && (
        <p className="text-xs text-ink-muted">
          Starts with {chosen.roomMax} rooms allowed at {chosen.roomCap} people
          each, and up to {chosen.guestLimit} visitors inside at once. All of it
          is editable afterwards.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !name.trim() || !slug.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? 'Building…' : 'Create the event'}
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

/** The same shape `createTenantSchema` accepts, applied as somebody types. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * `datetime-local` wants `YYYY-MM-DDTHH:mm` in the *browser's* clock.
 *
 * `toISOString()` would be UTC and would show an operator in Berlin a time two
 * hours off what they meant, so the offset is subtracted before slicing.
 *
 * Exported because the form next door needs the same defaults, and two copies
 * of a timezone conversion is two places for it to be wrong.
 */
export function localDate(daysFromNow: number): string {
  const date = new Date(Date.now() + daysFromNow * 86_400_000)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
