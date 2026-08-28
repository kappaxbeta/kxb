/**
 * A body that decides for itself: where to stand, and whether to potter about,
 * sit down, or go to sleep.
 *
 * ---------------------------------------------------------------------------
 * Why this is a closed form and not a tick
 * ---------------------------------------------------------------------------
 * The obvious way to write a wandering character is a state machine you step
 * once a frame. That works perfectly for one tab and falls apart the moment two
 * people are looking at the same room: two machines seeded identically still
 * diverge, because they are stepped with different frame deltas and float
 * addition is not associative. Ten seconds in, the cat is asleep in the corner
 * on one screen and pottering by the door on the other, and there is no way to
 * tell which is right.
 *
 * So there is no state here. `roamAt` is a function of the agent's seed and the
 * wall clock, and every tab computes the same answer for the same instant
 * because it is the same arithmetic on the same two numbers. Nothing needs to be
 * broadcast, nothing needs a host tab, and a client that joins an hour late sees
 * the agent exactly where everyone else does. What *is* persisted is the seed
 * and the roster - see src/domain/agents - because those are the parts a log
 * should hold: who exists, not where their feet are.
 *
 * The cost is that the past is not editable. An agent cannot remember that it
 * was startled a minute ago, because there is nowhere to put that. When the AI
 * arrives it will not mutate this - it will append an instruction that overrides
 * it for a stretch of time, which every tab then reads from the same log and
 * applies at the same instant. That is why the schedule is expressed in absolute
 * epoch milliseconds rather than "seconds since spawn".
 *
 * ---------------------------------------------------------------------------
 * The shape of a life
 * ---------------------------------------------------------------------------
 * Time is cut into windows. Each window opens with a walk to a new perch and
 * then divides the remainder into beats, each of which is one small decision -
 * shuffle a step, look around, sit, doze. A mood drawn per window weights those
 * decisions, which is what turns a uniform twitch into behaviour you can read
 * across the room: a drowsy window is a body that crosses to a corner and stays
 * there, a restless one never settles.
 */

import {
  findPath,
  type Tile,
  type TileKey,
  parseTile,
  tileToWorld,
} from '@/domain/world/grid'

/**
 * How long an agent stays in one part of the room, in milliseconds.
 *
 * Just under a minute. Short enough that a room is never static while you are
 * standing in it, long enough that a body which has settled looks settled rather
 * than twitchy - the failure mode of every wander loop that re-rolls too often.
 */
export const WINDOW_MS = 48_000

/**
 * The slice at the top of each window given over to getting there.
 *
 * Fixed rather than "however long the walk takes", which is what keeps the beats
 * below on an exact grid: a variable arrival time would make the number of beats
 * in a window depend on the route, and the route depends on the furniture, so
 * moving a chair would change how many decisions an agent made that minute.
 *
 * Walking finishes early on a short route and the agent simply stands at the new
 * perch until the beats begin, which reads as arriving and having a look round.
 */
export const TRAVEL_MS = 12_000

/** One decision. Six seconds is about as long as a still body stays believable. */
export const BEAT_MS = 6_000

/** How many decisions there are after the walk. Exact by construction. */
export const BEATS_PER_WINDOW = (WINDOW_MS - TRAVEL_MS) / BEAT_MS

/**
 * World units per second on foot.
 *
 * Below the `WALK_SPEED` threshold the remote-body gait picks `run` at, so a
 * roamer never breaks into a sprint across the living room.
 */
export const ROAM_SPEED = 1.5

/**
 * How far off the centre of a square a potter step goes.
 *
 * Under half a tile, so a shuffle can never leave the square the agent is
 * standing on. That is not an aesthetic choice - the square was checked for
 * furniture and its neighbours were not, and a body that drifts into the next
 * one is a body standing inside the sofa.
 */
export const POTTER_RADIUS = 0.6

/** What a body is doing right now. */
export type Activity = 'travel' | 'potter' | 'watch' | 'sit' | 'sleep'

/** The weighting behind a window's decisions. */
export type Mood = 'restless' | 'settled' | 'drowsy'

/**
 * How each mood spends its beats.
 *
 * Weights rather than a state machine with transitions, because the thing being
 * modelled is a disposition and not a sequence. A drowsy body that stirs, looks
 * around and goes back to sleep falls out of the numbers for free; writing it as
 * transitions would mean naming that behaviour and then maintaining it.
 *
 * `travel` is absent on purpose - crossing the room is the window's business,
 * not a beat's, and letting a beat start a journey would strand a body
 * mid-stride when the window ended.
 */
const WEIGHTS: Record<Mood, Record<Exclude<Activity, 'travel'>, number>> = {
  restless: { potter: 5, watch: 3, sit: 1, sleep: 0 },
  settled: { potter: 2, watch: 3, sit: 4, sleep: 1 },
  drowsy: { potter: 1, watch: 1, sit: 2, sleep: 6 },
}

const MOODS: Mood[] = ['restless', 'settled', 'drowsy']

/**
 * FNV-1a over a handful of integers.
 *
 * Any cheap avalanche would do; what matters is that it is written out here
 * rather than taken from a library. This is the function two tabs have to agree
 * on to the bit, and an implementation that arrived through a dependency could
 * be swapped under a caret range - at which point every agent in the world
 * quietly relocates.
 */
function hash(...parts: number[]): number {
  let h = 0x811c9dc5
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x01000193)
    h ^= h >>> 15
  }
  return h >>> 0
}

/** A hash squashed into [0, 1). */
function unit(...parts: number[]): number {
  return hash(...parts) / 0x1_0000_0000
}

/**
 * A stable seed for an agent id.
 *
 * Ids are uuids, which are far wider than the 32 bits everything below wants, so
 * they are folded here once rather than re-hashed at every call site.
 */
export function seedFrom(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
    h ^= h >>> 13
  }
  return h >>> 0
}

/** Which window an instant falls in, and how far into it we are. */
export function windowAt(now: number): { index: number; elapsed: number } {
  const index = Math.floor(now / WINDOW_MS)
  return { index, elapsed: now - index * WINDOW_MS }
}

export function moodFor(seed: number, window: number): Mood {
  return MOODS[Math.floor(unit(seed, window, 0x9e37) * MOODS.length)]
}

/**
 * Where an agent spends window `k`.
 *
 * Drawn from the tiles it is allowed to stand on, which the caller supplies in a
 * fixed order - the order is part of the contract, because the index is what
 * gets hashed. `tiles` comes off a sorted key list for exactly that reason: a
 * `Set` iteration order that depends on insertion would make two tabs disagree
 * about which square is number seven.
 */
export function perchFor(seed: number, window: number, tiles: TileKey[]): Tile {
  // A room with no floor is a caller bug, and every arithmetic result below
  // would be NaN - which surfaces as a body at the origin rather than as an
  // error, and then as a bug report about an agent stuck inside a wall.
  if (tiles.length === 0) throw new Error('cannot roam a room with no tiles')

  const key = tiles[Math.floor(unit(seed, window, 0x51ed) * tiles.length)]
  return parseTile(key)
}

/**
 * What an agent is doing in one beat of a window.
 *
 * The last beat is forced to `watch`, and that clause is doing more work than it
 * looks. Beats are allowed to drift a body off the centre of its square, and the
 * next window's walk starts *from* that centre - so without a beat that ends
 * standing still in the middle, every window would open with the agent snapping
 * back half a metre. Forcing the final one to a posture with no offset makes the
 * seam continuous by construction rather than by a fudge factor.
 */
export function beatActivity(
  seed: number,
  window: number,
  beat: number,
): Exclude<Activity, 'travel'> {
  if (beat >= BEATS_PER_WINDOW - 1) return 'watch'

  const weights = WEIGHTS[moodFor(seed, window)]
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0)

  let roll = unit(seed, window, beat, 0x2f1b) * total
  for (const [activity, weight] of Object.entries(weights)) {
    roll -= weight
    if (roll < 0) return activity as Exclude<Activity, 'travel'>
  }

  return 'watch'
}

/**
 * Where a beat parks the body, relative to the centre of the perch.
 *
 * Only a potter moves; everything else rests wherever the last one left off,
 * which is why this returns the offset for a beat rather than a delta. Reading
 * it as "the spot beat n owns" makes the interpolation below a plain lerp
 * between two spots instead of an accumulation that would drift.
 */
function spotFor(
  seed: number,
  window: number,
  beat: number,
): { x: number; z: number } {
  if (beat < 0 || beatActivity(seed, window, beat) !== 'potter') {
    return { x: 0, z: 0 }
  }
  const angle = unit(seed, window, beat, 0x7c3a) * Math.PI * 2
  const radius = POTTER_RADIUS * (0.4 + 0.6 * unit(seed, window, beat, 0x1a55))
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

/**
 * Which way a resting body faces.
 *
 * Per beat rather than per window, so a `watch` beat is visibly a body turning
 * to look at something. Held across sit and sleep too - a sleeping animal that
 * slowly rotates on the spot is the tell that a yaw is being interpolated toward
 * a fresh random number every few seconds.
 */
function restingYaw(seed: number, window: number, beat: number): number {
  return unit(seed, window, Math.max(beat, 0), 0x63d1) * Math.PI * 2
}

/** Smoothstep, so a body eases in and out of a step instead of jerking. */
function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/** Where a body is, what it is doing, and which way it is pointing. */
export interface Roam {
  activity: Activity
  /** World units, not tiles. */
  x: number
  z: number
  /** Heading in radians, matching the convention the presence wire uses. */
  yaw: number
}

/**
 * The room an agent roams, as the two things the schedule needs from it.
 *
 * A predicate *and* a list, which looks redundant and is not: the list is what a
 * perch is drawn from and has to be finite and ordered, while the walk between
 * perches asks about squares one at a time and wants a predicate. Deriving
 * either from the other would mean either an unordered draw or a search over an
 * unbounded grid.
 */
export interface Roamable {
  /** Every square that may be perched on, in a stable order. */
  tiles: TileKey[]
  /** Whether a square may be walked through. */
  walkable: (tile: Tile) => boolean
}

/**
 * The route into window `k`, in world units, starting at the previous perch.
 *
 * Pulled out so it can be memoised by the caller: it is a breadth-first search
 * over the room, it is the same answer for the whole 48 seconds of a window, and
 * running it sixty times a second per agent is the one part of this file that
 * would actually cost something.
 *
 * A perch that has been walled off since the previous window returns a straight
 * line rather than nothing. Clipping a corner for one crossing is a smaller lie
 * than a body that stops dead and never arrives, and it self-corrects at the
 * next window.
 */
export function routeTo(
  seed: number,
  window: number,
  room: Roamable,
): { x: number; z: number }[] {
  const from = perchFor(seed, window - 1, room.tiles)
  const to = perchFor(seed, window, room.tiles)

  const path = findPath(from, to, room.walkable) ?? [to]
  return [tileToWorld(from), ...path.map(tileToWorld)]
}

/** Total ground distance along a polyline. */
function lengthOf(route: { x: number; z: number }[]): number {
  let total = 0
  for (let i = 1; i < route.length; i++) {
    total += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z)
  }
  return total
}

/**
 * Walk a polyline and report where you got to.
 *
 * `arrived` rather than "distance remaining", because the caller's only question
 * is whether the travel phase is over - a body that reached its perch in four
 * seconds spends the other eight standing there looking around.
 */
function walk(
  route: { x: number; z: number }[],
  distance: number,
): { x: number; z: number; yaw: number; arrived: boolean } {
  let remaining = distance

  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]
    const b = route[i]
    const span = Math.hypot(b.x - a.x, b.z - a.z)
    if (span <= 0) continue

    if (remaining <= span) {
      const t = remaining / span
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
        arrived: false,
      }
    }
    remaining -= span
  }

  const end = route[route.length - 1]
  const before = route[route.length - 2] ?? end
  return {
    x: end.x,
    z: end.z,
    yaw: Math.atan2(end.x - before.x, end.z - before.z),
    arrived: true,
  }
}

/**
 * Everything an agent is, at one instant.
 *
 * `now` is epoch milliseconds - `Date.now()`, not `performance.now()`. That is
 * the whole basis of two tabs agreeing, and the one thing a caller can get
 * wrong without anything looking broken locally.
 *
 * `route` is passed in rather than computed here so the caller can memoise it
 * per window; `routeTo` is the function that produces it.
 */
export function roamAt(
  seed: number,
  now: number,
  route: { x: number; z: number }[],
): Roam {
  const { index, elapsed } = windowAt(now)
  const perch = route[route.length - 1]

  if (elapsed < TRAVEL_MS) {
    const distance = lengthOf(route)
    /**
     * Hurry if the route is long enough that strolling would not get there.
     *
     * The alternative - carry on walking into the next window - means the agent
     * is somewhere the next window's route does not start from, and the seam
     * becomes a teleport. Arriving slightly briskly across a big room is the
     * cheaper of the two lies, and only happens in a room wider than eighteen
     * metres.
     */
    const speed = Math.max(ROAM_SPEED, distance / (TRAVEL_MS / 1000))
    const step = walk(route, (elapsed / 1000) * speed)

    // Got there early. Stand and take the place in until the beats begin.
    if (step.arrived) {
      return {
        activity: 'watch',
        x: perch.x,
        z: perch.z,
        yaw: restingYaw(seed, index, -1),
      }
    }

    return { activity: 'travel', x: step.x, z: step.z, yaw: step.yaw }
  }

  const sinceArrival = elapsed - TRAVEL_MS
  const beat = Math.min(Math.floor(sinceArrival / BEAT_MS), BEATS_PER_WINDOW - 1)
  const activity = beatActivity(seed, index, beat)

  /**
   * Ease from the previous beat's spot into this one over the first half of the
   * beat, then hold. Holding matters as much as the easing: a body that is still
   * creeping toward its mark four seconds after sitting down does not look like
   * it has sat down.
   */
  const from = spotFor(seed, index, beat - 1)
  const to = spotFor(seed, index, beat)
  const t = ease((sinceArrival - beat * BEAT_MS) / (BEAT_MS / 2))

  return {
    activity,
    x: perch.x + from.x + (to.x - from.x) * t,
    z: perch.z + from.z + (to.z - from.z) * t,
    yaw: restingYaw(seed, index, beat),
  }
}

/**
 * A roamer with its route cached, which is how the render loop should hold one.
 *
 * The cache is keyed on the window index *and* on the room, because furniture
 * moves: a route worked out before somebody dropped a bookcase across the
 * doorway would otherwise walk through it for the rest of the minute. Rooms are
 * compared by identity, which is what a read model handed to a scene as a stable
 * object gives for free.
 */
export function createRoamer(seed: number, room: Roamable) {
  let cachedFor = Number.NaN
  let cachedRoom: Roamable | null = null
  let cached: { x: number; z: number }[] = []

  return {
    at(now: number, current: Roamable = room): Roam {
      const { index } = windowAt(now)
      if (index !== cachedFor || current !== cachedRoom) {
        cached = routeTo(seed, index, current)
        cachedFor = index
        cachedRoom = current
      }
      return roamAt(seed, now, cached)
    },
  }
}

/**
 * How a posture sits on the body, for whoever is drawing it.
 *
 * Kept here next to the activity it belongs to, but expressed as plain numbers -
 * a drop in world units and a lean in radians - so this file stays free of
 * three.js and the tests stay free of a canvas. The pack has four clips and none
 * of them is a chair, so sitting is a body lowered onto its haunches and
 * sleeping is the same again with a tilt, which is exactly what the animals in
 * the set look like doing it.
 */
export const POSTURE: Record<Activity, { drop: number; lean: number }> = {
  travel: { drop: 0, lean: 0 },
  potter: { drop: 0, lean: 0 },
  watch: { drop: 0, lean: 0 },
  sit: { drop: 0.28, lean: 0.12 },
  sleep: { drop: 0.42, lean: 0.5 },
}

/** Which of the pack's four clips a posture plays. */
export function clipFor(activity: Activity): 'idle' | 'walk' {
  return activity === 'travel' || activity === 'potter' ? 'walk' : 'idle'
}
