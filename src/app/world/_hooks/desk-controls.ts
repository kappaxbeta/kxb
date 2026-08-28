import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { PITCH_MAX, PITCH_MIN } from '@/app/world/_sim/rig'

/**
 * Mouse and keyboard for a place you walk around in — the other half of
 * `lounge/_hud/touch-controls`, which does the same job for a thumb.
 *
 * Lifted out of the café and the house, which had 347 byte-identical lines
 * between them and this was most of them: the pointer-lock dance, the `L`
 * toggle, the same `0.002` mouse sensitivity, the same pitch clamp, the same
 * click routing, the same blur-releases-everything cleanup. Same argument as
 * ./rig, whose header says it out loud - *neither the maths nor the numbers
 * depend on what is being built* - and this is the input end of the same rig.
 *
 * ---------------------------------------------------------------------------
 * What the copy had already cost
 * ---------------------------------------------------------------------------
 * The two were not quite identical, and the differences are the reason this is
 * worth doing rather than a tidy-up. Three were real and are now parameters -
 * the café's `'build'` mode is the house's `'decorate'`, its `onInteract` is
 * `onAct`, its `onRemove` is `onSell`. Fine. They are the same gesture meaning
 * two different things, which is what a callback is for.
 *
 * The rest were **comments the second copy had lost**. The house's version of
 * the `auxclick` note stops after "does not raise `auxclick` in every browser"
 * and drops the half that says why that matters - that a bulldoze working in
 * one browser and silently doing nothing in another is worse than no bulldoze.
 * Its touch note drops the sentence explaining what touch does *instead*.
 *
 * Nothing was broken by that. It is just that the argument for the code only
 * existed in one of the two places it was needed, and there was no way to find
 * that out except to read both and compare. The full versions are kept below.
 *
 * ---------------------------------------------------------------------------
 * Why `editing` is mirrored into a ref
 * ---------------------------------------------------------------------------
 * Both callers already did this with a `modeRef`, and it is load-bearing rather
 * than an optimisation: the listeners are bound once, and a mode in the
 * dependency array would tear down and rebind all nine of them every time
 * somebody switched between building and walking. Rebinding a `pointerlockchange`
 * listener mid-session is how you lose a lock you already had.
 *
 * The callbacks stay in the dependency array, exactly as they were in both
 * copies, so callers must keep them stable. That is unchanged behaviour and
 * deliberately so - this move is meant to be invisible.
 */

/**
 * Where the camera starts looking, in radians below the horizon.
 *
 * Level with the horizon you see mostly wall, because everything worth
 * pressing a key at - counters, crates, tables, the floor you are about to
 * build on - is below eye height. Roughly the angle from the boom's resting
 * position down to a person standing in front of you, so a game opens looking
 * at them rather than over their head.
 */
export const OPENING_PITCH = -0.8

/** How far the mouse turns you, in radians per pixel of movement. */
const MOUSE_SENSITIVITY = 0.002

export function useDeskControls({
  camera,
  gl,
  keys,
  euler,
  isTouch,
  editing,
  pitch = OPENING_PITCH,
  onStart,
  onLockChange,
  onPlace,
  onInteract,
  onRemove,
  onCycle,
}: {
  camera: THREE.Camera
  gl: THREE.WebGLRenderer
  /**
   * Which key codes are down, cleared whenever the window loses focus.
   *
   * Passed in rather than returned, because the frame loop turns the camera
   * with the arrow keys and so writes `euler` too. A ref handed back from a
   * custom hook is one `react-hooks/immutability` will not let the caller
   * modify - correctly, since two writers and one owner is the thing that rule
   * exists to catch. Here the frame loop owns both and this only wires up the
   * listeners that also write them.
   */
  keys: React.RefObject<Record<string, boolean>>
  /** The look angles, kept in sync with the camera's quaternion. */
  euler: React.RefObject<THREE.Euler>
  /** No pointer lock and no key handling on a phone; touch has its own path. */
  isTouch: boolean
  /** Whether the player is placing things rather than walking around. */
  editing: boolean
  /** Where to start looking. Defaults to `OPENING_PITCH`. */
  pitch?: number
  /** First click or tap: the game begins. */
  onStart: () => void
  onLockChange: (locked: boolean) => void
  /** Left click while editing. */
  onPlace: () => void
  /** Left click while not editing - the café's interact, the house's act. */
  onInteract: () => void
  /** Right click while editing - the café's bulldoze, the house's sell. */
  onRemove: () => void
  /** The wheel while editing, as a direction rather than a delta. */
  onCycle: (direction: 1 | -1) => void
}): void {
  const editingRef = useRef(editing)
  useEffect(() => {
    editingRef.current = editing
  }, [editing])

  useEffect(() => {
    euler.current.set(pitch, 0, 0, 'YXZ')
    camera.quaternion.setFromEuler(euler.current)
  }, [camera, euler, pitch])

  useEffect(() => {
    const canvas = gl.domElement

    const onKeyDown = (event: KeyboardEvent) => {
      /**
       * L toggles the look lock without needing a click.
       *
       * Alt-tabbing or clicking off the canvas releases pointer lock, and
       * re-requesting it normally takes a click back onto the canvas. A
       * keypress counts as user activation too, so this hands back control -
       * and takes it away again - without one, and without touching `euler`,
       * so the camera is exactly where it was left.
       */
      if (event.code === 'KeyL' && !event.repeat && !isTouch) {
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
      keys.current[event.code] = false
    }

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      euler.current.setFromQuaternion(camera.quaternion)
      euler.current.y -= event.movementX * MOUSE_SENSITIVITY
      euler.current.x -= event.movementY * MOUSE_SENSITIVITY
      euler.current.x = Math.max(PITCH_MIN, Math.min(PITCH_MAX, euler.current.x))
      camera.quaternion.setFromEuler(euler.current)
    }

    const onPointerLockChange = () => {
      onLockChange(document.pointerLockElement === canvas)
    }

    const onClick = () => {
      /**
       * Touch never asks for pointer lock.
       *
       * It does not exist on a phone, and requesting it there either throws or
       * silently swallows the tap that should have started a look drag. Touch
       * acts through its own on-screen buttons instead.
       */
      if (isTouch) {
        onStart()
        return
      }

      if (document.pointerLockElement !== canvas) {
        onStart()
        // Not awaited, and deliberately not gated on: if the browser refuses,
        // the game still runs - you just look around with the arrow keys.
        void canvas.requestPointerLock()
        return
      }
      if (editingRef.current) onPlace()
      else onInteract()
    }

    /**
     * Right-click takes back.
     *
     * On `mousedown` rather than `auxclick`, because a pointer-locked canvas
     * does not raise `auxclick` in every browser and a bulldoze that works in
     * one and silently does nothing in another is worse than no bulldoze.
     */
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return
      event.preventDefault()
      if (editingRef.current) onRemove()
    }

    const onContextMenu = (event: Event) => event.preventDefault()

    const onWheelEvent = (event: WheelEvent) => {
      if (!editingRef.current) return
      event.preventDefault()
      onCycle(event.deltaY > 0 ? 1 : -1)
    }

    /**
     * Everything up, on the way out.
     *
     * A key that goes down in the tab and up somewhere else never delivers its
     * keyup here, and the flag stays set - so Shift held while you alt-tab
     * leaves you sprinting with nothing pressed. Clearing the whole map is
     * right rather than clearing Shift: any key can be orphaned the same way,
     * and a key genuinely still held sets itself again on its next repeat.
     */
    const releaseAll = () => {
      keys.current = {}
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('wheel', onWheelEvent, { passive: false })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('wheel', onWheelEvent)
    }
  }, [camera, gl, keys, euler, isTouch, onLockChange, onInteract, onPlace, onRemove, onStart, onCycle])
}
