'use client'

import { useEffect, useRef, useState } from 'react'
import type { Cell, Target } from '@/app/world/lounge/_scene/scene-types'
import {
  actionsAnchor,
  HoldButton,
  Joystick,
  type MoveInput,
  stickAnchor,
  TapButton,
  turboAnchor,
} from '@/app/world/lounge/_hud/touch-controls'
import type { Hand } from '@/lib/controls/hand'
import type { WorldDict } from '@/app/i18n/world'

/**
 * The controls a thumb can reach, wired to this world.
 *
 * The buttons themselves are `./touch-controls`, which knows nothing about a
 * lounge; this is the layer that says which of them exist here and what each
 * one does. A hundred lines out of `lounge-scene.tsx`, where they sat at the
 * very bottom of a 1,186-line component and were the only thing in it that a
 * keyboard never reaches.
 *
 * Three of the four groups below are gated, and the reasons are not symmetrical:
 *
 *  - **Dance is not gated at all.** Building and fighting are the two things the
 *    mode chooses between, and dancing is neither - it is what you do while
 *    waiting for somebody, mid-scrap, or instead of a scrap. On a phone it had
 *    no control at all, which made the one verb in the room with no cost and no
 *    cooldown a keyboard-only feature.
 *  - **▲ is never gated either**, because it is two things at once: up while
 *    flying, and *jump* while walking - `<PlayerControls>` turns `vertical > 0`
 *    into a jump when your feet are on the ground. It is the only jump control
 *    touch players have, and hiding it for walkers left them unable to jump at
 *    all. ▼ is the flight-only half: there is nothing below a walking player to
 *    descend into.
 *  - dash and kick need combat, break and place need building.
 */
/** How long one press of turbo sprints for, in seconds. */
const TURBO_SECONDS = 5

/**
 * Turbo: the sprint a thumb cannot hold.
 *
 * Desktop sprints by holding Shift, and there is no Shift on glass - so a
 * phone player has spent their whole life at walking pace, seven cells a
 * second in a room where everybody else does thirteen. Reported as the speed
 * being weird on mobile, and it was: it was the only device with no way to be
 * fast.
 *
 * A burst rather than a hold, because the thumb that would hold it is the one
 * driving the stick. One tap is five seconds of sprint; tapping again while it
 * is lit starts the five seconds over rather than cancelling, because a
 * cancel nobody asked for is what a double-tap would otherwise do.
 *
 * It floats just above the stick - `turboAnchor` - so it belongs visibly to
 * the thumb that moves, not to the action stack on the other side.
 */
function TurboButton({
  hand,
  dict,
  moveRef,
}: {
  hand: Hand
  dict: WorldDict
  moveRef: React.RefObject<MoveInput>
}) {
  const [live, setLive] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const burst = () => {
    moveRef.current.sprint = true
    setLive(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      moveRef.current.sprint = false
      setLive(false)
    }, TURBO_SECONDS * 1000)
  }

  /*
   * The sprint is a claim on a shared ref, so leaving the room mid-burst has
   * to withdraw it - an unmounted button must not leave the next scene's
   * controls sprinting forever.
   */
  useEffect(() => {
    const move = moveRef
    return () => {
      if (timer.current) clearTimeout(timer.current)
      move.current.sprint = false
    }
  }, [moveRef])

  return (
    <button
      type="button"
      aria-label={dict.softKeys.turbo}
      className={`hud-touch-btn ${live ? 'hud-touch-amber' : ''} ${turboAnchor(hand)}`}
      onPointerDown={(event) => {
        // `onPointerDown` for TapButton's reason: a control pressed under time
        // pressure must not wait for the browser to decide it was not a drag.
        event.preventDefault()
        burst()
      }}
      onKeyDown={(event) => {
        // Reachable without a finger, like TapButton: keyboard and assistive
        // tech never send a pointer event.
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        burst()
      }}
    >
      {/* The glyph is decoration; the name is the aria-label above. FE0E keeps
          it a drawn character rather than a full-colour emoji in the HUD. */}
      <span aria-hidden>{'⚡︎'}</span>
    </button>
  )
}

export function TouchLayer({
  hand,
  dict,
  moveRef,
  dashRef,
  kickRef,
  targetRef,
  selected,
  canBuild,
  combat,
  flying,
  dancing,
  onDancing,
  onPlace,
  onRemove,
}: {
  /** Which side the stick sits on. See `stickAnchor`. */
  hand: Hand
  dict: WorldDict
  moveRef: React.RefObject<MoveInput>
  dashRef: React.RefObject<{ requested: boolean }>
  kickRef: React.RefObject<{ requested: boolean }>
  /** What the crosshair is on, read at the moment of the press. */
  targetRef: React.RefObject<Target>
  /** The block a press of *place* would lay. */
  selected: string
  canBuild: boolean
  combat: boolean
  flying: boolean
  dancing: boolean
  onDancing: (next: (current: boolean) => boolean) => void
  onPlace: (cell: Cell, model: string) => void
  onRemove: (cell: Cell) => void
}) {
  return (
    <>
    <Joystick
      className={stickAnchor(hand)}
      onChange={(strafe, forward) => {
        moveRef.current.strafe = strafe
        moveRef.current.forward = forward
      }}
    />

    <TurboButton hand={hand} dict={dict} moveRef={moveRef} />

    <div className={actionsAnchor(hand)}>
      {/*
        Dancing, in every mode and on every device.

        Outside both gates below on purpose. Building and fighting are the
        two things the mode chooses between, and dancing is neither - it
        is what you do while waiting for somebody, mid-scrap, or instead
        of a scrap. On a phone it had no control at all, which meant the
        one verb in the room with no cost and no cooldown was a
        keyboard-only feature.
      */}
      <div className="flex gap-3">
        <TapButton
          label={dancing ? dict.world.stopDancing : dict.softKeys.dance}
          tone={dancing ? 'pink' : 'cyan'}
          onPress={() => onDancing((current) => !current)}
        />
      </div>

      {/*
        ▲ is always here, because it is two things at once: up while flying,
        and *jump* while walking - <PlayerControls> turns `vertical > 0` into a
        jump when your feet are on the ground. So this is the only jump control
        touch players have, and hiding it for walkers left them unable to jump
        at all. The HUD hint below says as much: "▲ jump" versus "▲▼ fly".

        ▼ is the flight-only half. There is nothing below a walking player to
        descend into, so it would be a button that never does anything.
      */}
      <div className="flex gap-3">
        {/* Named for what it does rather than which way it points. The glyph
            was also its `aria-label`, so a screen reader used to announce
            "▲" - which tells somebody nothing about how to get over a wall. */}
        <HoldButton
          label={flying ? '▲' : dict.softKeys.jump}
          onHold={(held) => {
            moveRef.current.vertical = held ? 1 : 0
          }}
          large
        />
        {flying && (
          <HoldButton
            label="▼"
            onHold={(held) => {
              moveRef.current.vertical = held ? -1 : 0
            }}
          />
        )}
      </div>
      {combat && (
        <div className="flex gap-3">
          <TapButton
            label={dict.softKeys.dash}
            tone="amber"
            large
            onPress={() => {
              dashRef.current.requested = true
            }}
          />
          {/* Beside the dash rather than under it, because they are the
              same kind of thing: the two ways to touch somebody. */}
          <TapButton
            label={dict.softKeys.kick}
            tone="amber"
            onPress={() => {
              kickRef.current.requested = true
            }}
          />
        </div>
      )}

      {/* Only these two are building. */}
      {canBuild && (
        <div className="flex gap-3">
          <TapButton
            label={dict.softKeys.break}
            tone="red"
            onPress={() => {
              const current = targetRef.current
              if (current.hit) onRemove(current.hit)
            }}
          />
          <TapButton
            label={dict.softKeys.place}
            tone="pink"
            onPress={() => {
              const current = targetRef.current
              if (current.place) onPlace(current.place, selected)
            }}
          />
        </div>
      )}
    </div>
    </>
  )
}
