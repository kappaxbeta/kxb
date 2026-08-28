import 'server-only'
import { parseHero, type StudioHero } from '@/domain/studio/hero'
import type { Client } from '@/es/store'

/**
 * Saved banners: the read side.
 *
 * A banner is a hero document with a name on it and a rendering beside it - see
 * 20260909000000_event_banners.sql for why both are stored and why the poster
 * is a slug rather than bytes.
 *
 * Everything here reads through the caller's own client, because the select
 * policy on `event_banners` already says the right thing: anybody standing in
 * the space may see what the space has composed. The two public surfaces - the
 * door and the front page - do not go through here at all; they go through
 * `./door`, which is the one place the deliberate disclosure is written down.
 */

export interface BannerView {
  id: string
  name: string
  /** Already through `parseHero`, so a row written before a field existed still opens. */
  document: StudioHero
  /** The `uploads.slug` of the baked frame, or null when it was saved without one. */
  posterSlug: string | null
  updatedAt: string
}

type BannerRow = {
  id: string
  name: string
  document: unknown
  poster_slug: string | null
  updated_at: string
}

function toView(row: BannerRow): BannerView {
  return {
    id: row.id,
    name: row.name,
    // Parsed on the way out as well as on the way in. The document is opaque to
    // the database, so this is the boundary that makes a row from an older
    // version of the composer render rather than throw - see the migration.
    document: parseHero(row.document),
    posterSlug: row.poster_slug,
    updatedAt: row.updated_at,
  }
}

/**
 * Every banner this space has saved, newest first.
 *
 * The list behind the picker in Settings and behind "open one again" in the
 * studio. Ordered by `updated_at` rather than `created_at`: a host who has
 * re-saved a banner twice this morning is working on that one, and it should
 * not sink under a draft from a fortnight ago.
 */
export async function listBanners(
  supabase: Client,
  tenantId: string,
): Promise<BannerView[]> {
  const { data, error } = await supabase
    .from('event_banners')
    .select('id, name, document, poster_slug, updated_at')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to list banners: ${error.message}`)

  return (data ?? []).map((row) => toView(row as BannerRow))
}

/**
 * One banner, or null.
 *
 * Null rather than a throw for the reason `getEvent` gives: a banner that has
 * been deleted since the page linked to it is a missing picture, and taking out
 * the page around it would be a worse answer than showing the page without it.
 */
export async function getBanner(
  supabase: Client,
  id: string,
): Promise<BannerView | null> {
  const { data, error } = await supabase
    .from('event_banners')
    .select('id, name, document, poster_slug, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null

  return toView(data as BannerRow)
}
