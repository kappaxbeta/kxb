'use client'

import { useState, useTransition } from 'react'
import {
  grantCoins,
  hideFromBestList,
  showOnBestList,
} from '@/domain/bank/backoffice-actions'

/**
 * Taking somebody off a space's best list, or putting them back.
 *
 * `docs/product/economy.md` §13. Deliberately small and deliberately awkward:
 * it asks for a reason before it will do anything, and there is no way to skip
 * that. This is the one operator power in the product whose subject is never
 * told, so the cost of using it is a sentence somebody has to write.
 *
 * It also carries the *grant*, which is the one control in this product that
 * creates coins from nothing. Same requirement - a sentence saying why - and
 * the same audit row. See `grantCoins`.
 *
 * The button does not report the current state, and that is not an oversight -
 * `leaderboard_hidden` has no read policy for a session and the page does not
 * fetch it, because a control that shows who is hidden is a list somebody can
 * screenshot. Hiding twice is harmless (the row is upserted), and undoing is
 * its own button rather than a toggle for the same reason: an operator should
 * have to mean each of them separately.
 */
export function HideControls({
  tenantId,
  userId,
}: {
  tenantId: string
  userId: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(action: typeof hideFromBestList, coins?: string) {
    const form = new FormData()
    form.set('tenantId', tenantId)
    form.set('userId', userId)
    form.set('reason', reason)
    // Only the grant reads it, and only the grant is ever handed one.
    if (coins !== undefined) form.set('amount', coins)
    start(async () => {
      const result = await action(form)
      setNote(result.ok ? 'Done' : result.error)
      if (result.ok) {
        setReason('')
        setAmount('')
        setOpen(false)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
      >
        Ranking
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        value={reason}
        placeholder="Why"
        onChange={(event) => setReason(event.target.value)}
        className="w-40 rounded border border-line/60 bg-surface px-1.5 py-0.5 text-[11px] outline-none"
      />
      <button
        type="button"
        // Refused without a reason here as well as on the server. The server is
        // the guard; this is so an operator is not told off by a round trip for
        // something the form already knew.
        disabled={pending || reason.trim().length === 0}
        onClick={() => run(hideFromBestList)}
        className="rounded border border-line/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] disabled:opacity-40"
      >
        Hide
      </button>
      <button
        type="button"
        disabled={pending || reason.trim().length === 0}
        onClick={() => run(showOnBestList)}
        className="rounded border border-line/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] disabled:opacity-40"
      >
        Show
      </button>
      {/*
        Putting coins back.

        Beside the ranking controls because it shares their one requirement - a
        sentence saying why - and because both are things you do *to* a person
        from the same row. It is a separate box rather than a third button on
        the same field, though: hiding somebody costs nothing and this creates
        coins out of nothing, and two gestures that different should not sit one
        tab apart with the same input feeding both.
      */}
      <input
        type="number"
        min={1}
        value={amount}
        placeholder="Coins"
        onChange={(event) => setAmount(event.target.value)}
        className="w-20 rounded border border-line/60 bg-surface px-1.5 py-0.5 text-[11px] tabular-nums outline-none"
      />
      <button
        type="button"
        // Both a reason and an amount, refused here as well as on the server so
        // an operator is not told off by a round trip for something the form
        // already knew.
        disabled={pending || reason.trim().length === 0 || Number(amount) <= 0}
        onClick={() => run(grantCoins, amount)}
        className="rounded border border-accent/50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-accent disabled:opacity-40"
      >
        Grant
      </button>

      {note && <span className="text-[10px] text-ink-muted">{note}</span>}
    </span>
  )
}
