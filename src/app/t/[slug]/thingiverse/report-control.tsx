'use client'

import { useState, useTransition } from 'react'

import { MIN_REPORT_REASON, type ReportKind } from '@/domain/moderation/content'
import { reportContent } from '@/domain/moderation/content-actions'

/**
 * Saying that something somebody made is not alright.
 *
 * ---------------------------------------------------------------------------
 * Why it is a flag and not a menu item
 * ---------------------------------------------------------------------------
 * Because the moment somebody wants this, they want it *now* and they want it
 * to be over. A report buried two clicks into an overflow menu is one that gets
 * abandoned halfway, and an abandoned report is indistinguishable from nothing
 * being wrong. So: one small control, in the corner of the thing, that opens a
 * box asking the only question worth asking.
 *
 * It is deliberately quiet until hovered or focused. A shelf covered in red
 * flags reads as an accusation waiting to happen, and most of what is on any
 * shelf is fine.
 *
 * ---------------------------------------------------------------------------
 * The reason is required, and that is not friction for its own sake
 * ---------------------------------------------------------------------------
 * A one-click report is a vote, and a queue of votes tells a moderator that
 * somebody was annoyed rather than what they should look at. `MIN_REPORT_REASON`
 * is about four words - enough for "the name is a slur", which is exactly the
 * kind of report that is instantly actionable.
 *
 * Nobody is told who reported. That is said on the form rather than left to be
 * assumed, because the fear of being identified is the main reason people watch
 * something offensive stay up.
 */
export interface ReportLabels {
  report: string
  reportHint: string
  reportSend: string
  reportSent: string
}

export function ReportControl({
  slug,
  kind,
  targetId,
  title,
  labels,
}: {
  slug: string
  kind: ReportKind
  targetId: string
  /** What it is called right now, captured with the report. See the column. */
  title: string
  /**
   * The four words, rather than a slice of the dictionary.
   *
   * This is dropped into three panels whose `t` is a different depth of the
   * same dict - the shelf holds `thingiverse`, the clips panel holds
   * `thingiverse.clips` - and taking one of those would mean threading the
   * parent through a component tree that had no reason to carry it. Four
   * strings is the whole of what this needs, and it says so.
   */
  labels: ReportLabels
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (sent) {
    return <span className="text-[10px] text-ink-muted">{labels.reportSent}</span>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.report}
        title={labels.report}
        className="shrink-0 rounded px-1 text-[11px] leading-none text-ink-muted/50 transition hover:text-red-400 focus-visible:text-red-400"
      >
        ⚑
      </button>
    )
  }

  return (
    <div className="w-full space-y-1.5">
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={labels.reportHint}
        rows={2}
        autoFocus
        className="w-full rounded-lg border border-line/60 bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent/70"
      />
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          // Disabled rather than refused on submit: the bound is knowable while
          // somebody is still typing, and a Save that looks ready and is not is
          // the failure every other panel in this app avoids.
          disabled={pending || reason.trim().length < MIN_REPORT_REASON}
          onClick={() =>
            start(async () => {
              setError(null)
              const result = await reportContent(slug, { kind, targetId, title, reason })
              if (result.ok) setSent(true)
              else setError(result.error)
            })
          }
          className="rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink disabled:opacity-40"
        >
          {labels.reportSend}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setReason('')
            setError(null)
          }}
          className="rounded-lg border border-line/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
