import 'server-only'
import {
  type Capability,
  type Finish,
  type Preset,
  type Sides,
  isCapability,
  isFinish,
  isHue,
  isPreset,
  isSides,
  parseXp,
  playersOf,
} from '@kxb/xp'
import type { XpDocument } from '@kxb/xp'
import type { HostCapability } from '@kxb/xp/host'
import {
  builtinIsPublished,
  listBuiltinIds,
  NO_OVERLAY,
  readBuiltinDocument,
  readBuiltinOverlays,
  readShippedDocument,
  type BuiltinOverlays,
} from '@/domain/xps/builtins'
import { builtinCovers, projectCover } from '@/domain/xps/covers'
import { type XpRef, formatXpRef, parseXpRef } from '@/domain/xps/ref'
import type { Client } from '@/es/store'

/**
 * Every XP a place in this space may be played inside.
 *
 * ---------------------------------------------------------------------------
 * The gap this closes
 * ---------------------------------------------------------------------------
 * The battle wizard listed the five documents under `public/xp/xps/`, read off
 * disk, and the match room opened the same directory again to play one. Both
 * were written when an XP was a file and only a file - so the moment a space
 * could make its own, the two halves of the product stopped meeting: a project
 * somebody had just built, or one published to the store, could be opened in
 * the editor and nowhere else. docs/xp/backlog.md §11.5.
 *
 * This is the join. One list, three sources, one way to name a member of it -
 * `domain/xps/ref.ts` - so a place stores a reference and neither the wizard
 * nor the match room has to know which kind it got.
 *
 * | Source | Where from | Which version |
 * |---|---|---|
 * | `builtin` | `public/xp/xps/`, over the `builtin_xps` overlay | The file on disk, or what an operator put in its place |
 * | `space` | This space's own projects | `current_version` — drafts included |
 * | `store` | Published, from anywhere | `published_version` |
 *
 * ---------------------------------------------------------------------------
 * Drafts are in the list, and that is the point of the space half
 * ---------------------------------------------------------------------------
 * `docs/xp/backend.md` §8.1 draws exactly this line for the two browse pages:
 * the public one is a shop window and the in-space one is a workbench, mostly
 * unfinished. A picker inside a space is the workbench - the first thing
 * anybody does after building a level is get three people into it, and telling
 * them to publish it first would mean review before playtest.
 *
 * What keeps that safe is that it is not this module's decision. Both queries
 * go through RLS, which already knows that a project is private to its owner
 * until `space_policy` says otherwise (§7.4). A member who may not open a
 * project in the editor does not see it here either, because the same policy
 * refuses the same row.
 *
 * ---------------------------------------------------------------------------
 * Why the picker does not read documents
 * ---------------------------------------------------------------------------
 * A picker needs six fields and a document is up to 128MB of level. Listing
 * twenty of them by parsing twenty documents would make the battle hub the
 * slowest page in the app, to render a list of names.
 *
 * So the summary is assembled from the read model - which already carries the
 * name, the blurb and the version - plus two JSON paths pulled out of
 * `xp_versions` by Postgres rather than by us. `rules` and `capabilities` are
 * small objects at the root of every document, and selecting them costs one
 * query for the whole page.
 *
 * They are re-validated on the way in even though `parseXp` checked them on the
 * way out. Not distrust of the row: `document->rules` is a JSON path into a
 * column, and if a later format version moves or renames that block this reads
 * `undefined` rather than a preset. Coercing here means a document from the
 * future is listed with default rules instead of a `preset` of `undefined`
 * rendered into the page.
 *
 * The **document itself is parsed on load**, which is where it matters: nothing
 * here is trusted to be playable, and `loadPlayableXp` refuses anything
 * `parseXp` refuses, exactly as the disk read always did.
 */

/** One row of the picker. `ref` is what a place stores. */
export interface PlayableXp {
  ref: string
  name: string
  blurb: string | null
  /**
   * The level's own picture, as a URL, or null.
   *
   * On the summary rather than fetched per row, because the shelf draws one on
   * every cartridge and a request per level is how a picker becomes the slowest
   * thing on a page - the same call `copiedFrom` above made. Where it comes
   * from differs by source and `domain/xps/covers.ts` is the only place that
   * knows: a shot on disk for a builtin, a guarded route into the project's own
   * files for anything a space made.
   */
  cover: string | null
  /**
   * What the level says its cartridge is made of, or null.
   *
   * Null rather than `'plastic'` so a surface can tell "the author chose
   * plastic" from "the author never said" - which matters to the editor's own
   * picker and to nothing else, but is free to keep and impossible to recover
   * once thrown away.
   */
  finish: Finish | null
  /**
   * The shell's colour, or null for "the level did not say".
   *
   * Null rather than a derived number, so a surface can tell an authored red
   * from a hashed one - and so the hash stays where it belongs, in the renderer
   * that knows how wide the wheel is. See `hueFor`.
   */
  hue: number | null
  source: 'builtin' | 'space' | 'store'
  /**
   * Nothing published stands behind this one.
   *
   * Only ever true for `space`, and it is the difference between "play the
   * level we shipped" and "play the level I saved four minutes ago". A host
   * picking one should know which - a draft is allowed to be half a level, and
   * finding that out with five people in the room is the bad version.
   */
  draft: boolean
  /**
   * The project this one was copied from, when it is a copy.
   *
   * The whole of docs/xp/backlog.md §1c's second half: a surface that knows
   * which level a room plays can tell which of these were *made for it*, and
   * an offer somebody can find is the difference between the flow that entry
   * describes and a draft buried among every project in the space.
   *
   * Carried on the row rather than fetched per entry, because this list is
   * already one query and a second one per project is how a picker becomes the
   * slowest thing on a page. Always null for a builtin, which has no row to
   * have been copied from.
   */
  copiedFrom: string | null
  preset: Preset
  /**
   * How the room is divided, when the document said so.
   *
   * **Declared only, never derived**, which is the one thing about this field
   * worth knowing: absent in the document means "read it off the team spawn
   * marks" (see `sidesOf`), and this summary is two JSON paths into a column
   * rather than a parsed world - it has no marks to read. So `null` here means
   * "the level did not say", and a surface printing it says nothing rather
   * than guessing.
   *
   * The match a level opens is *not* decided from this: `createBattle` loads
   * the whole document and asks `battleModeFor`, which can derive. Two
   * questions, each answered where its data is.
   */
  sides: Sides | null
  scoreLimit: number | null
  /** Seconds, from the document. Not the minutes the xo wizard deals in. */
  timeLimit: number | null
  /**
   * How many people the level is for, with the absent halves filled in.
   *
   * Resolved through `playersOf` here rather than passed on raw, so every
   * reader gets two numbers and none of them has to know what absent means. A
   * room opened for this level takes its capacity from `max`.
   */
  players: { min: number; max: number }
  capabilities: Capability[]
  /**
   * Whether this is a cartridge rather than a level.
   *
   * A framed document names a game the host runs instead of describing a world
   * - see `packages/xp/src/document/frame.ts`. Every surface that lists levels
   * treats the two the same on purpose, which is the whole point of the format,
   * and there is exactly one question where they part: **what may schedule
   * this**. A level with no `match` capability is still a world people can be
   * in together, and half the shelf is opened as a room that way; a cartridge
   * with no `match` is a game that has no match in it, and offering one is
   * offering a fight in somebody's kitchen. See the refusal in `createBattle`,
   * which is the boundary - this is what stops the card being offered at all.
   */
  framed: boolean
  /**
   * A document whose content is p5.js source, run in a container - see
   * docs/xp/sketch.md. Read off the document for a builtin and off a JSON
   * path for a project, so a picker can badge the kind before anything is
   * opened.
   */
  sketch: boolean
}

/**
 * How many database projects the picker will show.
 *
 * A cap rather than a page, because this is a list somebody scans in one look -
 * and it is *not silent*: `listPlayableXps` returns what it left out, so the
 * surface can say "and 9 more, in Browse" instead of quietly being wrong about
 * what the space has. Newest first, so the cap falls on the ones least likely
 * to be the reason somebody opened the wizard.
 */
export const PICKER_LIMIT = 24

export interface PlayableList {
  xps: PlayableXp[]
  /** Projects the cap left out. Zero unless the space has more than the cap. */
  hidden: number
}

/**
 * One of the documents we ship, with the two things only a *parsed* one knows.
 *
 * The picker's summary is assembled from a read model and two JSON paths - see
 * the header - and it is deliberately thin because it has twenty rows to build
 * from a database. A builtin is a file that was read and parsed to be listed at
 * all, so the fields below are already in hand, and a shelf that shows them
 * costs nothing extra.
 */
export interface BuiltinXp extends PlayableXp {
  /**
   * The file's own name, without the extension - `steal-a-plant`.
   *
   * Not the same string as `ref`, which spells the *kind* as well and is what a
   * room stores. This is what a person sees in a URL and what a copy of this
   * level would say it came from, so it is carried rather than re-parsed out of
   * the reference by whoever needs it.
   */
  id: string
  /**
   * What the document refuses to open without.
   *
   * On the card because of the level this was built for. `steal-a-plant` needs
   * `persistence`, a builtin is a file rather than a row, and `xpStore` answers
   * null for anything that is not a saved project - so that level cannot be
   * played *as a builtin at all*, on any screen, by construction. It said so
   * only after somebody opened it and got a page reading "Not here".
   *
   * A shelf that prints what a level asks for turns that into something you
   * know before you press it. See `describeNeed`.
   */
  needs: HostCapability[]
}

/**
 * What a room can offer one of these lives in `./room`.
 *
 * Not here, and not for a tidy reason: a `'use client'` shelf reads that
 * constant, and this module is `server-only` and reads the filesystem - so
 * importing a *value* out of here from the browser graph pulls
 * `node:fs/promises` into a client bundle and fails the production build. See
 * the note there; it is the one thing about this file worth knowing before
 * adding an export to it.
 */


/**
 * The documents we ship.
 *
 * A document that no longer parses is left out rather than listed and then
 * refused at the door - the rule the battle hub already had, kept.
 */
export async function listBuiltinXps(
  /**
   * Read the operator's overlay with this. Absent means "the disk, whole" -
   * see `domain/xps/builtins.ts` for why that is the default and where it is
   * the right one (the tests, and the operator catalogue at `/xp`).
   */
  overlays: BuiltinOverlays = NO_OVERLAY,
): Promise<BuiltinXp[]> {
  try {
    // The union rather than the directory - see `listBuiltinIds`: a level put in
    // between deploys has no file yet and is still on the shelf.
    const [ids, covers] = await Promise.all([listBuiltinIds(overlays), builtinCovers()])

    const found = await Promise.all(
      ids.map(async (id) => {
        const overlay = overlays.get(id)

        // Off the shelf. The picker is a list of things to press, so an
        // unlisted level is absent rather than greyed out.
        if (overlay && !overlay.published) return null
        try {
          // An override stands in for the file, so the shelf describes what a
          // room would actually open rather than what shipped.
          const document = overlay?.document ?? (await readShippedDocument(id))
          if (!document) return null
          return {
            ...summarise(
              formatXpRef({ kind: 'builtin', id }),
              'builtin',
              false,
              document.name,
              document.blurb ?? null,
              covers.get(id) ?? null,
              document.finish ?? null,
              document.hue ?? null,
              document.rules,
              document.capabilities,
              document.frame !== undefined,
              document.sketch !== undefined,
            ),
            id,
            needs: [...(document.backend?.needs ?? [])],
          }
        } catch {
          return null
        }
      }),
    )

    return found.filter((entry) => entry !== null)
  } catch {
    return []
  }
}

export type SummaryRow = {
  id: string
  tenant_id: string
  name: string
  blurb: string | null
  cover_path: string | null
  state: string
  current_version: number
  published_version: number | null
  copied_from: string | null
  updated_at: string
}

/**
 * Everything in the database this space may play, newest first.
 *
 * Two queries and no join, because the two halves ask different questions and
 * PostgREST would need an `or` across a boolean and a foreign key to fold them
 * into one. The dedup is on `id`, and the space's own row wins: a project this
 * space published is still this space's, and playing the draft you are working
 * on is the answer somebody in the space wants.
 */
async function listProjects(
  supabase: Client,
  tenantId: string,
): Promise<{ rows: SummaryRow[]; hidden: number }> {
  const COLUMNS =
    'id, tenant_id, name, blurb, cover_path, state, current_version, published_version, copied_from, updated_at'

  const [mine, published] = await Promise.all([
    supabase
      .from('xps_read_model')
      .select(COLUMNS)
      .eq('tenant_id', tenantId)
      .not('state', 'in', '("archived","removed")')
      .order('updated_at', { ascending: false })
      .limit(PICKER_LIMIT + 1),
    supabase
      .from('xps_read_model')
      .select(COLUMNS)
      .eq('state', 'published')
      .order('updated_at', { ascending: false })
      .limit(PICKER_LIMIT + 1),
  ])

  if (mine.error) throw new Error(`Failed to list this space's XPs: ${mine.error.message}`)
  if (published.error) {
    throw new Error(`Failed to list published XPs: ${published.error.message}`)
  }

  const seen = new Set<string>()
  const rows: SummaryRow[] = []

  for (const row of [...(mine.data ?? []), ...(published.data ?? [])] as SummaryRow[]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    rows.push(row)
  }

  rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return { rows: rows.slice(0, PICKER_LIMIT), hidden: Math.max(0, rows.length - PICKER_LIMIT) }
}

/**
 * Which version of a project a place would play.
 *
 * The space's own gets `current_version`, so a level being worked on can be
 * playtested. Everybody else's gets `published_version` and nothing else -
 * `readXpVersion`'s note applies here for the same reason: a helper that
 * resolved "latest" would eventually be called from a public surface, which is
 * how a draft gets served to a stranger.
 *
 * **Zero is not a version, it is the absence of one.** `current_version`
 * starts at zero and only reaches one on a first save (`edit.ts`'s "versions
 * count up from one") - so a project fresh from `/browse/new` that nobody has
 * saved yet would otherwise pass this as `0`, `formatXpRef` would spell it
 * `p-<uuid>-v0`, and that reference would sit in the picker and be pinnable to
 * a room even though no document has ever been stored under it. The room
 * would then be permanently "not open" - the level cannot be taken down and
 * played again, because it was never up. Treating zero as null keeps a
 * just-created project off the list until there is something in it to play.
 */
export function versionFor(row: SummaryRow, tenantId: string): number | null {
  if (row.tenant_id === tenantId) return row.current_version > 0 ? row.current_version : null
  return row.state === 'published' ? row.published_version : null
}

export async function listPlayableXps(
  supabase: Client,
  tenantId: string,
  /** `xpOpen()`. False empties the list, which switches the feature off downstream. */
  enabled: boolean,
): Promise<PlayableList> {
  if (!enabled) return { xps: [], hidden: 0 }

  const overlays = await readBuiltinOverlays(supabase)

  const [builtins, projects] = await Promise.all([
    listBuiltinXps(overlays),
    listProjects(supabase, tenantId),
  ])

  const wanted = projects.rows
    .map((row) => ({ row, version: versionFor(row, tenantId) }))
    .filter((entry): entry is { row: SummaryRow; version: number } => entry.version !== null)

  const summaries = await readSummaries(
    supabase,
    wanted.map((entry) => entry.row.id),
  )

  const fromDatabase = wanted.map(({ row, version }) => {
    const summary = summaries.get(`${row.id}@${version}`)
    return summarise(
      formatXpRef({ kind: 'project', xpId: row.id, version }),
      row.tenant_id === tenantId ? 'space' : 'store',
      row.published_version === null || row.published_version !== version,
      row.name,
      row.blurb,
      projectCover(row.id, row.cover_path),
      summary?.finish ?? null,
      summary?.hue ?? null,
      summary?.rules,
      summary?.capabilities,
      /*
       * Never, and it is asserted rather than read.
       *
       * `xp_versions` holds what the editor saved and what a copy put there,
       * and neither can be a cartridge: `remixXp` and `duplicateXp` both refuse
       * a framed document by name - *"a game rather than a level, so there is
       * nothing to remix"* - and the editor cannot author a `frame` block at
       * all. So the only framed documents in this product are the files under
       * `public/xp/xps/`, which is the branch above.
       *
       * Read from the row rather than asserted here the day that stops being
       * true. It costs one more JSON path in `readSummaries`; what it would buy
       * today is a column of `false`. The refusal in `createBattle` loads the
       * whole document and does not depend on this either way.
       */
      false,
      // Unlike `framed`, this one *is* read from the row: a space makes a
      // sketch project from the p5 starter, so "never" was false on day one.
      summary?.sketch ?? false,
      row.copied_from,
    )
  })

  return { xps: [...fromDatabase, ...builtins], hidden: projects.hidden }
}

/**
 * The two small blocks, without the level they sit on.
 *
 * Keyed by `id@version` because a project can appear once and only once, but
 * the query cannot ask for pairs - so it asks for the ids and this drops the
 * versions nobody wanted. Cheaper than one round trip per project, which is
 * what the obvious `Promise.all` over `readXpVersion` would have been.
 */
async function readSummaries(
  supabase: Client,
  ids: string[],
): Promise<
  Map<string, { rules: unknown; capabilities: unknown; finish: Finish | null; hue: number | null; sketch: boolean }>
> {
  const out = new Map<
    string,
    { rules: unknown; capabilities: unknown; finish: Finish | null; hue: number | null; sketch: boolean }
  >()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('xp_versions')
    .select(
      'xp_id, version, rules:document->rules, capabilities:document->capabilities, finish:document->>finish, hue:document->>hue, engine:document->sketch->>engine',
    )
    .in('xp_id', ids)

  if (error) throw new Error(`Failed to read what those XPs are: ${error.message}`)

  for (const row of (data ?? []) as {
    xp_id: string
    version: number
    rules: unknown
    capabilities: unknown
    /** `->>` so this arrives as text rather than as a JSON string with quotes. */
    finish: unknown
    /** And the same, which is why it has to be parsed back to a number below. */
    hue: unknown
    /** The sketch block's engine, or null - presence is the fact wanted. */
    engine: unknown
  }[]) {
    out.set(`${row.xp_id}@${row.version}`, {
      rules: row.rules,
      capabilities: row.capabilities,
      // Read off a JSON column, so this is whatever was stored rather than
      // whatever the type says - a document saved by an older editor, or by
      // hand, can have anything here. Anything unrecognised is "never said".
      finish: isFinish(row.finish) ? row.finish : null,
      // `->>` hands back text, so this is a string on the way in. `Number` on
      // an empty string is zero - which is red - so the guard is on the raw
      // value being a non-empty string before it is parsed at all.
      hue: readHue(row.hue),
      // Presence, not the name: any engine at that path means the project
      // is code rather than a world, which is all a picker needs to say.
      sketch: typeof row.engine === 'string' && row.engine.length > 0,
    })
  }

  return out
}

/**
 * A hue off a JSON column, or null.
 *
 * The column is read with `->>`, so what arrives is text - and `Number('')` is
 * zero, which is a perfectly good hue and the wrong answer for a level that
 * never said. So the string is checked before it is parsed rather than after.
 */
function readHue(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const parsed = Number(raw)
  return isHue(parsed) ? parsed : null
}

/** Defaults matching `DEFAULT_RULES`, for a document that declares no block. */
function summarise(
  ref: string,
  source: PlayableXp['source'],
  draft: boolean,
  name: string,
  blurb: string | null,
  cover: string | null,
  finish: Finish | null,
  hue: number | null,
  rules: unknown,
  capabilities: unknown,
  /** See `PlayableXp.framed`. Only a builtin is ever one. */
  framed: boolean,
  /** See `PlayableXp.sketch`. Builtins and projects can both be one. */
  sketch: boolean,
  /** Null for a builtin, which has no row to have been copied from. */
  copiedFrom: string | null = null,
): PlayableXp {
  const block = (rules ?? {}) as {
    preset?: unknown
    sides?: unknown
    scoreLimit?: unknown
    timeLimit?: unknown
    players?: unknown
  }

  /*
   * Coerced before `playersOf` sees it, for the reason the header gives about
   * `rules`: this is a JSON path into a column, so the shape is whatever was
   * stored rather than whatever the type says. A garbled block reads as "the
   * level did not say", which is the same as every document written before the
   * field existed.
   */
  const declared = (block.players ?? {}) as { min?: unknown; max?: unknown }
  const whole = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

  return {
    ref,
    name,
    blurb,
    cover,
    finish,
    hue,
    source,
    draft,
    copiedFrom,
    preset: typeof block.preset === 'string' && isPreset(block.preset) ? block.preset : 'freestyle',
    sides: typeof block.sides === 'string' && isSides(block.sides) ? block.sides : null,
    scoreLimit: typeof block.scoreLimit === 'number' ? block.scoreLimit : null,
    timeLimit: typeof block.timeLimit === 'number' ? block.timeLimit : null,
    players: playersOf({
      preset: 'freestyle',
      players: { ...(whole(declared.min) ? { min: whole(declared.min) } : {}),
        ...(whole(declared.max) ? { max: whole(declared.max) } : {}) },
    }),
    framed,
    sketch,
    capabilities: Array.isArray(capabilities)
      ? capabilities.filter((entry): entry is Capability =>
          typeof entry === 'string' && isCapability(entry),
        )
      : [],
  }
}

/**
 * The document a place is playing, parsed.
 *
 * Every caller is a page about to render a canvas, so the answer is a document
 * or `null` and never a throw: a document that will not load is a page saying
 * so rather than a black canvas, which is the answer the creator's own route
 * gives and the screen somebody hand-editing a level will meet.
 *
 * **`tenantId` is not decoration.** A reference is a string in a row, and rows
 * are written by clients; without it, a battle in space A could name a private
 * draft in space B and this would happily open it. The read goes through the
 * caller's own client so RLS decides, and the tenant is checked again here so
 * that a project *visible* to somebody - because they own it, in another space
 * entirely - is still not playable in a place that has nothing to do with it.
 */
export async function loadPlayableXp(
  supabase: Client,
  tenantId: string,
  reference: string,
): Promise<XpDocument | null> {
  const ref = parseXpRef(reference)
  if (!ref) return null

  return ref.kind === 'builtin'
    ? loadBuiltin(supabase, ref.id)
    : loadProject(supabase, tenantId, ref)
}

/**
 * One of ours, as it stands right now.
 *
 * The overlay is read here rather than passed in because this is the *play*
 * path and it is reached one level at a time - a room opening, a page loading -
 * where a listing's "read the table once for twenty rows" argument does not
 * apply. What it buys is that a level taken off the shelf stops opening, rather
 * than merely stopping being offered: a room pinned to it before it was pulled
 * says "not open" instead of quietly carrying on.
 */
async function loadBuiltin(supabase: Client, id: string): Promise<XpDocument | null> {
  const overlays = await readBuiltinOverlays(supabase)
  if (!builtinIsPublished(overlays, id)) return null

  return readBuiltinDocument(id, overlays)
}

async function loadProject(
  supabase: Client,
  tenantId: string,
  ref: Extract<XpRef, { kind: 'project' }>,
): Promise<XpDocument | null> {
  const { data: project, error } = await supabase
    .from('xps_read_model')
    .select('id, tenant_id, state, published_version')
    .eq('id', ref.xpId)
    .maybeSingle()

  if (error || !project) return null

  // Somebody else's project is playable at exactly one version - the one they
  // published. Ours is playable at any version we have, which is what makes a
  // playtest of an unpublished draft possible.
  const mine = project.tenant_id === tenantId
  if (!mine && !(project.state === 'published' && project.published_version === ref.version)) {
    return null
  }

  const { data: version } = await supabase
    .from('xp_versions')
    .select('document')
    .eq('xp_id', ref.xpId)
    .eq('version', ref.version)
    .maybeSingle()

  if (!version) return null

  const parsed = parseXp(version.document)
  return parsed.ok ? parsed.document : null
}

/**
 * Is this reference one a place in this space may point at?
 *
 * The check `createBattle` makes before writing the id down, and it is a real
 * read rather than a shape test for the reason the disk `access()` it replaces
 * was: a match created against a document that does not exist is a match that
 * loads a page saying so, in front of everybody who joined it.
 */
export async function playableExists(
  supabase: Client,
  tenantId: string,
  reference: string,
): Promise<boolean> {
  return (await loadPlayableXp(supabase, tenantId, reference)) !== null
}
