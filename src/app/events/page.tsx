import type { Metadata } from 'next'
import { EventsSheet } from '@/app/events/events-sheet'
import { EVENTS_EN } from '@/app/i18n/events'

export const metadata: Metadata = {
  title: EVENTS_EN.meta.title,
  description: EVENTS_EN.meta.description,
  alternates: { canonical: '/events', languages: { en: '/events', de: '/de/events' } },
}

/**
 * Dynamic because the form prefills from the session, exactly as /contact does.
 * Somebody already signed in who is now planning their community's birthday
 * should not have to type their own address.
 */
export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  return <EventsSheet locale="en" />
}
