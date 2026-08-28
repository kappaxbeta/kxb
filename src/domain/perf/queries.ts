import 'server-only'
import type { Client } from '@/es/store'
import { fallbackUsername } from '@/domain/profile/username-commands'
import type { PerfSample } from '@/domain/perf/rollup'

/**
 * Read side of the room measurements.
 *
 * Takes an admin client for the same reason `health/queries.ts` does: these are
 * reachable by backoffice admins only, and the caller is expected to have
 * passed `requireBackofficeAdmin()` first. That guard is the gate, not anything
 * in this file - and the row-level policy on `room_perf_samples` is the second
 * one underneath it.
 *
 * Nothing here reads the `perf` flag. That flag gates *collection*, and this is
 * the other side of the split the migration argues: samples already written
 * stay readable when it goes off, because the question an operator asks after
 * an incident is what the room looked like while it was bad.
 */

/**
 * Is `perf` on anywhere at all - globally, or for one space?
 *
 * This exists because the obvious gate was wrong, in a way that only shows up
 * in the workflow it was meant to support. The backoffice resolves flags with
 * *no tenant*, so it only ever sees the global default and this admin's own
 * override. An operator who left the global switch off and turned `perf` on for
 * one space - which is the whole point of having overrides - would have hidden
 * the page that reads what they just enabled.
 *
 * So the tab follows collection rather than following the platform default:
 * on if the global flag is on, or if any space has an override turning it on.
 * The flag is still what decides - a deployment with `perf` off everywhere has
 * no tab - it is just asked the question an operator actually means.
 *
 * Reads the two flag tables directly, which needs the admin client: both are
 * admin-only, and `resolve_features` deliberately never says *which* layer
 * answered.
 *
 * True on failure would be wrong and false is the honest default: this is a
 * flag check, and every flag check in this app fails closed toward the
 * direction argued in keys.ts. For `perf` that is off.
 */
export async function perfEnabledAnywhere(admin: Client): Promise<boolean> {
  const [global, overrides] = await Promise.all([
    admin.from('feature_flags').select('enabled').eq('key', 'perf').maybeSingle(),
    admin
      .from('feature_flag_overrides')
      .select('flag_key')
      .eq('flag_key', 'perf')
      .eq('enabled', true)
      .limit(1),
  ])

  if (global.data?.enabled) return true
  return (overrides.data?.length ?? 0) > 0
}

/** A room that has been measured lately, for the picker. */
export interface PerfRoom {
  topic: string
  roomKind: string
  tenantId: string
  tenantName: string | null
  clients: number
  people: number
  samples: number
  lastSeen: string
  sentHz: number
  deliveredHz: number
  unhealthy: number
  restFallback: boolean
  worstFrameP95Ms: number | null
  worstRttP95Ms: number | null
}

/**
 * Every room with a sample in the window, busiest end last.
 *
 * Empty rather than throwing when the call fails, on the same reasoning
 * `readHealthSeries` gives: a performance page with no list is worth more than
 * no performance page, and an empty list is also the honest answer before
 * anybody has turned the flag on for anything.
 */
export async function readPerfRooms(
  admin: Client,
  minutes = 15,
): Promise<PerfRoom[]> {
  const { data, error } = await admin.rpc('room_perf_rooms', { p_minutes: minutes })
  if (error || !data) return []

  return data.map((row) => ({
    topic: row.topic,
    roomKind: row.room_kind,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    clients: Number(row.clients ?? 0),
    people: Number(row.people ?? 0),
    samples: Number(row.samples ?? 0),
    lastSeen: row.last_seen,
    sentHz: Number(row.sent_hz ?? 0),
    deliveredHz: Number(row.delivered_hz ?? 0),
    unhealthy: Number(row.unhealthy ?? 0),
    restFallback: Boolean(row.rest_fallback),
    worstFrameP95Ms: nullableNumber(row.worst_frame_p95_ms),
    worstRttP95Ms: nullableNumber(row.worst_rtt_p95_ms),
  }))
}

/**
 * Every window one room's clients wrote, oldest first.
 *
 * A plain select rather than an RPC, unlike the picker above: this one is
 * already narrowed to a topic and a window, so there is nothing to aggregate in
 * SQL and the folding is in `rollup.ts`, where it can be tested. The limit is a
 * backstop rather than a page size - fifteen minutes of a twenty-client room is
 * around twelve hundred rows - and the page says when it bites.
 */
export async function readRoomSamples(
  admin: Client,
  topic: string,
  minutes = 15,
  limit = 4000,
): Promise<PerfSample[]> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString()

  const { data, error } = await admin
    .from('room_perf_samples')
    .select('*')
    .eq('topic', topic)
    .gt('sampled_at', since)
    .order('sampled_at', { ascending: true })
    .limit(limit)

  if (error || !data) return []

  return data.map((row) => ({
    sampledAt: row.sampled_at,
    tenantId: row.tenant_id,
    topic: row.topic,
    roomKind: row.room_kind,
    userId: row.user_id,
    conn: row.conn,
    windowMs: row.window_ms,
    channelState: row.channel_state,
    reconnects: row.reconnects,
    quietMs: nullableNumber(row.quiet_ms),
    restFallback: row.rest_fallback,
    sent: asCounts(row.sent),
    received: asCounts(row.received),
    sentTotal: row.sent_total,
    recvTotal: row.recv_total,
    peers: row.peers,
    frames: row.frames,
    frameP50Ms: nullableNumber(row.frame_p50_ms),
    frameP95Ms: nullableNumber(row.frame_p95_ms),
    hiddenMs: row.hidden_ms,
    rttSamples: row.rtt_samples,
    rttLost: row.rtt_lost,
    rttP50Ms: nullableNumber(row.rtt_p50_ms),
    rttP95Ms: nullableNumber(row.rtt_p95_ms),
    linkJitterMs: nullableNumber(row.link_jitter_ms),
    linkDelayMs: nullableNumber(row.link_delay_ms),
  }))
}

/**
 * Handles for a set of accounts, in one query.
 *
 * Through the admin client rather than the caller's, because `user_profiles`
 * only lets somebody read a handle they share a space with - and a backoffice
 * admin looking at a room is usually in none of them. `fallbackUsername` covers
 * a guest, who has no profile row at all and is still a client in the room.
 *
 * One `.in()` for the whole list rather than one lookup per row: the shape that
 * made the workspace list slow, and a room of twenty would repeat it twenty
 * times per refresh.
 */
export async function readClientNames(
  admin: Client,
  userIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return names

  const { data } = await admin
    .from('user_profiles')
    .select('user_id, username')
    .in('user_id', unique)

  for (const row of data ?? []) {
    if (row.username) names.set(row.user_id, row.username)
  }
  for (const id of unique) {
    if (!names.has(id)) names.set(id, fallbackUsername(id))
  }
  return names
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

/**
 * A jsonb column as counts, defensively.
 *
 * The column is written by `record_room_perf` from a client's own object, so it
 * is `{ "move": 118 }` in every row this app wrote. Anything else is dropped
 * rather than rendered: a page that printed whatever was in a jsonb column
 * would be rendering something a browser posted.
 */
function asCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === 'number' && Number.isFinite(count)) out[key] = count
  }
  return out
}
