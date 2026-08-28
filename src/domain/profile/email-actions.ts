'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { env } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

/**
 * The two things somebody can do about the address on their account: prove it
 * is theirs, or change it.
 *
 * Both go through email, and both therefore run into the same ceiling. GoTrue
 * on the backend box has no `GOTRUE_RATE_LIMIT_EMAIL_SENT` set, so its built-in
 * default applies across the whole server, and `SMTP_MAX_FREQUENCY` defaults to
 * one minute between mails to the same person. Neither is generous, and both
 * are reported here as a sentence rather than as a stack trace - see
 * `mailRefusal`.
 */

const emailSchema = z.email('Enter a valid email address')

export type EmailResult =
  | { ok: true; message: string; savedAt: number }
  | { ok: false; error: string }

/**
 * A client that cannot touch this request's cookies.
 *
 * Used for the two calls that would otherwise fight the live session: the
 * password check below signs in as somebody to test a password, and the
 * verification mail is an OTP request that supabase-js would love to start a
 * PKCE flow for. Neither may leave anything behind in the browser, so both run
 * on a throwaway. The same reasoning, and the same shape, as `changePassword`
 * in password-actions.ts.
 */
function throwawayClient() {
  return createSupabaseClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Turn a mailer failure into something worth reading.
 *
 * GoTrue answers a tripped limit with "For security purposes, you can only
 * request this after 47 seconds" or "email rate limit exceeded", which are true
 * but arrive looking like a bug. They are not: they are the system working, and
 * the only useful thing to tell somebody is how long to wait.
 *
 * The last branch is the one that earned this its own function. When GoTrue
 * cannot hand the message to an SMTP server at all it answers 500 with a body
 * supabase-js cannot turn into a sentence, and `error.message` arrives as the
 * literal string `{}`. That went straight to the screen: a banner reading
 * "✕ {}", which tells somebody nothing except that the software is broken.
 *
 * So anything without a usable sentence in it becomes one. It deliberately does
 * not blame the reader or suggest a fix they could carry out - a dead mailer is
 * ours to notice, and the honest thing is to say the mail did not go and that
 * trying again is worth a shot.
 */
function mailRefusal(error: { message?: string; status?: number }): string {
  const message = typeof error.message === 'string' ? error.message.trim() : ''

  if (/after (\d+) seconds?/i.test(message)) {
    return 'That was just sent. Give it a minute before asking for another one.'
  }
  if (/rate limit/i.test(message)) {
    return 'Too many emails have gone out just now. Try again in a little while.'
  }

  /**
   * No sentence to show. Either the body was empty, or it was JSON that carried
   * no message - `{}` being the case actually seen in production - or the
   * server simply failed. None of those are worth printing verbatim.
   */
  const unusable = message === '' || message === '{}' || /^[[{].*[\]}]$/.test(message)
  if (unusable || (error.status ?? 0) >= 500) {
    return 'The email could not be sent just now. Try again in a moment.'
  }

  return message
}

/**
 * Send a fresh link to the address already on the account.
 *
 * This is a magic link, and that is not a workaround - it is the only mail
 * GoTrue will send to an address it already considers confirmed. Sign-up
 * confirmations cannot be re-sent here because autoconfirm marked every account
 * confirmed at birth (see email-verification.ts), and `resend({ type: 'signup'
 * })` refuses on exactly that ground.
 *
 * It is also the right mail on its own terms. The question being asked is "does
 * this person read this inbox", and a link that only works for somebody holding
 * it answers that. Opening it lands on /auth/confirm, which is where the
 * verification is recorded - so signing in by link and confirming an address are
 * the same act, and the copy in the mail says so.
 *
 * `shouldCreateUser: false`, because the account plainly exists: this is only
 * ever called by somebody signed in as it. It is set anyway so that a bug in a
 * caller cannot turn this into a sign-up endpoint.
 */
export async function resendVerification(): Promise<EmailResult> {
  const { user } = await requireUser()

  if (user.is_anonymous) {
    return { ok: false, error: 'Guest accounts have no email address to confirm' }
  }
  if (!user.email) {
    return { ok: false, error: 'This account has no email address' }
  }

  const { error } = await throwawayClient().auth.signInWithOtp({
    email: user.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${env.appUrl()}/auth/confirm`,
    },
  })

  if (error) {
    return { ok: false, error: mailRefusal(error) }
  }

  return {
    ok: true,
    message: `Sent to ${user.email}. Open the link in it and this is done.`,
    savedAt: Date.now(),
  }
}

/**
 * Move the account to a different address, on proof of the current password.
 *
 * The password is the whole point. Supabase would take the new address on the
 * strength of the session alone, and that is the exact shape of the attack this
 * guards: a live tab on a borrowed laptop, an address changed to one the
 * attacker owns, then a password reset to that address - and the account is
 * gone, permanently, without the owner's password ever being known. Asking for
 * it here is what keeps a borrowed session from becoming a stolen account. The
 * same reasoning as `changePassword`, which is why it uses the same check.
 *
 * Nothing changes when this returns. `updateUser({ email })` only *starts* the
 * change: GoTrue mails the new address - and, with secure email change on as it
 * is here and in production, the old one too - and the account keeps the address
 * it has until those links are opened. That is why the message below is careful
 * to say the change is pending rather than done.
 */
export async function changeEmail(
  _prev: EmailResult | null,
  formData: FormData,
): Promise<EmailResult> {
  const parsed = emailSchema.safeParse(
    typeof formData.get('email') === 'string'
      ? String(formData.get('email')).trim()
      : '',
  )
  const current = String(formData.get('currentPassword') ?? '')

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email address' }
  }
  if (!current) {
    return { ok: false, error: 'Enter your current password' }
  }

  const { user, supabase } = await requireUser()

  if (user.is_anonymous) {
    return { ok: false, error: 'Guest accounts cannot change their email address' }
  }
  if (!user.email) {
    return { ok: false, error: 'This account has no email address to verify against' }
  }
  if (parsed.data.toLowerCase() === user.email.trim().toLowerCase()) {
    return { ok: false, error: 'That is already your email address' }
  }

  /**
   * An account with no password cannot use this form, and must not be quietly
   * let past the check instead.
   *
   * An invited account is in exactly that state - the invite mail created the
   * user before its recipient typed anything - so there is no current password
   * to prove. Skipping the proof for them would make "has no password" the way
   * around the guard, which is worse than refusing; the panel offers the
   * password form instead, and this sentence is the fallback for anybody who
   * posts here directly.
   */
  const { data: passworded } = await supabase.rpc('has_password')
  if (passworded !== true) {
    return { ok: false, error: 'Set a password first, then you can change your email' }
  }

  const verifier = throwawayClient()
  const { error: wrong } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: current,
  })
  if (wrong) {
    return { ok: false, error: 'That is not your current password' }
  }
  await verifier.auth.signOut({ scope: 'local' })

  /**
   * The real update goes through the request's own client so it applies to the
   * signed-in session. `emailRedirectTo` matters here: without it GoTrue builds
   * the link against its own /verify, and the template's `{{ .TokenHash }}` is
   * what our /auth/confirm needs instead - see the note in config.toml.
   */
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${env.appUrl()}/auth/confirm` },
  )

  if (error) {
    return { ok: false, error: mailRefusal(error) }
  }

  revalidatePath('/', 'layout')

  return {
    ok: true,
    message: `Check ${parsed.data} for a link — opening it finishes the move. We tell ${user.email} too, so this can never happen quietly.`,
    savedAt: Date.now(),
  }
}

/**
 * The address the account is moving to, if a change is in flight.
 *
 * GoTrue keeps it on the user as `new_email` from the moment `updateUser` is
 * called until the last confirmation link is opened. Reading it is what lets the
 * panel say "waiting on a link at the new address" instead of appearing to have
 * forgotten the request - which is what it looked like before, because the
 * account's own `email` does not move until the end.
 */
export async function pendingEmail(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const next = (user as { new_email?: unknown } | null)?.new_email
  return typeof next === 'string' && next.length > 0 ? next : null
}
