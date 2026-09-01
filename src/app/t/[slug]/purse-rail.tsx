'use client'

import { useEffect, useState, useTransition } from 'react'

import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { sendCoins } from '@/domain/homestead/actions'
import { readPurse, type PurseView } from '@/domain/homestead/purse-actions'

/**
 * What is in your purse, and handing some of it to somebody.
 *
 * ---------------------------------------------------------------------------
 * A number first, a form second
 * ---------------------------------------------------------------------------
 * The balance is the thing people want almost every time they look, and paying
 * somebody is rare. So the row is the number, and the form is behind it - which
 * also keeps a "send coins" box out of the way of a rail that is mostly about
 * getting into a world.
 *
 * ---------------------------------------------------------------------------
 * Read once, and re-read after a transfer
 * ---------------------------------------------------------------------------
 * Never on a timer. `requireTenant` writes cookies, so a polled server action
 * re-renders the page around a live canvas - the trap `polled-server-actions`
 * is remembered for. The two moments the number can be wrong are both handled
 * without one: it is read when the rail mounts, and re-read after you send
 * something, which is the only change you cause from here.
 *
 * Somebody paying *you* while you are looking will not update the number. That
 * is the honest cost of not polling, and it is a small one for a figure nobody
 * is watching - it is right again the next time the rail opens.
 */
export function PurseRail({ slug }: { slug: string }) {
  const t = railDict(useLocale()).purse
  const [purse, setPurse] = useState<PurseView | null>(null)
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let alive = true
    void readPurse(slug).then((result) => {
      // The rail can be closed before this lands, and setting state on a
      // component that has gone is a warning nobody can act on.
      if (alive && result.ok) setPurse(result.purse)
    })
    return () => {
      alive = false
    }
  }, [slug])

  // Nothing to say until the first read lands. A skeleton here would be a
  // shimmer on a single number, which reads as slower than nothing at all.
  if (!purse) return null

  const coins = Number(amount)
  const sendable =
    to !== '' && Number.isInteger(coins) && coins > 0 && coins <= purse.coins

  return (
    <div className="rounded-xl border border-line/60 bg-surface/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {t.heading}
        </span>
        <span className="font-mono text-sm tabular-nums text-ink">{purse.coins}</span>
      </div>

      {purse.people.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setOpen((was) => !was)
            setNote(null)
          }}
          className="mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
        >
          {open ? t.close : t.send}
        </button>
      )}

      {open && (
        <div className="mt-2 space-y-1.5">
          <select
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs text-ink outline-none"
          >
            <option value="">{t.pickPerson}</option>
            {purse.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={purse.coins}
            value={amount}
            placeholder={t.howMuch}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs tabular-nums text-ink outline-none"
          />

          {note && <p className="text-[10px] text-ink-muted">{note}</p>}

          <button
            type="button"
            // Disabled rather than refused: how much you have is known here, so
            // an amount you cannot afford should never be a round trip that
            // comes back saying so.
            disabled={pending || !sendable}
            onClick={() =>
              start(async () => {
                setNote(null)
                const result = await sendCoins(slug, { to, amount: coins })
                if (!result.ok) {
                  setNote(result.error)
                  return
                }
                // Re-read rather than subtract locally. The server is the only
                // thing that knows whether anything else moved in the meantime,
                // and a balance that drifts from the log is worse than a
                // half-second where it is a moment behind.
                const fresh = await readPurse(slug)
                if (fresh.ok) setPurse(fresh.purse)
                setAmount('')
                setNote(fill(t.sent, { n: String(coins) }))
              })
            }
            className="w-full rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink disabled:opacity-40"
          >
            {t.sendIt}
          </button>
        </div>
      )}
    </div>
  )
}
