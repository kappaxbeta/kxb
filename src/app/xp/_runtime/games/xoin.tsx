'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { FrameProps } from '@kxb/xp'
import { demoBirth, rulesOf, type Quote } from '@kxb/xoin'
import { XoinMarket, type MarketPort } from '@kxb/xoin/play'

import { useSpace } from '@/app/t/[slug]/space-context'
import { readXoinDesk, tradeXoin, type DeskView } from '@/domain/xoin/actions'

/**
 * `@kxb/xoin`, wearing the platform's frame contract.
 *
 * ---------------------------------------------------------------------------
 * Which market this is, in four cases
 * ---------------------------------------------------------------------------
 * A cartridge is mounted from a registry against `FrameProps`, which carries no
 * fact about our product - so which space it is standing in comes from
 * `useSpace`, the escape hatch whose own note names this exact shape. What the
 * adapter does with the answer:
 *
 *   - **no space** (the public `/xp/<id>` host) — a sandbox, seeded off the
 *     room. Nothing is loaded and nothing can be lost, which is what makes this
 *     the one cartridge that can be shown to somebody with no account.
 *   - **a space with no market** — a sandbox too, but seeded off the *space*, so
 *     everybody in it is at least looking at the same story.
 *   - **a market in `demo`** — the sandbox again, now with the market's real
 *     birthday, so the chart here and the price on the settings card agree.
 *   - **`asset` or `currency`** — the port: the space's book, the member's
 *     position, and a trade that reaches a purse.
 *
 * The screen is identical in all four. That is the design, not a shortcut - a
 * player who learns a toy has learned nothing about the thing, and a space that
 * switched to `asset` would be switching its members onto a screen none of them
 * had seen.
 *
 * ---------------------------------------------------------------------------
 * Loaded once, and after each trade - never polled
 * ---------------------------------------------------------------------------
 * `requireTenant` writes cookies, so a polled Server Action re-renders the page
 * around this canvas on a timer. The price does not need polling anyway: it is
 * a closed form over the book and the clock, so the client recomputes it every
 * second for free. What polling would add is other people's trades, and the
 * honest cost of not having it is that somebody else's fill shows up on your
 * next trade rather than as it happens.
 */
export function XoinFrame({ topic, transparent }: FrameProps) {
  const space = useSpace()
  const slug = space?.slug ?? null

  const [desk, setDesk] = useState<DeskView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  /*
   * Derived rather than set. Outside a space there is nothing to ask, so this
   * is already answered on the first render - and writing that answer into
   * state from inside the effect would be a synchronous setState in an effect
   * body, which is a cascading render and which the compiler's lint refuses
   * outright. The `.then` below is a callback and is fine.
   */
  const checked = !slug || loaded

  useEffect(() => {
    if (!slug) return
    let alive = true
    void readXoinDesk(slug).then((result) => {
      if (!alive) return
      setLoaded(true)
      if (result.ok) setDesk(result.data)
      else setRefusal(result.error)
    })
    return () => {
      alive = false
    }
  }, [slug])

  /*
   * Fixed at mount rather than recomputed per render: `demoBirth` is relative
   * to now, so a value read during render would slide forward a second at a
   * time and the chart would never quite settle.
   */
  const [sandboxBirth] = useState(() => demoBirth(Date.now()))

  const trade = useCallback(
    async (quote: Quote): Promise<string | null> => {
      if (!slug) return 'This market is not attached to a space.'

      /*
       * The size, and the floor. A buy is sized in coins and a sale in specks -
       * the two sides of the desk measure differently - and `agreed` is the
       * worst outcome the player accepted, which is the only thing that lets
       * the server fill at its own epoch without filling at a price nobody was
       * shown. See `accepts`.
       */
      const result = await tradeXoin(slug, {
        side: quote.side,
        size: quote.side === 'buy' ? quote.coins : quote.specks,
        agreed: quote.side === 'buy' ? { specks: quote.specks } : { coins: quote.coins },
      })

      if (!result.ok) return result.error
      setDesk(result.data)
      return null
    },
    [slug],
  )

  const port: MarketPort | undefined = useMemo(() => {
    if (!desk || !rulesOf(desk.market.mode).spendsPurse) return undefined
    return {
      reserves: desk.market.reserves,
      position: {
        coins: desk.coins ?? 0,
        specks: desk.holding.specks,
        spent: desk.holding.spent,
        returned: desk.holding.returned,
      },
      trade,
    }
  }, [desk, trade])

  /*
   * Nothing until the answer is in, and only when there is a space to ask.
   * Mounting a sandbox and swapping it for a real market a round trip later
   * would show somebody a made-up stake of a hundred coins and then take it
   * away, which reads as losing money.
   */
  if (!checked) return null

  const mode = desk?.market.mode ?? 'demo'

  return (
    <>
      <XoinMarket
        id={space?.tenantId ?? topic}
        startedAt={desk?.market.startedAt ?? sandboxBirth}
        mode={mode}
        transparent={transparent}
        port={port}
      />
      {refusal && (
        <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-amber-300/80">
          {refusal}
        </p>
      )}
    </>
  )
}
