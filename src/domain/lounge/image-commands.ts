import { z } from 'zod'
import { WORLD_HEIGHT } from '@/domain/lounge/events'
import { MAX_IMAGE_SIZE, MIN_IMAGE_SIZE } from '@/domain/lounge/image-events'

const coordinate = z.number().int().min(-100_000).max(100_000)
const cellSize = z.number().int().min(MIN_IMAGE_SIZE).max(MAX_IMAGE_SIZE)
const facing = z.number().int().min(0).max(3)

export const imageCellSchema = z.object({
  x: coordinate,
  y: z.number().int().min(0).max(WORLD_HEIGHT - 1),
  z: coordinate,
})

export const placeImageSchema = imageCellSchema.extend({
  // Matches the opaque slug the upload route mints. Bounded so a crafted value
  // cannot put an essay into an immutable log.
  uploadSlug: z.string().min(1).max(64),
  width: cellSize,
  height: cellSize,
  facing,
})

export const moveImageSchema = imageCellSchema.extend({ id: z.uuid() })

export const rotateImageSchema = z.object({ id: z.uuid(), facing })

export const resizeImageSchema = z.object({
  id: z.uuid(),
  width: cellSize,
  height: cellSize,
})

export const imageIdSchema = z.object({ id: z.uuid() })

export type PlaceImage = {
  type: 'PlaceImage'
  uploadSlug: string
  x: number
  y: number
  z: number
  width: number
  height: number
  facing: number
}

export type MoveImage = { type: 'MoveImage'; x: number; y: number; z: number }

export type RotateImage = { type: 'RotateImage'; facing: number }

export type ResizeImage = { type: 'ResizeImage'; width: number; height: number }

export type RemoveImage = { type: 'RemoveImage' }

export type LoungeImageCommand =
  | PlaceImage
  | MoveImage
  | RotateImage
  | ResizeImage
  | RemoveImage
