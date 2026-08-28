'use client'

import { useState } from 'react'
import { spacesDict, type SpacesDict } from '@/app/i18n/spaces'
import { DEFAULT_LOCALE, type Locale } from '@/domain/i18n/locale'
import { useFormStatus } from 'react-dom'
import { createTenant } from '@/domain/tenants/actions'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Creating a workspace redirects on success, so there is no optimistic state to
 * manage - only the failure path renders here.
 *
 * The slug field auto-fills from the name but stays editable, because the slug
 * is permanent: it is claimed in tenant_slugs before any event is written and
 * never re-pointed. Guessing it silently for the user, on a value they cannot
 * change later, would be the wrong kind of convenience.
 */
export function CreateTenantForm({
  /**
   * Without the dashed box and the two lines above it.
   *
   * For the last panel of the first-run tour, which is already a titled panel
   * saying what a space is - see <OnboardingTour>. Rendering the full version in
   * there gave a heading inside a heading and said "you become its owner" twice.
   * The fields, their validation and the error line are the same either way;
   * this only drops chrome.
   */
  bare = false,
  /**
   * The reader's language, resolved on whichever server page renders this.
   *
   * A prop rather than `useLocale`, because both callers are outside a space:
   * `/tenants` and the first-run tour have no workspace shell above them and so
   * no `LocaleProvider`. Defaults to English for the same reason every other
   * default in this file does - a caller that has not thought about it should
   * get the thing that was there before.
   */
  locale = DEFAULT_LOCALE,
}: {
  bare?: boolean
  locale?: Locale
} = {}) {
  const refusal = useRefusal()
  const t = spacesDict(locale).create
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  async function handleSubmit(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    const chosenSlug = String(formData.get('slug') ?? '').trim()

    setError(null)
    const result = await createTenant(name, chosenSlug)
    // On success the action redirects, so reaching here means it failed.
    if (!result.ok) setError(refusal(result.error))
  }

  return (
    <section
      className={bare ? '' : 'mt-10 rounded-lg border border-dashed border-line p-4'}
    >
      {!bare && (
        <>
          <h2 className="text-sm font-medium">{t.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t.body}</p>
        </>
      )}

      <form action={handleSubmit} className={bare ? 'space-y-2' : 'mt-4 space-y-2'}>
        <input
          name="name"
          required
          maxLength={80}
          placeholder={t.namePlaceholder}
          aria-label={t.nameLabel}
          autoComplete="off"
          onChange={(e) => {
            if (!slugEdited) setSlug(toSlug(e.target.value))
          }}
          className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3">
          <span className="font-mono text-sm text-ink-muted">/t/</span>
          <input
            name="slug"
            required
            maxLength={40}
            value={slug}
            aria-label={t.urlLabel}
            autoComplete="off"
            onChange={(e) => {
              setSlugEdited(true)
              setSlug(toSlug(e.target.value))
            }}
            className="flex-1 bg-transparent py-2 font-mono text-sm outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <SubmitButton labels={t} />
      </form>
    </section>
  )
}

function SubmitButton({ labels }: { labels: SpacesDict['create'] }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? labels.creating : labels.submit}
    </button>
  )
}

/** Mirrors slugSchema. The server re-validates; this is only to keep typing tidy. */
function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
}
