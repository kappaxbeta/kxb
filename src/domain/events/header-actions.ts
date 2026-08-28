'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { EventLink } from '@/domain/events/queries'
import { requireTenant } from '@/lib/tenant'

export type EventHeaderResult = { ok: true } | { ok: false; error: string }

/**
 * The header, as the desk posts it.
 *
 * Lengths are the banner's rather than the column's: a headline is one line
 * above a room, and 80 characters is already more than fits on a phone. The
 * database has its own limits on the links and would refuse a longer name, but
 * a constraint violation reads as a Postgres string and this is a form
 * somebody is looking at.
 *
 * The URL is checked for its scheme rather than only for being a URL. `z.url()`
 * happily accepts `javascript:alert(1)`, and this href is clicked by every
 * stranger who walked in through the event link.
 */
const linkSchema = z.object({
  name: z.string().trim().min(1, 'Give the link a name').max(40, 'That name is too long'),
  url: z
    .string()
    .trim()
    .max(300, 'That link is too long')
    .refine((value) => /^https?:\/\//i.test(value), 'Links have to start with http:// or https://'),
})

const headerSchema = z.object({
  headline: z.string().trim().max(80, 'Keep the headline to a line').optional(),
  blurb: z.string().trim().max(280, 'Keep it to a couple of sentences').optional(),
  links: z.array(linkSchema).max(8, 'Eight links is plenty'),
})

/**
 * What the banner says inside this event.
 *
 * Written through `set_event_header()` rather than by updating the row,
 * because everything else on it is the ceiling the platform sold and belongs
 * to the backoffice - see the header of 20260902000000_event_header.sql. The
 * function is SECURITY DEFINER and re-checks that the caller is an owner or an
 * admin, so this action being reachable proves nothing on its own: a Server
 * Action is a public endpoint, and `requireTenant` here only saves the round
 * trip for somebody who is not in the space at all.
 *
 * Revalidates the layout rather than the settings page, because the banner is
 * rendered by the layout and shows on every page in the event. Refreshing only
 * the form would leave the host looking at their new headline in the input and
 * the old one above it.
 */
export async function setEventHeader(
  slug: string,
  input: { headline?: string; blurb?: string; links: EventLink[] },
): Promise<EventHeaderResult> {
  const parsed = headerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid header' }
  }

  const { supabase, tenant } = await requireTenant(slug)

  const { data, error } = await supabase.rpc('set_event_header', {
    p_tenant_id: tenant.id,
    p_headline: parsed.data.headline ?? '',
    p_blurb: parsed.data.blurb ?? '',
    p_links: parsed.data.links,
  })

  if (error) return { ok: false, error: `Could not save it: ${error.message}` }

  // False is the function saying either "you are not staff here" or "this
  // space has no event". Both are things a host can only hit by having lost
  // one of the two since the page rendered, so one honest sentence beats
  // guessing which.
  if (!data) {
    return { ok: false, error: 'Only the owner or an admin of a live event can change this' }
  }

  revalidatePath(`/t/${slug}`, 'layout')
  return { ok: true }
}
