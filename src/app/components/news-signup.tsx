'use client'

import Link from 'next/link'
import { useId, useState, useTransition } from 'react'
import { CONSENT, SIGNUP_COPY } from '@/domain/news-signup/consent'
import type { Locale } from '@/domain/i18n/locale'
import { subscribeToNews } from '@/domain/news-signup/actions'

/**
 * The news signup: an address, a sentence, and a box that starts empty.
 *
 * ---------------------------------------------------------------------------
 * The box is not pre-ticked, and the button does not imply consent
 * ---------------------------------------------------------------------------
 * Both are requirements rather than taste. Consent under the GDPR has to be a
 * clear affirmative act, and a pre-ticked box is the canonical example of what
 * is not one; a form where pressing "subscribe" is itself the agreement is the
 * same failure wearing a button. So the tick is separate, empty, and required,
 * and the sentence beside it is the whole of what is being agreed to.
 *
 * The sentence is rendered from the same `CONSENT` the server records, so what
 * somebody reads and what ends up in the row cannot drift. The privacy link
 * sits beside it rather than inside it - a URL frozen into a stored consent
 * string ages badly.
 *
 * ---------------------------------------------------------------------------
 * No optimistic success
 * ---------------------------------------------------------------------------
 * The rest of the product leans optimistic and this deliberately does not: the
 * only thing this control can tell somebody is whether their address was
 * accepted, and flashing "thank you" before the round trip means flashing it
 * on the failures too. It is one request, once, and waiting for it is the
 * honest version.
 */
export function NewsSignup({ locale }: { locale: Locale }) {
  const t = SIGNUP_COPY[locale]
  const id = useId()

  const [email, setEmail] = useState('')
  const [consented, setConsented] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <p className="rounded-xl border border-line bg-surface p-4 text-sm" role="status">
        {t.done}
      </p>
    )
  }

  return (
    <form
      className="rounded-xl border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await subscribeToNews({ email, locale, consented })
          if (result.ok) {
            setDone(true)
            return
          }
          setError(
            result.error === 'email'
              ? t.errorEmail
              : result.error === 'consent'
                ? t.errorConsent
                : t.errorGeneric,
          )
        })
      }}
    >
      <h3 className="font-pixel text-sm uppercase">{t.heading}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t.blurb}</p>

      {/* Always stacked, never a row.

          It was `sm:flex-row` and that was the bug in the screenshot: Tailwind
          breakpoints watch the *viewport*, and this form lives in a 19rem
          column. On a wide screen the row fired inside a narrow box, so the
          input collapsed to a stub and the button's label wrapped onto two
          lines. A column is correct in both placements and cannot break in
          either. */}
      <div className="mt-4 flex flex-col gap-2">
        <input
          id={`${id}-email`}
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t.placeholder}
          autoComplete="email"
          aria-label={t.placeholder}
          aria-invalid={error === t.errorEmail || undefined}
          className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none transition placeholder:text-ink-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:opacity-90 disabled:opacity-60"
        >
          {t.submit}
        </button>
      </div>

      {/* The label wraps the box, so the sentence is the target as well as the
          explanation - a 16px checkbox on its own is not a thumb-sized one. */}
      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink-muted">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span>
          {CONSENT[locale]}{' '}
          <Link
            href={locale === 'de' ? '/datenschutz' : '/datenschutz/en'}
            className="underline underline-offset-2"
          >
            {t.privacy}
          </Link>
        </span>
      </label>

      {error ? (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
