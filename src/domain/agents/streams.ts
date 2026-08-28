import { uuidv5 } from '@/lib/uuid'

/**
 * Kept out of ./events.ts for the same reason `homesteadStreamId` was: `uuidv5`
 * needs `node:crypto`, and the scenes import the event types in the browser.
 */
const AGENTS_NAMESPACE = '6b0f2d17-98ac-4c3e-b1a5-0d7e4f2c8a19'

/**
 * One roster per member per workspace, derived rather than stored.
 *
 * Both ids go in, for the two reasons the homestead's does: the user id is the
 * security boundary - callers never name a roster, the action takes the user
 * from the session - and the tenant id is what keeps `events.stream_id`, which
 * is unique across the whole table, from colliding when somebody joins a second
 * workspace.
 */
export function agentsStreamId(tenantId: string, userId: string): string {
  return uuidv5(`${tenantId}:${userId}`, AGENTS_NAMESPACE)
}
