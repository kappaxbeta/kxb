'use client'

import { useMemo, useState } from 'react'
import { CATALOGUE } from '@kxb/xp/catalogue'
import { PACK_ORDER, PACKS, skeletonOf, thumbnailUrl } from '@kxb/xp/packs'
import type { XpDocument } from '@kxb/xp'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { MODEL_MIME } from '@/app/xp/_editor/movie/carry'

/**
 * The packs, as a view beside the stage.
 *
 * ---------------------------------------------------------------------------
 * Why the picker in the panel is not enough
 * ---------------------------------------------------------------------------
 * That one is four thumbnails across a 320px column, which is right for *"I
 * know I want a barrel"* and hopeless for the other thing people do with a
 * pack: find out what is in it. 3,892 models is not a list you scroll in a
 * sidebar, and a set is dressed by browsing rather than by searching for names
 * you do not know yet.
 *
 * ---------------------------------------------------------------------------
 * A pane, after a full-screen version that could not be dragged out of
 * ---------------------------------------------------------------------------
 * This began as an overlay taking the whole viewport, on the reasoning that
 * looking at models wants room. It does - but it made the one gesture that
 * matters impossible, because the stage you would be dropping onto was
 * underneath it. Hiding it for the length of a drag was the obvious patch and
 * the wrong shape: you would be aiming at a stage you had only just stopped
 * seeing, from a grid you could no longer see the rest of.
 *
 * So it is a view next to the scene instead, both up at once, and a drag is
 * just a drag. Resizable, because how much room browsing wants is a question
 * about what you are doing right now and not one this file can answer: pull it
 * wide to go through a pack, push it narrow to keep working.
 */

export interface PackPaneProps {
  document: XpDocument
  /** Place one in the middle of the shot. Dragging one aims it instead. */
  onPlace: (model: string) => void
  onClose: () => void
  /** Stacked above the stage rather than beside it, and not resizable. */
  narrow: boolean
}

/** The packs worth dressing a stage out of: everything that is not a skeleton. */
const PROP_PACKS = PACK_ORDER.filter((id) => !PACKS[id]?.skeleton)

/** How wide the pane may be pulled, in pixels. */
const NARROWEST = 260
const WIDEST = 820

export function PackPane({ document: xp, onPlace, onClose, narrow }: PackPaneProps) {
  const t = xpEditorDict(useLocale()).movie
  const [pack, setPack] = useState<string>(PROP_PACKS[0] ?? 'proto')
  const [hunt, setHunt] = useState('')
  const [width, setWidth] = useState(440)
  const [pulling, setPulling] = useState(false)

  const installed = useMemo(() => new Set(xp.packs.map((one) => one.id)), [xp.packs])

  /**
   * What is in this pack, filtered.
   *
   * Unbounded, unlike the sidebar's sixty: this is a scrolling view and the
   * whole point of it is seeing everything. The largest pack is 283 models,
   * which is a few screens of thumbnails rather than a performance problem.
   */
  const models = useMemo(() => {
    const wanted = hunt.trim().toLowerCase()
    return CATALOGUE.filter(
      (one) =>
        one.packId === pack &&
        !skeletonOf(one.id) &&
        (wanted === '' || one.label.toLowerCase().includes(wanted)),
    )
  }, [pack, hunt])

  return (
    <div
      style={narrow ? undefined : { width }}
      className={`relative flex shrink-0 flex-col bg-neutral-950 ${
        narrow ? 'h-[38%] border-b' : 'border-r'
      } border-neutral-800`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-2 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-300">
          {t.packs}
        </span>
        <input
          value={hunt}
          onChange={(event) => setHunt(event.target.value)}
          placeholder={t.findAModel}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
        <span className="shrink-0 font-mono text-[10px] text-neutral-600">
          {fill(models.length === 1 ? t.oneModel : t.someModels, {
            n: String(models.length),
          })}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 transition-colors hover:text-neutral-200"
        >
          {t.close}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/*
          The packs down the side rather than in a select, because this view
          exists for *browsing* - and a list you can see the whole of is what
          makes moving between two packs a glance rather than two clicks.
        */}
        <nav className="w-36 shrink-0 overflow-y-auto border-r border-neutral-800 py-1">
          {PROP_PACKS.map((one) => (
            <button
              key={one}
              type="button"
              onClick={() => setPack(one)}
              className={`flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono text-[10px] transition-colors ${
                pack === one
                  ? 'bg-violet-500/15 text-violet-200'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {/*
                A dot for "this level already carries it". Marked rather than
                sorted, so the packs stay in the order somebody learns them in.
              */}
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${
                  installed.has(one) ? 'bg-violet-400' : 'bg-neutral-700'
                }`}
              />
              <span className="min-w-0 flex-1 truncate">{PACKS[one]?.label ?? one}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-2">
          {/*
            A document declares its packs and an export reads the licence from
            that list, so taking a model from a new pack grows the file.
            `addBlueprint` does it correctly and nothing here can produce a
            document that will not re-open - but it is a change worth seeing
            before you make it rather than after.
          */}
          {installed.has(pack) ? null : (
            <p className="mb-2 font-mono text-[10px] text-amber-300/80">{t.willAddPack}</p>
          )}

          {models.length === 0 ? (
            <p className="font-mono text-[11px] text-neutral-600">{t.nothingMatches}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
              {models.map((one) => (
                <button
                  key={one.id}
                  type="button"
                  onClick={() => onPlace(one.id)}
                  title={one.id}
                  /*
                    Click *and* drag. A click puts it in the middle of the shot,
                    which is what you want when you are filling a stage; a drag
                    puts it where you let go, which is what you want when you
                    are dressing one. Same gesture until you move.
                  */
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(MODEL_MIME, one.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="group flex cursor-grab flex-col items-center gap-1 rounded border border-neutral-800 p-1.5 transition-colors hover:border-violet-500 hover:bg-violet-500/5 active:cursor-grabbing"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a pack
                      thumbnail is a static webp in `public`, and Next's loader
                      would put an optimiser in front of three hundred of them. */}
                  <img
                    src={thumbnailUrl(one.id)}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="size-12 object-contain opacity-85 transition-opacity group-hover:opacity-100"
                  />
                  <span className="w-full truncate text-center font-mono text-[9px] text-neutral-500">
                    {one.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/*
        The edge you pull. Pointer capture rather than window listeners, so a
        pull that outruns the cursor keeps its grip instead of dropping the pane
        the first time the pointer crosses the canvas - which is where every
        widening pull is heading.
      */}
      {narrow ? null : (
        <div
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setPulling(true)
          }}
          onPointerMove={(event) => {
            if (!pulling) return
            const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0
            setWidth(Math.min(WIDEST, Math.max(NARROWEST, event.clientX - left)))
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId)
            setPulling(false)
          }}
          className={`absolute inset-y-0 -right-0.5 z-10 w-1.5 cursor-col-resize transition-colors ${
            pulling ? 'bg-violet-500/60' : 'hover:bg-violet-500/40'
          }`}
        />
      )}
    </div>
  )
}
