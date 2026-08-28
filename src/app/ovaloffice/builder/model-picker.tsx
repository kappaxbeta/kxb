'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cachedThumbnail,
  clearQueue,
  request,
  subscribe,
} from '@/app/ovaloffice/builder/thumbnails'
import { type CatalogueEntry, packSize, searchCatalogue } from '@/domain/builder/catalogue'
import { isBlockModel } from '@/domain/worlds/blocks'
import { modelThumbnailUrl, PACK_ORDER, PACKS } from '@/domain/builder/packs'

/**
 * Choosing one of 1308 models.
 *
 * The lounge's picker renders its whole palette into a grid and lets you scan
 * it, which works because its whole palette is 58 blocks that fit on a screen
 * and a half. At twenty times that, scanning is not a strategy: you find a
 * model by knowing roughly what it is called and which pack it came from, so
 * the search box has focus on open and the pack filter is the first thing under
 * it.
 *
 * Every tile draws its own picture, and the pictures are the expensive part -
 * see ./thumbnails. Only tiles that have actually scrolled into view ask for
 * one, which is what keeps opening the picker from downloading the entire asset
 * library.
 */

export function ModelPicker({
  selected,
  onSelect,
  onClose,
  blocksOnly = false,
}: {
  selected: string
  onSelect: (model: string) => void
  onClose: () => void
  /**
   * Offer only the models that survive into a world people walk around in.
   *
   * On for a space's builder, off for the backoffice's. The two are building
   * different things: a space is laying out somewhere its members will stand,
   * and everything outside the lounge palette is left behind when that world is
   * copied in (see domain/worlds/blocks.ts) - so a picker with 1,308 models in
   * it is a picker offering 1,250 things that will quietly vanish. The
   * backoffice builder shoots marketing stills, where the furniture is the
   * whole point.
   */
  blocksOnly?: boolean
}) {
  const [query, setQuery] = useState('')
  const [pack, setPack] = useState<string | undefined>(undefined)
  const input = useRef<HTMLInputElement>(null)

  const groups = useMemo(() => {
    const found = searchCatalogue(query, blocksOnly ? 'bb10' : pack)
    if (!blocksOnly) return found

    // The pack and the palette are not the same list: `bb10` ships blocks the
    // lounge never adopted, and one of those in a world is a model the walkable
    // copy drops. Filtered rather than assumed, for the reason blocks.ts gives.
    return found
      .map((group) => ({
        ...group,
        models: group.models.filter((entry) => isBlockModel(entry.id)),
      }))
      .filter((group) => group.models.length > 0)
  }, [query, pack, blocksOnly])
  const found = groups.reduce((sum, group) => sum + group.models.length, 0)

  useEffect(() => {
    input.current?.focus()
    // Whatever the last opening left waiting is not what this one is looking
    // at. Dropping it puts the visible tiles at the front of the queue.
    return clearQueue
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close model picker"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[oklch(0.06_0.03_285_/_0.72)] backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Models"
        className="hud-panel relative flex h-full max-h-[46rem] w-full max-w-5xl flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-line/50 px-5 py-3">
          <div className="flex items-center gap-3">
            <input
              ref={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search 1308 models — try “chair”, “tree”, “wall red”…"
              aria-label="Search models"
              className="min-w-0 flex-1 rounded-full border border-line/60 bg-surface/70 px-4 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-accent"
            />
            <span className="shrink-0 text-xs tabular-nums text-ink-muted">{found} found</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-accent/15 hover:text-ink"
            >
              <span aria-hidden className="text-lg leading-none">
                ✕
              </span>
            </button>
          </div>

          {/* The pack filter. Horizontal because there are twelve of them and a
              dropdown would hide the one fact that matters: how big each is.

              Gone entirely when only blocks are on offer - one tab is not a
              filter, it is a label. */}
          {!blocksOnly && (
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            <PackChip active={pack === undefined} onClick={() => setPack(undefined)}>
              All
            </PackChip>
            {PACK_ORDER.map((id) => (
              <PackChip key={id} active={pack === id} onClick={() => setPack(id)}>
                {PACKS[id].label}
                <span className="ml-1.5 tabular-nums opacity-60">{packSize(id)}</span>
              </PackChip>
            ))}
          </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {groups.map((group) => (
            <section key={group.packId} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-muted/70">
                {group.label}
                <span className="ml-2 tabular-nums opacity-60">{group.models.length}</span>
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
                {group.models.map((entry) => (
                  <Tile
                    key={entry.id}
                    entry={entry}
                    selected={selected === entry.id}
                    onPick={() => {
                      onSelect(entry.id)
                      onClose()
                    }}
                  />
                ))}
              </div>
            </section>
          ))}

          {groups.length === 0 && (
            <p className="py-10 text-center text-xs text-ink-muted">Nothing matches “{query}”.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function PackChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'bg-accent/20 text-ink ring-1 ring-accent/60'
          : 'text-ink-muted hover:bg-accent/10 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * One model, with a picture it asks for itself.
 *
 * The request goes out when the tile intersects the viewport, not when it
 * mounts: the grid mounts every matching model, which for an empty query is all
 * 1308 of them, and asking on mount would be exactly the mass download the
 * queue exists to avoid.
 */
function Tile({
  entry,
  selected,
  onPick,
}: {
  entry: CatalogueEntry
  selected: boolean
  onPick: () => void
}) {
  const [thumbnail, setThumbnail] = useState(() => cachedThumbnail(entry.id))
  /**
   * Whether the baked picture is missing, so this tile has to draw its own.
   *
   * `scripts/render-models.ts` shoots every model in the catalogue to a file,
   * which is two or three kilobytes the browser caches - against a whole glTF
   * downloaded, parsed and rendered per tile, which is what made opening this
   * picker feel like waiting. So the file is the path everything takes, and the
   * live renderer next door is now only the fallback for a model whose file has
   * not been shot yet.
   *
   * Detected by letting the `<img>` fail rather than by asking the server first:
   * a HEAD per tile would be the round trip this is trying to avoid, and a
   * missing file is the rare case.
   */
  const [missing, setMissing] = useState(false)
  const box = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Only the fallback needs any of this. A tile with a file draws it and is
    // done - no observer, no queue, no WebGL context.
    if (!missing) return
    // Already drawn in an earlier opening of the picker. The lazy initialiser
    // above has it, and there is nothing to watch for - a tile is keyed on its
    // model id, so this instance will never be asked about a different one.
    if (cachedThumbnail(entry.id)) return

    const node = box.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((record) => record.isIntersecting)) return
        request(entry.id)
        // One request per tile. The queue dedupes too, but stopping here means
        // scrolling back and forth does not re-enqueue what is already coming.
        observer.disconnect()
      },
      // A screen of margin, so tiles are drawn just before they are needed
      // rather than just after they are looked at.
      { rootMargin: '300px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [entry.id, missing])

  useEffect(
    () =>
      subscribe((model, dataUrl) => {
        if (model === entry.id) setThumbnail(dataUrl)
      }),
    [entry.id],
  )

  return (
    <button
      ref={box}
      type="button"
      onClick={onPick}
      title={entry.label}
      className={`group flex flex-col items-center gap-1 rounded-2xl border p-2 transition ${
        selected
          ? 'border-accent bg-accent/15 shadow-[0_0_1.2rem_oklch(0.7_0.27_322_/_0.35)]'
          : 'border-transparent bg-white/[0.04] hover:border-accent/50 hover:bg-accent/10'
      }`}
    >
      <span className="flex size-14 items-center justify-center">
        {!missing ? (
          // The baked file. A plain <img>, not next/image, for the reason the
          // block picker gives: these are already the exact size they are drawn
          // at and already WebP, so the optimizer has nothing to do but add a
          // round trip.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={modelThumbnailUrl(entry.id)}
            alt=""
            loading="lazy"
            onError={() => setMissing(true)}
            className="size-14 transition-transform group-hover:scale-110"
            draggable={false}
          />
        ) : thumbnail ? (
          // Drawn in the browser, because this model has no file yet.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            className="size-14 transition-transform group-hover:scale-110"
            draggable={false}
          />
        ) : (
          // Same size as the picture, so the grid never reflows as tiles
          // fill in and the scroll position stays where it was put.
          <span className="size-10 animate-pulse rounded-lg bg-white/10" />
        )}
      </span>
      <span className="w-full truncate text-center text-[10px] leading-tight text-ink-muted">
        {entry.label}
      </span>
    </button>
  )
}
