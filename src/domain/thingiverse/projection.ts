import {
  BLUEPRINT_STREAM_TYPE,
  type BlueprintEvent,
} from '@/domain/thingiverse/events'
import { CLIP_STREAM_TYPE, type ClipEvent } from '@/domain/thingiverse/clip-events'
import {
  EMOTE_TREE_STREAM_TYPE,
  type EmoteTreeEvent,
} from '@/domain/thingiverse/emote-events'
import { THING_STREAM_TYPE, type ThingEvent } from '@/domain/thingiverse/thing-events'
import type { Projection } from '@/es/projection'
import type { Json } from '@/lib/supabase/types'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The thingiverse's read models, kept by one projection.
 *
 * Two tables and one checkpoint, which is the opposite of what the lounge does
 * next door - blocks, images and goals each have their own projection and their
 * own cursor. The difference is that those three are independent things that
 * happen to share a world, and these two are one feature: a room's furniture is
 * meaningless without the shelf it was summoned from, and a shelf that is a
 * hundred events ahead of the rooms would draw a rail listing things that are
 * not there yet. One cursor is what makes "the shelf and the room agree" a
 * property of the projection rather than a race between two of them.
 *
 * It is also what puts this file in `ALL_PROJECTIONS`. The sweep in
 * /api/cron/project walks `src/domain` for `projection.ts`, so a second file
 * called `thing-projection.ts` would have been silently unswept - which is
 * exactly the failure the registry's test was written to catch.
 *
 * Every handler is an assignment rather than an accumulation, so replaying the
 * log twice lands on the same shelf and the same rooms.
 */
export const thingiverseProjection: Projection<
  BlueprintEvent | ThingEvent | ClipEvent | EmoteTreeEvent
> = {
  name: 'thingiverse_read_model',
  streamTypes: [
    BLUEPRINT_STREAM_TYPE,
    THING_STREAM_TYPE,
    CLIP_STREAM_TYPE,
    /*
      The menu rides this projection rather than getting one of its own for the
      same reason the things do: it is *made of* clips, and a menu a hundred
      events ahead of the clip list would offer rows for animations that do not
      exist yet. One cursor is what makes them agree.
    */
    EMOTE_TREE_STREAM_TYPE,
  ],

  async handle(
    supabase: Client,
    event: StoredEvent<BlueprintEvent | ThingEvent | ClipEvent | EmoteTreeEvent>,
  ): Promise<void> {
    switch (event.type) {
      case 'BlueprintDrawn': {
        const { error } = await supabase.from('thingiverse_blueprints_read_model').upsert(
          {
            id: event.streamId,
            tenant_id: event.tenantId,
            name: event.data.name,
            spec: asJson(event.data.spec),
            // From the event, not from the actor: they are the same person at
            // this moment and come apart at the first hand-over. See the note
            // on `BlueprintDrawn.ownerId`.
            owner_id: event.data.ownerId,
            visibility: event.data.visibility,
            retired: false,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'id' },
        )

        if (error) {
          throw new Error(`thingiverse projection failed to draw: ${error.message}`)
        }
        return
      }

      case 'BlueprintRenamed':
        await patchBlueprint(supabase, event, { name: event.data.name })
        return

      case 'BlueprintReshaped':
        await patchBlueprint(supabase, event, { spec: asJson(event.data.spec) })
        return

      case 'BlueprintVisibilitySet':
        await patchBlueprint(supabase, event, { visibility: event.data.visibility })
        return

      case 'BlueprintHandedOver':
        await patchBlueprint(supabase, event, { owner_id: event.data.ownerId })
        return

      case 'BlueprintRetired':
        await patchBlueprint(supabase, event, { retired: true })
        return

      case 'ThingSummoned': {
        const { error } = await supabase.from('thingiverse_things_read_model').upsert(
          {
            id: event.streamId,
            tenant_id: event.tenantId,
            // The lounge is the world whose id is the tenant's, which is the
            // convention every world-keyed table here already follows.
            world_id: event.data.worldId ?? event.tenantId,
            blueprint_id: event.data.blueprintId,
            x: event.data.x,
            y: event.data.y,
            z: event.data.z,
            facing: event.data.facing,
            scale: event.data.scale,
            // Absent is furniture - see `ThingSummoned.keep`, and the column's
            // own default, which is the backfill for everything already placed.
            keep: event.data.keep ?? true,
            tuning: {} as Json,
            deleted: false,
            placed_by: event.actorId,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'id' },
        )

        if (error) {
          throw new Error(`thingiverse projection failed to summon: ${error.message}`)
        }
        return
      }

      case 'ThingMoved':
        await patchThing(supabase, event, {
          x: event.data.x,
          y: event.data.y,
          z: event.data.z,
        })
        return

      case 'ThingTurned':
        await patchThing(supabase, event, { facing: event.data.facing })
        return

      case 'ThingScaled':
        await patchThing(supabase, event, { scale: event.data.scale })
        return

      case 'ThingTuned':
        await patchThing(supabase, event, { tuning: asJson(event.data.tuning) })
        return

      case 'ThingKeepSet':
        await patchThing(supabase, event, { keep: event.data.keep })
        return

      case 'ThingDismissed':
        await patchThing(supabase, event, { deleted: true })
        return

      case 'EmoteTreeSet': {
        /*
          Keyed on the tenant, because the menu is the space's and there is one.
          The stream id is the same value - see `EMOTE_TREE_STREAM_TYPE` - and
          it is written from `tenantId` rather than `streamId` so the row's key
          says what it *means* rather than where it came from.
        */
        const { error } = await supabase.from('thingiverse_emotes_read_model').upsert(
          {
            tenant_id: event.tenantId,
            tree: asJson(event.data.tree),
            by_id: event.data.byId,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'tenant_id' },
        )

        if (error) {
          throw new Error(`thingiverse projection failed to set the menu: ${error.message}`)
        }
        return
      }

      case 'ClipDrawn': {
        const { error } = await supabase.from('thingiverse_clips_read_model').upsert(
          {
            id: event.streamId,
            tenant_id: event.tenantId,
            name: event.data.name,
            skeleton: event.data.skeleton,
            clip: asJson(event.data.clip),
            doc: asJson(event.data.doc),
            owner_id: event.data.ownerId,
            visibility: event.data.visibility,
            retired: false,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'id' },
        )

        if (error) {
          throw new Error(`thingiverse projection failed to save a clip: ${error.message}`)
        }
        return
      }

      case 'ClipRenamed':
        await patchClip(supabase, event, { name: event.data.name })
        return

      case 'ClipReshaped':
        await patchClip(supabase, event, {
          clip: asJson(event.data.clip),
          doc: asJson(event.data.doc),
        })
        return

      case 'ClipVisibilitySet':
        await patchClip(supabase, event, { visibility: event.data.visibility })
        return

      case 'ClipHandedOver':
        await patchClip(supabase, event, { owner_id: event.data.ownerId })
        return

      case 'ClipRetired':
        await patchClip(supabase, event, { retired: true })
        return

      default:
        return
    }
  },
}

async function patchBlueprint(
  supabase: Client,
  event: StoredEvent<BlueprintEvent | ThingEvent | ClipEvent>,
  changes: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('thingiverse_blueprints_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(
      `thingiverse projection failed to update blueprint ${event.streamId}: ${error.message}`,
    )
  }
}

async function patchThing(
  supabase: Client,
  event: StoredEvent<BlueprintEvent | ThingEvent | ClipEvent>,
  changes: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('thingiverse_things_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(
      `thingiverse projection failed to update thing ${event.streamId}: ${error.message}`,
    )
  }
}

async function patchClip(
  supabase: Client,
  event: StoredEvent<BlueprintEvent | ThingEvent | ClipEvent>,
  changes: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('thingiverse_clips_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(
      `thingiverse projection failed to update clip ${event.streamId}: ${error.message}`,
    )
  }
}

/**
 * A domain value on its way into a `jsonb` column.
 *
 * The generated `Json` type is an open recursive union and `BlueprintSpec` is a
 * closed interface, and TypeScript will not call the second the first: an
 * interface has no index signature, so it cannot be shown to have only JSON
 * values in it even when every field does. This is that gap, named once rather
 * than cast at four call sites.
 *
 * It is safe by construction rather than by assertion: every spec that reaches
 * here was built by `freshSpec` or parsed by `specSchema`, both of which
 * produce plain numbers, strings, booleans, nulls and arrays of the same. A
 * field that one day held a `Date` or a `Map` would round-trip through Postgres
 * as something else, which is what this comment is here to make somebody think
 * about before adding one.
 */
function asJson(value: unknown): Json {
  return value as Json
}
