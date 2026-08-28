import Link from 'next/link'
import { hueFor } from '@/app/components/hue'
import type { XpSummary } from '@/domain/xps/catalogue'
import { fill } from '@/app/i18n/fill'
import type { StoreDict } from '@/app/i18n/store'
import type { Locale } from '@/domain/i18n/locale'

/**
 * One XP in the store.
 *
 * ---------------------------------------------------------------------------
 * Why this is a `.box` and the world card is not
 * ---------------------------------------------------------------------------
 * `WorldCard` is a bordered panel because a world is an ingredient - you scan a
 * grid of them looking for the one to drop into your space, and a panel is the
 * right weight for a thing you are picking from a list.
 *
 * An XP is not an ingredient, it is the thing itself. `.box` is the landing
 * page's own card - nearly black, one coloured light burning inside it, lifting
 * to the pointer - and it is the heaviest object the design system has. Using
 * it here is the whole argument of the page in one decision: these are what the
 * store is for, and the rest of the catalogue is underneath them.
 *
 * The hue is derived from the id rather than authored, because there is no
 * field for it and inventing one would mean a colour picker in an editor that
 * does not exist yet. What matters is only that neighbours differ - six cards
 * in six lights is the bento's whole trick, and six cards in one light is a
 * table.
 */

/**
 * A short word per capability, which the long ones in `describeCapability` are
 * not: that function writes a sentence for an operator picking a level out of a
 * dropdown, and this is a chip on a card somebody is scanning.
 */
const CAPABILITY_WORDS: Record<string, string> = {
  freeplay: 'wander',
  match: 'match',
  football: 'football',
  competition: 'timed',
}

export function XpCard({
  xp,
  eager = false,
  t,
  locale,
}: {
  xp: XpSummary
  eager?: boolean
  /** Resolved by the page. A server component, so there is no context to read. */
  t: StoreDict
  /** For the two counts, which a German reader groups with a full stop. */
  locale: Locale
}) {
  const hue = hueFor(xp.id)

  return (
    <Link
      href={`/browse/xp/${xp.id}`}
      className="box flex flex-col"
      style={{ '--box-hue': hue } as React.CSSProperties}
    >
      {/*
        The picture reaches the card's edges, so it is pulled back out of the
        1.75rem `.box` padding rather than the padding being removed - every
        other row on the card wants that padding, and `overflow: hidden` on
        `.box` is what makes the bleed land inside the rounded corner.
      */}
      <div className="relative -m-7 mb-5 aspect-[16/10] overflow-hidden bg-[oklch(0.06_0.02_265)]">
        {xp.cover ? (
          /* eslint-disable-next-line @next/next/no-img-element -- a checked-in
             PNG drawn by our own rasteriser at the size it is shown. The
             optimiser has nothing to do here but add a hop, which is the same
             call the block picker and the world card already made. */
          <img
            src={xp.cover}
            alt={`${xp.name}, drawn from inside the level`}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
            className="size-full object-cover"
          />
        ) : (
          /*
            An empty room rather than the words "no picture yet".

            The floor and the horizon are the shared way to say "this is a
            place" (DESIGN.md), so a level with no shot yet reads as one that
            has not been photographed rather than as a card that failed to
            load. It also cannot be mistaken for a real cover, which a grey
            rectangle can.
          */
          <div className="relative isolate size-full">
            <span aria-hidden className="neon-horizon" />
            <span aria-hidden className="neon-floor" />
            <span className="sr-only">{t.noPicture}</span>
          </div>
        )}
      </div>

      <h3 className="text-lg font-medium leading-snug">{xp.name}</h3>

      {/* Clamped, because these are written by whoever built the level and one
          of them is already six lines. A card is a decision about whether to
          open something; the whole blurb is on the page you land on. */}
      {xp.blurb && (
        <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-ink-muted">{xp.blurb}</p>
      )}

      {/* Pushed to the bottom so the facts line up across a row of cards whose
          blurbs are different lengths. A ragged baseline across a grid is the
          thing that makes a catalogue look assembled rather than designed. */}
      <div className="mt-auto pt-5">
        {xp.capabilities.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {xp.capabilities.map((capability) => (
              <li
                key={capability}
                className="rounded-full border border-accent-2/40 px-2 py-0.5 text-[11px] text-accent-2"
              >
                {CAPABILITY_WORDS[capability] ?? capability}
              </li>
            ))}
          </ul>
        )}

        {/* Pieces before things, and both before the pack, because "how big"
            and "is anything happening" are the two questions a card can answer
            and the art it was built from is trivia until you open it. */}
        <p className="mt-3 text-xs tabular-nums text-ink-muted">
          {fill(xp.pieces === 1 ? t.pieceOne : t.pieces, {
            n: xp.pieces.toLocaleString(locale),
          })}{' '}
          ·{' '}
          {fill(xp.things === 1 ? t.thingOne : t.things, {
            n: xp.things.toLocaleString(locale),
          })}
          {xp.scripted && ` ${t.scripted}`}
        </p>
      </div>
    </Link>
  )
}
