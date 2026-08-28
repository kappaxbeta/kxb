import 'server-only'
import { MAX_BLOCKS_LOADED } from '@/domain/lounge/events'
import type { Client } from '@/es/store'

/**
 * The read side of the lounge.
 *
 * Deliberately dumb: hand the renderer a flat list of blocks and let it build
 * whatever it needs. No meshing, no grouping by chunk, no geometry - all of
 * that is the client's problem, and doing it here would mean shipping a
 * different payload every time the renderer changed.
 */

export interface BlockView {
  x: number
  y: number
  z: number
  /** Palette id, e.g. "dirt_with_grass". */
  model: string
}

/**
 * The read cap, re-exported so this module's callers need not know where it
 * lives. It moved to ./events.ts because `MAX_WORLD_BLOCKS` has to stay below
 * it, and an invariant between two constants is worth a test - which cannot
 * import this file, since `server-only` above refuses to load outside a server
 * component.
 */
export { MAX_BLOCKS_LOADED }

/**
 * Rows per request.
 *
 * PostgREST enforces its own ceiling on how many rows a single response may
 * carry, and asking for more does not raise it - the response is silently
 * truncated, with no error and nothing to distinguish "that is the whole world"
 * from "that is the first N blocks of it". A partial world renders as a floor
 * full of holes, which looks like a generation bug rather than a transport one.
 *
 * So: page explicitly, in chunks small enough to sit under any sane server
 * cap, and keep going until a short page proves the end was reached.
 */
const PAGE_SIZE = 1000

/**
 * `worldId` defaults to the tenant's own lounge, which is the world every
 * caller meant before battlefields existed - and matches how `worldOf()` reads
 * an event that predates the column.
 */
export async function listLoungeBlocks(
  supabase: Client,
  tenantId: string,
  worldId: string = tenantId,
): Promise<BlockView[]> {
  const blocks: BlockView[] = []
  let offset = 0

  while (offset < MAX_BLOCKS_LOADED) {
    const { data, error } = await supabase
      .from('lounge_blocks_read_model')
      .select('x, y, z, type')
      .eq('tenant_id', tenantId)
      .eq('world_id', worldId)
      // A stable order is what makes ranges mean anything. Without it Postgres
      // may return rows in a different order per request, so page two could
      // repeat or skip rows from page one.
      .order('x', { ascending: true })
      .order('y', { ascending: true })
      .order('z', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Failed to load the lounge: ${error.message}`)
    }

    const page = data ?? []
    for (const row of page) {
      blocks.push({ x: row.x, y: row.y, z: row.z, model: row.type })
    }

    // Advance by what actually arrived, and stop only on an empty page.
    //
    // Not by PAGE_SIZE, and not "stop when the page is short": the server is
    // free to return fewer rows than asked for, and treating that as the end is
    // exactly the bug this function exists to fix - it would resume reading
    // past rows that were never delivered, or quit early believing the world
    // had ended.
    if (page.length === 0) break
    offset += page.length
  }

  return blocks
}
