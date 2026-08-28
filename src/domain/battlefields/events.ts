import type { DomainEvent } from '@/es/types'

/**
 * A battlefield is a saved world.
 *
 * The blocks in it are not here. They live where every other voxel lives - in
 * the lounge's chunk streams, keyed by `worldId` (see domain/lounge/events.ts),
 * projected into the same table. What this aggregate holds is the *identity*:
 * a name, who made it, and who is allowed to find it.
 *
 * That split is the whole design. A battlefield is not a different kind of
 * world with a different renderer and a different editor; it is the lounge's
 * world, saved under a name, so everything already built for building carries
 * over unchanged. This stream exists only because "the arena formerly called
 * Sandpit is now called Coliseum" is a fact about an object with a lifecycle,
 * and a lifecycle wants its own stream - the same argument image-events.ts
 * makes for images.
 *
 * The battlefield's stream id *is* its world id. One less thing to store, and
 * no way for the two to drift apart.
 */

export const BATTLEFIELD_STREAM_TYPE = 'battlefield'

/**
 * Who may find this arena.
 *
 * `'space'` - only the workspace that built it.
 * `'public'` - any signed-in space, which is what makes it choosable as the
 *   ground for a cross-space challenge. Note this grants *finding and playing
 *   on* it, never editing: the creating space stays the only one that can place
 *   a block in it.
 */
export type BattlefieldVisibility = 'space' | 'public'

export const BATTLEFIELD_NAME_MAX = 60

export type BattlefieldCreated = DomainEvent<
  'BattlefieldCreated',
  { name: string; createdBy: string; visibility: BattlefieldVisibility }
>

export type BattlefieldRenamed = DomainEvent<'BattlefieldRenamed', { name: string }>

export type BattlefieldVisibilitySet = DomainEvent<
  'BattlefieldVisibilitySet',
  { visibility: BattlefieldVisibility }
>

/**
 * Retired, not deleted.
 *
 * The blocks stay exactly where they are - a battle fought here last month
 * still refers to a world that can be rebuilt from its chunk streams. All this
 * removes is the arena's place in the list of things you can pick.
 */
export type BattlefieldArchived = DomainEvent<
  'BattlefieldArchived',
  Record<string, never>
>

export type BattlefieldEvent =
  | BattlefieldCreated
  | BattlefieldRenamed
  | BattlefieldVisibilitySet
  | BattlefieldArchived

export const BATTLEFIELD_EVENT_LABELS: Record<BattlefieldEvent['type'], string> = {
  BattlefieldCreated: 'battlefield created',
  BattlefieldRenamed: 'battlefield renamed',
  BattlefieldVisibilitySet: 'battlefield visibility changed',
  BattlefieldArchived: 'battlefield archived',
}
