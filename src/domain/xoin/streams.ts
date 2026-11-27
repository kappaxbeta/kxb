import 'server-only'
import { uuidv5 } from '@/lib/uuid'

/**
 * Where a space's market lives.
 *
 * `server-only` because `uuidv5` needs `node:crypto` and `events.ts` next door
 * is imported by the browser - the same split the radio and the lounge make.
 *
 * Derived from the tenant rather than being the tenant id, which is the obvious
 * shortcut and is wrong for the reason `radio/streams.ts` spells out at length:
 * `stream_id` has a UNIQUE (stream_id, version) constraint and no stream type in
 * it, so a market sharing the tenant's id would share its version sequence. A
 * trade would then hand a ConcurrencyError to whoever was accepting an
 * invitation at the time, and every membership command would replay a day of
 * trading first.
 *
 * One market per space, so no second component. A per-room market was considered
 * and rejected: the point of a space's market is that the people in the space
 * are trading against each other, and two rooms with two books is two markets
 * with one member each.
 */
const XOIN_NAMESPACE = 'b2f4d7a1-9c3e-4e58-b0d6-2f7a1c845e93'

export function xoinStreamId(tenantId: string): string {
  return uuidv5(tenantId, XOIN_NAMESPACE)
}
