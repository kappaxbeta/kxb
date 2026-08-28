import { randomUUID } from 'node:crypto'
import { ConcurrencyError } from '@/es/errors'
import { appendToStream, type Client, loadStream } from '@/es/store'
import type { Decider, DomainEvent, EventMetadata, StoredEvent } from '@/es/types'
import { fold } from '@/es/types'

export interface ExecuteOptions<TState, TCommand, TEvent extends DomainEvent> {
  supabase: Client
  decider: Decider<TState, TCommand, TEvent>
  /**
   * The tenant that owns this stream. Passed explicitly rather than read from a
   * session so that it is always the one the caller already checked membership
   * against - see requireTenant() in src/lib/tenant.ts.
   */
  tenantId: string
  streamId: string
  command: TCommand
  metadata?: EventMetadata
  /** Retries on a lost concurrency race. Each retry reloads and re-decides. */
  maxRetries?: number
}

/**
 * The write side of CQRS, in four steps:
 *
 *   1. load  - read the stream's events
 *   2. fold  - replay them into current state
 *   3. decide - ask the pure domain what should happen (may throw DomainError)
 *   4. append - write the new events, guarded by the version we read at step 1
 *
 * If step 4 loses a race, we start over from step 1 rather than forcing the
 * write through. That is the point of optimistic concurrency: the second writer
 * gets to reconsider against what actually happened.
 *
 * With tenants this matters more than it did. Two members of the same tenant
 * really can hit the same stream at the same moment, so the retry loop is no
 * longer a theoretical nicety - it is the thing that makes a shared task list
 * behave.
 */
export async function executeCommand<TState, TCommand, TEvent extends DomainEvent>(
  options: ExecuteOptions<TState, TCommand, TEvent>,
): Promise<StoredEvent<TEvent>[]> {
  const {
    supabase,
    decider,
    tenantId,
    streamId,
    command,
    metadata,
    maxRetries = 3,
  } = options

  let lastError: ConcurrencyError | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const history = await loadStream<TEvent>(supabase, tenantId, streamId)
    const state = fold(decider, history)
    const expectedVersion = history.at(-1)?.version ?? 0

    const decided = decider.decide(state, command)
    if (decided.length === 0) return []

    try {
      return await appendToStream<TEvent>(supabase, {
        tenantId,
        streamId,
        streamType: decider.streamType,
        expectedVersion,
        events: decided.map((event) => ({
          type: event.type,
          data: event.data,
        })) as never,
        metadata: {
          correlationId: randomUUID(),
          ...metadata,
        },
      })
    } catch (error) {
      if (!(error instanceof ConcurrencyError)) throw error
      lastError = error
      // Loop and re-decide against the stream as it now stands.
    }
  }

  throw (
    lastError ??
    new ConcurrencyError(streamId, 0, `Gave up on stream ${streamId} after ${maxRetries} retries`)
  )
}
