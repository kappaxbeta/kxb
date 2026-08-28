/**
 * Did that punch land, and as what.
 *
 * ---------------------------------------------------------------------------
 * Why this is its own file, and pure
 * ---------------------------------------------------------------------------
 * It is the one question in the whole game that has to be answered *twice* -
 * once on each machine - and agree. Everything else about a fighter is either
 * private (my stamina) or already on the wire (where I am stood); this is the
 * only place two clients look at the same moment and have to reach the same
 * conclusion about it.
 *
 * So it takes numbers and returns an answer, touches nothing, and is tested on
 * its own. A contact rule tangled into the simulation is a contact rule you can
 * only test by running a match.
 *
 * ---------------------------------------------------------------------------
 * The order of the checks *is* the design
 * ---------------------------------------------------------------------------
 * Reach, then slip, then parry, then guard, then skin. Reading down that list
 * is reading the game's answer to "what beats what":
 *
 *   - **Distance beats everything.** No amount of defence matters if it was
 *     never going to reach, which is why footwork is the first skill.
 *   - **A slip beats a guard break**, because it is checked first and takes the
 *     punch out of the world entirely. That is what stops `uppercut` being an
 *     unanswerable move: it goes through a block, and it goes past a slip.
 *   - **A parry beats a guard**, and costs the attacker far more, because it
 *     asked for a 120ms window and a block asked for nothing.
 *
 * Reorder these and you have rebalanced the game without touching a number.
 */

import { CHIP, MOVES, phaseOf, type Move, type MoveName } from './moves'

/**
 * How much harder a punch lands on somebody who is throwing one.
 *
 * The counter-hit, and the reason a fight is a conversation rather than two
 * people mashing. Trading is meant to be *worse* than reading - if a punch
 * thrown into a punch cost the same as one thrown into a guard, the correct
 * play would be to always throw, and correctness that simple is a game nobody
 * plays twice.
 */
export const COUNTER = 1.35

/** What the defender was doing when it arrived. */
export interface Defence {
  move: MoveName
  /** Seconds since that move began, on the clock the defender is reading. */
  elapsed: number
  /** What they have left to spend absorbing it. */
  stamina: number
}

/**
 * The answer, and it is deliberately not a number.
 *
 * A function that returned `damage` alone could not tell a client whether to
 * draw a block spark, a slip, or a fighter folding up - and those are the three
 * things the player actually reads a fight by. The number is *in* the answer;
 * the answer is what happened.
 */
export type Contact =
  | { kind: 'miss' }
  /** Straight through. `counter` when they were caught throwing. */
  | { kind: 'clean'; damage: number; counter: boolean }
  /** Stopped, at a price in stamina and a tenth of the damage. */
  | { kind: 'blocked'; damage: number; stamina: number }
  /** The guard did not hold - either the punch went through it, or it ran out. */
  | { kind: 'broken'; damage: number }
  /** Not there any more. */
  | { kind: 'slipped' }
  /** Caught. Whoever threw it is about to stand still for `PARRY_STUN`. */
  | { kind: 'parried' }

/**
 * Resolve one punch, at one instant, against one defender.
 *
 * `gap` is centre-to-centre metres - see the `reach` note in ./moves. The
 * caller has already decided that the punch is in its active window; this
 * function does not check, because "is it active" is a question about the
 * *attacker's* clock and this is the only function in the game that is
 * deliberately handed both clocks and told to trust neither more than it must.
 */
export function resolve(punch: Move, gap: number, defence: Defence): Contact {
  const reach = punch.reach ?? 0
  const damage = punch.damage ?? 0

  // Distance first. Nothing below this line can save a punch that fell short,
  // and nothing above it can be spent working out how it would have been
  // defended if it had not.
  if (gap > reach) return { kind: 'miss' }

  const defending = MOVES[defence.move]
  const phase = phaseOf(defending, defence.elapsed)

  // A slip only works while it is *active*. Its startup and recovery are the
  // price: 60ms of committing before you are safe, 160ms of being unable to do
  // anything afterwards. A slip that protected for its whole duration would be
  // a 400ms invulnerability for 12 stamina, which is not a defence, it is an
  // off switch.
  if (defence.move === 'slip' && phase === 'active') return { kind: 'slipped' }

  if (defence.move === 'parry' && phase === 'active') return { kind: 'parried' }

  if (defence.move === 'block') {
    // Two ways a guard fails, and they are the same outcome on purpose. One is
    // the punch's fault and one is the blocker's, but a player watching does
    // not need to be told which - they need to be told the guard is not there
    // any more, and both of these mean exactly that.
    if (punch.breaksGuard) return { kind: 'broken', damage }
    if (defence.stamina < (punch.guardCost ?? 0)) return { kind: 'broken', damage }

    return {
      kind: 'blocked',
      damage: damage * CHIP,
      stamina: punch.guardCost ?? 0,
    }
  }

  // Caught in the middle of their own punch. `startup` and `active` only -
  // somebody in recovery is already being punished by the recovery, and
  // stacking a counter bonus on top would make one read worth two.
  const counter =
    MOVES[defence.move].kind === 'punch' && (phase === 'startup' || phase === 'active')

  return { kind: 'clean', damage: counter ? damage * COUNTER : damage, counter }
}

/** What the defender's health actually loses. Zero for the three that took none. */
export function healthCost(contact: Contact): number {
  switch (contact.kind) {
    case 'clean':
    case 'blocked':
    case 'broken':
      return contact.damage
    default:
      return 0
  }
}

/**
 * Whether this contact interrupts what the defender was doing.
 *
 * A blocked punch does not - that is the whole value of blocking, and a block
 * that staggered you would be a block that loses to being punched twice. A
 * clean hit and a guard break both do.
 */
export function staggers(contact: Contact): boolean {
  return contact.kind === 'clean' || contact.kind === 'broken'
}
