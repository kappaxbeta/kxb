import { drawingOf } from '@/domain/thingiverse/models'

/**
 * Where one piece of a thing sits, in the thing's own frame.
 *
 * ---------------------------------------------------------------------------
 * Why this is in the domain and not in either renderer
 * ---------------------------------------------------------------------------
 * A blueprint is drawn twice, by two renderers that share nothing else and are
 * right not to: the composer's stage is a preview with picking, dimming and
 * socket marks, and the room's is sixty-four things with gravity, collision and
 * a frame loop. Threading a `preview` flag through the second to serve the
 * first would give the room a renderer that asks, every frame, whether it is
 * real.
 *
 * What they cannot afford to disagree about is *where a piece goes*. A crate
 * bolted to a stall at (0.5, 1, 0) on the bench has to be at (0.5, 1, 0) in the
 * room, at the same size and turned the same way, or the bench is a tool for
 * building something you have never seen. That was the state for a day: the
 * composer had `place()` and the room grew `pieceTransform`, two copies of four
 * lines of arithmetic, drifting from the moment either was touched.
 *
 * So it lives here, beside `socketsOf` and `drawingOf`, which are here for
 * exactly the same reason. Plain numbers and no three.js: the domain does not
 * know what a `Vector3` is, and both renderers can spread these into whatever
 * their own scene graph wants.
 *
 * ---------------------------------------------------------------------------
 * The root is a piece
 * ---------------------------------------------------------------------------
 * It goes through here too, as the piece at the origin with no turn and the
 * blueprint's own scale. `spec.model` stays the root and stays privileged - it
 * is what a thumbnail is drawn from, what a typed word is matched against and
 * what the summon resolver reads - but nothing about *drawing* it differs from
 * drawing a crate bolted to it, and a renderer that had two paths would be a
 * renderer where one of them was fixed and the other was not.
 */
export function pieceTransform(
  model: string,
  at: { x: number; y: number; z: number },
  turn: number,
  scale: number,
): {
  /** In the thing's own frame, in cells. */
  position: [number, number, number]
  /** Radians, about the up axis. */
  rotation: [number, number, number]
  scale: number
} {
  const drawn = drawingOf(model)

  return {
    // The lift is the pack's answer to "how far above its origin is this model
    // drawn", and it scales with the piece: a bench at half size sits half as
    // far off the floor, or it hovers.
    position: [at.x, at.y + (drawn?.lift ?? 0) * scale, at.z],
    // Quarter turns, which is every rotation a thing has - see `ThingView`.
    rotation: [0, (turn * Math.PI) / 2, 0],
    // Both multiply: the blueprint says how big this kind of piece is, and the
    // pack says what one of its authored units is worth in cells.
    scale: (drawn?.scale ?? 1) * scale,
  }
}

/** The root's own place: the origin, unturned. Named so neither caller spells it. */
export const PIECE_ORIGIN = { x: 0, y: 0, z: 0 } as const
