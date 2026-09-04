/**
 * The parts of "other people are here" that are the same in every room.
 *
 * Pulled out of the lounge's multiplayer when the café, the house and the
 * garden got presence too. What stayed behind is everything about *fighting* -
 * dashes, damage, health bars - because that is a lounge feature and not a
 * presence one. What moved here is the wire format, the smoothing, and the
 * arithmetic for deciding whether a packet is worth sending, none of which ever
 * cared what room it was in.
 *
 * Deliberately free of React and of three.js. Positions arrive as plain numbers
 * and leave as plain numbers, which is what makes the interpolation testable
 * without standing up a canvas - and the interpolation is the part that is
 * subtly wrong in ways you cannot see at sixty frames a second.
 */

import { EMOTE_DURATION_MS, type EmoteId } from '@/domain/world/emotes'

/**
 * Movement updates per second.
 *
 * Eight is enough to interpolate from smoothly, and every frame is fanned out to
 * everyone in the room - so the saving is quadratic in room size rather than
 * linear. Measured in performancestudy/.
 */
export const SEND_HZ = 8
export const SEND_INTERVAL = 1000 / SEND_HZ

/**
 * How often to send when there are this many other people to send to.
 *
 * `SEND_HZ` is the rate a *full* room can afford, and for years it was the rate
 * every room paid. That is the wrong shape for the cost it is guarding against:
 * a broadcast is fanned out to everybody, so a room's traffic is `n x hz x n`,
 * and the room that made eight the right answer is the twenty-player one. Two
 * friends in a world were being charged the twenty-player rate for a bill of
 * 2 x 8 x 2 = 32 messages a second.
 *
 * They pay for it twice over, because the receiver's playout delay is floored
 * at two send intervals - so a rate picked to protect a crowded room is also
 * 250ms of lag in an empty one, and 250ms is the difference between passing to
 * where somebody is and passing to where they were. That is what "the
 * connection is not great" describes far more often than any packet loss.
 *
 * So the rate follows the room. The tiers keep the worst case exactly where it
 * was - a twenty-player room still sends at eight, still 3 040 messages a
 * second leaving the server - and hand the headroom to the rooms that have it:
 *
 *   | others | hz | messages/s out |
 *   |--------|----|----------------|
 *   | 1      | 20 | 40             |
 *   | 3      | 20 | 240            |
 *   | 7      | 12 | 672            |
 *   | 19     |  8 | 3 040          |
 *
 * Nobody is told which rate we picked and nobody needs to be: `peer-motion`
 * measures the cadence of every sender it hears rather than assuming one, so a
 * room whose rate steps down as it fills is a room whose buffers follow it, and
 * a client that has not reloaded since this shipped is simply a peer sending at
 * eight. See the header of `peer-motion.ts`.
 */
export function sendHzFor(peers: number): number {
  if (peers <= 3) return 20
  if (peers <= 7) return 12
  return SEND_HZ
}

/** The same answer as an interval, which is what every send loop wants. */
export function sendIntervalFor(peers: number): number {
  return 1000 / sendHzFor(peers)
}

/**
 * Resend even when nothing moved, so a peer who joined mid-stillness learns
 * where you are instead of waiting for you to twitch.
 */
export const KEEPALIVE_MS = 2000

/** Movement below this is not worth a packet. */
export const POSITION_EPSILON = 0.02
export const YAW_EPSILON = 0.02

/**
 * How fast a remote body catches up to the position we were last told about.
 *
 * Exponential smoothing rather than timestamped interpolation: it is one line,
 * it is framerate independent, and it degrades gracefully when a packet is late -
 * the body keeps drifting toward the last known target instead of stopping dead
 * and then teleporting.
 */
export const SMOOTHING = 11

/** Speeds above which a remote body walks, then runs. Matches the local gaits. */
export const WALK_SPEED = 0.6
export const RUN_SPEED = 10

/** What we tell everyone about ourselves. Terse because it goes out at `SEND_HZ`. */
export interface MoveMessage {
  u: string
  x: number
  y: number
  z: number
  /** Heading in radians. */
  r: number
  /** Doing the idle flourish - dancing in the lounge, nothing yet elsewhere. */
  d: boolean
  /**
   * Health, 0..100. Lounge only, and optional for that reason.
   *
   * Rides along with movement rather than getting its own event, which makes it
   * self-healing in a way a one-shot broadcast is not. Absent in rooms where
   * nobody can be hit, rather than sent as a constant 100.
   */
  h?: number
}

/**
 * "I pulled a face."
 *
 * Its own event rather than a field on `MoveMessage`, and that is the important
 * decision in this file. An emote is something that *happened*; a position is
 * something that *is*. Riding it along with movement would mean every keepalive
 * for the next two seconds re-announced the same face, and a peer who joined
 * mid-emote would restart its three seconds from the moment they arrived.
 *
 * The cost is that a dropped emote packet is simply a face nobody saw. For
 * something that lives three seconds and is never written down, that is cheaper
 * than the alternative it buys.
 */
export interface EmoteMessage {
  u: string
  e: EmoteId
}

/**
 * "The room itself changed" - not somebody in it.
 *
 * Its own event for the same reason `EmoteMessage` is: this is a thing that
 * *happened*, once, to the space everybody is standing in, rather than a fact
 * about a body that every keepalive would re-announce.
 *
 * It exists because two of this app's most visible actions were invisible to
 * everybody except the person doing them. Flipping the lounge between creative
 * and battle is held in client state on purpose - `setLoungeMode` does not
 * revalidate, because re-rendering the layout tears the canvas down mid-flip -
 * so the other people in the room went on building in a battle-mode lounge, or
 * swinging in a creative one. Laying a template or loading an arena is worse:
 * the acting client reloads and gets the new world, and everybody else is left
 * holding a block map for a world that no longer exists, which reads as "it
 * went empty and never came back".
 *
 * Two fields rather than two events, because a client that has to react to one
 * has to react to the other in the same place.
 */
export interface RoomMessage {
  /** Who did it, so the sender can ignore its own echo. */
  u: string
  /** The lounge's new mode, when that is what changed. */
  mode?: 'creative' | 'battle'
  /** The world was replaced wholesale - reset, template, or an arena loaded. */
  world?: true
  /**
   * Which template was laid, when one was.
   *
   * Present so the room can *draw* the new world instead of reloading for it:
   * the planners are pure and every client ships them, so the id is enough to
   * reproduce exactly what the server wrote. Absent for a loaded arena, which
   * has no plan to replay - only the server knows what is in somebody's saved
   * world - and that is the case that still reloads.
   */
  template?: string
  /**
   * The lights just went on, or off.
   *
   * Ephemeral, like everything on this channel and unlike `mode`, which is a
   * workspace setting this message only *mirrors*. A party is not written down
   * anywhere: whoever arrives after it starts is told by the next broadcast, and
   * a room with nobody in it has no party. `u` doubles as who threw the switch,
   * which is what the scene colours as the host - see `party-glow`.
   */
  party?: boolean
  /**
   * The world just turned to glass, or back.
   *
   * Ephemeral exactly as `party` is, and with one difference: nothing reads `u`
   * for a rainbow. A party colours whoever threw the switch differently, so the
   * sender matters; a rainbow is a sweep across the blocks that has no opinion
   * about who asked for it, which is why every client re-broadcasts it on a
   * join rather than only a host.
   */
  rainbow?: boolean
}

/**
 * What face somebody is pulling, and until when.
 *
 * `until` is a `performance.now()` deadline rather than a duration, because the
 * only question anybody ever asks is "is this still up", and a deadline answers
 * it without needing to be ticked down.
 *
 * Lives here, in the module with no three.js in it, so that the DOM half of the
 * app can hold and update these without pulling a renderer into its bundle.
 */
export interface EmoteState {
  id: EmoteId | null
  until: number
}

/** A fresh, empty slot. */
export function noEmote(): EmoteState {
  return { id: null, until: 0 }
}

/**
 * "I said something."
 *
 * The same shape as `EmoteMessage` and for the same reason - a sentence is
 * something that *happened*, not something that *is*, so it gets its own event
 * rather than a field on `MoveMessage` that every keepalive would re-announce.
 *
 * Where it differs from the emote is `i`, and that difference is the whole
 * feature. A face is broadcast and forgotten; a message is stored first and
 * broadcast afterwards, carrying the id it was stored under - so every client
 * in the room can put a report button beside it that names a row somebody can
 * actually act on. That ordering costs one round trip before the room hears
 * you, and buys the only thing that makes chat moderatable.
 *
 * `n` travels too, rather than being looked up in the peer list, because a
 * message outlives its sender's presence: somebody can say goodbye and close
 * the tab, and the line should not lose its name on the way out.
 */
export interface ChatMessage {
  u: string
  /** The durable message id, minted server-side. What a report names. */
  i: string
  /** The sender's handle, as the server resolved it. */
  n: string
  b: string
}

/**
 * How long a speech bubble hangs over somebody's head.
 *
 * Longer than an emote's three seconds, because a sentence has to be read and a
 * face only has to be seen. Short enough that a room of six is not a wall of
 * text with legs - the panel is where the conversation lives, and the bubble
 * only says who just spoke.
 */
export const SAID_DURATION_MS = 7000

/**
 * What somebody just said, and until when.
 *
 * A deadline rather than a duration, exactly like `EmoteState`: the only
 * question ever asked of it is "is this still up", and a deadline answers that
 * without needing to be ticked down - so a backgrounded tab comes back to a
 * bubble that is simply over, not to a queue of expiry callbacks.
 */
export interface SaidState {
  text: string | null
  until: number
}

export function nothingSaid(): SaidState {
  return { text: null, until: 0 }
}

/** Put a line over somebody's head. Mutates, because packet handlers call it. */
export function showSaid(state: SaidState, text: string): void {
  state.text = text
  state.until = performance.now() + SAID_DURATION_MS
}

/** Start the clock on a face. Mutates, because it is called from packet handlers. */
export function showEmote(state: EmoteState, id: EmoteId): void {
  state.id = id
  state.until = performance.now() + EMOTE_DURATION_MS
}

/** Somebody waiting at a door, reduced to what deciding about them needs. */
export interface Knocking {
  userId: string
  /** `Date.now()` when the knock landed. */
  at: number
}

/** How long a knock is dropped after, waiting for an answer nobody gave. */
export const KNOCK_TTL_MS = 60_000

/**
 * How long a knock is protected from presence-based pruning.
 *
 * A knock can outrun the presence sync that announces whoever sent it, so for
 * this long after it lands it is trusted on its own.
 */
export const KNOCK_SETTLE_MS = 5000

/**
 * Which knocks are still worth showing.
 *
 * The age check is not politeness, it is a race fix, and it is the reason this
 * is a function with a test rather than three lines inside a callback.
 * Broadcast and presence are independent streams on one socket: a visitor
 * tracks and then knocks in consecutive ticks, so the knock can reach the owner
 * *before* the presence sync that says the visitor exists. Pruning purely on
 * "are they in presence right now" therefore discarded a knock milliseconds
 * after it arrived, and the owner's accept prompt either never rendered or
 * flashed for a single frame.
 *
 * So: a knock survives if it is young enough that presence may not have caught
 * up yet, or if presence confirms the knocker is still connected. It dies once
 * it is both old and unaccounted for - or once it is simply stale.
 */
export function pruneKnocks<T extends Knocking>(
  knocks: T[],
  onChannel: ReadonlySet<string>,
  now: number,
): T[] {
  return knocks.filter((knock) => {
    const age = now - knock.at
    if (age >= KNOCK_TTL_MS) return false
    return age < KNOCK_SETTLE_MS || onChannel.has(knock.userId)
  })
}

/** A position in a room, and which way the body is facing. */
export interface Pose {
  x: number
  y: number
  z: number
  yaw: number
}

/** Where a peer is going, and where we are currently drawing them. */
export interface PeerTransform {
  target: Pose
  current: Pose
  dancing: boolean
  /** Last health we were told about. `null` in rooms without combat. */
  health: number | null
}

/**
 * Shortest signed distance between two angles, so 350 degrees to 10 degrees
 * turns 20 and not 340. Without it a body spins the long way round on every
 * wrap, which is the single most obvious tell that a remote avatar is being
 * interpolated badly.
 */
export function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

/**
 * Ease a drawn body one frame toward where it is going.
 *
 * Returns how far it travelled on the ground plane, which is what the gait is
 * chosen from. Reading the *drawn* distance rather than a flag in the packet is
 * what keeps feet matched to the interpolation: a peer whose update is late
 * slows to a stop and their legs slow with them, instead of running on the spot.
 *
 * Mutates `current` in place. It runs sixty times a second per person and the
 * frame loop must not make garbage.
 */
export function advance(current: Pose, target: Pose, delta: number): number {
  // Framerate-independent easing: the fraction of the remaining gap closed this
  // frame depends on how long the frame was.
  const k = 1 - Math.exp(-SMOOTHING * delta)

  const wasX = current.x
  const wasZ = current.z

  current.x += (target.x - current.x) * k
  current.y += (target.y - current.y) * k
  current.z += (target.z - current.z) * k
  current.yaw += angleDelta(current.yaw, target.yaw) * k

  return Math.hypot(current.x - wasX, current.z - wasZ)
}

/** How fast a body has to be moving before its legs move too. */
export type Gait = 'idle' | 'walk' | 'run'

export function gaitFor(travelled: number, delta: number): Gait {
  const speed = travelled / Math.max(delta, 0.0001)
  if (speed > RUN_SPEED) return 'run'
  if (speed > WALK_SPEED) return 'walk'
  return 'idle'
}

/** The last thing we put on the wire, for deciding whether to send again. */
export interface LastSent {
  at: number
  x: number
  y: number
  z: number
  yaw: number
  dancing: boolean
  health: number | null
}

export function neverSent(): LastSent {
  return {
    at: 0,
    x: NaN,
    y: NaN,
    z: NaN,
    yaw: NaN,
    dancing: false,
    health: null,
  }
}

/**
 * Is anything different enough to be worth a frame?
 *
 * Health counts as movement, which is not obvious: waiting out the keepalive
 * would leave a bar two seconds stale, and in a fight that lasts four hits that
 * is most of the fight.
 *
 * The explicit `NaN` check at the end is load-bearing, and easy to delete by
 * mistake. `neverSent()` seeds the position with `NaN` to mean "we have never
 * said anything", but every *comparison* against `NaN` is false - so on the
 * first call no epsilon is met, the flags all match their defaults, and without
 * that last clause a tab that joined and then stood perfectly still would say
 * nothing at all until the keepalive fired two seconds later.
 */
export function worthSending(
  last: LastSent,
  next: Omit<LastSent, 'at'>,
): boolean {
  return (
    Math.abs(next.x - last.x) > POSITION_EPSILON ||
    Math.abs(next.y - last.y) > POSITION_EPSILON ||
    Math.abs(next.z - last.z) > POSITION_EPSILON ||
    Math.abs(angleDelta(last.yaw, next.yaw)) > YAW_EPSILON ||
    last.dancing !== next.dancing ||
    last.health !== next.health ||
    Number.isNaN(last.x)
  )
}
