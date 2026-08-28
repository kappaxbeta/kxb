import type { Metadata } from 'next'
import { EventsSheet } from '@/app/events/events-sheet'
import { EVENTS_DE } from '@/app/i18n/events'

export const metadata: Metadata = {
  title: EVENTS_DE.meta.title,
  description: EVENTS_DE.meta.description,
  alternates: { canonical: '/de/events', languages: { en: '/events', de: '/de/events' } },
}

/** See the English page: the form prefills from the session. */
export const dynamic = 'force-dynamic'

export default async function EventsPageDe() {
  return <EventsSheet locale="de" />
}
