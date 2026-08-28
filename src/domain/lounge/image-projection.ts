import {
  LOUNGE_IMAGE_STREAM_TYPE,
  type LoungeImageEvent,
} from '@/domain/lounge/image-events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * One row per image.
 *
 * Every handler is an assignment rather than an accumulation, so replaying the
 * log twice lands on the same world - the same property the blocks projection
 * relies on. `ImageRemoved` sets a flag instead of deleting the row: the read
 * model then hides it, while the history of where it hung stays in the log.
 */
export const loungeImagesProjection: Projection<LoungeImageEvent> = {
  name: 'lounge_images_read_model',
  streamTypes: [LOUNGE_IMAGE_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<LoungeImageEvent>): Promise<void> {
    switch (event.type) {
      case 'ImagePlaced': {
        const { error } = await supabase.from('lounge_images_read_model').upsert(
          {
            id: event.streamId,
            tenant_id: event.tenantId,
            upload_slug: event.data.uploadSlug,
            x: event.data.x,
            y: event.data.y,
            z: event.data.z,
            width: event.data.width,
            height: event.data.height,
            facing: event.data.facing,
            deleted: false,
            // From the event's actor, never a session: a projection may be
            // replaying something placed by someone who has since left.
            placed_by: event.actorId,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'id' },
        )

        if (error) {
          throw new Error(`lounge images projection failed to place: ${error.message}`)
        }
        return
      }

      case 'ImageMoved':
        await patch(supabase, event, {
          x: event.data.x,
          y: event.data.y,
          z: event.data.z,
        })
        return

      case 'ImageRotated':
        await patch(supabase, event, { facing: event.data.facing })
        return

      case 'ImageResized':
        await patch(supabase, event, {
          width: event.data.width,
          height: event.data.height,
        })
        return

      case 'ImageRemoved':
        await patch(supabase, event, { deleted: true })
        return

      default:
        return
    }
  },
}

async function patch(
  supabase: Client,
  event: StoredEvent<LoungeImageEvent>,
  changes: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('lounge_images_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(
      `lounge images projection failed to update ${event.streamId}: ${error.message}`,
    )
  }
}
