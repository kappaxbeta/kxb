import type { DomainEvent, JsonValue } from '@/es/types'

export type PageCreated = DomainEvent<
  'PageCreated',
  { parentId: string | null; title: string; position: number }
>

export type PageStructureUpdated = DomainEvent<
  'PageStructureUpdated',
  { parentId: string | null; title: string; position: number }
>

export type PageContentUpdated = DomainEvent<
  'PageContentUpdated',
  { doc: JsonValue }
>

export type PageDeleted = DomainEvent<'PageDeleted', Record<string, never>>

export type PageEvent =
  | PageCreated
  | PageStructureUpdated
  | PageContentUpdated
  | PageDeleted

export const PAGE_STREAM_TYPE = 'page'

export const PAGE_EVENT_LABELS: Record<PageEvent['type'], string> = {
  PageCreated: 'created',
  PageStructureUpdated: 'restructured',
  PageContentUpdated: 'edited',
  PageDeleted: 'deleted',
}
