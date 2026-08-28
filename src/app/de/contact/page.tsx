import { ContactPanel } from '@/app/contact/contact-panel'
import { CONTACT_DE } from '@/app/i18n/contact'

export const metadata = {
  title: CONTACT_DE.meta.title,
  alternates: { canonical: '/de/contact', languages: { en: '/contact', de: '/de/contact' } },
}

/** See the English page: it prefills from the session. */
export const dynamic = 'force-dynamic'

export default async function ContactPageDe() {
  return <ContactPanel locale="de" />
}
