'use client'

import { useMemo, useState } from 'react'
import {
  type CatalogueTile,
  findModel,
  packPreview,
  packSize,
  searchTiles,
  tileOf,
  VARIANT_COLOURS,
  type VariantColour,
} from '@kxb/xp/catalogue'
import { PACK_ORDER, PACKS, thumbnailUrl } from '@kxb/xp/packs'
import { usePackScope } from '@/app/xp/_editor/panels/pack-scope'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { Hint } from '@/app/xp/_editor/chrome'

/**
 * Choosing what to place.
 *
 * A search box over a grid rather than a tree, tabs or a dropdown - because the
 * whole list fits on screen and scrolling it is worse than typing two letters.
 *
 * That premise was written at 86 models and the catalogue now holds 3,892
 * across 31 packs, which the premise plainly does not survive. It has been
 * answered twice, in the order the problem arrived:
 *
 *   - At 611, by collapsing colour: 525 of them were the platformer kit's 155
 *     shapes in up to five coats, so `searchTiles` makes a variant set one
 *     tile and colour a control on the panel rather than a folder to be in.
 *     See `catalogue.ts` for why that stays four model ids rather than
 *     becoming a placement property.
 *   - At 3,892, by drawing only the packs the *document* is built out of.
 *     Twenty-four kits landed at once, and no amount of collapsing makes a
 *     dungeon, a board game and eight forest colourways one list worth
 *     scrolling.
 *
 * The second answer was a row of switches on this panel for about an hour, and
 * `packs[]` is the better place for the same list for a reason that is not
 * taste: the format already had the field, the parser already refused a model
 * from a pack the document does not list, and nothing ever wrote to it - so a
 * level with one dungeon pillar in it did not re-open. A personal preference
 * would have left that bug sitting under a panel that looked like it was about
 * the same thing. See `PackBrowser`, and `declaring` in `@kxb/xp/edit`.
 *
 * It is also why there is still no tree here. A pack the document is not made
 * of costs nothing, where a folder you have to open costs a click every time.
 *
 * `GROUP_CAP` is the backstop under both - what a group draws before it stops
 * and tells you to narrow the search.
 *
 * The tiles are the checked-in thumbnails, which is the reason the picker opens
 * instantly. The alternative - and what the world builder used to do - is
 * downloading and parsing a glTF per tile as it scrolls into view, next to the
 * editor's own WebGL context.
 *
 * The size under each name is doing real work rather than decorating: every
 * tile is fitted to its frame, so `Primitive_Wall` and `Primitive_Wall_Half`
 * draw identically and only the number tells them apart. A picker that shows
 * two tiles that look the same and behave differently is the worst thing a
 * picker can do. It is also why the tile-size control has a floor: shrink the
 * grid far enough and the number goes, which is the one thing that must not.
 *
 * ---------------------------------------------------------------------------
 * A tile is also a thing you can drag
 * ---------------------------------------------------------------------------
 * Clicking still selects the brush, which is what you want for laying a floor.
 * Dragging one into the viewport puts a single piece exactly where you let go,
 * which is what you want for a crate against a wall - and the two gestures do
 * not compete, because a click and a drag are already different gestures
 * everywhere else.
 *
 * The model id goes into the drag as plain text under our own MIME type. Not
 * `text/plain`: a drag carrying that is a drag every text field on the page
 * offers to accept, so dropping a wall into the search box above would type its
 * id into it.
 */

/** What a dragged tile carries. Ours, so nothing else offers to take it. */
export const MODEL_DRAG = 'application/x-xp-model'

/**
 * How many tiles fit across, per step of the size control.
 *
 * Columns rather than pixels because the panel is dockable and its width is the
 * user's: a tile in fixed pixels is one that stops fitting the moment the panel
 * is dragged narrower.
 */
const SIZES = [
  { label: 'L', columns: 2 },
  { label: 'M', columns: 3 },
  { label: 'S', columns: 4 },
  { label: 'XS', columns: 6 },
] as const

const COLUMN_CLASS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  6: 'grid-cols-6',
}

/** The swatch colours, only for the dot. The art is the truth; this is a hint. */
const SWATCH: Record<VariantColour, string> = {
  neutral: 'bg-neutral-400',
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  red: 'bg-rose-500',
  yellow: 'bg-amber-400',
}

/**
 * How many tiles one group draws before it stops and says how many are left.
 *
 * The panel's premise - a grid you scroll, no tree - was written at 86 models
 * and survived 611 by collapsing colour variants. It does not survive 3,892:
 * every tile is an `<img>`, and a search box that puts four thousand of them
 * into the DOM on the first keystroke is a search box that stutters before it
 * has shown you anything.
 *
 * Still needed once the grid is only the document's own packs, because one of
 * those packs can be the dungeon kit's 283 or the board game's 243 on its own.
 *
 * A cap rather than virtual scrolling because the cap is also the honest
 * answer to the question. Nobody reads the 243rd board game piece; they narrow
 * the search, and the line under the group says so.
 *
 * **The tell arrived, and it was not scrolling.** It was "narrow the search to
 * what?" - the line assumed somebody knows what the hidden seventy are called,
 * and the whole reason to be looking through a picker is that you do not. A
 * search is how you find a thing you can name; a list is how you find a thing
 * you would recognise. So the cap is now a *fold* rather than a wall: it still
 * decides what a group opens at, and the rest is one press away.
 *
 * Still not windowing. A group is one pack the document is built out of, so the
 * largest thing this can unfold is the dungeon kit's 283 checked-in thumbnails
 * - a static image each, next to a WebGL context that is drawing the level.
 */
const GROUP_CAP = 48

/**
 * Whether the picker is folded away, remembered between visits.
 *
 * Not in the document: which panels somebody has open is a fact about how they
 * like to work, not about the level, and writing it into the XP would mean two
 * people opening the same level disagreeing about what it says.
 */
const OPEN_KEY = 'xp:picker:open'

/**
 * Read in the state initialiser rather than in an effect.
 *
 * Only safe because the editor never renders on the server - see the note on
 * the dynamic import in ./client, and the identical note on `restore` in
 * ./editor. The other two shapes are both worse: reading `localStorage` during
 * a server render is a crash, and reading it in an effect and calling
 * `setState` is a second render with different content, which React now refuses
 * outright and eslint catches here.
 *
 * Open unless it was explicitly shut. A missing key is somebody who has never
 * touched this, and hiding the model grid from them is the one failure worth
 * avoiding.
 */
function wasOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== 'shut'
  } catch {
    // Private mode. Open is the default anyway.
    return true
  }
}

export function Picker({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  const t = xpEditorDict(useLocale()).picker
  const [query, setQuery] = useState('')
  const [size, setSize] = useState(1)
  const [settings, setSettings] = useState(false)
  const [chosen, setColour] = useState<VariantColour | null>(null)
  /**
   * Which groups are showing everything they have.
   *
   * By pack id rather than by position, so unfolding the dungeon kit and then
   * typing two letters does not leave whichever group lands third unfolded. It
   * survives the search deliberately: somebody who opened a pack to look
   * through it, searched, and cleared the search is still looking through that
   * pack.
   */
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  /**
   * The pack list starts shut.
   *
   * Adding a pack is something you do once and then build for an hour, and the
   * grid is what you came here for - so the browser is a drawer rather than a
   * second panel competing with the models for the same three hundred pixels.
   * The line on the button carries the only number that matters while it is
   * shut: how many of the thirty-one this level is made of.
   */
  const [browsing, setBrowsing] = useState(false)

  const scope = usePackScope()
  const declared = useMemo(() => new Set(scope.declared), [scope.declared])

  /**
   * Opening a document that is already blue should show blue tiles - so until
   * somebody says otherwise, the colour follows whatever the brush is holding.
   *
   * Derived rather than synchronised in an effect: an effect that copies the
   * held model into state is a second render for something this render already
   * knows, and it also loses the "somebody said otherwise" distinction - once
   * `chosen` is set it wins, including over a neutral piece that has no colour
   * to offer.
   */
  const colour = chosen ?? tileOf(value)?.colour ?? 'neutral'

  const groups = useMemo(() => searchTiles(query, colour, declared), [query, colour, declared])
  const total = useMemo(() => groups.reduce((sum, g) => sum + g.tiles.length, 0), [groups])

  /**
   * Folded away, because most of an editing session is not picking a model.
   *
   * Reported as *"make the model picker collapsable, because it sometimes takes
   * much space when u just wanna edit"*, and the numbers agree: the grid is
   * capped at 288 pixels of scroll and there is a search box, a settings row, a
   * pack drawer and a swatch strip above it, which is most of a panel for a
   * thing you touch once and then build with for an hour.
   *
   * Remembered between visits rather than reset per mount. Somebody who folded
   * this away has said what they want their editor to look like, and a panel
   * that re-opens every reload is one they have to fold away every reload.
   */
  const [open, setOpen] = useState(wasOpen)

  const fold = (next: boolean) => {
    setOpen(next)
    try {
      window.localStorage.setItem(OPEN_KEY, next ? 'open' : 'shut')
    } catch {
      // Quota, private mode. Not worth interrupting anybody over.
    }
  }

  /**
   * What the brush is holding, which is the one thing a shut picker must say.
   *
   * A collapsed picker that showed only the word "Models" would hide the fact
   * that clicking the floor is about to place a barrel - and the brush is a
   * thing you set in here and then use out there, so the header is the only
   * place left that knows.
   */
  const held = findModel(value)

  return (
    <div>
      <button
        type="button"
        onClick={() => fold(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded border border-neutral-800 px-1.5 py-1 text-left transition-colors hover:border-neutral-600"
      >
        <span
          aria-hidden
          className={`font-mono text-[10px] text-neutral-500 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ›
        </span>
        {held ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl(held.id)}
            alt=""
            className="size-5 shrink-0 rounded bg-neutral-900 object-contain"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-400">
          {held ? held.label : t.models}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-neutral-600">
          {open ? t.hide : t.pick}
        </span>
      </button>

      {!open ? null : (
      <div className="mt-1.5">
      <div className="flex items-center gap-1">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
          // Not a `type="search"`: the browser's clear button sits where the
          // count goes and the escape-to-clear behaviour swallows a key the
          // editor wants.
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setSettings((open) => !open)}
          title={t.settings}
          aria-expanded={settings}
          className={`rounded border px-1.5 py-1.5 text-[10px] leading-none transition-colors ${
            settings
              ? 'border-violet-500 bg-violet-500/15 text-neutral-200'
              : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
          }`}
        >
          {/* Three sliders, hand-drawn: the repo has no icon set to be
              consistent with, and one glyph does not earn a dependency. */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M1 3h10M1 6h10M1 9h10" stroke="currentColor" strokeWidth="1" />
            <circle cx="4" cy="3" r="1.4" fill="currentColor" />
            <circle cx="8" cy="6" r="1.4" fill="currentColor" />
            <circle cx="3" cy="9" r="1.4" fill="currentColor" />
          </svg>
        </button>
      </div>

      {settings ? (
        <div className="mt-1.5 rounded border border-neutral-800 bg-neutral-900/40 p-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">Tiles</p>
          <div className="mt-1 flex gap-1">
            {SIZES.map((step, index) => (
              <button
                key={step.label}
                type="button"
                onClick={() => setSize(index)}
                className={`flex-1 rounded border px-1 py-0.5 font-mono text-[10px] transition-colors ${
                  size === index
                    ? 'border-violet-500 bg-violet-500/15 text-neutral-200'
                    : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
                }`}
              >
                {step.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/*
        The drawer, between the search and the grid: what the panel is *made
        of* sits above what is in it, and the button says how much of the
        catalogue that currently is.
      */}
      <button
        type="button"
        onClick={() => setBrowsing((open) => !open)}
        aria-expanded={browsing}
        className="mt-1.5 flex w-full items-center gap-1.5 rounded border border-neutral-800 px-1.5 py-1 text-left font-mono text-[10px] text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300"
      >
        <span aria-hidden className={`transition-transform ${browsing ? 'rotate-90' : ''}`}>
          ›
        </span>
        <span className="flex-1">{t.packs}</span>
        <span className="text-neutral-600">
          {fill(t.packsCount, { n: scope.declared.length, of: PACK_ORDER.length })}
        </span>
      </button>

      {browsing ? <PackBrowser onChange={onChange} /> : null}

      <div className="mt-1 flex items-center justify-between gap-2">
        {/*
          The count says why it is empty, not just that it is. "Nothing
          matches" over a document that is built out of one pack sends people
          to re-type a search that was never the problem.
        */}
        <Hint className="leading-tight">
          {scope.declared.length === 0
            ? t.noPacks
            : total === 0
              ? t.nothingMatches
              : fill(t.tiles, { n: total })}
        </Hint>
        {/*
          The colour the platformer tiles show. A preference for the panel, not
          a filter: picking red does not hide the spikes, which have no red.
        */}
        <div className="flex items-center gap-1">
          {VARIANT_COLOURS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setColour(option)}
              title={fill(t.showInColour, { colour: option })}
              aria-pressed={colour === option}
              className={`h-3 w-3 rounded-full ring-offset-1 ring-offset-neutral-950 transition-shadow ${SWATCH[option]} ${
                colour === option ? 'ring-2 ring-violet-400' : 'ring-1 ring-neutral-700'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 max-h-72 overflow-y-auto pr-1">
        {groups.map((group) => {
          const all = opened.has(group.packId)
          const cap = all ? group.tiles.length : GROUP_CAP
          const rest = group.tiles.length - GROUP_CAP
          return (
          <div key={group.packId} className="mb-3">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
              {group.label}
            </p>
            <ul className={`grid gap-1.5 ${COLUMN_CLASS[SIZES[size].columns]}`}>
              {group.tiles.slice(0, cap).map((tile) => (
                <li key={tile.key}>
                  <Tile
                    tile={tile}
                    value={value}
                    compact={SIZES[size].columns > 3}
                    onChange={onChange}
                    onColour={setColour}
                  />
                </li>
              ))}
            </ul>
            {/*
              A press rather than a sentence. "Narrow the search" is advice you
              can only take if you already know what the hidden ones are called,
              and looking through a picker is what somebody does when they do
              not - so the group opens instead, and shuts again the same way.
            */}
            {rest > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setOpened((was) => {
                    const next = new Set(was)
                    if (all) next.delete(group.packId)
                    else next.add(group.packId)
                    return next
                  })
                }
                className="mt-1 font-mono text-[10px] leading-tight text-neutral-500 underline-offset-4 hover:text-violet-300 hover:underline"
              >
                {all ? fill(t.showFirst, { n: GROUP_CAP }) : fill(t.showAll, { n: rest })}
              </button>
            ) : null}
          </div>
          )
        })}
      </div>
      </div>
      )}
    </div>
  )
}

/**
 * Every pack we ship, and whether this document is built out of it.
 *
 * ---------------------------------------------------------------------------
 * Adding a pack is a document edit, not a panel setting
 * ---------------------------------------------------------------------------
 * Which is the whole reason this replaced the switches that were here first.
 * The format already had `packs[]`, the parser already refused a model from a
 * pack the document does not list, and nothing ever wrote to it - so a level
 * with a dungeon pillar in it was a level that would not re-open. The panel
 * that decides what you can place and the list the document carries were
 * always the same question; this makes them the same control.
 *
 * What it buys beyond the fix: the list travels. Open somebody's level and the
 * picker is already narrowed to the four kits they built it out of, with no
 * setting of your own to arrive at that.
 *
 * ---------------------------------------------------------------------------
 * The strip of four
 * ---------------------------------------------------------------------------
 * A name is not enough to choose a kit by - "Resources" and "Tools" are the
 * same sentence to anybody who has not opened them - and a pack of 283 models
 * cannot be previewed by one picture either. Four spread across it says what
 * the art *looks like*, which is the actual question. They are the same
 * checked-in thumbnails the grid draws, so this costs four `<img>` per row and
 * no parsing.
 */
function PackBrowser({ onChange }: { onChange: (model: string) => void }) {
  const t = xpEditorDict(useLocale()).picker
  const scope = usePackScope()
  const declared = new Set(scope.declared)

  return (
    <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded border border-neutral-800 bg-neutral-900/40 p-1.5">
      {PACK_ORDER.map((packId) => {
        const on = declared.has(packId)
        const used = on ? scope.use(packId) : 0
        return (
          <li key={packId} className="rounded border border-neutral-800/80 p-1">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-300">
                {PACKS[packId].label}
              </span>
              <span className="font-mono text-[10px] text-neutral-600">{packSize(packId)}</span>
              {/*
                One button that says what it will do, rather than a checkbox
                that hides why it will not. A pack forty of your walls are made
                of cannot be dropped, and the honest way to say so is to put
                the count where the control was - `removePack` refuses it
                anyway, and a button that silently does nothing is worse than
                no button.
              */}
              {on && used > 0 ? (
                <span
                  title={fill(t.usedBy, { n: used })}
                  className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[10px] text-neutral-500"
                >
                  {t.inUse} {used}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={on ? !scope.remove : !scope.add}
                  onClick={() => (on ? scope.remove?.(packId) : scope.add?.(packId))}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors disabled:opacity-40 ${
                    on
                      ? 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300'
                      : 'border-violet-500/60 text-violet-300 hover:border-violet-400 hover:bg-violet-500/15'
                  }`}
                >
                  {on ? t.remove : t.add}
                </button>
              )}
            </div>

            {/*
              Clicking a preview both adds the pack and takes the brush, which
              is the gesture people actually make: you are looking at a barrel
              because you want the barrel, not because you want to administer a
              list and then find it again in the grid.
            */}
            <div className="mt-1 flex gap-1">
              {packPreview(packId).map((model) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => {
                    if (!on) scope.add?.(packId)
                    onChange(model)
                  }}
                  title={on ? t.holdThis : fill(t.addAndHold, { pack: PACKS[packId].label })}
                  className={`aspect-square min-w-0 flex-1 rounded border transition-colors ${
                    on ? 'border-neutral-800' : 'border-neutral-800/60 opacity-60 hover:opacity-100'
                  } hover:border-neutral-600`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a
                      checked-in thumbnail, already the size it is drawn at. */}
                  <img
                    src={thumbnailUrl(model)}
                    alt=""
                    width={192}
                    height={192}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * One tile: the shape, and the colours it comes in.
 *
 * The swatches sit *under* the thumbnail rather than over it, because a dot on
 * a picture is a dot on the thing you are trying to look at - and the whole
 * reason the tile shows a picture is that the name does not say what it looks
 * like. A tile with one colour draws no swatches at all: a row of one control
 * is a control that suggests there is a choice.
 */
function Tile({
  tile,
  value,
  compact,
  onChange,
  onColour,
}: {
  tile: CatalogueTile
  value: string
  compact: boolean
  onChange: (model: string) => void
  onColour: (colour: VariantColour) => void
}) {
  const { entry } = tile
  // Held, whichever colour of this shape is in hand - so switching the swatch
  // does not make the tile you are working with look unselected.
  const held = tile.colours.length > 0 ? tileOf(value)?.key === tile.key : value === entry.id

  return (
    <div
      className={`rounded border p-1 transition-colors ${
        held ? 'border-violet-500 bg-violet-500/15' : 'border-neutral-800 hover:border-neutral-600'
      }`}
    >
      <button
        type="button"
        onClick={() => onChange(entry.id)}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(MODEL_DRAG, entry.id)
          // `copy` rather than `move`: the catalogue still has the model
          // afterwards, and the cursor is the only thing that says which of the
          // two this is.
          event.dataTransfer.effectAllowed = 'copy'
          /**
           * The brush follows the drag.
           *
           * A drag that ends outside the viewport does nothing, and without this
           * it would also have left the picker showing one model selected while
           * the tools still held another. Picking a thing up is choosing it.
           */
          onChange(entry.id)
        }}
        title={`${entry.label} — ${entry.size.w} × ${entry.size.h} × ${entry.size.d} · drag into the level`}
        className="w-full"
      >
        <div className="aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element -- a
              checked-in thumbnail, already the size it is drawn at. */}
          <img
            src={thumbnailUrl(entry.id)}
            alt={entry.label}
            width={192}
            height={192}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        </div>
        {/*
          The name goes when the tiles get small; the measurement never does.
          Two tiles that draw identically and behave differently are told apart
          by the number, so it is the last thing on the tile to survive.
        */}
        {compact ? null : (
          <p className="truncate text-[10px] leading-tight text-neutral-400">{entry.label}</p>
        )}
        <Hint className="truncate leading-tight">{entry.size.w}×{entry.size.h}×{entry.size.d}</Hint>
      </button>

      {tile.colours.length > 1 ? (
        <div className="mt-1 flex flex-wrap justify-center gap-0.5">
          {tile.colours.map((option) => {
            const id = tile.ids[option]!
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onColour(option)
                  onChange(id)
                }}
                title={`${entry.label} · ${option}`}
                aria-pressed={value === id}
                className={`h-2 w-2 rounded-full ${SWATCH[option]} ${
                  value === id ? 'ring-1 ring-violet-300' : 'opacity-60 hover:opacity-100'
                }`}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
