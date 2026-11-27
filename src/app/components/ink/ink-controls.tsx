'use client'

import { SlidersHorizontalIcon, SparklesIcon, XIcon } from 'lucide-react'
import { LIMITS, MODES, type InkSettings } from '@/app/components/ink/ink-settings'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

/**
 * The panel that edits the water.
 *
 * A dark card in the corner: the colour mode as three buttons, sliders for
 * how many of each creature, how big, how much blob and how fast, and
 * switches for the swirl and for eyes - with the eyes' size and scatter
 * shown only while they are on. Every change is live - the creatures read their
 * settings on the next tick, so dragging the radius grows the ones already
 * in the water rather than replacing them, and switching the mode recolours
 * them where they swim. Closed, it is one round button in the corner and
 * nothing else, so the picture is the picture until somebody wants to change
 * it. The open state is the caller's, because a page that draws this over
 * something else wants its own button for it.
 */
export function InkControls({
  settings,
  onChange,
  open,
  onOpenChange,
  onCallFaces,
  trigger = true,
}: {
  settings: InkSettings
  onChange: (next: InkSettings) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Bring the faces out now. Left out where there is no scene to ask. */
  onCallFaces?: () => void
  /** Whether to draw the round button while closed. A page with its own button passes false. */
  trigger?: boolean
}) {
  if (!open) {
    if (!trigger) return null
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="water settings"
        aria-expanded={false}
        className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/60 backdrop-blur-md transition-colors hover:text-white"
      >
        <SlidersHorizontalIcon className="size-4" aria-hidden />
      </button>
    )
  }

  return (
    /* Capped at the viewport and scrolled inside, because this panel grew a
       row per creature and a row per knob and now runs off the bottom of a
       laptop, let alone a phone - a control you cannot reach is the same as
       one that is not there. The card is the column, the header stays put,
       and only the controls move; `overscroll-contain` keeps a flick inside
       the panel from carrying on into the page behind it, which on the
       reading route is somebody's chapter. */
    <div className="pointer-events-auto absolute top-3 right-3 z-10 flex max-h-[calc(100dvh-1.5rem)] w-56 flex-col rounded-xl border border-white/10 bg-black/60 text-white/80 backdrop-blur-md">
      <div className="flex shrink-0 items-center justify-between py-1 pr-1 pl-3 text-xs font-medium tracking-wide uppercase">
        <span>water</span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="close water settings"
          className="flex size-7 items-center justify-center rounded-full text-white/50 transition-colors hover:text-white"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>
      {open ? (
        /* The deep bottom padding is room to scroll past, not a margin: the
           site's own contact bubble floats over the bottom-right corner and
           would otherwise sit on the last switch with no way to move it. */
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain border-t border-white/10 px-3 pt-3 pb-14">
          <div className="flex gap-1 rounded-md bg-white/5 p-0.5" role="radiogroup" aria-label="colour mode">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={settings.mode === mode}
                onClick={() => onChange({ ...settings, mode })}
                className={
                  'flex-1 rounded px-2 py-1 text-[11px] transition-colors ' +
                  (settings.mode === mode ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80')
                }
              >
                {mode}
              </button>
            ))}
          </div>
          <Control
            label="fish"
            value={settings.count}
            shown={String(settings.count)}
            range={LIMITS.count}
            step={1}
            onChange={(count) => onChange({ ...settings, count })}
          />
          <Control
            label="jellyfish"
            value={settings.jellies}
            shown={String(settings.jellies)}
            range={LIMITS.jellies}
            step={1}
            onChange={(jellies) => onChange({ ...settings, jellies })}
          />
          <Control
            label="turtles"
            value={settings.turtles}
            shown={String(settings.turtles)}
            range={LIMITS.turtles}
            step={1}
            onChange={(turtles) => onChange({ ...settings, turtles })}
          />
          <Control
            label="small fish"
            value={settings.minnows}
            shown={String(settings.minnows)}
            range={LIMITS.minnows}
            step={1}
            onChange={(minnows) => onChange({ ...settings, minnows })}
          />
          {/* A face comes when it feels like it, which is correct and is also
              no way to look at one on purpose. */}
          {onCallFaces &&
          settings.mix + settings.cats + settings.llamas + settings.hippos + settings.stares + settings.chameleons >
            0 ? (
            <button
              type="button"
              onClick={onCallFaces}
              className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 py-1.5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <SparklesIcon className="size-3.5" aria-hidden />
              come out
            </button>
          ) : null}
          <Control
            label="surprises"
            value={settings.mix}
            shown={String(settings.mix)}
            range={LIMITS.mix}
            step={1}
            onChange={(mix) => onChange({ ...settings, mix })}
          />
          <Control
            label="cats"
            value={settings.cats}
            shown={String(settings.cats)}
            range={LIMITS.cats}
            step={1}
            onChange={(cats) => onChange({ ...settings, cats })}
          />
          <Control
            label="llamas"
            value={settings.llamas}
            shown={String(settings.llamas)}
            range={LIMITS.llamas}
            step={1}
            onChange={(llamas) => onChange({ ...settings, llamas })}
          />
          <Control
            label="hippos"
            value={settings.hippos}
            shown={String(settings.hippos)}
            range={LIMITS.hippos}
            step={1}
            onChange={(hippos) => onChange({ ...settings, hippos })}
          />
          <Control
            label="eyes in the dark"
            value={settings.stares}
            shown={String(settings.stares)}
            range={LIMITS.stares}
            step={1}
            onChange={(stares) => onChange({ ...settings, stares })}
          />
          <Control
            label="chameleons"
            value={settings.chameleons}
            shown={String(settings.chameleons)}
            range={LIMITS.chameleons}
            step={1}
            onChange={(chameleons) => onChange({ ...settings, chameleons })}
          />
          <Control
            label="radius"
            value={settings.radius}
            shown={`${(settings.radius * 100).toFixed(1)}%`}
            range={LIMITS.radius}
            step={0.001}
            onChange={(radius) => onChange({ ...settings, radius })}
          />
          <Control
            label="blob"
            value={settings.blob}
            shown={`${Math.round(settings.blob * 100)}%`}
            range={LIMITS.blob}
            step={0.01}
            onChange={(blob) => onChange({ ...settings, blob })}
          />
          <Control
            label="speed"
            value={settings.speed}
            shown={settings.speed.toFixed(2)}
            range={LIMITS.speed}
            step={0.01}
            onChange={(speed) => onChange({ ...settings, speed })}
          />
          <Toggle label="swirl" checked={settings.swirl} onChange={(swirl) => onChange({ ...settings, swirl })} />
          <Toggle label="eyes" checked={settings.eyes} onChange={(eyes) => onChange({ ...settings, eyes })} />
          {settings.eyes ? (
            <>
              <Control
                label="eye size"
                value={settings.eyeSize}
                shown={`${Math.round(settings.eyeSize * 100)}%`}
                range={LIMITS.eyeSize}
                step={0.05}
                onChange={(eyeSize) => onChange({ ...settings, eyeSize })}
              />
              <Toggle
                label="scatter"
                checked={settings.eyeScatter}
                onChange={(eyeScatter) => onChange({ ...settings, eyeScatter })}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-[11px] text-white/60">
      <span>{label}</span>
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function Control({
  label,
  value,
  shown,
  range,
  step,
  onChange,
}: {
  label: string
  value: number
  shown: string
  range: readonly [number, number]
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between text-[11px] text-white/60">
        <span>{label}</span>
        <span className="tabular-nums text-white/40">{shown}</span>
      </span>
      <Slider
        aria-label={label}
        min={range[0]}
        max={range[1]}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0]! : next)}
      />
    </label>
  )
}
