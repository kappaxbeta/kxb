import type { EntityId } from '@kxb/xp/engine'

/**
 * Whatever a peer is carrying, moved to where that peer is.
 *
 * Lifted out of the frame callback in ../simulation. Small, and every line of
 * it is a decision somebody had to make twice before it was right.
 *
 * **Every frame, not when the packet arrives.** A peer's position is
 * interpolated and moves *between* packets, so a flag written once when the
 * carry arrived would sit where they were standing at that moment and never
 * catch up.
 *
 * **Lifted to roughly a hand.** The crowd buffer holds *feet* — that is what
 * the wire carries — and a flag at ankle height reads as one lying on the
 * floor, which is exactly the thing this feature exists to stop showing.
 *
 * **A peer with no sample this frame leaves the thing alone.** They have left,
 * or nothing has arrived yet. Leaving it where it is beats teleporting it to
 * the origin, which is what a zeroed sample would do — and the origin is
 * somewhere a player can walk to and find the flag they are looking for.
 *
 * Written against plain maps and two functions rather than the entity world, so
 * a test needs neither a world nor a crowd buffer. The caller passes
 * `live.heldBy`, `live.alive`, and setters that write `live.position` and
 * `live.rotation` — which stays the world's business, since a rule asking *am I
 * held* has to get the same answer here as on the screen of whoever is holding
 * it.
 */
export function carryHeld({
  held,
  alive,
  sampleOf,
  place,
  lift,
}: {
  /** What is in whose hands: the thing's id, and the peer holding it. */
  held: ReadonlyMap<EntityId, string>
  /** Ids still in the world. Something despawned mid-carry is skipped. */
  alive: ReadonlySet<EntityId>
  /** Where a peer is drawn right now, or null when nothing is known. */
  sampleOf: (peer: string) => { x: number; y: number; z: number; facing: number } | null
  place: (id: EntityId, at: { x: number; y: number; z: number }, facing: number) => void
  /** Feet to hand, in world units. */
  lift: number
}): void {
  for (const [id, peer] of held) {
    if (!alive.has(id)) continue

    const placed = sampleOf(peer)
    if (!placed) continue

    place(id, { x: placed.x, y: placed.y + lift, z: placed.z }, placed.facing)
  }
}
