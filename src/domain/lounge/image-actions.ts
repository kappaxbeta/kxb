'use server'

import { randomUUID } from 'node:crypto'
import { loungeImageDecider } from '@/domain/lounge/image-aggregate'
import {
  imageIdSchema,
  type LoungeImageCommand,
  moveImageSchema,
  placeImageSchema,
  resizeImageSchema,
  rotateImageSchema,
} from '@/domain/lounge/image-commands'
import { loungeImagesProjection } from '@/domain/lounge/image-projection'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Commands for images in the lounge.
 *
 * Each image is its own stream, so these look like the task actions rather than
 * the block ones: no batching, no chunk arithmetic, just load-fold-decide-append
 * against one aggregate. Moving an image is a single event, not 40 - which is
 * the reason images got their own aggregate in the first place.
 *
 * Like the block edits, none of these revalidate the page. The lounge is a live
 * canvas, and re-rendering the route would tear down the WebGL context.
 */

export type ImageResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

function toResult(error: unknown): { ok: false; error: string } {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'Someone else changed that image. Try again.' }
  }
  throw error
}

/** Shared preamble: membership, and whether the workspace may record anything. */
async function prepare(slug: string) {
  const context = await requireTenant(slug)
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false as const, error: blocked }

  return {
    ok: true as const,
    supabase: context.supabase,
    tenantId: context.tenant.id,
    userId: context.user.id,
  }
}

async function dispatch(
  slug: string,
  streamId: string,
  command: LoungeImageCommand,
): Promise<ImageResult> {
  const prepared = await prepare(slug)
  if (!prepared.ok) return prepared

  const { supabase, tenantId, userId } = prepared

  try {
    await executeCommand({
      supabase,
      decider: loungeImageDecider,
      tenantId,
      streamId,
      command,
      metadata: { actorId: userId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, loungeImagesProjection, tenantId)
  return { ok: true, id: streamId }
}

/**
 * Hang a freshly uploaded image in the world.
 *
 * The id is minted here rather than by the client, for the same reason task ids
 * are: the stream id has to exist before the first event is written, and it is
 * not something a browser should get to choose.
 *
 * `uploadSlug` is trusted only as far as RLS allows - the serving route resolves
 * it with the viewer's own session, so a slug from another workspace renders as
 * a 404 rather than leaking anything.
 */
export async function placeLoungeImage(
  slug: string,
  input: {
    uploadSlug: string
    x: number
    y: number
    z: number
    width: number
    height: number
    facing: number
  },
): Promise<ImageResult> {
  const parsed = placeImageSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid image' }
  }

  return dispatch(slug, randomUUID(), { type: 'PlaceImage', ...parsed.data })
}

export async function moveLoungeImage(
  slug: string,
  input: { id: string; x: number; y: number; z: number },
): Promise<ImageResult> {
  const parsed = moveImageSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid position' }
  }

  const { id, ...cell } = parsed.data
  return dispatch(slug, id, { type: 'MoveImage', ...cell })
}

/** Turn in place. `facing` is quarter turns; the decider wraps out-of-range. */
export async function rotateLoungeImage(
  slug: string,
  input: { id: string; facing: number },
): Promise<ImageResult> {
  const parsed = rotateImageSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid rotation' }
  }

  return dispatch(slug, parsed.data.id, {
    type: 'RotateImage',
    facing: parsed.data.facing,
  })
}

export async function resizeLoungeImage(
  slug: string,
  input: { id: string; width: number; height: number },
): Promise<ImageResult> {
  const parsed = resizeImageSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid size' }
  }

  const { id, width, height } = parsed.data
  return dispatch(slug, id, { type: 'ResizeImage', width, height })
}

export async function removeLoungeImage(
  slug: string,
  id: string,
): Promise<ImageResult> {
  const parsed = imageIdSchema.safeParse({ id })
  if (!parsed.success) return { ok: false, error: 'Invalid image id' }

  return dispatch(slug, parsed.data.id, { type: 'RemoveImage' })
}
