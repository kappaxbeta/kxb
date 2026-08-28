import 'server-only'
import type { Client } from '@/es/store'

export interface LoungeImageView {
  id: string
  /** Render as `/api/uploads/<uploadSlug>`; the route enforces membership. */
  uploadSlug: string
  x: number
  y: number
  z: number
  width: number
  height: number
  facing: number
}

/**
 * Every image standing in a workspace's world.
 *
 * Not paged, unlike the blocks: a world holds thousands of blocks but a handful
 * of images, so a single request is both correct and comfortably under the
 * 1,000-row response ceiling that truncated the block query.
 */
export async function listLoungeImages(
  supabase: Client,
  tenantId: string,
): Promise<LoungeImageView[]> {
  const { data, error } = await supabase
    .from('lounge_images_read_model')
    .select('id, upload_slug, x, y, z, width, height, facing')
    .eq('tenant_id', tenantId)
    .eq('deleted', false)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    throw new Error(`Failed to load lounge images: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    uploadSlug: row.upload_slug,
    x: row.x,
    y: row.y,
    z: row.z,
    width: row.width,
    height: row.height,
    facing: row.facing,
  }))
}
