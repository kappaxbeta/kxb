/**
 * Spells in the air: the light a written word throws into the room.
 *
 * The same module-store trick as `tracer-store` next door, for the same reason
 * spelled out there: the thing that *decides* a flare happened is outside the
 * Canvas - a pen layer over the world, or a message off the presence channel -
 * and the thing that draws it is a frame loop inside. Threading a ref between
 * them would run through six components with no other business here.
 *
 * Push and drain, no subscription, no re-render. A flare is a fact that lasts a
 * second or two; the component that draws it takes what is waiting and leaves
 * the queue empty, and a queue nobody drains stops growing at `LIMIT` rather
 * than at the end of the afternoon.
 *
 * Nothing here costs anybody health. A beam is a drawing, and this app's rule
 * about fights is that each client is the only author of its own health bar -
 * see `_sim/combat.ts`. A flare arriving with a number in it would be a second
 * author.
 */

/** What a written word can throw. See `world/_ink/words.ts`. */
export type FlareKind = 'beam' | 'rainbow'

export interface Flare {
  kind: FlareKind
  /** Where the body that cast it was standing, in cells. */
  from: { x: number; y: number; z: number }
  /** Which way it was facing, horizontal and normalised. */
  towards: { x: number; z: number }
}

/**
 * How many may be waiting at once.
 *
 * Small, because these are big: eight of them on screen is already a room
 * nobody can see. Older ones are dropped rather than newer ones refused - the
 * one somebody just cast is the one they are looking for.
 */
const LIMIT = 8

let queue: Flare[] = []

export function castFlare(flare: Flare): void {
  if (queue.length >= LIMIT) queue.shift()
  queue.push(flare)
}

/** Take what is waiting, leaving nothing. */
export function drainFlares(): readonly Flare[] {
  if (queue.length === 0) return NOTHING
  const taken = queue
  queue = []
  return taken
}

/** Shared, so draining an empty queue allocates nothing sixty times a second. */
const NOTHING: readonly Flare[] = []
