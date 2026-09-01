'use client'

import { Canvas } from '@react-three/fiber'
import { KeepContext, useSurface } from '@/app/world/_canvas/keep-context'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { VrMenuAim } from '@/app/world/lounge/_canvas/vr-menu'
import * as THREE from 'three'
import {
  BlockPicker,
} from '@/app/world/lounge/_hud/block-picker'
import {
  emoteAnchor,
  useIsTouch,
  useLookDrag,
  useMediaQuery,
} from '@/app/world/lounge/_hud/touch-controls'
import {
  useControlsPanel,
} from '@/app/world/_hud/hud'
import { useHand } from '@/lib/controls/use-hand'
import { attempt, useReportConnection } from '@/app/components/connection'
import { TelegramFullscreen } from '@/app/components/telegram-shell'
import { usePreloadedBlocks } from '@/app/world/lounge/_hooks/block-preload'
import {
  AdaptiveResolution,
  ADAPTIVE_DPR,
} from '@/app/world/_canvas/adaptive-resolution'
import { BlockInstances, Preview, Targeting } from '@/app/world/lounge/_canvas/building'
import {
  CombatHud,
  HostStalledBadge,
  KickoffCountdown,
} from '@/app/world/lounge/_hud/combat-hud'
import { FinishLine } from '@/app/world/lounge/_canvas/finish-line'
import { useCombat } from '@/app/world/lounge/_hooks/use-combat'
import { BodySwap } from '@/app/world/lounge/_hud/body-swap'
import { Hud, loungeControls } from '@/app/world/lounge/_hud/lounge-hud'
import { PlayerControls } from '@/app/world/lounge/_canvas/player-controls'
import { ImagePanel } from '@/app/world/lounge/_hud/image-panel'
import { ThingPanel } from '@/app/world/lounge/_hud/thing-panel'
import { ClipMenu } from '@/app/world/lounge/_hud/clip-menu'
import { StaminaBar } from '@/app/world/lounge/_hud/stamina-bar'
import { THING_DRAG, ThingiverseView } from '@/app/world/lounge/_hud/thingiverse-view'
import { nameForModel } from '@/domain/thingiverse/summon'
import { drivable } from '@/domain/thingiverse/vehicle'
import { DrivenVehicle, RideAlong } from '@/app/world/lounge/_canvas/vehicle-rig'
import type { DriveState, DriveTuning } from '@/app/world/lounge/_sim/drive'
import { TouchLayer } from '@/app/world/lounge/_hud/touch-layer'
import { useLoungeImages } from '@/app/world/lounge/_hooks/use-images'
import { useThings } from '@/app/world/lounge/_hooks/use-things'
/**
 * Loaded on demand, because almost nothing wants it.
 *
 * `@react-three/xr` is a couple of hundred kilobytes of session management,
 * controller layouts and gamepad plumbing, and exactly one room in the app sets
 * `vr`. A plain import would put all of it in front of every visitor to every
 * lounge, café and battlefield in the product to serve the one page that can use
 * it. `ssr: false` because there is no headset on a server to render for.
 */
const VrLayer = dynamic(
  () => import('@/app/world/lounge/_canvas/vr').then((module) => module.VrLayer),
  { ssr: false },
)

/**
 * The in-room chrome, loaded the same way and for the same reason.
 *
 * Split out rather than folded into `VrLayer`: that file is an *input device* -
 * sticks, pointing hand, origin - and this one is a surface you look at. They
 * share a session and nothing else, and merging them would put the palette in
 * the file that explains why it contains no physics.
 */
const VrMenu = dynamic(
  () => import('@/app/world/lounge/_canvas/vr-menu').then((module) => module.VrMenu),
  { ssr: false },
)

/**
 * The button, loaded the same way and for a second reason.
 *
 * `ssr: false` is not only about bundle size here: this asks `navigator.xr` a
 * question, and there is no navigator on a server. Rendering it there is what
 * took `/lobby` down with a 500 the first time round.
 */
const EnterVr = dynamic(
  () => import('@/app/world/lounge/_canvas/vr').then((module) => module.EnterVr),
  { ssr: false },
)
import {
  SceneRefsProvider,
  useCreateSceneRefs,
} from '@/app/world/lounge/_scene/scene-refs'
import {
  type BlockMap,
  type Cell,
  inWorld,
  NO_TARGET,
  standOn,
  type Target,
  toBlockMap,
  withBlock,
  withoutBlock,
} from '@/app/world/lounge/_scene/scene-types'
import { SelfAvatar } from '@/app/world/lounge/_canvas/self-avatar'
import { toggleCamera, toggleMic, useCamera, useMic } from '@/app/world/_stores/face-store'
import { usePushToTalk } from '@/app/world/_video/use-push-to-talk'
import { useVoiceMode } from '@/lib/controls/use-voice-mode'
import { Shutter } from '@/app/world/lounge/_canvas/shutter'
import { useSpawn } from '@/app/world/lounge/_hooks/use-spawn'
import { saveShot } from '@/app/world/lounge/_sim/save-shot'
import { type Companion, Companions } from '@/app/world/lounge/_canvas/companions'
import { PresenceSender, RemotePeeps } from '@/app/world/_presence/room-peers'
import type { Room } from '@/app/world/_presence/room-presence'
import {
} from '@/app/world/lounge/_sim/entry-view'
import { scoringGoals } from '@/app/world/lounge/_sim/football'
import { FootballBall, Goals } from '@/app/world/lounge/_canvas/football-scene'
import {
  BlockPlaceholders,
  Rainbow,
} from '@/app/world/_canvas/rainbow'
import { publishRainbow } from '@/app/world/_stores/rainbow-store'
import { useStaminaOverride } from '@/app/world/_stores/stamina-store'
import { SpawnMark } from '@/app/world/lounge/_canvas/spawn-mark'
import type { WorldSpawn } from '@/domain/worlds/queries'
import {
  DEFAULT_GOAL_HEIGHT,
  DEFAULT_GOAL_WIDTH,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_LINE_WIDTH,
  type Goal,
  type GoalKind,
  type GoalTeam,
} from '@/domain/lounge/goal-events'
import {
} from '@/app/world/lounge/_sim/combat'
import {
  battleTopic,
  loungeTopic,
  roomTopic,
  Multiplayer,
  type Peer,
  type PresenceStatus,
} from '@/app/world/lounge/_canvas/multiplayer'
import type { PlateTone } from '@/app/world/_canvas/nameplate'
import {
  EYE_HEIGHT,
} from '@/app/world/lounge/_sim/physics'
import {
  type SpawnSlot,
} from '@/app/world/lounge/_sim/spawn'
import { enterScene, leaveHere, publishHere } from '@/app/world/_stores/here-store'
import { clearStuck, publishStuck } from '@/lib/stuck-store'
import { useAudioGate } from '@/app/components/audio/use-audio'
import { useRosterChime } from '@/app/world/_presence/roster-chime'
import { publishParty } from '@/app/world/_stores/party-store'
import { play } from '@/lib/audio/engine'
import { EmotePicker } from '@/app/world/_hud/emote-picker'
import { isTyping } from '@/app/world/_sim/typing'
import {
  nothingSaid,
  showEmote,
  showSaid,
} from '@/app/world/_presence/presence-core'
import { LOCAL_SPEAKER, onSaid } from '@/app/world/_stores/said-store'
import type { EmoteId } from '@/domain/world/emotes'
import { useEditBuffer } from '@/app/world/lounge/_hooks/use-edit-buffer'
import { LoungeImages } from '@/app/world/lounge/_canvas/lounge-images'
import { LoungeThings, ThingPreview } from '@/app/world/lounge/_canvas/lounge-things'
import { freeSeat, seatOf, Usables } from '@/app/world/lounge/_canvas/usables'
import { ThingSolids } from '@/app/world/lounge/_sim/thing-solids'
import { dropTo, spotFor, stepBy } from '@/app/world/lounge/_sim/carry'
import { fits } from '@/app/world/lounge/_sim/fit'
import { CosmicGround, LoungeLighting, SKY } from '@/app/world/lounge/_canvas/lounge-sky'
import {
  applyWorldTemplate,
  emptyWorld,
  loadArenaInto,
} from '@/domain/lounge/actions'
import {
  clearWorldSpawn,
  placeGoal,
  removeGoal,
  resizeGoal,
  rotateGoal,
  setGoalTeam,
  setWorldSpawn,
  setWorldSpawnRing,
} from '@/domain/lounge/goal-actions'
import { planGoalPair } from '@/domain/lounge/pitch'
import { findTemplate } from '@/domain/lounge/templates'
import { saveWorldAsArena } from '@/domain/battlefields/actions'
import { claimThing, myConn, slotsOn } from '@/app/world/_stores/thing-life-store'
import { PocketPanel } from '@/app/world/lounge/_hud/pocket-panel'
import { emptyPockets } from '@/app/world/_stores/pocket-store'
import { POCKET_KEY } from '@/domain/thingiverse/pocket'
import { heldIndex, heldNow, nextInPocket, takeFromPocket } from '@/app/world/_stores/pocket-store'
import { answersUse, priceOfSlot } from '@/domain/thingiverse/blueprint'
import { payToTake } from '@/domain/thingiverse/shop'
import { reachFor } from '@/domain/thingiverse/craft'
import { removeLoungeImage } from '@/domain/lounge/image-actions'
import type { LoungeImageView } from '@/domain/lounge/image-queries'
import type {
  BlueprintView,
  ClipView,
  ThingView,
} from '@/domain/thingiverse/queries'
import { toClip } from '@/app/world/_canvas/baked-clip'
import {
  AVATAR_CLIPS,
  type AvatarClip,
  DEFAULT_AVATAR,
  DUMMY_LOOK,
} from '@/domain/lounge/avatars'
import { chooseAvatar, wearDummy } from '@/domain/profile/avatar-actions'
import { chooseSkin, wearSkinInLounge } from '@/domain/skins/actions'
import { blockKey } from '@/domain/lounge/events'
import {
  DEFAULT_MODEL,
} from '@/domain/lounge/palette'
import type { BlockView } from '@/domain/lounge/queries'
import { setRoomMode } from '@/domain/rooms/actions'
import { setLoungeMode } from '@/domain/tenants/actions'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'
import { fill } from '@/app/i18n/fill'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Creative-mode building on a 1x1x1 grid, in a cosmic void.
 *
 * The whole scene is driven by one `Map<"x,y,z", model>`. Rendering groups that
 * map by model and draws each group as a single InstancedMesh - the difference
 * between a few dozen draw calls and one per block, which is what separates a
 * playable world from a slideshow at a few thousand blocks.
 */

/**
 * The palette, the lighting rig and the floor now live in ./lounge-sky, which
 * is the part of this scene with no share in the frame loop. `SKY` is still
 * imported here because the shutter sets it as the renderer's clear colour.
 */

/** Scratch for the shutter: the pose it shoots from, and the one it puts back. */
const SHOT_RESTORE = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
}

/**
 * How far in front of somebody a thing appears when they pick it up.
 *
 * Three cells: outside arm's reach, inside the frame the placement camera puts
 * around it, and far enough that the body is not standing in the picture.
 */
const REACH_AHEAD = 3

/**
 * The keys that move a thing rather than a body, and how fast they repeat.
 *
 * The walk keys, plus a pair for height - R up, F down - which is the
 * convention every editor with a vertical axis has settled on and the two
 * letters nearest the walk keys that nothing else in this scene claims.
 *
 * A sixth of a second between steps: as fast as somebody can watch a thing move
 * and still stop it where they meant.
 */
const CARRY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF'])
const CARRY_STEP_MS = 160

export function LoungeScene({
  slug,
  worldId,
  worldName,
  initialBlocks,
  initialImages,
  initialThings = [],
  initialShelf = [],
  initialClips = [],
  stamina = false,
  initialGoals = [],
  football,
  race,
  readOnly,
  canModerate,
  mode: initialMode = 'battle',
  canSetMode = false,
  canFly,
  canFight,
  canRespawn,
  spawnSlot,
  arenas,
  worldsHref,
  spawnAt,
  avatar = DEFAULT_AVATAR,
  animal,
  skins,
  xpBody = null,
  asDummy = false,
  showXp = false,
  presence,
  perf,
  perfReadout,
  faces = false,
  battle,
  demo = false,
  companions,
  nearby,
  vr = true,
}: {
  slug: string
  /**
   * Which world this is. Omitted means the workspace's own lounge - the action
   * resolves that to the tenant id before anything is written, so the log
   * always names a world even when this prop does not.
   */
  worldId?: string
  /** Shown in the HUD, so an arena does not look like the lounge. */
  worldName?: string
  initialBlocks: BlockView[]
  initialImages: LoungeImageView[]
  /**
   * The things summoned into this world, and the shelf they came off.
   *
   * Both default to empty, which is what a scene rendered with the thingiverse
   * switched off gets - and what the demo, the still renderer and the shot
   * server get, none of which have a workspace to read a shelf from. An empty
   * shelf draws no furniture and offers no summoning, rather than an error.
   */
  initialThings?: ThingView[]
  initialShelf?: BlueprintView[]
  /**
   * The clips this space animated for itself.
   *
   * Loaded with the world rather than fetched when one is wanted: a chair whose
   * sit-down arrived half a second after somebody sat in it would play the
   * first half of the animation as a body standing still. Sixty-four of them is
   * the cap, and the samples are what makes that a real number - see
   * `listClips`.
   */
  initialClips?: ClipView[]
  /**
   * Whether running costs anything here.
   *
   * The space's `stamina` capability, read by the page. Off is what every world
   * has always been. It is a *prop* and also a store - see `useStaminaOverride`
   * - because an admin flipping the switch in the rail must not re-render the
   * page the scene is mounted on.
   */
  stamina?: boolean
  /**
   * The goals standing in this world, from the log.
   *
   * Always drawn, in every mode - they are part of the world, like a wall somebody
   * built, and a pitch whose goals vanished outside a match would be a confusing
   * place to build one. What changes with the mode is whether there is a ball.
   */
  initialGoals?: Goal[]
  /**
   * The match being played with the ball, if there is one.
   *
   * Omitted in the lounge and in every other kind of match, which is what keeps the
   * ball out of rooms that have no business having one. The battle room passes this
   * once a football match is live; see the note on `FootballRuntime`.
   */
  football?: {
    /** Report a goal. Only ever called on the client stepping the ball. */
    onGoal: (side: GoalTeam, by: string | undefined, ownGoal: boolean) => void
    /** Which side somebody is on, for spotting an own goal. */
    sideOf: (userId: string) => GoalTeam | undefined
    /** False before kickoff and after the whistle. */
    live: boolean
  }
  /**
   * The race being run through this world's marks, if there is one.
   *
   * Omitted in the lounge and in every other mode, exactly as `football` is - and
   * for the same reason: it is what makes the start line a grid people are
   * arranged on rather than a green rectangle somebody built. The marks
   * themselves come from `initialGoals`, because they are part of the world
   * whether or not anybody is racing.
   */
  race?: {
    /**
     * We crossed the finish. Called on our own client only - nobody else is in a
     * position to know where we are.
     *
     * Resolves to whether the report *stuck*. Not fire-and-forget, and that is
     * the whole point of the signature: a report that failed used to leave the
     * racer permanently unable to finish, because the guard against reporting
     * twice was latched before the round trip and never let go. One dropped
     * request and the rest of the race was unwinnable, silently. Answering here
     * lets the next crossing try again.
     */
    onFinish: () => Promise<boolean>
    /** False before the off and once we are home. */
    live: boolean
  }
  readOnly: boolean
  /**
   * Whether the viewer may rebuild this world: lay a template over it, or swap
   * a saved arena in.
   *
   * Owner or admin, which is the pair `applyWorldTemplate` and
   * `loadArenaInto` both check server-side. It was `isOwner`, and an
   * admin - who may already flip the lounge's mode and rebuild a battlefield -
   * opened the world menu to find it empty with nothing to say why.
   *
   * Separate from `canSetMode` because a battlefield's build page grants this
   * and not that: an arena has no mode to switch.
   */
  canModerate: boolean
  /**
   * Sparring on, or building undisturbed.
   *
   * Defaulted rather than required, because the public showcase renders this
   * scene for visitors with no membership and so no workspace setting to read.
   * They get 'battle', which for a read-only visitor means nothing at all -
   * combat needs a presence channel they do not have.
   */
  mode?: 'creative' | 'battle'
  /** Owner or admin. Everyone sees the mode; only these two can change it. */
  canSetMode?: boolean
  /**
   * Whether this room lets anybody fly.
   *
   * Defaults to `readOnly`, which is the lounge's long-standing rule: members
   * walk, and a read-only visitor to the public showcase flies through it like
   * an observatory (see the note on `fly` in <PlayerControls>).
   *
   * Battlefields pass `false` outright. An arena is a place people fight in,
   * and a fight where one side can float is not one - so there, *nobody* flies,
   * whether they are building it, watching it or in it.
   */
  canFly?: boolean
  /**
   * Whether the dash is live right now, on top of the mode.
   *
   * The lounge leaves this alone - battle mode there means always on, which is
   * what makes it a play area. A match uses it as a bell: nobody swings before
   * the host starts it, so you cannot be beaten to nothing in the lobby and
   * walk into your own match already down.
   */
  canFight?: boolean
  /**
   * Whether going down is something you get up from. Defaults to true, which is
   * the lounge: nothing is at stake, so nothing is lost. A match passes false -
   * being knocked out is how you leave one.
   */
  canRespawn?: boolean
  /**
   * Where in the starting line-up we are, when there is one.
   *
   * Absent in the lounge, which starts everybody at the origin. A match passes
   * a slot so each fighter opens on their own square - see ./spawn.ts.
   */
  spawnSlot?: SpawnSlot
  /**
   * The space's saved arenas, for the worlds panel. Empty or absent hides it.
   */
  arenas?: { worldId: string; name: string }[]
  /**
   * Where this space's world catalogue is, when it has one.
   *
   * Handed in rather than derived from the slug, because whether the catalogue
   * exists for this space is a feature flag - and a scene has no way to read
   * one. Absent hides the link entirely, which is right: a dead end into a
   * 404 is worse than no door.
   */
  worldsHref?: string
  /**
   * Where this world's door is, in cells. Absent means the middle.
   *
   * Read from `world_spawns` by the page - a hint, not a rule: nothing stops
   * anybody walking away from it a second later.
   */
  spawnAt?: WorldSpawn
  /**
   * What you are standing in here - an animal, or a bought skin's catalogue id.
   *
   * Defaults rather than being required, because the public showcase renders
   * this scene for visitors who have no membership and so have no look of
   * their own. Which of the two it is, the renderer decides by the slash; see
   * `BodyModel`.
   */
  avatar?: string
  /**
   * The animal on the peep, always - never a skin.
   *
   * Kept apart from `avatar` because the two answer different questions: that
   * one is what the room draws, this one is who you are underneath it. The
   * wardrobe needs both, and a skin id handed to `avatarShotUrl` is a broken
   * picture.
   */
  animal?: string
  /** The skins this account owns, for the wardrobe. Empty for a guest. */
  skins?: { id: string; name: string }[]
  /**
   * The XP body this account has on: a skin's catalogue id, or null for the
   * dummy every player starts in.
   *
   * What it is *not* is what the room is drawing. Everybody has two bodies at
   * once - the peep above and this one - and `showXp` is the only thing that
   * says which of them a world puts on screen. Reading this as "the body over
   * the animal" is exactly the conflation that used to replace somebody's peep
   * everywhere the moment they equipped a skin for the games.
   */
  xpBody?: string | null
  /** Whether the peep half is the plain mannequin rather than the animal. */
  asDummy?: boolean
  /** The mode: draw the XP body in this world instead of the peep. */
  showXp?: boolean
  /**
   * Who you are on the presence channel. Absent for the public showcase, which
   * is deliberately a one-way window: a visitor with no membership cannot pass
   * the Realtime policy, and should not appear in a private team's room.
   */
  presence?: {
    tenantId: string
    userId: string
    name: string
    /**
     * Which room's channel this is, when it is not the space's lounge.
     *
     * Here rather than derived from `battle` below, and that separation is the
     * whole point. `battle` describes a *fight* - it is only handed over once
     * the match is live and we are on the roster - so deriving the topic from
     * it put everybody in a match room that had not kicked off yet, and every
     * spectator of one that had, onto `lounge:<tenantId>`: the same channel as
     * the people standing in the lounge. Creating a match and finding the
     * lounge's visitors walking around in it is exactly that.
     *
     * A room is a room from the moment you are in it, whatever is happening
     * there, so the topic follows the URL. The Realtime policy on `battle:`
     * topics only admits the roster (see 20260803050000_battles.sql), which is
     * the other half: a spectator is not on it, gets no channel, and so is not
     * a body in somebody else's match.
     */
    battleId?: string
    /**
     * Which room this is, when it is one of the space's extra rooms.
     *
     * Mutually exclusive with `battleId` in practice - a match is held in an
     * arena, not in a room - and checked in that order below, so a caller that
     * somehow passed both gets the match's channel rather than a silent merge
     * of two rooms' presence.
     */
    roomId?: string
  }
  /**
   * Measure this room while people are standing in it, and say so on screen.
   *
   * The `perf` flag, resolved on the server for this space - see
   * `src/domain/flags/keys.ts`. It is a plain boolean here rather than the
   * object `<Multiplayer>` takes, because the workspace it belongs to is
   * already `presence.tenantId`: a scene with no presence channel has no room
   * to measure and nowhere to file the row, so the two travel together by
   * construction.
   *
   * All it does is mount the probe inside the canvas. Whether any of what it
   * measures is *shown* to the people in the room is `perfReadout` below, which
   * is a separate decision belonging to the space rather than to an operator.
   */
  perf?: boolean
  /**
   * Draw this client's own readings in the HUD.
   *
   * The space's own switch - see the `perf_display` capability - and only ever
   * true alongside `perf`, because with nothing measuring there is nothing to
   * draw. Kept as its own prop rather than folded into `perf` so that the two
   * decisions stay legible at the call site: one is "may this be measured", the
   * other is "does this space want to watch".
   */
  perfReadout?: boolean
  /**
   * Offer a camera, and draw the ones people switch on.
   *
   * The `faces` flag, resolved on the server for this space - see
   * `src/domain/flags/keys.ts`. Like `perf` it only ever means anything
   * alongside a presence channel: the pictures travel between the tabs in a
   * room, and a scene with no room has no tabs to travel between.
   *
   * It gates two things and they are on opposite sides of the canvas - the
   * switch in the HUD, and the signalling on the room's channel. Both, because
   * a switch with nothing behind it is a button that appears to do nothing, and
   * signalling with no switch is a mesh nobody can ever be in.
   */
  faces?: boolean
  /**
   * Present when this is a match rather than the lounge.
   *
   * It changes two things and nothing else: who a dash is allowed to hurt, and
   * what happens when our own health reaches zero. Everything else - the world,
   * the controls, the palette, the HUD - is the same scene, which is the reason
   * a battle needed no second renderer. Which channel we are on is
   * `presence.battleId`, above, and deliberately not this.
   */
  battle?: {
    battleId: string
    /**
     * Everyone on our side, including us. A dash passes through these.
     * Empty in a free-for-all, where the only ally is nobody.
     */
    allies: ReadonlySet<string>
    /**
     * Whether this mode draws sides at all. False in a free-for-all, where
     * "ally" is only ever yourself and colouring the room red says nothing.
     */
    teams: boolean
    /**
     * Our own health hit zero. The caller reports it to the server - we never
     * report anybody else's, which is the rule combat.ts already keeps on the
     * wire and domain/battle/actions.ts keeps at the boundary.
     */
    onDefeated: (by?: string) => void
  }
  /**
   * Nothing that happens here is written down.
   *
   * The public demo at /demo, and the only prop in this file that is about the
   * *log* rather than about the room. Everything else that hides a control -
   * `readOnly`, `canModerate`, `canSetMode` - answers "may this person do
   * that", and the answer is enforced again server-side. This one answers "is
   * there a server at all", and for the demo there is not: no workspace, no
   * membership, no stream. So the controls it disables are the ones whose only
   * effect is to append.
   *
   * Deliberately *not* `readOnly`. A read-only world is one you may look at and
   * not touch, which is the public showcase. This is the opposite offer: build
   * as much as you like, and none of it survives the tab. Conflating the two
   * would have meant either a demo nobody can build in or a showcase visitor
   * quietly editing somebody's room in their own browser.
   *
   * Building itself needs no branch - see `useEditBuffer`, which simply stops
   * draining. What is switched off here is the handful of controls that write
   * *outside* that buffer, and would each fail on their own membership check.
   */
  demo?: boolean
  /**
   * Bodies that belong to nobody: scripted hosts, standing in the room.
   *
   * Independent of `presence` on purpose. Presence is other people, and these
   * are not people - they have no channel, no id anything could be granted to,
   * and no way to be affected by what happens in the room. Passing them
   * separately is what keeps `Multiplayer`'s roster honest: the peer count in
   * the HUD counts humans, and it would be a small lie for a demo to inflate
   * it. See ./companions.
   */
  companions?: readonly Companion[]
  /**
   * People reached without a server, on a phone's hotspot.
   *
   * A `Room` rather than a transport, so this file learns nothing about
   * WebRTC: it hands the same object to the same two components the homestead
   * uses, and they interpolate bodies out of it exactly as they always have.
   * See `useNearbyRoom`, which is where the data channel is made to look like
   * this.
   *
   * Independent of `presence`, and both can be absent. The lobby has this and
   * no channel; the lounge has a channel and not this. Nothing yet has both,
   * and if anything ever does it will be drawing two sets of bodies from two
   * transports, which is a decision to make with that case in hand.
   */
  nearby?: Room
  /**
   * Whether this room can be worn. On by default, and off is the exception.
   *
   * It began as opt-in, on the argument that a headset changes what a room *is*:
   * a workspace lounge is something you have open beside your work, the lobby is
   * somewhere you go, and only the second is worth putting on your face. That
   * argument was wrong in the way tidy arguments usually are - it decided on the
   * user's behalf which of their rooms they were allowed to stand in. The rooms
   * are the same scene. If one of them can be worn, they all can.
   *
   * The HUD really does vanish in a session - it is ordinary DOM - and that is a
   * reason to build a HUD in the canvas one day, not a reason to lock the door.
   *
   * Costs nothing where it is unused: both the layer and the button are behind
   * `import()`, so a visitor without a headset never downloads
   * `@react-three/xr`, and the button is not rendered at all unless the browser
   * reports a device. See ./_canvas/vr.
   */
  vr?: boolean
}) {
  const refusal = useRefusal()
  /**
   * Armed here as well as in the workspace layout, because this scene is also
   * what the public showcase at /v/[slug]/lounge renders - and that route has
   * no workspace layout above it. Visitors get no music there, but a block
   * still knocks. See `useAudioGate`.
   */
  useAudioGate()

  /** Whether there is a race at all. See the dependency note in ./use-spawn. */
  const racing = Boolean(race)

  /**
   * Where everybody comes in, and what the frame loop writes.
   *
   * These two lines are first because almost everything below depends on them:
   * the spawn seeds the eye, and the bundle holds every value that changes
   * sixty times a second. `refs` is handed sideways to the hooks that need it
   * and downward, through the provider at the bottom, to the components in the
   * scene - see ./scene-refs, which is where the twenty-odd doc comments that
   * used to sit in this file now live.
   *
   * Destructured so the code below reads exactly as it did when each of these
   * was a `useRef` of its own. That was the condition for moving them: the
   * frame loop is the part of this scene with no tests, so the refactor had to
   * leave its text alone.
   */
  const spawn = useSpawn({
    initialBlocks,
    initialGoals,
    racing,
    spawnSlot,
    spawnAt,
    userId: presence?.userId,
    worldId,
  })
  const refs = useCreateSceneRefs(spawn)
  const {
    playerRef,
    dashRef,
    kickRef,
    saidsRef,
    selfEmoteRef,
    selfSaidRef,
    sendEmoteRef,
    ballRef,
    kickoffRef,
    hostStalledRef,
    ballStuckRef,
    resetBallRef,
    moveRef,
    lookRef,
    vrRayRef,
    shotRef,
    shotPoseRef,
  } = refs

  const [blocks, setBlocks] = useState<BlockMap>(() => toBlockMap(initialBlocks))

  /**
   * The models this world is made of, fetching from here rather than from the
   * moment the canvas gets round to asking for them.
   *
   * Taken from `initialBlocks` and not from live `blocks`, so it is one list
   * computed once: a block placed later is a model that is either already in
   * the cache or one round trip away, and re-preloading the world every time
   * somebody builds would be a new Set per placement for no gain.
   */
  usePreloadedBlocks(
    useMemo(() => initialBlocks.map((block) => block.model), [initialBlocks]),
  )

  /**
   * The same map, readable from a callback that must not depend on it.
   *
   * Only the knock a block makes needs this: `place` and `remove` are wired to
   * document-level listeners and deliberately keep `blocks` out of their
   * dependency arrays (see `targetRef` for the same trade), so they cannot ask
   * whether the cell they are about to write already holds what they are about
   * to put there - and a drag back across a finished wall would knock on every
   * frame while building nothing.
   *
   * Synced in an effect rather than inside the state updater, which keeps the
   * updater pure and leaves the other three `setBlocks` sites alone. The cost
   * is that during one tick of a fast drag this can lag the state by a single
   * placement; the worst that buys is one extra knock, which the catalogue's
   * own 55ms floor swallows anyway.
   */
  const blocksRef = useRef(blocks)
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  /**
   * The goals, and the ball.
   *
   * Goals are state because creative mode edits them and the change has to be
   * visible immediately - the same optimistic treatment blocks and images get, for
   * the same reason: the action deliberately does not revalidate, so nothing is
   * coming back to tell us what we already did.
   */
  const [goals, setGoals] = useState<Goal[]>(initialGoals)

  const [selected, setSelected] = useState<string>(DEFAULT_MODEL)
  const [locked, setLocked] = useState(false)
  const [target, setTarget] = useState<Target>(NO_TARGET)

  /**
   * Third person by default: the whole point of choosing an animal is seeing it.
   * Building is the reason to switch back, and the toggle says so in the HUD.
   */
  const [thirdPerson, setThirdPerson] = useState(true)

  /**
   * Looking at yourself, from the front.
   *
   * Its own state rather than a third value of `thirdPerson`, because it is not
   * a third camera distance - it is a different question ("show me me") laid
   * over whichever view you were in, and leaving it puts you back where you
   * were rather than in some canonical default.
   */
  const [mirror, setMirror] = useState(false)

  /**
   * Both bodies, and which of them this room is drawing.
   *
   * Seeded from the props and then owned here, because changing your look from
   * inside the room has to show on the body in the mirror immediately - the
   * save is a round trip, and the whole reason the switcher sits beside the
   * mirror is to look at the result.
   *
   * Deliberately *not* one "worn" value with the rest hanging off it. You have
   * a peep and an XP body at the same time and neither is spent by the other,
   * so all three parts are held: `animal` and `dummy` are the peep half, `xp`
   * is the other body, and `showXp` is a mode rather than a costume. What the
   * renderer draws is derived from them below and stored nowhere, which is what
   * makes it impossible for the two to drift apart again - equipping a skin
   * used to overwrite the single worn value, and the peep was gone from every
   * space until it was picked a second time.
   *
   * Re-synced by comparing against the last props we saw, *during render*
   * rather than in an effect. Effects calling setState would render the room a
   * second time for every change, on a page whose render mounts a canvas - and
   * this is React's own answer for state that follows a prop.
   */
  const [look, setLook] = useState({
    animal: animal ?? avatar,
    dummy: asDummy,
    xp: xpBody,
    showXp,
  })
  const [seenProps, setSeenProps] = useState({ avatar, animal, xpBody, asDummy, showXp })

  /**
   * The body swap's own two pieces of state: why the last one was refused, and
   * a counter that is bumped once per switch to (re)start the rain over the
   * room. A counter rather than a boolean because switching again while the
   * first is still playing has to restart it, and a boolean already true
   * changes nothing.
   */
  const [xpProblem, setXpProblem] = useState<string | null>(null)
  const [swap, setSwap] = useState<number | null>(null)

  if (
    seenProps.avatar !== avatar ||
    seenProps.animal !== animal ||
    seenProps.xpBody !== xpBody ||
    seenProps.asDummy !== asDummy ||
    seenProps.showXp !== showXp
  ) {
    setSeenProps({ avatar, animal, xpBody, asDummy, showXp })
    setLook({ animal: animal ?? avatar, dummy: asDummy, xp: xpBody, showXp })
  }

  /**
   * The one body on screen, worked out from the three above.
   *
   * The order is the one `readLoungeLook` writes down on the server, and it is
   * written twice on purpose rather than shared: this one has to answer before
   * the round trip lands, and the server's has to answer for everybody else in
   * the room. They agree because both start from the mode.
   *
   * `avatar` is the fallback rather than `look.animal` for the showcase, where
   * there is no account behind any of this and the prop is the whole answer.
   */
  const wearing = look.showXp
    ? (look.xp ?? DUMMY_LOOK)
    : look.dummy
      ? DUMMY_LOOK
      : (look.animal ?? avatar)

  /**
   * Looking at the whole room from above, on purpose.
   *
   * The overview used to be nothing but the pre-entry pose, and it played
   * whenever nobody was "in" - which is every time pointer lock is released, so
   * opening the chat box flew the camera twenty blocks up and closing it flew it
   * back down. Chatting is not leaving. So the pose is now asked for: the first
   * arrival still plays it once (see `entered`), and after that O is what puts
   * you back up there. See ./entry-view.ts.
   */
  const [overview, setOverview] = useState(false)
  const [dancing, setDancing] = useState(false)

  /**
   * Presence state lives out here rather than inside <Multiplayer> because the
   * HUD is outside the Canvas and has to show it.
   *
   * The setters are handed down as-is. React guarantees a `useState` setter is
   * stable for the life of the component, which is what keeps them safe in the
   * dependency array of the effect that opens the channel - wrapping them in
   * useCallback would add a line and change nothing.
   */
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>('connecting')
  const [peerCount, setPeerCount] = useState(0)

  /**
   * A dead channel is worth saying in the tab strip, not just in the HUD.
   *
   * The lounge is where people leave a tab parked, and a room whose channel
   * errored looks exactly like a room nobody is in: no arrivals, nothing you
   * do reaching anyone. The favicon in the root layout turns red on this.
   *
   * `'connecting'` deliberately does not count. Every session passes through
   * it, and a red tab for the second before the first packet lands is noise.
   */
  useReportConnection(presenceStatus === 'error')

  /**
   * The lounge, and only the lounge, reports itself to the sidebar.
   *
   * `worldId` is set for every other surface this scene renders - an arena
   * being built, a match being fought, a world being moderated - and none of
   * them is somewhere the rail could send anybody, so listing their occupants
   * under "in the lounge" would be a lie twice over. Same test the travel bar
   * used to make before it moved into the rail.
   */
  const inLounge = Boolean(presence) && !worldId

  useEffect(() => {
    if (!inLounge) return
    // Published on arrival rather than on the first sync, so the rail names the
    // room you just walked into instead of staying blank until somebody joins.
    publishHere('lounge', [])
    return () => leaveHere('lounge')
  }, [inLounge])

  /**
   * And, separately, that there is a world on screen at all.
   *
   * Unconditional where the line above is gated, because the two answer
   * different questions: `publishHere` says *which of the four rooms* you are
   * standing in, which an arena and a match are not, and this says only that a
   * scene is drawing. The radio wants the second one - music belongs to a world,
   * not to a settings page - and a battle is as much a world as the lounge is.
   */
  useEffect(() => enterScene(worldId ?? null), [worldId])

  const chime = useRosterChime()

  const notePeers = useCallback(
    (peers: Peer[]) => {
      // Before the `inLounge` gate, not after it. An arena and a match are
      // rooms you can be joined in too, and hearing somebody walk into the
      // battle you are fighting matters more than hearing it in the lounge -
      // what `inLounge` decides is only whether the *rail* is told, which is a
      // different question entirely.
      chime(peers.map((peer) => peer.userId))

      if (!inLounge) return
      publishHere('lounge', peers)
    },
    [inLounge, chime],
  )

  // --- emotes ---------------------------------------------------------------

  // `pickerOpen` in this file is already the *block* picker, on E.
  const [emotesOpen, setEmotesOpen] = useState(false)

  const doEmote = useCallback((id: EmoteId) => {
    // Our own face goes up immediately rather than waiting for the round trip,
    // which at this distance reads as the button not having worked.
    showEmote(selfEmoteRef.current, id)
    sendEmoteRef.current?.(id)
    // Stable for the life of the scene; listed only because they arrive
    // destructured rather than straight from `useRef`. See ./_scene/scene-refs.
  }, [selfEmoteRef, sendEmoteRef])

  // --- chat -----------------------------------------------------------------

  /**
   * Raise a bubble whenever the rail hears somebody speak.
   *
   * Empty deps: the store is a module-level event bus and `announceSaid` is not
   * a React value, so this subscribes once for the life of the scene. Writing
   * into the maps rather than into state is the same discipline every other
   * packet here follows - a sentence must not re-render six avatars.
   *
   * A message from somebody who is not in the room lands in the map and is drawn
   * by nobody, which is correct: the rail is workspace-wide, so people talk in
   * it from pages that have no bodies in them at all.
   */
  /**
   * Which id means "me" for the purposes of raising a bubble.
   *
   * The presence channel's, when there is one. In the demo and the lobby there
   * is not, and `undefined` would match nothing - so your own sentence would go
   * into the map of other people's bubbles and be drawn by nobody. See
   * `LOCAL_SPEAKER`.
   */
  const speaker = presence?.userId ?? (demo ? LOCAL_SPEAKER : undefined)

  useEffect(
    () =>
      onSaid(({ userId, body }) => {
        if (userId === speaker) {
          showSaid(selfSaidRef.current, body)
          return
        }

        const saids = saidsRef.current
        if (!saids) return

        let slot = saids.get(userId)
        if (!slot) {
          slot = nothingSaid()
          saids.set(userId, slot)
        }
        showSaid(slot, body)
      }),
    // Refs from the bundle: stable, so listing them is free. See ./_scene/scene-refs.
    [speaker, saidsRef, selfSaidRef],
  )

  /**
   * The mode, held locally because setLoungeMode deliberately does not
   * revalidate - the layout re-render would tear down this canvas mid-flip.
   * So the switch is applied here immediately and rolled back if the server
   * refuses, the same shape as every other write in this scene.
   */
  const [heldMode, setMode] = useState<'creative' | 'battle'>(initialMode)

  /**
   * Whether the pocket is open.
   *
   * Scene state rather than a store, unlike what is *in* it: the contents are
   * read from three places on both sides of the Canvas, and whether a panel is
   * showing is read here and nowhere else. See `pocket-store` for the other
   * half and why it is split this way.
   */
  const [pocketOpen, setPocketOpen] = useState(false)

  /*
    What you were carrying does not follow you out. The same promise every
    other store here makes, and the one `@/domain/thingiverse/pocket` argues
    for at length: a pocket that survived the room is a different feature with
    three unanswered questions in it.
  */
  useEffect(() => () => emptyPockets(), [])

  /**
   * The demo, and only the demo, drives the mode from outside.
   *
   * Its switch is in the banner over the world rather than in the HUD - see
   * ../../demo/demo-lounge - because the sentence explaining what battle mode
   * *is* has to be next to the thing that turns it on. So there the prop is the
   * truth, read straight through, and the state above is left unused.
   *
   * Read rather than synchronised: an effect copying the prop into state would
   * render the old mode for a frame every time it changed, and would be a
   * second source of truth to keep in step. Gated on `demo` because everywhere
   * else the state *is* the truth - `setLoungeMode` deliberately does not
   * revalidate, so a room that re-read this prop on every parent render would
   * snap back to whatever the last server render said the moment anybody
   * flipped it.
   */
  const mode = demo ? initialMode : heldMode

  /**
   * The lights, and who turned them on.
   *
   * Both ephemeral and both broadcast rather than written down - see the note
   * on `party` in presence-core. The host is kept because that is the one body
   * the glow treats differently, and the only way to know it is the `u` on the
   * message that started the party.
   */
  const [party, setParty] = useState(false)
  const [partyHost, setPartyHost] = useState<string | null>(null)

  /**
   * Whether the build is glass.
   *
   * Ephemeral and broadcast like the party, and with no host to remember: the
   * sweep is a function of where a block stands rather than of who asked for it.
   */
  const [rainbow, setRainbow] = useState(false)

  const [modeBusy, setModeBusy] = useState(false)
  const [modeError, setModeError] = useState<string | null>(null)

  // Declared here rather than beside the picker state below, because the room
  // handler under it needs it and hooks cannot be read before they are called.
  const router = useRouter()

  /**
   * "Tell the room" - filled in by <Multiplayer>, which owns the socket.
   *
   * Null in the showcase and anywhere else without a presence channel, which is
   * why every call below is optional. A change nobody can be told about is
   * still a change: the acting client applies it either way.
   */
  const roomRef = useRef<
    | ((message: {
        mode?: 'creative' | 'battle'
        world?: true
        /** Which template was laid, so the room can draw it rather than reload. */
        template?: string
        /** The lights, on or off. Ephemeral - see `party` in ../presence-core. */
        party?: boolean
        /** The world as glass, on or off. Ephemeral in the same way. */
        rainbow?: boolean
      }) => void)
    | null
  >(null)

  /**
   * The room changed under us, because somebody else changed it.
   *
   * Two very different answers, because the two changes differ in size. A mode
   * flip is one boolean and the scene already holds it in state, so it is
   * applied in place - the canvas never blinks. A rebuilt world is tens of
   * thousands of blocks that arrived through a server action we did not call,
   * and there is no honest way to patch that into a live block map: the page
   * reloads, which is exactly what the client that laid it already does.
   */
  const onRoom = useCallback(
    (message: {
      /** Who sent it, which for a party is who is hosting it. */
      u: string
      mode?: 'creative' | 'battle'
      world?: true
      template?: string
      party?: boolean
      rainbow?: boolean
    }) => {
      if (message.mode) setMode(message.mode)

      // No host to record, unlike the party below: nothing about the sweep
      // depends on who threw the switch.
      if (typeof message.rainbow === 'boolean') setRainbow(message.rainbow)

      // Whoever sent it is the host while it is on, and nobody once it is off -
      // so the rainbow goes out with the lights rather than sticking to the
      // last person who threw the switch.
      if (typeof message.party === 'boolean') {
        setParty(message.party)
        setPartyHost(message.party ? message.u : null)
      }

      if (!message.world) return

      /**
       * A named template can be drawn; anything else has to be fetched.
       *
       * The planner is pure and every client has it, so "somebody laid the
       * pitch" is a message the whole room can act on without a round trip -
       * and without reloading the page around a live canvas, which is what a
       * room full of people all reloading at once used to look like.
       *
       * A loaded arena has no plan to replay - it is somebody's saved world,
       * tens of thousands of blocks that only the server knows - so that still
       * reloads. Also the fallback for a template this client does not know,
       * which is what an older tab sees after a deploy adds one.
       */
      const template = message.template ? findTemplate(message.template) : undefined
      if (!template) {
        window.location.reload()
        return
      }

      const next: BlockMap = new Map()
      for (const block of template.plan().blocks) {
        next.set(blockKey(block.x, block.y, block.z), block)
      }
      setBlocks(next)
      // Somebody else's floor just arrived around our knees.
      standOn(playerRef.current, template.plan().blocks)
      // The goals are not in the message - their ids are the server's - so the
      // router fetches them. Cheap: it is two rows, and the blocks are already
      // on screen by the time it lands.
      setGoals([])
      router.refresh()
    },
    // Refs from the bundle: stable, so listing them is free. See ./_scene/scene-refs.
    [router, playerRef],
  )

  /**
   * Which switch this is: the space's, or this room's.
   *
   * They are two different writes into two different places. `setLoungeMode`
   * puts one column on the tenant, which is right for the lounge - the one room
   * the whole space shares - and was exactly why a room could not use it: an
   * owner flipping a room would have flipped the lobby and every other room
   * with it. So a room writes its own, and `worldId` is how this scene knows
   * which it is standing in.
   *
   * Gated on `presence` because that is where the tenant id is, and a scene
   * with no channel - the showcase, the demo - has no switch to route anyway.
   */
  const roomId = presence && worldId && worldId !== presence.tenantId ? worldId : null

  const changeMode = useCallback(
    (next: 'creative' | 'battle') => {
      const previous = mode
      setMode(next)
      setModeBusy(true)
      setModeError(null)
      const written = roomId
        ? setRoomMode(slug, roomId, next)
        : setLoungeMode(slug, next)
      void written.then((result) => {
        setModeBusy(false)
        if (!result.ok) {
          setMode(previous)
          setModeError(refusal(result.error))
          return
        }
        // Everybody else is holding this in client state too - `setLoungeMode`
        // does not revalidate, on purpose - so without this they carry on
        // building in a battle-mode lounge, or swinging in a creative one.
        roomRef.current?.({ mode: next })
      })
    },
    [mode, roomId, slug, refusal],
  )

  /**
   * Throwing the party switch, and telling the room.
   *
   * Nothing is written and nothing is awaited, which is the whole difference
   * between this and `changeMode` above: a mode is a workspace setting with a
   * server to refuse it, and a party is a broadcast. So there is no busy state,
   * no rollback and no error - the lights are on here the instant the button is
   * pressed, and everybody else's come on a packet later.
   */
  const changeParty = useCallback(
    (next: boolean) => {
      setParty(next)
      setPartyHost(next ? (presence?.userId ?? null) : null)
      roomRef.current?.({ party: next })
    },
    [presence?.userId],
  )

  /**
   * Told again every time the roster changes, by whoever is hosting.
   *
   * A broadcast only reaches the people who were subscribed when it went out,
   * which for a party is the wrong audience: the whole point of it is that it
   * belongs to the *room*, so somebody walking in five minutes later - a guest
   * arriving through a link, most obviously - has to find the lights on rather
   * than a room everybody else says is lit.
   *
   * `peerCount` is the trigger because it is the one number that changes when
   * anybody arrives. It also changes when somebody leaves, which sends one
   * redundant message to a room that already agrees - cheaper than tracking
   * arrivals separately, and the message is three fields.
   *
   * Only the host sends it. Everybody re-broadcasting on every join is a storm
   * that grows with the square of the room, and the host is the one client that
   * cannot be wrong about whose party it is. The cost is that when the host
   * leaves, the lights stay on for whoever is standing there and a later
   * arrival sees the room as it is - which is about right for a party nobody is
   * hosting any more.
   */
  const hosting = party && Boolean(presence) && partyHost === presence?.userId
  useEffect(() => {
    if (!hosting) return
    roomRef.current?.({ party: true })
  }, [hosting, peerCount])

  /**
   * The switch itself lives in the rail's Room tab, which is several components
   * and one layout away - so it is published rather than passed. See
   * ../party-store for why the scene is the end that owns it.
   *
   * Cleared on unmount, and gated on the same pair the mode switch is gated on:
   * a party needs a channel to be broadcast over, and turning the room pink is
   * an owner's or an admin's call.
   */
  /**
   * `canModerate` rather than `canSetMode`, which is the difference between
   * "may change this workspace" and "runs this room".
   *
   * The mode switch is the former: it writes a column on the tenant, so only
   * the lounge offers it and a room passes `canSetMode` not at all. A party
   * writes nothing, and a room - a meeting, a testing room, somebody's private
   * corner - is if anything where one is more likely to be thrown than in the
   * lounge. Gating it on the mode's flag would have hidden the switch in every
   * room in the space, which is exactly where it was first looked for.
   */
  const canParty = Boolean(presence) && canModerate
  useEffect(() => {
    publishParty({ state: { on: party, canSet: canParty }, actions: { set: changeParty } })
    return () => publishParty(null)
  }, [canParty, party, changeParty])

  /**
   * Turning the build to glass, and telling the room.
   *
   * The party's mechanism exactly - a broadcast, no server, no rollback - and
   * gated on the same pair, because it is the same kind of act: a thing you do
   * to the room everybody is standing in rather than a setting on the space.
   *
   * There is no host here, unlike the party, and nothing depends on who threw
   * it: a party colours the *thrower* differently, so it has to remember them,
   * while a rainbow is one sweep across a world that has no idea who asked for
   * it. What that costs is the re-broadcast on arrival below, which the party
   * gets from the same fact it needs the host for.
   */
  const changeRainbow = useCallback((next: boolean) => {
    setRainbow(next)
    roomRef.current?.({ rainbow: next })
  }, [])

  /**
   * Told again whenever the roster changes, so somebody walking in finds the
   * world as it actually is.
   *
   * Sent by everybody rather than by a host, because there is not one - and a
   * boolean that every client agrees on is a message they can all send: the
   * worst case is a handful of identical packets saying the world is glass,
   * which is what it already looks like to all of them. The party cannot do
   * this, since each sender would claim the party as their own.
   */
  useEffect(() => {
    if (!rainbow) return
    roomRef.current?.({ rainbow: true })
  }, [rainbow, peerCount])

  useEffect(() => {
    publishRainbow({
      state: { on: rainbow, canSet: canParty },
      actions: { set: changeRainbow },
    })
    return () => publishRainbow(null)
  }, [canParty, rainbow, changeRainbow])

  /**
   * Fighting needs company, and battle mode.
   *
   * Note what is deliberately *not* in this condition: `readOnly`. It used to
   * be, back when read-only meant one thing - a showcase visitor drifting
   * through with no presence channel to be hit over. It now also means "may not
   * change this world", which is true of everybody standing in a match: the
   * arena is fixed once the fight starts. Gating combat on it turned the dash
   * off in exactly the place the dash is the entire point.
   *
   * So the two questions are asked separately. `canBuild` below is "may I
   * change the world"; this is "may I hit someone". A visitor with no presence
   * still gets neither, which is the case `readOnly` was standing in for.
   *
   * Creative mode is the other way to be unarmed: the space is building rather
   * than scrapping, and a dash landing mid-placement is exactly the
   * interruption the mode exists to stop.
   */
  /**
   * `demo` is the second way to be armed, and the only one without a channel.
   *
   * Everywhere else, "somebody to hit" and "a presence channel" are the same
   * fact - a hit is a packet, so no channel is no fight. The demo has the one
   * other kind of body in this codebase: scripted hosts, who are hit by
   * `judgePunches` in ./companions and need nothing sent anywhere. Left out of
   * this condition, the whole fighting half of the product was a thing a
   * visitor could only be told about.
   */
  const combat = (Boolean(presence) || demo) && mode === 'battle' && (canFight ?? true)

  /**
   * Who flies here.
   *
   * `readOnly` by default, which keeps the lounge's rule intact: members are
   * subject to the world they build, and a showcase visitor who cannot change
   * anything drifts through it instead. Battlefields override it to `false` -
   * see the note on `canFly`. Note this is *not* keyed on the creative/battle
   * mode: switching the lounge to creative does not hand anybody flight, which
   * is deliberate and the reason the two are separate props.
   */
  const flying = canFly ?? readOnly

  /**
   * Whether blocks can be placed or broken here.
   *
   * Building is a creative-mode verb, and only a creative-mode verb. In battle
   * mode the world is the thing you are fighting over, not the thing you are
   * making - somebody walling themselves in mid-scrap, or breaking the floor
   * out from under an opponent, is not a fight.
   *
   * The two modes are exclusive on purpose: creative builds and cannot hit,
   * battle hits and cannot build. `combat` above is the same line drawn from
   * the other side.
   */
  const canBuild = !readOnly && mode === 'creative'

  // --- saving and loading worlds -------------------------------------------

  const [worldBusy, setWorldBusy] = useState(false)
  const [worldNote, setWorldNote] = useState<string | null>(null)

  /**
   * Save what is standing here as a named arena, or replace it with one.
   *
   * Both are copies (see domain/lounge/copy.ts), so saving does not take this
   * world away and loading does not consume the arena. That is what makes the
   * pair safe to offer next to each other: the round trip is lossless as long
   * as you saved before you loaded, which is what the confirm says.
   *
   * `worldId` rides along on both, which is the whole of what makes these work
   * in a room: undefined is the lounge, exactly as before, and a room passes
   * its own id. The arenas themselves are the space's, not a room's - one
   * tenant-wide list, so a world saved in one room can be loaded into another.
   */
  function saveAsArena() {
    const name = prompt(dict.world.nameArena)
    if (!name?.trim()) return

    setWorldBusy(true)
    setWorldNote(null)
    void saveWorldAsArena(slug, name.trim(), undefined, worldId).then((result) => {
      setWorldBusy(false)
      setWorldNote(result.ok ? `Saved as “${name.trim()}”` : result.error)
    })
  }

  function loadArena(arenaId: string, arenaName: string) {
    if (
      !confirm(
        `Replace ${worldName ? `“${worldName}”` : 'the lounge'} with “${arenaName}”?\n\nEverything currently built here is overwritten. Save it as an arena first if you want it back.`,
      )
    ) {
      return
    }

    setWorldBusy(true)
    setWorldNote(null)
    void loadArenaInto(slug, arenaId, worldId).then((result) => {
      setWorldBusy(false)
      if (!result.ok) {
        setWorldNote(refusal(result.error))
        return
      }
      // The world changed wholesale on the server and the scene has no idea -
      // it is holding the old block map. A reload is the honest way to pick up
      // tens of thousands of new blocks; replaying them optimistically is not.
      // Everybody else in the room is in exactly the same position, so they are
      // told before we go.
      roomRef.current?.({ world: true })
      window.location.reload()
    })
  }

  /*
   * There is no world panel in the HUD any more.
   *
   * It was a "Save as arena" button and an unlabelled `<select>` pinned to the
   * top-right corner, on desktop only - and every one of those things was a
   * reason nobody found it. All of it now lives on the picker's worlds tab,
   * which is one screen, on every device, next to the templates and the reset:
   * the place somebody already opens to change what the world is.
   *
   * `saveAsArena`, `loadArena`, `worldBusy` and `worldNote` above are unchanged
   * - only where they are rendered moved.
   */

  /**
   * Who a dash may hurt.
   *
   * Undefined in the lounge, where there are no sides and so nobody a charge
   * should pass through. In a match it is "anyone not on my side", which for a
   * free-for-all is everyone - the allies set is empty apart from us.
   */
  const allies = battle?.allies
  const hostile = useMemo(
    () => (allies ? (peerId: string) => !allies.has(peerId) : undefined),
    [allies],
  )

  /**
   * What colour somebody's name is.
   *
   * Only in a match that actually has sides. A free-for-all would paint
   * everybody as an enemy, which is a lot of red saying nothing you did not
   * already know - and the lounge has no sides at all.
   *
   * Worth doing precisely because friendly fire is off: without it, the first
   * thing you learn about your own team-mate is that charging them does
   * nothing, which is a poor way to find out.
   */
  const teams = battle?.teams
  const toneOf = useMemo(
    () =>
      teams && allies
        ? (peerId: string): PlateTone => (allies.has(peerId) ? 'ally' : 'enemy')
        : undefined,
    [teams, allies],
  )

  /**
   * Health, damage, going down and getting back up. See ./_hooks/use-combat.
   *
   * Called with the bundle rather than reading the context, because the provider
   * is rendered below by this component - a hook cannot read a context its own
   * caller provides.
   */
  const {
    health,
    dead,
    killedBy,
    hurt,
    hitMarks,
    dashCharging,
    kickCharging,
    takeDamage,
    burn,
    takePush,
    noteHitLanded,
    notePunch,
    noteShove,
    noteDash,
    noteKick,
    respawn,
    unstick,
  } = useCombat({ refs, combat, battle, spawn })

  /**
   * Whether the ball has stopped going anywhere, as React state.
   *
   * The one value in this file that crosses from the frame loop into a *render*
   * on purpose. `ballStuckRef` is written per frame by <Multiplayer>, and the
   * button it feeds is in the rail - which is neither in this tree nor in the
   * canvas - so something has to notice the flip and tell the store. Polled at
   * four times a second, like the HUD's countdown and the stall warning: it is a
   * boolean that changes at most once every several seconds, and re-rendering
   * this scene on a ref would be the one thing it cannot afford.
   *
   * Never while the host is stalled. The ball is motionless then too, but there
   * is nobody stepping it to hear the request - offering a button that cannot
   * work is worse than the warning that says why.
   */
  const [ballIdle, setBallIdle] = useState(false)
  const hasBall = Boolean(football)
  useEffect(() => {
    if (!hasBall) return
    const id = setInterval(() => {
      setBallIdle(ballStuckRef.current && !hostStalledRef.current)
    }, 250)
    return () => clearInterval(id)
  }, [hasBall, ballStuckRef, hostStalledRef])

  /**
   * Masked by the ball's existence rather than cleared when it goes.
   *
   * Writing `false` from the effect above when the match ends would be a
   * `setState` in an effect body - a cascading render, and the house lint rule
   * refuses it outright. The last poll before the whistle can stay where it is:
   * a world with no ball cannot offer one back either way.
   */
  const ballStuck = hasBall && ballIdle

  /** Ask the room for the ball back. The socket is <Multiplayer>'s, not ours. */
  const askForBall = useCallback(() => {
    resetBallRef.current?.()
  }, [resetBallRef])

  /**
   * The ways out of being stuck, offered to the rail's Room tab.
   *
   * Published for every world this scene draws, not only the lounge: an arena, a
   * room and a match are all places somebody can be built into a corner, and the
   * lounge has no special claim on geometry people make themselves. Keyed by the
   * world so the scene you are leaving cannot take the buttons away from the one
   * you are arriving at - see `clearStuck`.
   *
   * Here rather than beside the other two publishers a few hundred lines up,
   * because `unstick` comes out of the combat hook and a dependency array cannot
   * name something declared below it.
   */
  const sceneKey = worldId ?? 'lounge'
  useEffect(() => {
    publishStuck(sceneKey, unstick, ballStuck ? askForBall : null)
    return () => clearStuck(sceneKey)
  }, [sceneKey, unstick, ballStuck, askForBall])

  /** Set while a shot is being taken, so the HUD can say it happened. */
  const [shot, setShot] = useState<string | null>(null)

  /**
   * The room, as a picture, with none of the furniture around it.
   *
   * What makes this worth a button rather than telling somebody to press the
   * key their operating system uses: a screenshot of this page is a screenshot
   * of the *page* - crosshair, health bar, block picker, the chip saying who is
   * connected. What people actually want to send is the room. The canvas holds
   * only the world, so reading it back is the picture with the HUD already
   * gone, at whatever size the window is.
   *
   * The sky is painted in for the one frame it takes. The canvas is transparent
   * on purpose - the page's own starfield shows through it, see the note on
   * `<Canvas>` - and a PNG with a transparent sky is a cut-out of some blocks
   * rather than a picture of a place: opened anywhere with a white background,
   * the night is gone. Restored immediately afterwards, so nothing on screen
   * flickers.
   *
   * Shot from `shotPoseRef` rather than from wherever the camera happens to be,
   * and saved through ./save-shot rather than an anchor. Both have their reasons
   * written where they live.
   */
  const capture = useCallback(() => {
    const parts = shotRef.current
    if (!parts) return

    const { gl, scene: three, camera } = parts
    const previous = three.background
    const pose = shotPoseRef.current

    // The live camera, to be put back before anything else draws. The frame
    // loop would overwrite it a few milliseconds later anyway, but "a few
    // milliseconds" is a visible jump if the shutter is pressed while parked at
    // the overview - the pose below is somewhere else entirely.
    SHOT_RESTORE.position.copy(camera.position)
    SHOT_RESTORE.quaternion.copy(camera.quaternion)

    if (pose.ready) {
      camera.position.copy(pose.position)
      camera.quaternion.copy(pose.quaternion)
    }

    three.background = new THREE.Color(SKY)
    gl.render(three, camera)
    const dataUrl = gl.domElement.toDataURL('image/png')

    three.background = previous
    camera.position.copy(SHOT_RESTORE.position)
    camera.quaternion.copy(SHOT_RESTORE.quaternion)
    gl.render(three, camera)

    // A name somebody can find again: the room, then the minute. Colons are
    // legal in a filename on Linux and a problem everywhere else.
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const name = `${(worldName ?? slug).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}.png`

    // Called straight from the click, and deliberately not awaited: on iOS the
    // share sheet only opens while the gesture that asked for it is still live.
    void saveShot(dataUrl, name).then((outcome) => {
      // Nothing to announce when the sheet was dismissed - the person just said
      // no, and a receipt for a picture they declined to keep is a small lie.
      if (outcome === 'cancelled') return
      setShot(name)
      setTimeout(() => setShot(null), 2600)
    })
    // Refs from the bundle: stable, so listing them is free. See ./_scene/scene-refs.
  }, [slug, worldName, shotRef, shotPoseRef])

  const isTouch = useIsTouch()
  /* Which way round the thumbstick and the action stack go. See the anchors in
     ./_hud/touch-controls - a right-handed player steers with the left thumb. */
  const { hand } = useHand()
  // Touch has no pointer lock to be "in", so entering is just a flag. `active`
  // is what the HUD keys off, so the rest of the UI does not care which it was.
  const [touchActive, setTouchActive] = useState(false)
  const active = locked || touchActive

  /**
   * Whether this player has ever come in.
   *
   * A latch, and that is the whole point of it. `active` drops every time
   * pointer lock is released, and pointer lock is released *deliberately* all
   * over this scene - opening the block picker, editing an image, switching
   * mode, pressing Esc. Keying the controls panel off `active` therefore
   * reopened it on top of the picker the player had just asked for, which is
   * the one place it must never be.
   *
   * So the panel is what it says it is: what you see on the way into a room,
   * once. After that it is only ever summoned - by the ? button or H.
   *
   * Latched during render rather than in an effect. `active` is derived from
   * this component's own state, so the render that first sees it true is
   * already happening; an effect only bought a second render, and one in which
   * the panel was briefly missing. React re-runs this render before committing
   * anything, so the extra pass is not visible.
   */
  const [entered, setEntered] = useState(false)
  if (active && !entered) setEntered(true)

  /**
   * The controls panel, once the player is already inside.
   *
   * Separate state from `entered` because they are separate questions:
   * `entered` is "have you come in", `help.open` is "are you reading the keys".
   */
  const help = useControlsPanel()

  /**
   * Our own camera, for the switch in the HUD.
   *
   * Out of the module store rather than state here, because the same fact is
   * wanted on the other side of the canvas - `<Multiplayer>` has to put it on
   * presence, and the bodies have to draw the pictures it produces. See
   * `face-store`, which also explains why a `MediaStream` must not be a React
   * value.
   */
  const cameraSwitch = useCamera()

  /**
   * The switch itself.
   *
   * `void` rather than awaited: the answer is the browser's permission prompt,
   * which takes as long as the person takes, and the store announces the result
   * to everybody watching it. Nothing here has anything to do in the meantime.
   */
  const flipCamera = useCallback(() => {
    void toggleCamera()
  }, [])

  /** The microphone, on the same terms. Two switches, two decisions. */
  const micSwitch = useMic()
  const flipMic = useCallback(() => {
    void toggleMic()
  }, [])

  /**
   * The mode chosen at the door, and the key that obeys it.
   *
   * Mounted whether or not this space has faces, and gated on the *switch*
   * rather than the flag: with no microphone open the hook installs no
   * listeners and decides nothing, and reaching for the flag here would make
   * the one control that governs what leaves the device depend on a setting
   * belonging to somebody else.
   */
  const voice = useVoiceMode()
  const talking = usePushToTalk({ enabled: micSwitch === 'on', mode: voice.mode })

  /**
   * Whether the layout has room for the full readouts.
   *
   * A width query, not `isTouch` - see the note on `useIsTouch`. A tablet in
   * landscape is touch and has plenty of room; a narrow desktop window has a
   * mouse and does not.
   */
  const roomy = useMediaQuery('(min-width: 640px)')

  /**
   * The words this scene is read in, resolved once and handed to the two things
   * that print any: the controls list, and the HUD below it.
   */
  const dict = worldDict(useLocale())

  /**
   * The pictures on the walls. Their own aggregate, so their own hook - see
   * ./_hooks/use-images, which also owns the optimistic revert.
   *
   * Named back to what the rest of this file already calls them, so the call
   * sites below are unchanged.
   */
  const {
    images,
    setImages,
    selected: selectedImage,
    selectedImageId,
    setSelectedImageId,
    busy: imageBusy,
    error: imageError,
    setError: setImageError,
    runImage,
    dropFile: handleDropFile,
  } = useLoungeImages({ slug, initial: initialImages, readOnly, demo, target, dict, refusal })

  /**
   * The things summoned into this world, and the shelf they come off.
   *
   * Its own hook for the same reason the pictures have one - its own aggregate,
   * its own lifecycle, and nothing else in this file reads any of its state.
   * What it adds is the *preview*: `/thingiverse ball` hands you a ball rather
   * than placing one, and `carrying` below is what is in your hand.
   *
   * It also publishes the lot to `thing-store` for the rail, which is three
   * route segments above this scene and has no other way to know what is in the
   * room. See that file for why data crosses that seam when behaviour usually
   * is all that does.
   */
  /**
   * Where the things that block the way are standing.
   *
   * A mutable object rather than state, and read by the character controller
   * every frame - so it must not be a value that re-renders the scene when a
   * bench finishes loading. The renderer measures each model as it draws it and
   * writes here; see ./_sim/thing-solids for why the footprint is measured
   * rather than declared.
   */
  const thingSolids = useMemo(() => new ThingSolids(), [])

  /**
   * Where a summoned thing stands.
   *
   * A few cells in front of whoever asked for it, on whatever is there, and in
   * a spot it fits. This replaces the crosshair the preview used to follow, and
   * it had to: `/xo bench` stands a bench up rather than handing you one, so
   * there is no moment in which somebody is aiming at anything.
   *
   * A function rather than a value, called once when something is summoned,
   * because both halves of it - where the player is and which way they face -
   * are refs that change sixty times a second.
   *
   * It searches outward rather than taking the first cell: `/xo bench` puts a
   * bench down without asking, so the spot has to be one it fits in. Dropping
   * one into the wall somebody happens to be facing is worse than refusing,
   * because the only sign anything happened is a bench you cannot see.
   */
  /**
   * Take the key, and take it from everything else too.
   *
   * `preventDefault` alone asks the other listeners to notice; stopping the
   * event as well means a listener that never thought to check cannot act on
   * it. Used only where this scene is certain the key was meant for it - G at
   * a crate, a chair's own bound letter - so nothing else is ever silenced by
   * accident.
   */
  const claim = useCallback((event: KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const spot = useCallback(() => {
    const player = refs.playerRef.current
    const heading = refs.headingRef.current

    return spotFor(player, heading, REACH_AHEAD, blocks, (x, y, z) =>
      // Free means free of both: the cell a bench would stand in, and the one
      // its head would be in. Two is enough to keep it out of a wall and out of
      // whatever is already standing there, without pretending to know how big
      // the model is before it has been drawn.
      fits([blockKey(x, y, z), blockKey(x, y + 1, z)], [blocks, thingSolids]),
    )
  }, [refs, blocks, thingSolids])

  /**
   * The wheel, while this player is behind one.
   *
   * A ref because everything in it changes every frame: `stepDrive` advances
   * the state inside <PlayerControls>, the vehicle rig draws from it, and the
   * effect below only creates and clears it. Null the whole of the rest of
   * the time, which is what tells the controller to keep walking.
   */
  const driveRef = useRef<{ state: DriveState; tuning: DriveTuning } | null>(null)

  /**
   * Where the body - or the vehicle under it - is, as a cell and a quarter.
   *
   * Handed to `useThings` beside `spot` and for the same reason: both halves
   * are refs the scene owns. Two readers - `/vehicle kart` faces the summoned
   * kart the way you face, and getting out parks the thing where it stopped.
   * The cell is the *feet's*, which while driving is within the vehicle of
   * the vehicle's own origin - close enough for a parking spot, and honest
   * about what is actually known without re-deriving the seat sum here.
   */
  const pose = useCallback(() => {
    const player = refs.playerRef.current
    const heading = driveRef.current
      ? driveRef.current.state.heading
      : Math.atan2(refs.headingRef.current.x, refs.headingRef.current.z)

    return {
      x: Math.floor(player.x),
      y: Math.max(0, Math.round(player.y - EYE_HEIGHT)),
      z: Math.floor(player.z),
      facing: ((Math.round(heading / (Math.PI / 2)) % 4) + 4) % 4,
    }
  }, [refs])

  /**
   * What this body can be asked to do.
   *
   * The pack's own four, plus whatever this space animated for itself, deduped:
   * a space is allowed to make a clip called `dance`, and when it does the
   * space's is the one that plays - see `spacePose`. One name, one answer, or
   * `/clip dance` and the menu row under it would do two different things.
   *
   * Named here rather than at the menu because two things ask now: the menu
   * draws it, and `/clip wink` is checked against it.
   */
  const bodyClips = useMemo(
    () => [...new Set([...Object.values(AVATAR_CLIPS), ...initialClips.map((made) => made.name)])],
    [initialClips],
  )

  const {
    things,
    shelf: thingShelf,
    browsing,
    setBrowsing,
    announced,
    step: moveStep,
    setStep: setMoveStep,
    summon: summonThing,
    pending: carriedThing,
    carrying,
    selectedId: selectedThingId,
    error: thingError,
    setError: setThingError,
    using: usingThing,
    usingSeat,
    atWheel,
    driveIn,
    near: nearThing,
    bodyClip,
    clipMenu,
    setClipMenu,
    playClip,
    setNearId,
    enter: enterThing,
    leave: leaveThing,
    press: pressInThing,
    carry: carryThing,
    cancel: cancelSummon,
    dismiss: dismissThing,
    setFalls,
    setSolid,
    nudge: nudgeSummon,
    place: placeThing,
    move: moveThing,
    live: thingLive,
  } = useThings({
    slug,
    worldId: worldId ?? null,
    /*
      Whose loans to sweep on the way out. Empty in the demo and on the public
      showcase, which have no account and cannot summon anything anyway - so
      the sweep matches nothing, which is the right answer rather than a guard.
    */
    userId: presence?.userId ?? '',
    /*
      Who to tell. Null in the demo and on the showcase, which have no presence
      channel and nobody to tell - see the note on the things channel.
    */
    tenantId: presence?.tenantId ?? null,
    initial: initialThings,
    initialShelf,
    readOnly,
    canBuild,
    spot,
    pose,
    clips: bodyClips,
    dict,
    refusal,
  })



  /**
   * Whether running costs anything, as of this moment.
   *
   * The server's answer, unless the rail has said otherwise since - see
   * `stamina-store` for why a switch in the rail cannot simply revalidate.
   */
  const staminaOverride = useStaminaOverride()
  const staminaOn = staminaOverride ?? stamina

  /** What is in your hands is exactly where you put it. Nothing follows a look. */
  const carryAt = carriedThing?.at ?? null

  /**
   * The carried cell and the act of putting it down, as refs.
   *
   * Both are read from a document-level mousedown listener and from a pad that
   * is drawn outside the canvas, and both change as the crosshair moves - which
   * is every frame. Bound as dependencies they would tear the listener down and
   * rebuild it sixty times a second; read from a ref they are simply current.
   */
  const carryAtRef = useRef<{ x: number; y: number; z: number } | null>(null)
  /**
   * The step size, for the key handler.
   *
   * A ref because that effect must not re-register every time somebody changes
   * the size - re-registering a keydown listener mid-hold loses the keys that
   * are already down, and the thing stops moving until they are let go.
   */
  const moveStepRef = useRef(moveStep)

  const placeThingRef = useRef(placeThing)
  /** Whether anything is in your hands at all, for the same listener. */
  const carryingRef = useRef(false)
  useEffect(() => {
    carryAtRef.current = carryAt
    placeThingRef.current = placeThing
    carryingRef.current = carrying !== null
    moveStepRef.current = moveStep
  })

  /**
   * A thumb push on the pad, turned into a cell.
   *
   * The heading is read at the moment of the push rather than subscribed to,
   * because it changes sixty times a second and this reads it once per press.
   * `stepBy` snaps it to a quarter turn, so "away from me" is a whole cell
   * along one axis and the thing stays on the lattice it has to line up with.
   */
  const shoveCarried = useCallback(
    (right: number, forward: number, up: number) => {
      const at = carryAtRef.current
      if (!at) return

      const step = stepBy(Math.atan2(refs.headingRef.current.x, refs.headingRef.current.z), right, forward)

      nudgeSummon({
        at: {
          x: at.x + step.dx,
          y: Math.max(0, at.y + up),
          z: at.z + step.dz,
        },
      })
    },
    [nudgeSummon, refs],
  )

  /**
   * And the walk keys move the thing.
   *
   * While something is in hand the body is standing still - the camera is
   * parked on the object, so a step forward would move a body that is off
   * screen and change nothing anybody can see (see `framing` in the character
   * controller). Which leaves WASD free, and free next to a thing somebody is
   * trying to line up is a waste: the keys that move you move it instead.
   *
   * Camera-relative, in whole steps, at the size the pad is set to - one number
   * for both controls, or they would disagree about what "half a cell" means.
   *
   * Held rather than tapped: a key is tracked down-to-up and a clock spends it,
   * because the browser's own repeat starts late and then runs far too fast for
   * something being placed - thirty steps a second is half a room.
   */
  useEffect(() => {
    if (!carrying) return

    const down = new Set<string>()

    const push = () => {
      const right = (down.has('KeyD') ? 1 : 0) - (down.has('KeyA') ? 1 : 0)
      const ahead = (down.has('KeyW') ? 1 : 0) - (down.has('KeyS') ? 1 : 0)
      const up = (down.has('KeyR') ? 1 : 0) - (down.has('KeyF') ? 1 : 0)
      if (!right && !ahead && !up) return

      shoveCarried(right * moveStepRef.current, ahead * moveStepRef.current, up * moveStepRef.current)
    }

    const onDown = (event: KeyboardEvent) => {
      if (isTyping(event) || !CARRY_KEYS.has(event.code)) return

      claim(event)
      if (event.repeat) return

      // The first step on the press, the rest on the clock - a key that does
      // nothing until its own interval comes round reads as a key that missed.
      const first = down.size === 0
      down.add(event.code)
      if (first) {
        push()
        clock.current = setInterval(push, CARRY_STEP_MS)
      } else {
        push()
      }
    }

    const onUp = (event: KeyboardEvent) => {
      if (!CARRY_KEYS.has(event.code)) return
      down.delete(event.code)
      if (down.size > 0) return
      if (clock.current) clearInterval(clock.current)
      clock.current = null
    }

    const clock: { current: ReturnType<typeof setInterval> | null } = { current: null }

    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
      if (clock.current) clearInterval(clock.current)
    }
  }, [carrying, claim, shoveCarried])

  /**
   * Enter puts it down, Escape drops it.
   *
   * Keys as well as the panel's buttons, because both hands are already on the
   * keyboard while you line something up - and Escape especially, since the
   * panel's Cancel is a small target to hit with the pointer locked.
   *
   * Escape is *not* stopped from propagating: it also releases the pointer
   * lock, and a key that did one of its two jobs silently would read as the
   * lock being broken.
   */
  useEffect(() => {
    if (!carrying) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelSummon()
      if (event.key === 'Enter') {
        event.preventDefault()
        void placeThing(carryAtRef.current)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [carrying, cancelSummon, placeThing])

  /**
   * What you are about to put down, when it is a thing rather than a block.
   *
   * Stored as a *model id* and resolved against the shelf on every render, so
   * the chip is never out of step with the blueprint behind it: rename the
   * thing, share it, turn its gravity off, and the chip says so on the next
   * frame without anything having to remember to tell it. A copy of the row
   * would be the second answer that goes stale.
   */
  /**
   * The drawing surface, and getting it back when the browser takes it.
   *
   * Saying so was not enough: the surface usually does not return on its own,
   * and the tab keeps a dead canvas with a sad face drawn where the world was.
   * `useSurface` waits for a restore and then asks for a new canvas, which is
   * the one move that actually brings the page back. See `keep-context`.
   */
  const surface = useSurface()

  const [heldModel, setHeldModel] = useState<string | null>(null)

  const held = useMemo(() => {
    /*
      What is in your hands wins over what you last picked off the shelf.

      Both are "the kind of thing you are placing" and for most of a session
      they are the same one - but a thing picked up off the floor with E never
      went through the shelf, and reading only the shelf's answer left the
      panel with no gravity switch for exactly the things somebody is most
      likely to be re-placing.
    */
    const model = carrying?.model ?? heldModel
    if (!model) return null
    const entry = thingShelf.find((one) => one.spec.model === model)
    if (!entry) return null

    return {
      id: entry.id,
      name: entry.name,
      model,
      mine: entry.mine,
      // Null is scenery and `{}` is a crate - see `BlueprintSpec.body`. The
      // panel asks the two questions somebody changes while placing, and the
      // pair of them is what makes a ball - see `knockable`.
      falls: entry.spec.body !== null,
      solid: entry.spec.blocking,
    }
  }, [carrying, heldModel, thingShelf])

  /**
   * The clip a thing asked for, if this space made one by that name.
   *
   * Built once per name rather than per frame: `toClip` allocates a
   * `Float32Array` per bone track, and a body sitting in a chair asks for the
   * same clip sixty times a second.
   *
   * The pack's own four are *not* resolved here - `asAvatarClip` does that, and
   * the two are deliberately separate lookups. A space is allowed to make a
   * clip called `dance`, and when it does, the space's wins: somebody who keyed
   * their own dance meant that one.
   */
  const spacePose = useMemo(() => {
    if (!bodyClip) return null
    const made = initialClips.find((entry) => entry.name === bodyClip)
    return made ? toClip(made.clip) : null
  }, [bodyClip, initialClips])

  /**
   * Which things are under somebody right now, and must not be drawn parked.
   *
   * Two sources: our own wheel, and every peer's `v` field, lifted out of the
   * frame loop by <Multiplayer> when it changes. State rather than a ref
   * because <LoungeThings> renders from it - a kart has to disappear from its
   * cell in the same commit its driver starts carrying it about.
   */
  const [peerDriven, setPeerDriven] = useState<Record<string, string>>({})

  const onPeerDriving = useCallback((user: string, thingId: string | null) => {
    setPeerDriven((current) => {
      if ((current[user] ?? null) === thingId) return current
      const next = { ...current }
      if (thingId) next[user] = thingId
      else delete next[user]
      return next
    })
  }, [])

  const drivenThings = useMemo(() => {
    const set = new Set<string>(Object.values(peerDriven))
    if (atWheel && usingThing) set.add(usingThing.id)
    return set
  }, [peerDriven, atWheel, usingThing])

  /**
   * Whose wheel this seat belongs to, when you are riding rather than driving.
   *
   * Null on foot, at the wheel, and in a parked thing - the pin below is the
   * static one in all three. A user id the moment somebody's packets say they
   * hold the wheel of the thing you are sitting in, at which point your body
   * stops being pinned to the parked row and starts following theirs - see
   * <RideAlong>.
   */
  const ridingDriverId = useMemo(() => {
    if (atWheel || !usingThing) return null
    const spec = usingThing.blueprint?.spec
    if (!spec || !drivable(spec)) return null
    for (const [user, thingId] of Object.entries(peerDriven)) {
      if (thingId === usingThing.id) return user
    }
    return null
  }, [atWheel, usingThing, peerDriven])

  /**
   * Whether being aboard hides your body.
   *
   * The blueprint's own switch (`hideDriver`): a car with a roof, or a
   * football somebody rolls about as. Yours included - the room sees the
   * vehicle move, and you watch it from behind exactly as you watch your own
   * body.
   */
  const cloaked = Boolean(
    usingThing?.blueprint?.spec &&
      drivable(usingThing.blueprint.spec) &&
      usingThing.blueprint.spec.vehicle?.hideDriver,
  )

  /**
   * Where the body is pinned while it is in something, or null.
   *
   * A ref rather than state, because the character controller reads it every
   * frame and a chair should not re-render the scene. Written here and read in
   * <PlayerControls>, which is the same shape every other per-frame fact in
   * this scene takes.
   */
  const seatRef = useRef<{ x: number; y: number; z: number } | null>(null)

  const seat =
    usingThing?.blueprint?.spec.use && !atWheel
      ? seatOf(usingThing, usingThing.blueprint.spec.use, usingSeat)
      : null

  /**
   * Mirrored into the ref after the render rather than during it.
   *
   * A ref written while rendering is one React is allowed to throw away, and
   * the lint rule says so. The cost of doing it in an effect is that the pin
   * lands one frame after somebody presses E, which at sixty frames a second is
   * not a thing anybody can see - and the alternative, state, would re-render
   * the whole scene every time a chair changed hands.
   */
  useEffect(() => {
    // While riding, the pin is written per frame by <RideAlong> from the
    // driver's live pose, and the static one here - computed from the parked
    // row, which is stale the whole drive - must not clobber it on re-renders.
    if (!ridingDriverId) seatRef.current = seat
  })

  /**
   * Taking the wheel, and letting go of it.
   *
   * The drive state is born here and nowhere else: speed zero, nose where the
   * parked thing pointed, tuning straight off the blueprint. The body is set
   * into the driver's seat in the same moment - the pin above deliberately
   * does not run while driving (the physics carries the body), so without
   * this snap you would take the wheel from wherever you were standing.
   *
   * Keyed on the id rather than the row, because the row is replaced when the
   * thing is parked - by which point the wheel is already let go.
   */
  useEffect(() => {
    const spec = usingThing?.blueprint?.spec
    if (!atWheel || !usingThing || !spec?.vehicle) {
      driveRef.current = null
      return
    }

    driveRef.current = {
      state: { speed: 0, heading: (usingThing.facing * Math.PI) / 2, steer: 0 },
      tuning: { top: spec.vehicle.speed, turn: spec.vehicle.turn },
    }

    if (spec.use) {
      const at = seatOf(usingThing, spec.use, 0)
      refs.playerRef.current.set(at.x, at.y + EYE_HEIGHT, at.z)
    }
    // The row's identity churns with the list; the *drive* changes when the
    // thing or the wheel does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atWheel, usingThing?.id])

  /**
   * What the chip in the middle of the HUD is about, this second.
   *
   * The thing you are in, then the thing you are next to, then nothing - and
   * "nothing" is the block, which is what the chip has always drawn. Not the
   * thing you are *holding*: that has a panel of its own, with its name across
   * the top and every control that belongs to it, and a chip repeating it was
   * the same sentence in a second place.
   *
   * Null while carrying for the same reason - your hands are full, E is not
   * offered, and a chip promising a key that does nothing is worse than a chip
   * showing the block you will place next.
   */
  const chipNear = useMemo(() => {
    const t = dict.things

    if (usingThing) {
      return {
        name: usingThing.blueprint?.name ?? '',
        model: usingThing.blueprint?.spec.model ?? '',
        line: isTouch ? t.tapLeave : t.leaveIt,
      }
    }

    if (carrying || !nearThing) return null

    // Under somebody right now: neither key does anything, so promise nothing.
    if (drivenThings.has(nearThing.id)) return null

    // In play mode the promise is only good for things you can get into: a
    // crate you cannot lift and cannot sit on has nothing to say at all.
    const spec = nearThing.blueprint?.spec
    const usable = Boolean(spec?.use)
    if (!canBuild && !usable) return null

    const drives = Boolean(spec && drivable(spec))
    const using = usable ? (drives ? t.driveIt : t.useIt) : null

    /*
      Both verbs, when both apply.

      Two short keycap phrases fit on the chip's second line, and in a lobby
      both are true of the same chair: G sits on it, E moves it. Naming only
      one would teach the wrong half to whichever person read it - the builder
      who wanted to nudge the chair, or the guest who wanted to sit.

      On touch there are no keycaps to print. The interact verb has a button
      of its own down beside the stick, so the chip - which is what a thumb
      taps - carries the *other* one, and says so.
    */
    return {
      name: nearThing.blueprint?.name ?? '',
      model: spec?.model ?? '',
      line: isTouch
        ? canBuild
          ? t.tapPickUp
          : drives
            ? t.tapDrive
            : t.tapUse
        : [using, canBuild ? t.pickUp : null].filter(Boolean).join(' · '),
    }
  }, [canBuild, carrying, dict.things, drivenThings, isTouch, nearThing, usingThing])

  /**
   * What E does to the thing in front of you, as a function rather than a key.
   *
   * Pulled out of the key handler because the chip does it too: a phone has no
   * E, so the thing named on the chip is reached by tapping the chip, and two
   * spellings of "get into that" that drifted apart would be the kind of bug
   * only touch players ever see. Returns whether anything happened, which is
   * what tells the key handler whether to eat the press.
   */
  const interact = useCallback(() => {
    if (carrying) return false

    if (usingThing) {
      leaveThing()
      return true
    }

    if (!nearThing) return false

    // Already under somebody: its row is where the drive *began*, not where
    // the vehicle is, and boarding it would teleport you across the room onto
    // a moving kart. G goes quiet, exactly as it does at a full bench.
    if (drivenThings.has(nearThing.id)) return false

    /*
      The machine, and the table, before the seat.

      G already meant "use this thing" and now three answers share it: set a
      machine going, put something down, pick something up. They are checked
      first because a thing that answers any of them and *also* has seats - a
      cooker you can lean on - should cook rather than seat you, and because the
      seat search below returns false at a full bench, which would swallow the
      key for the half of these things that have no seats at all.

      Only one of the three fires per press. See `reachFor` for why put and take
      are one verb rather than two.
    */
    const machined = nearThing.blueprint?.spec
    if (machined && answersUse(machined)) {
      const reach = machined.craft
        ? reachFor(machined.craft, slotsOn(nearThing.id), heldNow())
        : ({ do: 'nothing' } as const)

      if (reach.do === 'put') {
        const at = heldIndex()
        // Out of the pocket first, so the item is never in two places even for
        // a frame. If the driver refuses the slot the item is gone, and that is
        // the trade this direction makes on purpose: putting is the claim you
        // can afford to lose, because you are standing at the table and can see
        // that nothing landed. Taking is the one that had to be exact - see
        // `Pulse.gave`.
        if (at !== null) takeFromPocket(at)
        claimThing({ i: nearThing.id, c: myConn(), put: [reach.socket, reach.item] })
        return true
      }

      if (reach.do === 'take') {
        const socket = reach.socket
        const ask = () =>
          // Nothing goes into the pocket here. The driver decides who got it
          // and says so on the next heartbeat, which is what stops one patty
          // becoming two when two people reach at once.
          claimThing({ i: nearThing.id, c: myConn(), took: socket })

        /*
          Free things are instant; priced ones wait for the till.

          The price is on the blueprint, which this client already has, so the
          common case - a rack in a store room - costs no round trip at all.
          Only a counter that actually charges pays for the trip, which is
          exactly where being right matters more than being quick.

          The server is asked with an id and a socket name and works the price
          out itself; no number crosses the wire. See `payToTake`.
        */
        if (priceOfSlot(machined, socket) === 0) {
          ask()
          return true
        }

        void payToTake(slug, {
          blueprintId: nearThing.blueprintId,
          socket,
        }).then((paid) => {
          if (paid.ok) ask()
          // A refusal is the till's - not enough coins, or no homestead to
          // spend from - and it belongs in front of the person who tried.
          else setThingError(paid.error)
        })
        return true
      }

      claimThing({ i: nearThing.id, c: myConn(), used: true })
      return true
    }

    /*
      No `canBuild` branch, and that is the whole of the two-key split.

      This used to pick the thing *up* whenever you could build, on the
      argument that the modes never overlap - somebody building a room is
      moving furniture, somebody playing in one is using it. In a lobby you
      are both: the same person arranges the chairs and then sits on one, and
      a single key that guessed which from the mode always guessed wrong for
      one of them. So the two verbs are two keys - E edits the thing, G uses
      it - and each one means the same thing in every mode.
    */
    const use = nearThing.blueprint?.spec.use
    if (!use) return false

    /**
     * The wheel first, when the thing in front of you drives.
     *
     * Free is judged by looking, exactly as a seat is: a body standing in the
     * driver's seat means somebody is there. A taken wheel falls through to
     * the seat search below, which is how a kart's passenger gets in - the
     * same G, one thing, two places to be in it.
     */
    const spec = nearThing.blueprint?.spec
    if (spec && drivable(spec)) {
      const wheelAt = seatOf(nearThing, use, 0)
      const bodies = [...(refs.transformsRef.current?.values() ?? [])].map(
        (peer) => peer.current,
      )
      const wheelFree = !bodies.some(
        (body) => Math.hypot(body.x - wheelAt.x, body.z - wheelAt.z) < 0.5,
      )
      if (wheelFree) {
        driveIn(nearThing)
        return true
      }
    }

    /**
     * Which seat, decided here rather than in the hook.
     *
     * Both halves of the question are refs that live in this scene: where you
     * are standing, and where everybody else's body is drawn. Neither has any
     * business being state, and passing them into the hook would mean lifting
     * the whole peer transform map across a boundary it is deliberately on one
     * side of.
     *
     * Null is a full bench, and pressing G at one does nothing - which is the
     * honest answer, and the reason the prompt is only a promise for things
     * that can be got into rather than for a seat that is free.
     */
    const player = refs.playerRef.current
    const bodies = [...(refs.transformsRef.current?.values() ?? [])].map(
      (peer) => peer.current,
    )
    const seat = freeSeat(nearThing, use, player, bodies)
    if (seat === null) return false

    enterThing(nearThing.id, seat)
    return true
  }, [
    carrying,
    driveIn,
    drivenThings,
    enterThing,
    leaveThing,
    nearThing,
    refs,
    usingThing,
  ])

  /**
   * E, the other half: pick the thing up to move or resize it.
   *
   * Creative only, and deliberately silent about anything you are *in*: a
   * chair you are sitting on is not a chair you can pocket, and standing up
   * first is what G is for. Returns whether it did anything, so the key can
   * fall through to the block palette when there is nothing to edit - which
   * is what E has always opened in open space.
   */
  const edit = useCallback(() => {
    if (carrying || !canBuild || !nearThing) return false
    if (usingThing) return false
    // Under somebody, and its row is not where it is. Same guard as `interact`.
    if (drivenThings.has(nearThing.id)) return false

    carryThing(nearThing.id)
    return true
  }, [canBuild, carrying, carryThing, drivenThings, nearThing, usingThing])

  /**
   * E and G, the two things you can do to the thing in front of you.
   *
   * E picks it up, and putting it down is the same preview a summon uses. G
   * gets you *into* it and gets you out again. One key used to do both by
   * reading the mode; see `interact` for why a lobby broke that.
   *
   * The thing's own extra keys are offered while you are in it and are checked
   * *first*, so a chair that binds Q to a wave eats the Q rather than letting it
   * through to the emote picker as well. `press` returns whether it was one.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || isTyping(event)) return

      // The shelf is a panel over the world, and every panel over this world
      // shuts on Escape. It was the one that did not.
      if (event.key === 'Escape' && browsing) {
        setBrowsing(false)
        return
      }

      if (usingThing && pressInThing(event.key)) {
        claim(event)
        return
      }

      const pressed = event.key.toLowerCase()

      /*
        The pocket.

        Above the G/E gate rather than beside it, because it is not a verb about
        the thing in front of you - it is a look at what you are carrying, and
        it should answer whether or not you are standing anywhere in particular.
      */
      if (pressed === POCKET_KEY) {
        /*
          Shift steps to the next thing in your hand without opening anything.

          Which is the binding `nextInHand` exists for: a kitchen is a place you
          move through, and opening a menu between every ingredient is the
          difference between cooking and doing data entry. Same key, because the
          two are the same idea at two speeds - look at the pocket, or just
          reach into it.
        */
        if (event.shiftKey) nextInPocket()
        else setPocketOpen((was) => !was)
        return
      }

      if (pressed !== 'g' && pressed !== 'e') return

      // A ghost in your hands already: neither key is a third meaning here.
      // Enter puts the carried thing down and Escape drops it.
      if (carrying) return

      /*
        Two keys, two verbs, and each one means the same thing in every mode.

        E edits the thing - pick it up, move it, resize it - and G uses it:
        sit down, take the wheel, get up. They were one key that guessed from
        the mode, which is fine anywhere you only build or only play, and
        wrong in a lobby, where the same person arranges the chairs and then
        sits on one.

        Each is claimed only when it did something, which is what leaves the
        other meaning of that key reachable: E over open ground falls through
        to the block palette, and G with nothing in front of you falls through
        to the dance. Both of those live in the bubble handler below, which
        checks `defaultPrevented`.
      */
      const did = pressed === 'e' ? edit() : interact()
      if (!did) return

      claim(event)
      // Sitting down, taking a wheel or picking something up ends a dance: a
      // body in a seat playing the dance loop is two idle states at once.
      setDancing(false)
    }

    /**
     * Listened for on the way *down*, not on the way up.
     *
     * This key has meant two things in this scene before - act on the thing
     * you are standing next to, and (when it was E) open the block palette -
     * and the first attempt at settling
     * that marked the event handled and had the palette check for the mark.
     * Which worked exactly until this effect re-ran: its dependencies include
     * the nearest thing, so it re-registers as you walk, and a listener
     * re-added is a listener at the *back* of the queue. From then on the
     * palette ran first and both happened, which is what was reported.
     *
     * The capture phase is not a queue position, it is a phase: a capture
     * listener on `window` runs before every bubble listener on it, whatever
     * order they were added in. So this cannot lose the race again.
     */
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [
    browsing,
    carrying,
    claim,
    edit,
    interact,
    pressInThing,
    setBrowsing,
    usingThing,
  ])

  /**
   * The one contextual thumb button, for the layer that has no keyboard.
   *
   * The same decision `act` makes on G, said as a label: get up when you are
   * in something, take when you are building, drive when it drives, use
   * otherwise. Null the rest of the time, and null is the dance - see the
   * `action` prop on <TouchLayer>.
   */
  const touchAction = useMemo(() => {
    const sk = dict.softKeys

    if (carrying) return null

    if (usingThing) return { label: sk.getUp, onPress: () => void interact() }

    if (!nearThing || drivenThings.has(nearThing.id)) return null

    const spec = nearThing.blueprint?.spec
    if (!spec?.use) return null

    return {
      label: drivable(spec) ? sk.drive : sk.use,
      onPress: () => {
        if (interact()) setDancing(false)
      },
    }
  }, [carrying, dict.softKeys, drivenThings, interact, nearThing, usingThing])

  /**
   * What pressing the chip itself does.
   *
   * The chip names one verb and has to do that one. On touch it is the edit
   * half whenever there is one, because the interact half has a button; with
   * a mouse, clicking the picture of a chair means sitting on it, and moving
   * it is a thing you reach for E to do.
   */
  const chipAct = useCallback(() => {
    if (isTouch && canBuild) {
      if (edit()) return
    }
    if (interact()) {
      setDancing(false)
      return
    }
    edit()
  }, [canBuild, edit, interact, isTouch])

  const controls = useMemo(
    () =>
      loungeControls({
        isTouch,
        flying,
        canBuild,
        combat,
        // The Tab row, and only for the pair who may press it - the panel's
        // rule is that it never promises a key that does nothing here.
        canSetMode: Boolean(canSetMode && presence),
        dict,
      }),
    [isTouch, flying, canBuild, combat, canSetMode, presence, dict],
  )

  const lookDrag = useLookDrag(lookRef, isTouch && touchActive)


  const [pickerOpen, setPickerOpen] = useState(false)
  const [resetting, startReset] = useTransition()
  /** Why the last lay was refused, shown in the worlds tab. */
  const [templateNote, setTemplateNote] = useState<string | null>(null)

  /**
   * Wipe the world and lay one of the catalogue's templates in it.
   *
   * One handler for all of them, because they differ only in what gets laid -
   * see domain/lounge/templates.ts. This replaced a `handleReset` and a
   * `handlePitch` that were the same eight lines with a different action called
   * in the middle.
   *
   * Clears local state immediately so the old world does not linger while the
   * clear-and-lay runs server-side, then refreshes to pull down what the server
   * actually wrote. Not optimistic: inventing a two-thousand-block arena
   * client-side and hoping the server agreed would be a lot of world to have to
   * take back.
   */
  function handleTemplate(templateId: string) {
    setTemplateNote(null)
    startReset(async () => {
      // Wrapped, like every other action in this scene: a throw in here is a
      // throw inside a transition, which React takes straight to the error
      // boundary - so one bad moment of signal would replace the world with a
      // crash screen. See `attempt`.
      const result = await attempt(() => applyWorldTemplate(slug, templateId, worldId))
      /**
       * A refusal is said out loud, in the panel the button is in.
       *
       * This was a bare `return`, and the panel closed on the way in - so a
       * server that said no produced a world menu sliding shut over a world
       * that had not changed, which is indistinguishable from the click not
       * landing. That is how rooms looked broken for as long as
       * `resolveWorld` did not know about them: every lay was refused with
       * "Battlefield not found" and nothing ever said so. The panel now stays
       * open until the lay succeeds.
       */
      if (!result.ok) {
        setTemplateNote(refusal(result.error ?? dict.world.layFailed))
        return
      }

      setPickerOpen(false)

      /**
       * Draw what the server just laid, from the same plan it laid it from.
       *
       * This used to clear the block map and call `router.refresh()`, and the
       * world went empty and stayed empty: `blocks` is seeded by
       * `useState(() => toBlockMap(initialBlocks))`, a lazy initialiser that
       * runs exactly once, so a refresh brings fresh props the scene has no way
       * to notice. Only a full page load ever showed the new world.
       *
       * Replaying the plan is not the "invent a world client-side and hope"
       * that the old comment here warned against - that warning was about doing
       * it *before* the write. This runs after the server has confirmed, from
       * the same pure planner (domain/lounge/templates.ts) the server used, so
       * the two cannot disagree about where a block goes.
       *
       * The goals come back from the action rather than from the plan, because
       * their ids are minted server-side and the picker needs the real ones to
       * edit or remove a goal it has just stood.
       */
      const template = findTemplate(templateId)
      if (!template) return

      const next: BlockMap = new Map()
      for (const block of template.plan().blocks) {
        next.set(blockKey(block.x, block.y, block.z), block)
      }
      setBlocks(next)
      standOn(playerRef.current, template.plan().blocks)
      setGoals(result.goals ?? [])

      // Everybody else is holding a block map for a world that no longer
      // exists. They are told which template, so they can draw it the same way
      // instead of reloading the page around a live canvas.
      roomRef.current?.({ world: true, template: templateId })
    })
  }

  /**
   * Clear the world and lay nothing back down.
   *
   * `handleTemplate` without a plan, and it is drawn locally for the same
   * reason: an empty world is the one "world" every client can render without
   * being told anything about it, so there is nothing to fetch and no reason
   * to reload the page around a live canvas. The room is told the ordinary
   * `world: true`, which is the fallback path - see `onRoom`.
   */
  function handleEmpty() {
    setTemplateNote(null)
    startReset(async () => {
      const result = await attempt(() => emptyWorld(slug, worldId))
      if (!result.ok) {
        setTemplateNote(refusal(result.error ?? dict.world.emptyFailed))
        return
      }

      setPickerOpen(false)
      setBlocks(new Map())
      setGoals([])
      roomRef.current?.({ world: true })
    })
  }

  /** Apply a change locally, then persist it. */

  /**
   * E opens the picker, Escape closes it.
   *
   * Opening releases pointer lock, which is what Minecraft does and what makes
   * the rest work: the place/break handler only fires while the pointer is
   * locked, so letting go of the mouse also disarms building. No extra guard
   * needed.
   *
   * Gated on `canBuild`, the same condition the block grid and the goal editor
   * inside the picker are gated on. In battle mode there is nothing in there to
   * press - and the release of pointer lock is not free, because it drops you
   * out of the fight to a mouse cursor mid-match.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Every branch below is a single letter, and the chat panel is a text box
      // in the same scene. Without this, "we should" opens the block picker,
      // starts a dance and throws a kick on the way past. See `isTyping`.
      if (isTyping(event)) return

      // Something nearer to hand already answered this key - a crate picked up,
      // a chair sat in. See the G handler above, which marks the event.
      if (event.defaultPrevented) return

      if (event.code === 'KeyE') {
        if (!canBuild) return
        event.preventDefault()

        /*
          The palette, always - the shelf is `/xo`.

          This used to open the shelf whenever a thing was in hand, so that the
          key agreed with the chip. The chip has since gone back to showing the
          block whenever there is no thing in front of you, and the key follows
          it: what E opens is what the chip is showing.
        */
        setPickerOpen((current) => {
          if (!current && document.pointerLockElement) document.exitPointerLock()
          return !current
        })
      } else if (event.code === 'KeyZ') {
        event.preventDefault()
        setEmotesOpen((current) => {
          // Same courtesy the block picker extends: a grid you have to click is
          // unusable while the pointer is locked to the canvas.
          if (!current && document.pointerLockElement) document.exitPointerLock()
          return !current
        })
      } else if (event.code === 'KeyV') {
        // V rather than Minecraft's F5, which the browser owns.
        event.preventDefault()
        // Leaving the mirror as well, so V is always "put the camera back".
        setMirror(false)
        setThirdPerson((current) => !current)
      } else if (event.code === 'KeyR') {
        /**
         * R for the mirror.
         *
         * A toggle rather than a hold, for the reason the dance is one: looking
         * at your own emote means throwing one *while* looking, and a key you
         * have to keep down is a key that is not free to press Z with.
         *
         * Turning it on does not touch `thirdPerson` - see the note there.
         */
        event.preventDefault()
        setMirror((current) => !current)
      } else if (event.code === 'KeyO') {
        /**
         * O for the overview.
         *
         * Deliberately not gated on `active`: the point of it is that it is a
         * view you choose, and somebody reading the chat with the pointer free
         * is exactly the person who wants to glance at the room. Turning it off
         * replays the same descent the entry does, because it is the same code.
         */
        event.preventDefault()
        setOverview((current) => !current)
      } else if (event.code === 'KeyG') {
        event.preventDefault()
        // A toggle, not a hold: dancing is something you leave running while you
        // go and read the chat, which is exactly what made it a Club Penguin verb.
        setDancing((current) => !current)
      } else if (event.code === 'KeyF') {
        event.preventDefault()
        /**
         * Only a request. Whether it becomes a dash is decided in the frame
         * loop, which is the only place that knows the cooldown, and `repeat`
         * is filtered here because holding F down must not be four dashes -
         * the key repeat rate is an OS setting, not a rate of fire.
         */
        if (!event.repeat && active) dashRef.current.requested = true
      } else if (event.code === 'KeyQ') {
        event.preventDefault()
        // Q rather than a second mouse button: both of those are building, and
        // in the rooms where you can do both, a kick must not also break a wall.
        // Filtered on `repeat` for the same reason F is.
        if (!event.repeat && active) kickRef.current.requested = true
      } else if (event.code === 'Tab') {
        /**
         * Tab flips the world between building and fighting.
         *
         * The switch is a chip in the corner of the HUD, and reaching for it
         * costs the thing the chip is for: the pointer is locked to the world,
         * so changing mode means unlocking, aiming at a ten-pixel button and
         * clicking back in. Which is fine once and wrong every time after that,
         * because the two modes are a pair somebody flips between while showing
         * a room what it does.
         *
         * Exactly the button's own gate - `canSetMode` is the owner/admin pair,
         * and without `presence` there is nobody to tell - so this can never do
         * something the corner of the screen says is not offered.
         *
         * And only while somebody is actually driving, which no other key here
         * needs and this one does. Tab is how a keyboard reaches a panel's
         * buttons, and the moment a panel is open - the block picker, the
         * emotes - the pointer is unlocked and `active` is false: so the key
         * belongs to the browser again exactly when a person is using it to get
         * around. Anybody who may not flip the mode never loses it at all.
         */
        if (!active || !canSetMode || !presence || modeBusy) return
        event.preventDefault()
        // Held down is one flip, not a mode per key repeat - each of those is
        // a write, and a room being told twenty times which mode it is in.
        if (!event.repeat) changeMode(mode === 'battle' ? 'creative' : 'battle')
      } else if (event.code === 'Escape') {
        setPickerOpen(false)
        setEmotesOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // Refs from the bundle: stable, so listing them is free. See ./_scene/scene-refs.
  }, [active, canBuild, canSetMode, changeMode, dashRef, kickRef, mode, modeBusy, presence])

  // The click handler needs the *current* target without re-subscribing a DOM
  // listener every time the crosshair moves, which is many times a second.
  // `selected` is not in the same boat - it changes only when someone clicks
  // the palette, so it can just be a dependency below.
  const targetRef = useRef<Target>(NO_TARGET)

  const { queuePlace, queueRemove, pending, error, saving } = useEditBuffer(slug, worldId, {
    persist: !demo,
  })

  const place = useCallback(
    (cell: Cell, model: string) => {
      if (!canBuild) return
      if (!inWorld(cell)) return

      setBlocks((current) => withBlock(current, cell, model))

      // Only when a block actually appears. Asked of the ref rather than of the
      // updater above, because a state updater runs during the next render and
      // anything it sets is still false by the time this line reads it - and
      // `withBlock` hands the same map back when nothing changed, which is the
      // same fact said the other way round.
      if (withBlock(blocksRef.current, cell, model) !== blocksRef.current) play('build')

      queuePlace({ ...cell, model })
    },
    [queuePlace, canBuild],
  )

  const remove = useCallback(
    (cell: Cell) => {
      if (!canBuild) return

      setBlocks((current) => withoutBlock(current, cell))

      // Same rule, and the same reason, as `place`: swinging at air is silent.
      if (withoutBlock(blocksRef.current, cell) !== blocksRef.current) play('demolish')

      queueRemove(cell)
    },
    [queueRemove, canBuild],
  )

  const onTarget = useCallback((next: Target) => {
    targetRef.current = next
    setTarget(next)
  }, [])

  /**
   * What a press does to whatever is under the pointer.
   *
   * Named by mouse button because that is the vocabulary the room already had -
   * 0 takes a block away, 2 puts one there - and because the two callers are a
   * mouse and a pair of controllers doing the same two jobs with the trigger and
   * the grip. Everything interesting in here is a judgement about the *target*
   * rather than about the input: an image wins over a block, an empty cell is
   * not a thing to break, a read-only room refuses both. None of that is worth
   * having a second copy of in the headset.
   *
   * Pointer lock is not tested here, only by the listener below - in VR there is
   * no cursor to have captured, and requiring one would be requiring a mouse.
   */
  /**
   * What the in-world menu has under the pointer, or null.
   *
   * A ref rather than state: it changes every frame while a hand moves, and a
   * re-render of the whole lounge per frame is not a price a highlight is worth.
   * The menu writes it; `actOnTarget` reads it when the trigger goes.
   */
  const vrMenuAim = useRef<VrMenuAim>(null)
  const noteVrAim = useCallback((next: VrMenuAim) => {
    vrMenuAim.current = next
  }, [])

  const actOnTarget = useCallback(
    (button: 0 | 2) => {
      /**
       * The in-world menu first, because it is in front of the world.
       *
       * Only the trigger, not the grip: the grip places blocks, and a menu that
       * answered to both would mean somebody choosing a block with one finger
       * and changing mode with the other without meaning to.
       *
       * The panel already stops the ray - see `stopsRay` in ./_canvas/building -
       * so there is no target behind it to fall through to, and nothing here has
       * to suppress anything. This is the whole of the wiring: the menu reports
       * what is under the pointer and the scene, which owns the state, decides
       * what that means. A second way to change mode would be a second thing
       * that can disagree about what mode it is.
       */
      /**
       * Something in your hands takes the click, before anything else does.
       *
       * Building is the same two buttons - left breaks a block, right places
       * one - so without this, lining a bench up against a wall and clicking
       * puts a *block* there instead, and the bench is still in your hands. The
       * report was exactly that: "the blocks are blocking the placing".
       *
       * Both buttons are swallowed rather than only the left one. Right-click
       * while holding something is somebody reaching for the other way to
       * place, not somebody asking for a block behind it.
       */
      if (carryingRef.current) {
        if (button === 0) void placeThingRef.current(carryAtRef.current)
        return
      }

      const onMenu = vrMenuAim.current
      if (onMenu) {
        if (button === 0) {
          if (onMenu.kind === 'block') setSelected(onMenu.model)
          else if (canSetMode && presence) changeMode(onMenu.mode)
        }
        return
      }

      const current = targetRef.current

      // An image under the crosshair takes precedence over building. Selecting
      // it also releases the pointer, because the edit menu is ordinary DOM and
      // unusable while the cursor is captured - the same trade the block picker
      // makes when it opens.
      if (current.image) {
        if (button === 0) {
          setSelectedImageId(current.image)
          document.exitPointerLock()
        }
        return
      }

      if (button === 0 && current.hit) {
        remove(current.hit)
      } else if (button === 2 && current.place) {
        /**
         * Another one, where you are pointing.
         *
         * The same button that places another block, because it is the same
         * act - you have something in hand and you are putting one down. It
         * drops to the surface under the crosshair rather than sitting in the
         * cell against the face, for the reason `dropTo` gives: that cell is
         * right for a cube and hangs a bench in the air beside a wall.
         */
        if (held) {
          const cell = current.place
          summonThing({
            kind: 'blueprint',
            id: held.id,
            name: held.name,
            model: held.model,
            mine: held.mine,
          })
        } else {
          place(current.place, selected)
        }
      }
    },
    [place, remove, selected, canSetMode, presence, changeMode, setSelectedImageId],
  )

  // Clicks come from the document, not from the canvas. Under pointer lock the
  // cursor does not move, so react-three-fiber's pointer events never fire -
  // the crosshair is the cursor, and the ray is cast from screen centre.
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (!document.pointerLockElement) return
      if (event.button !== 0 && event.button !== 2) return
      event.preventDefault()
      actOnTarget(event.button)
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [actOnTarget])

  const grouped = useMemo(() => {
    const groups = new Map<string, Cell[]>()
    for (const block of blocks.values()) {
      const bucket = groups.get(block.model)
      if (bucket) bucket.push(block)
      else groups.set(block.model, [block])
    }
    return groups
  }, [blocks])

  /**
   * The marks the ball can score in.
   *
   * Memoised because it is handed to `<Multiplayer>`, which holds it behind a ref
   * for the frame loop - a fresh array on every render would churn that for no
   * reason. See the note where it is passed.
   */
  const pitchGoals = useMemo(() => scoringGoals(goals), [goals])

  /**
   * The goal being changed right now, so its row can be disabled.
   *
   * One id rather than a set: these are single clicks on a two-row list, and letting
   * somebody queue three resizes on one goal would just mean three events racing to
   * describe the same width.
   */
  const [goalBusy, setGoalBusy] = useState<string | null>(null)

  /**
   * Run a goal command, putting the world back if it is refused.
   *
   * The same treatment images get, and for the same reason: a goal change is rare,
   * individually visible, and worth showing immediately - but the action deliberately
   * does not revalidate, so nothing is coming back to correct an optimistic guess.
   * If the server says no, the only thing that can undo it is us.
   */
  const runGoal = useCallback(
    async (
      id: string,
      /**
       * The list as it was, for putting back.
       *
       * Passed in rather than read from a ref: every caller is inside a memo that
       * already closes over the current goals, so the pre-change list is right there -
       * and mirroring state into a ref just to read it again is the kind of thing that
       * goes stale the one time it matters.
       */
      before: Goal[],
      optimistic: (goals: Goal[]) => Goal[],
      command: () => Promise<{ ok: boolean; error?: string }>,
    ) => {
      setGoalBusy(id)
      setGoals(optimistic)

      const result = await attempt(command)
      setGoalBusy(null)
      if (!result.ok) setGoals(before)
    },
    [],
  )

  /**
   * The door, as this session has it.
   *
   * State rather than the prop straight through, so moving it redraws the ring
   * on the floor at once. `spawnAt` is read once by the page and nothing
   * revalidates the route while a canvas is live - see the note on every action
   * in domain/lounge/actions.ts - so without this the ring would stay where it
   * was until a full reload, which reads as the button having done nothing.
   */
  const [doorAt, setDoorAt] = useState<{ x: number; z: number; y: number | null } | null>(
    /**
     * The height comes with it.
     *
     * Dropped here originally, and that alone was enough to make a door on a
     * floating island look like it had not taken: the row stores the surface,
     * the arrival reads it, and the ring drawn on the floor was handed a pair
     * of numbers with the height already thrown away - so it settled on the
     * lowest clear surface, which under an island is the ground twenty blocks
     * down. See `SpawnMark`.
     */
    spawnAt ? { x: spawnAt.x, z: spawnAt.z, y: spawnAt.y ?? null } : null,
  )
  const [doorBusy, setDoorBusy] = useState(false)
  const [doorError, setDoorError] = useState<string | null>(null)

  /**
   * Whether the ring is drawn on the floor of this world.
   *
   * Seeded from the row the page read and written back through the log's own
   * table, not stored on the device: how a room looks is a property of the room,
   * so an owner who tidies the chalk away has tidied it away for everybody
   * walking in - and finds it still away on their phone. See
   * 20260914000000_world_spawn_ring.
   *
   * State as well as a write, because nothing revalidates this route while a
   * canvas is live and a ring that only vanished on the next full reload would
   * read as a switch that did nothing.
   */
  const [doorRing, setDoorRing] = useState(spawnAt?.showRing ?? true)

  const showDoorRing = useCallback(
    (next: boolean) => {
      // Optimistic, and put back if the server refuses - the same shape every
      // other edit in this scene uses. See `runGoal`.
      setDoorRing(next)
      void (async () => {
        setDoorError(null)
        const result = await attempt(() => setWorldSpawnRing(slug, next, worldId))
        if (!result.ok) {
          setDoorRing(!next)
          setDoorError(refusal(result.error))
        }
      })()
    },
    [slug, worldId, refusal],
  )

  /**
   * The Arrival tab's controls, or null for anybody who cannot move the door.
   *
   * Separate from `goalControls` on purpose - see `SpawnControls` in the picker.
   * A spawn is not a mark, and the one place the two got filed together was
   * immediately confusing next to a race's `start`.
   *
   * `canModerate` is the owner/admin pair this scene already carries, and the
   * same pair the `world_spawns` policy allows. A button that always comes back
   * "only an owner can do that" is a worse answer than no button.
   */
  const spawnControls = useMemo(
    () =>
      canModerate
        ? {
            at: doorAt,
            busy: doorBusy,
            error: doorError,
            visible: doorRing,
            onVisible: showDoorRing,
            onSet: () => {
              // The cell under the player's feet, like a mark. Whole cells,
              // because `arrivalCell` spreads whole-cell offsets around it.
              const at = playerRef.current
              /**
               * And the surface being stood on, so a door set on a floating
               * island is on the island.
               *
               * Without it a spawn is a floor tile: the arrival picks the
               * lowest clear surface in the column, which under anything
               * floating is the ground far below the thing you were standing
               * on. `playerRef` holds the eye, so the feet are a head-height
               * below it, and the surface is the cell boundary under them.
               */
              const cell = {
                x: Math.floor(at.x),
                z: Math.floor(at.z),
                y: Math.round(at.y - EYE_HEIGHT),
              }

              void (async () => {
                setDoorBusy(true)
                setDoorError(null)
                const result = await attempt(() => setWorldSpawn(slug, cell, worldId))
                setDoorBusy(false)
                if (result.ok) setDoorAt(cell)
                else setDoorError(refusal(result.error))
              })()
            },
            onClear: () => {
              void (async () => {
                setDoorBusy(true)
                setDoorError(null)
                const result = await attempt(() => clearWorldSpawn(slug, worldId))
                setDoorBusy(false)
                if (result.ok) setDoorAt(null)
                else setDoorError(refusal(result.error))
              })()
            },
          }
        : null,
    // Refs from the bundle: stable, so listing them is free. See ./_scene/scene-refs.
    [canModerate, doorAt, doorBusy, doorError, doorRing, showDoorRing, slug, worldId, playerRef, refusal],
  )

  const goalControls = useMemo(
    () => ({
      list: goals,
      /**
       * Stood where the player is standing, on the ground under them.
       *
       * Placed at the player rather than at the crosshair because a goal is five
       * cells wide and aiming the *centre* of something that size at a distant block
       * is guesswork - walking to where you want it and dropping it there is both
       * easier and how you would place a big thing in any other builder.
       */
      onAdd: (kind: GoalKind) => {
        const at = playerRef.current
        const x = Math.floor(at.x)
        const z = Math.floor(at.z)
        // Feet, not eyes: a goal stands on the floor you are standing on.
        const y = Math.max(0, Math.floor(at.y - EYE_HEIGHT))

        // A race line goes down wider than a goal - it is a grid to line up on
        // and a plane that has to be hard to run around. See DEFAULT_LINE_WIDTH.
        const isLine = kind === 'start' || kind === 'finish'
        const width = isLine ? DEFAULT_LINE_WIDTH : DEFAULT_GOAL_WIDTH
        const height = isLine ? DEFAULT_LINE_HEIGHT : DEFAULT_GOAL_HEIGHT

        void (async () => {
          setGoalBusy('new')
          // `attempt`, so a dropped connection cannot leave the picker's
          // spinner running for the rest of the session: a throw here would
          // skip the setGoalBusy(null) below and every goal button with it.
          const result = await attempt(() =>
            placeGoal(slug, { kind, x, y, z, width, height }, worldId),
          )
          setGoalBusy(null)

          if (result.ok) {
            setGoals((current) => [
              ...current,
              { id: result.id, kind, x, y, z, width, height, facing: 0 },
            ])
          }
        })()
      },
      /**
       * The template's two goals, without the template.
       *
       * For a world somebody already built in: the pitch button flattens
       * everything first, and "I want to play football in the arena we made" is
       * exactly the case where that is the wrong offer. Same positions as the
       * template's pair, so a pitch laid later lines up with these.
       *
       * Sequential rather than parallel, deliberately - each placeGoal counts
       * the goals already standing against the per-world cap, and two counts
       * racing each other is how a world ends up one over it.
       */
      onAddPair: () => {
        void (async () => {
          setGoalBusy('new')
          for (const goal of planGoalPair()) {
            const result = await attempt(() => placeGoal(slug, goal, worldId))
            if (result.ok) {
              setGoals((current) => [...current, { id: result.id, ...goal }])
            }
          }
          setGoalBusy(null)
        })()
      },
      onResize: (id: string, width: number, height: number) => {
        void runGoal(
          id,
          goals,
          (current) =>
            current.map((goal) => (goal.id === id ? { ...goal, width, height } : goal)),
          () => resizeGoal(slug, { id, width, height }, worldId),
        )
      },
      onRotate: (id: string) => {
        const facing = ((goals.find((goal) => goal.id === id)?.facing ?? 0) + 1) % 4
        void runGoal(
          id,
          goals,
          (current) => current.map((goal) => (goal.id === id ? { ...goal, facing } : goal)),
          () => rotateGoal(slug, { id, facing }, worldId),
        )
      },
      onTeam: (id: string, kind: GoalKind) => {
        void runGoal(
          id,
          goals,
          (current) => current.map((goal) => (goal.id === id ? { ...goal, kind } : goal)),
          () => setGoalTeam(slug, { id, kind }, worldId),
        )
      },
      onRemove: (id: string) => {
        void runGoal(
          id,
          goals,
          (current) => current.filter((goal) => goal.id !== id),
          () => removeGoal(slug, id, worldId),
        )
      },
      busy: goalBusy,
    }),
    [goals, goalBusy, runGoal, slug, worldId, playerRef],
  )


  return (
    /*
      The refs, in reach of the whole scene.

      Outside the <Canvas> rather than inside it, because the HUD below is
      outside one too: the thumbstick writes `moveRef` and the character
      controller reads it, and those two live in different renderers. R3F bridges
      context across that boundary, so one provider out here serves both. See
      ./scene-refs.
    */
    <SceneRefsProvider refs={refs}>
      {/* Renders nothing outside Telegram. Inside it, this is what takes the
          room out from under the client's own header and stops the phone
          rotating mid-match - held for as long as the scene is mounted, so
          walking out of the room hands the header straight back. */}
      <TelegramFullscreen />
      {/* Taller than it was: the row of header links this used to sit under is a
          rail down the side now, so the only thing above the world is the page's
          own padding. */}
      {/* `h-viewport-inset` rather than an arbitrary `dvh` value: without a `vh`
          fallback this is zero pixels tall on any browser older than Chrome 108,
          and the world inside it is drawn into nothing. See globals.css. */}
      {/* `playing` is what stops a drag across the world painting the HUD blue -
          see globals.css. On the scene and not on the page, so the rail beside
          it keeps its own selectable text, and anything in here somebody has to
          copy says so with `data-selectable`. */}
      <div className="playing h-viewport-inset relative w-full">
        {/*
          The dream framing. A radial mask feathers the canvas out to nothing at
          the edges instead of ending on a hard rectangle, which is what makes it
          read as a vision rather than a viewport. Done in CSS because a
          post-processing pass would mean another renderer dependency for an
          effect that is, in the end, a soft-edged oval.

          No background of its own any more. The canvas underneath is transparent,
          so what shows through the feathered edge is the page's own sky - the
          same starfield the dashboard sits in - rather than a pale rectangle that
          had to be masked to stop it looking like a window.
        */}
        <div
          className="absolute inset-0 touch-none overflow-hidden rounded-[3rem]"
          onDragOver={(event) => {
            // Without preventDefault the browser navigates to the dropped file.
            if (!readOnly) event.preventDefault()
          }}
          onDrop={(event) => {
            if (readOnly) return
            event.preventDefault()

            /**
             * A model dragged out of the shelf, and dropped into the room.
             *
             * The same drop the pictures already use, carrying a *model id*
             * instead of a file - which is why it is checked first: a browser
             * hands both over on the same event, and a drag that had neither
             * falls through to the picture path exactly as it did before.
             *
             * It puts the thing in your hands rather than on the floor. The
             * drop tells us *what*, and where a bench goes is a decision worth
             * a second look - the preview is already the place that decision is
             * made, with a turn, a size and a box round it.
             */
            const model = event.dataTransfer?.getData(THING_DRAG) ?? ''
            if (model) {
              summonThing({ kind: 'model', model, name: nameForModel(model) })
              return
            }

            const file = Array.from(event.dataTransfer?.files ?? []).find((candidate) =>
              candidate.type.startsWith('image/'),
            )
            if (file) void handleDropFile(file)
          }}
          {...(isTouch ? lookDrag : {})}
          style={{
            maskImage:
              'radial-gradient(ellipse 78% 78% at 50% 50%, black 55%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 78% 78% at 50% 50%, black 55%, transparent 100%)',
          }}
        >
          {/* No rotation set, so the camera starts looking level along -Z rather
              than angled down at the floor it is standing on. */}
          {/*
            No `<color attach="background">`, on purpose.

            A scene background is an opaque clear colour, and an opaque clear
            colour is a wall - the starfield, the blooms and the shooting stars
            all stop dead at the edge of the canvas. Leaving it unset lets the
            renderer clear to transparent, so the sky the rest of the app is
            painted on is the sky this world is built in. That is the whole of
            "seamless": one background, and the world standing in it.
          */}
          {/*
            `preserveDrawingBuffer` is here for the shutter and nothing else.

            Without it a driver is free to throw the colour buffer away as soon as
            it has been shown, and `toDataURL` reads back a transparent rectangle
            on most of them - which is a screenshot button that silently saves
            nothing. It costs a copy per frame, which is the price of the feature;
            the studio canvases in ovaloffice/studio pay the same one for the same
            reason.
          */}
          <Canvas
            /*
              Changed when the surface has been taken and did not come back: a
              new canvas asks for a context of its own, which is the only thing
              that reliably works. See `useSurface`.
            */
            key={surface.key}
            shadows="percentage"
            camera={{ position: spawn, fov: 70, far: 600 }}
            /* Where the resolution starts. See <AdaptiveResolution>, which owns
               it from the first measurement onwards. */
            dpr={ADAPTIVE_DPR}
            gl={{ preserveDrawingBuffer: true }}
          >
            <AdaptiveResolution />
            <KeepContext onChange={surface.watch} />
            <Shutter />
            {/* Fog, lights, and the party's rig while it is on. See ./lounge-sky. */}
            <LoungeLighting party={party} />

            {/*
              One boundary per model rather than one around all of them, so the
              world materialises model by model as each glTF lands instead of
              waiting on the slowest file in the palette. A world built from eight
              blocks used to be entirely absent until the eighth arrived.

              The fallback is the same field of cells drawn as rainbow glass, so
              the shape of the place is there from the first frame and only its
              surfaces are pending.
            */}
            {/*
              Rainbow mode wraps the build and the pictures on the walls, and
              stops short of the bodies: `<SelfAvatar>` and the peers below are
              outside it on purpose. Props are excluded by the switch rather than
              by where the provider sits - see `useRainbowFor`.
            */}
            <Rainbow world={rainbow} props={false}>
              {[...grouped.entries()].map(([model, positions]) => (
                <Suspense key={model} fallback={<BlockPlaceholders positions={positions} />}>
                  <BlockInstances model={model} positions={positions} />
                </Suspense>
              ))}

              <LoungeImages
                images={images}
                selectedId={selectedImageId}
                onSelect={setSelectedImageId}
              />

              {/*
                Inside <Rainbow> with the blocks and the pictures, because a
                summoned thing is scenery: rainbow mode repaints the world and a
                bench that stayed wooden while the wall behind it turned to glass
                would look like the bench had been missed.
              */}
              <LoungeThings
                things={things}
                selectedId={selectedThingId}
                carrying={carriedThing?.movingId ?? null}
                hidden={drivenThings}
                solids={thingSolids}
                ground={blocks}
                /*
                  Where a kicked thing came to rest. Only for somebody who may
                  build: a visitor in a read-only room can knock a ball about
                  for as long as they are standing there, and the room forgets
                  it - which is the same promise every other thing keeps.
                */
                onMoved={canBuild ? moveThing : undefined}
                /*
                  The wire the machines talk over. Handed down rather than
                  reached for: the socket belongs to `use-things`, which lives
                  out here, and the clock that reads it has to live inside the
                  Canvas.
                */
                live={thingLive}
                /*
                  The same `combat` that decides whether *people* can hit each
                  other, and deliberately not a second switch. A room where a
                  dash does nothing to a person and takes a crate apart would be
                  a room with two answers to one question - and in creative mode
                  the E that would swing is the E that picks the crate up.
                */
                fighting={combat}
              />
            </Rainbow>

            <CosmicGround />
            <SelfAvatar
              model={wearing}
              /*
                A clip a thing is making the body play, mapped onto the four this
                rig actually has. A blueprint may name any clip - which clips
                exist is the body's business, and this app has two kinds of body
                - so a name this pack does not carry arrives as null and the
                body simply stands there, which is what a chair with a missing
                clip should look like.
              */
              posing={asAvatarClip(bodyClip)}
              pose={spacePose}
              // Our own side. Always 'ally' when there is one - the ring says
              // which colour you are, and you are on your own side by definition.
              tone={teams ? 'ally' : undefined}
              // Visible in the mirror too, and obviously so: the mirror exists to
              // look at this body, and first-person hides it. A vehicle that
              // swallows its driver hides it everywhere - see `cloaked`.
              visible={(thirdPerson || mirror) && !cloaked}
              dancing={dancing}
              party={party ? (presence?.userId ?? 'you') : null}
              partyHost={Boolean(presence && partyHost === presence.userId)}
            />
            {/*
              The kart under your own body, while you are at its wheel. A
              sibling of <SelfAvatar> rather than part of the things above,
              because while it is driven it is not furniture - it follows the
              player ref, and its parked row is hidden with `drivenThings`.
            */}
            {atWheel && usingThing && (
              <DrivenVehicle thing={usingThing} drive={driveRef} />
            )}
            {/*
              Riding along: while somebody else holds the wheel of the thing
              you are sitting in, your seat follows their live body instead of
              the parked row. Writes the same pin the chair writes, per frame.
            */}
            {ridingDriverId && usingThing && (
              <RideAlong
                thing={usingThing}
                seat={usingSeat}
                driverId={ridingDriverId}
                seatRef={seatRef}
              />
            )}
            {presence && (
              <Multiplayer
                topic={
                  presence.battleId
                    ? battleTopic(presence.battleId)
                    : presence.roomId
                      ? roomTopic(presence.roomId)
                      : loungeTopic(presence.tenantId)
                }
                userId={presence.userId}
                name={presence.name}
                avatar={wearing}
                dancing={dancing}
                aboard={
                  usingThing?.blueprint?.spec && drivable(usingThing.blueprint.spec)
                    ? { thing: usingThing.id, seat: atWheel ? 0 : usingSeat }
                    : null
                }
                onDriving={onPeerDriving}
                health={health}
                roomRef={roomRef}
                onRoom={onRoom}
                hostile={hostile}
                toneOf={toneOf}
                football={
                  football
                    ? {
                        /**
                         * The goals, and only the goals.
                         *
                         * A world can hold a race's start and finish as well, and
                         * they are the same shape of plane - so without this the
                         * ball rolling over a finish line would be a goal, awarded
                         * to a side picked by which colour the line was not. The
                         * ball is asked about the marks that score.
                         */
                        goals: pitchGoals,
                        // The block map, as the ball's own wall test. Rebuilt on every
                        // placement, which is why <Multiplayer> holds this behind a ref
                        // rather than in its channel effect's dependencies.
                        isSolid: (x, y, z) => blocks.has(blockKey(x, y, z)),
                        ballRef,
                        pauseRef: kickoffRef,
                        stalledRef: hostStalledRef,
                        stuckRef: ballStuckRef,
                        onGoal: football.onGoal,
                        sideOf: football.sideOf,
                        live: football.live,
                      }
                    : undefined
                }
                onStatus={setPresenceStatus}
                onCount={setPeerCount}
                onPeers={notePeers}
                onDamaged={takeDamage}
                onHitLanded={noteHitLanded}
                onPushed={takePush}
                party={party}
                partyHost={partyHost}
                faces={faces}
                // The workspace the row belongs to, which `topic` cannot supply
                // on its own - a battle room may hold two spaces, and a hall
                // topic names a room rather than its owner.
                perf={perf ? { tenantId: presence.tenantId } : undefined}
              />
            )}

            {/*
              Drawn after the peers and before the ball, which puts them exactly
              where a person would be in this list. `spawn[1]` is the surface the
              player arrives on, and the hosts stand on the same paving - see the
              note on `feetY`.
            */}
            {companions && companions.length > 0 && (
              <Companions
                companions={companions}
                feetY={spawn[1] - EYE_HEIGHT}
                /**
                 * Never in a room with peers in it.
                 *
                 * Judging a dash consumes it, and `<Multiplayer>` above consumes
                 * the same one to decide who it caught - so in a scene with both,
                 * whichever ran first would eat the other's sweeps. `!presence`
                 * is the test rather than `demo` because it is the *channel* that
                 * makes the second arbiter, not the log.
                 */
                hittable={combat && !presence}
                onPunch={notePunch}
                onShove={noteShove}
              />
            )}

            {/*
              People on the hotspot.

              The same two components the homestead uses, handed a `Room` built
              out of a data channel instead of a Realtime one - so nothing in
              here knows a second transport exists. `<PresenceSender>` puts
              twelve positions a second on the wire and `<RemotePeeps>` draws
              everybody else out of the transform map inside the frame loop.

              A sibling of `<Multiplayer>` rather than a replacement: they are
              different rooms reached different ways, and nothing has both.
            */}
            {nearby && (
              <>
                <PresenceSender room={nearby} playerRef={playerRef} dancing={dancing} />
                <RemotePeeps room={nearby} />
              </>
            )}

            {/* Part of the world, so drawn in every mode - see `initialGoals`. */}
            <Goals goals={goals} />

            {/*
              Where people come in.

              Not in a race, and that is the one exclusion worth making: a race
              puts everybody on the start line, so a ring at the door would be
              pointing at a spot nobody arrives on. Everywhere else it is the
              truth - `spawn` above resolves to exactly this cell when nothing
              more specific applies.

              The ring is the whole landing area, not a dot on the anchor - see
              `SpawnMark`, which derives its size from `ARRIVAL_CELLS` so that
              "you land inside the ring" is something the drawing can promise.
            */}
            {!racing && doorAt && doorRing && (
              <SpawnMark at={doorAt} blocks={initialBlocks} />
            )}
            {football && <FootballBall />}
            {race && (
              <FinishLine goals={goals} live={race.live} onFinish={race.onFinish} />
            )}
            {/*
              A sibling of the world rather than a wrapper round it, and mounted
              only where a room is meant to be worn. See ./_canvas/vr, which
              explains why `<XR>` does not have to contain the scene it renders.
            */}
            {vr && <VrLayer onAct={actOnTarget} />}
            {/*
              The chrome, in the room. Inside the Canvas because in a session
              nothing outside it is drawn at all - the switch and the picker are
              DOM, so a headset shows neither. See ./_canvas/vr-menu.
            */}
            {vr && (
              <Suspense fallback={null}>
                <VrMenu ray={vrRayRef} onAim={noteVrAim} selected={selected} mode={mode} />
              </Suspense>
            )}
            <Targeting onTarget={onTarget} vrRay={vrRayRef} />
            {/*
              What you are standing next to, answered inside the Canvas because
              it depends on where the player is this frame. Everything counts in
              creative mode, where E is "pick that up"; only what can be got into
              counts while playing, where the prompt is a promise.
            */}
            <Usables things={things} all={canBuild} onNear={setNearId} />
            {canBuild && <Preview target={target} />}
            {carrying && (
              <ThingPreview
                model={carrying.model}
                cell={carryAt}
                facing={carriedThing?.facing ?? 0}
                scale={carriedThing?.scale ?? 1}
              />
            )}
            <PlayerControls
              onLockChange={setLocked}
              pointerLock={!isTouch}
              thirdPerson={thirdPerson}
              mirror={mirror}
              fly={flying}
              blocks={blocks}
              solids={thingSolids}
              seat={seatRef}
              drive={driveRef}
              focus={carryAtRef}
              stamina={staminaOn}
              combat={combat}
              dead={dead}
              onDash={noteDash}
              onKick={noteKick}
              onBurn={burn}
              watching={!entered || overview}
            />
          </Canvas>

          {/*
            Said over the canvas rather than instead of it: the surface may come
            back on its own, and a scene torn down to show a message could not
            take it back if it did.
          */}
          {surface.lost && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0616]/90 p-6 text-center">
              <div className="max-w-sm">
                <p className="text-sm font-medium text-ink">{dict.hud.lostTitle}</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  {dict.hud.lostBody}
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 rounded-full border border-fuchsia-400/50 px-4 py-1.5 text-xs text-fuchsia-200 transition hover:bg-fuchsia-500/15"
                >
                  {dict.hud.lostReload}
                </button>
              </div>
            </div>
          )}
        </div>

        {/*
          Vignette on top of the mask, in the sky's colour.

          It was white, from when this world was a daylight daydream, and against
          a night scene on a night page it read as a lightbox around the viewport.
          Painting the edge in the page's own indigo does the opposite job with
          the same trick: the mask fades the canvas out, and this carries the fade
          the last of the way into the background so there is no border to find.
        */}
        <div className="pointer-events-none absolute inset-0 rounded-[3rem] shadow-[inset_0_0_140px_60px_#0a0616]" />

        {/*
          The rain, over everything and under nothing: same rounding and the
          same clip as the viewport, so it stops at the room's edge rather than
          squaring off the corners the whole scene is drawn inside.

          Mounted only while it runs. It holds a canvas and a rAF loop, and a
          layer that is present-but-idle for the whole session is a loop
          somebody eventually forgets is there.
        */}
        {swap !== null && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3rem]">
            <BodySwap seed={swap} onDone={() => setSwap(null)} />
          </div>
        )}

        {/*
          The way out to the café, the house and the garden used to be a bar
          floating here. It is in the workspace rail now - see `inLounge` above,
          which is what tells the rail this is the lounge and who is in it. The
          scene keeps the viewport it was fighting that bar for.
        */}

        {/*
          Gated on a channel *or* a body of your own.

          It was `presence` alone, for the reason the travel bar is: the public
          showcase has nobody to broadcast a face to, so the button would be a
          control that silently does nothing.

          That reasoning does not reach the demo and the lobby. `doEmote` raises
          your own face locally and only the *send* is optional - so with a body
          in the room and a mirror to watch it in, the button does the visible
          half of its job with nobody else there at all. The showcase is still
          excluded, because there you are a camera rather than a person.
        */}
        {(presence || demo) && (
          <EmotePicker
            open={emotesOpen}
            onOpenChange={setEmotesOpen}
            onPick={doEmote}
            /**
             * The mirror lives in here on a phone.
             *
             * It was a button of its own beside Dance, which put it in the
             * movement corner - the wrong neighbourhood for it. Looking at
             * yourself is something you do *in order to* watch an emote, so it
             * belongs on the panel the emotes are on, one thumb-width from them.
             * The keyboard still has R; this is the touch route to the same flag.
             */
            mirror={{ on: mirror, onToggle: setMirror }}
            /**
             * And the wardrobe, beside the mirror.
             *
             * `setWearing` is the optimistic half: the body changes on the
             * click, the save follows it, and a refused save is corrected by
             * the effect above when the server's answer arrives. Nobody waits
             * on a round trip to find out what they look like.
             */
            peep={{
              current: look.animal,
              onChange: (pick) => {
                // The peep half only. The XP body is left exactly where it was,
                // which is the point: picking a fox does not sell the Knight.
                setLook((was) => ({ ...was, animal: pick, dummy: false }))
                // `chooseAvatar` clears the dummy in the same write, so an
                // animal never has to be picked twice to actually appear.
                if (!demo) void chooseAvatar(pick)
              },
              /**
               * The peep's mannequin, as a switch beside the animals.
               *
               * The animal is kept underneath, so taking it off gives back the
               * one that was already there - see `wearDummy`. Nothing here
               * touches the XP body.
               */
              dummy: {
                on: look.dummy,
                onToggle: (next) => {
                  setLook((was) => ({ ...was, dummy: next }))
                  if (demo) return
                  void wearDummy(next)
                },
              },
              /**
               * The other body, and the mode.
               *
               * `onWear` equips for the games and changes nothing you can see in
               * here unless the mode is on; `onShow` is what changes the room.
               * They used to be one call - `wearLoungeSkin`, which equipped and
               * switched the mode in a single write - and that is why a bought
               * body replaced the peep in every space at once.
               *
               * Absent in the demo and for anybody with no account: both writes
               * go through `requireUser`, which *redirects to the login page*
               * rather than returning a refusal, so a visitor who clicked here
               * would find themselves at a sign-in form. The room changes and
               * nothing is written.
               */
              xp: demo
                ? undefined
                : {
                    skins: skins ?? [],
                    wearing: look.xp,
                    onWear: (id) => {
                      /**
                       * Taking the XP body off takes the mode with it: a world
                       * told to show a body that is not there would draw the
                       * dummy while the switch claimed otherwise, and the save
                       * refuses that combination anyway.
                       */
                      setLook((was) => ({
                        ...was,
                        xp: id,
                        showXp: id === null ? false : was.showXp,
                      }))
                      void chooseSkin(id)
                    },
                    showing: look.showXp,
                    problem: xpProblem,
                    /**
                     * The one write in this panel whose answer is worth
                     * reading. The others change what you own; this one changes
                     * what the room draws, and the room has already changed by
                     * the time the server answers - so a refusal that is thrown
                     * away leaves the switch claiming a body nobody else can
                     * see, until the next server render silently puts it back.
                     *
                     * So: flip, play the rain, and put it back with a sentence
                     * if the save says no. Rolled back rather than left alone
                     * because the mode is not a local preference - it is what
                     * every other person in the room is being shown.
                     */
                    onShow: (next) => {
                      setLook((was) => ({ ...was, showXp: next }))
                      setXpProblem(null)
                      setSwap((n) => (n ?? 0) + 1)
                      void wearSkinInLounge(next).then((result) => {
                        if (result.ok) return
                        setLook((was) => ({ ...was, showXp: !next }))
                        setXpProblem(result.error)
                      })
                    },
                  },
            }}
            className={emoteAnchor(hand)}
          />
        )}

        {/*
          The way in, in every room rather than in one.

          Under the room's own name chip, sharing its edge variables so the two
          stay a pair at every width. Pointedly not bottom-left: that is the
          touch joystick's corner, and a headset's browser is a touch browser -
          the one machine this button appears on is the one that would have put
          a thumbstick on top of it.

          Renders nothing at all when the browser reports no device, which is
          almost everybody. See <EnterVr>.
        */}
        {vr && (
          <EnterVr className="absolute left-[var(--hud-edge-x)] top-[calc(var(--hud-edge-top)+2.5rem)] z-30" />
        )}

        <Hud
          locked={active}
          entered={entered}
          readOnly={readOnly}
          canBuild={canBuild}
          /*
            What the one key in front of somebody would do, and the way to do
            it without a keyboard. See `chipNear`.
          */
          near={chipNear}
          onAct={chipAct}
          blockCount={blocks.size}
          pending={pending}
          saving={saving}
          error={error}
          hasTarget={
            target.hit !== null || target.place !== null || target.image !== null
          }
          slug={slug}
          worldId={worldId}
          worldName={worldName}
          isTouch={isTouch}
          roomy={roomy}
          onEnterTouch={() => setTouchActive(true)}
          controls={controls}
          helpOpen={help.open}
          onShowHelp={help.show}
          onHideHelp={help.hide}
          selected={selected}
          onOpenPicker={() => {
            if (document.pointerLockElement) document.exitPointerLock()
            setPickerOpen(true)
          }}
          presence={presence ? presenceStatus : 'off'}
          peerCount={peerCount}
          // Only where something is actually measuring, so a space that left
          // the switch on cannot be given an empty readout by a flag going off.
          perfReadout={Boolean(perfReadout && perf && presence)}
          /*
            Only where there is a room to be seen in. The flag is a space's, but
            a camera with nowhere to send its picture is a light somebody
            switched on for nothing - the showcase at /v/[slug] has no presence
            channel and therefore nobody to see it.
          */
          camera={faces && presence ? cameraSwitch : undefined}
          onToggleCamera={faces && presence ? flipCamera : undefined}
          mic={faces && presence ? micSwitch : undefined}
          micLive={talking}
          micPush={voice.mode === 'push'}
          onToggleMic={faces && presence ? flipMic : undefined}
          mode={mode}
          onSetMode={presence && canSetMode ? changeMode : undefined}
          modeBusy={modeBusy}
          modeError={modeError}
          demo={demo}
          onCapture={capture}
          shot={shot}
        />

        {combat && (
          <CombatHud
            health={health}
            hurt={hurt}
            dashCharging={dashCharging}
            kickCharging={kickCharging}
            hitMarks={hitMarks}
            killedBy={killedBy}
            onRespawn={respawn}
            canRespawn={canRespawn ?? true}
            isTouch={isTouch}
          />
        )}

        {/*
          Controls for the selected image.
        
          Buttons rather than 3D gizmos, for the same reason the touch controls
          are buttons: dragging a handle competes with look-and-move for the same
          mouse, and every operation here snaps to whole cells anyway, so a
          gizmo's precision would be thrown away on the way to the grid.
        */}
        {selectedImage && !readOnly && (
          <ImagePanel
            image={selectedImage}
            slug={slug}
            dict={dict.image}
            busy={imageBusy}
            onClose={() => setSelectedImageId(null)}
            run={runImage}
            onDelete={() => {
              const id = selectedImage.id
              setSelectedImageId(null)
              setImages((current) => current.filter((image) => image.id !== id))
              void removeLoungeImage(slug, id).then((result) => {
                if (!result.ok) {
                  setImageError(refusal(result.error))
                  router.refresh()
                }
              })
            }}
          />
        )}

        {/*
          What you are holding, before it is put down.

          Above the image panel in the same corner and never at the same time as
          it: selecting a picture and carrying a bench are two different jobs,
          and the one you are doing is the one you last started.
        */}
        {carriedThing && (
          <ThingPanel
            carrying={carrying}
            matches={carriedThing.matches}
            index={carriedThing.index}
            facing={carriedThing.facing}
            scale={carriedThing.scale}
            cell={carryAt}
            dict={dict.things}
            busy={false}
            onNudge={nudgeSummon}
            onShove={shoveCarried}
            step={moveStep}
            onStep={setMoveStep}
            onPlace={() => void placeThing(carryAtRef.current)}
            onCancel={cancelSummon}
            /*
              Removing what is in your hands, which is the other half of having
              picked it up. Only ever a thing that already exists - `/xo` places
              directly now - so there is always something to remove.
            */
            onRemove={
              carriedThing?.movingId
                ? () => {
                    const id = carriedThing.movingId
                    cancelSummon()
                    if (id) dismissThing(id)
                  }
                : undefined
            }
            /*
              Gravity, beside turn and size rather than out on the HUD.

              Only for your own blueprints, and only once the thing in hand has
              one: a catalogue model summoned by name has no row on the shelf
              yet, so there is nothing to write to until it is put down.
            */
            falls={held?.falls}
            onFalls={
              held?.mine ? (falls) => setFalls(held.id, falls) : undefined
            }
            solid={held?.solid}
            onSolid={held?.mine ? (solid) => setSolid(held.id, solid) : undefined}
          />
        )}

        {/*
          What you just put in the room.

          It used to carry the E prompt as well, which put the same sentence on
          screen twice: this pill read "E - pick up Dummy Base" and the chip
          under it read "Dummy Base / Press E". The key is announced once now,
          on the chip, on the thing it acts on - and what is left here is the
          one line no chip can say, because it is about something that already
          happened rather than something you could do.
        */}
        {!carrying && announced && (
          <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
            {/*
              What just appeared wins the line while it is being said.

              The three readings are the same sentence at three moments - here
              is the thing you made, here is the thing you are standing next to,
              here is the way out of the thing you are in - so they share one
              place rather than stacking into a column of captions.
            */}
            {fill(dict.things.placed, { name: announced })}
          </div>
        )}

        {/*
          The shelf, over the room. Opened by a bare `/xo` - see `ask`.

          Above the carried preview in the stack and never at the same time as
          it: picking a tile closes this and puts the thing in your hands, which
          is the whole of the flow this panel exists to shorten.
        */}
        {browsing && (
          <ThingiverseView
            shelf={thingShelf}
            dict={dict.things}
            onSummon={(match) => {
              // Placed *and* kept in hand: the chip becomes this, so putting a
              // second one down is a right-click rather than another trip
              // through the shelf. Blocks have always worked that way.
              setHeldModel(match.model)
              summonThing(match)
            }}
            onClose={() => setBrowsing(false)}
          />
        )}

        {/*
          `/clip`: what this body can do, and what the thing you are in adds.

          The body's four rather than a list from the blueprint, because the
          clips a body has are the *body's* - see `AVATAR_CLIPS`. A blueprint
          may name anything and the renderer plays what it recognises, so a
          menu built from the blueprint would offer rows that do nothing.
        */}
        {clipMenu && (
          <ClipMenu
            clips={bodyClips}
            bound={usingThing?.blueprint?.spec.use?.inputs ?? []}
            dict={dict.things}
            onPlay={(clip) => {
              playClip(clip)
              setClipMenu(false)
            }}
            onClose={() => setClipMenu(false)}
          />
        )}

        {thingError && (
          <div
            role="alert"
            className="absolute bottom-48 left-1/2 max-w-md -translate-x-1/2 rounded-lg bg-red-600/90 px-3 py-2 text-xs text-white"
          >
            {thingError}
          </div>
        )}

        {imageError && (
          <div
            role="alert"
            className="absolute bottom-48 left-1/2 max-w-md -translate-x-1/2 rounded-lg bg-red-600/90 px-3 py-2 text-xs text-white"
          >
            {imageError}
          </div>
        )}

        {imageBusy && !imageError && (
          <div className="absolute bottom-48 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
            {dict.image.working}
          </div>
        )}

        {/* Only when the space charges for running - see `StaminaBar`. */}
        {staminaOn && !readOnly && <StaminaBar />}

        <PocketPanel open={pocketOpen} onClose={() => setPocketOpen(false)} />

        {football && <KickoffCountdown />}
        {football && <HostStalledBadge />}


        <BlockPicker
          open={pickerOpen}
          selected={selected}
          onSelect={setSelected}
          onClose={() => setPickerOpen(false)}
          resetting={resetting}
          spawn={spawnControls}
          /**
           * Laying a template wipes every member's work, so it is not a member's
           * call - but it is an admin's as well as an owner's, which is what
           * `canModerate` means. It used to be `isOwner`, and the
           * effect was that an admin opened the world menu and found it empty
           * with nothing to say why.
           */
          templates={
            readOnly || !canModerate
              ? undefined
              : {
                  onApply: handleTemplate,
                  busy: resetting,
                  note: templateNote,
                  /*
                   * Only in a room, because only a room is *meant* to be empty -
                   * it opens that way (see `createRoom`), so this is the way
                   * back. The lounge and a battlefield are meant to have ground
                   * under them, and an "empty it" next to their templates would
                   * be a way to make either one unusable in a click.
                   */
                  onEmpty: presence?.roomId ? handleEmpty : undefined,
                }
          }
          /**
           * Goal editing follows building, not ownership.
           *
           * Anybody who may place a block may stand a goal - it is the same verb on the
           * same world, and the action re-checks it. The templates above answer to
           * the owner/admin pair because they wipe everything first, which is a
           * different question.
           */
          /**
           * `!demo` on top of the building rule, because a goal is the one thing
           * in the picker that is not a block: it is written by its own command
           * against its own aggregate, not through the edit buffer, so there is
           * nothing for the demo's "stop draining the queue" to catch. See `demo`.
           */
          goals={canBuild && !demo ? goalControls : undefined}
          /**
           * The lounge and a room save and load; a battlefield's build page does
           * not. An arena is edited in place there, and "save this arena as an
           * arena" is a circle - which the `presence` half of the gate below
           * already settles, because that page passes none at all.
           *
           * So the gate reads: somewhere with people in it (`presence`), somebody
           * who may overwrite it (`canModerate`), and either the lounge
           * (`!worldId`) or a room (`presence.roomId`). The arenas themselves are
           * one tenant-wide list, so a world saved in a room can be loaded into
           * the lounge and the other way round.
           */
          /*
           * Shown to everybody who can see the picker, unlike the save/load
           * controls above it - finding a world is reading, not overwriting the
           * room. See the note on `catalogueHref`.
           */
          catalogueHref={worldsHref}
          worlds={
            presence && canModerate && (!worldId || presence.roomId)
              ? {
                  arenas: arenas ?? [],
                  onSave: saveAsArena,
                  // Loading overwrites the shared room, so it answers to the same
                  // pair as rebuilding it from a template - owner or admin, which
                  // is what reaching this branch already proves.
                  onLoad: loadArena,
                  busy: worldBusy,
                  note: worldNote,
                }
              : undefined
          }
        />

        {/*
          Touch controls sit outside the Hud because they need `place`, `remove`
          and the live target - and because they are input, not display.

          Place and break are buttons rather than gestures. Tap-to-place plus
          hold-to-break is what Minecraft does, but it competes with drag-to-look
          for the same finger on the same surface, and disambiguating by duration
          makes both feel unreliable. Explicit buttons cost two thumbs' worth of
          screen and are never ambiguous.

          Note what this is *not* gated on: `canBuild`. Walking, flying and dashing
          are not building, and gating them together left touch players unable to move
          at all in battle mode - which is the lounge's default, so it was most of the
          time. Each group below carries its own condition instead.
        */}
        {/*
          `!pickerOpen` is the fix for "the picker does not work on my phone".

          The thumbstick and the action stack are z-20 and rendered after the
          picker, so at equal z-index they painted *over* an open panel - the
          bottom-left and bottom-right corners of it swallowed every tap, which is
          exactly where the world controls and the goal steppers are. The picker
          is z-30 now, and these go away entirely while it is open: a joystick
          under a menu is not something anybody is trying to reach, and leaving it
          mounted means a stray thumb walks you across the room while you are
          choosing a block.

          The same is true twice over while something is being placed. The stick
          sits in the bottom-left corner for a right-handed player, which is
          exactly where the carry panel is - and the walk is suspended anyway
          while the camera is parked on the thing, so what would be drawn under
          that panel is a control that cannot do the one thing it depicts.
        */}
        {isTouch && touchActive && !pickerOpen && !carrying && !browsing && (
          <TouchLayer
            hand={hand}
            dict={dict}
            moveRef={moveRef}
            dashRef={dashRef}
            kickRef={kickRef}
            targetRef={targetRef}
            selected={selected}
            canBuild={canBuild}
            combat={Boolean(combat)}
            flying={flying}
            dancing={dancing}
            onDancing={setDancing}
            action={touchAction}
            onPlace={place}
            onRemove={remove}
          />
        )}
      </div>
    </SceneRefsProvider>
  )
}

/**
 * A clip name off a blueprint, as one of the four this rig has.
 *
 * Null for anything else, including null itself. The blueprint's vocabulary is
 * deliberately open - see `UseSpec` - and this is the one place it meets a
 * closed one, so the narrowing happens here rather than at the boundary where
 * a name is written down.
 */
function asAvatarClip(name: string | null): AvatarClip | null {
  if (!name) return null
  return (Object.values(AVATAR_CLIPS) as readonly string[]).includes(name)
    ? (name as AvatarClip)
    : null
}
