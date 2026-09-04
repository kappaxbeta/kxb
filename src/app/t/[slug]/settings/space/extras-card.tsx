'use client'

import { useEffect, useState, useTransition } from 'react'
import { CoinPrice } from '@/app/components/coin-price'
import {
  buyOneMore,
  readExtras,
  type ExtraOffer,
} from '@/domain/bank/extras-actions'

/**
 * Buying one more than the plan holds.
 *
 * `docs/product/economy.md` §8. The tier is an allowance; beyond it a member
 * pays coins out of their own purse and the **space** keeps the slot -
 * permanently, and whether or not the buyer is still around.
 *
 * ---------------------------------------------------------------------------
 * Rows that cannot be bought are shown anyway
 * ---------------------------------------------------------------------------
 * With the reason, rather than omitted. A missing row is a question ("where are
 * blueprints?"); a row saying *unlimited* is an answer, and it is usually good
 * news. The only case that reads as a wall is free's private projects, and that
 * one is the tier's whole story rather than an oversight - free is public by
 * default, and paying is what buys privacy.
 *
 * ---------------------------------------------------------------------------
 * Read on mount, re-read after a purchase, never on a timer
 * ---------------------------------------------------------------------------
 * `requireTenant` writes cookies, so a polled server action re-renders the page
 * around itself. The same call every other money surface here makes.
 */

const LABELS: Record<string, string> = {
  privateXps: 'Private levels',
  publicXps: 'Published levels',
  blueprints: 'Blueprints',
  clips: 'Clips',
  vehicles: 'Vehicles',
  xoPlaces: 'Rooms',
}

export function ExtrasCard({ slug }: { slug: string }) {
  const [offers, setOffers] = useState<ExtraOffer[] | null>(null)
  const [purse, setPurse] = useState(0)
  const [on, setOn] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function load() {
    void readExtras(slug).then((result) => {
      if (!result.ok) return
      setOffers(result.offers)
      setPurse(result.purse)
      setOn(result.on)
    })
  }

  useEffect(load, [slug])

  if (!offers) return null

  // The economy is off here, so there is nothing to buy and no prices that
  // mean anything. Said rather than drawn empty - see the money card.
  if (!on) return null

  return (
    <section className="space-y-3 rounded-2xl border border-line/60 bg-surface/40 p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
          One more than the plan holds
        </h2>
        <span className="font-mono text-sm tabular-nums">{purse}</span>
      </header>

      <p className="text-xs text-ink-muted">
        Bought with your coins, kept by the space. A slot stays even if you
        leave, and a downgrade does not take it away.
      </p>

      <ul className="divide-y divide-line/40">
        {offers.map((offer) => {
          const label = LABELS[offer.what] ?? offer.what
          const held =
            offer.included === null
              ? 'unlimited'
              : `${offer.included + offer.bought}`

          return (
            <li key={offer.what} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted">
                {held}
                {offer.bought > 0 && ` (+${offer.bought})`}
              </span>
              {offer.price === null ? (
                <span className="w-28 shrink-0 text-right text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  {offer.included === null ? 'unlimited' : 'not on this plan'}
                </span>
              ) : (
                <button
                  type="button"
                  // Disabled rather than refused: the price and the purse are
                  // both known here, so an amount that cannot be afforded
                  // should never be a round trip that comes back saying so.
                  disabled={pending || purse < offer.price}
                  onClick={() =>
                    start(async () => {
                      setNote(null)
                      const result = await buyOneMore(slug, offer.what)
                      setNote(result.ok ? `Bought one more ${label.toLowerCase()}` : result.error)
                      if (result.ok) load()
                    })
                  }
                  className="w-28 shrink-0 rounded-lg border border-line/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink disabled:opacity-40"
                >
                  {/*
                    The coin, so a number on a button is unmistakably money.
                    `medium`, because on this row the price *is* the control
                    rather than a detail attached to a word.
                  */}
                  <CoinPrice coins={offer.price} size="medium" />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {note && <p className="text-[11px] text-ink-muted">{note}</p>}
    </section>
  )
}
