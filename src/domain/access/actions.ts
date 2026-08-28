'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { isLocale } from '@/domain/i18n/locale'
import {
  APPLY_THROTTLE_MAX,
  applyThrottleWindowStart,
  applicationDraftFrom,
  type ApplicationState,
  consentEvidence,
  inviteExpiry,
  mintInviteToken,
  parseApplication,
} from '@/domain/access/application'
import { clientIp } from '@/domain/analytics/track'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { env } from '@/lib/env'
import { requireBackofficeSection } from '@/lib/backoffice'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Asking to be let in, and what an admin does about it.
 *
 * Two audiences, gated the way `contact/actions.ts` gates its two: anybody at
 * all - signed in or not - may join the waiting list, and only a backoffice
 * admin may read it or act on it.
 *
 * The insert runs through the service role rather than the caller's session,
 * because an applicant has no session by definition. That means this function
 * is the only thing standing between the form and the table, so the checks it
 * does - shape, throttle, honeypot - are not decoration.
 */

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

/**
 * Join the waiting list.
 *
 * Shaped for `useActionState`, so it takes the previous state it does not use
 * and returns the next one.
 *
 * Every outcome that is not a validation error reports success, including "you
 * already applied" and "you applied and were turned down". The alternative
 * turns this form into an oracle for which addresses are known to the system,
 * and a rejected applicant learning they were rejected by watching the form
 * change its mind is worse still. An admin sees the truth in the backoffice;
 * the form says the same friendly thing to everybody.
 */
export async function applyForAccount(
  _previous: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  // The honeypot. A field no human sees and every naive bot fills in. Filled
  // means we say "listed" and write nothing - telling a bot it was caught is
  // how it learns to stop falling for the trap.
  if (typeof formData.get('website') === 'string' && formData.get('website') !== '') {
    return { status: 'listed' }
  }

  const draft = applicationDraftFrom(formData)
  const parsed = parseApplication({
    email: draft.email,
    username: draft.username,
    note: draft.note,
    newsletter: draft.newsletter ? 'on' : undefined,
  })

  if (!parsed.ok) {
    return { status: 'error', error: parsed.error, field: parsed.field, values: draft }
  }

  const requestHeaders = await headers()
  const ip = clientIp(requestHeaders)
  const userAgent = requestHeaders.get('user-agent')

  const admin = createAdminClient()

  const { count } = await admin
    .from('account_applications')
    .select('*', { count: 'exact', head: true })
    .eq('email', parsed.value.email)
    .gte('created_at', applyThrottleWindowStart())

  if ((count ?? 0) >= APPLY_THROTTLE_MAX) {
    /**
     * The only message on this form a visitor can actually reach, so it is the
     * only one translated. The locale rides in a hidden field rather than being
     * read off a path: this form posts no path of its own, and the page it
     * lives on is reachable at two URLs.
     */
    const raw = formData.get('locale')
    const locale = typeof raw === 'string' && isLocale(raw) ? raw : 'en'
    return {
      status: 'error',
      error:
        locale === 'de'
          ? 'Sie stehen bereits auf der Liste — geben Sie uns einen Moment.'
          : 'You are already on the list — give us a moment to get to you.',
      field: null,
      values: draft,
    }
  }

  // `unknown` is what clientIp reports when no proxy header arrived, and `inet`
  // will not take it. NULL is the honest value for "we could not tell".
  const address = ip === 'unknown' ? null : ip

  const { error } = await admin.from('account_applications').insert({
    email: parsed.value.email,
    username: parsed.value.username,
    note: parsed.value.note,
    created_ip: address,
    ...consentEvidence(parsed.value.newsletterConsent, address, userAgent),
  })

  // 23505 is a unique violation: this address is already on the list. That is
  // the outcome they wanted, so it is not an error to show them - and saying
  // "you are already on the list" would confirm the address is known.
  if (error && error.code !== '23505') {
    return {
      status: 'error',
      error: `Could not add you to the list: ${error.message}`,
      field: null,
      values: draft,
    }
  }

  return { status: 'listed' }
}

// ---------------------------------------------------------------------------
// Backoffice
// ---------------------------------------------------------------------------

export type AccessResult = { ok: true; message?: string } | { ok: false; error: string }

const idSchema = z.uuid()

/**
 * Approve an application: mint an invite for that address and mark it invited.
 *
 * The invite is addressed - locked to the mailbox that applied - because an
 * approval is a decision about a person, and an open link forwarded to a group
 * chat is not that decision. Whoever wants an open link can mint one directly.
 */
export async function approveApplication(
  id: string,
  options: { sendEmail: boolean } = { sendEmail: false },
): Promise<AccessResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Invalid application' }

  const { user, admin } = await requireBackofficeSection('access', 'write')

  const { data: application, error: readError } = await admin
    .from('account_applications')
    .select('id, email, status')
    .eq('id', parsed.data)
    .maybeSingle()

  if (readError) return { ok: false, error: `Could not read that: ${readError.message}` }
  if (!application) return { ok: false, error: 'That application no longer exists' }

  const token = mintInviteToken()

  const { error: inviteError } = await admin.from('account_invites').insert({
    token,
    email: application.email,
    note: `Approved application`,
    max_uses: 1,
    expires_at: inviteExpiry(),
    created_by: user.id,
    application_id: application.id,
  })

  if (inviteError) {
    return { ok: false, error: `Could not create the invite: ${inviteError.message}` }
  }

  const { error: updateError } = await admin
    .from('account_applications')
    .update({
      status: 'invited',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application.id)

  if (updateError) {
    return { ok: false, error: `Invite created, but: ${updateError.message}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'access',
    action: 'application.approve',
    summary: `Approved the application from ${application.email} and minted an invite`,
    detail: { applicationId: application.id, email: application.email, emailed: options.sendEmail },
  })

  revalidatePath('/ovaloffice/access')

  if (!options.sendEmail) {
    return { ok: true, message: `Invite ready for ${application.email}.` }
  }

  const sent = await sendSupabaseInvite(application.email)

  return sent.ok
    ? { ok: true, message: `Invited ${application.email} by email.` }
    : {
        // The invite exists and the link works; only the mail failed. Saying so
        // is the difference between an admin copying the link and an admin
        // approving the same person three more times.
        ok: true,
        message: `Invite created, but the email could not be sent (${sent.error}). Copy the link instead.`,
      }
}

/**
 * Turn an application down.
 *
 * The row is kept rather than deleted, and it keeps its address - which is what
 * stops a rejected applicant reappearing at the top of the queue every week,
 * and what lets an admin see they have already made this decision. Nothing is
 * ever sent to the applicant.
 */
export async function rejectApplication(
  id: string,
  reason: string = '',
): Promise<AccessResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Invalid application' }

  const { user, admin } = await requireBackofficeSection('access', 'write')

  const { error } = await admin
    .from('account_applications')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: reason.trim() || null,
    })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: `Could not update that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'access',
    action: 'application.reject',
    summary: `Rejected an application`,
    detail: { applicationId: parsed.data, reason: reason.trim() || null },
  })

  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

/** Back into the queue, for a decision made too quickly. */
export async function reopenApplication(id: string): Promise<AccessResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Invalid application' }

  const { user, admin } = await requireBackofficeSection('access', 'write')

  const { error } = await admin
    .from('account_applications')
    .update({ status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: `Could not update that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'access',
    action: 'application.reopen',
    summary: `Reopened an application back into the queue`,
    detail: { applicationId: parsed.data },
  })

  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

const inviteSchema = z.object({
  email: z.union([z.email('That does not look like an email address'), z.literal('')]),
  note: z.string().trim().max(200).default(''),
  maxUses: z.coerce.number().int().min(1).max(500),
  days: z.coerce.number().int().min(1).max(365),
})

/**
 * Mint an invite by hand, for somebody who never queued.
 *
 * Leaving the address blank is what makes it an open link - any one person who
 * has it may sign up, up to `maxUses` of them. That is the "invite a few
 * friends" shape, and it is why `max_uses` exists at all.
 */
export async function createInvite(input: {
  email: string
  note: string
  maxUses: number
  days: number
}): Promise<AccessResult> {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid invite' }
  }

  const { user, admin } = await requireBackofficeSection('access', 'write')

  const expires = new Date(Date.now() + parsed.data.days * 24 * 60 * 60 * 1000)

  const { error } = await admin.from('account_invites').insert({
    token: mintInviteToken(),
    email: parsed.data.email || null,
    note: parsed.data.note || null,
    max_uses: parsed.data.maxUses,
    expires_at: expires.toISOString(),
    created_by: user.id,
  })

  if (error) return { ok: false, error: `Could not create the invite: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'access',
    action: 'invite.create',
    summary: parsed.data.email
      ? `Created an invite for ${parsed.data.email}`
      : `Created an open invite link (${parsed.data.maxUses} uses)`,
    detail: {
      email: parsed.data.email || null,
      note: parsed.data.note || null,
      maxUses: parsed.data.maxUses,
      days: parsed.data.days,
    },
  })

  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

/**
 * Kill an invite.
 *
 * Revoked rather than deleted: the row is the record that somebody was invited,
 * and an invite that vanishes takes the answer to "who let them in" with it.
 * `inviteProblem` refuses a revoked invite exactly as it refuses a spent one.
 */
export async function revokeInvite(id: string): Promise<AccessResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Invalid invite' }

  const { user, admin } = await requireBackofficeSection('access', 'write')

  const { error } = await admin
    .from('account_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: `Could not revoke that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'access',
    action: 'invite.revoke',
    summary: `Revoked an invite`,
    detail: { inviteId: parsed.data },
  })

  revalidatePath('/ovaloffice/access')
  return { ok: true }
}

/**
 * Send an invite by email, through Supabase's own invite mail.
 *
 * Deliberately the only mail this app sends: there is no mail infrastructure
 * here beyond the auth mailer, and adding a provider to send one message is a
 * lot of moving parts to maintain for something an admin can also just paste
 * into their own client - which is why the copy-the-link path exists beside
 * this one and is not a lesser option.
 *
 * Note what this does *not* need: the account it creates is invited by an admin
 * on purpose, so it bypasses `mayRegister` legitimately. That is the fourth
 * door named in gate.ts, and an admin's deliberate act is its authorisation.
 */
export async function emailInvite(id: string): Promise<AccessResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Invalid invite' }

  const { user, admin } = await requireBackofficeSection('access', 'write')

  const { data: invite } = await admin
    .from('account_invites')
    .select('email')
    .eq('id', parsed.data)
    .maybeSingle()

  if (!invite?.email) {
    return {
      ok: false,
      error: 'That invite has no address on it — copy the link and send it yourself.',
    }
  }

  const sent = await sendSupabaseInvite(invite.email)
  if (!sent.ok) return { ok: false, error: sent.error }

  await recordBackofficeAction({
    actor: user,
    section: 'access',
    action: 'invite.email',
    summary: `Emailed an invite to ${invite.email}`,
    detail: { inviteId: parsed.data, email: invite.email },
  })

  revalidatePath('/ovaloffice/access')
  return { ok: true, message: `Emailed ${invite.email}.` }
}

/**
 * The mail itself, and the one thing to know before changing it.
 *
 * What arrives is `supabase/templates/invite.html`, not GoTrue's default. The
 * default is actively broken here: its link spends the token at GoTrue's own
 * /verify and hands /auth/confirm a URL with no `token_hash` on it, so the
 * invitee follows a link that looks right and lands on /login?error=invalid_link.
 * Ours passes {{ .TokenHash }} through instead, exactly as the magic link does.
 *
 * Note also what this mail does *not* carry: the `account_invites` token minted
 * beside it. It cannot - GoTrue renders the template, and it knows nothing about
 * our table. Sending one of these creates the account outright, so the invitee
 * never passes through /signup and the token stays unspent; it is the
 * copy-the-link path that redeems it. That is why the mail has to land on
 * /welcome/password: an account nobody signed up for has no password on it.
 */
async function sendSupabaseInvite(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.appUrl()}/welcome/password`,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
