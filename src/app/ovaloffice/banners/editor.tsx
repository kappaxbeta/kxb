'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEVICES, PANELS, TAGLINE, type ArtCatalogue, type BannerCapture, type BannerSpec, type CaptureFit, type DeviceKey, type PanelCopy, type SlotLayout } from '@/domain/banners'
import { LOCALES, type Locale } from '@/domain/i18n/locale'
import { paintBanner } from '@/app/ovaloffice/banners/paint'
import { bannerFilename, downloadCanvas, slotNote } from '@/app/ovaloffice/banners/export'
import { bannerSeed } from '@/domain/banners/seed'
import { slotRects } from '@/domain/banners'
import { CaptureSlots } from '@/app/ovaloffice/banners/captures'

/**
 * Where the store banners get made.
 *
 * The shape of the thing is one canvas and a column of controls, and the canvas
 * is the real one - full App Store size, scaled down by CSS to fit the panel.
 * Nothing here draws a preview of its own, which is the whole reason the
 * downloaded PNG always matches what was on screen.
 *
 * Editing is local and unsaved on purpose. The twelve panels' words live in
 * `@/domain/banners/panels` and go through review like any other copy; this
 * page is for trying a headline before writing it down, and for the half of the
 * job that is not words at all - which animal, which object, one frame or
 * three. A save button here would quietly become a second place the store
 * listing is written, and then nobody would know which one shipped.
 */

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', de: 'Deutsch', bg: 'Български' }

interface ArtEdit {
  character?: string
  hero?: string
  slots?: number
  layout?: SlotLayout
  /** Set by the reroll button; absent means the panel's own arrangement. */
  seed?: number
}

/* Frozen and shared: an unedited panel has to read the same object every
 * render, or the memo below rebuilds the spec and repaints the canvas on every
 * keystroke somewhere else on the page. */
const NO_COPY_EDIT: Partial<PanelCopy> = Object.freeze({})
const NO_ART_EDIT: ArtEdit = Object.freeze({})
/* Shared and empty, so a panel with nothing dropped on it reads the same
 * array every render rather than a new one. */
const NO_CAPTURES: (BannerCapture | null)[] = []
const NO_TEXTS: (string | null)[] = []

export function BannerEditor({ art }: { art: ArtCatalogue }) {
  const [panelId, setPanelId] = useState(PANELS[0].id)
  const [locale, setLocale] = useState<Locale>('en')
  const [device, setDevice] = useState<DeviceKey>('iphone69')
  const [busy, setBusy] = useState(false)

  const source = useMemo(() => PANELS.find((p) => p.id === panelId) ?? PANELS[0], [panelId])

  /* Overrides, held against the thing they override rather than reset when it
   * changes. Words are keyed by panel *and* language, because an edited English
   * headline must not show up over the reviewed Bulgarian; art is keyed by
   * panel alone, because which animal is on it is not a language decision.
   *
   * Keying rather than clearing is also what makes flicking between two panels
   * to compare them non-destructive - switching away and back returns what you
   * had, and nothing is lost to a reset you did not ask for. */
  const [copyEdits, setCopyEdits] = useState<Record<string, Partial<PanelCopy>>>({})
  const [artEdits, setArtEdits] = useState<Record<string, ArtEdit>>({})
  /* What is in the frames right now, and only right now.
   *
   * Held against the panel it was dropped on, so switching panel throws it
   * away - these are for looking at a composition before committing to it, not
   * a place screenshots are kept. The repeatable path is `marketing/captures/`
   * and `bun run banners:render`, which is where a screenshot that matters
   * belongs.
   *
   * Stored with its panel rather than cleared by an effect: the same picture
   * serves all three languages, so switching language keeps it, and there is
   * no cascading render to explain. */
  const [captureBox, setCaptureBox] = useState<{
    panel: string
    shots: (BannerCapture | null)[]
    texts: (string | null)[]
  }>({ panel: '', shots: [], texts: [] })
  const onThisPanel = captureBox.panel === panelId
  const captures = onThisPanel ? captureBox.shots : NO_CAPTURES
  const slotTexts = onThisPanel ? captureBox.texts : NO_TEXTS

  const [textColor, setTextColor] = useState('#5ce8e0')
  const [textPlace, setTextPlace] = useState<'over' | 'beside'>('over')
  const [sparkles, setSparkles] = useState(true)
  const [jaunty, setJaunty] = useState(false)

  const copyKey = `${panelId}:${locale}`
  const copyEdit = copyEdits[copyKey] ?? NO_COPY_EDIT
  const artEdit = artEdits[panelId] ?? NO_ART_EDIT

  const editCopy = useCallback((patch: Partial<PanelCopy>) => {
    setCopyEdits((all) => ({ ...all, [copyKey]: { ...all[copyKey], ...patch } }))
  }, [copyKey])
  const editArt = useCallback((patch: ArtEdit) => {
    setArtEdits((all) => ({ ...all, [panelId]: { ...all[panelId], ...patch } }))
  }, [panelId])

  /* Every writer goes through this: it is the one place that knows a box
   * belonging to another panel is an empty box, which is what makes switching
   * panel a discard without an effect to do the clearing. */
  const editBox = useCallback((
    change: (box: { shots: (BannerCapture | null)[]; texts: (string | null)[] }) => void,
  ) => {
    setCaptureBox((box) => {
      const next = box.panel === panelId
        ? { panel: panelId, shots: [...box.shots], texts: [...box.texts] }
        : { panel: panelId, shots: [], texts: [] }
      change(next)
      return next
    })
  }, [panelId])

  const setCapture = useCallback((slot: number, src: string | null) => {
    editBox((box) => {
      box.shots[slot] = src ? { src, fit: box.shots[slot]?.fit ?? 'cover' } : null
    })
  }, [editBox])

  const setCaptureFit = useCallback((slot: number, fit: CaptureFit) => {
    editBox((box) => {
      const shot = box.shots[slot]
      if (shot) box.shots[slot] = { ...shot, fit }
    })
  }, [editBox])

  const setSlotText = useCallback((slot: number, text: string) => {
    editBox((box) => { box.texts[slot] = text || null })
  }, [editBox])

  const spec: BannerSpec = useMemo(() => {
    const base = source.copy[locale]
    const count = artEdit.slots ?? source.slots
    return {
      device,
      locale,
      copy: { ...base, ...copyEdit },
      character: artEdit.character ?? source.character,
      hero: artEdit.hero ?? source.hero,
      band: source.band,
      slots: count,
      slotLayout: artEdit.layout ?? source.slotLayout ?? 'rows',
      slotLabels: source.slotLabels ? source.slotLabels[locale].slice(0, count) : [],
      captures: Array.from({ length: count }, (_, i) => captures[i] ?? null),
      slotTexts: Array.from({ length: count }, (_, i) => slotTexts[i] ?? null),
      slotTextColor: textColor,
      slotTextPlace: textPlace,
      sparkles,
      jaunty,
      tagline: TAGLINE[locale],
      // The scatter has to be stable across an edit, so it is seeded by which
      // panel this is rather than by anything the controls can change.
      seed: artEdit.seed ?? bannerSeed(source.id),
    }
  }, [source, locale, device, copyEdit, artEdit, captures, slotTexts, textColor, textPlace, sparkles, jaunty])

  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let stale = false
    void paintBanner(canvas, spec).then(() => { if (stale) return })
    return () => { stale = true }
  }, [spec])

  const geometry = DEVICES[device]

  /**
   * Every panel, every language, on this canvas.
   *
   * Serial rather than parallel, and awaited between each: they all draw
   * through the same image cache and the same canvas, so firing them at once
   * would have them overwrite each other's pixels halfway through a `toBlob`.
   */
  const downloadAll = useCallback(async () => {
    const canvas = document.createElement('canvas')
    setBusy(true)
    try {
      for (const p of PANELS) {
        for (const loc of LOCALES) {
          const count = p.slots
          await paintBanner(canvas, {
            device, locale: loc, copy: p.copy[loc], character: p.character, hero: p.hero,
            band: p.band, slots: count,
            slotLayout: p.slotLayout ?? 'rows',
            slotLabels: p.slotLabels ? p.slotLabels[loc].slice(0, count) : [],
            // Empty on purpose: what is on screen belongs to one panel, and a
            // batch that quietly filled one of thirty-six would be worse than
            // a batch that fills none. Use `marketing/captures/` for that.
            captures: Array.from({ length: count }, () => null),
            slotTexts: Array.from({ length: count }, () => null),
            slotTextColor: textColor,
            slotTextPlace: textPlace,
            sparkles,
            jaunty,
            tagline: TAGLINE[loc],
            seed: bannerSeed(p.id),
          })
          downloadCanvas(canvas, `${p.id}_${loc}_${device}.png`)
          // The browser drops a burst of downloads on the floor; a beat between
          // them is the difference between thirty-six files and four.
          await new Promise((r) => setTimeout(r, 350))
        }
      }
    } finally {
      setBusy(false)
    }
  }, [device, textColor, textPlace, sparkles, jaunty])

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex w-full flex-col gap-5 lg:max-w-sm">
        <Field label="Panel">
          <select className={SELECT} value={panelId} onChange={(e) => setPanelId(e.target.value)}>
            {(['overview', 'play', 'create', 'share'] as const).map((group) => (
              <optgroup key={group} label={group === 'overview' ? 'Overview' : `Standalone — ${group}`}>
                {PANELS.filter((p) => p.group === group).map((p) => (
                  <option key={p.id} value={p.id}>{p.copy.en.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Language">
            <select className={SELECT} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
            </select>
          </Field>
          <Field label="Canvas">
            <select className={SELECT} value={device} onChange={(e) => setDevice(e.target.value as DeviceKey)}>
              {(Object.keys(DEVICES) as DeviceKey[]).map((k) => (
                <option key={k} value={k}>{DEVICES[k].label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Pixel headline">
          <input className={INPUT} value={spec.copy.funny}
            onChange={(e) => editCopy({ funny: e.target.value })} />
          <p className="text-muted-foreground mt-1 text-xs">
            Shares the line with “{TAGLINE[locale]}”. Past about twenty-five characters the type starts shrinking.
          </p>
        </Field>

        <Field label="Feature title">
          <input className={INPUT} value={spec.copy.title}
            onChange={(e) => editCopy({ title: e.target.value })} />
        </Field>

        <Field label="Body">
          <textarea className={`${INPUT} h-28 resize-y`} value={spec.copy.body}
            onChange={(e) => editCopy({ body: e.target.value })} />
        </Field>

        <Field label="Cast">
          <select className={SELECT} value={spec.character} onChange={(e) => editArt({ character: e.target.value })}>
            {art.cast.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((src) => <option key={src} value={src}>{basename(src)}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label="Hero object">
          <select className={SELECT} value={spec.hero} onChange={(e) => editArt({ hero: e.target.value })}>
            {art.objects.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((src) => <option key={src} value={src}>{basename(src)}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>

        <Group label="Capture frames">
          <div className="flex gap-2">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => editArt({ slots: n })}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                  spec.slots === n ? 'border-primary bg-primary/15' : 'border-border hover:bg-muted'}`}>
                {n}
              </button>
            ))}
          </div>
          {spec.slots > 1 ? (
            <div className="mt-2 flex gap-2">
              {([['rows', 'Stacked'], ['columns', 'Side by side']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => editArt({ layout: value })}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                    spec.slotLayout === value ? 'border-primary bg-primary/15' : 'border-border hover:bg-muted'}`}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground mt-1 text-xs">
            Stacked suits an editor screenshot; side by side suits a phone one.
          </p>
        </Group>

        <Group label="Background blocks">
          <button type="button"
            onClick={() => editArt({ seed: (Math.random() * 0xffffffff) >>> 0 })}
            className="border-border hover:bg-muted w-full rounded-md border px-3 py-2 text-sm">
            Reroll the scatter
          </button>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sparkles} onChange={(e) => setSparkles(e.target.checked)} />
            <span>Sparkles over the cast</span>
          </label>
          <p className="text-muted-foreground mt-1 text-xs">
            {artEdit.seed === undefined
              ? 'The panel’s own arrangement.'
              : 'Rerolled — download to keep it, it is not written back to the panel.'}
          </p>
        </Group>

        <Group label="Gameplay captures">
          <CaptureSlots
            rects={slotRects(device, spec.slots, spec.slotLabels)}
            values={spec.captures}
            onChange={setCapture}
            onFit={setCaptureFit}
            texts={spec.slotTexts}
            onText={setSlotText}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Word colour</span>
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
                className="border-border h-7 w-10 cursor-pointer rounded border bg-transparent" />
            </label>
            <div className="flex gap-2 text-xs">
              {([['over', 'On the picture'], ['beside', 'Beside it']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setTextPlace(v)}
                  className={textPlace === v ? 'text-primary font-medium' : 'text-muted-foreground hover:underline'}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={jaunty} onChange={(e) => setJaunty(e.target.checked)} />
            <span>Tilt the frames</span>
          </label>
          {jaunty ? (
            <p className="text-muted-foreground mt-1 text-xs">
              A tilted frame is no longer at the coordinates listed below — turn this on once the
              pictures are already in.
            </p>
          ) : null}
          <p className="text-muted-foreground mt-2 text-xs">
            Kept until you switch panel, and left out of the batch below. For a render that
            keeps them, put the files in <code>marketing/captures/</code> and run{' '}
            <code>bun run banners:render</code>.
          </p>
        </Group>

        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy}
            onClick={() => canvasRef.current && downloadCanvas(canvasRef.current, bannerFilename(panelId, spec))}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
            Download this one
          </button>
          <button type="button" disabled={busy} onClick={() => void downloadAll()}
            className="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm disabled:opacity-50">
            {busy ? 'Drawing…' : `Download all ${PANELS.length * LOCALES.length} empty for this canvas`}
          </button>
        </div>

        <Group label="Where the captures go">
          <pre className="bg-muted/50 text-muted-foreground overflow-x-auto rounded-md p-3 text-xs leading-relaxed">
            {slotNote(panelId, spec)}
          </pre>
        </Group>
      </div>

      <div className="min-w-0 flex-1">
        <div className="bg-muted/30 flex justify-center rounded-lg border p-4">
          <canvas ref={canvasRef} className="h-auto w-full max-w-md rounded"
            style={{ aspectRatio: `${geometry.w} / ${geometry.h}` }} />
        </div>
      </div>
    </div>
  )
}

const SELECT = 'border-border bg-background w-full rounded-md border px-3 py-2 text-sm'
const INPUT = SELECT

/** One control under its name. A `<label>`, so the name focuses the control. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  )
}

/**
 * Several controls under one heading.
 *
 * Deliberately not a `<label>`. A label with no `htmlFor` binds to the first
 * labelable thing inside it, so wrapping the capture slots in one would make a
 * click anywhere in the block - including on Clear - open a file dialog,
 * because the hidden file input is the first control in there.
 */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={LABEL}>{label}</span>
      {children}
    </div>
  )
}

const LABEL = 'text-muted-foreground mb-1.5 block text-xs font-medium tracking-wide uppercase'

function basename(src: string): string {
  return src.split('/').pop()?.replace(/\.(webp|png|jpe?g)$/i, '') ?? src
}
