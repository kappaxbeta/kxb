'use client'

import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * The controls a movie panel is made of.
 *
 * ---------------------------------------------------------------------------
 * Copied from the studio, in this editor's own colours
 * ---------------------------------------------------------------------------
 * `src/app/ovaloffice/studio/parts.tsx` is the same vocabulary and has been
 * composing the landing page's videos for months, and it is exactly the shape a
 * movie panel wants: **collapsible sections with an icon and a summary**, a
 * **row per thing** that opens further, and a **slider with the number beside
 * it**. Asked for by name - *"can the UI to edit the character and the objects
 * be more like in studio video, it's cool like there"* - and it is the right
 * instinct: a flat column of labelled fields is fine for four numbers and
 * hopeless for a cast.
 *
 * `src/app/xp/` may not import the backoffice (creator.md §1.2, enforced by
 * `no-restricted-imports`), so this is a copy. Two things deliberately did not
 * come across:
 *
 * - **The palette.** The studio is in the app's design tokens - `border-line`,
 *   `bg-surface-raised`, `text-ink-muted` - and this editor is in raw neutrals
 *   and violet, on purpose, because it is a dark tool over a dark canvas and it
 *   has looked like that since it existed. Copying the tokens would have made
 *   one panel of the editor look like a different application.
 * - **The sizes.** The studio is a page you read; this is a 320px column beside
 *   a viewport. Everything here is a step smaller, which is the same call the
 *   rest of `_editor` already made.
 *
 * What *did* come across is the part that matters: the structure, and the note
 * on `Scrub` about why a number being edited has to be held as text.
 */

/**
 * A part of the panel, collapsible, with a chip saying what is inside.
 *
 * `<details>` rather than a `useState` per section, and that is not laziness:
 * the browser remembers nothing here either way, but a native disclosure is
 * keyboard-operable, findable by the page's own find, and cannot get out of
 * step with itself. The summary chip is what makes a closed section worth
 * having - "3 cameras" tells you whether to open it.
 */
export function Section({
  title,
  summary,
  icon: Icon,
  open = false,
  children,
}: {
  title: string
  summary?: string
  icon?: LucideIcon
  open?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      open={open}
      className="group rounded-lg border border-neutral-900 bg-neutral-950/40 px-2 py-1.5 transition-colors open:bg-neutral-900/30 hover:border-neutral-800"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2">
        {Icon ? (
          <span className="grid size-6 shrink-0 place-items-center rounded border border-violet-500/30 text-violet-300 transition-colors group-open:border-violet-500/60">
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 transition-colors group-open:text-neutral-300">
          {title}
        </span>
        {summary ? (
          <span className="shrink-0 rounded-full border border-neutral-800 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500">
            {summary}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 text-neutral-600 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </details>
  )
}

/**
 * One thing in a section, which opens further.
 *
 * The same treatment a level down: a swatch or a letter instead of an icon, and
 * no prose. Split out because the alternative is four call sites repeating it
 * and drifting - which is what happened in the studio, where blocks had a
 * border the peeps did not.
 */
export function Row({
  lead,
  title,
  detail,
  trailing,
  open,
  onToggle,
  children,
}: {
  lead?: React.ReactNode
  title: string
  detail?: string
  trailing?: React.ReactNode
  /**
   * Controlled, unlike the studio's, because selecting an actor here has to
   * open its row - a cast list where clicking somebody in the viewport
   * highlights a collapsed row is a selection you cannot act on.
   */
  open?: boolean
  onToggle?: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <details
      {...(open === undefined ? {} : { open })}
      /*
        A toggle this row did not cause is not a toggle.

        `<details>` fires `toggle` whether a person opened it or React did -
        and React does, every time the selection changes, because `open` is
        controlled. The handler read that as a click and reported a *fresh*
        selection, which replaced the one that had just been made.

        That is how multi-select was broken: picking a second body added it,
        the second row opened in response, and the row's own toggle collapsed
        the pair back to one. Shift-click had it too, long before there was a
        button for it - the log reads `add true` immediately followed by `add
        false` on the same name.

        `open` is what discriminates: if it already says open, this event is
        React catching the element up, not somebody pressing it.
      */
      onToggle={(event) => {
        const now = (event.currentTarget as HTMLDetailsElement).open
        if (now === open) return
        onToggle?.(now)
      }}
      className="group/row rounded border border-neutral-900 bg-neutral-950/40 px-2 py-1.5 transition-colors hover:border-neutral-800"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[11px] text-neutral-300">
        {lead}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {detail ? <span className="shrink-0 text-[9px] text-neutral-600">{detail}</span> : null}
        {trailing}
        <ChevronDown
          aria-hidden
          className="size-3 shrink-0 text-neutral-600 transition-transform group-open/row:rotate-180"
        />
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5">{children}</div>
    </details>
  )
}

/**
 * The thumb, written once.
 *
 * A native range input cannot be styled from outside - the track and the thumb
 * are shadow parts, reachable only through the vendor pseudo-elements - so this
 * is the whole of the slider's appearance and it has to be repeated per engine.
 * A constant rather than pasted at each call site, because three copies of forty
 * characters of vendor prefix is how two sliders end up different sizes.
 */
const THUMB = ['size-3 appearance-none rounded-full bg-violet-400 ring-2 ring-neutral-950']
  .flatMap((rules) => rules.split(' '))
  .flatMap((rule) => [`[&::-webkit-slider-thumb]:${rule}`, `[&::-moz-range-thumb]:${rule}`])
  .join(' ')

/**
 * A slider with the number beside it, both live.
 *
 * A slider is how you find a value and a box is how you set one you already
 * know, and a movie wants both: a light is dragged until it looks right, and an
 * actor goes to exactly z = -3.5 because that is where the crate is. The
 * studio's own note records that the readout was once deliberately *not* an
 * input, on the grounds that two controls are two sources of truth - and that
 * this was wrong in the ordinary way, because both are views of one number in
 * the document and neither holds state.
 */
export function Slide({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
  trailing,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
  /** A key button, usually. Kept out of this component so it stays about numbers. */
  trailing?: React.ReactNode
}) {
  const span = max - min
  const fill = span <= 0 ? 0 : ((Math.min(max, Math.max(min, value)) - min) / span) * 100

  return (
    <div className="group flex items-center gap-1.5">
      <span className="w-14 shrink-0 truncate font-mono text-[10px] text-neutral-500">{label}</span>
      {/* Taller than the track, so the whole row is draggable rather than the
          four pixels of it that are painted. */}
      <span className="relative flex h-5 min-w-0 flex-1 items-center">
        <span aria-hidden className="absolute inset-x-0 h-1 rounded-full bg-neutral-800" />
        <span
          aria-hidden
          className="absolute left-0 h-1 rounded-full bg-violet-500/60 transition-[width] duration-75"
          style={{ width: `${fill}%` }}
        />
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          onChange={(event) => onChange(Number(event.target.value))}
          className={`relative h-5 w-full cursor-grab touch-none appearance-none bg-transparent active:cursor-grabbing focus:outline-none ${THUMB}`}
        />
      </span>
      <Scrub value={value} min={min} max={max} step={step} unit={unit} onChange={onChange} />
      {trailing}
    </div>
  )
}

/**
 * The number, editable in place.
 *
 * Held as text while it is being typed and committed only when it parses. The
 * naive version - `onChange={(n) => set(Number(n))}` - moves the actor to the
 * origin the moment somebody selects all and starts typing, and makes a leading
 * minus sign impossible to enter at all.
 */
function Scrub({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) {
  /**
   * The half-typed text, and the value it was typed *against*.
   *
   * The pair is what lets this follow the document without an effect. The first
   * version reset the text in a `useEffect` on `value`, which is a cascading
   * render and is refused by lint - rightly: an effect that immediately calls
   * `setState` is a render that happens twice for no reason.
   *
   * Comparing instead needs no effect at all. While somebody is typing, the
   * value they last committed matches and their text stands - so "3." survives
   * the round trip through the document and the decimal point can be typed. The
   * moment the value changes from anywhere *else* - a slider drag, a key
   * landing, an undo - it stops matching and the document wins, which is
   * exactly the behaviour the effect was there for.
   */
  const shown = String(Math.round(value * 100) / 100)
  const [typed, setTyped] = useState<{ text: string; against: number } | null>(null)
  const showing = typed && typed.against === value ? typed.text : shown

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <input
        value={showing}
        onChange={(event) => {
          const text = event.target.value
          const next = Number(text)
          if (text.trim() !== '' && Number.isFinite(next)) {
            const clamped = Math.min(max, Math.max(min, next))
            setTyped({ text, against: clamped })
            onChange(clamped)
            return
          }
          // Not a number yet - an empty box, or a lone minus sign. Kept as text
          // and *not* committed, because `Number('')` is 0 and would move the
          // actor to the origin the instant somebody selected all.
          setTyped({ text, against: value })
        }}
        onBlur={() => setTyped(null)}
        inputMode="decimal"
        step={step}
        className="w-11 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-0.5 text-right font-mono text-[10px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
      />
      {unit ? <span className="font-mono text-[9px] text-neutral-600">{unit}</span> : null}
    </span>
  )
}

/** A select, in the panel's own clothes. */
export function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label ? (
        <span className="w-14 shrink-0 truncate font-mono text-[10px] text-neutral-500">
          {label}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[10px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}

/** The button that adds one more of something. */
export function Add({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(title ? { title } : {})}
      className="rounded border border-dashed border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-500 transition-colors hover:border-violet-600 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/**
 * And the one that takes it away, armed when it cannot be clicked back.
 *
 * Undo reaches everything here, and undo is not where somebody looks in the
 * second after a row of keys they spent an afternoon on disappeared.
 */
export function Remove({
  onClick,
  confirm,
  title,
  children,
}: {
  onClick: () => void
  /** The copy for the armed second press. Absent means one press is enough. */
  confirm?: string
  /**
   * What this actually takes away.
   *
   * The label has room for a word and some of these reach further than the
   * word suggests - deleting a body takes its children with it - so the
   * sentence goes here rather than into the armed copy, which has to stay
   * short enough to read at a glance before the second press.
   */
  title?: string
  children: React.ReactNode
}) {
  const [sure, setSure] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        if (confirm && !sure) {
          setSure(true)
          return
        }
        setSure(false)
        onClick()
      }}
      onBlur={() => setSure(false)}
      {...(title ? { title } : {})}
      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
        sure ? 'bg-red-500/20 text-red-300' : 'text-neutral-600 hover:text-red-400'
      }`}
    >
      {sure ? confirm : children}
    </button>
  )
}

/**
 * Position, as two pads: the ground, and the height.
 *
 * ---------------------------------------------------------------------------
 * Why a pad at all, when there are already three number boxes
 * ---------------------------------------------------------------------------
 * A position is *one* gesture in the author's head - "over there, next to the
 * crate" - and three boxes make it three. The studio's own note says it best:
 * this is the same value as the fields beside it, moved the way it is actually
 * meant. Push, and the thing goes that way.
 *
 * **Relative, not absolute**, which is the choice that decides everything else.
 * An absolute pad has to stand for a fixed patch of ground, so it either cannot
 * reach the far corner of a forty-cell stage or moves a foot per pixel. A
 * relative one nudges from wherever you are, at a rate you can feel, and works
 * the same wherever the camera is. The knob springs back on release because it
 * is a *direction*, not a place.
 *
 * ---------------------------------------------------------------------------
 * Height is its own pad, beside it
 * ---------------------------------------------------------------------------
 * Asked for by name, and it is the same argument the inspector's own pad landed
 * on: folding y into the round one would mean up meant "further away" on one
 * axis and "higher" on another, which teaches nothing. Two controls, drawn
 * differently, each saying what it does by its shape - a circle you push in any
 * direction, and a bar that only goes up and down.
 *
 * The signs are opposite on purpose. On the circle, up is *away from the
 * camera*; on the bar, up is *up*. That is exactly why they cannot be one
 * control.
 */
export function Pads({
  onNudge,
  onLift,
}: {
  /** Ground movement, in cells, since the last frame of the drag. */
  onNudge: (by: { x: number; z: number }) => void
  /** Height, in cells. */
  onLift: (by: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Screen up is away from the camera, which on the ground plane is -z. */}
      <Knob onPush={(by) => onNudge({ x: by.x, z: by.y })} label="Move" mark={['x', 'z']} />
      <Lift onPush={onLift} label="Height" mark="y" />
    </div>
  )
}

/**
 * A turn, as two pads: the swing, and the twist.
 *
 * ---------------------------------------------------------------------------
 * The same argument `Pads` makes, about angles
 * ---------------------------------------------------------------------------
 * Three sliders make one gesture into three. *"Look down and to the left"* is a
 * single thing an author means and a single thing a hand can do, and the pad is
 * the control that takes it whole - the sliders stay for the other half of the
 * job, which is putting a shoulder at exactly -30 because the other shoulder is.
 *
 * Split two-and-one for the reason the position pads are: **the twist is a
 * different act**. Swinging a limb is aiming it somewhere, and rolling it is
 * turning it about the way it already points. Sharing a pad between them means
 * every attempt at one is a small accident of the other.
 *
 * Degrees per frame rather than cells, so the rate is its own number: a body
 * turns through a useful range in a fraction of the distance a body walks.
 */
export function Turns({
  onSwing,
  onTwist,
}: {
  /** Pitch and yaw, in degrees since the last frame of the drag. */
  onSwing: (by: { x: number; y: number }) => void
  /** Roll, in degrees. */
  onTwist: (by: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {/*
        Up is a *negative* pitch: dragging up should raise what the bone points
        at, and three's x rotation grows the other way. Getting this backwards
        is not subtly wrong - the figure nods when you meant it to look up.
      */}
      <Knob
        onPush={(by) => onSwing({ x: -by.y, y: by.x })}
        label="Turn"
        mark={['y', 'x']}
        rate={TURN_RATE}
      />
      <Lift onPush={onTwist} label="Twist" mark="z" rate={TURN_RATE} />
    </div>
  )
}

/**
 * Degrees a pixel at full push, per frame of drag.
 *
 * Exported because a hinge does not use `Turns` - one axis needs one bar, not
 * a pad and a bar - and a hinge that turned at a different rate from a ball
 * joint would be two controls that feel unrelated for no reason a person could
 * name.
 */
export const TURN_RATE = 1.4

/**
 * The callback, always the current one.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists for
 * ---------------------------------------------------------------------------
 * A pad applies its push on an interval started at pointer-down, and an
 * interval closes over the props of *that* render. The handlers these pads are
 * given are all of the form `set(own('x') + by)` - read where the thing is, add
 * the push - so a stale closure reads the same starting value on every tick and
 * writes the same result forty times a second.
 *
 * What that looks like is the thing moving one step and then refusing to go
 * further however long you hold the stick, which is the report *"when I change
 * values, it jitters and stays the same"*. Nothing errors, the document is
 * written on every tick, and the value written is correct - for a frame that
 * has already gone.
 *
 * So the interval calls through a ref that every render refreshes. The pad
 * still owns the timer; it just never holds an opinion about the past.
 */
function useLatest<T>(value: T) {
  const box = useRef(value)
  useEffect(() => {
    box.current = value
  })
  return box
}

/** Cells a pixel at full push, per frame of drag. */
const RATE = 0.06

/** Pixels from centre at which the stick is fully pushed. */
const REACH = 26

function Knob({
  onPush,
  label,
  mark,
  rate = RATE,
}: {
  /**
   * The push, in pad coordinates: right is +x, **down** is +y.
   *
   * Deliberately not "move by this much on the ground". The pad reports what
   * the finger did and the caller decides what it means, because the same
   * widget now drives two different things - a position on the floor and a
   * rotation about two axes - and a payload named after one of them would make
   * the other read as a mistake.
   */
  onPush: (by: { x: number; y: number }) => void
  label: string
  /** The two axis letters, drawn at the edges. */
  mark?: [string, string]
  /** Units per pixel of full push, per frame of drag. */
  rate?: number
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const latest = useLatest(onPush)

  return (
    <div
      role="presentation"
      aria-label={label}
      onPointerDown={(event) => {
        const element = event.currentTarget
        element.setPointerCapture(event.pointerId)
        const box = element.getBoundingClientRect()
        const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 }

        /**
         * The push, applied on a timer rather than per pointer event.
         *
         * A relative pad has to keep moving while the knob is *held* off centre,
         * not only while the pointer travels - otherwise holding it steady stops
         * the thing dead, which is the opposite of what a stick means. So the
         * pointer sets a direction and an interval applies it.
         */
        let push = { x: 0, y: 0 }
        const tick = setInterval(() => {
          if (push.x !== 0 || push.y !== 0) latest.current(push)
        }, 40)

        const aim = (clientX: number, clientY: number) => {
          const dx = clientX - centre.x
          const dy = clientY - centre.y
          const reach = Math.min(1, Math.hypot(dx, dy) / REACH)
          const angle = Math.atan2(dy, dx)
          const x = Math.cos(angle) * reach
          const y = Math.sin(angle) * reach
          setAt({ x: x * REACH, y: y * REACH })
          push = { x: x * rate, y: y * rate }
        }

        aim(event.clientX, event.clientY)

        const move = (moved: PointerEvent) => aim(moved.clientX, moved.clientY)
        const up = () => {
          clearInterval(tick)
          setAt(null)
          push = { x: 0, y: 0 }
          element.removeEventListener('pointermove', move)
          element.removeEventListener('pointerup', up)
          element.removeEventListener('pointercancel', up)
        }

        element.addEventListener('pointermove', move)
        element.addEventListener('pointerup', up)
        element.addEventListener('pointercancel', up)
      }}
      className="relative flex size-14 shrink-0 touch-none select-none items-center justify-center rounded-full border border-neutral-800 bg-neutral-950/70 transition-colors hover:border-neutral-600"
    >
      <span aria-hidden className="absolute h-px w-7 bg-neutral-800" />
      <span aria-hidden className="absolute h-7 w-px bg-neutral-800" />
      {mark ? (
        <>
          <span
            aria-hidden
            className="absolute right-1 font-mono text-[8px] leading-none text-neutral-700"
          >
            {mark[0]}
          </span>
          <span
            aria-hidden
            className="absolute bottom-0.5 font-mono text-[8px] leading-none text-neutral-700"
          >
            {mark[1]}
          </span>
        </>
      ) : null}
      <span
        aria-hidden
        className="relative size-5 rounded-full bg-violet-500/80 ring-2 ring-neutral-950"
        style={{ transform: `translate(${at?.x ?? 0}px, ${at?.y ?? 0}px)` }}
      />
    </div>
  )
}

export { Lift as Bar }

function Lift({
  onPush,
  label,
  mark,
  rate = RATE,
}: {
  /** The push, in units per frame. Up is positive - see `aim`. */
  onPush: (by: number) => void
  label: string
  mark: string
  rate?: number
}) {
  const [at, setAt] = useState(0)
  const latest = useLatest(onPush)

  return (
    <div
      role="presentation"
      aria-label={label}
      onPointerDown={(event) => {
        const element = event.currentTarget
        element.setPointerCapture(event.pointerId)
        const box = element.getBoundingClientRect()
        const centre = box.top + box.height / 2

        let push = 0
        const tick = setInterval(() => {
          if (push !== 0) latest.current(push)
        }, 40)

        const aim = (clientY: number) => {
          const dy = Math.max(-REACH, Math.min(REACH, clientY - centre))
          setAt(dy)
          // Negated: pointer y grows downwards and neither height nor a turn does.
          push = (-dy / REACH) * rate
        }

        aim(event.clientY)

        const move = (moved: PointerEvent) => aim(moved.clientY)
        const up = () => {
          clearInterval(tick)
          setAt(0)
          push = 0
          element.removeEventListener('pointermove', move)
          element.removeEventListener('pointerup', up)
          element.removeEventListener('pointercancel', up)
        }

        element.addEventListener('pointermove', move)
        element.addEventListener('pointerup', up)
        element.addEventListener('pointercancel', up)
      }}
      className="relative flex h-14 w-7 shrink-0 touch-none select-none items-center justify-center rounded-full border border-neutral-800 bg-neutral-950/70 transition-colors hover:border-neutral-600"
    >
      <span aria-hidden className="absolute inset-x-1.5 h-px bg-neutral-800" />
      <span
        aria-hidden
        className="absolute top-0.5 font-mono text-[8px] leading-none text-neutral-700"
      >
        {mark}
      </span>
      <span
        aria-hidden
        className="relative size-5 rounded-full bg-violet-500/80 ring-2 ring-neutral-950"
        style={{ transform: `translateY(${at}px)` }}
      />
    </div>
  )
}

/**
 * The shapes a movie can be delivered in.
 *
 * Three, and the list is short on purpose: these are the frames things are
 * actually posted in. A free aspect field would be a number nobody has an
 * opinion about until a platform rejects their upload.
 *
 * The **numbers** are the export size, not just a ratio, because a ratio alone
 * leaves "and how big" to a second control that would always be set wrong. 1080
 * on the short edge is what every one of these wants.
 */
export const FRAMES = [
  { id: 'landscape', label: '16:9', width: 1920, height: 1080 },
  { id: 'portrait', label: '9:16', width: 1080, height: 1920 },
  { id: 'square', label: '1:1', width: 1080, height: 1080 },
] as const

export type FrameId = (typeof FRAMES)[number]['id']

export const frameOf = (id: FrameId) => FRAMES.find((one) => one.id === id) ?? FRAMES[0]

/**
 * The delivered frame, drawn over the viewport.
 *
 * ---------------------------------------------------------------------------
 * A mask, not a second render
 * ---------------------------------------------------------------------------
 * "Preview the lookout window" has two possible builds. One is a small
 * picture-in-picture rendering the camera's view - a second render target, a
 * second pass, and a preview so small nobody can judge a framing in it. The
 * other is to notice that **when the viewport is already looking through the
 * camera, it *is* the preview** - and all that is missing is where the edges
 * are.
 *
 * So this is the second: two bars, in the aspect the export will be, over a
 * view that is already correct. It costs one element and no GPU, and the thing
 * you are judging is full size.
 *
 * Only while looking through a camera. In free look the viewport is a place you
 * are flying around, not a shot, and a letterbox over it would be claiming a
 * framing that nothing will ever render.
 */
export function Framed({ frame, on }: { frame: FrameId; on: boolean }) {
  const { width, height } = frameOf(frame)
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  const wrap = useRef<HTMLDivElement | null>(null)

  /**
   * The frame's pixel size, measured rather than derived in CSS.
   *
   * Three CSS versions of this did not work and the reason is the same each
   * time: `aspect-ratio` needs *one* definite dimension to compute the other,
   * and "as large as fits, in this ratio" gives it none - `max-width` and
   * `max-height` are limits, not sizes, so the box collapsed to its border and
   * rendered four pixels wide. Setting both to 100% does not help either; two
   * definite dimensions make the ratio ignored.
   *
   * A `ResizeObserver` and one line of arithmetic is exact at every size and
   * has nothing to be subtly wrong about.
   */
  useEffect(() => {
    const element = wrap.current
    if (!element) return

    const watch = new ResizeObserver(([entry]) => {
      const seen = entry?.contentRect
      if (!seen || seen.width === 0 || seen.height === 0) return
      // Fit inside: the tighter of the two constraints decides.
      const scale = Math.min(seen.width / width, seen.height / height)
      setBox({ width: width * scale, height: height * scale })
    })
    watch.observe(element)
    return () => watch.disconnect()
  }, [width, height])

  return (
    <div
      ref={wrap}
      /*
       * `overflow-hidden`, and it is not decoration: the dimming is one
       * enormous shadow spread, which without clipping washes across the whole
       * editor and greys out the panels. It did, and it looked like the app had
       * gone modal.
       */
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden"
    >
      {on && box ? (
        <div
          style={{
            width: box.width,
            height: box.height,
            // Inline rather than a Tailwind arbitrary value: `outline-[100vmax]`
            // is ambiguous in this Tailwind - it can be read as a width or a
            // colour - and silently produced nothing.
            boxShadow: '0 0 0 100vmax rgba(10, 10, 12, 0.55)',
          }}
          /*
           * The **border** is what carries the frame, not the dimming. A movie
           * stage starts empty and black, and dimming black is a no-op - the
           * line works over a black stage and a dressed one alike.
           */
          className="border border-violet-400/70"
        />
      ) : null}
    </div>
  )
}

/**
 * A name you can actually type, against a writer that refuses most of them.
 *
 * ---------------------------------------------------------------------------
 * The same bug the sliders had, one field along
 * ---------------------------------------------------------------------------
 * A camera's name is a controlled input whose `onChange` calls a writer that
 * **refuses** an empty string, a space, and a name already taken. So the input
 * published a change the document declined, React re-rendered it back, and the
 * next keystroke fought the last one. Worse than the sliders' version: clearing
 * the field to retype is refused, so the name could not be edited at all -
 * only appended to, one legal character at a time.
 *
 * Held as text against the value it was typed for, exactly as `Scrub` does. The
 * text stands while it is being typed and the document wins whenever it changes
 * from anywhere else. A refusal then costs nothing: the letters stay on screen,
 * and the last legal thing typed is what the file holds.
 *
 * `invalid` is drawn rather than silently ignored, because a field that accepts
 * letters and quietly saves nothing is worse than one that says so.
 */
export function Name({
  value,
  onChange,
  legal,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  /** Whether a string is one the writer will take. */
  legal: (value: string) => boolean
  placeholder?: string
  className?: string
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const showing = typed ?? value
  const refused = typed !== null && typed !== value && !legal(typed)

  /**
   * Committed on blur and on Enter - never per keystroke.
   *
   * The first version committed whenever the text was legal, and that is wrong
   * for a field whose value is an **identity**. Renaming a camera from `main`
   * to `closeup` typed the `c`, which was legal, so the camera became `c`; its
   * row is keyed by name, so React remounted it; the input lost focus; and the
   * remaining seven characters went nowhere. The document ended up holding a
   * camera called `c`.
   *
   * Per-keystroke commits are wrong here for two more reasons even without the
   * remount: every letter is an undo step, and the intermediate names are real -
   * one of them can collide with another camera and be refused halfway through
   * a word nobody had finished typing.
   *
   * So the text is local until the field is left. Escape puts it back, because
   * a rename you have half-typed and thought better of should cost one key.
   */
  const commit = () => {
    const next = typed
    setTyped(null)
    if (next !== null && next !== value && legal(next)) onChange(next)
  }

  return (
    <input
      value={showing}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setTyped(null)
        }
      }}
      {...(placeholder ? { placeholder } : {})}
      className={`${className ?? ''} ${refused ? 'border-amber-600/70' : ''}`}
    />
  )
}
