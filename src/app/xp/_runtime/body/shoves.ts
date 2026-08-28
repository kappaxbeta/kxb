import type { Box, Shover } from '@kxb/xp/engine'

/**
 * Where every peer is, and how far they moved since the last frame.
 *
 * The other half of the crowd loop in ../simulation. `stepBodies` takes a list
 * of shoving boxes and needs to know which way each one is going, which is a
 * difference between two frames — so somebody has to remember where they were.
 *
 * That memory is `wasAt`, and it is pruned here rather than anywhere else:
 * a peer who left the room stops appearing in `peers`, and a map that kept them
 * would go on reporting a shove from a body nobody can see. Pruning by *what is
 * present this frame* rather than on a leave message is what makes that
 * self-correcting — there is no event to miss.
 *
 * A peer seen for the first time shoves with a delta of zero rather than being
 * left out. They are a solid thing to walk into from the moment they appear;
 * they are simply not pushing yet, which is true — nobody knows which way they
 * are going until there are two frames of them.
 */
export function gatherShoves(
  peers: readonly { id: string; box: Box }[],
  wasAt: Map<string, { x: number; y: number; z: number }>,
  /**
   * Filled rather than returned, which is this runtime's rule for anything on
   * the frame path: `blockers` next door says the same thing in the same words.
   * A fresh array and a spread to copy it into the caller's is two allocations
   * sixty times a second for a list that is usually two people long.
   *
   * **Appended to, not cleared.** The player's own shoulder is already in there
   * by the time this runs - the caller empties the list once at the top of the
   * frame and pushes itself in first - so a clear here would delete the one
   * shove that is always present.
   */
  into: Shover[],
): void {
  const seen = new Set<string>()

  for (const peer of peers) {
    seen.add(peer.id)

    // The middle of the box on the floor plane, and its base — a body is shoved
    // by where its feet are, not by the middle of its head.
    const centre = {
      x: (peer.box.minX + peer.box.maxX) / 2,
      y: peer.box.minY,
      z: (peer.box.minZ + peer.box.maxZ) / 2,
    }

    const before = wasAt.get(peer.id)
    into.push({
      box: peer.box,
      dx: before ? centre.x - before.x : 0,
      dy: before ? centre.y - before.y : 0,
      dz: before ? centre.z - before.z : 0,
    })

    wasAt.set(peer.id, centre)
  }

  for (const id of wasAt.keys()) {
    if (!seen.has(id)) wasAt.delete(id)
  }
}
