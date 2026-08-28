import { ContactPanel } from '@/app/contact/contact-panel'
import { CONTACT_EN } from '@/app/i18n/contact'

export const metadata = {
  title: CONTACT_EN.meta.title,
  alternates: { canonical: '/contact', languages: { en: '/contact', de: '/de/contact' } },
}

/**
 * Dynamic because it prefills from the session. A signed-in member should not
 * have to type their own name to report that something is broken.
 */
export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  return <ContactPanel locale="en" />
}
