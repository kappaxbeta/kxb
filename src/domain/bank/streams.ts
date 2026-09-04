import { uuidv5 } from '@/lib/uuid'

/**
 * The bank's stream id, derived from the space and nothing else.
 *
 * Kept out of `events.ts` for the reason `homestead/streams.ts` gives about its
 * own: `uuidv5` needs `node:crypto`, and the event types are imported by client
 * code that draws a balance. A module both halves of the app import has to stay
 * free of anything platform-specific.
 *
 * One bank per space, so the tenant id is the whole of the input. Note it is
 * hashed rather than used directly: `events.stream_id` is unique across the
 * table, and the tenant's own id already names the tenant aggregate's stream.
 * Passing it through unchanged would put a space's bank movements and its
 * ownership history in the same stream, which would be two aggregates sharing
 * one optimistic-concurrency lock and one version counter.
 */
const BANK_NAMESPACE = '4a6f2b91-5c38-4d17-9e0a-7b3c62d8f4e1'

export function bankStreamId(tenantId: string): string {
  return uuidv5(tenantId, BANK_NAMESPACE)
}
