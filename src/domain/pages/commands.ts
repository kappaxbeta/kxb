import { z } from 'zod'
import type { JsonValue } from '@/es/types'

export const pageTitleSchema = z
  .string()
  .trim()
  .min(1, 'Title cannot be empty')
  .max(200, 'Title cannot exceed 200 characters')

export const createPageSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  title: pageTitleSchema,
  position: z.number().optional(),
})

export const updatePageStructureSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  title: pageTitleSchema,
  position: z.number(),
})

export const updatePageContentSchema = z.object({
  id: z.string().uuid(),
  doc: z.custom<JsonValue>(),
})

export const pageIdSchema = z.object({
  id: z.string().uuid(),
})

export type CreatePage = {
  type: 'CreatePage'
  parentId: string | null
  title: string
  position: number
}

export type UpdatePageStructure = {
  type: 'UpdatePageStructure'
  parentId: string | null
  title: string
  position: number
}

export type UpdatePageContent = {
  type: 'UpdatePageContent'
  doc: JsonValue
}

export type DeletePage = {
  type: 'DeletePage'
}

export type PageCommand =
  | CreatePage
  | UpdatePageStructure
  | UpdatePageContent
  | DeletePage
