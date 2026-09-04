'use client'

import { useState } from 'react'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { unblockUser } from '@/domain/blocks/actions'

/**
 * Everyone you have blocked, and the way back.
 *
 * The half of blocking that has nowhere else to live. Making a block is
 * something you do to a line in front of you - the button is on the chat line,
 * where the problem is - but undoing one is something you do to a *person*, and
 * by then their lines are gone from every panel you can see. Without this page
 * a block would be a decision with no exit.
 *
 * Rendered even when the list is empty, and that is deliberate: the sentence it
 * prints is where somebody finds out the feature exists and where the button
 * is. A panel that appears only once you have used it teaches nobody.
 *
 * Held as client state seeded from the server, not re-fetched. Unblocking is
 * the only thing on this page that changes the list, and it happens here - so
 * the row leaves the moment the action returns and the page is never out of
 * step with itself.
 */
export function BlockedPanel({
  initial,
}: {
  initial: { userId: string; name: string }[]
}) {
  const t = settingsDict(useLocale()).blocked
  const [people, setPeople] = useState(initial)
  /** Which row is mid-request, so only that button goes quiet. */
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-line bg-surface-raised/40 p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.body}</p>
      </div>

      {people.length === 0 ? (
        <p className="text-xs leading-relaxed text-ink-muted/80">{t.none}</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-lg border border-line/60">
          {people.map((person) => (
            <li
              key={person.userId}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="truncate text-sm text-ink">{person.name}</span>
              <button
                type="button"
                disabled={busy === person.userId}
                onClick={async () => {
                  setBusy(person.userId)
                  setSaid(null)
                  const result = await unblockUser(person.userId)
                  setBusy(null)
                  if (!result.ok) {
                    setSaid(result.error)
                    return
                  }
                  setPeople((current) =>
                    current.filter((row) => row.userId !== person.userId),
                  )
                  setSaid(t.unblocked)
                }}
                /*
                 * The name is in the label rather than in the button, and that
                 * is not the same string twice: a row of buttons all reading
                 * "Unblock" is unusable to a screen reader, and a button
                 * reading "Unblock user-a1b2c3" beside the name it repeats
                 * wraps to two lines on a phone for no information at all. The
                 * visible word is short because the row it sits in already
                 * says who.
                 */
                aria-label={fill(t.unblock, { name: person.name })}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-[11px] font-medium text-ink transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === person.userId ? t.unblocking : t.unblockShort}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        One live region for the whole list rather than one per row. A screen
        reader should hear "unblocked" once, not hear the list re-announce
        itself because a row left it.
      */}
      <p className="text-[11px] leading-relaxed text-ink-muted" aria-live="polite">
        {said}
      </p>
    </div>
  )
}
