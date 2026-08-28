import 'server-only'
import { parseShot, type ShotSpec } from '@/domain/studio/shot'
import type { Client } from '@/es/store'

/**
 * Reading the scene catalogue.
 *
 * Every function here is `select`, and every one of them leans on the row level
 * security in 20260904000000_published_scenes.sql rather than filtering by
 * ownership itself - the same discipline `@/domain/worlds/queries` explains:
 * "which scenes may this reader see" is one sentence, it is written in the
 * policy, and a query that repeated it would be a second copy to keep in step.
 *
 * What the queries add is *intent*, and one deliberate omission: the document.
 * `SCENE_COLUMNS` does not include it, so a listing is names and counts. Only a
 * player needs the shot, and it asks for one scene at a time - which is what
 * keeps a page of twenty from carrying twenty documents nobody unfolds.
 */

export interface SceneSummary {
  id: string
  name: string
  blurb: string | null
  seconds: number
  castSize: number
  visibility: 'private' | 'public'
  /** 'platform' is the kxb.team team's own; 'space' is a workspace's. */
  origin: 'platform' | 'space'
  tenantId: string | null
  authorId: string | null
  forkedFrom: string | null
  createdAt: string
  updatedAt: string
}

export interface SceneDetail extends SceneSummary {
  /**
   * The shot, run back through the studio's parser.
   *
   * Not trusted just because it came out of our own database. `parseShot` drops
   * any avatar or block model it does not recognise, and the reason is the
   * renderer: an unknown id becomes a `fetch` for a glTF that is not there,
   * which suspends the scene's boundary forever. A scene published before a
   * pack was removed should lose the pack, not the page.
   */
  document: ShotSpec
}

/** Everything a card needs. Note the absent `document` - see the note above. */
const SCENE_COLUMNS =
  'id, name, blurb, seconds, cast_size, visibility, origin, tenant_id, author_id, forked_from, created_at, updated_at'

interface Row {
  id: string
  name: string
  blurb: string | null
  seconds: number
  cast_size: number
  visibility: string
  origin: string
  tenant_id: string | null
  author_id: string | null
  forked_from: string | null
  created_at: string
  updated_at: string
}

function summarise(row: Row): SceneSummary {
  return {
    id: row.id,
    name: row.name,
    blurb: row.blurb,
    seconds: Number(row.seconds),
    castSize: row.cast_size,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    origin: row.origin === 'space' ? 'space' : 'platform',
    tenantId: row.tenant_id,
    authorId: row.author_id,
    forkedFrom: row.forked_from,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * The scenes a reader may see, newest first.
 *
 * `tenantId` narrows to one space's; leaving it out is the platform's own list
 * plus whatever else the policy admits, which is what /ovaloffice wants.
 */
export async function listScenes(
  supabase: Client,
  options: { tenantId?: string | null; limit?: number } = {},
): Promise<SceneSummary[]> {
  let query = supabase
    .from('published_scenes')
    .select(SCENE_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(options.limit ?? 60)

  if (options.tenantId === null) query = query.is('tenant_id', null)
  else if (options.tenantId) query = query.eq('tenant_id', options.tenantId)

  const { data, error } = await query
  if (error || !data) return []
  return (data as Row[]).map(summarise)
}

/**
 * One scene, document and all.
 *
 * Returns null rather than throwing when the row is not there *or* not
 * readable, because the two are the same fact from outside: a scene you may not
 * see is one that, as far as you are concerned, does not exist.
 */
export async function findScene(supabase: Client, id: string): Promise<SceneDetail | null> {
  const { data, error } = await supabase
    .from('published_scenes')
    .select(`${SCENE_COLUMNS}, document`)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null
  const row = data as Row & { document: unknown }
  return { ...summarise(row), document: parseShot(row.document) }
}

/**
 * Several scenes' documents at once, by id.
 *
 * For a board page that has already decided which cards are going to play.
 * Fetching them one at a time is a round trip per card, and fetching every
 * document on the page is the thing the poster exists to avoid.
 */
export async function findScenes(supabase: Client, ids: string[]): Promise<SceneDetail[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('published_scenes')
    .select(`${SCENE_COLUMNS}, document`)
    .in('id', ids.slice(0, 24))

  if (error || !data) return []
  return (data as (Row & { document: unknown })[]).map((row) => ({
    ...summarise(row),
    document: parseShot(row.document),
  }))
}
