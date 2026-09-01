import type { DomainEvent } from '@/es/types'
import type { BlueprintSpec } from '@/domain/thingiverse/blueprint'

/**
 * What happens to a blueprint over its life.
 *
 * One stream per blueprint, which puts it on the same side of the line images
 * and goals are on and for the same reason (./image-events.ts in the lounge
 * makes the argument at length): a blueprint has *identity*. It is renamed,
 * retuned, published, handed to somebody else and eventually retired, and every
 * one of those refers to the same object across time.
 *
 * ---------------------------------------------------------------------------
 * Why the spec travels whole
 * ---------------------------------------------------------------------------
 * `BlueprintReshaped` carries the entire spec rather than the fields that
 * changed. That is unusual here - `GoalMoved` carries a position and nothing
 * else - and it is the right trade for this one because of what a spec *is*:
 * seven fields edited together in one panel, where changing `body` from null to
 * `{}` and `blocking` from true to false at the same moment is one decision
 * ("make this a ball"), not two facts. A per-field event set would be six event
 * types, six handlers and a log that tells you what moved without ever telling
 * you what the thing became.
 *
 * The name is the exception and gets its own event, because it is the one field
 * that is not about the object's substance - it is what everybody else calls
 * it, and a log that says plainly "this was renamed" is worth the extra type.
 */

export const BLUEPRINT_STREAM_TYPE = 'thingiverse_blueprint'

/**
 * Who may summon it.
 *
 * Two words, not three. `private` is yours alone; `public` is everybody in the
 * space. There is deliberately no platform-wide value here, even though the
 * word "public" invites one: every read model in this product is keyed by
 * tenant and every policy on it asks `tenant_role()`, so a blueprint visible
 * across spaces would be the first row in the system that is not somebody's.
 * That is a real feature - it is how the shelf gets a starter set - and it is
 * the `builtin_xps` shape (an operator-owned overlay, seeded from the
 * backoffice), not a third value on this column.
 */
export const BLUEPRINT_VISIBILITIES = ['private', 'public'] as const
export type BlueprintVisibility = (typeof BLUEPRINT_VISIBILITIES)[number]

export type BlueprintDrawn = DomainEvent<
  'BlueprintDrawn',
  {
    name: string
    spec: BlueprintSpec
    /**
     * Who it belongs to.
     *
     * In the event data as well as in the metadata's `actorId`, and the
     * duplication is on purpose: the actor is *who did this*, and the owner is
     * *whose it is*. They are the same person at this one moment and come apart
     * the first time an admin draws a blueprint on somebody's behalf, or the
     * first time one is handed over - at which point a projection that had read
     * ownership out of the actor would be quietly wrong about every row.
     */
    ownerId: string
    visibility: BlueprintVisibility
  }
>

export type BlueprintRenamed = DomainEvent<'BlueprintRenamed', { name: string }>

/** The whole spec, as it now is. See the note above about why it is whole. */
export type BlueprintReshaped = DomainEvent<'BlueprintReshaped', { spec: BlueprintSpec }>

/**
 * Put on the shelf everybody can reach, or taken back off it.
 *
 * One event with a value rather than `Published`/`Withdrawn`, because unlike
 * the goal that is handed between teams, this is a two-state switch somebody
 * flips back and forth - and a pair of events would make "is it public" a
 * question you answer by finding the later of two types in the log.
 */
export type BlueprintVisibilitySet = DomainEvent<
  'BlueprintVisibilitySet',
  { visibility: BlueprintVisibility }
>

/**
 * Given to somebody else.
 *
 * Its own event, and the most consequential one here: ownership is what decides
 * who may reshape, publish and retire this thing, and a log that makes you diff
 * two snapshots to find out when it changed is a log nobody will trust when it
 * matters. The *old* owner rides along for the same reason - "handed to Sam" is
 * half a sentence.
 */
export type BlueprintHandedOver = DomainEvent<
  'BlueprintHandedOver',
  { ownerId: string; formerOwnerId: string }
>

/**
 * Taken off the shelf for good.
 *
 * Soft, like every removal in this codebase: the row is hidden and the history
 * of what the thing was stays in the log.
 *
 * Things already standing in rooms are deliberately *not* swept away with it.
 * Retiring is "take this off the shelf", not "go round the building removing
 * the furniture" - the second is a destructive cascade nobody asked for, and
 * one that would let a single click empty every room in the space. The room's
 * read path resolves a thing's blueprint whether or not it is retired, so what
 * is standing stays standing and only the shelf gets shorter.
 */
export type BlueprintRetired = DomainEvent<'BlueprintRetired', Record<string, never>>

export type BlueprintEvent =
  | BlueprintDrawn
  | BlueprintRenamed
  | BlueprintReshaped
  | BlueprintVisibilitySet
  | BlueprintHandedOver
  | BlueprintRetired

export const BLUEPRINT_EVENT_LABELS: Record<BlueprintEvent['type'], string> = {
  BlueprintDrawn: 'blueprint drawn',
  BlueprintRenamed: 'blueprint renamed',
  BlueprintReshaped: 'blueprint changed',
  BlueprintVisibilitySet: 'blueprint shared',
  BlueprintHandedOver: 'blueprint handed over',
  BlueprintRetired: 'blueprint retired',
}
