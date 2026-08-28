'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  changePassword,
  type PasswordResult,
  setPassword,
} from '@/domain/profile/password-actions'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Set a password, or change the one you have.
 *
 * Which of the two you get is not a toggle - it is a fact about the account,
 * decided on the server and passed in. An account that has never had a password
 * (the invited case: the invite mail created the user before its recipient
 * typed anything) must not be shown a "current password" field, because there
 * is nothing they could put in it and no way out of the dead end from inside
 * the app.
 *
 * Deliberately not optimistic, unlike the username and avatar beside it. There
 * is nothing to show optimistically - a password does not appear anywhere once
 * saved - and pretending a credential change landed before the server agreed is
 * the one place in this app where a hopeful UI could tell somebody they are
 * safe when they are not.
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

export function PasswordPanel({
  email,
  hasPassword,
}: {
  email: string
  /** From the server. See `has_password()` in the migration. */
  hasPassword: boolean
}) {
  const refusal = useRefusal()
  const t = settingsDict(useLocale()).password
  const action = hasPassword ? changePassword : setPassword
  const [state, formAction] = useActionState<PasswordResult | null, FormData>(action, null)

  // The banner is derived from the result rather than mirrored into state - the
  // only thing worth remembering separately is whether it has been typed past.
  const [stale, setStale] = useState(false)
  const saved = state?.ok === true && !stale

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface-raised/40 p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">
          {hasPassword ? t.change : t.set}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          {hasPassword ? t.changeBody : t.setBody}
        </p>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-500"
        >
          ✕ {refusal(state.error)}
        </div>
      )}

      {saved && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-500">
          ✓ {t.saved}
        </div>
      )}

      {/* Keyed on the save nonce, so a success remounts the form and the typed
          password goes with it - leaving a credential sitting in a field is how
          it ends up in a screenshot or offered to the next person at the desk. */}
      <form
        key={state?.savedAt ?? 'editing'}
        action={(formData) => {
          setStale(false)
          formAction(formData)
        }}
        onChange={() => setStale(true)}
        className="space-y-3"
      >
        {/* Hidden, and there for password managers: without a username field
            beside it they offer to save a password with no account attached.
            The same trick the invite flow uses. */}
        <input
          type="email"
          name="email"
          value={email}
          readOnly
          autoComplete="username"
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
        />

        {hasPassword && (
          <div>
            <label htmlFor="currentPassword" className="text-xs text-ink-muted">
              {t.current}
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className={`mt-1 ${field}`}
            />
          </div>
        )}

        <div>
          <label htmlFor="newPassword" className="text-xs text-ink-muted">
            {hasPassword ? t.new : t.first}
          </label>
          <input
            id="newPassword"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            className={`mt-1 ${field}`}
          />
          <p className="mt-1.5 text-xs text-ink-muted">{t.rules}</p>
        </div>

        <SubmitButton
          label={hasPassword ? t.changeCta : t.setCta}
          saving={t.saving}
        />
      </form>
    </div>
  )
}
