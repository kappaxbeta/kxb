import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Confirming an address, and letting it go again.
 *
 * ---------------------------------------------------------------------------
 * The token is the authorisation
 * ---------------------------------------------------------------------------
 * Both of these run as the service role, and that is the design rather than a
 * shortcut. The person following the link is anonymous - that is the whole
 * point, they are proving they can read a mailbox, not that they have an
 * account - so there is no session to write a policy against. What proves the
 * request is the token itself: a v4 uuid, which is 122 bits of unguessable,
 * and which only ever left this system inside a mail to that address.
 *
 * The table has no anon update policy for the same reason. Handing anon the
 * ability to update rows keyed by a value it supplies is a worse door than
 * this one, because it is open to everybody rather than to whoever holds one
 * token.
 *
 * ---------------------------------------------------------------------------
 * Both are idempotent, and both refuse to say too much
 * ---------------------------------------------------------------------------
 * Mail clients prefetch links, people press back, and a forwarded
 * unsubscribe should not be a way to check whether an address is on the list.
 * So: confirming twice is confirming once, unsubscribing twice is
 * unsubscribing once, and an unknown token gets the same page as a known one.
 * The only thing that changes is what happened in the database.
 */

export type TokenOutcome = 'done' | 'unknown'

/** Mark an address confirmed. First confirmation wins; later ones change nothing. */
export async function confirmSubscriber(token: string): Promise<TokenOutcome> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('news_subscribers')
    .update({ confirmed_at: new Date().toISOString() })
    // Only rows that have not been confirmed, so a second visit does not move
    // the timestamp. When somebody first said yes is a fact worth keeping.
    .eq('confirm_token', token)
    .is('confirmed_at', null)
    .select('id')

  if (error) return 'unknown'
  if (data && data.length > 0) return 'done'

  // Nothing updated: either the token is unknown, or it was already confirmed.
  // Told apart here only to answer honestly, and both answers look the same to
  // the caller's reader.
  const { data: existing } = await admin
    .from('news_subscribers')
    .select('id')
    .eq('confirm_token', token)
    .maybeSingle()

  return existing ? 'done' : 'unknown'
}

/**
 * Take an address off the list.
 *
 * The row stays. Deleting it would lose the consent record, which is the thing
 * that answers "why did you have this address" - and answering that is still
 * required after somebody leaves. `unsubscribed_at` is what every send has to
 * filter on.
 */
export async function unsubscribeSubscriber(token: string): Promise<TokenOutcome> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('news_subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('confirm_token', token)
    .is('unsubscribed_at', null)
    .select('id')

  if (error) return 'unknown'
  if (data && data.length > 0) return 'done'

  const { data: existing } = await admin
    .from('news_subscribers')
    .select('id')
    .eq('confirm_token', token)
    .maybeSingle()

  return existing ? 'done' : 'unknown'
}
