/**
 * Bullets in the air that belong to nobody in particular.
 *
 * ---------------------------------------------------------------------------
 * Why a store rather than a prop
 * ---------------------------------------------------------------------------
 * A shot fired by a *person* has three sources and one drawing. It is fired by
 * a key handler outside the Canvas (the shooter's own), it arrives on a socket
 * held by `<Multiplayer>` (everybody else's), and it is drawn by a component
 * inside the Canvas that neither of those can reach without threading a ref
 * through six components that have no other business with it.
 *
 * So this is the same module-store trick `face-store`, `pocket-store` and
 * `thing-life-store` already use for exactly the same reason, and the note in
 * `pocket-store` about the Canvas boundary applies here word for word.
 *
 * ---------------------------------------------------------------------------
 * Push and drain, and no subscription
 * ---------------------------------------------------------------------------
 * Nothing here re-renders anything. A tracer is a fact that lasts a fraction of
 * a second, and the thing that draws it is a frame loop - so it takes what is
 * in the queue and leaves it empty, and a queue nobody is draining stops
 * growing at `LIMIT` rather than at the end of the afternoon.
 *
 * Damage is not here. A tracer is the *drawing* of a shot; who it hurt was
 * decided by the shooter and sent to the victim as its own message, on the same
 * terms a dash is (see `_sim/combat.ts`). A bullet that arrived here carrying a
 * number would be a second author for somebody else's health.
 */

export interface Tracer {
  /** A model id the catalogue knows. What the bullet looks like. */
  model: string
  /** The blueprint's own size, times whatever the weapon says. */
  scale: number
  /** Cells a second. */
  speed: number
  from: { x: number; y: number; z: number }
  to: { x: number; y: number; z: number }
}

/**
 * How many may be waiting at once.
 *
 * A room of eight people firing twice a second fills this in four seconds of
 * nobody drawing, which only happens when there is no Canvas - and a queue that
 * grew forever in a scene that never draws is a leak nobody would find.
 */
const LIMIT = 64

let queue: Tracer[] = []

export function fireTracer(tracer: Tracer): void {
  if (queue.length >= LIMIT) queue.shift()
  queue.push(tracer)
}

/** Take what is waiting, leaving nothing. */
export function drainTracers(): readonly Tracer[] {
  if (queue.length === 0) return NOTHING
  const taken = queue
  queue = []
  return taken
}

/** Shared, so draining an empty queue allocates nothing sixty times a second. */
const NOTHING: readonly Tracer[] = []
