'use client'

import { useFrame } from '@react-three/fiber'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BodyModel } from '@/app/world/lounge/_canvas/body-model'
import { PeerVehicle } from '@/app/world/lounge/_canvas/vehicle-rig'
import {
  type DashRuntime,
  dashConnects,
  isDown,
  KICK_IMPULSE,
  KICK_LIFT,
  kickConnects,
  type KickRuntime,
  MAX_HEALTH,
  rollDamage,
  sanitiseDamage,
  sanitiseImpulse,
} from '@/app/world/lounge/_sim/combat'
import { heldNow } from '@/app/world/_stores/pocket-store'
import { fireTracer } from '@/app/world/_stores/tracer-store'
import { HeldThing } from '@/app/world/lounge/_canvas/held-thing'
import { itemLook, type ItemLook } from '@/domain/thingiverse/craft'
import {
  type Ball,
  ballAcked,
  ballAt,
  type BallClient,
  ballOwner,
  bodyVelocity,
  type DrawnBall,
  drawnBall,
  goalCrossed,
  KICKOFF_PAUSE,
  kickoffSpot,
  noStuckWatch,
  reckonBall,
  reconcileBall,
  scoringSide,
  stepBall,
  strike,
  type Striker,
  STUCK_RESET_PAUSE,
  type StuckWatch,
  watchStuck,
} from '@/app/world/lounge/_sim/football'
import { EYE_HEIGHT, type SolidTest } from '@/app/world/lounge/_sim/physics'
import { ridePosition, seatDelta } from '@/app/world/lounge/_sim/seats'
import { useThingiverse } from '@/app/world/_stores/thing-store'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import { AvatarPlaceholder } from '@/app/world/_canvas/rainbow'
import type { Goal, GoalTeam } from '@/domain/lounge/goal-events'
import { ChatBubble } from '@/app/world/_canvas/chat-bubble'
import { HealthBar, showHealth, useHealthBar } from '@/app/world/_canvas/health-bar'
import { PartyGlow, usePartyColour } from '@/app/world/_canvas/party-glow'
import { EmoteBubble } from '@/app/world/_canvas/emote-bubble'
import { Nameplate, type PlateTone } from '@/app/world/_canvas/nameplate'
import { TeamRing } from '@/app/world/_canvas/team-ring'
import { FaceCircle } from '@/app/world/_canvas/face-circle'
import { PeerVoice } from '@/app/world/_canvas/peer-voice'
import {
  clearFaces,
  localFace,
  localVoice,
  putFace,
  putVoice,
  useCamera,
  useFace,
  useMic,
  useVoice,
} from '@/app/world/_stores/face-store'
import { type FaceLinks, openFaceLinks } from '@/app/world/_video/face-links'
import type { FaceClient, FaceMessage } from '@/domain/world/faces'
import { FRESHEN_AFTER_MS } from '@/domain/world/turn'
// No `ChatMessage` or `showSaid` here, and that is the design rather than an
// oversight: this component draws bubbles but never receives them. Chat lives on
// its own `chat:<tenantId>` topic, owned by the rail, which announces speech
// through `said-store` - see the note on `saidsRef` below. This component owns
// the lounge/battle/hall topic and is its only subscriber.
import {
  type EmoteMessage,
  type RoomMessage,
  type EmoteState,
  noEmote,
  nothingSaid,
  type SaidState,
  sendIntervalFor,
  showEmote,
} from '@/app/world/_presence/presence-core'
import {
  MIN_PLAYOUT_DELAY,
  type MotionBuffer,
  newMotionBuffer,
  record,
  sample,
} from '@/app/world/_presence/peer-motion'
import {
  asAvatarClip,
  type AvatarClip,
  DEFAULT_AVATAR,
  isKnownLook,
} from '@/domain/lounge/avatars'
import { type EmoteId, isEmote } from '@/domain/world/emotes'
import {
  createInbox,
  createOutbox,
  RESEND_EVENT,
  RESEND_INTERVAL_MS,
  type Delivery,
  type InboxResult,
  type Outbox,
  type ReliableEvent,
  type ResendRequest,
  type Sequenced,
} from '@/app/world/_presence/reliable'
import { createClient } from '@/lib/supabase/client'
import { activeCollector, collecting, countReceived, countSent } from '@/app/world/perf/store'
import { channelStateOf, PerfProbe } from '@/app/world/perf/perf-probe'
import { PERF_ECHO, PERF_PING, type PerfEcho, type PerfPing } from '@/app/world/perf/wire'

/**
 * Other people in the room.
 *
 * The durable/ephemeral split this file exists to enforce: nothing here is ever
 * written to the event log. Position, heading and "is dancing" go out over a
 * Realtime channel and are gone when the tab closes, because where somebody is
 * standing is only interesting while they are standing there.
 *
 * Two different kinds of state, kept apart on purpose:
 *
 * - **Who is here** - names and avatars - is React state. It changes when
 *   somebody joins or leaves, which is rare, and a re-render is the right
 *   response to it.
 * - **Where they are** is a mutable ref, read inside useFrame. It changes twelve
 *   times a second per person, and putting that in state would re-render the
 *   whole scene continuously - the same reason <Targeting> only reports changes.
 */

/**
 * The slowest we ever send, and how long that is between packets.
 *
 * Eight, because every frame is fanned out to everyone in the room, so the
 * room's traffic grows with the *square* of its size - a 20-player room at 12Hz
 * is 4 800 messages a second leaving the server. Interpolation on the receiving
 * side is what actually makes movement look smooth, and it does that just as
 * well from eight samples as from twelve; see performancestudy/.
 *
 * It is the *floor* now rather than the rate: a room with three people in it
 * has none of the fan-out this number is afraid of and sends faster, which is
 * `sendHzFor`'s whole argument. What is left here is the worst case, which is
 * the case the constants below want - a hold long enough to cover the slowest
 * room is long enough to cover every other one.
 */
const SEND_HZ = 8
const SEND_INTERVAL = 1000 / SEND_HZ

/**
 * Resend even when nothing moved, so a peer who joined mid-stillness learns
 * where you are instead of waiting for you to twitch.
 */
const KEEPALIVE_MS = 2000

/** Movement below this is not worth a packet. */
const POSITION_EPSILON = 0.02
const YAW_EPSILON = 0.02

/*
 * `SMOOTHING = 11` used to live here, and remote bodies were eased toward the
 * newest packet with it. It is gone rather than tuned: easing chases a target
 * instead of replaying a timeline, so it wobbles the drawn speed by +-39% even
 * on a LAN, and no value of the constant removes that. See `peer-motion.ts`.
 */

/** Speeds above which a remote body walks, then runs. Matches the local gaits. */
const WALK_SPEED = 0.6
const RUN_SPEED = 10

/** What we tell everyone about ourselves. Terse because it goes out at `SEND_HZ`. */
interface MoveMessage {
  u: string
  x: number
  y: number
  z: number
  /** Heading in radians. */
  r: number
  d: boolean
  /**
   * A clip their body is playing, if it is not just walking about.
   *
   * ---------------------------------------------------------------------------
   * Why this is on the wire at all
   * ---------------------------------------------------------------------------
   * Sitting down used to be a fact about your own screen. `use-things` set the
   * body clip locally and said so in its own comment - nothing is written down,
   * nobody else's client is told - on the argument that presence already
   * carries where your body is. That is true and it is not enough: everyone
   * else saw you standing *at* the bench rather than sitting on it, so the clip
   * somebody chose for a seat was a clip only they ever saw.
   *
   * One short name, sent only while a body is doing something other than the
   * gait, is a small price for the difference between "I am sitting" and
   * "everyone can see I am sitting". It rides with movement rather than getting
   * its own event, for the same reason `h` does: it is a state rather than a
   * moment, so a client that missed a packet learns it from the next one
   * instead of being wrong until the pose ends.
   *
   * An emote is still its own event and still should be - see `EmoteMessage`.
   * That is a thing that *happened*; this is a thing that *is*.
   */
  c?: string
  /**
   * When this pose was true, on the *sender's* `performance.now()`.
   *
   * Optional, and the epoch is meaningless across machines - which is fine,
   * because `peer-motion` only ever compares stamps from one sender against
   * each other and estimates the constant offset away. What it buys is a
   * timeline the samples can be replayed on that is not polluted by how long
   * each packet happened to take to arrive. See `peer-motion.ts`.
   */
  t?: number
  /**
   * Health, 0..100.
   *
   * Rides along with movement rather than getting its own event, which makes it
   * self-healing in a way a one-shot broadcast is not: somebody who joins
   * mid-fight, or whose tab missed a packet, learns the right number from the
   * next position update instead of drawing a full bar over a player on their
   * last legs. One extra small integer at 12Hz is not worth a second channel.
   */
  h: number
  /**
   * The word for whatever is in their hand, if anything.
   *
   * A word rather than a model path, because that is what a pocket holds (see
   * `./hold` and `@/domain/thingiverse/pocket`) and because the receiver has to
   * resolve it against the shelf anyway to find out *how* it is held - the grip
   * is on the blueprint, and the blueprint is a row every client in the room
   * already has. Sending the model would send half the answer.
   *
   * Rides with movement for the same self-healing reason health and the kart
   * do: somebody who joins mid-game learns what everybody is carrying from the
   * next packet rather than from a one-shot they were not there for.
   */
  w?: string
  /**
   * The thing being driven, if any.
   *
   * Rides with movement for the same self-healing reason health does: somebody
   * who joins mid-drive learns to draw the kart under this body from the very
   * next packet, instead of needing a one-shot they were not there for.
   * Absent for a client that predates vehicles, which reads as on foot -
   * exactly what such a client is.
   */
  v?: string
  /**
   * Which seat of `v`, when it is not the wheel.
   *
   * Absent means the driver's - the first seat, which is the wheel by the
   * blueprint's own rule (see `drivable`). A passenger names theirs so every
   * client can *glue* their body to the vehicle instead of trusting packets:
   * a rider's position is derived from the driver's interpolated pose on the
   * receiving side, and drawing them from their own packets would hang them
   * one interpolation delay behind a fast kart.
   */
  s?: number
}

/**
 * "I hit you." Sent by the attacker, addressed to one person.
 *
 * Deliberately *not* "your health is now 40". The victim owns their own health;
 * this is a claim about an event, and what it does to them is their decision.
 */
interface HitMessage {
  /** Unique per swing, so a redelivered packet cannot land twice. */
  i: string
  /** Who swung. */
  f: string
  /** Who it landed on. */
  t: string
  /** Rolled by the attacker, clamped by the victim. */
  d: number
}

/**
 * "I fired this, from here, that way." Broadcast to the room.
 *
 * ---------------------------------------------------------------------------
 * The drawing and the damage are two messages on purpose
 * ---------------------------------------------------------------------------
 * This one is seen by everybody and costs nobody anything: it is a bullet
 * crossing a room, and every client draws it so that a fight looks like a fight
 * from the side. Whether it *hit* is a `HitMessage`, addressed to one person,
 * decided by the shooter exactly as a dash is - which keeps the rule this room
 * runs on intact (`_sim/combat.ts`: the victim owns their own health) and keeps
 * a bystander from doing arithmetic about somebody else's bar.
 *
 * Splitting them also makes a miss drawable, which is most of what makes aiming
 * feel like anything: a shot that only existed when it landed would be a room
 * where nobody ever sees a near miss.
 */
interface ShotMessage {
  /** Who fired. */
  f: string
  /** Where it left, in world units. */
  x: number
  y: number
  z: number
  /** Where it is going - the end of the flight, hit or miss. */
  tx: number
  ty: number
  tz: number
  /** What it looks like: a model id, and how big. */
  m: string
  c: number
  /** How fast, in cells a second. */
  s: number
}

/**
 * A shot somebody has just taken, as the scene hands it over.
 *
 * The scene decides *everything* about it - what is in your hand, whether the
 * cooldown is up, which way you are pointing, who is in the cone - because all
 * four of those are the scene's to know. What it cannot do is talk to the
 * socket, which is what this crosses. See `sendShotRef`.
 */
export interface PlayerShot {
  from: { x: number; y: number; z: number }
  to: { x: number; y: number; z: number }
  /** A model id, or absent for a swing - which has nothing to draw flying. */
  model?: string
  scale: number
  speed: number
  /** Who it landed on, by user id, or null for a miss. */
  hit: string | null
  damage: number
}

/**
 * "I kicked you." Sent by the kicker, addressed to one person.
 *
 * The same shape of claim as `HitMessage` and the same rule behind it: this
 * says a shove happened and how hard, not where the victim now is. Position is
 * theirs, the way health is theirs - two clients writing to one body is how you
 * get somebody rubber-banding between two rooms' idea of where they stand.
 *
 * No damage field, because a kick takes nothing. What it costs you is wherever
 * you end up.
 */
interface PushMessage {
  /** Unique per kick, so a redelivered packet cannot shove twice. */
  i: string
  /** Who kicked. */
  f: string
  /** Who it landed on. */
  t: string
  /** Horizontal impulse, in blocks per second. */
  x: number
  z: number
  /** Upward impulse. */
  up: number
}

/**
 * Where the ball is. Sent by whichever client is stepping it, and nobody else.
 *
 * The ball has one author, unlike health, which every client owns a slice of.
 * That difference is forced: health belongs to a person, so there is an obvious
 * candidate to own each one, while a ball belongs to nobody and two clients
 * simulating it would disagree within a second - and then disagree about whether
 * it crossed a line. So one peer steps it and the rest draw what they are told.
 * See `ballOwner`, which every client derives the same answer from.
 *
 * Velocity rides along with the position rather than being left for the receiver
 * to differentiate. It costs three small numbers and it means a peer whose packet
 * is late can carry on rolling the ball in roughly the right direction instead of
 * stopping dead between updates.
 */
interface BallMessage {
  u: string
  /**
   * Which *tab* sent it, where the sender is new enough to know it has one.
   *
   * `u` cannot do this job alone. Two tabs of the same person share a user id,
   * so a receiver filtering its own echo by `u` throws away the other tab's ball
   * as if it had sent it itself - and the two tabs never see each other at all.
   * Optional because a client that has not reloaded since this shipped sends no
   * `c`, and mid-deploy it is still identified by `u` at both ends.
   */
  c?: string
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /**
   * Seconds of kickoff pause left, or 0 while the ball is in play.
   *
   * On the wire because it is the owner's clock that decides it, and a countdown
   * every client ran locally would drift - people would be waved back on at
   * different moments and whoever's clock was fastest would get first touch.
   */
  k: number
}

/**
 * Somebody asking for the ball back on the centre spot.
 *
 * The one thing a non-owner is allowed to say about the ball, and it says
 * nothing about where the ball *is* - it is a request, honoured by the owner on
 * its own terms or ignored. That asymmetry is what keeps the single-author rule
 * intact while still letting the person who can see the problem fix it: the ball
 * has ended up somewhere nobody can kick it, and the client stepping it has no
 * way to know that, because a ball wedged behind a wall and a ball nobody is
 * chasing look identical from inside the simulation.
 *
 * No target and no position on purpose. Everything about where the ball goes
 * next is decided by the owner from `kickoffSpot`, so the worst a malicious
 * client can do with this is restart play at the centre - which is what the
 * button says it does.
 */
interface BallResetMessage {
  u: string
}

/*
 * There is deliberately no "I pushed it" message.
 *
 * There used to be: peers reported their contacts as impulses and the owner
 * applied them. But the owner already knows where every body in the room is -
 * the same transform map the dash judge reads - so it can resolve everybody's
 * contacts itself, against the one ball position that is actually authoritative.
 * The latency is the same either way (a peer's stale position here, versus a
 * peer's stale ball there), and one simulation with all the inputs beats two
 * half-simulations exchanging conclusions.
 */

/**
 * Everything the ball needs from the room it is rolling around in.
 *
 * Handed in rather than reached for, because this component knows about the channel
 * and nothing else: the goals come from the event log through the page, the solid
 * test belongs to the scene's block map, and what a goal *means* is the battle
 * room's business. All this file contributes is the one thing only it can - that
 * exactly one client is stepping the ball and everybody sees the same one.
 */
export interface FootballRuntime {
  /** The goals in this world, from the log. */
  goals: readonly Goal[]
  /** The scene's block map, for bouncing off what people built. */
  isSolid: SolidTest
  /**
   * Where the ball is being drawn, published for the scene to render.
   *
   * An out-parameter, like `transformsRef` and for the same reason: the mesh is
   * drawn by the scene, the position is decided here, and lifting either into the
   * other would mean lifting the whole channel or the whole block map.
   */
  ballRef: React.RefObject<Ball | null>
  /**
   * Seconds of kickoff pause left, published for the HUD to count down.
   *
   * A ref rather than state: it changes every frame, and putting it through React
   * would re-render the scene sixty times a second during the one moment everybody
   * is waiting and watching.
   */
  pauseRef?: React.RefObject<number>
  /**
   * Whether the client stepping the ball has stopped stepping it.
   *
   * The one failure this design cannot shrug off. Ownership fails over the
   * instant the owner's *presence* goes - see `ballOwner` at the sync handler -
   * but presence is a heartbeat the browser keeps sending from a tab that is no
   * longer rendering. Background a tab and `requestAnimationFrame` stops: the
   * owner is still in the room by every measure the channel has, and the ball
   * simply never moves again for anybody.
   *
   * Undetectable from presence, then, and only detectable here: the owner
   * broadcasts at a fixed 12Hz whether the ball is moving, paused or asleep, so
   * a gap in that stream means the simulation itself has stopped. Published for
   * the HUD, which is the honest fix - the room is told the match is stuck
   * instead of everybody concluding the game is broken.
   */
  stalledRef?: React.RefObject<boolean>
  /**
   * Whether the ball has stopped going anywhere at all.
   *
   * A different failure from `stalledRef` above, and the pair is worth reading
   * together: that one is the *simulation* having stopped, this one is the
   * simulation running perfectly and the ball being somewhere the game cannot
   * get it out of. The first is a warning, because nobody in the room can fix
   * it; this one comes with a button, because anybody can.
   *
   * Written on every client, not only the owner's - see `watchStuck`.
   */
  stuckRef?: React.RefObject<boolean>
  /**
   * A goal went in, as judged by whoever was stepping the ball.
   *
   * Only ever called on the owner's client - the one place a crossing is judged -
   * so the report goes to the server once rather than once per person watching.
   */
  onGoal?: (side: GoalTeam, by: string | undefined, ownGoal: boolean) => void
  /**
   * Which side somebody is on, for working out whether a goal was an own goal.
   *
   * Undefined for anybody not on the roster, which is how a spectator's stray touch
   * is kept out of the scoring.
   */
  sideOf?: (userId: string) => GoalTeam | undefined
  /**
   * Whether the ball may be touched at all.
   *
   * False before kickoff and after the final whistle, so a match that has not
   * started cannot be played and one that is over cannot be added to.
   */
  live: boolean
}

/** Somebody else in the room. Exported for `onPeers`, which hands the list out. */
export interface Peer {
  userId: string
  name: string
  avatar: string
}

/** Where a peer is going, and where we are currently drawing them. */
export interface PeerTransform {
  target: { x: number; y: number; z: number; yaw: number }
  current: { x: number; y: number; z: number; yaw: number }
  dancing: boolean
  /** The thing they are aboard, or null on foot. See `MoveMessage.v`. */
  driving: string | null
  /** Which seat of it. Zero is the wheel; meaningless while `driving` is null. */
  seat: number
  /** Last health we were told about. Drives their bar and whether they can be hit. */
  health: number
  /** The word for what is in their hand, or null. See `MoveMessage.w`. */
  held: string | null
  /**
   * A clip something is making their body play, or null for the gait.
   *
   * A *name*, not a clip: which animations exist is the scene's knowledge -
   * the pack's four plus whatever this space animated - and every client in the
   * room loaded the same list when it loaded the world. So the name goes on the
   * wire and each client resolves it against its own, exactly as the local body
   * already does. See `MoveMessage.c`.
   */
  pose: string | null
  /** Set on the first packet, so a joiner appears where they are, not at origin. */
  seeded: boolean
  /**
   * The last couple of seconds of this peer's poses, which is what they are
   * actually drawn from.
   *
   * `target` is still kept - the football code reads a peer's latest known
   * position to price a tackle, and for that it wants the freshest thing we
   * have, not the delayed one being drawn. Those are genuinely two different
   * questions and this is the seam between them: `target` is where they are,
   * `motion` is where they looked.
   */
  motion: MotionBuffer
}

/**
 * How many hit ids to remember for deduplication.
 *
 * A cap rather than an unbounded set: the room is long-lived and the only thing
 * this guards against is a packet arriving twice, which happens within seconds
 * if it happens at all. Anything older than a few hundred swings is not a
 * duplicate, it is history.
 */
const SEEN_HITS_LIMIT = 256

export type PresenceStatus = 'connecting' | 'live' | 'error'

/** Shortest signed distance between two angles, so 350° -> 10° turns 20° and
 * not 340°. Without it a body spins the long way round on every wrap. */
/**
 * Send something that has no next packet to correct it.
 *
 * Module level rather than a closure in the channel effect because the two
 * events that most need it - a hit and a kick - are decided in the frame loop,
 * by judges that already take the channel as an argument and now take the
 * outbox beside it.
 */
function sendSequenced(
  channel: RealtimeChannel,
  outbox: Outbox,
  event: ReliableEvent,
  message: object,
): void {
  countSent(event)
  void channel.send({
    type: 'broadcast',
    event,
    payload: outbox.stamp(event, message as Sequenced),
  })
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

/**
 * Which room this is.
 *
 * `lounge:<tenantId>` is the workspace's own room, gated on membership.
 * `battle:<battleId>` is one match, gated on that match's roster - which is how
 * two spaces can fight each other without either joining the other's lounge.
 * The two topic shapes have their own Realtime policies; see
 * 20260727010000_lounge_presence.sql and 20260803050000_battles.sql.
 */
export type ChannelTopic =
  | `lounge:${string}`
  | `battle:${string}`
  | `hall:${string}`

export function loungeTopic(tenantId: string): ChannelTopic {
  return `lounge:${tenantId}`
}

export function battleTopic(battleId: string): ChannelTopic {
  return `battle:${battleId}`
}

/**
 * A room's own channel.
 *
 * `hall:` rather than the obvious `room:` because `room:` is already taken -
 * homesteads use `room:<tenant>:<place>:<owner>`, and two Realtime policies
 * parsing the same prefix into different shapes is how a topic ends up readable
 * by somebody nobody meant to admit. See 20260820000000_rooms.sql.
 */
export function roomTopic(roomId: string): ChannelTopic {
  return `hall:${roomId}`
}

export function Multiplayer({
  topic,
  userId,
  name,
  avatar,
  dancing,
  posing = null,
  poseFor,
  aboard = null,
  onDriving,
  health,
  roomRef,
  onRoom,
  hostile,
  toneOf,
  football,
  onStatus,
  onCount,
  onPeers,
  onDamaged,
  onHitLanded,
  onPushed,
  party,
  partyHost,
  perf,
  faces = false,
  items,
}: {
  topic: ChannelTopic
  userId: string
  name: string
  avatar: string
  /**
   * Filled in with "tell the room the room changed".
   *
   * The same shape as `sendEmoteRef` in the ref bundle and for the same reason: the
   * caller is the scene, which knows *that* the world was rebuilt or the mode
   * flipped, and this component is the only thing holding the socket.
   *
   * Still a prop rather than part of the bundle, because it belongs to the mode
   * hook rather than to the frame loop - nothing inside a `useFrame` reads it.
   */
  roomRef?: React.RefObject<((message: Omit<RoomMessage, 'u'>) => void) | null>
  /** A change to the room itself, from somebody else. */
  onRoom?: (message: RoomMessage) => void
  /** Whether the lights are on, and whose switch it was. See ../party-glow. */
  party?: boolean
  partyHost?: string | null
  dancing: boolean
  /**
   * A clip a thing is making this body play, or null while it is just walking
   * about.
   *
   * Broadcast, which sitting down never used to be - see `MoveMessage.c` for
   * why that was half a feature. Defaulted rather than required, because two
   * other rooms mount this component and neither has anything to sit on yet.
   */
  posing?: string | null
  /**
   * A clip name, turned into something a body can play.
   *
   * Handed in rather than resolved here, because which clips a space has made
   * is the *scene's* knowledge - it is loaded with the world - and this
   * component has no business fetching one. The same argument `BodyModel.pose`
   * makes about being handed what to play rather than sent looking for it.
   *
   * Absent means the space made none, which is most rooms: a name that is not
   * one of the pack's own four then simply leaves the body standing, exactly as
   * it does for our own.
   */
  poseFor?: (clip: string) => THREE.AnimationClip | null
  /**
   * The vehicle seat we are in, or null on foot.
   *
   * Seat zero is the wheel; anything else is riding along. A prop like
   * `dancing` rather than a ref, because it changes when a person gets in or
   * out - a rare, render-worthy event - and the send loop mirrors it into a
   * ref itself, exactly as it does the dance.
   */
  aboard?: { thing: string; seat: number } | null
  /**
   * A peer took or left a wheel.
   *
   * Lifted out of the frame path because the scene renders from it: the thing
   * a peer is driving must stop being drawn parked. Called only on change,
   * and with null when the peer goes, so a driver who closes the tab does not
   * leave an invisible kart in the room.
   */
  onDriving?: (userId: string, thingId: string | null) => void
  /** Our own health, 0..100. Owned by the scene; broadcast from here. */
  health: number
  /**
   * Whether a dash of ours may hurt this person.
   *
   * Omitted means everyone is fair game, which is the lounge: it has no sides,
   * so there is nobody a charge should pass through. A team match passes a
   * check that returns false for a team-mate, which is the whole of friendly
   * fire being off - the swing still happens, it simply does not land.
   */
  hostile?: (peerUserId: string) => boolean
  /**
   * Whose side somebody is on, for their nameplate.
   *
   * Separate from `hostile` even though a team match answers both from the same
   * roster, because they are asked at different moments and about different
   * things: `hostile` is consulted per dash inside the frame loop and decides
   * whether a hit lands; this is consulted per render and decides what colour a
   * label is. Returning undefined means "no sides here", which is the lounge
   * and every free-for-all.
   */
  toneOf?: (peerUserId: string) => PlateTone | undefined
  /**
   * The ball, if this room has one.
   *
   * Omitted everywhere but a football match, and its absence is what keeps every
   * other room exactly as it was - no ball packets, no goal tests, no extra work in
   * the frame loop.
   */
  football?: FootballRuntime
  onStatus: (status: PresenceStatus) => void
  onCount: (count: number) => void
  /**
   * The roster itself, by name, for anything outside the canvas that wants to
   * list the room rather than count it - the sidebar, today.
   *
   * Optional and separate from `onCount` on purpose: a battle passes neither,
   * and the count is what the HUD has always wanted. Fired on presence sync,
   * which is a few times a minute, not at packet rate.
   */
  onPeers?: (peers: Peer[]) => void
  /** Somebody hit us, by name. The scene decides what that does to our health. */
  onDamaged: (damage: number, attacker: string) => void
  /** We hit somebody. Local feedback only - their health is theirs to reduce. */
  onHitLanded: (damage: number, name: string) => void
  /**
   * Somebody kicked us. The scene hands the impulse to the character
   * controller, which is the only thing allowed to move us.
   */
  onPushed: (x: number, z: number, lift: number) => void
  /**
   * Measure this room, and say so in it.
   *
   * Present only when the `perf` flag resolved true for this space on the
   * server that rendered the page - see `src/domain/flags/keys.ts`. Its absence
   * is the whole of collection being off: no `<PerfProbe>` is mounted, so there
   * is no frame subscriber, no ping and no write, and every `countSent` below
   * is a null check against a store nothing has armed.
   *
   * An object rather than a boolean because the row needs a workspace to belong
   * to, and `topic` cannot supply one - a `battle:` topic names a match that two
   * spaces may be fighting in, and a `hall:` topic names a room rather than its
   * owner. This is the space whose flag admitted the write, which is also the
   * space an operator switched collection on for.
   */
  perf?: { tenantId: string }
  /**
   * Draw people's cameras over their bodies, if they switch one on.
   *
   * Off unless the `faces` flag resolved true for this space - see
   * `src/domain/flags/keys.ts`. Its absence is the whole of the feature being
   * gone: no signalling handler, no peer connections, no switch in the HUD, and
   * therefore nothing that could ever ask anybody for a camera.
   *
   * A boolean rather than an object like `perf`, because nothing about it
   * belongs to a workspace. Nothing here is written down anywhere - a picture
   * goes directly from one browser to another and exists for as long as both
   * tabs are open, which puts it on the ephemeral side of the same line
   * everything else in this file sits on.
   */
  faces?: boolean
  /**
   * The shelf, as "what does this word look like", for drawing what people are
   * carrying. Passed straight through to the bodies - see `RemoteAvatar`.
   */
  items?: ReadonlyMap<string, ItemLook>
}) {
  /**
   * The eight refs this used to be handed, now asked for.
   *
   * Five are read - where we are, which way we face, the dash and kick to judge,
   * the invulnerability window - and three are written *out*: the transform map,
   * the speech bubbles and the "pull this face" callback. That in/out split is
   * why they were props in the first place, and it is exactly what made the
   * signature twenty-five long. See ./scene-refs.
   *
   * `healthRef` is deliberately not taken from the bundle: this component keeps
   * its own mirror of the `health` prop a few lines down, and the two are
   * different things - one is the loop's copy for the network, the other is this
   * component's copy for its own effect dependencies.
   */
  const {
    playerRef,
    headingRef,
    dashRef,
    kickRef,
    invulnerableUntilRef,
    sendEmoteRef,
    sendShotRef,
    resetBallRef,
    saidsRef,
    transformsRef,
  } = useSceneRefs()

  const supabase = useMemo(() => createClient(), [])

  const [peers, setPeers] = useState<Peer[]>([])
  const transforms = useRef(new Map<string, PeerTransform>())

  /** Publish the map to the scene, and take it back down on the way out. */
  useEffect(() => {
    transformsRef.current = transforms.current
    return () => {
      transformsRef.current = null
    }
  }, [transformsRef])
  const channelRef = useRef<RealtimeChannel | null>(null)

  /**
   * Mirrored into a ref so the send loop can read it without `dancing` being a
   * dependency of the effect below - flipping it must not tear down the channel
   * and rebuild it. Synced in an effect rather than assigned during render,
   * which is the rule React actually asks for.
   */
  const dancingRef = useRef(dancing)
  useEffect(() => {
    dancingRef.current = dancing
  }, [dancing])

  /**
   * The same trick for whatever a thing is making the body play.
   *
   * It changes when somebody sits down and again when they stand up, which is
   * often, and a socket that reopened on each would be a socket that reopened
   * every time anybody used a bench.
   */
  const posingRef = useRef(posing)
  useEffect(() => {
    posingRef.current = posing
  }, [posing])

  /** Same trick for health: it changes mid-fight and must not reopen the channel. */
  const healthRef = useRef(health)
  useEffect(() => {
    healthRef.current = health
  }, [health])

  /** And for the seat: getting into a kart must not reopen the channel either. */
  const aboardRef = useRef(aboard)
  useEffect(() => {
    aboardRef.current = aboard
  }, [aboard])

  /**
   * The football runtime, behind a ref for the same reason the callbacks are.
   *
   * The goals array and the solid test are rebuilt whenever the scene re-renders -
   * a block placed, a goal resized - and having them in the channel effect's
   * dependencies would tear the subscription down mid-match.
   */
  const footballRef = useRef(football)
  useEffect(() => {
    footballRef.current = football
  }, [football])

  /**
   * The ball itself, and who is currently stepping it.
   *
   * `ball` is null until the owner has something to say, so a client that joins
   * mid-match draws nothing rather than a ball at the origin - the same reason a
   * peer's transform is seeded from its first packet instead of from zero.
   */
  const ball = useRef<Ball | null>(null)
  const ballPause = useRef(0)

  /**
   * What we are drawing, on the frames where somebody else is stepping the ball.
   *
   * Strictly downstream of `ball` above, which stays the wire's word and the only
   * thing anything is ever reported from. This is the picture: predicted forward
   * between packets and eased back into line as they arrive. See `BallPrediction`
   * and `DrawnBall` for why a ball gets this and a body does not.
   */
  const prediction = useRef<BallPrediction>({
    drawn: null,
    from: null,
    stride: undefined,
    touched: 0,
  })
  /** The winner of the election - a connection key, not a person. See `conn`. */
  const owner = useRef<string | null>(null)

  /**
   * This tab, as distinct from this person.
   *
   * Minted per subscription, and the reason it exists is that everything else
   * here identifies a *player*: presence is keyed by user id, and so is every
   * "not my own echo" filter on the channel. That is right for a body, which one
   * person has one of however many tabs they open, and wrong for the ball, which
   * one *client* steps. Without it, both tabs of the lowest-sorting player elect
   * themselves owner, cannot see each other, and run two simulations that
   * disagree - and count the same goal twice under two different ids, defeating
   * the decider's deduplication into the bargain.
   *
   * `useState` rather than a ref, because this is a value that is decided once
   * and never set again - a lazily filled ref is the same thing with a write
   * during render, which React 19 rightly refuses. Falling back to the user id
   * where there is no `crypto` to mint one, which is exactly how a client from
   * before this shipped is identified: one tab per person again, but a coherent
   * one.
   */
  const [conn] = useState(() => crypto?.randomUUID?.() ?? userId)

  /**
   * Whether our own camera is on, for the room and for the links.
   *
   * The switch itself lives in the HUD, several components above the canvas, so
   * the value comes out of a module store rather than down a prop - see
   * `face-store`. Read as state here because presence has to carry it: the
   * roster is what tells the far end there is anything to connect *for*.
   */
  const camera = useCamera()
  const microphone = useMic()

  /**
   * Whether we have anything to send at all - a camera, a microphone, or both.
   *
   * One boolean on presence rather than two, because the roster's only question
   * is "should anybody connect to this tab". Which of the two tracks is
   * actually carrying something is decided by `replaceTrack` on a connection
   * that already exists, and needs to reach nobody but us.
   */
  const cameraOn = faces && (camera === 'on' || microphone === 'on')

  /**
   * The same fact behind a ref, for the two readers that must not re-subscribe.
   *
   * `track()` reads it inside the channel effect and `openFaceLinks` reads it
   * on every reconcile; listing `cameraOn` as a dependency of either would tear
   * the socket - or every peer connection in the room - down and build it again
   * because somebody pressed a button.
   */
  const cameraOnRef = useRef(cameraOn)
  useEffect(() => {
    cameraOnRef.current = cameraOn
  }, [cameraOn])

  /** The links themselves, when the flag is on. Null is the feature being off. */
  const faceLinks = useRef<FaceLinks | null>(null)

  /**
   * Where to gather ICE candidates, fetched rather than compiled in.
   *
   * Empty until the first fetch lands, and empty is a working configuration
   * rather than a missing one - host candidates alone connect two people on one
   * network, and two people who both have IPv6. So a link built in the second
   * before this arrives is not broken, only less likely to find a route.
   *
   * A ref because `openFaceLinks` reads it per connection: relay credentials
   * expire, and a link built an hour in has to be built against the set that is
   * current then. See `@/domain/world/turn`.
   */
  const iceRef = useRef<RTCIceServer[]>([])

  /**
   * The room as the face code wants it: every tab, with its camera state.
   *
   * Kept because a reconcile is driven by two different things - a presence
   * sync, and our own camera being switched - and only the first of them comes
   * with a roster attached.
   */
  const faceRoom = useRef<FaceClient[]>([])

  /**
   * Whether this client is measuring the room. See `perf` on the props.
   *
   * A boolean pulled out of the object so it can be a dependency of the channel
   * effect without the object's identity - a fresh `{ tenantId }` on every
   * render of the scene - tearing the socket down and rebuilding it.
   */
  const measuring = Boolean(perf)

  /**
   * The connections that will answer a ping, refreshed on every presence sync.
   *
   * A ref rather than state: the prober reads it from a timer, and a room where
   * somebody joining re-rendered the whole canvas would be paying for the
   * diagnostic in the currency the diagnostic exists to measure.
   */
  const pingTargets = useRef<string[]>([])

  /**
   * When the owner's last ball packet landed, for spotting a stalled owner.
   *
   * Zero means "nothing yet", which the frame loop seeds rather than reads as a
   * stall: a client in its first second in the room has not heard from anybody
   * about anything, and that is not the same as a room whose ball has died.
   */
  const lastBallSeen = useRef(0)

  /**
   * When we became the owner, for holding off the kickoff seed.
   *
   * A brand new owner with no ball cannot tell "the match has not started" from
   * "the previous owner's next packet has not arrived yet", and the two want
   * opposite things: one wants a ball at the kickoff spot, the other wants the
   * ball already in play. Waiting `BALL_ADOPT_GRACE` before seeding resolves it
   * without a handover protocol - the outgoing owner sends at 12Hz, so a packet
   * arriving inside that window settles the question, and if none does the match
   * really was not running. Zero means "not the owner as of last frame".
   */
  const ownedSince = useRef(0)

  /**
   * How long the ball has been sitting where it is.
   *
   * Kept by every client rather than only the owner, because the button it feeds
   * belongs to whoever is looking at the pitch. See `watchStuck`, which is where
   * the "is this stuck or is nobody chasing it" question is answered - and
   * deliberately answered as "offer the button", never as "move the ball".
   */
  const stuckWatch = useRef<StuckWatch>(noStuckWatch())

  /**
   * When somebody last asked for the ball back, or 0.
   *
   * Set by our own button and by the request handler alike, so it makes no
   * difference whether the person who pressed it is the one stepping the ball.
   * Read and cleared by the owner on its next frame; harmlessly ignored by
   * everybody else, because only the owner ever acts on it.
   */
  const resetAsked = useRef(0)

  /**
   * Where each body was last frame, for turning positions into velocities.
   *
   * The contact model wants *momentum* - how fast is this body closing on the
   * ball - and neither our own controller nor the transform map stores a
   * velocity, only positions. Differentiating them here, per frame, gives the
   * owner an estimate for every body in the room, including its own; a dash
   * shows up as a body moving at 26 blocks a second without anybody flagging it.
   *
   * Keyed by userId, ourselves included. Entries for people who left are pruned
   * in the frame loop, or the map outlives every visitor the room ever had.
   */
  const strides = useRef(new Map<string, { x: number; z: number }>())

  /**
   * The two callbacks, behind a ref for the same reason.
   *
   * They are recreated on renders the scene does for unrelated reasons - a block
   * being placed, a picture being selected - and having them in the channel
   * effect's dependency array would tear the Realtime subscription down and
   * build it again mid-fight, losing every packet in between.
   */
  const handlers = useRef({ onDamaged, onHitLanded, onPushed })

  /** Same shape for the wheel report: read from socket handlers, never a dep. */
  const onDrivingRef = useRef(onDriving)
  useEffect(() => {
    onDrivingRef.current = onDriving
  }, [onDriving])
  useEffect(() => {
    handlers.current = { onDamaged, onHitLanded, onPushed }
  }, [onDamaged, onHitLanded, onPushed])

  /**
   * Same trick for the friendly-fire check: the roster it closes over changes
   * whenever somebody joins, and that must not reopen the channel mid-match.
   */
  const hostileRef = useRef(hostile)
  useEffect(() => {
    hostileRef.current = hostile
  }, [hostile])

  /**
   * Same trick again for the room handler.
   *
   * It closes over the scene's state, so it is a fresh function every render -
   * and this one absolutely must not be a dependency of the channel effect: a
   * reopened channel is what produces "cannot add presence callbacks after
   * subscribe()".
   */
  const onRoomRef = useRef(onRoom)
  useEffect(() => {
    onRoomRef.current = onRoom
  }, [onRoom])

  /** Names, for the "you hit Sam for 22%" readout. Peers live in state, which
   * the frame loop must not read, so the loop gets its own copy. */
  const names = useRef(new Map<string, string>())

  /** Hit ids already applied, so a redelivered packet cannot damage us twice. */
  const seenHits = useRef(new Set<string>())

  /**
   * The sequencer for the events that happen once - see `world/reliable`.
   *
   * Deliberately *outside* the channel effect, and that placement is the whole
   * reason a reconnect recovers instead of resyncing. A sequence belongs to this
   * client's session, not to its socket: a fresh outbox on every resubscribe
   * would restart our counter at one, and every peer - still expecting the
   * number we were on before the socket dropped - would read the whole of our
   * next minute as duplicates and discard it silently.
   *
   * Keeping the inbox across the same boundary is what makes the disconnect
   * *itself* recoverable. Everything broadcast while we were away is a hole in
   * somebody's sequence, so the first packet after resubscribing reveals the
   * gap and asks for exactly the range we missed.
   *
   * What it does *not* survive is this component unmounting, and it should not
   * pretend to: a fresh outbox is a fresh run of one-two-three. That is why it
   * is made with `conn`, whose lifetime is exactly the same - see `Sequenced.c`
   * in `world/reliable` for what the far end does with it, and for the silent
   * one-way failure that comes of leaving it off.
   */
  const outbox = useRef(createOutbox(conn))
  const inbox = useRef(createInbox())

  /** Faces peers are currently pulling, read from the frame loop like positions. */
  const emotes = useRef(new Map<string, EmoteState>())

  /** Lines peers have just said, read the same way and drawn above the faces. */
  const saids = useRef(new Map<string, SaidState>())

  /** Publish the bubbles to the scene, and take them back down on the way out. */
  useEffect(() => {
    saidsRef.current = saids.current
    return () => {
      saidsRef.current = null
    }
  }, [saidsRef])

  useEffect(() => {
    /**
     * `private: true` makes Realtime check the policies in the lounge presence
     * migration before letting us in. Without that flag the topic would be open
     * to anyone holding the anon key who could guess a tenant id, which for
     * private team spaces is not a tradeoff worth making.
     */
    const channel = supabase.channel(topic, {
      config: { private: true, presence: { key: userId } },
    })
    channelRef.current = channel

    /**
     * The four handlers that used to sit inline in the `.on` chain below.
     *
     * Lifted out because they now have two callers: a message that arrives in
     * sequence is applied as it always was, and one that arrives early is held
     * by the inbox and applied later, out of `pump`. Nothing inside them
     * changed - a body that is correct to run on arrival is correct to run on
     * delivery, because the sequencer only ever reorders and deduplicates.
     */
    function applyRoom(message: RoomMessage): void {
    // Our own echo is not news: the sender already applied the change, and
    // for `world` it is already reloading.
    if (!message?.u || message.u === userId) return
    onRoomRef.current?.(message)
    }

    function applyHit(message: HitMessage): void {
    // Everyone on the channel sees every hit; only the addressee acts on it.
    // Bystanders learn the outcome from the victim's next health update
    // rather than by doing the arithmetic themselves, which is what keeps
    // one player's health from having two authors.
    if (!message?.i || message.t !== userId) return

    if (seenHits.current.has(message.i)) return
    if (seenHits.current.size >= SEEN_HITS_LIMIT) seenHits.current.clear()
    seenHits.current.add(message.i)

    // Spawn protection. Checked on the receiving side because it is our
    // health being defended, and an attacker's clock is not ours to trust.
    if (performance.now() < (invulnerableUntilRef.current ?? 0)) return

    // Resolved to a name here rather than in the scene, because the roster
    // lives on this side of the channel and "you were taken out by
    // 8f3c-…-a71" is not a thing to put on a death screen.
    handlers.current.onDamaged(
      sanitiseDamage(message.d),
      names.current.get(message.f) ?? 'Someone',
    )
    }

    function applyPush(message: PushMessage): void {
    if (!message?.i || message.t !== userId) return

    if (seenHits.current.has(message.i)) return
    if (seenHits.current.size >= SEEN_HITS_LIMIT) seenHits.current.clear()
    seenHits.current.add(message.i)

    // Spawn protection covers being shoved as well as being hurt. A kick
    // does no damage, but a kick into the lava does - and being launched
    // off the spawn point before you have had a frame to move is the exact
    // thing the grace period exists to prevent.
    if (performance.now() < (invulnerableUntilRef.current ?? 0)) return

    handlers.current.onPushed(
      sanitiseImpulse(message.x, KICK_IMPULSE),
      sanitiseImpulse(message.z, KICK_IMPULSE),
      // Clamped at zero from below: a "kick" that drives somebody
      // downwards is not a thing the verb can do, and would be a way to
      // push people through floors.
      Math.max(0, sanitiseImpulse(message.up, KICK_LIFT)),
    )
    }

    function applyBallReset(message: BallResetMessage): void {
    if (!message?.u) return
    resetAsked.current = performance.now()
    }

    function apply({ event, message }: Delivery): void {
      switch (event) {
        case 'room':
          applyRoom(message as RoomMessage)
          return
        case 'hit':
          applyHit(message as HitMessage)
          return
        case 'push':
          applyPush(message as PushMessage)
          return
        case 'ball-reset':
          applyBallReset(message as BallResetMessage)
          return
      }
    }

    /** Hand over what is ready, and ask for what is missing. */
    function pump(result: InboxResult): void {
      for (const held of result.deliver) apply(held)
      if (result.request) {
        countSent('other')
        void channel.send({
          type: 'broadcast',
          event: RESEND_EVENT,
          payload: result.request,
        })
      }
      if (result.skipped > 0 && process.env.NODE_ENV !== 'production') {
        // The one thing this module must not do is lose messages quietly - a
        // silent write-off is the bug it was built to end. Dev only, because in
        // production the person who needs to know is not looking at a console.
        console.warn(
          `[lounge] gave up on ${result.skipped} broadcast(s) nobody resent`,
        )
      }
    }

    /**
     * Take one message off the channel, in sequence.
     *
     * `from` is passed rather than read off the payload because the four shapes
     * disagree about where the sender's id lives, and because the check has to
     * happen *before* the addressee filter inside the handlers: a `hit` aimed at
     * somebody else is a message this client will never act on, but its loss
     * still has to be noticed, or the next `room` looks contiguous when it is
     * not. See `world/reliable`.
     */
    function receive(
      event: ReliableEvent,
      from: string | undefined,
      payload: unknown,
    ): void {
      if (!from) return
      pump(
        inbox.current.accept(event, from, payload as Sequenced, performance.now()),
      )
    }

    /** Everything we send that cannot be restated by a later packet. */
    function sendReliable(event: ReliableEvent, message: object): void {
      sendSequenced(channel, outbox.current, event, message)
    }

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{
          userId: string
          name: string
          avatar: string
          conn?: string
          /**
           * This client's camera is on. See `faces` on the props.
           *
           * On presence for exactly the reason `perf` below is: the far end has
           * to know there is something to connect *for*. Without it, either
           * every pair in the room holds an idle connection against the
           * possibility of a camera, or a camera switched on has no way to
           * announce itself. One boolean on a payload already being sent is
           * cheaper than either - see the header of `@/domain/world/faces`.
           */
          face?: boolean
          /**
           * This client is measuring the room. See `perf` on the props.
           *
           * On the presence payload rather than inferred, because the round
           * trip probe has to know *who will answer a ping*: a client whose
           * space has collection off does not echo, and counting its silence as
           * a lost packet would report a broken network where there is only a
           * flag. It is also what lets a room say how much of it is measured.
           */
          perf?: boolean
        }>()

        const next: Peer[] = []
        /**
         * Every *connection* in the room, which is not the same list as `next`.
         *
         * Peers are people - one entry each, our own excluded, because that is
         * what a roster and a set of drawn bodies want. The election wants tabs:
         * both of somebody's, and ours among them.
         */
        const clients: BallClient[] = []
        /** Other tabs that will answer a ping - see `perf` on the entry above. */
        const measuring: string[] = []
        /**
         * Every tab again, this time with its camera state.
         *
         * A third list rather than a field on one of the two above, because it
         * is the only one that includes *us*: `wantedLinks` is asked "given the
         * room, and given that you are in it, what should you be holding", and
         * a roster with our own camera missing from it would have us calling
         * people we have nothing to send.
         */
        const cameras: FaceClient[] = []
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (entry.userId) {
              clients.push({ userId: entry.userId, conn: entry.conn ?? '' })
            }
            if (entry.userId && entry.conn) {
              cameras.push({
                userId: entry.userId,
                conn: entry.conn,
                face: Boolean(entry.face),
              })
            }
            if (entry.perf && entry.conn && entry.conn !== conn) {
              measuring.push(entry.conn)
            }
            // Our own body is drawn by <SelfAvatar>, which knows about the
            // camera and the view toggle. Drawing it twice would mean fighting
            // over one position with a network round trip in between.
            if (!entry.userId || entry.userId === userId) continue
            if (next.some((peer) => peer.userId === entry.userId)) continue

            next.push({
              userId: entry.userId,
              name: entry.name || 'Someone',
              /**
               * A look we no longer ship must not become a 404 mid-scene - and
               * `isKnownLook`, not `isKnownAvatar`, because a look is now one
               * of two things. The animal roster answers "no" to every skin, so
               * this guard was replacing `adventurers/Knight` with the default
               * penguin: you switched to your XP body, the wire carried it, and
               * every other person in the lounge watched you turn back into
               * somebody else. The rooms' presence (`_presence/room-presence`)
               * was fixed for exactly this and the lounge's copy was not.
               */
              avatar: isKnownLook(entry.avatar) ? entry.avatar : DEFAULT_AVATAR,
            })
          }
        }

        setPeers(next)
        onCount(next.length)
        onPeers?.(next)

        /**
         * Who should be connected to whom, recomputed from scratch.
         *
         * Every sync rather than only on a change, and it is cheap enough to be
         * uninteresting: the reconciler compares the answer against the
         * connections it holds and does nothing when they agree. Doing it on
         * every sync is what makes a client that missed an event - a tab that
         * was asleep while somebody left - converge anyway.
         */
        faceRoom.current = cameras
        faceLinks.current?.reconcile(cameras)

        pingTargets.current = measuring
        // The room size that produced this window's traffic. Fan-out is
        // quadratic in it, so a packet rate without it says very little.
        activeCollector()?.notePeers(next.length)

        names.current = new Map(next.map((peer) => [peer.userId, peer.name]))

        /**
         * Who is stepping the ball, re-derived from the room every sync.
         *
         * Not negotiated, and that is the whole point: everybody sorts the same
         * roster the same way, so the answer needs no round of messages and the
         * *instant* the owner's presence disappears the next person in order takes
         * over. A handover protocol would have to survive the owner's tab closing
         * without warning, which is exactly when it is needed.
         *
         * Our own connection is included here even though we are excluded from
         * `peers` - we are as eligible as anybody, and a room where the only
         * occupant was never the owner would have a ball nobody moved. Added by
         * hand when the state does not have it yet: the first sync can land
         * before our own `track` has come back round, and a client that read that
         * sync as "not me" would hand the ball to somebody else for a moment.
         */
        if (!clients.some((client) => client.conn === conn)) {
          clients.push({ userId, conn })
        }

        owner.current = ballOwner(clients)

        // Drop transforms for people who left, or the map grows for the life of
        // the session.
        const present = new Set(next.map((peer) => peer.userId))
        for (const key of transforms.current.keys()) {
          if (!present.has(key)) {
            // Their kart stops being theirs the moment they are gone - the
            // parked row (or the loan sweep) is the truth from here. Only a
            // driver was hiding anything; a passenger's leaving hid nothing.
            const gone = transforms.current.get(key)
            if (gone?.driving && gone.seat === 0) onDrivingRef.current?.(key, null)
            transforms.current.delete(key)
          }
        }
        for (const key of emotes.current.keys()) {
          if (!present.has(key)) emotes.current.delete(key)
        }
        for (const key of saids.current.keys()) {
          if (!present.has(key)) saids.current.delete(key)
        }
        /**
         * Somebody who has left will not be resending anything.
         *
         * Without this their last hole stays open for its full grace period and
         * then counts as a write-off, which reads in the console as loss the
         * network never caused.
         *
         * Connections *and* people, because that is how the inbox files a
         * stream: by `c` for anybody whose messages carry one, by user id for
         * anybody's that do not. A roster of user ids alone would throw away
         * every connection-keyed stream in the room on the first sync, which
         * costs nothing visible - the next message re-adopts - but re-opens
         * every gap in flight at the time.
         *
         * A returning client needs no help from this any more: it comes back on
         * a fresh sequence *and* a fresh connection, so its numbers land in a
         * slot of their own rather than behind the mark the last one left.
         */
        inbox.current.keep(
          new Set([...present, ...clients.map((client) => client.conn)]),
        )
      })

      .on('broadcast', { event: 'room' }, ({ payload }) => {
        countReceived('room', performance.now())
        receive('room', (payload as RoomMessage)?.u, payload)
      })
      .on('broadcast', { event: 'emote' }, ({ payload }) => {
        countReceived('emote', performance.now())
        const message = payload as EmoteMessage
        if (!message?.u || message.u === userId) return
        // A face we cannot draw is a face nobody sees - see `isEmote`.
        if (!isEmote(message.e)) return

        let slot = emotes.current.get(message.u)
        if (!slot) {
          slot = noEmote()
          emotes.current.set(message.u, slot)
        }
        showEmote(slot, message.e)
      })
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        const message = payload as MoveMessage
        if (!message?.u || message.u === userId) return

        const existing = transforms.current.get(message.u)
        const target = { x: message.x, y: message.y, z: message.z, yaw: message.r }
        // Tolerated rather than required, so a client that has not reloaded
        // since combat shipped reads as unhurt instead of instantly dead.
        const health = typeof message.h === 'number' ? message.h : MAX_HEALTH

        // One clock for the buffer, and it is ours: `record` and `sample` must
        // agree, and they do not care that the sender's epoch is different.
        const arrived = performance.now()
        // The same clock again, deliberately reused rather than re-read: the
        // two numbers describe one arrival and there is nothing to be gained by
        // them disagreeing by a microsecond.
        countReceived('move', arrived)

        const wheeled = message.v ?? null
        const seat = message.s ?? 0
        /**
         * Only the wheel makes a thing *driven* - a passenger of a parked kart
         * is aboard it, and hiding the kart from its cell over that would make
         * it vanish under whoever sat down in it.
         */
        const drives = wheeled && seat === 0 ? wheeled : null

        if (existing) {
          const drove =
            existing.driving && existing.seat === 0 ? existing.driving : null
          if (drove !== drives) onDrivingRef.current?.(message.u, drives)
          existing.target = target
          existing.dancing = message.d
          existing.driving = wheeled
          existing.seat = seat
          existing.health = health
          existing.held = message.w ?? null
          existing.pose = message.c ?? null
          record(existing.motion, target, message.t ?? null, arrived)
        } else {
          const motion = newMotionBuffer()
          record(motion, target, message.t ?? null, arrived)
          transforms.current.set(message.u, {
            target,
            // Seeded to the first known position rather than the origin, so a
            // peer does not visibly slide in from the middle of the world.
            current: { ...target },
            dancing: message.d,
            driving: wheeled,
            seat,
            health,
            held: message.w ?? null,
            pose: message.c ?? null,
            seeded: true,
            motion,
          })
          if (drives) onDrivingRef.current?.(message.u, drives)
        }
      })
      /*
        Somebody else's bullet, drawn and nothing else.

        Not sequenced and not deduplicated, unlike a hit: a tracer that arrives
        twice is one extra bullet drawn for half a second, and one that never
        arrives is a shot you did not see. Neither is worth an ack, and the
        thing that *does* need exactly-once - what it cost the person it hit -
        travels as its own addressed message.
      */
      .on('broadcast', { event: 'shot' }, ({ payload }) => {
        countReceived('shot', performance.now())
        const message = payload as ShotMessage
        if (!message?.m || message.f === userId) return
        fireTracer({
          model: message.m,
          scale: message.c,
          speed: message.s,
          from: { x: message.x, y: message.y, z: message.z },
          to: { x: message.tx, y: message.ty, z: message.tz },
        })
      })
      .on('broadcast', { event: 'hit' }, ({ payload }) => {
        countReceived('hit', performance.now())
        receive('hit', (payload as HitMessage)?.f, payload)
      })
      /**
       * Somebody kicked us.
       *
       * Deduplicated out of the same set as hits - the ids are uuids, so there
       * is nothing to collide, and one bounded set beats two. A redelivered
       * push matters more than a redelivered hit, not less: it would shove us
       * twice as far as the kicker saw, and end the argument about where
       * anybody is standing in the kicker's favour.
       */
      .on('broadcast', { event: 'push' }, ({ payload }) => {
        countReceived('push', performance.now())
        receive('push', (payload as PushMessage)?.f, payload)
      })
      /**
       * Where the ball is, according to whoever is stepping it.
       *
       * Adopted outright rather than eased toward, unlike a peer's body. A ball
       * changes direction sharply and often - off a wall, off a boot - and smoothing
       * that would round the corners off every bounce, putting the drawn ball
       * somewhere the owner's ball never was. Since the owner is also the one judging
       * whether it crossed a line, a smoothed copy would disagree with the score.
       *
       * Ignored when it comes from any client but the current owner, so one that
       * has not yet seen the owner leave cannot keep writing to everybody's ball.
       * By connection rather than by person, unlike every other handler here: our
       * *own* second tab is a different client with the same user id, and the
       * whole point of the election is that only one of the two steps the ball.
       * Filtering that by user id would leave the other tab unable to see the
       * ball it is not stepping.
       *
       * Except while we have no ball at all. A client that joins or reloads
       * mid-match usually sees its first presence sync before the outgoing owner's
       * next packet, and if its id sorts lowest it has already elected itself by
       * the time that packet lands - so the strict rule would discard the only copy
       * of where the ball actually is, and the seed below would restart the match
       * from the kickoff spot. Nothing can be hijacked by relaxing it here: there
       * is no ball to overwrite, and only a client that believes it is the owner
       * broadcasts at all.
       */
      .on('broadcast', { event: 'ball' }, ({ payload }) => {
        countReceived('ball', performance.now())
        const message = payload as BallMessage
        if (!message?.u) return
        // Whoever sent it, in the terms the election uses - see `ballClientKey`.
        // Only our own connection is an echo: a packet carrying our user id but
        // not our connection is our *other* tab, and if it is the owner we want
        // it, which is the entire point of the pair.
        const from = message.c || message.u
        if (from === conn) return
        if (owner.current && from !== owner.current && ball.current) return

        ball.current = {
          x: message.x,
          y: message.y,
          z: message.z,
          vx: message.vx,
          vy: message.vy,
          vz: message.vz,
        }
        ballPause.current = message.k
        // Proof the owner's frame loop is still turning. Stamped here rather
        // than on any ball message, because a packet from a client that is no
        // longer the owner says nothing about the one that is.
        lastBallSeen.current = performance.now()
      })
      /**
       * Somebody wants the ball back on the centre spot.
       *
       * Noted by everybody and acted on by the owner alone, which is the point:
       * ownership changes hands without warning, and a request routed only to
       * whoever was the owner when the button was pressed would vanish if that
       * tab closed a moment later. Recording it everywhere costs one number.
       *
       * No filter on the sender. Anybody in the room may ask - the person who
       * can see the ball behind the wall is rarely the one stepping it - and the
       * owner decides. See `BallResetMessage` for why that is safe.
       */
      .on('broadcast', { event: 'ball-reset' }, ({ payload }) => {
        countReceived('ball-reset', performance.now())
        receive('ball-reset', (payload as BallResetMessage)?.u, payload)
      })
      /**
       * Somebody missed something of ours.
       *
       * The reply is another broadcast rather than a private message, because
       * Realtime has no private lane and the alternative would be a channel per
       * pair. Everybody hears the answer; everybody who already had it drops it
       * as a duplicate, which is exactly what the inbox's "behind the mark"
       * rule is for. The cost of answering loudly is one extra small message per
       * hole per room, and the cost of not doing it is the bug this is for.
       */
      /**
       * One end of a video call arranging itself with the other.
       *
       * Not put through the sequencer, unlike `room` and `hit`, and the reason
       * is that the loss it has to survive is broader than the one the
       * sequencer repairs. A missing offer is a connection that never comes up
       * - and so is a failed ICE negotiation, a peer that reloaded halfway
       * through, and a route that stopped working when somebody walked out of
       * wifi range. One timer that notices a link is not carrying anything
       * covers all four; a resend request covers the first and leaves the rest.
       * See the watchdog in `face-links`.
       *
       * Everybody in the room hears every message, and all but one drops it on
       * the address - the same arrangement `hit` and `push` use, for the same
       * reason: Realtime has no private lane, and the alternative is a channel
       * per pair.
       */
      .on('broadcast', { event: 'face' }, ({ payload }) => {
        countReceived('other', performance.now())
        faceLinks.current?.accept(payload)
      })
      .on('broadcast', { event: RESEND_EVENT }, ({ payload }) => {
        countReceived('other', performance.now())
        const ask = payload as ResendRequest
        // Only the sender named answers. Without this every client in the room
        // would replay its own unrelated history at whoever asked.
        if (ask?.u !== userId) return
        // And only the tab named, where the asker knew which one. Our sequence
        // is this mount's; another tab of ours holds a different one, and its
        // reply to a request meant for us is numbers that fit nobody's stream.
        if (ask.c && ask.c !== conn) return
        for (const held of outbox.current.replay(ask.from, ask.to)) {
          countSent(held.event)
          void channel.send({
            type: 'broadcast',
            event: held.event,
            payload: held.message,
          })
        }
      })
      /**
       * Somebody is timing the room, and we are this ping's addressee.
       *
       * Registered unconditionally rather than behind the flag, because adding
       * or removing a handler means reopening the channel - and a reopened
       * channel is what produces "cannot add presence callbacks after
       * subscribe()". It is inert without a sender: nothing broadcasts `perf`
       * events unless some client has collection armed.
       *
       * `collecting()` is the gate on *answering*, and it is the same flag read
       * from the other end. A client whose space has collection off does not
       * echo, and the prober knows not to ask it - see `perf` on the presence
       * payload, which is how a target is chosen in the first place.
       *
       * Addressed to one connection rather than answered by everybody: the
       * obvious version costs one reply per person in the room per ping, which
       * is the quadratic fan-out this whole diagnostic is supposed to be
       * measuring rather than adding to.
       */
      .on('broadcast', { event: PERF_PING }, ({ payload }) => {
        const ask = payload as PerfPing
        countReceived('ping', performance.now())
        if (!collecting()) return
        if (!ask?.n || ask.to !== conn) return
        countSent('ping')
        void channel.send({
          type: 'broadcast',
          event: PERF_ECHO,
          payload: { n: ask.n, to: ask.from } satisfies PerfEcho,
        })
      })
      /**
       * Our own nonce, back again.
       *
       * The elapsed time is read here, off the same `performance.now()` that
       * stamped the ping - one clock from end to end, which is the only reason
       * this number means anything. See the header of `collector.ts` for why
       * there is no one-way version of it.
       */
      .on('broadcast', { event: PERF_ECHO }, ({ payload }) => {
        const echo = payload as PerfEcho
        const now = performance.now()
        countReceived('ping', now)
        if (!echo?.n || echo.to !== conn) return
        activeCollector()?.noteEcho(echo.n, now)
      })
      .subscribe((status) => {
        // Before the branches below, so a state nothing else acts on -
        // `CLOSED`, or a `TIMED_OUT` that recovers - is still recorded. A room
        // that spent five minutes reconnecting is exactly what this is for.
        activeCollector()?.noteChannel(channelStateOf(status))
        if (status === 'SUBSCRIBED') {
          onStatus('live')
          // `conn` rides along with the person: presence is keyed by user id, so
          // this is the only place the room can learn that one of its players is
          // two clients. See `ballOwner`.
          void channel.track({
            userId,
            name,
            avatar,
            conn,
            perf: measuring,
            // From the ref, so that switching a camera on does not appear in
            // this effect's dependencies and take the socket with it. The
            // effect below re-tracks when it changes.
            face: cameraOnRef.current,
          })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Surfaced rather than swallowed: the most likely cause is the
          // presence migration not being applied, and silent absence of other
          // people is indistinguishable from nobody being online.
          onStatus('error')
        }
      })

    /**
     * Holes do not announce themselves.
     *
     * A sender who has gone quiet - or gone entirely - produces no further
     * arrivals, so nothing would drive the retry or the give-up timer from
     * `accept` alone. This is the clock that does, and it is the same interval
     * the inbox rate-limits requests to, so a hole is asked about roughly once
     * per sweep until it fills or expires.
     */
    const sweeping = setInterval(() => {
      pump(inbox.current.sweep(performance.now()))
    }, RESEND_INTERVAL_MS)

    if (roomRef) {
      roomRef.current = (message) => {
        sendReliable('room', { ...message, u: userId } satisfies RoomMessage)
      }
    }

    /**
     * The HUD's "fetch the ball" button.
     *
     * Noted locally as well as sent, rather than waiting for our own broadcast
     * to come back - Realtime does not echo to the sender, so an owner pressing
     * its own button would otherwise be the one client in the room the request
     * never reached.
     */
    resetBallRef.current = () => {
      resetAsked.current = performance.now()
      sendReliable('ball-reset', { u: userId } satisfies BallResetMessage)
    }

    /**
     * A shot somebody just fired: drawn for the room, charged to one person.
     *
     * Both halves go out from here because both need the socket, and they are
     * deliberately two messages - see `ShotMessage`. The victim's bar is
     * dropped locally on the way past for the same reason `judgeDash` does it:
     * waiting for their next packet puts a round trip between the impact and
     * the feedback, and at that distance a hit reads as not having registered.
     */
    sendShotRef.current = (shot: PlayerShot) => {
      if (shot.model) {
        countSent('shot')
        void channel.send({
          type: 'broadcast',
          event: 'shot',
          payload: {
            f: userId,
            x: +shot.from.x.toFixed(2),
            y: +shot.from.y.toFixed(2),
            z: +shot.from.z.toFixed(2),
            tx: +shot.to.x.toFixed(2),
            ty: +shot.to.y.toFixed(2),
            tz: +shot.to.z.toFixed(2),
            m: shot.model,
            c: shot.scale,
            s: shot.speed,
          } satisfies ShotMessage,
        })
      }

      if (!shot.hit) return

      sendReliable('hit', {
        i: crypto.randomUUID(),
        f: userId,
        t: shot.hit,
        d: shot.damage,
      } satisfies HitMessage)

      const state = transforms.current.get(shot.hit)
      if (state) state.health = Math.max(0, state.health - shot.damage)
      handlers.current.onHitLanded(shot.damage, names.current.get(shot.hit) ?? 'them')
    }

    sendEmoteRef.current = (id: EmoteId) => {
      if (!isEmote(id)) return
      countSent('emote')
      void channel.send({
        type: 'broadcast',
        event: 'emote',
        payload: { u: userId, e: id } satisfies EmoteMessage,
      })
    }

    return () => {
      clearInterval(sweeping)
      // Cleared alongside the channel, so a picker click during teardown cannot
      // reach a socket that is on its way out.
      sendEmoteRef.current = null
      sendShotRef.current = null
      resetBallRef.current = null
      if (roomRef) roomRef.current = null
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [
    supabase,
    topic,
    userId,
    // Fixed for the life of the component, so listing it re-subscribes nothing.
    conn,
    /**
     * Decided on the server that rendered the page, so in practice this is as
     * fixed as `conn` is and listing it re-subscribes nothing either. Listed
     * anyway, because it is read inside `track()`: if it ever did change, a
     * roster still advertising the old answer would have peers pinging a client
     * that has stopped echoing.
     */
    measuring,
    name,
    avatar,
    invulnerableUntilRef,
    sendEmoteRef,
    sendShotRef,
    resetBallRef,
    roomRef,
    onStatus,
    onCount,
    onPeers,
  ])

  // --- faces ---------------------------------------------------------------

  /**
   * The peer connections, for as long as the flag is on.
   *
   * A second effect rather than a few more lines in the channel one, because
   * the two have different lifetimes and different reasons to restart. The
   * channel is torn down when the room changes; this is torn down when the
   * feature is switched off for the space, which in practice is never. Folding
   * them together would mean a resubscribe rebuilt every call in the room.
   *
   * `send` reads the channel through its ref rather than closing over one, so
   * the ordering between the two effects does not matter: nothing is sent
   * before a presence sync, and a presence sync cannot happen before there is a
   * channel to have produced it.
   */
  useEffect(() => {
    if (!faces) return

    const links = openFaceLinks({
      self: () => ({ userId, conn, face: cameraOnRef.current }),
      stream: () => localFace(),
      voice: () => localVoice(),
      ice: () => iceRef.current,
      send: (message: FaceMessage) => {
        countSent('other')
        void channelRef.current?.send({
          type: 'broadcast',
          event: 'face',
          payload: message,
        })
      },
      onStream: putFace,
      onVoice: putVoice,
    })

    faceLinks.current = links
    // Whatever we already knew about the room. Usually nothing - this runs on
    // mount, before the first sync - but not when the flag arrives late.
    links.reconcile(faceRoom.current)

    return () => {
      faceLinks.current = null
      links.close()
      // The pictures go with the connections that were producing them. Leaving
      // them in the store would leave faces hanging over bodies fed by streams
      // whose tracks have stopped.
      clearFaces()
    }
  }, [faces, userId, conn])

  /**
   * The relay's address and an hour's permission to use it.
   *
   * Fetched once on the way in and refreshed on a timer, rather than per
   * connection: it is the same answer for every link, and asking again for each
   * one would put a round trip in front of every call in the room.
   *
   * A failure is swallowed on purpose. There may be no relay configured at all
   * - that is every developer machine, and production until a box is running
   * one - and the room should behave exactly the same way in both cases:
   * connect the pairs that can reach each other directly, and quietly fail to
   * connect the rest. A thrown error here would take the scene down over a
   * feature nobody in the room may even have switched on.
   */
  useEffect(() => {
    if (!faces) return

    let live = true

    const fetchIce = async () => {
      try {
        const response = await fetch('/api/world/ice')
        if (!response.ok) return
        const body = (await response.json()) as { iceServers?: RTCIceServer[] }
        if (!live || !Array.isArray(body.iceServers)) return
        iceRef.current = body.iceServers
      } catch {
        // Host candidates only, then. See above.
      }
    }

    void fetchIce()
    // Comfortably inside the credential's life, so that one never expires
    // between the roster saying connect and the connection being built.
    const freshening = setInterval(() => void fetchIce(), FRESHEN_AFTER_MS)

    return () => {
      live = false
      clearInterval(freshening)
    }
  }, [faces])

  /**
   * Our camera changed, so the room has to be told and the calls redialled.
   *
   * Two steps and they are not interchangeable. `track` is what puts the new
   * answer on presence, which is how the *far* ends learn there is now
   * something to connect for. The `reconcile` is for us: presence sync does
   * fire locally after a track, but this way the connection we are about to
   * make does not wait on a round trip to the server and back.
   */
  useEffect(() => {
    if (!faces) return

    const channel = channelRef.current
    if (channel) {
      void channel.track({
        userId,
        name,
        avatar,
        conn,
        perf: measuring,
        face: cameraOn,
      })
    }

    /**
     * Two different questions, and only the first used to be asked.
     *
     * `reconcile` decides which connections should exist - which changes only
     * when somebody arrives, leaves, or is admitted by the cap. `retrack` puts
     * our camera into the ones that already exist, which is all a button press
     * actually changes. Asking only the first is what used to rebuild every
     * connection in the room over one person's switch.
     */
    faceLinks.current?.reconcile(faceRoom.current)
    faceLinks.current?.retrack()
  }, [faces, cameraOn, userId, name, avatar, conn, measuring])

  // --- outbound ------------------------------------------------------------
  const lastSent = useRef<{
    at: number
    x: number
    y: number
    z: number
    yaw: number
    dancing: boolean
    driving: string | null
    seat: number
    health: number
    held: string | null
    pose: string | null
  }>({
    at: 0,
    x: NaN,
    y: NaN,
    z: NaN,
    yaw: NaN,
    dancing: false,
    driving: null,
    seat: 0,
    health: NaN,
    held: null,
    pose: null,
  })

  /** When the owner last broadcast the ball. Its own budget, like `lastSent`. */
  const lastBallSent = useRef(0)

  useFrame((_, delta) => {
    const channel = channelRef.current
    if (!channel) return

    judgeDash({
      channel,
      outbox: outbox.current,
      userId,
      dash: dashRef.current,
      transforms: transforms.current,
      names: names.current,
      hostile: hostileRef.current,
      onHitLanded: handlers.current.onHitLanded,
    })

    judgeKick({
      channel,
      outbox: outbox.current,
      userId,
      kick: kickRef.current,
      transforms: transforms.current,
      hostile: hostileRef.current,
    })

    if (footballRef.current) {
      runBall({
        channel,
        userId,
        conn,
        // Clamped for the same reason the character controller clamps: a frame that
        // ran long must not teleport the ball through a wall.
        delta: Math.min(delta, BALL_MAX_DELTA),
        // Unclamped, and only for differencing bodies - see `addBody`. The
        // distance a body moved accrued over the real elapsed time, so dividing
        // it by the clamped step would invent speed that nobody travelled at.
        elapsed: delta,
        football: footballRef.current,
        ball,
        pause: ballPause,
        owner: owner.current,
        player: playerRef.current,
        transforms: transforms.current,
        strides: strides.current,
        lastBallSent,
        lastBallSeen,
        ownedSince,
        stuckWatch,
        resetAsked,
        prediction: prediction.current,
      })
    }

    const now = performance.now()
    const since = now - lastSent.current.at
    /*
      How often we send follows how many people are listening.

      `transforms` is the room, one entry per peer we have heard from, and it is
      the cheapest honest count there is - the roster is React state that a
      frame loop has no business reading, and the presence map is keyed by user
      rather than by connection. It is read fresh every frame rather than
      cached, so somebody arriving steps the rate down on their first packet
      rather than at the next resubscribe.

      Nothing is announced. The receiver measures what it is being sent - see
      `sendHzFor` and the header of `peer-motion.ts`.
    */
    if (since < sendIntervalFor(transforms.current.size)) return

    const player = playerRef.current
    // Heading, not pitch. Nobody needs to know we are looking at our shoes.
    const yaw = Math.atan2(headingRef.current.x, headingRef.current.z)

    const moved =
      Math.abs(player.x - lastSent.current.x) > POSITION_EPSILON ||
      Math.abs(player.y - lastSent.current.y) > POSITION_EPSILON ||
      Math.abs(player.z - lastSent.current.z) > POSITION_EPSILON ||
      Math.abs(angleDelta(lastSent.current.yaw, yaw)) > YAW_EPSILON ||
      lastSent.current.dancing !== dancingRef.current ||
      // So do the wheels: a packet is what tells the room the kart under you
      // appeared or went away, and the keepalive is two seconds of ghost car.
      lastSent.current.driving !== (aboardRef.current?.thing ?? null) ||
      lastSent.current.seat !== (aboardRef.current?.seat ?? 0) ||
      // Taking a pistol out of your pocket is worth a packet for the same
      // reason getting into a kart is: until one goes out, the room draws you
      // empty-handed - and the keepalive is two seconds of invisible gun.
      lastSent.current.held !== (heldNow() ?? null) ||
      // Health counts as movement for the purposes of "is this worth a packet".
      // Waiting out the keepalive would leave a bar two seconds stale, which in
      // a fight that lasts four hits is most of the fight.
      lastSent.current.health !== healthRef.current ||
      // And so does sitting down. Two seconds of standing at a bench you are
      // already on is exactly as wrong as two seconds of an empty hand holding
      // a pistol, and for the same reason: the keepalive is the floor, not the
      // answer.
      lastSent.current.pose !== (posingRef.current ?? null)

    if (!moved && since < KEEPALIVE_MS) return

    lastSent.current = {
      at: now,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw,
      dancing: dancingRef.current,
      driving: aboardRef.current?.thing ?? null,
      seat: aboardRef.current?.seat ?? 0,
      health: healthRef.current,
      held: heldNow() ?? null,
      pose: posingRef.current ?? null,
    }

    countSent('move')
    void channel.send({
      type: 'broadcast',
      event: 'move',
      payload: {
        u: userId,
        // Rounded before it goes on the wire. Nobody can see a millimetre, and
        // shorter numbers mean smaller frames twelve times a second.
        x: +player.x.toFixed(2),
        y: +player.y.toFixed(2),
        z: +player.z.toFixed(2),
        r: +yaw.toFixed(3),
        d: dancingRef.current,
        h: healthRef.current,
        // Absent rather than null on foot, and the seat absent at the wheel -
        // the fields cost nothing until somebody is actually aboard something.
        // Absent when your hands are empty, and when the body is just walking
        // about, which is most of the time for both.
        ...(heldNow() ? { w: heldNow() } : {}),
        ...(aboardRef.current ? { v: aboardRef.current.thing } : {}),
        ...(aboardRef.current && aboardRef.current.seat !== 0
          ? { s: aboardRef.current.seat }
          : {}),
        ...(posingRef.current ? { c: posingRef.current } : {}),
        // Whole milliseconds: the receiver interpolates over ~125ms spans, so a
        // fractional millisecond is below anything it could draw.
        t: Math.round(now),
      } satisfies MoveMessage,
    })
  })

  /**
   * Put one ping on the wire, addressed to one peer.
   *
   * Here rather than in the probe because this component is the only thing
   * holding the socket - the same division `sendEmoteRef` and `resetBallRef`
   * already make. Counted like any other packet, so the diagnostic's own
   * traffic shows up as a `ping` line in the breakdown instead of hiding inside
   * the numbers it is reporting.
   */
  const sendPing = useCallback(
    (to: string, id: string) => {
      const channel = channelRef.current
      if (!channel) return
      countSent('ping')
      void channel.send({
        type: 'broadcast',
        event: PERF_PING,
        payload: { n: id, from: conn, to } satisfies PerfPing,
      })
    },
    [conn],
  )

  /**
   * The worst link in the room, as `peer-motion` already measures it.
   *
   * Read at the end of a window rather than sampled, because both numbers are
   * running estimates that are always current - the buffer recomputes them on
   * every packet. The worst rather than the mean: a room is as good as whoever
   * is having the hardest time in it, and averaging five good links with one
   * terrible one describes nobody in the room.
   */
  const worstLink = useCallback(() => {
    let jitterMs: number | null = null
    let delayMs: number | null = null
    for (const transform of transforms.current.values()) {
      const { jitter, delay } = transform.motion
      if (jitterMs === null || jitter > jitterMs) jitterMs = jitter
      if (delayMs === null || delay > delayMs) delayMs = delay
    }
    return { jitterMs, delayMs }
  }, [])

  /**
   * How many other bodies are in the room, asked for at the end of a window.
   *
   * `notePeers` on its own is not enough, and the readout was quietly wrong
   * because of it: it is called from the presence handler, and the counter is
   * cleared when a window closes - so any fifteen seconds in which nobody
   * joined or left recorded a room of *zero*, however many people were standing
   * in it. Every steady room under-reported its own size, which is the one
   * number the fan-out arithmetic on the performance page multiplies by.
   *
   * A ref rather than the `peers` array, for the same reason `worstLink` is a
   * callback: `<PerfProbe>` holds this in an effect dependency, and a function
   * whose identity changed whenever somebody walked in would restart the window
   * timers - so a busy room would be the one that never finished a window.
   */
  const roomSize = useCallback(() => names.current.size, [])

  return (
    <>
      {peers.map((peer) => (
        <RemoteAvatar
          key={peer.userId}
          peer={peer}
          transforms={transforms}
          aboardRef={aboardRef}
          emotes={emotes}
          saids={saids}
          tone={toneOf?.(peer.userId)}
          party={party}
          partyHost={partyHost === peer.userId}
          items={items}
          poseFor={poseFor}
        />
      ))}
      {/*
        Measurement, and only when the flag said so.

        Inside the canvas because frame time is what the canvas knows - the
        probe subscribes to R3F's own loop rather than starting a second
        `requestAnimationFrame` beside it. Mounted here rather than in the scene
        because everything it needs, except the frame loop, is this component's:
        the channel, the connection id and the interpolation buffers.
      */}
      {perf && (
        <PerfProbe
          channelRef={channelRef}
          topic={topic}
          tenantId={perf.tenantId}
          conn={conn}
          targetsRef={pingTargets}
          onPing={sendPing}
          worstLink={worstLink}
          roomSize={roomSize}
        />
      )}
    </>
  )
}


/**
 * Longest frame the ball simulation will honour, in seconds.
 *
 * The same 20fps floor the character controller uses, and for the same reason: a
 * tab that was backgrounded and woke up owing four seconds of physics must not
 * advance the ball four seconds' worth in one step, straight through a wall and out
 * of the world. Clamping loses a little travel and keeps the ball on the pitch.
 */
const BALL_MAX_DELTA = 1 / 20

/**
 * How often the owner tells the room where the ball is.
 *
 * Deliberately faster than `SEND_INTERVAL`, and no longer tied to it. Bodies are
 * broadcast by every player, so their cost is quadratic in room size and worth
 * economising on; the ball has exactly one owner, so its cost is a single stream
 * no matter how full the pitch is. It is also the fastest thing on screen, which
 * makes it the first place a lower rate would show.
 */
const BALL_SEND_INTERVAL = 1000 / 12

/**
 * How long a new owner waits for an inherited ball before seeding a kickoff.
 *
 * Six times `BALL_SEND_INTERVAL`, so a handover from a live owner is settled by
 * several packets rather than by the one that might have been dropped. Short
 * enough to disappear inside `KICKOFF_PAUSE` when there really is no match in
 * progress, which is the only case where the wait costs anything at all.
 */
const BALL_ADOPT_GRACE = 500

/**
 * How long a silent owner is given before the room is told the ball is stuck.
 *
 * Two seconds is about two dozen missed packets at the rate above, which no
 * ordinary hiccup produces - a dropped frame, a garbage collection or a bad
 * second of wifi all recover well inside it. Lower and a commuter on a train
 * would set it off constantly; much higher and the room has already spent long
 * enough kicking at a dead ball to conclude the game is broken, which is the
 * conclusion this exists to prevent.
 */
const BALL_STALL_MS = 2000

/**
 * Everything a client that is *not* stepping the ball needs to draw one.
 *
 * One object rather than three refs because the three are only ever meaningful
 * together, and because becoming the owner has to forget all of them at once -
 * see `forget` below. Nothing in here is authoritative and nothing in here is
 * ever broadcast; it is a picture, kept locally, of a ball somebody else owns.
 */
interface BallPrediction {
  /** The ball as drawn, with whatever error is left to ease away. */
  drawn: DrawnBall | null
  /**
   * The wire ball this was last folded in, held by identity.
   *
   * The broadcast handler builds a fresh object per packet, so `!==` is a
   * perfectly good "there is news" test and needs no sequence number on the wire.
   * Comparing positions instead would miss the packet that says the ball is
   * exactly where it was, which is the one that ends a prediction.
   */
  from: Ball | null
  /** Where our own body stood last frame, for the touch we resolve ourselves. */
  stride: { x: number; z: number } | undefined
  /**
   * When we last resolved a touch of our own, or 0 once the owner has agreed.
   *
   * `performance.now()`, milliseconds - not the seconds the simulation runs on.
   * See `BALL_PREDICT_HOLD`, which is the only thing that reads it.
   */
  touched: number
}

/** Throw the picture away, for a client that has just become the ball's author. */
function forget(prediction: BallPrediction): void {
  prediction.drawn = null
  prediction.from = null
  prediction.stride = undefined
  prediction.touched = 0
}

/**
 * How long a touch of our own outranks a packet, in milliseconds.
 *
 * A round trip, roughly, and every hop is in it: our body goes out at `SEND_HZ`,
 * waits out the owner's playout delay before it is drawn there at all, the
 * contact is resolved on that frame, and the ball comes back at
 * `BALL_SEND_INTERVAL`. Every packet that lands in the meantime is describing a
 * ball that has not been kicked yet.
 *
 * Derived rather than a round number, because the middle term stopped being a
 * constant. It used to be the lag of easing toward the newest packet - about
 * 105ms at `SMOOTHING = 11` - and 400 covered the chain comfortably. Replaying
 * from a buffer draws a peer `MIN_DELAY` in the past at best and `MAX_DELAY` at
 * worst, so a hard 400 would now expire *before* the owner had seen the touch on
 * a link with any jitter: our own kick would be overruled by a packet describing
 * a ball we had already hit. That reads as the ball refusing to move.
 *
 * Sized on `MIN_DELAY` rather than `MAX_DELAY`. A peer whose link is bad enough
 * to open the buffer to its ceiling would need well over a second here, and a
 * second of holding a contact the owner never confirms is worse than losing the
 * touch - the note below about being wrong for a moment rather than a match
 * still governs.
 *
 * Rarely spent in full - `ballAcked` releases the hold as soon as the owner's
 * ball starts moving the way we said - so this is the budget for the case where
 * the owner never agrees at all, which is a touch that only happened on our
 * screen.
 */
const BALL_PREDICT_HOLD = SEND_INTERVAL + MIN_PLAYOUT_DELAY + BALL_SEND_INTERVAL

/**
 * Step the ball, or draw the one we were sent.
 *
 * A module function taking everything it touches, exactly like `judgeDash` and for
 * the same reasons: it has no business reading React state, everything it needs is
 * already a plain mutable object by the time a frame runs, and the one piece of the
 * feature where authority actually matters can be read on its own.
 *
 * Two entirely different jobs depending on who we are, which is why the branch is
 * near the top and wide:
 *
 *   * **The owner** estimates every body's velocity, resolves every contact -
 *     its own and each peer's - advances the simulation, decides whether the
 *     ball crossed a line, runs the kickoff pause, and broadcasts.
 *   * **Everybody else** draws the ball they were last told about, carried
 *     forward between packets and eased back into line as they land, and
 *     resolves their own body's touch on it a round trip early. Nothing they do
 *     leaves the machine: the owner reaches the same conclusions from its own
 *     copy of their body a packet later, which is what makes the prediction safe
 *     to make and safe to be wrong about.
 *
 * Nobody does both. That is the invariant the whole feature rests on - and note
 * which side of it the prediction sits on: it never writes to `ball`, so the
 * position every client answers "is this ball stuck" from is still the one
 * position all of us were sent.
 */
function runBall({
  channel,
  userId,
  conn,
  delta,
  elapsed,
  football,
  ball,
  pause,
  owner,
  player,
  transforms,
  strides,
  lastBallSent,
  lastBallSeen,
  ownedSince,
  stuckWatch,
  resetAsked,
  prediction,
}: {
  channel: RealtimeChannel
  /** Who we are, for bodies and for credit on a goal. */
  userId: string
  /** Which tab we are, which is what ownership is decided between. */
  conn: string
  /** Clamped, for stepping the simulation. */
  delta: number
  /** Real time since the last frame, for differencing bodies. */
  elapsed: number
  football: FootballRuntime
  ball: React.RefObject<Ball | null>
  pause: React.RefObject<number>
  owner: string | null
  player: THREE.Vector3
  transforms: Map<string, PeerTransform>
  /** Last frame's body positions, for turning drawn movement into velocity. */
  strides: Map<string, { x: number; z: number }>
  lastBallSent: React.RefObject<number>
  /** When the owner's last packet landed, for spotting a stalled owner. */
  lastBallSeen: React.RefObject<number>
  /** When we took the ball over, for holding off the kickoff seed. */
  ownedSince: React.RefObject<number>
  /** How long the ball has sat where it is, for offering it back. */
  stuckWatch: React.RefObject<StuckWatch>
  /** When somebody last asked for it back, or 0. Owner-only business. */
  resetAsked: React.RefObject<number>
  /** The ball as we are drawing it, while somebody else is stepping it. */
  prediction: BallPrediction
}): void {
  const {
    goals,
    isSolid,
    ballRef,
    pauseRef,
    stalledRef,
    stuckRef,
    onGoal,
    sideOf,
    live,
  } = football
  // By connection, not by person: two tabs of one player are two clients here,
  // and only the one that won the election steps anything.
  const isOwner = owner === conn
  const now = performance.now()

  /**
   * Has the ball gone anywhere lately?
   *
   * Before the branch, and so on every client rather than only the owner's:
   * everybody is looking at the same published position, so everybody reaches
   * the same answer, and the button belongs to whoever can see the problem. The
   * clock only runs while play is actually live - a still ball before kickoff,
   * during the pause after a goal or after the whistle is a still ball for the
   * right reasons.
   */
  stuckWatch.current = watchStuck(
    stuckWatch.current,
    ball.current,
    live && pause.current <= 0,
    now,
  )
  if (stuckRef) stuckRef.current = stuckWatch.current.stuck

  /**
   * Nobody is stepping the ball yet, or the match is not running.
   *
   * The ball is still *published* if we have one, so the mesh does not blink out
   * between the final whistle and the result screen - it simply stops moving, which
   * is what a ball does when everybody stops playing.
   */
  if (!live) {
    ballRef.current = ball.current
    if (pauseRef) pauseRef.current = pause.current
    // A match that is not running is not a match that is stuck, and warning
    // about a silent owner between the whistle and the result screen would fire
    // the alarm at the one moment silence is correct.
    if (stalledRef) stalledRef.current = false
    ownedSince.current = 0
    // Dropped rather than banked. A request made while the whistle was going is
    // not a request to restart the next match from the centre spot.
    resetAsked.current = 0
    // Nothing to predict while nothing is being played, and a picture kept over
    // the break would be folded into the first packet of the next match as if it
    // were the same ball's journey.
    forget(prediction)
    return
  }

  if (!isOwner) {
    if (pauseRef) pauseRef.current = pause.current

    /**
     * Is the owner still turning?
     *
     * The clock starts on the first frame we spend as a non-owner rather than at
     * zero, so joining a room does not accuse whoever is stepping the ball of
     * having died before we had any chance to hear from them. After that a gap
     * wider than `BALL_STALL_MS` is real: the owner sends at 12Hz unconditionally,
     * so silence that long is roughly two dozen frames that never happened.
     */
    if (lastBallSeen.current === 0) lastBallSeen.current = now
    if (stalledRef) {
      stalledRef.current = now - lastBallSeen.current > BALL_STALL_MS
    }
    ownedSince.current = 0
    /**
     * Ours was sent, and the owner's copy is the one that counts.
     *
     * Cleared every frame we are not the owner, so a request cannot sit in this
     * ref waiting for us to inherit the ball - a tab that pressed the button ten
     * minutes ago and later won an election would restart play from the centre
     * spot the instant it took over, for no reason anybody could see.
     */
    resetAsked.current = 0

    /**
     * Our own stride, kept here because the owner's `strides` map is not.
     *
     * Recorded before any of the branches below take an early exit, so the one
     * thing it must never do cannot happen: differencing this frame's position
     * against a stride left over from before a kickoff pause would read the walk
     * back to the centre spot as a body arriving at a sprint, and fire the ball
     * off the pitch the instant play resumed. A missing stride is a body standing
     * still for one frame, which is the safe answer - see `bodyVelocity`.
     */
    const stride = prediction.stride
    prediction.stride = { x: player.x, z: player.z }

    const wire = ball.current
    /**
     * A ball being held, or one we have never been told about.
     *
     * Snapped either way, and not predicted at all: through a kickoff pause the
     * owner is pinning the ball to the centre spot every frame, so extrapolating
     * the velocity it happens to be carrying would have it roll off the spot and
     * be dragged back by every packet. The one moment the naive draw was right.
     */
    if (!wire || pause.current > 0) {
      prediction.drawn = wire ? drawnBall(wire) : null
      prediction.from = wire
      // A ball on the spot settles every argument about a touch there was: play
      // stopped, and nothing we predicted about the last ball applies to this one.
      prediction.touched = 0
      ballRef.current = wire
      return
    }

    if (!prediction.drawn) {
      prediction.drawn = drawnBall(wire)
      prediction.from = wire
    } else if (prediction.from !== wire) {
      prediction.from = wire
      /**
       * News, unless it is news from before a touch of our own.
       *
       * Everything that arrives inside `BALL_PREDICT_HOLD` of our own contact
       * describes a ball nobody has kicked yet - our body has to reach the owner
       * over the wire, be drawn there, and the resulting ball has to come back -
       * so folding it in would hand the kick back and take it away again a packet
       * later. Held instead, and released the moment `ballAcked` says the owner
       * has come to the same conclusion, which is usually well inside the window.
       *
       * The window is a ceiling rather than the plan: if the owner never agrees -
       * a touch that its copy of our body never made - we stop arguing, take the
       * packet, and `reconcileBall` snaps if the two have drifted too far to
       * reconcile. A moment of a wrong ball beats a client quietly playing its own
       * match.
       */
      const holding =
        prediction.touched > 0 &&
        now - prediction.touched < BALL_PREDICT_HOLD &&
        !ballAcked(prediction.drawn.ball, wire)

      if (!holding) {
        prediction.drawn = reconcileBall(prediction.drawn, wire)
        prediction.touched = 0
      }
    }

    /**
     * Our own touch, resolved here rather than waited for.
     *
     * The last of the glitches, and the one people described as the ball jumping
     * when they kicked it: a non-owner's contact used to do nothing at all until
     * the owner's interpolated copy of their body reached the ball on the owner's
     * screen, so the ball hung under your feet for a round trip and then left at
     * speed from wherever it had drifted to. Resolved locally it leaves when you
     * hit it.
     *
     * Only our own body, and deliberately: a peer's position here is a packet
     * old, so predicting *their* touches would invent contacts the owner never
     * saw and there would be nothing to reconcile them against. And because
     * `strike` sets a velocity rather than adding one, the owner resolving the
     * same contact a packet later lands on the same answer instead of twice it -
     * the ease above absorbs whatever the difference in body position is worth.
     */
    const struck = strike(prediction.drawn.ball, {
      position: { x: player.x, y: player.y, z: player.z },
      // `elapsed`, never the clamped step, exactly as the owner differences its
      // own body - a long frame's travel divided by a short step is a phantom
      // sprint. See `bodyVelocity`.
      ...bodyVelocity(stride, { x: player.x, z: player.z }, elapsed),
    })
    if (struck) {
      prediction.drawn = { ...prediction.drawn, ball: struck }
      prediction.touched = now
    }

    prediction.drawn = reckonBall({ drawn: prediction.drawn, delta, isSolid })
    ballRef.current = prediction.drawn.ball
    return
  }

  // We are stepping it ourselves, so there is nobody to be waiting on. Cleared
  // rather than left, or a client that inherits the ball keeps showing the
  // warning it raised about the owner it just replaced.
  if (stalledRef) stalledRef.current = false
  lastBallSeen.current = 0
  if (ownedSince.current === 0) ownedSince.current = now
  // The picture is somebody else's ball, and we have just become the author of
  // this one. Dropped whole, so handing the ball back later starts from the wire
  // rather than from a prediction made before we ever owned it.
  forget(prediction)

  // --- from here down, we own the ball --------------------------------------

  /**
   * Every body in the room, with the velocity its movement implies.
   *
   * Our own comes from the controller's real position; everybody else's from the
   * transform map - the *drawn* interpolated position, which is the same choice
   * `judgeDash` makes and for the same reason: what you see is what touches. The
   * velocity is last frame's position differenced against this frame's, which
   * needs no cooperation from anybody - a dashing peer simply shows up as a body
   * doing 26 blocks a second.
   */
  const bodies: (Striker & { id: string })[] = []

  const addBody = (id: string, x: number, y: number, z: number) => {
    // Differenced against `elapsed`, the real time this frame took, never the
    // clamped step - see `bodyVelocity`, which is where that distinction and the
    // dash-speed cap are explained and tested.
    bodies.push({
      id,
      position: { x, y, z },
      ...bodyVelocity(strides.get(id), { x, z }, elapsed),
    })
    strides.set(id, { x, z })
  }

  addBody(userId, player.x, player.y, player.z)
  for (const [peerId, state] of transforms) {
    addBody(peerId, state.current.x, state.current.y, state.current.z)
  }

  // Prune strides for bodies that left, or the map keeps every visitor forever.
  if (strides.size > bodies.length) {
    const present = new Set(bodies.map((body) => body.id))
    for (const key of strides.keys()) {
      if (!present.has(key)) strides.delete(key)
    }
  }

  /**
   * The first frame of the match - or a handover we have not heard about yet.
   *
   * A ball is placed at the kickoff spot with a pause on the clock, so a match does
   * not begin with the ball already in motion before anybody has looked up. An owner
   * who *took over* mid-match keeps the ball where it was, because `ball.current` is
   * whatever the previous owner last broadcast.
   *
   * That inheritance is only automatic for a client that was already in the room.
   * One that joined or reloaded into the lowest id has an empty `ball.current` and
   * would seed a fresh kickoff over a match in progress, so it waits
   * `BALL_ADOPT_GRACE` first: the outgoing owner sends at 12Hz, so a real handover
   * lands a packet inside that window and the branch never runs. At a genuine match
   * start nothing arrives, we seed a fraction of a second late, and the delay is
   * invisible inside a ten second pause.
   */
  if (!ball.current) {
    if (now - ownedSince.current < BALL_ADOPT_GRACE) {
      ballRef.current = null
      if (pauseRef) pauseRef.current = pause.current
      return
    }
    ball.current = ballAt(kickoffSpot(goals))
    pause.current = KICKOFF_PAUSE
  }

  /**
   * Somebody has asked for the ball back on the centre spot.
   *
   * Honoured here, in the one place a ball may be moved, and with the same two
   * lines a goal restart uses - the ball at the spot and a pause on the clock -
   * because it is the same event as far as the simulation is concerned: play
   * stopped, and it is starting again from the middle. Nothing is scored and
   * nobody is credited; a ball that ended up behind a wall was not a goal.
   *
   * Dropped while a pause is already running. The ball is on the spot for the
   * whole of one, so a second press during those three seconds is asking for
   * something that has already happened - and a request that reset the clock
   * would let a bored room hold the kickoff open indefinitely.
   */
  if (resetAsked.current > 0) {
    resetAsked.current = 0
    if (pause.current <= 0) {
      ball.current = ballAt(kickoffSpot(goals))
      pause.current = STUCK_RESET_PAUSE
      stuckWatch.current = noStuckWatch()
      if (stuckRef) stuckRef.current = false
      // Told to the room this frame rather than on the next 12Hz tick. Whoever
      // pressed the button is watching for something to happen, and up to 80ms
      // of nothing is exactly how a button gets pressed four more times.
      lastBallSent.current = 0
    }
  }

  if (pause.current > 0) {
    /**
     * The kickoff pause: everybody gets back into position.
     *
     * The ball is held still at the spot rather than merely ignored, because a ball
     * that kept rolling from wherever the last goal left it would not be at the
     * centre when play resumed. Contacts are not resolved for the same stretch, so
     * nobody can tap it in while the others are still walking back.
     */
    pause.current = Math.max(0, pause.current - delta)
    ball.current = ballAt(kickoffSpot(goals))
  } else {
    /**
     * Everybody's contacts, resolved in one place.
     *
     * Sequentially, so two people flanking the ball each see the other's push in
     * the ball they are striking - the second contact works against the first
     * one's result, exactly as two kicks a frame apart would.
     */
    for (const body of bodies) {
      const struck = strike(ball.current, body)
      if (struck) ball.current = struck
    }

    const before = ball.current
    const after = stepBall({ ball: before, delta, isSolid })

    /**
     * Did it cross a line on the way?
     *
     * Judged against the swept segment of this frame, and judged here because the
     * owner is the only client whose before-and-after are the real ones. Every other
     * screen is drawing a position that is up to a packet old, so a goal detected
     * there could be a goal the ball never actually scored.
     */
    const crossed = goals.find((goal) => goalCrossed(before, after, goal))

    if (crossed) {
      const side = scoringSide(crossed)

      /**
       * Who gets the credit, and whether they would rather not have it.
       *
       * Attributed to whoever last touched the ball, which is the closest thing to a
       * scorer this simulation knows about. An own goal is a touch by somebody whose
       * own side is the one the point went *against* - and since `scoringSide`
       * already flipped the goal's team, that is simply "the scorer's side is not the
       * side that scored".
       */
      const scorer = lastToucher(before, player, userId, transforms)
      const scorerSide = scorer ? sideOf?.(scorer) : undefined

      onGoal?.(side, scorer, Boolean(scorerSide) && scorerSide !== side)

      ball.current = ballAt(kickoffSpot(goals))
      pause.current = KICKOFF_PAUSE
    } else {
      ball.current = after
    }
  }

  ballRef.current = ball.current
  if (pauseRef) pauseRef.current = pause.current

  // Broadcast on the same budget bodies use. The ball is one more moving thing in
  // the room and does not deserve a faster lane than the people.
  if (now - (lastBallSent.current ?? 0) < BALL_SEND_INTERVAL) return
  lastBallSent.current = now

  countSent('ball')
  void channel.send({
    type: 'broadcast',
    event: 'ball',
    payload: {
      u: userId,
      c: conn,
      // Rounded like every other position on the wire: nobody can see a millimetre.
      x: +ball.current.x.toFixed(2),
      y: +ball.current.y.toFixed(2),
      z: +ball.current.z.toFixed(2),
      vx: +ball.current.vx.toFixed(2),
      vy: +ball.current.vy.toFixed(2),
      vz: +ball.current.vz.toFixed(2),
      k: +pause.current.toFixed(2),
    } satisfies BallMessage,
  })
}

/**
 * Who was closest to the ball when it went in.
 *
 * A stand-in for "who kicked it", and an honest one: the owner does not keep a
 * touch history, and the person nearest the ball as it crossed is almost always the
 * one who put it there. Getting it wrong costs a name on a goal, never a point -
 * `side` was already decided by which goal the ball went through.
 *
 * Returns undefined when nobody was near it, which is a goal nobody claims: a ball
 * that rolled in on its own, or was shot from far enough away that the shooter had
 * already been left behind.
 */
function lastToucher(
  ball: Ball,
  player: THREE.Vector3,
  userId: string,
  transforms: Map<string, PeerTransform>,
): string | undefined {
  let closest: string | undefined
  let best = CREDIT_RADIUS

  const ours = Math.hypot(ball.x - player.x, ball.z - player.z)
  if (ours < best) {
    best = ours
    closest = userId
  }

  for (const [peerId, state] of transforms) {
    const distance = Math.hypot(ball.x - state.current.x, ball.z - state.current.z)
    if (distance < best) {
      best = distance
      closest = peerId
    }
  }

  return closest
}

/**
 * How close you have to be to the ball to be credited with the goal.
 *
 * Generously wide of the push reach, because a shot travels: by the time the ball
 * crosses the line the striker is several blocks behind it, and a radius tuned to
 * actual contact would credit nobody for exactly the goals worth crediting.
 */
const CREDIT_RADIUS = 6

/**
 * Decide who this frame's dash caught, and tell them.
 *
 * Runs against `current` - where each peer is actually being *drawn* - rather
 * than `target`, the last position we were told about. They differ by up to a
 * packet of interpolation, and judging against the invisible one means a charge
 * that visibly passed through somebody registers a miss. What you see is what
 * you hit.
 *
 * A module function taking everything it touches, rather than a closure inside
 * the component. It has no business reading React state, everything it needs is
 * already a plain mutable map by the time the frame loop runs, and written this
 * way the one piece of arbitration in the whole feature can be read on its own.
 */
function judgeDash({
  channel,
  outbox,
  userId,
  dash,
  transforms,
  names,
  hostile,
  onHitLanded,
}: {
  channel: RealtimeChannel
  outbox: Outbox
  userId: string
  dash: DashRuntime | null
  transforms: Map<string, PeerTransform>
  names: Map<string, string>
  /** Absent means everyone is a target, which is the lounge. */
  hostile?: (peerUserId: string) => boolean
  onHitLanded: (damage: number, name: string) => void
}) {
  if (!dash?.swept) return
  // Cleared whether or not anything is hit, so one sweep is judged once.
  dash.swept = false

  for (const [peerId, state] of transforms) {
    // Already caught by this charge, or already down. Neither is a target: one
    // charge hits each person once, and there is nothing left to take off
    // somebody who is already at zero.
    if (dash.hits.has(peerId) || isDown(state.health)) continue
    /**
     * A team-mate is not a target.
     *
     * Checked before the geometry rather than after, and *without* adding them
     * to `dash.hits`: charging through a friend must not use up the one hit
     * this sweep gets, or standing behind a team-mate would make somebody
     * invulnerable.
     */
    if (hostile && !hostile(peerId)) continue
    if (!dashConnects(dash.from, dash.to, state.current)) continue

    dash.hits.add(peerId)
    const damage = rollDamage()

    sendSequenced(channel, outbox, 'hit', {
      i: crypto.randomUUID(),
      f: userId,
      t: peerId,
      d: damage,
    } satisfies HitMessage)

    /**
     * Their bar drops here, before they have confirmed anything.
     *
     * The alternative - waiting for their next move packet - puts a round trip
     * between the impact and the feedback, and at that distance the hit reads as
     * having not registered at all. Their own broadcast overwrites this within a
     * packet either way, so the optimistic number is never the one that sticks;
     * it just arrives when the impact does.
     */
    state.health = Math.max(0, state.health - damage)
    onHitLanded(damage, names.get(peerId) ?? 'them')
  }
}

/**
 * Decide who this frame's kick shoved, and tell them.
 *
 * `judgeDash`'s counterpart, and everything said there applies: judged against
 * `current` because what you see is what you hit, and written as a module
 * function so the one piece of arbitration can be read on its own.
 *
 * Two differences worth naming. There is no optimistic local effect - a dash
 * drops their bar here so the impact and the feedback arrive together, but the
 * equivalent would be *moving somebody else's body*, and a client guessing at
 * where a peer got shoved to is the exact disagreement this whole design avoids.
 * We watch them get knocked back on their next packet, a fraction of a second
 * later, which is a real thing to watch rather than a number.
 *
 * And there is no per-target set: a kick is judged in one frame, so everybody in
 * the cone gets shoved exactly once for free.
 */
function judgeKick({
  channel,
  outbox,
  userId,
  kick,
  transforms,
  hostile,
}: {
  channel: RealtimeChannel
  outbox: Outbox
  userId: string
  kick: KickRuntime | null
  transforms: Map<string, PeerTransform>
  hostile?: (peerUserId: string) => boolean
}) {
  if (!kick?.thrown) return
  // Cleared whether or not anything is in front of us, so one kick is judged
  // once even on a frame that renders no targets.
  kick.thrown = false

  for (const [peerId, state] of transforms) {
    // Somebody already down does not get shoved around. They are lying where
    // they fell until they choose to come back.
    if (isDown(state.health)) continue
    if (hostile && !hostile(peerId)) continue
    if (!kickConnects(kick.origin, kick.dir, state.current)) continue

    sendSequenced(channel, outbox, 'push', {
      i: crypto.randomUUID(),
      f: userId,
      t: peerId,
      /**
       * Along the kicker's heading, not along the line to the victim.
       *
       * So a kick sends everybody it catches the same way - the way you were
       * facing. Pushing each person radially away from the kicker would fan a
       * group outwards, which is a shockwave; this is a boot.
       */
      x: +(kick.dir.x * KICK_IMPULSE).toFixed(2),
      z: +(kick.dir.z * KICK_IMPULSE).toFixed(2),
      up: KICK_LIFT,
    } satisfies PushMessage)
  }
}

/**
 * One other person.
 *
 * Reads its position straight out of the shared transform map every frame rather
 * than taking it as a prop, so a packet arriving does not re-render anything -
 * it just changes the number this loop is easing toward.
 */
function RemoteAvatar({
  peer,
  transforms,
  aboardRef,
  emotes,
  saids,
  tone,
  party,
  partyHost,
  items,
  poseFor,
}: {
  peer: Peer
  transforms: React.RefObject<Map<string, PeerTransform>>
  /**
   * The seat *we* are in, if any, for the one case a peer's body hangs off
   * ours: their driver is this client. A rider is drawn glued to the
   * driver's pose, and when the driver is us the freshest pose is the player
   * ref, not our own packets coming back around.
   */
  aboardRef: React.RefObject<{ thing: string; seat: number } | null>
  emotes: React.RefObject<Map<string, EmoteState>>
  saids: React.RefObject<Map<string, SaidState>>
  /** Ally or enemy, in a match with sides. Undefined everywhere else. */
  tone?: PlateTone
  /** The lights are on. Their hue comes from their id - see ../party-glow. */
  party?: boolean
  /** This is whoever started it, so they cycle instead of sitting on one hue. */
  partyHost?: boolean
  /**
   * The shelf, as "what does this word look like".
   *
   * One map for the whole room rather than a lookup per body: it is built once
   * where the shelf lives and read here to turn `MoveMessage.w` into something
   * drawable. Absent in a scene with no shelf, where nobody is drawn holding
   * anything - which is what a room with no thingiverse in it looks like.
   */
  items?: ReadonlyMap<string, ItemLook>
  /** A clip name, made playable. See `Multiplayer.poseFor`. */
  poseFor?: (clip: string) => THREE.AnimationClip | null
}) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const bar = useHealthBar()

  /**
   * Their camera, if they have one on and it reached us.
   *
   * Read from the store rather than taken as a prop, so a picture arriving
   * re-renders one body rather than the whole room. Null whenever the feature
   * is off, which is what gates it here: nothing ever puts a stream in that
   * store unless `faces` admitted a connection to produce it.
   */
  const face = useFace(peer.userId)

  /**
   * Their voice, which is a separate arrival from their picture.
   *
   * Two tracks on one connection, and either can be absent: somebody may be
   * heard and not seen, or seen and not heard, and both are ordinary.
   */
  const voice = useVoice(peer.userId)

  // Always held, read only while the lights are on - see the same note in
  // <SelfAvatar>.
  const partyColour = usePartyColour(peer.userId, partyHost)
  const [clip, setClip] = useState<AvatarClip>('idle')

  /**
   * A clip a thing is making them play, or null while they are walking about.
   *
   * State rather than a per-frame read for the same reason `clip` is: changing
   * it swaps an animation, which is a render, and it changes at the moment
   * somebody sits down rather than sixty times a second. The frame loop below
   * spots the change exactly as it spots a gait change.
   */
  const [posed, setPosed] = useState<string | null>(null)

  /**
   * What they are driving, mirrored out of the frame loop.
   *
   * State rather than a per-frame read because mounting a vehicle model is a
   * render, and the fact changes the way `clip` does: rarely, at the moment
   * somebody gets in or out. The frame loop below spots the change exactly as
   * it spots a gait change.
   */
  const [peerDriving, setPeerDriving] = useState<string | null>(null)

  /**
   * And the seat they are merely *in*, when it is not the wheel.
   *
   * Split from `peerDriving` because the two facts do different work: the
   * wheel mounts a vehicle under them, and a passenger seat glues their body
   * to somebody else's vehicle - see the frame loop below.
   */
  const [peerRiding, setPeerRiding] = useState<{ thing: string; seat: number } | null>(
    null,
  )

  /**
   * And what is in their hand, mirrored out of the frame loop the same way.
   *
   * The word rather than the model: what it looks like is the shelf's answer,
   * and the shelf is handed down as `items` so that one lookup serves every
   * body in the room. Somebody holding something the shelf has never heard of
   * draws nothing, which is the same silence a slot on a table keeps.
   */
  const [peerHeld, setPeerHeld] = useState<string | null>(null)
  /** The published copy, so the frame loop can spot a change without reading state. */
  const peerHeldRef = useRef<string | null>(null)

  /** What that word looks like, or nothing if the shelf cannot say. */
  const heldLook = peerHeld && items ? itemLook(items, peerHeld) : undefined

  /**
   * How fast their kart is going, for its wheels.
   *
   * Fed from the same differenced speed the gait uses, so the wheels of a
   * peer's vehicle turn at the speed the vehicle is actually drawn moving -
   * matched to the interpolation, like the legs it replaces.
   */
  const peerMotion = useRef({ speed: 0, steer: 0 })

  const { playerRef, headingRef } = useSceneRefs()

  /**
   * Where their seat is relative to their driver's, in cells, when riding.
   *
   * Derived from the room's own furniture list - the blueprint's seats never
   * change mid-drive, so this is a render-time fact, and the frame loop below
   * only has to add it to the driver's pose. Null until the thing is known,
   * which draws the rider from their own packets for a moment - late, not
   * wrong.
   */
  const room = useThingiverse()
  const glue = useMemo(() => {
    if (!peerRiding) return null
    const thing = room?.things.find((one) => one.id === peerRiding.thing)
    const spec = thing?.blueprint?.spec
    if (!thing || !spec?.use) return null
    return seatDelta(spec, thing.scale, peerRiding.seat)
  }, [peerRiding, room])

  /**
   * Whether the vehicle they are aboard swallows them.
   *
   * The blueprint's `hideDriver`: a car with a roof, a football somebody is
   * rolling about as. The body is not drawn - the vehicle is what moves - and
   * everything that names the person (plate, bar, bubbles) stays, because a
   * person is still there.
   */
  const cloaked = useMemo(() => {
    const aboardThing = peerDriving ?? peerRiding?.thing ?? null
    if (!aboardThing) return false
    const spec = room?.things.find((one) => one.id === aboardThing)?.blueprint?.spec
    return Boolean(spec?.vehicle?.hideDriver)
  }, [peerDriving, peerRiding, room])

  /**
   * This peer's emote slot, created on first render rather than on first
   * packet.
   *
   * `<EmoteBubble>` needs a stable ref for the life of the body, and the map
   * entry is created by whichever comes first - a packet arriving, or this.
   * Both paths have to end up pointing at the *same* object, or the bubble
   * watches a slot nobody writes to.
   */
  const emote = useRef(
    emotes.current?.get(peer.userId) ??
      (() => {
        const fresh = noEmote()
        emotes.current?.set(peer.userId, fresh)
        return fresh
      })(),
  )

  /** Their speech bubble's slot, on exactly the same terms as the emote's. */
  const said = useRef(
    saids.current?.get(peer.userId) ??
      (() => {
        const fresh = nothingSaid()
        saids.current?.set(peer.userId, fresh)
        return fresh
      })(),
  )

  useFrame((_, delta) => {
    const node = group.current
    const state = transforms.current?.get(peer.userId)
    if (!node || !state) return

    const { current } = state

    const before = { x: current.x, z: current.z }

    /**
     * Replayed from the buffer rather than eased toward the newest packet. The
     * old line closed a fraction of the remaining gap each frame, which drew a
     * peer jogging at a constant 4 units/s as one moving between 1.9 and 7.4,
     * eight times a second - +-39% even on a LAN. `peer-motion.ts` has the
     * derivation and the measurements.
     *
     * `false` means no packet has landed yet, and the body is left exactly where
     * it was: this runs before `seeded` has anywhere to put it, and snapping to
     * the origin for one frame is the flicker that guard exists to prevent.
     */
    if (!sample(state.motion, performance.now(), current)) return

    node.position.set(current.x, current.y - EYE_HEIGHT, current.z)
    node.rotation.y = current.yaw

    /**
     * Gait from how fast the *drawn* body is actually moving, not from a flag in
     * the packet. That keeps the feet matched to the interpolation - and it is
     * worth more now than it was: the drawn speed is the peer's real speed, so
     * the legs are matched to something true rather than to an easing curve.
     */
    const travelled = Math.hypot(current.x - before.x, current.z - before.z)
    const speed = travelled / Math.max(delta, 0.0001)

    const down = isDown(state.health)

    if (peerHeldRef.current !== state.held) {
      peerHeldRef.current = state.held
      setPeerHeld(state.held)
    }

    const drives = state.driving && state.seat === 0 ? state.driving : null
    if (drives !== peerDriving) setPeerDriving(drives)

    const riding = state.driving && state.seat > 0 ? state.driving : null
    if (
      (peerRiding?.thing ?? null) !== riding ||
      (riding !== null && peerRiding?.seat !== state.seat)
    ) {
      setPeerRiding(riding ? { thing: riding, seat: state.seat } : null)
    }

    peerMotion.current.speed = speed

    /**
     * A rider is glued to their driver, not to their own packets.
     *
     * Their packets are a copy of the driver's pose taken one interpolation
     * delay ago, so drawing from them hangs the passenger off the back of a
     * fast kart. The driver's *drawn* pose is on this client already - in the
     * transform map, or in the player ref when the driver is us - and the
     * seat difference is a constant of the blueprint. Their own yaw is kept:
     * a passenger still turns their head.
     */
    if (glue && peerRiding) {
      let driver: { x: number; y: number; z: number; yaw: number } | null = null

      const mine = aboardRef.current
      if (mine?.thing === peerRiding.thing && mine.seat === 0) {
        const own = playerRef.current
        driver = {
          x: own.x,
          y: own.y,
          z: own.z,
          yaw: Math.atan2(headingRef.current.x, headingRef.current.z),
        }
      } else {
        for (const other of transforms.current?.values() ?? []) {
          if (other.driving === peerRiding.thing && other.seat === 0) {
            driver = other.current
            break
          }
        }
      }

      if (driver) {
        const spot = ridePosition(driver, glue)
        node.position.set(spot.x, spot.y, spot.z)
      }
    }

    /**
     * A driven body sits; it does not jog. The gait reads drawn speed, and a
     * kart at full tilt would otherwise put its driver into a sprint animation
     * while seated - the one case where how fast the body moves says nothing
     * about what its legs are doing.
     */
    const next: AvatarClip = down
      ? 'idle'
      : state.driving
        ? 'idle'
        : state.dancing
          ? 'dance'
          : speed > RUN_SPEED
            ? 'run'
            : speed > WALK_SPEED
              ? 'walk'
              : 'idle'
    if (next !== clip) setClip(next)

    /**
     * And whatever they are sitting in, which outranks the gait.
     *
     * Not while they are down: a body knocked over is lying on the floor, and a
     * corpse still playing the sit it was in when it was hit is the one drawing
     * worse than no clip at all. Everything else is theirs to decide - they are
     * the client that knows what they pressed E on.
     */
    const pose = down ? null : (state.pose ?? null)
    if (pose !== posed) setPosed(pose)

    /**
     * Health, drawn straight from the ref rather than through state.
     *
     * A bar is a number scaled into a mesh, and doing that imperatively costs
     * one matrix update; doing it through React would re-render the avatar - and
     * every peer's avatar - on every damage packet, in the middle of the one
     * moment where the frame rate is most visible.
     */
    if (body.current) {
      // Tipped over rather than removed. Somebody lying where they fell tells
      // you what happened and where; a body that vanishes just looks like they
      // left the room.
      body.current.rotation.x = down ? -Math.PI / 2 : 0
    }

    showHealth(bar, state.health)
  })

  return (
    <group ref={group}>
      <group ref={body}>
        {/* A ghost while their animal downloads. Their name, bar and bubbles
            are already drawn above this point, and a label hanging over an
            empty patch of floor is worse than a placeholder under it. */}
        {!cloaked && (
          <Suspense fallback={<AvatarPlaceholder />}>
            {/* Other people are not obstacles to the crosshair. Being unable to
                build because a colleague is standing where you were aiming would be
                a worse problem than clipping through each other. */}
            <BodyModel
              look={peer.avatar}
              /*
                What they are doing, in the two vocabularies a body has. A pose
                the pack itself carries is one of `AVATAR_CLIPS` and goes in as
                a name; one this space animated arrives as a built clip and
                wins over the gait - which is the same pair `<SelfAvatar>` is
                handed, so a body looks the same to the person in it and to
                everybody else. See `asAvatarClip` and `BodyModel.pose`.
              */
              clip={(posed && asAvatarClip(posed)) || clip}
              pose={posed ? (poseFor?.(posed) ?? null) : null}
              ignoreRay
              rim={party ? partyColour : null}
            />
          </Suspense>
        )}

        {/*
          Whatever they are carrying, on their body rather than in their pocket.

          Inside <body> with the model it hangs off, so a knocked-down player
          drops to the floor still holding it - the alternative is a pistol
          hovering upright over somebody lying on their back.
        */}
        {heldLook?.hold && (
          <HeldThing
            model={heldLook.model}
            hold={heldLook.hold}
            scale={heldLook.scale}
          />
        )}
      </group>

      {/* Their vehicle, when the packets say they are in one. Inside the
          outer group so it turns with their yaw, outside <body> so a knocked
          driver tips over without taking the kart with them. */}
      {peerDriving && <PeerVehicle thingId={peerDriving} motion={peerMotion} />}

      {/* Above the head and outside <body>, so it stays upright and readable
          when they are lying on the floor. */}
      <HealthBar {...bar} />

      {/* Both outside <body> for the same reason the bar is: a name and a face
          should stay upright and readable over somebody lying on the floor.
          Stacked head, name, bar, emote so none of them ever overlap. */}
      {/* On the floor, so whose side they are on reads from across the arena -
          which is exactly where a name is too small to help. */}
      {tone && <TeamRing tone={tone} />}

      {/* Outside <body> like everything else here: a light that tipped over
          with a knocked-down player would throw itself into the floor. */}
      {party && <PartyGlow colour={partyColour} />}

      {/* Outside <body> with the plate and the bar, and for the same reason:
          a face that tipped over with a knocked-down player would be lying in
          the floor. It leaves a face floating over somebody on their back,
          which is the same thing their name already does. */}
      {face && <FaceCircle stream={face} />}

      {/* Inside the avatar's group, so the sound comes from where the body is
          and follows it. Everything about how far it carries is in the
          component. */}
      {voice && <PeerVoice stream={voice} />}

      {/* Pushed up when there is a picture under it, because the picture is
          where the plate used to sit. A name resting on somebody's forehead is
          worse than a name a little further away. */}
      <Nameplate name={peer.name} tone={tone} height={face ? 2.5 : undefined} />
      <EmoteBubble state={emote} />
      {/* Above the face, not instead of it: people ask a question and pull a
          face at the answer, and a reply should not erase the reaction. */}
      <ChatBubble state={said} />
    </group>
  )
}


