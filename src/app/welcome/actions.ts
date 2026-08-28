'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { landingPath } from '@/domain/tenants/last-space'
import { requireUser } from '@/lib/auth'

/**
 * Leave the wizard for wherever this person actually belongs.
 *
 * The client cannot work that out - it is the cookie, the membership check and
 * the archived flag that landingPath() already weighs - and hardcoding
 * `/tenants` here would send somebody who accepted an invitation on their way
 * in past the workspace they came for.
 *
 * Safe to call before anything has been saved. landingPath() routes anybody who
 * still owes a name back to /welcome, so the worst case is that the wizard
 * reopens rather than that somebody escapes it half-answered.
 */
export async function finishWelcome(): Promise<never> {
  const { user, supabase } = await requireUser()
  redirect(await landingPath(supabase, user))
}

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters')

export type PasswordResult = { ok: false; error: string }

/**
 * Put a password on an account that arrived without one.
 *
 * An invited account is the case this exists for. The invite mail creates the
 * user before its recipient has typed anything, so they land here already signed
 * in and with `encrypted_password` empty - able to come back only by asking for
 * another link. Nothing else in the app can fix that: the sign-up form would
 * collide with the account that already exists, and there is no reset flow.
 *
 * The session is the authorisation, which is why this needs no current password
 * to check. Reaching it at all means having verified the invite token out of a
 * mailbox seconds earlier, and that is the same evidence a reset link carries.
 */
export async function setInitialPassword(
  _prev: PasswordResult | null,
  formData: FormData,
): Promise<PasswordResult> {
  const parsed = passwordSchema.safeParse(formData.get('password'))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid password' }
  }

  const { supabase } = await requireUser()
  const { error } = await supabase.auth.updateUser({ password: parsed.data })

  if (error) return { ok: false, error: error.message }

  // On to the name and the peep. Deliberately /welcome rather than landingPath():
  // an invited account has answered neither question yet, and landingPath() would
  // send them straight back here on the next navigation anyway.
  revalidatePath('/', 'layout')
  redirect('/welcome')
}
