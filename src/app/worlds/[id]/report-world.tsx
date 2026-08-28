'use client'

import { useState, useTransition } from 'react'
import { reportWorld, withdrawWorldReport } from '@/domain/worlds/actions'
import { reportReason, WORLD_REPORT_REASONS } from '@/domain/worlds/reports'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Saying what is wrong with somebody's world.
 *
 * Folded away behind one quiet link, and that is the design rather than
 * timidity: a report button given the same weight as "use in my space" invites
 * people to rate worlds, which is a different feature with much worse
 * behaviour. This is for the person who has just walked into a wall.
 *
 * The reasons are a list to pick from rather than a text box, for the reason
 * the vocabulary module gives: a note goes to whoever built the world, and a
 * *category* is the only part that can honestly become a label anybody else
 * reads.
 */
export function ReportWorld({ id, mine }: { id: string; mine: string | null }) {
  const refusal = useRefusal()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(WORLD_REPORT_REASONS[0].id)
  const [note, setNote] = useState('')
  const [note_, setNote_] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Already said something. The offer is to take it back, not to say it again.
  if (mine && !open) {
    const said = reportReason(mine)
    return (
      <p className="text-xs text-ink-muted">
        You reported this world{said ? ` — ${said.badge}` : ''}.{' '}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await withdrawWorldReport(id)
              setNote_(result.ok ? 'report withdrawn' : result.error)
            })
          }
          className="underline hover:text-ink disabled:opacity-50"
        >
          Withdraw
        </button>
        {note_ && <span className="ml-2">{note_}</span>}
      </p>
    )
  }

  if (!open) {
    return (
      <p className="text-xs text-ink-muted">
        <button type="button" onClick={() => setOpen(true)} className="underline hover:text-ink">
          Something wrong with this world?
        </button>
        {note_ && <span className="ml-2">{note_}</span>}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface/40 p-4">
      <p className="text-sm">What is wrong with it?</p>

      <div className="flex flex-col gap-1.5">
        {WORLD_REPORT_REASONS.map((entry) => (
          <label key={entry.id} className="flex items-start gap-2 text-xs">
            <input
              type="radio"
              name="reason"
              value={entry.id}
              checked={reason === entry.id}
              onChange={() => setReason(entry.id)}
              className="mt-0.5"
            />
            <span>
              <span className="text-ink">{entry.label}</span>
              <span className="mt-0.5 block text-ink-muted">{entry.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-ink-muted">
          Anything else? <span className="opacity-60">only the people who built it see this</span>
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          placeholder="The east goal is inside the wall."
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await reportWorld({ id, reason, note })
              if (!result.ok) {
                setNote_(refusal(result.error))
                return
              }
              setOpen(false)
              // Two different things happened, and the reporter is owed the
              // difference: one goes on the card, the other goes to a person.
              setNote_(
                result.moderation
                  ? 'sent to the moderators — somebody will look at it'
                  : 'thank you — two people saying this puts it on the card',
              )
            })
          }
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
