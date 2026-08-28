import 'server-only'
import type { Client } from '@/es/store'

export interface WorldReportView {
  id: string
  worldId: string
  reason: string
  status: 'open' | 'upheld' | 'dismissed'
  createdAt: string
  reportedBy: string | null
  /** The arena, and the space that built it. */
  worldName: string | null
  spaceName: string | null
  spaceSlug: string | null
  /** How many blocks stand in it, so an admin knows what they are about to open. */
  blockCount: number
  banned: boolean
  bannedReason: string | null
}

/**
 * The moderation queue.
 *
 * Takes an admin client because it reads across every space - arenas, the
 * workspaces that built them, and the reports themselves. The caller is
 * expected to have passed requireBackofficeAdmin() first; that is the guard,
 * not this.
 */
export async function listWorldReports(
  admin: Client,
  status: 'open' | 'upheld' | 'dismissed' | 'all' = 'open',
  limit = 50,
): Promise<WorldReportView[]> {
  let query = admin
    .from('world_reports')
    .select('id, world_id, reason, status, created_at, reported_by')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load reports: ${error.message}`)

  const rows = data ?? []
  if (rows.length === 0) return []

  const worldIds = [...new Set(rows.map((row) => row.world_id))]

  const [arenas, bans] = await Promise.all([
    admin
      .from('battlefields_read_model')
      .select('world_id, name, tenant_id')
      .in('world_id', worldIds),
    admin.from('banned_worlds').select('world_id, reason').in('world_id', worldIds),
  ])

  const arenaRows = arenas.data ?? []
  const spaceIds = [...new Set(arenaRows.map((row) => row.tenant_id))]

  const { data: spaces } = await admin
    .from('tenants_read_model')
    .select('id, name, slug')
    .in('id', spaceIds.length > 0 ? spaceIds : ['00000000-0000-0000-0000-000000000000'])

  const arenaById = new Map(arenaRows.map((row) => [row.world_id, row]))
  const spaceById = new Map((spaces ?? []).map((row) => [row.id, row]))
  const banByWorld = new Map((bans.data ?? []).map((row) => [row.world_id, row.reason]))

  // Block counts, one head-count query per distinct world. Shown so an admin
  // can tell an empty world from a built one before opening it.
  const counts = new Map<string, number>()
  await Promise.all(
    worldIds.map(async (worldId) => {
      const { count } = await admin
        .from('lounge_blocks_read_model')
        .select('*', { count: 'exact', head: true })
        .eq('world_id', worldId)
      counts.set(worldId, count ?? 0)
    }),
  )

  return rows.map((row) => {
    const arena = arenaById.get(row.world_id)
    const space = arena ? spaceById.get(arena.tenant_id) : undefined
    return {
      id: row.id,
      worldId: row.world_id,
      reason: row.reason,
      status:
        row.status === 'upheld' || row.status === 'dismissed' ? row.status : 'open',
      createdAt: row.created_at,
      reportedBy: row.reported_by,
      worldName: arena?.name ?? null,
      spaceName: space?.name ?? null,
      spaceSlug: space?.slug ?? null,
      blockCount: counts.get(row.world_id) ?? 0,
      banned: banByWorld.has(row.world_id),
      bannedReason: banByWorld.get(row.world_id) ?? null,
    }
  })
}

export interface ReportedWorld {
  worldId: string
  name: string
  tenantId: string
  spaceName: string | null
  banned: boolean
}

/**
 * One reported world, for the preview page.
 *
 * Admin client again: the whole point is to look at an arena belonging to a
 * space the admin is not in. Reading it any other way would mean an admin had
 * to join a workspace to moderate it.
 */
export async function findReportedWorld(
  admin: Client,
  worldId: string,
): Promise<ReportedWorld | null> {
  const { data, error } = await admin
    .from('battlefields_read_model')
    .select('world_id, name, tenant_id')
    .eq('world_id', worldId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load world: ${error.message}`)
  if (!data) return null

  const [{ data: space }, { data: ban }] = await Promise.all([
    admin.from('tenants_read_model').select('name').eq('id', data.tenant_id).maybeSingle(),
    admin.from('banned_worlds').select('world_id').eq('world_id', worldId).maybeSingle(),
  ])

  return {
    worldId: data.world_id,
    name: data.name,
    tenantId: data.tenant_id,
    spaceName: space?.name ?? null,
    banned: Boolean(ban),
  }
}

/** Worlds a space may not use, so callers can hide them. */
export async function listBannedWorldIds(
  supabase: Client,
  worldIds: readonly string[],
): Promise<Set<string>> {
  if (worldIds.length === 0) return new Set()

  const { data } = await supabase
    .from('banned_worlds')
    .select('world_id')
    .in('world_id', [...worldIds])

  return new Set((data ?? []).map((row) => row.world_id))
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

export interface MessageReportView {
  id: string
  messageId: string
  reason: string
  status: 'open' | 'upheld' | 'dismissed'
  createdAt: string
  reportedBy: string | null
  /** The words complained about, and who said them. Null if the row is gone. */
  body: string | null
  authorId: string | null
  authorName: string | null
  saidAt: string | null
  /** The space it was said in. */
  spaceName: string | null
  spaceSlug: string | null
  hidden: boolean
  hiddenReason: string | null
}

/**
 * The chat moderation queue.
 *
 * Admin client, like the world queue, and here it is doing more than reaching
 * across spaces: the select policy on `chat_messages_read_model` hides anything
 * already taken down, so a queue reading as the caller would show an admin the
 * report and not the message the moment they upheld it. The service role
 * bypasses RLS, which is what lets this show the words beside the verdict.
 *
 * The message is shown in full rather than linked to. A world gets a link
 * because you have to walk around an arena to judge it; a sentence is the whole
 * of the evidence, and making somebody open a 3D room to read one line would be
 * ceremony rather than care.
 */
export async function listMessageReports(
  admin: Client,
  status: 'open' | 'upheld' | 'dismissed' | 'all' = 'open',
  limit = 50,
): Promise<MessageReportView[]> {
  let query = admin
    .from('chat_message_reports')
    .select('id, message_id, reason, status, created_at, reported_by')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load message reports: ${error.message}`)

  const rows = data ?? []
  if (rows.length === 0) return []

  const messageIds = [...new Set(rows.map((row) => row.message_id))]

  const [messages, takedowns] = await Promise.all([
    admin
      .from('chat_messages_read_model')
      .select('id, tenant_id, body, author_id, author_name, created_at')
      .in('id', messageIds),
    admin
      .from('hidden_chat_messages')
      .select('message_id, reason')
      .in('message_id', messageIds),
  ])

  const messageRows = messages.data ?? []
  const spaceIds = [...new Set(messageRows.map((row) => row.tenant_id))]

  const { data: spaces } = await admin
    .from('tenants_read_model')
    .select('id, name, slug')
    .in('id', spaceIds.length > 0 ? spaceIds : ['00000000-0000-0000-0000-000000000000'])

  const messageById = new Map(messageRows.map((row) => [row.id, row]))
  const spaceById = new Map((spaces ?? []).map((row) => [row.id, row]))
  const hiddenBy = new Map(
    (takedowns.data ?? []).map((row) => [row.message_id, row.reason]),
  )

  return rows.map((row) => {
    const message = messageById.get(row.message_id)
    const space = message ? spaceById.get(message.tenant_id) : undefined
    return {
      id: row.id,
      messageId: row.message_id,
      reason: row.reason,
      status:
        row.status === 'upheld' || row.status === 'dismissed' ? row.status : 'open',
      createdAt: row.created_at,
      reportedBy: row.reported_by,
      body: message?.body ?? null,
      authorId: message?.author_id ?? null,
      authorName: message?.author_name ?? null,
      saidAt: message?.created_at ?? null,
      spaceName: space?.name ?? null,
      spaceSlug: space?.slug ?? null,
      hidden: hiddenBy.has(row.message_id),
      hiddenReason: hiddenBy.get(row.message_id) ?? null,
    }
  })
}
