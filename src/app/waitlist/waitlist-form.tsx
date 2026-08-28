'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { type Locale, localePath } from '@/app/i18n/locales'
import { waitlistDict } from '@/app/i18n/waitlist'
import { applyForAccount } from '@/domain/access/actions'
import { APPLICATION_IDLE, type ApplicationState } from '@/domain/access/application'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Asking to be let in.
 *
 * Deliberately short. Only the address is required - a queue that demands a
 * name and a paragraph before it will take an email address collects fewer
 * addresses, and neither field decides anything downstream.
 *
 * The consent tick is the one piece of ceremony here, and it is unticked by
 * default and stays that way unless somebody chooses otherwise. A pre-ticked
 * box is not consent, the timestamp beside it would be evidence of nothing, and
 * the whole reason the row records a time and an address is to be worth
 * something later.
 */

const inputClass =
  'w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent'

function SubmitButton({ locale }: { locale: Locale }) {
  const dict = waitlistDict(locale).form
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? dict.submitting : dict.submit}
    </button>
  )
}

export function WaitlistForm({
  defaultEmail,
  locale = 'en',
}: {
  defaultEmail: string
  locale?: Locale
}) {
  const refusal = useRefusal()
  const dict = waitlistDict(locale).form
  const [state, formAction] = useActionState<ApplicationState, FormData>(
    applyForAccount,
    APPLICATION_IDLE,
  )

  if (state.status === 'listed') {
    return (
      <div className="rounded-lg border border-line bg-surface-raised px-4 py-4">
        <p className="text-sm font-medium">{dict.listedTitle}</p>
        <p className="mt-1 text-sm text-ink-muted">{dict.listedBody}</p>
        <p className="mt-3 text-sm">
          <Link href={localePath(locale, '/')} className="text-accent hover:underline">
            {dict.listedBack}
          </Link>
        </p>
      </div>
    )
  }

  const values = state.status === 'error' ? state.values : null
  const fieldError = (name: string) =>
    state.status === 'error' && state.field === name ? state.error : null

  return (
    <form action={formAction} className="space-y-4">
      {/* Read back by `applyForAccount` so a duplicate application is refused in
          the language it was made in. The waitlist form posts no path of its
          own, unlike the contact forms, so the locale is stated outright. */}
      <input type="hidden" name="locale" value={locale} />
      {/* The honeypot. Hidden from people, irresistible to naive bots, and
          checked before anything else in the action. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          {dict.emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={values?.email ?? defaultEmail}
          aria-invalid={fieldError('email') ? true : undefined}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="username" className="block text-sm font-medium">
          {dict.nameLabel} <span className="text-ink-muted">{dict.optional}</span>
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="nickname"
          defaultValue={values?.username ?? ''}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="note" className="block text-sm font-medium">
          {dict.noteLabel} <span className="text-ink-muted">{dict.optional}</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          defaultValue={values?.note ?? ''}
          className={`${inputClass} resize-y`}
        />
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm">
        <input
          name="newsletter"
          type="checkbox"
          defaultChecked={values?.newsletter ?? false}
          className="mt-0.5"
        />
        <span>
          {dict.newsletter}
          <span className="mt-0.5 block text-xs text-ink-muted">{dict.newsletterNote}</span>
        </span>
      </label>

      {state.status === 'error' && (
        <p role="alert" className="text-sm text-red-500">
          {refusal(state.error)}
        </p>
      )}

      <SubmitButton locale={locale} />

      <p className="text-xs text-ink-muted">
        {dict.privacyLead}
        <Link
          href={locale === 'de' ? '/datenschutz' : '/datenschutz/en'}
          className="text-accent hover:underline"
        >
          {dict.privacyLink}
        </Link>
        {dict.privacyTail}
      </p>
    </form>
  )
}
