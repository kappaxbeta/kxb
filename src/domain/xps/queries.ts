import 'server-only'
import { hiddenAmong } from '@/domain/moderation/hidden'
import { repairXp, isFinish, isHue, type Finish } from '@kxb/xp'
import { HOST_CAPABILITIES, type HostCapability } from '@kxb/xp/host'
import type { XpSpacePolicy, XpState } from '@/domain/xps/events'
import type { Client } from '@/es/store'

/**
 * The read side.
 *
 * Read models only, never a replay - the rule `architecture.md` §5 states for
 * every `queries.ts` in this codebase.
 *
 * The shape these return is deliberately the same seven-ish fields
 * `src/domain/xps/catalogue.ts` already returns from disk, because the public
 * store was built against that a week before this table existed. Filling the
 * same shape is what lets the store swap its source without a page changing,
 * and it is why the summary was narrower than the document in the first place.
 */

export interface XpProjectRow {
  id: string
  tenantId: string
  ownerId: string | null
  name: string
  blurb: string | null
  state: XpState
  spacePolicy: XpSpacePolicy
  /**
   * Coins somebody else pays: to play it once, and to take a copy.
   *
   * Both `0` until an owner says otherwise. `docs/product/economy.md` §9.
   */
  priceOnce: number
  priceRemix: number
  currentVersion: number
  publishedVersion: number | null
  coverPath: string | null
  bytes: number
  updatedAt: string
}

/**
 * `plays` is gone from here, and it was never a number.
 *
 * The column exists on `xps_read_model` and **nothing has ever written to it**,
 * so every project carried a `plays: 0` that read exactly like a real figure —
 * which is how the backoffice review queue came to sort by it and print it for
 * a year. How much a world was played is `domain/xps/plays.ts` now, out of the
 * session log, and a second thing of the same name in reach of a page is the
 * whole reason that bug was possible.
 *
 * The column itself is still there. Dropping it is one line and belongs after
 * this is deployed, not beside it: migrations reach production through
 * `db-push-prod.sh`, which is a separate hand, so a schema that has lost the
 * column while an image still selecting it is running is a five-hundred on the
 * space library.
 */
const COLUMNS =
  'id, tenant_id, owner_id, name, blurb, state, space_policy, price_once, price_remix, current_version, published_version, cover_path, bytes, updated_at'

type Row = {
  id: string
  tenant_id: string
  owner_id: string | null
  name: string
  blurb: string | null
  state: string
  space_policy: string
  price_once: number | null
  price_remix: number | null
  current_version: number
  published_version: number | null
  cover_path: string | null
  bytes: number
  updated_at: string
}

const toProject = (row: Row): XpProjectRow => ({
  id: row.id,
  tenantId: row.tenant_id,
  ownerId: row.owner_id,
  name: row.name,
  blurb: row.blurb,
  state: row.state as XpState,
  spacePolicy: row.space_policy as XpSpacePolicy,
  // Null for a row written before levels could be priced. Free, which is what
  // those levels were.
  priceOnce: row.price_once ?? 0,
  priceRemix: row.price_remix ?? 0,
  currentVersion: row.current_version,
  publishedVersion: row.published_version,
  coverPath: row.cover_path,
  bytes: Number(row.bytes),
  updatedAt: row.updated_at,
})

/**
 * What is in one space's library.
 *
 * Drafts included, which is the whole difference between this and the public
 * store: a workbench is mostly unfinished work. RLS decides what comes back -
 * a member sees the space's projects, and `space_policy` decides whether they
 * may open one.
 */
export async function listSpaceXps(
  supabase: Client,
  tenantId: string,
): Promise<XpProjectRow[]> {
  const { data, error } = await supabase
    .from('xps_read_model')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .not('state', 'in', '("archived","removed")')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to list this space's projects: ${error.message}`)
  return (data ?? []).map((row) => toProject(row as Row))
}

/**
 * Everything one account owns, wherever it lives.
 *
 * One query rather than a fan-out across every space somebody belongs to, which
 * is the entire reason `owner_id` is a column on the row rather than a fact
 * inside the log. docs/xp/backend.md §7.6.
 */
export async function listOwnedXps(
  supabase: Client,
  ownerId: string,
): Promise<XpProjectRow[]> {
  const { data, error } = await supabase
    .from('xps_read_model')
    .select(COLUMNS)
    .eq('owner_id', ownerId)
    .not('state', 'eq', 'archived')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to list your projects: ${error.message}`)
  return (data ?? []).map((row) => toProject(row as Row))
}

/**
 * The public store. Published only, and readable signed out.
 *
 * The one XP listing that is filtered for takedowns, and the split is
 * `banned_worlds`' rule applied honestly: taking something down removes it from
 * where strangers meet it, and does not confiscate it from the person who made
 * it. `listSpaceXps` and `listOwnedXps` are the author's own shelves and stay
 * as they were - what an author sees is that nobody else can see it.
 */
export async function listPublishedXps(supabase: Client): Promise<XpProjectRow[]> {
  const { data, error } = await supabase
    .from('xps_read_model')
    .select(COLUMNS)
    .eq('state', 'published')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to list published projects: ${error.message}`)

  const rows = data ?? []
  const down = await hiddenAmong(supabase, rows.map((row) => (row as Row).id))
  return rows.filter((row) => !down.has((row as Row).id)).map((row) => toProject(row as Row))
}

/** One project, or null when the caller may not see it. RLS decides, not this. */
export async function findXpProject(
  supabase: Client,
  xpId: string,
): Promise<XpProjectRow | null> {
  const { data, error } = await supabase
    .from('xps_read_model')
    .select(COLUMNS)
    .eq('id', xpId)
    .maybeSingle()

  /*
   * A segment that is not a uuid is not a project.
   *
   * Postgres says so by refusing the cast (22P02), and reported it as a 500
   * from `generateMetadata` - which is what `/t/<space>/browse/create` was:
   * somebody guessing the verb where the route wants an id. That guess deserves
   * the page that says "not found", not a stack trace, and the caller already
   * knows what to do with a miss.
   *
   * Read from the error code rather than by testing the shape of the string
   * first, because the alternative is a second definition of "uuid" living in
   * TypeScript beside the column's own.
   */
  if (error?.code === '22P02') return null
  if (error) throw new Error(`Failed to read that project: ${error.message}`)
  return data ? toProject(data as Row) : null
}

export interface XpVersionRow {
  version: number
  document: unknown
  manifest: Record<string, { sha: string; bytes: number; mime: string }>
  bytes: number
  files: number
  createdAt: string
  /**
   * What `repairXp` moved forward on the way out of the column, if anything.
   *
   * Empty for every document saved under the parser that is running, which is
   * almost all of them. A caller that shows it is showing somebody why their
   * file is about to be saved differently from how it went in; a caller that
   * ignores it loses nothing, because the repair has already happened.
   */
  repairs: string[]
}

/**
 * One saved version.
 *
 * The caller says which, and there are exactly two callers who should:
 * the editor asks for `current_version` and the store asks for
 * `published_version`. Nothing resolves "latest" here on purpose - a helper
 * that guessed would eventually be called from the store, which is how a draft
 * gets served to the public.
 *
 * ---------------------------------------------------------------------------
 * Why the repair pass is here and not at each reader
 * ---------------------------------------------------------------------------
 * Because this is the one door. The editor, the project page, the export zip
 * and the copy-to-another-space all come through here, and a rule that arrived
 * after a document was saved has to reach all four or it reaches none of them
 * usefully - a project that opens in the editor and exports as a file nothing
 * will load is not repaired, it is repaired in one window.
 *
 * `parseXp` stays strict on the other side of it. See `@kxb/xp`'s `./repair`:
 * this moves a document to the rules the parser has today, and the parser is
 * still the thing that says no.
 */
export async function readXpVersion(
  supabase: Client,
  xpId: string,
  version: number,
): Promise<XpVersionRow | null> {
  const { data, error } = await supabase
    .from('xp_versions')
    .select('version, document, manifest, bytes, files, created_at')
    .eq('xp_id', xpId)
    .eq('version', version)
    .maybeSingle()

  if (error) throw new Error(`Failed to read that version: ${error.message}`)
  if (!data) return null

  const repaired = repairXp(data.document)

  return {
    version: data.version,
    document: repaired.document,
    repairs: repaired.repairs,
    manifest: (data.manifest ?? {}) as XpVersionRow['manifest'],
    // The stored number, deliberately, even when the document above is not
    // byte-for-byte what was stored. This is what the save was billed at and
    // what the space's usage adds up from; a repair is not a save.
    bytes: Number(data.bytes),
    files: data.files,
    createdAt: data.created_at,
  }
}

/**
 * Which of these hashes does this space already hold?
 *
 * The server half of the save handshake: the editor sends a manifest, this
 * answers what is already here, and the editor uploads only the rest. An
 * unchanged 16MB model is never sent twice, which is what makes a save on a
 * 40MB project move two kilobytes.
 *
 * Only `clean` rows count. A blob still in quarantine is one the serving route
 * would refuse anyway, so treating it as held would produce a version that
 * cannot be loaded.
 */
export async function heldShas(
  supabase: Client,
  tenantId: string,
  shas: string[],
): Promise<Set<string>> {
  if (shas.length === 0) return new Set()

  const { data, error } = await supabase
    .from('xp_files')
    .select('sha')
    .eq('tenant_id', tenantId)
    .eq('scan_status', 'clean')
    .in('sha', shas)

  if (error) throw new Error(`Failed to check what is already stored: ${error.message}`)
  return new Set((data ?? []).map((row) => row.sha))
}

/**
 * What a space is holding, for the byte quota.
 *
 * Summed over distinct blobs, so a model used by four projects is counted once
 * — which is the honest bill, because it is stored once.
 */
export async function spaceXpBytes(supabase: Client, tenantId: string): Promise<number> {
  const { data, error } = await supabase
    .from('xp_files')
    .select('bytes')
    .eq('tenant_id', tenantId)
    .eq('scan_status', 'clean')

  if (error) throw new Error(`Failed to total this space's files: ${error.message}`)
  return (data ?? []).reduce((sum, row) => sum + Number(row.bytes), 0)
}

export interface XpRelease {
  version: number
  releasedAt: string
  releasedBy: string | null
  withdrawnAt: string | null
  withdrawnReason: string | null
}

/**
 * What this project has shipped, newest first.
 *
 * The release picker, and the answer to "what can I go back to". Every row here
 * has been through review, which is why moving between them is the owner's to
 * do without asking us again.
 *
 * Not public: a stranger playing a published project has no business knowing it
 * shipped four times and pulled one of them. `xp_releases_select` is what
 * enforces that; this just reads.
 */
export async function listReleases(
  supabase: Client,
  xpId: string,
): Promise<XpRelease[]> {
  const { data, error } = await supabase
    .from('xp_releases')
    .select('version, released_at, released_by, withdrawn_at, withdrawn_reason')
    .eq('xp_id', xpId)
    .order('version', { ascending: false })

  if (error) throw new Error(`Failed to list releases: ${error.message}`)

  return (data ?? []).map((row) => ({
    version: row.version,
    releasedAt: row.released_at,
    releasedBy: row.released_by,
    withdrawnAt: row.withdrawn_at,
    withdrawnReason: row.withdrawn_reason,
  }))
}

export interface XpStoreLine {
  xpId: string
  xpName: string
  scope: 'player' | 'shared' | 'space'
  rows: number
  bytes: number
  /** Field names, for the space's shared row only. Never a player's. */
  keys: string[] | null
  lastWrite: string
}

/**
 * What is stored under this space — sizes and keys, never contents.
 *
 * docs/xp/state.md §7.5, Reading A. The owner-facing answer to "are our games
 * keeping something about the people who play them", which is a question a
 * space owner is entitled to ask and, until the store existed, could only guess
 * at.
 *
 * **It reads a function rather than the table, and that is the design.** §3.4
 * says an XP's owner cannot read a `player` row — they own the game, not the
 * people playing it — so the select policy refuses those rows, which also
 * refuses an aggregate over them. `xp_store_overview` is a `security definer`
 * that returns counts, bytes and a timestamp, plus field names for the space's
 * own row and never for a player's. The alternative — a policy that lets an
 * owner read player rows, and a promise that this page will only show totals —
 * is the arrangement that eventually shows them.
 *
 * Empty for a member who is not an owner or admin: this is the operator's
 * window onto stored personal data, and it belongs with whoever answers for it.
 */
export async function storeOverview(
  supabase: Client,
  tenantId: string,
): Promise<XpStoreLine[]> {
  const { data, error } = await supabase.rpc('xp_store_overview', { p_tenant: tenantId })

  if (error) throw new Error(`Failed to read this space's stores: ${error.message}`)

  return (data ?? []).map((row) => ({
    xpId: row.xp_id,
    xpName: row.xp_name,
    scope: row.scope as 'player' | 'shared' | 'space',
    rows: Number(row.rows),
    bytes: Number(row.bytes),
    keys: row.keys,
    lastWrite: row.last_write,
  }))
}

/**
 * What each of these levels asks of its host, for the browse page.
 *
 * docs/xp/state.md §7.7: an XP should say what it does with state *before*
 * somebody opens it — does it save, does saving need an account — so a player
 * chooses knowing rather than finds out by losing something.
 *
 * **Derived from `backend.needs` rather than from a new capability**, which is
 * the decision worth recording. `capabilities.ts` sets the bar itself: a
 * capability is a claim that gets *checked*, and "this XP saves" checked against
 * a document is unfalsifiable — the parser cannot see a script's future writes.
 * `backend.needs` is not a claim about the level, it is a requirement on the
 * host, and it is already enforced: `XpScene` refuses to open a level whose
 * needs it cannot meet. Reading the disclosure off the thing that already has
 * teeth means the card cannot say something the runtime disagrees with.
 *
 * Read out of the version document with a JSON path, the way `playable.ts`
 * already reads `rules` and `capabilities` — no projection column, nothing to
 * backfill, and a document that predates the block simply has none.
 */
export async function needsOf(
  supabase: Client,
  projects: readonly XpProjectRow[],
): Promise<Map<string, HostCapability[]>> {
  const out = new Map<string, HostCapability[]>()
  const live = projects.filter((project) => project.currentVersion > 0)
  if (live.length === 0) return out

  const { data, error } = await supabase
    .from('xp_versions')
    .select('xp_id, version, needs:document->backend->needs')
    .in(
      'xp_id',
      live.map((project) => project.id),
    )

  if (error) throw new Error(`Failed to read what those XPs ask for: ${error.message}`)

  const wanted = new Map(live.map((project) => [project.id, project.currentVersion]))
  for (const row of (data ?? []) as { xp_id: string; version: number; needs: unknown }[]) {
    // The query cannot ask for (id, version) pairs, so it asks for the ids and
    // this drops the versions nobody wanted - the same shape `readSummaries`
    // uses, and cheaper than one round trip per project.
    if (wanted.get(row.xp_id) !== row.version) continue
    if (!Array.isArray(row.needs)) continue

    /**
     * Narrowed here rather than trusted, even though `parseXp` refused anything
     * else on the way in.
     *
     * The document in `xp_versions` was validated by the parser *of the day it
     * was saved*, and this reads it back through a JSON path that bypasses the
     * parser entirely. A capability we have since renamed would otherwise reach
     * `describeNeed` as a string it has no case for.
     */
    const known = row.needs.filter((need): need is HostCapability =>
      HOST_CAPABILITIES.includes(need as HostCapability),
    )
    if (known.length > 0) out.set(row.xp_id, known)
  }

  return out
}

/**
 * What each project says its cartridge is made of, and what colour it is.
 *
 * The same shape as `needsOf` above and for the same reason: the browse page
 * draws a shelf of every project in the space, and one round trip per project
 * to read one string is how a page with twenty levels on it becomes the slowest
 * thing in the app. One query, filtered down to the versions anybody asked for.
 *
 * `->>` rather than `->`, so the value arrives as text instead of as a JSON
 * string with quotes still round it. And `isFinish` rather than a cast: the
 * document is a JSON column, so what comes back is whatever was stored - a
 * level saved by an older editor, or edited by hand, can have anything here.
 * Anything unrecognised is left out, which reads downstream as "it never said"
 * and draws as plastic in a colour derived from the reference. The parser makes
 * exactly the same call; see `readFinish` and `readHue`.
 *
 * Both fields in one query rather than two, because they are one question - how
 * does this cartridge look - and a second round trip for a number would be the
 * per-row cost this function exists to avoid, paid twice.
 */
export interface Shell {
  finish: Finish | null
  hue: number | null
}

export async function shellsOf(
  supabase: Client,
  projects: readonly XpProjectRow[],
): Promise<Map<string, Shell>> {
  const out = new Map<string, Shell>()
  const live = projects.filter((project) => project.currentVersion > 0)
  if (live.length === 0) return out

  const { data, error } = await supabase
    .from('xp_versions')
    .select('xp_id, version, finish:document->>finish, hue:document->>hue')
    .in(
      'xp_id',
      live.map((project) => project.id),
    )

  if (error) throw new Error(`Failed to read those cartridges: ${error.message}`)

  const wanted = new Map(live.map((project) => [project.id, project.currentVersion]))
  for (const row of (data ?? []) as {
    xp_id: string
    version: number
    finish: unknown
    hue: unknown
  }[]) {
    if (wanted.get(row.xp_id) !== row.version) continue

    /*
      `->>` hands back text, so the hue arrives as a string - and `Number('')`
      is zero, which is a perfectly good hue and the wrong answer for a level
      that never said. So the string is checked before it is parsed.
    */
    const raw = typeof row.hue === 'string' && row.hue.trim() !== '' ? Number(row.hue) : null
    const hue = raw !== null && isHue(raw) ? raw : null
    const finish = isFinish(row.finish) ? row.finish : null

    if (finish !== null || hue !== null) out.set(row.xp_id, { finish, hue })
  }

  return out
}
