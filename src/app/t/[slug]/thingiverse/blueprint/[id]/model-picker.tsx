'use client'

import { useEffect, useState, useTransition } from 'react'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import { findParts, listModelPacks, openModelPack } from '@/domain/thingiverse/actions'
import {
  isXpModel,
  type ModelHit,
  type ModelPack,
  thumbnailFor,
} from '@/domain/thingiverse/models'

/**
 * Choosing a model, on the bench.
 *
 * ---------------------------------------------------------------------------
 * Why it is two ways in and not one
 * ---------------------------------------------------------------------------
 * This was a search box, and a search box is only a way in for somebody who
 * already knows a word to type. The catalogue is 5,770 models over fifty-one
 * packs, and nothing on the bench ever said so: type "bench" and you get
 * benches, type nothing and you get nothing, and there is no press anywhere
 * that answers *what is there*. That is how a stall ends up built out of the
 * four models whose names somebody happened to guess.
 *
 * So the same panel now carries the catalogue as a tree as well: the two
 * shelves it is split into, the packs inside them with their sizes, and the
 * models inside a pack when you open one. Type a word if you have one; open a
 * branch if you do not. Both end in the same grid of pictures and the same
 * press, because they are the same act - look at models, choose one.
 *
 * This is deliberately the shape the workbench tab already draws (see
 * `PacksPanel`): the same split, the same counts, the level packs folded away
 * the same way. Somebody who has browsed the catalogue on `/browse` has already
 * learned this, and a bench that invented a second vocabulary for the same
 * fifty-one packs would be a second thing to learn for nothing.
 *
 * ---------------------------------------------------------------------------
 * Where the data comes from
 * ---------------------------------------------------------------------------
 * The server, all of it - see `findParts`, `listModelPacks` and
 * `openModelPack`. The catalogue is two module constants totalling 5,770
 * entries, and resolving a pack list in the browser means shipping every one of
 * them to everybody who opens the bench. The packs are 51 rows and are fetched
 * once for the page; a pack's models arrive when its branch is opened and in
 * pages of sixty, because a pack of four hundred is four hundred thumbnails.
 *
 * ---------------------------------------------------------------------------
 * Disclosures rather than an ARIA tree
 * ---------------------------------------------------------------------------
 * `<details>` for the two shelves, because the element already does open, shut,
 * keyboard and the disclosure semantics for free. The packs under them are
 * buttons with `aria-expanded` rather than more `<details>`, because only one
 * may be open at a time: each open branch is up to sixty live thumbnails, and a
 * tree you can leave eight of them open in is a panel that quietly loads two
 * thousand images while somebody looks for a crate.
 */
export function ModelPicker({
  slug,
  onAdd,
  t,
  /**
   * What the section calls itself, and what pressing a tile does.
   *
   * One picker serves every job the bench has - putting a new piece on, swapping
   * the model of the selected one, hanging a wheel, choosing what a weapon
   * fires - because the act is identical: find a model, press it. Copies would
   * be four search boxes that drift apart the first time any of them grows a
   * filter, which is exactly what the tree would have been.
   */
  heading,
}: {
  slug: string
  onAdd: (model: string) => void
  t: WorkspaceDict['thingiverse']
  heading: string
}) {
  const c = t.composer

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ModelHit[] | null>(null)
  const [looking, start] = useTransition()

  const look = () =>
    start(async () => {
      const found = await findParts(slug, query)
      setHits(found)
    })

  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {heading}
      </h2>

      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            look()
          }}
          placeholder={c.searchPieces}
          aria-label={c.searchPieces}
          className="min-w-0 flex-1 rounded-lg border border-line/60 bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-muted"
        />
        <button
          type="button"
          onClick={look}
          disabled={looking}
          className="shrink-0 rounded-lg border border-line/60 px-2.5 py-1.5 text-xs text-ink transition hover:bg-surface-raised disabled:opacity-40"
        >
          {looking ? c.looking : c.look}
        </button>
      </div>

      {hits !== null &&
        (hits.length === 0 ? (
          <p className="text-[11px] text-ink-muted">{fill(c.noPieces, { q: query.trim() })}</p>
        ) : (
          <Tiles hits={hits} onAdd={onAdd} />
        ))}

      <PackTree slug={slug} onAdd={onAdd} t={t} />
    </section>
  )
}

/**
 * The catalogue, folded.
 *
 * Shut on arrival, and that is the one thing it must be: this picker is drawn
 * up to four times down a 22rem column that already holds the pieces, the
 * sockets, the blocking and the seats, and an unfolded tree would push all of
 * them off the screen to answer a question nobody has asked yet.
 *
 * The packs are fetched when it is first opened rather than with the page. Four
 * copies of this component mean four asks, so the promise is shared at module
 * scope - see `packsOnce`.
 */
function PackTree({
  slug,
  onAdd,
  t,
}: {
  slug: string
  onAdd: (model: string) => void
  t: WorkspaceDict['thingiverse']
}) {
  const c = t.composer

  const [packs, setPacks] = useState<ModelPack[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  /**
   * The ask that did not come back.
   *
   * Held rather than thrown: a rejected Server Action inside a transition is
   * handed to the nearest error boundary, which here would replace a composer
   * somebody has unsaved work in with the 500 screen because a pack list did
   * not load. See `attempt` in `@/app/components/connection` for the same
   * argument about the lounge. A branch that answers "try again" is the whole
   * of what this needs to do about it.
   */
  const [failed, setFailed] = useState(false)

  const fetchPacks = () => {
    if (packs) return
    setFailed(false)
    void packsOnce(slug).then(setPacks, () => setFailed(true))
  }

  const rooms = (packs ?? []).filter((pack) => !isXpModel(pack.id))
  const levels = (packs ?? []).filter((pack) => isXpModel(pack.id))

  return (
    <details
      className="group rounded-xl border border-line/60 bg-surface"
      onToggle={(event) => {
        if (event.currentTarget.open) fetchPacks()
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted transition hover:text-ink">
        <span className="font-mono transition group-open:rotate-90">›</span>
        {c.browsePacks}
      </summary>

      <div className="space-y-2 border-t border-line/50 p-2">
        <p className="text-[11px] leading-relaxed text-ink-muted">{c.browseHint}</p>

        {packs === null ? (
          failed ? (
            <button
              type="button"
              onClick={fetchPacks}
              className="w-full rounded-lg border border-line/60 px-2 py-1 text-[11px] text-ink transition hover:bg-surface-raised"
            >
              {c.browseAgain}
            </button>
          ) : (
            <p className="text-[11px] text-ink-muted">{c.looking}</p>
          )
        ) : (
          <>
            {/*
              Two shelves, and the level one shut.

              The same split the workbench draws and for the same reason: the
              world packs furnish a *room* and the level packs furnish a level,
              and until they were labelled the list read "Prototype" twice with
              no way to tell which was which. Forty of the fifty-one are level
              packs, so unfolding both by default would bury the eleven most
              benches are actually made of.
            */}
            <Shelf
              label={c.forRooms}
              packs={rooms}
              slug={slug}
              open={open}
              onOpen={setOpen}
              onAdd={onAdd}
              t={t}
              start
            />
            <Shelf
              label={c.forLevels}
              packs={levels}
              slug={slug}
              open={open}
              onOpen={setOpen}
              onAdd={onAdd}
              t={t}
            />
          </>
        )}
      </div>
    </details>
  )
}

/**
 * The pack list, asked for once per page rather than once per picker.
 *
 * A module-level promise, not a cache with an eviction rule: this is 51 rows
 * that cannot change while the process serving them is running, and the whole
 * of the problem it solves is four pickers on one screen each opening their own
 * round trip for the same answer. Keyed by slug so a second space in the same
 * tab does not read the first one's catalogue.
 */
const packsBySlug = new Map<string, Promise<ModelPack[]>>()

function packsOnce(slug: string): Promise<ModelPack[]> {
  const held = packsBySlug.get(slug)
  if (held) return held

  const asked = listModelPacks(slug).catch((error: unknown) => {
    // A failed ask must not become the answer for the rest of the session:
    // dropping it means the next press tries again, which is what somebody
    // pressing a folded branch a second time is asking for.
    packsBySlug.delete(slug)
    throw error
  })
  packsBySlug.set(slug, asked)
  return asked
}

/**
 * One shelf of packs, each of which opens into its own models.
 *
 * `start` unfolds the room packs, which are the eleven anybody composing a
 * thing for a room is after. The level shelf stays shut until it is asked for.
 */
function Shelf({
  label,
  packs,
  slug,
  open,
  onOpen,
  onAdd,
  t,
  start = false,
}: {
  label: string
  packs: ModelPack[]
  slug: string
  /** Which pack is unfolded, across both shelves. Only ever one. */
  open: string | null
  onOpen: (pack: string | null) => void
  onAdd: (model: string) => void
  t: WorkspaceDict['thingiverse']
  start?: boolean
}) {
  if (packs.length === 0) return null

  return (
    <details open={start} className="group/shelf">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted/70 transition hover:text-ink">
        <span className="font-mono transition group-open/shelf:rotate-90">›</span>
        {label}
        <span className="font-mono normal-case tracking-normal">
          {fill(t.packCount, { n: String(packs.length) })}
        </span>
      </summary>

      <ul className="mt-1 space-y-1">
        {packs.map((pack) => (
          <li key={pack.id}>
            <button
              type="button"
              aria-expanded={open === pack.id}
              onClick={() => onOpen(open === pack.id ? null : pack.id)}
              title={`${pack.label} — ${fill(t.packSize, { n: String(pack.size) })}`}
              className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition ${
                open === pack.id
                  ? 'border-accent/50 bg-accent/10 text-ink'
                  : 'border-line/60 text-ink-muted hover:bg-surface-raised hover:text-ink'
              }`}
            >
              <span
                className={`font-mono text-[10px] transition ${open === pack.id ? 'rotate-90' : ''}`}
              >
                ›
              </span>
              <span className="min-w-0 flex-1 truncate">{pack.label}</span>
              {/*
                A bare number, the way the workbench's chips carry theirs: the
                word "models" is the same on all fifty-one and was the widest
                thing in the row. The title says it in a sentence.
              */}
              <span className="font-mono text-[10px] tabular-nums text-ink-muted">{pack.size}</span>
            </button>

            {open === pack.id && (
              <PackModels slug={slug} pack={pack} onAdd={onAdd} t={t} />
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * The leaves: what is actually in one pack.
 *
 * Paged, because the packs run from twelve models to four hundred and the tile
 * is a thumbnail request. The line above the grid says how much of the pack is
 * drawn, so "show more" is a press with a known end rather than a scroll into
 * the dark.
 */
function PackModels({
  slug,
  pack,
  onAdd,
  t,
}: {
  slug: string
  pack: ModelPack
  onAdd: (model: string) => void
  t: WorkspaceDict['thingiverse']
}) {
  const c = t.composer

  const [hits, setHits] = useState<ModelHit[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, start] = useTransition()
  /** As in the tree above: a branch that will not open says so and retries. */
  const [failed, setFailed] = useState(false)
  /** Bumped by the retry press, which is the only thing that re-runs the ask. */
  const [again, setAgain] = useState(0)

  /**
   * The first page, on opening.
   *
   * This component only exists while its branch is open - shutting it unmounts
   * it, and opening another mounts a fresh one with its own empty page - so
   * "when it appears" and "when the pack was asked for" are the same moment,
   * and the effect has nothing to clean up but a landing it no longer wants.
   */
  useEffect(() => {
    let wanted = true
    void openModelPack(slug, pack.id).then(
      (page) => {
        if (!wanted) return
        setHits(page.hits)
        setTotal(page.total)
      },
      () => {
        if (wanted) setFailed(true)
      },
    )
    return () => {
      wanted = false
    }
  }, [slug, pack.id, again])

  const more = () =>
    start(async () => {
      const page = await openModelPack(slug, pack.id, hits.length).catch(() => null)
      if (!page) {
        setFailed(true)
        return
      }
      setHits((held) => [...held, ...page.hits])
      setTotal(page.total)
    })

  return (
    <div className="mt-1 space-y-1.5 rounded-lg border border-line/50 bg-surface-raised/30 p-1.5">
      {total !== null && (
        <p className="text-[10px] text-ink-muted">
          {fill(t.showing, { shown: String(hits.length), total: String(total) })}
        </p>
      )}

      {hits.length === 0 ? (
        failed ? (
          <button
            type="button"
            onClick={() => {
              setFailed(false)
              setAgain((n) => n + 1)
            }}
            className="w-full rounded-lg border border-line/60 px-2 py-1 text-[11px] text-ink transition hover:bg-surface-raised"
          >
            {c.browseAgain}
          </button>
        ) : (
          <p className="text-[11px] text-ink-muted">{c.looking}</p>
        )
      ) : (
        <Tiles hits={hits} onAdd={onAdd} />
      )}

      {total !== null && hits.length < total && (
        <button
          type="button"
          onClick={more}
          disabled={loading}
          className="w-full rounded-lg border border-line/60 px-2 py-1 text-[11px] text-ink transition hover:bg-surface-raised disabled:opacity-40"
        >
          {loading ? c.looking : c.showMore}
        </button>
      )}
    </div>
  )
}

/**
 * A grid of models to press.
 *
 * One component for both ways in, so a hit from the search box and a leaf of
 * the tree are the same object on screen and do the same thing when pressed -
 * which is the whole of what makes the two ways in one picker rather than two.
 */
function Tiles({ hits, onAdd }: { hits: ModelHit[]; onAdd: (model: string) => void }) {
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {hits.map((hit) => (
        <li key={hit.id}>
          <button
            type="button"
            onClick={() => onAdd(hit.id)}
            title={hit.id}
            className="w-full rounded-lg border border-line/60 bg-surface p-1 transition hover:border-accent/50 hover:bg-surface-raised"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailFor(hit.id)}
              alt=""
              loading="lazy"
              className="aspect-square w-full rounded bg-surface-raised object-contain"
            />
            <span className="mt-1 block truncate text-[10px] text-ink-muted">{hit.label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
