import { type Client, toStoredEvent } from '@/es/store'
import type { DomainEvent, StoredEvent } from '@/es/types'
import type { EventRow } from '@/lib/supabase/types'

/**
 * A projection turns the event log into a read model.
 *
 * `handle` MUST be idempotent. The checkpoint is written after the batch, so a
 * crash between applying an event and saving the cursor means that event gets
 * replayed on the next run. Assignments (`set title`, `set completed`) are
 * naturally idempotent; counters and appends are not, and need a version guard.
 *
 * Everything here is an *untrusted* projection: it feeds the UI, it is allowed
 * to lag, and the signed-in user is the one writing it. Authorization state
 * cannot be built this way - see the trigger in the tenants migration for the
 * one projection that had to be synchronous and database-owned instead.
 */
export interface Projection<TEvent extends DomainEvent = DomainEvent> {
  /** Stable identifier - it is the checkpoint key. Renaming replays from 0. */
  readonly name: string
  /** Streams this projection cares about. Others are skipped but still advance the cursor. */
  readonly streamTypes: readonly string[]
  handle(supabase: Client, event: StoredEvent<TEvent>): Promise<void>
}

async function readCheckpoint(
  supabase: Client,
  projection: string,
  tenantId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('projection_checkpoints')
    .select('last_seq')
    .eq('projection', projection)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read checkpoint for ${projection}: ${error.message}`)
  }

  return Number(data?.last_seq ?? 0)
}

async function writeCheckpoint(
  supabase: Client,
  projection: string,
  tenantId: string,
  lastSeq: number,
): Promise<void> {
  const { error } = await supabase.from('projection_checkpoints').upsert(
    {
      projection,
      tenant_id: tenantId,
      last_seq: lastSeq,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'projection,tenant_id' },
  )

  if (error) {
    throw new Error(`Failed to save checkpoint for ${projection}: ${error.message}`)
  }
}

/**
 * Catch a projection up to the head of one tenant's log.
 *
 * This runs inline after each command, which keeps the example to one process
 * and no queue. The tradeoff is that the read model is only as fresh as the
 * last command; in production you would drive the same `Projection` objects
 * from a background worker following the log, and the code below would not
 * change.
 *
 * Known limitation of a bare `global_seq` cursor: identity values are handed
 * out before commit, so a slow transaction can commit *after* a later one and
 * be skipped. This used to be impossible here, because one user's commands were
 * serialized by their own request. With a shared tenant it is possible again -
 * two members writing at once can interleave that way. The fixes are the usual
 * ones: a transactional outbox, or a `pg_current_snapshot()`-based cursor. The
 * "Replay events" button is the cheap escape hatch until then.
 *
 * @returns how many events were applied
 */
export async function runProjection<TEvent extends DomainEvent>(
  supabase: Client,
  projection: Projection<TEvent>,
  tenantId: string,
  batchSize = 500,
): Promise<number> {
  let applied = 0

  for (;;) {
    /**
     * Cursor and events in one call.
     *
     * This used to be `readCheckpoint` then `readAllFrom` - two round trips
     * that could not overlap, because the second needs the first's answer.
     * Since projections run inline in the request here, that was pure serial
     * latency on every command anybody issues. `events_since_checkpoint` reads
     * exactly what those two read, in the same order, with the same batch
     * size; see its migration for why the tempting version of this change -
     * projecting the events `appendToStream` just handed back - is unsound.
     */
    const { data, error } = await supabase.rpc('events_since_checkpoint', {
      p_tenant_id: tenantId,
      p_projection: projection.name,
      p_limit: batchSize,
    })

    if (error) {
      throw new Error(
        `Failed to read event log for ${projection.name}: ${error.message}`,
      )
    }

    const rows = data ?? []

    /**
     * The cursor rides on every row, including the one the caught-up case
     * returns with a null `global_seq`. Read it before filtering, because
     * filtering is what throws that row away.
     */
    let cursor = Number(rows[0]?.last_seq ?? 0)

    const batch = rows.filter((row) => row.global_seq !== null)
    if (batch.length === 0) break

    for (const row of batch) {
      const event = toStoredEvent<TEvent>(row as unknown as EventRow)

      if (projection.streamTypes.includes(event.streamType)) {
        await projection.handle(supabase, event)
        applied++
      }

      /**
       * `tenant_seq`, and never `global_seq`.
       *
       * These are different counters - one counts every tenant's events, the
       * other counts this tenant's - and `events_since_checkpoint` filters on
       * `tenant_seq`. Advancing by `global_seq` writes a much larger number
       * into the cursor, after which the filter matches nothing and the
       * projection stops for ever without erroring. That is not hypothetical:
       * it shipped, and it stopped every inline projection on production while
       * every page carried on rendering. See 20261122000000.
       *
       * Read off the row rather than the mapped event on purpose. `StoredEvent`
       * carries `globalSeq` and not `tenantSeq`, so mapping first would put the
       * wrong number in easy reach and the right one out of it.
       *
       * Advanced for skipped stream types too - they are not this projection's
       * business, but they are behind it now and re-reading them every run
       * would make an unrelated busy stream slow every projection in the space.
       */
      cursor = Number(row.tenant_seq)
    }

    await writeCheckpoint(supabase, projection.name, tenantId, cursor)

    if (batch.length < batchSize) break
  }

  return applied
}

/**
 * Throw away the read model's progress so the next run replays from the start.
 *
 * This is the party trick of event sourcing: the read model is disposable. You
 * can change its shape, reset the checkpoint, and rebuild it from history
 * without ever migrating the data itself.
 */
export async function resetProjection(
  supabase: Client,
  projection: Projection<DomainEvent>,
  tenantId: string,
): Promise<void> {
  const { error } = await supabase.from('projection_checkpoints').upsert(
    {
      projection: projection.name,
      tenant_id: tenantId,
      last_seq: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'projection,tenant_id' },
  )

  if (error) {
    throw new Error(`Failed to reset checkpoint for ${projection.name}: ${error.message}`)
  }
}
