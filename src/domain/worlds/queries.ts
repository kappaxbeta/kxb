import 'server-only'
import { type BuilderWorld, parseWorld } from '@/domain/builder/world'
import { labelsFor, type WorldLabel } from '@/domain/worlds/reports'
import { isWorldTag } from '@/domain/worlds/tags'
import type { Client } from '@/es/store'

/**
 * Reading the world catalogue.
 *
 * Every function here is `select`, and every one of them leans on the row level
 * security in 20260831000000_published_worlds.sql rather than filtering by
 * ownership itself. That is deliberate: "which worlds may this reader see" is
 * one sentence and it is written in the policy, so a query that repeated it
 * would be a second copy to keep in step - and the copy that is easy to forget
 * is the one on the page a visitor opens without an account.
 *
 * What the queries do add is *intent*: the discovery page asks for public
 * worlds because that is what it is showing, not because it could not see the
 * rest.
 */

export interface WorldSummary {
  id: string
  name: string
  blurb: string | null
  tags: string[]
  visibility: 'private' | 'public'
  /** 'platform' is the kxb.team team's own; 'space' is a workspace's. */
  origin: 'platform' | 'space'
  tenantId: string | null
  authorId: string | null
  forkedFrom: string | null
  /** Everything in the document, and how much of it becomes walkable blocks. */
  placements: number
  blocks: number
  /** How many times it has been opened, and how many spaces have stood it up. */
  views: number
  uses: number
  /**
   * A still of the world, as a data URL. Null draws as a placeholder.
   *
   * Carried in the summary rather than only in the detail, because the card is
   * the whole reason it exists - see the poster migration.
   */
  poster: string | null
  /** When a match last finished on a copy of it. Null until one has. */
  approvedAt: string | null
  /** What people have reported, as badges. See ./reports.ts. */
  labels: WorldLabel[]
  createdAt: string
  updatedAt: string
  /** Filled in for space worlds by `attachSpaces`, when the reader may see it. */
  spaceName: string | null
  spaceSlug: string | null
}

export interface WorldDetail extends WorldSummary {
  /**
   * The document, run back through the builder's parser.
   *
   * Not trusted just because it came out of our own database. `parseWorld`
   * drops any model that is not in the shipped catalogue, and the reason is the
   * renderer: an unknown id becomes a `fetch` for a glTF that is not there,
   * which suspends the world's boundary forever. A world published before a
   * pack was removed should lose the pack, not the page.
   */
  document: BuilderWorld
}

const COLUMNS =
  'id, name, blurb, tags, visibility, origin, tenant_id, author_id, forked_from, placements, blocks, views, uses, poster, approved_at, report_counts, created_at, updated_at'

type Row = {
  id: string
  name: string
  blurb: string | null
  tags: string[] | null
  visibility: string
  origin: string
  tenant_id: string | null
  author_id: string | null
  forked_from: string | null
  placements: number
  blocks: number
  views: number
  uses: number
  poster: string | null
  approved_at: string | null
  report_counts: unknown
  created_at: string
  updated_at: string
}

function toSummary(row: Row): WorldSummary {
  return {
    id: row.id,
    name: row.name,
    blurb: row.blurb,
    // Filtered against the vocabulary on the way out as well as in. A tag
    // retired from ./tags.ts is still sitting in rows saved before it went, and
    // a filter row cannot render a chip it has no label for.
    tags: (row.tags ?? []).filter(isWorldTag),
    // Anything a widened check constraint later admits reads as the narrower
    // option, which is the failure that reveals least.
    visibility: row.visibility === 'public' ? 'public' : 'private',
    origin: row.origin === 'platform' ? 'platform' : 'space',
    tenantId: row.tenant_id,
    authorId: row.author_id,
    forkedFrom: row.forked_from,
    placements: row.placements,
    blocks: row.blocks,
    views: row.views,
    uses: row.uses,
    poster: row.poster,
    approvedAt: row.approved_at,
    labels: labelsFor(row.report_counts),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    spaceName: null,
    spaceSlug: null,
  }
}

export interface WorldSearch {
  /** One tag id from the vocabulary. Anything else is ignored rather than refused. */
  tag?: string
  /** Matched against the name, case-insensitively. */
  q?: string
  /** 'platform' shows only the kxb.team team's worlds. */
  origin?: 'platform' | 'space'
  /**
   * How the list is ordered.
   *
   * 'used' is the default, and the argument for it is in the popularity
   * migration: a use costs the person something, a view is a click on whatever
   * was already at the top. Sorting by views alone would make the catalogue a
   * feedback loop rather than a recommendation.
   */
  sort?: WorldSort
  limit?: number
}

export type WorldSort = 'used' | 'new'

/**
 * The discovery page.
 *
 * 'new' is `updated_at` rather than `created_at`, because this is a catalogue
 * of things people go back and change: a world reworked last week is more
 * interesting than one first saved a year ago and untouched since.
 */
export async function listPublicWorlds(
  supabase: Client,
  search: WorldSearch = {},
): Promise<WorldSummary[]> {
  let query = supabase.from('published_worlds').select(COLUMNS).eq('visibility', 'public')

  if (search.tag && isWorldTag(search.tag)) {
    // `contains` on the array, which is what the GIN index answers.
    query = query.contains('tags', [search.tag])
  }

  if (search.origin) query = query.eq('origin', search.origin)

  const term = search.q?.trim()
  if (term) {
    // `ilike` rather than full-text search, for the reason the battlefield
    // search gives: the corpus is world names. Wildcards escaped, so a name
    // with a percent sign in it searches for itself.
    query = query.ilike('name', `%${term.replace(/[%_]/g, '\\$&')}%`)
  }

  // Ties broken all the way down, so the order is total: two worlds nobody has
  // used yet are still in a stable, meaningful order rather than whatever the
  // planner returned this time.
  const ordered =
    (search.sort ?? 'used') === 'used'
      ? query
          .order('uses', { ascending: false })
          .order('views', { ascending: false })
          .order('updated_at', { ascending: false })
      : query.order('updated_at', { ascending: false })

  const { data, error } = await ordered.limit(search.limit ?? 60)

  if (error) throw new Error(`Failed to list worlds: ${error.message}`)
  return attachSpaces(supabase, (data ?? []).map(toSummary))
}

/**
 * Everything a space may stand up: its own worlds first, then the catalogue.
 *
 * The pickers - the studios' set browser, and anywhere else that offers "choose
 * a world" from inside a space - used to ask `listPublicWorlds` alone. That is
 * the right corpus for *discovery* and the wrong one for *your own space*: a
 * world publishes private by default, so the ordinary sequence of building
 * something in the builder and then going to use it ended at a picker that did
 * not list it. Nothing was broken and nothing said so; the world was simply not
 * there, in every place it might have been used.
 *
 * Own first rather than merged by popularity. A space with four of its own
 * worlds and forty of everybody else's is looking for one of the four - and
 * they have no uses or views yet, so any ranking that mixes the two lists buries
 * them at the bottom by construction.
 *
 * Drafts are only ever *listed* here. Whether the reader may actually read one
 * back is the select policy's question, and the fetch that follows a pick asks
 * it again - see `worldSet`.
 */
export async function listPickableWorlds(
  supabase: Client,
  tenantId: string,
  limit = 40,
): Promise<WorldSummary[]> {
  const [own, catalogue] = await Promise.all([
    listSpaceWorlds(supabase, tenantId),
    listPublicWorlds(supabase, { limit }),
  ])

  // A space's own public world is in both lists, and a picker that shows it
  // twice looks like the space published it twice.
  const seen = new Set(own.map((world) => world.id))
  return [...own, ...catalogue.filter((world) => !seen.has(world.id))].slice(0, limit)
}

/**
 * A space's own worlds, published or not.
 *
 * Drafts included: this is the list you come back to in order to finish
 * something, so hiding the unpublished ones would hide the reason to open it.
 */
export async function listSpaceWorlds(
  supabase: Client,
  tenantId: string,
): Promise<WorldSummary[]> {
  const { data, error } = await supabase
    .from('published_worlds')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Failed to list this space's worlds: ${error.message}`)
  return (data ?? []).map(toSummary)
}

/** The platform's own worlds, for the backoffice list. Drafts included, same reason. */
export async function listPlatformWorlds(supabase: Client): Promise<WorldSummary[]> {
  const { data, error } = await supabase
    .from('published_worlds')
    .select(COLUMNS)
    .eq('origin', 'platform')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Failed to list worlds: ${error.message}`)
  return (data ?? []).map(toSummary)
}

/**
 * One world, document and all.
 *
 * Null rather than an error when it does not exist *or* when the reader may not
 * see it: the select policy makes those two indistinguishable from here, which
 * is the same posture `findBattlefield` takes and for the same reason - whether
 * an id names a real private world is itself information.
 */
export async function findWorld(supabase: Client, id: string): Promise<WorldDetail | null> {
  const { data, error } = await supabase
    .from('published_worlds')
    .select(`${COLUMNS}, document`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load that world: ${error.message}`)
  if (!data) return null

  const [summary] = await attachSpaces(supabase, [toSummary(data as Row)])
  return { ...summary, document: parseWorld((data as { document: unknown }).document) }
}

/**
 * Count one look at a world.
 *
 * Fire and forget: a counter that failed to increment must never be what a
 * visitor sees instead of the world. The function behind it only touches public
 * worlds and only adds one - see the popularity migration for why this is a
 * definer function rather than an update policy.
 *
 * Not called for the world's own author. Otherwise the number mostly counts the
 * person who built it reloading their own page, which makes the sort a ranking
 * of who checks their work most often.
 */
export async function recordWorldView(
  supabase: Client,
  id: string,
  viewerId: string | null,
  authorId: string | null,
): Promise<void> {
  if (viewerId && viewerId === authorId) return
  const { error } = await supabase.rpc('record_world_view', { p_world_id: id })
  if (error) console.warn(`Could not count that view: ${error.message}`)
}

/** Count one world standing up in a space. Same fire-and-forget rule. */
export async function recordWorldUse(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.rpc('record_world_use', { p_world_id: id })
  if (error) console.warn(`Could not count that use: ${error.message}`)
}

/**
 * What this person already said about these worlds.
 *
 * Their own reports only - that is all the select policy admits, and all the
 * page needs: the button says "you reported this" rather than offering to
 * report it twice.
 */
export async function readMyReports(
  supabase: Client,
  userId: string | null,
  worldId: string,
): Promise<string | null> {
  if (!userId) return null

  const { data, error } = await supabase
    .from('published_world_reports')
    .select('reason')
    .eq('world_id', worldId)
    .eq('reported_by', userId)
    .maybeSingle()

  if (error) {
    console.warn(`Could not read your report: ${error.message}`)
    return null
  }
  return data?.reason ?? null
}

/**
 * Which of these worlds this person has kept.
 *
 * A set of ids rather than a flag folded into each row, because the rows are
 * read by anonymous visitors too and joining a per-person table into the shared
 * listing query would mean two different shapes for the same page. One extra
 * round trip, only when somebody is signed in.
 */
export async function readFavouriteIds(
  supabase: Client,
  userId: string | null,
): Promise<Set<string>> {
  if (!userId) return new Set()

  const { data, error } = await supabase
    .from('world_favourites')
    .select('world_id')
    .eq('user_id', userId)

  // Not fatal: a catalogue that could not read your hearts is a catalogue with
  // no hearts filled in, which is a smaller failure than an error page.
  if (error) {
    console.warn(`Could not read your saved worlds: ${error.message}`)
    return new Set()
  }
  return new Set((data ?? []).map((row) => row.world_id))
}

/**
 * The worlds this person kept, newest first.
 *
 * Two queries rather than an embedded join: the favourites table has no foreign
 * key PostgREST can traverse *into* the listing shape this page wants, and the
 * select policy on the worlds themselves still applies - so a world that has
 * since been unpublished simply drops out of somebody's saved list rather than
 * appearing as a row they cannot open.
 */
export async function listFavouriteWorlds(
  supabase: Client,
  userId: string,
): Promise<WorldSummary[]> {
  const { data: kept, error } = await supabase
    .from('world_favourites')
    .select('world_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Failed to list your saved worlds: ${error.message}`)

  const ids = (kept ?? []).map((row) => row.world_id)
  if (ids.length === 0) return []

  const { data, error: worldsError } = await supabase
    .from('published_worlds')
    .select(COLUMNS)
    .in('id', ids)

  if (worldsError) throw new Error(`Failed to load your saved worlds: ${worldsError.message}`)

  // Back into the order they were kept in, which the `in` filter does not
  // preserve and which is the order this list means.
  const byId = new Map((data ?? []).map((row) => [row.id, toSummary(row as Row)]))
  return attachSpaces(
    supabase,
    ids.flatMap((id) => {
      const world = byId.get(id)
      return world ? [world] : []
    }),
  )
}

/**
 * A world's door.
 *
 * `showRing` is whether the marker is drawn on the floor - a property of the
 * room rather than of the browser looking at it, which is why it rides along
 * here instead of sitting in local storage. See 20260914000000_world_spawn_ring.
 */
export interface WorldSpawn {
  x: number
  z: number
  /**
   * The surface it was set on, in cells, or null for a door with no opinion.
   *
   * Null is every spawn written before a door had a height, and it keeps the
   * old arrival exactly: the lowest surface in the column with headroom. A
   * number is a preference rather than a rule - see `standingSurface`.
   */
  y: number | null
  showRing: boolean
}

/**
 * Where people come in, for one world.
 *
 * Null means the middle, which is what every world did before doors existed and
 * what most of them will go on doing. Never throws: a page that could not read
 * a spawn hint should render the world, not an error - see `world_spawns`.
 */
export async function findWorldSpawn(
  supabase: Client,
  worldId: string,
): Promise<WorldSpawn | null> {
  const { data, error } = await supabase
    .from('world_spawns')
    .select('x, z, y, show_ring')
    .eq('world_id', worldId)
    .maybeSingle()

  if (error) {
    console.warn(`Could not read the spawn point: ${error.message}`)
    return null
  }
  return data
    ? { x: data.x, z: data.z, y: data.y ?? null, showRing: data.show_ring }
    : null
}

/**
 * Which space each world came from.
 *
 * One query for the whole list. A world whose space the reader cannot see comes
 * back unnamed rather than failing: the world is public, the workspace's name
 * is not necessarily - the same trade `attachSpaces` makes for battlefields.
 */
async function attachSpaces(
  supabase: Client,
  worlds: WorldSummary[],
): Promise<WorldSummary[]> {
  const tenantIds = [...new Set(worlds.map((world) => world.tenantId).filter(Boolean))] as string[]
  if (tenantIds.length === 0) return worlds

  const { data } = await supabase
    .from('tenants_read_model')
    .select('id, name, slug')
    .in('id', tenantIds)

  const spaces = new Map((data ?? []).map((row) => [row.id, row]))

  return worlds.map((world) => {
    const space = world.tenantId ? spaces.get(world.tenantId) : undefined
    return {
      ...world,
      spaceName: space?.name ?? null,
      spaceSlug: space?.slug ?? null,
    }
  })
}
