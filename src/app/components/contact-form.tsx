'use client'

import { useActionState, useEffect, useRef } from 'react'
import { contactDict } from '@/app/i18n/contact'
import type { Locale } from '@/app/i18n/locales'
import { sendContactMessage } from '@/domain/contact/actions'
import { CONTACT_IDLE, EMPTY_DRAFT } from '@/domain/contact/message'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The contact form itself, so the dialog and the page cannot drift apart.
 *
 * A plain `<form action={...}>` rather than a click handler: that is what makes
 * it work before React has hydrated, which matters more here than anywhere else
 * in the app. Someone whose session is broken, or whose browser is having a bad
 * day, is exactly the person reaching for the contact form.
 */

const FIELD =
  'w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm outline-none transition focus:border-accent'

const LABEL = 'block text-xs font-medium text-ink-muted'

export function ContactForm({
  defaults,
  path,
  autoFocus = false,
  onSent,
  locale = 'en',
}: {
  defaults?: { username?: string | null; email?: string | null }
  /** The page they were on. Passed in because the dialog knows it and the
   *  standalone page is rendered on the server, where there is no location. */
  path?: string
  autoFocus?: boolean
  onSent?: () => void
  /** One string rather than the dictionary, so nothing extra crosses the
   *  server/client boundary - the dictionaries are already in the bundle. */
  locale?: Locale
}) {
  const refusal = useRefusal()
  const dict = contactDict(locale).form
  const [state, action, pending] = useActionState(sendContactMessage, CONTACT_IDLE)
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) firstField.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (state.status === 'sent') onSent?.()
  }, [state.status, onSent])

  if (state.status === 'sent') {
    return (
      <div className="rounded-xl border border-line bg-surface-raised/50 p-6 text-center">
        <p className="text-lg font-medium">{dict.sentTitle}</p>
        <p className="mt-2 text-sm text-ink-muted">{dict.sentBody}</p>
      </div>
    )
  }

  const invalid = (field: string) =>
    state.status === 'error' && state.field === field

  // React clears an uncontrolled form after its action returns, and it clears
  // it *to the defaultValue* - so putting the rejected draft here is what puts
  // the words back. Falls through to the session's own details on a first
  // render, and to nothing for a visitor we have never met.
  const rejected = state.status === 'error' ? state.values : EMPTY_DRAFT
  const value = (field: keyof typeof EMPTY_DRAFT, fallback?: string | null) =>
    rejected[field] || fallback || ''

  return (
    <form action={action} className="space-y-4">
      {path && <input type="hidden" name="path" value={path} />}

      {/*
        The honeypot. Hidden from sight and from screen readers, skipped by the
        keyboard, and never autofilled - anything that ends up in it was not put
        there by a person. See the check in sendContactMessage.
      */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="contact-username" className={LABEL}>
            {dict.nameLabel}
          </label>
          <input
            ref={firstField}
            id="contact-username"
            name="username"
            required
            maxLength={80}
            autoComplete="nickname"
            defaultValue={value('username', defaults?.username)}
            aria-invalid={invalid('username') || undefined}
            placeholder={dict.namePlaceholder}
            className={FIELD}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-email" className={LABEL}>
            {dict.emailLabel}
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            defaultValue={value('email', defaults?.email)}
            aria-invalid={invalid('email') || undefined}
            placeholder={dict.emailPlaceholder}
            className={FIELD}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-phone" className={LABEL}>
            {dict.phoneLabel} <span className="text-ink-muted/70">{dict.phoneOptional}</span>
          </label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            defaultValue={value('phone')}
            aria-invalid={invalid('phone') || undefined}
            placeholder={dict.phonePlaceholder}
            className={FIELD}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-subject" className={LABEL}>
            {dict.subjectLabel}
          </label>
          <input
            id="contact-subject"
            name="subject"
            required
            maxLength={120}
            defaultValue={value('subject')}
            aria-invalid={invalid('subject') || undefined}
            placeholder={dict.subjectPlaceholder}
            className={FIELD}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-message" className={LABEL}>
          {dict.messageLabel}
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={4000}
          defaultValue={value('message')}
          aria-invalid={invalid('message') || undefined}
          placeholder={dict.messagePlaceholder}
          className={`${FIELD} resize-y`}
        />
      </div>

      {state.status === 'error' && <ErrorNote>{refusal(state.error)}</ErrorNote>}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-ink-muted">
          {dict.note}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white transition disabled:opacity-60"
        >
          {pending ? dict.sending : dict.submit}
        </button>
      </div>
    </form>
  )
}
