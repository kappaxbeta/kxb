'use client'

import { useFrame, useThree } from '@react-three/fiber'
import {
  createXRStore,
  useXR,
  useXRStore,
  XR,
  XROrigin,
  type XRStore,
} from '@react-three/xr'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'
import {
  createTurnLatch,
  snapTurn,
  walkFromStick,
} from '@/app/world/lounge/_sim/vr-input'

/**
 * The room, worn.
 *
 * ---------------------------------------------------------------------------
 * What is *not* in here
 * ---------------------------------------------------------------------------
 * No physics, no collision, no walking, no block placement. All of that already
 * exists and none of it knows what a headset is - which is the whole reason a
 * VR mode is a small file rather than a second engine.
 *
 * The scene was already built around two seams that turn out to be exactly the
 * ones a headset needs:
 *
 * - `moveRef` and `lookRef`, which the touch HUD writes and the character
 *   controller reads. A thumbstick is a thumbstick; the loop never asked which
 *   side of the Canvas it came from. See ../_scene/scene-refs.
 * - `Target`, which <Targeting> produces from a ray and everything downstream
 *   consumes without caring where the ray was cast from.
 *
 * So this file is an *input device*. It writes the sticks into `moveRef`, the
 * pointing hand into `vrRayRef`, and the player's feet onto a group the headset
 * camera hangs from. Everything that makes the world a world happens in the same
 * code that runs on a laptop.
 *
 * ---------------------------------------------------------------------------
 * The one thing that genuinely had to change
 * ---------------------------------------------------------------------------
 * The camera. Outside a session <PlayerControls> *is* the camera rig - it writes
 * `camera.position` and `camera.quaternion` every frame. Inside one, three.js
 * derives both from the headset pose before the frame is drawn, so those writes
 * are overwritten and never seen. The fix is the standard one: the player moves
 * the camera's *parent*, and the headset moves the camera within it. `<XROrigin>`
 * is that parent, and `vrOriginRef` is how the loop gets hold of it.
 *
 * That is also why the origin is published as a nullable ref rather than a `vr`
 * boolean: "we are in a session" and "here is the node to move instead of the
 * camera" are the same fact, and the loop needs the second one anyway.
 */

/**
 * One store for the app, built the first time somebody asks for it.
 *
 * A session is a property of the *device*, not of a React tree - you cannot be
 * in two - so a store per mount would be a second object describing the same
 * headset, and the button that starts a session sits outside the Canvas the
 * session renders into. One module-level object is what lets those two agree
 * without a context spanning the boundary.
 *
 * Lazy rather than built at import, and that is not tidiness. This module is
 * reached from `<EnterVr>`, which is an ordinary client component - and Next
 * renders client components on the server too. A store constructed at import
 * would be constructed once per server render of the lobby, on a machine with
 * no `navigator`, for a headset that is definitionally not there. Nothing here
 * may run before a browser exists, which is why every caller below reaches it
 * from an effect or an event handler and never from a render.
 *
 * `emulate: false` because of what the button is for. Left at its default the
 * library injects a fake Quest 3 into `navigator.xr` on localhost, and
 * `isSessionSupported` then answers yes on a laptop with no headset in the
 * building - so the button would appear for everybody in development and for
 * nobody in production, which is the wrong way round for the one control whose
 * entire job is to not be there unless there is something to put on your head.
 *
 * `offerSession: false` for the same reason one step further out: an offered
 * session is the browser volunteering to jump into VR without anybody pressing
 * anything, and arriving at a public room should not do that to a visitor.
 */
let store: XRStore | null = null

function vrStore(): XRStore {
  store ??= createXRStore({ emulate: false, offerSession: false })
  return store
}

/**
 * The store as an external store, for whoever needs to re-render on a session.
 *
 * Declared out here rather than inline at the call site because
 * `useSyncExternalStore` re-subscribes whenever `subscribe` changes identity,
 * and an arrow written in a component body is a new function every render.
 *
 * `noSession` is the piece that matters: it is the server snapshot, and it
 * answers without reaching for the store at all. That is what keeps a render on
 * a machine with no browser from building one - and what the library's own
 * `useXRSessionModeSupported` is missing, which is why it cannot be used here.
 */
const subscribeToVr = (onChange: () => void) => vrStore().subscribe(onChange)
const vrSession = () => vrStore().getState().session != null
const noSession = () => false

/** Scratch, allocated once. This runs every frame - see the note in ./player-controls. */
const RAY_MATRIX = new THREE.Matrix4()

/**
 * The name the WebXR gamepad layout gives each control, so the lines below read
 * as the thing on the plastic rather than as an index into an array.
 */
const THUMBSTICK = 'xr-standard-thumbstick'
const TRIGGER = 'xr-standard-trigger'
const SQUEEZE = 'xr-standard-squeeze'

/**
 * Is there a headset to put this on?
 *
 * Answered by `navigator.xr.isSessionSupported` and nothing else, so a machine
 * with no WebXR at all - every phone, and every desktop browser without a
 * runtime behind it - gets `false`. False until the browser answers, too: the
 * check is a promise, and a control that appears a beat late is better than one
 * that appears and is then taken away.
 *
 * Hand-rolled rather than `useXRSessionModeSupported`, which is the library's
 * hook for exactly this and cannot be used here. It is a `useSyncExternalStore`
 * with no server snapshot, so React throws "Missing getServerSnapshot" the
 * moment it is rendered on a server - and Next renders client components on the
 * server. That threw during SSR of `/lobby`, which React recovered from by
 * falling back to client rendering, but the document still went out as a 500.
 * A page that only renders because the framework caught a crash is a page that
 * does not render on anything strict enough to stop at the status code.
 *
 * `devicechange` rather than a single question at mount, so a headset connected
 * while the tab is already open makes the button appear rather than needing a
 * reload nobody would think to do.
 */
export function useVrAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    // No `navigator.xr` at all is the common case and a complete answer: there
    // is nothing to ask and nothing to listen to.
    const xr = typeof navigator === 'undefined' ? undefined : navigator.xr
    if (!xr) return

    let live = true
    const ask = () => {
      xr.isSessionSupported('immersive-vr').then(
        (supported) => {
          if (live) setAvailable(supported)
        },
        // A browser that refuses the question is a browser that cannot do it.
        // Some refuse it in an iframe without the right permissions policy.
        () => {
          if (live) setAvailable(false)
        },
      )
    }

    ask()
    xr.addEventListener('devicechange', ask)

    return () => {
      live = false
      xr.removeEventListener('devicechange', ask)
    }
  }, [])

  return available
}

/**
 * The way in, as ordinary DOM.
 *
 * Renders nothing at all when there is no headset - not a disabled button, not
 * an explanation. A control that cannot do anything is worse than an absent one
 * here, because "enter VR" reads as a promise about the room rather than as a
 * fact about the machine, and a greyed-out one on a laptop says the room does
 * not support it when the truth is that the laptop does not.
 *
 * Outside the Canvas because it has to be: the session does not exist yet, so
 * there is nothing in the scene to click on, and the gesture that starts one has
 * to be a real user activation on a real element.
 */
export function EnterVr({
  className,
}: {
  /**
   * Where this sits, and only that.
   *
   * The button's own look is not the caller's business - it is one control with
   * one job, and a room that restyled it would be a room where "Enter VR" meant
   * something different. Same split `<EmotePicker>` uses, which takes an anchor
   * and nothing else.
   */
  className?: string
}) {
  const available = useVrAvailable()

  /**
   * Subscribed to the store directly rather than through `useXR`.
   *
   * That hook reads a context, and the context is provided by `<XR>` - which is
   * inside the Canvas, because it is a piece of the renderer. This button is
   * DOM and has to be outside one. The store is the same object either way, so
   * asking it straight is not a workaround: it is the thing the context would
   * have handed back.
   *
   * The server snapshot is what makes this safe to render on a server, and its
   * absence in the library's equivalent is what took `/lobby` down. See
   * `subscribeToVr`.
   */
  const inSession = useSyncExternalStore(subscribeToVr, vrSession, noSession)

  /**
   * Why the last attempt did not work, if it did not.
   *
   * Said out loud rather than swallowed. Pressing this is something somebody did
   * on purpose, and a refusal that only reached a console looks exactly like a
   * button that does nothing - which is the report that is impossible to act on,
   * because the person holding the headset cannot see a console.
   */
  const t = worldDict(useLocale()).vr
  const [failed, setFailed] = useState<string | null>(null)

  // Nothing to offer, or already wearing it - in a session the button is behind
  // your face and the way out is the headset's own menu.
  if (!available || inSession) return null

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          setFailed(null)
          vrStore()
            .enterVR()
            .then(
              (session) => {
                // Resolving with nothing is the quiet failure worth naming: the
                // browser said yes to the promise and produced no session, which
                // looks identical to a dead button from the outside.
                if (!session) setFailed(t.noSession)
              },
              (error: unknown) => setFailed(String((error as Error)?.message ?? error)),
            )
        }}
        className="pointer-events-auto rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs text-white/80 backdrop-blur transition-colors hover:border-white/30 hover:text-white"
      >
        {t.enter}
      </button>

      {failed && (
        <p className="mt-1.5 max-w-[13rem] text-[10px] leading-relaxed text-rose-300/80">
          {failed}
        </p>
      )}

      {/*
        The controls, here rather than on the controls panel, and that is not
        where they belong so much as the only place they can be.

        Every piece of chrome in this room is DOM - the panel with the keyboard
        on it included - and DOM is exactly what stops existing the moment the
        session starts. So the one chance to say what the sticks do is *before*
        anybody puts the headset on, next to the button that puts it on. Two
        lines, because the whole of it is two lines: the hands do the walking and
        the fingers do the building.
      */}
      <p className="mt-1.5 max-w-[13rem] text-[10px] leading-relaxed text-white/40">
        {t.sticks}
        <br />
        {t.triggers}
      </p>
    </div>
  )
}

/**
 * Everything a scene has to mount to be wearable, as one child of its Canvas.
 *
 * A *sibling* of the world rather than a wrapper round it, which is the part
 * worth knowing: `<XR>` looks like a provider, and the instinct is to put the
 * whole scene inside it. It does not need to be. What `<XR>` does to the
 * renderer - binding the session's manager, swapping the camera r3f draws with,
 * driving the frame - it does to the root store, which the entire Canvas shares.
 * The only thing its context carries is for components using XR hooks, and
 * <VrRig> is the sole one. So the world stays exactly where it was in the tree,
 * and a scene that wants VR gains one line rather than an indent.
 *
 * The default export point for scenes, so `@react-three/xr` is reachable through
 * one name and one `import()`.
 */
export function VrLayer({ onAct }: { onAct: (button: 0 | 2) => void }) {
  return (
    /* Safe to build during this render: <VrLayer> is loaded with `ssr: false`,
       so there is a browser by definition, and the getter is idempotent. */
    <XR store={vrStore()}>
      <VrRig onAct={onAct} />
    </XR>
  )
}

/**
 * The headset, as an input device.
 *
 * Lives inside the Canvas, inside <XR>. Renders the origin and nothing else -
 * the controller models and their pointers are the library's defaults, which is
 * the right call for the one part of this that is a solved problem.
 */
function VrRig({
  onAct,
}: {
  /**
   * The trigger, in the language the mouse already speaks: 0 breaks, 2 places.
   *
   * Deliberately the same two numbers `onMouseDown` uses rather than a pair of
   * named callbacks. What a click does to the target is a decision the scene
   * makes - images take precedence, read-only rooms refuse - and there is no
   * version of that reasoning worth having twice.
   */
  onAct: (button: 0 | 2) => void
}) {
  const { vrOriginRef, vrRayRef, moveRef } = useSceneRefs()
  const store = useXRStore()
  const { gl } = useThree()
  const origin = useRef<THREE.Group>(null)
  const inSession = useXR((state) => state.session != null)

  /** Whether the turn stick is still held over from the last snap. See `snapTurn`. */
  const turnLatch = useRef(createTurnLatch())

  /**
   * Which buttons were down last frame, keyed by hand and component.
   *
   * The edge is what places a block, not the level - a held trigger is one
   * break, not sixty a second - and the gamepad state is a level. Same argument
   * as `jumpWasDown` in the character controller, which is the other place a
   * held control had to be turned back into a press.
   */
  const held = useRef<Record<string, boolean>>({})

  /**
   * Publishing the origin is what switches the character controller into VR, so
   * it is done on the session rather than on mount: the group exists either way,
   * and a rig published while nobody is wearing anything would stop the camera
   * working on a laptop.
   */
  useEffect(() => {
    if (!inSession) return
    vrOriginRef.current = origin.current

    // Read out here rather than in the cleanup below, which is what the hooks
    // rule asks for. It costs nothing to comply: these three are made once by
    // `useCreateSceneRefs` and by the two `useRef`s above, and none of them is
    // ever reassigned - so the object the cleanup wants is the object here.
    const move = moveRef.current
    const ray = vrRayRef.current
    const latch = turnLatch.current

    return () => {
      vrOriginRef.current = null

      // Everything this file was holding down, let go of. Taking the headset
      // off mid-stride would otherwise leave the stick's last reading in
      // `moveRef` forever, and the desktop camera walking into a wall.
      ray.active = false
      move.forward = 0
      move.strafe = 0
      move.vertical = 0
      move.sprint = false
      held.current = {}
      latch.held = false
    }
  }, [inSession, vrOriginRef, vrRayRef, moveRef])

  useFrame((_, __, frame) => {
    const rig = origin.current
    if (!rig || vrOriginRef.current == null) return

    // Read out of the store rather than through `useXRInputSourceState`, which
    // is a subscription: picking up a controller is worth a re-render, and its
    // stick moving sixty times a second is not.
    const { inputSourceStates } = store.getState()
    const move = moveRef.current
    const ray = vrRayRef.current

    let walk: { forward: number; strafe: number; sprint: boolean } | null = null
    let turn = 0
    let jump = false
    let pointing: XRInputSource | null = null

    for (const source of inputSourceStates) {
      if (source.type !== 'controller') continue
      const hand = source.inputSource.handedness
      const pad = source.gamepad

      /**
       * Left walks, right turns, and the handedness is not configurable.
       *
       * It is the arrangement every headset game uses, so it is the one people
       * arrive already knowing - and a setting for it would be a preference to
       * store, a screen to change it on and a way to be wrong, in a room whose
       * entire pitch is that you can just be in it.
       */
      if (hand === 'left') {
        const stick = pad[THUMBSTICK]
        walk = {
          ...walkFromStick(stick?.xAxis, stick?.yAxis),
          // Clicking the stick in runs, which is where every game that has both
          // puts it - and leaves the face buttons free for jumping.
          sprint: stick?.state === 'pressed',
        }
      } else if (hand === 'right') {
        // One turn per push, in steps, with the stick having to come back before
        // the next. All three of those are load-bearing; see `snapTurn`.
        turn = snapTurn(pad[THUMBSTICK]?.xAxis ?? 0, turnLatch.current)
      }

      // Either face button jumps, so it is whichever one your thumb finds.
      if (pad['a-button']?.state === 'pressed' || pad['x-button']?.state === 'pressed') {
        jump = true
      }

      // The trigger breaks and the grip places, which is left-click and
      // right-click with the same fingers doing the same jobs.
      for (const [component, button] of [
        [TRIGGER, 0],
        [SQUEEZE, 2],
      ] as const) {
        const key = `${hand}:${component}`
        const down = pad[component]?.state === 'pressed'
        if (down && !held.current[key]) onAct(button)
        held.current[key] = down
      }

      // The right hand points unless there is only a left one, so a
      // left-handed session still has a ray rather than none.
      if (hand === 'right' || pointing == null) pointing = source.inputSource
    }

    move.forward = walk?.forward ?? 0
    move.strafe = walk?.strafe ?? 0
    move.sprint = walk?.sprint ?? false
    // A level, not a press: <PlayerControls> spots the edge itself, the same way
    // it does for the space bar and for the touch HUD's jump button.
    move.vertical = jump ? 1 : 0

    if (turn !== 0) {
      /**
       * About the origin, which is under your feet as long as you have not
       * physically walked away from it.
       *
       * Room-scale steps are not folded into the player position - they are a
       * pace or two and they cost nothing to leave alone - so somebody standing
       * a stride off centre gets swung slightly sideways by a snap turn. The
       * alternative is rotating about the head, which means writing the origin's
       * position here as well as its rotation, and the loop owns that.
       */
      rig.rotation.y += turn
    }

    /**
     * And where the pointing hand is, in world space.
     *
     * The target-ray space rather than the grip: they are several degrees apart
     * on every controller made, because a grip points where your fist points and
     * a target ray points where the controller is *aiming*. Building with the
     * grip pose means every block lands slightly below where you pointed.
     *
     * `getReferenceSpace()` is the origin's own space, so the pose comes back
     * relative to the rig and has to be lifted into the world by it - the same
     * relationship the camera has to the same group.
     */
    const reference = gl.xr.getReferenceSpace()
    const pose =
      frame && reference && pointing
        ? frame.getPose(pointing.targetRaySpace, reference)
        : null

    if (pose) {
      RAY_MATRIX.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld)
      ray.origin.setFromMatrixPosition(RAY_MATRIX)
      ray.direction.set(0, 0, -1).transformDirection(RAY_MATRIX)
      ray.active = true
    } else {
      // No hand tracked this frame. <Targeting> falls back to the gaze, which is
      // wrong for building but is at least aimed at something you are looking at.
      ray.active = false
    }
  })

  return <XROrigin ref={origin} />
}
