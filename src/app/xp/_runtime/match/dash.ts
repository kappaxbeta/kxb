import { useRef } from 'react'
import { boxesOverlap, type Box, shoverBox, type Vec3 } from '@kxb/xp/engine'

/**
 * A dash: a fifth of a second of moving, and who it has already caught.
 *
 * Two refs, because a dash is a **window rather than a moment**. A shot is an
 * instant; a dash is a dozen frames of travelling, and testing contact on every
 * one of them would send a dozen claims for one shoulder. `caught` is what stops
 * that.
 *
 * **Cleared at the start of each dash rather than at the end**, which is the
 * rule worth having somewhere: dashing through the same person twice is two
 * hits, because that is what it looks like from the outside.
 */
export interface Dash {
  /** Simulated seconds at which this dash stops charging. Zero is never dashed. */
  until: React.RefObject<number>
  /** Who this dash has caught, so nobody is claimed twice for one shoulder. */
  caught: React.RefObject<Set<string>>
}

export function useDash(): Dash {
  return { until: useRef(0), caught: useRef(new Set<string>()) }
}

/**
 * Start one, and forget the last one's victims.
 *
 * Armed where the dash is *confirmed* rather than where the key is read: a dash
 * refused for being stunned or dead did not happen, and must not hurt anybody
 * on the way to not moving.
 *
 * On the `elapsed` clock — seconds of simulated time — like everything else that
 * decides what is happening in the world, and unlike anything read off
 * `performance.now()`. Both are seconds-shaped numbers in this runtime and
 * mixing them is a bug that compiles.
 */
export function startDash(dash: Dash, elapsed: number, seconds: number): void {
  dash.until.current = elapsed + seconds
  dash.caught.current.clear()
}


/**
 * Who a dash caught this frame.
 *
 * Out of the crowd loop in ../simulation, where it was interleaved with the
 * shove list for one stated reason: *this loop already has every peer's box*.
 * That is an optimisation, not a relationship — one of them is a combat rule
 * and the other is an input to physics, and they were sharing a `for` because
 * they happened to want the same iteration.
 *
 * ---------------------------------------------------------------------------
 * Drawn, not sent
 * ---------------------------------------------------------------------------
 * The boxes are where peers are **drawn** — interpolated out of the crowd
 * buffer, the same ones a shot is tested against, and for the same reason:
 * somebody is hittable where you can see them, not where their last packet
 * said. A dash judged against raw packets catches people who visibly are not
 * there.
 *
 * ---------------------------------------------------------------------------
 * Only an enemy, and only when both sides are known
 * ---------------------------------------------------------------------------
 * A level with no teams has everybody sideless, and reading that as *everyone
 * is an enemy* would make a free-for-all out of a kickabout that never asked
 * for one. So an unknown side on either end is not a catch — the same rule the
 * battle roster's `alliesOf` arrives at from the other direction, and the same
 * bug if it is got wrong.
 *
 * **Nothing local happens** with the answer. Their health is not ours to take,
 * so the caller hands each id to the arbiter and the verdict is what counts.
 * See docs/xp/server-authority.md.
 *
 * Returns only the *newly* caught. A dash that is still running must not catch
 * the same person twice, which is what `caught` remembers; it is read here and
 * added to by the caller, so this stays a question rather than a change.
 */
export function dashCatches({
  peers,
  at,
  mine,
  sideOfPeer,
  elapsed,
  dashUntil,
  caught,
}: {
  /** Every peer, boxed where they are drawn. */
  peers: readonly { id: string; box: Box }[]
  /** Where the dashing player is, which `shoverBox` turns into a shoulder. */
  at: Vec3
  /** The dasher's side, or undefined in a level with no teams. */
  mine: string | undefined
  /** The side of a peer, or undefined when the level does not say. */
  sideOfPeer: (id: string) => string | undefined
  /** Simulated seconds so far. */
  elapsed: number
  /** When the dash stops, in the same clock. */
  dashUntil: number
  /** Who this dash has caught already. Read, never written. */
  caught: ReadonlySet<string>
}): readonly string[] {
  // Not dashing: the whole pass is skipped rather than every peer tested.
  if (elapsed >= dashUntil) return []

  const shoulder = shoverBox(at)
  const hit: string[] = []

  for (const peer of peers) {
    if (caught.has(peer.id)) continue

    const theirs = sideOfPeer(peer.id)
    if (!mine || !theirs || mine === theirs) continue

    if (boxesOverlap(shoulder, peer.box)) hit.push(peer.id)
  }

  return hit
}
