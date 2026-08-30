/**
 * Things in the world, and the state that belongs to them.
 *
 * ---------------------------------------------------------------------------
 * Call it an ECS if you like; this is not a general one
 * ---------------------------------------------------------------------------
 * Components are plain maps keyed by id, systems are functions run in a
 * declared order, and the whole thing is pure over one struct. No archetypes,
 * no bitsets, no scheduler.
 *
 * The reason is the same one that makes the character controller testable: a
 * function that takes state and returns state can be checked without a canvas,
 * and the moment there is an archetype allocator in the middle it cannot. The
 * ceiling to design against is a few hundred entities and sixteen players; past
 * that the maps become typed arrays and nothing above changes shape.
 *
 * ---------------------------------------------------------------------------
 * Two rules that keep it honest
 * ---------------------------------------------------------------------------
 * **Nothing here touches the renderer.** The scene reads the world after a step
 * and draws it. That is what lets a whole match run inside a test.
 *
 * **Nothing here awaits.** Anything asynchronous - a durable score, a message
 * to the other players - is an *effect* the step returns and the host drains.
 * A system that awaits is a system whose order stops being deterministic, and
 * determinism is the only reason the tests mean anything.
 */

import {
  type Blueprint,
  type Box,
  composeTurn,
  entityBox,
  isFlat,
  type Light,
  type XpMaterial,
  partTransforms,
  type Stretch,
  stretchOf,
  turnOf,
  turnPoint,
  type Turn,
} from '../document/blueprints'
import type { Blocker } from './physics'
import type { EntitySpec, XpDocument } from '../document/format'

export type EntityId = number

/**
 * One tick's worth of world.
 *
 * A map per component rather than an array of objects. It reads worse and it is
 * the right shape for the thing this becomes: a system that only cares about
 * health walks the health map, not every entity asking whether it has any.
 */
export interface EntityWorld {
  /** Ticks since the instance started. Whole numbers; the step is fixed. */
  tick: number
  /**
   * What second it is, on the clock a document speaks.
   *
   * The same number `deactivate` deadlines are in and a script reads as
   * `world.time`, kept *on the world* rather than beside it - which it was, as a
   * ref in the host's frame loop, passed into `stepReturns` by hand.
   *
   * `motion` is what made that untenable. A running motion is a name and the
   * second it started, and *where it is now* is a pure function of the two - so
   * every reader of that pair needs the current second, and one of those readers
   * is the renderer, which has no business being handed the host's private ref.
   * A world that holds a `since` has to know what now is.
   *
   * Advanced by the host, from its own clamped delta, so a tab returning from
   * the background does not fast-forward every motion in the level at once.
   * Zero in a world nobody is stepping - the editor's preview - which is exactly
   * right: nothing has started, so nothing is anywhere but at rest.
   */
  seconds: number
  /** Every id that exists. Removing from here is what despawning means. */
  alive: Set<EntityId>
  /**
   * Things that are off, and the moment each one comes back.
   *
   * Keyed by id, holding the time it returns in *seconds* - the same clock a
   * script reads as `world.time`, because a document says "eight seconds" and
   * nothing in a document should have to know what a tick is. `Infinity` means
   * it stays off until something turns it on.
   *
   * Separate from `alive` rather than a flag on it, and that is the whole
   * design: `despawn` already leaves every component row in place, so being off
   * and being dead are the *same state* as far as the rest of the engine is
   * concerned. What this adds is a reason to come back.
   */
  returns: Map<EntityId, number>
  blueprint: Map<EntityId, string>
  position: Map<EntityId, { x: number; y: number; z: number }>
  rotation: Map<EntityId, number>
  /**
   * The other two angles, and the per-axis size. Only the things that have any.
   *
   * Sparse on purpose, the way `name` and `parent` are: almost nothing in a
   * level is tilted or stretched, so a row per entity would be three maps the
   * size of the world holding zero and one. A missing row reads as level and
   * unstretched everywhere, which is what absence means in the document too.
   */
  pitch: Map<EntityId, number>
  roll: Map<EntityId, number>
  stretch: Map<EntityId, Stretch>
  scale: Map<EntityId, number>
  props: Map<EntityId, Record<string, number>>
  /**
   * How fast each thing is going, in cells a second, for the few that are going.
   *
   * Sparse like `light` and `material`, and harder than either: almost nothing
   * in a level moves under its own steam, and of the things that can, most are
   * lying still most of the time. So `stepBodies` **deletes** the row when a
   * body comes to rest rather than leaving three zeros there - absent and at
   * rest are the same state, and keeping them the same is what stops a level of
   * settled crates costing a map walk a frame.
   *
   * **Here rather than in `props`**, which would have been scriptable for free
   * and is the same argument `light` makes one field up: a velocity is read and
   * written sixty times a second by the engine itself, and sitting it next to
   * `hp` would put it where `addProp` and every `when` clause can see it. It is
   * a fact about where the thing is going, which is what `position` and
   * `rotation` are, so it sits with them.
   *
   * Written by `@kxb/xp/bodies` and by a script's `push`. Read by both, and by
   * `@kxb/xp/sharing`, which is what lets one client own a ball and the rest
   * watch it.
   */
  velocity: Map<EntityId, { x: number; y: number; z: number }>
  /**
   * Pushes made this frame, for a host that has to tell somebody about them.
   *
   * An **outbox**, and the only one on the world: everything else here is state,
   * and this is a list of things that happened, drained and cleared by the host
   * every frame exactly as its own effect list is.
   *
   * It exists because of who owns a body. `@kxb/xp/owning` elects one client to
   * integrate the moving things, and a kick by anybody *else* is a kick that
   * gets corrected away a fraction of a second later - the ball leaps and comes
   * back, intermittently, and only for the people who are not the owner. So a
   * push has to be able to reach the owner, and to reach it the host has to
   * know a push happened.
   *
   * The host cannot work that out for itself. A script's `self.push()` crosses
   * a sandbox bridge into `push`, which changes a velocity - and a velocity
   * that changed is indistinguishable from one gravity changed. Only the call
   * itself knows, so the call records it.
   *
   * **Only what a script asked for.** The player's shoulder is not in here and
   * must not be: the owner already knows where everybody is standing, so it
   * works out everybody's shove from the crowd buffer without a single packet.
   * See `Shove`.
   */
  shoves: { id: EntityId; dx: number; dy: number; dz: number }[]
  /** What a rule or a script calls it. Only the entities that have one. */
  name: Map<EntityId, string>
  /** Who it hangs from, and where on them. */
  parent: Map<EntityId, { id: EntityId; socket?: string }>
  /**
   * The box this entity stops the player with, or absent for one you walk
   * through.
   *
   * Cached rather than recomputed per frame: it changes when an entity moves,
   * which nothing does yet, and the character controller asks for the whole
   * list sixty times a second.
   */
  box: Map<EntityId, Box>
  /**
   * The lamp this entity is, for the few that are one.
   *
   * Sparse like `pitch` and `stretch`, and for the same reason: almost nothing
   * in a level glows, so a row per entity would be a map the size of the world
   * holding nothing.
   *
   * **Here rather than in `props`**, which was the other candidate and would
   * have been scriptable for free. Two things decided against it: `colour` is a
   * number that is not a *quantity* — halving it is not half the colour — so it
   * has no business next to `hp` where `addProp` will happily arithmetic on it;
   * and a level naming its own property `range` would have started dimming the
   * lights. A light is a fact about how a thing is drawn, which is what
   * `rotation`, `scale` and `stretch` are, so it sits with them.
   */
  light: Map<EntityId, Light>
  /**
   * What a sign says, for the few entities that are one.
   *
   * Sparse like `light` and `pitch`, and for the same reason: almost nothing in
   * a level is a sign, so a row per entity would be a map the size of the world
   * holding nothing. Read by the runtime's `./signs`, which draws it near the
   * entity when a player is close enough to read it.
   */
  text: Map<EntityId, string>
  /**
   * What this entity is made of, for the few that are not made of themselves.
   *
   * Sparse like `light` and `text`, and for their reason exactly: nearly
   * everything in a level wears its own model's materials, so a row per entity
   * would be a map the size of the world holding the word `own` over and over.
   * Absent *is* `own`, and the two are the same statement - which is what lets
   * a `material` verb clear the row rather than write a second kind of nothing.
   *
   * **Here rather than in `props`**, for `text`'s reason: a material is a name
   * and `props` is numbers. It is also the same class of fact `light` is - how
   * a thing is drawn rather than what it is doing - so it sits beside it.
   */
  material: Map<EntityId, XpMaterial>
  /**
   * A clip a script has asked this entity's body to play.
   *
   * Sparse like `light` and `text`, and for the same reason: almost nothing in
   * a level has a skeleton, let alone one being told what to do. Absent means
   * the body animates itself from how it is moving, which is every entity in
   * every document written before this existed.
   *
   * ---------------------------------------------------------------------------
   * A name and a flag, and a number that is neither
   * ---------------------------------------------------------------------------
   * `at` is the tick the request was made on, and it is what makes *playing the
   * same clip twice* a thing that can be asked for. A renderer that compared
   * only the name would see `Melee_Unarmed_Attack_Punch_A` both times and leave
   * the first one running, so a script punching once a second would animate
   * once and then stand still. Two swings are two events, and an event needs a
   * moment attached or it cannot be distinguished from the one before it - the
   * same argument `unstickAt` and `reviveAt` make one layer up.
   *
   * **Not in `props`**, which was the other candidate: a clip is a name rather
   * than a quantity, and `props` is numbers only.
   *
   * The name is not checked here. This package does not know which glTFs a host
   * has loaded - `blueprint.pose` has exactly the same contract and the editor
   * is what stops an author naming a clip nothing fetches - so a name the host
   * does not hold leaves the body in whatever it was already doing.
   *
   * ---------------------------------------------------------------------------
   * `parts` is what turns a clip into a layer
   * ---------------------------------------------------------------------------
   * Absent means the whole body, and the clip *replaces* what it was doing: a
   * script that asks for a death animation has asked for a death animation, and
   * a body that carried on walking through it would be a call that did nothing.
   *
   * Present names the parts it applies to - `["arms"]`, `["torso", "head"]` -
   * and then it is laid **over** whatever the body is already doing rather than
   * instead of it. So a character can wave while it walks, which is the same
   * mechanism the host's own gestures use and the reason it exists: the arms
   * take the offset the animator authored and the legs keep their cycle.
   *
   * Which names mean which bones is the host's business, not this package's -
   * they are names of parts of *a rig*, and a document that could be played on
   * two different bodies would be naming two different things.
   */
  clip: Map<EntityId, { name: string; loop: boolean; at: number; parts?: readonly string[] }>
  /**
   * A motion of this entity's own model that is running, and when it started.
   *
   * Sparse, like `clip` and for the same reason. Absent means every node of the
   * model is at rest, which is every entity in every document written before
   * `Blueprint.motions` existed.
   *
   * ---------------------------------------------------------------------------
   * A name and a moment, and nothing about where anything currently is
   * ---------------------------------------------------------------------------
   * `since` is the second the motion started, on the same clock `deactivate`
   * deadlines and `world.time` use - not a tick, because a motion's steps are
   * authored in seconds and nothing in a document should have to know what a
   * tick is.
   *
   * Those two numbers are the whole state. Where the door is *now* is
   * `poseAt(motion, now - since)`, which is a pure function - so it never has to
   * be stored, never has to be sent, and cannot drift between two people
   * watching the same door. Compare `clip`, which carries `at` for a different
   * reason: there the number is an identity that lets a renderer notice the same
   * clip asked for twice, and the playing is the renderer's. Here the number is
   * the *origin of time* for something this package can evaluate itself.
   *
   * Restarting a motion is therefore setting `since` again, and a second `play`
   * of the same name mid-run is a motion that starts over - which is what a
   * door being told to open while it is opening should do.
   */
  motion: Map<EntityId, { name: string; since: number }>
  /** A sign's own text colour, `0xRRGGBB`. Sparse; absent reads as white. */
  colour: Map<EntityId, number>
  /** A plate behind a sign's text, `0xRRGGBB`. Sparse; absent draws none. */
  background: Map<EntityId, number>
  /**
   * Things a *peer* is carrying, and which peer.
   *
   * The other half of `parent`, and it exists because a peer is not an entity
   * here - they are an interpolated sample in the crowd buffer, so a flag in
   * their hands has nothing to hang off. `@kxb/xp/sharing` fills this from what
   * they broadcast; the host reads it to draw the thing where they are.
   *
   * **Keyed by their player id, which is a string**, deliberately: an entity id
   * would mean inventing one per peer, and the id that actually identifies them
   * is the one presence and the socket already use.
   *
   * Being held is `parent` *or* this - see `HELD_PROP` - so a rule about a flag
   * in somebody's hands reads the same on the screen of the person holding it
   * and on everybody else's. Two maps rather than one because they are owned by
   * different things and cleared by different events: `parent` is this client's
   * own rules, and this is a packet.
   */
  heldBy: Map<EntityId, string>
}


export function emptyWorld(): EntityWorld {
  return {
    tick: 0,
    seconds: 0,
    alive: new Set(),
    returns: new Map(),
    blueprint: new Map(),
    position: new Map(),
    rotation: new Map(),
    pitch: new Map(),
    roll: new Map(),
    stretch: new Map(),
    scale: new Map(),
    light: new Map(),
    heldBy: new Map(),
    props: new Map(),
    velocity: new Map(),
    shoves: [],
    name: new Map(),
    parent: new Map(),
    box: new Map(),
    text: new Map(),
    material: new Map(),
    clip: new Map(),
    motion: new Map(),
    colour: new Map(),
    background: new Map(),
  }
}

/**
 * Everything a document says should exist, at tick zero.
 *
 * Ids are the entity's index in the document, so they are stable across a
 * reload and mean something in a message: "entity 12 broke" is the same entity
 * for everybody who loaded the same XP. A counter would be stable too until the
 * first entity was spawned at runtime by one client and not another.
 */
export function spawnEntities(document: XpDocument): EntityWorld {
  const world = emptyWorld()

  /**
   * Names first, so a child written above its parent still finds it.
   *
   * Insisting on document order would make the order of a JSON array
   * meaningful, which is the sort of rule nobody remembers and everybody trips
   * over.
   */
  const byName = new Map<string, EntityId>()
  document.entities.forEach((spec, index) => {
    if (spec.name) byName.set(spec.name, index as EntityId)
  })

  document.entities.forEach((spec, index) => {
    const blueprint = document.blueprints[spec.blueprint]
    // The parser refuses an entity naming a blueprint that does not exist, so
    // this cannot happen through the front door. It can happen to a document
    // built in memory by the editor, and dropping the entity beats crashing.
    if (!blueprint) return

    const id = index as EntityId
    world.alive.add(id)
    world.blueprint.set(id, spec.blueprint)
    world.position.set(id, { x: spec.x, y: spec.y, z: spec.z })
    world.rotation.set(id, spec.rotation)
    // Only when the document said so, so the maps stay as sparse as the format.
    if (spec.pitch) world.pitch.set(id, spec.pitch)
    if (spec.roll) world.roll.set(id, spec.roll)
    if (spec.stretch) world.stretch.set(id, spec.stretch)
    world.scale.set(id, spec.scale)
    // The blueprint's values first, then the entity's - so a document can say
    // "a crate, but this one has twice the health" without repeating the rest.
    world.props.set(id, { ...blueprint.props, ...spec.props })
    if (spec.name) world.name.set(id, spec.name)
    if (spec.text) world.text.set(id, spec.text)
    if (spec.colour !== undefined) world.colour.set(id, spec.colour)
    if (spec.background !== undefined) world.background.set(id, spec.background)
    // Seeded from the blueprint, then owned by the entity: two lamps of the
    // same kind can be turned down independently, which is the point of the
    // row being per entity rather than read back through the blueprint.
    if (blueprint.light) world.light.set(id, { ...blueprint.light })
    // `own` is absence, so it is deliberately not written: a blueprint that
    // says so and one that says nothing have to leave the same world behind,
    // or `material own` would clear one and not the other.
    if (blueprint.material && blueprint.material !== 'own') {
      world.material.set(id, blueprint.material)
    }

    if (spec.parent) {
      const parentId = byName.get(spec.parent)
      // The parser refuses a parent that does not exist, so this only bites a
      // document built in memory - and dropping the *link* rather than the
      // entity leaves something standing at the origin instead of nothing.
      if (parentId !== undefined) {
        world.parent.set(id, { id: parentId, ...(spec.socket ? { socket: spec.socket } : {}) })
      }
    }

    const box = entityBox(blueprint, { x: spec.x, y: spec.y, z: spec.z }, spec.rotation, spec.scale, {
      pitch: spec.pitch,
      roll: spec.roll,
      stretch: spec.stretch,
    })
    if (box) world.box.set(id, box)
  })

  /**
   * Boxes again, now that the parents are known.
   *
   * A child's `position` is relative to its parent, so the box computed in the
   * first pass is wrong for anything attached - it is in the parent's frame and
   * the collision grid works in the world's. Cheaper than sorting the entities
   * into dependency order and much easier to be sure about.
   */
  for (const id of world.alive) {
    if (!world.parent.has(id)) continue
    const name = world.blueprint.get(id)
    const blueprint = name ? document.blueprints[name] : undefined
    if (!blueprint) continue
    const placed = worldTransform(world, id, document.blueprints)
    const box = entityBox(blueprint, placed, placed.rotation, placed.scale, placed)
    if (box) world.box.set(id, box)
    else world.box.delete(id)
  }

  return world
}

/** Everything a renderer or a collision box needs about where something is. */
export interface WorldTransform extends Turn {
  x: number
  y: number
  z: number
  scale: number
  stretch?: Stretch
}

/** The angles and multipliers one entity carries, read out of the sparse maps. */
function shapeOf(world: EntityWorld, id: EntityId): Turn & { stretch?: Stretch } {
  const stretch = world.stretch.get(id)
  return {
    rotation: world.rotation.get(id) ?? 0,
    pitch: world.pitch.get(id) ?? 0,
    roll: world.roll.get(id) ?? 0,
    ...(stretch ? { stretch } : {}),
  }
}

/**
 * Where an entity actually is, after walking up its parents.
 *
 * Yaw composes by addition and scale by multiplication, which is exact because
 * a level's things overwhelmingly turn about Y only. A parent's socket offset
 * is turned by the parent before it is added, so a seat on the left of a kart
 * stays on the left of the kart when the kart turns - which is the whole reason
 * this is not just a sum of positions.
 *
 * ---------------------------------------------------------------------------
 * A tilted parent, and the one thing this cannot represent
 * ---------------------------------------------------------------------------
 * `composeTurn` multiplies the two rotations rather than adding their axes, so
 * a rider in a kart that is climbing a ramp comes out where the kart's own
 * frame puts them - and the offset is carried through the *whole* parent
 * rotation rather than through its yaw, or a seat on the left of a rolled kart
 * would stay stubbornly level while the kart went over.
 *
 * What it cannot do is compose a **non-uniform stretch through a turn**. A
 * child rotated inside a parent stretched along one axis is a shear, and a
 * shear is not a position, a rotation and three multipliers - there is nothing
 * to return. So a child's `stretch` is its own, taken in its own axes, and the
 * parent's stretches where the child *is* rather than what shape it is. That is
 * the same trade the whole transform makes and it is worth stating rather than
 * discovering: hanging a lamp off a wall you have squashed flat gives you a
 * lamp in the right place and the shape the lamp always was.
 *
 * The depth is bounded by the parser refusing loops. Without that this is an
 * infinite walk on the frame the level loads, in a renderer, with no message.
 */
export function worldTransform(
  world: EntityWorld,
  id: EntityId,
  blueprints?: Readonly<Record<string, Blueprint>>,
): WorldTransform {
  const own = world.position.get(id) ?? { x: 0, y: 0, z: 0 }
  let x = own.x
  let y = own.y
  let z = own.z
  const mine = shapeOf(world, id)
  const stretch = mine.stretch
  let turned: Turn = mine
  let scale = world.scale.get(id) ?? 1

  let link = world.parent.get(id)
  let guard = 0

  while (link && guard++ < 32) {
    const parentAt = world.position.get(link.id) ?? { x: 0, y: 0, z: 0 }
    const parent = shapeOf(world, link.id)
    const parentScale = world.scale.get(link.id) ?? 1
    const parentStretch = stretchOf(parent.stretch)

    // The socket, in the parent's own units.
    let ox = 0
    let oy = 0
    let oz = 0
    if (link.socket && blueprints) {
      const parentBlueprint = blueprints[world.blueprint.get(link.id) ?? '']
      const socket = parentBlueprint?.sockets[link.socket]
      if (socket) {
        ox = socket.x
        oy = socket.y
        oz = socket.z
      }
    }

    // Stretched in the parent's axes before it is turned, which is the order
    // the drawing uses and the only one that keeps a socket on the surface of
    // a parent that has been made wider.
    const offset = turnPoint(
      {
        x: (x + ox) * parentStretch.x,
        y: (y + oy) * parentStretch.y,
        z: (z + oz) * parentStretch.z,
      },
      parent,
    )
    x = parentAt.x + offset.x * parentScale
    y = parentAt.y + offset.y * parentScale
    z = parentAt.z + offset.z * parentScale
    turned = composeTurn(parent, turned)
    scale *= parentScale

    link = world.parent.get(link.id)
  }

  // Wrapped on the way out, as this has always done: an entity turned 400
  // degrees is an entity turned 40, and a caller comparing two of them should
  // not have to know which spelling it was handed.
  const wrap = (v: number) => ((v % 360) + 360) % 360
  return {
    x,
    y,
    z,
    rotation: wrap(turned.rotation),
    pitch: wrap(turned.pitch),
    roll: wrap(turned.roll),
    scale,
    ...(stretch ? { stretch } : {}),
  }
}

/**
 * The entity somebody called this, or null.
 *
 * A scan, and it is one on purpose: this is the *one-off* lookup - a test, a
 * host wiring something up at load, an editor selecting by name - and the names
 * are a handful in a level of hundreds.
 *
 * A script asking sixty times a second must not go through here. It goes
 * through an index the sandbox builds once and refreshes when the set of named
 * entities changes (`@kxb/xp/script`), which is where the caching belongs
 * because that is the only caller that repeats itself. An earlier version of
 * this comment claimed this function was a map; it never was, and a wrong
 * comment about performance is worse than none - it stops the next person
 * measuring.
 */
export function entityByName(world: EntityWorld, name: string): EntityId | null {
  for (const [id, given] of world.name) {
    if (given === name && world.alive.has(id)) return id
  }
  return null
}

/**
 * The boxes the character controller has to test against, this tick.
 *
 * Rebuilt from the live set rather than kept as a list, because the interesting
 * case is an entity that stops existing: a crate you broke must stop blocking
 * you on the same frame, and a stale array is exactly how it does not.
 *
 * ---------------------------------------------------------------------------
 * `since`, and why the memory is the caller's
 * ---------------------------------------------------------------------------
 * Pass a map and each box comes back knowing how far it moved, which is what
 * lets somebody standing on a platform be carried by it rather than left behind.
 * The map is *mutated* into this frame's positions - the caller keeps one and
 * hands it back, the same shape `stepTriggers` uses for its overlaps.
 *
 * It lives with the caller rather than on the world for one reason: "since
 * when" is a question about a frame loop, and the entity world is a value that
 * a test, a benchmark or a screenshot script may build and step in whatever
 * order it likes. A delta cached on the world would be silently wrong for every
 * one of those, and wrong in the direction that looks fine.
 */
export function blockersOf(world: EntityWorld, since?: Map<EntityId, Box>): Blocker[] {
  const boxes: Blocker[] = []
  for (const id of world.alive) {
    /**
     * A thing in somebody's hands is not a wall.
     *
     * The same rule the player's own body already has - `collider: 'none'` so
     * they do not block themselves - arriving for the thing they are holding,
     * and it is the same rule because it is the same body: a carried entity
     * sits at its carrier's socket and travels with them, so its box is *always*
     * where the carrier is.
     *
     * The controller stops you at boxes. So the moment somebody picked a piece
     * up they were pressed against a wall they were carrying, in every
     * direction, and could not walk - which is what a board game reported as
     * "I can't move the cursor". Nothing in the level was wrong and nothing
     * errored; picking a thing up simply nailed you to the floor.
     *
     * **Carried, not merely parented**, and the difference is a kart. Authored
     * composition uses this same row - a rider in a seat is a child of the kart
     * - and that rider *should* stop you, because somebody drew it there. What
     * must not is a thing a person picked up, so this asks who the carrier is
     * rather than whether there is one. (`holds` answers `held` from the same
     * row without that distinction, which makes a rider "held" by a kart. That
     * is worth tidying and is not this.)
     *
     * `heldBy` needs no such care: it is only ever a peer's hands, and a wall
     * that follows another player around is not one anybody authored either.
     *
     * The box itself is untouched, and that is the distinction worth keeping:
     * `collide` triggers read `world.box` directly, so a flag being carried
     * across its own home field still counts. What is refused here is only the
     * claim that it stops a person.
     */
    if (world.parent.get(id)?.id === PLAYER_ID || world.heldBy.has(id)) continue

    const box = world.box.get(id)
    if (!box) continue

    /**
     * Springiness, read from the prop bag rather than from a new component row.
     *
     * `props` exists precisely so an entity can carry a number the engine did
     * not anticipate, and this is one: a bouncy pad is a crate with a property,
     * not a new kind of thing. Giving it its own `Map` would also mean giving it
     * its own spawn path, its own despawn cleanup and its own copy in
     * composition - four places to forget, for a number.
     *
     * Guarded rather than passed through, because `props` is author-supplied
     * and `bounce: -3` reaching `jumpSpeedFor` is `Math.sqrt` of a negative and
     * a `NaN` position - a body that vanishes from the world with no error
     * anywhere. The format refuses it on the way in; this refuses it for the
     * entities a *script* wrote, which the format never saw.
     */
    const spring = world.props.get(id)?.bounce
    const bounce = typeof spring === 'number' && spring > 0 && Number.isFinite(spring) ? spring : 0

    if (since) {
      const before = since.get(id)
      if (before) {
        const dx = box.minX - before.minX
        const dy = box.minY - before.minY
        const dz = box.minZ - before.minZ
        // Only when it actually moved. An unchanged box is the overwhelming
        // majority of them, and the controller skips those outright.
        if (dx !== 0 || dy !== 0 || dz !== 0) {
          boxes.push({ ...box, dx, dy, dz, ...(bounce > 0 ? { bounce } : {}) })
          since.set(id, box)
          continue
        }
      }
      since.set(id, box)
    }

    // Spread only when it bounces: the common case is a wall, and `box` is the
    // cached row - handing it out unchanged is what makes the still case free.
    boxes.push(bounce > 0 ? { ...box, bounce } : box)
  }

  /**
   * Anything that stopped existing, forgotten.
   *
   * Otherwise a crate that was broken and whose id is later reused by a runtime
   * spawn is compared against the dead one's last position, and the new thing
   * appears to have teleported - which would carry anybody standing near it
   * across the room on its first frame.
   */
  if (since) {
    for (const id of since.keys()) {
      if (!world.alive.has(id)) since.delete(id)
    }
  }

  return boxes
}

/** One entity's properties, or an empty bag. Never null, so callers can read. */
export function propsOf(world: EntityWorld, id: EntityId): Record<string, number> {
  return world.props.get(id) ?? {}
}

/**
 * Remove an entity from the world.
 *
 * Only `alive` is touched. The component maps keep their rows, which is
 * deliberate: a rule that fires *because* something died - a score, a message,
 * a thing that spawns in its place - wants to know where it was and what it
 * was, and an id whose data has already been deleted cannot answer.
 */
export function despawn(world: EntityWorld, id: EntityId): void {
  world.alive.delete(id)
  // A thing that has been destroyed is not a thing that is waiting to come
  // back. Leaving a pending return behind would resurrect it.
  world.returns.delete(id)
  // Nor is it a thing that is still waving. Every other component map is kept
  // on purpose - a rule that fires *because* something died wants to know where
  // it was - and this one is not data about the corpse, it is an instruction
  // that would be obeyed by whatever reuses the id.
  world.clip.delete(id)
  world.motion.delete(id)
  // And it is not still travelling. Same argument as the clip: this is not data
  // about the corpse, it is momentum that whatever reuses the id would inherit
  // - a crate spawned where a thrown one died would fly off on its own.
  world.velocity.delete(id)
}

/**
 * Turn something off, with or without a way back.
 *
 * The verb `despawn` is not for ammunition. It is permanent, so a level that
 * wants a pickup to return has to spawn a fresh one - which loses the thing's
 * name, its properties, and anything a rule had written on it. Reported as
 * exactly that: "despawn is stupid for munition that just for some time should
 * be gone".
 *
 * Being off *is* being despawned, deliberately: the trigger pass, the draw list
 * and the blockers all walk `alive`, so an entity that is not in it costs
 * nothing and is invisible and intangible with no new branch anywhere. The only
 * thing this adds is a row saying when to put it back.
 *
 * `at` is an absolute time in seconds, not a duration, so this function needs no
 * clock of its own - the caller knows what time it is and the arithmetic belongs
 * where the clock is.
 */
export function deactivate(world: EntityWorld, id: EntityId, at = Infinity): void {
  if (!world.alive.has(id)) return
  world.alive.delete(id)
  world.returns.set(id, at)
}

/**
 * Put something back, whether or not its time was up.
 *
 * Refuses an id the world has never heard of - `alive` is a set of ids that
 * exist, and adding an arbitrary number to it would make a thing with no
 * position, no blueprint and no box, which every reader downstream would then
 * have to defend against.
 */
export function activate(world: EntityWorld, id: EntityId): void {
  if (!world.blueprint.has(id)) return
  world.alive.add(id)
  world.returns.delete(id)
}

/**
 * Everything whose time has come, put back.
 *
 * Returns what changed rather than nothing, because a caller wants to say so -
 * a pickup reappearing with no sound and no line is a pickup people walk past.
 *
 * The clock is passed in for the reason the whole engine passes time in: a
 * module that finds out what time it is cannot be stepped by a test at whatever
 * rate the test likes.
 */
export function stepReturns(world: EntityWorld, now: number): EntityId[] {
  if (world.returns.size === 0) return []
  const back: EntityId[] = []
  for (const [id, at] of world.returns) {
    if (now < at) continue
    world.alive.add(id)
    world.returns.delete(id)
    back.push(id)
  }
  return back
}

/** Every live entity whose blueprint carries a tag. */
export function withTag(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  tag: string,
): EntityId[] {
  const found: EntityId[] = []
  for (const id of world.alive) {
    const name = world.blueprint.get(id)
    if (name && blueprints[name]?.tags.includes(tag)) found.push(id)
  }
  return found
}

/** Where every live entity is, for a renderer. */
export function drawList(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
): (WorldTransform & { id: EntityId; model: string })[] {
  const list: (WorldTransform & { id: EntityId; model: string })[] = []
  for (const id of world.alive) {
    const name = world.blueprint.get(id)
    const blueprint = name ? blueprints[name] : undefined
    const at = world.position.get(id)
    if (!blueprint || !at) continue
    // A node is still an entity in every other respect - it is alive, it can be
    // a parent, a script can find it by name and a verb can send you to it. It
    // just never reaches a renderer. Skipped here rather than filtered by the
    // caller so that every renderer inherits it, including the editor's, which
    // draws its own icons for these from `blueprints` directly.
    if (blueprint.draw === false) continue
    // World coordinates, not the entity's own: a rider's position is written
    // relative to the kart it sits in, and a renderer draws in the world.
    const placed: WorldTransform = world.parent.has(id)
      ? worldTransform(world, id, blueprints)
      : { x: at.x, y: at.y, z: at.z, ...shapeOf(world, id), scale: world.scale.get(id) ?? 1 }

    list.push({ id, model: blueprint.model, ...placed })

    /**
     * And whatever else this kind of thing is made of.
     *
     * Every part gets its own row rather than the entity getting a list, so a
     * renderer that groups by model - which every instanced one does - sees
     * parts exactly as it sees anything else. A turret made of two boxes is two
     * boxes in the same buffer as every other box in the level.
     *
     * They share the entity's `id`. A part is not a thing in its own right: it
     * cannot be shot, picked up or addressed, and giving it an id of its own
     * would put it in reach of every lookup that walks this list.
     */
    const stretch = stretchOf(placed.stretch)
    for (const part of partTransforms(blueprint)) {
      /**
       * The part's offset, carried through the *whole* entity rotation.
       *
       * Through the entity's stretch first, for the same reason a socket is:
       * the barrel of a turret that has been made twice as tall belongs twice
       * as high up, not at the height it sat before somebody stretched the
       * thing it is bolted to.
       *
       * A part has only a yaw of its own - a `Part` has no `pitch`, because a
       * blueprint is authored upright and the thing that tilts is the entity -
       * so this composes an arbitrary rotation with a yaw, which is exactly
       * what `composeTurn` is for.
       */
      const offset = turnPoint(
        { x: part.x * stretch.x, y: part.y * stretch.y, z: part.z * stretch.z },
        placed,
      )
      list.push({
        id,
        model: part.part.model,
        x: placed.x + offset.x * placed.scale,
        y: placed.y + offset.y * placed.scale,
        z: placed.z + offset.z * placed.scale,
        ...composeTurn(placed, turnOf({ rotation: part.rotation })),
        scale: placed.scale * part.scale,
        ...(placed.stretch ? { stretch: placed.stretch } : {}),
      })
    }
  }
  return list
}

/** Re-exported so a host can type a blocker without reaching past the engine. */
export type { Blocker, Box, EntitySpec }

// ---------------------------------------------------------------------------
// The player, as something that exists
// ---------------------------------------------------------------------------

/**
 * The id the person at the keyboard gets.
 *
 * Above `RUNTIME_ID_BASE`, so it can never collide with an entity a document
 * authored or a rule spawned. One constant rather than one per host, because
 * every host has exactly one local player and the number turns up in three
 * places that must agree: the entity, the trigger prober, and whatever a script
 * is handed as `other`.
 */
export const PLAYER_ID = 9_000_000

/** What a script and a rule call the local player. */
export const PLAYER_NAME = 'player'

/**
 * What a side is called, as a property on the body that is on it.
 *
 * ---------------------------------------------------------------------------
 * The same shape a dealt role has, and deliberately so
 * ---------------------------------------------------------------------------
 * `Mark.team` has existed since the format did, the runtime has derived a side
 * from it since `teamsOf` was written, and until now **nothing in a document
 * could ask which side it was on**. A level could paint a red spawn and a blue
 * one, and then not write a rule about them - which is the same gap `dealt`
 * closed for a secret role, one system over.
 *
 * So it is closed the same way: the side is a **property on the player named
 * after itself**, set to 1. Being on red is `props['team:red'] === 1`, which a
 * rule reads as `{ prop: 'team:red' }` and a script as `self.get('team:red')`,
 * and neither needed a word of new vocabulary to do it.
 *
 * **Prefixed where a role is not**, which is the one difference and is not
 * tidiness. A role's values are a deck the document wrote, so `bug` cannot
 * collide with anything the author did not write themselves. A side's name comes
 * off a *mark*, and `red` and `blue` are exactly the words somebody would also
 * use for a prop on a crate - so an unprefixed one would silently mean two
 * things in the same level. `team:` is not a namespace mechanism, it is one
 * character of separation in the one place two closed vocabularies meet.
 *
 * Absent on a level with no sides, and absent for everybody on the side they are
 * not - which reads as zero everywhere in this engine (see ./triggers), so
 * "everybody who is not on red" is `team:red == 0` and is true before the sides
 * are known as well as after.
 */
export const TEAM_PROP_PREFIX = 'team:'

/** What this side is called on a body that is on it. See `TEAM_PROP_PREFIX`. */
export function teamProp(team: string): string {
  return `${TEAM_PROP_PREFIX}${team}`
}

/**
 * What is true about the person playing, rather than about the body.
 *
 * Both of these are facts the *host* knows and the document does not: which side
 * an id hashed onto, and what the arbiter dealt. They are handed to `spawnPlayer`
 * rather than written on afterwards for one reason, and it is a bug that was
 * live: **`spawnPlayer` re-seeds `props` from the blueprint**, so anything
 * written onto the body from outside is wiped by the next respawn. A player dealt
 * `bug` stopped being the bug the first time they died, and no rule that had
 * read it could say why.
 *
 * Arriving and coming back are the same act (see `revivePlayer`), so the facts
 * that outlive a death belong on the same door.
 */
export interface PlayerFacts {
  /** Which side, when the level has sides. See `TEAM_PROP_PREFIX`. */
  team?: string
  /**
   * What the arbiter dealt, when a level deals.
   *
   * Named after itself as a property, exactly as ./triggers' `dealt` documents -
   * this is the same write, moved to where it survives a respawn rather than a
   * second one beside it.
   */
  role?: string
}

/** The blueprint name the built-in body is registered under. */
export const BUILT_IN_BODY = 'xp:body'

/**
 * The body a document that does not say gets.
 *
 * The prototype dummy, at the scale that puts its eyes where the camera is: the
 * model is 2.4 cells tall and the controller's eye is at 1.7, so a body at full
 * size is somebody looking out of their own chest. 0.75 makes it 1.8, which is
 * a person.
 *
 * **`collider: 'none'`, and that is not an oversight.** The body is a thing to
 * *look at* - the player is stopped by the character controller, which is a
 * capsule the collision grid knows nothing about. Giving the body a box would
 * mean the player collides with themselves, which reads as being unable to move
 * at all.
 */
export const BUILT_IN_BODY_SCALE = 0.75

/**
 * The document's blueprints, plus a body if it did not bring one.
 *
 * A separate map rather than a mutation, because `XpDocument` is what the
 * editor round-trips and a body quietly added to it would be saved into
 * somebody's file - a blueprint they never wrote, which the parser would then
 * have opinions about.
 */
export function bodiesFor(
  document: XpDocument,
  /**
   * The look this player has chosen, if they have chosen one.
   *
   * Two shapes, told apart by the slash. A bare name - `fox`, `penguin` - is
   * an animal, because that is what the profile stores and what the lounge has
   * always stored; the `peepz` pack holds the same twenty-four under the same
   * names, so the mapping is the pack prefix and nothing else. A qualified id -
   * `adventurers/Knight` - is a bought skin, already a full catalogue address,
   * and is worn as-is. The skin wins when both could apply, because the mount
   * that resolves the profile only sends one of them.
   *
   * A name neither shape recognises falls back to a random animal rather than
   * to a missing model, same as it always has.
   *
   * **Only when the document has not said.** A level that declares its own
   * `player.blueprint` has decided what its players look like - a kart game,
   * a level where everybody is a robot - and a personal choice overriding that
   * would be the profile editing somebody's level.
   */
  avatar?: string | null,
  /**
   * Who is asking, so `random` can be the same animal on every screen.
   *
   * Their presence id, which every client already agrees about. Hashed rather
   * than rolled, because a random body has to be a *function* of who somebody
   * is - one rolled per client would make the same person a different animal on
   * each screen, and one rolled per session would change them at every reload.
   */
  who?: string | null,
): Record<string, Blueprint> {

  /**
   * The level decides the policy; the profile decides the animal.
   *
   * `wears` is the creator's choice - see `XpPlayer.wears`. `profile` falls
   * through to a random animal for somebody who has never chosen one, because
   * the point of a level asking for animals is that the room is full of them
   * and one mannequin among them reads as broken rather than as unset.
   */
  const wears = document.player.wears ?? 'dummy'
  /**
   * A bought skin is already a full address, so it skips the peepz mapping.
   * The shape test is deliberately local, like `PEEPZ` below: reaching into
   * the catalogue from the document's module is the dependency this file
   * refuses, and a skin id that stopped resolving degrades in the renderer
   * exactly the way any unknown model always has.
   *
   * Worn under `dummy` as well as under `profile`, and that is the whole of
   * why a bought skin shows up in a level at all. `wears: 'dummy'` is not a
   * creator saying "everybody is the mannequin" - the parser stores the
   * default *as* absence, so it is what every level that never thought about
   * the question says. The dummy is what a player is before they are anybody,
   * and a skin is exactly the thing that replaces it.
   *
   * `random` is left out on purpose: a level that asked for a room full of
   * animals is a level that decided, and one Knight among the foxes is the
   * personal choice overriding the creator's that the note below refuses.
   */
  const skin =
    wears !== 'random' && avatar && QUALIFIED_MODEL.test(avatar) ? avatar : null
  const chosen =
    !skin && wears === 'profile' && avatar && PEEPZ.has(avatar)
      ? avatar
      : !skin && (wears === 'profile' || wears === 'random')
        ? animalFor(who ?? '')
        : null
  const peep = skin ?? (chosen ? `peepz/${chosen}` : null)

  /**
   * A named body keeps everything except its face.
   *
   * `wears` changes what a player *looks like*; a blueprint is also its
   * triggers, its props and its tags. Peepz Park names a `peep` so that a key
   * is a dash and a full strength bar makes it a mega one, and none of that has
   * an opinion about which animal is doing it - so the model is swapped and the
   * rest is left exactly as the document wrote it.
   */
  if (document.player.blueprint) {
    const named = document.blueprints[document.player.blueprint]
    if (!peep || !named) return { ...document.blueprints }
    return {
      ...document.blueprints,
      [document.player.blueprint]: { ...named, model: peep },
    }
  }

  return {
    ...document.blueprints,
    [BUILT_IN_BODY]: {
      model: peep ?? 'dummy/Dummy',
      collider: 'none',
      tags: ['player'],
      props: {},
      sockets: {},
      triggers: [],
    },
  }
}

/**
 * How much the built-in body shrinks, given what it turned out to be.
 *
 * The dummy is 2.4 cells and wants `BUILT_IN_BODY_SCALE` to become a person.
 * A peep is already 1.69 - the lounge's own size, and the size the peepz
 * template draws one at - so scaling it would make a fox the size of a cat.
 */
export function bodyScaleFor(
  document: XpDocument,
  avatar?: string | null,
  who?: string | null,
): number {
  // A named body is drawn at the scale the document placed it at, whichever
  // animal is wearing it - swapping the model does not resize the level.
  if (document.player.blueprint) return 1
  const model = bodiesFor(document, avatar, who)[BUILT_IN_BODY]?.model
  return model && model.startsWith('peepz/') ? 1 : BUILT_IN_BODY_SCALE
}

/**
 * An animal for somebody who has not chosen one, from their own id.
 *
 * A hash rather than a roll: every client works out the same animal for the
 * same person without anybody sending anything, and they are still that animal
 * tomorrow. The same argument `ownerOf` makes about the election - an answer
 * everybody can compute is worth more than an answer somebody has to announce.
 */
export function animalFor(who: string): string {
  const animals = [...PEEPZ]
  if (who.length === 0) return animals[0]!
  let hash = 0
  for (let i = 0; i < who.length; i += 1) hash = (hash * 31 + who.charCodeAt(i)) >>> 0
  return animals[hash % animals.length]!
}

/**
 * The animals the `peepz` pack holds, which are the lounge's avatars exactly.
 *
 * Written down rather than read from the catalogue because this module is the
 * document's, not the renderer's, and reaching into `./catalogue` from here
 * would make every consumer of a *world* load the model table. Checked against
 * the pack by a test, which is the cheap half of that trade.
 */
const PEEPZ: ReadonlySet<string> = new Set([
  'beaver', 'bee', 'bunny', 'cat', 'caterpillar', 'chick', 'cow', 'crab',
  'deer', 'dog', 'elephant', 'fish', 'fox', 'giraffe', 'hog', 'koala',
  'lion', 'monkey', 'panda', 'parrot', 'penguin', 'pig', 'polar', 'tiger',
])

/**
 * The shape of a qualified model id: one pack, one slash, one name.
 *
 * The same characters `splitModel` accepts and the same refusal of an id that
 * escapes its directory - restated here rather than imported, for the reason
 * `PEEPZ` gives: this module is the document's, not the renderer's.
 */
const QUALIFIED_MODEL = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/

/**
 * Put the local player into the world.
 *
 * They are an entity like everything else from this moment on, which is what
 * makes three separate things work at once: the body is drawn by the same
 * instancer as the crates, a script can `getEntityByName('player')`, and a
 * trigger fired by walking into something is handed a real entity as `other`
 * rather than the null it used to get.
 *
 * No collider, so the player does not block themselves - the character
 * controller is what stops them, and it works in a space this box knows nothing
 * about.
 */
export function spawnPlayer(
  world: EntityWorld,
  document: XpDocument,
  at: { x: number; y: number; z: number; facing?: number },
  /**
   * What the host knows about the person and the document does not.
   *
   * Optional, and absent is what every caller written before it meant: a body
   * with its blueprint's properties and nothing else. See `PlayerFacts` for why
   * this is a parameter rather than two lines at the call site.
   */
  who: PlayerFacts = {},
): EntityId {
  const blueprint = document.player.blueprint ?? BUILT_IN_BODY
  const scale = document.player.blueprint ? 1 : BUILT_IN_BODY_SCALE

  world.alive.add(PLAYER_ID)
  world.blueprint.set(PLAYER_ID, blueprint)
  world.position.set(PLAYER_ID, { x: at.x, y: at.y, z: at.z })
  world.rotation.set(PLAYER_ID, at.facing ?? 0)
  world.scale.set(PLAYER_ID, scale)
  /**
   * The body's own starting properties, not an empty bag.
   *
   * This was `{}`, which quietly made a player blueprint's `props` the one part
   * of a blueprint that did not apply - so a document declaring a body with
   * `hp: 100` produced a player with no health, and every rule about it read
   * zero (a missing property reads as zero, ./triggers). The symptom is a
   * shooter where everybody is already dead and nothing says so.
   */
  /**
   * And then what the host knows, on top of what the blueprint says.
   *
   * After the seed rather than merged into it, because these two outrank a
   * blueprint that happens to declare the same name: a body whose author wrote
   * `props: { "team:red": 1 }` is an author guessing at a fact the room decides,
   * and the room is right.
   */
  const props = { ...(document.blueprints[blueprint]?.props ?? {}) }
  if (who.team) props[teamProp(who.team)] = 1
  if (who.role) props[who.role] = 1
  world.props.set(PLAYER_ID, props)
  world.name.set(PLAYER_ID, PLAYER_NAME)

  return PLAYER_ID
}

/**
 * Has this thing run out of health?
 *
 * The one policy `damage` deliberately does not have. `damage` clamps at zero
 * and fires the `damaged` triggers, and what zero *means* is the document's
 * business - a crate at zero breaks into pieces, a target at zero scores, an
 * ammo box has no health at all and is not therefore dead.
 *
 * So this is a question rather than a consequence, and it is here rather than
 * inlined at the two call sites because "no `hp` at all is not dead" is the
 * half everyone gets wrong: a missing property reads as zero everywhere else in
 * this engine (see ./triggers), which would make every scenery crate a corpse.
 */
export function isDead(world: EntityWorld, id: EntityId): boolean {
  const hp = world.props.get(id)?.hp
  return hp !== undefined && hp <= 0
}

/**
 * Put the player back where they started, with the health they started with.
 *
 * `spawnPlayer` again rather than a second seeding routine, and that is the
 * point: the properties a body arrives with are a fact about its blueprint, and
 * two functions that both know how to read them is two functions that drift.
 * Coming back from the dead should be indistinguishable from arriving, because
 * it is the same thing.
 *
 * The weapon is left alone. It is a separate entity hanging off a socket, so
 * re-seeding the body does not orphan it - and a rifle that emptied itself
 * every time its owner died would be a punishment nobody asked for on top of
 * the one they already had.
 */
export function revivePlayer(
  world: EntityWorld,
  document: XpDocument,
  at: { x: number; y: number; z: number; facing?: number },
  /**
   * The same facts arriving took, and this is the half that was missing.
   *
   * Re-seeding the properties is what makes coming back indistinguishable from
   * arriving, and it was also quietly *un*-dealing whoever came back: a role
   * written onto the body once, on the frame it arrived, does not survive a map
   * of properties being replaced. Passed through rather than re-applied by the
   * caller afterwards, because a second writer is how the two come to disagree
   * about which frame the body is the bug on.
   */
  who: PlayerFacts = {},
): void {
  spawnPlayer(world, document, at, who)
}

/**
 * The id the player's weapon gets.
 *
 * Fixed rather than allocated, and next to the player's own for the same reason
 * that one is fixed: three separate things have to agree about it - the entity,
 * the set of things a shot may not hit, and the renderer drawing it in a hand -
 * and a number handed around at runtime is a number one of them will miss.
 */
export const WEAPON_ID = PLAYER_ID + 1

/** What a script and a rule call it. */
export const WEAPON_NAME = 'weapon'

/**
 * Put the weapon in the player's hand, if the document says they have one.
 *
 * An ordinary entity parented at a socket - the same mechanism a rider in a
 * kart's seat gets (docs/xp/manual.md §5), and deliberately not a new one. So it
 * turns with the body, it is drawn by the same instancer, and a script can find
 * it by name. What makes it a *weapon* is that the runtime casts a ray when the
 * button goes down and reads `damage` and `range` off it.
 *
 * `collider` is left to the blueprint and the box is not computed here: a gun
 * with a collision box is a gun that stops its owner walking through a doorway.
 */
export function spawnWeapon(world: EntityWorld, document: XpDocument): EntityId | null {
  const held = document.player.weapon
  if (!held) return null

  const blueprint = document.blueprints[held.blueprint]
  // The parser refuses a weapon naming a blueprint that does not exist, so this
  // only bites a document built in memory by the editor - and no gun beats a
  // crash.
  if (!blueprint) return null

  world.alive.add(WEAPON_ID)
  world.blueprint.set(WEAPON_ID, held.blueprint)
  // Relative to the socket, which is what a child's position means.
  world.position.set(WEAPON_ID, { x: 0, y: 0, z: 0 })
  world.rotation.set(WEAPON_ID, 0)
  world.scale.set(WEAPON_ID, 1)
  world.props.set(WEAPON_ID, { ...blueprint.props })
  world.name.set(WEAPON_ID, WEAPON_NAME)
  world.parent.set(WEAPON_ID, { id: PLAYER_ID, ...(held.socket ? { socket: held.socket } : {}) })

  return WEAPON_ID
}

/** Move the player's body to where the controller put them. */
export function movePlayer(
  world: EntityWorld,
  at: { x: number; y: number; z: number },
  facing: number,
): void {
  if (!world.alive.has(PLAYER_ID)) return
  world.position.set(PLAYER_ID, at)
  world.rotation.set(PLAYER_ID, facing)
}
