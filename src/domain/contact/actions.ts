'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { cleanPath } from '@/domain/analytics/track'
import {
  type ContactState,
  draftFrom,
  eventDraftFrom,
  type EventState,
  parseContactMessage,
  parseEventEnquiry,
  THROTTLE_MAX,
  throttleWindowStart,
} from '@/domain/contact/message'
import { repliesFor } from '@/domain/contact/replies'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { readUsername } from '@/domain/profile/username-queries'
import { requireBackofficeSection } from '@/lib/backoffice'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Writing to us, and what an admin does about it.
 *
 * Two audiences again, gated the way `moderation/actions.ts` gates its two:
 * anybody at all - signed in or not - may send a message, and only a backoffice
 * admin may read the inbox or close anything in it.
 *
 * The insert runs through the service role rather than the caller's session,
 * because the sender usually has no session at all. That means this function is
 * the only thing standing between the form and the table, so the checks it does
 * - shape, throttle, honeypot - are not decoration.
 */

/**
 * Send a message.
 *
 * Shaped for `useActionState`, so it takes the previous state it does not use
 * and returns the next one. Errors come back as values rather than exceptions:
 * a mistyped address is a thing to say in the form, not an error page.
 */
export async function sendContactMessage(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // The honeypot. A field no human sees and every naive bot fills in. Filled
  // means we say "sent" and write nothing - telling a bot it was caught is how
  // it learns to stop falling for the trap.
  if (typeof formData.get('website') === 'string' && formData.get('website') !== '') {
    return { status: 'sent' }
  }

  // Kept for the whole function: every way out of here that is not "sent" hands
  // this back, so the form can put the words back where they were.
  const draft = draftFrom(formData)

  const parsed = parseContactMessage(draft)

  if (!parsed.ok) {
    return { status: 'error', error: parsed.error, field: parsed.field, values: draft }
  }

  // Whoever they are signed in as, if anyone. Read from the session and never
  // from the form: the address in the form is where they want a reply, which is
  // not necessarily the account they are holding.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const rawPath = formData.get('path')
  const path = typeof rawPath === 'string' ? cleanPath(rawPath) : null

  const admin = createAdminClient()

  const { count } = await admin
    .from('contact_messages')
    .select('*', { count: 'exact', head: true })
    .eq('email', parsed.value.email)
    .gte('created_at', throttleWindowStart())

  if ((count ?? 0) >= THROTTLE_MAX) {
    return {
      status: 'error',
      error: repliesFor(path).throttled,
      field: null,
      values: draft,
    }
  }

  const { error } = await admin.from('contact_messages').insert({
    username: parsed.value.username,
    email: parsed.value.email,
    phone: parsed.value.phone,
    subject: parsed.value.subject,
    message: parsed.value.message,
    user_id: user?.id ?? null,
    path,
  })

  if (error) {
    return {
      status: 'error',
      error: `${repliesFor(path).failed}${error.message}`,
      field: null,
      values: draft,
    }
  }

  // Deliberately no revalidatePath. The only page this message changes is the
  // backoffice inbox, which is force-dynamic and reads it fresh anyway - and
  // revalidating from here refreshes the *sender's* tree, which remounts the
  // widget in the root layout and empties the dialog they are still looking at.
  return { status: 'sent' }
}

/**
 * Send an event enquiry.
 *
 * The same table, the same throttle and the same honeypot as
 * `sendContactMessage` - see the migration for why a booking is not its own
 * table - with two differences that are the whole point of the second door.
 *
 * It writes `kind: 'business'`, which is what the inbox filters on, and it
 * writes the three structured answers alongside the prose so a quote can be
 * built without reading for them. The subject is composed rather than asked
 * for; see `eventSubject`.
 */
export async function sendEventEnquiry(
  _previous: EventState,
  formData: FormData,
): Promise<EventState> {
  if (typeof formData.get('website') === 'string' && formData.get('website') !== '') {
    return { status: 'sent' }
  }

  const draft = eventDraftFrom(formData)

  const parsed = parseEventEnquiry(draft)

  if (!parsed.ok) {
    return { status: 'error', error: parsed.error, field: parsed.field, values: draft }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const rawPath = formData.get('path')
  const path = typeof rawPath === 'string' ? cleanPath(rawPath) : null

  const admin = createAdminClient()

  const { count } = await admin
    .from('contact_messages')
    .select('*', { count: 'exact', head: true })
    .eq('email', parsed.value.email)
    .gte('created_at', throttleWindowStart())

  if ((count ?? 0) >= THROTTLE_MAX) {
    return {
      status: 'error',
      error: repliesFor(path).throttled,
      field: null,
      values: draft,
    }
  }

  const { error } = await admin.from('contact_messages').insert({
    username: parsed.value.username,
    email: parsed.value.email,
    phone: parsed.value.phone,
    subject: parsed.value.subject,
    message: parsed.value.message,
    kind: 'business',
    event_type: parsed.value.eventType,
    event_when: parsed.value.eventWhen,
    event_size: parsed.value.eventSize,
    user_id: user?.id ?? null,
    path,
  })

  if (error) {
    return {
      status: 'error',
      error: `${repliesFor(path).failed}${error.message}`,
      field: null,
      values: draft,
    }
  }

  // No revalidatePath, for the reason spelled out in sendContactMessage: the
  // only page this changes is the backoffice inbox, which reads fresh.
  return { status: 'sent' }
}

/**
 * Who the sender is, when they are signed in.
 *
 * Called when the dialog opens rather than rendered into the page, so that the
 * widget in the root layout costs a static page nothing: reading cookies during
 * a layout render would opt the whole app out of static rendering to prefill
 * two fields.
 */
export async function contactIdentity(): Promise<{
  username: string | null
  email: string | null
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { username: null, email: null }

  return {
    username: await readUsername(supabase, user.id),
    email: user.email ?? null,
  }
}

// ---------------------------------------------------------------------------
// Backoffice
// ---------------------------------------------------------------------------

export type ContactResult = { ok: true } | { ok: false; error: string }

/** Dealt with. Keeps the message, closes the row. */
export async function markContactHandled(id: string): Promise<ContactResult> {
  return await setStatus(id, 'handled')
}

/** Back into the inbox. */
export async function reopenContactMessage(id: string): Promise<ContactResult> {
  return await setStatus(id, 'open')
}

async function setStatus(id: string, status: 'open' | 'handled'): Promise<ContactResult> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Invalid message' }

  const { user, admin } = await requireBackofficeSection('contact', 'write')

  const { error } = await admin
    .from('contact_messages')
    .update({
      status,
      handled_by: status === 'handled' ? user.id : null,
      handled_at: status === 'handled' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: `Could not update that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'contact',
    action: status === 'handled' ? 'contact.resolve' : 'contact.reopen',
    summary:
      status === 'handled'
        ? `Marked a contact message handled`
        : `Reopened a contact message`,
    detail: { messageId: parsed.data, status },
  })

  revalidatePath('/ovaloffice/contact')
  return { ok: true }
}
