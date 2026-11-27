'use client'

import { useEffect, useMemo, useState } from 'react'

import { EPOCH_MS } from '../market/drift'
import { OPENING_COINS, OPENING_SPECKS, settle, type Quote, type Reserves } from '../market/pool'
import { changeOver, floatAt, priceAt, seriesAt, type Market } from '../market/price'
import { formatXoin } from '../market/units'
import { applyFill, openPosition, profitAt, worthAt, type Position } from '../market/position'
import { MODE_LABELS, rulesOf, type XoinMode } from '../modes'
import { Desk } from './desk'
import { Ticker } from './ticker'

/**
 * The xoin cartridge.
 *
 * ---------------------------------------------------------------------------
 * The same screen in all three modes, and that is the design
 * ---------------------------------------------------------------------------
 * `demo`, `asset` and `currency` draw an identical terminal. What changes is
 * where the coins come from and where they go, and that is behind `trade`
 * below - one function, handed in or defaulted.
 *
 * The alternative was a demo that looked like a demo, and it is worse in both
 * directions: a player who learns a toy has learned nothing about the thing,
 * and a space that switches to `asset` would be switching its members onto a
 * screen none of them had seen. So the mode is a badge and a sentence, never a
 * different program.
 *
 * ---------------------------------------------------------------------------
 * Nothing here knows what an app is
 * ---------------------------------------------------------------------------
 * No `@/` import, no URL, no server action. The platform half is a `trade`
 * callback and a `market` value; a host that has neither gets a sandbox that
 * works completely, which is what makes this cartridge playable on the public
 * `/xp` host where there is no identity to charge - see the note on
 * `backend.needs` in `xoin.xp.json`.
 */

/**
 * What a space-backed market has to supply.
 *
 * Deliberately small. The client owns the drawing and the arithmetic; the
 * platform owns *the book and the purse*, which are the only two things a
 * player must not be able to write for themselves.
 */
export interface MarketPort {
  reserves: Reserves
  position: Position
  /** Resolves to a refusal to show, or null when it went through. */
  trade: (quote: Quote) => Promise<string | null>
}

export interface XoinMarketProps {
  /** Which space's story this is. Seeds the mood; two spaces differ. */
  id: string
  /** When epoch 0 was. A space's market has a real birthday; a demo starts now. */
  startedAt: number
  mode: XoinMode
  transparent?: boolean
  /** Absent means the sandbox: local book, local stake, nothing leaves. */
  port?: MarketPort
}

export function XoinMarket({ id, startedAt, mode, transparent, port }: XoinMarketProps) {
  /*
   * The clock, at a second rather than at an epoch.
   *
   * The price only changes when the epoch turns over, so a minute-long interval
   * would be enough for the number - and would mean the chart froze for up to a
   * minute after opening, which reads as broken. A second is cheap: it is one
   * `Date.now()` and a handful of pure functions, no canvas and no request.
   */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  /* The sandbox's own book and stake. Ignored entirely when a port is present. */
  const [localReserves, setLocalReserves] = useState<Reserves>({
    coins: OPENING_COINS,
    specks: OPENING_SPECKS,
  })
  const [localPosition, setLocalPosition] = useState<Position>(() => openPosition())
  const [note, setNote] = useState<string | null>(null)

  const reserves = port?.reserves ?? localReserves
  const position = port?.position ?? localPosition

  const market: Market = useMemo(() => ({ id, startedAt, reserves }), [id, startedAt, reserves])

  const float = floatAt(market, now)
  const price = priceAt(market, now)
  const rules = rulesOf(mode)

  const ticks = useMemo(() => seriesAt(market, now, 90), [market, now])
  const change = changeOver(market, now, 60)

  const trade = (quote: Quote): string | null => {
    if (port) {
      /*
       * Fired and not awaited, and the refusal arrives through `note` rather
       * than as this function's return. `Desk` wants a synchronous answer
       * because it is drawing a button, and a promise threaded through it would
       * make every mode's control flow the shape the slowest one needs.
       */
      void port.trade(quote).then(setNote)
      return null
    }

    const next = applyFill(position, quote)
    if (!next) return 'That does not fit what you are holding.'
    setLocalPosition(next)
    setLocalReserves(settle(reserves, quote))
    setNote(null)
    return null
  }

  const profit = profitAt(position, price)

  return (
    <div
      className={`flex h-full w-full items-center justify-center overflow-auto p-4 ${
        transparent ? '' : 'bg-[#0b0d10]'
      }`}
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-amber-400/20 font-mono text-sm text-amber-300">
              x
            </span>
            <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">Xoin</h1>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${
              rules.spendsPurse
                ? 'bg-rose-500/15 text-rose-200'
                : 'bg-white/10 text-white/50'
            }`}
          >
            {MODE_LABELS[mode]}
          </span>
        </header>

        <Ticker price={price} change={change} ticks={ticks} window="last hour" />

        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-white/5 p-3 text-center">
          <Stat label={rules.spendsPurse ? 'Purse' : 'Stake'} value={position.coins.toLocaleString()} />
          <Stat label="Xoin" value={formatXoin(position.specks)} />
          <Stat
            label="Profit"
            value={`${profit >= 0 ? '+' : ''}${profit.toLocaleString()}`}
            tone={profit > 0 ? 'up' : profit < 0 ? 'down' : undefined}
          />
        </dl>

        <Desk
          reserves={reserves}
          float={float}
          position={position}
          spot={price}
          onTrade={trade}
        />

        {note && <p className="text-xs text-amber-300/80">{note}</p>}

        <footer className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-3 text-[10px] uppercase tracking-widest text-white/25">
          <span>
            {rules.spendsPurse
              ? 'Real coins. No cash value.'
              : 'Play money. Nothing leaves this screen.'}
          </span>
          {/*
            One number, labelled. This was two - the holding and the total, bare,
            separated by a slash - and it read as a fraction of something. The
            holding is already on the row above as a xoin figure and a profit, so
            the only thing missing was "what would I have if I closed it now".
          */}
          <span className="font-mono normal-case">
            worth {worthAt(position, price).toLocaleString()}
          </span>
        </footer>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-widest text-white/35">{label}</dt>
      <dd
        className={`font-mono text-sm tabular-nums ${
          tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-rose-300' : 'text-white'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

/** Exported for the settings card, which draws the same chart at a glance. */
export { EPOCH_MS }
