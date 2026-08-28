/**
 * `@kxb/boxing/moves` - the frame data.
 *
 * ---------------------------------------------------------------------------
 * Why this is a table and not a pile of `if`s
 * ---------------------------------------------------------------------------
 * Everything that makes a fighting game feel like one is in here, and it is all
 * *numbers about time*. A jab is not "a fast punch" - it is 70ms before it can
 * hurt anybody, 50ms during which it can, and 130ms afterwards where you are
 * committed and cannot defend. Change those three numbers and you have a
 * different game; change them in eight `switch` arms scattered across the
 * simulation and you have a different game nobody can tune.
 *
 * So: one record per move, and the simulation reads it. Balancing this game
 * means editing this file and nothing else, which is the property worth having.
 *
 * ---------------------------------------------------------------------------
 * Seconds, not frames, despite the name
 * ---------------------------------------------------------------------------
 * "Frame data" is the term of art and the numbers below are in **seconds**, for
 * the same reason `XpHost.now()` is: the host supplies the clock, a test drives
 * a whole match in a loop without waiting for one, and nothing here may assume
 * it is being stepped at 60Hz. A move written in frames is a move that changes
 * length on a 144Hz monitor.
 *
 * The *art* is still in frames - see `../art/sprites.ts` - and the two meet in
 * `phaseOf` below, which is the only place that knows both.
 *
 * ---------------------------------------------------------------------------
 * Reach is centre-to-centre
 * ---------------------------------------------------------------------------
 * Not arm length. A fighter is `BODY_RADIUS` wide, so two of them standing on
 * top of each other are already 0.9m apart and a `reach` under that could never
 * land. Measuring from the centre is what lets `contact.ts` be one subtraction
 * rather than a box overlap - and in a game whose whole geometry is a line,
 * a box overlap would be a box overlap of two identical boxes.
 */

/**
 * The scale, and every distance in this file comes out of it.
 *
 * ---------------------------------------------------------------------------
 * Measured off the art, not chosen
 * ---------------------------------------------------------------------------
 * The first draft of this table had reaches picked to feel like a ladder, and
 * they were: 1.45m for a jab, 1.25m for a hook. They were also wrong, and the
 * way they were wrong is the kind you cannot see in a test - the numbers agreed
 * with each other and disagreed with the picture, so a punch "landed" while the
 * drawn glove was still a foot short, and a jab passed clean through a head
 * without connecting.
 *
 * So they are read off the sprites instead: the alpha bounds of every punch's
 * most extended frame, in both character packs, converted to metres by making
 * each figure 1.8m tall.
 *
 * **The art changed one thing about the game.** The measurement says the *jab*
 * is the longest punch, not the cross - which is correct boxing and was not
 * what this table said. The lead hand starts closer to the opponent. The ladder
 * survives; its top rung swapped places.
 *
 * ---------------------------------------------------------------------------
 * Two characters, one table, and why that is not a fudge
 * ---------------------------------------------------------------------------
 * The two packs are drawn to different rules - 102x67 cells against 68x61, and
 * a glove that reaches 52px in one and 33px in the other. Converted to metres
 * they disagree about every punch by up to 0.8m, and there is no scale that
 * reconciles them: making the second fighter's jab reach as far as the first's
 * would draw them nearly a metre taller than their opponent.
 *
 * So the numbers below are the *average* of the two measurements, rounded into
 * the ladder the game wants, and both fighters' gloves land within about 0.3m
 * of the point the rules call contact. That is the trade taken deliberately,
 * and the alternative is worse than a small visual slip: a reach per character
 * is a character who out-ranges the other, which is a game where the corner you
 * were given decides the fight.
 */
export const PIXEL = 1.8 / 41

/**
 * Half a fighter's width, in metres. Two of them cannot be closer than twice
 * this.
 *
 * Half the drawn width of an idle frame, so the bodies stop touching at the
 * moment the sprites do rather than at a number somebody liked.
 */
export const BODY_RADIUS = 14.25 * PIXEL

/**
 * Every move a fighter can be in the middle of.
 *
 * Includes the ones nobody presses a key for - `hurt`, `down`, `out`, `won` -
 * because "what is my body doing" has exactly one answer at a time and a state
 * that lives outside this union is a state the animator cannot draw. The art
 * has a clip for each of these, which is not a coincidence: the move list *is*
 * the sprite sheet, and `../art/sprites.ts` fails to compile if they drift.
 */
export type MoveName =
  | 'idle'
  | 'walkIn'
  | 'walkOut'
  | 'dashIn'
  | 'dashOut'
  | 'jab'
  | 'cross'
  | 'hook'
  | 'uppercut'
  | 'overhand'
  | 'block'
  | 'parry'
  | 'slip'
  | 'hurt'
  | 'stunned'
  | 'down'
  | 'out'
  | 'won'

/** What a move is *for*, when the simulation needs to ask about a class of them. */
export type MoveKind = 'stance' | 'move' | 'punch' | 'guard' | 'evade' | 'reel'

export interface Move {
  name: MoveName
  kind: MoveKind

  /**
   * Before it can do anything. The commitment window: you have pressed the key,
   * the arm is travelling, and nothing about the world has changed yet.
   */
  startup: number
  /** While it can. For a punch this is the only window a hit can land in. */
  active: number
  /**
   * After. Still committed - no blocking, no cancelling - which is what makes
   * a whiffed overhand a decision rather than a free swing.
   */
  recovery: number

  /**
   * Centre-to-centre metres at which this connects. See the header.
   *
   * The lead hand is the longest and the short ones come round or up, which is
   * why `uppercut` is the shortest thing in the table and the only one that
   * beats a guard: it is the punch you throw when you are already too close to
   * throw anything else.
   *
   * Measured rather than invented - see `PIXEL` - then averaged across the two
   * character packs and rounded into a ladder. The uppercut is the one number
   * pushed past its measurement: both packs draw it reaching about as far as
   * the hook, and the table needs the guard breaker to be the punch you have to
   * get inside for.
   */
  reach?: number
  /** Health taken on a clean hit. */
  damage?: number
  /** Stamina the thrower spends. Spent at startup, whether or not it lands. */
  cost?: number
  /**
   * Stamina the *blocker* spends absorbing it.
   *
   * This is the guard meter, without a second bar to explain: blocking is free
   * in health and expensive in stamina, so a fighter who blocks everything runs
   * out of the thing they need to punch back. Running out mid-block is a guard
   * break - see `fight.ts`.
   */
  guardCost?: number
  /**
   * Goes through a raised guard for full damage.
   *
   * True for exactly one move, and that is the design rather than an oversight.
   * A game where blocking is always right is a game where both players block;
   * one guard-breaking punch - the shortest-range, slowest, most expensive one
   * in the table - makes turtling a position that can be punished rather than
   * a strategy that wins.
   */
  breaksGuard?: boolean

  /** Metres per second this move carries the body, along the lane. */
  travel?: number
  /**
   * Frozen out of blocking and moving until this move is over.
   *
   * Every punch and every evade. The absence of it on `block` is why you can
   * drop a guard the instant you want to, and its presence on everything else
   * is where all the risk in this game comes from.
   */
  committed?: boolean
}

/**
 * How long a move lasts, start to finish.
 *
 * Worth a function rather than a fourth field: three numbers that must sum to a
 * fourth is a fourth number that will one day be wrong.
 */
export const durationOf = (move: Move): number => move.startup + move.active + move.recovery

/** Which third of a move we are in, `elapsed` seconds after it began. */
export type MovePhase = 'startup' | 'active' | 'recovery' | 'done'

export function phaseOf(move: Move, elapsed: number): MovePhase {
  if (elapsed < move.startup) return 'startup'
  if (elapsed < move.startup + move.active) return 'active'
  if (elapsed < durationOf(move)) return 'recovery'
  return 'done'
}

/**
 * The table.
 *
 * Read the punches as a ladder: each one down the list is slower, shorter,
 * dearer and hits harder, and there is no punch that is better than another at
 * everything. That is the only balance rule here worth stating - if a move is
 * strictly better than another, one of them is dead weight and the fight
 * collapses to whoever presses the good one faster.
 */
export const MOVES: Record<MoveName, Move> = {
  /** Doing nothing, which is a move: it is the only state you can act *from*. */
  idle: { name: 'idle', kind: 'stance', startup: 0, active: 0, recovery: 0 },

  /**
   * Walking, held rather than pressed.
   *
   * Zero-length on purpose: a walk has no startup to commit to and no recovery
   * to punish, so it is re-entered every frame the key is down and abandoned
   * the moment it is not. Its `travel` is what actually moves the body.
   */
  walkIn: { name: 'walkIn', kind: 'move', startup: 0, active: 0, recovery: 0, travel: 1.9 },
  walkOut: { name: 'walkOut', kind: 'move', startup: 0, active: 0, recovery: 0, travel: -1.6 },

  /**
   * A burst, with a price.
   *
   * Faster than a walk for a moment and then a fifth of a second of standing
   * still that you cannot cancel - which is what stops a dash being a strictly
   * better walk. Backing out is quicker than diving in because retreating from
   * a punch you have seen is meant to work; closing on somebody who is ready
   * for you is meant to cost something.
   */
  dashIn: {
    name: 'dashIn', kind: 'move',
    startup: 0.04, active: 0.16, recovery: 0.2,
    travel: 6.4, cost: 10, committed: true,
  },
  dashOut: {
    name: 'dashOut', kind: 'move',
    startup: 0.04, active: 0.14, recovery: 0.16,
    travel: -7.0, cost: 10, committed: true,
  },

  /**
   * The jab. Cheap, quick, the longest thing in the table, and it barely hurts.
   *
   * The move you are always allowed to throw: at 250ms end to end it recovers
   * before most things can punish it, which is what makes it the tool for
   * finding out where the other fighter is rather than a way to win.
   */
  jab: {
    name: 'jab', kind: 'punch',
    startup: 0.07, active: 0.05, recovery: 0.13,
    reach: 2.5, damage: 4, cost: 4, guardCost: 2, committed: true,
  },

  /** The straight. The rear hand: shorter than the jab, and worth twice as much. */
  cross: {
    name: 'cross', kind: 'punch',
    startup: 0.11, active: 0.06, recovery: 0.21,
    reach: 2.4, damage: 9, cost: 9, guardCost: 5, committed: true,
  },

  /** Round the side. Shorter than the straights, and the first one that really hurts. */
  hook: {
    name: 'hook', kind: 'punch',
    startup: 0.14, active: 0.07, recovery: 0.27,
    reach: 2.05, damage: 13, cost: 13, guardCost: 8, committed: true,
  },

  /**
   * Up the middle, through the guard.
   *
   * The shortest reach in the table and the only `breaksGuard`. Both halves of
   * that are the same decision: it is the punch for somebody who has backed
   * their opponent into blocking and stepped inside to make them pay for it,
   * and at 1.15m you cannot throw it from anywhere else.
   */
  uppercut: {
    name: 'uppercut', kind: 'punch',
    startup: 0.17, active: 0.07, recovery: 0.34,
    reach: 1.9, damage: 16, cost: 16, guardCost: 10, breaksGuard: true, committed: true,
  },

  /**
   * The haymaker. Nearly three quarters of a second, and a fifth of a health
   * bar if it lands.
   *
   * 220ms of startup is long enough to *see*, which is the point: this is the
   * punch that is only correct against somebody who is already committed to
   * something else.
   */
  overhand: {
    name: 'overhand', kind: 'punch',
    startup: 0.22, active: 0.08, recovery: 0.42,
    reach: 2.2, damage: 20, cost: 19, guardCost: 12, committed: true,
  },

  /**
   * Guard up. Held, uncommitted, and the only defence with no timing in it.
   *
   * Cheap in health, expensive in stamina, and beaten outright by one punch.
   * Not `committed`, so it drops the instant the key does - a block you had to
   * wait out would make the correct play "never block".
   */
  block: { name: 'block', kind: 'guard', startup: 0, active: 0, recovery: 0 },

  /**
   * A 120ms window that takes the punch away and hands you the round.
   *
   * The highest-risk, highest-reward thing in the game: land it and the
   * attacker eats `PARRY_STUN` seconds of standing still, which is long enough
   * to throw the overhand you would never otherwise get away with. Miss it and
   * you have spent 380ms committed with no guard up.
   */
  parry: {
    name: 'parry', kind: 'guard',
    startup: 0.05, active: 0.12, recovery: 0.21, committed: true,
  },

  /**
   * Slipping. Invulnerable while it is active, and it carries you.
   *
   * The answer to the guard-breaking uppercut, and the reason the fight has
   * three defensive options rather than two: block beats the cheap punches,
   * slip beats the expensive ones, and each of them loses to the other's
   * answer. Nothing here beats everything.
   */
  slip: {
    name: 'slip', kind: 'evade',
    startup: 0.06, active: 0.18, recovery: 0.16,
    travel: -2.2, cost: 12, committed: true,
  },

  /**
   * Being hit. Not something anybody chooses, and it is in the same table as
   * the things they do choose because it occupies the body in exactly the same
   * way - see the `MoveName` header.
   */
  hurt: { name: 'hurt', kind: 'reel', startup: 0, active: 0, recovery: 0.28, committed: true },

  /**
   * Frozen, because they caught it.
   *
   * Its own move rather than `hurt` with a longer clock, and the first draft
   * was the latter: it set `since` into the *future* so a 280ms animation would
   * take `PARRY_STUN` to finish. That works and it leaks a negative `elapsed`
   * into the renderer, where it becomes a negative frame index in something
   * that has never heard of parrying. A move is cheaper than that bug.
   */
  stunned: { name: 'stunned', kind: 'reel', startup: 0, active: 0, recovery: 0.65, committed: true },

  /**
   * On the canvas, being counted over. Length is the count, not the animation.
   *
   * Three seconds, which is a long time to sit still and is the point: a
   * knockdown is the worst thing that happens in this game and it should stop
   * the fight for long enough to be felt. The art plays its seven frames in the
   * first three quarters of a second and holds - see `../art/characters.ts`.
   */
  down: { name: 'down', kind: 'reel', startup: 0, active: 0, recovery: 3, committed: true },

  /** Out. Terminal - nothing leaves this state. */
  out: { name: 'out', kind: 'reel', startup: 0, active: 0, recovery: 0, committed: true },

  /** The other one is. Also terminal. */
  won: { name: 'won', kind: 'stance', startup: 0, active: 0, recovery: 0, committed: true },
}

/** Every punch, in ladder order. Handy for a control panel and for tests. */
export const PUNCHES = ['jab', 'cross', 'hook', 'uppercut', 'overhand'] as const
export type PunchName = (typeof PUNCHES)[number]

export const isPunch = (name: MoveName): name is PunchName =>
  MOVES[name].kind === 'punch'

/**
 * How long a successful parry freezes whoever was punching.
 *
 * Read off the move rather than declared beside it, because two numbers that
 * must be equal are one number and a bug waiting for somebody to tune half of
 * it.
 */
export const PARRY_STUN = MOVES.stunned.recovery

/**
 * What a blocked punch still costs in health, as a fraction.
 *
 * Not zero, and that is the decision: a block that took nothing would make a
 * fighter with stamina unkillable, and the fight would end on the timer every
 * time. A tenth means blocking is *winning the exchange*, not sitting it out.
 */
export const CHIP = 0.1
