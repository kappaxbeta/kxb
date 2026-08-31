'use server'

import { revalidatePath } from 'next/cache'
import { setRoomMarkPinned } from '@/domain/rooms/marks'
import { requireFeature, requireTenant } from '@/lib/tenant'

/**
 * Your own pin on a room, from the rail.
 *
 * Its own file rather than another export in `actions.ts`, and the reason is
 * the guard. Everything in there goes through `guard()`, which is "owner or
 * admin, and the space can still write" - the right question for every decision
 * about a room, and the wrong one for this. Pinning a room to your own list is
 * not a decision about the room: nobody else can see it, nothing reads it but
 * the order of your own rail, and refusing it to a member would be refusing
 * somebody the arrangement of their own screen.
 *
 * So the check here is only "are you in this space", which `requireTenant`
 * already answers by 404ing anybody who is not, and which the table's RLS
 * answers again underneath - the policy admits your own rows in a space you are
 * in, and nothing else. See the migration.
 *
 * A guest may pin too. They see one room and have almost nothing to arrange,
 * but a policy that refused them would mean the control had to be hidden from
 * them and the write had to be special-cased, to prevent nothing.
 *
 * `writeBlockedReason` is deliberately not consulted, which is the other half
 * of the same argument: a space that stopped paying is a space whose *content*
 * is frozen, and somebody sorting the rooms they can still walk into is not
 * writing content. Freezing this would be freezing the navigation of a space
 * people are still standing in.
 */
export async function pinRoomForMe(
  slug: string,
  roomId: string,
  pinned: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const context = await requireTenant(slug)
  requireFeature(context, 'lounge')

  const done = await setRoomMarkPinned(
    context.supabase,
    context.tenant.id,
    context.user.id,
    roomId,
    pinned,
  )

  if (!done) return { ok: false, error: 'That pin did not stick. Try again.' }

  /**
   * The layout, not the page - the rail is rendered by `/t/[slug]/layout.tsx`,
   * and the rail is the entire point of this call. A `revalidatePath` on a page
   * would leave the layout above it cached, which is the exact bug
   * `createRoom` documents: the pin lands, and the list it reorders does not
   * move until something else happens to refresh it.
   */
  revalidatePath(`/t/${slug}`, 'layout')
  return { ok: true }
}
