/**
 * `@kxb/boxing/wire` - what goes over `XpSocket`, and what to believe.
 *
 * ---------------------------------------------------------------------------
 * Three messages, on three different schedules
 * ---------------------------------------------------------------------------
 * The temptation with a fighting game is one packet type at a fixed rate. That
 * is wrong here, and the reason is the frame data: a jab is *seventy
 * milliseconds* of startup. At `XpNetwork.sendHz` of 8 - one packet every 125ms
 * - a punch announced on the clock arrives after it has already finished. The
 * whole game is inside one tick of the transport.
 *
 * So what is on a clock is only the thing that tolerates being late, and the
 * two things that do not are sent the instant they happen:
 *
 * | | when | why |
 * |---|---|---|
 * | `STANCE` | 8Hz | Where I am. Stale by a frame is a fighter a few centimetres out, which interpolation hides. |
 * | `THREW`  | at once | I have started a punch. 125ms late is a punch that cannot be reacted to. |
 * | `LANDED` | at once | It hit me, and here is what it did. The defender's verdict - see `../rules/fight.ts`. |
 * | `MATCH`  | 4Hz + on change | The round, the clock and the cards. One client owns these.
 * | `STOPPED`| at once | I have been knocked out. Only the owner acts on it. |
 *
 * ---------------------------------------------------------------------------
 * `MATCH` is the middle tier, and it is the reason there are three
 * ---------------------------------------------------------------------------
 * `STANCE` and `LANDED` are `self` - facts about the sender's own body.
 * `MATCH` is `elected`, the tier `@kxb/xp`'s `net/owning.ts` describes: exactly
 * one client integrates it and everybody else follows.
 *
 * `STOPPED` is what happens where the two tiers meet, and it exists because
 * they did not meet at all. A knockout is `self` - the defender is the one who
 * decides they could not continue - but the *match ending* is `elected`, and
 * only the owner broadcasts that. So a knockout suffered by the blue corner
 * ended blue's fight, never reached red, and was then undone by red's next
 * `MATCH` still saying `fighting` - which blue applies, because blue is not the
 * owner. The finish simply vanished, and the only clue was that it always
 * worked when red was the one who went down.
 *
 * So the defender declares and the owner ratifies. Nothing here decides
 * anything on the strength of this message except the client that is allowed
 * to, and the `MATCH` it then sends is what makes the result official for
 * everybody, the sender included.
 *
 * `MATCH` has to be owned. A round clock is not a fact about anybody's body,
 * and two clients counting down their own copies of it drift apart - each host's
 * `now()` starts when that tab loaded, so within a minute one of them rings the
 * bell while the other is still fighting. Ownership goes to the red corner,
 * which is the lowest player id, which is the election with no messages in it
 * that `owning.ts` argues for: every client already knows the roster, so every
 * client reaches the same answer without a packet being sent.
 *
 * ---------------------------------------------------------------------------
 * The whole picture, not a delta
 * ---------------------------------------------------------------------------
 * `STANCE` carries the sender's entire fighter every time, which is what
 * `@kxb/xp`'s own `net/sharing.ts` argues for and for the same three reasons: a
 * lost packet on a transport that promises nothing corrects itself on the next
 * one, a player who joins late is caught up by the next one rather than by a
 * second mechanism, and two packets that cross are still both right because the
 * later one simply wins.
 *
 * ---------------------------------------------------------------------------
 * Everything here arrives from somebody else's machine
 * ---------------------------------------------------------------------------
 * Which is why every message has a reader below rather than a cast. `XpSocket`
 * hands over `unknown` and it means it: on the local host that `unknown` came
 * from a `BroadcastChannel`, which anything on the origin can post to. A `as
 * Stance` would turn a malformed packet into a `NaN` position, and a `NaN`
 * position spreads through the physics to every number in the fight in about
 * two frames.
 */

import type { Contact } from '../rules/contact'
import { MOVES, type MoveName } from '../rules/moves'
import type { Corner, Phase, RoundCard, Verdict } from '../rules/fight'

export const STANCE = 'boxing:stance'
export const THREW = 'boxing:threw'
export const LANDED = 'boxing:landed'
export const MATCH = 'boxing:match'
export const STOPPED = 'boxing:stopped'

/** Where I am and what my body is doing. On the clock. */
export interface Stance {
  corner: Corner
  x: number
  move: MoveName
  /**
   * Seconds *ago* that this move began, not the sender's clock reading.
   *
   * The difference matters more than anything else in this file. Two hosts
   * start their clocks when their own tab loads, so `XpHost.now()` on my
   * machine and yours are unrelated numbers - sending `since` directly would
   * put a punch minutes into the future or the past. An age is a duration, and
   * durations survive the trip.
   */
  age: number
  health: number
  stamina: number
  /**
   * Whether this fighter has said they are ready, and which body they were
   * given.
   *
   * On the stance rather than in a message of their own, which is the "whole
   * picture" rule earning its keep: both change rarely, both must survive a lost
   * packet, and a joiner who arrives mid-lobby is caught up by the next stance
   * rather than by a second mechanism. `./session` sends one immediately when
   * either changes, so the 125ms clock is a floor on staleness and not on
   * response.
   */
  ready: boolean
  character: string
}

/** I have started something. Sent the moment it begins. */
export interface Threw {
  corner: Corner
  move: MoveName
}

/** Your punch reached me, and this is what it did. Sent by whoever was hit. */
export interface Landed {
  /** The corner that was *hit* - the sender. */
  corner: Corner
  move: MoveName
  contact: Contact
  /** Where the hit left them, so the attacker's bar agrees with the defender's. */
  health: number
  stamina: number
}

/**
 * The state of the match, from whoever owns it.
 *
 * Carries no fighters. Where somebody is stood is `self`, and a `MATCH` that
 * also moved bodies would be the owning client overruling the other one about
 * its own position - which is the exact collision the tiers exist to prevent.
 */
export interface Match {
  phase: Phase
  round: number
  clock: number
  cards: RoundCard[]
  verdict: Verdict | null
}

// ---------------------------------------------------------------------------
// Reading what arrived
// ---------------------------------------------------------------------------

const isCorner = (value: unknown): value is Corner => value === 'red' || value === 'blue'

const isMove = (value: unknown): value is MoveName =>
  typeof value === 'string' && Object.hasOwn(MOVES, value)

/**
 * A number that is really a number.
 *
 * `Number.isFinite` and not `typeof === 'number'`, because `NaN` and `Infinity`
 * are both numbers and both fatal here: a `NaN` x propagates into the gap, into
 * every reach comparison, and the fight silently stops being able to land a
 * punch. That failure has no error message anywhere in it.
 */
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const bounded = (value: unknown, low: number, high: number): value is number =>
  isNumber(value) && value >= low && value <= high

export function readStance(payload: unknown): Stance | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>
  if (!isCorner(wire.corner) || !isMove(wire.move)) return null
  // Positions are clamped to a generous ring rather than the real one: a sender
  // half a metre outside is a sender we disagree with about separation, not a
  // liar, and snapping them to the ropes would look worse than drawing them
  // where they say they are.
  if (!bounded(wire.x, -20, 20)) return null
  if (!bounded(wire.age, 0, 600)) return null
  if (!bounded(wire.health, 0, 1000)) return null
  if (!bounded(wire.stamina, 0, 1000)) return null
  // A character id becomes a texture URL, so the same narrow alphabet the
  // engine's `frame.game` uses - see packages/xp/src/document/frame.ts.
  if (typeof wire.character !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(wire.character)) {
    return null
  }

  return {
    corner: wire.corner,
    x: wire.x,
    move: wire.move,
    age: wire.age,
    health: wire.health,
    stamina: wire.stamina,
    ready: wire.ready === true,
    character: wire.character,
  }
}

export function readThrew(payload: unknown): Threw | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>
  if (!isCorner(wire.corner) || !isMove(wire.move)) return null
  return { corner: wire.corner, move: wire.move }
}

export function readLanded(payload: unknown): Landed | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>
  if (!isCorner(wire.corner) || !isMove(wire.move)) return null
  if (!bounded(wire.health, 0, 1000)) return null
  if (!bounded(wire.stamina, 0, 1000)) return null

  const contact = readContact(wire.contact)
  if (!contact) return null

  return { corner: wire.corner, move: wire.move, contact, health: wire.health, stamina: wire.stamina }
}

function readContact(payload: unknown): Contact | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>

  switch (wire.kind) {
    case 'miss':
    case 'slipped':
    case 'parried':
      return { kind: wire.kind }
    case 'clean':
      return bounded(wire.damage, 0, 1000)
        ? { kind: 'clean', damage: wire.damage, counter: wire.counter === true }
        : null
    case 'broken':
      return bounded(wire.damage, 0, 1000) ? { kind: 'broken', damage: wire.damage } : null
    case 'blocked':
      return bounded(wire.damage, 0, 1000) && bounded(wire.stamina, 0, 1000)
        ? { kind: 'blocked', damage: wire.damage, stamina: wire.stamina }
        : null
    default:
      return null
  }
}

const PHASES: readonly Phase[] = ['walkout', 'fighting', 'between', 'over']

export function readMatch(payload: unknown): Match | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>
  if (!PHASES.includes(wire.phase as Phase)) return null
  if (!bounded(wire.round, 0, 99)) return null
  if (!bounded(wire.clock, -60, 3600)) return null
  if (!Array.isArray(wire.cards)) return null

  const cards: RoundCard[] = []
  for (const entry of wire.cards) {
    if (typeof entry !== 'object' || entry === null) return null
    const card = entry as Record<string, unknown>
    if (!bounded(card.round, 0, 99) || !bounded(card.red, 0, 10) || !bounded(card.blue, 0, 10)) {
      return null
    }
    cards.push({ round: card.round, red: card.red, blue: card.blue })
  }

  return {
    phase: wire.phase as Phase,
    round: wire.round,
    clock: wire.clock,
    cards,
    verdict: readVerdict(wire.verdict, cards),
  }
}

const HOWS = ['ko', 'tko', 'decision', 'draw'] as const

function readVerdict(payload: unknown, cards: RoundCard[]): Verdict | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>
  if (!HOWS.includes(wire.how as (typeof HOWS)[number])) return null
  const winner = wire.winner
  if (winner !== null && !isCorner(winner)) return null
  return { winner, how: wire.how as (typeof HOWS)[number], cards }
}

/**
 * I have been knocked out, and this is how.
 *
 * Sent by the fighter it happened to, immediately, and only when they are not
 * the owner - the owner needs no message to tell itself something. `corner` is
 * always the sender's own, and the reader cannot enforce that because a reader
 * has no idea who sent it; `session.ts` does, and refuses a packet claiming the
 * *other* corner went down for exactly the reason `takeStance` and `takeLanded`
 * refuse one about ours.
 */
export interface Stopped {
  /** The corner that could not continue. The sender's own. */
  corner: Corner
  how: 'ko' | 'tko'
}

export function readStopped(payload: unknown): Stopped | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wire = payload as Record<string, unknown>
  if (!isCorner(wire.corner)) return null
  if (wire.how !== 'ko' && wire.how !== 'tko') return null
  return { corner: wire.corner, how: wire.how }
}
