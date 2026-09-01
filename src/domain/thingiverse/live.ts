/**
 * What a thing is doing *right now*, told to everybody else in the room.
 *
 * ---------------------------------------------------------------------------
 * Why none of this is written down
 * ---------------------------------------------------------------------------
 * A thing has two kinds of fact about it and they belong in different places.
 * Where it stands, how big it is, which blueprint it is - those are *events*,
 * they survive a reload, and they go through the log like everything else in
 * this codebase (see `./thing-events`). Which state its machine is in, how much
 * health it has left and what is sitting on it are none of those things: they
 * are true for as long as somebody is in the room, they change sixty times a
 * minute, and the honest promise for all three is the one `vanish` already
 * makes - **until the room is next loaded**.
 *
 * Writing them down would be a row per crate per hit. Broadcasting them is one
 * packet a few times a second for the whole room, and a client that misses one
 * is corrected by the next. That is the trade, and it is the same one presence
 * makes about where people are standing.
 *
 * ---------------------------------------------------------------------------
 * One driver, and everybody else is watching
 * ---------------------------------------------------------------------------
 * Every machine in the room is run by exactly one client. Not one per thing,
 * claimed on touch, which is how the ball works (see the note on ball ownership
 * in the lounge net code) - and the difference is worth stating, because the
 * ball's rule is the more sophisticated one and is *wrong* here.
 *
 * A ball is claimed on touch because a ball is only ever interesting to the
 * person touching it, and the handover happens at the moment they touch it, so
 * there is no window where two people disagree about something anybody can see.
 * A cooker is not like that. It is interesting to the room - it is counting
 * down, it has a bar over it, and three people are standing round it waiting.
 * Per-thing ownership of *that* means the burger cooks at a speed set by
 * whoever last put something on it, and a handover mid-bake is a bar that jumps.
 *
 * So: one client drives every machine, elected the same way football elects the
 * client that owns the ball, and everybody else applies what they are told.
 * That is deterministic, it survives the driver leaving (the election runs
 * again and the next one carries on from the last pulse it heard), and it means
 * the answer to "how much health does that crate have" has exactly one author.
 *
 * ---------------------------------------------------------------------------
 * What a watcher does in between packets
 * ---------------------------------------------------------------------------
 * It runs the clock and nothing else. `since` keeps counting locally so the
 * fill bar over the burger moves smoothly at sixty frames a second rather than
 * stepping four times a second, and every pulse corrects it. What a watcher
 * must *not* do is take the change itself - a watcher whose local clock crossed
 * five seconds first would move its burger to `cooked` before the driver did,
 * shout `ding` at the room, and be contradicted a tenth of a second later.
 *
 * The one exception is a *claim*, below, which is prediction rather than
 * simulation: you hit the crate, you see it flash, and the driver's next pulse
 * is the truth. That asymmetry is deliberate and it is the same one every
 * responsive multiplayer thing has ever had.
 */

/**
 * How often the driver says what everything is doing, in seconds.
 *
 * Four times a second, which is well under the rate anything here changes and
 * is also the recovery time for a client that missed one. It is a *heartbeat*
 * and not a change feed on purpose: a driver that only spoke when something
 * happened would leave somebody who walked in during a quiet minute looking at
 * a room of default states, and would need a join handshake to fix it. A
 * heartbeat is self-healing, and the cost is a packet the size of a tweet.
 *
 * Nothing is sent for a room whose things have no machines, no health and
 * nothing on them - see `worthSending`. Most rooms are that room.
 */
export const PULSE_EVERY = 0.25

/**
 * How long a driver may be silent before the room decides it has gone.
 *
 * Three pulses. Long enough that a dropped packet and a garbage collection are
 * not a change of government, short enough that a closed tab does not freeze
 * every burger in the room for a noticeable beat.
 */
export const DRIVER_TIMEOUT = PULSE_EVERY * 3

/**
 * One thing, as the driver last saw it.
 *
 * Short keys, which is not premature: this goes out four times a second with up
 * to `MAX_THINGS_PER_WORLD` of them in it, and the field names would otherwise
 * be most of the packet. The same decision `ThingMessage` already made.
 */
export interface LiveThing {
  /** The thing's id. */
  i: string
  /** Which state its machine is in. Absent for a thing with no machine. */
  s?: string
  /** How long it has been in it, in seconds. See the note about the clock. */
  t?: number
  /** Health left. Absent for a thing nothing can hurt. */
  h?: number
  /** What is on it: socket name, then the item's word. */
  o?: readonly (readonly [string, string])[]
}

/** What the driver sends, four times a second. */
export interface Pulse {
  /** Who is driving. A connection id, not a user - see `elect`. */
  d: string
  /** Everything with something to say about it. */
  things: readonly LiveThing[]
  /**
   * Who got what off a table since the last pulse.
   *
   * ---------------------------------------------------------------------------
   * Why taking needs an answer when nothing else does
   * ---------------------------------------------------------------------------
   * Every other claim is a *request about the world*: I hit it, I used it, I put
   * something on it. If two of them race, the driver applies both or neither and
   * the room is consistent either way. Taking is different, because it moves an
   * item from the world into somebody's pocket - and if two people reach for the
   * same patty and both pocket it optimistically, one patty has become two. Put
   * them both down and the room now contains an item that was duplicated out of
   * thin air.
   *
   * So a take is the one claim that is not predicted. The taker asks, the driver
   * decides, and the driver names the winner here. It costs up to a quarter
   * second between reaching and having - which for picking something up off a
   * table is inside what a person reads as "it worked", and is a far better
   * trade than a kitchen that mints ingredients under contention.
   *
   * The driver's own takes do not travel: it applies them the frame it decides
   * them, which is why this is only ever about somebody else.
   */
  gave?: readonly (readonly [string, string])[]
  /**
   * Words shouted since the last pulse.
   *
   * On the pulse rather than sent the instant they happen, and that costs up to
   * a quarter second of latency on a bell ringing. It buys the thing that
   * matters more: a signal and the state change that caused it arrive in the
   * same packet, so nobody ever sees a room react to a word before the thing
   * that said it has changed. Splitting them would make that race a coin toss.
   */
  said?: readonly string[]
}

/**
 * Something a watcher did that the driver has to know about.
 *
 * Sent the moment it happens rather than on a heartbeat, because unlike a state
 * this *is* an event: it happened once, at a moment, and a claim that arrived
 * late or twice would be a crate hit twice for one swing.
 *
 * Called a claim rather than a command for the reason `_sim/combat.ts` gives
 * about health: the sender is asserting what they did, and the driver decides
 * what it is worth. A watcher saying "I took 40 off that crate" is telling the
 * truth about their swing and guessing about the crate, and only one of those
 * is theirs to know.
 */
export interface Claim {
  /** The thing it happened to. */
  i: string
  /**
   * Who is claiming it.
   *
   * Only `took` actually needs it, and it needs it badly: taking is the one
   * claim that *hands something over*, so somebody has to be told they got it.
   * See `Pulse.gave`.
   */
  c?: string
  /** Damage dealt, if it was a hit. */
  hit?: number
  /** Somebody pressed E on it. */
  used?: boolean
  /** Somebody walked into it. */
  touched?: boolean
  /** Something was put on it: the socket, then the item's word. */
  put?: readonly [string, string]
  /** Something was taken off it, by socket. */
  took?: string
}

/**
 * Who drives.
 *
 * The lowest connection id present, which is arbitrary, stable and needs no
 * agreement: every client sorts the same list and reaches the same answer
 * without a round trip. The same *shape* as football's `ballOwner`, which is
 * where this idea is argued at length, and deliberately not the same function:
 * that one sorts by player first and connection second, because a ball belongs
 * to whoever is kicking it and a person is the unit that makes sense. A crate
 * belongs to nobody, so there is nothing for the first key to mean.
 *
 * Connections rather than users, because a person with two tabs open is two
 * clients and only one of them may drive - which is the trap `conn` was minted
 * to close for the ball, where both tabs of the lowest-sorting player elected
 * themselves and ran two simulations that disagreed. It is also the only id a
 * guest has.
 */
export function elect(conns: readonly string[]): string | null {
  let best: string | null = null
  for (const conn of conns) {
    if (best === null || conn < best) best = conn
  }
  return best
}

/** Whether this client is the one running the machines. */
export function driving(conns: readonly string[], me: string): boolean {
  return elect(conns) === me
}

/**
 * Whether a room has anything worth pulsing about.
 *
 * Checked so that the overwhelming majority of rooms - a lounge with a bench
 * and two lamps in it - send nothing at all. A heartbeat is cheap; a heartbeat
 * per room in the product for a payload of `{things: []}` is a cost with no
 * corresponding feature.
 */
export function worthSending(things: readonly LiveThing[]): boolean {
  return things.length > 0
}

/**
 * What a watcher believes between packets.
 *
 * Kept apart from `Standing` in `./states` rather than reusing it, and the
 * difference is the whole point: a `Standing` is something a machine is
 * *simulating*, and this is something a client is *remembering*. Merging them
 * would put a `spent` list on the watcher, which would then be a second opinion
 * about which one-time changes have fired - and there is only one client
 * entitled to have one.
 */
export interface Watched {
  state?: string
  since: number
  health?: number
  slots: ReadonlyMap<string, string>
  /**
   * When this last heard from the driver, on the client's own clock.
   *
   * Client-local seconds rather than a timestamp off the packet, because the
   * two machines' clocks are not the same clock and the only thing this is used
   * for is "has it been a while" - which is a question about *this* machine.
   */
  heard: number
}

/** A thing nobody has heard anything about yet. */
export function unheard(now: number): Watched {
  return { since: 0, slots: new Map(), heard: now }
}

/**
 * Apply a pulse to what a watcher believes.
 *
 * The driver's word replaces everything it speaks about, rather than being
 * merged into it. That is the same call `use-things` already makes about a
 * row - "the sender's row *is* the answer" - and it is what stops a field this
 * client mispredicted from surviving the correction that was supposed to fix it.
 */
export function apply(live: LiveThing, now: number): Watched {
  return {
    state: live.s,
    since: live.t ?? 0,
    health: live.h,
    slots: new Map(live.o ?? []),
    heard: now,
  }
}

/**
 * Run a watcher's clock forward between packets.
 *
 * Only the clock. See the note at the top about why a watcher must not take the
 * change itself - a bar that fills smoothly and a burger that cooks twice are
 * the two halves of the same decision.
 */
export function drift(was: Watched, dt: number): Watched {
  if (dt <= 0) return was
  return { ...was, since: was.since + dt }
}

/**
 * Whether what we believe has gone stale enough to stop drawing a moving bar.
 *
 * A bar that keeps filling after the driver has gone quiet is a lie that gets
 * worse the longer it is told - and the specific failure it produces is the
 * worst kind: a burger that appears to be one second from ready, forever. Past
 * this the bar freezes where it is, which reads as "something is wrong" rather
 * than as "nearly there".
 */
export function stale(was: Watched, now: number): boolean {
  return now - was.heard > DRIVER_TIMEOUT
}

/**
 * What the driver should do about a claim, having received it.
 *
 * Pure, and separate from the machine step, because the interesting rule is not
 * arithmetic - it is *which claims a driver honours*, and there are two it must
 * not:
 *
 *   - a hit on something nothing can hurt. The sender may be a tab that has not
 *     heard the blueprint changed.
 *   - a hit on something already at zero. Without this, three people swinging
 *     at the last of a crate's health all land, and the crate is broken three
 *     times - which shouts its signal three times and, in a kitchen, cooks
 *     three burgers.
 *
 * The second is the one that actually bit, and it is the reason this returns
 * `broken` as a fact rather than leaving the caller to compare health to zero.
 */
export function honour(
  claim: Claim,
  now: { health?: number; hurtable: boolean },
): { health?: number; broken: boolean } {
  if (claim.hit === undefined || !now.hurtable || now.health === undefined) {
    return { health: now.health, broken: false }
  }
  if (now.health <= 0) return { health: now.health, broken: false }

  const health = Math.max(0, now.health - Math.max(0, claim.hit))
  return { health, broken: health === 0 }
}

/**
 * Everything a driver heard this frame about one thing, gathered from claims.
 *
 * The claims arrive one at a time off a socket and the machine wants one bag
 * per frame (see `Happened`), so somebody has to do this fold. Here rather than
 * in the hook, because "two people used it in the same frame" has a right
 * answer - it counts once - and that is exactly the kind of thing that is
 * invisible in a screenshot and one line in a test.
 */
export function gather(claims: readonly Claim[], id: string): {
  hit: number
  used: boolean
  touched: boolean
  put: (readonly [string, string])[]
  /** Which socket, and who asked - see `Pulse.gave`. */
  took: { socket: string; by: string | null }[]
} {
  let hit = 0
  let used = false
  let touched = false
  const put: (readonly [string, string])[] = []
  const took: { socket: string; by: string | null }[] = []

  for (const claim of claims) {
    if (claim.i !== id) continue
    // Damage adds up: two people hitting one crate in one frame is two hits,
    // and this is the one field where "it counts once" would be wrong.
    if (claim.hit !== undefined) hit += Math.max(0, claim.hit)
    if (claim.used) used = true
    if (claim.touched) touched = true
    if (claim.put) put.push(claim.put)
    if (claim.took) took.push({ socket: claim.took, by: claim.c ?? null })
  }

  return { hit, used, touched, put, took }
}
