import 'server-only'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { Finish, XpCapabilities, XpDocument } from '@kxb/xp'
import { PACKS } from '@kxb/xp/packs'
import {
  listBuiltinIds,
  NO_OVERLAY,
  readBuiltinDocument,
  readBuiltinOverlays,
  readShippedDocument,
  type BuiltinOverlays,
} from '@/domain/xps/builtins'
import { builtinCovers } from '@/domain/xps/covers'
import type { Client } from '@/es/store'

/**
 * The XPs there are, as a stranger sees them.
 *
 * ---------------------------------------------------------------------------
 * Why this reads a directory
 * ---------------------------------------------------------------------------
 * Because that is where XPs are. `docs/xp/creator.md` §3.1 decided a file for
 * all of v1 and it has not been overturned - `docs/xp/backend.md` is the plan
 * for the folder, the bucket and the rows, and none of it is built. So the
 * store reads what exists rather than an empty table, and the day B2 lands this
 * function grows a second source and the pages above it do not change.
 *
 * That is the whole reason this returns a `XpSummary` rather than an
 * `XpDocument`: the summary is the shape the store is written against, and it
 * is deliberately *narrower* than the document. When an XP becomes a row, the
 * row fills the same seven fields and nothing that renders has to know.
 *
 * ---------------------------------------------------------------------------
 * Not the same list as /xp
 * ---------------------------------------------------------------------------
 * The operator catalogue at `src/app/xp/page.tsx` lists documents that do not
 * parse, with their problems where their name would be, and it is right to -
 * a file that quietly stops being listed is the hardest kind of missing to
 * notice, and an operator is the person who can fix it.
 *
 * This one drops them. A store is read by somebody deciding whether to spend
 * ten minutes here, and "3 problems - open it to see them" is a broken window
 * to them rather than a bug report. The two lists disagreeing is the correct
 * outcome, not drift.
 */

export interface XpSummary {
  id: string
  name: string
  blurb: string | null
  /**
   * The front picture, as a URL, or null.
   *
   * `docs/xp/backend.md` §4 makes this the first file in the folder's
   * `preview/` with `meta.cover` overriding it. There are no folders yet, so
   * today it is the shot the rasteriser drew - `public/xp/shots/<id>.png`,
   * produced by `bun run xp:shot`. Same rule either way, and the one that
   * matters: the picture came out of the level. A store card cannot advertise a
   * room the XP does not have.
   */
  cover: string | null
  /**
   * What the shell is made of, and its colour, as the level declared them.
   *
   * Straight off the document - see `@kxb/xp`'s `./finish`. Null in both means
   * the level never said, which is a real answer rather than a missing one: the
   * shelf draws plastic in a hue derived from the id.
   */
  finish: Finish | null
  hue: number | null
  /** What the product may do with it. Drives the badges on the card. */
  capabilities: XpCapabilities
  /** Architecture. The number that answers "how big is this place". */
  pieces: number
  /** Things with rules on them. The number that answers "is anything happening". */
  things: number
  /** Pack labels, for the credit line. Deduped, in document order. */
  packs: string[]
  /** Whether anything in it is scripted. One bit, because that is all a card can use. */
  scripted: boolean
  /** Newest first is the only order the store has until something is played. */
  updatedAt: string
}

const XPS_DIR = path.join(process.cwd(), 'public', 'xp', 'xps')

const DOCUMENT_SUFFIX = '.xp.json'

/** The pack labels a document draws from, in the order it names them. */
function packLabels(document: XpDocument): string[] {
  const labels: string[] = []
  for (const ref of document.packs) {
    const label = PACKS[ref.id]?.label
    if (label && !labels.includes(label)) labels.push(label)
  }
  return labels
}

export function summarise(
  id: string,
  document: XpDocument,
  cover: string | null,
  updatedAt: string,
): XpSummary {
  return {
    id,
    name: document.name,
    blurb: document.blurb ?? null,
    cover,
    finish: document.finish ?? null,
    // A presence check, because zero is a hue - it is red.
    hue: document.hue ?? null,
    capabilities: document.capabilities,
    pieces: document.world.placements.length,
    things: document.entities.length,
    packs: packLabels(document),
    scripted: Object.keys(document.scripts ?? {}).length > 0,
    updatedAt,
  }
}

/**
 * Every XP a visitor may see, newest first.
 *
 * Newest by the file's own mtime, because there is no `published_at` to sort by
 * and inventing one from the document would mean a field an author could set to
 * whatever kept them at the top of the store. A timestamp nobody controls is
 * the honest default until the row exists.
 */
export async function listXpCatalogue(
  /**
   * The client the overlay is read with. See `domain/xps/builtins.ts` for why
   * it is a parameter rather than a service-role client reached for in here,
   * and why absent means "the disk, whole" rather than "nothing".
   */
  supabase?: Client,
): Promise<XpSummary[]> {
  return listXpCatalogueWith(
    supabase ? await readBuiltinOverlays(supabase) : NO_OVERLAY,
  )
}

/**
 * The listing, against overlays already in hand.
 *
 * Separate from the exported function only so a caller that needs both the list
 * and one document - `readXpDocument` - reads the table once rather than twice.
 */
async function listXpCatalogueWith(overlays: BuiltinOverlays): Promise<XpSummary[]> {
  // The union rather than the directory: a level an operator dropped in between
  // deploys has no file yet and belongs on the shelf all the same. No directory
  // and no overlay is an empty store, not an error - the page has an empty state
  // and it is a better answer than a 500 to somebody who came to look around.
  const [ids, covers] = await Promise.all([listBuiltinIds(overlays), builtinCovers()])

  const found = await Promise.all(
    ids.map(async (id) => {
      const overlay = overlays.get(id)

      // Taken off the shelf by an operator. Dropped rather than dimmed: this is
      // the shop window, and a card nobody may press is worse than a gap.
      // Absent from the overlay means listed, which is what shipping one is.
      if (overlay && !overlay.published) return null

      // What the store describes is what a player would open, so an override
      // stands in for the file rather than beside it - and it carries its own
      // timestamp, because when it was put in is what "newest" means for it.
      if (overlay?.document) {
        return summarise(id, overlay.document, covers.get(id) ?? null, overlay.updatedAt)
      }

      // Two reads rather than one, and the stat is the reason: this list is
      // sorted newest-first on the file's own mtime, which the document does
      // not carry. See the note on `updatedAt`.
      try {
        const [document, stats] = await Promise.all([
          readShippedDocument(id),
          stat(path.join(XPS_DIR, `${id}${DOCUMENT_SUFFIX}`)),
        ])
        if (!document) return null
        return summarise(id, document, covers.get(id) ?? null, stats.mtime.toISOString())
      } catch {
        return null
      }
    }),
  )

  return found
    .filter((entry): entry is XpSummary => entry !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** One XP, or null when the id names nothing that parses. */
export async function findXp(id: string, supabase?: Client): Promise<XpSummary | null> {
  // Through the list rather than straight at the path, so an id off a URL never
  // reaches `readFile` at all. `../../etc/passwd` does not appear in a readdir.
  const all = await listXpCatalogue(supabase)
  return all.find((entry) => entry.id === id) ?? null
}

/**
 * The whole document, for the one page that needs more than a summary.
 *
 * Separate from `findXp` because the detail page wants the parsed document and
 * every other caller wants seven fields. Same containment: the id is checked
 * against the listing before anything is opened.
 */
export async function readXpDocument(
  id: string,
  supabase?: Client,
): Promise<XpDocument | null> {
  const overlays = supabase ? await readBuiltinOverlays(supabase) : NO_OVERLAY

  const summary = await findXpIn(id, overlays)
  if (!summary) return null

  return readBuiltinDocument(id, overlays)
}

/**
 * The containment check `findXp` performs, against overlays already in hand.
 *
 * Split out only so `readXpDocument` does not read the table twice - the id is
 * still checked against a directory listing before anything is opened, which is
 * the property that matters.
 */
async function findXpIn(id: string, overlays: BuiltinOverlays): Promise<XpSummary | null> {
  const all = await listXpCatalogueWith(overlays)
  return all.find((entry) => entry.id === id) ?? null
}
