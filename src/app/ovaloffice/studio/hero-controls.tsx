'use client'

import { useId, useRef } from 'react'
import { Num, Pick, Section, Slide } from '@/app/ovaloffice/studio/parts'
import {
  DEFAULT_HERO,
  HERO_BLOCK_MODELS,
  type HeroCorner,
  type HeroCta,
  type HeroImage,
  type HeroLogo,
  isSessionImage,
  type StudioHero,
} from '@/domain/studio/hero'

/**
 * The hero's panel.
 *
 * Same shape as the scene and shot panels — disclosure sections over the shared
 * parts in `./parts` — so the three studios read as one tool. Everything writes
 * into the document and nothing holds state of its own, with the single
 * exception of the file input, which cannot be controlled.
 */

/**
 * The stills already baked into `public/xo/scenes`.
 *
 * A hand-kept list, which is the honest cost of not having a directory listing
 * at runtime: a newly shot scene has to be added here to appear in the picker.
 * The source field takes any path, so the list being a step behind is a missing
 * shortcut rather than a missing capability.
 */
const STOCK = [
  'crew',
  'desk-duo',
  'house',
  'instant-link',
  'party-club',
  'cafe-counter',
  'football-duel',
  'football-crowd',
  'og-hero',
]

/**
 * The brand marks that exist as pictures.
 *
 * `scripts/render-brand.ts` bakes these; the header's own lockup is two CSS
 * boxes built from `lib/brand` and a canvas cannot borrow either, which is why
 * the composer points at the PNGs rather than at the component.
 */
const LOGOS = [
  { label: 'Lockup', src: '/lockup.png' },
  { label: 'Mark', src: '/logo.png' },
  { label: 'team', src: '/team.png' },
]

/** Sizes worth having one click away. */
const SIZES: { label: string; width: number; height: number }[] = [
  { label: 'Wide 16:9', width: 1920, height: 1080 },
  { label: 'OG card', width: 1200, height: 630 },
  { label: 'Square', width: 1200, height: 1200 },
  { label: 'Story 9:16', width: 1080, height: 1920 },
]

export function HeroControls({
  hero,
  onChange,
}: {
  hero: StudioHero
  onChange: (hero: StudioHero) => void
}) {
  const fileId = useId()
  const file = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<StudioHero>) => onChange({ ...hero, ...patch })
  const setText = (patch: Partial<StudioHero['text']>) =>
    set({ text: { ...hero.text, ...patch } })
  const setSky = (patch: Partial<StudioHero['sky']>) => set({ sky: { ...hero.sky, ...patch } })
  const setBlocks = (patch: Partial<StudioHero['blocks']>) =>
    set({ blocks: { ...hero.blocks, ...patch } })
  const setMotion = (patch: Partial<StudioHero['motion']>) =>
    set({ motion: { ...hero.motion, ...patch } })

  /**
   * A picture, from a path.
   *
   * Adding one starts it in the half the layout is not using, at a third of the
   * frame — which is the arrangement somebody reaching for this control almost
   * always wants, and is a great deal easier to nudge from than from a corner.
   */
  const setImage = (patch: Partial<HeroImage>) => {
    const base: HeroImage = hero.image ?? {
      src: '',
      x: hero.layout === 'text-right' ? 26 : 74,
      y: 52,
      scale: 0.34,
      rotation: 0,
      float: 1.2,
      shadow: true,
    }
    const next = { ...base, ...patch }
    set({ image: next.src.trim().length > 0 ? next : null })
  }

  const setCta = (patch: Partial<HeroCta>) => {
    const base: HeroCta = hero.cta ??
      DEFAULT_HERO.cta ?? { label: 'Open a room', secondary: null, colour: '#ff3ec8', ink: '#12071a' }
    // An empty label is allowed *here* so the field can be cleared and retyped;
    // the painter draws nothing for it and `parseHero` drops it on the way into
    // a link. Snapping the old label back on every keystroke would make the
    // input unclearable, which is the usual way a validated field goes wrong.
    set({ cta: { ...base, ...patch } })
  }

  /**
   * The lockup.
   *
   * Falls back to the default rather than to an empty source, because the only
   * way to have no logo is the toggle above — a half-filled source field would
   * otherwise be indistinguishable from having turned it off.
   */
  const setLogo = (patch: Partial<HeroLogo>) => {
    const base: HeroLogo = hero.logo ??
      DEFAULT_HERO.logo ?? {
        src: '/lockup.png',
        corner: 'top-left',
        scale: 0.11,
        margin: 3.5,
        opacity: 1,
      }
    set({ logo: { ...base, ...patch } })
  }

  /**
   * A picture, off the desktop.
   *
   * Held as a blob URL for the session and no further — see the note at the top
   * of `@/domain/studio/hero` about why a data URL cannot go in the link. The
   * old URL is revoked as the new one is made, so a session spent trying twenty
   * files does not hold twenty of them in memory.
   */
  const importFile = (picked: File | undefined) => {
    if (!picked) return
    if (hero.image?.src.startsWith('blob:')) URL.revokeObjectURL(hero.image.src)
    setImage({ src: URL.createObjectURL(picked) })
  }

  const pool = hero.blocks.models

  return (
    <div className="flex flex-col gap-2">
      <Section title="Frame" summary={`${hero.width}×${hero.height}`} open>
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((size) => (
            <button
              key={size.label}
              type="button"
              onClick={() => set({ width: size.width, height: size.height })}
              aria-pressed={hero.width === size.width && hero.height === size.height}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground aria-pressed:border-accent aria-pressed:text-foreground"
            >
              {size.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Num label="Width" value={hero.width} min={240} max={4096} step={10} onChange={(width) => set({ width })} />
          <Num label="Height" value={hero.height} min={240} max={4096} step={10} onChange={(height) => set({ height })} />
        </div>
        <Pick
          label="Layout"
          value={hero.layout}
          options={['centred', 'text-left', 'text-right']}
          onChange={(layout) => set({ layout: layout as StudioHero['layout'] })}
        />
      </Section>

      <Section title="Copy" summary={hero.text.headline} open>
        <Line
          label="Eyebrow"
          value={hero.text.eyebrow ?? ''}
          onChange={(eyebrow) => setText({ eyebrow: eyebrow || null })}
        />
        <Line
          label="Headline"
          value={hero.text.headline}
          onChange={(headline) => setText({ headline })}
        />
        {/* Two fields rather than one with a marker in it: the design has
            exactly one clause that glows, and two inputs can express exactly
            that. See `HeroText.headline`. */}
        <Line
          label="Accent clause"
          value={hero.text.accent ?? ''}
          onChange={(accent) => setText({ accent: accent || null })}
        />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Body
          <textarea
            value={hero.text.body ?? ''}
            rows={3}
            onChange={(event) => setText({ body: event.target.value || null })}
            className="w-full resize-y rounded-lg border border-border bg-secondary/40 px-2 py-1 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
          />
        </label>
        <div className="flex items-center gap-3">
          <Swatch label="Ink" value={hero.text.ink} onChange={(ink) => setText({ ink })} />
          <Swatch
            label="Accent"
            value={hero.text.accentColour}
            onChange={(accentColour) => setText({ accentColour })}
          />
        </div>
        <Slide label="Type size" value={hero.text.size} min={0.4} max={2.5} step={0.05} onChange={(size) => setText({ size })} />
      </Section>

      <Section
        title="Picture"
        summary={hero.image ? (isSessionImage(hero) ? 'imported file' : hero.image.src) : 'none'}
        open
      >
        <div className="flex flex-wrap gap-1.5">
          {STOCK.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setImage({ src: `/xo/scenes/${name}.webp` })}
              aria-pressed={hero.image?.src === `/xo/scenes/${name}.webp`}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground aria-pressed:border-accent aria-pressed:text-foreground"
            >
              {name}
            </button>
          ))}
        </div>
        <Line
          label="Source"
          value={hero.image?.src ?? ''}
          placeholder="/xo/scenes/crew.webp"
          onChange={(src) => setImage({ src })}
        />
        <div className="flex items-center gap-2">
          <label
            htmlFor={fileId}
            className="cursor-pointer rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            Import a file…
          </label>
          <input
            id={fileId}
            ref={file}
            type="file"
            accept="image/*"
            onChange={(event) => importFile(event.target.files?.[0])}
            className="hidden"
          />
          {hero.image && (
            <button
              type="button"
              onClick={() => set({ image: null })}
              className="text-xs text-muted-foreground underline-offset-2 transition hover:text-red-400 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
        {/* Said out loud rather than discovered: an imported file is the one
            thing in this document the link cannot carry. */}
        {isSessionImage(hero) && (
          <p className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300/90">
            This file lives in the browser for this session only — the link will
            open without it. Export the PNG now, or put the file under{' '}
            <code>public/</code> and point the source at its path.
          </p>
        )}
        {hero.image && (
          <>
            <Slide label="Across" value={hero.image.x} min={-20} max={120} step={0.5} unit="%" onChange={(x) => setImage({ x })} />
            <Slide label="Down" value={hero.image.y} min={-20} max={120} step={0.5} unit="%" onChange={(y) => setImage({ y })} />
            <Slide label="Size" value={hero.image.scale} min={0.02} max={1.5} step={0.01} onChange={(scale) => setImage({ scale })} />
            <Slide label="Tilt" value={hero.image.rotation} min={-180} max={180} step={1} unit="°" onChange={(rotation) => setImage({ rotation })} />
            <Slide label="Float" value={hero.image.float} min={0} max={12} step={0.1} onChange={(float) => setImage({ float })} />
            <Toggle
              label="Contact shadow"
              value={hero.image.shadow}
              onChange={(shadow) => setImage({ shadow })}
            />
          </>
        )}
      </Section>

      <Section title="Button" summary={hero.cta ? hero.cta.label : 'off'}>
        <Toggle
          label="Show a call to action"
          value={hero.cta !== null}
          onChange={(on) => set({ cta: on ? (DEFAULT_HERO.cta ?? null) : null })}
        />
        {hero.cta && (
          <>
            <Line label="Button" value={hero.cta.label} onChange={(label) => setCta({ label })} />
            {/* Empty removes it — one thing to do and one quieter way to look
                first is the whole design; see `HeroCta`. */}
            <Line
              label="Second, quieter"
              value={hero.cta.secondary ?? ''}
              onChange={(secondary) => setCta({ secondary: secondary || null })}
            />
            <div className="flex items-center gap-3">
              <Swatch label="Fill" value={hero.cta.colour} onChange={(colour) => setCta({ colour })} />
              <Swatch label="Label" value={hero.cta.ink} onChange={(ink) => setCta({ ink })} />
            </div>
            <p className="text-xs text-muted-foreground">
              Drawn, not clickable — the export is a picture.
            </p>
          </>
        )}
      </Section>

      <Section title="Logo" summary={hero.logo ? hero.logo.corner : 'off'}>
        <Toggle
          label="Show the lockup"
          value={hero.logo !== null}
          onChange={(on) => set({ logo: on ? (DEFAULT_HERO.logo ?? null) : null })}
        />
        {hero.logo && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {LOGOS.map((option) => (
                <button
                  key={option.src}
                  type="button"
                  onClick={() => setLogo({ src: option.src })}
                  aria-pressed={hero.logo?.src === option.src}
                  className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground aria-pressed:border-accent aria-pressed:text-foreground"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Line
              label="Source"
              value={hero.logo.src}
              placeholder="/lockup.png"
              onChange={(src) => setLogo({ src })}
            />
            {/* A corner rather than a position — see `HeroCorner`. */}
            <Pick
              label="Corner"
              value={hero.logo.corner}
              options={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              onChange={(corner) => setLogo({ corner: corner as HeroCorner })}
            />
            <Slide label="Size" value={hero.logo.scale} min={0.02} max={0.6} step={0.005} onChange={(scale) => setLogo({ scale })} />
            <Slide label="Margin" value={hero.logo.margin} min={0} max={25} step={0.25} unit="%" onChange={(margin) => setLogo({ margin })} />
            <Slide label="Opacity" value={hero.logo.opacity} min={0} max={1} step={0.01} onChange={(opacity) => setLogo({ opacity })} />
          </>
        )}
      </Section>

      <Section title="Drift" summary={`${hero.blocks.count} blocks · seed ${hero.seed}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              // The one place a random number is allowed: the seed is being
              // chosen, not the arrangement. Everything downstream of it is
              // still pure, which is what keeps the link reproducible.
              set({ seed: Math.floor(Math.random() * 1_000_000) })
            }
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary"
          >
            Reroll
          </button>
          <Num label="Seed" value={hero.seed} min={0} max={999_999} step={1} onChange={(seed) => set({ seed })} />
        </div>
        <Slide label="Blocks" value={hero.blocks.count} min={0} max={30} step={1} onChange={(count) => setBlocks({ count })} />
        <Slide label="Size" value={hero.blocks.scale} min={0.2} max={3} step={0.05} onChange={(scale) => setBlocks({ scale })} />
        <Slide label="Drift" value={hero.blocks.drift} min={0} max={4} step={0.05} onChange={(drift) => setBlocks({ drift })} />
        <Slide label="Shapes" value={hero.blocks.shapes} min={0} max={16} step={1} onChange={(shapes) => setBlocks({ shapes })} />
        <p className="mt-1 text-xs text-muted-foreground">
          {pool.length === 0 ? 'Every block' : `${pool.length} chosen`} — click to
          narrow the pool.
        </p>
        <div className="flex flex-wrap gap-1">
          {HERO_BLOCK_MODELS.map((model) => {
            const on = pool.length === 0 || pool.includes(model)
            return (
              <button
                key={model}
                type="button"
                aria-pressed={pool.includes(model)}
                onClick={() =>
                  setBlocks({
                    // An empty pool means "all", so the first click has to start
                    // from the full list rather than from nothing — otherwise
                    // clicking one block selects it and deselects eighteen.
                    models: pool.includes(model)
                      ? pool.filter((name) => name !== model)
                      : [...(pool.length === 0 ? [] : pool), model],
                  })
                }
                className={`rounded-md border px-1.5 py-0.5 text-[11px] transition ${
                  on
                    ? 'border-accent/60 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {model}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Sky">
        <div className="flex items-center gap-3">
          <Swatch label="Top" value={hero.sky.top} onChange={(top) => setSky({ top })} />
          <Swatch label="Bottom" value={hero.sky.bottom} onChange={(bottom) => setSky({ bottom })} />
        </div>
        <Slide label="Glow" value={hero.sky.glow} min={0} max={1} step={0.01} onChange={(glow) => setSky({ glow })} />
        <Slide label="Grid" value={hero.sky.grid} min={0} max={0.4} step={0.005} onChange={(grid) => setSky({ grid })} />
        <Slide label="Stars" value={hero.sky.stars} min={0} max={400} step={5} onChange={(stars) => setSky({ stars })} />
        <Slide label="Vignette" value={hero.sky.vignette} min={0} max={1} step={0.01} onChange={(vignette) => setSky({ vignette })} />
      </Section>

      <Section title="Motion" summary={`${hero.motion.entrance} · ${hero.motion.duration}s`}>
        <Pick
          label="Entrance"
          value={hero.motion.entrance}
          options={['none', 'fade', 'rise', 'pop', 'type']}
          onChange={(entrance) => setMotion({ entrance: entrance as StudioHero['motion']['entrance'] })}
        />
        <Slide label="Stagger" value={hero.motion.stagger} min={0} max={2} step={0.02} unit="s" onChange={(stagger) => setMotion({ stagger })} />
        <Slide label="Length" value={hero.motion.duration} min={1} max={30} step={0.5} unit="s" onChange={(duration) => setMotion({ duration })} />
        <Slide label="Rate" value={hero.motion.fps} min={10} max={60} step={1} unit="fps" onChange={(fps) => setMotion({ fps })} />
        {/* The frame a still is taken on. Past the entrance by default — see
            `HeroMotion.posterTime`. */}
        <Slide label="Still at" value={hero.motion.posterTime} min={0} max={hero.motion.duration} step={0.1} unit="s" onChange={(posterTime) => setMotion({ posterTime })} />
      </Section>

      <button
        type="button"
        onClick={() => onChange(DEFAULT_HERO)}
        className="self-start text-xs text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
      >
        Reset everything
      </button>
    </div>
  )
}

function Line({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-secondary/40 px-2 py-1 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
      />
    </label>
  )
}

/** A colour, as the native picker plus the hex — one to find it, one to paste it. */
function Swatch({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
      />
      <span className="shrink-0">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} hex`}
        className="w-0 min-w-0 flex-1 rounded-lg border border-border bg-secondary/40 px-1.5 py-1 font-mono text-xs text-foreground"
      />
    </label>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  )
}
