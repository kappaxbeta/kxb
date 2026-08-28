import 'server-only'
import type { Client } from '@/es/store'

/**
 * Which world is being edited, and may this space edit it?
 *
 * Every write into the block table goes through here first. Omitting `worldId`
 * means the workspace's own lounge, which is what every caller meant before
 * battlefields existed. Naming one means somewhere else, and it has to be
 * somewhere *this* space owns: the block table's policies are keyed on
 * `tenant_id` alone, so writing another space's world would be filed under the
 * caller's tenant and produce a second, invisible copy of that world rather
 * than an error. Refusing here is what stops it.
 *
 * Three kinds of world can be named, and the list is exhaustive on purpose - an
 * id that is none of them is refused:
 *
 *   - the space's **lounge**, whose world id is the tenant's own id;
 *   - a **battlefield** this space made;
 *   - a **room** this space opened, whose room id *is* its world id.
 *
 * The room arm is why this file exists. It used to be two copies of a
 * battlefields-only check - one in ./actions.ts, one in ./goal-actions.ts, both
 * annotated as a deliberate duplicate because every export from a `'use server'`
 * module becomes a callable endpoint. Rooms shipped with their blocks in these
 * same chunk streams and neither copy learned about them, so every edit made in
 * a room was refused with "Battlefield not found": blocks appeared under the
 * player's cursor, the fire-and-forget flush swallowed the refusal, and the room
 * was empty again on the next load. Laying a template failed the same way, but
 * visibly - it is the one call whose result the scene waits on.
 *
 * This is that third file. Not a `'use server'` module, so nothing here is
 * reachable from a browser.
 */
export type ResolvedWorld =
  | { ok: false; error: string }
  | {
      ok: true
      worldId: string
      /**
       * Which of the three it turned out to be.
       *
       * Carried out because the mode gate has to ask, and asking again would
       * mean a second round trip to answer a question this function has just
       * answered. Only `buildMode` below reads it.
       */
      kind: 'lounge' | 'battlefield' | 'room'
      /**
       * The room's mode, for a room. Absent for the other two: the lounge's
       * lives on the tenant, and a battlefield has no mode at all - it is
       * edited from its own builder, which is gated on being an owner or admin.
       */
      mode?: 'creative' | 'battle'
    }

/**
 * May anybody build here right now?
 *
 * One sentence back, or null to go ahead. Both callers - ./actions.ts and
 * ./goal-actions.ts - used to write this check inline as `world.worldId ===
 * tenantId && loungeMode !== 'creative'`, which had two consequences: a room
 * was governed by no mode at all (it was not the lounge, so the check passed),
 * and each copy had to be found and changed when rooms got one.
 *
 * The lounge reads the tenant's column and a room reads its own, which is the
 * whole point of the split - see the note on `RoomMode`.
 */
export function buildMode(
  world: Extract<ResolvedWorld, { ok: true }>,
  loungeMode: 'creative' | 'battle',
): string | null {
  if (world.kind === 'lounge' && loungeMode !== 'creative') {
    return 'The lounge is in battle mode — switch to creative to build'
  }
  if (world.kind === 'room' && world.mode !== 'creative') {
    return 'This room is in battle mode — switch to creative to build'
  }
  return null
}

export async function resolveWorld(
  supabase: Client,
  tenantId: string,
  worldId: string | undefined,
): Promise<ResolvedWorld> {
  if (!worldId || worldId === tenantId) {
    return { ok: true, worldId: tenantId, kind: 'lounge' }
  }

  /**
   * Battlefields first, rooms second, and either one is enough.
   *
   * Note what this deliberately does not consult on the battlefield side:
   * `visibility`. A public arena is one strangers may stand in, never one they
   * may build in - see the policy note in 20260803040000_battlefields.sql.
   */
  const arena = await supabase
    .from('battlefields_read_model')
    .select('tenant_id, archived')
    .eq('world_id', worldId)
    .maybeSingle()

  if (arena.error) {
    return { ok: false, error: `Failed to check that world: ${arena.error.message}` }
  }
  if (arena.data) {
    if (arena.data.tenant_id !== tenantId) return { ok: false, error: NOT_FOUND }
    if (arena.data.archived) {
      return { ok: false, error: 'That battlefield has been archived' }
    }
    return { ok: true, worldId, kind: 'battlefield' }
  }

  const room = await supabase
    .from('rooms_read_model')
    // The mode rides along on the lookup that was already happening, so
    // governing a room by its mode costs no extra round trip on the hottest
    // write in the app.
    .select('tenant_id, closed, mode')
    .eq('room_id', worldId)
    .maybeSingle()

  if (room.error) {
    return { ok: false, error: `Failed to check that world: ${room.error.message}` }
  }
  if (!room.data || room.data.tenant_id !== tenantId) {
    return { ok: false, error: NOT_FOUND }
  }
  // Closed, so nobody is standing in it and nobody may build in it either. The
  // blocks stay where they are - closing is a delisting, not a demolition - and
  // reopening would make them editable again.
  if (room.data.closed) return { ok: false, error: 'That room has been closed' }

  return {
    ok: true,
    worldId,
    kind: 'room',
    // Narrowed towards creative for the reason ../rooms/queries.ts gives.
    mode: room.data.mode === 'battle' ? 'battle' : 'creative',
  }
}

/**
 * One sentence for "no such world" and for "somebody else's world".
 *
 * The second is information: a member of one space should not be able to learn
 * that an id they guessed names a real arena somewhere. Same rule `assertOwned`
 * follows on the rooms side.
 */
const NOT_FOUND = 'World not found'
