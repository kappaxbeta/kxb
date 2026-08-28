import { WaitlistPanel } from '@/app/waitlist/waitlist-panel'

export const dynamic = 'force-dynamic'

export const metadata = {
  alternates: { canonical: '/waitlist', languages: { en: '/waitlist', de: '/de/waitlist' } },
}

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; reason?: string }>
}) {
  return <WaitlistPanel searchParams={searchParams} locale="en" />
}
