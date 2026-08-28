/**
 * `@kxb/xp/owning` - who integrates the things that move, and what they tell
 * the room about it.
 *
 * ---------------------------------------------------------------------------
 * The tier this is, and why it is not `./sharing`
 * ---------------------------------------------------------------------------
 * `docs/xp/creator.md` §9 fixes three tiers of authority, chosen per component
 * rather than argued about per feature:
 *
 *   `self`      you are authoritative over your own position and your own
 *               health. That is `./sharing`, and its header is worth reading:
 *               it needs **no election at all**, because the last client to
 *               touch a thing is the one describing it and two clients
 *               describing the same change describe the same change.
 *   `elected`   exactly one client owns the object and integrates it; everyone
 *               else follows. **This file.**
 *   `server`    the event log decides. The final score, a race time, who won.
 *
 * A body is squarely the middle one and could not be either of the others.
 * It is not `self`, because nobody owns a ball by touching it - two clients
 * both integrating a rolling ball do not describe the same change, they
 * describe two different balls that started in the same place. And it is not
 * `server`: the rule this codebase already follows is that **nothing changing
 * eight times a second is ever written to the event log.**
 *
 * So `./sharing` stays what it is - a picture, on change, from anybody - and
 * this is its opposite in all three: one sender, on a clock, and the sender is
 * chosen rather than "whoever did it".
 *
 * ---------------------------------------------------------------------------
 * An election with no messages in it - which is now only the floor
 * ---------------------------------------------------------------------------
 * Read this section for what it is: the rule the room falls back on when nothing
 * else is known - the first frame, and an owner who has left. **Ownership follows
 * the ball now**, and `Held` below has that argument and the protocol; what
 * follows here is still true of the floor and is the reason the floor is safe.
 *
 * The lowest id present owns everything, re-run whenever the roster changes.
 * That is the rule §9 names, and the reason it is worth having rather than a
 * negotiation is that **it costs nothing**: every client already knows who is
 * in the room, so every client reaches the same answer at the same moment
 * without a single packet being sent. There is no election *protocol* to lose a
 * message from, no term number, and no split brain that survives the next
 * roster change.
 *
 * What it does cost is a moment of nobody at a handover: the old owner leaves,
 * every remaining client notices at whatever rate presence notices, and until
 * they do, nothing authoritative is being sent. A ball keeps rolling on its own
 * through that - every client is still integrating - so the visible cost is
 * that the room drifts apart for as long as the gap lasts and is snapped back
 * together on the first packet from the new owner. That is the right failure:
 * play continues and then agrees, rather than stopping to hold an election.
 *
 * ---------------------------------------------------------------------------
 * The owner integrates; everybody else *interpolates*
 * ---------------------------------------------------------------------------
 * §9 says exactly that, and the first version of this file did something else:
 * every client kept simulating and the owner's packet *corrected* it. The
 * argument was that eight positions a second is a stuttering ball and dead
 * reckoning smooths it. The argument was right about the stutter and wrong
 * about everything else, and it was reported from a match within the day - the
 * ball *"jump like cells somewhere else"*.
 *
 * Here is the arithmetic that kills it. Two clients only agree while nothing
 * surprising happens; the moment one of them resolves a bounce a frame before
 * the other, their two balls are travelling in different directions. At twenty
 * cells a second, one eighth of a second of that is **two and a half cells** of
 * disagreement - which is past any sane snap threshold, so the correction stops
 * easing and teleports. Every wall, every player, every goal post is one of
 * these. The correction was not smoothing over the network, it was fighting a
 * second simulation.
 *
 * So the follower does not simulate an owned body at all. It keeps a short
 * buffer of what the owner said and draws the ball *between* two of those
 * samples, a fixed delay behind - which is precisely what `Crowd` already does
 * for everybody's avatar, at the same rate, over the same transport, and which
 * nobody has ever complained looks wrong. A quarter of a second late and
 * perfectly smooth beats live and teleporting.
 *
 * What it costs is that your own touch is not instant on your screen unless you
 * are the owner. That is the honest price of one authority, it is the price the
 * avatars already pay, and it is smaller than it sounds: the *ball* is late,
 * not your body.
 */

import type { Blueprint } from '../document/blueprints'
import { bodyOf, push, velocityOf } from '../world/bodies'
import type { EntityId, EntityWorld } from '../world/entities'
import { INTERPOLATION_DELAY } from './presence'

/**
 * Who owns the moving things, out of everybody in the room including yourself.
 *
 * Lowest id wins, compared as a string, because that is the one ordering every
 * client can agree on without asking anybody: presence ids are opaque strings
 * and their sort order is the only property of them that is the same
 * everywhere. Joining order would need a clock nobody shares.
 *
 * `null` for an empty room, which is a room this is never asked about.
 */
export function ownerOf(everybody: readonly string[]): string | null {
  let best: string | null = null
  for (const id of everybody) {
    if (id.length === 0) continue
    if (best === null || id < best) best = id
  }
  return best
}

/**
 * Am I the one integrating?
 *
 * **True when I am alone**, which is the case worth stating: `present` is
 * everybody else, so a room with nobody in it elects me, and a level played by
 * one person behaves exactly as it did before any of this existed. That is not
 * a special case in the code - it falls out of "lowest of the ids, and mine is
 * the only one" - and it is the reason this is safe to switch on everywhere.
 */
export function ownsBodies(me: string, present: readonly string[]): boolean {
  if (me.length === 0) return false
  return ownerOf([me, ...present]) === me
}

/**
 * Who is integrating, and how many handovers deep the room is.
 *
 * ---------------------------------------------------------------------------
 * Why the lowest id was not enough
 * ---------------------------------------------------------------------------
 * The election above costs nothing and is worth keeping as the floor, but it
 * decides ownership by a property that has **nothing to do with the ball**: the
 * sort order of an opaque presence string. So in a two-player kickabout the
 * player whose id happens to sort first integrates the ball for the whole match,
 * and the other player's every touch is the owner *inferring* their shove from
 * an interpolated avatar box a quarter of a second old. One player gets a ball
 * that answers instantly and the other gets a ball that answers late, from a
 * guess, and which of the two you are is decided by a string comparison.
 *
 * Whoever is on the ball should be simulating the ball. Then a touch is resolved
 * by the machine that has the true position of both the foot and the ball, and
 * the guess disappears.
 *
 * ---------------------------------------------------------------------------
 * A claim, not a computation
 * ---------------------------------------------------------------------------
 * The tempting version is to compute it: nearest player to the ball owns it, no
 * messages, same rule everywhere. It does not work, and the reason is the same
 * arithmetic that killed dead reckoning in this file's header. "Nearest" has to
 * be evaluated against *the same numbers on every machine*, and there are no
 * such numbers here - the owner has the true ball and true feet, a follower has
 * both interpolated and a quarter of a second late, and each client sees its own
 * body live and everybody else's delayed. Two clients computing "am I nearest"
 * from two different pictures is two clients who can both answer yes, which is
 * two simulations of one ball. That is the failure this whole file exists to
 * avoid, and it would arrive *continuously* rather than once per handover.
 *
 * So ownership **moves on a message**, and the message is an intent exactly like
 * `Shove` is: *I am on this thing, I am taking it*. What makes it safe without a
 * negotiation is `seq`:
 *
 *   - a claimant sends the seq it last saw, plus one;
 *   - a claim ahead of what you hold is accepted;
 *   - a claim *level* with what you hold is a race, and the **lower id wins** -
 *     so two claimants converge on the same answer on every receiver whatever
 *     order the two packets arrive in;
 *   - a claim behind what you hold is stale and dropped, which is what a
 *     duplicate or a reordered packet looks like.
 *
 * That is the whole protocol. There is no term, no quorum and nothing to time
 * out, and the resolution is a pure function of what you hold and what arrived -
 * `resolve` below - which is a thing a test can call twice from two points of
 * view. See `owning.test.ts`.
 *
 * The claimant takes it **optimistically**, before anybody agrees: it is on the
 * ball now, and waiting a round trip to start simulating is the latency this
 * whole change exists to remove. If it loses a race it will see the lower id in
 * the resolution and drop back to following, having integrated a ball nobody was
 * watching for half a round trip. Which is the same half round trip the old
 * owner spends still sending, and the reason `Balls.remember` now takes the
 * sender: a follower believes one owner at a time, so the loser's packets are
 * dropped by everybody who has already heard the winner.
 */
export interface Held {
  /** The presence id integrating, or null for a room with nobody in it. */
  owner: string | null
  /**
   * How many handovers deep, monotonic.
   *
   * Not a clock and not a term - it never needs to be compared across a rejoin,
   * because a newcomer adopts whatever the room is already saying. It exists
   * only so that two claims can be ordered and a duplicate can be recognised.
   */
  seq: number
}

/** Somebody taking the bodies over, because they are on one. See `Held`. */
export interface Claim {
  who: string
  seq: number
}

/**
 * The floor: whoever the room would elect with nothing else to go on.
 *
 * Used for the first frame and for an owner who has left, and it is the old rule
 * unchanged - which is what keeps a level played by one person exactly as it was.
 */
export function heldBy(everybody: readonly string[]): Held {
  return { owner: ownerOf(everybody), seq: 0 }
}

/**
 * What the room holds after a claim, from any point of view.
 *
 * Pure, total, and **order-independent** for the racing case, which is the one
 * property worth stating twice: given the same two claims a receiver reaches the
 * same owner whichever arrives first, so a reordered pair does not leave two
 * clients disagreeing forever. The test asks it in both orders.
 *
 * A claim from somebody who is not in the room is refused. That is not paranoia
 * about a hostile client - it is the ordinary case of a claim arriving just after
 * its sender's presence left, which would otherwise hand the ball to nobody and
 * stop it dead.
 */
export function resolve(held: Held, claim: Claim, everybody: readonly string[]): Held {
  if (claim.who.length === 0) return held
  if (!everybody.includes(claim.who)) return held
  if (!Number.isSafeInteger(claim.seq)) return held

  if (claim.seq > held.seq) return { owner: claim.who, seq: claim.seq }
  // Level: a race between two people who touched it on the same tick. The lower
  // id takes it, and every receiver decides that the same way.
  if (claim.seq === held.seq && held.owner !== null && claim.who < held.owner) {
    return { owner: claim.who, seq: claim.seq }
  }
  return held
}

/**
 * What this client should claim, or null if it already owns them.
 *
 * A function rather than an inlined `seq + 1` so that "one more than the last
 * thing I saw" is written once. Refuses to claim for a client with no id, which
 * is a client that has not joined.
 */
export function claiming(held: Held, me: string): Claim | null {
  if (me.length === 0 || held.owner === me) return null
  return { who: me, seq: held.seq + 1 }
}

/**
 * The room after somebody leaves.
 *
 * Only interesting when it was the owner: everybody else reaches the same new
 * owner from the same roster with nobody sending anything, exactly as before,
 * and the seq moves so that a claim already in flight from the old owner cannot
 * win against it.
 */
export function heldAfter(held: Held, everybody: readonly string[]): Held {
  if (held.owner !== null && everybody.includes(held.owner)) {
    /**
     * The owner is still here - but is it still *the floor's* answer?
     *
     * -------------------------------------------------------------------------
     * The bug this line exists for
     * -------------------------------------------------------------------------
     * This only ever re-elected when the owner had **left**, which is half the
     * question and was the wrong half. Every client starts alone, and a room of
     * one elects itself: `heldBy([me])` is me, at seq 0. When a second person
     * arrives, the first client asks this, finds its own owner still present,
     * and keeps it - and the second client does exactly the same about itself.
     * So **both** believe they are integrating, neither ever follows, and each
     * plays with its own copy of the ball. Reported word for word: *"you can
     * move it but it never shows on the other client and your ball keeps at
     * you"*.
     *
     * At seq 0 nobody has claimed anything, so ownership is still the floor's -
     * and the floor is the lowest id **present**, which is a thing an arrival
     * changes. Re-run it and the two clients land on the same person, without a
     * message, exactly as the floor is supposed to.
     *
     * Past seq 0 somebody has taken the ball by touching it, and a joiner must
     * not take it back off them by having a low id - so a claimed owner is left
     * alone until they leave, which is the branch below.
     */
    if (held.seq === 0) {
      const floor = ownerOf(everybody)
      return floor === held.owner ? held : { owner: floor, seq: 0 }
    }
    return held
  }
  return { owner: ownerOf(everybody), seq: held.seq + 1 }
}

/** The same as `readBodies`, for a claim. See `Claim`. */
export function readClaim(payload: unknown): Claim | null {
  if (typeof payload !== 'object' || payload === null) return null
  const one = payload as Record<string, unknown>
  if (typeof one.who !== 'string' || one.who.length === 0) return null
  if (typeof one.seq !== 'number' || !Number.isSafeInteger(one.seq)) return null
  return { who: one.who, seq: one.seq }
}

/**
 * One body, as it goes on the wire.
 *
 * Short keys, for the reason the position packet gives: this is a message that
 * repeats forever, eight times a second, and `dx` rather than `velocityX` is
 * bytes an hour per body of nothing - which does not matter until a level has
 * twenty moving things in it and every one of them is paying for it in the
 * tenant rate ceiling.
 *
 * The **velocity travels with the position**, and that is the field that makes
 * eight packets a second enough. A receiver given only a position can do
 * nothing between two of them but wait; given the velocity it can carry on
 * integrating from the state it was handed, which is what turns eight samples
 * into sixty frames. It is the same trick `Blocker.dx` plays for a moving
 * platform, one layer up.
 */
export interface BodySample {
  i: EntityId
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
}

/** What the owner tells the room about everything that is moving. */
export interface BodyShare {
  b: BodySample[]
}

/**
 * A push somebody who is *not* the owner wants applied.
 *
 * The other half of the tier, and the half that is easy to forget: if only the
 * owner is believed, then a kick by anybody else is a kick that gets corrected
 * away a fraction of a second later. The ball leaps and comes back, which reads
 * as the kick not working - intermittently, and only for the people who are not
 * the owner, which is the worst shape a bug can have.
 *
 * So a push crosses as an *intent* and the owner applies it. It is deliberately
 * not a position: a client saying "the ball is now here" is a client that can
 * put the ball in the net from the halfway line, and this says only "I hit it
 * this hard", which is a thing they were standing next to it to do.
 *
 * The **shoulder** needs none of this, and that is worth being clear about,
 * because it is the majority of all pushing: the owner can see where everybody
 * is - the crowd buffer is on every machine - so it works out everybody's shove
 * from their own interpolated bodies. Nothing about walking into a ball travels
 * at all. This message is only for the pushes a *script* makes, which are the
 * ones the owner has no way to know about.
 */
export interface Shove {
  i: EntityId
  dx: number
  dy: number
  dz: number
}

/**
 * How still a thing has to be to be left out of the packet.
 *
 * Nothing, in effect - a body at rest has no velocity row at all, so this is
 * about the frame it settles on rather than about a threshold. The point is
 * that a level of scenery and one ball sends one body, and a yard of settled
 * toys sends nothing, so the cost of switching this on is proportional to what
 * is actually happening rather than to how much is in the level.
 */
export function bodiesOf(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  /**
   * Include the ones that have stopped, for somebody who has just arrived.
   *
   * The tick-by-tick packet leaves them out on purpose - a settled level sends
   * nothing forever, which is what makes this affordable. But a **newcomer has
   * not been following**: their buffer is empty, so the only thing they can
   * draw is wherever their own copy of the document put the ball, and if
   * nothing moves again they will draw that forever.
   *
   * It is the hole `@kxb/xp/sharing` documents for pickups word for word:
   * *"somebody who joins after the flag was taken sees it lying on the floor
   * until the next time anything changes - which in a level with one pickup is
   * never."* A ball resting on the centre spot is that flag.
   *
   * So arrival gets the whole picture and every tick after it gets the moving
   * part. Idempotent either way: applying a picture twice lands in the same
   * place, which is why the greeting can be sent by whoever is the owner
   * without anybody coordinating.
   */
  resting = false,
): BodyShare {
  const b: BodySample[] = []
  for (const id of world.alive) {
    const name = world.blueprint.get(id)
    if (!bodyOf(name ? blueprints[name] : undefined)) continue
    // At rest is absent, and absent is the receiver's own conclusion too: it is
    // integrating the same body from the same rules and has already stopped it.
    if (!resting && !world.velocity.has(id)) continue
    const at = world.position.get(id)
    if (!at) continue
    const v = velocityOf(world, id)
    b.push({
      i: id,
      x: round(at.x),
      y: round(at.y),
      z: round(at.z),
      dx: round(v.x),
      dy: round(v.y),
      dz: round(v.z),
    })
  }
  // Sorted, so two packets describing the same world are the same packet - the
  // property `sameShare` relies on one module over, and the reason a Map
  // rehashing must not put a message on the wire.
  b.sort((one, two) => one.i - two.i)
  return { b }
}

/** Two decimal places. A millimetre is not worth a byte at eight a second. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Apply somebody else's push, as the owner.
 *
 * Straight through `push`, so the mass is the receiver's own reading of its own
 * blueprint and the speed cap applies exactly as it does to a local kick. A
 * client that could bypass either would be a client that can put the ball in
 * the net from the halfway line - and the whole reason a `Shove` is a force
 * rather than a position is that a force has to get past the same physics
 * everybody else's does.
 *
 * Answers false for a body this document does not have, which is the honest
 * answer to a packet from somebody on a different version of the level.
 */
export function applyShove(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  shove: Shove,
): boolean {
  return push(world, blueprints, shove.i, shove.dx, shove.dy, shove.dz)
}

/**
 * The owner's samples, buffered, so a follower can draw between them.
 *
 * `Crowd` for balls, and deliberately the same shape: a class, because it is
 * honestly stateful; `now` passed in rather than read, so a test can step it at
 * whatever rate it likes; out-of-order arrivals dropped rather than sorted in,
 * because a buffer that accepts a sample from before the one it holds
 * interpolates *backwards* and the ball visibly walks back on itself.
 *
 * It is a separate class rather than a reuse of `Crowd` because the two carry
 * different things - a person has a facing and no velocity, a body has a
 * velocity and no facing - and a shared one would be a struct with two halves
 * that are never both filled in.
 */
/**
 * How far behind the owner a follower draws the bodies, in milliseconds.
 *
 * Much shorter than `INTERPOLATION_DELAY`, and the difference is the whole
 * point: a quarter of a second is right for a *person*, whose position nobody
 * else is reaching for and whose smoothness is the only thing anybody judges.
 * A ball is the one object two players touch, and a quarter second of it is
 * two or three cells - enough that the same touch has the ball in front of one
 * player and behind the other, which is exactly how it was reported.
 *
 * Enough to still be interpolating between two real samples most of the time at
 * eight a second, and short enough that what is left is inside a frame or two of
 * where the owner has it.
 */
export const BALL_DELAY = 60

export class Balls {
  private readonly samples = new Map<EntityId, { at: number; s: BodySample }[]>()

  constructor(private readonly delay: number = BALL_DELAY) {}

  /**
   * Everything one packet said, stamped with when it arrived.
   *
   * `from` and `owner`, when given, are the guard that makes a handover
   * survivable: for half a round trip after a claim the **old owner is still
   * sending**, because it has not heard about it yet, and a buffer that mixed
   * the two would interpolate between two machines' idea of one ball. A follower
   * believes exactly one owner at a time and drops the rest.
   *
   * Both optional, and absent means believe everybody - which is what the tests
   * that predate the claim want, and is also the honest behaviour for a caller
   * that has no opinion about who is authoritative.
   */
  remember(share: BodyShare, now: number, from?: string, owner?: string | null): void {
    if (from !== undefined && owner !== undefined && owner !== null && from !== owner) return
    for (const sample of share.b) {
      const held = this.samples.get(sample.i)
      if (!held) {
        this.samples.set(sample.i, [{ at: now, s: sample }])
        continue
      }
      if (now < (held[held.length - 1]?.at ?? 0)) continue
      held.push({ at: now, s: sample })
      // Anything older than twice the delay can never be drawn from again. One
      // kept past the cutoff, because the pair being drawn between straddles it.
      const cutoff = now - this.delay * 2
      while (held.length > 2 && held[1]!.at < cutoff) held.shift()
    }
  }

  /** Whether anything has been heard about this body at all. */
  knows(id: EntityId): boolean {
    return this.samples.has(id)
  }

  /**
   * How many samples are being kept for one body. For tests.
   *
   * Exposed because the pruning is the half of this buffer that fails
   * *silently*: a cutoff computed in the wrong units drops nothing, and a
   * buffer that grows for the length of a match is a leak nothing else here
   * would notice.
   */
  held(id: EntityId): number {
    return this.samples.get(id)?.length ?? 0
  }

  /** Nothing is being owned any more - this client is integrating again. */
  clear(): void {
    this.samples.clear()
  }

  /**
   * Take the bodies over from the last thing the old owner said.
   *
   * The other half of a handover, and the half that is easy to leave out: a
   * follower is **not simulating** these, so its own rows hold whatever its last
   * `place` wrote - an interpolated position and *no velocity at all*, because
   * `place` deletes it on purpose. A client that simply stopped following and
   * started integrating would therefore drop the ball where it was drawn and let
   * it roll from a standstill, which on screen is the ball stopping dead the
   * instant somebody touches it. Every handover, now that handovers happen on
   * every touch rather than once a match.
   *
   * The **newest** sample rather than the interpolated one, which is the
   * opposite of what `place` wants and right for the opposite reason: drawing
   * wants the smooth past, integrating wants the freshest state there is. It is
   * the delay's worth of staleness the new owner is taking on, and integrating
   * forward from the newest sample is what pays it back.
   *
   * Returns how many bodies it seeded, which is zero for a client that has heard
   * nothing yet - a claim made before the first packet arrived. That client keeps
   * its own document's idea of where the ball is, which is the only thing it has.
   */
  adopt(world: EntityWorld): number {
    let seeded = 0
    for (const [id, held] of this.samples) {
      const newest = held[held.length - 1]
      if (!newest || !world.alive.has(id)) continue
      const s = newest.s
      world.position.set(id, { x: s.x, y: s.y, z: s.z })
      if (s.dx === 0 && s.dy === 0 && s.dz === 0) world.velocity.delete(id)
      else world.velocity.set(id, { x: s.dx, y: s.dy, z: s.dz })
      seeded += 1
    }
    this.samples.clear()
    return seeded
  }

  /**
   * Where a body should be drawn, or null if nothing has been said about it.
   *
   * Between the two samples straddling `now - delay`. Past the end of what we
   * have it holds the last thing the owner said rather than extrapolating: a
   * guess that runs a ball on through a wall the owner already bounced it off
   * is worse than a ball that pauses for a frame.
   */
  at(id: EntityId, now: number): { x: number; y: number; z: number } | null {
    const held = this.samples.get(id)
    if (!held || held.length === 0) return null

    const target = now - this.delay
    const newest = held[held.length - 1]!
    /**
     * Past the end of what we have, the last thing the owner said - not a guess
     * carried on from it.
     *
     * Extrapolating here is the obvious fix for the lag and it is a trap, which
     * is worth writing down because it was tried: **the owner stops sending a
     * body once it comes to rest**, since a resting body has no velocity row and
     * `bodiesOf` skips it. So "no newer sample" means either *nothing has
     * arrived yet* or *it has stopped*, and nothing here can tell those apart.
     * Carrying on through the second one puts the ball down a stride past where
     * it actually stopped, forever, with no further packet to correct it - the
     * test below catches exactly that.
     *
     * The lag is answered by `BALL_DELAY` instead, which is a number that cannot
     * be wrong about anything.
     */
    if (target >= newest.at) return { x: newest.s.x, y: newest.s.y, z: newest.s.z }
    const oldest = held[0]!
    if (target <= oldest.at) return { x: oldest.s.x, y: oldest.s.y, z: oldest.s.z }

    for (let i = held.length - 1; i > 0; i -= 1) {
      const after = held[i]!
      const before = held[i - 1]!
      if (target < before.at) continue
      const span = after.at - before.at
      const t = span <= 0 ? 1 : (target - before.at) / span
      return {
        x: before.s.x + (after.s.x - before.s.x) * t,
        y: before.s.y + (after.s.y - before.s.y) * t,
        z: before.s.z + (after.s.z - before.s.z) * t,
      }
    }
    return { x: oldest.s.x, y: oldest.s.y, z: oldest.s.z }
  }

  /**
   * Put every body this buffer knows about where the owner says it is.
   *
   * Called by a **follower**, after its own frame, and it overwrites rather
   * than nudges - there is nothing to reconcile, because the follower is not
   * simulating these. The velocity row is cleared with it so nothing local
   * carries them on between packets; the smoothness comes from interpolating
   * between two samples, not from integrating.
   */
  place(world: EntityWorld, now: number): void {
    for (const id of this.samples.keys()) {
      if (!world.alive.has(id)) continue
      const at = this.at(id, now)
      if (!at) continue
      world.position.set(id, at)
      world.velocity.delete(id)
    }
  }
}

/**
 * Read a packet off the wire, or say no.
 *
 * Everything is checked, for `readShare`'s reason: this arrives from another
 * client over a transport that promises nothing, and a malformed field that
 * reached the world would be a body at `NaN` - which propagates through every
 * subsequent frame and cannot be traced back to the packet that caused it.
 *
 * A single bad entry drops **that entry**, not the packet. The rest of it is
 * still true, and the alternative is one corrupt body freezing every other body
 * in the level.
 */
export function readBodies(payload: unknown): BodyShare | null {
  if (typeof payload !== 'object' || payload === null) return null
  const raw = (payload as { b?: unknown }).b
  if (!Array.isArray(raw)) return null

  const b: BodySample[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const one = entry as Record<string, unknown>
    const fields = ['i', 'x', 'y', 'z', 'dx', 'dy', 'dz'] as const
    if (!fields.every((key) => typeof one[key] === 'number' && Number.isFinite(one[key]))) {
      continue
    }
    b.push({
      i: one.i as EntityId,
      x: one.x as number,
      y: one.y as number,
      z: one.z as number,
      dx: one.dx as number,
      dy: one.dy as number,
      dz: one.dz as number,
    })
  }
  return { b }
}

/** The same, for a push intent. See `Shove`. */
export function readShove(payload: unknown): Shove | null {
  if (typeof payload !== 'object' || payload === null) return null
  const one = payload as Record<string, unknown>
  const fields = ['i', 'dx', 'dy', 'dz'] as const
  if (!fields.every((key) => typeof one[key] === 'number' && Number.isFinite(one[key]))) {
    return null
  }
  return {
    i: one.i as EntityId,
    dx: one.dx as number,
    dy: one.dy as number,
    dz: one.dz as number,
  }
}
