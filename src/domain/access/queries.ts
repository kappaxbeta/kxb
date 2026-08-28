import 'server-only'
import type { Client } from '@/es/store'

/**
 * Read side of the waiting list and the invites.
 *
 * Every function here takes an admin client, because neither table has a policy
 * for anybody else - the caller is expected to have passed
 * requireBackofficeAdmin() first, exactly as `listContactMessages` expects.
 * That guard is the gate, not this.
 */

export type ApplicationStatus = 'pending' | 'invited' | 'rejected'

export interface ApplicationView {
  id: string
  email: string
  username: string | null
  note: string | null
  status: ApplicationStatus
  /** Did they ask for the newsletter, and the evidence that they did. */
  newsletterConsent: boolean
  consentAt: string | null
  consentIp: string | null
  createdAt: string
  reviewedAt: string | null
}

/**
 * The queue.
 *
 * Oldest first for `pending`, because a waiting list that serves the newest
 * arrival first is not a waiting list. Everything else reads newest first,
 * which is what "what did I just do" wants.
 */
export async function listApplications(
  admin: Client,
  status: ApplicationStatus | 'all' = 'pending',
  limit = 200,
): Promise<ApplicationView[]> {
  let query = admin
    .from('account_applications')
    .select(
      'id, email, username, note, status, newsletter_consent, consent_at, consent_ip, created_at, reviewed_at',
    )
    .order('created_at', { ascending: status === 'pending' })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load applications: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    username: row.username,
    note: row.note,
    status: asStatus(row.status),
    newsletterConsent: row.newsletter_consent,
    consentAt: row.consent_at,
    // `inet` arrives as a string. Shown to an admin and never matched on.
    consentIp: row.consent_ip === null ? null : String(row.consent_ip),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }))
}

function asStatus(value: string): ApplicationStatus {
  return value === 'invited' || value === 'rejected' ? value : 'pending'
}

/** How many are waiting, for the badge on the tab. */
export async function countPendingApplications(admin: Client): Promise<number> {
  const { count } = await admin
    .from('account_applications')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return count ?? 0
}

export interface InviteView {
  id: string
  /** The secret itself, so the backoffice can rebuild the link. */
  token: string
  email: string | null
  note: string | null
  maxUses: number
  uses: number
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  lastRedeemedAt: string | null
  /** Derived, so the list can say *why* a dead invite is dead. */
  state: 'live' | 'revoked' | 'expired' | 'spent'
}

/**
 * Every invite, newest first.
 *
 * `state` is computed here rather than in the component because "why is this
 * one grey" is a question about the row, not about the rendering, and the same
 * three conditions decide whether redemption succeeds - see `inviteProblem`.
 * The one difference is deliberate: that function collapses all of this into a
 * single sentence for the person holding the token, and this one spells it out
 * for the admin who has to explain it to them.
 */
export async function listInvites(admin: Client, limit = 200): Promise<InviteView[]> {
  const { data, error } = await admin
    .from('account_invites')
    .select(
      'id, token, email, note, max_uses, uses, expires_at, revoked_at, created_at, last_redeemed_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load invites: ${error.message}`)

  const now = Date.now()

  return (data ?? []).map((row) => ({
    id: row.id,
    token: row.token,
    email: row.email,
    note: row.note,
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastRedeemedAt: row.last_redeemed_at,
    state: row.revoked_at
      ? 'revoked'
      : row.uses >= row.max_uses
        ? 'spent'
        : row.expires_at && new Date(row.expires_at).getTime() <= now
          ? 'expired'
          : 'live',
  }))
}

/** How many invites are still usable, for the summary line. */
export function countLiveInvites(invites: InviteView[]): number {
  return invites.filter((invite) => invite.state === 'live').length
}
