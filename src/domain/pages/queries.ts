import 'server-only'
import type { PageEvent } from '@/domain/pages/events'
import type { Client } from '@/es/store'
import type { JsonValue, StoredEvent } from '@/es/types'

export interface PageView {
  id: string
  parentId: string | null
  title: string
  position: number
  doc: JsonValue
  createdBy: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export async function listPages(supabase: Client, tenantId: string): Promise<PageView[]> {
  const { data, error } = await supabase
    .from('pages_read_model')
    .select('id, parent_id, title, position, doc, created_by, created_at, updated_at, version')
    .eq('tenant_id', tenantId)
    .eq('deleted', false)
    .order('position', { ascending: true })

  if (error) {
    throw new Error(`Failed to list pages: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    position: row.position,
    doc: row.doc as JsonValue,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  }))
}

export async function getPage(
  supabase: Client,
  tenantId: string,
  pageId: string,
): Promise<PageView | null> {
  const { data, error } = await supabase
    .from('pages_read_model')
    .select('id, parent_id, title, position, doc, created_by, created_at, updated_at, version')
    .eq('tenant_id', tenantId)
    .eq('id', pageId)
    .eq('deleted', false)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get page ${pageId}: ${error.message}`)
  }

  if (!data) return null

  return {
    id: data.id,
    parentId: data.parent_id,
    title: data.title,
    position: data.position,
    doc: data.doc as JsonValue,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    version: data.version,
  }
}

export async function listPageHistory(
  supabase: Client,
  tenantId: string,
  pageId: string,
): Promise<StoredEvent<PageEvent>[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('stream_id', pageId)
    .order('version', { ascending: true })

  if (error) {
    throw new Error(`Failed to read history for page ${pageId}: ${error.message}`)
  }

  return (data ?? []).map(
    (row) =>
      ({
        type: row.type,
        data: row.data,
        globalSeq: Number(row.global_seq),
        tenantId: row.tenant_id,
        streamId: row.stream_id,
        streamType: row.stream_type,
        version: row.version,
        actorId: row.actor_id,
        createdAt: row.created_at,
        metadata: row.metadata ?? {},
      }) as StoredEvent<PageEvent>,
  )
}
