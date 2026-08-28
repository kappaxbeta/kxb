'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setEventHeader } from '@/domain/events/header-actions'
import type { EventLink } from '@/domain/events/queries'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

/**
 * What the banner says, edited by the people running the event.
 *
 * The banner is the one surface every attendee sees on every page, and until
 * now it said only when the doors shut - which is ours to know and nothing to
 * do with what is happening in the room. This is the host's half: the line at
 * the top, a couple of sentences under it, and the four links they would
 * otherwise be pasting into chat every twenty minutes.
 *
 * Rows carry a client-side `id` rather than being keyed by index, because a
 * list you can delete from the middle of is the exact case where index keys
 * make React reuse the wrong input - you delete the second link and watch the
 * third one's text stay put while its URL changes.
 */
type Row = EventLink & { id: string }

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`

export function EventHeaderForm({
  slug,
  initialHeadline,
  initialBlurb,
  initialLinks,
}: {
  slug: string
  initialHeadline: string | null
  initialBlurb: string | null
  initialLinks: EventLink[]
}) {
  const refusal = useRefusal()
  const t = settingsDict(useLocale()).event
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [headline, setHeadline] = useState(initialHeadline ?? '')
  const [blurb, setBlurb] = useState(initialBlurb ?? '')
  const [rows, setRows] = useState<Row[]>(() =>
    initialLinks.map((link) => ({ ...link, id: newId() })),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function edit(id: string, patch: Partial<EventLink>) {
    setSaved(false)
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function save() {
    setError(null)
    setSaved(false)

    startTransition(async () => {
      // Blank rows are dropped rather than refused. Pressing Add and changing
      // your mind is not an error worth a red sentence, and the alternative -
      // "give the link a name" pointing at a row the host never filled in - is
      // the form arguing with somebody who has already agreed with it.
      const links = rows
        .map((row) => ({ name: row.name.trim(), url: row.url.trim() }))
        .filter((row) => row.name || row.url)

      const result = await setEventHeader(slug, {
        headline: headline.trim(),
        blurb: blurb.trim(),
        links,
      })

      if (!result.ok) {
        setError(refusal(result.error))
        return
      }

      setRows(links.map((link) => ({ ...link, id: newId() })))
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface-raised/40 p-5">
      <div>
        <h2 className="font-semibold text-ink">{t.header}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t.headerBody}</p>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <label className="block space-y-1">
        <span className="text-sm text-ink-muted">{t.headline}</span>
        <input
          value={headline}
          onChange={(changed) => {
            setSaved(false)
            setHeadline(changed.target.value)
          }}
          maxLength={80}
          placeholder={t.headlineExample}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-ink-muted">
          {t.underIt} <span className="text-xs">{t.underItHint}</span>
        </span>
        <textarea
          value={blurb}
          onChange={(changed) => {
            setSaved(false)
            setBlurb(changed.target.value)
          }}
          maxLength={280}
          rows={3}
          placeholder={t.blurbExample}
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm text-ink-muted">
          {t.links} <span className="text-xs">{t.linksHint}</span>
        </p>

        {rows.length === 0 && (
          <p className="text-xs text-ink-muted">
            {t.noLinks}
          </p>
        )}

        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2">
              <input
                value={row.name}
                onChange={(changed) => edit(row.id, { name: changed.target.value })}
                maxLength={40}
                placeholder={t.linkNameExample}
                aria-label={t.linkName}
                className="w-32 shrink-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <input
                value={row.url}
                onChange={(changed) => edit(row.id, { url: changed.target.value })}
                maxLength={300}
                inputMode="url"
                placeholder="https://…"
                aria-label={t.linkAddress}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => {
                  setSaved(false)
                  setRows((current) => current.filter((entry) => entry.id !== row.id))
                }}
                aria-label={fill(t.removeLink, { name: row.name || t.thisLink })}
                className="shrink-0 rounded-lg border border-line px-2.5 py-2 text-xs text-ink-muted transition hover:border-red-400/50 hover:text-red-300"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={rows.length >= 8}
          onClick={() => setRows((current) => [...current, { id: newId(), name: '', url: '' }])}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-40"
        >
          {rows.length >= 8 ? t.linkLimit : t.addLink}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg border border-accent/60 bg-accent/15 px-4 py-2 text-sm text-ink transition hover:bg-accent/25 disabled:opacity-50"
        >
          {pending ? t.saving : t.saveHeader}
        </button>
        {saved && !pending && (
          <span className="text-xs text-emerald-300">{t.headerSaved}</span>
        )}
      </div>
    </section>
  )
}
