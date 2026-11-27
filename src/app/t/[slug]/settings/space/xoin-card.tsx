'use client'

import { useEffect, useState, useTransition } from 'react'

import { MODES, MODE_LABELS, priceAt, rulesOf, type XoinMode } from '@kxb/xoin'
import { readXoinDesk, setXoinMode } from '@/domain/xoin/actions'
import type { MarketView } from '@/domain/xoin/queries'

/**
 * What this space's market is, and the one switch that decides it.
 *
 * ---------------------------------------------------------------------------
 * The whole feature is this control
 * ---------------------------------------------------------------------------
 * `docs/product/xoin.md`: a xoin is not a second currency, it is a thing priced
 * in coins, and *which* of those it is in a given space is the mode. Everything
 * else about the feature - the cartridge, the pool, the chart - is the same in
 * all three. This card is the only place the difference is chosen, so it is the
 * only place the difference has to be explained.
 *
 * Which is why the three options carry a sentence each rather than a label.
 * "Asset" and "currency" are not self-describing words, and the gap between
 * them is somebody's coins.
 *
 * ---------------------------------------------------------------------------
 * A market is opened by choosing a mode, not by a separate button
 * ---------------------------------------------------------------------------
 * A space with no market shows the same three options and the first choice
 * opens one. An "open a market" button followed by a mode picker would be two
 * decisions where there is one, and the first of them would be a decision with
 * no content - opening a market in no particular mode is not a thing anybody
 * means to do.
 */
export function XoinCard({ slug, canEdit }: { slug: string; canEdit: boolean }) {
  const [market, setMarket] = useState<MarketView | null>(null)
  /**
   * The clock reading the price above was worked out from.
   *
   * A drifting price needs a *now*, and the obvious place to get one is in the
   * markup - which is a lint error, and rightly so: `Date.now()` is impure, so
   * a component that calls it while rendering returns something different every
   * time it is asked, and the compiler can no longer treat rendering as
   * repeatable. It failed the whole deploy, which gates on a green lint.
   *
   * So the clock is read where the market *arrives* instead - both places, the
   * first load and the moment a mode is chosen - and the render is a pure
   * function of the two. A settings card is the right place for a price frozen
   * at the moment it was fetched: it is a statement about the market you are
   * about to change, not a ticker. The ticker is `@kxb/xoin`'s `play/ticker`,
   * and it has a frame loop for exactly this reason.
   */
  const [pricedAt, setPricedAt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let alive = true
    void readXoinDesk(slug).then((result) => {
      if (!alive) return
      setLoaded(true)
      if (result.ok) {
        setMarket(result.data?.market ?? null)
        setPricedAt(Date.now())
      }
    })
    return () => {
      alive = false
    }
  }, [slug])

  /*
   * Nothing at all until the answer is in, rather than an empty card that fills
   * in. This sits in a column of other cards, and one that changes height after
   * a round trip shifts everything under it while somebody is reading.
   */
  if (!loaded) return null

  const choose = (mode: XoinMode) =>
    start(async () => {
      const result = await setXoinMode(slug, mode)
      setNote(result.ok ? null : result.error)
      if (result.ok) {
        setMarket(result.data)
        setPricedAt(Date.now())
      }
    })

  const current = market?.mode ?? null

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-white/80">Xoin</h2>
        {market && (
          <span className="font-mono text-xs tabular-nums text-white/40">
            {priceAt(
              { id: slug, startedAt: market.startedAt, reserves: market.reserves },
              pricedAt,
            ).toFixed(3)}{' '}
            coins
          </span>
        )}
      </header>

      <p className="mb-4 text-xs leading-relaxed text-white/45">
        A market with one thing in it. The price moves whether or not anybody is
        trading, and the pool can never pay out coins that were not paid in.
      </p>

      <div className="flex flex-col gap-2">
        {MODES.map((mode) => {
          const rules = rulesOf(mode)
          const chosen = current === mode
          return (
            <button
              key={mode}
              type="button"
              disabled={!canEdit || pending || chosen}
              onClick={() => choose(mode)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                chosen
                  ? 'border-white/25 bg-white/10'
                  : 'border-white/10 hover:border-white/20 disabled:hover:border-white/10'
              } ${canEdit ? '' : 'cursor-not-allowed opacity-60'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-white/85">{MODE_LABELS[mode]}</span>
                {chosen && (
                  <span className="text-[10px] uppercase tracking-widest text-white/40">on</span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-white/45">{BLURBS[mode]}</p>
              {rules.spendsPurse && (
                <p className="mt-1 text-[10px] uppercase tracking-widest text-rose-300/70">
                  Real coins
                </p>
              )}
            </button>
          )
        })}
      </div>

      {!canEdit && (
        <p className="mt-3 text-xs text-white/40">Only an owner or an admin can change this.</p>
      )}
      {note && <p className="mt-3 text-xs text-amber-300/80">{note}</p>}
    </section>
  )
}

/**
 * A sentence each, because the labels are not self-describing and the gap
 * between two of them is somebody's coins.
 *
 * `currency` says what it costs out loud. It is the mode that overturns "there
 * is one coin", and an owner choosing it should be choosing it rather than
 * discovering later what they picked - which is also why the sentence names the
 * consequence (xoin stays here) rather than the mechanism.
 */
const BLURBS: Record<XoinMode, string> = {
  demo: 'A sandbox. Everybody gets a made-up stake, the chart is real, and nothing anybody does here touches a purse.',
  asset: 'Coins buy xoin and xoin sells for coins. Coins are still the only money — a xoin is a thing you hold, like a blueprint. The space takes one percent of every trade.',
  currency:
    'Xoin becomes a second balance of its own, earnable and spendable here. It can never leave for a wallet, so what is earned in this space stays in it.',
}
