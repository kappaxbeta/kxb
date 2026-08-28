/**
 * The dash attack.
 *
 * A shoulder charge: you lock in a heading, get carried along it for a fraction
 * of a second, and anybody the charge passes through takes 10-30% of their
 * health. At zero they are out and have to respawn.
 *
 * Pure functions over plain numbers, for the same reason `physics.ts` is: the
 * interesting parts - does this dash connect, how much does it take off - are
 * exactly the parts that are miserable to check by hand in a 3D scene with two
 * browsers open. Everything here is testable without a canvas.
 *
 * The one rule that shapes the rest: **each client is authoritative over its own
 * health only**. The attacker decides that a hit happened and how hard, the
 * victim decides what that does to them, and nobody can write to anybody else's
 * health directly. That is not anti-cheat - the lounge is a private team room,
 * not a competitive ladder - it is what keeps two clients from disagreeing about
 * whose bar is where.
 */

/**
 * Full health.
 *
 * A hundred on purpose: damage is quoted as a percentage, so "10-30%" and
 * "10-30 points" are the same number and the HUD needs no conversion.
 */
export const MAX_HEALTH = 100

/** A dash takes off somewhere in this range, inclusive. */
export const DASH_DAMAGE_MIN = 10
export const DASH_DAMAGE_MAX = 30

/**
 * How long the lunge lasts and how fast it carries you.
 *
 * Short and fast rather than long and slow. The dash has to read as a committed
 * attack you can watch someone throw and step out of - drawn out, it is just a
 * sprint button, and the moment it becomes the fastest way to cross the room
 * everybody dashes everywhere and it stops meaning anything.
 */
export const DASH_DURATION = 0.28
export const DASH_SPEED = 26

/**
 * Dead time after a dash starts, so it cannot be spammed.
 *
 * Measured from the start rather than the end, so this is the whole cycle: it
 * must be longer than DASH_DURATION or the next dash is available before the
 * current one has finished.
 */
export const DASH_COOLDOWN = 1.1

/**
 * How close the charge has to pass to a body to connect, and how far apart
 * vertically before it goes under their feet or over their head.
 *
 * Generous horizontally. Both players are being drawn from interpolated network
 * positions that are up to a packet out of date, so a radius tuned to the
 * visible width of an animal would miss charges that visibly connected - and a
 * hit you saw land that did nothing is a worse bug than a hit that landed a
 * little wide.
 */
export const DASH_HIT_RADIUS = 1.5
export const DASH_HIT_HEIGHT = 2.2

/** Grace period after respawning, so you cannot be farmed at the spawn point. */
export const RESPAWN_INVULNERABLE = 2

/**
 * The kick.
 *
 * The other half of the fighting vocabulary, and deliberately not a second
 * damage button: a kick takes nothing off anybody. It shoves. What it is *for*
 * is the thing the room already had and combat could not reach - the ledge, the
 * pit, the lava somebody built a moat out of. A dash asks how much health you
 * have left; a kick asks where you are standing.
 *
 * Short range and a cone rather than a swept line, because unlike the dash it
 * does not travel: you plant your feet and shove whoever is in front of you.
 */
export const KICK_RANGE = 2.6

/**
 * How far off dead-ahead somebody can be and still get shoved, as the cosine of
 * the half-angle. About 50 degrees either side.
 *
 * Wide enough to forgive the same network slop `DASH_HIT_RADIUS` forgives, and
 * narrow enough that a kick is aimed. A full circle would make it a panic
 * button that clears the room, which is not a thing anybody should be able to
 * do standing still.
 */
export const KICK_ARC = 0.64

/** Same vertical reach as a dash: about a body either way. */
export const KICK_HIT_HEIGHT = 2.2

/**
 * Slower than the dash cycle, because it costs nothing to throw.
 *
 * A kick has no travel and no recovery - you do not commit your position the
 * way a charge does - so the only thing stopping it being held down is this.
 */
export const KICK_COOLDOWN = 1.4

/**
 * How hard a kick shoves, horizontally, in blocks per second.
 *
 * Read against `WALK_PACE`: this is several times walking speed, but it decays
 * within about half a second (see `KNOCKBACK_DECAY`), so it is worth two or
 * three blocks of ground rather than a flight across the room.
 */
export const KICK_IMPULSE = 15

/**
 * And a little upward, so the shove lifts rather than scrapes.
 *
 * Under half of `JUMP_SPEED` on purpose. Enough to break contact with the floor
 * - which is what makes the horizontal part carry, since friction is not what
 * stops you here, decay is - and not enough to launch somebody over the wall
 * they were standing next to.
 */
export const KICK_LIFT = 4.5

/**
 * The lunge: how far the body is thrown forward when a kick goes out, and over
 * how long.
 *
 * Cosmetic and nothing else. The player does not move - `KICK_RANGE` and
 * `kickConnects` are judged from where you are actually standing, and a shove
 * whose reach depended on the frame the animation happened to be on would be a
 * different kick every time. This only moves the drawn body.
 *
 * Small and quick, because a kick has no recovery: the number that says "you
 * threw one" is already the cooldown, and this is only there so a kick thrown
 * at nobody still looks like something happened.
 */
export const KICK_LUNGE_REACH = 0.38
export const KICK_LUNGE_DURATION = 0.26

/**
 * The share of that spent going out, the rest coming back.
 *
 * Weighted towards the return so the lunge snaps and settles rather than
 * pumping evenly in and out, which is the difference between a kick and a bow.
 */
const KICK_LUNGE_OUT = 0.35

/**
 * How fast a shove bleeds off, as a rate per second.
 *
 * Exponential rather than linear so it lands hard and lets go quickly: at this
 * rate a kick is down to a tenth of its push in under half a second. Linear
 * decay over the same distance would mean a long tail of the victim gliding,
 * which reads as ice rather than as impact.
 */
export const KNOCKBACK_DECAY = 6

/**
 * How much standing in lava takes off, and how often.
 *
 * A fifth of a bar every half second, which makes lava a hazard rather than a
 * nuisance: two and a half seconds from full health to none. It was one point,
 * on the argument that lava should be a floor you cannot stand on rather than a
 * trap that kills you - fifty seconds of grace, which in practice meant people
 * walked through it. A moat nobody minds crossing is not a moat.
 *
 * The first tick is billed the instant you step in - see `tickLava` - so the
 * warning still arrives before the damage matters, and one hop out costs a
 * fifth of a bar rather than a life. What is gone is the option of ignoring it.
 *
 * A rate rather than a per-frame amount, because per-frame would make the
 * damage a function of the framerate - and a 144Hz monitor would be a death
 * sentence.
 */
export const LAVA_DAMAGE = 20
export const LAVA_INTERVAL = 0.5

export interface Point3 {
  x: number
  y: number
  z: number
}

/**
 * How much a dash takes off.
 *
 * Takes its randomness as an argument so a test can pin it. `Math.random` is
 * uniform on [0, 1), so flooring across the span plus one gives every whole
 * value in the range an equal share - the off-by-one you get without the `+ 1`
 * makes the top of the range unreachable.
 */
export function rollDamage(random: () => number = Math.random): number {
  const span = DASH_DAMAGE_MAX - DASH_DAMAGE_MIN + 1
  return DASH_DAMAGE_MIN + Math.floor(random() * span)
}

/**
 * Clamp a damage number that arrived over the wire.
 *
 * The attacker rolls, so this value is somebody else's arithmetic. Anything
 * outside the range is either a bug or a tampered-with client, and neither
 * should be able to take a player from full health to zero in one packet.
 */
export function sanitiseDamage(damage: number): number {
  if (!Number.isFinite(damage)) return DASH_DAMAGE_MIN
  return Math.min(DASH_DAMAGE_MAX, Math.max(DASH_DAMAGE_MIN, Math.round(damage)))
}

export function applyDamage(health: number, damage: number): number {
  return Math.max(0, Math.min(MAX_HEALTH, health - damage))
}

export function isDown(health: number): boolean {
  return health <= 0
}

/**
 * Closest approach between a body and the line the dash swept this frame, in
 * the horizontal plane, with the height difference measured at that same point.
 *
 * Swept rather than a plain distance check at the end of the frame, which is
 * the whole reason this function exists. A dash covers 26 blocks a second; on a
 * frame that ran long - or on the 20fps floor the simulation clamps to - that
 * is over a block of travel in one step, and a point test would let the charge
 * step straight over somebody standing between the two positions. That failure
 * is rare, framerate-dependent and completely invisible to whoever swung, which
 * is exactly the kind of "it just doesn't hit sometimes" that makes a fighting
 * verb feel broken.
 */
export function dashConnects(from: Point3, to: Point3, target: Point3): boolean {
  const ax = to.x - from.x
  const az = to.z - from.z
  const lengthSq = ax * ax + az * az

  // Project the target onto the swept segment, clamped to its ends so a body
  // beside the line does not match against an extension of it.
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((target.x - from.x) * ax + (target.z - from.z) * az) / lengthSq),
        )

  const closestX = from.x + ax * t
  const closestZ = from.z + az * t
  if (Math.hypot(target.x - closestX, target.z - closestZ) > DASH_HIT_RADIUS) return false

  // Height compared at the same point along the sweep, so charging off a ledge
  // is judged against where you actually were as you passed.
  const closestY = from.y + (to.y - from.y) * t
  return Math.abs(target.y - closestY) <= DASH_HIT_HEIGHT
}

/**
 * Is this body inside the cone the kick just swung through?
 *
 * A point test against where the kicker is standing, not a sweep - a kick does
 * not move you, so there is no travel for anybody to be missed in the middle
 * of. The three conditions are, in order, the cheapest first: too far, too far
 * round, too far up.
 */
export function kickConnects(from: Point3, facing: { x: number; z: number }, target: Point3): boolean {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const distance = Math.hypot(dx, dz)

  if (distance > KICK_RANGE) return false
  if (Math.abs(target.y - from.y) > KICK_HIT_HEIGHT) return false

  /**
   * Standing inside somebody has no direction to be in front of, and the arc
   * test below would divide by zero. Close enough counts as kicked - if they
   * are in your box, you are not missing them.
   */
  if (distance < 1e-6) return true

  // Both vectors are flat, so the dot product of the normalised pair is exactly
  // the cosine of the angle between where we are looking and where they are.
  return (dx * facing.x + dz * facing.z) / distance >= KICK_ARC
}

/**
 * What a shove leaves after `delta` seconds.
 *
 * Framed as a multiplier over a component so the caller can apply it to x and z
 * without either one decaying faster than the other, which is what would happen
 * if each were eased toward zero by a fixed amount.
 */
export function knockbackFalloff(delta: number): number {
  return Math.exp(-KNOCKBACK_DECAY * delta)
}

/**
 * Clamp an impulse that arrived over the wire.
 *
 * `sanitiseDamage`'s counterpart, and needed for the same reason: the shove is
 * somebody else's arithmetic, and nothing anybody sends should be able to fling
 * us across the world or park a NaN in our position - which, unlike bad health,
 * would take the character controller with it permanently.
 */
export function sanitiseImpulse(value: number, limit: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(limit, Math.max(-limit, value))
}

/**
 * The push a player is currently carrying, and the lift they have not spent.
 *
 * Mutable and shared between the scene (which learns about the kick from the
 * channel) and the character controller (which is the only thing that can move
 * anybody), exactly like `DashRuntime` - see the note there.
 */
export interface Knockback {
  /** Blocks per second, decaying. Added to whatever walking asks for. */
  x: number
  z: number
  /**
   * Upward velocity waiting to be applied, or zero.
   *
   * Consumed rather than decayed: vertical velocity belongs to the physics
   * step, so this is a one-frame handoff and not a second place gravity lives.
   */
  lift: number
}

export function createKnockback(): Knockback {
  return { x: 0, z: 0, lift: 0 }
}

/**
 * How long you have been standing in the fire, and what that costs this frame.
 *
 * Returns the carried-over remainder rather than resetting to zero, so damage
 * stays on the same cadence regardless of where frame boundaries fall - at 0.5s
 * a tick, a run of long frames must not quietly become a slower burn.
 */
export function tickLava(
  elapsed: number,
  delta: number,
  standing: boolean,
): { elapsed: number; damage: number } {
  /**
   * Off the lava, the clock resets - a cumulative burn you could top up by
   * hopping in and out would punish exactly the reaction it should reward.
   *
   * Reset to a full interval rather than to zero, so the *first* frame back in
   * the fire bills immediately. Starting from empty would mean stepping into
   * lava does nothing for half a second, and the one thing this has to
   * communicate, before it takes anything worth having, is that you are
   * standing somewhere you should not be.
   */
  if (!standing) return { elapsed: LAVA_INTERVAL, damage: 0 }

  const total = elapsed + delta
  const ticks = Math.floor(total / LAVA_INTERVAL)

  return {
    elapsed: total - ticks * LAVA_INTERVAL,
    damage: ticks * LAVA_DAMAGE,
  }
}

/** Timers for one player's dash. Ticked every frame, never rendered. */
export interface DashTimers {
  /** Seconds of lunge left. Zero when not dashing. */
  remaining: number
  /** Seconds until another dash is allowed. Zero when ready. */
  cooldown: number
}

export const DASH_IDLE: DashTimers = { remaining: 0, cooldown: 0 }

export function tickDash(timers: DashTimers, delta: number): DashTimers {
  return {
    remaining: Math.max(0, timers.remaining - delta),
    cooldown: Math.max(0, timers.cooldown - delta),
  }
}

export function canDash(timers: DashTimers, health: number): boolean {
  return timers.cooldown === 0 && !isDown(health)
}

export function startDash(): DashTimers {
  return { remaining: DASH_DURATION, cooldown: DASH_COOLDOWN }
}

/**
 * The live dash, shared by the two components that own half of it each.
 *
 * `<PlayerControls>` moves you and writes the sweep; `<Multiplayer>` reads the
 * sweep and decides who it caught, because it is the only thing that knows
 * where anybody else is or how to tell them. Neither can do the other's job, and
 * a ref between them beats lifting either responsibility into a component that
 * would then need the other one's context.
 *
 * Plain mutable numbers rather than THREE.Vector3 so this file stays free of a
 * renderer dependency and stays testable in bun.
 */
export interface DashRuntime {
  timers: DashTimers
  /** Set by a keypress or a button, consumed by the next frame. */
  requested: boolean
  /** Heading locked in when the dash started. A charge does not steer. */
  dir: { x: number; z: number }
  /** Where the dash swept this frame. */
  from: Point3
  to: Point3
  /**
   * True when `from`/`to` describe a sweep nobody has judged yet.
   *
   * Cleared by whoever consumes it, so a frame that renders no `<Multiplayer>`
   * (the public showcase) simply drops the sweep instead of leaving a stale one
   * to be re-judged later.
   */
  swept: boolean
  /**
   * Who this dash has already caught.
   *
   * One charge hits each person once. Without this a dash that passes *through*
   * somebody lands on every frame it overlaps them - four or five hits from one
   * button, which would take a full-health player out in a single press.
   */
  hits: Set<string>
}

/**
 * The live kick, split between the same two components the dash is split
 * between and for the same reason: the controller knows where you are standing
 * and which way you are facing, and only the channel knows who else is there.
 *
 * Simpler than `DashRuntime` because a kick is instantaneous - there is no
 * duration to tick down and no set of people already caught, since the whole
 * thing is judged in the single frame it was thrown.
 */
export interface KickRuntime {
  /** Seconds until another kick is allowed. Zero when ready. */
  cooldown: number
  /** Set by a keypress or a button, consumed by the next frame. */
  requested: boolean
  /** Where it was thrown from, and which way. Written the frame it lands. */
  origin: Point3
  dir: { x: number; z: number }
  /** True when a kick is waiting to be judged. Cleared by whoever judges it. */
  thrown: boolean
}

export function createKickRuntime(): KickRuntime {
  return {
    cooldown: 0,
    requested: false,
    origin: { x: 0, y: 0, z: 0 },
    dir: { x: 0, z: 1 },
    thrown: false,
  }
}

export function tickKick(cooldown: number, delta: number): number {
  return Math.max(0, cooldown - delta)
}

export function canKick(cooldown: number, health: number): boolean {
  return cooldown === 0 && !isDown(health)
}

/**
 * How far forward the drawn body sits, this many seconds into a kick.
 *
 * Zero before the kick and zero once it is over, so a caller can park the clock
 * past the end and get nothing rather than having to carry a separate "am I
 * lunging" flag.
 *
 * Out on an ease-out and back on a smoothstep: the push has to arrive faster
 * than it leaves, or it reads as a lean.
 */
export function kickLunge(elapsed: number): number {
  if (!(elapsed > 0) || elapsed >= KICK_LUNGE_DURATION) return 0

  const out = KICK_LUNGE_DURATION * KICK_LUNGE_OUT
  if (elapsed < out) {
    const t = elapsed / out
    return KICK_LUNGE_REACH * (1 - (1 - t) * (1 - t))
  }

  const t = (elapsed - out) / (KICK_LUNGE_DURATION - out)
  return KICK_LUNGE_REACH * (1 - t * t * (3 - 2 * t))
}

export function createDashRuntime(): DashRuntime {
  return {
    timers: { remaining: 0, cooldown: 0 },
    requested: false,
    dir: { x: 0, z: 1 },
    from: { x: 0, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
    swept: false,
    hits: new Set(),
  }
}
