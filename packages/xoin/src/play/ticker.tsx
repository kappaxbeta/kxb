'use client'

import type { Tick } from '../market/price'

/**
 * The price, the line behind it, and nothing else.
 *
 * ---------------------------------------------------------------------------
 * One chart, and no axes
 * ---------------------------------------------------------------------------
 * Every instinct says to put a grid, a y-axis and a time scale on this. None of
 * them earn their pixels here: the window is fixed, the unit is coins, and the
 * only questions a player has are "what is it now" and "which way has it been
 * going". A number and a shape answer both, and everything else is a chart
 * pretending to be an instrument.
 *
 * The path is drawn in a 0..100 viewBox and stretched, so this scales to
 * whatever it is put in without measuring anything - which matters because the
 * same component is drawn in a cartridge on a phone and in a settings card.
 */

const WIDTH = 100
const HEIGHT = 32

function pathOf(ticks: Tick[]): { line: string; area: string } | null {
  if (ticks.length < 2) return null

  const prices = ticks.map((t) => t.price)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  /*
   * A flat market would divide by zero, and a market that moved by a thousandth
   * of a coin would be drawn as a mountain range. Both are fixed by giving the
   * span a floor: a line that barely moves is drawn as a line that barely moves.
   */
  const span = Math.max(high - low, high * 0.02, 0.0001)
  const mid = (high + low) / 2
  const top = mid + span / 2

  const points = ticks.map((tick, i) => {
    const x = (i / (ticks.length - 1)) * WIDTH
    const y = HEIGHT - ((tick.price - (top - span)) / span) * HEIGHT
    return `${x.toFixed(2)},${Math.max(0, Math.min(HEIGHT, y)).toFixed(2)}`
  })

  return {
    line: `M${points.join(' L')}`,
    area: `M0,${HEIGHT} L${points.join(' L')} L${WIDTH},${HEIGHT} Z`,
  }
}

export interface TickerProps {
  price: number
  /** Fraction, signed. Drawn as a percentage beside the price. */
  change: number
  ticks: Tick[]
  /** What the window the change is measured over should be called. */
  window: string
}

export function Ticker({ price, change, ticks, window }: TickerProps) {
  const up = change >= 0
  const paths = pathOf(ticks)
  const stroke = up ? '#4ade80' : '#f87171'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl tabular-nums text-white">{price.toFixed(3)}</span>
          <span className="text-xs uppercase tracking-widest text-white/40">coins</span>
        </div>
        <div className="text-right">
          <div
            className="font-mono text-sm tabular-nums"
            style={{ color: stroke }}
          >
            {up ? '+' : ''}
            {(change * 100).toFixed(2)}%
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/30">{window}</div>
        </div>
      </div>

      {paths ? (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-20 w-full"
          /*
            The line must not get thicker when the box is stretched, which it
            would with a plain stroke-width in a non-uniform viewBox. This is
            the one-property fix, and it is why the path is not simply drawn in
            pixel space: pixel space would need a measured width.
          */
          vectorEffect="non-scaling-stroke"
          aria-hidden
        >
          <path d={paths.area} fill={stroke} opacity={0.12} />
          <path
            d={paths.line}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div className="h-20" />
      )}
    </div>
  )
}
