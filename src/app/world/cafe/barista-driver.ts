import type * as THREE from 'three'
import { CATCH_UP, type Drift } from '@/app/world/_sim/autopilot'
import { canReach, type Errand, nextErrand } from '@kxb/dream-restaurant/barista'
import { type CafeState, isWalkable } from '@kxb/dream-restaurant/game'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import {
  findPath,
  parseTile,
  type Tile,
  type TileKey,
  tileToWorld,
  worldToTile,
} from '@kxb/peepz-world/grid'

/**
 * The hands and feet behind `@/domain/cafe/barista`.
 *
 * The planner answers "what next" and knows nothing about walking; this walks.
 * Splitting them that way is what lets the whole kitchen be tested without a
 * canvas - `barista.test.ts` drives the same decisions this does, teleporting
 * between squares, and gets a served burger out of it.
 *
 * What is genuinely left here is the stuff that needs a clock and a position:
 * following a path a step at a time, deciding when the chef is close enough to
 * press E, and not pressing it sixty times a second.
 */

/**
 * How often the planner is asked to reconsider, in seconds.
 *
 * Not every frame. The planner runs a breadth-first search per candidate square
 * and the answer does not change meaningfully in sixteen milliseconds - but it
 * must be often enough that a patty starting to burn is noticed while there is
 * still time to walk over, which is what ties this to `RESCUE_MARGIN`.
 *
 * Counted down in simulated `dt` rather than read off `performance.now()`, and
 * that is not just tidiness: the wall clock would make this untestable, since a
 * test that simulates a six-second cook in a millisecond would never reconsider
 * at all. Using the same clock the kitchen uses means the driver behaves the
 * same whether it is running at sixty frames a second or as fast as bun can go.
 */
const THINK_SECONDS = 0.2

/**
 * Seconds between interactions.
 *
 * Without it the chef empties a crate, crosses the room and builds a burger in
 * the same frame, because each `interact` changes the state the next decision is
 * made against. A person does one thing at a time, and the pause is what makes
 * the kitchen legible to somebody watching it.
 */
const ACT_COOLDOWN = 0.45

/** World units per second on the job. Brisk, but not the player's sprint. */
const PACE = 3.2

/** How close to a waypoint's centre counts as having reached it. */
const ARRIVED = 0.35

/**
 * How many times a square may be worked with nothing happening before it is
 * left alone.
 *
 * Two, not one: a single no-op is expected the moment an interaction races the
 * simulation - the chef reaches a stove on the same frame the patty finishes,
 * and the pick-up lands a tick early. Two in a row is a genuine disagreement
 * between what the planner wants and what the rules allow.
 */
const STRIKES = 2

/**
 * How long a square stays off the list, in seconds.
 *
 * Long enough to get on with something else, short enough that the block clears
 * once the kitchen has moved on - the counter that would not take a second
 * patty will take one again as soon as the burger on it is served.
 */
const BLOCK_SECONDS = 6

/**
 * A cheap fingerprint of everything an interaction can change.
 *
 * Compared before and after to answer one question: did pressing E do anything
 * at all? Every branch of `interact` moves at least one of these - what is in
 * the chef's hands, what is piled on the stations, the till - so an unchanged
 * fingerprint means the square refused.
 *
 * Counted per station rather than as one total, which matters more than it
 * looks: a single sum lets two unrelated changes cancel out. A sink finishing a
 * wash on the very tick the ice cream machine starts a cone leaves the total
 * identical, and the machine takes a strike for work it actually did.
 *
 * It still ignores the *contents* of a station beyond how many things are in
 * it, so a prep-board transform is invisible here. That direction is safe: it
 * delays noticing a stuck chore by a tick, where the other would send the chef
 * off to do something else for no reason.
 */
function fingerprint(state: CafeState): string {
  const stations: string[] = []
  for (const [key, station] of state.stations) {
    stations.push(`${key}:${station.items.length}`)
  }
  // Sorted, because Map order follows insertion and a station deleted and
  // recreated would otherwise read as a change on its own.
  stations.sort()
  return `${state.carried}|${state.served}|${state.coins}|${stations.join(',')}`
}

export interface Barista {
  /**
   * What the chef believes it is doing, for the HUD.
   *
   * Exposed because the café cannot be watched in a headless test and cannot be
   * driven in the preview pane - the frame loop needs a real
   * `requestAnimationFrame`. Putting the current intention on screen is what
   * lets somebody playing it report "it says Build the Burger and just stands
   * there", which is a far more useful bug report than "it gets stuck".
   */
  readonly label: string | null

  /**
   * Take one frame.
   *
   * Returns false when there is nothing to do, which is the scene's cue to hand
   * the body back to the wandering schedule - a chef with no orders potters
   * about rather than standing to attention in the middle of the kitchen.
   */
  step(
    state: CafeState,
    player: THREE.Vector3,
    dt: number,
    out: Drift,
    act: (tile: TileKey) => void,
  ): boolean
}

export function createBarista(): Barista {
  let errand: Errand | null = null
  let route: Tile[] = []
  let thinkIn = 0
  let cooldown = 0

  /** Squares that did nothing when worked, and how long they stay skipped. */
  const blocked = new Map<TileKey, number>()

  /** The square just worked, and what the café looked like when it was. */
  let acted: { tile: TileKey; before: string; strikes: number } | null = null

  function rethink(state: CafeState, here: Tile): void {
    errand = nextErrand(state, here, blocked.size > 0 ? new Set(blocked.keys()) : undefined)
    route =
      errand?.goto === null || !errand
        ? []
        : (findPath(here, errand.goto, (tile) => isWalkable(state, tile)) ?? [])
  }

  /**
   * Did the last interaction achieve anything?
   *
   * Checked on the frame after acting rather than inside the `act` callback,
   * because the callback cannot see the result - the scene owns the state and
   * hands this a fresh copy next frame. Two failures in a row and the square is
   * left alone for a while, which is what turns a chef stuck pressing E at a
   * counter forever into one that shrugs and goes to do something else.
   */
  function judge(state: CafeState): void {
    if (!acted) return

    if (fingerprint(state) !== acted.before) {
      // It worked. Whatever was wrong with that square is no longer wrong.
      blocked.delete(acted.tile)
      acted = null
      return
    }

    acted.strikes++
    if (acted.strikes >= STRIKES) {
      blocked.set(acted.tile, BLOCK_SECONDS)
      acted = null
    }
  }

  return {
    get label() {
      return errand?.chore.label ?? null
    },

    step(state, player, dt, out, act) {
      cooldown = Math.max(0, cooldown - dt)
      thinkIn -= dt

      for (const [tile, left] of blocked) {
        if (left <= dt) blocked.delete(tile)
        else blocked.set(tile, left - dt)
      }

      const here = worldToTile(player.x, player.z)

      if (thinkIn <= 0) {
        thinkIn = THINK_SECONDS
        judge(state)
        rethink(state, here)
      }

      /**
       * Nothing to do - and crucially, nothing done to the body either.
       *
       * `rise` used to run before this point, which meant that on every frame
       * the barista declined, it was pulling the eye back up to standing height
       * while `drift` pulled it down to sit or sleep. The two fought at sixty
       * frames a second and the body visibly bobbed.
       */
      if (!errand) return false

      // On the job, so on their feet - whatever the wandering schedule had
      // them doing a moment ago.
      rise(player, dt)

      const target = errand.chore.tile

      // Close enough to reach across. Press E, then wait a beat before the next
      // decision so the sequence reads as somebody working rather than a blur.
      if (canReach(here, target)) {
        route = []
        if (cooldown === 0) {
          /**
           * Remembered *before* the act, so the next think can tell whether
           * anything actually moved. See `judge`.
           *
           * Strikes carry over only for the same square. Without that check a
           * chore that failed once here and once somewhere else would look like
           * two failures in a row, and a square that works perfectly well would
           * be blocked on the strength of a different one's bad luck.
           */
          acted = {
            tile: target,
            before: fingerprint(state),
            strikes: acted?.tile === target ? acted.strikes : 0,
          }
          act(target)
          cooldown = ACT_COOLDOWN
          // The state has just changed underneath the plan that produced this -
          // but not before the cooldown, or the judgement reads the same frame
          // it acted on and always sees no change.
          thinkIn = ACT_COOLDOWN
        }
        faceTile(player, target, out)
        return true
      }

      /**
       * Walk the path one waypoint at a time.
       *
       * Recomputed here when it runs out rather than only on the think tick,
       * because arriving at the last waypoint of a stale route and then standing
       * still for a fifth of a second is visible - the chef stutters at every
       * corner.
       */
      if (route.length === 0) {
        rethink(state, here)
        if (!errand) return false
        if (route.length === 0) {
          // Nowhere to walk and not in reach: the standing spot got furnished
          // over between the plan and the step. Wandering is a better answer
          // than marching on the spot.
          return false
        }
      }

      const waypoint = tileToWorld(route[0])
      const dx = waypoint.x - player.x
      const dz = waypoint.z - player.z
      const gap = Math.hypot(dx, dz)

      if (gap <= ARRIVED) {
        route.shift()
        return true
      }

      const stride = Math.min(PACE * dt, gap)
      player.x += (dx / gap) * stride
      player.z += (dz / gap) * stride

      out.yaw = Math.atan2(dx, dz)
      // Upright and at full height: a chef on their way somewhere is not
      // slouching, whatever the wandering schedule would have had them doing.
      out.lean = 0

      return true
    },
  }
}

/** Point the body at the square it is working on. */
function faceTile(player: THREE.Vector3, key: TileKey, out: Drift): void {
  const at = tileToWorld(parseTile(key))
  out.yaw = Math.atan2(at.x - player.x, at.z - player.z)
  out.lean = 0
}

/**
 * Stand back up.
 *
 * The wandering schedule lowers the eye to sit and to sleep, and a customer can
 * walk in at any point during either. Without this the chef works the whole
 * shift at the height they happened to be when the order landed.
 */
function rise(player: THREE.Vector3, dt: number): void {
  player.y += (EYE_HEIGHT - player.y) * (1 - Math.exp(-CATCH_UP * dt))
}
