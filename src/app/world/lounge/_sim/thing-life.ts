/**
 * What every machine in the room does this frame.
 *
 * The rule half of `./states`, `./fight` and `./craft` put together, in `_sim`
 * for the reason everything here is: it is a fold over some numbers, it would
 * be just as true written on paper, and every way it can be subtly wrong is
 * invisible in a screenshot. A crate that breaks twice, a burger that cooks at
 * a speed set by the frame rate, a turret that fires sixty times a second
 * because its cooldown was compared against the wrong clock - all three are one
 * line in a test here and an afternoon with two browsers otherwise.
 *
 * ---------------------------------------------------------------------------
 * One call for the whole room, not one per thing
 * ---------------------------------------------------------------------------
 * Because two of the four rules are about things *other* than the thing. A
 * signal shouted by the cooker is heard by the bell; a shot fired by the turret
 * has to find a crate. A per-thing step would have to be run twice - once to
 * collect what everything said, once to deliver it - and the second pass is
 * where an off-by-one-frame bug lives. The room is the unit.
 *
 * ---------------------------------------------------------------------------
 * It is given every body in the room, not just the driver's own
 * ---------------------------------------------------------------------------
 * Which matters for every rule that turns on somebody being close: a turret
 * handed one body shoots only whoever happens to be driving and ignores the
 * four people standing in front of it.
 *
 * They come from `SceneRefs.transformsRef` - the *drawn*, interpolated peer
 * poses that <Multiplayer> publishes for the avatars. Interpolated rather than
 * raw packets is the right choice and not a compromise: what a turret should
 * react to is where somebody appears to be standing, which is exactly what that
 * map holds. It is null in a scene with no presence, which is a scene where the
 * driver is the only body there is.
 *
 * ---------------------------------------------------------------------------
 * Only the driver calls this
 * ---------------------------------------------------------------------------
 * See `@/domain/thingiverse/live`, which argues it: one client runs every
 * machine and everybody else applies what they are told. A watcher runs its
 * clock (`drift`) and nothing else. This file does not check which it is - that
 * is the hook's job, and a pure function that asked would need to be told.
 */

import {
  filling,
  step as stepState,
  standing,
  stateNamed,
  type Happened,
  type Standing,
  type States,
} from '@/domain/thingiverse/states'
import { bumpDamage, type FightSpec, type Hurt } from '@/domain/thingiverse/fight'
import {
  accepts,
  consumes,
  landsAt,
  matchRecipe,
  type CraftSpec,
  type RecipeSpec,
} from '@/domain/thingiverse/craft'
import { gather, honour, type Claim } from '@/domain/thingiverse/live'
import { cycleOf, offsetAt, type MotionSpec } from '@/domain/thingiverse/motion'

/**
 * One thing in the room, as this file needs it.
 *
 * A narrow view rather than the `ThingView` the hook holds, and that is what
 * keeps this testable: a test here builds four fields, not a database row with
 * a blueprint and a placement and a tenant on it.
 */
export interface Alive {
  id: string
  /** Where it stands, in cells. For reach, for shots and for bumps. */
  at: { x: number; y: number; z: number }
  states?: States
  fight?: FightSpec
  craft?: CraftSpec
  /** Where it goes on its own, if anywhere. See `@/domain/thingiverse/motion`. */
  motion?: MotionSpec
  /**
   * How far this thing's shouts carry, in cells. Absent is the whole room.
   *
   * A fact about the *thing* and not about its kind, which is why it arrives
   * here off `ThingTuning` rather than off the blueprint: the same button is a
   * doorbell in a corridor and a fire alarm in a hall, and which one it is is
   * decided by whoever put it there. See `heard`.
   */
  reach?: number
  /**
   * The things this one's shouts go to, and nothing else hears them.
   *
   * Empty or absent is the room, which is what a signal has always been. A
   * non-empty list is a *wire*: this button opens that door, and the identical
   * button by the other door is not listening to it.
   *
   * Ids rather than words, because that is what a wire is - two objects
   * somebody pointed at, in a room where four doors are all called "Door" and
   * all wait for `open`. The word still travels (a wired thing hears the word
   * it was always waiting for, so nothing about a blueprint changes), and what
   * the wire narrows is *who* is in earshot.
   */
  wires?: readonly string[]
}

/** What one thing is doing, between frames, on the driver. */
export interface Life {
  /** Where its machine is. Absent for a thing that has none. */
  standing?: Standing
  /** Health left. Absent for a thing nothing can hurt. */
  health?: number
  /** What is on it: socket name, then the item's word. */
  slots: Map<string, string>
  /** Seconds until its weapon may go again. */
  cooling: number
  /**
   * How far into its trip it is, in seconds. See `@/domain/thingiverse/motion`.
   *
   * Kept even for things that do not move, at zero, so that nothing downstream
   * has to ask twice - and wrapped to the cycle every frame, so a room left
   * open overnight is not carrying a number with six figures in it through a
   * float that has stopped being able to represent a fiftieth of a second.
   */
  phase: number
  /** A recipe part-way through, and how long it has left. */
  cooking?: { recipe: RecipeSpec; left: number }
}

/** A thing as it starts: in its first state, with a full bar and nothing on it. */
export function born(thing: Alive): Life {
  const life: Life = { slots: new Map(), cooling: 0, phase: 0 }
  if (thing.states) life.standing = standing(thing.states)
  if (thing.fight?.health) life.health = thing.fight.health.max
  // A rack arrives with its pan on it. See `SlotSpec.gives`.
  for (const slot of thing.craft?.slots ?? []) {
    if (slot.gives) life.slots.set(slot.socket, slot.gives)
  }
  return life
}

/** One word, and where it came from. See `Effects.said`. */
export interface Signal {
  word: string
  /** The thing that shouted it. */
  from: string
}

/** Somebody in the room, as this file needs them. */
export interface Body {
  id: string
  at: { x: number; y: number; z: number }
  /** How fast they are going, in cells a second. For bumps. */
  speed?: number
}

/** What the driver has to do about this frame, once the sums are done. */
export interface Effects {
  /**
   * Words shouted this frame, each with the thing that shouted it.
   *
   * The source rides along because delivery is no longer "everybody hears
   * everything": a shout may carry a limited distance or run down a wire, and
   * both of those are facts about the *shouter* that the hearer has to be able
   * to look up. See `heard`.
   */
  said: Signal[]
  /** Clips to play, by thing id. */
  play: { id: string; clip: string }[]
  /** Shots that left a barrel this frame. */
  shots: { from: string; at: { x: number; y: number; z: number }; toward: string | null }[]
  /**
   * Things that are now at zero, and who put them there.
   *
   * `by` is the connection that dealt the biggest hit in the frame that
   * finished it, or `null` when nobody claimed one - a crate that fell to a
   * bump, or a hit from a client that did not name itself. An unattributable
   * kill pays nobody rather than paying whoever happens to be driving.
   */
  broke: { id: string; by: string | null }[]
  /** Items a recipe produced: the thing, the socket, and the item's word. */
  made: { id: string; socket: string | undefined; item: string }[]
  /** Items a slot handed over: the thing, the socket, what, and to whom. */
  took: { id: string; socket: string; item: string; by: string | null }[]
}

function noEffects(): Effects {
  return { said: [], play: [], shots: [], broke: [], made: [], took: [] }
}

/**
 * How near a body has to be for `touch` and `near` to be true.
 *
 * Imported rather than restated would be better and is not possible: those two
 * constants live in `./thing-actions`, which imports from `@/domain/...` and is
 * imported by the renderer, and a cycle between the two `_sim` files is not
 * worth the two numbers. They are re-exported from there instead so that a
 * caller wiring both up cannot pick two different rings.
 */
import { NEAR, TOUCH } from '@/app/world/lounge/_sim/thing-actions'

/**
 * Advance every machine in the room by one frame.
 *
 * Mutates `lives` in place, which is the one place this file departs from the
 * house style of pure functions returning new values - and it is deliberate.
 * This runs inside `useFrame` at sixty a second over up to sixty-four things,
 * and rebuilding a Map of Maps every frame to satisfy a taste is exactly the
 * kind of allocation that shows up as a jitter nobody can attribute. The
 * *rules* are still pure: everything interesting is decided from the arguments,
 * and a test hands it a Map and reads it back.
 */
export function stepRoom(
  things: readonly Alive[],
  lives: Map<string, Life>,
  bodies: readonly Body[],
  claims: readonly Claim[],
  dt: number,
  /** Words shouted last frame, which is when the room gets to hear them. */
  said: readonly Signal[] = [],
): Effects {
  const effects = noEffects()

  /*
    Who can hear what, worked out once for the frame.

    A signal used to be a word on a list every thing read, which is still the
    default and still the common case. What is added is two narrowings, both
    facts about the *shouter*: a `reach` (only things within so many cells) and
    a set of `wires` (only these things, wherever they are). Resolved here
    rather than per thing so the emitter is looked up once per word instead of
    once per word per thing - a room with sixty machines in it would otherwise
    do sixty lookups to deliver one ding.
  */
  const shouted = said.map((signal) => {
    const from = things.find((one) => one.id === signal.from)
    return {
      word: signal.word,
      at: from?.at,
      reach: from?.reach,
      wires: from?.wires,
    }
  })

  for (const thing of things) {
    let life = lives.get(thing.id)
    if (!life) {
      life = born(thing)
      lives.set(thing.id, life)
    }

    /*
      Where it is this frame, which for most things is where it was put.

      Advanced before anything else reads a position, because everything that
      follows is about *where the thing is*: what is in reach of its weapon, how
      hard somebody ran into it, and where a bullet leaves from. A crusher whose
      reach was measured at its parked cell would catch people standing under
      where it used to be.
    */
    if (thing.motion) {
      life.phase = (life.phase + dt) % cycleOf(thing.motion)
    }
    const at = thing.motion ? shifted(thing.at, offsetAt(thing.motion, life.phase)) : thing.at

    const heard = gather(claims, thing.id)
    const near = nearest({ ...thing, at }, bodies)

    // --- what somebody did to it -------------------------------------------

    // A bump is priced by closing speed and not by having happened - see
    // `bumpDamage`, and the note in `contact-is-not-a-moment` behind it.
    let hit = heard.hit
    if (hurtBy(thing.fight, 'bump') && near && near.distance <= TOUCH) {
      hit += bumpDamage(near.body.speed ?? 0)
    }

    const verdict = honour(
      { i: thing.id, hit },
      { health: life.health, hurtable: hurtable(thing.fight) },
    )
    life.health = verdict.health
    if (verdict.broken) effects.broke.push({ id: thing.id, by: heard.hitBy })

    // --- what went on it, and what came off --------------------------------

    const filled: string[] = []
    const emptied: string[] = []

    for (const [socket, item] of heard.put) {
      const slot = thing.craft?.slots.find((one) => one.socket === socket)
      // A slot that will not take it refuses silently here and loudly in the
      // hand: the item never leaves the person holding it, which is the only
      // feedback that does not need a HUD.
      if (!slot || !accepts(slot, item) || life.slots.has(socket)) continue
      life.slots.set(socket, item)
      filled.push(socket)
      if (slot.emit) effects.said.push({ word: slot.emit, from: thing.id })
    }

    for (const { socket, by } of heard.took) {
      // The first asker wins and the rest find nothing, which is exactly the
      // arithmetic that stops one patty becoming two - see `Pulse.gave`.
      const item = life.slots.get(socket)
      if (item === undefined) continue
      life.slots.delete(socket)
      emptied.push(socket)
      effects.took.push({ id: thing.id, socket, item, by })
    }

    // --- what it is making -------------------------------------------------

    if (thing.craft) cook(thing.craft, life, dt, effects, thing.id, filled)

    // --- what it is ---------------------------------------------------------

    if (thing.states && life.standing) {
      const what: Happened = {
        dt,
        signals: earshot(shouted, thing),
        used: heard.used,
        touched: heard.touched || (near !== null && near.distance <= TOUCH),
        broken: verdict.broken,
        filled,
        emptied,
      }
      const went = stepState(thing.states, life.standing, what)
      life.standing = went.standing
      effects.said.push(...went.emit.map((word) => ({ word, from: thing.id })))
      // Coming back with a full bar, which is the other half of coming back.
      if (went.restore && thing.fight?.health) life.health = thing.fight.health.max
    }

    // --- what it is shooting at ---------------------------------------------

    life.cooling = Math.max(0, life.cooling - dt)
    // Aiming is what a weapon does when something is in reach, and it is not a
    // deed anybody has to author: a turret with a weapon and a target shoots.
    // The deeds `attack` and `shoot` are how a thing fires *without* one - on a
    // cue, on a signal, on being used - which is the trap door a spike plate
    // needs and a turret does not.
    const weapon = thing.fight?.weapon
    if (weapon && life.cooling === 0 && near && near.distance <= weapon.reach) {
      if (weapon.at !== 'things') {
        life.cooling = weapon.every
        /*
          A swing goes on the same list as a shot, and that is not a fudge.

          What this list is *for* is "something was aimed at somebody, and the
          driver decided it landed" - which is exactly as true of a spike plate
          as of a turret. The difference is what is drawn on the way: a shot has
          a model and takes a moment to arrive, and a swing has neither, so it
          is paid for the instant it is heard. Whoever draws these tells them
          apart by asking the blueprint whether the weapon has anything to fire,
          which every client can do without being told.

          Keeping them apart was the alternative and it would have meant a
          second wire field, a second queue and a second path to the one place
          that may write to somebody's health.
        */
        effects.shots.push({ from: thing.id, at, toward: near.body.id })
        if (!weapon.shot) effects.play.push({ id: thing.id, clip: 'attack' })
      }
    }
  }

  return effects
}

/**
 * Move a recipe along.
 *
 * Started when the slots first satisfy one and *checked again* every frame
 * rather than latched, because the ingredients can leave: somebody who takes
 * the patty back off the board mid-chop should stop the chopping, and a latch
 * would produce a burger out of a bun and an apology.
 */
function cook(
  craft: CraftSpec,
  life: Life,
  dt: number,
  effects: Effects,
  id: string,
  justFilled: readonly string[],
): void {
  const held = [...life.slots.entries()].map(([socket, item]) => ({ socket, item }))
  const recipe = matchRecipe(craft, held.map((one) => one.item))

  if (!recipe) {
    life.cooking = undefined
    return
  }

  if (!life.cooking || life.cooking.recipe !== recipe) {
    life.cooking = { recipe, left: recipe.seconds ?? 0 }
    // A cutting board assembles a salad the instant the last leaf lands, so a
    // recipe with no time on it falls straight through to the finish below
    // rather than waiting a frame - which would be a frame nobody can see and a
    // rule that is hard to state.
    void justFilled
  }

  life.cooking.left -= dt
  if (life.cooking.left > 0) return

  // The output replaces the inputs, which is the only version of this that is
  // honest about a world with sixty objects in it.
  const used = consumes(recipe, held)
  for (const socket of used) life.slots.delete(socket)
  life.cooking = undefined

  effects.made.push({ id, socket: landsAt(recipe, used), item: recipe.makes })
  if (recipe.emit) effects.said.push({ word: recipe.emit, from: id })
}

/**
 * Which of this frame's words this thing actually hears.
 *
 * Three rules, in the order they decide:
 *
 *   - a **wire** is exclusive. A thing that has been wired to something shouts
 *     down the wire and nowhere else, which is the whole point of running one:
 *     the button by the airlock should not open the four doors upstairs.
 *   - a **reach** is a radius from the shouter, in cells, measured the way
 *     everything else in this file measures - centre to centre, on all three
 *     axes, so a bell on a balcony does not ring the room below it.
 *   - with neither, the room hears it, which is what a signal has always been
 *     and what every blueprint written before wires existed still means.
 *
 * A shouter that has since been dismissed (no `at`) is heard by everybody: its
 * word is already in flight, and losing it because the thing that said it was
 * cleared away in the same frame would be a bell that sometimes does not ring.
 */
function earshot(
  shouted: readonly { word: string; at?: { x: number; y: number; z: number }; reach?: number; wires?: readonly string[] }[],
  thing: Alive,
): string[] {
  const words: string[] = []
  for (const signal of shouted) {
    if (signal.wires && signal.wires.length > 0) {
      if (signal.wires.includes(thing.id)) words.push(signal.word)
      continue
    }
    if (signal.reach !== undefined && signal.at) {
      const dx = thing.at.x - signal.at.x
      const dy = thing.at.y - signal.at.y
      const dz = thing.at.z - signal.at.z
      if (Math.hypot(dx, dy, dz) > signal.reach) continue
    }
    words.push(signal.word)
  }
  return words
}

/** A point, moved by an offset. Its own line because it is done twice. */
function shifted(
  at: { x: number; y: number; z: number },
  by: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return { x: at.x + by.x, y: at.y + by.y, z: at.z + by.z }
}

/** Whether anything at all can take health off this. */
function hurtable(fight: FightSpec | undefined): boolean {
  return (fight?.health?.hurtBy.length ?? 0) > 0
}

/** Whether this particular thing hurts it. */
function hurtBy(fight: FightSpec | undefined, hurt: Hurt): boolean {
  return fight?.health?.hurtBy.includes(hurt) ?? false
}

/** The closest body, and how far off it is. */
function nearest(
  thing: Alive,
  bodies: readonly Body[],
): { body: Body; distance: number } | null {
  let best: { body: Body; distance: number } | null = null
  for (const body of bodies) {
    const dx = body.at.x - thing.at.x
    const dy = body.at.y - thing.at.y
    const dz = body.at.z - thing.at.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (!best || distance < best.distance) best = { body, distance }
  }
  return best
}

/**
 * What to draw over a thing, if anything.
 *
 * One function for both bars, because they are drawn in the same place and only
 * one of them may be: a burger that is cooking has no health worth showing, and
 * a crate on its last legs is not waiting for anything. Health wins where both
 * are true, on the ground that it is the one somebody is about to change.
 */
export function barOver(
  thing: Alive,
  life: Life | undefined,
): { kind: 'health' | 'fill'; at: number } | null {
  if (!life) return null

  const health = thing.fight?.health
  if (health && life.health !== undefined && life.health < health.max && health.bar !== false) {
    return { kind: 'health', at: Math.max(0, life.health / health.max) }
  }

  if (thing.states && life.standing) {
    const at = filling(thing.states, life.standing)
    if (at !== null) return { kind: 'fill', at }
  }

  return null
}

/** What a thing looks like right now, allowing for the state it is in. */
export function stateOf(thing: Alive, life: Life | undefined) {
  if (!thing.states || !life?.standing) return undefined
  return stateNamed(thing.states, life.standing.state)
}

export { NEAR, TOUCH }

/**
 * What a kick is worth against a thing.
 *
 * A kick takes *nothing* off a person - it shoves, and what it is for is the
 * ledge (see the note over the kick in `./combat`). Against a crate there is no
 * ledge and no shove worth having, so the choice is between "a kick does
 * nothing to furniture" and a number. A number, because `hurtBy: ['kick']` is a
 * thing somebody deliberately ticked, and a switch that does nothing is worse
 * than a switch tuned conservatively.
 *
 * Half a dash's worst, so breaking something with kicks is slower than charging
 * it - which keeps the dash the committed attack it is meant to be.
 */
export const KICK_PRICE = 15

/** Whether this particular thing is hurt by this particular attack. */
export function hurtsIt(thing: Alive, hurt: Hurt): boolean {
  return hurtBy(thing.fight, hurt)
}
