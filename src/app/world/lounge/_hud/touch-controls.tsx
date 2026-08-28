'use client'

import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import type { Hand } from '@/lib/controls/hand'

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
 *
 * Shared by the lounge, the house and the café, so anything changed here is
 * changed in all three. The look is in globals.css under "The in-world HUD".
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

/**
 * Read any media query as React state.
 *
 * `useSyncExternalStore` rather than useState + useEffect: matchMedia is an
 * external store, and this is the hook built for reading one. It subscribes
 * without a synchronous setState during the effect (which tears on concurrent
 * renders and which react-hooks/set-state-in-effect rightly rejects), and its
 * third argument gives React an explicit server value instead of a first render
 * that happens to guess right.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  // The server has no viewport and no pointer. Assume the desktop case and let
  // the client correct it, which costs one re-render on phones and none
  // elsewhere.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/**
 * Whether this is a touch-primary device.
 *
 * Deliberately about the *pointer*, not the screen size. This decides whether to
 * draw a thumbstick and skip pointer lock - questions about how the player
 * physically inputs - and a narrow desktop window is still a mouse. Layout is a
 * separate question, asked separately with a width query.
 */
export function useIsTouch(): boolean {
  return useMediaQuery(COARSE_POINTER)
}

/* -------------------------------------------------------------------------
 * Where the rig sits, and which way round
 * ------------------------------------------------------------------------- */

/**
 * Where the controls may sit without the phone eating them.
 *
 * The variables resolve to a plain 1rem on hardware with no notch and no home
 * indicator - see `--hud-edge` in globals.css. Kept here rather than left to
 * each scene, because the three scenes were previously using `bottom-20`,
 * `bottom-24` and `bottom-40` for the same corner and the iPhone home bar sat
 * across two of them.
 *
 * ---------------------------------------------------------------------------
 * Why these are lookups and not interpolated strings
 * ---------------------------------------------------------------------------
 * Tailwind reads the source for class names it has never run. A template that
 * built `left-[…]` or `right-[…]` out of a variable would compile happily and
 * ship a stylesheet with the mirrored rule missing, which is the worst kind of
 * failure here: it only shows up on the layout half the users chose. Both
 * strings are written out in full, so both exist in the CSS.
 *
 * The mirror is not a transform of the default either - `items-end` becomes
 * `items-start`, and a naive left/right swap would leave the action column
 * hanging off the wrong edge of its own stack.
 */
/*
 * Hard against the side - "make it more on the side left so it's on mobile
 * better". The *zone* hangs 36px off screen; the ring inside it is 32px
 * smaller each side, so the visible control ends up about 12px from the edge
 * on hardware with no notch, and the safe-area inset still pushes it in on
 * hardware with one.
 *
 * The underscores are load-bearing: Tailwind turns them into spaces, and CSS
 * calc() *requires* whitespace around a minus - `calc(var(--x)-36px)` is not
 * a subtraction but a parse error, and a parse error here is a declaration
 * silently dropped and a stick that never moves. That is exactly how the
 * first version of this shipped a no-op.
 */
const STICK_ANCHORS: Record<Hand, string> = {
  right: 'absolute bottom-[var(--hud-edge)] left-[calc(var(--hud-edge-x)_-_36px)] z-20',
  left: 'absolute bottom-[var(--hud-edge)] right-[calc(var(--hud-edge-x)_-_36px)] z-20',
}

/*
 * Measured off `--hud-edge` rather than off the screen, so the whole rig moves
 * as one. A battle raises that variable to clear its lobby panel (see
 * battle-room.tsx), and a stack that had kept its own hard-coded 4rem would
 * have stayed sat on the join buttons while the stick beside it lifted away.
 */
const ACTIONS_ANCHORS: Record<Hand, string> = {
  right:
    'absolute bottom-[calc(var(--hud-edge)+3rem)] right-[var(--hud-edge-x)] z-20 flex flex-col items-end gap-3',
  left: 'absolute bottom-[calc(var(--hud-edge)+3rem)] left-[var(--hud-edge-x)] z-20 flex flex-col items-start gap-3',
}

/**
 * The emote button, in the corner under the action stack.
 *
 * Here rather than in each scene for the reason above: it was three copies of
 * `bottom-4 right-4`, which is the same corner the thumbstick's neighbours are
 * anchored in and the one place the rig has to stay together.
 */
const EMOTE_ANCHORS: Record<Hand, string> = {
  right: 'bottom-[var(--hud-edge)] right-[var(--hud-edge-x)]',
  left: 'bottom-[var(--hud-edge)] left-[var(--hud-edge-x)]',
}

/*
 * Beside the stick, on the bottom row, rather than hovering over its ring.
 *
 * It used to float 9.5rem up, just above the ring, which reads beautifully on a
 * phone held upright and is wrong on one held sideways - which is how anybody
 * actually plays. A landscape scene is about 312px tall, and 9.5rem up from the
 * bottom edge puts the button's top at 88px: straight through the health
 * readout, which hangs under the top-left chip and ends at 118px. The whole
 * left-hand column is the stick's, and the readout was in it.
 *
 * So the two are pulled apart along the axis that has room in landscape rather
 * than the one that does not. 8.5rem in from the edge puts it clear of the ring
 * the thumb actually grabs - the zone hangs 36px off screen and the 7rem ring
 * is centred in it, so the ring's inner edge is at `-36px + 160px` = 124px -
 * with the last few pixels still inside the zone's deliberately generous hit
 * area. That is what `z-30` is for: where the two meet the button has to win,
 * or it is a button that sometimes grabs the stick instead.
 *
 * Not further in than that, because the far side of the gap is the action stack:
 * upright, that column starts at 227px, and a turbo button pushed out to meet
 * the ring's zone edge would sit three pixels off the kick.
 *
 * Both strings written out in full, for `STICK_ANCHORS`' reason: Tailwind reads
 * the source, and a mirrored rule built from a variable is a mirrored rule that
 * does not exist. The underscores are load-bearing there too.
 */
const TURBO_ANCHORS: Record<Hand, string> = {
  right:
    'absolute bottom-[var(--hud-edge)] left-[calc(var(--hud-edge-x)_+_8.5rem)] z-30',
  left: 'absolute bottom-[var(--hud-edge)] right-[calc(var(--hud-edge-x)_+_8.5rem)] z-30',
}

/**
 * The thumbstick's corner.
 *
 * Opposite the buttons, always - the two thumbs cannot share a side. Note that
 * `hand` names the *dominant* hand rather than the stick's corner (see
 * `@/lib/controls/hand`), so right-handed puts the stick on the **left**, which
 * is the arrangement every console has shipped since the PlayStation.
 */
export function stickAnchor(hand: Hand): string {
  return STICK_ANCHORS[hand]
}

/** The turbo button's spot, floating over the stick it boosts. */
export function turboAnchor(hand: Hand): string {
  return TURBO_ANCHORS[hand]
}

/** The action stack's corner: under the dominant thumb, opposite the stick. */
export function actionsAnchor(hand: Hand): string {
  return ACTIONS_ANCHORS[hand]
}

/** The emote button, in the corner below the action stack it belongs to. */
export function emoteAnchor(hand: Hand): string {
  return EMOTE_ANCHORS[hand]
}

/**
 * How much of the stick's travel is ignored.
 *
 * A thumb resting on the glass is never exactly centred, and without this the
 * player drifts slowly in whatever direction they happened to put it down. The
 * remaining travel is then rescaled to a full 0..1, so the dead zone costs no
 * top speed - it moves where the ramp starts, not where it ends.
 */
const DEAD_ZONE = 0.14

/**
 * A thumbstick, fixed in its corner.
 *
 * Writes straight into a ref rather than React state. It updates on every touch
 * move - dozens of times a second - and the value is consumed inside the render
 * loop, so putting it in state would re-render the whole scene continuously to
 * deliver a number that the frame loop was going to read anyway.
 *
 * The ring used to float, re-centring under wherever the thumb landed. The
 * theory was that a fixed ring makes the player look down to find it; in
 * practice the ring wandered around a 176px box and the control had no fixed
 * home at all, which is worse - you could never build the muscle memory that
 * would have stopped you looking down in the first place. So it is pinned, and
 * the zone around it stays deliberately larger than the ring so that a thumb
 * landing near it still grabs it.
 *
 * The trade is that touching the edge of the zone deflects immediately rather
 * than starting from neutral. That is the standard fixed-stick bargain and it
 * is the right one here: the zone is only 32px wider than the ring, so the
 * error is small, and it makes the stick's centre a place on the glass rather
 * than a place your thumb happened to be.
 */
export function Joystick({
  onChange,
  className,
}: {
  onChange: (strafe: number, forward: number) => void
  className?: string
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  /** Whether a thumb is on it, for the lit styling. */
  const [live, setLive] = useState(false)
  const activeId = useRef<number | null>(null)
  /** The ring's centre in client coordinates, measured once per touch. */
  const centre = useRef({ x: 0, y: 0 })

  const update = useCallback(
    (clientX: number, clientY: number) => {
      let dx = (clientX - centre.current.x) / RING_RADIUS
      let dy = (clientY - centre.current.y) / RING_RADIUS

      // Clamp to the unit circle so a diagonal is not faster than an axis -
      // the classic bug where walking north-east outruns walking north.
      const length = Math.hypot(dx, dy)
      if (length > 1) {
        dx /= length
        dy /= length
      }

      setKnob({ x: dx * KNOB_TRAVEL, y: dy * KNOB_TRAVEL })

      if (length < DEAD_ZONE) {
        onChange(0, 0)
        return
      }

      // Rescale the live band to a full 0..1. Without this the first responsive
      // input is already at 14% speed, which reads as a jolt.
      const ramp = Math.min(1, (length - DEAD_ZONE) / (1 - DEAD_ZONE)) / length
      // Screen down is positive Y, forward is negative Y.
      onChange(dx * ramp, -dy * ramp)
    },
    [onChange],
  )

  const release = useCallback(() => {
    activeId.current = null
    setKnob({ x: 0, y: 0 })
    setLive(false)
    onChange(0, 0)
  }, [onChange])

  return (
    <div
      ref={zoneRef}
      /**
       * The zone is the hit area, deliberately bigger than the ring inside it.
       * `touch-none` here rather than only on the ring, or a thumb that lands
       * 10px outside the ring scrolls the page.
       *
       * It centres its child with flex and sets *no* position of its own. That
       * is not a style preference - it is the fix for the stick appearing in
       * the top-left corner over the health bar. This used to be `relative` so
       * the ring could be absolutely positioned against it, while every caller
       * passes `absolute` in `className` to anchor it. Two `position` utilities
       * on one element are resolved by their order in Tailwind's generated
       * stylesheet, not by their order in the attribute, and `.relative` is
       * emitted after `.absolute` - so the caller's anchor lost every time and
       * the zone fell back to its static position at the top of the HUD.
       */
      className={`flex size-44 items-center justify-center touch-none ${className ?? ''}`}
      onPointerDown={(event) => {
        const zone = zoneRef.current
        if (!zone) return

        activeId.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)

        /**
         * Measured on touch rather than on mount, because the zone moves: the
         * safe-area insets that anchor it resolve differently once the browser
         * chrome settles, and on a phone that rotates it moves outright. Once
         * per touch is cheap and always right.
         */
        const rect = zone.getBoundingClientRect()
        centre.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }

        setLive(true)
        // Unlike the floating stick, the thumb is *not* at the centre by
        // construction, so the first frame has to be computed rather than
        // assumed neutral - otherwise a tap-and-hold near the rim reads as no
        // input until the thumb happens to move.
        update(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        if (activeId.current !== event.pointerId) return
        update(event.clientX, event.clientY)
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {/* Centred by the zone's flex, so the ring needs no position of its own
          and cannot fight the anchor the caller set. */}
      <div
        aria-hidden
        className={`hud-stick size-28 ${live ? 'hud-stick-live' : ''}`}
        style={{
          transition: 'opacity 160ms',
          opacity: live ? 1 : 0.75,
        }}
      >
        <div
          className="hud-knob size-12"
          style={{
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
            // Only the spring back to centre is animated. Following the thumb
            // must not be, or the stick lags behind the finger driving it.
            transition: live ? 'none' : 'transform 160ms var(--ease-out-soft)',
          }}
        />
      </div>
    </div>
  )
}

/** Half the ring's width, in px, matching `size-28` above (7rem at 16px). */
const RING_RADIUS = 56
/** How far the knob may slide from the ring's centre. Short of the rim, so the
 * knob never looks like it has escaped the ring it belongs to. */
const KNOB_TRAVEL = 34

/** The colour a touch control is lit in. Matches the keycap tones. */
export type TouchTone = 'cyan' | 'pink' | 'amber' | 'red'

const TONES: Record<TouchTone, string> = {
  cyan: '',
  pink: 'hud-touch-pink',
  amber: 'hud-touch-amber',
  red: 'hud-touch-red',
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
  tone = 'cyan',
  large,
  className,
}: {
  label: string
  onHold: (held: boolean) => void
  tone?: TouchTone
  large?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`hud-touch-btn ${TONES[tone]} ${large ? 'hud-touch-lg' : ''} ${className ?? ''}`}
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
 * A button for a one-shot action: place, break, dash, use.
 *
 * Exists so the three scenes stop each writing their own `size-14 rounded-full
 * border border-white/25 bg-…` string, which is how they ended up with four
 * different button sizes - two of them below the 44px minimum.
 *
 * `onPointerDown` rather than `onClick`, because a click is only delivered
 * after the pointer comes back up and the browser has decided it was not a
 * drag. On a control the player taps repeatedly under time pressure that delay
 * is felt, and the alternative failure - firing on a tap that was meant as the
 * start of a look drag - cannot happen here, since a drag starting on a button
 * is a drag the look handler never sees anyway.
 */
export function TapButton({
  label,
  onPress,
  tone = 'cyan',
  large,
  disabled,
  className,
}: {
  label: string
  onPress: () => void
  tone?: TouchTone
  large?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={`hud-touch-btn ${TONES[tone]} ${large ? 'hud-touch-lg' : ''} ${
        disabled ? 'opacity-40' : ''
      } ${className ?? ''}`}
      onPointerDown={(event) => {
        event.preventDefault()
        if (!disabled) onPress()
      }}
      // Keyboard and assistive tech never send a pointer event, so without this
      // the button is unreachable by anything but a finger.
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (!disabled) onPress()
        }
      }}
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
