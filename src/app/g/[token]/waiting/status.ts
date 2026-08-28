'use server'

import { guestArrival, knockState, type KnockState } from '@/domain/guests/application'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * "Have they let me in yet?"
 *
 * Asked from the waiting page every few seconds, and it is the only thing a
 * visitor standing at the door is allowed to ask. Everything about the space -
 * its name, who is in it, whether anybody has even seen the knock - stays on
 * the other side of the door, because a stranger who has not been let in is
 * exactly the person none of that should be readable by.
 *
 * ---------------------------------------------------------------------------
 * Why polling
 * ---------------------------------------------------------------------------
 * The obvious alternative is Realtime, and it does not work here for the reason
 * the whole feature exists: a visitor who has not been admitted is nothing to
 * this space, so `tenant_role()` refuses them and every Realtime policy in the
 * codebase is written in terms of it. Letting them subscribe to something in
 * order to be told they may not come in would be widening the boundary to
 * report on itself.
 *
 * So it is a poll, on a slow interval, for at most the ten minutes a knock
 * lives. That is a handful of requests per visitor and no new surface.
 */

export type KnockStatus =
  | { state: 'waiting' }
  /**
   * In. The path is where to send them, and arrives only once they are.
   *
   * A resolved path rather than a slug for the client to build a URL out of.
   * The destination is a property of the link they knocked on, and the link is
   * not something the waiting page can see - it is on the far side of the door
   * along with everything else about the space. So the answer is computed here,
   * where the row is readable, and the client's only job is to follow it.
   */
  | { state: 'admitted'; path: string }
  | { state: 'gone' }

export async function knockStatus(): Promise<KnockStatus> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No session at all is the same answer as no row: something ended, and there
  // is nothing here to wait for.
  if (!user) return { state: 'gone' }

  /**
   * Service role, scoped to this caller's own id.
   *
   * `tenant_guests_select_visible` would in fact allow this read - it lets
   * anybody see their own row - but the admitted case needs the space's slug
   * too, and `tenants_read_model` is not readable by somebody who is nothing to
   * that space. One client for both reads is simpler than one policy-shaped
   * read followed by a privileged one, and the filter below is what keeps it
   * honest: `guest_id` is `auth.uid()` and comes from the session, never from
   * the request.
   */
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('tenant_guests')
    .select('tenant_id, admitted_at, expires_at, link_id')
    .eq('guest_id', user.id)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const state: KnockState = knockState(
    row ? { admittedAt: row.admitted_at, expiresAt: row.expires_at } : null,
  )

  if (state !== 'admitted' || !row) return { state: state === 'admitted' ? 'gone' : state }

  const { data: tenant } = await admin
    .from('tenants_read_model')
    .select('slug')
    .eq('id', row.tenant_id)
    .maybeSingle()

  // Admitted into a space that has since gone is not an admission. Reported as
  // `gone` rather than crashing the page somebody is politely waiting on.
  if (!tenant) return { state: 'gone' }

  /**
   * Where the link they knocked on was pointed.
   *
   * A second round trip, and only on the poll that finds them admitted - the
   * other two hundred return before reaching here. `link_id` is nullable, and a
   * row without one is an admission that no longer knows how it happened, which
   * `guestArrival` reads as the lounge along with everything else it will not
   * follow.
   */
  const { data: link } = row.link_id
    ? await admin
        .from('guest_links')
        .select('destination')
        .eq('id', row.link_id)
        .maybeSingle()
    : { data: null }

  return { state: 'admitted', path: guestArrival(link?.destination, tenant.slug) }
}
