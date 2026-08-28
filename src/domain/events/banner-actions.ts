'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseHero } from '@/domain/studio/hero'
import type { Json } from '@/lib/supabase/database.types'
import { requireTenant } from '@/lib/tenant'

export type BannerResult = { ok: true; id: string } | { ok: false; error: string }
export type AttachResult = { ok: true } | { ok: false; error: string }

/**
 * Saving a banner, and attaching one. Two actions, because they are two
 * decisions by two different people on two different days: composing is a
 * afternoon in the studio, and attaching is a click in Settings on the morning
 * of the event.
 */

const saveSchema = z.object({
  name: z.string().trim().min(1, 'Give the banner a name').max(60, 'That name is too long'),
  /**
   * The upload the poster was baked into, or nothing.
   *
   * A slug, not a URL - the caller has just been handed one by /api/upload and
   * anything else in this field is somebody driving the action by hand. The
   * shape is checked here and the *ownership* is checked below, which is the
   * one that matters: this slug ends up served to the public.
   */
  posterSlug: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'That is not an upload')
    .optional(),
})

/**
 * A banner, saved into the space that composed it.
 *
 * The document is not validated field by field here. `parseHero` is the
 * validator - it clamps every number, drops any layout or block model it does
 * not know, and cannot throw - and running it on the way in means the row is
 * already normal before anything reads it. A zod schema mirroring `StudioHero`
 * would be a second copy of that parser to keep in step with the first.
 *
 * Insert-or-update rather than always-insert, keyed by the id the studio may
 * hand back. Re-saving is the common act - the tenth take of a banner somebody
 * spent an evening on - and a table that grew a row per take would make the
 * picker in Settings a list of ten things called "banner".
 */
export async function saveEventBanner(
  slug: string,
  input: {
    id?: string
    name: string
    document: unknown
    posterSlug?: string
  },
): Promise<BannerResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid banner' }
  }

  const { supabase, user, tenant } = await requireTenant(slug)

  if (tenant.role !== 'owner' && tenant.role !== 'admin') {
    return { ok: false, error: 'Only the owner or an admin can save a banner' }
  }

  /**
   * The poster has to be this space's own file.
   *
   * Without this check a host could pass any slug in the product and have it
   * served from their event's door - which is the one place an upload is shown
   * to people who are not members, so it is the one place the tenant-scoped RLS
   * on `/api/uploads/<slug>` is not doing the work. The read is through the
   * caller's own client, so a slug they cannot see is already invisible; the
   * `eq` is what stops a member of two spaces borrowing across them.
   */
  if (parsed.data.posterSlug) {
    const { data: upload } = await supabase
      .from('uploads')
      .select('slug')
      .eq('slug', parsed.data.posterSlug)
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    if (!upload) {
      return { ok: false, error: 'That picture is not this space’s' }
    }
  }

  const row = {
    tenant_id: tenant.id,
    name: parsed.data.name,
    // Normalised before it is stored, so every reader downstream gets a
    // document it can render without a second thought. The cast is to the
    // generated `Json`, which an interface cannot satisfy structurally even
    // when every field in it is a number or a string - see the note on
    // `event_banners.document` about why the column is opaque.
    document: parseHero(input.document) as unknown as Json,
    poster_slug: parsed.data.posterSlug ?? null,
    author_id: user.id,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await supabase
      .from('event_banners')
      .update(row)
      .eq('id', input.id)
      .eq('tenant_id', tenant.id)
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, error: `Could not save it: ${error.message}` }
    // No row means the update policy refused, or the banner belongs to another
    // space. Falling through to an insert would quietly make a copy.
    if (!data) return { ok: false, error: 'That banner is not this space’s any more' }

    revalidateBanner(slug)
    return { ok: true, id: data.id }
  }

  const { data, error } = await supabase
    .from('event_banners')
    .insert(row)
    .select('id')
    .single()

  if (error) return { ok: false, error: `Could not save it: ${error.message}` }

  revalidateBanner(slug)
  return { ok: true, id: data.id }
}

/**
 * Which banner this event shows, and which link its button carries.
 *
 * Written through `set_event_banner()` rather than by updating the row, for the
 * reason the header action gives at length: everything else on `event_spaces`
 * is the ceiling the platform sold, and RLS decides rows rather than columns.
 * The function additionally proves that both ids are this space's own, which is
 * what stops a host pointing their public banner at another space's guest link.
 *
 * Nulls clear the attachment. That is how a host takes the banner down, and it
 * has to be as easy as putting it up - the door is public, and "get it off the
 * internet now" is a thing that happens at events.
 */
export async function attachEventBanner(
  slug: string,
  input: { bannerId: string | null; linkId: string | null },
): Promise<AttachResult> {
  const { supabase, tenant } = await requireTenant(slug)

  /**
   * Null is a legal argument to both, and the generated types cannot say so.
   *
   * A Postgres parameter is nullable unless the body refuses it, and this one's
   * body handles null explicitly - it is how a host takes the banner down. The
   * type generator has no way to express that, so it types every argument as
   * required and non-null. The cast is the narrowest place to say otherwise.
   */
  const { data, error } = await supabase.rpc('set_event_banner', {
    p_tenant_id: tenant.id,
    p_banner_id: input.bannerId as string,
    p_link_id: input.linkId as string,
  })

  if (error) return { ok: false, error: `Could not save it: ${error.message}` }

  // False is the function saying one of four things - not staff, no event, or
  // either id belonging elsewhere. All four are states a host can only reach by
  // having lost something since the page rendered, so one honest sentence beats
  // guessing which.
  if (!data) {
    return {
      ok: false,
      error: 'Only the owner or an admin of a live event can change this',
    }
  }

  revalidateBanner(slug)
  return { ok: true }
}

/**
 * A banner, removed.
 *
 * The event's `banner_id` is `on delete set null`, so deleting the one that is
 * currently up takes the door's picture down with it rather than leaving a
 * dangling reference. That is the right way round: a host who deletes the
 * banner they are showing means it.
 */
export async function deleteEventBanner(slug: string, id: string): Promise<AttachResult> {
  const { supabase, tenant } = await requireTenant(slug)

  const { error } = await supabase
    .from('event_banners')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant.id)

  if (error) return { ok: false, error: `Could not delete it: ${error.message}` }

  revalidateBanner(slug)
  return { ok: true }
}

/**
 * The three places a banner is visible.
 *
 * The layout rather than the settings page, for the reason `setEventHeader`
 * gives: refreshing only the form would leave the host looking at their new
 * banner in a picker and the old one on the door. The front page is in the list
 * because a featured event's band is rendered there and nothing else would ever
 * invalidate it.
 */
function revalidateBanner(slug: string) {
  revalidatePath(`/t/${slug}`, 'layout')
  revalidatePath(`/e/${slug}`)
  revalidatePath('/')
}
