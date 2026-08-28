import { uuidv5 } from '@/lib/uuid'

/**
 * The homestead's stream id, kept out of ./events.ts for the same reason the
 * chunk and avatar ids were: `uuidv5` needs `node:crypto`, and the scene
 * imports the event types in the browser. A domain module both halves of the
 * app import has to stay free of anything platform-specific.
 */
const HOMESTEAD_NAMESPACE = 'f1c93a04-7d52-4e18-9a6b-2c0d84e7b513'

/**
 * One homestead per member per workspace, derived rather than stored.
 *
 * Both ids go into the hash, and the user id is the security boundary as much
 * as the addressing one. Callers never name a homestead: the server action
 * takes the user from the session and derives the stream from it, so there is
 * no argument anyone can pass to reach somebody else's café. Redecorating a
 * colleague's house is not refused - it is unaddressable.
 *
 * The tenant id is in there too because `events.stream_id` is unique across the
 * whole table, so keying on the user alone would collide the moment somebody
 * joined a second workspace.
 *
 * This was `uuidv5(tenantId)` until 20260730000000, when homesteads went from
 * one per workspace to one per member. Streams under the old derivation still
 * exist in the log and are simply never read again - see that migration.
 */
export function homesteadStreamId(tenantId: string, userId: string): string {
  return uuidv5(`${tenantId}:${userId}`, HOMESTEAD_NAMESPACE)
}
