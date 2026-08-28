'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  canDash,
  canKick,
  DASH_SPEED,
  KICK_COOLDOWN,
  knockbackFalloff,
  MAX_HEALTH,
  startDash,
  tickDash,
  tickKick,
  tickLava,
} from '@/app/world/lounge/_sim/combat'
import {
  advanceEntry,
  entryEase,
  overviewPosition,
} from '@/app/world/lounge/_sim/entry-view'
import {
  EYE_HEIGHT,
  separate,
  step as stepPhysics,
  underfoot,
} from '@/app/world/lounge/_sim/physics'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import { type BlockMap, clamp, MAX_DELTA } from '@/app/world/lounge/_scene/scene-types'
import { STEER_KEY_TURN_RATE, steerTurn } from '@/lib/controls/steer'
import { useCameraMode } from '@/lib/controls/use-camera-mode'
import { isTyping } from '@/app/world/_sim/typing'
import { blockKey } from '@/domain/lounge/events'
import { isBurning } from '@/domain/lounge/palette'

/**
 * Scratch objects, allocated once.
 *
 * The movement code runs every frame. Allocating vectors per frame hands the
 * garbage collector a few hundred short-lived objects a second, which shows up
 * as periodic stutter. There is only ever one player.
 */
const FORWARD = new THREE.Vector3()
const RIGHT = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/** Heading for walking: the look direction flattened onto the ground plane. */
const WALK_DIR = new THREE.Vector3()

/** Scratch for flattening the heading before it is published. */
const HEADING = new THREE.Vector3()

/**
 * How far behind the player the camera sits in third person, and how much above.
 *
 * The camera is a *rig* here, not the player. `playerRef` holds the eye and the
 * camera is derived from it every frame, which is a change from the original
 * design where the camera position simply was the player.
 *
 * That distinction is not cosmetic. Drawing the body at an offset from the camera
 * would have been less code, and it would have meant the avatar stood somewhere
 * the player is not - so the moment anybody else is in the room, they would see
 * you a couple of blocks from where you actually are, and you would place blocks
 * from inside your own back. One position, derived views.
 */
const THIRD_PERSON_DISTANCE = 4.2
const THIRD_PERSON_RAISE = 0.55

/**
 * The mirror: round the front, looking back at yourself.
 *
 * You could never see your own face. Third person is the back of your head, and
 * everything about a body in this app - which animal you picked, the emote you
 * just threw, the hat, whether the dance actually looks like anything - is on the
 * side of you nobody but other people got to look at.
 *
 * Nearer than the third-person boom and barely lifted, because this is a portrait
 * rather than a follow cam: the point is to see a face, and the same 4.2 blocks
 * that frame a room nicely from behind put a small animal in the middle distance.
 * The drop is what the lens aims at - a little below the eye, so the body is in
 * shot rather than the chin and a lot of sky.
 */
const MIRROR_DISTANCE = 2.6
const MIRROR_RAISE = 0.15
const MIRROR_DROP = 0.45

/**
 * Walking speed, and the sprint multiplier applied on Shift.
 *
 * Much slower than the old flight speed of 10/24. Flying at walking pace feels
 * broken, and walking at flying pace feels like ice - the two modes want
 * genuinely different numbers, so they get them.
 */
const WALK_PACE = 7
const SPRINT_PACE = 13

/** Scratch for the camera rig and the entry descent, so no frame allocates. */
const RIG_POSITION = new THREE.Vector3()
const ENTRY_DIR = new THREE.Vector3()
const ENTRY_EULER = new THREE.Euler(0, 0, 0, 'YXZ')
const ENTRY_TARGET = new THREE.Quaternion()

/** Scratch for the pose the shutter borrows. See `shotPoseRef`. */
const SHOT_EULER = new THREE.Euler(0, 0, 0, 'YXZ')
const SHOT_FORWARD = new THREE.Vector3()

/** Scratch for reading the headset's own orientation back off the XR camera. */
const VR_QUATERNION = new THREE.Quaternion()

/**
 * The character controller: input, physics, and the camera rig.
 *
 * Everything it *writes* comes from `useSceneRefs` - the eye, the heading, the
 * dash it aims, the shutter's pose - which is what took this from twenty props
 * to nine. What is left as props is the scene's *configuration*: whether this
 * room lets anybody fly, whether the dash can hurt, what the world is made of.
 * The distinction is worth keeping: props here are answers that change when the
 * room changes, and refs are values that change when the frame changes.
 */
/**
 * How far in front of the body's centre the eye sits, in metres.
 *
 * A quarter of a metre is about half a head. Tuned by eye in a headset rather
 * than derived - the avatar's skull has no single radius and the number that
 * matters is "far enough that it is not in the way", which is a thing you look
 * at rather than calculate.
 */
const EYE_FORWARD = 0.25

export function PlayerControls({
  onLockChange,
  pointerLock,
  thirdPerson,
  mirror,
  fly,
  blocks,
  combat,
  dead,
  onDash,
  onKick,
  onBurn,
  watching,
}: {
  onLockChange: (locked: boolean) => void
  /** False on touch devices, where pointer lock does not exist. */
  pointerLock: boolean
  thirdPerson: boolean
  /** Camera round the front, looking back. See MIRROR_DISTANCE. */
  mirror: boolean
  /** Free flight instead of walking. Read-only visitors only. */
  fly: boolean
  /** The world, for the collision test. Read, never written. */
  blocks: BlockMap
  /** False for solo rooms and the public showcase; the dash does nothing there. */
  combat: boolean
  /** Down, and not moving until they choose to come back. */
  dead: boolean
  /** A dash actually started - the HUD wants to run its cooldown. */
  onDash: () => void
  /** A kick actually went out. Same job, other cooldown. */
  onKick: () => void
  /** Standing in the fire has cost us this much. */
  onBurn: (damage: number) => void
  /**
   * Whether the world is being *looked at* from above rather than stood in,
   * which is what the overview camera is for.
   *
   * True before anybody has come in for the first time, and true again whenever
   * somebody asks for the overview with O. Pointedly *not* "is the pointer
   * locked": lock is dropped all over this scene - chat, the block picker, Esc -
   * and none of those are a reason to fly the camera out of the room and back.
   */
  watching: boolean
}) {
  const {
    moveRef,
    lookRef,
    playerRef,
    shotPoseRef,
    headingRef,
    dashRef,
    kickRef,
    knockRef,
    transformsRef,
    vrOriginRef,
  } = useSceneRefs()

  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

  /**
   * The one-thumb mode: the stick (or A/D) turns instead of sidestepping.
   *
   * The preference is the store the entry panel and the settings card write,
   * shared with the XP runtime - one pair of hands, one answer. There is no
   * frame state to go with it: a turn rate needs nothing remembered between
   * frames, which is most of why it replaced what was here. See ./steer.
   */
  const { mode: cameraMode } = useCameraMode()

  /**
   * How far through the drop from the overview to eye level, 0 to 1.
   *
   * Reset to 0 for as long as nobody is in, so leaving and coming back plays it
   * again - which is right, because leaving puts you back at the overview.
   */
  const entry = useRef(0)

  /** The pose the drop starts from. Mutated in place; never reassigned. */
  const entryFrom = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  }).current

  // Simulation state that must survive a frame but must not cause a re-render.
  const velocityY = useRef(0)
  const grounded = useRef(false)
  /** Jumps spent since the last landing. See MAX_JUMPS in physics.ts. */
  const jumps = useRef(0)
  /**
   * Whether the jump control was already down last frame.
   *
   * The edge, not the level, is what buys the second jump - so it has to be
   * derived here, because neither the keyboard listener nor the touch button
   * knows about frames. Holding Space would otherwise spend both jumps in two
   * consecutive frames and read as one jump with a strange arc.
   */
  const jumpWasDown = useRef(false)
  /** Seconds of standing in lava not yet billed. See `tickLava`. */
  const burning = useRef(0)

  useEffect(() => {
    const canvas = gl.domElement

    const onKeyDown = (event: KeyboardEvent) => {
      // Movement is not gated on pointer lock - touch entry needs it without
      // one - so this is the only thing standing between typing "walk" in the
      // chat box and actually walking.
      if (isTyping(event)) return
      /**
       * L toggles the look lock without needing a click.
       *
       * Alt-tabbing or clicking off the canvas releases pointer lock the same
       * way Escape does, and re-requesting it normally takes a click back onto
       * the canvas. A keypress counts as user activation too, so this hands
       * back control - and takes it away again - without one, and without
       * touching `euler`, so the camera is exactly where it was left.
       */
      if (event.code === 'KeyL' && !event.repeat && pointerLock) {
        if (document.pointerLockElement === canvas) document.exitPointerLock()
        // Swallowed because the browser refuses a re-lock for about a second
        // after an exit, and toggling straight back on is the obvious thing to
        // do with a toggle. A refusal means the look stays off, not an error.
        else void canvas.requestPointerLock().catch(() => {})
        return
      }
      keys.current[event.code] = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      /**
       * Deliberately *not* guarded, and the asymmetry is the point.
       *
       * A key can go down on the canvas and come up in the text box - press W,
       * click the chat panel, let go - and a guarded keyup would drop that
       * release and leave the player jogging into a wall forever. Clearing a
       * key that was never set is free; missing a release is not. The same
       * argument `releaseAll` makes about alt-tab, one event finer.
       */
      keys.current[event.code] = false
    }

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      /**
       * `euler` is the heading, not a scratch read back off the camera.
       *
       * It used to be re-derived from `camera.quaternion` on every move, which
       * was fine while the camera always faced where you were looking. The
       * mirror breaks that: it points the camera *back* at you, so reading the
       * heading off it would hand back the reverse of it - and walking forward
       * would walk you backwards, one frame after pressing the key.
       *
       * So the angles are kept here and the camera is derived from them. The two
       * places that legitimately move the camera on their own - the overview and
       * the descent out of it - sync this back, which is the only direction the
       * dependency now runs in.
       */
      euler.current.y -= event.movementX * 0.002
      euler.current.x -= event.movementY * 0.002
      // Stop the camera flipping over at the poles.
      euler.current.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, euler.current.x),
      )
      camera.quaternion.setFromEuler(euler.current)
    }

    /**
     * Everything up, on the way out.
     *
     * A key that goes down in the tab and up somewhere else never delivers its
     * keyup here, and the flag stays set - so Shift held while you alt-tab, or
     * while you click something outside the canvas, leaves you sprinting at
     * nearly double pace with nothing pressed. Clearing the whole map is right
     * rather than clearing Shift: any key can be orphaned the same way, and a
     * key genuinely still held sets itself again on its next repeat.
     */
    const releaseAll = () => {
      keys.current = {}
    }

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas
      // Escaping the lock is one of the ways a keyup goes missing: the browser
      // takes the pointer back and the keyboard often goes with it.
      if (!locked) releaseAll()
      onLockChange(locked)
    }

    const onCanvasClick = () => {
      // Requesting pointer lock on a touch device either throws or silently
      // does nothing, and would swallow the tap that should have been a look
      // drag. Touch gets its own entry path.
      if (!pointerLock) return
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock()
    }

    // Right-click places blocks, so the context menu has to go.
    const onContextMenu = (event: Event) => event.preventDefault()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    canvas.addEventListener('click', onCanvasClick)
    canvas.addEventListener('contextmenu', onContextMenu)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('click', onCanvasClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [camera, gl, onLockChange, pointerLock])

  // Movement goes through three.js' own mutators rather than assigning to
  // camera.position.y. Both mutate the same object, but the method form is what
  // react-hooks/immutability recognises as intentional scene-graph mutation -
  // which is react-three-fiber's whole programming model.
  useFrame((_, delta) => {
    /**
     * The rig, and the whole of what this loop knows about VR.
     *
     * Non-null only inside a live immersive session. Everything above this line
     * runs unchanged in a headset - the input, the physics, the collisions, the
     * dash - because none of it was ever about the camera. What changes is only
     * the two ends: where the look angles come from, and what gets moved once
     * the physics has decided where the player is. See ./vr.
     */
    const rig = vrOriginRef.current

    // Drain any accumulated touch-drag look. Applying it here rather than in
    // the touch handler ties turn rate to frames, so the camera moves the same
    // amount whether the OS delivered one big move event or ten small ones.
    //
    // Skipped in a headset, where turning is the headset's business and this
    // would be a second opinion about it.
    const look = lookRef.current
    if (!rig && (look.dx !== 0 || look.dy !== 0)) {
      // Accumulated into the heading, not read back off the camera - see the
      // note in `onMouseMove` about why the mirror makes that the wrong way round.
      euler.current.y -= look.dx * 0.004
      euler.current.x -= look.dy * 0.004
      euler.current.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, euler.current.x),
      )
      camera.quaternion.setFromEuler(euler.current)
      look.dx = 0
      look.dy = 0
    }

    // Keyboard and thumbstick are summed rather than switched between, so a
    // tablet with a keyboard attached can use either without a mode to get
    // wrong. Clamped because pressing W while pushing the stick forward should
    // not be double speed.
    const move = moveRef.current
    // The dead stand still. Reading the input and then discarding it, rather
    // than returning early, keeps the camera rig below running - so the body you
    // are looking at is your own, lying where it fell.
    const live = !dead
    const forwardInput = live
      ? clamp((keys.current.KeyW ? 1 : 0) - (keys.current.KeyS ? 1 : 0) + move.forward)
      : 0
    const strafeInput = live
      ? clamp((keys.current.KeyD ? 1 : 0) - (keys.current.KeyA ? 1 : 0) + move.strafe)
      : 0

    /**
     * Diagonals, brought back down to walking pace.
     *
     * The two axes are clamped independently, so W+D was two full-strength
     * pushes at right angles - a vector √2 long, and forty per cent faster than
     * walking straight. That is the classic strafe-run, and it reads as the
     * player being twice as fast the moment you touch a second key.
     *
     * Scaled rather than normalised, so a thumbstick pushed gently still walks
     * gently: only inputs longer than one get shortened.
     */
    const drive = Math.hypot(forwardInput, strafeInput)
    const evenly = drive > 1 ? 1 / drive : 1
    const forward = forwardInput * evenly
    // `let`, because steer mode spends the keyboard's share of it on a turn.
    let strafe = strafeInput * evenly
    const vertical = live
      ? clamp(
          (keys.current.Space ? 1 : 0) - (keys.current.ControlLeft ? 1 : 0) + move.vertical,
        )
      : 0
    const sprint = live && (keys.current.ShiftLeft || move.sprint)

    // Clamped, because a backgrounded tab delivers one enormous frame on return
    // and a single gravity step that size tunnels straight through the floor.
    const dt = Math.min(delta, MAX_DELTA)

    /**
     * Steering: the sideways axis turns, the forward axis drives.
     *
     * One rule for the stick and the keys alike - "when you move the joystick
     * on the x we rotate the player and view left or right, and y we move the
     * player forward or backward". The strafe is spent on the turn and zeroed:
     * there is no sidestep in this mode, because the axis that would carry one
     * is the axis doing the turning.
     *
     * Applied to `euler` *before* `FORWARD` is derived from it below, so the
     * heading, the body everybody else sees and the walk all move together on
     * the same frame. Never in a headset, where `euler` is the headset's own
     * pose and a turn nobody's neck made is how people take one off.
     */
    if (!rig && cameraMode === 'steer' && strafe !== 0) {
      // A key is all-or-nothing and a stick is not, so they turn at their own
      // rates; the keyboard's own contribution is what tells them apart.
      const byKey = keys.current.KeyA || keys.current.KeyD
      euler.current.y += steerTurn(strafe, dt, byKey ? STEER_KEY_TURN_RATE : undefined)
      strafe = 0
    }

    const player = playerRef.current

    /**
     * In a headset the head is the mouse.
     *
     * Read back off the XR camera rather than accumulated from deltas, because
     * a headset reports a pose and not a movement - there is no `movementX` for
     * turning your neck. The world quaternion is the right one to ask for: it
     * carries the rig's own rotation as well, so a snap turn changes which way
     * "forward" is without this having to know that snap turns exist.
     *
     * Written into the same `euler` the mouse writes, so everything below - the
     * heading peers see, the direction a dash commits to, which way you walk -
     * carries on reading one answer from one place. Roll is dropped: tilting
     * your head sideways is not a turn, and leaving it in would bank the walking
     * direction fractionally every time somebody leaned.
     *
     * A frame stale, because three.js updates the camera from the pose at render
     * time and this runs before it. That is sixteen milliseconds of lag on the
     * walking direction and none at all on the view, which is the way round it
     * has to be - the view is what the inner ear is checking.
     */
    if (rig) {
      euler.current.setFromQuaternion(camera.getWorldQuaternion(VR_QUATERNION), 'YXZ')
      euler.current.z = 0
    }

    /**
     * The look direction is needed either way - to move along, and to hang the
     * third-person camera off the back of.
     *
     * From the heading rather than from the camera, which is the same distinction
     * `onMouseMove` draws: in the mirror the camera faces the other way, and
     * asking it which way is forward would answer "behind you".
     */
    FORWARD.set(0, 0, -1).applyEuler(euler.current)

    /**
     * Published for everything that draws or broadcasts a body.
     *
     * Here rather than in each of them, because "which way is the player facing"
     * has exactly one answer and it is this one. Flattened and normalised at the
     * source so no reader has to remember to - see `headingRef`.
     *
     * Staring straight up or down leaves nothing to normalise; the last heading
     * stands, which is what a body does when you look at your own feet.
     */
    HEADING.copy(FORWARD)
    HEADING.y = 0
    if (HEADING.lengthSq() > 1e-6) headingRef.current.copy(HEADING.normalize())


    /**
     * Dash timers, ticked before anything reads them and outside the walking
     * branch below.
     *
     * That branch is skipped on any frame where you are staring straight up or
     * down, and a cooldown that stops running while you look at your feet is a
     * cooldown that can be held open indefinitely.
     */
    const dash = dashRef.current
    dash.timers = tickDash(dash.timers, dt)

    let starting = false
    if (dash.requested) {
      // Consumed whether or not it is granted, so a dash refused on cooldown
      // does not sit in the queue and fire a second later on its own.
      dash.requested = false
      starting = combat && !fly && canDash(dash.timers, dead ? 0 : MAX_HEALTH)
    }

    // Same shape for the kick, and ticked outside the walking branch for the
    // same reason: a cooldown you can pause by looking at your feet is not one.
    const kick = kickRef.current
    kick.cooldown = tickKick(kick.cooldown, dt)

    let kicking = false
    if (kick.requested) {
      kick.requested = false
      kicking = combat && !fly && canKick(kick.cooldown, dead ? 0 : MAX_HEALTH)
    }

    /**
     * The jump edge, read once and shared by both branches below.
     *
     * `vertical` is a level - a held key, a held button - so the press has to be
     * spotted by comparing against last frame. Recorded even while flying, so
     * that landing out of a flight does not start with a phantom press.
     */
    const jumpDown = vertical > 0
    const jumpPressed = jumpDown && !jumpWasDown.current
    jumpWasDown.current = jumpDown

    if (fly) {
      if (forward !== 0 || strafe !== 0 || vertical !== 0) {
        const speed = (sprint ? 24 : 10) * dt
        RIGHT.crossVectors(FORWARD, camera.up).normalize()

        if (forward !== 0) player.addScaledVector(FORWARD, speed * forward)
        if (strafe !== 0) player.addScaledVector(RIGHT, speed * strafe)
        if (vertical !== 0) player.addScaledVector(UP, speed * vertical)
      }
    } else {
      /**
       * Walking takes the *horizontal* projection of the look direction. Using
       * the full vector would mean glancing at the sky walks you into it, which
       * is exactly the flying we just took away.
       */
      WALK_DIR.copy(FORWARD)
      WALK_DIR.y = 0
      // Staring straight down leaves no heading to walk along. Standing still
      // for that one frame is better than lurching in an arbitrary direction.
      if (WALK_DIR.lengthSq() > 1e-6) {
        WALK_DIR.normalize()
        RIGHT.crossVectors(WALK_DIR, UP).normalize()

        if (starting) {
          dash.timers = startDash()
          // The heading is locked in now and not re-read. A charge you can steer
          // is a homing missile - the way you beat one has to be to move, which
          // only works if it commits to where it was pointed.
          dash.dir.x = WALK_DIR.x
          dash.dir.z = WALK_DIR.z
          dash.hits.clear()
          onDash()
        }

        if (kicking) {
          // Aimed from where we are standing, along where we are looking, and
          // handed straight to the judge. There is nothing to carry between
          // frames - the whole kick happens in this one.
          kick.cooldown = KICK_COOLDOWN
          kick.origin.x = player.x
          kick.origin.y = player.y
          kick.origin.z = player.z
          kick.dir.x = WALK_DIR.x
          kick.dir.z = WALK_DIR.z
          kick.thrown = true
          onKick()
        }

        const dashing = dash.timers.remaining > 0
        const pace = (sprint ? SPRINT_PACE : WALK_PACE) * dt

        /**
         * The shove we are still carrying, bled off a frame at a time.
         *
         * Decayed *before* it is spent, so a kick that arrived this frame is
         * already slightly past its peak - which costs nothing anybody can feel
         * and means the impulse can never be applied at full strength twice if
         * two frames run back to back with no time between them.
         */
        const knock = knockRef.current
        const falloff = knockbackFalloff(dt)
        knock.x *= falloff
        knock.z *= falloff
        // Below walking pace it is no longer a shove, it is drift. Snapped to
        // zero so the tail of an exponential does not nudge somebody off a ledge
        // a second after they thought they had stopped.
        if (Math.hypot(knock.x, knock.z) < 0.1) {
          knock.x = 0
          knock.z = 0
        }

        // A dash overrides the stick entirely rather than adding to it, so its
        // reach is the same whether you threw it standing still or at a sprint.
        // Knockback is added on top of either: being kicked mid-dash should
        // still move you, or a charging player would be immune to the boot.
        const moveX =
          (dashing
            ? dash.dir.x * DASH_SPEED * dt
            : WALK_DIR.x * pace * forward + RIGHT.x * pace * strafe) +
          knock.x * dt
        const moveZ =
          (dashing
            ? dash.dir.z * DASH_SPEED * dt
            : WALK_DIR.z * pace * forward + RIGHT.z * pace * strafe) +
          knock.z * dt

        // Captured before the step, because what the dash swept is exactly the
        // ground the physics is about to carry us over - including the part of
        // it a wall cuts short, which is why `to` is read back afterwards rather
        // than predicted from the speed.
        dash.from.x = player.x
        dash.from.y = player.y
        dash.from.z = player.z

        /**
         * The lift off a kick, spent here and only here.
         *
         * Assigned into the velocity before the step rather than handed to the
         * physics as another kind of jump, because that is exactly what it is
         * not: it costs no jumps, so being booted into the air still leaves you
         * your mid-air save. Which is the point - a kick should move you, not
         * disarm you.
         */
        if (knockRef.current.lift > 0) {
          velocityY.current = knockRef.current.lift
          knockRef.current.lift = 0
          grounded.current = false
        }

        const result = stepPhysics({
          position: player,
          velocityY: velocityY.current,
          moveX,
          moveZ,
          // Space, or the touch rig's up control, is now a jump. Suppressed
          // mid-dash: a charge is a horizontal commitment, and hopping out of
          // the middle of one would let you skip its recovery.
          jump: jumpDown && !dashing,
          jumpPressed: jumpPressed && !dashing,
          jumps: jumps.current,
          grounded: grounded.current,
          delta: dt,
          isSolid: (x, y, z) => blocks.has(blockKey(x, y, z)),
        })

        player.set(result.position.x, result.position.y, result.position.z)
        velocityY.current = result.velocityY
        grounded.current = result.grounded
        jumps.current = result.jumps

        /**
         * And out of anybody we ended up standing inside.
         *
         * After the block physics rather than folded into it, because they
         * answer different questions: a wall is a fixed thing to be stopped by,
         * a person is a moving thing to be pushed apart from. Resolving them
         * together would mean a wall could shove you into somebody with no
         * frame left to separate.
         *
         * Read from the *drawn* position rather than the last packet, so what
         * you bump into is the body you can see - the same choice the dash
         * makes when it judges a hit.
         */
        const peers = transformsRef.current
        if (peers && peers.size > 0) {
          const others: { x: number; y: number; z: number }[] = []
          for (const state of peers.values()) others.push(state.current)

          const pushed = separate(player, others)
          player.x = pushed.x
          player.z = pushed.z
        }

        /**
         * And what we are standing on.
         *
         * Judged after everything that could have moved us this frame - the
         * walk, the separation, the shove - so the block being billed for is
         * the one under the feet we ended up with, not the ones we passed over.
         *
         * Gated on `combat` like the dash is: a solo builder laying a lava
         * floor should be able to stand on their own work, and the room where
         * nobody can hurt you should not include a floor that can. Standing
         * still while grounded is required too, because lava you are falling
         * past has not burned you.
         */
        const burn = tickLava(
          burning.current,
          dt,
          combat &&
            !dead &&
            result.grounded &&
            underfoot(player, (x, y, z) => {
              const block = blocks.get(blockKey(x, y, z))
              return block ? isBurning(block.model) : false
            }),
        )
        burning.current = burn.elapsed
        if (burn.damage > 0) onBurn(burn.damage)

        dash.to.x = player.x
        dash.to.y = player.y
        dash.to.z = player.z
        // Flagged only while actually charging, so <Multiplayer> judges the
        // eleven frames of a dash and not every frame of ordinary walking.
        dash.swept = dashing
      }
    }

    /**
     * Placed every frame, including the frames with no input. The old version
     * returned early when nothing was pressed, which was free when the camera
     * *was* the player - now it would mean the view stays behind you until you
     * next move after pressing V, and looking around in third person would swing
     * the world instead of the camera.
     */
    if (mirror) {
      /**
       * Round the front, looking back.
       *
       * The same boom as third person with its sign flipped, so the distance
       * and the lift are the ones people are already used to and the mirror is
       * recognisably the same camera rather than a second rig with its own
       * feel. Turning still turns *you* - the camera orbits, because the
       * heading is what drives both - which is what makes this a mirror you
       * can look at yourself in from any side rather than a fixed portrait.
       */
      RIG_POSITION.copy(player)
        .addScaledVector(FORWARD, MIRROR_DISTANCE)
        .addScaledVector(UP, MIRROR_RAISE)
    } else if (thirdPerson) {
      RIG_POSITION.copy(player)
        .addScaledVector(FORWARD, -THIRD_PERSON_DISTANCE)
        .addScaledVector(UP, THIRD_PERSON_RAISE)
    } else {
      RIG_POSITION.copy(player)
    }

    /**
     * And the pose the shutter shoots from, which is this one whether or not
     * the camera is currently allowed to be here. See `shotPoseRef`.
     *
     * While parked at the overview the live camera is angled down at the player
     * from a long way off, so the rig above is derived from a *levelled* heading
     * instead of the live one - the same levelling the descent does, landing the
     * shot exactly where clicking in would have put you rather than somewhere
     * above and behind that. First person keeps the eye and only the heading is
     * flattened, because a picture pitched at the floor is not the room either.
     */
    const pose = shotPoseRef.current
    if (!watching) {
      pose.position.copy(RIG_POSITION)
      pose.quaternion.copy(camera.quaternion)
    } else {
      SHOT_EULER.setFromQuaternion(camera.quaternion)
      SHOT_EULER.x = 0
      SHOT_EULER.z = 0
      pose.quaternion.setFromEuler(SHOT_EULER)

      pose.position.copy(player)
      if (thirdPerson) {
        SHOT_FORWARD.set(0, 0, -1).applyQuaternion(pose.quaternion)
        pose.position
          .addScaledVector(SHOT_FORWARD, -THIRD_PERSON_DISTANCE)
          .addScaledVector(UP, THIRD_PERSON_RAISE)
      }
    }
    pose.ready = true

    /**
     * In a headset, the room moves and the camera does not.
     *
     * The one structural difference between VR and everywhere else, and it is
     * forced: inside a session three.js composes the camera from the headset
     * pose immediately before drawing, so `camera.position.copy(…)` below is
     * written and then discarded every single frame. The camera hangs off this
     * group, so putting the group where the player's feet are puts the eye where
     * the player's eye is, with the headset free to move within it.
     *
     * The feet rather than the eye because the session's reference space is
     * `local-floor`: the pose the headset reports is already a height above the
     * floor, and adding it to an eye would stand you on your own shoulders.
     * `EYE_HEIGHT` is what the rest of the world assumes a person is; your own
     * height is whatever the headset says, which is the better answer anyway.
     *
     * Returning here also skips the overview and the descent out of it, and that
     * is deliberate rather than incidental. Both are cameras that fly on their
     * own, and a camera that moves without your head moving is the thing that
     * makes people take a headset off - in VR you are simply in the room from
     * the first frame. `entry` is parked at the end for the same reason from the
     * other side: taking the headset off should hand the desktop camera straight
     * back, not play an arrival you already had.
     */
    if (rig) {
      /**
       * Nudged forward, out of the inside of your own head.
       *
       * The rig sits at the player's feet and the headset puts the eye directly
       * above it - which is the middle of the avatar's skull, so the model fills
       * the view from the inside. Reported from a headset: "you are often in the
       * middle of the model and it blocks your view."
       *
       * Along the **rig's** yaw rather than the headset's, and that is the part
       * worth getting right. The headset's yaw changes every time you turn your
       * head, so offsetting along it would slide you forwards and backwards
       * through the room as you looked about - locomotion by looking, which is
       * both disorienting and impossible to attribute to a camera offset. The
       * rig's yaw is the body's facing: it changes only when you snap-turn, so
       * the eye keeps a fixed place *in the body* and looking around moves
       * nothing.
       *
       * Small on purpose. Enough to clear the skull, not so much that you are
       * flying along in front of yourself and can see your own shoulders behind
       * you. The alternative fix - hiding your own avatar in VR - is the one
       * most games make, and it costs you the ability to look down and see that
       * you have a body, which is worth more in a social room than it is in a
       * shooter.
       */
      const nose = EYE_FORWARD
      rig.position.set(
        player.x - Math.sin(rig.rotation.y) * nose,
        player.y - EYE_HEIGHT,
        player.z - Math.cos(rig.rotation.y) * nose,
      )
      entry.current = 1
      return
    }

    /**
     * Watching the world, or standing in it.
     *
     * Two poses and a blend between them. While the overview is being watched -
     * the first arrival, or O - the camera is parked above and pointed at the
     * player; from the frame that ends, it travels to wherever the rig above put
     * it. See ./entry-view.ts for the shape of that and why the numbers live
     * there.
     */
    if (watching) {
      entry.current = 0

      const overview = overviewPosition(player, camera.getWorldDirection(ENTRY_DIR))
      camera.position.set(overview.x, overview.y, overview.z)
      camera.lookAt(player)

      // Kept for the descent to interpolate out of. Captured every frame rather
      // than on the transition, because the spawn can still move under us - a
      // block placed beneath your feet raises the eye, and the overview follows.
      entryFrom.position.copy(camera.position)
      entryFrom.quaternion.copy(camera.quaternion)
      // The overview aims itself with `lookAt`, so the heading has to follow the
      // camera here rather than the other way round - otherwise clicking in would
      // snap to wherever the angles happened to be left.
      euler.current.setFromQuaternion(camera.quaternion)
      return
    }

    if (entry.current < 1) {
      entry.current = advanceEntry(entry.current, delta)
      const t = entryEase(entry.current)

      camera.position.copy(entryFrom.position).lerp(RIG_POSITION, t)

      /**
       * Levelled on the way down, so the descent ends looking where the player
       * would be looking rather than still angled at their own feet.
       *
       * The target is the overview's *yaw* with the pitch taken out, which is
       * why it is derived from `entryFrom` and not from the live camera: the
       * live one is mid-blend, and reading it back each frame would chase a
       * moving target and never arrive. Any mouse movement during these nine
       * tenths of a second is overwritten - the alternative is fighting the
       * player for the camera, which looks like drift rather than like a move.
       */
      ENTRY_EULER.setFromQuaternion(entryFrom.quaternion)
      ENTRY_EULER.x = 0
      ENTRY_EULER.z = 0
      ENTRY_TARGET.setFromEuler(ENTRY_EULER)
      camera.quaternion.copy(entryFrom.quaternion).slerp(ENTRY_TARGET, t)
      // Tracked all the way down, so the heading the descent lands on is the one
      // that carries on being used. Look input during the descent is overwritten,
      // which is what the note above says should happen.
      euler.current.setFromQuaternion(camera.quaternion)
      return
    }

    camera.position.copy(RIG_POSITION)

    /**
     * And which way it faces.
     *
     * Written every settled frame rather than only when input arrives, because
     * leaving the mirror has to put the camera back and there is no input to
     * hang that off - somebody who taps the key and does not move the mouse
     * would otherwise still be looking at their own face.
     */
    if (mirror) {
      // At the head rather than at the eye: the eye *is* the camera's target
      // otherwise, and a portrait framed on the exact point the lens is aimed
      // through puts the face at the top of the screen with the body cut off.
      camera.lookAt(player.x, player.y - MIRROR_DROP, player.z)
    } else {
      camera.quaternion.setFromEuler(euler.current)
    }
  })

  return null
}
