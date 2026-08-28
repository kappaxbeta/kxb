'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { arbitratedFields } from '@/app/xp/_runtime/level-data'
import {
  allowedFor,
  dataOf,
  phaseCountdown,
  roleRule,
  ROUND_AGAIN,
  RUN_OVER,
  stepFrom,
  viewsOf,
  type RoleView,
} from '@kxb/xp'
import { markByName, nearestMark } from '@kxb/xp/format'
import { pressBuffer } from '@/app/xp/_runtime/input/actions'
import { STILL } from '@/app/xp/_runtime/body/motion'
import { type Cooling } from '@/app/xp/_runtime/hud/cooling'
import { LiveEntities } from '@/app/xp/_runtime/world/live'
import { Player } from '@/app/xp/_runtime/player'
import { isMatch, type Match } from '@/app/xp/_runtime/match/match'
import { Matching } from '@/app/xp/_runtime/match/matching'
import { flowFor, modeOf, type Mode } from '@kxb/xp'
import { raceReady, type Run } from '@/app/xp/_runtime/match/race'
import { Racing } from '@/app/xp/_runtime/match/racing'
import { HealthBars } from '@/app/xp/_runtime/hud/health-bars'
import { OwnRing } from '@/app/xp/_runtime/hud/rings'
import { heldFrom, SkinnedBody } from '@/app/xp/_runtime/body/skinned'
import { arrivalSpot, canStandIn, groundedSpot } from '@/app/xp/_runtime/spawn'
import { PeerGlow } from '@/app/xp/_runtime/body/glow'
import { ViewModel } from '@/app/xp/_runtime/body/viewmodel'
import { barsFrom } from '@/app/xp/_runtime/match/vitals'
import { hurtIn, type Hurt } from '@/app/xp/_runtime/match/hurt'
import { SHAKE_SECONDS, struckIn } from '@/app/xp/_runtime/body/shake'
import { HurtBars } from '@/app/xp/_runtime/hud/hurt-bars'
import type { Touch } from '@/app/xp/_runtime/hud/touch-controls'
import { sideOf } from '@/app/xp/_runtime/match/teams'
import { standingsFrom, teamTotals, type Standing } from '@/app/xp/_runtime/match/standings'
import { voteView, type OpenVote } from '@/app/xp/_runtime/match/vote'
import { nextWatch, watchable } from '@/app/xp/_runtime/match/spectate'
import { Spectating } from '@/app/xp/_runtime/match/spectating'
import { Tracers, type Shot } from '@/app/xp/_runtime/world/tracers'
import { Together } from '@/app/xp/_runtime/net/together'
import { playXpSound } from '@/app/xp/_runtime/sound'
import { Lights } from '@/app/xp/_runtime/world/lights'
import { Signs } from '@/app/xp/_runtime/world/signs'
import { applyShove, Balls, bodiesOf, type BodyShare, type Shove } from '@kxb/xp/owning'
import {
  applyShare,
  nothingShared,
  sameShare,
  shareOf,
  type WorldShare,
} from '@kxb/xp/sharing'
import { EmoteBubble } from '@/app/xp/_runtime/body/emote-bubble'
import { noEmote, showEmote, type EmoteId } from '@/app/xp/_runtime/body/emotes'
import { streak } from '@/app/xp/_runtime/world/streak'
import {
  DEFAULT_ASSIGN,
  MAIN_SCENE,
  playersOf,
  rulesOf,
  takesTurns,
  SEATS_ONE,
  type XpCamera,
  type XpDocument,
} from '@kxb/xp'
import { findModel, floorOffset } from '@kxb/xp/catalogue'
import { modelUrl, skeletonOf, splitModel } from '@kxb/xp/packs'
import {
  type Crowd,
  cooldownsOf,
  coolingFraction,
  throughCooling,
  DASH_SECONDS,
  EYE_HEIGHT,
  isDead,
  stepDowned,
  OUT_OF_WORLD,
  PLAYER_RADIUS,
  randomAt,
  releasedKeys,
  revivePlayer,
  seedFrom,
  Smoothing,
  stepBodies,
  nearBody,
  stepEmitted,
  stepHits,
  stepReturns,
  shoverBox,
  type Shover,
  type Said,
} from '@kxb/xp/engine'
import {
  armedWith,
  blockersOf,
  bodiesFor,
  aimOf,
  pressOn,
  swungAt,
  type Aim,
  applyVerbs,
  BUILT_IN_BODY,
  BUILT_IN_BODY_SCALE,
  bodyScaleFor,
  TEAM_PROP_PREFIX,
  teamProp,
  castRay,
  damage,
  DEFAULT_RANGE,
  movePlayer,
  PLAYER_ID,
  type PlayerFacts,
  spawnEntities,
  spawnPlayer,
  spawnWeapon,
  fire,
  holds,
  stepSpawned,
  stepTriggers,
  type Crossed,
  type EntityId,
  targetsOf,
  WEAPON_ID,
  worldTransform,
  type Blocker,
  type Box,
  type Effect,
  type EntityWorld,
  type Overlaps,
  type Solids,
  type TriggerClock,
  type Vec3,
} from '@kxb/xp/engine'
import type { Scripts } from '@kxb/xp/script'
import { collectSaying } from '@/app/xp/_runtime/net/saying'
import { dashCatches, startDash, useDash } from '@/app/xp/_runtime/match/dash'
import { gatherShoves } from '@/app/xp/_runtime/body/shoves'
import { carryHeld } from '@/app/xp/_runtime/net/carried'
import { motionOf, tickStance, useStance } from '@/app/xp/_runtime/body/stance'
import { fresh, say, useTicker } from '@/app/xp/_runtime/hud/ticker'
import { isNews } from '@/app/xp/_runtime/told'
import type { XpArbiter, XpNetwork, XpPlayer } from '@kxb/xp/host'

/**
 * One frame of the game, in the order §6 of the plan declares.
 *
 * Everything here is a call into `@kxb/xp/engine` and `@kxb/xp/script`; there is
 * no rule in this file, which is the property that makes the runtime a runtime.
 * It draws nothing and returns null - it is a frame loop that happens to live in
 * the tree, which is how R3F lets you have one.
 *
 * ---------------------------------------------------------------------------
 * The player's position is one frame old, and that is fine
 * ---------------------------------------------------------------------------
 * The controller runs in its own `useFrame` and R3F does not promise an order
 * between two of them, so rather than depend on one, this reads where the player
 * *ended up last frame* and the controller reads the blockers this refilled last
 * frame. Both are 16 ms stale and neither is visible: a pickup is collected a
 * sixtieth of a second later than the earliest possible moment it could have
 * been, and a block sliding towards you stops you a sixtieth of a second late.
 *
 * The alternative - one loop that owns everything, with the controller inlined -
 * is the right answer the day something needs the *same* frame, and it costs the
 * separation that makes `Player` a component you can read on its own. Not yet.
 */
/**
 * What a shot may not land on: you, and what you are holding.
 *
 * Without it every round hits the inside of your own gun, half a metre from the
 * camera, and the game is that you cannot shoot.
 */
const UNSHOOTABLE: ReadonlySet<number> = new Set([PLAYER_ID, WEAPON_ID])

/**
 * What the instancer never draws: your own body, and your own gun.
 *
 * The body because in first person the camera is inside its head and in third
 * it is drawn *skinned* instead, and an instanced mesh and a skinned pose cannot
 * be the same draw.
 *
 * The gun for the same shape of reason, in both views and not just one. In third
 * person it hangs off the hand bone (./skinned); in first person it is a view
 * model in front of the camera (./viewmodel). It used to stay instanced in first
 * person, on the argument that a gun on a socket at the end of an arm *is* the
 * view model - and that turned out to be exactly the bug: the socket is a guess
 * at where a hand is on a body, and pointing a 75° lens at it from thirty
 * centimetres draws a slab of geometry rather than a gun. See ./viewmodel.
 *
 * Neither is a despawn. `WEAPON_ID` stays alive, parented and shootable-around,
 * so a `disarm` still takes it and a tracer still leaves the muzzle the engine
 * says it does. Hiding is a view.
 */
const OWN_BODY_AND_GUN: ReadonlySet<number> = new Set([PLAYER_ID, WEAPON_ID])

/**
 * How far above a peer's feet a thing they are carrying is drawn.
 *
 * The wire carries feet - `sampleAt` is what converts the eye the controller
 * holds into what everybody else is told - so a carried flag written at the
 * sample's own height sits on the floor, which is precisely the picture this is
 * meant to replace. Roughly a hand on a body of this height; it is a drawing
 * offset and nothing reads it back.
 */
const CARRY_HEIGHT = 1.1

/**
 * How often a peer's hint may make this client ask the arbiter again.
 *
 * Four times the poll's own rate, which is the whole gain, and a floor on a
 * message anybody in the room may send. Four hits inside this window are one
 * verdict as far as a body is concerned: the read that follows the first
 * returns the outcome of all of them.
 */
const HINT_FLOOR = 250

/**
 * How long the body plays the recoil for.
 *
 * Roughly the length of `Ranged_1H_Shoot`, which is a single kick. Long enough
 * to read as a shot and short enough that firing twice in a second looks like
 * two shots rather than one long one.
 */
const RECOIL = 0.35

/**
 * How long a body flinches after taking a hit, in seconds.
 *
 * Longer than the recoil because a flinch is a stagger rather than a kick, and
 * short enough that two hits in quick succession read as two - a flinch that
 * outlasted the gap between shots would make a burst look like one long hit.
 */
const FLINCH = 0.45

/**
 * How long a swing lasts, and the one key name that starts one.
 *
 * `Melee_Unarmed_Attack_Punch_A` is a little longer than the shoot kick - a
 * punch is a wind-up and a follow-through where a trigger pull is neither - and
 * it is deliberately under half a second so that hitting something repeatedly
 * reads as repeated hits. The gesture layer holds the last frame anyway (see
 * ./layers), so overrunning the clip costs a still arm rather than a snap.
 *
 * The name is `attack` because that is what the editor suggests, what the
 * manual documents, and what the level this came from had already bound. See
 * the note where it is compared.
 */
const SWING = 0.4
const ATTACK = 'attack'

/**
 * What a punch takes off a crate when the body says nothing.
 *
 * The same ten a shot from an undeclared gun does, and it is the number the
 * arbiter's own default charges for a hit - so a document that says nothing
 * anywhere still has one answer rather than two that disagree by screen. A
 * level that cares writes `damage` on its player blueprint, which is the one
 * place this is read from.
 */
const DEFAULT_SWING_DAMAGE = 10

/**
 * What the pack says a body is, and how big.
 *
 * Read in three places now - the peers, the local body and the ring - so it is
 * worked out once. `xp.player.blueprint` overrides it; without one it is the
 * built-in dummy at the scale that makes it a person rather than a toy.
 *
 * Exported because the *roster* needs the same answer: what goes on the wire as
 * a peer's skin has to be a model other clients can load, and the only place
 * that turns a person's `fox` into the pack path a renderer can resolve is
 * `bodiesFor`. See where ../_runtime/scene builds the network.
 */
export function bodyOf(
  xp: XpDocument,
  blueprints: ReturnType<typeof bodiesFor>,
  avatar?: string | null,
  who?: string | null,
) {
  return {
    model: blueprints[xp.player.blueprint ?? BUILT_IN_BODY]?.model ?? 'dummy/Dummy',
    // From the same function that chose the model, so the two cannot disagree
    // about what the body turned out to be - a peep is already a person's
    // height and the dummy is not.
    scale: bodyScaleFor(xp, avatar, who),
  }
}

/**
 * Handed to `stepBodies` by a client that is only watching. Frozen and shared,
 * because a fresh empty array every frame is an allocation for nothing.
 */
const EMPTY_SHOVERS: readonly Shover[] = []

/** Two lists of bars that would draw the same, so nothing has to be redrawn. */
function sameHurt(a: readonly Hurt[], b: readonly Hurt[]): boolean {
  if (a.length !== b.length) return false
  return a.every((one, at) => one.id === b[at]?.id && one.left === b[at]?.left)
}

export function Running({
  xp,
  filming,
  scripts,
  solids,
  catchFloor,
  view,
  network,
  room,
  scene,
  me,
  arbiter,
  team,
  party,
  onParty,
  onPeers,
  onMove,
  onBroken,
  onSay,
  onSignal,
  onVitals,
  onKills,
  onStandings,
  onVote,
  onTurn,
  onSeats,
  onRolled,
  onSecret,
  onAim,
  onPhase,
  onCountdown,
  onRound,
  onWon,
  onRoster,
  onTally,
  data,
  onRun,
  onMatch,
  onDown,
  onLoad,
  resumeAt,
  avatar,
  mode,
  startedAt,
  unstickAt,
  ballBackAt,
  onProgress,
  onMovie,
  emote,
  // Named `shot` inside, because `camera` is already the three.js camera this
  // file raycasts along - two different things that would otherwise share a
  // word in the one file that uses both.
  camera: shot,
  touch,
  onCooling,
}: {
  xp: XpDocument
  scripts: Scripts | null
  solids: Solids
  catchFloor: number
  view: 'first' | 'third'
  /**
   * Where this player left off, when the level is one that resumes.
   *
   * Decided by the scene rather than here, because the answer is about what the
   * document *is* — `resumes` says a race and a match start everybody at the
   * start and a room does not — and this component should not be able to
   * disagree with the screen that already refused or allowed the store.
   *
   * It replaces the arrival spot rather than teleporting on top of it: arriving
   * is one act, and a body that appears at the spawn and then jumps is a body
   * two writers disagreed about.
   */
  resumeAt?: { x: number; y: number; z: number; facing: number }
  /**
   * A counter somebody presses to be put back where they arrived.
   *
   * The way out of a level that has gone wrong around you, asked for as *"a
   * respawn button for stuck situations"*. Not the same thing as dying: no
   * corpse, no wait, no line on the ticker and nothing told to the arbiter -
   * this is the player saying "I am somewhere I cannot get out of", which is a
   * fact about the level rather than an event in the game.
   *
   * A **counter**, like `round` and `reviveAt` and for exactly the reason
   * `samePlace` in ./spawn exists: pressing it twice from the same spot has to
   * do the thing twice, and any value that describes *where* would be equal to
   * itself and fire once. A number that only goes up cannot be mistaken for the
   * one before it.
   */
  /** The animal this player chose, off their profile. See `bodiesFor`. */
  avatar?: string | null
  /**
   * When this match was started, if it is one that gets started.
   *
   * A *kick off*, not a rebuild. The level has been running underneath the
   * lobby the whole time - people walk about and knock the ball around while
   * they wait, which the panel invites them to - so by the whistle the ball is
   * wherever they left it and everybody is standing wherever they wandered to.
   *
   * What this does is put them back: each player at their own spawn, and the
   * level's flow to its first phase, which for a football is the one that
   * fetches the ball to the centre spot and counts three. What it deliberately
   * does **not** do is throw the world away and ask the document again - that
   * is `round`, and it is for a rematch. Nothing counts before the whistle, so
   * there is nothing to undo.
   */
  /**
   * Which mode is actually being played, when the host knows better than the
   * document does.
   *
   * `rules.mode` is what the level *is*; a battle scheduled in it is a session.
   * The battle room says `battle`, everything else says nothing and gets the
   * document's own answer. It decides two things: which of the level's flows
   * runs (`flowFor`), and what a script reads back from `world.mode`.
   */
  mode?: Mode
  startedAt?: string | null
  unstickAt?: number
  /** How many times the rail has asked for the ball back. See ./scene. */
  ballBackAt?: number
  /**
   * A checkpoint worth remembering past this session.
   *
   * Called with what the pad said, and *only* on the player's own checkpoint —
   * the engine already decided highest-wins, so this fires when the number won.
   */
  onProgress?: (progress: { at: { x: number; y: number; z: number; facing: number }; order?: number }) => void
  /**
   * A rule asked for a cut to be played, by name.
   *
   * Handed up rather than played here: a film has its own scene, camera and
   * clock, and none of them belong to the component that owns the entity world.
   * Absent where nothing can mount one - the editor's preview passes it, the
   * play route passes it, and a headless host may not.
   */
  onMovie?: (sequence: string) => void
  /**
   * Whether a cut is on screen right now.
   *
   * ./cutscene has always said what should happen here - *"what the host does
   * instead is stop reading input while this is up, so somebody watching cannot
   * walk off a ledge"* - and nothing did it. The film took the camera and the
   * controls kept driving the body underneath it, so a held key walked a player
   * blind through a level they could not see for the length of the shot.
   *
   * Handed down as a plain boolean rather than folded into `frozen`, which is a
   * ref several things already own - death, a stun, a script - and would have to
   * remember what it was before the film in order to put it back.
   */
  filming?: boolean
  /** Set only when this level is a room somebody else can be in. */
  network?: XpNetwork
  room?: string
  /**
   * Which room of the level this client is standing in.
   *
   * Threaded rather than derived, for the reason the document is: the scene the
   * player is in is the parent's state, and this file draws whatever it is
   * handed. It ends at `Together`, where it becomes half of the topic.
   */
  scene?: string
  me?: XpPlayer
  /**
   * Who decides whether a shot at another player counted.
   *
   * Absent everywhere except a room, and absent is not a degraded mode - a level
   * with nobody else in it has nothing to arbitrate. See
   * docs/xp/server-authority.md §4.1.
   */
  arbiter?: XpArbiter
  /** Kills, claims in flight, and the last refusal - for the HUD. */
  onKills?: (kills: { mine: number; pending: number; refused: string | null }) => void
  /** The scoreboard, when there is an arbiter keeping one. */
  onStandings?: (standings: readonly Standing[]) => void
  /** The open vote, when the room is having one. */
  onVote?: (vote: OpenVote | null) => void
  /**
   * Whose turn it is, by account id, and null when the table is not taking any.
   *
   * The arbiter's answer rather than this client's count of who has passed:
   * turns exist precisely so that a client cannot decide it is its own go.
   */
  onTurn?: (turn: string | null) => void
  /**
   * Who is sitting in which chair, so a HUD can say *blue's turn* rather than
   * *somebody's turn*.
   *
   * The arbiter answers turns by account id, which is the only thing it knows -
   * and an account id is the one fact about a table nobody at it can see. The
   * colour is the fact everybody can see, and this is what maps one to the
   * other.
   */
  onSeats?: (seats: Record<string, string>) => void
  /**
   * A die that landed, said out loud once.
   *
   * A number in the corner is a number the person who threw it reads and nobody
   * else notices. The whole point of a roll at a table is that it is an
   * announcement, so this is an *event* with a counter on it rather than a
   * value to render: the counter is what lets a banner know a second four is a
   * second throw.
   */
  onRolled?: (said: { seat: string | null; face: number; at: number }) => void
  /** What this player was dealt, which nobody else is told. */
  onSecret?: (secret: string | null) => void
  /**
   * The side a host has already put this player on.
   *
   * The battle lobby picks sides before anybody loads the document, so when it
   * has, `sideOf` does not derive one. A prop rather than a field on `XpPlayer`
   * because being on a team is a fact about *this match*, not about the person -
   * the same person is on red here and on blue in the next one.
   */
  team?: string
  /** The lights, passed to `Together` so the co-players stand in them. See ./glow. */
  party?: { on: boolean; host?: string }
  /** And the room's answer, on its way back to whoever owns the switch. */
  onParty?: (on: boolean, from: string) => void
  onPeers?: (peers: number) => void
  /**
   * Where the player is and which way they are pointing, for the readout.
   *
   * Passed straight through to `./player`, whose own note explains why the
   * bearing is here: a coordinate says where somebody is standing and nothing
   * about where they are looking, and looking is the whole of aiming.
   */
  onMove: (position: Vec3, grounded: boolean, facing: number) => void
  onBroken: (lines: string[]) => void
  onSay: (say: (previous: { id: number; text: string }[]) => { id: number; text: string }[]) => void
  /**
   * Names a rule said this frame, for the room to hear about.
   *
   * Only what a rule said - a script's emit already happened on every client
   * and is filtered out before this is called. Optional, because a level played
   * alone has nobody to tell and every caller written before signals existed
   * should keep working: absent means the level still works, it just works on
   * one machine, which is the same shape `onPeers` has.
   */
  onSignal?: (said: readonly Said[]) => void
  /** The player's own health and ammunition, when they have any. */
  onVitals: (vitals: { hp?: number; ammo?: number }) => void
  /** The clock, when this level is one that can be raced. */
  /**
   * What the level keeps, as the scene's own map — docs/xp/backlog.md §7c.
   *
   * A ref because rules mutate it inside the frame loop and a value would be a
   * re-render of the scene per coin. Absent for a document that declares no
   * data, which is most of them, and the three trigger passes below simply hand
   * `undefined` on: a rule aimed at `world` then does nothing, which is the
   * same honest failure a host with no store already has.
   */
  data?: { readonly current: Map<string, number> }
  /**
   * What a press would act on, and where it would send it.
   *
   * Reported rather than drawn here so the scene owns one highlight for the
   * whole level, and reported *only when it changes* - it is a per-frame answer
   * and a callback fired sixty times a second into React state is sixty
   * re-renders of a tree holding thousands of instanced meshes.
   */
  onAim?: (aim: Aim | null) => void
  /**
   * Everybody in the room, by account id, for whoever is above this.
   *
   * The scene needs it and cannot get it: `Together` is mounted in here, and the
   * scene resolves the *camera* from the same side this does. Reported rather
   * than the scene growing its own presence, because two subscriptions to one
   * channel is two answers to "who is here" that can disagree - which is the
   * failure `sideOf` is built to avoid in the first place.
   */
  onRoster?: (ids: readonly string[]) => void
  /**
   * The level's declared numbers, for whoever draws them.
   *
   * Same contract as `onAim`: only on change, because the map behind it is
   * written inside the frame loop and a callback per frame is a re-render per
   * frame. Only the labelled fields, because a label is the author saying this
   * one is worth a player's attention - see `Hud`'s `tally`.
   */
  onTally?: (tally: readonly { label: string; value: number }[]) => void
  /**
   * Which phase of its own round the level is in, for whoever draws it.
   *
   * Null for a document that describes no run. Reported on change like the
   * tally: a phase changes a handful of times a turn, so a state update per
   * change costs a re-render nobody will see.
   */
  onPhase?: (phase: string | null) => void
  /** Whole seconds left on a phase that leaves on a clock, or null. */
  onCountdown?: (left: number | null) => void
  /**
   * Which round is being played, counting from one.
   *
   * Always one for a flow that declares no `rounds`, which is why the HUD asks
   * the document how many there are rather than asking this whether it means
   * anything: a number with nothing to compare it against is not drawn.
   */
  onRound?: (round: number) => void
  /**
   * The run's own ending, when the document declared one.
   *
   * `flow.wins` rather than a preset's whistle - the two are different endings
   * and a level can have both, so this is beside `onMatch` rather than folded
   * into it. Fired once, on the frame the condition first holds; false is every
   * document that never declared one and every run still being played.
   */
  onWon?: (won: boolean) => void
  onRun?: (run: Run) => void
  /** The score and the whistle, when this level is playing a mode. */
  onMatch?: (match: Match) => void
  /** Whole seconds until the player is back, or null when they are alive. */
  onDown?: (seconds: number | null) => void
  /**
   * A `load` verb fired, naming where it wants to go.
   *
   * The *name* as the document wrote it, not a resolved target: what it points
   * at depends on the document's own `scenes` table, and the scene is what
   * holds the document. Resolving here would be this file knowing about a
   * table it does not own.
   *
   * `names` is the one thing the name cannot carry: `load scene:` means a room
   * in this document and nothing else, while `load xp:` means the table first
   * and a document second. Both spell their destination the same way, so the
   * verb has to say which it was.
   */
  onLoad?: (name: string, names: 'either' | 'scene') => void
  /**
   * A face this player pulled, with a counter so the same one twice is two.
   *
   * Comes from the scene, because the picker is DOM outside the Canvas and this
   * is inside it. Two things are done with it and they are deliberately not one
   * thing: it is handed to `Together` to broadcast, and it is shown over our own
   * body here without waiting for that to land. See the send effect in
   * ./together for why our own bubble does not go through the wire.
   */
  emote?: { id: EmoteId; at: number }
  /**
   * Where the world is watched from, on its way to the controller.
   *
   * Threaded rather than read off the document here, because the scene has
   * already resolved it to build the right *kind* of camera and two readings of
   * `cameraOf` is two things that could disagree about which one the Canvas got.
   */
  camera?: XpCamera
  /**
   * What a thumb is asking for, when the device has one.
   *
   * Passed straight through to the controller, which merges it with the keys.
   * Nothing in this file reads it - it is here because `Player` is mounted here
   * and the controls that write it live outside the Canvas.
   */
  touch?: { readonly current: Touch | null }
  /**
   * Handed the dash's own wait once, on mount, for whatever draws a button.
   *
   * The inversion `TouchControls` uses for `Touch`, in the other direction: this
   * file *writes* the number, so this file owns the object and the HUD is handed
   * a reference to it. A buffer made by the scene and mutated here would be two
   * authorities on one value, which is the arrangement React's compiler refuses
   * and the one that lets a ring and a gate drift apart. See ./cooling.
   */
  onCooling?: (cooling: Cooling) => void
}) {
  /**
   * The entities, spawned once and then *stepped*.
   *
   * A ref rather than state, which is the note the previous version of this file
   * left for whoever added the first thing that moves: the whole point of
   * keeping entity state in plain maps is that a frame loop can change them and
   * a renderer can read them without either knowing the other exists. In state
   * this would be sixty re-renders a second of a tree holding thousands of
   * instanced meshes.
   *
   * It lives here rather than a level up, and so do the two below, because this
   * is the component that writes them. A ref passed down as a prop and mutated
   * by the child is the shape React's compiler refuses, and it is right to: the
   * thing that owns a mutation should be the thing that renders the things that
   * read it.
   */
  /**
   * The blueprints the *runtime* uses, which is the document's plus a body.
   *
   * Not the document's own map: a document that does not say what the player is
   * gets the built-in dummy, and adding that to `xp.blueprints` would be adding
   * a blueprint to a file somebody is going to save.
   */
  /**
   * The level's blueprints, plus the body this player wears.
   *
   * `avatar` is the animal off their profile - the same one the lounge draws
   * them as - so somebody who has chosen to be a fox is a fox here too. A level
   * that declares its own `player.blueprint` ignores it; see `bodiesFor`.
   */
  const blueprints = useMemo(() => bodiesFor(xp, avatar, me?.id), [xp, avatar, me?.id])

  /**
   * Whether the player can see their own body.
   *
   * True in third person, and *always* in a level whose camera stands somewhere
   * that is not your head - side-on and fixed both do, so you are looking at
   * yourself whatever `view` says. Being behind you and being you are separate
   * questions that happened to have the same answer until a camera existed that
   * was neither.
   *
   * **`fixed` was missing here and it is not a cosmetic omission.** A table is
   * the one thing this camera is for, a table is played with a *cursor*, and a
   * cursor you cannot see is a level you cannot play: mensch put the ring on the
   * board, drew everybody else's, and left out the one belonging to the person
   * trying to aim it.
   */
  const shows = view === 'third' || shot?.kind === 'side' || shot?.kind === 'fixed'

  /** What a person looks like here, and the pack arithmetic that sizes them. */
  const body = useMemo(() => {
    const { model, scale } = bodyOf(xp, blueprints, avatar, me?.id)
    const pack = splitModel(model)?.pack
    /** The pack's own idea of a cell, times whatever the document asked for. */
    const drawn = (pack?.scale ?? 1) * scale
    /** World units, because this is where both halves of it are known. */
    const lift = ((pack?.lift ?? 0) + floorOffset(model)) * scale
    return {
      model,
      scale,
      url: modelUrl(model),
      /**
       * Which skeleton the player's body is, read off the pack.
       *
       * Undefined for a model from a pack we do not ship, which is a remote
       * document rather than a mistake - `SkinnedBody` falls back to the dummy,
       * which is exactly what happened to such a body before there were two.
       */
      rig: skeletonOf(model),
      drawn,
      lift,
      /**
       * A clear hand above the top of a head, from a body's feet.
       *
       * Worked out here for the same reason `lift` is: the catalogue knows how
       * tall the model is, the pack knows what a cell means and the document
       * knows what it asked for, and this is the one place all three are already
       * in hand. Everybody in a room is drawn from the same document, so one
       * number does for all of them.
       *
       * The fallback is a person. A model the catalogue has never heard of is a
       * remote pack rather than a mistake, and a label at roughly head height on
       * a body of unknown size beats no label at all.
       */
      head: lift + (findModel(model)?.size.h ?? 2.4) * drawn + 0.3,
      /**
       * The clip the player's own blueprint says to stand in, if it says one.
       *
       * Read here rather than in the body component because this is where the
       * player's blueprint is already resolved - and it is `xp.player.blueprint`
       * rather than whatever `bodyOf` fell back to, since the built-in dummy has
       * no blueprint to carry a pose.
       */
      pose: xp.player.blueprint ? blueprints[xp.player.blueprint]?.pose : undefined,
    }
  }, [xp, blueprints])

  /**
   * What the player is holding, if anything, for the hand bone to carry.
   *
   * Only in third person - see `OWN_BODY_AND_GUN`. In first person the gun stays
   * on the instanced path, where it is the view model at the end of an arm the
   * camera is inside of, and there is no skinned body to hang it off anyway.
   */
  const weapon = useMemo(
    /**
     * The grip comes through whole - see `heldFrom`, which is the one place
     * the blueprint's model and the pack's scale meet, shared with the pose
     * editor so the two cannot resolve the same document differently.
     */
    () => heldFrom(xp.player.weapon, blueprints),
    [xp.player.weapon, blueprints],
  )

  /**
   * Where *this* player arrives, which is not necessarily `xp.spawn`.
   *
   * A document's `spawn` marks were drawn, counted and validated - a `match`
   * with fewer than two is refused - and then never read: everybody arrived at
   * the single point on the document, including in a level whose author had
   * placed two team spawns. See ./spawn.
   *
   * Memoised on the identity of the player rather than computed inline, because
   * this is the one number that must not change while somebody is standing on
   * it: it is the spawn, the restart target and the revive target, and three
   * different answers to "where do I go back to" is a bug that only appears
   * after somebody dies.
   */
  /**
   * Everybody in the room with their names, for the scoreboard.
   *
   * From presence rather than from the arbiter, which has never heard of a
   * name - the join between the two is ./standings, and it is pure so that the
   * ways it can go wrong are tests rather than a board that looks odd.
   *
   * Declared up here rather than beside the rest of the room's state because
   * `side` reads it now: a level that seats people in order needs the room
   * before it can seat anybody.
   */
  /**
   * Which mode is running, and therefore which of the level's flows.
   *
   * A projection rather than a branch: everything below goes on reading one
   * flow, the way it goes on reading one world in a document with scenes. See
   * `flowFor`.
   */
  const playing = mode ?? modeOf(rulesOf(xp))
  const flow = useMemo(() => flowFor(xp, playing), [xp, playing])

  /** And the scripts are told, so `world.mode` is the session's answer. */
  useEffect(() => {
    scripts?.setMode(playing)
  }, [scripts, playing])

  /**
   * Tell the scripts whether anybody else can be in here, for `world.live`.
   *
   * A room is the whole of the question. A level opened at its own address with
   * no `?room=`, or in the editor's try-out, is one person and one machine: no
   * channel, no arbiter, nobody to disagree with. Inside a room there is a host
   * behind it and everything a script might defer to.
   *
   * An effect rather than a line in the frame loop, because it changes when
   * somebody walks through a door and not sixty times a second - and pushed to
   * the sandbox rather than pulled from it, because a bridge function is a
   * closure with nowhere to thread an argument through (see `Scripts.setLive`).
   */
  useEffect(() => {
    scripts?.setLive(room !== undefined)
  }, [scripts, room])

  const [roster, setRoster] = useState<readonly XpPlayer[]>([])

  /**
   * The chair this player is sitting in, for `assign: 'claim'`.
   *
   * State rather than a ref because it moves the body: a seat decides which
   * spawn somebody arrives at, and the re-seat effect below is what carries them
   * there. Set from the arbiter's reply when they ask, and from the view on
   * every poll after - the second is what makes a reload put you back in your
   * own chair rather than at an empty table.
   */
  const [seat, setSeat] = useState<string | undefined>(undefined)
  /** Every chair and who is in it, so a HUD can say which are free. */
  const [seats, setSeats] = useState<Record<string, string>>({})

  /**
   * Which side this player is on, or undefined in a level that has no sides.
   *
   * Derived rather than transmitted - see ./teams. For `assign: 'spread'` it
   * decides which spawn mark they arrive at and has to be known on the first
   * frame, which is exactly when a roster is not available - hence the hash.
   *
   * **`assign: 'order'` is the one that answers late**, on purpose: it seats
   * people in the order the room agrees on, so it has nothing to say until the
   * room is there. That is the whole reason `roster` is a dependency here, and
   * the reason the effect below exists.
   *
   * **`assign: 'claim'` answers later still, and never on its own.** Nobody has
   * a side until they have asked the table for one and been given it, which is
   * a round trip - so a level that claims seats has everybody sideless for its
   * first seconds, deliberately. See `seat` below.
   */
  const side = useMemo(
    () =>
      sideOf(
        xp.world.marks,
        {
          ...(me ? { id: me.id } : {}),
          ...(team ? { given: team } : {}),
          ...(seat ? { seat } : {}),
          roster: roster.map((one) => one.id),
        },
        rulesOf(xp),
      ),
    [xp.world.marks, xp, me, team, seat, roster],
  )

  const arrival = useMemo(
    () =>
      /**
       * A resume replaces the arrival rather than moving the body afterwards.
       *
       * Arriving is one act. Placing somebody at the spawn and then teleporting
       * them to their checkpoint is the same body written by two people, which
       * is the failure `placeAt` and the arrival effect's dependencies were
       * already shaped to avoid — and on a slow store it would be visible.
       */
      resumeAt ??
      /**
       * And with its feet on the ground, which the document may not have said.
       *
       * Outside `arrivalSpot` rather than inside it: choosing *which* mark and
       * *which slot* is about who you are, and standing on the floor is about
       * where the level is - so the pure function stays about the first and this
       * wrapper is the second. See `groundedSpot` for why a drop is allowed to
       * overrule an authored height where a search would not be.
       *
       * A resume is deliberately outside it too. A checkpoint records a spot
       * somebody was *standing on*, so it is already grounded by construction -
       * and it is the one arrival where being moved, even downwards, would be a
       * save point that did not put you back where you were.
       */
      groundedSpot(
        xp.world,
        solids.isSolid,
        arrivalSpot(
          xp.world.marks,
          {
            ...(me ? { id: me.id } : {}),
            ...(side ? { team: side } : {}),
            /**
             * A side is a chair only when the room hands them out one apiece.
             *
             * Under `spread` a side is a *team*, several people deep, and the
             * arrival grid is what keeps them out of each other. `order` and
             * `claim` both promise one person per side, so the grid is solving a
             * collision that cannot happen - and it costs the whole reason a
             * seat is where it is: a board game puts your chair within arm's
             * length of your own pieces, and a cell of scatter is the difference
             * between reaching them and not. That is not a guess; it is where an
             * afternoon went, twice.
             */
            seated: SEATS_ONE.has(rulesOf(xp).assign ?? DEFAULT_ASSIGN),
          },
          xp.spawn,
          /**
           * Can somebody stand there? See `canStandIn`, which is the whole answer.
           *
           * A named function rather than a closure here, because the answer has
           * edge cases worth testing - a level whose floor is thicker in the grid
           * than it looks on screen, a wall four cells tall - and a predicate
           * written inside a `useMemo` is one nothing can ask.
           */
          canStandIn(xp.world, solids.isSolid, solids.topOf),
        ),
        solids.topOf,
      ),
    [xp.world, xp.spawn, solids, me, side, resumeAt],
  )

  /**
   * How many times this level has been started.
   *
   * Zero is the first time somebody opened it, and every increment is a rematch.
   * State rather than a ref because the two mode components are *keyed* on it -
   * remounting them is how their clocks go back to zero, and a remount is a
   * thing React has to be told about.
   */
  const [round, setRound] = useState(0)

  /**
   * Whether the match has finished, which is the only time `R` does anything.
   *
   * Held here rather than read from the scene's copy because the key handler
   * lives here, and a prop threaded back down from a parent that got it from a
   * child of this component would be a round trip for a boolean. Set from the
   * same callback that reports the match upwards - React bails out when the
   * value has not changed, so a match in progress costs no extra renders.
   */
  const [over, setOver] = useState(false)

  /**
   * Everybody else, as the buffer ./together fills.
   *
   * Handed up rather than lifted out, because a shot has to be tested against
   * the bodies that are *drawn* - see `Crowd.targets`. Null until the room is
   * joined, and null is a level with nobody else in it.
   */
  const bodies = useRef<Crowd | null>(null)
  /**
   * What this client last told the room about the world, and the counter that
   * makes an unchanged picture cost nothing.
   *
   * State *and* a ref, which is the pattern `revives`/`reviveAt` already uses
   * here: the frame loop is where a change is noticed and React is where the
   * prop has to arrive, and the ref keeps the comparison out of a render.
   */
  const [share, setShare] = useState<{ value: WorldShare; at: number } | null>(null)
  const lastShared = useRef(nothingShared())

  /**
   * Names this client's rules said, on their way out to the room.
   *
   * A counter beside them rather than a plain array, because two frames saying
   * the same name are two events and a receiver comparing values would hear the
   * first and ignore every one after it - the same identity problem `clip.at`
   * solves in ./sharing, and the same answer.
   *
   * State rather than a ref because the send lives in an effect, which is what
   * keeps the socket out of the frame loop.
   */
  const [signal, setSignal] = useState<{ said: readonly Said[]; at: number } | null>(null)
  const signalId = useRef(0)
  /** What peers have said, waiting for a frame to deliver it in. */
  const fromPeers = useRef<Said[]>([])


  /**
   * What the arbiter has said about shots at other people.
   *
   * `pending` is the count in flight and it is on the screen for the reason
   * §4.1 gives at length: a result latched locally before the round trip is a
   * result you can lose, and this project has lost one that way already. Drawn
   * as pending, replaced by the answer.
   */

  /** Kills per account id, exactly as the arbiter last reported them. */
  const [scores, setScores] = useState<Record<string, number>>({})

  /** Lives per account id, empty in a match nobody can be eliminated from. */
  const [lives, setLives] = useState<Record<string, number>>({})

  /**
   * Health per account id, exactly as the arbiter last reported it.
   *
   * The whole map rather than our own row, which is what the poll already
   * receives and threw away - `xp_arbiter_view` returns `health` unredacted,
   * because the server has no reason to keep from you a number you can work out
   * by counting your own hits. Kept so the bar over somebody's head is the
   * arbiter's answer rather than a subtraction this client did.
   *
   * Written from two places on purpose. The poll is the slow one, once a second,
   * and it is what keeps a body somebody *else* shot up to date. A confirmed
   * `hit` carries the same map in its outcome, so the person you are shooting at
   * loses their bar on the round trip that resolved the shot rather than up to a
   * second later - which is the moment the number is actually being read.
   */
  const [health, setHealth] = useState<Record<string, number>>({})

  /**
   * What a whole body is worth in this match, as the first join pinned it.
   *
   * The arbiter's number and not the document's, though they are the same in
   * every match that opens: a client whose document disagrees is refused entry
   * rather than adjusted (20261008000000_xp_arbiter_hits.sql), so a bar measured
   * against the local blueprint would only ever differ in the case where this
   * client is playing a game nobody else is. Undefined until somebody has
   * joined, which ./vitals reads as "no bar" rather than "a full one".
   */
  const [whole, setWhole] = useState<number | undefined>(undefined)

  /** The vote the room is having, or null. */
  const [vote, setVote] = useState<OpenVote | null>(null)

  /**
   * Whose turn it is, or null in a level that is not taking any.
   *
   * Null is the ordinary case and not a missing value: turns start when
   * somebody passes for the first time, so every level without a `pass` verb in
   * it stays here forever and draws nothing.
   */
  const [turn, setTurn] = useState<string | null>(null)
  /**
   * The same answer where the frame loop can read it.
   *
   * The loop filters presses against `allowedFor`, and a `who: 'turn'` phase
   * makes whose go it is part of that filter - but the loop reads refs, not
   * state, for the same staleness reason every other loop-read value here is
   * a ref. One effect, so the two cannot drift.
   */
  const turnNow = useRef<string | null>(null)
  useEffect(() => {
    turnNow.current = turn
  }, [turn])

  /**
   * What we were dealt, and nobody else was told.
   *
   * Comes back from the view, which redacts it per caller - so this is the one
   * piece of state here that is *ours* in a sense the others are not: every
   * client has a different value and none of them can see another's.
   */
  const [secret, setSecret] = useState<string | null>(null)

  /**
   * How each *other* player may be drawn, which is the one thing about somebody
   * else's deal that ever leaves the arbiter.
   *
   * Not their role: the arbiter is handed a map of value to look when the deck
   * is dealt (see the `deal` call), and publishes the look. A room where one
   * person is invisible therefore knows that somebody is - it could hardly not,
   * having no body to look at - without knowing anything else about the deal.
   * The alternative, each client deciding from everybody's role, is the design
   * this whole subsystem is built to make impossible.
   *
   * Empty for every level that has never hidden anybody, which is every level
   * written before docs/xp/xp-flow.md §3.
   */
  const [looks, setLooks] = useState<Record<string, RoleView>>({})

  /**
   * Which of those ids is us.
   *
   * The arbiter's answer, not `me.id`. They are the same today and they are two
   * different systems' idea of who somebody is - presence is told an id by this
   * client and the arbiter reads one off the session - so the row marked "you"
   * comes from the side that cannot be told.
   */
  const [mine, setMine] = useState<string | undefined>(undefined)

  const [kills, setKills] = useState<{ mine: number; pending: number; refused: string | null }>({
    mine: 0,
    pending: 0,
    refused: null,
  })

  useEffect(() => {
    onKills?.(kills)
  }, [kills, onKills])

  /**
   * The board, joined from three places that each know one third of it.
   *
   * A memo rather than state: it is derived from three things that are already
   * state, and a fourth copy would be a fourth thing to keep in step.
   */
  const standings = useMemo(
    () =>
      standingsFrom({
        scores,
        lives,
        roster,
        me: mine,
        marks: xp.world.marks,
        rules: rulesOf(xp),
        ...(team === undefined ? {} : { team }),
      }),
    [scores, lives, roster, mine, xp, team],
  )

  /**
   * The bars over everybody else, from the same two facts the board is built of.
   *
   * A memo beside `standings` and for the same reason: it is derived from state
   * that already exists, and a fourth copy of the arbiter's health map is a
   * fourth thing that can be one poll behind. See ./vitals for what a client is
   * allowed to draw here and why the ceiling is the arbiter's.
   */
  const bars = useMemo(() => barsFrom({ health, full: whole, me: mine }), [health, whole, mine])

  /**
   * What in the level has been hit, for the bars over things.
   *
   * State rather than a ref, because the *list* is what React draws and it
   * changes about once a hit — where each bar sits is the frame loop's, from
   * the world. Recomputed on the frame an effect says something took damage
   * rather than every frame: `hurtIn` walks every living entity, and a level of
   * four hundred crates should not pay for that sixty times a second to find
   * out nothing has changed.
   */
  const [damaged, setDamaged] = useState<readonly Hurt[]>([])
  /** What the last frame drew, so an unchanged list is not a re-render. */
  const drawnDamage = useRef<readonly Hurt[]>([])

  useEffect(() => {
    onStandings?.(standings)
  }, [standings, onStandings])

  useEffect(() => {
    onVote?.(vote)
  }, [vote, onVote])

  useEffect(() => {
    onSecret?.(secret)
  }, [secret, onSecret])

  useEffect(() => {
    onTurn?.(turn)
  }, [turn, onTurn])

  useEffect(() => {
    onSeats?.(seats)
  }, [seats, onSeats])

  /**
   * The last roll, as state, so a banner can be drawn from it.
   *
   * `at` is the arbiter's own counter rather than a clock, which is what makes
   * two fours in a row two announcements: a value alone cannot say whether it
   * is news. The roller's own throw is stamped with a counter of its own for
   * the second before the poll catches up - see where it is set.
   */
  const [said, setSaid] = useState<{ seat: string | null; face: number; at: number } | null>(null)
  useEffect(() => {
    if (said) onRolled?.(said)
  }, [said, onRolled])
  /**
   * This client's own chair, where the frame loop can read it.
   *
   * A ref beside the state for the reason every other ref here is one: the
   * effect list is drained inside `useFrame`, and reading React state there is
   * how a frame loop ends up holding last render's answer.
   */
  const seatNow = useRef<string | undefined>(undefined)
  // In an effect rather than beside the declaration: writing a ref during render
  // is the thing the compiler refuses, and for a good reason - a render that is
  // thrown away would still have written it.
  useEffect(() => {
    seatNow.current = seat
  }, [seat])

  /**
   * Deal the deck, once, when there are enough people to start.
   *
   * `rules.roles` has existed since capture the flag's cousin was designed and
   * nothing has ever called `deal` — docs/xp/server-authority.md says so in as
   * many words. This is the call.
   *
   * **Every client asks, and that is not a race to be fixed.** The arbiter
   * refuses a second deal outright ("this round has already been dealt"), so the
   * first ask wins and the rest are told no by a rule that exists precisely to
   * stop somebody re-rolling a role they did not like. A single elected dealer
   * would need an election, and an election needs the thing the arbiter already
   * is.
   *
   * **When** is the harder half. It deals at `players.min`, because the arbiter
   * hands a value to everybody who has *joined* and a deal at one player is nine
   * people with no role and no second chance. A document's `min` is the number
   * it already says it needs to start, so the level decides rather than this
   * file.
   *
   * **And again every round, which is the half that was written twice.** This
   * file used to hold two of these — a two-second timer keyed on the round, and
   * the gate above behind a `once` ref — and they were each other's bug rather
   * than a duplicate: the timer dealt to whoever had arrived by the two-second
   * mark, which is the case the `min` gate exists to prevent, and the gate never
   * dealt a second time, so a rematch was played with the first round's roles or
   * with none. The ref remembers *which round* it asked for, which is both.
   */
  /**
   * Seat the table when the room is full enough, not when somebody first passes.
   *
   * ---------------------------------------------------------------------------
   * The opening round was a free-for-all
   * ---------------------------------------------------------------------------
   * The arbiter refuses an out-of-turn roll, and only once there *is* a turn:
   * `turn_now is not null` gates it, because a level with no turns must not have
   * every roll refused. Turns began on the first `pass` - so from the moment a
   * board opened until somebody first said *I am done*, four people could all
   * roll, and the first round of every game was the one round with no rule.
   *
   * That is the round where it matters most. It is when nobody knows whose go it
   * is yet, and a die that answers everybody teaches the table that the order is
   * advisory.
   *
   * **Every client asks, and that is not a race to be fixed** - the same shape
   * `deal` above has and for the same reason. `turn_start` refuses a second
   * caller with *turns have already started*, so whoever gets there first seats
   * the table and the rest are told something they do not need to hear.
   *
   * Gated on `min` for the same reason the deal is: seating two players of a
   * four-seat board would hand the first turn to somebody and make the other two
   * wait for a player who has not arrived. A document that says how many it is
   * for has said when it is ready.
   */
  const seatedFor = useRef(-1)
  useEffect(() => {
    if (!arbiter || seatedFor.current === round) return
    // Only a level that takes turns. `pass` is the verb that means them, and a
    // document with no `pass` anywhere is a document the arbiter must keep
    // answering "nobody is taking turns" for.
    if (!takesTurns(xp)) return
    if (roster.length + 1 < playersOf(rulesOf(xp)).min) return

    seatedFor.current = round
    void arbiter
      .ask('turn_start', {})
      .then((verdict) => {
        // Already started is the ordinary answer for everybody but the first,
        // and is said to nobody.
        if (!verdict.ok && verdict.message !== 'turns have already started') {
          setKills((was) => ({ ...was, refused: `${verdict.why}: ${verdict.message}` }))
        }
      })
      .catch(() => {})
  }, [arbiter, round, roster.length, xp])

  const dealtFor = useRef(-1)
  useEffect(() => {
    if (!arbiter || dealtFor.current === round) return

    const deck = rulesOf(xp).roles
    if (!deck || deck.length === 0) return
    if (roster.length + 1 < playersOf(rulesOf(xp)).min) return

    dealtFor.current = round
    /**
     * And what each value *looks like*, handed over with the deck.
     *
     * The arbiter cannot work this out and no other client may: deciding whether
     * to draw somebody needs that person's role, and handing a client somebody
     * else's role is the one thing this whole subsystem exists not to do. So the
     * only party that has seen the whole deal is told what each value looks
     * like, and publishes the *look* per player instead of the value.
     *
     * Sent by whoever deals, on the same terms as the deck itself: the first ask
     * wins and the rest are refused, so a client that lied about it would have
     * had to lie about the deck in the same breath. No new trust is being placed
     * anywhere - see docs/xp/xp-flow.md §3.
     *
     * Omitted entirely when nothing is hidden, so every deck written before this
     * sends the byte-identical payload it always did.
     */
    const views = viewsOf(rulesOf(xp))
    void arbiter
      .ask('deal', {
        values: deck,
        ...(Object.keys(views).length > 0 ? { seen: views } : {}),
      })
      .then((verdict) => {
        /**
         * Already dealt is the ordinary answer for everybody but the first and
         * is said to nobody. A short deck is different: it is the author's
         * mistake rather than this player's, and it is the one refusal the
         * person standing in the level has to see, because the round they are
         * in has no roles in it at all.
         */
        if (!verdict.ok && verdict.message !== 'this round has already been dealt') {
          setKills((was) => ({ ...was, refused: `${verdict.why}: ${verdict.message}` }))
        }
      })
      .catch(() => {})
  }, [arbiter, roster.length, xp, round])

  /**
   * The role, on its way to the frame loop.
   *
   * A ref rather than the effect doing the work, and the lint rule is what
   * settled it: an effect that read `world.current` made the render-time
   * `world.current = build()` a few lines down illegal, because a value an
   * effect depends on may not be written during a render. That refusal is
   * pointing at something real — the world belongs to the frame loop, and a
   * second writer outside it is how two of this file's bugs started.
   *
   * So this hands the value over and the loop applies it, which is also what
   * fixes the thing I had hedged about: firing a trigger here would have meant
   * dropping its effects, and a `spawn` on being dealt a role would silently do
   * nothing.
   */
  const dealtTo = useRef<string | null>(null)
  const pendingRole = useRef<string | null>(null)
  useEffect(() => {
    if (secret) pendingRole.current = secret
  }, [secret])

  /**
   * What is true about *this player*, for every body they are given.
   *
   * The side and the secret, which are the two things the host knows and the
   * document does not. Read at the moment a body is made rather than captured,
   * because both can arrive after the world does - a side is known on the first
   * frame, a role is dealt a couple of seconds in - and a body built before
   * either is a body that gets it on the next respawn.
   *
   * The whole reason this exists is that `spawnPlayer` re-seeds `props` from the
   * blueprint: anything written onto the body from out here is gone the first
   * time somebody dies. See `PlayerFacts`.
   */
  /**
   * `secret` and not `pendingRole`, which are the same value a frame apart.
   *
   * The ref is the frame loop's copy, and one of this function's callers is
   * `build`, which runs during a render - where reading a ref is refused, and
   * rightly: a body made from a value React has not been told about is a body
   * that does not change when the value does. The state is the same answer and
   * is one this component re-renders on.
   */
  const facts = (): PlayerFacts => ({
    ...(side ? { team: side } : {}),
    ...(secret ? { role: secret } : {}),
  })

  /**
   * The team totals, where the frame loop can read them.
   *
   * A ref because ./matching reads it sixty times a second and the value
   * changes about once a kill; as a prop it would restart that loop's effect
   * every time anybody scored.
   */
  const sides = useRef<readonly { side: string; kills: number }[]>([])
  useEffect(() => {
    sides.current = teamTotals(standings)
  }, [standings])

  const world = useRef<EntityWorld | null>(null)
  /** Seconds since this instance started. See the note where it is advanced. */
  const elapsed = useRef(0)
  /**
   * What each thing's health was last frame, and how long each is still
   * flinching for. Two halves of one answer - see ./shake.
   *
   * Refs, and both are thrown away by the rematch below along with the world
   * they describe: ids are reused when the level is rebuilt, and a leftover row
   * would make the first crate of the new round flinch for a hit landed in the
   * last one.
   */
  const seenHp = useRef(new Map<number, number>())
  const shaking = useRef(new Map<number, number>())
  /**
   * And how far behind itself each body is still being drawn.
   *
   * Beside the flinch because it is the same kind of thing - a number only the
   * mesh knows about, thrown away with the world it describes - and here rather
   * than in the renderer because the moments it is *written* are handovers, which
   * are a fact about the network and arrive in this component's socket handlers.
   * See `@kxb/xp/drawing` for why a handover needs absorbing at all.
   */
  const smoothing = useRef(new Smoothing())
  /**
   * The stream a rule with a range in it draws from.
   *
   * The same three numbers a script's `world.random()` is addressed by, from the
   * same place, deliberately: the room's topic when there is a room and the
   * document's own id when there is not (see `scene.tsx`, which seeds the script
   * engine with exactly this). A level played alone rolls the same game twice,
   * which is what a screenshot and a bug report both want, and two clients in a
   * room draw from one stream rather than two.
   *
   * Agreement is a bonus here rather than the point, and it is worth saying so:
   * the *outcome* of a `damage … upTo` already crosses the wire as health
   * (`@kxb/xp/sharing`), so a receiver takes the hitter's word whatever it
   * rolled. What this buys is a replay that replays.
   *
   * `index` resets whenever the tick moves, exactly as `script.ts` does it — see
   * ./random for why a cursor each machine keeps is the shape that silently
   * diverges the moment somebody joins a match already running.
   */
  const seed = useMemo(() => seedFrom(room ?? xp.id), [room, xp.id])
  const rolls = useRef({ at: -1, index: 0 })
  const roll = useCallback(() => {
    const tick = world.current?.tick ?? 0
    if (tick !== rolls.current.at) {
      rolls.current.at = tick
      rolls.current.index = 0
    }
    return randomAt(seed, tick, rolls.current.index++)
  }, [seed])
  /**
   * The bag every rule pass is handed, in one place.
   *
   * It used to be written out at each of the five call sites, which is how
   * `damage()` ended up as the one entry point into the rules that passed
   * nothing at all - and a `damaged` rule saying "go away for three seconds"
   * therefore went away for good. A bag assembled once cannot be assembled
   * differently in one place.
   *
   * A function rather than a value because `now` is read off a ref that moves
   * every frame: a memo would hand out the time the memo was built.
   */
  const clockNow = useCallback(
    (): TriggerClock => ({
      now: elapsed.current,
      marks: xp.world.marks,
      random: roll,
      ...(data ? { data: data.current } : {}),
    }),
    [xp.world.marks, roll, data],
  )
  /**
   * Build the world, and build it again for a rematch.
   *
   * A function rather than an inline block because it is now called from two
   * places, and the second one is the whole point: everything a match wrote on
   * the level - a crate broken, a pickup taken, a target shot - lives in these
   * maps, so throwing them away and asking the document again is the *entire*
   * reset. There is no list of things to undo, and no way for one to be missed,
   * which is what makes this the cheap version of a feature that is usually
   * expensive.
   */
  const build = () => {
    const started = spawnEntities(xp)
    // The player is an entity from the first frame, which is what lets the
    // instancer draw them, a script find them by name, and a trigger say who
    // walked in.
    spawnPlayer(started, xp, arrival, facts())
    // And whatever they arrived holding, hung off a socket on the body - the
    // same mechanism a rider in a kart's seat gets.
    spawnWeapon(started, xp)
    return started
  }
  if (world.current === null) world.current = build()

  /**
   * Refilled every frame here, read every frame by the controller.
   *
   * One array, mutated in place. A new one per frame would be sixty allocations
   * a second of something nothing outside this file ever sees.
   */
  const blockers = useRef<Blocker[]>([])
  /** Where the player ended up last frame - see the note above about ordering. */
  const playerAt = useRef<Vec3>({ x: arrival.x, y: arrival.y, z: arrival.z })
  /** Which way they are facing, in degrees, so the body turns with the camera. */
  const heading = useRef(arrival.facing)
  /**
   * How many times the player has been put somewhere rather than walking there.
   *
   * Reported by the controller, which is the only thing that can tell the two
   * apart, and read by ./racing - where the distinction is the difference
   * between "you finished" and "you died next to the finish". Kept here rather
   * than in the race because a restart is a fact about the *player*, and the
   * next thing that wants it (a lap counter, a checkpoint) will want it too.
   */
  const teleports = useRef(0)

  /**
   * Every point the level has produced since it loaded.
   *
   * A running total that is only ever added to, read by ./matching as a
   * difference against what it last saw. A per-frame figure would have to be
   * cleared by whoever read it, and the reader is a second `useFrame` that R3F
   * does not promise to run after this one - so a point scored on the wrong side
   * of that boundary would simply vanish. A total cannot lose one.
   */
  const tally = useRef(0)
  /**
   * How many matches have ended, so the frame loop can tell the document once.
   *
   * A counter rather than a flag, like everything else that crosses the boundary
   * between two `useFrame` loops here: the mode system decides the match is over
   * inside its own frame, and this file has to notice on *its* next one without
   * depending on which of the two R3F ran first.
   */
  const ended = useRef(0)
  /** How many it had noticed, so the trigger fires once rather than every frame. */
  const told = useRef(0)
  /** How many runs have been completed, from ./racing. Only parkour reads it. */
  const finishes = useRef(0)

  /**
   * Where every entity's box was last frame.
   *
   * Handed to `blockersOf`, which turns it into a per-box delta - which is what
   * makes a platform something you ride rather than something that slides out
   * from under you. Kept here rather than on the world because "since when" is a
   * question about a frame loop, and the world is a value a test or a screenshot
   * script may step in whatever order it likes.
   */
  const wereAt = useRef<Map<number, Box>>(new Map())

  /**
   * And where the *player* was, which is the only reading of how fast they are.
   *
   * `wereAt` cannot answer it: the player is not in the entity boxes it tracks.
   * One frame of positions is the whole measurement, and it is a measurement
   * rather than a question to the controller on purpose - the controller
   * already resolved the walk against walls and blockers, so the difference
   * between two frames is how far they *got*, which is what a shove should be
   * worth. Somebody pressed against a wall is going nowhere and shoves nothing.
   *
   * Null until the first frame, where there is no "since" to measure against.
   */
  const wasPlayerAt = useRef<{ x: number; y: number; z: number } | null>(null)

  /** And where every peer was, for the same measurement. Keyed by their id. */
  const wasPeersAt = useRef<Map<string, { x: number; y: number; z: number }>>(new Map())

  /** While a dash is travelling, and who it has caught. See ./match/dash. */
  const dash = useDash()

  /**
   * How long each key's wait is, straight off the document.
   *
   * A memo because it is read in the press pass every frame and the answer only
   * changes when the level does. Empty for every document that asks for no wait
   * anywhere, which is what lets the gate and the publish below skip themselves
   * entirely rather than walking an empty map sixty times a second.
   */
  const waits = useMemo(() => cooldownsOf(xp.player.keys), [xp.player.keys])
  /**
   * When each key with a wait on it may be pressed again, by the name it emits.
   *
   * A map rather than a number per verb, because the wait is a fact about a
   * *binding* and a document may put one on any of them - see `cooldownsOf`. An
   * absent entry is a key that has never been pressed, which reads the same as
   * one whose wait has run out, so nothing has to be seeded on the first frame.
   */
  const readyAt = useRef(new Map<string, number>())
  /**
   * The same wait, on its way out to whatever draws a button.
   *
   * Written once a frame and never read here. This file owns it - see
   * `onCooling` - and the HUD is handed the reference on mount, so the arc on a
   * button and the gate on a press are the same number rather than two timers
   * that agree most of the time.
   */
  const cooling = useRef<Cooling>({ of: new Map<string, number>() })
  useEffect(() => {
    onCooling?.(cooling.current)
  }, [onCooling])

  /** Refilled each frame and handed to `stepBodies`. See where it is built. */
  const shovers = useRef<Shover[]>([])

  /**
   * Pushes a script made here, waiting to be told to whoever owns the bodies.
   *
   * Moved off the world every frame rather than drained straight from it, and
   * the reason is the one this file already notes about R3F: the transport has
   * its own `useFrame` and the order between two of them is not promised. A
   * reader that drained `live.shoves` directly would get a frame's worth or
   * nothing depending on which loop ran first, which is a kick that works four
   * times in five.
   */
  const outgoingShoves = useRef<Shove[]>([])

  /**
   * What the owner has said about the moving things, buffered.
   *
   * A follower draws the ball *between* two of these a fixed delay behind
   * rather than simulating it - see `@kxb/xp/owning`, where the arithmetic for
   * why correcting a second simulation cannot work is written down. Null while
   * this client is the owner, and cleared when it becomes one, because at that
   * moment it is integrating and nothing in here is true any more.
   */
  const owned = useRef<Balls>(new Balls())
  const following = useRef(false)

  /**
   * A fall that costs the run rather than the walk back.
   *
   * At `floorY` rather than at the catch forty cells below it: the point of a
   * platformer is that missing a jump is *immediate*, and thirty cells of
   * falling first is thirty cells of knowing you have already lost and waiting
   * to be told about it.
   *
   * A spread rather than a prop, so a document that does not ask for it passes
   * nothing at all and the controller keeps the behaviour it has always had.
   */
  // `OUT_OF_WORLD` below the floor rather than at it: the catch has to be
  // somewhere a body resting on the ground can never be. See its note - at
  // `floorY` exactly, standing still restarts you on the first frame.
  const restart =
    xp.world.restart || xp.world.fatal
      ? { restartBelow: xp.world.floorY - OUT_OF_WORLD }
      : {}

  /**
   * A fall that costs a life rather than the run.
   *
   * The body still comes back the instant it crosses the plane - that is the
   * controller's restart, and it is what stops a corpse falling out of sight for
   * the length of the respawn wait. What `world.fatal` adds is the *death*: the
   * health goes to zero, and everything downstream is already built for that.
   *
   * **Nothing here is a second death path.** `isDead` is what the simulation
   * watches, so taking the health down is enough: the freeze, the `rules.respawn`
   * wait, the "back to the start" line, `revivePlayer` and the counter all follow
   * exactly as they do for the spikes. A hole and a spike teaching one rule is
   * the whole point of the field - see its note in `./format`.
   *
   * Local, like every other hazard: a fall is self-inflicted, so there is no
   * claim to arbitrate. The arbiter prices a body when *somebody else* is
   * responsible for it.
   */
  const onRestart = useCallback(() => {
    if (!xp.world.fatal) return
    const live = world.current
    if (!live || isDead(live, PLAYER_ID)) return
    damage(live, blueprints, PLAYER_ID, Number.POSITIVE_INFINITY, null, clockNow())
  }, [xp.world.fatal, blueprints, clockNow])

  /**
   * How many times the player has died, as the signal that they have.
   *
   * A ref and a counter rather than state: the simulation writes it inside
   * `useFrame`, and the only reader is a prop on the controller that has to
   * *change* to mean anything. See `reviveAt` in ./player.
   */
  const revives = useRef(0)
  /**
   * Seconds left face-down, or null when alive.
   *
   * A ref rather than state because it ticks on a frame; the *fact* of being
   * dead reaches React through `downFor` below, which changes about once a
   * second rather than sixty times.
   */
  const dying = useRef<number | null>(null)
  /**
   * Whether the controller should ignore the keyboard.
   *
   * A ref handed to `Player`, which reads it inside its own frame - the same
   * arrangement `blockers` has. A prop would be a re-render of the scene on
   * every death and every respawn.
   */
  const frozen = useRef(false)
  /**
   * When a stun wears off, on the same clock everything else here is timed on,
   * or null when nobody is stunned.
   *
   * The whole of what a `stun` verb amounts to. `deactivate` cannot do a
   * player - the controller writes the position every frame whatever this world
   * says - so being unable to move is state that has to live beside the
   * controller, and this is the second reason to hold the door the respawn wait
   * already opened: `frozen` down, and a deadline that lifts it.
   *
   * A ref rather than state for the same reason `dying` is one: it is set and
   * read inside `useFrame`, and a `setState` per stun would be a re-render of
   * the scene every time somebody was hit.
   */
  const stunned = useRef<number | null>(null)
  /**
   * Whether the gun is in the hand, for the skinned body only.
   *
   * State *and* a ref, which is the pattern `revives`/`reviveAt` already uses
   * here: the frame loop is where the answer is known and React is where it is
   * needed, and the ref is what keeps the comparison out of a render.
   */
  const [armed, setArmed] = useState(true)
  const hasGun = useRef(true)
  /**
   * And whatever was picked up off the floor, which is the other thing a hand
   * can have in it.
   *
   * Reported from capture the flag: *"when you take the gun you don't have a
   * gun."* You do - `carry` parents it to the body and `armedWith` fires it -
   * but the only thing drawing it was the instancer, at the blueprint's `hand`
   * socket, which is (0.32, 1.15, 0.34) on a dummy and therefore **inside the
   * chest**. The gun was picked up and disappeared.
   *
   * ./body/skinned already says why that offset cannot work and what to do
   * instead: a socket is a guess at where a hand is *while the body stands
   * still*, so a held thing belongs on the hand **bone**, which the animation
   * moves. That was built for `player.weapon` and never reached the other way a
   * thing gets into a hand.
   *
   * The pair rather than the id, because the renderer needs the blueprint to
   * resolve a model and the hide set needs the id, and reading the world for
   * either during a render is the frame-time read this file avoids everywhere
   * else. State *and* a ref for `armed`'s reason: the frame loop knows, React
   * needs to be told, and the comparison stays out of the render.
   */
  const [pickedUp, setPickedUp] = useState<{ id: EntityId; blueprint: string } | null>(null)
  const inHand = useRef('')

  /**
   * A pickup resolved for the bone, when there is a bone to put it on.
   *
   * Two gates, and both of them are about not breaking a level that works.
   *
   * **`shows`**, because this is the third-person half only. In first person a
   * held thing is a view model in front of the lens (./body/viewmodel), and
   * that is a *composition* - where a pistol sits so it reads as a pistol - not
   * a transform anything can derive from a blueprint. `player.weapon` is
   * authored knowing it will be drawn there; a plant somebody picked up in
   * `steal-a-plant` is not, and putting it 30cm from the camera would be a
   * slab of geometry across a level that draws it fine today.
   *
   * **`body.rig`**, because a hand bone is a fact about a *body*. `mensch` is
   * played with a cursor - its player blueprint is `shapes/ring_white` - and a
   * ring has no hands: attaching a piece to it draws nothing, and hiding the
   * instanced copy on top of that would take the piece off the board while
   * somebody was moving it. A model from a pack with no skeleton is exactly
   * that case, and it keeps the old drawing.
   */
  const inTheHand = useMemo(
    () =>
      pickedUp && shows && body.rig
        ? heldFrom({ blueprint: pickedUp.blueprint }, blueprints)
        : undefined,
    [pickedUp, shows, body.rig, blueprints],
  )
  /**
   * The worn gun wins, which is `armedWith`'s rule said about the drawing.
   *
   * A level that issues a pistol and also leaves a shotgun on a crate fires the
   * worn one, so drawing the pickup instead would put the model in the hand out
   * of step with the shot leaving it. A document that wants the pickup to
   * matter issues no weapon, which is what capture the flag does.
   */
  const handHeld = (weapon && armed ? weapon : undefined) ?? inTheHand
  /**
   * And what the instancer must therefore stop drawing.
   *
   * Only when something else is drawing it instead. Two copies of one pistol -
   * one in the hand, one buried in the chest - is the bug half-fixed, and a
   * hide with nothing on the bone is the pickup vanishing outright.
   */
  const hidden = useMemo(
    () =>
      inTheHand && pickedUp && !(weapon && armed)
        ? new Set<number>([...OWN_BODY_AND_GUN, pickedUp.id])
        : OWN_BODY_AND_GUN,
    [inTheHand, pickedUp, weapon, armed],
  )
  /**
   * Our own face, put up the moment it is picked.
   *
   * A slot rather than a prop passed down to the bubble, because the bubble
   * reads it in a frame loop and a prop would re-render the body on every
   * emote. Written in the effect below rather than during render, which is the
   * rule every other ref in this file follows.
   */
  const ownFace = useRef(noEmote())
  const faced = useRef(emote?.at)
  useEffect(() => {
    if (!emote) return
    if (faced.current === emote.at) return
    faced.current = emote.at
    /**
     * Ours goes up here rather than when the packet lands.
     *
     * `XpSocket` makes no delivery guarantee, so a face that only appeared once
     * it had been broadcast successfully would be one that sometimes silently
     * did not happen to the one person who definitely pressed the button. It is
     * also the only bubble in the room that does not need the wire at all: we
     * already know what we picked.
     */
    showEmote(ownFace.current, emote.id, performance.now())
  }, [emote])
  /**
   * Out of the match, for the rest of it.
   *
   * The arbiter's answer, read off our own row, and the runtime asks nothing
   * else about it: `revive` is refused server-side (20261013000000), so this is
   * the local half of a decision made elsewhere rather than a second copy of
   * the rule. A client that decided this for itself would be a client that
   * could decide the other way.
   *
   * A ref beside the state because the frame loop below reads it, and it is
   * read on the frame somebody dies rather than on the next render.
   */
  const out = standings.find((row) => row.mine)?.out === true
  const isOut = useRef(false)
  useEffect(() => {
    isOut.current = out
    // Frozen for good rather than for `rules.respawn` seconds. The countdown
    // never starts, so nothing ever unfreezes it.
    if (out) frozen.current = true
  }, [out])
  /**
   * The same count, as state, because a prop has to change to be noticed.
   *
   * Held here rather than lifted to the scene: nothing above this needs to know
   * how many times somebody has died, and a `setState` per death is a
   * re-render per death, which is a rate a person sets by hand.
   */
  const [reviveAt, setReviveAt] = useState(0)
  /**
   * Whole seconds left, for the HUD, or null when alive.
   *
   * Rounded up and only reported when it changes, so a three-second wait is
   * three re-renders rather than a hundred and eighty.
   */
  const [downFor, setDownFor] = useState<number | null>(null)
  /**
   * And the same fact in a ref, for the packet.
   *
   * Written here beside the state rather than in the frame loop, so there is one
   * place either can be wrong: an effect on `downFor` would be a second writer
   * running a tick behind the render it is describing.
   */
  useEffect(() => {
    down.current = downFor !== null
  }, [downFor])
  /**
   * Where a `teleport` verb last said the player should be, and how many times.
   *
   * Null until something teleports, so a level with no pads pays nothing and
   * `Player` is handed no prop at all.
   */
  /**
   * The save point this player has reached, once they have reached one.
   *
   * Null until a `checkpoint` verb fires, so a level without them hands
   * `Player` no prop and returns people to the spawn exactly as before. The
   * engine has already decided this beat the best so far - it only emits when
   * the number won - so there is no comparison to repeat here.
   */
  const [returnTo, setReturnTo] = useState<{
    x: number
    y: number
    z: number
    facing: number
  } | null>(null)

  const [sendTo, setSendTo] = useState<{
    x: number
    y: number
    z: number
    facing: number
    at: number
  } | null>(null)

  /**
   * A `dash` waiting for the controller, counted the way `sendTo` is.
   *
   * A counter and not the distance alone, for that field's reason exactly: two
   * dashes of four cells are two dashes, and state that only held the number
   * would be one.
   */
  const [shove, setShove] = useState<{ cells: number; at: number } | null>(null)

  /**
   * Taking your chair, when the chair was decided after you sat down.
   *
   * ---------------------------------------------------------------------------
   * The arrival that happens twice, and why that is the feature
   * ---------------------------------------------------------------------------
   * `assign: 'spread'` hashes an id so a side is known on the first frame,
   * precisely so that nobody is ever placed and then moved. `assign: 'order'`
   * gives that up on purpose: it seats people in the order the room agrees on,
   * so it has nothing to say until the room has arrived. Which means the body is
   * already standing somewhere by the time its seat is decided.
   *
   * Being moved to your own end of the table when the room fills is the game
   * starting, not a glitch - and it is the whole of "everybody goes to their
   * colour when the match begins". Three things move together and they have to:
   *
   * - **the body**, through `setSendTo`, which is the one door the controller
   *   reads. Writing the position into the entity world would be overwritten by
   *   `movePlayer` on the next frame, which is the trap the teleport effect
   *   further down documents at length.
   * - **the camera**, which needs nothing here: `cameraFor` in ../scene resolves
   *   the shot from the same `side`, so it follows on the same render.
   * - **the team property**, and this is the one that would have been missed.
   *   `spawnPlayer` seeds `team:<side>` into the body's props and nothing else
   *   ever writes them, so a player re-seated from blue to red would keep
   *   answering `team:blue` - and `Trigger.by` reads exactly that. They would
   *   have been sitting in red's chair, looking at red's board, moving blue's
   *   pieces.
   *
   * ---------------------------------------------------------------------------
   * The property is rewritten in the frame loop, not here
   * ---------------------------------------------------------------------------
   * This effect wrote it directly at first, and the React Compiler refused the
   * whole file for it - **six errors, and all of them this one line.** Reading
   * `world.current` inside an effect makes the entity world "a value used in an
   * effect", and from that moment every `world.current = build()` and every
   * `live.tick += 1` elsewhere is a modification of one. The compiler was right
   * and it was right about the convention this file already states at the top:
   * everything that changes per frame is a ref that the *frame loop* owns, and
   * React is not told.
   *
   * So the effect says only what it wants, in a ref, and the frame loop is the
   * one writer of the world - which it already was everywhere else.
   *
   * Skipped on the first run, because that arrival already happened: `build`
   * spawns with `facts()`, so re-sending on mount would be the same body written
   * by two people, which is the failure `placeAt` was shaped to avoid.
   */
  const seated = useRef<string | undefined>(side)
  /** A seat the frame loop has not written onto the body yet. Null when settled. */
  const reseat = useRef<string | null>(null)
  useEffect(() => {
    if (seated.current === side) return
    seated.current = side
    // Empty string rather than null for "no side at all", so that null keeps
    // meaning "nothing to do" and a player who *loses* their seat still has the
    // old one cleared off them.
    reseat.current = side ?? ''
    setSendTo((previous) => ({
      x: arrival.x,
      y: arrival.y,
      z: arrival.z,
      facing: arrival.facing,
      at: (previous?.at ?? 0) + 1,
    }))
  }, [side, arrival])

  /**
   * Which phase of its own round the level is in, when it describes one.
   *
   * ---------------------------------------------------------------------------
   * A ref the frame loop owns, and one piece of state beside it
   * ---------------------------------------------------------------------------
   * The ref is what gates presses, and presses are drained in the frame loop, so
   * the ref is the authority. The state exists for one reason: `allow` also
   * decides which buttons a phone and a headset *draw*, and that is a render.
   * They change together and rarely - a handful of times a turn - so the second
   * one costs a re-render nobody will ever see.
   *
   * Null for every document that describes no run, which is every document
   * written before `flow` and every level that is a place rather than a match.
   */
  const phase = useRef<string | null>(flow?.start ?? null)
  const [phaseName, setPhaseName] = useState<string | null>(flow?.start ?? null)

  /**
   * Whole seconds left on a phase that leaves on a clock, or null.
   *
   * A kick off is three seconds of not being allowed to kick, and until this
   * existed the only sign of it was the button being missing - so the wait read
   * as the game being broken rather than as a countdown. Asked for as "display
   * on front the kickoff from 3 down, after a goal and start".
   *
   * Only for a phase whose way on is `after`, because that is the only kind
   * with an answer: a phase waiting on a goal has no number to show, and a
   * spinner there would be a promise the level cannot keep.
   *
   * State rather than a ref because the HUD draws it, and set from the frame
   * loop only when the whole number changes - so a three-second wait is three
   * renders rather than a hundred and eighty.
   */
  const [phaseLeft, setPhaseLeft] = useState<number | null>(null)

  /**
   * The phase, reported upward once React has settled on it.
   *
   * An effect rather than a call inside `enter`, which is where this was and
   * which cost a run: `enter` runs inside the frame callback, so calling the
   * *parent's* setter from it re-renders the scene mid-frame, and React counted
   * that as an update loop and refused - "maximum update depth exceeded", on a
   * page that had been fine a minute earlier. The state below it is already the
   * settled value; this is the ordinary way to pass one on.
   */
  useEffect(() => {
    onPhase?.(phaseName)
  }, [phaseName, onPhase])

  useEffect(() => {
    onCountdown?.(phaseLeft)
  }, [phaseLeft, onCountdown])

  /**
   * Whether this run has been won, which is a fact the document decided.
   *
   * A ref *and* a state, exactly like the phase beside it and for the same two
   * reasons: the frame loop is what notices, and a HUD is what draws it. The ref
   * is also the latch - `wins` keeps holding after it has held, and a run that
   * re-ended every frame would fire `finished` on every entity sixty times a
   * second.
   */
  const winner = useRef(false)
  const [wonRun, setWonRun] = useState(false)

  useEffect(() => {
    onWon?.(wonRun)
  }, [wonRun, onWon])

  /**
   * Which round is being played, counting from one.
   *
   * A ref and a state for the phase's two reasons: the frame loop is what
   * moves it and the HUD is what draws it. One for every flow, whether or not
   * it declares `rounds` - a run with no rounds is a run in its first and only
   * one, and giving it a number costs nothing and saves the HUD a branch.
   *
   * `flowRound` and not `round`, because `round` in this file is already the
   * count of *rematches* - how many times somebody has pressed R. Two things
   * called a round is how one of them silently becomes the other.
   */
  const flowRoundNow = useRef(1)
  const [flowRound, setFlowRound] = useState(1)

  /**
   * Which of the level's fields the arbiter keeps, and what we last told it.
   *
   * Two refs rather than state because only the frame loop and the poll read
   * them: `runFields` is the document's answer, rebuilt when the document
   * changes, and `sentFields` is the latch that makes "somebody else moved
   * this" distinguishable from "we moved it and have not said so yet" - the
   * same pair the store's `written` map is half of.
   */
  const runFields = useRef<Set<string>>(new Set())
  const sentFields = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    runFields.current = new Set(arbitratedFields(dataOf(xp)))
    // Not cleared: a document swapped mid-session keeps whatever the arbiter
    // has already published for a field of the same name, which is the same
    // bargain `load` makes with everything else it does not reset.
  }, [xp])

  useEffect(() => {
    onRound?.(flowRound)
  }, [flowRound, onRound])

  /** Whether the opening phase's `does` has run. See the note in the frame loop. */
  const opened = useRef(false)
  /** Seconds in the current phase, which only an `after` step ever reads. */
  const phaseAge = useRef(0)
  const shownLeft = useRef<number | null>(null)

  /** Who was standing in what last frame, so `enter` means "just walked in". */
  const overlaps = useRef<Overlaps>(new Map())
  /**
   * Which entities have already said `spawned`.
   *
   * Beside `overlaps` because it is the same kind of thing: a memory of last
   * frame that turns a *state* the world can report into an *event* a rule can
   * hear. See `stepSpawned`.
   */
  const announced = useRef<Set<number>>(new Set())
  /** This frame's enter and exit crossings, reused rather than reallocated. */
  /*
   * Derived from `Crossed` rather than restated, so a sixth crossing event does
   * not need finding here. It needed finding once already: `collide` widened the
   * callback and this line was the only thing that had to change, which is one
   * more than it should have been.
   */
  const crossings = useRef<
    // `by` is nullable because `dropped` has no carrier - see `Crossed`. The
    // sandbox has always taken a nullable subject, so nothing downstream moved.
    { id: number; event: Parameters<Crossed>[1]; by: number | null }[]
  >([])
  /** How many failures and log lines a script has already had reported. */
  const shown = useRef(0)
  const heard = useRef(0)
  /** A number per message, because two identical ones are still two messages. */
  const ticker = useTicker()

  /**
   * Shooting.
   *
   * The button is read here rather than in the controller for the same reason
   * the trigger pass is: this is the component that owns the world, and a shot
   * is a thing that happens *to* the world. The controller's job is where a body
   * is.
   *
   * A flag rather than the shot itself, and the frame's worth of delay is the
   * point: the cast has to see the entities as this frame's step left them, and
   * a listener firing between frames would be reading the world mid-edit.
   */
  const camera = useThree((state) => state.camera)
  const pulled = useRef(false)
  /**
   * How many trigger pulls this loop has already seen from a thumb.
   *
   * The touch half of the `mousedown` listener below, and it has to be a
   * comparison rather than a listener for the reason every other thumb control
   * here is one: the controls own their buffer and this loop was handed a
   * reference, so draining it would make the reader a second authority on
   * somebody else's object.
   */
  const sawFire = useRef(0)
  /** The same, for the dance button. See where it is read. */
  const sawDance = useRef(0)
  const aim = useRef(new THREE.Vector3())
  /**
   * The shots in the air, for the renderer.
   *
   * A ref holding a plain array, mutated by the loop below and by the tracer
   * component - which is the same arrangement `blockers` has and for the same
   * reason: it changes on a frame path, and putting it in state would re-render
   * a tree of instanced meshes every time somebody pulled the trigger.
   */
  const shots = useRef<Shot[]>([])

  /** What the body is doing instead of walking. See ./body/stance. */
  const {
    hurt: hurtRef,
    recoil: recoilRef,
    swing: swingRef,
    dancing: dancingRef,
  } = useStance()
  const down = useRef(false)
  /**
   * The last aim reported, so an unchanged one is not reported again.
   *
   * Compared by the two things a highlight is drawn from - which entity, and
   * which mark - rather than by identity: `aimOf` builds a fresh object every
   * frame, so an identity check would be a re-render per frame forever.
   */
  const aimed = useRef<Aim | null>(null)
  /**
   * Which roll this client has already applied, by the arbiter's own counter.
   *
   * A face on its own cannot say whether it is new: two fours in a row are two
   * rolls, and the poll runs every second regardless. See where it is read.
   */
  const sawRoll = useRef<number | null>(null)
  /** And which move, by the same counter and for the same reason. */
  const sawMove = useRef<number | null>(null)
  /** The last tally reported, by field, so an unchanged one is not reported again. */
  const tallied = useRef<Map<string, number>>(new Map())

  /**
   * What the arbiter last said our own health is, waiting for a frame.
   *
   * A ref rather than state, and read once a frame rather than applied in the
   * poll, because taking health off is not a number - it is `damage()`, which
   * fires the `damaged` rules and hands back effects only a frame loop can
   * carry out. See where it is written, and where the loop reads it.
   */
  const servedHp = useRef<number | null>(null)
  /**
   * A hit this client landed, on its way to the person it landed on.
   *
   * Bumped when the *verdict* comes back rather than when the claim goes out,
   * so nothing is said about a shot the arbiter refused. `Together` sends it and
   * the victim's copy of this component asks the arbiter what happened - see
   * `hit` there for why the packet carries no number.
   */
  const [struck, setStruck] = useState<{ who: string; at: number } | null>(null)
  /**
   * Ask the arbiter again, now, rather than at the next tick of the second.
   *
   * Assigned by the poll effect below, which is where `read` is - a function
   * that closes over `arbiter` and the whole readback. A ref because the socket
   * handler that calls it is not a render and must not be a dependency of the
   * effect that joins the room.
   */
  const readNow = useRef<(() => void) | null>(null)
  /**
   * And the floor under how often that may happen.
   *
   * The bus is the room: anybody in it can send a hint, and a peer sending one
   * per frame would be a request per frame. One extra read every quarter second
   * is faster than the poll by four times over and is a rate a level cannot
   * notice - four hits inside 250ms is one verdict as far as a body is
   * concerned, because the second read returns the outcome of both.
   */
  const readAt = useRef(0)

  /** Whether a revive is in flight, so a health from before it is not news. */
  const standingUp = useRef(false)

  /**
   * The fields worth putting on a screen, in the order the document declared.
   *
   * A label is the author marking one for reading. `turn` on the board game is
   * a real field holding an index into a seat order, and it is the arbiter's
   * business rather than something to print next to a die roll.
   */
  const labelled = useMemo(
    () => Object.entries(xp.data ?? {}).filter(([, field]) => (field.label ?? '').length > 0),
    [xp.data],
  )
  const wasHp = useRef<number | null>(null)

  useEffect(() => {
    const down = (event: MouseEvent) => {
      if (event.button !== 0) return
      /**
       * Only while the pointer is locked.
       *
       * The click that *takes* the lock is a click on a page, not a shot -
       * without this, opening a level and clicking to look around fires the
       * first round into whatever happened to be under a cursor nobody was
       * aiming with.
       */
      if (!window.document.pointerLockElement) return
      pulled.current = true
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [])

  /**
   * Say we are here, so the arbiter knows what a body is worth.
   *
   * The numbers come from the document - starting health and what the weapon
   * takes off - because the database has never read it and should not. Every
   * client in the room has the same document and sends the same pair, so the
   * first join pins them and a client that disagrees is refused rather than
   * believed. See 20261008000000_xp_arbiter_hits.sql.
   *
   * `lethal` travels the same way and for a stronger reason: it decides whose
   * shots count at all, and no client can be trusted to keep that rule about
   * itself. See `rules.lethal`.
   *
   * Once per room, and a failure is left in the open: an unjoined client's
   * shots are all refused, and silence there would look like the gun is broken.
   */
  useEffect(() => {
    if (!arbiter) return
    const live = world.current
    const hp = live?.props.get(PLAYER_ID)?.hp
    /**
     * What one hit costs, from the gun if the level issues one and from the
     * *body* if it does not.
     *
     * The arbiter keeps one number per room - it prices a hit rather than a
     * weapon, deliberately, because a client naming its own damage per shot is
     * a client that names a large one. Which left a level with no `player.weapon`
     * sending nothing and getting the database's default of ten, whatever its
     * document said: a punch that took ten off while the level was written
     * around twenty-five, and nothing anywhere saying so.
     *
     * `props.damage` on the player is where a swing's cost lives - the same
     * place `ammo` lives, and for the same reason: it is a fact about the body.
     * See the `swing` verb.
     */
    const damage = live?.props.get(WEAPON_ID)?.damage ?? live?.props.get(PLAYER_ID)?.damage
    const lethal = rulesOf(xp).lethal
    let joined = true
    void arbiter
      .ask('join', { hp, damage, ...(lethal ? { lethal } : {}) })
      .then((verdict) => {
        if (!joined || verdict.ok) return
        setKills((was) => ({ ...was, refused: `${verdict.why}: ${verdict.message}` }))
      })
      .catch((reason: unknown) => {
        if (joined) setKills((was) => ({ ...was, refused: `lost: ${String(reason)}` }))
      })
    return () => {
      joined = false
    }
    // `xp` for the lethal role, which is a value the join pins. Re-joining is
    // idempotent - the arbiter adds nobody who is already in the health map -
    // so a document that changed identity without changing costs nothing.
  }, [arbiter, xp])

  /**
   * What the arbiter says our own health is.
   *
   * Without this a kill is bookkeeping: the server takes the health off, the
   * scoreboard moves, and the person who was shot keeps walking around. The
   * body has to fall on *their* screen, and they are the one client that cannot
   * be told by the shooter.
   *
   * Polled rather than pushed, because a push would have to arrive over the
   * socket - which is a broadcast bus anybody in the room can shout into, so a
   * pushed "you are dead" is a message another client could send. Asking is one
   * request a second and the answer comes from the only thing entitled to give
   * it. A hint on the socket that triggers *this* is the obvious cheaper
   * version and is not built.
   *
   * **Only downwards.** Standing back up is the local revive's job, and it says
   * so to the arbiter itself; a poll that also healed would fight the respawn
   * countdown every second it was running.
   */
  useEffect(() => {
    if (!arbiter) return
    let watching = true
    const read = () => {
      void arbiter
        .view<{
          health?: Record<string, number>
          scores?: Record<string, number>
          lives?: Record<string, number>
          settings?: { hp?: number } | null
          /** The level's own `run` fields, kept for this game and no longer. */
          fields?: Record<string, number>
          vote?: OpenVote | null
          turn?: { at?: string } | null
          roll?: { key?: string; face?: number; at?: number; by?: string } | null
          move?: { id?: number; mark?: string; at?: number; by?: string } | null
          /** Chair name to whoever is in it, public to everybody - see the view. */
          seats?: Record<string, string> | null
          secret?: string | null
          /**
           * Who is drawn how, and never who was dealt what.
           *
           * `views` rather than `seen` only because the value this whole block
           * is destructured from is already called that; the document's word for
           * it is `seen` and the payload that sets it keeps the document's word.
           */
          views?: Record<string, RoleView>
          me?: string
        }>()
        .then((seen) => {
          if (!watching || !seen?.me) return
          setMine(seen.me)
          // Replaced wholesale rather than merged: the arbiter's map is the
          // whole truth about scores, and merging would keep a number belonging
          // to a match that has been restarted underneath us.
          setScores(seen.scores ?? {})
          setLives(seen.lives ?? {})
          // Everybody's, not just ours - see `health` above. Wholesale for the
          // same reason the scores are: a row left behind after a rematch is a
          // bar showing a body's health from the round before it.
          setHealth(seen.health ?? {})
          setWhole(seen.settings?.hp)
          setVote(seen.vote ?? null)
          /**
           * The level's own run counters, mirrored into the map the rules read.
           *
           * The half of the `run` scope that was missing: it never persisted,
           * which was the point, and it never travelled, which was not - so a
           * table counting pieces home in one had a number only the client
           * that moved the piece could see. Now the arbiter keeps it for the
           * length of the game and this is where everybody else hears about
           * it.
           *
           * **A local change wins over what is published**, exactly as it does
           * for a `space` field read back from the store: a value that has
           * moved since we last told the arbiter is this client's own change
           * on its way out, and adopting the older number over it would undo
           * somebody's move a second after they made it.
           */
          if (data?.current) {
            for (const [name, value] of Object.entries(seen.fields ?? {})) {
              if (!runFields.current.has(name)) continue
              if (data.current.get(name) !== sentFields.current.get(name)) continue
              if (!Number.isFinite(value)) continue
              data.current.set(name, value)
              sentFields.current.set(name, value)
            }
          }
          // Absent means nobody is taking turns, which is every level that has
          // never passed - so null rather than kept, the way the vote is.
          setTurn(seen.turn?.at ?? null)
          setSecret(seen.secret ?? null)
          // Wholesale, like the scores and the health above: a look left behind
          // after a rematch is somebody invisible for a round they were dealt
          // nothing in.
          setLooks(seen.views ?? {})

          /**
           * The roll, onto every screen and not only the roller's.
           *
           * The arbiter has always decided it and always handed it straight back
           * to whoever pressed; the level wrote that into its own `data` and
           * there it stopped. A level's `data` is not a channel - it is written
           * on a timer and read at open, and on the builtin route there is no
           * store behind it at all - so at a four-seat table only one player
           * could see the die. Three real browsers found that; nothing with one
           * process could.
           *
           * **`at` is a counter, not a value**, and it is what makes this safe
           * to apply every second: writing the face unconditionally would undo
           * the `setProp dice 0` a move makes, every poll, forever - the piece
           * would move and the die would light straight back up. Only a roll
           * this client has not seen yet is news.
           */
          /**
           * A move somebody else made, put on this board.
           *
           * The whole of "the table agrees and the board does not". Applied by
           * *counter* rather than by value, for the reason the roll is: the poll
           * runs every second, and re-applying the same move would fight any
           * rule that has since acted on that piece.
           *
           * Both halves are written - the square it is on and the square it
           * remembers - because a piece given only a position is a piece in the
           * right place with the wrong idea of where it is, and its next roll
           * would move it from the wrong square. The mover's own client skips
           * this: it applied the move when it made it, and `sawMove` was set
           * then, so the counter it reads back is one it has already seen.
           */
          /**
           * Who is sitting where, and which chair is this client's.
           *
           * Read every poll rather than only on the reply to a `sit`, and that
           * is the half that makes a reload work: a player who refreshes has a
           * seat the table remembers and a client that has forgotten it, and
           * without this they would come back to an empty chair they cannot
           * re-take, because somebody is already in it - themselves.
           *
           * Set through the setters unconditionally is wrong and cheap to get
           * wrong, so both are guarded on having actually changed: this runs
           * once a second forever, and a `setState` with an equal-but-new object
           * re-renders the whole scene every second.
           */
          const chairs = seen.seats ?? {}
          const mySeat = Object.keys(chairs).find((name) => chairs[name] === seen.me)
          setSeat((was) => (was === mySeat ? was : mySeat))
          setSeats((was) => {
            const names = Object.keys(chairs)
            const same =
              names.length === Object.keys(was).length &&
              names.every((name) => was[name] === chairs[name])
            return same ? was : chairs
          })

          const moved = seen.move
          // Same as the roll above: the mover applied it when they made it, so
          // re-applying it here would fight whatever has happened to that piece
          // since - somebody picking it straight back up, most of all.
          if (moved?.mark && moved.by === seen.me) sawMove.current = moved.at ?? null
          else if (
            moved?.mark &&
            typeof moved.id === 'number' &&
            isNews(moved.at ?? null, sawMove)
          ) {
            const live = world.current
            const mark = live ? markByName(xp.world.marks, moved.mark) : null
            if (live && mark && live.alive.has(moved.id)) {
              /**
               * Out of whosever hand it was in, and onto the field.
               *
               * `parent` as well as the position, because the piece may still
               * be parented here from a `held` this client saw earlier - and a
               * piece placed on a square while it is also a child of somebody's
               * hand is drawn at the hand, so the move would look like it never
               * happened.
               */
              live.parent.delete(moved.id)
              live.heldBy.delete(moved.id)
              live.position.set(moved.id, { x: mark.x, y: mark.y, z: mark.z })
              live.rotation.set(moved.id, mark.facing)
              // The box is cached per entity, so a piece moved without clearing
              // it collides where it used to be - which is how a piece counts
              // itself home from a square it has left.
              live.box.delete(moved.id)
            }
          }

          const rolled = seen.roll
          /**
           * **Not your own**, which is the guard the counter alone could not give.
           *
           * The roller applies its own face from the arbiter's direct reply, and
           * that reply carries no counter - so `at` was always news to them, and
           * the very next poll wrote the number back on top of the `setProp dice
           * 0` that spending it had just done. The die came back one second after
           * every move, forever, and a table could take four turns without the
           * readout ever changing. Three browsers watching a four sit there is
           * what found it.
           *
           * `by` is the arbiter's own answer to who rolled and `me` is its
           * answer to who is asking, so the two cannot disagree about identity
           * the way an account id and a presence id could.
           */
          if (rolled?.key && rolled.by === seen.me) sawRoll.current = rolled.at ?? null
          else if (rolled?.key && typeof rolled.face === 'number' && isNews(rolled.at ?? null, sawRoll)) {
            data?.current.set(rolled.key, rolled.face)
            /**
             * And said out loud, in the colour of whoever threw it.
             *
             * A number in the corner is a number the thrower reads and nobody
             * else notices. At a table a roll is an *announcement*, and the one
             * thing everybody at this one can see about each other is which
             * colour they are playing - so the chair is what the banner names,
             * resolved here where the map is rather than in a HUD that would
             * need it passed down for one line.
             */
            const who = Object.keys(chairs).find((name) => chairs[name] === rolled.by) ?? null
            setSaid({ seat: who, face: rolled.face, at: rolled.at ?? 0 })
          }
          /**
           * Left for the frame loop rather than written here.
           *
           * This used to be `own.hp = served`, and the number was the only thing
           * that arrived: the health went down and **no rule ran**. Which is
           * the whole of "hit them and they drop the flag" - `damaged` is the
           * event for damage from outside the rules (docs/xp/manual.md §4), and
           * a hit from another player is the outside-est damage there is, and it
           * was the one source that never reached it. Every level built on
           * being hit worked alone and did nothing in a room.
           *
           * The write cannot happen here because `damage()` returns effects - a
           * stun, a drop, a sound - and this is a promise callback with no
           * frame around it to carry them out. So the number is put down and
           * the loop picks it up, which is also what keeps the readback in the
           * same order as everything else that happens to a body.
           */
          const served = seen.health?.[seen.me]
          if (served !== undefined && !standingUp.current) servedHp.current = served
        })
        .catch(() => {
          // Deliberately quiet. A poll that failed is one second of a stale
          // number, and a warning per second in the corner would bury the
          // refusals that actually mean something.
        })
    }
    /**
     * And the other direction: what this client changed, told once.
     *
     * On the poll's own beat rather than per write, for the reason the store's
     * flush coalesces: a rule may add to a field every frame, and a round trip
     * per frame is sixty a second for a number whose last value is the only one
     * that lands either way. `field` is last-write-wins, so coalescing costs
     * nothing but how much is lost if the tab dies mid-second.
     *
     * The latch is set *before* the ask rather than after, which is the
     * opposite of the store's and deliberate: the poll adopts anything whose
     * live value matches what we last sent, so latching late would leave a
     * one-second window in which our own change looks adoptable and the
     * arbiter's older number overwrites it. A refused ask puts it back.
     */
    const tell = () => {
      const map = data?.current
      if (!map) return
      for (const name of runFields.current) {
        const value = map.get(name)
        if (value === undefined || sentFields.current.get(name) === value) continue
        const before = sentFields.current.get(name)
        sentFields.current.set(name, value)
        void arbiter
          .ask('field', { key: name, value })
          .then((verdict) => {
            if (verdict.ok) return
            // Not ours to keep: put the latch back so the next poll may adopt
            // whatever the arbiter does think this field is.
            if (before === undefined) sentFields.current.delete(name)
            else sentFields.current.set(name, before)
          })
          .catch(() => {
            if (before === undefined) sentFields.current.delete(name)
            else sentFields.current.set(name, before)
          })
      }
    }

    read()
    /**
     * And the same read, on demand, for a peer's hint that something happened.
     *
     * Published here because this is where `read` exists at all. The hint
     * carries no outcome - see `hit` in ./net/together - so this is the whole
     * of what it can cause: one more of the request that was already going to
     * be made, made sooner.
     */
    readNow.current = read
    const every = setInterval(() => {
      read()
      tell()
    }, 1000)
    return () => {
      watching = false
      readNow.current = null
      clearInterval(every)
      // Everything outstanding, on the way out - the same reason the store
      // flushes at teardown rather than trusting the last tick to have run.
      tell()
    }
  }, [arbiter, data])

  /**
   * Back on our feet, as far as the arbiter is concerned.
   *
   * The local revive is what stands the body up - it is this client's own body
   * and nobody else decides where it goes - but the health the *others* shoot at
   * is the arbiter's, and leaving that at zero means every shot at us comes back
   * `already down` forever.
   *
   * Only ever ourselves: the rule takes no id, so there is no arrangement of
   * arguments by which one client stands another one up.
   */
  const standUp = () => {
    if (!arbiter) return
    /**
     * And no readback counts until it has landed.
     *
     * The window is real and it is a whole second wide: the body stands up here
     * and the arbiter learns about it a round trip later, so a poll answered in
     * between says zero about somebody who is already walking. The old code
     * wrote that number straight onto `hp` and killed them again; now that the
     * readback fires `damaged` rules, it would also take the flag out of the
     * hands of somebody who has just respawned holding nothing.
     *
     * Dropped rather than reconciled, because there is nothing to reconcile: a
     * health from before the revive is not news about this body, and the next
     * poll is a second away and correct.
     */
    standingUp.current = true
    void arbiter
      .ask('revive')
      .catch(() => {
        // Quiet for the same reason the poll is: the next poll re-reads the truth,
        // and a failed revive shows up as a body that others cannot hit, which the
        // player will report far more usefully than a toast would.
      })
      .finally(() => {
        standingUp.current = false
      })
  }

  /**
   * Cast one, and take the answer as the truth about it.
   *
   * The optimistic version - draw our own vote immediately and reconcile later -
   * is the wrong trade here and it is the same argument as the pending kill,
   * one step further: a vote is a *social* fact, and a panel that showed a vote
   * the server refused would have somebody arguing in chat about a vote that
   * never existed. So the count moves when the arbiter says it moved.
   */
  const cast = (target: string) => {
    if (!arbiter) return
    void arbiter
      .ask<{ vote?: OpenVote | null }>('vote', { target })
      .then((verdict) => {
        if (verdict.ok) setVote(verdict.outcome?.vote ?? null)
        else setKills((was) => ({ ...was, refused: `${verdict.why}: ${verdict.message}` }))
      })
      .catch((reason: unknown) => {
        setKills((was) => ({ ...was, refused: `lost: ${String(reason)}` }))
      })
  }

  /**
   * Tell the arbiter a shot landed on somebody, and wait to be told what it was.
   *
   * Fire and *not* forget - the promise is where the whole design lives. The
   * claim is counted as pending immediately so the screen says something is in
   * the air, and the count only moves when the answer arrives. A `refused` or a
   * `lost` is put where the player can see it during play, because the one
   * before this was set into a panel that closes at kickoff.
   */
  const claim = (victim: string) => {
    if (!arbiter) return
    setKills((was) => ({ ...was, pending: was.pending + 1, refused: null }))
    void arbiter
      .ask<{
        fatal?: boolean
        scores?: Record<string, number>
        health?: Record<string, number>
      }>('hit', { victim })
      .then((verdict) => {
        // The verdict carries the whole board, so a kill updates the scoreboard
        // on the frame it is confirmed rather than on the next poll.
        if (verdict.ok && verdict.outcome?.scores) setScores(verdict.outcome.scores)
        /**
         * And the whole health map, which is what makes the bar worth having.
         *
         * The poll is once a second, and a second is four shots. Taking the map
         * off the verdict means the bar over the person you are shooting moves
         * on the round trip that decided the shot - immediate, and still not a
         * local guess: this is the arbiter's own answer arriving as early as it
         * possibly can. A subtraction done here instead would be the exact
         * mistake the pending count exists to avoid.
         */
        if (verdict.ok && verdict.outcome?.health) setHealth(verdict.outcome.health)
        /**
         * And the person it happened to is told to go and look.
         *
         * The one client the arbiter cannot reach. Their health arrives on a
         * poll once a second, so until this a punch took up to a second to
         * *happen* to them - and every rule hanging off it with it. "Hit the
         * carrier and the flag drops" is a `damaged` rule on the far side of
         * that second, which is why capture the flag was the level that
         * reported it: you hit somebody and they walked off with the flag.
         *
         * On the verdict rather than on the claim, so a refused hit says
         * nothing, and after the health above rather than before it because
         * this is the same fact travelling to somebody else. `Together` puts it
         * on the wire; what it carries is a nudge and never a number, for the
         * reason the poll's own note gives.
         */
        if (verdict.ok) setStruck((was) => ({ who: victim, at: (was?.at ?? 0) + 1 }))
        /**
         * A confirmed kill is a point, through the same counter a coin goes
         * through.
         *
         * Which is what makes the mode end on it: `scoreLimit` is compared
         * against this total in ./match, so first-to-ten counts kills without
         * that module learning what a kill is. It is added *here*, when the
         * verdict lands, rather than at the shot - the whole reason this is a
         * round trip is that the shot is not the outcome.
         */
        if (verdict.ok && verdict.outcome?.fatal) tally.current += 1
        setKills((was) => ({
          mine: was.mine + (verdict.ok && verdict.outcome?.fatal ? 1 : 0),
          pending: Math.max(0, was.pending - 1),
          // A refusal that says nothing is a refusal the player invents a reason
          // for. `stale` is the ordinary one - two people shooting the same body
          // - so it is worth saying which happened rather than only that it did.
          refused: verdict.ok ? null : `${verdict.why}: ${verdict.message}`,
        }))
      })
      .catch((reason: unknown) => {
        setKills((was) => ({
          ...was,
          pending: Math.max(0, was.pending - 1),
          refused: `lost: ${String(reason)}`,
        }))
      })
  }

  /** How far a shot reaches and how much it takes off, read off the weapon. */
  const shoot = (live: EntityWorld): Effect[] => {
    /**
     * A spectator does not shoot.
     *
     * Stopped here rather than left to the arbiter, even though the arbiter
     * would refuse it: every click would otherwise put a refusal in the corner
     * of somebody's screen, and a message that appears when you do the only
     * thing left to do is noise rather than information.
     */
    if (isOut.current) return []

    /**
     * Whatever this body is actually armed with - worn, or picked up off the
     * floor.
     *
     * `WEAPON_ID` used to be the whole answer, which made a gun lying in a
     * level a prop: you could carry it, it hung off your hand, and clicking did
     * nothing. `armedWith` is the manual's own sentence - what makes a
     * blueprint a weapon is its properties - asked of a hand rather than of the
     * socket the host filled at load. See @kxb/xp/engine.
     *
     * No gun, no shot. A document that gives nobody a weapon is a document
     * where clicking does nothing, which is what a level about walking around -
     * or one about punching - wants.
     */
    const gun = armedWith(live, PLAYER_ID)
    const held = gun === null ? undefined : live.props.get(gun)
    if (gun === null || !held) return []

    /**
     * Ammunition, if the level counts it.
     *
     * On the *player* rather than on the gun, because an ammo box hands it to
     * whoever walked in - `target: "other"` is the player, and a box that
     * refilled the thing in their hand would need a verb that can reach through
     * one entity to another. A body with no `ammo` property has none to run out
     * of, which makes counting something a document opts into by declaring it.
     */
    const own = live.props.get(PLAYER_ID)
    if (own && own.ammo !== undefined) {
      if (own.ammo <= 0) return [{ kind: 'emit', event: 'out of ammo', from: PLAYER_ID }]
      own.ammo -= 1
    }

    /**
     * From the eye, along the camera.
     *
     * Not from the camera itself, and third person is why: the camera sits four
     * metres behind the body, so a shot leaving it would start on the far side
     * of whatever you have your back to - you would shoot the wall behind you
     * while looking at an empty room. The direction is still the camera's,
     * because that is where the crosshair is pointing.
     */
    camera.getWorldDirection(aim.current)
    const from = playerAt.current
    const hit = castRay(
      from,
      { x: aim.current.x, y: aim.current.y, z: aim.current.z },
      {
        isSolid: solids.isSolid,
        targets: targetsOf(live),
        range: held.range ?? DEFAULT_RANGE,
        ...(xp.world.ground ? { ground: xp.world.floorY } : {}),
        // Yourself and what you are holding. Without it every shot lands on the
        // inside of your own gun and the game is that you cannot shoot.
        ignore: UNSHOOTABLE,
        /**
         * The other players, compared against the level by distance like
         * everything else - so a body behind a wall is still behind a wall.
         *
         * `performance.now()` because that is the clock ./together stamps
         * arrivals with, and a buffer asked in one clock and filled in another
         * answers about a moment that never happened.
         */
        ...(bodies.current ? { people: bodies.current.targets(performance.now()) } : {}),
      },
    )
    /**
     * The streak, from the muzzle rather than from the eye.
     *
     * Two different origins on purpose. The *shot* leaves the eye, because that
     * is where the crosshair is and anything else means the crosshair lies. The
     * *picture* leaves the gun, because that is what somebody is looking at -
     * and they are about half a metre apart, which is invisible at the far end
     * and obvious at the near one.
     */
    const muzzle = live.parent.has(gun)
      ? worldTransform(live, gun, blueprints)
      : { x: from.x, y: from.y, z: from.z }
    const landed = hit ?? {
      point: {
        x: from.x + aim.current.x * (held.range ?? DEFAULT_RANGE),
        y: from.y + aim.current.y * (held.range ?? DEFAULT_RANGE),
        z: from.z + aim.current.z * (held.range ?? DEFAULT_RANGE),
      },
    }
    // A miss draws a streak too, and it is the more important of the two: a shot
    // into an empty room with no picture is indistinguishable from a gun that
    // is not working.
    shots.current.push({
      from: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
      to: { ...landed.point },
      distance: Math.hypot(
        landed.point.x - muzzle.x,
        landed.point.y - muzzle.y,
        landed.point.z - muzzle.z,
      ),
      age: 0,
    })

    /**
     * Somebody else, which this client may not decide the outcome of.
     *
     * Nothing local happens: their health is not ours to change, and taking it
     * off here would be two clients keeping two answers. The claim goes to the
     * arbiter and the *verdict* is what counts. See docs/xp/server-authority.md.
     */
    if (hit?.who) {
      claim(hit.who)
      return []
    }

    if (hit?.id === null || hit === null) return []

    // `damage` and not the verb: it changes the health *and then* fires the
    // `damaged` triggers, which is the order that makes a rule asking `hp <= 0`
    // about the shot that just landed rather than about the one before.
    return damage(live, blueprints, hit.id, held.damage ?? 10, PLAYER_ID, clockNow())
  }

  /** What the last vitals said, so React is told only when a number changes. */
  const vitals = useRef('')

  /**
   * A rematch: the level as the document describes it, again.
   *
   * Everything a round wrote is in the entity maps, so the reset is to throw
   * them away and ask the document a second time - there is no list of things to
   * undo and therefore no way to miss one. The bookkeeping beside them has to go
   * back too, and it is listed out rather than swept because each line is a
   * different kind of stale:
   *
   * - `overlaps` remembers who was standing in what, so a pickup you were
   *   holding at full time would not fire its `enter` again when the fresh copy
   *   spawns underneath you.
   * - `wereAt` is where every box was last frame; kept, it would report the
   *   whole level as having moved in one step and hand the player a shove.
   * - `tally` and `finishes` are read as *differences* by the mode systems, so a
   *   number left behind would arrive as a burst of points on the first frame of
   *   the new round.
   *
   * Skipped on the first render, because that is not a rematch - `build` has
   * already run inline above, and doing it twice would spawn the level, throw it
   * away and spawn it again before anybody saw either.
   */
  const started = useRef(round)
  useEffect(() => {
    if (started.current === round) return
    started.current = round

    world.current = build()
    overlaps.current = new Map()
    wereAt.current = new Map()
    blockers.current.length = 0
    shots.current.length = 0
    tally.current = 0
    finishes.current = 0
    elapsed.current = 0
    // Along with the world they describe: ids are reused, so a leftover row is
    // a crate in the new round flinching for a hit landed in the last one.
    seenHp.current.clear()
    shaking.current.clear()
    smoothing.current.clear()

    /**
     * And put the player back, through the seam that already exists.
     *
     * `reviveAt` is the counter the controller watches, and it is the only thing
     * that can move somebody: the position lives in a ref `useFrame` overwrites
     * every frame, so anything written from here would be gone before the next
     * paint. Reusing death's own door rather than opening a second one - see the
     * note on `reviveAt` in ./player.
     */
    revives.current += 1
    setReviveAt(revives.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  /**
   * Put back at the arrival, on request.
   *
   * The whole of the escape hatch, and it is deliberately the *arrival* rather
   * than a checkpoint: somebody pressing this is somebody who cannot move, and
   * the one place in a level guaranteed to be somewhere you can stand is the
   * spot the level chose for you - which `canStandIn` now checks for walls as
   * well as for floor.
   *
   * `revivePlayer` as well as the move, because being stuck and being hurt tend
   * to arrive together: falling into a gap in the geometry takes health off on
   * the way. It costs nothing for somebody at full health.
   *
   * Skipped on the first render like the rematch above - a counter at zero is
   * nobody having pressed anything yet, not a request to move.
   */
  /**
   * Somebody pressed unstick, waiting for a frame to tell the level about it.
   *
   * The button moves the *player* back to the start, and that is all it could
   * ever do on its own - it knows nothing about what a level has in it. But
   * being stuck is rarely only about you: a ball wedged where nobody can reach
   * it strands everybody, and asking them to find a rule for that is asking
   * them to guess.
   *
   * So the press becomes an `unstuck` event and the document decides what else
   * it means. Noticed in the frame loop by watching `revives`, the counter the
   * button already bumps, rather than by setting a second flag from inside the
   * effect: writing into the entity world from an effect is the second writer
   * this file keeps refusing, and one counter cannot disagree with itself.
   */
  const toldUnstick = useRef(0)
  const toldBallBack = useRef(0)

  /**
   * The whistle, once per match.
   *
   * Skipped on the first render for `unstickAt`'s reason: a value that was
   * already set when this mounted is a match somebody *joined* mid-way, and
   * teleporting them to a spawn on arrival is not a kick off, it is a level
   * that moves you the moment you look at it.
   */
  const blown = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (blown.current === undefined) {
      blown.current = startedAt ?? null
      return
    }
    if (blown.current === (startedAt ?? null)) return
    blown.current = startedAt ?? null
    if (!startedAt) return

    // Back to your own spawn, through the seam that already exists - the
    // position lives in a ref `useFrame` overwrites, so anything written from
    // here would be gone before the next paint. See `reviveAt` in ./player.
    revives.current += 1
    setReviveAt(revives.current)

    /**
     * And the level's round back to its first phase.
     *
     * Which for a football is the one that fetches the ball to the centre spot
     * and counts three into the kick off - so the ball is placed by the
     * *document*, through the rule it already has, rather than by this file
     * learning what a ball is.
     */
    if (flow) {
      opened.current = false
      phaseAge.current = 0
      /**
       * And back to the first round, not the one the last run ended on.
       *
       * A rematch of a best-of-three is a best-of-three, and a counter left
       * where it stopped would make the second match one round long - the same
       * class of stale-number bug `winsProblems` refuses a persisting `wins`
       * for, arriving through the rematch door instead of the save.
       */
      flowRoundNow.current = 1
      setFlowRound(1)
    }
    say(ticker, onSay, 'kick off')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt])

  const unstuck = useRef(unstickAt ?? 0)
  useEffect(() => {
    const asked = unstickAt ?? 0
    if (unstuck.current === asked) return
    unstuck.current = asked

    const live = world.current
    if (live) revivePlayer(live, xp, arrival, facts())
    stunned.current = null
    frozen.current = false
    dying.current = null
    setDownFor(null)
    revives.current += 1
    setReviveAt(revives.current)
    say(ticker, onSay, 'back to the start')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unstickAt])

  /**
   * Who a spectator is watching.
   *
   * **Derived rather than kept in step.** Only the *choice* is state; who is
   * actually being watched is worked out from it and the current board every
   * render, which is what makes the case that matters free: the person you
   * were watching being eliminated while you watch them drops out of the list,
   * so the expression below falls through to the first of whoever is left. An
   * effect synchronising a stored id would have had to notice that, and would
   * have noticed it one render late.
   */
  const watchIds = useMemo(() => (out ? watchable(standings) : []), [out, standings])
  const [picked, setPicked] = useState<string | null>(null)
  const watching = picked !== null && watchIds.includes(picked) ? picked : (watchIds[0] ?? null)

  /**
   * The arrows move it.
   *
   * Arrows rather than the numbers, which the vote has, and rather than Tab,
   * which the browser has. Bound only while out - a level nobody can be
   * eliminated from never listens.
   */
  useEffect(() => {
    if (!out) return
    const onArrow = (event: KeyboardEvent) => {
      const step = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0
      if (step === 0) return
      setPicked(nextWatch(watching, watchIds, step))
    }
    window.addEventListener('keydown', onArrow)
    return () => window.removeEventListener('keydown', onArrow)
  }, [out, watchIds, watching])

  /**
   * A rematch, told to the arbiter.
   *
   * `R` rebuilds the level locally - fresh world, clock back to zero, everybody
   * at the spawn - and none of that reaches the scoreboard, the lives or the
   * roles, because none of those are ours. Without this the second round opens
   * with the first round's kills and anybody eliminated in round one stays
   * eliminated in the rematch, permanently.
   *
   * The round number goes with it so two people pressing `R` on the same frame
   * is one rematch: the second is told the round it asked for has already
   * begun. Skipped on the first mount, which is not a rematch of anything.
   */
  useEffect(() => {
    if (!arbiter || round === 0) return
    void arbiter
      .ask('reset', { round })
      .then((verdict) => {
        // `stale` here is somebody else's rematch arriving first, which is the
        // same rematch. Only a real refusal is worth the corner of a screen.
        if (!verdict.ok && verdict.why !== 'stale') {
          setKills((was) => ({ ...was, refused: `${verdict.why}: ${verdict.message}` }))
        }
      })
      .catch(() => {})
  }, [arbiter, round])

  /**
   * Asking the server to close it, once our own clock says it is time.
   *
   * **The vote does not close itself, and it must not.** Nothing runs
   * server-side on a schedule - there is no cron, no worker, no timer in
   * Postgres - so a vote where one player simply never votes would stay open
   * for the rest of the match with everybody watching a countdown at zero.
   * That is the hole this closes: somebody has to ask.
   *
   * The client's clock decides *when to ask* and the server decides *whether it
   * is time*, which is why `vote_close` answers `stale` rather than refusing:
   * a client whose clock runs fast asks early, is told the vote is still open,
   * and its next poll brings the real state back. Nothing a client believes
   * about the time can close a vote a second early.
   *
   * Every client asks, deliberately. The first one wins and the rest are told
   * `stale`, which costs one request each and removes the case where the only
   * client that would have asked is the one whose tab was closed.
   */
  useEffect(() => {
    if (!arbiter || !vote) return
    const closes = Date.parse(vote.closes)
    if (!Number.isFinite(closes)) return
    /**
     * A second past the deadline, and a second of jitter on top.
     *
     * Not politeness about load - it is that all of them firing on the same
     * millisecond is a row lock contended by everybody in the room for one
     * write that only one of them can do.
     */
    const wait = Math.max(0, closes - Date.now()) + 1000 + Math.random() * 1000
    const timer = setTimeout(() => {
      void arbiter
        .ask<{ vote?: OpenVote | null }>('vote_close')
        .then((verdict) => {
          // A refusal here is ordinary: somebody else closed it first, or our
          // clock was early. Either way the poll has the truth a second later,
          // so this says nothing to the player.
          if (verdict.ok) setVote(verdict.outcome?.vote ?? null)
        })
        .catch(() => {})
    }, wait)
    return () => clearTimeout(timer)
  }, [arbiter, vote])

  /**
   * `B` asks the room.
   *
   * Any standing player, and the arbiter refuses a second one over a running
   * one - so who may call a vote is a rule in one place rather than a
   * permission this component has to work out. What *should* trigger a vote in
   * a finished game (a body found, a phase of a round, a timer) is a design
   * this level layer does not have yet; a key is the honest stand-in, and it is
   * what makes the whole chain reachable at all.
   */
  useEffect(() => {
    if (!arbiter || vote) return
    const onCall = (event: KeyboardEvent) => {
      if (event.code !== 'KeyB') return
      void arbiter
        .ask<{ vote?: OpenVote | null }>('vote_open', { seconds: 60 })
        .then((verdict) => {
          if (verdict.ok) setVote(verdict.outcome?.vote ?? null)
          else setKills((was) => ({ ...was, refused: `${verdict.why}: ${verdict.message}` }))
        })
        .catch((reason: unknown) => {
          setKills((was) => ({ ...was, refused: `lost: ${String(reason)}` }))
        })
    }
    window.addEventListener('keydown', onCall)
    return () => window.removeEventListener('keydown', onCall)
  }, [arbiter, vote])

  /**
   * The number keys, while a vote is open.
   *
   * Keys and not a mouse, and that is a decision rather than laziness: the
   * pointer is locked while you are playing, so a clickable panel means
   * releasing the lock, which means the vote takes the camera away from
   * whoever is still shooting at you. A row of numbers reads the same on the
   * screen and costs nothing.
   *
   * `1` is the first option the panel draws, because the panel draws
   * `voteView`'s own order - one function, one order, and no chance of the
   * screen numbering a list differently to the thing that reads the key.
   */
  useEffect(() => {
    if (!vote) return
    const onNumber = (event: KeyboardEvent) => {
      if (!event.code.startsWith('Digit')) return
      const at = Number(event.code.slice(5)) - 1
      if (!Number.isInteger(at) || at < 0) return
      const view = voteView({ vote, standings, me: mine, now: Date.now() })
      if (!view?.may) return
      const option = view.options[at]
      if (option) cast(option.id)
    }
    window.addEventListener('keydown', onNumber)
    return () => window.removeEventListener('keydown', onNumber)
    // `cast` is rebuilt every render and depending on it would rebind this on
    // every frame that changes anything at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vote, standings, mine])

  /**
   * `R` starts the next one, once this one is over.
   *
   * Only once it is over, and that is the whole of the rule: a key that reset a
   * match somebody was winning would be a key nobody could safely put their hand
   * near. A level with no match in it has nothing to restart and does not listen
   * at all - `world.restart` is what a freestyle level already has for going
   * back to the start.
   */
  useEffect(() => {
    if (!over) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyR') return
      setRound((current) => current + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [over])

  /**
   * `G` dances, in every XP, whether or not the level said anything about it.
   *
   * Its own listener rather than a row in `pressBuffer`, because that buffer is
   * for the keys a *document* bound and this is not one of those - the format
   * refuses a document that binds G at all. A body key, like jump: what a body
   * can do rather than what a level decided it can do.
   *
   * A toggle, so it is one press to start and one to stop, and moving stops it
   * as well - see the frame loop. `repeat` is dropped or a held key would flip it
   * sixty times a second and land wherever it happened to stop.
   */
  useEffect(() => {
    const onDance = (event: KeyboardEvent) => {
      if (event.code !== 'KeyG' || event.repeat) return
      dancingRef.current = !dancingRef.current
    }
    window.addEventListener('keydown', onDance)
    return () => window.removeEventListener('keydown', onDance)
    // Stable - it is a `useRef` inside `useStance` - but arriving through a
    // hook's return it is just a value to the rule, so it is named.
  }, [dancingRef])

  /**
   * The keys this level bound, and the presses waiting to be told to the world.
   *
   * Here rather than in `./player` for the reason the `finished` pass below
   * gives: this file owns the entity world, and a second writer reaching into it
   * is the bug that comment exists to prevent. The controller's job is turning
   * keys into *movement*, and an action key never touches the body.
   *
   * A queue drained in the frame loop rather than firing from the listener,
   * because a `keydown` arrives whenever the browser feels like it - between
   * frames, twice in one frame, during a script's step. Firing there would run
   * a trigger against a world half way through being advanced. The queue makes
   * a press an input to the next frame, which is what every other event here
   * already is.
   */
  /**
   * Lifted out of the memo's dependency list on purpose: an optional chain in
   * there is an expression rather than a value, and the React Compiler refuses
   * to memoize around one - `bunx eslint` says so where `tsc` and the tests
   * cannot, which is why this area is linted before a commit.
   */
  const boundKeys = xp.player?.keys
  /**
   * And which of them the level can hear a *release* of, so the tap-versus-hold
   * latch is only spent on actions that have somewhere to spend it.
   *
   * See `pressBuffer`'s `latching`: without this, `roll` fired on every other
   * tap. Derived from the document rather than declared, so an author adding an
   * `on: 'released'` rule gets the carry gesture with nothing else to write.
   */
  const letsGo = useMemo(() => releasedKeys(xp), [xp])
  const presses = useMemo(() => pressBuffer(boundKeys ?? [], letsGo), [boundKeys, letsGo])
  const pressed = useRef<string[]>([])
  /**
   * And what was let go of, which is the other edge of the same key.
   *
   * Its own buffer rather than a flag on the press, because the two can be a
   * long way apart: *hold this and carry it across the board* is a press, a
   * walk, and a release, and everything in between is the point.
   */
  const letGo = useRef<string[]>([])
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      /**
       * Not while typing, and not while a modifier is down.
       *
       * A bound key is an ordinary letter, so `E` for "grab" is also `E` in a
       * text field and part of ⌘E. Neither should reach the level. There is no
       * text field in a running XP today, which is exactly why this is written
       * now rather than after somebody adds chat and cannot work out why the
       * hatch opens when they type.
       */
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      /**
       * Which edge this keystroke turned out to be, rather than *a press*.
       *
       * `pressBuffer` owns the tap-versus-hold decision - see `HOLD_AFTER` -
       * because it is a fact about keystrokes rather than about the level: a
       * key let go of quickly means *I have picked this up*, and its release is
       * owed to the next tap. So a keydown can arrive here as a release, and
       * neither the document nor anything below this line has to know why.
       */
      const edge = presses.down(event.code, event.repeat, event.timeStamp)
      if (edge?.on === 'pressed') pressed.current.push(edge.does)
      else if (edge?.on === 'released') letGo.current.push(edge.does)
    }
    const up = (event: KeyboardEvent) => {
      const edge = presses.up(event.code, event.timeStamp)
      if (edge !== undefined) letGo.current.push(edge.does)
    }
    // See `clear` in ./actions: a keyup that never arrives leaves the action
    // dead until something else is pressed - and a key that is no longer held
    // is a key that was released, so the level hears it rather than being left
    // holding something across a blur.
    const clear = () => letGo.current.push(...presses.clear())

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [presses])

  useFrame((_state, rawDelta) => {
    const live = world.current
    if (!live) return

    // The same clamp the controller uses, and for the same reason: a tab
    // returning from the background hands back one enormous delta, and a script
    // integrating a whole second of it moves a platform through a wall.
    const delta = Math.min(rawDelta, 0.05)
    live.tick += 1

    /**
     * The seat this client was given, written onto the body.
     *
     * Here rather than in the effect that decided it, because this is the only
     * thing that writes the entity world - see the note on `reseat`. Cleared
     * first, so a player who lost their side stops answering for it rather than
     * keeping the last one they had.
     */
    if (reseat.current !== null) {
      const want = reseat.current
      reseat.current = null
      const own = live.props.get(PLAYER_ID)
      if (own) {
        for (const key of Object.keys(own)) {
          if (key.startsWith(TEAM_PROP_PREFIX)) delete own[key]
        }
        if (want.length > 0) own[teamProp(want)] = 1
      }
    }

    /**
     * A frame off every clip the body is playing.
     *
     * One call, at the top, where it used to be the same three lines beside
     * each of the three things that start one. See ./body/stance.
     */
    tickStance({ hurt: hurtRef, recoil: recoilRef, swing: swingRef, dancing: dancingRef }, delta)

    /**
     * Seconds of simulated time, which is what a `deactivate` deadline is in.
     *
     * Accumulated from the *clamped* delta rather than read off a wall clock,
     * so it matches what a script sees as `world.time` and so a tab that spent
     * a minute in the background does not bring every timed pickup back at
     * once on the frame it returns.
     */
    elapsed.current += delta
    /**
     * And on the world, so anything reading it does not need this ref.
     *
     * The renderer is the reader that forced it: a running motion is a name and
     * the second it began, and where a door currently is comes out of those two
     * - so `live.tsx` needs the current second and has no business being handed
     * a private ref out of this component's frame loop. See `EntityWorld.seconds`.
     */
    live.seconds = elapsed.current

    const effects: Effect[] = []

    /**
     * Anything whose time is up, put back - and told that it is.
     *
     * Before the trigger pass rather than after: a pickup returning this frame
     * should be collectable this frame, and the alternative is a box that is
     * visibly there and cannot be walked into until the next tick.
     *
     * The `returned` rule fires here, on the frame it comes back, which is what
     * lets a thing come back *changed* - the punching bag that was knocked to
     * zero heals to full and is worth hitting again, rather than returning on
     * zero to die to the next tap. See the event's own note in `@kxb/xp/engine`.
     */
    for (const back of stepReturns(live, elapsed.current)) {
      effects.push(...fire(live, blueprints, back, 'returned', null, clockNow()))
      const name = live.name.get(back)
      if (name) say(ticker, onSay, `${name} is back`)
    }

    /**
     * Where the player is, before anything asks.
     *
     * Hoisted above the press pass rather than left beside the prober below,
     * because a reach is measured from the player's entity and that entity is
     * only where the camera is once this has run. Read a frame late it is a
     * press aimed at where you were standing - invisible at sixty frames a
     * second and not at fifteen, which is the shape of bug that gets blamed on
     * the network.
     *
     * The body follows the camera. Feet, not eye - an entity stands on the floor
     * and the camera is `EYE_HEIGHT` above it.
     */
    const at = playerAt.current
    movePlayer(live, { x: at.x, y: at.y - EYE_HEIGHT, z: at.z }, heading.current)

    /**
     * What the player asked for, before the world moves.
     *
     * First in the frame because a press is an *input* to it - the opposite end
     * from `finished` below, which is fired last because it is a conclusion
     * about it. A press resolved after the scripts had run would be a press
     * acting on a world one tick further along than the one the player was
     * looking at when they pressed it.
     *
     * Every live entity is offered it, exactly as `finished` is: `fire` matches
     * the trigger's own `key` against this name, so a document with two bindings
     * has two rules and nothing here knows what either means. That is the whole
     * design of `does` - a name, not a vocabulary - and it is why "open the
     * hatch" needs no engine support.
     *
     * **And the presser is handed over.** It used to be null, which made a rule
     * asking about `other` false for every press and a `within` unmeasurable.
     * The player is a real entity now, so the presser is one - which is what
     * lets a `pressed` rule write onto whoever pressed it, the same way the
     * flag's `enter` writes onto whoever walked in.
     *
     * Drained rather than read: leaving the queue full would fire the same press
     * again next frame, which is the autorepeat bug one layer up from the one
     * ./actions guards.
     *
     * **Either edge**, and the `letGo` half of that is not decoration: a key
     * held across a walk goes down on one frame and comes up on another, so a
     * guard on presses alone is a guard that drops every release. Which is
     * exactly what it did - the piece stayed in the hand, and the move the table
     * was waiting for never happened.
     */
    if (pressed.current.length > 0 || letGo.current.length > 0) {
      /**
       * Only what this phase, and what this player's own role, leave live.
       *
       * Dropped rather than queued: a press the phase does not allow is not a
       * press waiting for its turn, it is a button that was not live when it was
       * hit. Holding it would fire it later, at a moment the player has stopped
       * expecting - which is the worst of both answers.
       *
       * `allowedFor` intersects twice and in that order, so a level with no
       * flow, a phase with no `allow` and a player who was dealt nothing all
       * come out of it unchanged. See its note for why a role can only ever take
       * a key away.
       *
       * **The role half needs nothing from the network**, which is the whole
       * reason it costs a line: this client knows its own secret and nobody
       * else's, and "what may *I* press" is the one question that can be
       * answered from it.
       */
      const dealt = roleRule(rulesOf(xp), pendingRole.current)
      const live_keys =
        flow || dealt
          ? new Set(
              allowedFor(
                phase.current && flow ? flow.phases[phase.current] : undefined,
                dealt?.allow,
                (xp.player.keys ?? []).map((binding) => binding.does),
                /**
                 * The turn half of a `who: 'turn'` phase. Null while nobody
                 * holds the turn, which opens the gate - see `FlowPhase.who`
                 * for why a table where nothing has started must not be a
                 * table where every key is dead. Local enforcement only: the
                 * arbiter goes on refusing out-of-turn effects regardless.
                 */
                turnNow.current === null ? null : turnNow.current === me?.id,
              ),
            )
          : null
      const allowed = live_keys ? pressed.current.filter((one) => live_keys.has(one)) : pressed.current
      pressed.current = []
      /**
       * And only the keys that have finished cooling.
       *
       * Enforced in this pass, beside `allow`, rather than inside `applyVerbs` -
       * the wait belongs to this player pressing a key, not to the verb. See
       * `throughCooling` for why, and for why the whole press is dropped rather
       * than only the verb that cooled.
       */
      const { asked, armed } = throughCooling({
        pressed: allowed,
        waits,
        readyAt: readyAt.current,
        now: elapsed.current,
      })
      for (const [one, at] of armed) readyAt.current.set(one, at)
      /**
       * What is in this player's hands *before* the presses, so a put-down can
       * be seen after them.
       *
       * `carry` and `drop` write `world.parent` and return no effect - they are
       * already the whole act - so there is nothing in the effect list to
       * notice, and the level's own rules are the only place that knows a piece
       * changed hands.
       *
       * Read here rather than off the held/dropped edge `stepTriggers` computes,
       * and that is not a preference. That edge is a difference between frames,
       * so a piece picked up and put down inside one - two keystrokes arriving
       * together, which is exactly what a test driving the browser does - has no
       * edge at all and would be silently unreported. It is also the wrong
       * question: the edge fires on *every* client, because a thing lifted
       * across the room should glow on all four screens, so four browsers would
       * each report one act.
       */
      const inHand = () => {
        const now = new Set<number>()
        for (const [id, at] of live.parent) if (at.id === PLAYER_ID) now.add(id)
        return now
      }
      let mine = inHand()

      /**
       * Anything that left this player's hands since `was`, put on a field and
       * said to the table.
       *
       * **Snapped**, because a board has squares: a piece is on one or it is in
       * the air, and one left a few centimetres off its own is a board that
       * slowly stops being readable. It also makes the move one short name
       * rather than three floats, which is what lets it travel the way the roll
       * does - `WorldShare` carries no positions on purpose.
       *
       * Put there here as well as reported, so the board this player is looking
       * at is the board everybody else is handed a second later. Returns the new
       * set, so the caller can run it after each edge without the two disagreeing
       * about what was in hand.
       */
      const settle = (was: ReadonlySet<number>) => {
        const now = inHand()
        for (const id of was) {
          if (now.has(id)) continue
          const at = live.position.get(id)
          const field = at ? nearestMark(xp.world.marks, at) : null
          if (!field?.name) continue
          live.position.set(id, { x: field.x, y: field.y, z: field.z })
          live.rotation.set(id, field.facing)
          // The box is cached per entity, so a piece moved without clearing it
          // collides where it used to be - which is how one counts itself home
          // from a square it has left.
          live.box.delete(id)
          const name = field.name
          void arbiter?.ask('moved', { id, mark: name }).catch(() => {
            // Quiet, like the poll: a move the arbiter did not take is a board
            // out of step, and the next move re-states where the piece is - so
            // this recovers on its own rather than needing a retry queue that
            // could land a stale move after a fresh one.
          })
        }
        return now
      }
      for (const does of asked) {
        /**
         * A swing, for the one name the whole product treats as a swing.
         *
         * `does` is a name and not a vocabulary - that is the design of
         * `player.keys` and it is not being narrowed here. What this adds is
         * that **one** of those names has a body animation attached, the same
         * way `shoot` has one: a level binding `attack` gets a person who
         * throws a punch, and a level binding `dance` or `open the hatch` gets
         * exactly what it got before, which is a rule and no animation.
         *
         * `attack` rather than a list of near-synonyms because it is the name
         * the editor suggests, the name the manual uses, and the name the
         * reported level had already bound. A body that swings for `attack`
         * and stands still for `punch` would be worse than one that never
         * swings, because the difference is invisible until somebody hits it.
         */
        if (does === ATTACK) swingRef.current = SWING
        /**
         * Sent to the thing under the cursor, not to everything in reach.
         *
         * `pressOn` is `fire` narrowed by `aimOf` - the same answer the
         * highlight is drawn from - so the piece that lights up is the piece
         * that moves. Without it the two disagreed the moment two pieces were
         * both in reach, which on this board is a piece and its neighbouring
         * field.
         */
        effects.push(
          ...pressOn(live, blueprints, does, PLAYER_ID, { ...clockNow() }, xp.world.marks),
        )

        /**
         * After each key rather than after all of them, which is the difference
         * between this working and this working most of the time: two presses
         * can arrive in one frame, and a piece picked up and put down inside a
         * single pass would have been in nobody's hand as far as a diff at the
         * end could tell. The move was silently lost.
         */
        mine = settle(mine)
      }

      /**
       * And what was let go of, on the same terms.
       *
       * `allowedFor` gates a release exactly as it gates a press, which is worth
       * saying out loud: a phase that took a key away mid-hold would otherwise
       * leave the thing in your hand with no rule left that could put it down.
       * Same list, same frame, so a key is live for both of its edges or for
       * neither.
       *
       * **Not narrowed by `aimOf`**, unlike a press, and that is the difference
       * between the two events rather than an omission. What you let go of is
       * what is in your hand; where you are pointing by then is somewhere else
       * entirely, because walking there was the point of holding it.
       */
      const letting = live_keys ? letGo.current.filter((one) => live_keys.has(one)) : letGo.current
      letGo.current = []
      for (const does of letting) {
        for (const id of [...live.alive]) {
          effects.push(
            ...fire(live, blueprints, id, 'released', PLAYER_ID, { ...clockNow(), key: does }),
          )
        }
        mine = settle(mine)
      }
    }

    // The same map the rules read and write, so a script adding a coin and a
    // rule asking whether there are ten are looking at one number.
    if (scripts) effects.push(...scripts.step(live, blueprints, delta, data?.current))

    /**
     * What a press would do, worked out after the rules have run.
     *
     * After rather than before, so the answer is about the world the player is
     * looking at: a piece that just moved is aimed at where it *is*, and a roll
     * that a press just spent stops being a destination in the same frame that
     * spent it.
     *
     * Every binding the document has, in its own order, first one that finds
     * something. A level with `use` and `attack` is asking two questions of the
     * same position, and the answer a cursor can draw is one of them - the
     * first, which is the order the author wrote and the order the buttons are
     * drawn in on a phone.
     */
    if (onAim) {
      let found: Aim | null = null
      for (const binding of xp.player.keys ?? []) {
        found = aimOf(live, blueprints, binding.does, PLAYER_ID, xp.world.marks, data?.current)
        if (found) break
      }
      const was = aimed.current
      if (found?.id !== was?.id || found?.to?.name !== was?.to?.name) {
        aimed.current = found
        onAim(found)
      }
    }

    /**
     * And the numbers themselves, when one of them has moved.
     *
     * The comparison is against what was last *reported* rather than against
     * the previous frame, which is the same shape `level-data.ts` uses to
     * decide what to persist and for the same reason: a value that changed and
     * changed back between two reports has not changed.
     */
    if (onTally && data) {
      let moved = false
      for (const [name, field] of labelled) {
        const value = data.current.get(name) ?? field.value
        if (tallied.current.get(name) !== value) moved = true
      }
      if (moved) {
        const next = labelled.map(([name, field]) => ({
          label: field.label!,
          value: data.current.get(name) ?? field.value,
        }))
        for (const [name, field] of labelled) {
          tallied.current.set(name, data.current.get(name) ?? field.value)
        }
        onTally(next)
      }
    }

    /**
     * And the same pull, from a thumb.
     *
     * Read here rather than in ./player because *this* is where the shot is
     * taken: `pulled` and `shoot` both live in this loop, and a controller that
     * reached in to set a flag it does not own would be the second writer this
     * file keeps refusing to have.
     *
     * A change of any size is one pull. Two taps inside a single frame is 16ms
     * of thumb and one round, which is what a mouse would have done with two
     * clicks that fast - and the alternative, a queue of pending shots, would
     * fire them at somewhere the player has stopped aiming.
     */
    const pulls = touch?.current?.fire
    if (pulls !== undefined && isNews(pulls, sawFire)) pulled.current = true

    /**
     * And the same toggle, from a thumb.
     *
     * Compared rather than cleared, like the pull above: the button counts up and
     * this notices the change, so neither half writes the other's half of the
     * buffer. One tap is one toggle however many frames the finger was down for.
     */
    const asks = touch?.current?.dance
    if (asks !== undefined && isNews(asks, sawDance)) dancingRef.current = !dancingRef.current

    if (pulled.current) {
      pulled.current = false
      const fired = shoot(live)
      effects.push(...fired)
      // Only when something actually left the barrel: an empty gun emits "out of
      // ammo" and should not play a recoil, or a player with nothing left looks
      // like a player who is shooting fine.
      if (fired.every((effect) => effect.kind !== 'emit')) recoilRef.current = RECOIL
    }

    /**
     * And what the arbiter says has been done to us since the last frame.
     *
     * Through `damage()` rather than by writing the number, which is the whole
     * of it: that function takes the health off **and then fires the `damaged`
     * rules**, so a document that says "being hit makes you drop what you are
     * carrying" finally says it about a hit from another *person*. Before this
     * the poll wrote `hp` directly and no rule in any level ever saw a shot
     * fired by anybody else - the flag stayed in the carrier's hand, and only
     * the shooter's screen even knew a hit had landed.
     *
     * **Only downwards**, exactly as the poll was: standing back up is the
     * local revive's job, and healing here would fight the respawn countdown
     * every second it was running. And cleared once read, so a poll that fails
     * for ten seconds does not re-apply a hit ten times.
     */
    const served = servedHp.current
    servedHp.current = null
    if (served !== null) {
      const own = live.props.get(PLAYER_ID)
      if (own?.hp !== undefined && served < own.hp) {
        effects.push(...damage(live, blueprints, PLAYER_ID, own.hp - served, null, clockNow()))
      }
    }

    /**
     * A flinch, whenever the health went down.
     *
     * After the trigger pass and the arbiter's readback have both had their say,
     * so a hit from either shows. Only while alive: dying plays its own clip and
     * a flinch on the frame somebody falls over would replace the fall with a
     * stagger.
     */
    const nowHp = live.props.get(PLAYER_ID)?.hp
    if (typeof nowHp === 'number') {
      const before = wasHp.current
      if (before !== null && nowHp < before && nowHp > 0) hurtRef.current = FLINCH
      wasHp.current = nowHp
    }

    /**
     * Everything that falls, rolls or gets shoved, moved one frame.
     *
     * **Before the trigger pass**, and that ordering is the whole of why a ball
     * can score. A body rolled into a goal this frame should fire the goal's
     * `collide` this frame; run afterwards, every contact would be a frame late
     * and a fast shot could pass clean through a trigger between two ticks.
     *
     * After the press pass above, for the mirror-image reason: a kick is an
     * input to the frame, so the shove a script applied on this tick is part of
     * what the body does on this tick rather than something it waits a frame
     * for.
     *
     * The shover is the player and how far they actually travelled - measured,
     * not asked for, which is what makes walking into a ball roll it and
     * sprinting into it send it away. See `Shover`.
     */
    /**
     * Everybody's shoulder, this client's and every peer's.
     *
     * Rebuilt into the same array rather than allocated, because it is handed
     * to a function that runs every frame over every body - the same reason
     * `blockers.current` is refilled below rather than replaced.
     *
     * The peers come out of the crowd buffer, which is to say out of the
     * position packets that are already on the wire eight times a second. That
     * is what lets **one** client integrate the bodies without walking into a
     * ball becoming a message: whoever is elected can see where everybody is
     * standing and how far they moved, so it works out everybody's shove
     * itself. See `@kxb/xp/owning`.
     *
     * Their delta is measured here for the same reason the player's is - one
     * frame of positions is the only reading of speed anything has - and
     * against the *interpolated* body rather than the raw sample, because the
     * interpolated one is where they appear to be and therefore where a shove
     * should look like it came from.
     */
    const wasAt = wasPlayerAt.current
    shovers.current.length = 0
    shovers.current.push({
      box: shoverBox(at),
      dx: wasAt ? at.x - wasAt.x : 0,
      dy: wasAt ? at.y - wasAt.y : 0,
      dz: wasAt ? at.z - wasAt.z : 0,
    })

    /**
     * And the first step out of a dance is the end of it.
     *
     * Measured off the stride just built rather than asked of the controller,
     * which is the same trick the shove uses and needs nothing new: a body that
     * has moved has stopped dancing, and one that is being pushed about while it
     * stands there has not. `STILL` is the threshold the stance machine already
     * calls standing still, so a dance ends exactly where a walk would have
     * begun - and a body resting against a wall, which reports a fraction of a
     * cell a second from the collision slide, keeps dancing.
     */
    if (dancingRef.current && wasAt && delta > 0) {
      const stride = Math.hypot(at.x - wasAt.x, at.z - wasAt.z) / delta
      if (stride > STILL) dancingRef.current = false
    }
    const crowd = bodies.current
    if (crowd) {
      /**
       * Milliseconds off the wall clock, which is what the buffers are stamped
       * with - `together` remembers every sample at `performance.now()`.
       *
       * Not `clockNow()`, which is `elapsed` in *simulated seconds*. Asking a
       * buffer delayed by 250 **ms** where somebody is at second 12 means
       * asking about second -238, which is before anything it holds - so it
       * answers with the oldest sample it has and keeps answering that forever.
       * Both readers below got this wrong and the ball is where it showed.
       */
      const peers = crowd.targets(performance.now())

      /**
       * Two questions of one list, and they are not related - see ./match/dash,
       * which says why they used to share a loop. Both want the boxes as peers
       * are *drawn*, which is the only thing they have in common.
       */
      for (const id of dashCatches({
        peers,
        at,
        mine: side,
        sideOfPeer: (peer) =>
          sideOf(xp.world.marks, { id: peer, roster: roster.map((one) => one.id) }, rulesOf(xp)),
        elapsed: elapsed.current,
        dashUntil: dash.until.current,
        caught: dash.caught.current,
      })) {
        dash.caught.current.add(id)
        claim(id)
        say(ticker, onSay, 'you caught somebody')
      }

      gatherShoves(peers, wasPeersAt.current, shovers.current)
    }

    const bodyContacts = stepBodies({
      world: live,
      blueprints,
      delta,
      isSolid: solids.isSolid,
      topOf: solids.topOf,
      ...(xp.world.ground ? { floorY: xp.world.floorY } : {}),
      /**
       * Nobody shoves anything on a client that is only watching.
       *
       * The last of the prediction, and the one that was still visible. A
       * follower's own step moved the ball - a dash or a kick is a large,
       * sudden velocity - and `place` below then put it back where the owner
       * says it is, a quarter of a second ago. One frame forward, one frame
       * back, for as long as the contact lasts, which is exactly the glitch
       * reported on dash and on kick.
       *
       * `place` was already erasing it every frame, so this changes nothing
       * about where the ball *ends up*. What it removes is the wasted step in
       * between, and with it the frames before the first packet arrives, where
       * there is nothing to erase the prediction *with* and the ball really
       * does leap.
       *
       * The intent still travels - see `outgoingShoves` - so the kick happens.
       * It happens at the owner, which is the whole point of there being one.
       */
      shovers: following.current ? EMPTY_SHOVERS : shovers.current,
      // The same depth a *player* is caught at, so a ball that goes over the
      // edge stops falling where somebody chasing it would.
      below: xp.world.floorY - OUT_OF_WORLD,
    })
    if (!wasAt) wasPlayerAt.current = { x: at.x, y: at.y, z: at.z }
    else {
      wasAt.x = at.x
      wasAt.y = at.y
      wasAt.z = at.z
    }

    /**
     * And if somebody else owns them, put them where that somebody says.
     *
     * **After** the local step rather than instead of it, and the difference
     * matters less than it looks: the step is what fires this client's own
     * `hit` and `collide` rules, and this overwrites the positions it produced.
     * So a follower's ball is exactly the owner's ball, a quarter of a second
     * behind and interpolated between two of its samples - which is what the
     * avatars have always done over the same transport at the same rate.
     *
     * A follower's own local push is therefore prediction that lasts one frame
     * and is then replaced. That is deliberate: predicting further is what the
     * previous version of this did, and it is what made the ball jump.
     */
    if (following.current) {
      owned.current.place(live, performance.now())
      /**
       * And the other end of a handover this client *lost*.
       *
       * Losing it is the mirror of taking it: the sim was live and the drawing
       * goes back to a quarter of a second ago, which is the same discontinuity
       * pointing the other way. It cannot be absorbed on the frame the packet
       * arrives, because the delayed position does not exist until the new owner's
       * first sample does - a round trip later. So `onOwns(false)` records where
       * the ball is being drawn and this is the frame that finds out where it
       * really went.
       *
       * `knows` is the guard that makes the wait honest: between losing the ball
       * and the new owner's first packet, `place` writes nothing and this client's
       * rows still hold the live position it had. Settling against that would
       * absorb a gap of zero and throw the capture away just before the real jump.
       */
      if (smoothing.current.pending > 0) {
        for (const id of smoothing.current.waiting()) {
          if (!owned.current.knows(id)) continue
          const now = live.position.get(id)
          if (now) smoothing.current.placedAt(id, now)
        }
      }
    }

    /**
     * Whatever a script pushed this frame, taken off the world.
     *
     * Cleared unconditionally, whether or not anything is listening: the world
     * is not the place for a queue nobody drains, and a level played alone
     * would otherwise grow one push per kick forever.
     */
    if (live.shoves.length > 0) {
      outgoingShoves.current.push(
        ...live.shoves.map((one) => ({ i: one.id, dx: one.dx, dy: one.dy, dz: one.dz })),
      )
      live.shoves.length = 0
    }

    /**
     * The player, as something that can set a trigger off.
     *
     * A box rather than an entity, because the player is not one yet - the host
     * spawns them and the document does not place them (docs/xp/manual.md §5).
     * The id is above every id a document or a runtime spawn can use, so it
     * cannot collide with a real entity in the overlap bookkeeping.
     *
     * The entity behind it was moved at the top of the frame, where the reach of
     * a press is measured from.
     */
    const prober = {
      id: PLAYER_ID,
      box: {
        minX: at.x - PLAYER_RADIUS,
        minY: at.y - EYE_HEIGHT,
        minZ: at.z - PLAYER_RADIUS,
        maxX: at.x + PLAYER_RADIUS,
        maxY: at.y,
        maxZ: at.z + PLAYER_RADIUS,
      },
    }
    /**
     * The crossings, collected here and delivered after the pass.
     *
     * Not straight into the sandbox from inside `stepTriggers`: that pass is
     * walking the live set while a script could despawn something out of it,
     * and "queue it, drain it when the thing that caused it has finished" is
     * already the ordering rule inside the sandbox itself. One rule, twice.
     */
    /**
     * What has appeared since the last step, before what is overlapping what.
     *
     * First, so a thing that spawns and is immediately stood on says `spawned`
     * before it says `enter` - which is the order they happened in, and the
     * order a rule reading both would expect.
     */
    effects.push(...stepSpawned(live, blueprints, announced.current, clockNow()))

    crossings.current.length = 0
    effects.push(
      ...stepTriggers(
        live,
        blueprints,
        [prober],
        overlaps.current,
        (id, event, by) => {
          if (scripts) crossings.current.push({ id, event, by })
        },
        /**
         * The same clock `stepReturns` above is stepped with.
         *
         * It has to be simulated seconds rather than a wall clock, or a pickup
         * that deactivates for fifteen seconds is measured against one clock and
         * brought back against another - and a tab left in the background would
         * return everything at once on the frame it came back.
         */
        /**
         * And the marks, so a `teleport` can name one.
         *
         * The engine resolves a destination against entities first and marks
         * second, but only if it is handed them — without this, `to: "start"`
         * finds nothing and the pad silently does nothing, which is the exact
         * shape of the `seconds` bug the comment above describes: a field that
         * parsed, an editor that could set it, and no path that could use it.
         */
        clockNow(),
      ),
    )
    /**
     * And what those bodies hit, as rules.
     *
     * After `stepTriggers` rather than beside the step that produced the
     * contacts, so a `hit` rule sees a world the `collide` rules have already
     * had their say about - the same ordering `Crossed` documents for a
     * script's own hooks. Only the contacts with the *level*: entity-on-entity
     * is `collide` and is already fired above. See `stepHits`.
     */
    if (bodyContacts.length > 0) {
      effects.push(
        ...stepHits(
          live,
          blueprints,
          bodyContacts,
          (id, event, by) => {
            if (scripts) crossings.current.push({ id, event, by })
          },
          clockNow(),
        ),
      )
    }
    for (const crossing of crossings.current) {
      /**
       * `other` is whoever set it off, and now that is a real entity.
       *
       * It used to be null: the player was a box with an id above everything
       * else and nothing behind it, so a script asking who walked into its
       * trigger got nothing back. They are an entity now, so a script can read
       * their position, their properties, and their name.
       *
       * And the level's own data, which is the same map `scripts.step` above is
       * handed. Without it a script that scores on contact wrote to nothing at
       * all - see `Scripts.trigger`, where the silence is argued out.
       */
      effects.push(
        ...(scripts?.trigger(
          live,
          blueprints,
          crossing.id,
          crossing.event,
          crossing.by,
          data?.current,
        ) ?? []),
      )
    }

    /**
     * The tracers, aged and cleared out here rather than where they are drawn.
     *
     * Because this is where the list lives, and a ref passed down as a prop and
     * mutated by the child is the shape React's compiler refuses - the same rule
     * that put the entity world in this file. The renderer only reads.
     *
     * Spliced rather than marked dead: the array is the only thing that says
     * what is in the air, and a dead entry in it is a slot the next shot cannot
     * have.
     */
    for (let i = shots.current.length - 1; i >= 0; i--) {
      const shot = shots.current[i]
      shot.age += delta
      if (!streak(shot.age, shot.distance).alive) shots.current.splice(i, 1)
    }

    /**
     * Everything said this frame, delivered to whoever was listening for it.
     *
     * Here rather than at the point of emission for the reason the crossings
     * above are drained here: a rule firing inside the pass that produced it is
     * a pass walking a set something is mutating. By this line every verb that
     * was going to run has run, so a signal is delivered to the world as it
     * ended up rather than to a world half way through the frame.
     *
     * Before the ticker below, and that ordering is the load-bearing part: an
     * `emitted` rule can `score`, `emit` again or make a sound, and those are
     * effects that have to reach the same consumer as everybody else's. The
     * `dealt` and `finished` fan-outs further down are pushed *after* it and
     * their effects are dropped — a pre-existing hole this deliberately does
     * not join.
     *
     * What gets gathered, and which half of it goes on the wire, is ./saying.
     */
    const {
      saying,
      outgoing,
      toldUnstick: nextUnstick,
      toldBallBack: nextBallBack,
    } = collectSaying({
      fromPeers: fromPeers.current,
      revives: revives.current,
      toldUnstick: toldUnstick.current,
      ballBackAt,
      toldBallBack: toldBallBack.current,
      effects,
    })
    fromPeers.current.length = 0
    toldUnstick.current = nextUnstick
    toldBallBack.current = nextBallBack
    if (saying.length > 0) {
      effects.push(...stepEmitted(live, blueprints, saying, clockNow()).effects)
    }
    if (outgoing.length > 0) {
      onSignal?.(outgoing)
      /**
       * Bumped rather than sent from here: this is a frame callback, and the
       * socket is reached from an effect keyed on a counter - the same shape
       * the picture and the face use, and the reason a level where nothing is
       * said sends nothing at all.
       */
      setSignal({ said: outgoing, at: signalId.current++ })
    }

    // Refilled rather than replaced: the controller holds this array.
    const current = blockersOf(live, wereAt.current)
    blockers.current.length = 0
    for (const box of current) blockers.current.push(box)

    /**
     * Everything the level said this frame, turned into a line.
     *
     * Only the effects a *person* would want to see. `spawned` and `died` are
     * bookkeeping - a level that announced every piece of debris would drown
     * the one message that mattered.
     */
    const lines: string[] = []
    for (const effect of effects) {
      if (effect.kind === 'score') {
        lines.push(`+${effect.amount}`)
        // Summed here rather than in the mode system, because this is where the
        // frame's effects are and a second pass over them would be a second
        // place that has to agree about what a score is.
        tally.current += effect.amount
      } else if (effect.kind === 'emit') lines.push(effect.event)
      else if (effect.kind === 'sound') {
        /*
          Played and not said. Every other effect in this loop either scores or
          puts a line in the ticker; a sound *is* the feedback, and printing
          "hit" beside it would be describing a noise the player just heard.
        */
        playXpSound(effect.sound)
      }
      else if (effect.kind === 'movie') {
        /**
         * A cut, handed up rather than played here.
         *
         * The same shape `onProgress` has, and for the same reason: this
         * component owns the entity world, and a film is drawn *over* one - it
         * has its own scene, its own camera and its own clock, none of which
         * belong to a simulation. `./cutscene` is where it lives and ../scene is
         * what mounts it.
         *
         * Not said in the ticker either. A cut is not a message about the level,
         * it *is* what the player is now looking at, and a line saying so would
         * be describing a film to somebody watching it.
         */
        onMovie?.(effect.sequence)
      }
      else if (effect.kind === 'roll') {
        /**
         * A dice, asked of whatever authority this host has.
         *
         * The arbiter first, because docs/xp/server-authority.md §4 is about
         * exactly this: a number every client can reproduce is a number every
         * client can re-roll until it likes the answer. `xp_arbitrate` decides
         * it with `random()` on the server, records it, and hands it back — so
         * the face is a fact by the time anybody has seen it.
         *
         * Without one it is this tab's own `Math.random`, which is honest for
         * somebody playing alone and dishonest between four people at a table.
         * That is what `needs: arbiter` is for, and a document that cannot
         * tolerate the fallback says so and is refused at the door instead.
         *
         * Written into `data` when it lands rather than awaited: the frame loop
         * cannot wait for a round trip, and a rule reading the field sees the
         * old value until the new one arrives. Which is the honest shape of a
         * dice you have asked for and not yet been given — and the reason the
         * verb does not write a zero in the meantime.
         */
        const { key, sides } = effect
        const land = (face: number) => {
          if (!data) return
          data.current.set(key, face)
          lines.push(`rolled ${face}`)
          /**
           * Said here as well as from the poll, because a second is a long time
           * to wait to see your own dice.
           *
           * The colour is this client's own, so the banner names the right side
           * immediately, and the counter is local and monotonic - which is all a
           * banner needs to tell one throw from the next. The poll announces
           * everybody else's the same way a second later.
           */
          setSaid((was) => ({ seat: seatNow.current ?? null, face, at: (was?.at ?? 0) + 1 }))
        }

        if (arbiter) {
          void arbiter
            // The key goes with it, so the arbiter can record *which* number
            // this was - it hands the roll to every client on the view, and a
            // face with no field name is a number nobody else can place.
            .ask<{ face?: number }>('roll', { sides, key })
            .then((verdict) => {
              if (verdict.ok && typeof verdict.outcome?.face === 'number') {
                land(verdict.outcome.face)
                return
              }
              // A refusal is said rather than swallowed: "it is not your turn"
              // is the whole game, and a dice that silently did nothing is
              // indistinguishable from one that is broken.
              if (!verdict.ok) lines.push(verdict.message)
            })
            .catch(() => {
              lines.push('the dice did not reach the table')
            })
        } else {
          land(1 + Math.floor(Math.random() * sides))
        }
      }
      else if (effect.kind === 'sit') {
        /**
         * A chair, asked for rather than taken.
         *
         * The same shape as the roll above and for a sharper version of the same
         * reason: *is blue free* is a question two clients can both answer yes
         * to in the same moment, and only one of them can be right. So nothing
         * is written here until the table says so - a client that seated itself
         * optimistically would put two people on one colour for the second it
         * took to be told otherwise, which is exactly the bug this whole
         * mechanism exists to stop.
         *
         * Without an arbiter it is granted, which is honest: somebody playing
         * alone is the only person who could be sitting there. A document that
         * cannot tolerate that says `needs: arbiter` and is refused at the door.
         *
         * A refusal is said out loud. "Somebody is already sitting there" is the
         * whole answer, and a button that silently did nothing is
         * indistinguishable from one that is broken.
         */
        const wanted = effect.team
        if (arbiter) {
          void arbiter
            .ask('sit', { seat: wanted })
            .then((verdict) => {
              if (verdict.ok) {
                setSeat(wanted)
                lines.push(`you are ${wanted}`)
                return
              }
              lines.push(verdict.message)
            })
            .catch(() => {
              lines.push('the table did not hear you')
            })
        } else {
          setSeat(wanted)
          lines.push(`you are ${wanted}`)
        }
      }
      else if (effect.kind === 'pass') {
        /**
         * The turn moves on — and the first one seats the table.
         *
         * A level that says `pass` is a level that means turns, so the arbiter
         * starts them on the first one rather than answering *nobody is taking
         * turns* forever, which is what it did to `mensch` for as long as that
         * level has existed. Nothing here decides who is next: the order is the
         * server's, taken from who has joined.
         *
         * Where the turn went is taken off the verdict rather than waited for.
         * The poll is once a second, and a board game where your own move takes
         * a second to leave your name is a board game that feels broken. Every
         * other client learns it from the view on its next read, which is the
         * same shape the vote has.
         *
         * The refusal is said, because both are things a player needs: *it is
         * not your turn to pass* means somebody pressed the wrong thing, and
         * *you are not in this match* means the join has not landed yet.
         */
        if (arbiter) {
          void arbiter
            .ask<{ turn?: { at?: string } | null }>('pass')
            .then((verdict) => {
              if (verdict.ok) setTurn(verdict.outcome?.turn?.at ?? null)
              else lines.push(verdict.message)
            })
            .catch(() => {
              lines.push('that did not reach the table')
            })
        }
      }
      else if (effect.kind === 'meet') {
        /**
         * A meeting, asked of the arbiter and shown by the panel that exists.
         *
         * Nothing is drawn from here: `onVote` already carries the open vote out
         * to the HUD every second, so the meeting appears the same way whether
         * this client called it or somebody across the room did. That is the
         * property worth having — the person who pressed the button sees exactly
         * what everybody else sees.
         *
         * The refusal is said, because every one the arbiter can give is a
         * sentence a player needs: a vote is already open, you are out of this
         * match, you are not in it.
         */
        if (!arbiter) {
          lines.push('nobody here can hold a meeting')
        } else {
          void arbiter
            .ask('vote_open', effect.seconds === undefined ? {} : { seconds: effect.seconds })
            .then((verdict) => {
              if (!verdict.ok) lines.push(verdict.message)
            })
            .catch(() => {
              lines.push('the meeting did not reach the room')
            })
        }
      }
      else if (effect.kind === 'raid') {
        /**
         * Something taken out of somebody else's save, and said out loud.
         *
         * The whole of docs/xp/server-authority.md §4.3 arriving in a level: two
         * saves move together or neither does, the person it came from is
         * usually not here, and *who* it was is the arbiter's answer rather than
         * anything this client chose — so the only work here is turning an id
         * into a name and a refusal into a sentence.
         *
         * The name comes from the roster, like every other name in this file. An
         * id we have never seen is somebody who is not in the room, which is the
         * ordinary case rather than an error: their world was raided while they
         * were not in it, which is the property the whole entry exists for. They
         * are "somebody" until they come back.
         *
         * `visit` is optional on the port for a reason worth keeping visible: a
         * host can arbitrate a match and have no worlds at all, so this says so
         * rather than failing quietly.
         */
        if (!arbiter?.visit) {
          lines.push('there is nowhere to take anything from here')
        } else {
          void arbiter
            .visit<{ took?: number; key?: string; from?: string; mine?: number }>()
            .then((verdict) => {
              if (!verdict.ok) {
                lines.push(verdict.message)
                return
              }
              const { key, mine, took, from } = verdict.outcome ?? {}
              /**
               * Our own copy of the field, set to what the server says it now
               * is - the same shape `roll` uses, and for a sharper reason.
               *
               * The store is last-write-wins per row and this client is holding
               * the value from before the raid, so a level that wrote it again
               * without this would hand back the number it had *before* taking
               * anything, and the plant would come back an hour later.
               */
              if (key && typeof mine === 'number' && data) data.current.set(key, mine)
              const who = roster.find((peer) => peer.id === from)?.name ?? 'somebody'
              lines.push(`took ${took ?? 1} from ${who}`)
            })
            .catch(() => {
              lines.push('that did not reach anybody')
            })
        }
      }
      else if (effect.kind === 'load') {
        /**
         * A door to another level, handed straight out.
         *
         * Nothing about the swap happens here, and that is the same reasoning
         * `load` itself is built on: the entity world is the thing about to be
         * discarded, so half-applying a level change is a state nobody can
         * observe and everybody has to reason about. The scene owns the
         * document, so the scene decides - including whether to ask first,
         * which is a question about *trust* and is answered by `resolveScene`
         * rather than re-derived at a fetch.
         *
         * Which of the two kinds of door it was is passed on rather than
         * worked out, because only the verb knows: `cellar` is a room here or
         * somebody else's file depending on what the author wrote, and a name
         * alone cannot say which.
         */
        if ('scene' in effect) onLoad?.(effect.scene, 'scene')
        else onLoad?.(effect.xp, 'either')
      }
      else if (effect.kind === 'checkpoint' && effect.id === PLAYER_ID) {
        const at = { x: effect.x, y: effect.y, z: effect.z, facing: effect.facing }
        setReturnTo(at)
        // Past this session too, when the level is one that resumes. Fired here
        // rather than from a watcher on `returnTo`, because this is the event -
        // a re-render that happens to see a new position is not.
        onProgress?.({ at, ...(effect.order === undefined ? {} : { order: effect.order }) })
        // Said out loud, because a save point you cannot tell you took is a save
        // point you do not trust - and the whole value of one is the confidence
        // to try the jump again.
        lines.push(`checkpoint ${effect.order}`)
      } else if (effect.kind === 'teleport' && effect.id === PLAYER_ID) {
        /**
         * The one effect the engine cannot carry out itself.
         *
         * `applyVerb` has already written the position into the entity world,
         * and for every other entity that is the end of it. Not for the player:
         * `movePlayer` overwrites it from the controller a few lines above,
         * every frame, so the write is gone before anything reads it. The
         * controller is the only writer that counts, and `sendTo` is its door.
         *
         * A counter rather than the coordinates as state, so walking onto the
         * same pad twice moves you twice. Feet, straight through - `Player`
         * adds `EYE_HEIGHT` itself, which is the one conversion in this file
         * that has a single home.
         */
        setSendTo((previous) => ({
          x: effect.x,
          y: effect.y,
          z: effect.z,
          facing: effect.facing,
          at: (previous?.at ?? 0) + 1,
        }))
      } else if (effect.kind === 'stunned' && effect.id === PLAYER_ID) {
        /**
         * The other effect the engine cannot carry out itself.
         *
         * `applyVerb` wrote nothing for this one, on purpose: there is nowhere
         * in the entity world to say "this one cannot move", because the thing
         * that decides where a player is lives out here. So this is the whole
         * of it - the controller stops listening, and a deadline lifts it.
         *
         * Not on top of a death. Being dead already holds you down and has its
         * own way back up, and a stun landing on the same frame would either
         * unfreeze a corpse when it wore off or outlive the respawn - both of
         * which are "the game let go of me at the wrong moment", which is the
         * one thing a freeze must never feel like.
         *
         * The longest wins rather than the newest: two hits inside a second are
         * two stuns, and the second one ending must not stand you up while the
         * first still has time on it.
         */
        if (dying.current === null && !isOut.current) {
          const until = elapsed.current + effect.seconds
          if (stunned.current === null || until > stunned.current) stunned.current = until
          frozen.current = true
          // Said out loud, because a second of not moving with nothing on
          // screen is a second of thinking the game has hung.
          lines.push('stunned')
        }
      } else if (effect.kind === 'dashed') {
        /**
         * The third of them, and the second half of `stunned`'s reason.
         *
         * `applyVerb` wrote nothing here either, and for a sharper version of
         * the same reason: there is no *direction* in the entity world to
         * write. Which way a body points is a component; which way somebody is
         * going is a camera and a stick, and only the controller has those.
         *
         * A dash while frozen or dead is dropped rather than queued. A stun is
         * "you do not move", and a shove that landed on the same frame and
         * moved you anyway would be the level contradicting itself in the one
         * place it must not.
         */
        if (effect.id === PLAYER_ID) {
          if (dying.current === null && !isOut.current && !frozen.current) {
            setShove((previous) => ({ cells: effect.cells, at: (previous?.at ?? 0) + 1 }))
            /**
             * And it is a *charge* for as long as it is travelling.
             *
             * Armed here rather than where the key is read, because this is the
             * branch that already decided the dash is actually happening - a
             * dash refused for being stunned or dead must not hurt anybody on
             * the way to not moving.
             */
            startDash(dash, elapsed.current, DASH_SECONDS)
          }
        } else {
          /**
           * Anything else dashes along its own facing, straight away.
           *
           * No controller to hand it to and no journey to interrupt - a crate
           * has nothing that could stop it partway, because the solids test is
           * the character controller's and nothing else in this level walks.
           * So the honest thing is the arithmetic, done here rather than in the
           * verb only because the verb reports for whoever was named and this
           * is the one host that can tell a player from a crate.
           */
          const at = live.position.get(effect.id)
          if (at) {
            const facing = ((live.rotation.get(effect.id) ?? 0) * Math.PI) / 180
            live.position.set(effect.id, {
              x: at.x + Math.sin(facing) * effect.cells,
              y: at.y,
              z: at.z + Math.cos(facing) * effect.cells,
            })
            live.box.delete(effect.id)
          }
        }
      } else if (effect.kind === 'swung' && effect.id === PLAYER_ID) {
        /**
         * A punch, which is the one attack that needs no gun.
         *
         * Here rather than in the verb for `dashed`'s reason and a sharper one:
         * what is in front of a body includes other **players**, and a player
         * is not an entity in this world at all - they are an interpolated
         * sample in the crowd buffer, drawn from the same boxes a shot is
         * tested against. `@kxb/xp/engine` decided that a swing happened; this
         * is the only code in the product that can say what it met.
         *
         * Not while dead, out, or frozen - the same three the dash refuses on,
         * and for the same reason: a stun means you do not act, and a fist that
         * still landed would be the level contradicting itself.
         *
         * **Deliberately no side check**, unlike the dash next door. A dash is
         * a shoulder somebody ran into and reading a sideless level as a
         * free-for-all would make a brawl out of a kickabout; a swing is an
         * attack, aimed, on a key the document bound for it - so it lands on
         * whoever is in front of you, exactly as a shot does. Levels that do
         * not want a room hitting each other do not bind the key.
         */
        if (dying.current === null && !isOut.current && !frozen.current) {
          // The same body animation the `attack` binding plays, so a document
          // that named its key something else still swings an arm.
          swingRef.current = SWING
          camera.getWorldDirection(aim.current)
          const landed = swungAt(
            playerAt.current,
            { x: aim.current.x, y: aim.current.y, z: aim.current.z },
            {
              isSolid: solids.isSolid,
              targets: targetsOf(live),
              reach: effect.reach,
              // Yourself and your own gun, like a shot. What you are *carrying*
              // needs no entry: the verb refuses a swing with your hands full.
              ignore: UNSHOOTABLE,
              ...(bodies.current ? { people: bodies.current.targets(performance.now()) } : {}),
            },
          )
          /**
           * Somebody else, which this client may not decide the outcome of.
           *
           * Nothing local happens: their health is not ours to change. The
           * claim goes to the arbiter and the verdict is what counts, exactly
           * as a shot's does - and it is charged at the same one number per
           * room, which is why the swing's cost is on the body and told to the
           * arbiter at join. See docs/xp/server-authority.md.
           */
          if (landed?.who) claim(landed.who)
          else if (landed?.id !== null && landed !== null) {
            /**
             * A crate, and `damage` rather than the verb: it changes the health
             * and *then* fires the `damaged` triggers, which is the order that
             * makes a rule asking `hp <= 0` about the hit that just landed.
             *
             * Pushed onto the list being walked, which is safe and deliberate:
             * a `for...of` over an array sees what is appended to it, so a
             * crate that stuns whoever broke it is handled this frame rather
             * than swallowed.
             */
            const own = live.props.get(PLAYER_ID)?.damage
            effects.push(
              ...damage(live, blueprints, landed.id, own ?? DEFAULT_SWING_DAMAGE, PLAYER_ID, clockNow()),
            )
          }
        }
      }
    }

    /**
     * What has been hit, for the bars over things.
     *
     * Computed here rather than on the frames damage happens, because damage
     * arrives from three places — a shot, a rule, and a peer's picture over the
     * wire — and a list that only noticed two of them would show a bar that was
     * right on one screen and stale on another. This walk is the same order of
     * cost as the trigger pass a few lines up, which already visits every living
     * entity every frame.
     *
     * `setHurt` only when it actually differs: the list changes about once a
     * hit, and setting state every frame would re-render the scene sixty times a
     * second to draw the same two bars.
     */
    const nextDamage = hurtIn(live, blueprints)
    if (isNews(nextDamage, drawnDamage, sameHurt)) setDamaged(nextDamage)

    /**
     * And the flinch, from the same fact and on the same frame.
     *
     * Beside the bars deliberately: both are "what has just been hit", both are
     * answered by looking at the health rather than by watching the shots, and
     * both therefore fire for damage from all three sources - a shot, a rule,
     * and a peer's picture over the wire. See ./shake.
     *
     * A ref rather than state, unlike the bars: the *list* of bars changes about
     * once a hit and React draws it, where this is read by the instancer sixty
     * times a second and would be a re-render of the whole scene per frame.
     */
    for (const id of struckIn(live, seenHp.current)) shaking.current.set(id, SHAKE_SECONDS)
    for (const [id, was] of shaking.current) {
      const left = was - delta
      if (left > 0) shaking.current.set(id, left)
      else shaking.current.delete(id)
    }
    /**
     * And the handover gaps, on the same clock and for the same reason.
     *
     * Simulated seconds rather than `performance.now()` milliseconds, which is
     * the trap this runtime has fallen into before: `Balls` buffers on the wall
     * clock because it is timing *packets*, and everything here is timing the
     * world. Both are `number`, so mixing them compiles and only shows up in a
     * match.
     */
    smoothing.current.fade(delta)
    // A script's own `log`, which is the other half of the same channel and the
    // only way an author sees anything they printed.
    if (scripts) lines.push(...fresh(scripts.logs, heard))
    /**
     * The round, moved on.
     *
     * ---------------------------------------------------------------------------
     * Here, and not in an effect
     * ---------------------------------------------------------------------------
     * A transition reads three things that only exist inside a frame: the
     * level's data as the rules just left it, the events those rules emitted
     * *this* frame, and how long the phase has been running. An effect would see
     * a tick-old copy of the first and none of the second.
     *
     * It runs after the rules rather than before them, so a phase that ends
     * because of something a rule did ends on the same frame it happened - the
     * alternative is one frame of a level in a state its own document says it
     * has left.
     *
     * ---------------------------------------------------------------------------
     * One step per frame, deliberately
     * ---------------------------------------------------------------------------
     * A phase entered here is not asked for its own transitions until next
     * frame, even when it has a `when` that already holds. That bounds the work
     * at one change per frame and, more importantly, makes a cycle harmless: a
     * document whose phases point at each other spins at 60Hz instead of hanging
     * the tab, which is a bug somebody can see rather than a browser somebody
     * has to kill.
     */
    if (flow) {
      const enter = (name: string) => {
        phase.current = name
        phaseAge.current = 0
        setPhaseName(name)
        const does = flow?.phases[name]?.does
        if (does?.length) {
          effects.push(
            ...applyVerbs(live, blueprints, does, {
              // A phase is nobody's rule: there is no entity it is *on* and
              // nobody set it off. `self` is the player because that is the one
              // subject a phase verb can sensibly mean - "put everybody at their
              // spawn" is about them - and `other` is null, so a phase's verbs
              // cannot reach for a presser that does not exist.
              self: PLAYER_ID,
              other: null,
              ...clockNow(),
            }),
          )
        }
      }

      /**
       * The opening phase's `does` runs once, on the first frame.
       *
       * Not at build time: `does` is a verb list, verbs produce effects, and the
       * effects of a frame are drained here. Running it during `build` would put
       * a sound and an `emit` somewhere nothing is listening.
       */
      /**
       * Won, and therefore over - checked before the phases are stepped.
       *
       * Before rather than after, which is the one ordering decision here: the
       * step below runs the *next* phase's `does`, and a run whose ending
       * condition already holds should not first walk into another phase and
       * teleport everybody somewhere. The condition is about the state the last
       * frame's rules left, which is the same state a step's `when` reads.
       *
       * Latched, because `wins` goes on holding: `>= 4` is still true on the
       * frame after it became true, and an unlatched check would fire `finished`
       * on every entity sixty times a second. The same shape as the pick-up /
       * put-down pair the triggers already needed a latch for.
       */
      /**
       * The run, over - however it got there.
       *
       * One closure because there are three ways now and they must be the same
       * ending: `wins` holding, a step arriving at `RUN_OVER`, and the last
       * round being counted. Three copies of the latch and the fan-out is three
       * chances for a run to end in a way the HUD or the document only half
       * hears about.
       */
      const finish = () => {
        if (winner.current) return
        winner.current = true
        setWonRun(true)
        // The same counter the whistle uses, so a level's own ending reaches the
        // document through the `finished` fan-out below rather than through a
        // second door nothing is listening at.
        ended.current += 1
        // And the same flag a preset's full time sets, so `R` offers a rematch
        // for a run the *document* ended exactly as it does for one a mode did.
        setOver(true)
      }

      if (!winner.current && flow.wins && holds(live, PLAYER_ID, flow.wins, null, data?.current)) {
        finish()
      }

      // A machine that kept moving after its own ending would be drawing phases
      // nobody is playing, so a won run steps no further.
      if (!winner.current && !opened.current) {
        opened.current = true
        enter(flow.start)
      } else if (!winner.current) {
        phaseAge.current += delta
        const here = phase.current ? flow.phases[phase.current] : undefined

        const left = phaseCountdown(here, phaseAge.current)
        if (isNews(left, shownLeft)) setPhaseLeft(left)

        const step = stepFrom(here, {
          age: phaseAge.current,
          said: lines,
          holds: (condition) => holds(live, PLAYER_ID, condition, null, data?.current),
        })
        if (step?.go === RUN_OVER) {
          finish()
        } else if (step?.go === ROUND_AGAIN) {
          /**
           * The seam between two rounds, which is not a phase and is why it is
           * a word instead: nothing happens *in* it. Either the count moves and
           * the round opens again where the first one did, or that was the last
           * one and the run is over.
           *
           * `rounds` is guaranteed by the parser to be there when a step says
           * this - `flowProblems` refuses the seam without a count - so the
           * fallback is a formality rather than a behaviour anybody meets.
           */
          const rounds = flow.rounds ?? 1
          if (flowRoundNow.current < rounds) {
            flowRoundNow.current += 1
            setFlowRound(flowRoundNow.current)
            enter(flow.start)
          } else {
            finish()
          }
        } else if (step) {
          enter(step.go)
        }
      }
    }

    if (lines.length > 0) {
      say(ticker, onSay, ...lines)
    }

    /**
     * The whistle, told to the level rather than only to the HUD.
     *
     * Fired here rather than inside ./matching because this is the file that
     * owns the entity world, and a mode system reaching into it would be a
     * second writer. Every live entity that asked gets it once - `fire` is the
     * same door `spawned` comes through, and a gate that opens at full time is
     * `on: 'finished'` and a `deactivate`, with no code anywhere knowing what a
     * gate is.
     *
     * After the trigger pass rather than before, for the same reason death is:
     * the whistle is a conclusion about the frame, so whatever was picked up or
     * broken in it resolves first.
     */
    /**
     * A role arrived, so say so once — and say it where the effects are kept.
     *
     * The value is a **property on the player named after itself**: dealt `bug`
     * means `props.bug = 1`, so a document acts on a secret with the vocabulary
     * it already has. `{ prop: 'bug', is: '==', value: 0 }` is "everybody who is
     * not the bug", and it is true before the deal as well as after it, which is
     * the safe direction for a rule that takes a weapon away.
     *
     * Then `dealt` fires on everything that asks, once, the same fan-out
     * `finished` does below.
     */
    const role = pendingRole.current
    if (role && dealtTo.current !== role) {
      dealtTo.current = role
      const own = live.props.get(PLAYER_ID)
      if (own) own[role] = 1
      for (const id of [...live.alive]) {
        effects.push(...fire(live, blueprints, id, 'dealt', PLAYER_ID, clockNow()))
      }
    }

    if (isNews(ended.current, told)) {
      for (const id of [...live.alive]) {
        effects.push(...fire(live, blueprints, id, 'finished', null, clockNow()))
      }
    }

    /**
     * Out of health, stunned, or on the way back — one step of all three.
     *
     * After the trigger pass rather than inside it, because dying is a
     * *conclusion* about the frame rather than one more effect in it: the
     * spikes, the saw and whatever else touched you all resolve first, and then
     * we ask what the total came to. Deciding mid-pass would let the order of
     * two hazards change whether you survived them.
     *
     * The machine itself is `stepDowned`, which is where the orderings are
     * argued - a stun checked before death, a stun that dies with the body, and
     * why the instant path has to unfreeze as well.
     *
     * `revivePlayer` is called here rather than in there because it writes the
     * entity world, and the counter tells the controller - which owns the
     * position and would otherwise overwrite anything written here before the
     * next paint.
     */
    {
      const step = stepDowned({
        stunned: stunned.current,
        dying: dying.current,
        dead: isDead(live, PLAYER_ID),
        out: isOut.current,
        elapsed: elapsed.current,
        delta,
        respawn: rulesOf(xp).respawn ?? 0,
      })

      stunned.current = step.stunned
      dying.current = step.dying
      if (step.frozen !== undefined) frozen.current = step.frozen

      if (step.announce) {
        say(ticker, onSay, 'back to the start')
      }

      if (step.downFor !== undefined && step.downFor !== downFor) {
        setDownFor(step.downFor)
        onDown?.(step.downFor)
      }

      if (step.revive) {
        revivePlayer(live, xp, arrival, facts())
        revives.current += 1
        setReviveAt(revives.current)
        standUp()
      }
    }

    /**
     * The player's own numbers, when they have any.
     *
     * Compared as a string and reported only on a change, because this is React
     * state feeding a readout: a `setState` every frame would re-render the HUD
     * sixty times a second to show the same two numbers.
     */
    const own = live.props.get(PLAYER_ID)
    const key = `${own?.hp ?? ''}/${own?.ammo ?? ''}`
    if (isNews(key, vitals)) onVitals({ hp: own?.hp, ammo: own?.ammo })

    /**
     * Whether the gun is still in the hand, for the body that draws it.
     *
     * The instanced weapon needs nothing: a `disarm` takes it out of `alive`
     * and the draw list is built from `alive`, so in first person it is simply
     * gone. The *third* person one is drawn on a hand bone from the document's
     * `player.weapon`, which no verb can reach - so this is the one place the
     * two views have to be told the same thing twice.
     *
     * Compared before setting, so this is a re-render when somebody is disarmed
     * rather than sixty a second saying the gun is still there.
     */
    const holding = live.alive.has(WEAPON_ID)
    if (holding !== hasGun.current) {
      hasGun.current = holding
      setArmed(holding)
    }

    /**
     * Whatever a peer is carrying, moved to where that peer is.
     *
     * Every frame rather than on the packet, because a peer's position is
     * interpolated and moves between packets - a flag written once when the
     * carry arrived would sit where they were standing at that moment and never
     * catch up.
     *
     * Lifted to roughly a hand: the crowd buffer holds *feet*, which is what
     * the wire carries, and a flag at ankle height reads as one lying on the
     * floor - which is exactly the thing this feature exists to stop showing.
     */
    /*
      `live.heldBy` rather than a map of this component's own, because the fact
      belongs to the world: a rule asking "am I held" has to get the same answer
      here as on the screen of the person holding it, and two copies is two
      answers. See `EntityWorld.heldBy`.
    */
    if (live.heldBy.size > 0 && bodies.current) {
      const crowd = bodies.current
      const clock = performance.now()
      carryHeld({
        held: live.heldBy,
        alive: live.alive,
        sampleOf: (peer) => crowd.at(peer, clock),
        place: (id, at, facing) => {
          live.position.set(id, at)
          live.rotation.set(id, facing)
        },
        lift: CARRY_HEIGHT,
      })
    }

    /**
     * And what this client has made true, when it has changed.
     *
     * Compared rather than sent, because the picture is the same on almost
     * every frame of almost every level: a room where nothing is switched off
     * and nobody is holding anything never sends a packet at all. The compare
     * is two short sorted arrays, which is cheaper than the allocation it
     * avoids downstream.
     */
    const picture = shareOf(live, PLAYER_ID, blueprints)
    if (!sameShare(picture, lastShared.current)) {
      lastShared.current = picture
      setShare((previous) => ({ value: picture, at: (previous?.at ?? 0) + 1 }))
    }

    /**
     * And which of those is in this player's own hand, for the body drawing it.
     *
     * Off `picture` rather than a second walk of `world.parent`: the share is
     * already exactly "the children of `PLAYER_ID`", already sorted, and
     * already computed on this frame. The weapon is dropped because it is drawn
     * by the other mechanism entirely, and the lowest id of what is left is the
     * same tie-break `armedWith` uses - so the thing being *drawn* in the hand
     * and the thing being *fired* out of it are the same entity on every
     * machine.
     *
     * Keyed by id **and** blueprint before comparing, so a pickup swapped for a
     * different one in the same frame is news. The compare is what keeps this
     * from being a `setState` sixty times a second saying the hand is still
     * empty.
     */
    const carried = picture.hold.find((id) => id !== WEAPON_ID && live.alive.has(id)) ?? null
    const shape = carried === null ? '' : `${carried}:${live.blueprint.get(carried) ?? ''}`
    if (shape !== inHand.current) {
      inHand.current = shape
      setPickedUp(
        carried === null ? null : { id: carried, blueprint: live.blueprint.get(carried) ?? '' },
      )
    }

    /**
     * What is left of every waiting key, for the buttons drawing them.
     *
     * Last in the frame rather than beside the clock at the top, so a dash that
     * fired in *this* frame's effect pass is already in the number - a ring that
     * started a frame late would be visible as a flicker on the one press
     * somebody is looking straight at.
     *
     * A write into a plain object rather than a `setState`: this changes on every
     * frame of the three seconds, and the HUD reads it in its own animation frame
     * and moves an arc. See ./cooling for why the reader is never the writer.
     */
    for (const [does, wait] of waits) {
      cooling.current.of.set(does, coolingFraction(readyAt.current.get(does) ?? 0, elapsed.current, wait))
    }

    if (scripts && fresh(scripts.failures, shown).length > 0) {
      onBroken(
        scripts.failures.map(
          (failure) => `${failure.script}.${failure.hook}: ${failure.message}`,
        ),
      )
    }
  })

  return (
    <>
      <Suspense fallback={null}>
        {/* The body is drawn in third person and not in first, where the camera
            is inside its head. It exists either way - hiding it is a view, not a
            despawn. */}
        <LiveEntities
          world={world}
          blueprints={blueprints}
          {...(xp.clips ? { carried: xp.clips } : {})}
          /**
           * The player's body is never drawn by the instancer any more.
           *
           * In first person because the camera is inside its head, as before -
           * and in third because it is drawn *skinned* instead, a few lines
           * below. An instanced mesh shares one geometry between instances and a
           * skinned pose is a different geometry per body, so the two cannot be
           * the same draw. Leaving both on would put an unanimated dummy inside
           * an animated one.
           */
          /**
           * Hidden whenever the skinned body is drawn instead, and in first
           * person where the camera is inside its head.
           *
           * A side-on level is *always* the first case however `view` is set:
           * the camera stands off to one side, so you are looking at your own
           * body whether or not you toggled third person. Keying this on `view`
           * alone drew nobody at all in `sidestep` - the instanced body hidden
           * as if the camera were inside it, and the skinned one not mounted
           * because the view still said "first".
           */
          hide={hidden}
          /**
           * What has just been hit, so it can flinch. See ./shake.
           *
           * A ref rather than a prop full of numbers: it is written on the frame
           * something is hit and read on every frame after, and as state it
           * would be a re-render of the whole scene per hit.
           */
          shaking={shaking}
          /**
           * And how far behind itself a body handed over is still being drawn.
           *
           * A ref for the same reason, read on the same frames, and living on the
           * same side of the same line: the entity is exactly where the world says
           * it is and this is only what the mesh is told instead.
           */
          smoothing={smoothing}
        />
      </Suspense>

      {/* Outside the Suspense boundary the entities are in: a tracer is a box
          and a colour with no model to load, and making the one thing that
          says "the gun went off" wait on the level's geometry would be exactly
          backwards. */}
      <Tracers shots={shots} />

      {/*
        Your own side, under your own feet, and only in third person.

        In first the camera is inside the head and the ring would be a coloured
        band across the bottom of the screen. It is drawn even in a level nobody
        else is in, which is the point: it is what tells a player their colour
        before there is anybody to compare against - and the alternative,
        learning it from the scoreboard after the first goal, is learning it too
        late to have played differently.
      */}
      {side && shows ? <OwnRing at={playerAt} team={side} /> : null}

      {/*
        Your own body, with bones, in third person only.

        Sampled from the same ref the controller fills, converted to feet - the
        wire carries feet and so does every other body, and one convention is
        cheaper than two. Speed and footing are worked out inside `SkinnedBody`
        from successive samples, exactly as they are for everybody else: the
        controller does know the truth, but a second way of deriving the same
        thing is a second way for the local body to disagree with how it looks
        on somebody else's screen.
      */}
      {shows ? (
        <SkinnedBody
          {...(body.rig ? { rig: body.rig } : {})}
          {...(xp.clips ? { carried: xp.clips } : {})}
          url={body.url}
          scale={body.drawn}
          lift={body.lift}
          {...(handHeld ? { holding: handHeld } : {})}
          {...(body.pose ? { rest: body.pose } : {})}
          sample={() => ({
            x: playerAt.current.x,
            y: playerAt.current.y - EYE_HEIGHT,
            z: playerAt.current.z,
            facing: heading.current,
            /**
             * Asked once a frame rather than handed in as a prop.
             *
             * Being down is render state and the recoil is a countdown in a ref,
             * and a prop would have to read the second one during render - which
             * React's compiler refuses, and rightly: a render-time read of a
             * frame-time value is how the two come to disagree. A closure sees
             * both at the moment the frame asks.
             */
            /*
             * Dead beats hurt beats shooting.
             *
             * A body that fires and is hit in the same frame plays the hit: the
             * shot is a thing you did and the hit is a thing that happened to
             * you, and the second is the one the person holding the mouse
             * cannot otherwise see.
             */
            ...(() => {
              const motion = motionOf({
                down: downFor,
                hurt: hurtRef.current,
                recoil: recoilRef.current,
                swing: swingRef.current,
                dancing: dancingRef.current,
              })
              return motion ? { motion } : {}
            })(),
          })}
        >
          {/*
            Your own face, over your own head, and only in third person.

            In first the camera is inside that head, so the bubble would be a
            square of texture filling the screen - and the person who threw it
            is the one who least needs to be told what it was. `shows` gates the
            whole body for the same reason.
          */}
          <EmoteBubble state={ownFace} />
          {/*
            And your own light, which everybody else's body already had.

            The glow was drawn per *peer* and nowhere for the person who threw
            the switch: "when i turn on glow the player themself dont glow".
            From inside the room that reads as the button not working, because
            the one body you are certain to be looking at in third person is
            your own.

            Keyed by `me.id` like a peer's, so the hue is the same function of
            who you are on every screen - yours included. Inside the body's own
            group, so it goes where you go.
          */}
          {party?.on && me ? <PeerGlow id={me.id} host={party.host === me.id} /> : null}
        </SkinnedBody>
      ) : null}

      {/*
        How much is left of everybody else, over their heads.

        Mounted here rather than inside ./together because the numbers are the
        arbiter's and this is the component that holds the arbiter - `Together`
        owns presence and positions, and handing it a health map would make the
        socket component a party to a decision it has no part in. It reads the
        same crowd buffer a shot is tested against, which is what stops a bar
        drifting off the body it is about.
      */}
      <HealthBars crowd={bodies} bars={bars} top={body.head} />
      {/*
        And the same over anything in the level that has been hit. A sibling
        rather than a mode on the component above: that one is people, keyed by
        account and placed from the crowd buffer, and this is things, keyed by
        entity and placed from the world.
      */}
      <HurtBars hurt={damaged} world={world} blueprints={blueprints} />

      {/*
        The lamps the level put in itself.

        Here rather than in ./scene beside the sun, because a lamp is an
        *entity* and this is the component that owns the entity world — the
        scene's three lights are lighting, and these are things in the room.
        `playerAt` is the eye, so when a level has more lamps than the cap the
        ones that get drawn are the ones you are standing among.
      */}
      <Lights world={world} blueprints={blueprints} eye={playerAt} />

      {/*
        What signs in the room say, drawn near each one.

        Beside `Lights` for the same reason: both are facts about a place
        rather than about the player, and both are read off the entity world
        this component owns. `playerAt` is the eye here too, so only the signs
        somebody could plausibly be standing in front of are drawn.
      */}
      <Signs world={world} blueprints={blueprints} eye={playerAt} />

      {/*
        Other people, when this level is a room.

        Here rather than a level up because it needs where the local body ended
        up this frame, which is this component's own ref - and because a level
        that is not a room should not mount a socket at all.
      */}
      {/* Only while out, and only with somebody to watch. A level nobody can
          be eliminated from never mounts this at all. */}
      {out && watching ? <Spectating crowd={bodies} watching={watching} /> : null}

      {network && room && me ? (
        <Together
          network={network}
          me={me}
          room={room}
          scene={scene ?? MAIN_SCENE}
          at={playerAt}
          heading={heading}
          // The two animation facts the wire carries - see `Sample.dance`.
          dancing={dancingRef}
          down={down}
          model={body.model}
          {...(xp.clips ? { clips: xp.clips } : {})}
          scale={body.scale}
          marks={xp.world.marks}
          rules={rulesOf(xp)}
          {...(party ? { party } : {})}
          {...(onParty ? { onParty } : {})}
          /**
           * Who may be drawn, and which side is doing the looking.
           *
           * Both are empty in every level that hides nobody, and `Together`
           * short-circuits on that - so the ordinary room pays a single
           * `Object.keys` per render for a feature it does not use.
           */
          looks={looks}
          {...(side ? { side } : {})}
          onCount={onPeers}
          onRoster={(peers) => {
            setRoster(peers)
            onRoster?.(peers.map((peer) => peer.id))
          }}
          onCrowd={(theirs) => {
            bodies.current = theirs
          }}
          /**
           * The elected tier. `Together` decides who owns the bodies - it is
           * the component that knows the roster - and only calls this while
           * this client is the one. See `@kxb/xp/owning`.
           */
          bodiesNow={(resting) => {
            const live = world.current
            return live ? bodiesOf(live, blueprints, resting) : null
          }}
          onShoves={() => {
            const out = outgoingShoves.current
            if (out.length === 0) return out
            // Handed over and emptied in one go: a queue is drained by the
            // thing that owns it, and two owners of one array is how a kick
            // gets sent twice or not at all.
            outgoingShoves.current = []
            return out
          }}
          /**
           * Am I standing on something somebody else is simulating?
           *
           * The trigger for a claim, and it has to be asked separately rather
           * than read off this frame's contacts: a follower is handed
           * `EMPTY_SHOVERS` precisely so that it does not move an owned body, so
           * it produces no contact for its own shoulder and has nothing else to
           * notice with. `nearBody` is the overlap half of `shove` and nothing
           * more.
           *
           * Only while following - the owner has nothing to claim - and only for
           * the local body, because claiming on a *peer's* behalf is a claim they
           * would make themselves if they were on it.
           */
          wantsBodies={() => {
            const live = world.current
            if (!live || !following.current) return false
            const mine = shovers.current[0]
            return mine ? nearBody(live, blueprints, mine) !== null : false
          }}
          onBodies={(share, from) => {
            following.current = true
            /**
             * Only from whoever this client believes is the owner.
             *
             * `Together` holds that belief and passes the sender; the buffer
             * drops the rest. It matters because ownership follows the ball now:
             * for half a round trip after a claim the old owner is *still
             * sending*, and a buffer that took both would interpolate between
             * two machines' idea of one ball.
             */
            owned.current.remember(share, performance.now(), from, from)
          }}
          onOwns={(owns) => {
            /**
             * Handing them over, which used to be unreachable.
             *
             * The old election only ever gave ownership *away* when this client
             * left, so `false` never arrived while anybody was looking at
             * anything and this branch did not exist. Ownership follows the ball
             * now, so losing it is the ordinary case - somebody else got a foot
             * on it - and stopping the local integration immediately is what
             * keeps this client from spending the gap before the first packet
             * simulating a ball it no longer owns.
             *
             * The buffer is already empty: `adopt` cleared it on the way in.
             */
            if (!owns) {
              following.current = true
              /**
               * Where the ball is being drawn as we hand it over.
               *
               * Only remembered here; the frame loop settles it against the first
               * position the new owner actually puts it at, because that position
               * does not exist yet. Only bodies, or a capture is left pending for
               * every crate in the level and nothing ever answers it.
               */
              const parting = world.current
              if (parting) {
                for (const id of parting.alive) {
                  const name = parting.blueprint.get(id)
                  // The blueprint's own `body` rather than `bodyOf` from the
                  // engine: this file has a `bodyOf` of its own about a *player's*
                  // model, and two functions of that name in one scope is a
                  // reading trap for the sake of one property lookup.
                  if (!(name && blueprints[name]?.body)) continue
                  const at = parting.position.get(id)
                  if (at) smoothing.current.drawnAt(id, at)
                }
              }
              return
            }
            /**
             * Taking the bodies over, from the last thing the old owner said.
             *
             * `adopt` rather than `clear`, and the difference is a whole bug: a
             * follower's rows hold an interpolated position and **no velocity**,
             * because `place` deletes it on purpose. Clearing the buffer and
             * starting to integrate therefore dropped the ball where it was drawn
             * and rolled it from a standstill - which was survivable when a
             * handover happened once a match and is the ball stopping dead on
             * every touch now that ownership follows it.
             */
            following.current = false
            const live = world.current
            if (!live) {
              owned.current.clear()
              return
            }
            /**
             * And the leap that is otherwise visible on the toucher's own screen.
             *
             * This is the reported *"glitches like teleport"*, and both halves of
             * it are correct: the ball was being drawn a quarter of a second in
             * the past, and `adopt` is right to take the freshest sample there is.
             * Put together they are two and a half cells of travel crossed in one
             * frame, on every single touch, for whoever touched it.
             *
             * So the drawn position is captured *before* the adopt and handed to
             * `Smoothing` after it. Nothing about the authority changes - the ball
             * is this client's from this frame, and every trigger, goal, contact
             * and claim reads the real position - and the mesh spends a sixth of a
             * second catching up with itself. See `@kxb/xp/drawing`.
             *
             * Both loops walk `alive` rather than the buffer's own keys: `at`
             * answers null for a body nothing has been said about, and `placedAt`
             * answers nothing for a body with no capture pending, so the pairing
             * is exact without this reaching into `Balls` for a key list.
             */
            const ms = performance.now()
            for (const id of live.alive) {
              const drawn = owned.current.at(id, ms)
              if (drawn) smoothing.current.drawnAt(id, drawn)
            }
            owned.current.adopt(live)
            for (const id of live.alive) {
              const now = live.position.get(id)
              if (now) smoothing.current.placedAt(id, now)
            }
          }}
          onShove={(shove) => {
            const live = world.current
            // Straight through the same `push` a local kick takes, so the mass
            // and the speed cap are this client's own reading of its own
            // document rather than the sender's.
            if (live) applyShove(live, blueprints, shove)
          }}
          {...(emote ? { emote } : {})}
          {...(share ? { share } : {})}
          {...(signal ? { signal } : {})}
          {...(struck ? { hit: struck } : {})}
          /**
           * A peer says they hit us, so ask the arbiter what it was.
           *
           * Nothing is applied from the packet. The read is the same one the
           * second-long poll makes, and its answer lands where every answer
           * lands - `servedHp`, and then `damage()` on the next frame, which is
           * what fires the `damaged` rules. So being hit by another person and
           * being hit by a crate go through one path, and the only thing this
           * changes is how long it takes.
           *
           * Throttled here rather than in `Together`, because the floor is
           * about the arbiter and this is the component that holds it.
           */
          onHit={() => {
            const now = performance.now()
            if (now - readAt.current < HINT_FLOOR) return
            readAt.current = now
            readNow.current?.()
          }}
          /**
           * A peer's rule said something, queued for the next frame.
           *
           * Queued rather than dispatched, for the reason `onShared` writes
           * through `applyShare` instead of touching the world itself: this
           * component owns the entity world, and the socket handler runs
           * outside the frame that owns it.
           */
          onSignalled={(said) => {
            fromPeers.current.push(...said)
          }}
          /**
           * A peer's picture, applied to this client's own world.
           *
           * Here rather than inside ./together because this component owns the
           * entity world - the socket component knowing how to write into it
           * would be a second writer, which is the rule the trigger pass and
           * the tracer list already follow.
           */
          onShared={(from, theirs) => {
            const live = world.current
            if (!live) return

            /*
              `from` is handed over so the fact is *kept* rather than only
              acted on: `applyShare` writes `world.heldBy`, which is what the
              `held` state and its triggers read. Dropping what this peer no
              longer claims is its job too, for the same reason.
            */
            applyShare(live, theirs, PLAYER_ID, from)
          }}
        />
      ) : null}

      <Player
        spawn={arrival}
        {...(shot ? { camera: shot } : {})}
        {...(touch ? { touch } : {})}
        frozen={frozen}
        {...(filming ? { filming } : {})}
        isSolid={solids.isSolid}
        topOf={solids.topOf}
        blockers={blockers}
        {...(xp.player.keys ? { keys: xp.player.keys } : {})}
        onPress={(does) => pressed.current.push(does)}
        /*
          The other edge, from the only device that has one to give.

          Into the same buffer the keyboard's releases go into, so a piece put
          down with a thumb and a piece put down with a key are the same event
          by the time anything reads them - and the phase guard, the role guard
          and the order of the pass are written once rather than twice.
        */
        onRelease={(does) => letGo.current.push(does)}
        bounceOf={solids.bounceOf}
        {...(xp.player?.bounce === undefined ? {} : { bounce: xp.player.bounce })}
        /*
          The movement numbers, as numbers - `Player` is handed facts, not the
          document. Spread as one object so a level with none passes nothing
          and the controller's own defaults stand.
        */
        movement={{
          ...(xp.player.speed !== undefined ? { speed: xp.player.speed } : {}),
          ...(xp.player.sprint !== undefined ? { sprint: xp.player.sprint } : {}),
          ...(xp.player.jump !== undefined ? { jump: xp.player.jump } : {}),
          ...(xp.player.gravity !== undefined ? { gravity: xp.player.gravity } : {}),
          ...(xp.player.acceleration !== undefined
            ? { acceleration: xp.player.acceleration }
            : {}),
          ...(xp.player.drag !== undefined ? { drag: xp.player.drag } : {}),
        }}
        floorY={catchFloor}
        {...restart}
        onRestart={onRestart}
        reviveAt={reviveAt}
        {...(sendTo ? { sendTo } : {})}
        {...(shove ? { shove } : {})}
        {...(returnTo ? { returnTo } : {})}
        view={view}
        {...(xp.world.ground ? { ground: xp.world.floorY } : {})}
        onMove={onMove}
        track={(position, facing, teleported) => {
          playerAt.current = position
          heading.current = facing
          // Bumped in the same breath as the position it refers to, so anything
          // reading both sees them together whichever frame loop runs first.
          if (teleported) teleports.current += 1
        }}
      />

      {/*
        And the same gun in front of the lens, in first person only.

        The other half of `OWN_BODY_AND_GUN`: one thing held, hung off a hand
        bone when you can see the hand and off the camera when you cannot.

        **Below the controller on purpose**, which is the opposite of the trade
        the clock below makes. R3F runs frame callbacks in the order they were
        subscribed, so a view model mounted above `Player` would copy where the
        camera was *last* frame and swim behind it while somebody walked. The
        clock can afford to be a frame late; a thing drawn half a metre from the
        lens cannot.

        Its own Suspense boundary rather than the entities' - a view model that
        suspended inside theirs would blank the level while a pistol loaded, and
        one outside any boundary would blank the whole scene.
      */}
      {!shows && weapon && armed ? (
        <Suspense fallback={null}>
          <ViewModel held={weapon} recoil={recoilRef} />
        </Suspense>
      ) : null}

      {/*
        The clock, for a level that says it can be raced and has the marks to
        back it up.

        Both halves are checked rather than just the claim: `parseXp` refuses a
        document that declares `competition` without a start and a finish, but
        nothing stops a host handing this one that was never parsed, and a clock
        over a course with no finish is a clock that runs forever.

        Below the controller in the tree and reading a ref it fills, which costs
        a frame of staleness and buys the `Player` component staying something
        you can read on its own - the same trade the note at the top of this file
        makes about the trigger pass.
      */}
      {onRun && xp.capabilities.includes('competition') && raceReady(xp.world.marks) ? (
        <Racing
          /*
            Keyed on the round, and *named* as well as numbered.

            The clock below is keyed on the same round for the same reason, and
            a parkour document mounts both - so with the bare number the two
            were siblings sharing the key `0`, which React warns about and is
            right to: a duplicate key in one children list is a promise that
            either child may be dropped or duplicated on the next render, and
            the two things it would be doing that to here are the race clock
            and the whistle.
          */
          key={`race-${round}`}
          marks={xp.world.marks}
          at={playerAt}
          teleports={teleports}
          onRun={onRun}
          onFinish={() => {
            finishes.current += 1
          }}
        />
      ) : null}

      {/*
        The score and the whistle, when the document says it is playing a mode.

        Separate from the clock above rather than folded into it, because the two
        answer to different things: the race reads the *marks* and would time a
        course in a level that never declared a mode, and this reads the *rules*
        and would end a deathmatch in a room with no marks in it at all. A
        parkour document mounts both, and the finish is how they meet.
      */}
      {/* `rulesOf` rather than `xp.rules`, because a document that has never
          declared a mode does not carry the block at all - absent is `freestyle`
          and the helper is the only place that has to know it. */}
      {onMatch && isMatch(rulesOf(xp)) ? (
        <Matching
          // Keyed on the round, because a rematch is a *new* match and the
          // cheapest correct reset of a clock is a component that has never
          // run. Named as well as numbered, so it cannot collide with the race
          // clock above - see the note there.
          key={`match-${round}`}
          rules={rulesOf(xp)}
          tally={tally}
          finishes={finishes}
          sides={sides}
          onMatch={(next) => {
            setOver(next.phase === 'over')
            if (next.ending) ended.current = next.ends
            onMatch(next)
          }}
        />
      ) : null}
    </>
  )
}

