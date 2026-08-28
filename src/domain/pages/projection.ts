import { type PageEvent, PAGE_STREAM_TYPE } from '@/domain/pages/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { JsonValue, StoredEvent } from '@/es/types'

export const pagesProjection: Projection<PageEvent> = {
  name: 'pages_read_model',
  streamTypes: [PAGE_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<PageEvent>): Promise<void> {
    switch (event.type) {
      case 'PageCreated':
        await upsert(supabase, {
          id: event.streamId,
          tenant_id: event.tenantId,
          parent_id: event.data.parentId,
          title: event.data.title,
          position: event.data.position,
          doc: { type: 'doc', content: [] },
          deleted: false,
          created_by: event.actorId,
          created_at: event.createdAt,
          updated_at: event.createdAt,
          version: event.version,
        })
        return

      case 'PageStructureUpdated':
        await patch(supabase, event, {
          parent_id: event.data.parentId,
          title: event.data.title,
          position: event.data.position,
        })
        return

      case 'PageContentUpdated':
        await patch(supabase, event, {
          doc: event.data.doc,
        })
        return

      case 'PageDeleted':
        await patch(supabase, event, { deleted: true })
        return

      default:
        return
    }
  },
}

type PageRow = {
  id: string
  tenant_id: string
  parent_id: string | null
  title: string
  position: number
  doc: JsonValue
  deleted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  version: number
}

async function upsert(supabase: Client, row: PageRow): Promise<void> {
  const { error } = await supabase
    .from('pages_read_model')
    .upsert(row as never, { onConflict: 'id' })
  if (error) {
    throw new Error(`pages projection failed to upsert ${row.id}: ${error.message}`)
  }
}

async function patch(
  supabase: Client,
  event: StoredEvent<PageEvent>,
  changes: Partial<PageRow>,
): Promise<void> {
  const { error } = await supabase
    .from('pages_read_model')
    .update({
      ...changes,
      updated_at: event.createdAt,
      version: event.version,
    } as never)
    .eq('id', event.streamId)

  if (error) {
    throw new Error(`pages projection failed to update ${event.streamId}: ${error.message}`)
  }
}
