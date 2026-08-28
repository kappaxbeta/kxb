'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { type Edge, pressBuffer } from '@/app/xp/_runtime/input/actions'
import { COOL_KEY, CoolRing, coolingDim, useCooling, type Cooling } from '@/app/xp/_runtime/hud/cooling'
import {
  NO_PUSH,
  pushFrom,
  SPRINT_KEEP,
  SPRINT_REACH,
  stickAt,
  type Push,
} from '@/app/xp/_runtime/input/touch'
import { countUp, thumbKeys } from '@/app/xp/_runtime/input/touch-keys'
import type { Hand } from '@/lib/controls/hand'
import { useHand } from '@/lib/controls/use-hand'
import { xpDict } from '@/app/i18n/xp'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * The controls a thumb can reach.
 *
 * Copied in shape from `src/app/world/lounge/_hud/touch-controls.tsx` rather
 * than imported, per AGENTS.md - and the parts worth copying are the decisions
 * rather than the markup. Two in particular, both of which the lounge learned
 * the hard way and neither of which is obvious:
 *
 * **The ring is pinned, not floating.** A stick that re-centres under wherever
 * the thumb lands sounds kinder and is worse: it wanders, so it has no fixed
 * home, so you look down to find it every time - which is exactly what a fixed
 * position stops. The zone around it is deliberately larger than the ring, so a
 * thumb landing near still grabs it.
 *
 * **`pointer: coarse`, not touch-event sniffing.** Hybrid laptops fire touch
 * events and should keep the mouse controls. The question that matters is
 * whether the primary pointer is imprecise, and that is the query that asks it.
 *
 * ---------------------------------------------------------------------------
 * Why these are refs the controller reads rather than state
 * ---------------------------------------------------------------------------
 * A stick updates dozens of times a second while a thumb moves, and the value is
 * consumed inside the frame loop. In React state that would re-render the whole
 * scene continuously to deliver a number the loop was going to read anyway.
 *
 * They are written in pointer handlers and never during render, which is the
 * distinction React's compiler actually cares about.
 */

/**
 * What the controls are asking for, read once a frame by the controller.
 *
 * A **plain mutable object**, deliberately not a `useRef`. It is a command
 * buffer shared between two subsystems - the DOM controls that write it and the
 * frame loop that reads it - and React owns neither of them. Wrapping it in a
 * ref said the opposite, and React's compiler correctly refuses a ref passed as
 * a prop and mutated by the component it was passed to: for a ref, that really
 * is two authorities on one value.
 *
 * The object is made once with `useMemo` and never replaced, so both halves hold
 * the same one for the life of the scene.
 */
export interface Touch {
  push: Push
  /** Held, like a key. The controller edge-detects it. */
  jump: boolean
  /**
   * Total pixels dragged since the level opened, ever increasing.
   *
   * A running total rather than an accumulator the reader zeroes, which is the
   * same shape `tally` and `teleports` use in ./simulation and for the same two
   * reasons. A ref passed down and mutated by its *reader* is the arrangement
   * React's compiler refuses - correctly, since the writer and the reader are
   * then both authorities on one value. And a total cannot lose a drag to a
   * frame boundary, where a drained accumulator can.
   */
  lookX: number
  lookY: number
  /**
   * How many times each of the level's actions has been tapped, ever.
   *
   * **Totals rather than a queue the reader drains**, which is the same shape
   * `lookX` uses and for a stronger reason than symmetry: the reader is a prop
   * away from the writer, and a reader that empties a queue is a second
   * authority on somebody else's object - which React's compiler refuses, and
   * is right to.
   *
   * A press is still an edge, and the edge is found by comparison: ./player
   * remembers what it saw last frame and fires the difference. That is exactly
   * what `pressesFrom` does for a headset, whose buttons have no events either.
   *
   * Bounded by `MAX_PLAYER_KEYS` keys rather than by how long somebody plays,
   * which a growing list of presses would not be.
   */
  taps: Readonly<Record<string, number>>
  /**
   * How many times each action has been *let go of*, ever.
   *
   * The other edge, counted the same way and separately — and its absence was a
   * bug you could hold in your hand: a level that picks up on `pressed` and puts
   * down on `released` was playable on a keyboard and one-way on a phone. You
   * could lift a piece and never place it, because nothing on the glass could
   * say the word the rules were waiting for.
   *
   * Which edge a tap turned out to be is not decided here — `pressBuffer` owns
   * that, so tap-tap and press-hold mean on glass exactly what they mean on a
   * keyboard, and no document has to know which one somebody used.
   */
  lifts: Readonly<Record<string, number>>
  /**
   * How many times the trigger has been pulled, ever.
   *
   * A counter for the same reason `taps` is one, and its own field rather than
   * an entry in that map because a shot is not one of the level's bound
   * actions - `player.weapon` is what puts a gun in somebody's hand, and the
   * shooter binds no keys at all.
   *
   * Which is exactly how it came to be unplayable on a phone: firing is a
   * `mousedown` while the pointer is locked, and a phone has neither a mouse
   * nor a pointer to lock. The level opened, the gun was drawn, and there was
   * no gesture on the device that could fire it - "i cant shoot on mobile the
   * buttons. is missing".
   */
  fire: number
  /**
   * How many times a thumb has asked to dance, ever.
   *
   * A counter rather than a flag, exactly like `fire` above and for its reason:
   * the frame loop compares it against what it saw last frame, so a tap is a
   * *change* and nothing has to be cleared by the reader. Which keeps the one
   * rule this buffer has - the controls write, the loop reads, and neither
   * reaches into the other's half.
   */
  dance: number
}

export const NO_TOUCH: Touch = {
  push: NO_PUSH,
  jump: false,
  lookX: 0,
  lookY: 0,
  taps: {},
  lifts: {},
  fire: 0,
  dance: 0,
}

/**
 * Whether this is a touch-primary device.
 *
 * Subscribed rather than read once: a tablet with a keyboard attached and
 * detached changes the answer, and a control scheme that needed a reload to
 * notice would be a control scheme people reload to fix.
 *
 * `force` overrides the real pointer, for the one caller that is not asking
 * about the device it is running on: the editor's per-device preview, which
 * wants a mouse-driven desktop to show what a thumb would see. Absent, this
 * is exactly the query it always was - the hook still subscribes, so a level
 * mid-preview does not miss a real device change either.
 */
export function useIsTouch(force?: boolean): boolean {
  /**
   * `useSyncExternalStore` rather than an effect that sets state.
   *
   * `matchMedia` *is* an external store, and reading it into state in an effect
   * means a render with the wrong answer followed immediately by a second one -
   * which React's own lint rule flags as a cascading render, and which here
   * would mount the mouse controls for a frame on every phone.
   */
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia('(pointer: coarse)')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const live = useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(pointer: coarse)').matches,
    // The server has no pointer at all, and guessing "coarse" would render a
    // thumbstick into the HTML of every desktop page load.
    () => false,
  )

  return force ?? live
}

/**
 * How far the knob travels, and therefore what full deflection means.
 *
 * Raised from 34, and then again with the ring it sits in - the two have to
 * move together: `stickAt` divides the pull by this, so a bigger ring with the
 * old number would reach full speed a third of the way out and read as *more*
 * twitchy on a pad that had just been made easier to aim. A longer throw is the
 * whole point - the same thumb movement now asks for less, which is what "a bit
 * sensitive" means on a stick you drive a board game with.
 */
const RADIUS = 52

/* -------------------------------------------------------------------------
 * Which way round it all goes
 * ------------------------------------------------------------------------- */

/**
 * The corners, per dominant hand.
 *
 * `hand` names the hand, not the corner - see `@/lib/controls/hand`. Right-
 * handed steers with the left thumb and acts with the right, which is the
 * layout this file has always drawn and is therefore the `right` column here.
 *
 * Written out in full rather than built from a variable, because Tailwind reads
 * the source for class names it has never run: an interpolated `left-${…}` would
 * compile fine and ship a stylesheet missing the mirrored rule, which is a bug
 * only left-handed players ever see. The action rail is not a pure mirror either
 * - `items-center` happens to survive it, but the top/bottom pinning does not
 * move, so the two strings differ in exactly one word and that is deliberate.
 */
/*
  The buttons wear the lounge's own `.hud-touch-btn` faces (globals.css, "The
  in-world HUD") rather than a local border-and-blur string - asked for in
  those words: the XP controls should look "like in peepz this colors". The
  stylesheet is shared ground in a way a component is not, so this is not a
  breach of the copy rule; sizes come with the classes (`hud-touch-lg` for
  jump and the trigger) so the two hosts' rigs read as one hardware.

  The stick corner is `-left-5`, matching the lounge's `- 36px`: the *zone*
  hangs 20px off screen, and the ring inside it is 32px smaller each side, so
  the visible control sits about 12px from the edge - "more on the side left
  so it's on mobile better". A thumb at the very edge of the glass still lands
  in the on-screen half of the zone, which is the half that matters.
*/
const LAYOUT: Record<Hand, { stick: string; jump: string; dance: string; rail: string }> = {
  right: {
    stick: 'absolute bottom-8 -left-5 flex size-52 touch-none items-center justify-center',
    jump: 'hud-touch-btn hud-touch-lg absolute bottom-10 right-8 uppercase tracking-wide',
    /*
      Beside jump rather than in its old perch above it: `bottom-32` is the
      action rail's own bottom edge, and once dance took the standard 3.5rem
      face it sat squarely on whatever the level bound there - measured on
      peepz as Dance covering the kick circle.
    */
    dance: 'hud-touch-btn pointer-events-auto absolute bottom-10 right-28 text-base',
    rail: 'pointer-events-none absolute bottom-32 right-8 top-4 flex touch-pan-y flex-col-reverse items-center gap-2 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  },
  left: {
    stick: 'absolute bottom-8 -right-5 flex size-52 touch-none items-center justify-center',
    jump: 'hud-touch-btn hud-touch-lg absolute bottom-10 left-8 uppercase tracking-wide',
    dance: 'hud-touch-btn pointer-events-auto absolute bottom-10 left-28 text-base',
    rail: 'pointer-events-none absolute bottom-32 left-8 top-4 flex touch-pan-y flex-col-reverse items-center gap-2 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  },
}

/**
 * The whole touch layout: a stick, a jump button, and a place to look.
 *
 * `touch` is made by the caller and written here. It is read by the controller
 * inside its frame loop, which is the only reader, so nothing re-renders when a
 * thumb moves.
 */
export function TouchControls({
  onReady,
  canLook,
  keys,
  latching,
  armed = false,
  cooling,
}: {
  /**
   * Handed the buffer once, on mount.
   *
   * The controls **own** it rather than being given one, and that inversion is
   * the whole point: React's compiler refuses a component that mutates
   * something passed in as a prop, and it is right to - the writer and the owner
   * being different is how two authorities on one value happen. So the writer
   * owns it and the reader is handed a reference.
   */
  onReady: (touch: Touch) => void
  /**
   * Whether dragging turns the camera.
   *
   * False for a side-on level, where the camera is nailed to an axis and a drag
   * would fight it every frame. Better to do nothing than to do something that
   * is immediately undone.
   */
  canLook: boolean
  /**
   * `player.keys`, so the level's own actions get buttons.
   *
   * Passed in rather than read from a context for the same reason the panel
   * takes them: this component is handed what to draw and decides nothing about
   * what a document may bind. `thumbKeys` is the whole of that decision.
   */
  keys?: readonly { key: string; does: string }[]
  /**
   * Which of those actions the level has a `released` rule for.
   *
   * Handed down for the same reason `keys` is - this component is told what to
   * draw and decides nothing about what a document may bind - and it matters
   * more here than anywhere: on glass every action is a circle somebody taps,
   * so an action that spends every second tap paying off a withheld release is
   * a button that does nothing half the time. See `pressBuffer`'s `latching`.
   */
  latching?: ReadonlySet<string>
  /**
   * Whether this player is carrying something that shoots.
   *
   * Drawn from `player.weapon` by the caller rather than decided here, on the
   * same terms as `keys`: this component is handed what to draw. A level with
   * no gun gets no trigger, because a button that fires nothing is a button
   * that teaches somebody a control the level does not have.
   */
  armed?: boolean
  /**
   * How long until each waiting key may be pressed again.
   *
   * Handed down beside `keys` and `latching` for the same reason those are: this
   * component draws what it is told about and decides nothing. It is a *reference*
   * to the frame loop's own numbers, so the rings on the circles move without this
   * tree - a stick, a jump button and a rail - rendering again. See ./cooling.
   */
  cooling?: { readonly current: Cooling | null }
}) {
  /**
   * Which thumb steers.
   *
   * Read here rather than passed in, unlike `keys` and `armed` above - those
   * are facts about the level and this is a fact about the player, so the
   * caller has nothing to say about it. The store is shared with the lounge
   * (`@/lib/controls/hand`), which is the one thing the copy rule does not
   * require a copy of: a preference is not a renderer.
   */
  const t = xpDict(useLocale()).controls
  const { hand } = useHand()
  const layout = LAYOUT[hand]

  const actions = useMemo(() => thumbKeys(keys), [keys])
  /**
   * The tap-versus-hold rule, borrowed rather than rewritten.
   *
   * `pressBuffer` is keyed by `KeyboardEvent.code` and nothing about it is about
   * keyboards: it is the thing that knows a quick press means *I have picked
   * this up* and owes its release to the next tap, while a long one means *I am
   * carrying this* and ends when the finger lifts. Handing it the action name as
   * the code gives a thumb both gestures for free — and, more to the point, one
   * place where the answer lives, so the phone and the keyboard cannot drift
   * into disagreeing about what a tap meant.
   */
  const presses = useMemo(
    () => pressBuffer(actions.map((action) => ({ key: action.does, does: action.does })), latching),
    [actions, latching],
  )
  /**
   * This component's own buffer, made once and never replaced.
   *
   * A `useRef` rather than a `useMemo`, and the difference is not cosmetic:
   * React's compiler treats a memoised value as immutable and refuses writes to
   * it, while a ref is the sanctioned place for exactly this - state a frame
   * loop reads and an event handler writes, that React is never told about.
   * `blockers` and `tally` in ./simulation are the same shape.
   */
  // Spread *and* fresh maps: `NO_TOUCH.taps` would otherwise be one object
  // shared by every scene on the page, counting all of their thumbs together.
  const touch = useRef<Touch>({ ...NO_TOUCH, taps: {}, lifts: {} })
  useEffect(() => {
    onReady(touch.current)
  }, [onReady])

  const zone = useRef<HTMLDivElement>(null)
  const centre = useRef({ x: 0, y: 0 })
  const stickId = useRef<number | null>(null)
  const lookId = useRef<number | null>(null)
  const lookFrom = useRef({ x: 0, y: 0 })
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  /** Whether a thumb is on the stick, for the lit ring - see `.hud-stick-live`. */
  const [live, setLive] = useState(false)
  /**
   * And whether that thumb has reached past the ring, which is a sprint.
   *
   * State rather than a ref because it is drawn - `.hud-stick-run` is the only
   * thing that tells anybody the extra speed exists, and an invisible control is
   * a control nobody finds. It is set from the push that was just computed, so
   * the styling and the movement cannot disagree; `touch.current.push.sprint`
   * stays the truth the frame loop reads.
   */
  const [running, setRunning] = useState(false)

  /**
   * An edge, counted onto whichever tally it belongs to.
   *
   * Nothing at all is the ordinary answer and not a failure: a quick tap
   * withholds its release on purpose, and `pressBuffer` says so by returning
   * nothing. The counter it does not touch is the counter the controller then
   * sees no change in, which is exactly right - that release is owed to the next
   * tap and will be counted then.
   *
   * Replaced rather than incremented in place, both of them: the maps are handed
   * out readonly and the controller tells "something happened" from an object
   * that is no longer the one it saw last frame.
   */
  /*
    One loop for the whole rail, however many keys the document bound: the ref goes
    on the row of buttons and each names itself with `COOL_KEY`. A ref per button
    would need a hook per button, and what a level binds is not known until it
    opens.
  */
  const rail = useCooling(cooling)

  const bump = (edge: Edge | undefined) => {
    if (!edge) return
    if (edge.on === 'pressed') touch.current.taps = countUp(touch.current.taps, edge.does)
    else touch.current.lifts = countUp(touch.current.lifts, edge.does)
  }

  return (
    <>
      {/*
        Somewhere to look, under everything else.

        The whole screen rather than a designated pad: on a phone the natural
        gesture is to drag the world, and a look area that was a box in a corner
        would be a box nobody found. It sits behind the stick and the button in
        the stacking order, so those take their own touches first.
      */}
      {canLook ? (
        <div
          className="absolute inset-0 touch-none"
          onPointerDown={(event) => {
            if (lookId.current !== null) return
            lookId.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            lookFrom.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerMove={(event) => {
            if (lookId.current !== event.pointerId) return
            /**
             * Accumulated rather than replaced, because the controller drains
             * this once a frame and a thumb can move several times between two
             * frames. Replacing would quietly throw the extra away and make a
             * fast flick turn less far than a slow one.
             */
            touch.current.lookX += event.clientX - lookFrom.current.x
            touch.current.lookY += event.clientY - lookFrom.current.y
            lookFrom.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerUp={() => {
            lookId.current = null
          }}
          onPointerCancel={() => {
            lookId.current = null
          }}
        />
      ) : null}

      {/* The stick. Its zone is bigger than its ring, so a thumb that lands
          near it still grabs it - see the note at the top of this file. */}
      <div
        ref={zone}
        className={layout.stick}
        onPointerDown={(event) => {
          const node = zone.current
          if (!node) return
          stickId.current = event.pointerId
          event.currentTarget.setPointerCapture(event.pointerId)
          /**
           * Measured on touch rather than on mount, because the zone moves: the
           * safe-area insets resolve differently once the browser chrome
           * settles, and a phone that rotates moves it outright. Once per touch
           * is cheap and always right.
           */
          const box = node.getBoundingClientRect()
          centre.current = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
          setLive(true)
        }}
        onPointerMove={(event) => {
          if (stickId.current !== event.pointerId) return
          const dx = event.clientX - centre.current.x
          const dy = event.clientY - centre.current.y
          const stick = stickAt(dx, dy, RADIUS)
          /**
           * A latch, not a line: it takes `SPRINT_REACH` to start running and a
           * fall back below `SPRINT_KEEP` to stop. Read off the push the loop is
           * actually using rather than off `running`, because a pointer can move
           * several times between two renders and the state would be a frame
           * behind - which is precisely the flicker the pair exists to remove.
           */
          const was = touch.current.push.sprint
          const push = pushFrom(stick, was ? SPRINT_KEEP : SPRINT_REACH)
          touch.current.push = push
          setKnob({ x: stick.x * RADIUS, y: stick.y * RADIUS })
          if (push.sprint !== was) setRunning(push.sprint)
        }}
        onPointerUp={() => {
          stickId.current = null
          touch.current.push = NO_PUSH
          setKnob({ x: 0, y: 0 })
          setLive(false)
          setRunning(false)
        }}
        onPointerCancel={() => {
          stickId.current = null
          touch.current.push = NO_PUSH
          setKnob({ x: 0, y: 0 })
          setLive(false)
          setRunning(false)
        }}
      >
        {/*
          A thumb is about 20mm across and this was 96px of ring holding a 40px
          knob, which is a target the thing pressing it covers entirely. Bigger
          on both counts - and then bigger again, because the first pass was
          still being driven by somebody who could not see what they were
          steering. 144px of ring, a 64px knob, and a zone half a centimetre
          wider than either so a thumb that lands *near* the stick still grabs
          it. `RADIUS` above moves with all three, so the extra size keeps
          buying precision rather than speed.
        */}
        {/* The lounge's own ring and knob (globals.css), at this rig's larger
            sizes - so the two hosts' sticks are one piece of hardware in two
            places rather than cousins. */}
        <div
          aria-hidden
          className={`hud-stick size-36 ${live ? 'hud-stick-live' : ''} ${
            running ? 'hud-stick-run' : ''
          }`}
          style={{ transition: 'opacity 160ms', opacity: live ? 1 : 0.75 }}
        >
          <div
            className="hud-knob size-16"
            style={{
              transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
              // Only the spring back to centre is animated. Following the
              // thumb must not be, or the stick lags behind the finger.
              transition: live ? 'none' : 'transform 160ms var(--ease-out-soft)',
            }}
          />
        </div>
      </div>

      {/*
        Jump, under the other thumb.

        Held rather than tapped, because the controller wants a key that is down
        - a double jump is two presses and the second one has to be able to
        arrive while the first is still held.
      */}
      <button
        type="button"
        aria-label={t.faces.jump}
        className={layout.jump}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          touch.current.jump = true
        }}
        onPointerUp={() => {
          touch.current.jump = false
        }}
        onPointerCancel={() => {
          touch.current.jump = false
        }}
      >
        {t.faces.jump}
      </button>

      {/*
        Dance, small and above the jump.

        Here rather than in the rail of level actions, because it is not one: the
        format reserves `KeyG` so that every XP has a dance whatever it bound, so
        on a phone it is a button that is always there for the same reason jump
        always is. Smaller than both, because it is the least urgent thing either
        thumb will ever do.
      */}
      <button
        type="button"
        aria-label={t.faces.dance}
        className={layout.dance}
        onPointerDown={(event) => {
          event.preventDefault()
          touch.current.dance += 1
        }}
      >
        ♪
      </button>

      {/*
        The level's own actions, stacked above the jump.

        Above rather than beside, and on the same side, for two reasons. The
        thumb that jumps is the thumb that acts - the other one is on the stick
        and cannot leave it while you are moving - and a column grows upward
        into empty sky rather than sideways into the stick's reach.

        **Both edges, not just the down one.** This drew a press and nothing
        else for as long as it has existed, which made every level that says
        *pick up on the way down, put it down on the way up* a one-way trip on a
        phone: the piece came up off the board and there was no way left to place
        it. Both ends of the finger are reported now, and `presses` above turns
        them into the same two gestures a keyboard gets — tap to pick up, tap
        again to place; or hold, carry, and lift.
      */}
      {(actions.length > 0 || armed) && (
        /*
          Scrollable, because five buttons do not fit on every phone.

          The column is pinned between the top of the frame and the jump button
          rather than growing from the bottom until it runs out of screen: a
          level that binds the full `MAX_PLAYER_KEYS` is nineteen rem of circles
          on a device that has about fourteen to spare, and what happened to the
          overflow was that it went off the top edge - or under the panel the HUD
          draws along the bottom - where no thumb could reach it.

          `flex-col-reverse` puts the scroll's own start at the *bottom*, so the
          rail opens where the thumb already is and the buttons a document listed
          first are the ones under it.

          The container takes no touches of its own - it is mostly empty sky over
          somebody's level, and a box that swallowed drags there would be a
          camera that stops turning in the top right corner for no visible
          reason. The buttons take them, and a drag that starts on one pans the
          rail: `touch-pan-y` rather than `touch-none` is what allows that, and
          the cost is written on the buttons themselves - the browser takes the
          gesture mid-press and the level hears a press and a release it did not
          quite mean. That is the honest trade for a button you can otherwise not
          reach at all, and it only arises on a rail long enough to scroll.
        */
        <div ref={rail} className={layout.rail}>
          {/*
            The trigger, at the bottom of the column and therefore nearest the
            thumb - `flex-col-reverse` draws the first child last.

            First in the DOM because it is first in importance: in a level with
            a gun, firing it is what the right thumb is for, and the level's own
            actions stack above it exactly as they stack above jump.

            Bigger and warmer than the rest, which is not decoration. Every other
            circle here is one of a set; this one is the difference between a
            level you can play on a phone and a level you can only watch.
          */}
          {armed && (
            <button
              type="button"
              aria-label={t.faces.fire}
              title={t.faces.fire}
              className="hud-touch-btn hud-touch-red hud-touch-lg pointer-events-auto shrink-0 uppercase tracking-wide"
              style={{ touchAction: 'pan-y' }}
              onPointerDown={(event) => {
                // One pull per tap, which is what a `mousedown` is on a desktop -
                // the frame loop consumes the change and fires exactly once.
                event.currentTarget.setPointerCapture(event.pointerId)
                touch.current.fire += 1
              }}
            >
              {t.faces.fire}
            </button>
          )}

          {actions.map((action) => (
            <button
              key={action.does}
              {...{ [COOL_KEY]: action.does }}
              type="button"
              aria-label={action.title}
              title={action.title}
              className="hud-touch-btn pointer-events-auto relative shrink-0 uppercase tracking-wide"
              /* `pan-y` inline, because `.hud-touch-btn` is unlayered CSS and
                 its `touch-action: none` outranks the Tailwind utility - the
                 rail's whole scroll story hangs on these buttons panning. */
              style={{ ...coolingDim, touchAction: 'pan-y' }}
              onPointerDown={(event) => {
                // On down, not on click: a click needs the finger to come back
                // up in the same place, and a thumb on a moving phone often
                // does not. Every other control here reads the same edge.
                //
                // Captured so the *release* arrives here as well - a thumb that
                // slides off the circle still fires `pointerup` on the element
                // that took it, which is what stops a finger drifting 3mm from
                // leaving somebody holding a piece forever.
                event.currentTarget.setPointerCapture(event.pointerId)
                bump(presses.down(action.does, false, event.timeStamp))
              }}
              onPointerUp={(event) => {
                bump(presses.up(action.does, event.timeStamp))
              }}
              /*
                A cancelled pointer is a finger that left - the browser taking
                the gesture for a scroll, a call arriving, the app going away.
                Reported as a lift rather than swallowed, for the same reason
                `pressBuffer.clear` exists on the keyboard side: coming back
                still holding something you cannot see yourself holding is worse
                than having put it down.
              */
              onPointerCancel={(event) => {
                bump(presses.up(action.does, event.timeStamp))
              }}
            >
              {action.label}
              {/*
                The wait, round the inside of the circle rather than round the
                outside of it. The rail scrolls, so anything drawn past the
                button's own edge is either clipped by it or widens the column
                the buttons are centred in - and a ring hugging the label reads
                as the same thing without either.
              */}
              <CoolRing className="absolute inset-1 text-white" />
            </button>
          ))}
        </div>
      )}
    </>
  )
}
