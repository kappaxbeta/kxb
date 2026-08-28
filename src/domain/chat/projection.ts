import { CHAT_STREAM_TYPE, type ChatEvent, roomOf } from '@/domain/chat/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The chat read model.
 *
 * A straight copy of the events, which is what a projection looks like when the
 * aggregate has nothing clever in it - the upsert is idempotent by assignment,
 * so a replay after a crashed batch lands on the same row.
 *
 * Notably it never writes a takedown, and never has to preserve one either. A
 * hidden message is a row in `hidden_chat_messages`, keyed by message id and
 * untouched by any replay, so this projection can be reset to zero and rebuilt
 * without resurrecting anything a moderator took down. That is the property the
 * separate table was chosen for.
 */
export const chatProjection: Projection<ChatEvent> = {
  name: 'chat_messages_read_model',
  streamTypes: [CHAT_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<ChatEvent>): Promise<void> {
    switch (event.type) {
      case 'MessagePosted':
        await upsert(supabase, {
          id: event.streamId,
          tenant_id: event.tenantId,
          body: event.data.body,
          author_name: event.data.authorName,
          // Null for the lounge, which is what the absence of the key means -
          // see `roomOf`. Written on every row rather than only when present,
          // so a rebuild lands on the same sheet.
          room_id: roomOf(event.data),
          author_id: event.actorId,
          created_at: event.createdAt,
          updated_at: event.createdAt,
          version: event.version,
        })
        return

      default:
        return
    }
  },
}

type ChatMessageRow = {
  id: string
  tenant_id: string
  room_id: string | null
  body: string
  author_name: string
  author_id: string | null
  created_at: string
  updated_at: string
  version: number
}

async function upsert(supabase: Client, row: ChatMessageRow): Promise<void> {
  const { error } = await supabase
    .from('chat_messages_read_model')
    .upsert(row as never, { onConflict: 'id' })
  if (error) {
    throw new Error(`chat projection failed to upsert ${row.id}: ${error.message}`)
  }
}

