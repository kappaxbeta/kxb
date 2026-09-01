'use client'

import { createContext, type ReactNode, useContext, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  createDashRuntime,
  createKickRuntime,
  createKnockback,
  type DashRuntime,
  KICK_LUNGE_DURATION,
  type KickRuntime,
  type Knockback,
  MAX_HEALTH,
} from '@/app/world/lounge/_sim/combat'
import type { Ball } from '@/app/world/lounge/_sim/football'
import type { PeerTransform } from '@/app/world/lounge/_canvas/multiplayer'
import type { ShotPose, VrRay } from '@/app/world/lounge/_scene/scene-types'
import type { LookDelta, MoveInput } from '@/app/world/lounge/_hud/touch-controls'
import {
  type EmoteState,
  noEmote,
  nothingSaid,
  type SaidState,
} from '@/app/world/_presence/presence-core'
import type { EmoteId } from '@/domain/world/emotes'

/**
 * Everything the frame loop writes, in one place.
 *
 * This is the scene's real shape, and for a long time it was hidden. A world on
 * screen is a dozen mutable values that change sixty times a second - where the
 * eye is, which way the body faces, whether a dash is out, where the ball is -
 * and *none* of them can be React state: a re-render per frame is the one thing
 * this scene cannot afford, which is the note repeated beside every `useRef` in
 * the file this came out of.
 *
 * The consequence was prop threading, not coupling. The refs were declared in
 * the scene and handed down, so <PlayerControls> took twenty props,
 * <Multiplayer> twenty-five and <SelfAvatar> twelve - and adding one value to
 * the loop meant editing four signatures that had no opinion about it. Worse,
 * the threading obscured the arrangement it existed to serve: a dash is written
 * by the controller and judged by the channel, a shove is written by the channel
 * and spent by the controller, and you could only learn that by reading the
 * prop comments at both ends.
 *
 * So they live here, and the components that share them ask for them. Three
 * things make that safe rather than merely shorter:
 *
 * - **Nothing re-renders on it.** A ref's identity never changes, so the value
 *   below is memoised once with an empty dependency array and every consumer
 *   reads the same object for the life of the scene. A context that changed
 *   would be a re-render per frame delivered to everyone at once, which is the
 *   exact cost this design exists to avoid.
 * - **Names are unchanged.** Each field is named as the local it replaced, so a
 *   component destructures `const { playerRef } = useSceneRefs()` and its loop
 *   below reads as it always did. That was the condition for moving untested
 *   per-frame code at all: the code did not change, only where it gets its
 *   handles. Three were renamed - `selfEmote`, `selfSaid` and the `emoteRef`
 *   out-parameter are `selfEmoteRef`, `selfSaidRef` and `sendEmoteRef` here -
 *   because `react-hooks/immutability` recognises a mutable ref by the suffix,
 *   and a bundle where two fields ended in `Ref` and three did not would trip
 *   that rule for whoever added the next assignment.
 * - **The Canvas is not a boundary.** R3F renders through its own reconciler,
 *   but `<Canvas>` wraps its children in a context bridge, so a provider out
 *   here is visible to the components inside it. That is what lets the HUD's
 *   thumbstick and the character controller write the same `moveRef`.
 *
 * Who writes what is documented on each field, because that is the one thing a
 * shared mutable bundle can genuinely get wrong. A ref with two writers and no
 * note about it is how a dash gets consumed twice - see `hittable` on
 * <Companions> for the time that happened.
 */
export interface SceneRefs {
  // --- our own body ---------------------------------------------------------

  /**
   * The player's eye, and the one position anything else derives from: the camera
   * hangs off it, the avatar stands under it, and - once other people are in the
   * room - it is what gets broadcast.
   *
   * A ref holding a mutable Vector3 rather than state, because it changes every
   * frame. Putting the player's position in React state would re-render the
   * entire scene sixty times a second, which is the same reason <Targeting> only
   * reports changes and not positions.
   *
   * Seeded from `spawn`, which is also what the Canvas hands the camera on mount,
   * so the two agree on frame one before the rig has run.
   *
   * Written by <PlayerControls>; read by everything that draws or sends a body.
   */
  playerRef: React.RefObject<THREE.Vector3>

  /**
   * Which way the *player* is facing, as opposed to which way the camera points.
   *
   * Horizontal, normalised, written by <PlayerControls> every frame from the
   * look angles it owns. Everything that draws or broadcasts a body reads it
   * from here.
   *
   * It used to be `camera.getWorldDirection(...)` in each of those places, and
   * that held exactly as long as the camera was always behind you. The mirror
   * breaks it: with the camera round the front looking back, "the direction the
   * camera points" is the direction you came from, so the body dutifully spun
   * 180 degrees to keep facing away from the lens - and the whole feature showed
   * you the back of your own head from the front. Peers saw the same thing over
   * the wire, since the packet's yaw came from the same call.
   */
  headingRef: React.RefObject<THREE.Vector3>

  /**
   * Seconds since the last kick went out, for the body's lunge.
   *
   * Parked at the end of the curve rather than at zero, so a scene that has just
   * loaded is not one frame into a kick nobody threw. A ref because it is a
   * per-frame clock: it belongs in the render loop, not in a re-render.
   *
   * Written by <PlayerControls>, read by <SelfAvatar>.
   */
  kickLungeRef: React.RefObject<number>
  /**
   * How much sprint is left, 0..1, when the space charges for it.
   *
   * A ref rather than state because it changes every frame while somebody is
   * running, and the only thing that reads it is a bar that draws itself. See
   * `../_sim/stamina` for the rule and `../_hud/stamina-bar` for the drawing.
   *
   * Full when the space does not charge, so anything reading it without asking
   * first sees a player who is never tired.
   */
  staminaRef: React.RefObject<number>

  /**
   * A shove somebody else landed on us, waiting to be walked off.
   *
   * The two ends are in different places: the channel learns about the kick, and
   * only the character controller can move us. Same arrangement, and same
   * reason, as `dashRef` pointing the other way.
   *
   * Written by the channel (via `takePush`), spent by <PlayerControls>.
   */
  knockRef: React.RefObject<Knockback>

  /**
   * We were put somewhere rather than having walked there.
   *
   * Raised by `revive` and lowered by whoever reads it on the next frame, which
   * today is <FinishLine> alone. A flag rather than a distance test because the
   * two are not the same question: a knockout next to the finish puts a racer
   * back on the start line a few blocks away, which no distance threshold can
   * tell apart from a sprint, and calling that a finish awards a place to
   * somebody who died before the line.
   */
  teleportedRef: React.RefObject<boolean>

  // --- the fight ------------------------------------------------------------

  /**
   * Health, as the frame loop and the network see it.
   *
   * The source of truth, because damage arrives from a Realtime callback that
   * has no business reading React state, and because a second hit landing in the
   * same tick has to see the first one. The HUD's `health` state is written from
   * this, never the other way round.
   */
  healthRef: React.RefObject<number>

  /** The live dash. See DashRuntime - aimed by the controller, judged by the channel. */
  dashRef: React.RefObject<DashRuntime>

  /** The live kick, split the same way. */
  kickRef: React.RefObject<KickRuntime>

  /**
   * `performance.now()` before which incoming hits bounce off.
   *
   * A ref rather than state because the only thing that reads it is a network
   * callback, and re-rendering the scene when spawn protection expires would be
   * a render nobody can see.
   */
  invulnerableUntilRef: React.RefObject<number>

  // --- other people ---------------------------------------------------------

  /**
   * Where everybody else is, published by <Multiplayer> and read by
   * <PlayerControls> so you cannot walk through a person. Null when there is no
   * channel - a solo room has nobody to bump into.
   */
  transformsRef: React.RefObject<Map<string, PeerTransform> | null>

  /** Everybody else's speech bubbles, published by <Multiplayer>. Null with no channel. */
  saidsRef: React.RefObject<Map<string, SaidState> | null>

  /** Our own face, drawn over our own body. A ref, so pulling one re-renders nothing. */
  selfEmoteRef: React.RefObject<EmoteState>

  /**
   * Our own speech bubble, on the same terms as our own face.
   *
   * The chat itself is not here and deliberately never was after the first
   * attempt: it lives in the rail, which outlives this canvas, so that walking
   * out of the lounge does not end the conversation. All the scene wants is the
   * bubbles - see `said-store`.
   */
  selfSaidRef: React.RefObject<SaidState>

  /** Filled in by <Multiplayer>, which owns the channel. Null without presence. */
  sendEmoteRef: React.RefObject<((id: EmoteId) => void) | null>

  // --- the ball -------------------------------------------------------------

  /**
   * Where the ball is being drawn, filled in by <Multiplayer> and read by the mesh.
   *
   * A ref rather than state, like the peer transforms it sits beside: it changes
   * every frame, and a re-render per frame is the one thing this scene cannot afford.
   */
  ballRef: React.RefObject<Ball | null>

  /** Seconds of kickoff pause left, for the HUD's countdown. */
  kickoffRef: React.RefObject<number>

  /** Whether whoever is stepping the ball has stopped, for the HUD's warning. */
  hostStalledRef: React.RefObject<boolean>

  /**
   * Whether the ball has stopped going anywhere, for the HUD's offer to fetch it.
   *
   * Written by <Multiplayer> on every client rather than only the owner's - see
   * `watchStuck`, which every client reaches the same answer with from the one
   * published position, so the button is offered to whoever is looking at the
   * pitch rather than to whichever tab won the election.
   */
  ballStuckRef: React.RefObject<boolean>

  /**
   * Ask the room to put the ball back on the centre spot.
   *
   * Filled in by <Multiplayer>, which holds the socket, and called by the HUD,
   * which is outside the Canvas - the same arrangement as `sendEmoteRef` and for
   * the same reason. Null when there is no channel: a solo world has nobody to
   * ask, and its ball is stepped by the one client there anyway.
   */
  resetBallRef: React.RefObject<(() => void) | null>

  // --- input ----------------------------------------------------------------

  /**
   * Continuous input lives in refs, not state: the thumbstick updates dozens of
   * times a second and is consumed inside the frame loop, so routing it through
   * React would re-render the scene continuously to deliver a number the loop
   * was going to read anyway.
   *
   * Written by the HUD's thumbstick *and* by the keyboard in
   * <PlayerControls> - which is the clearest case for this context existing at
   * all, since those two sit on opposite sides of the Canvas.
   */
  moveRef: React.RefObject<MoveInput>

  /** The same, for looking: a drag on touch, the mouse under pointer lock. */
  lookRef: React.RefObject<LookDelta>

  // --- the headset ----------------------------------------------------------

  /**
   * The player's feet, as a node the XR camera hangs off - and the flag for
   * "we are in VR" at the same time.
   *
   * Null everywhere except inside a live immersive session, which is what makes
   * it the test rather than a boolean beside it: the one thing the frame loop
   * needs to know about VR is that it must stop writing the camera, and the
   * thing it has to write instead is exactly this. Two values that can disagree
   * would be two ways to describe one situation.
   *
   * The reason for the swap is not a preference. In a session three.js derives
   * the camera's pose from the headset every frame, so `camera.position.copy(…)`
   * is overwritten before it is ever rendered - the rig has to be the camera's
   * *parent*, and the player moves that. `<XROrigin>` is that parent.
   *
   * Published by <VrRig>, positioned by <PlayerControls>. Two writers, and
   * deliberately: the loop owns where the player is, and the rig owns which way
   * the room has been snapped round. They touch different properties of the same
   * node and neither reads the other's.
   */
  vrOriginRef: React.RefObject<THREE.Group | null>

  /**
   * Which way the pointing hand points. See `VrRay`.
   *
   * Written by <VrRig> and read by <Targeting>, which is the only reason this is
   * in the bundle rather than a prop: a value that changes every frame and is
   * consumed inside a frame loop has no business being state, and the two ends
   * sit on opposite sides of the Canvas from whoever would have to thread it.
   *
   * Inert rather than null out of VR - `active` is false and the vectors are
   * zero - so the reader tests one flag instead of a null and a flag.
   */
  vrRayRef: React.RefObject<VrRay>

  // --- the shutter ----------------------------------------------------------

  /**
   * The renderer, handed out of the Canvas so the shutter can use it.
   *
   * The button that fires it is HUD - ordinary DOM, outside the Canvas - and
   * `useThree` only exists inside. So <Shutter> fills this in and `capture`
   * reads it, which is the same arrangement `ovaloffice/studio` uses to export
   * a still.
   */
  shotRef: React.RefObject<{
    gl: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.Camera
  } | null>

  /**
   * Where the shutter shoots from, kept current by <PlayerControls>.
   *
   * The camera on screen is not always the camera anybody wants a picture of.
   * Pressing a HUD button means letting go of pointer lock, and the frame after
   * that release the camera has climbed to the overview - so on desktop every
   * shot came out as the wide establishing view of a room you were standing in
   * the middle of.
   *
   * So the controls keep the pose the camera *would* have if you were in - the
   * one the entry descent lands on - and the shutter borrows it for the single
   * frame it renders. On touch there is no lock to lose and the two are the
   * same pose, which is why this is filled in either way rather than only when
   * parked.
   */
  shotPoseRef: React.RefObject<ShotPose>
}

const SceneRefsContext = createContext<SceneRefs | null>(null)

/**
 * Builds the bundle, once, for one scene.
 *
 * Called by the scene rather than by the provider so that the scene can hand the
 * same object to its own hooks as a plain argument. `revive` needs the player
 * and the teleport flag, `capture` needs both shutter refs, `takePush` needs the
 * knockback - and a hook is not in the tree, so it cannot read a context the
 * component below it provides. One object, two routes to it: an argument going
 * sideways into the hooks, a context going down into the children.
 *
 * `spawn` seeds the eye so that frame one agrees with the camera the Canvas was
 * given. It is read once and then owned by the loop; moving the door later does
 * not pick anybody up, which is correct - see `standOn` for the one case that
 * does.
 */
export function useCreateSceneRefs(spawn: [number, number, number]): SceneRefs {
  const playerRef = useRef(new THREE.Vector3(...spawn))
  const headingRef = useRef(new THREE.Vector3(0, 0, -1))
  const kickLungeRef = useRef(KICK_LUNGE_DURATION)
  const staminaRef = useRef(1)
  const knockRef = useRef<Knockback>(createKnockback())
  const teleportedRef = useRef(false)

  const healthRef = useRef(MAX_HEALTH)
  const dashRef = useRef<DashRuntime>(createDashRuntime())
  const kickRef = useRef<KickRuntime>(createKickRuntime())
  const invulnerableUntilRef = useRef(0)

  const transformsRef = useRef<Map<string, PeerTransform> | null>(null)
  const saidsRef = useRef<Map<string, SaidState> | null>(null)
  const selfEmoteRef = useRef<EmoteState>(noEmote())
  const selfSaidRef = useRef<SaidState>(nothingSaid())
  const sendEmoteRef = useRef<((id: EmoteId) => void) | null>(null)

  const ballRef = useRef<Ball | null>(null)
  const kickoffRef = useRef(0)
  const hostStalledRef = useRef(false)
  const ballStuckRef = useRef(false)
  const resetBallRef = useRef<(() => void) | null>(null)

  const moveRef = useRef<MoveInput>({
    forward: 0,
    strafe: 0,
    vertical: 0,
    sprint: false,
  })
  const lookRef = useRef<LookDelta>({ dx: 0, dy: 0 })

  const vrOriginRef = useRef<THREE.Group | null>(null)
  const vrRayRef = useRef<VrRay>({
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, -1),
    active: false,
  })

  const shotRef = useRef<{
    gl: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.Camera
  } | null>(null)
  const shotPoseRef = useRef<ShotPose>({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    ready: false,
  })

  /**
   * Empty deps, and that is the whole performance argument.
   *
   * Every field is a ref, and a ref object is stable for the life of the
   * component - so there is nothing here that could change, and nothing
   * downstream that could be made to re-render by this value. `spawn` is
   * deliberately not a dependency: it seeds `playerRef` above and is then the
   * loop's business, so re-deriving the bundle when the door moves would hand
   * every consumer a new object to no effect.
   */
  return useMemo(
    () => ({
      playerRef,
      headingRef,
      kickLungeRef,
      staminaRef,
      knockRef,
      teleportedRef,
      healthRef,
      dashRef,
      kickRef,
      invulnerableUntilRef,
      transformsRef,
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
      vrOriginRef,
      vrRayRef,
      shotRef,
      shotPoseRef,
    }),
    [],
  )
}

/**
 * Puts the bundle in reach of the whole scene, inside the Canvas and out.
 *
 * Must wrap the Canvas rather than sit inside it, because the HUD is outside
 * one: the thumbstick writing `moveRef` and the controller reading it are in
 * different renderers, and this is the seam that joins them.
 */
export function SceneRefsProvider({
  refs,
  children,
}: {
  refs: SceneRefs
  children: ReactNode
}) {
  return <SceneRefsContext.Provider value={refs}>{children}</SceneRefsContext.Provider>
}

/**
 * The bundle, for a component standing in a scene.
 *
 * Throws rather than returning null when there is no provider, because every
 * consumer of this would immediately dereference a ref: a clear failure on
 * mount beats `undefined.current` sixty times a second inside a frame loop,
 * where the stack says nothing about which component forgot its provider.
 */
export function useSceneRefs(): SceneRefs {
  const refs = useContext(SceneRefsContext)
  if (!refs) {
    throw new Error('useSceneRefs must be used inside a <SceneRefsProvider>')
  }
  return refs
}
