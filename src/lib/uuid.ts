import { createHash } from 'node:crypto'

/**
 * Deterministic UUIDs, for streams whose id must be *derivable* rather than
 * stored.
 *
 * Two aggregates need this. A Stripe webhook has to find a workspace's
 * subscription stream from metadata alone, and the lounge has to find a chunk's
 * stream from its coordinates. Both would otherwise need a lookup table whose
 * only job is to remember an id we could have computed.
 *
 * UUIDv5 is just "namespaced hash, stamped to look like a UUID". The namespace
 * keeps two different derivations from colliding: subscription("abc") and
 * chunk("abc") hash to different values because they use different namespaces.
 */
export function uuidv5(name: string, namespace: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const digest = createHash('sha1')
    .update(Buffer.concat([namespaceBytes, Buffer.from(name, 'utf8')]))
    .digest()

  const bytes = Buffer.from(digest.subarray(0, 16))
  // Stamp version 5 and the RFC 4122 variant, so the result is a well-formed
  // UUID that Postgres will accept in a uuid column.
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}
