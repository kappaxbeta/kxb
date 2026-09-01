'use client'

import { useCallback, useRef, useState } from 'react'
import type { WorldDict } from '@/app/i18n/world'
import { fill } from '@/app/i18n/fill'
import { MAX_THING_SCALE, MIN_THING_SCALE } from '@/domain/thingiverse/blueprint'
import type { SummonMatch } from '@/domain/thingiverse/summon'

/**
 * The panel you read while holding something.
 *
 * `/thingiverse ball` does not place a ball; it hands you one. This is the
 * other half of that: what you are holding, how to turn and resize it, which
 * other things the word could have meant, and the two ways to stop - put it
 * down, or walk away.
 *
 * Buttons rather than gizmos, for the reason the image panel gives: dragging a
 * handle competes with look-and-move for the same mouse, and everything here
 * lands on whole cells anyway. The keys are offered *as well*, because both
 * hands are already on the keyboard while you line something up.
 */

const BUTTON =
  'hud-key rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs transition hover:bg-white/25 disabled:opacity-40'

/**
 * How much one press changes the size.
 *
 * A multiplier rather than an addition, so the steps feel the same at both
 * ends: +0.1 on a bench at 0.2 doubles it and on one at 8 does nothing anybody
 * can see. Rounded to two decimals by the hook, which is what stops a chain of
 * presses arriving as 1.0000000000000002.
 */
export const SCALE_STEP = 1.25

/**
 * How far a finger travels for one step.
 *
 * The pad is a *touchpad*, not a stick: what moves the thing is the distance
 * dragged, not how far a knob is pushed and for how long. That is the whole
 * reason it replaced one - a stick moves a thing while you hold it, so placing
 * something is a matter of timing, and a pad moves it as far as you drag, which
 * is a matter of aim. One is a control you wait out; the other you point.
 *
 * 26px is about a thumb's width of travel: far enough that a resting hand does
 * not walk the thing across the room, near enough that a whole traverse of the
 * pad is a few cells rather than a marathon.
 */
const STEP_PX = 26

/**
 * How far one push moves it, in cells.
 *
 * Half a cell by default, which is the size that turned out to matter: a whole
 * cell is the block lattice, and things are not blocks - a bench 2.4 across
 * against a wall is either buried in it or standing a hand's width off. A tenth
 * is for the last nudge, when it is nearly right and you are looking at the gap.
 *
 * Three sizes rather than a slider. A slider over a live world is a control you
 * have to look at to set; three chips are a control you hit.
 */
export const MOVE_STEPS = [0.5, 0.2, 0.1] as const

export function scaled(scale: number, direction: 'up' | 'down'): number {
  const next = direction === 'up' ? scale * SCALE_STEP : scale / SCALE_STEP
  return Math.min(MAX_THING_SCALE, Math.max(MIN_THING_SCALE, next))
}

export function ThingPanel({
  carrying,
  matches,
  index,
  facing,
  scale,
  cell,
  dict,
  busy,
  onNudge,
  onShove,
  step,
  onStep,
  onPlace,
  onCancel,
  onRemove,
  falls,
  onFalls,
  solid,
  onSolid,
}: {
  /** What is in your hand, or null when the word matched nothing yet. */
  carrying: SummonMatch | null
  matches: SummonMatch[]
  index: number
  facing: number
  scale: number
  /** Where it would land. Null when the crosshair is on nothing. */
  cell: { x: number; y: number; z: number } | null
  dict: WorldDict['things']
  busy: boolean
  onNudge: (change: { facing?: number; scale?: number; index?: number }) => void
  /**
   * A push on the pad, in the pad's own axes: right, forward, up.
   *
   * Three numbers rather than a cell, because the pad has no idea where the
   * thing is or which way its owner is facing - both live in the scene, in refs
   * that change every frame. See `stepBy`.
   */
  onShove: (right: number, forward: number, up: number) => void
  /**
   * How far one push goes, and the way to change it.
   *
   * The scene's, not this panel's, because the keys move the thing too - see
   * the WASD handler. One number, two controls.
   */
  step: number
  onStep: (step: number) => void
  onPlace: () => void
  onCancel: () => void
  /**
   * Take it away instead of putting it down.
   *
   * Only when the thing in your hands is one that already exists - which since
   * `/xo` places directly is every time this panel is open. It belongs here
   * because this is the moment somebody has one in their hands and has decided
   * against it, and the alternative was the rail: open the door, find the row,
   * select it, dismiss. Four steps to undo one.
   */
  onRemove?: () => void
  /**
   * Whether this kind of thing falls, and the way to change it.
   *
   * Here rather than beside the chip, where it started. Gravity is a property
   * of the thing in your hands, and the panel is where the properties of the
   * thing in your hands are - it already carries turn and size, which are the
   * same kind of decision made at the same moment. Out on the HUD it was a
   * second floating control with no visible owner, sitting next to a chip that
   * is about something else entirely.
   *
   * Absent when the blueprint is somebody else's: the decider refuses the write
   * anyway, and a switch that always fails is worse than no switch.
   */
  falls?: boolean
  onFalls?: (falls: boolean) => void
  /**
   * Whether it stops you, and the way to change it.
   *
   * Beside gravity because the two together are what a ball *is*: something
   * that falls and that you do not stop dead against. Either one alone is
   * furniture - a crate that falls is still a crate in the doorway - so the
   * pair is drawn as a pair rather than filed on two different panels.
   */
  solid?: boolean
  onSolid?: (solid: boolean) => void
}) {
  if (!carrying) return null

  return (
    <div
      /*
        Out of the middle, and small.

        It sat in the centre of the screen over the crosshair, which is the one
        place it must not be: the whole panel is about a thing standing a few
        cells in front of you, and it was covering it. Bottom-left is the corner
        nothing else in this HUD claims - the block chip is centre, the emotes
        and the camera are right - and the glass is thinner than the other
        panels because there is a world behind it that somebody is looking at.
      */
      className="pointer-events-auto absolute bottom-4 left-4 w-60 rounded-2xl border border-white/15 bg-black/55 p-2.5 text-white backdrop-blur-sm"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {fill(dict.carrying, { name: carrying.name })}
        </span>
        {/*
          "Put back", not "Cancel". Nothing is being cancelled - the thing
          exists and is standing somewhere; this is the decision to leave it
          where it was. Cancel is still the word on the panels that really do
          throw something away.
        */}
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-full px-1.5 text-[11px] text-white/60 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {dict.putBack}
        </button>
      </div>

      {/*
        Moving it, on a stick.

        The same `<Joystick>` the touch rig steers with, and for the same reason
        it exists there: on a phone there is no crosshair to aim with and no
        keys to press. It was four arrow buttons first and that was wrong on a
        control somebody uses while *looking* at what they are lining up - a
        button has to be found and hit, and a stick is where your thumb already
        is.

        A stick is analogue and the lattice is not, so what the push becomes is
        a *repeat*: one cell the moment you lean on it, then another every
        `STEP_MS` while you hold. That is the honest mapping - the alternative,
        moving proportionally to how far the stick is pushed, would put a bench
        between two cells and there is nowhere between two cells for it to be.

        Height stays on two keys beside it. It is a nudge of a cell or two off
        whatever the thing landed on, and a second axis on the stick would mean
        every sideways push drifted it up or down.
      */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <TouchPan step={step} onShove={onShove} />

        <div className="flex flex-col gap-1">
          <Pad label="+" onPress={() => onShove(0, 0, step)} />
          <Pad label="−" onPress={() => onShove(0, 0, -step)} />
        </div>

        {/*
          Where it will land. It used to fall back to "look where it should
          stand", which was true when the preview followed the crosshair and has
          been dead copy since it stopped: a carried thing always has a cell.
        */}
        <div className="flex flex-col items-end gap-1">
          {/*
            How far one push goes. Beside the readout because they answer the
            same question from two sides - where it is, and how precisely you
            are moving it.
          */}
          <div className="flex gap-1" role="group" aria-label={dict.step}>
            {MOVE_STEPS.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={step === size}
                onClick={() => onStep(size)}
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums transition ${
                  step === size
                    ? 'bg-white/25 text-white'
                    : 'text-white/40 hover:text-white/80'
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          <span className="font-mono text-[10px] tabular-nums text-white/40">
            {cell ? `${round(cell.x)},${round(cell.y)},${round(cell.z)}` : ''}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-white/40">
            {dict.turn}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onNudge({ facing: facing + 1 })}
            className={BUTTON}
          >
            ⟳
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-white/40">
            {dict.size}
          </span>
          <button
            type="button"
            disabled={busy || scale <= MIN_THING_SCALE}
            onClick={() => onNudge({ scale: scaled(scale, 'down') })}
            className={BUTTON}
          >
            −
          </button>
          <button
            type="button"
            disabled={busy || scale >= MAX_THING_SCALE}
            onClick={() => onNudge({ scale: scaled(scale, 'up') })}
            className={BUTTON}
          >
            +
          </button>
        </div>

        {/*
          Whether it falls when you let go.

          Beside turn and size because it is read the same way they are - look
          at the thing, decide, press - and because the answer changes what
          "put it down" *means*: a lamp that hangs and a crate that drops are
          placed with the same gesture and land in two different places.
        */}
        {onFalls && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onFalls(!falls)}
            aria-pressed={falls}
            className={`hud-key rounded-lg border px-2 py-1 text-[10px] uppercase tracking-wide transition disabled:opacity-40 ${
              falls
                ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-200'
                : 'border-white/20 text-white/50 hover:bg-white/10'
            }`}
          >
            {falls ? dict.falls : dict.floats}
          </button>
        )}

        {onSolid && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSolid(!solid)}
            aria-pressed={solid}
            className={`hud-key rounded-lg border px-2 py-1 text-[10px] uppercase tracking-wide transition disabled:opacity-40 ${
              solid
                ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-200'
                : 'border-white/20 text-white/50 hover:bg-white/10'
            }`}
          >
            {solid ? dict.blocks : dict.passes}
          </button>
        )}

        {/*
          The other things that word could have meant.

          Only when there is more than one, because a "1 of 1" counter beside a
          Next button that does nothing is a control that has to be read to be
          dismissed. See `resolveSummon` for why a typed word resolves to a list
          rather than to a guess.
        */}
        {matches.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[10px] text-white/40">
              {index + 1}/{matches.length}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onNudge({ index: index + 1 })}
              className={BUTTON}
            >
              {dict.next}
            </button>
          </div>
        )}

        {/*
          Fuchsia, because this product has exactly one colour for things you
          can press - see DESIGN.md. It was emerald, which in this palette reads
          as a *finished* state rather than an action, and it was the only
          control on the panel that is the point of the panel.
        */}
        {onRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="hud-key rounded-lg border border-red-400/40 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/15 disabled:opacity-40"
          >
            {dict.dismiss}
          </button>
        )}

        <button
          type="button"
          disabled={busy || !cell}
          onClick={onPlace}
          /* `hud-key-filled`, not `bg-accent`: `.hud-key` is unlayered and a
             background utility on it never paints - see the variant in
             globals.css for what that looked like. */
          className="hud-key hud-key-pink hud-key-filled rounded-full px-3.5 py-1 text-xs font-medium transition disabled:opacity-40"
        >
          {dict.place}
        </button>
      </div>
    </div>
  )
}

/**
 * One key on the pad.
 *
 * `onPointerDown` rather than `onClick`, so a thumb gets the step the moment it
 * lands rather than when it lifts - a control you have to complete a tap on to
 * see anything reads as laggy at exactly the size a phone draws this.
 */
function Pad({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        // The pad is over a world that takes pointer events of its own, and a
        // press that reached both would nudge the thing and swing the camera.
        event.preventDefault()
        event.stopPropagation()
        onPress()
      }}
      className="hud-key size-8 rounded-lg border border-white/20 bg-white/10 text-xs transition hover:bg-white/25 active:bg-white/40"
    >
      {label}
    </button>
  )
}

/** One decimal, so a readout of a tenth does not print eight of them. */
function round(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1)
}

/**
 * The pad the thing is moved on.
 *
 * A ruled surface you drag: every `STEP_PX` of travel is one step, in the
 * direction you dragged, at whatever step size is chosen. It does not spring
 * back and it has no centre, because neither would mean anything - the thing is
 * where you left it, not where a knob is resting.
 *
 * The rules are the point of the drawing. A blank square gives a finger nothing
 * to measure against, so the grid is what makes a drag readable as *distance* -
 * and it is the same language the world's own floor is drawn in (see
 * `.neon-floor`), which is what makes a control over a room look like it
 * belongs to the room.
 */
function TouchPan({
  step,
  onShove,
}: {
  step: number
  onShove: (right: number, forward: number, up: number) => void
}) {
  const held = useRef<number | null>(null)
  const from = useRef({ x: 0, y: 0 })
  /** Travel not yet spent on a step, so a slow drag still adds up to one. */
  const owed = useRef({ x: 0, y: 0 })
  const [live, setLive] = useState(false)

  const move = useCallback(
    (x: number, y: number) => {
      owed.current.x += x - from.current.x
      owed.current.y += y - from.current.y
      from.current = { x, y }

      // Spent a whole step at a time, in a loop, so a fast drag that crosses
      // three steps between two pointer events moves three - a fling should not
      // be quietly worth less than a crawl.
      while (Math.abs(owed.current.x) >= STEP_PX) {
        const way = Math.sign(owed.current.x)
        owed.current.x -= way * STEP_PX
        onShove(way * step, 0, 0)
      }
      while (Math.abs(owed.current.y) >= STEP_PX) {
        const way = Math.sign(owed.current.y)
        owed.current.y -= way * STEP_PX
        // Screen down is positive; away from you is up the pad.
        onShove(0, -way * step, 0)
      }
    },
    [onShove, step],
  )

  const release = useCallback(() => {
    held.current = null
    owed.current = { x: 0, y: 0 }
    setLive(false)
  }, [])

  return (
    <div
      role="application"
      aria-label="Move"
      onPointerDown={(event) => {
        if (held.current !== null) return
        held.current = event.pointerId
        from.current = { x: event.clientX, y: event.clientY }
        owed.current = { x: 0, y: 0 }
        setLive(true)
        event.currentTarget.setPointerCapture(event.pointerId)
        // The world below takes pointer events of its own; a drag that reached
        // both would move the thing and swing the camera.
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerMove={(event) => {
        if (held.current !== event.pointerId) return
        move(event.clientX, event.clientY)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      className={`h-20 w-20 shrink-0 touch-none rounded-xl border transition ${
        live ? 'border-accent/70 bg-white/15' : 'border-white/20 bg-white/5'
      }`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, oklch(0.85 0.15 195 / 0.18) 0 1px, transparent 1px 13px), repeating-linear-gradient(90deg, oklch(0.85 0.15 195 / 0.18) 0 1px, transparent 1px 13px)',
      }}
    />
  )
}
