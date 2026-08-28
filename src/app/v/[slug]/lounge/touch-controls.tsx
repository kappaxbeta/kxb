'use client'

import { useCallback, useRef, useState, useSyncExternalStore } from 'react'

/**
 * On-screen controls for touch devices.
 *
 * Mobile cannot use the desktop input model at all. Pointer lock does not exist
 * there, and without it the two things the desktop build relies on - a cursor
 * frozen at screen centre, and left/right mouse buttons - are both unavailable.
 * So touch gets a different scheme rather than a shim over the old one:
 *
 *   * a thumbstick for movement, because there are no WASD keys
 *   * dedicated up/down buttons, because there is no Space/Ctrl
 *   * explicit place/break buttons, because there is no left/right click
 *   * drag anywhere else to look, because there is no mouse to capture
 *
 * The crosshair stays exactly as it is. Centre-screen raycasting was already
 * the right model for first person, and it happens to be the one thing that
 * needs no adaptation - you aim by turning, on either device.
 */

export interface MoveInput {
  /** -1 back .. 1 forward */
  forward: number
  /** -1 left .. 1 right */
  strafe: number
  /** -1 down .. 1 up */
  vertical: number
  sprint: boolean
}

export interface LookDelta {
  dx: number
  dy: number
}

/**
 * Whether this is a touch-primary device.
 *
 * `pointer: coarse` rather than sniffing for touch events: hybrid laptops fire
 * touch events but should keep the mouse controls, and this asks the question
 * that actually matters - is the primary pointer imprecise.
 */
const COARSE_POINTER = '(pointer: coarse)'

function subscribeToPointerType(onChange: () => void): () => void {
  const query = window.matchMedia(COARSE_POINTER)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getPointerIsCoarse(): boolean {
  return window.matchMedia(COARSE_POINTER).matches
}

/**
 * `useSyncExternalStore` rather than useState + useEffect.
 *
 * matchMedia is an external store, and this is the hook built for reading one:
 * it subscribes without a synchronous setState during the effect (which tears
 * on concurrent renders and which react-hooks/set-state-in-effect rightly
 * rejects), and its third argument gives React an explicit server value instead
 * of a first render that happens to guess right.
 */
export function useIsTouch(): boolean {
  return useSyncExternalStore(
    subscribeToPointerType,
    getPointerIsCoarse,
    // The server has no pointer. Assume mouse and let the client correct it,
    // which costs one re-render on phones and none on desktop.
    () => false,
  )
}

/**
 * A thumbstick.
 *
 * Writes straight into a ref rather than React state. It updates on every touch
 * move - dozens of times a second - and the value is consumed inside the render
 * loop, so putting it in state would re-render the whole scene continuously to
 * deliver a number that the frame loop was going to read anyway.
 */
export function Joystick({
  onChange,
  className,
}: {
  onChange: (strafe: number, forward: number) => void
  className?: string
}) {
  const baseRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const activeId = useRef<number | null>(null)

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current
      if (!base) return

      const rect = base.getBoundingClientRect()
      const centreX = rect.left + rect.width / 2
      const centreY = rect.top + rect.height / 2
      const radius = rect.width / 2

      let dx = (clientX - centreX) / radius
      let dy = (clientY - centreY) / radius

      // Clamp to the unit circle so a diagonal is not faster than an axis -
      // the classic bug where walking north-east outruns walking north.
      const length = Math.hypot(dx, dy)
      if (length > 1) {
        dx /= length
        dy /= length
      }

      setKnob({ x: dx * radius * 0.6, y: dy * radius * 0.6 })
      // Screen down is positive Y, forward is negative Y.
      onChange(dx, -dy)
    },
    [onChange],
  )

  const release = useCallback(() => {
    activeId.current = null
    setKnob({ x: 0, y: 0 })
    onChange(0, 0)
  }, [onChange])

  return (
    <div
      ref={baseRef}
      /**
       * Centres the knob with flex and sets no position of its own.
       *
       * It used to be `relative` so the knob could be absolutely positioned
       * against it, while the caller passes `absolute` to anchor the whole
       * stick. Two `position` utilities on one element are resolved by their
       * order in Tailwind's generated stylesheet rather than in the attribute,
       * and `.relative` is emitted after `.absolute` - so the anchor lost and
       * the stick drew at its static position in the top-left corner, over the
       * HUD, instead of down by the player's thumb.
       */
      className={`flex size-32 items-center justify-center touch-none rounded-full border border-white/25 bg-black/25 backdrop-blur-sm ${className ?? ''}`}
      onPointerDown={(event) => {
        activeId.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        update(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        if (activeId.current !== event.pointerId) return
        update(event.clientX, event.clientY)
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="pointer-events-none size-12 shrink-0 rounded-full bg-white/70 shadow-lg"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  )
}

/**
 * A button that reports held/released rather than clicked.
 *
 * Flying up is a continuous action, so a click event is the wrong shape - the
 * frame loop needs to know whether the finger is still down.
 */
export function HoldButton({
  label,
  onHold,
  className,
}: {
  label: string
  onHold: (held: boolean) => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`size-14 touch-none select-none rounded-full border border-white/25 bg-black/30 text-lg text-white backdrop-blur-sm active:bg-white/25 ${className ?? ''}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        onHold(true)
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onPointerLeave={() => onHold(false)}
    >
      {label}
    </button>
  )
}

/**
 * Look control: drag anywhere that is not a button.
 *
 * Accumulates deltas into a ref which the frame loop drains, so the camera
 * turns at a rate tied to frames rather than to how often the OS decides to
 * deliver touch events.
 */
export function useLookDrag(lookRef: React.RefObject<LookDelta>, enabled: boolean) {
  const dragId = useRef<number | null>(null)
  const last = useRef({ x: 0, y: 0 })

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled) return
      dragId.current = event.pointerId
      last.current = { x: event.clientX, y: event.clientY }
    },
    [enabled],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || dragId.current !== event.pointerId) return

      lookRef.current.dx += event.clientX - last.current.x
      lookRef.current.dy += event.clientY - last.current.y
      last.current = { x: event.clientX, y: event.clientY }
    },
    [enabled, lookRef],
  )

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    if (dragId.current === event.pointerId) dragId.current = null
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
}
