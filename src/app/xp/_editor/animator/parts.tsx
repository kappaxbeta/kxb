'use client'

import { useState } from 'react'
import { NumberInput } from '@/app/xp/_editor/number-field'

/**
 * The three controls the animator uses, copied out of the studio's panel.
 *
 * From `src/app/ovaloffice/studio/parts.tsx`, and copied rather than imported
 * because `src/app/xp/` owns what it draws (docs/xp-creator.md §1.2, enforced
 * by the `no-restricted-imports` rule in eslint.config.mjs). The studio is a
 * live surface and this is a prototype; sharing a control means the prototype
 * either drags the product around or waits behind it.
 *
 * Only `Slide`, `Num` and `Pick` came over - the section headers, the pads and
 * the block palette belong to a panel this one is not. If the studio's versions
 * grow a behaviour worth having here, it is a deliberate copy rather than
 * something that arrives on its own, which is the whole point.
 */

const THUMB = [
  // Bigger than it looks it needs to be, because on a touch screen the thumb is
  // the hit target and a 14px one is a slider you fight.
  'h-4 w-4 appearance-none rounded-full bg-accent ring-2 ring-background transition-transform',
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
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
}) {
  const span = max - min
  const fill = span <= 0 ? 0 : ((Math.min(max, Math.max(min, value)) - min) / span) * 100

  return (
    <div className="group flex items-center gap-2 text-xs">
      {label && <span className="w-20 shrink-0 truncate text-muted-foreground">{label}</span>}
      {/* Taller than the track, so the whole row is draggable rather than just
          the six pixels of it that are painted. */}
      <span className="relative flex h-7 min-w-0 flex-1 items-center">
        <span aria-hidden className="absolute inset-x-0 h-1.5 rounded-full bg-border" />
        <span
          aria-hidden
          className="absolute left-0 h-1.5 rounded-full bg-accent/70 transition-[width] duration-75"
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
      <NumberInput
        min={min}
        max={max}
        step={step}
        value={value}
        // Clamped rather than refused: this is a spinner as well as a field, and
        // reaching the top and stopping is what a bound should feel like. The
        // draft is what lets it be emptied and retyped - see `NumberInput`.
        commit={(next) => onChange(Math.min(max, Math.max(min, next)))}
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
  format,
  disabled = false,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  /**
   * What to show instead of the raw value.
   *
   * The eases are `linear`, `smooth`, `hold` and read fine as themselves, which
   * is why this did not exist. A model id does not: `peepz/fox` is a path, and
   * a list of twenty-four of them is a list of the same six characters repeated
   * with a word on the end.
   */
  format?: (option: string) => string
  /**
   * Off, but still there.
   *
   * The difference matters to the *layout* more than to the control: a panel
   * that removes a field when it does not apply is a panel whose contents jump
   * about, and during playback - where a field can apply on one frame and not
   * the next - it jumps sixty times a second. Greyed and in place says the same
   * thing without moving anything.
   */
  disabled?: boolean
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs ${
        disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'
      }`}
    >
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-border bg-secondary px-2 py-1 text-sm text-foreground capitalize disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {format ? format(option) : option}
          </option>
        ))}
      </select>
    </label>
  )
}

