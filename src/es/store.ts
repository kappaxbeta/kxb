import type { SupabaseClient } from '@supabase/supabase-js'
import { ConcurrencyError, isConcurrencyCode } from '@/es/errors'
import type { DomainEvent, EventMetadata, EventToAppend, StoredEvent } from '@/es/types'
import type { Database, EventRow, Json } from '@/lib/supabase/types'

export type Client = SupabaseClient<Database>

/**
 * Map a database row into the shape the domain works with.
 *
 * Exported for `projection.ts`, which reads the same columns through
 * `events_since_checkpoint` rather than through the query builder. One mapping
 * rather than two: the columns are the same columns, and a second copy would
 * drift the first time one is given a field.
 */
export function toStoredEvent<TEvent extends DomainEvent>(row: EventRow): StoredEvent<TEvent> {
  return {
    type: row.type,
    data: row.data,
    globalSeq: Number(row.global_seq),
    tenantId: row.tenant_id,
    streamId: row.stream_id,
    streamType: row.stream_type,
    version: row.version,
    actorId: row.actor_id,
    createdAt: row.created_at,
    metadata: (row.metadata ?? {}) as EventMetadata,
  } as StoredEvent<TEvent>
}

/**
 * Read one aggregate's full history, oldest first.
 *
 * The tenant filter duplicates what RLS already enforces. That is deliberate:
 * if a policy is ever loosened by accident, this query degrades to "no rows"
 * rather than "somebody else's rows", and it keeps the read on the
 * (tenant_id, global_seq) index.
 *
 * Reading every event on every command is the honest starting point and stays
 * fast for streams of this size. When a stream grows past a few hundred events
 * the usual fix is snapshotting: store a periodic state snapshot plus its
 * version, then load only the events after it.
 */
export async function loadStream<TEvent extends DomainEvent>(
  supabase: Client,
  tenantId: string,
  streamId: string,
): Promise<StoredEvent<TEvent>[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('stream_id', streamId)
    .order('version', { ascending: true })

  if (error) {
    throw new Error(`Failed to load stream ${streamId}: ${error.message}`)
  }

  return (data ?? []).map((row) => toStoredEvent<TEvent>(row))
}

/**
 * Read forward across one tenant's streams from a cursor. This is what drives
 * projections.
 *
 * "All" means all of a tenant now, which is why checkpoints are keyed by
 * tenant: each one is an independent slice of the log with its own reading
 * position.
 */
export async function readAllFrom<TEvent extends DomainEvent>(
  supabase: Client,
  tenantId: string,
  afterSeq: number,
  limit = 500,
): Promise<StoredEvent<TEvent>[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('tenant_id', tenantId)
    .gt('global_seq', afterSeq)
    .order('global_seq', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to read event log from ${afterSeq}: ${error.message}`)
  }

  return (data ?? []).map((row) => toStoredEvent<TEvent>(row))
}

export interface AppendOptions<TEvent extends DomainEvent> {
  tenantId: string
  streamId: string
  streamType: string
  /**
   * The version the caller read before deciding. 0 means "this stream must not
   * exist yet". A mismatch means someone else wrote first.
   */
  expectedVersion: number
  events: readonly EventToAppend<TEvent>[]
  metadata?: EventMetadata
}

/**
 * Append events atomically, failing if the stream moved underneath us.
 *
 * The insert and the version check happen inside the `append_events` Postgres
 * function because they must share a transaction. Note this is the only write
 * that bypasses the query builder - deciding *what* to append, and projecting
 * the result, both stay in TypeScript.
 */
export async function appendToStream<TEvent extends DomainEvent>(
  supabase: Client,
  options: AppendOptions<TEvent>,
): Promise<StoredEvent<TEvent>[]> {
  const { tenantId, streamId, streamType, expectedVersion, events, metadata } = options

  if (events.length === 0) return []

  const payload = events.map((event) => ({
    type: event.type,
    data: event.data ?? {},
    // Per-event metadata wins over the batch-level defaults.
    metadata: { ...metadata, ...event.metadata },
  }))

  const { data, error } = await supabase.rpc('append_events', {
    p_tenant_id: tenantId,
    p_stream_id: streamId,
    p_stream_type: streamType,
    p_expected_version: expectedVersion,
    // The serialization boundary. `TEvent['data']` is domain-typed rather than
    // structurally JSON, so this is where we hand it to supabase-js to
    // stringify. `JsonValue` on EventMetadata keeps the non-domain half honest.
    p_events: payload as unknown as Json,
  })

  if (error) {
    if (isConcurrencyCode(error.code)) {
      throw new ConcurrencyError(streamId, expectedVersion, error.message)
    }
    throw new Error(`Failed to append to stream ${streamId}: ${error.message}`)
  }

  return ((data ?? []) as EventRow[]).map((row) => toStoredEvent<TEvent>(row))
}
