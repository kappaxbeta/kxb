import 'server-only'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseXp, type XpDocument } from '@kxb/xp'
import type { Client } from '@/es/store'
import { builtinCovers } from '@/domain/xps/covers'

/**
 * The operator's overlay over the levels we ship.
 *
 * ---------------------------------------------------------------------------
 * Two halves of one answer
 * ---------------------------------------------------------------------------
 * A builtin is a file in the image - `public/xp/xps/<id>.xp.json` - and that
 * file is the *default* for both of the questions a surface asks about it:
 * whether to list it, and what document to open. `builtin_xps` is where an
 * operator disagrees with a default, and no row means they never have.
 *
 * The whole point of the shape is that adding a level stays a matter of adding
 * a file. Nothing has to be inserted, nothing has to be remembered, and a level
 * committed by somebody who has never seen the backoffice is on the shelf the
 * moment it deploys.
 *
 * ---------------------------------------------------------------------------
 * Why the reads take a client rather than reaching for the service role
 * ---------------------------------------------------------------------------
 * The two callers - the store's catalogue and the battle picker - already hold
 * one, and the table is readable by anybody (see the migration: these documents
 * are static files on the same host). Passing it means the store's list is
 * built with the store's own client, and this module never has the power to
 * read past RLS on a public page.
 *
 * The parameter is *optional* and absent means "no overlay", which is what the
 * tests, the scripts and the operator catalogue at `/xp` want: the disk, whole,
 * exactly as it was before this table existed. That is a fail-*open* default
 * and it is chosen knowingly - the failure it produces is a level appearing on
 * an operator's own page after it was unlisted, and the alternative fail-closed
 * default would hide every level from any caller that forgot to thread a
 * client, which is the same bug pointed at players.
 */

export interface BuiltinOverlay {
  published: boolean
  /** The document to serve instead of the file, or null for "the file". */
  document: XpDocument | null
  bytes: number | null
  updatedAt: string
}

export type BuiltinOverlays = Map<string, BuiltinOverlay>

/** No rows. The shape every caller falls back to when it has no client. */
export const NO_OVERLAY: BuiltinOverlays = new Map()

const XPS_DIR = path.join(process.cwd(), 'public', 'xp', 'xps')

const SUFFIX = '.xp.json'

/** Only `[a-z0-9-]`, matching the routes and the table's own check. */
export function safeBuiltinId(id: string): string | null {
  return /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : null
}

/**
 * Every row of the overlay, keyed by level id.
 *
 * One query, whole table, because it has at most as many rows as we ship levels
 * and every caller wants all of them - a listing filters against it and a load
 * looks one up. A `.in('id', [...])` would be a second round trip to save
 * nothing.
 *
 * An override that no longer parses is dropped to `document: null` rather than
 * served, so a bad upload degrades to the shipped file instead of taking the
 * store down. It cannot normally happen - `parseXp` runs before the write - but
 * a document written when the format was older is exactly the case that would,
 * and "the level we shipped" is a better answer to it than a 500.
 */
export async function readBuiltinOverlays(supabase: Client): Promise<BuiltinOverlays> {
  const { data, error } = await supabase
    .from('builtin_xps')
    .select('id, published, document, bytes, updated_at')

  if (error) throw new Error(`Failed to read the builtin overlay: ${error.message}`)

  const overlays: BuiltinOverlays = new Map()
  for (const row of data ?? []) {
    const parsed = row.document === null ? null : parseXp(row.document)
    overlays.set(row.id, {
      published: row.published,
      document: parsed?.ok ? parsed.document : null,
      bytes: row.bytes,
      updatedAt: row.updated_at,
    })
  }
  return overlays
}

/**
 * Every id there is: the files in the image, plus anything added here.
 *
 * The union, and the second half is the point of it. An overlay row that
 * carries a document but has no file behind it is a level an operator dropped
 * in *between deploys* - the "put it in and it is live" half of this surface -
 * and a listing that walked only the directory would accept the upload and then
 * never show it to anybody.
 *
 * Sorted, so every listing agrees on an order before it applies its own.
 */
export async function listBuiltinIds(overlays: BuiltinOverlays): Promise<string[]> {
  const ids = new Set(await listShippedIds())
  for (const [id, overlay] of overlays) {
    if (overlay.document) ids.add(id)
  }
  return [...ids].sort()
}

/** The ids the image ships, from the directory. Empty when there is no directory. */
export async function listShippedIds(): Promise<string[]> {
  try {
    const files = await readdir(XPS_DIR)
    return files.filter((file) => file.endsWith(SUFFIX)).map((file) => file.slice(0, -SUFFIX.length))
  } catch {
    return []
  }
}

/** Is this one on the shelf? Absent from the overlay means yes. */
export function builtinIsPublished(overlays: BuiltinOverlays, id: string): boolean {
  return overlays.get(id)?.published ?? true
}

/** The override for this one, or null for "read the file". */
export function builtinOverride(overlays: BuiltinOverlays, id: string): XpDocument | null {
  return overlays.get(id)?.document ?? null
}

/**
 * The document a player would get: the override if there is one, else the file.
 *
 * Null when the id names nothing, or when what it names does not parse. Every
 * caller is about to render a canvas or a card, and a page saying "not here" is
 * the answer the disk read already gave.
 */
export async function readBuiltinDocument(
  id: string,
  overlays: BuiltinOverlays = NO_OVERLAY,
): Promise<XpDocument | null> {
  return builtinOverride(overlays, id) ?? readShippedDocument(id)
}

/**
 * The document in the image, ignoring anything an operator has said.
 *
 * The one place a `.xp.json` is opened. There were four copies of these six
 * lines - here, in the store's catalogue, and twice in the picker - and every
 * one of them had to remember the id check, which is what stops a string off a
 * URL reaching `readFile` at all.
 *
 * Only the *store's listing* still stats the file separately, because it sorts
 * on the mtime and a document does not carry one.
 */
export async function readShippedDocument(id: string): Promise<XpDocument | null> {
  const safe = safeBuiltinId(id)
  if (!safe) return null

  try {
    const parsed = parseXp(JSON.parse(await readFile(path.join(XPS_DIR, `${safe}${SUFFIX}`), 'utf8')))
    return parsed.ok ? parsed.document : null
  } catch {
    return null
  }
}

/**
 * ---------------------------------------------------------------------------
 * The backoffice's own view
 * ---------------------------------------------------------------------------
 * Everything below is for `/ovaloffice/xps` and nothing else reads it. It is
 * deliberately the *opposite* list from the store's: a document that will not
 * parse gets a row here with its problems where its name would be, exactly as
 * `/xp` does, because an operator is the person who can fix that and a file
 * that quietly stops being listed is the hardest kind of missing to notice.
 */
export interface BuiltinRow {
  id: string
  /** The document's own name, or the id when it could not be read. */
  name: string
  blurb: string | null
  /** `/xp/shots/<id>.png` when the rasteriser has drawn one. */
  cover: string | null
  published: boolean
  /** True when an operator has dropped a document in over the shipped one. */
  overridden: boolean
  /**
   * There is a file for this in the image.
   *
   * False for a level added here between deploys, and it is the one thing a
   * row can say that changes what happens next: what is on this shelf lives in
   * a table until somebody commits the file, and a redeploy of the same image
   * is not what makes it permanent.
   */
  shipped: boolean
  /** Problems from `parseXp`, empty when it is fine. */
  problems: string[]
  /** What is being served, in bytes - the override's size when overridden. */
  bytes: number
  /** The file's mtime, or the override's, whichever is being served. */
  updatedAt: string
  /** A cartridge rather than a level. Framed documents are only ever ours. */
  framed: boolean
  /** What the document refuses to open without - `identity`, `arbiter`, … */
  needs: string[]
  pieces: number
  things: number
}

/**
 * Every level we ship, with what the operator has said about it.
 *
 * The disk is the spine: a row exists for each file, and the overlay is folded
 * onto it. An overlay row whose file has gone - a level deleted from the repo
 * with its switch left behind - is listed too, marked as having no file, so the
 * stale row can be seen and cleared rather than sitting invisible in a table.
 */
export async function listBuiltinsForOperator(supabase: Client): Promise<BuiltinRow[]> {
  const [covers, overlays] = await Promise.all([builtinCovers(), readBuiltinOverlays(supabase)])

  const shipped = new Set(await listShippedIds())
  const ids = await listBuiltinIds(overlays)

  const rows = await Promise.all(
    ids.map(async (id) => {
      const overlay = overlays.get(id)

      // What is *served* is what the row is about, so an override is described
      // rather than the file it stands in front of - an operator looking at this
      // list wants to know what a player is getting.
      if (overlay?.document) {
        return describe(id, overlay.document, [], covers, overlay, {
          bytes: overlay.bytes ?? 0,
          updatedAt: overlay.updatedAt,
          shipped: shipped.has(id),
        })
      }

      try {
        const full = path.join(XPS_DIR, `${id}${SUFFIX}`)
        const [raw, stats] = await Promise.all([readFile(full, 'utf8'), stat(full)])
        const parsed = parseXp(JSON.parse(raw))
        const where = { bytes: stats.size, updatedAt: stats.mtime.toISOString(), shipped: true }
        return parsed.ok
          ? describe(id, parsed.document, [], covers, overlay, where)
          : describe(id, null, parsed.problems.map(sentence), covers, overlay, where)
      } catch {
        return describe(id, null, ['could not be read'], covers, overlay, {
          bytes: 0,
          updatedAt: overlay?.updatedAt ?? new Date(0).toISOString(),
          shipped: shipped.has(id),
        })
      }
    }),
  )

  // Stale switches last: a row left behind by a level that has since been
  // deleted from the repo. It has nothing to open, and the only useful thing to
  // do with it is clear it - which is why it is listed rather than skipped.
  const stale: BuiltinRow[] = []
  for (const [id, overlay] of overlays) {
    if (shipped.has(id) || overlay.document) continue
    stale.push(
      describe(id, null, ['nothing ships under this id, and nothing was put in its place'], covers, overlay, {
        bytes: 0,
        updatedAt: overlay.updatedAt,
        shipped: false,
      }),
    )
  }

  return [...rows, ...stale]
}

/** One `parseXp` problem as a line an operator can read. */
function sentence(problem: { at: string; message: string }): string {
  return problem.at ? `${problem.at}: ${problem.message}` : problem.message
}

function describe(
  id: string,
  document: XpDocument | null,
  problems: string[],
  covers: Map<string, string>,
  overlay: BuiltinOverlay | undefined,
  where: { bytes: number; updatedAt: string; shipped: boolean },
): BuiltinRow {
  return {
    id,
    name: document?.name ?? id,
    blurb: document?.blurb ?? null,
    cover: covers.get(id) ?? null,
    published: overlay?.published ?? true,
    overridden: Boolean(overlay?.document),
    shipped: where.shipped,
    problems,
    bytes: where.bytes,
    updatedAt: where.updatedAt,
    framed: document?.frame !== undefined,
    needs: [...(document?.backend?.needs ?? [])],
    pieces: document?.world.placements.length ?? 0,
    things: document?.entities.length ?? 0,
  }
}
