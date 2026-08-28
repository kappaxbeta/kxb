/**
 * `@kxb/xp/bodies` - things in a level that fall, roll, bounce and get shoved.
 *
 * ---------------------------------------------------------------------------
 * The gap this fills, in the words it was reported in
 * ---------------------------------------------------------------------------
 * *"in peepz the ball i cant kick it, also like push things"*. Both halves are
 * the same missing thing. Until now an entity was somewhere until something
 * wrote a new position onto it: `carry` moved it, `teleport` moved it, a script
 * moved it a frame at a time. Nothing in a document said *this thing has a
 * velocity and gravity acts on it*, so a ball was a script and a crate was
 * scenery, and a level where you nudge something with your shoulder could not
 * be written at all.
 *
 * `docs/xp/backlog.md` §0.6 predicted exactly this and named the price: a
 * physics engine for the **character controller** is refused, because that
 * controller is pure, headless and has met players. What that entry says would
 * change the answer is "anything that rolls", and the shape it prescribes is
 * this one word for word - *a physics engine for entities with the character
 * controller left alone*. So `physics.ts` is untouched by this file and stays
 * the only thing that moves a person.
 *
 * ---------------------------------------------------------------------------
 * Pure, for `physics.ts`'s reason and one more
 * ---------------------------------------------------------------------------
 * `stepBodies` is a function from a world and a delta to a list of contacts. No
 * renderer, no clock, no R3F. The Browser pane never fires a frame (see the
 * note at the top of `physics.ts`), so "does a ball dropped from six cells come
 * to rest on the floor" is a question a screenshot cannot answer and a test
 * can.
 *
 * The extra reason is the network. A body is stepped on **every** client from
 * the same document and the same delta, exactly as a script is - so nothing
 * about where the ball is has to travel for two people to see it in roughly the
 * same place. Roughly, and that word is doing work: floating point and frame
 * pacing diverge, which is what `@kxb/xp/sharing` and the elected owner in
 * football mode are for. This file makes the *rules* identical; it does not
 * pretend that makes the positions identical.
 *
 * ---------------------------------------------------------------------------
 * Axis at a time, and the boxes it tests against
 * ---------------------------------------------------------------------------
 * The same resolution the character controller does, for the same reason:
 * moving diagonally into a corner becomes two independent one-dimensional
 * problems, so a ball slides along a wall rather than sticking to it.
 *
 * Three kinds of thing stop a body, and they are not interchangeable:
 *
 *   - **cells**, the level's own geometry, asked through `isSolid` and `topOf`
 *     exactly as the controller asks them. This is the floor and the walls;
 *   - **other entities**, by box, which is what makes a ball bounce off a crate
 *     and is the only one of the three that produces a contact naming somebody;
 *   - **the player**, who is a box here rather than a person, and who does not
 *     stop a body so much as *shove* it. See `Shover`.
 */

import { entityBox, shapeBox, type BodySpec, type Blueprint, type Box } from '../document/blueprints'

export { BODY_FIELDS, BODY_LIMITS, bodyProblems } from '../document/blueprints'
import { PLAYER_ID, type EntityId, type EntityWorld } from './entities'
import {
  EYE_HEIGHT,
  GRAVITY,
  MAX_FALL_SPEED,
  PLAYER_RADIUS,
  SPRINT_PACE,
  type SolidTest,
  type SurfaceTest,
} from './physics'

/** Cells a second below which a grounded body is simply stopped. */
export const REST_SPEED = 0.4

/**
 * Cells a second below which a bounce is not worth having.
 *
 * Without it a ball on a floor bounces forever in ever smaller amounts, which
 * costs nothing in arithmetic and reads on screen as a thing that will not
 * settle - the classic jitter. Above zero it stops, and stopping is visible.
 */
export const BOUNCE_FLOOR = 1.2

/** Nothing in a level may travel faster than this, however it was pushed. */
export const MAX_BODY_SPEED = 60

/**
 * How close the player has to be to shove something.
 *
 * A skin, and it exists because a body with a collider is a `Blocker`: the
 * character controller resolves the player *against* it, so the two boxes never
 * actually overlap and a shove tested by overlap would never fire. This is the
 * gap the controller leaves, plus room for a frame of travel.
 */
export const SHOVE_REACH = 0.12

/**
 * How long a push takes to work an overlap out, in seconds.
 *
 * A time rather than a stiffness, because it is the number somebody can reason
 * about: a ball a fifth of a cell inside you is asked to leave at about three
 * cells a second, a brisk walk. It is also *bounded by your own pace* where it
 * is used - a separation that can outrun the person doing the separating is a
 * ball that squirts away from a gentle nudge. Brisker than it was, because
 * under `PUSH_CARRY` the separation is what carries a dribble: at a sprint a
 * slower spring fell behind the box and the ball was run over rather than run
 * *with*.
 */
export const SEPARATION_TIME = 0.06

/**
 * How much faster than your approach a body leaves a contact.
 *
 * Taken from the lounge's football sim (`src/app/world/lounge/_sim/football.ts`),
 * which has been played and tuned, and copied here rather than imported for
 * docs/xp/creator.md 1.2's reason: the creator owns its own engine, and the two
 * are allowed to diverge. What is copied is the *model*, and it is worth saying
 * why it won.
 *
 * Contact used to be a **push that was not stored** - the body moved while you
 * leaned on it and stopped when you stopped - with a separate "impact" above
 * sprint pace for a dash. That is defensible and it is not football: a touch
 * did not carry, so the ball never ran ahead of you, and the reported feel was
 * that a kick had to do all the work.
 *
 * Proportional is the answer the lounge already found. The outgoing speed is
 * your closing speed times this, so the ball moves how you moved: walk into it
 * and it goes along in front of you, sprint and it runs, dash and it is gone - a
 * dash is several times a sprint and several times this is already past the
 * speed cap. **The dash needs no special case**, which is why the impact
 * threshold this replaces is gone.
 *
 * This is a **rate, not a destination**, and reading it as both was the bug after
 * the one below: 1.7 is how quickly a body converges on being pushed, and where
 * it ends up is bounded by the pace of whoever is pushing it. See the ceiling in
 * `shove`.
 *
 * Above 1 on purpose: the body has to leave faster than you arrive, or you run
 * straight over it and the same contact fires every frame.
 *
 * **Closing** speed, and that word carries the second fix - see `shove`. Priced
 * against the shover's absolute pace instead, a touch on a ball already rolling
 * at nearly your own speed was charged as though it were standing still, so
 * every dribble was a series of eight-cells-a-second steps a frame wide.
 */
export const PUSH_TRANSFER = 1.7

/**
 * The slowest a real touch sends something, in cells a second.
 *
 * A floor under the proportional rule, because it has a bad case: approach at a
 * crawl and crawl times 1.7 is a ball that trickles four centimetres and stops,
 * which reads as the touch not registering.
 *
 * A floor on the *outgoing* speed rather than on the touch, which matters now
 * that a touch adds to what the body was already doing: a tap worth a tenth of a
 * cell a second on a ball already rolling at six must leave it at six and a bit,
 * not shove it back down to this.
 */
export const MIN_DRIBBLE_SPEED = 2.5

/**
 * The fraction of your pace a lean leaves behind when you stop.
 *
 * The last of the push bugs, and the quietest: with the ceiling bounded by your
 * whole pace, a walking touch *stored* a walk - and on grass slippery enough
 * for a kick to reach a net twenty-one cells away, seven cells a second of
 * stored walk rolls ten cells before the grass takes it. On screen the ball
 * you had been calmly pushing left for the far half of the pitch the moment
 * you eased off, which was reported as it jumping away - *"i run into to push
 * it before me but it jumps again to there"*.
 *
 * The friction cannot give: the level's own tests hold a driven shot to the
 * net and a missed one back off the wall, and both need the grass exactly this
 * slick. What gives is what a lean *keeps*. While you are on the ball the
 * separation still moves it at your full pace - it stays ahead of your box,
 * which is the whole feel of pushing - but only a third of that pace survives
 * you stopping, so the ball settles a step or two ahead, close enough to keep:
 * the picture asked for is the ball at your feet while you run, steered by
 * where you go. A dash still sends it - a third of a dash outruns any walk -
 * and a kick writes velocity through `push` and never comes through here, so
 * the two of them stay the ways to really send it.
 */
export const PUSH_CARRY = 0.3

/**
 * Closing speed below which a contact imparts nothing at all.
 *
 * Standing beside something while the interpolation breathes a millimetre a
 * frame must not tap it across the level. Below this the contact still
 * *separates* - you cannot stand inside it - it simply gives it nothing.
 *
 * Doing more work than it looks now that the speed is relative: a peer's box
 * comes out of the crowd buffer at eight samples a second and jitters, and a
 * body running away from you has a *negative* closing speed, so both fall under
 * this one line rather than needing rules of their own.
 */
export const MIN_APPROACH = 0.4

/**
 * How far the outgoing direction is bent toward the way you are running.
 *
 * The raw contact normal points from your body to the thing, and for a moving
 * player that is frequently sideways or backwards - catch the ball off centre
 * at a run and a pure normal squirts it out behind you, which the lounge calls
 * the single most infuriating thing a dribble can do and which was reported
 * here word for word as *"when u push the ball forward the ball goes sideway"*.
 *
 * Blending the normal toward your heading means a running touch carries it
 * *ahead* of you: the faster you move, the more the contact behaves like your
 * momentum and the less like billiards. Zero is pure geometry; one ignores
 * where on your body it actually touched.
 */
export const DRIBBLE_STEER = 0.8

/**
 * How fast you have to be going before a touch becomes a *hit*.
 *
 * Below this, walking into something only pushes it: it goes exactly as fast as
 * you do and stops the instant you do, like shouldering a box across a floor.
 * Above it, the excess is transferred as real speed and the thing rolls on
 * after you have stopped - which is what a dash does, and what a kick does more
 * of.
 *
 * `SPRINT_PACE`, so the whole ordinary range of running is a push and only a
 * dash is an impact. That is the line the report drew: *"normal it should just
 * be pushed with the box, with kick he flys roll forward, and with dash also"*.
 */
export const IMPACT_PACE = SPRINT_PACE

/** Every default in one place, so a reader does not have to collect them. */
export const BODY_DEFAULTS = {
  gravity: 1,
  bounce: 0,
  drag: 0.1,
  friction: 3,
  mass: 1,
  roll: 0,
} as const

/**
 * The player, as far as this file is concerned: a box that moved.
 *
 * `dx/dy/dz` is how far they travelled since the last frame, and it is the
 * whole of how hard they shove. Measured rather than asked for, which is the
 * trick the park template's kick script already used and the reason it felt
 * right: a level has no reading of how fast anybody is going, and one frame of
 * positions is exactly that. Walking into a ball rolls it; sprinting into it
 * sends it away.
 *
 * Standing still shoves nothing at all, which is the property that makes this
 * safe to run every frame on everything.
 */
export interface Shover {
  box: Box
  dx: number
  dy: number
  dz: number
}

export interface BodyInput {
  world: EntityWorld
  blueprints: Readonly<Record<string, Blueprint>>
  /** Seconds. The caller clamps it; a body integrating a backgrounded tab's
   * whole second travels through a wall. */
  delta: number
  isSolid: SolidTest
  /** Where each cell's geometry stops. Absent means every cell is full. */
  topOf?: SurfaceTest
  /** A plane under everything, so a body in a level with no floor laid yet
   * still lands. `XpWorld.floorY`. */
  floorY?: number
  /** Cells a second squared. Absent is `GRAVITY`, which is every level. */
  gravity?: number
  /**
   * Everybody who is walking about - this client's player, and every peer.
   *
   * A list rather than one, and the plural is what makes an elected owner work
   * at all. Only one client integrates the bodies (see `@kxb/xp/owning`), so if
   * that client only knew about *its own* shoulder, then walking into a ball
   * would move it for one person in the room and nobody else - which is the
   * shape of bug that gets blamed on the network and is not one.
   *
   * The owner needs no packets to do this: everybody's position is already on
   * the wire eight times a second and interpolated into the crowd buffer, so
   * their box and how far it moved are things every client already has. Nothing
   * about walking into a ball travels.
   *
   * Empty, or absent, is a world nobody is standing in.
   */
  shovers?: readonly Shover[]
  /** Below this a body has left the level and is put back to sleep at rest. */
  below?: number
}

/**
 * A body met something, on the frame it met it.
 *
 * `other` is the entity it hit, or **null for the level itself** - a floor, a
 * wall, a placement. That distinction is the whole reason contacts are returned
 * rather than swallowed: entity-on-entity is already `collide`, found by
 * `stepTriggers` comparing overlaps, and firing it from here as well would run
 * every collide rule twice. Hitting the *world* had no event at all, which is
 * what `hit` is for and why this list is what the caller turns into one.
 *
 * `speed` is how fast it was going **into** the surface, before the bounce -
 * cells a second, always positive. It is what tells a thud from a tap, and a
 * contact that reported the speed afterwards would report zero for every landing
 * on a `bounce: 0` body, which is most of them.
 */
export interface Contact {
  id: EntityId
  other: EntityId | null
  speed: number
}

/** The three axes, in the order they are resolved. */
type Axis = 'x' | 'y' | 'z'

/**
 * Whether a blueprint is a body, and what kind, with the defaults filled in.
 *
 * Exported because the editor asks the same question to decide whether to draw
 * the physics fields, and a second implementation of "is this thing dynamic"
 * is a second thing to keep in step.
 */
export function bodyOf(blueprint: Blueprint | undefined): Required<BodySpec> | null {
  if (!blueprint?.body) return null
  const spec = blueprint.body
  return {
    gravity: spec.gravity ?? BODY_DEFAULTS.gravity,
    bounce: spec.bounce ?? BODY_DEFAULTS.bounce,
    drag: spec.drag ?? BODY_DEFAULTS.drag,
    friction: spec.friction ?? BODY_DEFAULTS.friction,
    // Guarded rather than trusted: the parser refuses zero, and a document
    // built in memory dividing by it would send a crate to infinity.
    mass: spec.mass && spec.mass > 0 ? spec.mass : BODY_DEFAULTS.mass,
    roll: spec.roll ?? BODY_DEFAULTS.roll,
  }
}

/**
 * How fast this entity is going, or all zeros.
 *
 * Sparse like `light` and `material`, and for their reason: nearly nothing in a
 * level moves under its own steam, so a row per entity would be a map the size
 * of the world holding three zeros. Absent *is* at rest.
 */
export function velocityOf(world: EntityWorld, id: EntityId): { x: number; y: number; z: number } {
  return world.velocity.get(id) ?? { x: 0, y: 0, z: 0 }
}

/**
 * Add to what something is already doing, in cells a second, divided by mass.
 *
 * The verb behind a kick, and the reason it is *add* rather than *set*: a ball
 * already rolling that is kicked again should go faster, and a script that had
 * to read the velocity, add to it and write it back would be three crossings of
 * the sandbox bridge for one sentence.
 *
 * A no-op on anything that is not a body. A level that pushes its scenery has
 * asked for something the document does not describe, and moving it anyway
 * would leave a wall drifting with nothing in the file to explain it.
 */
export function push(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  id: EntityId,
  dx: number,
  dy: number,
  dz: number,
): boolean {
  if (!world.alive.has(id)) return false
  const name = world.blueprint.get(id)
  const spec = bodyOf(name ? blueprints[name] : undefined)
  if (!spec) return false
  if (![dx, dy, dz].every(Number.isFinite)) return false

  const at = velocityOf(world, id)
  world.velocity.set(id, capped({
    x: at.x + dx / spec.mass,
    y: at.y + dy / spec.mass,
    z: at.z + dz / spec.mass,
  }))

  /**
   * And recorded, so the host can tell the room.
   *
   * **Before mass is divided out**, deliberately: what travels is what the
   * caller asked for, and the receiver divides by the mass it reads off its own
   * copy of the blueprint. Sending the result instead would make the packet
   * depend on the sender's document, so a client on a stale version would push
   * the ball at the wrong strength rather than not at all.
   *
   * Written unconditionally, including on the owner, where nothing will be sent
   * with it - the host drains this list every frame whatever it does with it,
   * and a `push` that had to know who was elected would be this module knowing
   * about the network. See `EntityWorld.shoves`.
   */
  world.shoves.push({ id, dx, dy, dz })
  return true
}

/** Nothing leaves this file going faster than `MAX_BODY_SPEED` in any axis. */
function capped(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  if (speed <= MAX_BODY_SPEED || speed === 0) return v
  const scale = MAX_BODY_SPEED / speed
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale }
}

/**
 * Is this body starting inside the level's own geometry?
 *
 * ---------------------------------------------------------------------------
 * Why this is worth a public function
 * ---------------------------------------------------------------------------
 * A body that overlaps a solid cell **cannot move at all**, by design: `sweep`
 * refuses to relocate something that was already embedded, because the position
 * it is in came from the document or from a level's own rule and a physics pass
 * that quietly shoved it somewhere else would be a bug nobody could find in the
 * file. See the note there.
 *
 * The trouble is that this is completely silent from the outside. The thing is
 * drawn exactly where the author put it, the level parses, every model is one
 * we ship - and the ball simply never falls. Both levels built for this feature
 * hit it on the first run: a football placed on top of a one-cell centre spot,
 * and a row of skittles standing half a cell into the floor.
 *
 * So it is asked rather than discovered. `xps.test.ts` asks it of every body in
 * every level we ship, which turns a silent ball into a failing test with a
 * name on it.
 *
 * **The half-cell that catches people**: a blueprint with `collider: "none"`
 * has no box, so `boxOf` uses a half-metre cube around the entity's position -
 * which means an entity standing at `y: 1.4` on a floor whose surface is at 1.0
 * has its bottom at 0.9 and is inside it. Position a body by where its *middle*
 * goes, not by where its feet do.
 */
export function embedded(input: BodyInput, id: EntityId): boolean {
  const { world, blueprints } = input
  const name = world.blueprint.get(id)
  const blueprint = name ? blueprints[name] : undefined
  if (!bodyOf(blueprint)) return false
  const box = boxOf(world, blueprint, id)
  return box ? inSolid(box, input) : false
}

/**
 * One frame of everything in the level that moves on its own.
 *
 * Returns the contacts it made, in no particular order. The world is mutated -
 * positions, velocities, boxes and the cosmetic `rotation` - which is the one
 * place this file differs from `physics.ts`, and it is not laziness: the
 * controller steps exactly one body and hands the answer back, and this steps
 * every body in the level, so returning them would be allocating a result per
 * entity per frame to hand the caller something it would only write back.
 */
export function stepBodies(input: BodyInput): Contact[] {
  const { world, blueprints, delta } = input
  const contacts: Contact[] = []
  if (!(delta > 0)) return contacts

  const gravity = input.gravity ?? GRAVITY
  const shovers = input.shovers ?? []

  for (const id of world.alive) {
    const name = world.blueprint.get(id)
    const spec = bodyOf(name ? blueprints[name] : undefined)
    if (!spec) continue

    /**
     * A thing in somebody's hands is not falling, and it is not colliding either.
     *
     * `world.box` is stale for anything being carried - the hand moves it and
     * the box is not rebuilt - so a held body stepped here would be resolved
     * against a box from wherever it was picked up. Zeroed rather than merely
     * skipped, so a ball caught mid-flight and dropped falls from rest rather
     * than resuming the throw it was on.
     */
    if (world.parent.has(id) || world.heldBy.has(id)) {
      if (world.velocity.has(id)) world.velocity.delete(id)
      continue
    }

    // Off means off. A deactivated pickup is not drawn and not walked into, and
    // a thing that quietly kept falling while it was away would come back
    // somewhere nobody put it.
    if (world.returns.has(id)) continue

    const was = world.position.get(id)
    if (!was) continue

    /**
     * Worked on as a copy and written back at the end.
     *
     * Not tidiness: `setPos` on the script bridge *replaces* the row, so
     * anything that held onto a position object from before a script moved
     * something kept a stale one and knew it. If this mutated the row in place
     * instead, the same reference would silently follow the ball around, and
     * the two movers in the engine would disagree about what holding a position
     * means. One of them has to win and it should be the one that cannot
     * surprise you - which cost exactly one small object per *moving* body per
     * frame, because a body at rest never reaches the write below.
     */
    const at = { x: was.x, y: was.y, z: was.z }

    const blueprint = blueprints[name as string]
    let box = boxOf(world, blueprint, id)
    if (!box) continue

    const v = { ...velocityOf(world, id) }

    /**
     * This frame's contact, kept apart from the body's own velocity.
     *
     * The distinction is the whole of "pushed rather than hit". Being leaned on
     * moves a thing while the leaning lasts and *not afterwards*: put into `v`
     * it would be stored and the ball would roll away from a touch, which is
     * what it did and what was reported as the ball leaving on its own. So it
     * is added for the move below and thrown away, and only a real impact - a
     * dash, a kick - writes anything into `v`.
     */
    const contact = { x: 0, z: 0 }
    for (const shover of shovers) shove(v, contact, spec, box, shover, delta)

    v.y -= gravity * spec.gravity * delta
    if (v.y < -MAX_FALL_SPEED) v.y = -MAX_FALL_SPEED

    const before = { x: at.x, y: at.y, z: at.z }
    let grounded = false

    for (const axis of ['x', 'y', 'z'] as readonly Axis[]) {
      // The contact is horizontal only, and it moves the body without being
      // remembered by it.
      const pushed = axis === 'y' ? 0 : contact[axis]
      const wanted = (v[axis] + pushed) * delta
      if (wanted === 0) continue

      const met = sweep(world, id, box, axis, wanted, input)
      at[axis] += met.moved
      box = shifted(box, axis, met.moved)

      if (met.hit === undefined) continue

      const speed = Math.abs(v[axis] + pushed)
      /**
       * Resting on a surface rather than arriving at one.
       *
       * The guard against the drone, and it has to be here rather than at the
       * top of the frame. Gravity is applied unconditionally above, so anything
       * *touching* a surface - lying still on it, or rolling along it at speed -
       * is pulled into it every single frame and stopped again every single
       * frame. Reported, that is a `hit` rule firing sixty times a second on a
       * ball that is visibly just rolling.
       *
       * The threshold is one frame of that pull rather than a constant, which
       * is what makes it frame-rate independent: a body in contact with the
       * ground accrues exactly `gravity × delta` downward each frame - 0.43
       * cells a second at sixty frames, 1.3 at twenty - so any fixed number
       * that is quiet on a fast machine would drone on a slow one.
       *
       * The half above it is headroom for the frame a real landing finishes on,
       * and the cost is that a touchdown gentler than about half a cell a
       * second reports nothing. Which is a landing nobody can see or hear.
       */
      const pull = Math.abs(gravity * spec.gravity) * delta
      const settling = axis === 'y' && wanted < 0 && speed <= pull * 1.5
      if (!settling) contacts.push({ id, other: met.hit, speed })
      if (axis === 'y' && wanted < 0) grounded = true

      v[axis] = -v[axis] * spec.bounce
      if (Math.abs(v[axis]) < BOUNCE_FLOOR) v[axis] = 0
    }

    /**
     * Slowed by whichever of the two applies, and only sideways.
     *
     * Vertical is left alone on purpose: gravity and the bounce already own it,
     * and dragging it as well would be a body that falls slower the longer it
     * falls, which `MAX_FALL_SPEED` is the right answer to.
     */
    const decay = Math.max(0, 1 - (grounded ? spec.friction : spec.drag) * delta)
    v.x *= decay
    v.z *= decay

    // Below a walking pace, on the floor, it has stopped. See REST_SPEED: a
    // body that creeps is a body somebody will report as drifting.
    if (grounded && Math.sqrt(v.x * v.x + v.z * v.z) < REST_SPEED) {
      v.x = 0
      v.z = 0
    }

    /**
     * Out of the world, put back to rest where it fell through.
     *
     * Not despawned and not teleported: this is the same guard `OUT_OF_WORLD`
     * is for a player, and its job is to stop a thing accelerating forever in
     * the dark rather than to decide what a level wants to happen. A document
     * that wants the ball back at the centre spot writes that rule; see
     * `worlds: a way out of a wall, and of a ball nobody can reach`.
     */
    if (input.below !== undefined && at.y < input.below) {
      v.x = 0
      v.y = 0
      v.z = 0
    }

    if (v.x === 0 && v.y === 0 && v.z === 0) world.velocity.delete(id)
    else world.velocity.set(id, capped(v))

    const travelled = Math.sqrt(
      (at.x - before.x) ** 2 + (at.y - before.y) ** 2 + (at.z - before.z) ** 2,
    )
    /**
     * And nothing about how it is *turned*, which used to be here.
     *
     * `spec.roll` spun `world.rotation` by the distance travelled, and it was
     * wrong twice over. It is a **yaw**, so a ball did not roll, it twirled on
     * the spot; and `rotation` is not in a `BodySample`, so it only ever happened
     * on whichever client was integrating - one player saw a ball spinning and
     * the other saw one skating, and after `Balls` the second player was usually
     * whoever had just kicked it.
     *
     * It is cosmetic by its own definition, so it belongs on the far side of the
     * line the renderer already draws for a flinch: `Rolling` in
     * `@kxb/xp/drawing` turns the drawn mesh about the axis perpendicular to
     * travel, derived from the drawn position, which is the one signal every
     * client has and the only one that is the same on all of them.
     */
    if (travelled > 0) {
      world.position.set(id, at)
      refresh(world, blueprint, id)
    }
  }

  return contacts
}

/**
 * The box this body collides with, whether or not it is solid to a person.
 *
 * `entityBox` answers null for `collider: "none"`, which is right for the grid
 * and wrong here: a pickup you walk through still has to land on the floor
 * rather than fall through it. The fallback is `triggerBox`'s, half a metre
 * each way, and it is the same choice for the same reason - the model's own
 * footprint is where the thing looks like it is.
 */
function boxOf(world: EntityWorld, blueprint: Blueprint | undefined, id: EntityId): Box | null {
  const held = world.box.get(id)
  if (held) return held
  const at = world.position.get(id)
  if (!at || !blueprint) return null

  /**
   * Measured off the model, standing where the model stands.
   *
   * A plain cube centred on the position was the first answer and it made every
   * colliderless body **float its own radius above the floor**: a drawn model is
   * placed by its bottom (see `floorOffset`), so the physics rested the ball
   * half a cell too high and the renderer then lifted the mesh again to stand it
   * on that. Reported with a picture of a ball hanging over its own shadow.
   */
  const measured = shapeBox(blueprint, at, world.rotation.get(id) ?? 0, world.scale.get(id) ?? 1, {
    pitch: world.pitch.get(id),
    roll: world.roll.get(id),
    stretch: world.stretch.get(id),
  })
  if (measured) return measured

  /**
   * A thing with no shape at all - `draw: false`, so there is nothing to
   * measure. Footed on the position rather than centred on it, because that is
   * where everything else in this format puts a thing.
   */
  const reach = 0.5
  return {
    minX: at.x - reach,
    minY: at.y,
    minZ: at.z - reach,
    maxX: at.x + reach,
    maxY: at.y + reach * 2,
    maxZ: at.z + reach,
  }
}

/** Put the collision box back where the entity now is. */
function refresh(world: EntityWorld, blueprint: Blueprint | undefined, id: EntityId): void {
  if (!blueprint) return
  const at = world.position.get(id)
  if (!at) return
  /**
   * `entityBox`, not `shapeBox`: `world.box` is the *collision* row, and a thing
   * with `collider: "none"` must stay absent from it or it would start stopping
   * people halfway through a roll. What the body is resolved against comes from
   * `boxOf`, which measures the shape whether or not there is a row here.
   */
  const box = entityBox(blueprint, at, world.rotation.get(id) ?? 0, world.scale.get(id) ?? 1, {
    pitch: world.pitch.get(id),
    roll: world.roll.get(id),
    stretch: world.stretch.get(id),
  })
  if (box) world.box.set(id, box)
  else world.box.delete(id)
}

function shifted(box: Box, axis: Axis, by: number): Box {
  if (by === 0) return box
  const min = axis === 'x' ? 'minX' : axis === 'y' ? 'minY' : 'minZ'
  const max = axis === 'x' ? 'maxX' : axis === 'y' ? 'maxY' : 'maxZ'
  return { ...box, [min]: box[min] + by, [max]: box[max] + by }
}

/**
 * How far it may go along one axis, and what stopped it.
 *
 * Bisection rather than a swept test, and that is a deliberate trade. A frame's
 * travel is small - a body at the speed cap covers one cell in a sixtieth of a
 * second - so eight halvings resolve a contact to under four thousandths of a
 * cell, which is finer than anything anybody can see. A proper swept solve
 * against both a voxel grid and a box list is a great deal more code for a
 * difference that shows up only at speeds `MAX_BODY_SPEED` already refuses.
 *
 * `hit` is `undefined` for a clean move, `null` for the level's own geometry,
 * and an id for another entity - see `Contact`, where the same three-way answer
 * is the point.
 */
function sweep(
  world: EntityWorld,
  id: EntityId,
  box: Box,
  axis: Axis,
  wanted: number,
  input: BodyInput,
): { moved: number; hit?: EntityId | null } {
  const blocked = (by: number): EntityId | null | undefined => {
    const moved = shifted(box, axis, by)
    if (inSolid(moved, input)) return null
    return meets(world, id, moved)
  }

  const full = blocked(wanted)
  if (full === undefined) return { moved: wanted }

  /**
   * Already inside something before it moved.
   *
   * A body spawned in a wall, or one a script teleported into the floor. Left
   * alone rather than pushed out: the position it is in came from the document
   * or from a level's own rule, and a physics pass that quietly relocated it
   * would be a bug nobody could find in the file. It simply cannot move that
   * way, and the contact is reported so a rule can say something about it.
   */
  if (blocked(0) !== undefined) return { moved: 0, hit: full }

  let low = 0
  let high = wanted
  let hit: EntityId | null = full
  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) / 2
    const met = blocked(mid)
    if (met === undefined) low = mid
    else {
      high = mid
      hit = met
    }
  }
  return { moved: low, hit }
}

/** Does this box overlap the level's own geometry, or the plane under it? */
function inSolid(box: Box, input: BodyInput): boolean {
  if (input.floorY !== undefined && box.minY < input.floorY) return true

  /**
   * Every cell the box touches, not just the one its centre is in.
   *
   * A ball is wider than a cell at the sizes levels are built at, and a test on
   * the centre alone is a ball whose edge is a foot inside the wall before
   * anything notices - which reads as the wall being in the wrong place.
   *
   * The epsilon keeps a box resting *exactly* on a surface out of the cell
   * above it. Without it a body at rest reports a contact every frame, which
   * would fire a `hit` rule sixty times a second on something that is lying
   * still.
   */
  const e = 1e-4
  const minX = Math.floor(box.minX + e)
  const maxX = Math.floor(box.maxX - e)
  const minY = Math.floor(box.minY + e)
  const maxY = Math.floor(box.maxY - e)
  const minZ = Math.floor(box.minZ + e)
  const maxZ = Math.floor(box.maxZ - e)

  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        if (!input.isSolid(x, y, z)) continue
        // Where the geometry in that cell actually stops - the half-cell
        // `Solids.topOf` exists for. A floor tile 0.5 tall fills its cell, and
        // a ball resting on the tile is not inside the tile.
        const top = input.topOf ? input.topOf(x, y, z) : y + 1
        if (box.minY < top - e) return true
      }
    }
  }
  return false
}

/**
 * The first other entity this box is inside, or undefined.
 *
 * Bodies stop each other, so two balls do not occupy one spot - and a body
 * stops on a crate, which is what makes "put the ball on the table" a thing
 * that happens rather than a thing you script. Whatever is being carried is
 * skipped for `stepBodies`'s reason: its box is stale.
 */
function meets(world: EntityWorld, id: EntityId, box: Box): EntityId | undefined {
  for (const other of world.alive) {
    if (other === id || other === PLAYER_ID) continue
    if (world.returns.has(other)) continue
    if (world.parent.has(other) || world.heldBy.has(other)) continue
    const theirs = world.box.get(other)
    if (!theirs) continue

    /**
     * Only things that are actually solid, which is what `world.box` means.
     *
     * A colliderless pickup has no row here, so a ball rolls through a coin and
     * the coin's `collide` rule still fires - `stepTriggers` finds that by
     * overlap and does not care whether anything stopped. Solidity and
     * triggerability are unrelated, and this is the line that keeps them so.
     */
    if (
      box.minX < theirs.maxX &&
      box.maxX > theirs.minX &&
      box.minY < theirs.maxY &&
      box.maxY > theirs.minY &&
      box.minZ < theirs.maxZ &&
      box.maxZ > theirs.minZ
    ) {
      return other
    }
  }
  return undefined
}

/**
 * The player's shoulder, turned into velocity.
 *
 * Fires when they are within `SHOVE_REACH` of the box and **moving towards it**
 * - the dot product, which is the whole guard. Without it, standing pressed
 * against a crate would push it across the level at walking pace forever, and
 * backing away from a ball would drag it after you.
 *
 * Horizontal only. A person who walks over something does not press it into the
 * floor, and a jump landing on a ball reads as standing on it - which the box
 * collision above already does properly.
 */
function shove(
  v: { x: number; y: number; z: number },
  contact: { x: number; z: number },
  spec: Required<BodySpec>,
  box: Box,
  shover: Shover,
  delta: number,
): void {
  const near = {
    minX: box.minX - SHOVE_REACH,
    minY: box.minY - SHOVE_REACH,
    minZ: box.minZ - SHOVE_REACH,
    maxX: box.maxX + SHOVE_REACH,
    maxY: box.maxY + SHOVE_REACH,
    maxZ: box.maxZ + SHOVE_REACH,
  }
  const them = shover.box
  if (
    !(
      near.minX < them.maxX &&
      near.maxX > them.minX &&
      near.minY < them.maxY &&
      near.maxY > them.minY &&
      near.minZ < them.maxZ &&
      near.maxZ > them.minZ
    )
  ) {
    return
  }

  /**
   * Where the contact happened, and where you are going, blended.
   *
   * Neither alone is right. The **normal** - your centre to its centre - is
   * where the touch physically was, and on its own it squirts the ball out
   * sideways when you meet it off centre at a run. Your **heading** on its own
   * ignores which part of you hit it, so brushing past something would fire it
   * dead ahead. `DRIBBLE_STEER` weights the two, and the result is that a
   * running touch carries the thing in front of you.
   */
  const stride = Math.sqrt(shover.dx * shover.dx + shover.dz * shover.dz)
  /** How fast the shover is travelling, whatever direction. Bounds the separation. */
  const pace = stride / delta

  const toX = (box.minX + box.maxX) / 2 - (them.minX + them.maxX) / 2
  const toZ = (box.minZ + box.maxZ) / 2 - (them.minZ + them.maxZ) / 2
  const gap = Math.sqrt(toX * toX + toZ * toZ)
  const normX = gap > 1e-6 ? toX / gap : 0
  const normZ = gap > 1e-6 ? toZ / gap : 0

  const goX = stride > 1e-6 ? shover.dx / stride : 0
  const goZ = stride > 1e-6 ? shover.dz / stride : 0

  /**
   * Only if you are closing on it.
   *
   * Without this, walking *away* from something you are standing beside pushes
   * it along behind you - your heading is still a direction and the geometry
   * has no opinion about which side of it you are on.
   */
  if (gap > 1e-6 && stride > 1e-6 && goX * normX + goZ * normZ <= 0) return

  let dirX = normX * (1 - DRIBBLE_STEER) + goX * DRIBBLE_STEER
  let dirZ = normZ * (1 - DRIBBLE_STEER) + goZ * DRIBBLE_STEER
  const dir = Math.sqrt(dirX * dirX + dirZ * dirZ)
  if (dir < 1e-6) return
  dirX /= dir
  dirZ /= dir

  /**
   * Out of each other, whatever else happens.
   *
   * The separation runs even for a contact too slow to impart anything - you
   * must not be able to stand inside a ball - and it is bounded by your own
   * pace so it can never outrun the person doing the separating.
   */
  const depth = Math.min(
    Math.min(near.maxX, them.maxX) - Math.max(near.minX, them.minX),
    Math.min(near.maxZ, them.maxZ) - Math.max(near.minZ, them.minZ),
  )
  const apart = Math.min(Math.max(0, depth - SHOVE_REACH) / SEPARATION_TIME, pace) / spec.mass
  if (apart > 0) {
    const already = contact.x * dirX + contact.z * dirZ
    if (apart > already) {
      contact.x += dirX * (apart - already)
      contact.z += dirZ * (apart - already)
    }
  }

  /**
   * How fast the two are actually closing, which is not how fast either is going.
   *
   * ---------------------------------------------------------------------------
   * The report this exists for
   * ---------------------------------------------------------------------------
   * *"the ball now glitch also when u push the ball to move it, its worse than
   * before"*. Simulated, a walk down the pitch looked like this: the ball leaves
   * the first touch at 11.9, coasts down to 3.6 over a second and three quarters
   * as the grass takes it, and the frame you catch it up it goes back to 11.9 -
   * **eight cells a second appearing in one frame**, over and over, forever. On
   * screen that is not a dribble, it is the ball being teleported away from you
   * every couple of seconds, which is exactly the word that came back.
   *
   * The cause was measuring the touch against *nothing*. `approach` was the
   * shover's own pace, so every contact was priced as though the ball were
   * standing still - catching up with a ball already rolling at nearly your own
   * speed was charged the same 1.7 times a walk as meeting a dead one.
   *
   * ---------------------------------------------------------------------------
   * Relative, and why that is a dribble
   * ---------------------------------------------------------------------------
   * Two changes, both of which are what "closing" means:
   *
   *   - **less what it is already doing.** Trot after a ball rolling at 6.8 and
   *     you are closing at 0.2, so it gets a tap worth 0.2 - not a kick worth
   *     seven. The ball then rides just ahead of you off a stream of small
   *     touches and the speed never steps. Meet a resting ball at a walk and the
   *     closing speed *is* your walk, so the first touch is exactly what it was
   *     and `PUSH_TRANSFER` keeps its meaning;
   *   - **along the contact normal**, the way the lounge's own sim does it, so
   *     clipping the ball with the side of your box is a glancing touch rather
   *     than a full-pace one. A pure magnitude made brushing past it at a sprint
   *     into a shot.
   *
   * It also subsumes a rule that used to be written separately: a body running
   * away faster than you can catch it has a negative closing speed and is left
   * alone, so a kicker's follow-through cannot drag their own shot back.
   */
  const arriving = (shover.dx * normX + shover.dz * normZ) / delta
  const closing = arriving - (v.x * normX + v.z * normZ)

  // Too slow to be a touch. It has been separated; it gets nothing else.
  if (closing < MIN_APPROACH) return

  /**
   * And the speed it leaves with, which it **keeps**.
   *
   * Two numbers, and both are needed:
   *
   *   - what this touch **adds**, which is the closing speed and is what makes a
   *     dribble a dribble;
   *   - what a touch at this pace is **worth at all**, which is a ceiling.
   *
   * The ceiling is what `mass` means, and leaving it out was a bug in the first
   * draft of this: contact holds for as long as you keep walking, so a crate
   * twenty times your weight, gaining a twentieth of the closing speed sixty
   * times a second, was up to walking pace inside a second and shoving a wardrobe
   * around felt like shoving a ball. Mass has to bound where the body *ends up*,
   * not merely how quickly it gets there - the same "a force applied while a
   * condition holds accumulates at frame rate" this file has now been caught by
   * twice.
   *
   * ---------------------------------------------------------------------------
   * And the bound that was missing from it: your own pace
   * ---------------------------------------------------------------------------
   * *"it jumps when I touch it - it should be pushed for me"*, measured in the
   * real level: walking into the ball on the centre spot at seven cells a second
   * left it doing **11.76** on the very next frame, so it ran away from the
   * person who touched it at one and two thirds their speed and was in the net,
   * twenty-one cells away, before they had taken four steps. Nothing about that
   * frame is a network: it is one client, one simulation, `1.7 * 7`.
   *
   * The ceiling above was already the right shape and was bounding the wrong
   * thing. `PUSH_TRANSFER` says how fast a body converges on being pushed - which
   * is what makes a dribble a stream of small touches instead of a shove - and it
   * was also being read as *where it lands*, where 1.7 has no meaning at all: a
   * thing you lean on cannot end up going faster than you are going, or you have
   * lost it by touching it.
   *
   * So `pace` joins the ceiling. A body leaves a contact at your speed at the
   * most, which is the whole of what "pushed" means and is the level's own blurb
   * word for word - *"run into the ball and it goes along in front of you"*. It
   * carries, so this is not the push-that-was-not-stored the lounge's model
   * replaced: stop walking and it rolls on and the grass takes it. It simply
   * cannot outrun you while you are the one pushing it, so the ball stays
   * playable and a **kick** - which writes into the velocity through `push` and
   * never comes through here - is once again the hardest thing you can do to it.
   *
   * Along the normal for the glancing case, so the smaller of the two still wins:
   * clipping the ball with the side of your box at a sprint is worth the clip,
   * not the sprint.
   *
   * For anything of ordinary weight the *mass* half of the ceiling never binds.
   * It is there for the heavy case and for a body coming *at* you, where the
   * closing speed is the sum of two speeds rather than a difference.
   */
  const along = v.x * dirX + v.z * dirZ
  // Half your pace, not your pace: what a lean stores is not the lean itself.
  // The separation above still tracks you at full speed - see PUSH_CARRY.
  const most =
    Math.min(Math.max(arriving * PUSH_TRANSFER, MIN_DRIBBLE_SPEED), pace * PUSH_CARRY) /
    spec.mass
  const out = Math.min(along + (closing * PUSH_TRANSFER) / spec.mass, most)
  if (along >= out) return
  v.x += dirX * (out - along)
  v.z += dirZ * (out - along)
}

/**
 * The first body this shover is close enough to shove, or null.
 *
 * The overlap half of `shove` and nothing else - no direction, no speed, no
 * closing test. It exists for a **follower**, which is a client that has been
 * handed `EMPTY_SHOVERS` precisely so that it does not move an owned body, and
 * therefore has no other way to notice that it is standing on one.
 *
 * That is what ownership following the ball needs: the moment you are on it you
 * claim it, and from then on your own machine is the one resolving your foot
 * against it rather than the owner inferring your shove from an avatar box a
 * quarter of a second old. See `@kxb/xp/owning`.
 *
 * Cheap on purpose - it is called once a frame by whoever is *not* simulating,
 * and it stops at the first hit, because "am I on something" does not need to
 * know how many things.
 */
export function nearBody(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  shover: Shover,
): EntityId | null {
  const them = shover.box
  for (const id of world.alive) {
    const name = world.blueprint.get(id)
    if (!bodyOf(name ? blueprints[name] : undefined)) continue
    if (world.parent.has(id) || world.heldBy.has(id) || world.returns.has(id)) continue
    const blueprint = name ? blueprints[name] : undefined
    const box = boxOf(world, blueprint, id)
    if (!box) continue
    if (
      box.minX - SHOVE_REACH < them.maxX &&
      box.maxX + SHOVE_REACH > them.minX &&
      box.minY - SHOVE_REACH < them.maxY &&
      box.maxY + SHOVE_REACH > them.minY &&
      box.minZ - SHOVE_REACH < them.maxZ &&
      box.maxZ + SHOVE_REACH > them.minZ
    ) {
      return id
    }
  }
  return null
}

/**
 * The box a player stands in, for a caller that has a position and no controller.
 *
 * Here rather than in the runtime because `PLAYER_RADIUS` and `EYE_HEIGHT` are
 * this package's numbers, and a host doing the arithmetic itself is a host that
 * can get it wrong in a way nothing here would catch.
 *
 * `at` is the **eye**, matching `StepInput.position`, because that is what a
 * host has in its hand - the camera.
 */
export function shoverBox(at: { x: number; y: number; z: number }): Box {
  return {
    minX: at.x - PLAYER_RADIUS,
    maxX: at.x + PLAYER_RADIUS,
    minY: at.y - EYE_HEIGHT,
    maxY: at.y,
    minZ: at.z - PLAYER_RADIUS,
    maxZ: at.z + PLAYER_RADIUS,
  }
}
