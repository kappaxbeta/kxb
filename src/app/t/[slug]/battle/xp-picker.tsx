'use client'

import { useMemo, useState } from 'react'
import { CartridgeSheet } from '@/app/components/cartridge/sheet'
import { CartridgeShelf } from '@/app/components/cartridge/shelf'
import type { ShelfItem } from '@/app/components/cartridge/cartridge'
import { fill } from '@/app/i18n/fill'
import type { BattleDict } from '@/app/i18n/battle'
import type { XpChoice } from '@/app/t/[slug]/battle/summon-wizard'

/**
 * Finding a level rather than scrolling to it.
 *
 * Two hundred lines out of `summon-wizard.tsx`, and with them the four pieces of
 * state nothing else in that file read - the search text, which list is showing,
 * how many cards are down, and whether the grid has been opened up.
 *
 * The picker was every level a space can reach in one grid, capped with a
 * sentence pointing at Browse for the rest. Fine for four and unusable for
 * forty: the thing somebody is looking for is a *particular* level they made,
 * and a wall of cards is the worst way to answer a question they could have
 * typed three letters of.
 *
 * **Filtered here rather than re-queried.** The list is already loaded and
 * already bounded, so a round trip per keystroke would be slower *and* would
 * make the cap visible again somewhere new.
 */

/**
 * How many more cards a press of *Show more* adds.
 *
 * Twelve is two full rows on a wide screen and six on a narrow one, so the
 * button always produces a visible amount of new list rather than one orphan
 * card at the bottom.
 */
const XP_PAGE = 12

/**
 * Which lists the wizard offers, and in which order.
 *
 * `yours` is the default and is three things at once - the shelf, the levels we
 * ship, and anything this space saved. That grouping is the point: those are
 * all levels the space has *some* claim on, and they were previously mixed into
 * one grid with the entire store, where a space's own shelf had no standing at
 * all in the surface that matters most.
 *
 * The store is its own tab rather than part of the default, because picking
 * from it is not the same act. Everything else here can simply be played; a
 * store level has to be taken in or put out first, and the card says so.
 */
export type XpFilter = 'yours' | 'magazine' | 'builtin' | 'space' | 'store'

export function filtersFor(xps: readonly XpChoice[]): readonly XpFilter[] {
  const has = (source: XpChoice['source']) => xps.some((xp) => xp.source === source)

  return [
    'yours' as const,
    ...(xps.some((xp) => xp.shelved) ? (['magazine'] as const) : []),
    ...(has('builtin') ? (['builtin'] as const) : []),
    // Only when the space has one. A filter that can only ever return nothing
    // is a control that teaches somebody the picker is broken.
    ...(has('space') ? (['space'] as const) : []),
    ...(has('store') ? (['store'] as const) : []),
  ]
}

/**
 * The levels a list and a search leave standing.
 *
 * Pure, and tested, because the `yours` rule is the one nobody would guess from
 * reading the tabs: it is everything this space has a claim on - its shelf, the
 * levels we ship, and its own saved work - and the single thing it leaves out
 * is a store level nobody has taken in. That is what the store tab is for.
 */
export function matchingXps(
  xps: readonly XpChoice[],
  from: XpFilter,
  find: string,
): readonly XpChoice[] {
  const needle = find.trim().toLowerCase()

  return xps.filter((entry) => {
    if (from === 'yours' && entry.source === 'store' && !entry.shelved) return false
    if (from === 'magazine' && !entry.shelved) return false
    if (from === 'builtin' && entry.source !== 'builtin') return false
    if (from === 'space' && entry.source !== 'space') return false
    if (from === 'store' && entry.source !== 'store') return false
    if (needle.length === 0) return true
    return (
      entry.name.toLowerCase().includes(needle) ||
      (entry.blurb ?? '').toLowerCase().includes(needle)
    )
  })
}

/**
 * A store level nobody has taken in.
 *
 * The one case where the picker's two verbs come apart - see the panel's own
 * note - so it is a named predicate rather than the same conjunction written
 * out in four places.
 */
function fromStore(xp: XpChoice): boolean {
  return xp.source === 'store' && !xp.shelved
}

/** One line summarising what a level's rules block says, for the picker. */
function describeXpRules(xp: XpChoice, t: BattleDict['wizard']): string {
  // The preset is a word out of `@kxb/xp` and stays as it is.
  const parts: string[] = [xp.preset]
  if (xp.scoreLimit !== null) parts.push(fill(t.ruleFirstTo, { n: xp.scoreLimit }))
  if (xp.timeLimit !== null) parts.push(fill(t.ruleMinutes, { n: Math.round(xp.timeLimit / 60) }))
  return parts.join(' · ')
}

export function XpPicker({
  xps,
  hidden,
  placeFree,
  chosen,
  onChoose,
  taking,
  onTake,
  t,
}: {
  xps: XpChoice[]
  /** How many the query left out, so the list can say so. */
  hidden: number
  /** Whether there is an XP place free, which only the store half reads. */
  placeFree: boolean
  chosen: string | null
  onChoose: (ref: string) => void
  /** The store row being taken in, so only its own control says so. */
  taking: string | null
  onTake: (entry: XpChoice) => void
  t: BattleDict['wizard']
}) {
  const [find, setFind] = useState('')
  const [from, setFrom] = useState<XpFilter>('yours')
  const [shown, setShown] = useState(XP_PAGE)
  const [expanded, setExpanded] = useState(false)

  /** The cartridge somebody picked up, if any. One at a time. */
  const [open, setOpen] = useState<string | null>(null)

  const filters = useMemo(() => filtersFor(xps), [xps])
  const matching = useMemo(() => matchingXps(xps, from, find), [xps, from, find])
  const visible = matching.slice(0, shown)

  const shelf = useMemo<ShelfItem[]>(
    () =>
      visible.map((entry) => ({
        ref: entry.ref,
        name: entry.name,
        cover: entry.cover,
        finish: entry.finish ?? undefined,
        ...(entry.hue === null ? {} : { hue: entry.hue }),
        // Held back rather than refused: see `ShelfItem.dimmed`, and the two
        // buttons in the panel below.
        dimmed: fromStore(entry) && !placeFree,
      })),
    [visible, placeFree],
  )

  const opened = open === null ? null : (xps.find((entry) => entry.ref === open) ?? null)

  return (
        <div className="space-y-3">
          {/*
            A search and a source, above a list that scrolls.

            The picker was every level this space can reach, in one grid,
            capped at `PICKER_LIMIT` with a sentence pointing at Browse for
            the rest. That is fine for four and unusable for forty: the
            thing somebody is looking for is a *particular* level they made,
            and scrolling a wall of cards to find it is the worst way to
            answer a question they could have typed in three letters.

            Filtered here rather than re-queried, because the list is
            already loaded and bounded - a round trip per keystroke would be
            slower and would make the cap visible again in a new place.
          */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={find}
              onChange={(event) => {
                setFind(event.target.value)
                setShown(XP_PAGE)
              }}
              placeholder={t.findALevel}
              className="min-w-[10rem] flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-accent focus:outline-none"
            />
            {filters.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setFrom(option)
                  setShown(XP_PAGE)
                }}
                aria-pressed={from === option}
                className={`rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition ${
                  from === option
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-muted hover:border-accent/60'
                }`}
              >
                {t.filters[option]}
              </button>
            ))}
          </div>

          {/*
            Two rows deep, and taller on request.

            A picker that owns the whole screen makes the rest of the wizard -
            the name, the mode, the button that starts it - feel like a
            different page. Two rows is enough to see that there is a shelf and
            enough to pick the one you came for; `expanded` is for somebody
            browsing rather than choosing.

            The scroll is on the frame and the canvas is as tall as the grid, so
            scrolling the shelf is an ordinary scroll and the pointer maths -
            which measures the frame - stays right at any offset.
          */}
          <div
            className={`overflow-y-auto pr-1 ${expanded ? 'max-h-[34rem]' : 'max-h-[21rem]'}`}
          >
            {matching.length === 0 ? (
              <p className="text-sm text-ink-muted">{t.nothingMatches}</p>
            ) : (
              <CartridgeShelf
                items={shelf}
                selected={chosen}
                onOpen={setOpen}
                label={t.shelfLabel}
              />
            )}
          </div>

          {/*
            The one that was picked up, opened under the shelf.

            Read from `xps` rather than from `visible`, so a panel stays open
            while somebody types in the search box above it. Closing it because
            the level fell out of the filter would take the answer away at
            exactly the moment they were reading it.
          */}
          {opened && (
            <CartridgeSheet
              reference={opened.ref}
              {...(opened.hue === null ? {} : { hue: opened.hue })}
              name={opened.name}
              blurb={opened.blurb}
              cover={opened.cover}
              facts={describeXpRules(opened, t)}
              badge={
                opened.shelved
                  ? t.magazineChip
                  : opened.draft
                    ? t.thisSpaceDraft
                    : t.sources[opened.source]
              }
              note={
                fromStore(opened) && !placeFree ? (
                  <p className="text-[11px] leading-relaxed text-amber-200/80">{t.placesFull}</p>
                ) : null
              }
              closeLabel={t.close}
              noPicture={t.noPicture}
              onClose={() => setOpen(null)}
            >
              {/*
                Two different noes, and only one of them is a wall.

                Taking a store level in is free and unlimited on every tier, so
                that control is always live; putting one out costs an XP place,
                which is the metered act - so `placeFree` gates fighting in it
                and the note above says which of the two is in the way. §3 of
                the pricing doc is the whole argument: the wall lands where
                somebody already wants the level.
              */}
              {fromStore(opened) && (
                <button
                  type="button"
                  onClick={() => onTake(opened)}
                  className="rounded-full border border-accent/60 px-3 py-1 text-sm text-accent transition hover:bg-accent/10"
                >
                  {taking === opened.ref ? t.taking : t.addToMagazine}
                </button>
              )}

              <button
                type="button"
                onClick={() => onChoose(opened.ref)}
                aria-disabled={fromStore(opened) && !placeFree}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  chosen === opened.ref
                    ? 'border border-accent bg-accent/15 text-accent'
                    : fromStore(opened) && !placeFree
                      ? 'border border-dashed border-line text-ink-muted'
                      : 'border border-accent bg-accent/10 text-accent hover:bg-accent/20'
                }`}
              >
                {chosen === opened.ref ? t.picked : t.pickThisLevel}
              </button>
            </CartridgeSheet>
          )}

          {/*
            More, a page at a time, rather than a cap with a link out.

            The old note said "{n} more in Browse" and sent somebody to a
            different page mid-wizard, which loses the name they typed and
            the mode they picked. A page is `XP_PAGE` more cards in the same
            list; Browse is still there for looking around rather than for
            finishing this.
          */}
          <div className="flex flex-wrap items-center gap-3">
            {matching.length > shown && (
              <button
                type="button"
                onClick={() => setShown((was) => was + XP_PAGE)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:border-accent/60 hover:text-ink"
              >
                {fill(t.showMore, {
                  n: Math.min(XP_PAGE, matching.length - shown),
                })}
              </button>
            )}
            {matching.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((was) => !was)}
                className="text-sm text-accent hover:underline"
              >
                {expanded ? t.showLess : t.expand}
              </button>
            )}
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted/70">
              {fill(t.counted, {
                shown: Math.min(shown, matching.length),
                total: matching.length,
              })}
              {hidden > 0 ? fill(t.moreInBrowse, { n: hidden }) : ''}
            </span>
          </div>
        </div>
  )
}
