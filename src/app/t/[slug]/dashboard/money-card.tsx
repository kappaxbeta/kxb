'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'

import { CoinMark } from '@/app/components/coin-mark'
import { fill } from '@/app/i18n/fill'
import { workspaceDict } from '@/app/i18n/workspace'
import type { Locale } from '@/domain/i18n/locale'
import { onPurseMoved, notePurseMoved } from '@/app/components/purse-signal'
import { moveMoney, readMoney, type MoneyView } from '@/domain/bank/wallet-actions'

/**
 * What you have here, what you have everywhere, and moving coins between them.
 *
 * `docs/product/economy.md` §3. Two balances, drawn together because the
 * difference between them is not obvious and the first question anybody asks on
 * seeing two numbers is which one they are about to spend.
 *
 * ---------------------------------------------------------------------------
 * Two numbers, one of which is not about this space
 * ---------------------------------------------------------------------------
 * A **purse** is per member per space: what you earned here, and what the doors
 * and battles here charge against. A **wallet** is per person: what you kept
 * when you left somewhere else.
 *
 * Drawing only the purse would hide the wallet from everybody who has one, and
 * drawing only the wallet would be a number nothing on this page spends. So
 * both, labelled, with the space's own first - that is the one this page is
 * about.
 *
 * ---------------------------------------------------------------------------
 * The move box is behind the numbers, and sometimes absent
 * ---------------------------------------------------------------------------
 * Looking is common and moving is rare, so the balances are the row and the
 * form is a disclosure - the same shape `PurseRail` settled on for the same
 * reason.
 *
 * When the space is not running the economy the form is replaced by a sentence
 * saying so, rather than simply not drawn. §3.1 makes coins earned in such a
 * space stay there, and a missing button is a bug to whoever expected one; a
 * sentence is an explanation.
 *
 * ---------------------------------------------------------------------------
 * Read on mount, re-read after a move, never on a timer
 * ---------------------------------------------------------------------------
 * `requireTenant` writes cookies, so a polled server action re-renders the page
 * around itself - the trap `polled-server-actions` exists for. Somebody paying
 * you while you are looking will not update the number, and that is the honest
 * cost of not polling.
 */
export function MoneyCard({ slug, locale }: { slug: string; locale: Locale }) {
  const t = workspaceDict(locale).board
  const [money, setMoney] = useState<MoneyView | null>(null)
  /**
   * Whether the first read has come back, which is a different question from
   * whether there is any money to draw. See the placeholder below: "still
   * asking" holds the card's height open and "asked, and there is nothing"
   * gives it back, and a single nullable balance cannot tell them apart.
   */
  const [asked, setAsked] = useState(false)
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState<'out' | 'in'>('out')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let alive = true

    const read = () => {
      void readMoney(slug)
        .then((result) => {
          // The card can be gone before this lands, and setting state on an
          // unmounted component is a warning nobody can act on.
          if (!alive) return
          if (result.ok) setMoney(result.money)
          setAsked(true)
        })
        .catch(() => {
          // A failed read is still an answer to "is this still coming": stop
          // holding the space open rather than shimmering at somebody forever.
          if (alive) setAsked(true)
        })
    }

    read()

    /*
      And when a coin moves elsewhere on the page. A number that came with the
      signal is taken as-is; only a signal without one costs a round trip. See
      `purse-signal.ts` - the version that always fetched made the café stutter.

      Only the purse is updated from a signal, never the wallet: nothing that
      fires this moves the wallet, and guessing that it might would put a wrong
      number on screen to save a read that is not happening anyway.
    */
    const stop = onPurseMoved((coins) => {
      if (typeof coins === 'number') {
        setMoney((was) => (was ? { ...was, purse: coins } : was))
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
   * The card, before the numbers are in it.
   *
   * It used to draw nothing at all until the first read landed - the note in
   * the masthead above says so in those words - and the reasoning was about the
   * shimmer rather than about the space. The space is the problem: this sits at
   * the very top of the board, above the space's name, so the card arriving
   * half a second late shoves the heading, the roster and the whole pinboard
   * down under the reader's eyes. Holding the height is the fix; the shimmer is
   * just what fills it.
   *
   * Only while the read is outstanding. If it comes back with nothing, the card
   * still draws nothing.
   */
  if (!money) return asked ? null : <MoneyWaiting slug={slug} locale={locale} />

  const coins = Number(amount)
  const ceiling = direction === 'out' ? money.purse : money.wallet
  const movable =
    Number.isInteger(coins) && coins > 0 && coins <= ceiling

  return (
    <div className="rounded-xl border border-line/60 bg-surface/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {t.money}
        </span>
        <div className="flex items-center gap-3">
          <Balance label={t.hereLabel} coins={money.purse} />
          <Balance label={t.walletLabel} coins={money.wallet} muted />

          {/*
            The way to go and earn some, on the coins themselves.

            A balance is where somebody notices they are short, and that is the
            moment the answer is worth offering - a number with no way out of it
            is just bad news. The café is the one place in this product that
            *makes* coins rather than moving them (see `MINTS`), so "work" is
            literally where the money comes from.

            An icon and not a row: it sits inside a status line and a labelled
            button here would compete with the two numbers it is attached to.
            The accessible name carries the words instead.
          */}
          <Link
            href={`/t/${slug}/cafe`}
            title={t.goEarn}
            aria-label={t.goEarn}
            className="rounded-md border border-line/60 p-1 text-ink-muted transition hover:border-accent/70 hover:text-ink"
          >
            <WorkIcon />
          </Link>
        </div>
      </div>

      {!money.canMove && (
        // Said rather than left blank. A missing control is a bug to whoever
        // expected one; a sentence is an explanation. See §3.1.
        <p className="mt-1.5 text-[10px] leading-snug text-ink-muted">{t.noMoving}</p>
      )}

      {money.canMove && (
        <button
          type="button"
          onClick={() => {
            setOpen((was) => !was)
            setNote(null)
          }}
          className="mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
        >
          {open ? t.hereLabel : t.move}
        </button>
      )}

      {money.canMove && open && (
        <div className="mt-2 space-y-1.5">
          <div className="flex gap-1">
            {(['out', 'in'] as const).map((way) => (
              <button
                key={way}
                type="button"
                onClick={() => {
                  setDirection(way)
                  setNote(null)
                }}
                aria-pressed={direction === way}
                className={`flex-1 rounded-lg border px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition ${
                  direction === way
                    ? 'border-accent/70 bg-accent/10 text-ink'
                    : 'border-line/60 text-ink-muted hover:text-ink'
                }`}
              >
                {way === 'out' ? t.toWallet : t.toSpace}
              </button>
            ))}
          </div>

          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={ceiling}
            value={amount}
            placeholder={t.howMuch}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs tabular-nums text-ink outline-none"
          />

          {note && <p className="text-[10px] text-ink-muted">{note}</p>}

          <button
            type="button"
            // Disabled rather than refused: both balances are known here, so an
            // amount that cannot be afforded should never be a round trip that
            // comes back saying so.
            disabled={pending || !movable}
            onClick={() =>
              start(async () => {
                setNote(null)
                const result = await moveMoney(slug, direction, coins)
                if (!result.ok) {
                  setNote(result.error)
                  return
                }
                // The action re-reads both balances and hands them back, so
                // there is no second round trip and no window where the card
                // shows a number the server has already moved past.
                setMoney(result.money)
                // The rail draws the purse too.
                notePurseMoved(result.money.purse)
                setAmount('')
                setNote(fill(t.moved, { n: String(coins) }))
              })
            }
            className="w-full rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink disabled:opacity-40"
          >
            {t.move}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * One labelled number.
 *
 * `tabular-nums` so the two do not jitter against each other as they change -
 * they sit side by side and proportional digits would make the wallet shift
 * every time the purse gained a digit.
 */
function Balance({
  label,
  coins,
  muted,
}: {
  label: string
  coins: number
  muted?: boolean
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">{label}</span>
      <span className={`font-mono text-sm tabular-nums ${muted ? 'text-ink-muted' : 'text-ink'}`}>
        {/* The unit, on both figures. One of them is the space's and one is
            yours, and neither is a count of anything else on this page - a coin
            on only the louder of the two would read as a difference in kind
            rather than in whose money it is.

            Inline, so this span keeps a text baseline: the row above aligns the
            label to it, and a flex box here would align the label to the bottom
            of the coin instead. */}
        <CoinMark size={12} className="mr-1 inline-block align-[-1px]" />
        {coins}
      </span>
    </span>
  )
}

/**
 * A briefcase, for going to work.
 *
 * Inline rather than from an icon set, like the rest of the small marks in this
 * app: one path at 14px costs less than a dependency, and it inherits
 * `currentColor` so the hover state on the link is the whole of its styling.
 *
 * `aria-hidden`, because the link that wraps it already carries the name - two
 * accessible names on one control is one of them being read out twice.
 */
function WorkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

/**
 * The money card, holding its place while the balances are on their way.
 *
 * Everything that does not depend on the answer is drawn for real: the box, the
 * heading, both labels, the coins and the way to the cafe. Only the two figures
 * are bars, because only the two figures had to be fetched. That is the whole
 * of the trick - a placeholder built out of what is already known does not
 * flash into something different when the read lands, it just fills in.
 *
 * The move form is not stood in for. It is behind a disclosure, so it costs no
 * height until somebody opens it, and a fake button is a control that lies.
 */
function MoneyWaiting({ slug, locale }: { slug: string; locale: Locale }) {
  const t = workspaceDict(locale).board

  return (
    <div className="rounded-xl border border-line/60 bg-surface/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {t.money}
        </span>
        <div className="flex items-center gap-3">
          <BalanceWaiting label={t.hereLabel} />
          <BalanceWaiting label={t.walletLabel} />
          <Link
            href={`/t/${slug}/cafe`}
            title={t.goEarn}
            aria-label={t.goEarn}
            className="rounded-md border border-line/60 p-1 text-ink-muted transition hover:border-accent/70 hover:text-ink"
          >
            <WorkIcon />
          </Link>
        </div>
      </div>
    </div>
  )
}

/** One labelled number that is not there yet. Sized to two digits, which is
 *  what nearly every balance in this product is. */
function BalanceWaiting({ label }: { label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">{label}</span>
      {/* Set in the same type as the real figure, because the line box of
          `text-sm` is what decides how tall this row is. A placeholder that
          holds the wrong amount of space is worse than one that holds none. */}
      <span className="font-mono text-sm tabular-nums text-ink-muted">
        <CoinMark size={12} className="mr-1 inline-block align-[-1px]" />
        <span className="holo-bar inline-block h-3 w-5 rounded align-[-1px]" aria-hidden />
      </span>
    </span>
  )
}
