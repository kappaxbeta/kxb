'use client'

import { useMemo, useState } from 'react'

import { MIN_TRADE, quoteBuy, quoteSell, slippage, type Quote, type Reserves } from '../market/pool'
import { formatXoin, SPECKS } from '../market/units'
import type { Position } from '../market/position'

/**
 * Where a trade is actually made.
 *
 * ---------------------------------------------------------------------------
 * The quote is shown before the button is pressed, always
 * ---------------------------------------------------------------------------
 * A pool this shallow means a size a player thinks is modest can cost them a
 * fifth of it in impact, and a market that only reveals that afterwards is a
 * market that surprises people with their own money. So the panel below the
 * amount is not a preview of a trade - it *is* the trade, computed, and the
 * button only confirms it.
 *
 * ---------------------------------------------------------------------------
 * Why this component quotes rather than being handed one
 * ---------------------------------------------------------------------------
 * Because the amount changes on every keystroke and the reserves change on
 * every epoch, and threading a quote in from the parent would mean the parent
 * re-quoting on both. Quoting is arithmetic on four numbers; the thing worth
 * keeping in one place is `settle`, and that stays with whoever owns the
 * reserves.
 */

export interface DeskProps {
  reserves: Reserves
  /** The drifted xoin side, from `floatAt`. Passed, because time is not this file's. */
  float: number
  position: Position
  spot: number
  /** Returns a refusal to show, or null when the trade went through. */
  onTrade: (quote: Quote) => string | null
  disabled?: string
}

export function Desk({ reserves, float, position, spot, onTrade, disabled }: DeskProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('20')
  const [refusal, setRefusal] = useState<string | null>(null)

  const quote = useMemo(() => {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return null
    return side === 'buy'
      ? quoteBuy(reserves, float, Math.floor(value))
      : quoteSell(reserves, float, Math.round(value * SPECKS))
  }, [amount, float, reserves, side])

  /*
   * Two reasons a quote can be missing and they read completely differently to
   * a player: nothing typed yet, and a size this market will not take. Only the
   * second is worth a sentence, so the empty field says nothing at all.
   */
  const tooSmall = amount.trim() !== '' && Number(amount) > 0 && quote === null

  const affordable =
    quote === null ||
    (quote.side === 'buy' ? quote.coins <= position.coins : quote.specks <= position.specks)

  const canTrade = !disabled && quote !== null && affordable

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1">
        {(['buy', 'sell'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setSide(option)
              setRefusal(null)
              setAmount(option === 'buy' ? '20' : formatXoin(position.specks))
            }}
            className={`rounded-md py-2 text-sm font-medium capitalize transition-colors ${
              side === option ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-white/40">
          {side === 'buy' ? 'Coins to spend' : 'Xoin to sell'}
        </span>
        <input
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value)
            setRefusal(null)
          }}
          inputMode="decimal"
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-lg tabular-nums text-white outline-none focus:border-white/30"
        />
      </label>

      <div className="min-h-[4.5rem] rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
        {quote ? (
          <dl className="flex flex-col gap-1 text-white/60">
            <Row
              label="You get"
              value={
                side === 'buy'
                  ? `${formatXoin(quote.specks)} xoin`
                  : coins(quote.coins)
              }
              strong
            />
            <Row label="Price" value={`${quote.price.toFixed(3)} / xoin`} />
            <Row label="Fee" value={coins(quote.fee)} />
            <Row
              label="Slippage"
              value={`${(slippage(quote, spot) * 100).toFixed(2)}%`}
              /* Over a tenth is the point at which the size, not the market, is the story. */
              warn={slippage(quote, spot) > 0.1}
            />
          </dl>
        ) : tooSmall ? (
          <p className="text-white/40">
            Too small. This market takes trades worth {MIN_TRADE} coins or more — under that, the
            fee rounds to a whole coin and you would be paying most of it.
          </p>
        ) : (
          <p className="text-white/30">Enter an amount.</p>
        )}
      </div>

      <button
        type="button"
        disabled={!canTrade}
        onClick={() => {
          if (!quote) return
          const refused = onTrade(quote)
          setRefusal(refused)
          /*
            A filled trade clears the field. Leaving it holding the size that
            was just traded means a player who sold their whole position is
            immediately told they do not hold that much - a refusal for a trade
            they never asked for, arriving as the reward for a successful one.
          */
          if (!refused) setAmount('')
        }}
        className="rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
      >
        {side === 'buy' ? 'Buy xoin' : 'Sell xoin'}
      </button>

      {(disabled || refusal || (!affordable && quote)) && (
        <p className="text-xs text-amber-300/80">
          {disabled ??
            refusal ??
            (side === 'buy' ? 'Not enough coins for that.' : 'You do not hold that much.')}
        </p>
      )}
    </div>
  )
}

/** One coin is not "1 coins". The market talks about money all day; it can count. */
const coins = (amount: number) => `${amount.toLocaleString()} ${amount === 1 ? 'coin' : 'coins'}`

function Row({
  label,
  value,
  strong,
  warn,
}: {
  label: string
  value: string
  strong?: boolean
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd
        className={`font-mono tabular-nums ${
          warn ? 'text-amber-300' : strong ? 'text-white' : 'text-white/70'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
