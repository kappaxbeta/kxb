import 'server-only'
import type { ContactKind } from '@/domain/contact/message'
import type { Client } from '@/es/store'

export interface ContactMessageView {
  id: string
  username: string
  email: string
  phone: string | null
  subject: string
  message: string
  status: 'open' | 'handled'
  /** Which form it came off. See the migration that added the column. */
  kind: ContactKind
  /** The three answers a quote is built from. All null on a support message. */
  eventType: string | null
  eventWhen: string | null
  eventSize: string | null
  createdAt: string
  /** Where they were writing from, when the form knew. */
  path: string | null
  /** True when the sender had a session - a member, not a stranger. */
  signedIn: boolean
  handledAt: string | null
}

/** Which slice of the inbox is being looked at. */
export type ContactKindFilter = ContactKind | 'all'

/**
 * The contact inbox.
 *
 * Takes an admin client because the table has no policy for anybody else; the
 * caller is expected to have passed requireBackofficeAdmin() first, exactly as
 * `listWorldReports` expects. That guard is the gate, not this function.
 *
 * Two filters rather than one, and they are independent on purpose: "open
 * business" is the view that matters most, and folding kind into the status
 * enum would have made it unreachable without a third combined value for every
 * pair.
 */
export async function listContactMessages(
  admin: Client,
  status: 'open' | 'handled' | 'all' = 'open',
  kind: ContactKindFilter = 'all',
  limit = 100,
): Promise<ContactMessageView[]> {
  let query = admin
    .from('contact_messages')
    .select(
      'id, username, email, phone, subject, message, status, kind, event_type, event_when, event_size, created_at, path, user_id, handled_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)
  if (kind !== 'all') query = query.eq('kind', kind)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load contact messages: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status === 'handled' ? 'handled' : 'open',
    kind: row.kind === 'business' ? 'business' : 'general',
    eventType: row.event_type,
    eventWhen: row.event_when,
    eventSize: row.event_size,
    createdAt: row.created_at,
    path: row.path,
    signedIn: Boolean(row.user_id),
    handledAt: row.handled_at,
  }))
}

/** How many are waiting, for the badge on the tab. */
export async function countOpenContactMessages(admin: Client): Promise<number> {
  const { count } = await admin
    .from('contact_messages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open')

  return count ?? 0
}

/**
 * How many open enquiries are waiting, for the badge on the business tab.
 *
 * Its own query rather than a length taken off the list, because the tab has to
 * show a number while the *handled* view is on screen - a badge that empties
 * when you change filter is a badge that reads as "dealt with".
 */
export async function countOpenBusinessInquiries(admin: Client): Promise<number> {
  const { count } = await admin
    .from('contact_messages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open')
    .eq('kind', 'business')

  return count ?? 0
}
