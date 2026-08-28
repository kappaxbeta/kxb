'use client'

import { useWords } from './words-context'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { PunchName } from '../rules/moves'
import type { Edge, Held, Pad } from './keys'

/**
 * The controls a thumb can reach.
 *
 * ---------------------------------------------------------------------------
 * Not a stick, and that is the one real decision here
 * ---------------------------------------------------------------------------
 * The app's other touch controls - the lounge's and the XP runtime's - are a
 * thumbstick, because those are worlds you walk around in two dimensions. This
 * game has *one* axis and it is towards or away from one other person. A stick
 * for that is worse in three ways at once: it needs a dead zone, it can be
 * pushed diagonally into an answer that has to be thrown away, and it gives you
 * no way to feel where the boundary between "in" and "out" is without looking.
 *
 * Two buttons have none of those problems and cost nothing this game wanted.
 *
 * ---------------------------------------------------------------------------
 * Held and edge, on a surface where the difference is easy to lose
 * ---------------------------------------------------------------------------
 * `./keys` explains why `Intent` splits them. On a touchscreen keeping them
 * split needs care, because a finger leaving a button does not always fire the
 * event you expect: dragging off the edge of a `pointerdown`-ed element gives
 * you no `pointerup` on it at all unless the pointer was captured.
 *
 * So every held button captures its pointer, and releases on `pointerup`,
 * `pointercancel` *and* `lostpointercapture`. Miss one of those and the boxer
 * walks into the ropes until the next tap - the exact bug the keyboard's `blur`
 * handler exists to prevent, arriving by a different door.
 *
 * ---------------------------------------------------------------------------
 * `pointer: coarse`, not touch-event sniffing
 * ---------------------------------------------------------------------------
 * Copied from the lounge's reasoning: hybrid laptops fire touch events and
 * should keep the keyboard. The question that matters is whether the primary
 * pointer is imprecise, and that is the query that asks it.
 */

const COARSE = '(pointer: coarse)'

/**
 * Whether this is a thumb.
 *
 * `useSyncExternalStore` rather than `useEffect` + state, and the server
 * snapshot is `false`: a phone that mounted the touch controls during
 * hydration and then removed them would flash them, and a desktop that mounted
 * them for one commit would take a frame of layout for nothing.
 */
export function useCoarse(force: boolean): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const query = window.matchMedia(COARSE)
    query.addEventListener('change', notify)
    return () => query.removeEventListener('change', notify)
  }, [])

  const coarse = useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia?.(COARSE).matches) === true,
    () => false,
  )

  return force || coarse
}

/**
 * One button that is held.
 *
 * `touch-action: none` so the browser does not start a scroll or a
 * double-tap-zoom out from under a thumb that is trying to walk forwards. The
 * route's own viewport already refuses zoom; this is the per-element half, and
 * both are needed because they are enforced by different parts of the browser.
 */
function Hold({
  pad,
  action,
  label,
  hint,
  className = '',
}: {
  pad: Pad
  action: Held
  label: string
  hint: string
  className?: string
}) {
  const down = useRef(false)

  const set = (on: boolean, event: React.PointerEvent<HTMLButtonElement>) => {
    if (down.current === on) return
    down.current = on
    pad.hold(action, on)
    if (on) {
      // Captured, or a thumb that slides off the button never releases it.
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
  }

  return (
    <button
      type="button"
      aria-label={hint}
      className={`boxing-pad ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => set(true, event)}
      onPointerUp={(event) => set(false, event)}
      onPointerCancel={(event) => set(false, event)}
      onLostPointerCapture={(event) => set(false, event)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  )
}

/** One button that fires once per press, however long it is held. */
function Tap({
  pad,
  action,
  label,
  hint,
  className = '',
}: {
  pad: Pad
  action: Edge
  label: string
  hint: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={hint}
      className={`boxing-pad ${className}`}
      style={{ touchAction: 'none' }}
      // `pointerdown` rather than `click`: a click fires on release, which adds
      // the length of the tap to every punch's startup. On a 70ms jab that is
      // most of the move.
      onPointerDown={() => pad.press(action)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  )
}

/**
 * The punches, in the order they sit on the pad.
 *
 * The names are looked up rather than written here, because both halves of a pad
 * button are language: the printed one is an abbreviation, and an abbreviation is
 * not something you can clip out of a translation - "HK" is not the front of
 * "Кроше". So each language writes its own pair and this table only decides the
 * order and what each button does.
 */
const PUNCHES: readonly PunchName[] = ['jab', 'cross', 'hook', 'uppercut', 'overhand']

/**
 * The whole layout.
 *
 * Left thumb moves and evades, right thumb punches and guards - which is the
 * same split as the keyboard and for the same reason: guard has to be reachable
 * while you are moving, and on a phone that means it cannot share a thumb with
 * the direction buttons.
 *
 * The arrows are *screen* directions, like the keyboard's - see `Held` in
 * `./keys`. An arrow that meant "towards the opponent" would point one way for
 * one corner and the other way for the other, which is exactly the confusion
 * that made this change.
 *
 * Guard sits on the *right*, under the punches, because it is the button you
 * hold between exchanges and the one you release to throw. Putting it on the
 * left would mean both thumbs are busy the moment anybody presses anything.
 */
export function TouchControls({ pad, onFirst }: { pad: Pad; onFirst: () => void }) {
  const t = useWords()
  const woken = useRef(false)

  useEffect(() => {
    const wake = () => {
      if (woken.current) return
      woken.current = true
      onFirst()
    }
    window.addEventListener('pointerdown', wake, { once: true })
    return () => window.removeEventListener('pointerdown', wake)
  }, [onFirst])

  return (
    <div className="boxing-touch" aria-label={t.pad.controls}>
      <div className="boxing-touch-left">
        <div className="boxing-touch-row">
          <Tap pad={pad} action={{ kind: 'slip' }} label={t.pad.slip[0]} hint={t.pad.slip[1]} className="boxing-pad-defend" />
          <Tap pad={pad} action={{ kind: 'parry' }} label={t.pad.parry[0]} hint={t.pad.parry[1]} className="boxing-pad-defend" />
        </div>
        {/* The arrows are glyphs rather than words - see the note above. */}
        <div className="boxing-touch-row">
          <Hold pad={pad} action="left" label="◀" hint={t.pad.left} className="boxing-pad-move" />
          <Hold pad={pad} action="right" label="▶" hint={t.pad.right} className="boxing-pad-move" />
        </div>
        <div className="boxing-touch-row">
          <Tap pad={pad} action={{ kind: 'dash', towards: -1 }} label="«" hint={t.pad.dashLeft} className="boxing-pad-dash" />
          <Tap pad={pad} action={{ kind: 'dash', towards: 1 }} label="»" hint={t.pad.dashRight} className="boxing-pad-dash" />
        </div>
      </div>

      <div className="boxing-touch-right">
        <div className="boxing-touch-punches">
          {PUNCHES.map((punch) => (
            <Tap
              key={punch}
              pad={pad}
              action={{ kind: 'punch', punch }}
              label={t.pad[punch][0]}
              hint={t.pad[punch][1]}
              className="boxing-pad-punch"
            />
          ))}
        </div>
        <Hold pad={pad} action="guard" label={t.pad.guard[0]} hint={t.pad.guard[1]} className="boxing-pad-guard" />
      </div>
    </div>
  )
}
