'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * The wait on a key, on its way from the frame loop to the button.
 *
 * ---------------------------------------------------------------------------
 * Why the cooldown is a shared number rather than two of them
 * ---------------------------------------------------------------------------
 * A press is gated in ./simulation, because that is where the press pass is and
 * where the only clock a rule agrees with is kept. The button that draws the
 * wait is DOM, outside the Canvas, in two different files - a chip on a desktop
 * and a circle under a thumb. Three places, and only one of them may be allowed
 * to *decide* anything: a HUD running its own three-second timer would sooner or
 * later show a ring that has emptied while the gate still refuses, which is a
 * button that reads ready and does nothing. That is the worst failure this
 * feature has available to it, so the display is handed the answer rather than
 * asked to work it out.
 *
 * ---------------------------------------------------------------------------
 * And why it is a plain object the writer owns
 * ---------------------------------------------------------------------------
 * The same arrangement `Touch` uses in ./touch-controls, for the same reason:
 * the frame loop writes this sixty times a second and nothing on screen may
 * re-render for it. So the owner is the writer, the reader is handed a
 * reference, and the reader never writes - which is the shape React's compiler
 * is happy with and, more to the point, the shape where there is one authority
 * on the number.
 *
 * A **fraction** per action name rather than seconds - 1 on the frame the key
 * fired, 0 the moment it is ready - because that is what an arc is drawn from and
 * because it is the one form that needs no second number to be read. The seconds
 * and the wait they are a share of are both in ./simulation, on the simulated
 * clock a rule agrees with rather than a wall clock; see the two-clocks note
 * there.
 *
 * Keyed by `does`, the name a binding emits, because that is what a button
 * already knows itself by on all three surfaces - a chip, a thumb button and a
 * rule all deal in names, and only ./actions ever sees a key code. A key with no
 * wait on it is simply absent, so most levels hand over an empty map and the
 * whole mechanism costs a lookup that misses.
 */
export interface Cooling {
  of: Map<string, number>
}

/** Nobody is cooling down. Handed out frozen, because it is read and never kept. */
export const NO_COOLING: Readonly<Cooling> = Object.freeze({ of: new Map<string, number>() })

/**
 * The attribute a button names itself with, for the loop below to find it.
 *
 * A data attribute rather than a ref per button, and that is what makes this work
 * for *any* key rather than only the dash it was asked for. A ref would need a
 * hook per button, hooks cannot be called in a loop, and the number of buttons is
 * whatever the document bound - so the loop is given a container and finds the
 * buttons in it by name.
 */
export const COOL_KEY = 'data-cool'

/**
 * The custom property the ring is drawn from: 1 just fired, 0 ready.
 *
 * A CSS variable rather than a React value, and that is the whole trick of this
 * file. The ring changes every frame for three seconds, so the alternative is a
 * `setState` at frame rate re-rendering a row of buttons to move an arc - which
 * is the thing every other readout in this runtime is written to avoid. One
 * property write on one element per frame, and the arc, the fade and the dimming
 * all fall out of it in the stylesheet.
 */
const COOL = '--cool'

/**
 * Drive every waiting button's `--cool` inside one container off the shared map.
 *
 * Returns the ref to hang on whatever *holds* the buttons - the row, not a
 * button - and each button inside it names itself with `COOL_KEY`. One loop for
 * the whole row however many keys a document binds, which is the point: a ref
 * per button would need a hook per button, and a level's bindings are not known
 * until it is opened.
 *
 * `querySelectorAll` per frame reads worse than it costs. The row holds at most
 * `MAX_PLAYER_KEYS` buttons, the loop exits on the first frame where nothing has
 * changed - which is nearly all of them - and the alternative is a mutation
 * observer to keep a list in step with a row React already owns.
 *
 * It stops when the element goes away, which is what the cleanup is for: a level
 * closing mid-cooldown leaves a callback holding a node that is no longer on the
 * page.
 *
 * Undefined `cooling` is the ordinary case for most of a session: the buffer is
 * filled in when ./simulation mounts, and until then - and in every level that
 * binds no wait at all - the rings are simply empty rather than absent, which
 * costs one write of a zero each.
 */
export function useCooling(
  cooling: RefObject<Cooling | null> | undefined,
): RefObject<HTMLDivElement | null> {
  const node = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let frame = 0
    /**
     * The last value written per button, so a ready row is not restyled sixty
     * times a second for the rest of the level.
     *
     * Which is the common case by a very long way: a dash is three seconds of
     * cooling and then minutes of nothing, and a style write per frame through
     * all of the nothing would be this file paying for itself every frame of
     * every level that binds the key.
     */
    const drawn = new Map<string, number>()
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const row = node.current
      if (!row) return
      for (const element of row.querySelectorAll<HTMLElement>(`[${COOL_KEY}]`)) {
        const does = element.getAttribute(COOL_KEY)
        if (!does) continue
        const fraction = Math.min(1, Math.max(0, cooling?.current?.of.get(does) ?? 0))
        if (drawn.get(does) === fraction) continue
        drawn.set(does, fraction)
        element.style.setProperty(COOL, `${fraction}`)
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [cooling])

  return node
}

/**
 * The wait, as an arc round the outside of a circle.
 *
 * ---------------------------------------------------------------------------
 * A ring that drains, and no numbers
 * ---------------------------------------------------------------------------
 * Asked for as *"show it in the button maybe like a circle progress display
 * around"*, and a draining arc is the right reading of a cooldown rather than a
 * filling one: what a player wants to know is *how much longer*, and an arc that
 * is nearly gone answers it without being read.
 *
 * `pathLength={1}` is what makes this arithmetic-free. It renormalises the
 * circle's own length to one, so the dash array and the offset are fractions and
 * `--cool` can go straight into them - no circumference to compute, and no
 * number in this file that has to be kept in step with the radius above it.
 *
 * Two circles rather than one, because an arc with nothing behind it reads as a
 * broken border. The track is the shape of the wait; the arc is what is left of
 * it.
 */
export function CoolRing({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      // Decoration, and deliberately so: the wait is a fact about a button whose
      // own label already says what it does, and a screen reader announcing an
      // arc sixty times a second would be worse than one that never mentions it.
      aria-hidden
      className={`pointer-events-none ${className}`}
      // Gone when there is nothing to say, and it fades out over the last of the
      // wait rather than vanishing on the frame the arc runs out. The multiplier
      // is what keeps it *opaque* for the part of the cooldown somebody is
      // actually waiting through - a linear fade would spend the whole three
      // seconds half invisible.
      style={{ opacity: `min(1, calc(var(${COOL}, 0) * 5))` }}
    >
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        /*
          Twelve o'clock, and clockwise, because that is where every clock face
          and every cooldown in every game starts. Without it an arc begins at
          three o'clock, which reads as a progress bar somebody has bent round a
          circle.
        */
        transform="rotate(-90 16 16)"
        style={{ strokeDashoffset: `calc(1 - var(${COOL}, 0))` }}
      />
    </svg>
  )
}

/**
 * How dim a button is while it is cooling.
 *
 * Its own export because two surfaces draw the same button and a disabled look
 * that differed between them would read as two different states. Not `disabled`
 * and not `pointer-events: none`: the press is refused in ./simulation, which is
 * the only place that can refuse it correctly, and a button that stopped taking
 * taps would additionally have to be right about *when* - which is the second
 * authority this whole file exists to avoid. So it looks unavailable and the
 * tap goes nowhere, which is the same thing a phase's `allow` already does.
 *
 * Safe on a button with no wait behind it: `--cool` is unset there, so the
 * fallback makes this the opacity it would have had anyway. Which is what lets
 * both rows hand it to every action rather than asking which ones can cool.
 */
export const coolingDim = { opacity: `calc(1 - 0.5 * var(${COOL}, 0))` }
