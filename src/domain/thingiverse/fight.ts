/**
 * What a thing can take, and what it can dish out.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all, having been argued against in `blueprint.ts`
 * ---------------------------------------------------------------------------
 * The note over `THING_DEEDS` says, in as many words, that `damage` and `score`
 * are missing on purpose because "a room is a place, not a match". That was
 * right about score and wrong about damage, and the thing that settles it is a
 * mode the lounge already has: **battle**.
 *
 * A lounge in battle mode is not a place. Bodies have health there, a dash
 * takes 10-30% off somebody, a kick shoves them off a ledge, and dying is a
 * respawn (see `_sim/combat.ts`, which has had all of this since before the
 * thingiverse existed). Everything a fighting object needs is standing right
 * there, and the only thing that could not join in was the furniture. A crate
 * you cannot break in a room built for a fight is not restraint, it is a hole.
 *
 * So: this block only means anything in battle mode. In creative mode a thing
 * with fifty health is a thing with fifty health that nobody can touch, because
 * in creative mode nobody can hit anything - the same E that swings in a fight
 * picks the crate up to move it. That is not a rule this file enforces, because
 * it cannot: the mode is a fact about the room, the room is the runtime's, and
 * a domain file that tried to know it would be guessing. It is a rule the
 * runtime keeps, and it is stated here because it is the first thing anybody
 * reading this will want to know.
 *
 * ---------------------------------------------------------------------------
 * The health is the thing's, and only the thing's
 * ---------------------------------------------------------------------------
 * `_sim/combat.ts` states the rule that keeps two browsers agreeing: **each
 * client is authoritative over its own health only**. An attacker decides a hit
 * happened, the victim decides what it costs them, and nobody writes to
 * anybody else's bar.
 *
 * A crate has no client. So the rule it inherits is the next one along: the
 * thing's health is owned by whoever owns the thing, exactly as a ball's
 * position is (see the note on ball ownership in the lounge net code), and
 * everybody else is watching. A hit is a claim sent to the owner, who applies
 * it and says what the health is now. That is why nothing in this file is a
 * number anybody can push at somebody else - `damage` is what a hit is *worth*,
 * and what it does is the owner's arithmetic.
 */

import { knownModel } from '@/domain/thingiverse/models'

/**
 * The most health a thing may have, and the least.
 *
 * A hundred is a body's full bar (`MAX_HEALTH` in `_sim/combat.ts`), and that
 * is the number this scale is quoted against so that "a crate takes three
 * dashes" is arithmetic somebody can do in their head. The ceiling is ten times
 * a person, which is a gate or a boss and is past the point where anybody is
 * still enjoying hitting it. The floor is one, because zero health is a thing
 * that is broken the instant it is summoned - a state with no drawing anybody
 * meant.
 */
export const MIN_THING_HEALTH = 1
export const MAX_THING_HEALTH = 1000

/**
 * What can hurt a thing.
 *
 * The room's existing vocabulary and nothing invented: `dash` and `kick` are
 * the two attacks a body has in battle mode, `shot` is anything fired by
 * another thing (see `GunSpec`), and `bump` is being run into hard - which is
 * the one that makes a vehicle a weapon and a barricade worth building.
 *
 * A list rather than a boolean, because "what breaks this" is the interesting
 * half of authoring a breakable: a barrel that only yields to a kick is a
 * puzzle, and a target that only answers shots is a shooting range. A thing
 * that says nothing hurts it is scenery with a health bar, which is a legal and
 * occasionally useful thing to author - it is how you make something that can
 * only be broken by a signal.
 */
export const HURTS = ['dash', 'kick', 'shot', 'bump'] as const
export type Hurt = (typeof HURTS)[number]

/**
 * How hard a bump has to be before it counts, in cells a second, and what it
 * costs at that speed.
 *
 * A floor rather than a curve, because the failure it exists to stop is
 * specific: without one, a crate resting against a wall that a body is leaning
 * on takes damage forever at a millimetre a second. Above the floor the cost is
 * proportional to how much faster than the floor you were going, which is the
 * same shape `contact-is-not-a-moment` argues for - a touch is priced by
 * closing speed, not by having happened.
 */
export const BUMP_SPEED = 6
export const BUMP_DAMAGE_AT_SPEED = 8

/** What a thing can take. */
export interface HealthSpec {
  /** Full health, and what it is summoned with. See the bounds above. */
  max: number
  /**
   * Whether a bar is drawn over it once it has been hurt.
   *
   * Absent is yes, and only once it has been hurt - a room full of full bars
   * over undamaged furniture is a HUD about nothing. The same decision the XP
   * engine's own blueprints make, and worth the field for the same reason they
   * give: a thing hit constantly (the training dummy, the punchbag) wants the
   * bar gone, and a thing whose whole point is that you cannot tell how close
   * it is wants it gone too.
   */
  bar?: boolean
  /** What takes health off it. Empty is "nothing does". See `HURTS`. */
  hurtBy: readonly Hurt[]
}

/**
 * How hard a thing hits, and how often.
 *
 * ---------------------------------------------------------------------------
 * Why a swing and a shot are one block with two halves
 * ---------------------------------------------------------------------------
 * Because they are the same three questions - how much, how far, how often -
 * and only differ in whether anything travels. A turret and a spike trap are
 * the same object with `shot` filled in or not, and giving them two unrelated
 * blocks would be two panels asking for `damage` twice and two chances for a
 * trap that fires bullets nobody can see because the wrong half was filled in.
 *
 * `attack` (the deed) swings. `shoot` (the deed) fires. Both read this block;
 * `shoot` additionally needs `shot`, and `fightProblems` says so rather than
 * letting a turret with no bullet be a turret that appears to be jammed.
 */
export const WEAPON_LIMITS = {
  /** What one hit is worth, against a hundred-point bar. */
  damage: { min: 1, max: 100 },
  /** How far a swing reaches, or how far a bullet flies, in cells. */
  reach: { min: 0.5, max: 40 },
  /**
   * Seconds between goes.
   *
   * The floor is a tenth of a second, which is ten a second and already faster
   * than anything a room should contain; the ceiling is a minute, past which the
   * thing reads as broken rather than slow.
   */
  every: { min: 0.1, max: 60 },
  /** How fast a bullet travels, in cells a second. */
  speed: { min: 2, max: 80 },
  /**
   * How hard a hit shoves, in cells a second.
   *
   * Zero is allowed and is what absence means. The ceiling is a little over
   * twice a kick (`KICK_IMPULSE` is 15), which is a spring that puts somebody
   * on a roof and is already past the point where being shoved is fun.
   */
  push: { min: 0, max: 34 },
} as const

/**
 * What flies out of it.
 *
 * A model rather than a blueprint, and that is the deliberate narrowing: a
 * bullet is not a thing. It is not summoned, not counted against the world's
 * cap, not something anybody can pick up or dismiss, and it is gone in a second
 * - giving it an identity would put sixty rows a minute into a world that has
 * room for sixty objects. It is a model, a speed and a distance, drawn by the
 * scene and forgotten.
 */
export interface ShotSpec {
  /** A model id the catalogue knows. What the bullet, arrow or ball looks like. */
  model: string
  /** How fast it goes, in cells a second. */
  speed: number
  /** How big it is drawn. The thing's own scale bounds. */
  scale: number
  /**
   * The socket it leaves from, or the thing's own origin.
   *
   * A name for the reason every socket reference in this codebase is a name:
   * the muzzle of a turret is a fact about the turret's model, and a hard-coded
   * offset is a muzzle that has to be re-measured every time the model changes.
   * A name that finds nothing fires from the origin, which is a bullet coming
   * out of the middle of the gun - visible, and fixable by whoever is looking.
   */
  from?: string
}

/** How it hits, and with what. */
export interface WeaponSpec {
  /** What one hit takes off. See `WEAPON_LIMITS`. */
  damage: number
  /** How far it reaches, in cells. For a gun, how far the shot flies. */
  reach: number
  /** Seconds between goes. */
  every: number
  /**
   * Whether it hits people, other things, or both.
   *
   * Both is not the default, and the reason is a specific failure: a room full
   * of turrets that shoot each other is a room that has destroyed itself before
   * anybody walks in. `people` is what a trap wants, `things` is what a
   * demolition tool wants, and `all` is what somebody asks for on purpose.
   */
  at: 'people' | 'things' | 'all'
  /** What it fires. Absent is a swing rather than a shot. See the note above. */
  shot?: ShotSpec
  /**
   * How hard it shoves whoever it lands on, in cells a second. Absent is not at
   * all.
   *
   * ---------------------------------------------------------------------------
   * Why a shove is a property of a hit and not a verb of its own
   * ---------------------------------------------------------------------------
   * Because the room already prices one: a kick takes nothing off you and moves
   * you, and `KICK_IMPULSE` is the number that says how far. A separate `push`
   * deed would need its own reach, its own cooldown and its own arithmetic
   * about who is in front of what - which is the whole of `WeaponSpec`, written
   * twice.
   *
   * So a spring is a weapon with no damage and a big shove, a bumper is a
   * little of both, and a spike plate is all damage and none. One block, three
   * objects, and the same sentence describes each of them.
   *
   * The shove is applied *by the person being shoved*, away from the thing that
   * did it, on the same rule everything else here keeps: the attacker says a
   * hit happened and the victim decides what it does to them. See
   * `PushMessage`, which says the same thing about a boot.
   */
  push?: number
}

/**
 * Everything about a thing being in a fight.
 *
 * One optional block on `BlueprintSpec` with three optional halves, exactly as
 * `vehicle` is one block: a panel, a heading, and absent means what absence has
 * always meant - this is furniture, and furniture does not fight.
 *
 * The three are independent on purpose. A crate is `health` alone. A spike trap
 * is `weapon` alone and cannot be broken. A turret is all of it. Requiring
 * health to have a weapon would make every trap breakable, which is a different
 * object.
 */
export interface FightSpec {
  /** What it can take. Absent means nothing can hurt it. */
  health?: HealthSpec
  /** How it hits. Absent means it does not. */
  weapon?: WeaponSpec
}

/** A thing with a hundred health that a dash or a kick can break. */
export function freshHealth(): HealthSpec {
  return { max: 100, hurtBy: ['dash', 'kick', 'shot'] }
}

/** A swing worth a quarter of a bar, once a second, at whoever walks in. */
export function freshWeapon(): WeaponSpec {
  return { damage: 25, reach: 2, every: 1, at: 'people' }
}

/** A ball that travels at a jog and a half. See `ShotSpec`. */
export function freshShot(model: string): ShotSpec {
  return { model, speed: 18, scale: 0.4 }
}

/** What a bump at this speed is worth, or nothing if it was a nudge. */
export function bumpDamage(speed: number): number {
  if (!Number.isFinite(speed) || speed < BUMP_SPEED) return 0
  return Math.round((speed / BUMP_SPEED) * BUMP_DAMAGE_AT_SPEED)
}

/** Whether a bar should be drawn over this thing at this health. */
export function showsBar(health: HealthSpec | undefined, now: number): boolean {
  if (!health) return false
  if (health.bar === false) return false
  return now < health.max
}

/** Whether this thing shoots rather than swings. */
export function shoots(fight: FightSpec | undefined): boolean {
  return fight?.weapon?.shot !== undefined
}

/**
 * Whatever is wrong with a fight block, said in words.
 *
 * Its own function for the reason `usingProblems` is: the composer draws this as
 * one panel and wants to mark that panel, rather than telling somebody halfway
 * through setting up a turret about the clip they have not named yet.
 */
export function fightProblems(fight: FightSpec, deeds: readonly string[] = []): string[] {
  const problems: string[] = []

  if (fight.health) {
    const { max, hurtBy } = fight.health
    if (!Number.isFinite(max) || max < MIN_THING_HEALTH || max > MAX_THING_HEALTH) {
      problems.push(`health is ${MIN_THING_HEALTH}-${MAX_THING_HEALTH}`)
    }
    for (const hurt of hurtBy) {
      if (!(HURTS as readonly string[]).includes(hurt)) {
        problems.push(`${hurt} is not something that hurts a thing`)
      }
    }
  }

  if (fight.weapon) {
    const { damage, reach, every, at, shot } = fight.weapon
    for (const [field, value] of [
      ['damage', damage],
      ['reach', reach],
      ['every', every],
    ] as const) {
      const limit = WEAPON_LIMITS[field]
      if (!Number.isFinite(value) || value < limit.min || value > limit.max) {
        problems.push(`${field} is ${limit.min}-${limit.max}`)
      }
    }
    if (!['people', 'things', 'all'].includes(at)) {
      problems.push(`${at} is not something a thing can aim at`)
    }
    if (fight.weapon.push !== undefined) {
      const shove = WEAPON_LIMITS.push
      if (
        !Number.isFinite(fight.weapon.push) ||
        fight.weapon.push < shove.min ||
        fight.weapon.push > shove.max
      ) {
        problems.push(`a shove is ${shove.min}-${shove.max} cells a second`)
      }
    }
    if (shot) {
      if (!knownModel(shot.model)) {
        problems.push(`${shot.model} is not a model we ship`)
      }
      const speed = WEAPON_LIMITS.speed
      if (!Number.isFinite(shot.speed) || shot.speed < speed.min || shot.speed > speed.max) {
        problems.push(`a shot travels at ${speed.min}-${speed.max} cells a second`)
      }
      // The socket is *not* checked against the blueprint's sockets, and that is
      // the same call `UseSpec.seats` makes: a muzzle pointing at a socket
      // nobody has drawn yet fires from the origin, which is visible and
      // fixable. Refusing to save loses the other six edits in the panel.
      if (shot.from !== undefined && shot.from.trim() === '') {
        problems.push('a shot leaves a named socket, or the middle of the thing')
      }
    }
  }

  // The one cross-block rule, and the reason this takes the deeds: `shoot` with
  // nothing to fire is a turret that appears jammed, which is the failure this
  // whole file's comments keep coming back to - nothing happening is
  // indistinguishable from every other reason nothing happens.
  if (deeds.includes('shoot') && !fight.weapon?.shot) {
    problems.push('something that shoots needs to be told what it fires')
  }
  if (deeds.includes('attack') && !fight.weapon) {
    problems.push('something that attacks needs to be told how hard')
  }

  return problems
}
