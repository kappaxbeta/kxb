import 'server-only'
import type { XpState } from '@/domain/xps/events'
import { NEVER_PLAYED, readPlayTotals, type PlayTotals } from '@/domain/xps/plays'
import type { Client } from '@/es/store'

/**
 * The review queue's reads.
 *
 * Separate from `queries.ts` because every one of these takes the **service
 * role** client and crosses tenants, which nothing in that file does. Keeping
 * them apart means a tenant-scoped surface cannot accidentally import a
 * function that reads the whole platform — the same reason
 * `domain/moderation/queries.ts` exists beside the per-space ones.
 *
 * RLS is bypassed here rather than widened. The alternative was adding an
 * `is_backoffice_admin()` branch to every XP policy, which is four more places
 * for the recursion in 20261003000000 to come back and one more thing a policy
 * has to be read against. The gate is `requireBackofficeAdmin()` in the caller,
 * which is exactly how `/ovaloffice/reports` already works.
 */

export interface XpReviewRow {
  id: string
  name: string
  blurb: string | null
  state: XpState
  tenantId: string
  spaceName: string
  spaceSlug: string
  ownerId: string | null
  currentVersion: number
  publishedVersion: number | null
  coverPath: string | null
  bytes: number
  /**
   * How much it was played, out of `xp_sessions` rather than off the row.
   *
   * `xps_read_model.plays` is still a column and is still `0` for everything,
   * because nothing has ever written to it — which is what this queue was
   * sorting by and printing until the session log had an answer. Derived rather
   * than repaired: see `domain/xps/plays.ts`, and creator.md §18.3 for why a
   * counter was the wrong shape even before it was an empty one.
   */
  played: PlayTotals
  updatedAt: string
  /**
   * What standing in the level cannot show.
   *
   * A reviewer opens an XP and walks around it, which answers "is this any
   * good" and answers nothing about what is in the folder. These three are the
   * questions the walk cannot: how much of it there is, what kinds, and whether
   * anything is still in quarantine.
   */
  files: number
  kinds: string[]
  unclean: number
}

/**
 * `plays` is deliberately absent.
 *
 * It is still a column on the read model and it is still `0` on every row.
 * Selecting it here would put a number in reach of a `row.plays` that reads
 * exactly like the real one — which is how this queue came to sort by it in the
 * first place.
 */
const COLUMNS =
  'id, name, blurb, state, tenant_id, owner_id, current_version, published_version, cover_path, bytes, updated_at'

/** What is waiting to be read, oldest first — a queue, not a feed. */
export async function listSubmittedXps(admin: Client): Promise<XpReviewRow[]> {
  return listByState(admin, ['submitted'], { ascending: true })
}

/**
 * What is live, most-played first.
 *
 * The honest answer to "what should I look at first" on a moderation surface is
 * usually "the one the most people are seeing", which is not the same as the
 * newest and is the ordering a feed would have got wrong.
 */
export async function listLiveXps(admin: Client): Promise<XpReviewRow[]> {
  const rows = await listByState(admin, ['published', 'unlisted'], { ascending: false })
  /**
   * And it now sorts by something.
   *
   * This line has been here since the queue was written and has never moved a
   * row: `plays` was zero for everything, so the comparator returned zero for
   * every pair and the list stayed in `updated_at` order — newest first, which
   * is the ordering the comment above says a feed would have got wrong.
   *
   * Ties broken by the newest, which is what the underlying order already is,
   * so a page of never-played worlds reads the way it always did rather than
   * shuffling.
   */
  return rows.sort((a, b) => b.played.plays - a.played.plays)
}

async function listByState(
  admin: Client,
  states: string[],
  order: { ascending: boolean },
): Promise<XpReviewRow[]> {
  const { data, error } = await admin
    .from('xps_read_model')
    .select(COLUMNS)
    .in('state', states)
    .order('updated_at', order)

  if (error) throw new Error(`Failed to read the XP queue: ${error.message}`)
  const rows = data ?? []
  if (rows.length === 0) return []

  // Two round trips for the whole page rather than two per row. A queue of
  // thirty would otherwise be sixty queries to print a table. The session
  // totals are a third, and one for the page for the same reason.
  const [spaces, folders, played] = await Promise.all([
    spaceNames(admin, rows.map((row) => row.tenant_id)),
    Promise.all(
      rows.map((row) =>
        folderFacts(admin, row.id, row.tenant_id, versionUnderReview(row)),
      ),
    ),
    readPlayTotals(admin, rows.map((row) => row.id)),
  ])

  return rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    blurb: row.blurb,
    state: row.state as XpState,
    tenantId: row.tenant_id,
    spaceName: spaces.get(row.tenant_id)?.name ?? 'a deleted space',
    spaceSlug: spaces.get(row.tenant_id)?.slug ?? '',
    ownerId: row.owner_id,
    currentVersion: row.current_version,
    publishedVersion: row.published_version,
    coverPath: row.cover_path,
    bytes: Number(row.bytes),
    played: played.get(row.id) ?? NEVER_PLAYED,
    updatedAt: row.updated_at,
    ...folders[index],
  }))
}

/**
 * Which version a reviewer is actually judging.
 *
 * For something submitted that is `current_version`, and for something live it
 * is `published_version` — never the newer draft the author has since saved.
 * Getting this wrong would show a reviewer the file list of a version nobody
 * asked them to look at, which is the quiet kind of wrong.
 */
function versionUnderReview(row: { state: string; current_version: number; published_version: number | null }): number {
  if (row.state === 'published' || row.state === 'unlisted') return row.published_version ?? 0
  return row.current_version
}

async function spaceNames(
  admin: Client,
  tenantIds: string[],
): Promise<Map<string, { name: string; slug: string }>> {
  const { data } = await admin
    .from('tenants_read_model')
    .select('id, name, slug')
    .in('id', [...new Set(tenantIds)])

  return new Map((data ?? []).map((row) => [row.id, { name: row.name, slug: row.slug }]))
}

const EMPTY = { files: 0, kinds: [] as string[], unclean: 0 }

/** What is in the folder, and whether any of it is still in quarantine. */
async function folderFacts(
  admin: Client,
  xpId: string,
  tenantId: string,
  version: number,
): Promise<{ files: number; kinds: string[]; unclean: number }> {
  if (version <= 0) return EMPTY

  const { data } = await admin
    .from('xp_versions')
    .select('manifest, files')
    .eq('xp_id', xpId)
    .eq('version', version)
    .maybeSingle()

  if (!data) return EMPTY

  const manifest = (data.manifest ?? {}) as Record<string, { sha: string; mime: string }>
  const entries = Object.values(manifest)
  if (entries.length === 0) return { ...EMPTY, files: data.files }

  // The half of the mime before the slash: image, audio, video, model,
  // application. Enough for a reviewer to see "this one has video in it"
  // without printing forty filenames.
  const kinds = [...new Set(entries.map((entry) => entry.mime.split('/')[0]))].sort()

  const { data: files } = await admin
    .from('xp_files')
    .select('sha')
    .eq('tenant_id', tenantId)
    .neq('scan_status', 'clean')
    .in('sha', [...new Set(entries.map((entry) => entry.sha))])

  return { files: data.files, kinds, unclean: (files ?? []).length }
}
