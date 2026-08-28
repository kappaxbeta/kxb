'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { env } from '@/lib/env'
import { requireUser } from '@/lib/auth'
import type { Database } from '@/lib/supabase/types'

/**
 * Setting and changing the password, from inside the app.
 *
 * Two actions rather than one with a branch, because they are two different
 * authorizations and collapsing them would hide that.
 *
 * `setPassword` is for an account that has never had one - the invited case,
 * where the invite mail created the user before its recipient typed anything.
 * There is nothing to prove there beyond holding the session, which was itself
 * obtained from a token out of their mailbox. This is the same reasoning
 * `setInitialPassword` in the welcome flow already runs on; that one exists for
 * the moment right after accepting an invite, this one for every moment after.
 *
 * `changePassword` is for an account that has one, and asks for it. Not because
 * Supabase requires it - `updateUser` would take the new password on the
 * strength of the session alone - but because a session is not always the
 * person: a borrowed laptop with a live tab is the ordinary way accounts get
 * taken over, and "knows the old password" is the check that stops the takeover
 * from becoming permanent.
 */

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  // The upper bound is bcrypt's, not ours: it silently truncates past 72 bytes,
  // so a longer one would appear to be accepted and then not be what was typed.
  .max(72, 'Password must be at most 72 characters')

/**
 * `savedAt` is a nonce, not information: the panel keys its form off it so a
 * second successful save still clears the fields. Two saves that returned an
 * identical `{ ok: true }` would not remount anything.
 */
export type PasswordResult = { ok: boolean; error?: string; savedAt?: number }

/**
 * Does this account have a password at all?
 *
 * Read through the RPC rather than from anything the page could pass in - see
 * the migration for why `auth.users` cannot be read directly.
 */
export async function hasPassword(): Promise<boolean> {
  const { supabase } = await requireUser()
  const { data, error } = await supabase.rpc('has_password')

  // A failure here means we cannot tell. Answering "yes" is the safe way to be
  // wrong: it shows the form that asks for a current password, which fails
  // honestly, rather than the one that skips the check.
  if (error) return true
  return data === true
}

/** Put a password on an account that has none. */
export async function setPassword(
  _prev: PasswordResult | null,
  formData: FormData,
): Promise<PasswordResult> {
  const parsed = password.safeParse(formData.get('password'))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid password' }
  }

  const { supabase } = await requireUser()

  // Asked again on the server. The form only renders this variant when the
  // account has no password, but the form is not what decides - a client that
  // posts here directly must not be able to skip the current-password check
  // just by choosing which action to call.
  const { data: already } = await supabase.rpc('has_password')
  if (already === true) {
    return {
      ok: false,
      error: 'This account already has a password. Use the change form instead.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, savedAt: Date.now() }
}

/** Replace a password, on proof of the current one. */
export async function changePassword(
  _prev: PasswordResult | null,
  formData: FormData,
): Promise<PasswordResult> {
  const current = String(formData.get('currentPassword') ?? '')
  const parsed = password.safeParse(formData.get('password'))

  if (!current) {
    return { ok: false, error: 'Enter your current password' }
  }
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid password' }
  }
  if (current === parsed.data) {
    return { ok: false, error: 'That is already your password' }
  }

  const { user, supabase } = await requireUser()
  if (!user.email) {
    return { ok: false, error: 'This account has no email address to verify against' }
  }

  // Supabase has no "check this password" endpoint, so the check is an actual
  // sign-in - on a throwaway client with no cookie access and no persistence,
  // because the session it mints must not land in the browser and replace the
  // live one. It is discarded the moment it has answered the question.
  const verifier = createSupabaseClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { error: wrong } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: current,
  })
  if (wrong) {
    return { ok: false, error: 'That is not your current password' }
  }
  await verifier.auth.signOut({ scope: 'local' })

  // The real update goes through the request's own client, so it applies to the
  // signed-in session and refreshes its tokens rather than the throwaway's.
  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, savedAt: Date.now() }
}
