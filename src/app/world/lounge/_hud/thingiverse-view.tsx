'use client'

import { useMemo, useState } from 'react'
import type { WorldDict } from '@/app/i18n/world'
import { fill } from '@/app/i18n/fill'
import {
  MODEL_COUNT,
  MODEL_PACKS,
  type ModelHit,
  searchModels,
  thumbnailFor,
} from '@/domain/thingiverse/models'
import { CoinPrice } from '@/app/components/coin-price'
import { priceOfThing } from '@/domain/thingiverse/blueprint'
import type { BlueprintView } from '@/domain/thingiverse/queries'
import type { SummonMatch } from '@/domain/thingiverse/summon'

/**
 * The thingiverse, opened over the room.
 *
 * `/xo` with a word after it hands you that thing. `/xo` on its own opens this:
 * the same browsing the page at /t/[slug]/thingiverse offers, drawn *over* the
 * world rather than instead of it.
 *
 * ---------------------------------------------------------------------------
 * Why the page was not enough
 * ---------------------------------------------------------------------------
 * The page is a good place to decide what a thing *is* - nine fields, a grid of
 * thumbnails, room to read. It is a terrible place to decide where a thing
 * goes, because getting to it means leaving the room, and coming back means a
 * fresh scene, a fresh spawn and having lost the corner you were standing in.
 *
 * So this is the same catalogue with one button on every tile, and the button
 * does the whole job: picking a model hands it to you as the ghost under your
 * crosshair, and putting it down draws the blueprint and summons it in one go
 * (see `summonModel`). Nobody has to make a blueprint first, and nobody has to
 * go anywhere.
 *
 * ---------------------------------------------------------------------------
 * Why the search is client-side
 * ---------------------------------------------------------------------------
 * `CATALOGUE` is 1,308 entries of `pack/name` compiled into the bundle, and the
 * builder's own picker already searches it in the browser. A round trip per
 * keystroke to filter a list that is *already here* would be slower and would
 * also mean a Server Action firing while a canvas is running - which this scene
 * is written throughout to avoid.
 *
 * ---------------------------------------------------------------------------
 * It wears the room's own chrome
 * ---------------------------------------------------------------------------
 * This was a black box with a white hairline round it, drawn over a world whose
 * every other panel - the controls, the blocks, the entry gate - is `.hud-panel`
 * glass inside a fuchsia-to-cyan wire. One surface in the system's default
 * dialogue reads as a browser dialog that happens to be open on top of the
 * game, which is the one thing a panel drawn *inside* a room must not look
 * like. The classes are the ones already in globals.css; nothing new is
 * invented here.
 *
 * ---------------------------------------------------------------------------
 * And it says what a summon costs
 * ---------------------------------------------------------------------------
 * The rail's summon button has carried `priceOfThing(spec)` since blueprints
 * could be priced. This panel summons the *same* blueprints, by the same
 * action, and said nothing - so the one number that is a promise depended on
 * which of two controls you happened to reach for. It is the shelf entries
 * only, and that is not a gap: picking a raw model draws a fresh blueprint with
 * `freshSpec`, which carries no price, so there is nothing to charge and
 * `CoinPrice` correctly draws nothing - unless the space is past the blueprint
 * allowance its plan includes, in which case drawing one is what costs, and
 * `newPrice` is that number on every tile in the pack sections.
 */

/**
 * What a dragged tile carries.
 *
 * A custom MIME type rather than `text/plain`, so a model dropped into a chat
 * box or an address bar does nothing at all instead of pasting `park/bench` -
 * and so the scene can tell a dragged *thing* from a dragged file without
 * guessing at the contents.
 */
export const THING_DRAG = 'application/x-kxb-model'

/**
 * How many tiles to draw.
 *
 * Fewer than the page's 120, and the reason is what is behind them: this is a
 * panel over a live WebGL context, and every tile is a thumbnail request that
 * competes with the world for bandwidth while somebody is standing in it. Forty
 * is two or three scrolls, which is as far as anybody reads before narrowing.
 */
const TILES = 40

export function ThingiverseView({
  shelf,
  newPrice = 0,
  dict,
  onSummon,
  onClose,
}: {
  shelf: readonly BlueprintView[]
  /**
   * What drawing a *new* blueprint costs, which is what picking a raw model
   * does. Zero when the plan still has room, and zero in every space with the
   * economy off - see `nextPrice`, which is the one place that decides it and
   * which `drawBlueprint` charges from, so the number on the tile and the
   * number taken out of the purse cannot disagree.
   */
  newPrice?: number
  dict: WorldDict['things']
  /** Stand one up. The caller closes this - see `summon`. */
  onSummon: (match: SummonMatch) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  /**
   * The results, grouped by the pack they came out of.
   *
   * There was a row of chips here, one per pack, and it worked while there were
   * eleven of them. The level catalogue took it to fifty-three: four rows of
   * identical pills above the grid, over a live world, that nobody could scan
   * and nobody would read twice.
   *
   * So the filter is the search box - which already matches a pack's name, so
   * "adventurers" narrows to that pack - and the packs come back as *headings*
   * over the results. You learn the catalogue by searching it rather than by
   * reading a wall of its table of contents. Browsing the packs properly is
   * what the page at /t/[slug]/thingiverse is for; this panel is for getting a
   * thing while standing in a room.
   */
  const groups = useMemo(() => {
    if (query.trim() === '') return []

    const out = new Map<string, ModelHit[]>()
    for (const hit of searchModels(query).slice(0, TILES)) {
      const list = out.get(hit.packId) ?? []
      list.push(hit)
      out.set(hit.packId, list)
    }
    return [...out]
  }, [query])

  const matching = (entry: BlueprintView) =>
    query.trim() === '' ||
    `${entry.name} ${entry.spec.model}`.toLowerCase().includes(query.trim().toLowerCase())

  const mine = shelf.filter((entry) => entry.mine && matching(entry))
  const shared = shelf.filter((entry) => !entry.mine && matching(entry))

  const asMatch = (entry: BlueprintView): SummonMatch => ({
    kind: 'blueprint',
    id: entry.id,
    name: entry.name,
    model: entry.spec.model,
    mine: entry.mine,
  })

  /**
   * What Enter takes.
   *
   * The space's own things before the packs', which is the same order
   * `resolveSummon` ranks a typed word in - somebody who has made a lamp and
   * types "lamp" means theirs. It is the whole reason the search box is worth
   * having a keyboard path through: type three letters, press Enter, the thing
   * is in the room.
   */
  const first: SummonMatch | null =
    mine[0] !== undefined
      ? asMatch(mine[0])
      : shared[0] !== undefined
        ? asMatch(shared[0])
        : groups[0]?.[1][0] !== undefined
          ? { kind: 'model', model: groups[0][1][0].id, name: groups[0][1][0].label }
          : null

  const nothing = query.trim() !== '' && !first

  return (
    <div className="hud-panel hud-panel-enter pointer-events-auto absolute inset-x-2 bottom-4 top-16 mx-auto flex max-w-3xl flex-col p-3 text-[var(--color-ink)] sm:inset-x-8">
      <div className="mb-1.5 flex items-center gap-3">
        {/* The panel's name, in the face and the colour every other title in
            this room is drawn in - see the heading on the controls dialog. The
            glow is the same one, at the smaller size this row can carry. */}
        <span className="font-pixel shrink-0 text-xs uppercase tracking-[0.1em] text-[var(--color-accent)] [text-shadow:0_0_1rem_oklch(0.7_0.27_322/0.6)]">
          {dict.browse}
        </span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !first) return
            event.preventDefault()
            onSummon(first)
          }}
          placeholder={dict.searchPacks}
          aria-label={dict.searchPacks}
          className="min-w-0 flex-1 rounded-full border border-[oklch(0.66_0.16_275_/_0.45)] bg-[oklch(0.12_0.04_285_/_0.72)] px-3 py-1 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={onClose}
          className="hud-chip shrink-0 !py-1 text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {dict.cancel}
        </button>
      </div>

      {/*
        What picking one does, said once.

        The panel used to hand you a ghost to carry; it now stands the thing up
        in front of you, and nothing on screen said so. One line under the
        search is where somebody reads it without being taught.
      */}
      {/*
        What picking one does, and what it costs, in one line above the grid.

        The price is *not* on each tile, which is a deliberate exception to the
        rule `CoinPrice` states - put it on the control that spends it. That
        rule is about a number that differs per control, and this one does not:
        every model in every pack draws the same new blueprint against the same
        allowance, so on forty tiles it is the same figure forty times, and a
        number repeated forty times stops being read. Worse, it drowns the
        shelf's prices directly above, which *do* differ per thing and are the
        ones somebody has to compare.

        So: once, in the sentence that already explains what a press does, over
        the grid it applies to. The shelf keeps its per-item prices on its
        tiles, where they belong.
      */}
      <p className="mb-2 flex items-baseline gap-1 text-[10px] text-[var(--color-ink-muted)]">
        <span>{dict.browseHint}</span>
        {newPrice > 0 && (
          <span className="text-[var(--color-ink)]">
            {dict.drawCosts}
            <CoinPrice coins={newPrice} />
          </span>
        )}
      </p>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        {mine.length > 0 && (
          <Group label={dict.yours}>
            {mine.map((entry) => (
              <Tile
                key={entry.id}
                model={entry.spec.model}
                label={entry.name}
                price={priceOfThing(entry.spec)}
                onPick={() => onSummon(asMatch(entry))}
              />
            ))}
          </Group>
        )}

        {shared.length > 0 && (
          <Group label={dict.shared}>
            {shared.map((entry) => (
              <Tile
                key={entry.id}
                model={entry.spec.model}
                label={entry.name}
                price={priceOfThing(entry.spec)}
                onPick={() => onSummon(asMatch(entry))}
              />
            ))}
          </Group>
        )}

        {groups.map(([packId, hits]) => (
          <Group key={packId} label={packLabel(packId)}>
            {hits.map((hit) => (
              <Tile
                key={hit.id}
                model={hit.id}
                label={hit.label}
                onPick={() => onSummon({ kind: 'model', model: hit.id, name: hit.label })}
              />
            ))}
          </Group>
        ))}

        {nothing && (
          <p className="py-8 text-center text-xs text-[var(--color-ink-muted)]">
            {dict.nothingFound}
          </p>
        )}

        {/*
          The empty state, which is a *number*.

          Not "nothing here" - there are five thousand things here, and saying
          how many is the one line that turns a search box into an invitation.
          It sits under the shelf rather than instead of it, so the first screen
          is this space's own things and then the size of what is behind them.
        */}
        {query.trim() === '' && (
          <p className="py-6 text-center text-xs text-[var(--color-ink-muted)]">
            {fill(dict.catalogue, {
              models: MODEL_COUNT.toLocaleString(),
              packs: String(MODEL_PACKS.length),
            })}
          </p>
        )}
      </div>
    </div>
  )
}

/** A pack's own name, or its id if it is one we no longer ship. */
function packLabel(packId: string): string {
  return MODEL_PACKS.find((pack) => pack.id === packId)?.label ?? packId
}

/**
 * One band of results under the name of where they came from.
 *
 * A heading rather than a chip: it tells you which pack a thing is from at the
 * moment you are looking at the thing, which is when it is worth knowing.
 */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      {/*
        A chip rather than a bar, and cyan rather than grey.

        Cyan is the split the whole room makes: fuchsia is the thing you press,
        cyan is the thing you read. The chip is about the ground underneath. A
        sticky heading needs one - tiles scrolling under transparent text are
        unreadable - and a full-width strip of any single colour is wrong here
        for the reason the block picker's own note gives: `.hud-panel`'s fill is
        a gradient over a translucent glass, so a bar matched to it at one
        height reads as a hole cut in it at every other. A pill is only as wide
        as the word, so there is no strip to mismatch, and `.hud-chip` is the
        shape this room already uses for a small standing label.
      */}
      <h3 className="hud-chip font-pixel sticky top-0 z-10 mb-1.5 w-fit !py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-accent-2)]">
        {label}
      </h3>
      <ul className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-5">{children}</ul>
    </section>
  )
}

/**
 * One thing you can put in the room.
 *
 * The same tile whether it came off the shelf or out of a pack. It was two
 * different controls - a chip with a tiny picture for the shelf, a tile for the
 * models - which is two vocabularies for one act, and the surface reads as two
 * lists that happen to be stacked rather than one answer to one question.
 */
function Tile({
  model,
  label,
  price = 0,
  onPick,
}: {
  model: string
  label: string
  /**
   * What pressing this costs, if anything. Zero for a raw catalogue model,
   * which is honest rather than defaulted: nothing is charged for one.
   */
  price?: number
  onPick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        title={label}
        /*
          And it can be dragged into the world instead of clicked - see
          `THING_DRAG`. The same end reached the way somebody expects to reach
          it when a panel of pictures is open beside a room.
        */
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(THING_DRAG, model)
          event.dataTransfer.effectAllowed = 'copy'
        }}
        /*
          The lit outline the keycaps wear, at tile size: cyan at rest, fuchsia
          under the pointer, which is what fuchsia means everywhere else in this
          room. `.hud-chip`'s hover rule, drawn on a square.
        */
        className="w-full rounded-lg border border-[oklch(0.66_0.16_275_/_0.45)] bg-[oklch(0.12_0.04_285_/_0.6)] p-1.5 text-left transition hover:border-[var(--color-accent)] hover:bg-[oklch(0.2_0.07_300_/_0.7)] hover:shadow-[0_0_1rem_oklch(0.7_0.27_322_/_0.3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailFor(model)}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-square w-full rounded bg-white/5 object-contain"
        />
        <span className="mt-1 flex items-baseline justify-between gap-1">
          <span className="min-w-0 text-[10px] leading-tight text-[var(--color-ink-muted)] line-clamp-2">
            {label}
          </span>
          {/* Nothing at all when it is free - see `CoinPrice`. */}
          <CoinPrice coins={price} />
        </span>
      </button>
    </li>
  )
}
