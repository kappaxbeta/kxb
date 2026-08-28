/**
 * `@kxb/boxing/fight` - a match in progress.
 *
 * ---------------------------------------------------------------------------
 * What this is, in one line
 * ---------------------------------------------------------------------------
 * A whole boxing match - two fighters, three rounds, a clock, knockdowns and a
 * verdict - as numbers, with no browser, no renderer, no network and no clock
 * of its own. `bun test` runs a full twelve-round title fight in under a
 * millisecond, which is the only reason any of the rules below are trustworthy.
 *
 * ---------------------------------------------------------------------------
 * `resolves` is the netcode, and it is one field
 * ---------------------------------------------------------------------------
 * The interesting thing in this file is on `FightInput`: a list of the corners
 * this caller is *allowed to decide about*. It exists because of the one
 * question a networked fighting game has to answer - **who decides that a punch
 * landed** - and the answer here is the defender.
 *
 * That follows `@kxb/xp`'s own tiers rather than inventing a fourth. Its
 * `net/sharing.ts` fixes `self` as "you are authoritative over your own
 * position and your own health", and a punch landing on me is a fact about my
 * health. So my machine decides, tells yours, and yours draws it.
 *
 * It is the lag-tolerant choice as well as the consistent one. The alternative
 * - the attacker decides - means being hit by a punch you watched yourself slip,
 * because the attacker's copy of you is 80ms stale. Under this rule you are
 * never hit by anything you saw yourself avoid, and the cost is that the
 * attacker sees their punch land a round-trip late. Players forgive the second
 * and never forgive the first.
 *
 * **What it is honest about:** a client that decides its own health is a client
 * that can lie about it. For a proof of concept that is the right trade - the
 * fix is not a different tier, it is the third one, and `../net/arbiter.ts`
 * already runs the verdict there. Moving damage to the arbiter is a day's work
 * and 12 round trips a second; moving it there *before* the game is fun would
 * be paying for it first.
 *
 * Pass both corners and it is a local match - a test, a bot, two pads on one
 * machine - decided entirely here.
 */

import {
  BODY_RADIUS,
  durationOf,
  MOVES,
  phaseOf,
  isPunch,
  type MoveName,
  type PunchName,
} from './moves'
import { healthCost, resolve, staggers, type Contact } from './contact'

// ---------------------------------------------------------------------------
// The shape of a match
// ---------------------------------------------------------------------------

export type Corner = 'red' | 'blue'
export const CORNERS: readonly Corner[] = ['red', 'blue']
export const opposite = (corner: Corner): Corner => (corner === 'red' ? 'blue' : 'red')

export const MAX_HEALTH = 100
export const MAX_STAMINA = 100

/**
 * Half the fighting area, in metres.
 *
 * Not a round number and not a guess: the voxel ring's canvas - the flat inside
 * the ropes - is 7.2 of the model's own units across, and the renderer scales
 * the model so that span becomes this plus a small margin. Picking a number
 * here that the ring could not hold would put the ropes somewhere a fighter
 * walks through, which looks like a rendering bug and is really a disagreement
 * between two files.
 *
 * `src/app/boxing/_play/stadium.tsx` reads this and derives its scale from it,
 * so the ring fits the rules rather than the rules being tuned to the ring.
 */
export const RING_HALF = 2.8

export const ROUNDS = 3

/**
 * How long a round is, when nothing says otherwise.
 *
 * Three of these is the whole match, which is why the default is a minute: it
 * makes a three-minute fight, and three minutes is what a wizard offering a
 * time limit tends to be offered first.
 */
export const ROUND_SECONDS = 60

/**
 * The shortest and longest a round may be, whatever it is asked for.
 *
 * A host's time limit is a number somebody typed, and both ends of it break the
 * game rather than merely tuning it: under about fifteen seconds a round ends
 * before the fighters have closed the distance, and the frame data - every
 * number of which is in tenths of a second - stops mattering at all. The far end
 * is kinder and still worth having, because a fight nobody can lose is a fight
 * nobody finishes.
 */
export const SHORTEST_ROUND = 15
export const LONGEST_ROUND = 15 * 60

/**
 * A whole match's fighting time, cut into rounds.
 *
 * The host counts a time limit for the *match* - that is what it means
 * everywhere else in the product - and this game counts rounds, so the division
 * happens here rather than at the call site. Clamped, and the clamp is per
 * round: three seconds each is not three short rounds, it is no game.
 */
export function roundsOf(matchSeconds: number | null | undefined): number {
  if (typeof matchSeconds !== 'number' || !Number.isFinite(matchSeconds) || matchSeconds <= 0) {
    return ROUND_SECONDS
  }
  return Math.min(LONGEST_ROUND, Math.max(SHORTEST_ROUND, matchSeconds / ROUNDS))
}
export const REST_SECONDS = 12
/** Touching gloves. Long enough to read the corner names before anybody can be hit. */
export const WALKOUT_SECONDS = 3

/**
 * Stamina back per second, by what the body is doing.
 *
 * Three rates rather than one because stamina is the whole economy of this
 * game: it is what a guard costs, what a power punch costs, and what running
 * away buys you. A fighter who is committed to something recovers nothing,
 * which is what makes a whiffed overhand hurt twice.
 */
export const REGEN = { free: 16, guarding: 7, committed: 0 }

/** Health handed back at the bell, so a bad round is not a lost match. */
export const ROUND_RECOVERY = 45
/** What you get up with. Deliberately not much - a knockdown should decide rounds. */
export const RISEN_HEALTH = 40
/**
 * Knockdowns in one round that end it.
 *
 * The real three-knockdown rule, and it is here because without it a fighter
 * with a health bar that refills at `RISEN_HEALTH` can be knocked down all
 * night and still win on the cards.
 */
export const THREE_KNOCKDOWN = 3

/**
 * The damage in one blow that ends it there and then, with no count.
 *
 * ---------------------------------------------------------------------------
 * The punch, not what was left of the bar
 * ---------------------------------------------------------------------------
 * This used to be `CLEAN_KNOCKOUT = 12`, read against how far *past zero* the
 * punch took them - and the sentence justifying it, "only the top of the punch
 * ladder can reach it from a standing start", was true and irrelevant. Nobody
 * is knocked out from a standing start. They are knocked out at the end of a
 * round with eight health left, and at eight health a hook clears twelve points
 * of overkill. So did an uppercut, and so did most overhands.
 *
 * Which made the clean knockout the *ordinary* ending rather than the rare one:
 * whittle somebody down, land anything real, fight over. Rounds two and three
 * existed and were almost never played, and the three-knockdown rule below -
 * the actual drama of a boxing match - almost never got to fire.
 *
 * So the question is asked of the blow. 25 sits above an uppercut counter
 * (16 x 1.35 = 21.6) and below an overhand counter (20 x 1.35 = 27), which
 * makes the sentence above finally true: the biggest punch in the game, thrown
 * into somebody who was throwing one. Everything else that empties a bar is a
 * knockdown, they get up on `RISEN_HEALTH`, and the fight goes on.
 *
 * Both conditions still have to hold - the blow must also have taken them to
 * zero - so an overhand counter into a full bar is a hard round, not a finish.
 */
export const KNOCKOUT_PUNCH = 25

/**
 * The closest two fighters will stand, centre to centre, in metres.
 *
 * ---------------------------------------------------------------------------
 * Close enough to touch, which is what a fight looks like
 * ---------------------------------------------------------------------------
 * This has been both ways. It began at `BODY_RADIUS * 2` - the drawn bodies just
 * touching - and was widened to 1.7m when players walked into each other, saw
 * the sprites merge and concluded the punches were not connecting.
 *
 * They *were* connecting. The real cause was elsewhere and is fixed: contact was
 * a point test that a slow client stepped straight over, and moves were being
 * cleared before contact was resolved at all. With those gone there is no reason
 * to hold two boxers half a metre apart, and every reason not to - infighting is
 * most of the sport, and a game where you cannot get inside is a game of two
 * people poking at each other from across the ring.
 *
 * So it is back to the drawn width: the figures close until they touch, and the
 * clinch looks like a clinch. `BODY_RADIUS` is measured from the sprite - see
 * `PIXEL` in ./moves - so this follows the art rather than a number anybody
 * chose.
 *
 * The one rule it must not break is that every punch still reaches from here.
 * The shortest is the uppercut at 1.9m, and `fight.test.ts` asserts it.
 */
export const CLOSEST = BODY_RADIUS * 2

export interface Fighter {
  /** The player id from `XpPlayer`, or a bot's name. Not read by the rules. */
  id: string
  corner: Corner
  name: string
  /**
   * Which fighter they picked, by a character id the art layer knows.
   *
   * Not read by the rules - the two characters are identical to fight with, and
   * deliberately so: `moves.ts` averages its reaches across both packs precisely
   * so the corner you were given cannot decide the match. This is carried here
   * for the same reason `name` is, which is that it has to reach the *other*
   * client. Two players drawing different fighters for the same body is the one
   * kind of disagreement a spectator would notice immediately.
   */
  character: string
  /**
   * Whether this fighter has said they are ready to start.
   *
   * Distinct from the session's `connected()`, which is about whether their
   * client is running at all. This is a person pressing a button, and the round
   * does not begin until both have - see the `lobby` phase.
   */
  ready: boolean
  /** Metres from the centre of the ring, along the only axis this game has. */
  x: number
  move: MoveName
  /** Host-clock seconds at which `move` began. */
  since: number
  health: number
  stamina: number
  /** Knockdowns this round, and in the whole match. The first one ends rounds. */
  downsThisRound: number
  /**
   * What the last blow to land on this fighter cost them, this step only.
   *
   * Written by `strike` and cleared by `count` in the same frame, which is the
   * whole of its lifetime - the two run in order inside one `stepFight`, so
   * this never has to survive anything or reach the wire. It exists because
   * `count` decides a knockout and a knockout is a fact about the *punch*, and
   * a health bar that has been driven negative cannot say which punch did it.
   *
   * Not sent in `STANCE`. The fighter who was hit is the one who resolves the
   * hit - see the file header - so the client that needs this is always the
   * client that wrote it.
   */
  struck: number
  downs: number
  /** Damage dealt this round. What the cards are scored on. */
  dealt: number
  /**
   * Whether the punch currently being thrown has already been answered.
   *
   * One punch, one contact. Without this a 70ms active window at 60fps lands
   * three times, and an overhand kills from full health.
   */
  spent: boolean
}

/**
 * `lobby` comes first, and it is the only phase with no clock.
 *
 * A fight used to begin the instant a second client appeared, which is wrong in
 * two ways at once: nobody had chosen a fighter, and nobody had said they were
 * looking at the screen. Both matter more here than in a level you wander into -
 * a boxing match is decided in its first ten seconds, and being three seconds
 * late to your own is being knocked down.
 *
 * So the walkout no longer starts on arrival; it starts on consent. See
 * `bothReady`.
 */
export type Phase = 'lobby' | 'walkout' | 'fighting' | 'between' | 'over'

export interface RoundCard {
  round: number
  red: number
  blue: number
}

export interface Verdict {
  winner: Corner | null
  /** `ko` fought to a finish, `tko` is the three-knockdown rule, `decision` is the cards. */
  how: 'ko' | 'tko' | 'decision' | 'draw'
  cards: RoundCard[]
}

export interface Fight {
  /**
   * How long each round of *this* fight is.
   *
   * On the fight rather than read from `ROUND_SECONDS`, because a host may set
   * a time limit for the match - see `roundsOf`. Both clients compute it from
   * the same number before anybody joins, so it never has to be agreed on the
   * wire; the owner's `MATCH` carries the clock, which is the thing that can
   * actually drift.
   */
  roundSeconds: number
  phase: Phase
  round: number
  /** Seconds left in whatever `phase` is. Counts down. */
  clock: number
  red: Fighter
  blue: Fighter
  cards: RoundCard[]
  verdict: Verdict | null
}

// ---------------------------------------------------------------------------
// What a player is asking for
// ---------------------------------------------------------------------------

/**
 * One frame of intent, already turned into the game's vocabulary.
 *
 * Not keys. The renderer owns the keyboard, the pad and the thumb stick, and
 * this package must never learn which one is attached - the same reason
 * `@kxb/xp` takes an `XpHost` rather than reading `window`.
 *
 * `walk` and `guard` are *held*; the rest are *edges* - true on the frame the
 * key went down and never again until it is released. The distinction is not
 * cosmetic: a held punch that re-fired every frame would be a machine gun, and
 * a walk that only moved on the press would be unusable.
 */
export interface Intent {
  /**
   * Which way *on screen*: -1 left, +1 right, 0 stand. Held.
   *
   * ---------------------------------------------------------------------------
   * Screen-relative, and it used to be opponent-relative
   * ---------------------------------------------------------------------------
   * `+1 towards the opponent` reads well in a rules file and is wrong at a
   * keyboard. The two fighters face each other, so "towards" points right for
   * one of them and left for the other - which meant the blue corner pressed
   * `D` and walked *left*. Reported as simply confusing, which is generous.
   *
   * A player's hands know left and right; only the game knows which corner they
   * are in. So the intent is what they pressed, and `advance` turns it into
   * approach or retreat with the facing it already has.
   */
  walk: -1 | 0 | 1
  /** A burst, same screen convention. Edge. */
  dash: -1 | 0 | 1
  /** Edge. */
  punch: PunchName | null
  /** Held. */
  guard: boolean
  /** Edge. */
  parry: boolean
  /** Edge. */
  slip: boolean
}

export const NO_INTENT: Intent = {
  walk: 0, dash: 0, punch: null, guard: false, parry: false, slip: false,
}

// ---------------------------------------------------------------------------
// What happened, for whoever is drawing or sending it
// ---------------------------------------------------------------------------

/**
 * Everything the step decided, as a list.
 *
 * Returned rather than written into the state for the reason `stepBodies`
 * returns `Contact[]`: three different consumers want these and none of them
 * wants the others' copy. The renderer plays a sound and shakes the camera, the
 * net layer puts them on the wire, and the arbiter is asked about two of them.
 * A flag on the fight would have to be cleared by somebody, and whoever cleared
 * it first would break the other two.
 */
export type FightEvent =
  | { type: 'threw'; by: Corner; move: MoveName; at: number }
  | { type: 'contact'; by: Corner; on: Corner; move: MoveName; contact: Contact }
  | { type: 'down'; who: Corner; count: number }
  | { type: 'rose'; who: Corner }
  /**
   * A round has begun.
   *
   * The mirror of `bell`, which announces one ending. It exists because a
   * *player* needs it - the phase simply changing is enough for the simulation
   * and is invisible to somebody watching their own fighter - and it is an
   * event rather than something the renderer works out by watching the phase,
   * because a renderer that derives state by comparing it to its own last
   * render is a renderer that sets state inside an effect.
   */
  | { type: 'started'; round: number }
  | { type: 'bell'; round: number; card: RoundCard }
  | { type: 'over'; verdict: Verdict }

export interface FightInput {
  fight: Fight
  intents: Record<Corner, Intent>
  /** Seconds since the last step. */
  dt: number
  /** The host's clock, in seconds. See `XpHost.now`. */
  now: number
  /**
   * Corners this client may decide about. See the file header - this is the
   * netcode.
   *
   * A corner not in here still *moves*: its current move plays out, its travel
   * is integrated, its animation runs. What it does not do is take damage or
   * start anything new, because both of those are somebody else's to author.
   */
  resolves: readonly Corner[]
}

// ---------------------------------------------------------------------------
// Setting one up
// ---------------------------------------------------------------------------

export function fighter(
  corner: Corner,
  id: string,
  name: string,
  /**
   * Their fighter, defaulted per corner.
   *
   * A default rather than nothing, so a player who never opens the picker still
   * gets a body - and one that differs from the other corner's, which is what
   * makes two strangers in a ring tell each other apart.
   */
  character: string = corner === 'red' ? 'boxer' : 'hitman',
): Fighter {
  return {
    id,
    corner,
    name,
    character,
    ready: false,
    // A metre and a half apart: outside every punch in the table, so the first
    // exchange has to be walked into rather than opened with.
    x: corner === 'red' ? -1.5 : 1.5,
    move: 'idle',
    since: 0,
    health: MAX_HEALTH,
    stamina: MAX_STAMINA,
    downsThisRound: 0,
    struck: 0,
    downs: 0,
    dealt: 0,
    spent: false,
  }
}

export function newFight(
  red: Fighter,
  blue: Fighter,
  /** A whole match's fighting time in seconds, as a host counts it. */
  matchSeconds?: number | null,
): Fight {
  return {
    roundSeconds: roundsOf(matchSeconds),
    // Nobody has said they are ready, so nothing is counting down yet.
    phase: 'lobby',
    round: 1,
    clock: 0,
    red,
    blue,
    cards: [],
    verdict: null,
  }
}

// ---------------------------------------------------------------------------
// Reading a fight
// ---------------------------------------------------------------------------

export const gapOf = (fight: Fight): number => Math.abs(fight.red.x - fight.blue.x)

/** Which way a fighter is looking. Derived, never stored - they cannot pass each other. */
export const facingOf = (fight: Fight, corner: Corner): 1 | -1 =>
  fight[corner].x <= fight[opposite(corner)].x ? 1 : -1

/** Both corners have said they are looking at the screen. */
export const bothReady = (fight: Fight): boolean => fight.red.ready && fight.blue.ready

export const cornerOf = (fight: Fight, id: string): Corner | null =>
  fight.red.id === id ? 'red' : fight.blue.id === id ? 'blue' : null

/** Seconds this fighter has been doing what it is doing. */
export const elapsedOf = (fighter: Fighter, now: number): number => now - fighter.since

/** Whether a fighter can start something new. */
export function free(fighter: Fighter, now: number): boolean {
  const move = MOVES[fighter.move]
  if (!move.committed) return true
  return elapsedOf(fighter, now) >= durationOf(move)
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/**
 * Advance a fight by `dt`.
 *
 * Mutates `input.fight` and returns what happened, which is the shape
 * `stepBodies` in `@kxb/xp/engine` settled on: a game loop that had to rebuild
 * the world every frame to find out what changed would allocate a match's worth
 * of garbage a second, and the events are wanted separately anyway.
 */
export function stepFight(input: FightInput): FightEvent[] {
  const { fight, intents, dt, now, resolves } = input
  const events: FightEvent[] = []

  /**
   * It is over, and it can be started again.
   *
   * The same consent the lobby takes, reused: `say(true)` from both corners is
   * what began the first fight and is what begins the next one. A rematch is
   * not a different kind of agreement, so it does not get a different
   * mechanism - and the button in the HUD is the same button.
   */
  if (fight.phase === 'over') {
    if (bothReady(fight)) restart(fight, now)
    return events
  }

  /**
   * The lobby, where nothing happens on purpose.
   *
   * No clock, no stamina, no contact. It ends when both fighters have said so
   * and not on a timer, because a timer here would be a countdown to a fight
   * one of them has not agreed to - which is the thing it exists to prevent.
   *
   * Stepped by both clients, and they agree because they are reading the same
   * two flags: mine is mine, theirs arrived on their stance. The owner's `MATCH`
   * settles any disagreement within a quarter of a second.
   */
  if (fight.phase === 'lobby') {
    if (bothReady(fight)) {
      fight.phase = 'walkout'
      fight.clock = WALKOUT_SECONDS
      for (const corner of CORNERS) {
        fight[corner].move = 'idle'
        fight[corner].since = now
      }
    }
    return events
  }

  fight.clock -= dt

  // Between rounds and during the walkout nobody can be hit, but the clock
  // still runs and stamina still comes back - which is what the rest is *for*.
  if (fight.phase === 'walkout' || fight.phase === 'between') {
    for (const corner of CORNERS) regain(fight[corner], REGEN.free, dt)
    if (fight.clock <= 0) {
      fight.phase = 'fighting'
      fight.clock = fight.roundSeconds
      for (const corner of CORNERS) {
        const boxer = fight[corner]
        boxer.move = 'idle'
        boxer.since = now
        boxer.downsThisRound = 0
        boxer.dealt = 0
        boxer.spent = false
      }
      events.push({ type: 'started', round: fight.round })
    }
    return events
  }

  /**
   * 1. Punches that were live during this frame, answered before anything is
   *    allowed to clear them.
   *
   * ---------------------------------------------------------------------------
   * Contact comes first, and it used to come third
   * ---------------------------------------------------------------------------
   * `advance` ends a move whose time is up and puts the body back to `idle`. On
   * a client running at sixty frames a second that is harmless: a jab lasts 250ms
   * and is seen live for fifteen frames before anything clears it.
   *
   * On a client running at four, one frame *is* 250ms - so the punch was begun
   * and finished inside a single step, `advance` set it to `idle`, and `strike`
   * then looked at an idle fighter and found nothing to resolve. Every punch on
   * a slow machine silently did not exist, which from the other end looks
   * exactly like collision being broken.
   *
   * Resolving first means a move is always answered for the frame it was live
   * in, whatever that frame's length. The cost is that a punch begun *this*
   * frame is answered on the next one, which is no cost at all: every punch in
   * the table has at least 70ms of startup before it can hurt anybody.
   */
  for (const corner of CORNERS) {
    const target = opposite(corner)
    // The defender decides. See the file header - this one `includes` is the
    // whole authority model.
    if (!resolves.includes(target)) continue
    strike(fight, corner, now, dt, events)
  }

  // 2. Finish or begin moves, and integrate travel.
  for (const corner of CORNERS) {
    advance(fight, corner, intents[corner], dt, now, resolves.includes(corner), events)
  }

  // 3. Keep them inside the ring and out of each other.
  separate(fight)

  /**
   * 4. Knockdowns, and getting up - for *both* corners, unlike `strike` above.
   *
   * The one place the authority model is deliberately not applied, and it is
   * worth saying why rather than leaving it looking like an oversight.
   *
   * It converges. A defender clamps their own bar at zero and sends it, so the
   * attacker's copy reads zero on the same frame and reaches the same
   * knockdown; they rise on `MOVES.down.recovery` from a `since` both sides
   * hold. Running it on one side only would mean the *owner* never sees the
   * other corner's knockdowns - and `score` counts those, so a ten-point-must
   * card would be scored by a client that thinks nobody went down. Putting
   * `downsThisRound` on the wire is the alternative and buys nothing this does
   * not already give.
   *
   * The one thing it cannot converge on is which *punch* did it, because
   * `struck` is written by the client that resolved the blow and no other. So a
   * knockout - the only outcome here that reads the punch - is the defender's
   * alone, and `net/session.ts` sends it rather than hoping both sides guess
   * the same. That message exists because for a while nobody sent it.
   */
  for (const corner of CORNERS) count(fight, corner, now, events)

  // 5. The bell.
  if (fight.clock <= 0 && fight.phase === 'fighting') bell(fight, now, events)

  return events
}

function regain(boxer: Fighter, rate: number, dt: number): void {
  boxer.stamina = Math.min(MAX_STAMINA, boxer.stamina + rate * dt)
}

/** Start a move, if it is affordable and the body is free to. */
function begin(boxer: Fighter, name: MoveName, now: number, events: FightEvent[]): boolean {
  const move = MOVES[name]
  const cost = move.cost ?? 0
  if (boxer.stamina < cost) return false

  boxer.move = name
  boxer.since = now
  boxer.stamina -= cost
  boxer.spent = false
  if (isPunch(name) || move.kind === 'evade') {
    events.push({ type: 'threw', by: boxer.corner, move: name, at: now })
  }
  return true
}

/**
 * One fighter's move: finish what it is doing, start what it was asked for,
 * and carry the body wherever the move says.
 *
 * `authored` false means this is somebody else's fighter, arriving over a wire.
 * It still plays out the move it is in - that is what makes a remote fighter
 * look alive between packets, eight times a second - but it starts nothing new,
 * because a client that invented moves for its opponent would be a client
 * fighting a different fight.
 */
function advance(
  fight: Fight,
  corner: Corner,
  intent: Intent,
  dt: number,
  now: number,
  authored: boolean,
  events: FightEvent[],
): void {
  const boxer = fight[corner]
  if (boxer.move === 'out' || boxer.move === 'won') return

  const current = MOVES[boxer.move]
  const elapsed = elapsedOf(boxer, now)
  const over = elapsed >= durationOf(current)

  // `down` is the count, and it is the one move whose end is a decision rather
  // than a timer running out - see `count`.
  if (boxer.move === 'down') return

  if (current.committed && !over) {
    travel(fight, corner, current.travel ?? 0, dt, elapsed)
    regain(boxer, REGEN.committed, dt)
    return
  }

  if (over && current.committed) {
    boxer.move = 'idle'
    boxer.since = now
  }

  if (!authored) {
    // Their move finished on our copy before their next packet arrived. Stand
    // them up rather than freezing them mid-punch; the next packet corrects it.
    regain(boxer, REGEN.free, dt)
    return
  }

  // Edges first, cheapest last. A player who pressed punch and guard on the
  // same frame gets the punch: guard is held and will still be held next frame,
  // so preferring the edge loses nothing and dropping it would lose the input.
  if (intent.punch && MOVES[intent.punch]) {
    if (begin(boxer, intent.punch, now, events)) return
  }
  if (intent.slip && begin(boxer, 'slip', now, events)) return
  if (intent.parry && begin(boxer, 'parry', now, events)) return
  /**
   * Left and right turned into approach and retreat.
   *
   * `facingOf` is +1 for whoever is on the left of the ring, so multiplying by
   * it maps a screen direction onto the move that goes that way for *this*
   * corner - and `travel` multiplies by the same facing again to move the body.
   */
  const facing = facingOf(fight, corner)

  if (intent.dash !== 0) {
    if (begin(boxer, intent.dash * facing > 0 ? 'dashIn' : 'dashOut', now, events)) return
  }

  if (intent.guard) {
    if (boxer.move !== 'block') {
      boxer.move = 'block'
      boxer.since = now
    }
    regain(boxer, REGEN.guarding, dt)
    return
  }

  const towards = intent.walk * facing
  const walking: MoveName = towards > 0 ? 'walkIn' : towards < 0 ? 'walkOut' : 'idle'
  if (boxer.move !== walking) {
    boxer.move = walking
    boxer.since = now
  }
  travel(fight, corner, MOVES[walking].travel ?? 0, dt, elapsed)
  regain(boxer, REGEN.free, dt)
}

/**
 * Move a body along the lane.
 *
 * `speed` is signed towards the opponent, so the sign of `facingOf` is the only
 * thing that turns "forwards" into "left" or "right". A dash spends its whole
 * travel during its active window rather than across its recovery, which is
 * what makes the recovery a place you are *stood*.
 */
function travel(fight: Fight, corner: Corner, speed: number, dt: number, elapsed: number): void {
  if (speed === 0) return
  const boxer = fight[corner]
  const move = MOVES[boxer.move]
  if (move.committed && phaseOf(move, elapsed) !== 'active') return
  boxer.x += speed * facingOf(fight, corner) * dt
}

/**
 * The ropes, and the fact that two people cannot stand in the same place.
 *
 * ---------------------------------------------------------------------------
 * Both rules, in an order that does not undo one of them
 * ---------------------------------------------------------------------------
 * The first version separated the pair and *then* clamped them to the ring, and
 * that order quietly loses a chase: when one fighter is pinned against the
 * ropes, the shove moves them past the ropes, the clamp puts them back, and the
 * one doing the chasing is left standing inside them.
 *
 * So the ropes come first, and the shove afterwards is *given to whoever has
 * room*. Half each when both can move, all of it to one when the other has
 * nowhere to go. That is also what it looks like: you cannot push somebody
 * through the ropes, so you stop.
 */
function separate(fight: Fight): void {
  const inside = (x: number) => Math.max(-RING_HALF, Math.min(RING_HALF, x))

  // The ropes first, so the shove below is computed from where they can be.
  let red = inside(fight.red.x)
  let blue = inside(fight.blue.x)

  const overlap = CLOSEST - Math.abs(blue - red)
  if (overlap > 0) {
    // Which way "apart" is. Taken before anybody moves, because the first shove
    // can take the pair through each other and flip it.
    const sign = blue - red >= 0 ? 1 : -1

    red = inside(red - (overlap / 2) * sign)
    blue = inside(blue + (overlap / 2) * sign)

    /**
     * Whatever the ropes swallowed, taken from the other one.
     *
     * Only ever non-zero when somebody is pinned. Blue is asked first and red
     * takes the remainder, and it does not matter which order that is in - the
     * pinned fighter simply cannot move and contributes nothing either way.
     */
    const missing = CLOSEST - Math.abs(blue - red)
    if (missing > 0) {
      const after = blue - red >= 0 ? 1 : -1
      const shoved = inside(blue + missing * after)
      const gained = Math.abs(shoved - blue)
      blue = shoved
      if (gained < missing - 1e-9) red = inside(red - (missing - gained) * after)
    }
  }

  fight.red.x = red
  fight.blue.x = blue
}

/**
 * Resolve `corner`'s punch against the other fighter, if it is live this frame.
 *
 * Called only when this client is authoritative for the *target*, which is why
 * it reads the attacker's move off state that arrived over a wire and trusts
 * it. What it does not trust is the outcome: `resolve` is handed our own
 * position and our own guard, and its answer is ours to broadcast.
 */
function strike(
  fight: Fight,
  corner: Corner,
  now: number,
  dt: number,
  events: FightEvent[],
): void {
  const boxer = fight[corner]
  if (!isPunch(boxer.move) || boxer.spent) return

  const move = MOVES[boxer.move]

  /**
   * Did the active window fall *inside this frame*, rather than at the instant
   * we happened to sample it.
   *
   * ---------------------------------------------------------------------------
   * The bug this replaces, which only ever appeared on a slow client
   * ---------------------------------------------------------------------------
   * This used to be `phaseOf(move, elapsed) === 'active'` - a point test, asked
   * once a frame. A jab is active for fifty milliseconds, which is three frames
   * at 60Hz, one frame at 20Hz, and *none at all* on a client that hitched. Miss
   * it and the punch is not blocked, slipped or missed: it never happens.
   *
   * Which is bad on its own and worse because of who decides. The defender
   * resolves - so it is the *victim's* frame rate that decides whether a punch
   * exists, and the attacker sees a clean hit go through somebody and do
   * nothing. Every report of "you can't hit the enemy" has looked like this.
   *
   * Testing the interval instead makes contact frame-rate independent: a client
   * running at 8fps resolves exactly the same punches as one at 144, just later.
   * That is the property a fighting game cannot be fair without.
   */
  const ended = elapsedOf(boxer, now)
  const began = ended - Math.max(0, dt)
  const liveFrom = move.startup
  const liveTo = move.startup + move.active
  if (ended < liveFrom || began > liveTo) return

  const target = fight[opposite(corner)]
  if (target.move === 'down' || target.move === 'out') return

  const contact = resolve(move, gapOf(fight), {
    move: target.move,
    elapsed: elapsedOf(target, now),
    stamina: target.stamina,
  })

  if (contact.kind === 'miss') return

  // One punch, one answer - whatever the answer was. Marking it spent on a
  // block as well as a hit is what stops a blocked punch draining a guard once
  // per frame for the whole active window.
  boxer.spent = true
  events.push({ type: 'contact', by: corner, on: target.corner, move: boxer.move, contact })

  if (contact.kind === 'parried') {
    boxer.move = 'stunned'
    boxer.since = now
    return
  }

  if (contact.kind === 'slipped') return

  if (contact.kind === 'blocked') {
    target.stamina = Math.max(0, target.stamina - contact.stamina)
  }

  const cost = healthCost(contact)
  // Deliberately *not* clamped at zero. How far past zero the punch took them
  // is the difference between a knockdown and a knockout, and clamping here
  // throws that away one line before `count` needs it. `count` clamps.
  target.health -= cost
  target.struck = cost
  boxer.dealt += cost

  if (staggers(contact) && target.health > 0) {
    target.move = 'hurt'
    target.since = now
    target.spent = true
  }
}

/** Going down, being counted over, and getting up - or not. */
function count(fight: Fight, corner: Corner, now: number, events: FightEvent[]): void {
  const boxer = fight[corner]

  /**
   * Taken and cleared on the same line, before any of the returns below.
   *
   * `struck` is a one-frame value and `count` leaves by four different doors;
   * clearing it at the end of one of them would leave the blow that floored
   * somebody sitting on them while they were counted over, and the punch that
   * knocked them down would knock them out again when they stood up.
   */
  const blow = boxer.struck
  boxer.struck = 0

  if (boxer.health <= 0 && boxer.move !== 'down' && boxer.move !== 'out') {
    boxer.health = 0
    boxer.downs += 1
    boxer.downsThisRound += 1
    boxer.move = 'down'
    boxer.since = now
    events.push({ type: 'down', who: corner, count: boxer.downsThisRound })

    // Two ways a fight ends on the canvas, and they are different events.
    //
    // A *knockout* is one punch: the biggest in the table, thrown into somebody
    // who was throwing one, landing hard enough to end it with no count to
    // beat. Measured on the blow rather than on how far past zero it drove the
    // bar - see `KNOCKOUT_PUNCH`, which is where reading the leftover instead
    // made this the ordinary ending rather than the rare one.
    //
    // A *technical* knockout is three trips down in one round - the real rule,
    // and the one that stops a fighter who gets up at `RISEN_HEALTH` being
    // knocked down all night and still winning on the cards.
    if (blow >= KNOCKOUT_PUNCH) {
      stop(fight, opposite(corner), 'ko', now, events)
    } else if (boxer.downsThisRound >= THREE_KNOCKDOWN) {
      stop(fight, opposite(corner), 'tko', now, events)
    }
    return
  }

  if (boxer.move === 'down' && elapsedOf(boxer, now) >= MOVES.down.recovery) {
    if (fight.phase === 'over') return
    boxer.move = 'idle'
    boxer.since = now
    boxer.health = RISEN_HEALTH
    // Up, but not fresh. Getting a full bar back with the health would make a
    // knockdown a free reset rather than the worst thing that can happen.
    boxer.stamina = Math.max(boxer.stamina, MAX_STAMINA * 0.5)

    /**
     * Both fighters back to their corners, not just the one who fell.
     *
     * A referee separates them and waves the standing fighter to a neutral
     * corner, and a game that skipped it would resume with the winner of the
     * exchange already stood over somebody who has just got up on forty health.
     * The knockdown would then decide the next one too, which is a game that
     * ends the moment it tips.
     */
    for (const side of CORNERS) fight[side].x = side === 'red' ? -1.5 : 1.5
    events.push({ type: 'rose', who: corner })
  }
}

/** Score the round, and either ring for the next one or read the cards. */
function bell(fight: Fight, now: number, events: FightEvent[]): void {
  const card = score(fight)
  fight.cards.push(card)
  events.push({ type: 'bell', round: fight.round, card })

  if (fight.round >= ROUNDS) {
    const totals = fight.cards.reduce(
      (sum, one) => ({ red: sum.red + one.red, blue: sum.blue + one.blue }),
      { red: 0, blue: 0 },
    )
    const winner =
      totals.red === totals.blue ? null : totals.red > totals.blue ? 'red' : 'blue'
    finish(fight, { winner, how: winner ? 'decision' : 'draw', cards: fight.cards }, now, events)
    return
  }

  fight.round += 1
  fight.phase = 'between'
  fight.clock = REST_SECONDS
  for (const corner of CORNERS) {
    const boxer = fight[corner]
    boxer.move = 'idle'
    boxer.since = now
    boxer.health = Math.min(MAX_HEALTH, boxer.health + ROUND_RECOVERY)
    boxer.stamina = MAX_STAMINA
    boxer.x = corner === 'red' ? -1.5 : 1.5
  }
}

/**
 * Ten-point must, which is the real thing and is worth having rather than
 * "whoever dealt more damage wins".
 *
 * The winner of a round gets 10 and the loser 9, or 8 if they were put down.
 * That is what makes a knockdown worth more than any amount of out-boxing, and
 * it is why a fighter can win two rounds on damage and still lose the match.
 */
export function score(fight: Fight): RoundCard {
  const { red, blue } = fight
  const card: RoundCard = { round: fight.round, red: 10, blue: 10 }

  // Who won the round, before anybody is given a number.
  //
  // This order was the other way round in the first draft - damage first, then
  // knockdowns subtracted - and it produced a round where a fighter who was put
  // on the canvas still took it 9-8 because they had out-landed the other one
  // for two minutes. That is not a scoring quirk, it is the wrong sport: a
  // knockdown decides a round, and out-landing somebody who then dropped you
  // decides nothing.
  const winner: Corner | null =
    red.downsThisRound !== blue.downsThisRound
      ? red.downsThisRound < blue.downsThisRound
        ? 'red'
        : 'blue'
      : red.dealt !== blue.dealt
        ? red.dealt > blue.dealt
          ? 'red'
          : 'blue'
        : null

  // Ten-point must: the winner gets ten, and the loser gets nine less one for
  // every time they were put down. An even round is 10-10, which happens when
  // neither of them landed anything - the first ten seconds of a round that
  // ends on the bell.
  if (winner) {
    const loser = opposite(winner)
    card[loser] = 9 - fight[loser].downsThisRound
  }

  return card
}

/**
 * A finish before the cards, declared from outside the step.
 *
 * The netcode's door onto `stop`. A knockout is the *defender's* to call - see
 * the file header - and when the defender is not the client that owns the match
 * clock, that call has to travel: they send `STOPPED`, the owner arrives here,
 * and the resulting `MATCH` is what tells everybody, including the sender, that
 * it is official.
 *
 * Refuses a fight that is already finished, because both halves of that trip
 * can happen: the owner may have reached the same conclusion from its own copy
 * of the health bars a frame earlier, and a second `finish` would push a second
 * `over` event - two result cards, two sounds, and a `cards` array with the
 * final round scored twice in it.
 */
export function stopFight(
  fight: Fight,
  winner: Corner,
  how: 'ko' | 'tko',
  now: number,
): FightEvent[] {
  if (fight.phase === 'over') return []
  const events: FightEvent[] = []
  stop(fight, winner, how, now, events)
  return events
}

/** A finish before the cards: somebody could not continue. */
function stop(
  fight: Fight,
  winner: Corner,
  how: 'ko' | 'tko',
  now: number,
  events: FightEvent[],
): void {
  const cards = [...fight.cards, score(fight)]
  finish(fight, { winner, how, cards }, now, events)
}

/**
 * Everything back to the start, keeping who is in which corner.
 *
 * Names and characters survive; health, stamina, the cards, the knockdowns and
 * the verdict do not. `ready` goes back to false on both sides so the *next*
 * rematch has to be agreed too - otherwise one player holding the button would
 * restart every fight the moment it ended.
 */
export function restart(fight: Fight, now: number): void {
  fight.phase = 'walkout'
  fight.clock = WALKOUT_SECONDS
  fight.round = 1
  fight.cards = []
  fight.verdict = null

  for (const corner of CORNERS) {
    const boxer = fight[corner]
    boxer.x = corner === 'red' ? -1.5 : 1.5
    boxer.move = 'idle'
    boxer.since = now
    boxer.health = MAX_HEALTH
    boxer.stamina = MAX_STAMINA
    boxer.downs = 0
    boxer.downsThisRound = 0
    boxer.dealt = 0
    boxer.spent = false
    boxer.ready = false
  }
}

function finish(fight: Fight, verdict: Verdict, now: number, events: FightEvent[]): void {
  fight.phase = 'over'
  fight.verdict = verdict
  fight.clock = 0
  /**
   * Nobody is ready for the next one yet, whatever they were.
   *
   * Cleared here rather than in `restart`, because `over` is where the button
   * is offered: leaving a stale `true` from the fight that just ended would
   * restart it under whoever was slowest to look up.
   */
  for (const corner of CORNERS) fight[corner].ready = false

  if (verdict.winner) {
    fight[verdict.winner].move = 'won'
    fight[verdict.winner].since = now
    const loser = fight[opposite(verdict.winner)]
    loser.move = 'out'
    loser.since = now
  }
  events.push({ type: 'over', verdict })
}
