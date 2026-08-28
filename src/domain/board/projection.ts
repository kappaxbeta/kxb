import type { Reactions } from '@/domain/board/aggregate'
import { BOARD_STREAM_TYPE, type BoardEvent } from '@/domain/board/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The pinboard read model.
 *
 * Reactions are the one thing here that is not a straight copy of the event.
 * A reaction event says "Ada put face 4 on this", and the row holds the whole
 * map, so the handler has to read the current map before writing the next one.
 * That read-modify-write is safe because a projection is single-threaded per
 * tenant and strictly ordered by `global_seq` - the same property that lets it
 * be replayed from zero and land on the same answer.
 */
export const boardProjection: Projection<BoardEvent> = {
  name: 'board_posts_read_model',
  streamTypes: [BOARD_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<BoardEvent>): Promise<void> {
    switch (event.type) {
      case 'PostPublished':
        await upsert(supabase, {
          id: event.streamId,
          tenant_id: event.tenantId,
          body: event.data.body,
          pinned: event.data.pinned,
          scene_id: event.data.sceneId ?? null,
          image_slug: event.data.imageSlug ?? null,
          reactions: {},
          edited: false,
          deleted: false,
          created_by: event.actorId,
          created_at: event.createdAt,
          updated_at: event.createdAt,
          version: event.version,
        })
        return

      case 'PostEdited':
        await patch(supabase, event, { body: event.data.body, edited: true })
        return

      case 'PostPinUpdated':
        await patch(supabase, event, { pinned: event.data.pinned })
        return

      case 'PostReacted': {
        const reactions = await readReactions(supabase, event.streamId)
        const key = String(event.data.emote)
        const current = reactions[key] ?? []
        if (current.includes(event.data.userId)) return
        await patch(supabase, event, {
          reactions: { ...reactions, [key]: [...current, event.data.userId] },
        })
        return
      }

      case 'PostUnreacted': {
        const reactions = await readReactions(supabase, event.streamId)
        const key = String(event.data.emote)
        const left = (reactions[key] ?? []).filter(
          (userId) => userId !== event.data.userId,
        )
        const next = { ...reactions }
        if (left.length === 0) delete next[key]
        else next[key] = left
        await patch(supabase, event, { reactions: next })
        return
      }

      case 'PostDeleted':
        await patch(supabase, event, { deleted: true })
        return

      default:
        return
    }
  },
}

type BoardPostRow = {
  id: string
  tenant_id: string
  body: string
  pinned: boolean
  /** An id into published_scenes, or null. Never a foreign key - see the migration. */
  scene_id: string | null
  /** An upload slug, or null. Not a foreign key either, and for the same reason. */
  image_slug: string | null
  reactions: Reactions
  edited: boolean
  deleted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  version: number
}

/**
 * The current reaction map for one post.
 *
 * A missing row reads as `{}` rather than throwing: a reaction whose post was
 * never projected is a replay ordering the projector cannot produce, and if it
 * somehow happened, the subsequent `patch` no-ops against zero rows anyway.
 */
async function readReactions(supabase: Client, postId: string): Promise<Reactions> {
  const { data, error } = await supabase
    .from('board_posts_read_model')
    .select('reactions')
    .eq('id', postId)
    .maybeSingle()

  if (error) {
    throw new Error(`board projection failed to read ${postId}: ${error.message}`)
  }

  return (data?.reactions as Reactions | null) ?? {}
}

async function upsert(supabase: Client, row: BoardPostRow): Promise<void> {
  const { error } = await supabase
    .from('board_posts_read_model')
    .upsert(row as never, { onConflict: 'id' })
  if (error) {
    throw new Error(`board projection failed to upsert ${row.id}: ${error.message}`)
  }
}

async function patch(
  supabase: Client,
  event: StoredEvent<BoardEvent>,
  changes: Partial<BoardPostRow>,
): Promise<void> {
  const { error } = await supabase
    .from('board_posts_read_model')
    .update({
      ...changes,
      updated_at: event.createdAt,
      version: event.version,
    } as never)
    .eq('id', event.streamId)

  if (error) {
    throw new Error(
      `board projection failed to update ${event.streamId}: ${error.message}`,
    )
  }
}
