'use client'

import { useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import {
  changeEmail,
  type EmailResult,
  resendVerification,
} from '@/domain/profile/email-actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The address on the account: what it is, whether it is confirmed, and how to
 * move it.
 *
 * One panel rather than two, because "is this address really yours" and "make
 * this a different address" are the same question asked at two moments, and a
 * person who wants the second usually noticed the first. Splitting them would
 * put the confirmation nudge in one card and the reason it matters in another.
 *
 * Deliberately not optimistic, unlike the username and avatar above it. Neither
 * half of this lands when the button is released: the confirmation is a mail
 * somebody has yet to open, and the change does not touch the account until
 * they do. Showing either as done would be showing something that has not
 * happened - and in the change's case, something that may never happen.
 */
function SubmitButton({ label, saving }: { label: string; saving: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface disabled:opacity-50"
    >
      {pending ? saving : label}
    </button>
  )
}

const field =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent'

export function EmailPanel({
  email,
  verified,
  pending,
  hasPassword,
}: {
  email: string
  /** From the server - see `emailVerified`. Never a client-side guess. */
  verified: boolean
  /** An address change already in flight, if there is one. */
  pending: string | null
  /** Whether there is a password to prove. An invited account has none. */
  hasPassword: boolean
}) {
  const refusal = useRefusal()
  const t = settingsDict(useLocale()).email

  const [state, formAction] = useActionState<EmailResult | null, FormData>(changeEmail, null)

  const [sending, startSending] = useTransition()
  const [sent, setSent] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const confirm = () => {
    setSendError(null)
    startSending(async () => {
      const result = await resendVerification()
      if (result.ok) setSent(email)
      else setSendError(result.error)
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface-raised/40 p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.body}</p>
      </div>

      {/* The address itself, with its state next to it rather than described in
          a sentence somewhere else. This is the one fact somebody opened the
          panel to check. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{email}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            verified
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-amber-500/15 text-amber-400'
          }`}
        >
          {verified ? `✓ ${t.verified}` : t.unverified}
        </span>
      </div>

      {!verified && (
        <div className="space-y-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5">
          <p className="text-xs leading-relaxed text-ink-muted">{t.confirmBody}</p>

          {sent ? (
            <p className="text-xs font-medium text-emerald-400">
              ✓ {fill(t.sent, { email: sent })}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={confirm}
                disabled={sending}
                className="rounded-lg border border-amber-500/30 px-3.5 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-50"
              >
                {sending ? t.sending : t.confirmCta}
              </button>
              <p className="text-xs leading-relaxed text-ink-muted/70">{t.spam}</p>
            </>
          )}

          {sendError && (
            <p role="alert" className="text-xs font-medium text-red-500">
              ✕ {refusal(sendError)}
            </p>
          )}
        </div>
      )}

      {/* A change already asked for. Shown whether or not the address is
          confirmed, because it is true in both cases and it is the answer to
          "I changed it and nothing happened". */}
      {pending && (
        <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-relaxed text-sky-200">
          {fill(t.pending, { email: pending })}
        </p>
      )}

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">{t.change}</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.changeBody}</p>

        {!hasPassword ? (
          /* No password, no proof, no form. The panel above this one is where
             they set one - saying so is more use than a disabled button. */
          <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-ink-muted">
            {t.needsPassword}
          </p>
        ) : (
          <>
            {state?.ok === false && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-500"
              >
                ✕ {refusal(state.error)}
              </div>
            )}

            {state?.ok === true && (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-500">
                ✓ {state.message}
              </div>
            )}

            {/* Keyed on the send nonce so a success remounts the form and takes
                the typed password with it - a credential left sitting in a
                field is how it ends up in a screenshot. The same reasoning as
                the password panel above. */}
            <form key={state?.ok ? state.savedAt : 'editing'} action={formAction} className="mt-3 space-y-3">
              {/* Hidden, and there for password managers: without a username
                  field beside it they offer to save a password with no account
                  attached. The same trick the password panel uses. */}
              <input
                type="email"
                name="username"
                value={email}
                readOnly
                autoComplete="username"
                aria-hidden="true"
                tabIndex={-1}
                className="hidden"
              />

              <div>
                <label htmlFor="newEmail" className="text-xs text-ink-muted">
                  {t.newLabel}
                </label>
                <input
                  id="newEmail"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`mt-1 ${field}`}
                />
              </div>

              <div>
                <label htmlFor="emailCurrentPassword" className="text-xs text-ink-muted">
                  {t.currentPassword}
                </label>
                <input
                  id="emailCurrentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={`mt-1 ${field}`}
                />
              </div>

              <SubmitButton label={t.changeCta} saving={t.saving} />
            </form>
          </>
        )}
      </div>
    </div>
  )
}
