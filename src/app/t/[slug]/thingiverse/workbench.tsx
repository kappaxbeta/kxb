import Link from 'next/link'
import { PackPreviewGrid } from '@/app/components/pack-preview'
import { ModelBrowser } from '@/app/t/[slug]/thingiverse/model-browser'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import {
  isXpModel,
  MODEL_PACKS,
  searchModels,
  type ModelPack,
} from '@/domain/thingiverse/models'
import { packPreviews, splitPreviews } from '@/domain/thingiverse/pack-preview'
import type { BlueprintView } from '@/domain/thingiverse/queries'

/**
 * The thingiverse, as a workbench.
 *
 * Everything the page used to be, minus its own heading, because it stopped
 * being a page: it is the first tab of `/browse` now, and browse already
 * carries an `<h1>`. A second one inside a tab panel is a document with two
 * titles, which is the one thing a screen reader reads out that nobody meant.
 *
 * ---------------------------------------------------------------------------
 * Why the packs are a browser and not a picker
 * ---------------------------------------------------------------------------
 * The builder already has a picker over this catalogue and it is the right
 * shape for building: a search box and a grid, in a panel, beside the thing you
 * are placing. It answers "which model" for somebody who already knows they
 * want one.
 *
 * This is read by somebody who does not. What is in the bakery pack? What can a
 * room have in it? So the packs come with their sizes, their authors and their
 * licence, and every tile has one button on it - make a blueprint of this -
 * because the honest next step from "what is there" is "have that one".
 *
 * ---------------------------------------------------------------------------
 * And why it opens on the packs rather than on a slice of everything
 * ---------------------------------------------------------------------------
 * "What is in the bakery pack" was the question this tab was written to answer
 * and the one thing it could not: arriving here drew fifty-one chips reading
 * "Bakerygoods 46" and then the first hundred and twenty models of the *first*
 * pack, so the answer to a question about any of the other fifty was a click
 * away and unguessable.
 *
 * So an untouched arrival is the packs, with four of each one's own models on
 * the card - see `@/domain/thingiverse/pack-preview`. Press one, or type
 * anything, and it is the chips and the grid it has always been.
 *
 * ---------------------------------------------------------------------------
 * How many models it will draw
 * ---------------------------------------------------------------------------
 * `PAGE` caps the grid, and the cap is about *images* rather than about rows: a
 * tile is a thumbnail, and a pack with four hundred of them is four hundred
 * requests for a page somebody is scanning. Narrowing by pack or by a typed
 * word is how you see the rest, which is also how anybody actually looks for a
 * bench.
 */
const PAGE = 120

export function PacksPanel({
  shelf,
  q,
  pack,
  t,
  /**
   * Where the search form and the pack chips point.
   *
   * Passed in rather than assumed, because this is drawn on a route that is not
   * its own: the form is a plain `method="get"`, so it posts to whatever page is
   * showing it, and a hard-coded `/thingiverse` would have every search walk
   * somebody out of the tab they were reading. `/browse` opens on its first tab,
   * which is this one, so a GET back to it lands where it left.
   */
  href,
}: {
  /** The space's blueprints, only to mark which models are already cut. */
  shelf: BlueprintView[]
  q: string | undefined
  pack: string | undefined
  t: WorkspaceDict['thingiverse']
  href: string
}) {
  // A pack id from the URL is not trusted to be one: an unknown value narrows
  // to nothing rather than throwing, which is what every other filter on a
  // workspace page does with a stray query string.
  const packId = MODEL_PACKS.some((entry) => entry.id === pack) ? pack : undefined
  /**
   * Nothing chosen and nothing typed: the arrival the covers are the answer to.
   *
   * Read before the search rather than after it, because on this branch there
   * is no search to run - `searchModels('')` builds every one of the 5,863 hits
   * to feed a grid that is not drawn.
   */
  const landing = packId === undefined && (q ?? '').trim() === ''
  const models = landing ? [] : searchModels(q ?? '', packId)
  const shown = models.slice(0, PAGE)

  const query = (next: Record<string, string | undefined>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(next)) if (value) search.set(key, value)
    const tail = search.toString()
    return tail ? `${href}?${tail}` : href
  }

  /**
   * The chips, in two rows rather than one wall of fifty-one.
   *
   * One row was what shipped and it was eight lines deep - more vertical space
   * than the models underneath it - which made the first thing on the page a
   * list of things you were not looking for.
   *
   * Split by catalogue, which is a split that was already there and was
   * invisible: the world packs furnish a *room* and the level packs furnish a
   * *level*, and until they were labelled the page listed "Prototype" twice and
   * "Peeps" twice with no way to tell which was which. Two headed rows answer
   * that without a word of new explanation. See `MODEL_PACKS`.
   */
  /**
   * The models this space has already made a blueprint of.
   *
   * A set rather than a lookup per tile: the shelf is at most a few hundred and
   * the grid is forty, and `Array.some` inside a map is the shape that turns a
   * page into a quadratic one the day somebody has a big shelf.
   */
  const cut = new Set(shelf.map((entry) => entry.spec.model))

  /**
   * Pack id to label, for the tiles.
   *
   * Built here rather than in the browser: the client would have to import
   * `MODEL_PACKS` to resolve one word per tile, and that is fifty-one entries
   * in a bundle to print eleven of them.
   */
  const packOf = Object.fromEntries(MODEL_PACKS.map((entry) => [entry.id, entry.label]))

  const rooms = MODEL_PACKS.filter((entry) => !isXpModel(entry.id))
  const levels = MODEL_PACKS.filter((entry) => isXpModel(entry.id))

  const covers = landing ? splitPreviews(packPreviews()) : null

  return (
    <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {t.packsTab}
          </h2>
          <form method="get" action={href} className="flex items-center gap-2">
            {packId && <input type="hidden" name="pack" value={packId} />}
            <input
              name="q"
              defaultValue={q ?? ''}
              placeholder={t.search}
              aria-label={t.search}
              className="rounded-lg border border-line/60 bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted"
            />
            {/*
              `searchGo`, not `search`. Both the box and the button read "Search
              every pack", so the control said its own placeholder back to you -
              which reads as a page that has drawn the same thing twice rather
              than as a field and the button that submits it.
            */}
            <button
              type="submit"
              className="rounded-lg border border-line/60 px-3 py-1.5 text-xs text-ink transition hover:bg-surface-raised"
            >
              {t.searchGo}
            </button>
          </form>
        </div>

        <p className="text-xs text-ink-muted">{t.searchHint}</p>

        {covers ? (
          <>
            <PackPreviewGrid
              label={t.roomPacks}
              previews={covers.rooms}
              hrefOf={(id) => query({ pack: id })}
              sizeLabelOf={(size) => fill(t.packSize, { n: String(size) })}
            />
            <PackPreviewGrid
              label={t.levelPacks}
              previews={covers.levels}
              hrefOf={(id) => query({ pack: id })}
              sizeLabelOf={(size) => fill(t.packSize, { n: String(size) })}
            />
          </>
        ) : (
          <>
            <PackRow label={t.roomPacks} packs={rooms} packId={packId} q={q} t={t} query={query} all />
            {/*
              The forty level packs, folded away.

              Eleven rows of chips - more vertical space than the models under them -
              for a catalogue most people opening this are not after: the world packs
              are what a *room* is furnished with, and this half is characters,
              weapons and dungeon walls. Unfolded it is the same list it was.

              `<details>` rather than a `useState`, which would make this file a
              client component to hold one boolean. The element already does open,
              shut, keyboard and the disclosure semantics, and this page is
              server-rendered with no other reason to ship JavaScript.

              Open when the chosen pack is one of these, so a filter that is on is
              never hidden behind a fold - otherwise narrowing to Dungeon and
              reloading gives you a grid of dungeon walls over a shut box, with
              nothing on screen saying why.
            */}
            <details open={packId !== undefined && isXpModel(packId)} className="group">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted/70 transition hover:text-ink">
                <span className="font-mono transition group-open:rotate-90">›</span>
                {t.levelPacks}
                <span className="font-mono normal-case tracking-normal">
                  {fill(t.packCount, { n: String(levels.length) })}
                </span>
              </summary>
              <div className="pt-2">
                <PackRow
                  label={t.levelPacks}
                  packs={levels}
                  packId={packId}
                  q={q}
                  t={t}
                  query={query}
                  headed={false}
                />
              </div>
            </details>

            {/*
              What you are actually looking at, said in numbers.

              The grid is capped at `PAGE` and used to end in a bare "4342 models …"
              built out of the *pack size* string - so the one line telling you the
              list was cut described the cut as if it were the whole catalogue. Said
              properly it is two facts: how many are drawn, and how many were found.
            */}
            {shown.length > 0 && (
              <p className="text-xs text-ink-muted">
                {fill(t.showing, { shown: String(shown.length), total: String(models.length) })}
              </p>
            )}

            {shown.length === 0 ? (
              /*
                A word that matches nothing.

                Worth its own line: without it a search with no hits drew a heading,
                a row of chips and then whitespace, which looks like a grid that
                failed to load rather than a search that found nothing.
              */
              <p className="rounded-xl border border-line/60 bg-surface px-4 py-6 text-sm text-ink-muted">
                {fill(t.noModels, { q: (q ?? '').trim() })}
              </p>
            ) : (
              /*
                The grid and its podium, handed over to the client.

                Only the hits cross the boundary - an id, a label and a pack - and
                the pack *labels* go with them as a small map rather than the client
                resolving each one, because resolving means importing `MODEL_PACKS`
                and that is fifty-one entries nobody needs in a bundle to print
                eleven words. See `ModelBrowser` for why there is one canvas rather
                than one per tile.
              */
              <ModelBrowser hits={shown} packOf={packOf} cut={[...cut]} t={t.browser} />
            )}
          </>
        )}

        {/*
          The credits as a panel rather than a rule and some small print.

          Everything else on this surface is a lit object standing on the sky;
          a bare `border-top` was the one place it read as a document's footer.
          The shop states its terms the same way.
        */}
        <footer className="rounded-xl border border-line/60 bg-surface-raised/40 px-4 py-3 text-xs text-ink-muted">
          <p>{t.credit}</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {MODEL_PACKS.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.source}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-line hover:text-ink"
                >
                  {entry.label} — {entry.author}
                </Link>
              </li>
            ))}
          </ul>
        </footer>
    </section>
  )
}

/**
 * One catalogue's packs, as filters.
 *
 * Each chip carries its size, because "how much is in here" is most of what
 * somebody wants to know before they open one - and because a pack of twelve
 * and a pack of four hundred are different kinds of thing to go looking in.
 *
 * `all` puts the "everything" chip at the head of the first row only. It clears
 * the pack across *both* catalogues, so it belongs to neither and there is no
 * sense in drawing it twice.
 */
function PackRow({
  label,
  packs,
  packId,
  q,
  t,
  query,
  all = false,
  headed = true,
}: {
  label: string
  packs: readonly ModelPack[]
  packId: string | undefined
  q: string | undefined
  t: WorkspaceDict['thingiverse']
  query: (next: Record<string, string | undefined>) => string
  all?: boolean
  /** False where a `<summary>` above already names the row. */
  headed?: boolean
}) {
  return (
    <nav aria-label={label} className="space-y-1.5">
      {headed && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted/70">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {all && (
          <Chip href={query({ q })} on={!packId}>
            {t.everyPack}
          </Chip>
        )}
        {packs.map((entry) => (
          <Chip
            key={entry.id}
            href={query({ pack: entry.id, q })}
            on={packId === entry.id}
            /*
              The count is a bare number on the chip and a sentence to a screen
              reader. Written out, "models" appeared fifty-one times down one
              block and was the widest thing in it - a word that is the same on
              every chip carries nothing, and dropping it is what let the room
              packs fit three rows instead of five.
            */
            title={`${entry.label} — ${fill(t.packSize, { n: String(entry.size) })}`}
          >
            {entry.label}
            <span className="ml-1.5 font-mono text-[10px] tabular-nums text-ink-muted">
              {entry.size}
            </span>
          </Chip>
        ))}
      </div>
    </nav>
  )
}

function Chip({
  href,
  on,
  title,
  children,
}: {
  href: string
  on: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      title={title}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        on
          ? 'border-accent/50 bg-accent/20 text-ink'
          : 'border-line/60 text-ink-muted hover:bg-surface-raised hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}


