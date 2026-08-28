import 'server-only'
import { uuidv5 } from '@/lib/uuid'

/**
 * Where a space's radio events live.
 *
 * `server-only` because `uuidv5` needs `node:crypto`, and events.ts next door
 * is imported by the browser - the same split `lounge/streams.ts` and
 * `agents/streams.ts` make, and for the same reason.
 *
 * Derived rather than the tenant id itself, which is the obvious shortcut and
 * is wrong. `stream_id` is a plain uuid column with a UNIQUE (stream_id,
 * version) constraint and no stream_type in it, so the tenant aggregate and the
 * radio would share one version sequence: putting a track on would bump the
 * version an in-flight invitation had already read, and `executeCommand` would
 * hand that invitation a ConcurrencyError caused by a song. Every track change
 * would also be replayed by every membership command and vice versa - which is
 * precisely the coupling that keeping the radio off the tenant stream exists to
 * avoid, reintroduced through the back door.
 *
 * So: one namespace, one id per space, derivable from the tenant alone so
 * nothing has to store it.
 */
const RADIO_NAMESPACE = 'a7e3c518-6d24-4b90-8f31-5c0a9d2e74b6'

export function radioStreamId(tenantId: string): string {
  return uuidv5(tenantId, RADIO_NAMESPACE)
}
