'use client'

import { useState, useTransition } from 'react'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { closeMyAccount } from '@/domain/account/actions'
import type { CloseObstacles } from '@/domain/account/obstacles'

/**
 * The way out, at the bottom of the page.
 *
 * ---------------------------------------------------------------------------
 * Two steps, and the first one is the important one
 * ---------------------------------------------------------------------------
 * Closed by default and opened by a button, then a typed word. Not because
 * anybody expects the word to stop a determined person - it is not a security
 * device - but because the collapsed state is what stops the *undetermined*
 * one. This panel sits directly under the language picker on a page people open
 * to change their avatar, and a live "delete everything" button in that
 * neighbourhood is a mis-tap waiting to happen on a phone.
 *
 * The three sentences above the button are the whole design. An event-sourced
 * product cannot honestly promise that every trace of somebody is unwritten -
 * see `closeAccount` - so it says exactly what goes, exactly what stays, and
 * why the second list is not a weasel: a room they furnished belongs to the
 * space around it, and it carries no name of theirs afterwards.
 *
 * ---------------------------------------------------------------------------
 * The one refusal that is worth drawing
 * ---------------------------------------------------------------------------
 * Being the last owner of a space other people are in is not an error - it is a
 * thing to go and do something about - so the refusal comes back with the
 * spaces named and links into each one. Every other failure is a sentence.
 */
export function CloseAccountPanel({ obstacles }: { obstacles: CloseObstacles }) {
  const t = settingsDict(useLocale()).close
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [error, setError] = useState<string | null>(null)
  /**
   * The spaces standing in the way, as the *server* last answered it.
   *
   * Seeded from the page's own read so the panel can warn before anybody types
   * anything, and replaced by whatever comes back from a refusal - because
   * between opening this page and pressing the button somebody may well have
   * gone and promoted an owner in another tab.
   */
  const [blocking, setBlocking] = useState(obstacles.handOver)
  const [pending, startTransition] = useTransition()

  const stranded = blocking.length > 0

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-red-500/30 bg-red-500/[0.04] p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.body}</p>
      </div>

      <ul className="space-y-1.5 text-xs leading-relaxed text-ink-muted">
        <li>— {t.goes}</li>
        <li>— {t.stays}</li>
        <li>— {t.final}</li>
      </ul>

      {stranded && (
        <div className="space-y-2 rounded-lg border border-line bg-surface-raised/60 p-3">
          <p className="text-xs font-medium text-ink">{t.blockersTitle}</p>
          <p className="text-[11px] leading-relaxed text-ink-muted">{t.blockersBody}</p>
          <ul className="flex flex-wrap gap-2">
            {blocking.map((space) => (
              <li key={space.slug}>
                {/*
                  A plain anchor, not `<Link>`: this navigates out of the
                  workspace layout this panel is drawn inside, and the members
                  page it lands on is where both answers - promote somebody, or
                  archive it - actually live.
                */}
                <a
                  href={`/t/${space.slug}/members`}
                  className="rounded-full border border-line px-3 py-1 text-[11px] text-ink transition hover:bg-white/10"
                >
                  {fill(t.blockerSpace, { name: space.name })}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-red-500/50 px-4 py-2 text-xs font-medium text-red-500 transition hover:bg-red-500/10"
        >
          {t.start}
        </button>
      ) : (
        <div className="space-y-3 border-t border-line/60 pt-4">
          <p className="text-xs font-medium text-ink">{t.confirmTitle}</p>
          <label className="block space-y-1">
            <span className="text-[11px] text-ink-muted">
              {fill(t.confirmHint, { word: t.confirmWord })}
            </span>
            <input
              type="text"
              value={word}
              onChange={(event) => setWord(event.target.value)}
              aria-label={t.confirmLabel}
              // Autocorrect and capitalisation both off: a phone keyboard that
              // helpfully turns CLOSE into Close would make the one field on
              // this page that must match exactly the one field somebody
              // cannot fill in.
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-48 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-[var(--color-accent)]"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || stranded || word.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  setError(null)
                  const result = await closeMyAccount(word)
                  /*
                   * Only a refusal ever gets here. A success redirects, and a
                   * redirect from a Server Action never returns to its caller -
                   * so there is no success branch to write and no "closed"
                   * state to draw. `t.done` exists for the message below,
                   * which is what somebody sees for the moment the navigation
                   * takes.
                   */
                  if (result.ok) return
                  setError(result.error)
                  if (result.obstacles) setBlocking(result.obstacles.handOver)
                })
              }
              className="rounded-full bg-red-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? t.working : t.confirm}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false)
                setWord('')
                setError(null)
              }}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:bg-white/10"
            >
              {t.cancel}
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-red-500" aria-live="polite">
            {error ?? (pending ? t.done : null)}
          </p>
        </div>
      )}
    </div>
  )
}
