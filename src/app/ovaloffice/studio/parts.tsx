'use client'

import { ChevronDown, type LucideIcon, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PACK_MODELS } from '@/domain/builder/catalogue.generated'
import { isBuildable, labelOf } from '@/domain/builder/catalogue'
import { PACKS } from '@/domain/builder/packs'
import { isKnownModel, PALETTE_GROUPS } from '@/domain/lounge/palette'
import { lookLabel, STUDIO_CAST_GROUPS } from '@/domain/studio/scene'
import { emoteTileStyle } from '@/domain/world/emotes'

/**
 * The studio's controls, as small parts.
 *
 * Split out of `scene-controls` when the motion panel arrived and needed the
 * same sliders, pickers and disclosure rows. They were always generic - none of
 * them knows what a scene is - and one copy is the difference between two
 * panels that look like one tool and two panels that drift.
 */

/**
 * One collapsible group of controls.
 *
 * Dressed like the battle screens rather than like a settings form, which is
 * the difference between a panel you read and a panel you scan: an icon tile
 * carries what the group *is*, the title is a mono uppercase label rather than
 * a sentence, and the summary is a chip on the right instead of grey text
 * trailing off the title.
 *
 * The icon is doing real work here, not decoration. This panel is a column of a
 * dozen near-identical rounded rectangles distinguished only by a word, and a
 * shape at the left edge is what lets somebody find the light rig again without
 * reading four labels on the way.
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
      className="group rounded-2xl border border-line/50 bg-surface-raised/30 px-3 py-2.5 transition open:bg-surface-raised/50 hover:border-line"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5">
        {Icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/40 text-accent transition group-open:border-accent/70">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1 font-mono text-xs tracking-[0.18em] text-ink-muted uppercase transition group-open:text-ink">
          {title}
        </span>
        {summary && (
          <span className="shrink-0 rounded-full border border-line/40 px-2 py-0.5 font-mono text-[10px] text-ink-muted">
            {summary}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-ink-muted transition group-open:rotate-180"
        />
      </summary>
      <div className="mt-3 flex flex-col gap-1.5">{children}</div>
    </details>
  )
}

/**
 * A row inside a section that opens further.
 *
 * The same treatment one level down: a thumbnail or swatch instead of a number,
 * and no prose. Split out because four call sites were repeating it and drifting
 * apart - blocks had a border the peeps did not, goals had different padding.
 */
export function Row({
  lead,
  title,
  detail,
  trailing,
  children,
}: {
  /** A picture of the thing: an avatar, a swatch, an icon. */
  lead?: React.ReactNode
  title: string
  detail?: string
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <details className="group/row rounded-xl border border-line/40 bg-surface-raised/40 px-2.5 py-2 transition hover:border-line/70">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 text-sm">
        {lead}
        <span className="min-w-0 flex-1 truncate capitalize">{title}</span>
        {detail && <span className="shrink-0 font-mono text-[10px] text-ink-muted">{detail}</span>}
        {trailing}
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 text-ink-muted transition group-open/row:rotate-180"
        />
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </details>
  )
}

/**
 * The thumb, written once.
 *
 * A native range input cannot be styled from the outside - the track and the
 * thumb are shadow parts, reachable only through the vendor pseudo-elements
 * below - so this is the whole of the slider's appearance and it has to be
 * repeated per engine. Kept as a constant rather than pasted at each call site,
 * because three copies of forty characters of vendor prefix is how two sliders
 * end up different sizes.
 *
 * The input itself is transparent: the track people actually see is drawn as
 * two ordinary spans underneath, which is the only way to get a filled portion
 * in a colour the palette knows about.
 */
const THUMB = [
  // Bigger than it looks it needs to be, because on a touch screen the thumb is
  // the hit target and a 14px one is a slider you fight.
  //
  // The colour is a variable with the accent as its fallback, so a slider that
  // stands for one axis can be that axis's colour without a second component -
  // see `tint`.
  'h-4 w-4 appearance-none rounded-full bg-[var(--slide-tint,var(--color-accent))] ring-2 ring-background transition-transform',
]
  .flatMap((rules) => rules.split(' '))
  .flatMap((rule) => [`[&::-webkit-slider-thumb]:${rule}`, `[&::-moz-range-thumb]:${rule}`])
  .join(' ')

/**
 * A slider, with the number beside it and editable.
 *
 * Both halves, and both live. A slider is how you find a value and a box is how
 * you set the one you already know - and the studio has plenty of both: a rim
 * light is dragged until it looks right, and a peep goes to exactly z = -3.5
 * because that is where the crate is. The old readout was deliberately not an
 * input, on the grounds that two controls are two sources of truth; that was
 * wrong in the ordinary way, because they are both just views of one number in
 * the document and neither holds any state of its own.
 */
export function Slide({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  tint,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  /**
   * A colour for the filled part and the thumb, when this slider stands for
   * something that has one.
   *
   * The accent otherwise, which is every slider in the studio: a colour here is
   * only worth spending where it *means* something, and in the animator it
   * means an axis - the same red, green and blue as the pad above it and as
   * every three-dimensional gizmo anybody has ever used.
   */
  tint?: string
  onChange: (value: number) => void
}) {
  const span = max - min
  const fill = span <= 0 ? 0 : ((Math.min(max, Math.max(min, value)) - min) / span) * 100

  return (
    <div
      className="group flex items-center gap-2 text-xs"
      style={tint ? ({ '--slide-tint': tint } as React.CSSProperties) : undefined}
    >
      {/*
        Narrow, and it has to be: this row is drawn in a 22rem panel beside a
        9.5rem pad, and at `w-20` the label plus the readout took all of it -
        the track collapsed to the width of its own thumb and three sliders read
        as three floating dots. Reported as exactly that, with a picture.
      */}
      {label && <span className="w-12 shrink-0 truncate text-muted-foreground">{label}</span>}
      {/* Taller than the track, so the whole row is draggable rather than just
          the six pixels of it that are painted.

          `min-w` is the half that stops it happening again. `flex-1` alone
          means "whatever is left", and whatever is left can be nothing - a
          slider is the one control whose *length* is the interface, so it needs
          a floor rather than a share. Below this the row wraps, which is a
          worse layout and still a usable control. */}
      <span className="relative flex h-7 min-w-[4rem] flex-1 items-center">
        <span aria-hidden className="absolute inset-x-0 h-1.5 rounded-full bg-border" />
        <span
          aria-hidden
          className="absolute left-0 h-1.5 rounded-full bg-[var(--slide-tint,var(--color-accent))] opacity-70 transition-[width] duration-75"
          style={{ width: `${fill}%` }}
        />
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={`relative h-7 w-full cursor-grab touch-none appearance-none bg-transparent active:cursor-grabbing focus:outline-none group-hover:[&::-webkit-slider-thumb]:scale-110 ${THUMB}`}
        />
      </span>
      <Scrub value={value} min={min} max={max} step={step} unit={unit} onChange={onChange} />
    </div>
  )
}

/**
 * The number, editable in place.
 *
 * Held as text while it is being typed and only committed when it parses. The
 * naive version - `onChange={n => set(Number(n))}` - makes the canvas zero
 * blocks wide the moment somebody selects all and starts typing a new value,
 * and makes a leading minus sign impossible to enter at all.
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
  const [typing, setTyping] = useState<string | null>(null)
  const shown = typing ?? String(Math.round(value * 100) / 100)

  return (
    <span className="flex shrink-0 items-baseline">
      <input
        inputMode="decimal"
        value={shown}
        onChange={(event) => {
          setTyping(event.target.value)
          const next = Number(event.target.value)
          if (event.target.value.trim() !== '' && Number.isFinite(next)) {
            onChange(Math.min(max, Math.max(min, next)))
          }
        }}
        onBlur={() => setTyping(null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          // Arrow keys step by the slider's own step, which is what makes a
          // value you have almost got right one keystroke away from right.
          const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
          if (direction === 0) return
          event.preventDefault()
          setTyping(null)
          onChange(
            Math.min(max, Math.max(min, value + direction * step * (event.shiftKey ? 10 : 1))),
          )
        }}
        className="w-11 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-xs text-muted-foreground transition hover:border-border hover:text-foreground focus:border-accent focus:text-foreground focus:outline-none"
      />
      {unit && <span className="-ml-0.5 font-mono text-xs text-muted-foreground">{unit}</span>}
    </span>
  )
}

/**
 * A thumb stick: a direction, held.
 *
 * The other half of what a phone needs. `Pad` moves a value and springs back;
 * this reports *how hard and which way* for as long as a thumb is on it, which
 * is what driving an animal wants - and it is why the two are separate controls
 * rather than one with a mode.
 *
 * The intent it produces is the same one a keyboard produces, so nothing
 * downstream knows which it got - see `@/domain/studio/puppet`. Pushed less
 * than half way it walks; past that it runs, because a phone has no shift key
 * and "push harder to run" is the convention every game on one already uses.
 */
export function Stick({
  onMove,
  className,
}: {
  onMove: (intent: { forward: number; strafe: number; run: boolean } | null) => void
  className?: string
}) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null)

  /** Pixels from centre at which the stick is fully pushed. */
  const REACH = 44

  return (
    <div
      role="presentation"
      aria-label="Walk"
      onPointerDown={(event) => {
        const element = event.currentTarget
        element.setPointerCapture(event.pointerId)
        const box = element.getBoundingClientRect()
        const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 }

        const push = (clientX: number, clientY: number) => {
          const dx = clientX - centre.x
          const dy = clientY - centre.y
          const reach = Math.min(1, Math.hypot(dx, dy) / REACH)
          const angle = Math.atan2(dy, dx)
          const x = Math.cos(angle) * reach
          const y = Math.sin(angle) * reach
          setKnob({ x: x * REACH, y: y * REACH })
          // Screen up is forward, which is away from the camera.
          onMove({ forward: -y, strafe: x, run: reach > 0.55 })
        }

        push(event.clientX, event.clientY)

        const move = (moved: PointerEvent) => push(moved.clientX, moved.clientY)
        const up = () => {
          setKnob(null)
          onMove(null)
          element.removeEventListener('pointermove', move)
          element.removeEventListener('pointerup', up)
          element.removeEventListener('pointercancel', up)
        }

        element.addEventListener('pointermove', move)
        element.addEventListener('pointerup', up)
        element.addEventListener('pointercancel', up)
      }}
      className={`relative flex h-24 w-24 shrink-0 touch-none items-center justify-center rounded-full border border-border bg-secondary/70 select-none ${className ?? ''}`}
    >
      <span aria-hidden className="absolute h-px w-12 bg-border" />
      <span aria-hidden className="absolute h-12 w-px bg-border" />
      <span
        aria-hidden
        className="relative h-9 w-9 rounded-full bg-accent/80 ring-2 ring-background"
        style={{ transform: `translate(${knob?.x ?? 0}px, ${knob?.y ?? 0}px)` }}
      />
    </div>
  )
}

/**
 * Two axes at once, by dragging.
 *
 * A position is one gesture in the author's head - "over there, next to the
 * crate" - and three number boxes make it three. This is the same value as the
 * X and Z boxes beside it, moved the way it is actually meant: push the knob
 * and the thing goes that way.
 *
 * Relative rather than absolute, which is the choice that matters. An absolute
 * pad would have to stand for a fixed patch of ground, so it would either not
 * reach the far corner of a forty-block field or move a foot per pixel; a
 * relative one nudges from wherever you are, at a rate you can feel, and works
 * the same at any zoom. The knob springs back on release because it is a
 * direction, not a place.
 *
 * It is also the control that makes the studio usable on a phone, where three
 * tiny number boxes and a slider are not a serious proposition.
 */
export function Pad({
  x,
  z,
  min,
  max,
  onChange,
}: {
  x: number
  z: number
  min: number
  max: number
  onChange: (x: number, z: number) => void
}) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null)

  /** Blocks per pixel of drag. Slow enough to place, fast enough to cross a pitch. */
  const RATE = 0.05

  const clamp = (value: number) => Math.min(max, Math.max(min, Math.round(value * 100) / 100))

  return (
    <div
      role="presentation"
      title="Drag to move"
      onPointerDown={(event) => {
        const element = event.currentTarget
        element.setPointerCapture(event.pointerId)
        const from = { x: event.clientX, y: event.clientY }
        const start = { x, z }
        setKnob({ x: 0, y: 0 })

        const move = (moved: PointerEvent) => {
          const dx = moved.clientX - from.x
          const dy = moved.clientY - from.y
          // Capped at the pad's own radius so the knob stays inside the ring,
          // while the value keeps going for as long as the drag does.
          const reach = Math.hypot(dx, dy)
          const cap = reach > 22 ? 22 / reach : 1
          setKnob({ x: dx * cap, y: dy * cap })
          // Screen down is +z, which is what "away from the camera" reads as
          // in the default framing.
          onChange(clamp(start.x + dx * RATE), clamp(start.z + dy * RATE))
        }
        const up = () => {
          setKnob(null)
          element.removeEventListener('pointermove', move)
          element.removeEventListener('pointerup', up)
          element.removeEventListener('pointercancel', up)
        }

        element.addEventListener('pointermove', move)
        element.addEventListener('pointerup', up)
        element.addEventListener('pointercancel', up)
      }}
      className="relative flex h-16 w-16 shrink-0 cursor-grab touch-none items-center justify-center rounded-full border border-border bg-secondary/60 transition active:cursor-grabbing hover:border-accent/60"
    >
      <span aria-hidden className="absolute h-px w-8 bg-border" />
      <span aria-hidden className="absolute h-8 w-px bg-border" />
      <span
        aria-hidden
        className="relative h-5 w-5 rounded-full bg-accent/80 ring-2 ring-background transition-transform"
        style={{ transform: `translate(${knob?.x ?? 0}px, ${knob?.y ?? 0}px)` }}
      />
    </div>
  )
}

export function Num({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          // A half-typed number is `NaN`, and letting that through makes the
          // canvas zero pixels wide while somebody is still typing.
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
        }}
        className="w-full rounded-lg border border-border bg-secondary/40 px-2 py-1 font-mono text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
      />
    </label>
  )
}

export function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-border bg-secondary px-2 py-1 text-sm text-foreground capitalize"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * The block palette, in its own groups - fifty-eight names in one flat list is
 * unusable - followed by the packs a still may now also reach.
 *
 * ---------------------------------------------------------------------------
 * Why the whole catalogue is not in here
 * ---------------------------------------------------------------------------
 * `parseScene` will accept any of the 1,394 models the builder builds worlds
 * out of, and this select offers a handful of them. That is not an oversight
 * and the two should not be made to agree: what a document may *contain* is a
 * safety question, answered by the widest honest list, and what a dropdown may
 * *offer* is a usability one, answered by the shortest useful list. Fourteen
 * hundred `<option>` elements is a control nobody can find anything in, and the
 * scroll alone is a second of layout.
 *
 * So the packs listed here are the ones that make sense standing in a shot on
 * their own, and anything else in the catalogue is reachable by editing the
 * link - which is what the studio's document being a URL is for.
 */
const PROP_PACKS: readonly string[] = ['cosmos']

/**
 * Whether a model brings an animation with it.
 *
 * Asked of the *pack* rather than of the file, because the panel cannot fetch a
 * glTF to find out and must not stall a slider on a network round trip. Only
 * `cosmos` ships clips today, and this is the one honest place to say so - a
 * per-model list would go stale the first time a pack is replaced, and reading
 * the file would make an inspector async for a label.
 */
const CLIPPED_PACKS = new Set(['cosmos'])

export function hasClip(model: string): boolean {
  const cut = model.indexOf('/')
  return cut > 0 && CLIPPED_PACKS.has(model.slice(0, cut))
}

/**
 * A colour multiplied over a model, or none.
 *
 * ---------------------------------------------------------------------------
 * Why "none" is a button rather than an absence
 * ---------------------------------------------------------------------------
 * A native colour input has no empty state: it is always *some* colour, and the
 * moment one is shown next to a model it reads as the colour that model already
 * is - which for a galaxy it is not. Worse, there would then be no way back to
 * the model's own colours once the input had been touched, because every value
 * it can hold is a tint.
 *
 * So "none" is its own control and the swatch is disabled until a colour is
 * asked for. `null` and `#ffffff` are genuinely different answers here - see
 * `BlockSpec.tint` - and this is the pair of controls that can express both.
 */
export function Tint({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex-1">Colour</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={`rounded-lg border px-2 py-1 text-xs transition ${
          value === null
            ? 'border-accent/60 bg-secondary text-foreground'
            : 'border-border text-muted-foreground hover:border-accent/40'
        }`}
      >
        none
      </button>
      <input
        type="color"
        // Seeded with the galaxy's own blue-white rather than black, so the
        // first click on a fresh swatch is a tint somebody might want rather
        // than one that turns the model off.
        value={value ?? '#b9c9ff'}
        onChange={(event) => onChange(event.target.value)}
        className="size-7 cursor-pointer rounded-lg border border-border bg-secondary"
      />
    </div>
  )
}

/**
 * The same choice, typed.
 *
 * A `pack/name` out of the world catalogue, for the models `PickGroups` does
 * not list. Kept as its own local string while somebody is mid-word: writing
 * every keystroke straight through would send `c`, `co`, `cos` … to the
 * document, and since none of those is a model the scene would blank on the
 * first letter and come back on the last. So the box holds what was typed, the
 * document only hears about a name the catalogue actually has, and the border
 * says which of the two you are looking at.
 */
export function ModelField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [typed, setTyped] = useState(value)
  // Re-seeded when the selection changes underneath, so clicking another prop
  // shows that prop's id rather than the last thing typed into the old one.
  const [seed, setSeed] = useState(value)
  if (seed !== value) {
    setSeed(value)
    setTyped(value)
  }

  const known = isKnownModel(typed) || isBuildable(typed)

  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      or type an id
      <input
        value={typed}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="cosmos/galaxy"
        onChange={(event) => {
          const next = event.target.value.trim()
          setTyped(next)
          if (isKnownModel(next) || isBuildable(next)) {
            setSeed(next)
            onChange(next)
          }
        }}
        className={`rounded-lg border bg-secondary px-2 py-1 font-mono text-sm text-foreground ${
          known ? 'border-border' : 'border-destructive/60'
        }`}
      />
    </label>
  )
}

export function PickGroups({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-border bg-secondary px-2 py-1 text-sm text-foreground"
      >
        {PALETTE_GROUPS.map((group) => (
          <optgroup key={group.name} label={group.name}>
            {group.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </optgroup>
        ))}
        {PROP_PACKS.map((packId) => (
          <optgroup key={packId} label={PACKS[packId].label}>
            {(PACK_MODELS[packId] ?? []).map((name) => (
              <option key={name} value={`${packId}/${name}`}>
                {labelOf(name)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/**
 * The whole cast - peeps and the rigged looks - in one grouped select.
 *
 * The same shape `PickGroups` gives the block palette, and for the same
 * reason: thirty-six bodies in one flat list is a select nobody can scan, and
 * the packs are the grouping everybody already thinks in. The option label is
 * the body's name alone (`Knight`, not `adventurers/Knight`); the value stays
 * the qualified id the document stores.
 */
export function PickCast({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-border bg-secondary px-2 py-1 text-sm text-foreground capitalize"
      >
        {STUDIO_CAST_GROUPS.map((group) => (
          <optgroup key={group.name} label={group.name}>
            {group.models.map((model) => (
              <option key={model} value={model}>
                {lookLabel(model)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/** The chosen face, small, on a summary row. `emoteTileStyle` exists for exactly this. */
export function EmoteSwatch({ id }: { id: number }) {
  return <span aria-hidden className="block shrink-0" style={emoteTileStyle(id, 24)} />
}

export function Add({
  label,
  onClick,
  disabled,
  icon: Icon = Plus,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon?: LucideIcon
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line/60 px-2 py-2 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-40 disabled:hover:border-line/60"
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  )
}

export function Remove({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 flex items-center gap-1.5 self-start rounded-lg px-1.5 py-1 text-xs text-ink-muted transition hover:bg-red-500/10 hover:text-red-400"
    >
      <Trash2 className="size-3.5" aria-hidden />
      {children}
    </button>
  )
}
