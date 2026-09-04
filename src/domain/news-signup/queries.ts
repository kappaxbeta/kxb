import 'server-only'
import type { Client } from '@/es/store'

/**
 * Reading the news list, for the one surface allowed to.
 *
 * There is no paging and no search, deliberately. This is a list that grows by
 * a handful a week and the only questions anybody has of it are "how many" and
 * "is anything stuck" - both of which a single page answers. The day it needs
 * paging is the day it has enough rows that the answer to those two questions
 * is a number rather than a list, and that is a different page.
 */

export interface Subscriber {
  id: string
  email: string
  locale: string
  consentText: string
  consentedAt: string
  confirmedAt: string | null
  unsubscribedAt: string | null
  sourcePath: string | null
  /** The token, so an operator can hand somebody their confirm link by hand
   *  while there is no mail sender. See the note on the page. */
  token: string
}

export interface NewsListing {
  subscribers: Subscriber[]
  counts: { pending: number; confirmed: number; unsubscribed: number }
}

export async function listSubscribers(supabase: Client): Promise<NewsListing> {
  const { data } = await supabase
    .from('news_subscribers')
    .select(
      'id, email, locale, consent_text, consented_at, confirmed_at, unsubscribed_at, source_path, confirm_token',
    )
    .order('consented_at', { ascending: false })

  const subscribers: Subscriber[] = (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    locale: row.locale,
    consentText: row.consent_text,
    consentedAt: row.consented_at,
    confirmedAt: row.confirmed_at,
    unsubscribedAt: row.unsubscribed_at,
    sourcePath: row.source_path,
    token: row.confirm_token,
  }))

  // Three states, and they are ordered by how much attention each deserves:
  // unsubscribed is settled, confirmed is working, pending is the one that
  // means somebody is waiting for a mail that cannot be sent yet.
  return {
    subscribers,
    counts: {
      pending: subscribers.filter((s) => !s.confirmedAt && !s.unsubscribedAt).length,
      confirmed: subscribers.filter((s) => s.confirmedAt && !s.unsubscribedAt).length,
      unsubscribed: subscribers.filter((s) => s.unsubscribedAt).length,
    },
  }
}
