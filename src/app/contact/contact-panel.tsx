import Link from 'next/link'
import { ContactForm } from '@/app/components/contact-form'
import { contactDict } from '@/app/i18n/contact'
import { localePath, type Locale } from '@/app/i18n/locales'
import { contactIdentity } from '@/domain/contact/actions'

/**
 * The contact form as a page, in whichever language it was asked for.
 *
 * The floating launcher in the root layout is how most people will reach it,
 * but a dialog is not a URL: this is what a footer link, an email, or a support
 * reply can point at, and it is what somebody sees when the widget's JavaScript
 * never arrives.
 */
export async function ContactPanel({ locale }: { locale: Locale }) {
  const defaults = await contactIdentity()
  const dict = contactDict(locale)

  // German is the binding version of the Impressum and lives at the bare path.
  const imprint = locale === 'de' ? '/impressum' : '/impressum/en'

  return (
    <main lang={locale} className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12">
      <Link href={localePath(locale, '/')} className="nav-link text-sm">
        {dict.back}
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">{dict.title}</h1>
      <p className="mt-2 mb-8 text-ink-muted">{dict.intro}</p>

      {/* `path` carries the locale, which is how a rejection comes back in the
          language the person was reading. See domain/contact/replies.ts. */}
      <ContactForm defaults={defaults} path={localePath(locale, '/contact')} locale={locale} />

      <p className="mt-10 text-xs text-ink-muted">
        {dict.legalLead}
        <Link href={imprint} className="text-accent hover:underline">
          {dict.legalLink}
        </Link>
        {dict.legalTail}
      </p>
    </main>
  )
}
