'use client'

import { useEffect, useState } from 'react'
import { CafeGame } from '@/app/world/cafe/cafe-scene'
import { openHomesteadFrame, type HomesteadFrame } from '@/domain/homestead/frame-actions'

/**
 * The café, opened from its own address rather than from a shelf.
 *
 * ---------------------------------------------------------------------------
 * Why this route came back
 * ---------------------------------------------------------------------------
 * `cafe-scene.tsx` records that `/t/<slug>/cafe` used to be a page and that the
 * route was removed on purpose: the café, the house and the garden became one
 * cartridge world entered from a shelf, and the doorway swaps rooms without
 * leaving the canvas. That was right for what the café *was* - a game a space
 * might happen to have.
 *
 * It stopped being right when the café became the mint.
 * `docs/product/economy.md` §5 lists the handful of ways coins are created and
 * a café shift is the main one, so a space without that cartridge on its shelf
 * had no way to earn at all - the economy's only faucet was unreachable, and
 * every "go and earn" in the product pointed at a 404.
 *
 * **Infrastructure cannot live on a shelf.** So the café - and only the café -
 * has an address again. The house and the garden stay where they were, because
 * they are still just rooms.
 *
 * ---------------------------------------------------------------------------
 * The door goes nowhere here, and that is a supported state
 * ---------------------------------------------------------------------------
 * `travel.to` is empty. The scene's own note says a `to` the door is not in
 * means the door offers no journey, and that it stays a door either way - it is
 * the one customers come through, drawn from the café's own grid. Somebody who
 * wants the whole homestead opens the cartridge; this address is for earning.
 */

const NO_TRAVEL = { to: [] as const, go: () => {} }

type Load =
  | { state: 'pending' }
  | { state: 'refused'; error: string }
  | { state: 'open'; frame: HomesteadFrame }

export function CafeRoute({ slug }: { slug: string }) {
  const [load, setLoad] = useState<Load>({ state: 'pending' })

  useEffect(() => {
    /*
      Dropped if this unmounts while the open is in flight. A resolved promise
      writing into a component that has gone is a warning nobody can act on -
      the same guard `useHomesteadPlace` keeps for the same reason.
    */
    let current = true

    openHomesteadFrame(slug, 'cafe')
      .then((result) => {
        if (!current) return
        setLoad(
          result.ok
            ? { state: 'open', frame: result.frame }
            : { state: 'refused', error: result.error },
        )
      })
      .catch(() => {
        if (!current) return
        setLoad({ state: 'refused', error: 'That did not open. Try again in a moment.' })
      })

    return () => {
      current = false
    }
  }, [slug])

  if (load.state === 'pending') {
    return (
      <p className="mt-16 text-center text-sm text-ink-muted">Opening the café…</p>
    )
  }

  /*
    A sentence, not a 404. The one refusal that actually happens here is the
    `cafe` feature switched off for this space, and "it is switched off" is
    something somebody can act on where a missing page is not.
  */
  if (load.state === 'refused') {
    return <p className="mt-16 text-center text-sm text-ink-muted">{load.error}</p>
  }

  const { frame } = load

  return (
    <CafeGame
      slug={frame.slug}
      initial={frame.initial}
      avatar={frame.avatar}
      presence={frame.presence}
      owner={frame.owner}
      agents={frame.agents}
      travel={NO_TRAVEL}
    />
  )
}
