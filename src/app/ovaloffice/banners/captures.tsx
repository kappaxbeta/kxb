'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BannerCapture, CaptureFit, SlotRect } from '@/domain/banners'

/**
 * The gameplay captures, one per frame.
 *
 * Three ways in, because this is a job somebody does twelve times in a row and
 * the fastest way differs every time: pick a file, drag one onto the slot, or
 * take a screenshot and press paste. The last one is the reason there is a
 * selected slot at all - a paste has no target of its own, so the slot you
 * touched last is the one it lands in.
 *
 * Nothing is uploaded anywhere and nothing is kept: these live in the page
 * until you switch panel, get drawn into the canvas, and leave in the PNG. That
 * is the right lifetime for what they are - a look at the composition before
 * committing to it. A screenshot that matters goes in `marketing/captures/`,
 * where `bun run banners:render` will find it every time.
 */

/**
 * The long edge a capture is squashed to on the way in.
 *
 * The widest frame on either canvas is 1764px, so 2400 is still more detail
 * than any slot can draw. Full-size retina screenshots arrive at four or five
 * thousand pixels and turn into eight-megabyte data URLs, and a dozen of those
 * in one page makes every redraw stutter for detail that is thrown away at
 * draw time anyway.
 */
const MAX_EDGE = 2400

/**
 * The four ways a picture can meet a frame.
 *
 * `Fill` and `Fit` are the two everybody knows. The other two exist because
 * `Fill` picks the axis that crops least, which is right nearly always and
 * exactly wrong when the subject is not in the middle - so they let somebody
 * say which axis gets sacrificed rather than inferring it from the shape.
 */
const FITS: [CaptureFit, string, string][] = [
  ['cover', 'Fill', 'Fill the frame, crop whichever axis overflows'],
  ['contain', 'Fit', 'Fit the whole picture in, let the backing show'],
  ['height', '↕ crop w', 'Match the height, crop the sides'],
  ['width', '↔ crop h', 'Match the width, crop top and bottom'],
]

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // WebP rather than PNG: these are re-encoded into the export as PNG anyway,
  // so the only thing the intermediate format decides is how much memory a
  // dozen screenshots take while the tab is open.
  return canvas.toDataURL('image/webp', 0.92)
}

export function CaptureSlots({
  rects,
  values,
  onChange,
  onFit,
  texts,
  onText,
}: {
  rects: SlotRect[]
  values: (BannerCapture | null)[]
  onChange: (index: number, dataUrl: string | null) => void
  onFit: (index: number, fit: CaptureFit) => void
  texts: (string | null)[]
  onText: (index: number, text: string) => void
}) {
  const [selected, setSelected] = useState(0)
  const [over, setOver] = useState<number | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const accept = useCallback(async (index: number, file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    onChange(index, await toDataUrl(file))
    setSelected(index)
  }, [onChange])

  // A paste has no target of its own, so it goes to the slot touched last.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      // Never swallow a paste meant for one of the copy fields.
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      const file = [...(e.clipboardData?.items ?? [])]
        .find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (!file) return
      e.preventDefault()
      void accept(selected, file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [accept, selected])

  return (
    <div className="flex flex-col gap-3">
      {rects.map((rect, i) => (
        <div key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {rect.label ?? `Frame ${i + 1}`}
            </span>
            <span className="text-muted-foreground/70 text-[11px]">{rect.w} × {rect.h}</span>
          </div>

          <button
            type="button"
            onClick={() => { setSelected(i); inputs.current[i]?.click() }}
            onDragOver={(e) => { e.preventDefault(); setOver(i) }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); void accept(i, e.dataTransfer.files[0]) }}
            className={`relative flex w-full items-center gap-3 overflow-hidden rounded-md border px-3 py-2 text-left text-sm transition ${
              over === i ? 'border-primary bg-primary/10'
                : selected === i ? 'border-primary/60 bg-muted/40' : 'border-border hover:bg-muted/40'}`}
          >
            <span
              className="bg-muted/60 h-10 w-16 shrink-0 rounded border bg-cover bg-center"
              style={values[i] ? { backgroundImage: `url(${values[i]?.src})` } : undefined}
            />
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
              {values[i] ? 'Replace — click, drop, or paste' : 'Click, drop a file, or paste'}
            </span>
          </button>

          <input
            ref={(el) => { inputs.current[i] = el }}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { void accept(i, e.target.files?.[0]); e.target.value = '' }}
          />

          {values[i] ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {FITS.map(([fit, label, hint]) => (
                <button key={fit} type="button" onClick={() => onFit(i, fit)} title={hint}
                  className={`text-xs ${values[i]?.fit === fit
                    ? 'text-primary font-medium' : 'text-muted-foreground hover:underline'}`}>
                  {label}
                </button>
              ))}
              <span className="text-muted-foreground/40 text-xs">·</span>
              <button type="button" onClick={() => onChange(i, null)}
                className="text-muted-foreground text-xs hover:underline">
                Clear
              </button>
            </div>
          ) : null}

          <input
            value={texts[i] ?? ''}
            onChange={(e) => onText(i, e.target.value)}
            placeholder="Word on the picture — optional"
            className="border-border bg-background mt-1.5 w-full rounded-md border px-3 py-1.5 text-xs"
          />
        </div>
      ))}
    </div>
  )
}
