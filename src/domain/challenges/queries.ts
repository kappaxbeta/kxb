import 'server-only'
import { isBattleMode, type BattleMode } from '@/domain/battle/events'
import type { Client } from '@/es/store'

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export interface ChallengeView {
  id: string
  challengerTenantId: string
  challengedTenantId: string
  mode: BattleMode
  worldId: string | null
  status: ChallengeStatus
  battleId: string | null
  message: string | null
  createdAt: string
  /** Filled in for whichever space is not the caller's. */
  otherSpaceName: string | null
  arenaName: string | null
}

type Row = {
  id: string
  challenger_tenant_id: string
  challenged_tenant_id: string
  mode: string
  world_id: string | null
  status: string
  battle_id: string | null
  message: string | null
  created_at: string
}

const COLUMNS =
  'id, challenger_tenant_id, challenged_tenant_id, mode, world_id, status, battle_id, message, created_at'

function toView(row: Row): ChallengeView {
  return {
    id: row.id,
    challengerTenantId: row.challenger_tenant_id,
    challengedTenantId: row.challenged_tenant_id,
    // The same two names this used to be short of - a challenge to a football
    // match read back as all-against-all. See `isBattleMode`.
    mode: isBattleMode(row.mode) ? row.mode : 'ffa',
    worldId: row.world_id,
    status: (['pending', 'accepted', 'declined', 'cancelled'] as const).includes(
      row.status as ChallengeStatus,
    )
      ? (row.status as ChallengeStatus)
      : 'pending',
    battleId: row.battle_id,
    message: row.message,
    createdAt: row.created_at,
    otherSpaceName: null,
    arenaName: null,
  }
}

export interface Challenges {
  incoming: ChallengeView[]
  outgoing: ChallengeView[]
}

/**
 * Both directions, in one round trip.
 *
 * Split by which end this space is on rather than fetched twice, because the
 * select policy already returns exactly the rows either side may see and
 * asking for them in two queries would just be the same rows arriving in two
 * pieces.
 */
export async function listChallenges(
  supabase: Client,
  tenantId: string,
  limit = 40,
): Promise<Challenges> {
  const { data, error } = await supabase
    .from('space_challenges')
    .select(COLUMNS)
    .or(`challenger_tenant_id.eq.${tenantId},challenged_tenant_id.eq.${tenantId}`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to list challenges: ${error.message}`)

  const views = await decorate(supabase, (data ?? []).map(toView), tenantId)

  return {
    incoming: views.filter((view) => view.challengedTenantId === tenantId),
    outgoing: views.filter((view) => view.challengerTenantId === tenantId),
  }
}

/**
 * Name the other space and the ground.
 *
 * Two lookups for the whole list. A space whose name this caller cannot read
 * comes back null rather than failing - being challenged by a space is not the
 * same as being able to read its row, and an unnamed challenger is better than
 * a broken page.
 */
async function decorate(
  supabase: Client,
  views: ChallengeView[],
  tenantId: string,
): Promise<ChallengeView[]> {
  if (views.length === 0) return views

  const otherIds = [
    ...new Set(
      views.map((view) =>
        view.challengerTenantId === tenantId
          ? view.challengedTenantId
          : view.challengerTenantId,
      ),
    ),
  ]
  const worldIds = [
    ...new Set(views.map((view) => view.worldId).filter((id): id is string => Boolean(id))),
  ]

  const [spaces, arenas] = await Promise.all([
    supabase.from('tenants_read_model').select('id, name').in('id', otherIds),
    worldIds.length > 0
      ? supabase
          .from('battlefields_read_model')
          .select('world_id, name')
          .in('world_id', worldIds)
      : Promise.resolve({ data: [] as { world_id: string; name: string }[] }),
  ])

  const spaceNames = new Map((spaces.data ?? []).map((row) => [row.id, row.name]))
  const arenaNames = new Map(
    (arenas.data ?? []).map((row) => [row.world_id, row.name]),
  )

  return views.map((view) => ({
    ...view,
    otherSpaceName:
      spaceNames.get(
        view.challengerTenantId === tenantId
          ? view.challengedTenantId
          : view.challengerTenantId,
      ) ?? null,
    arenaName: view.worldId ? (arenaNames.get(view.worldId) ?? null) : null,
  }))
}
