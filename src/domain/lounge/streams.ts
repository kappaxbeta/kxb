import { uuidv5 } from '@/lib/uuid'

/**
 * Chunk stream ids, kept apart from ./events.ts on purpose.
 *
 * `uuidv5` needs `node:crypto`, and events.ts is imported by the browser - the
 * scene wants CHUNK_SIZE, WORLD_HEIGHT and blockKey. Leaving the derivation in
 * that module drags a Node built-in into the client bundle, which fails to
 * resolve at build time.
 *
 * The general shape of the rule: a domain module that both halves of the app
 * import must stay free of anything platform-specific. Push the platform bits
 * into a neighbour that only the server touches.
 */
const LOUNGE_CHUNK_NAMESPACE = 'c2f7a4d0-51b6-4e93-8a7c-0d19be4f6a25'

/**
 * A chunk's stream id, derived rather than stored.
 *
 * Deriving means no lookup table whose only job is remembering an id we could
 * have computed, and no chance of a projection pointing at the wrong chunk
 * because a row was missing.
 *
 * The first argument is the *world*, which for a workspace's lounge is its
 * tenant id - so every stream id derived before battlefields existed still
 * derives to the same value, and no history moved. A battlefield passes its own
 * id instead, which is what keeps a saved arena's chunks in their own streams
 * rather than colliding with the lounge's.
 */
export function chunkStreamId(worldId: string, cx: number, cz: number): string {
  return uuidv5(`${worldId}:${cx}:${cz}`, LOUNGE_CHUNK_NAMESPACE)
}
