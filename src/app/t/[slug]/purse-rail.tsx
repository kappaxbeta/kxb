'use client'

import { useEffect, useState, useTransition } from 'react'

import { CoinMark } from '@/app/components/coin-mark'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { sendCoins } from '@/domain/homestead/actions'
import { notePurseMoved, onPurseMoved } from '@/app/components/purse-signal'
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
  /**
   * Whether the first read has come back at all, which is not the same question
   * as whether there is a purse.
   *
   * Without it the box below could not tell "still asking" from "asked, and the
   * answer was nothing", and those two want opposite things: a shape held open,
   * and no shape at all. Set by every read, including the ones that fail - a
   * rail that keeps a skeleton up forever because a request 500'd is worse than
   * one that quietly has no purse in it.
   */
  const [asked, setAsked] = useState(false)
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let alive = true

    const read = () => {
      void readPurse(slug)
        .then((result) => {
          // The rail can be closed before this lands, and setting state on a
          // component that has gone is a warning nobody can act on.
          if (!alive) return
          if (result.ok) setPurse(result.purse)
          setAsked(true)
        })
        .catch(() => {
          // A refused or dropped request is still an answer as far as the
          // placeholder is concerned: stop holding the space open.
          if (alive) setAsked(true)
        })
    }

    read()

    /*
      And again whenever a coin actually moves.

      Not a poll - see `purse-signal.ts`. The scenes fire this after the server
      has confirmed a movement, so no round trip happens unless something
      changed, and the canvas is never re-rendered on a timer. What it fixes is
      the café: the rail sits beside the one place in this product that mints
      coins, and without this it spent the whole session showing whatever the
      balance was when the page loaded - two numbers for one purse, on one
      screen.
    */
    const stop = onPurseMoved((coins) => {
      /*
        A number came with the signal, so there is nothing to fetch. This is the
        common case and the reason the whole thing is cheap: a café shift moves
        the purse every few seconds, and a `readPurse` per movement would mean a
        `requireTenant` per movement - cookies written, page re-rendered, canvas
        stuttering. It did exactly that until the number was made to travel.
      */
      if (typeof coins === 'number') {
        setPurse((was) => (was ? { ...was, coins } : was))
        return
      }
      read()
    })

    return () => {
      alive = false
      stop()
    }
  }, [slug])

  /**
   * The box, before there is a number in it.
   *
   * This used to draw nothing until the first read landed, on the argument that
   * a shimmer over one number reads as slower than nothing at all. That is true
   * of the shimmer and false of the space: the rail is a column of blocks, so a
   * purse that appears a moment later pushes everything under it down - and
   * what is under it is the tab body somebody is already reading. Holding the
   * height costs one grey bar and takes the jump out.
   *
   * Only while the answer is genuinely outstanding. A space with no purse gets
   * no box, same as before.
   */
  if (!purse) return asked ? null : <PurseWaiting label={t.heading} />

  const coins = Number(amount)
  const sendable =
    to !== '' && Number.isInteger(coins) && coins > 0 && coins <= purse.coins

  return (
    <div className="rounded-xl border border-line/60 bg-surface/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {t.heading}
        </span>
        <span className="font-mono text-sm tabular-nums text-ink">
          {/* Inline rather than a flex row, so the span keeps a text baseline
              and the digits stay level with the heading beside them. */}
          <CoinMark size={12} className="mr-1 inline-block align-[-1px]" />
          {purse.coins}
        </span>
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
                // Everybody else drawing a balance, including the money card
                // on the space's front page.
                notePurseMoved()
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

/**
 * The purse, holding its own place.
 *
 * The same box, the same padding and the same heading as the real one - the
 * only thing missing is the figure, because the figure is the only thing that
 * had to be asked for. Everything else is known before the round trip, so
 * drawing a blank card here would throw away information to look busy.
 *
 * `.holo-bar` is the app's one skeleton bar - it is what the page-level
 * skeleton is built from, and it already stops moving under
 * `prefers-reduced-motion`. `aria-hidden` on the bar alone: the heading is real
 * text and should be read, while a bar standing in for a number has nothing to
 * say to a screen reader.
 */
function PurseWaiting({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-line/60 bg-surface/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {label}
        </span>
        {/*
          The same span as the real figure, down to the type it is set in - the
          line box of `text-sm` is what makes this row twenty pixels tall, and a
          placeholder built out of divs would hold the wrong amount of space,
          which is the same jump in a smaller costume.

          The coin is not part of the wait: it is the same coin whatever the
          number turns out to be, so it arrives with the box rather than with
          the answer, and only the digits are a bar.
        */}
        <span className="font-mono text-sm tabular-nums text-ink-muted">
          <CoinMark size={12} className="mr-1 inline-block align-[-1px]" />
          <span className="holo-bar inline-block h-3 w-7 rounded align-[-1px]" aria-hidden />
        </span>
      </div>
    </div>
  )
}
