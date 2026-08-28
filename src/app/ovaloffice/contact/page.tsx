import { ContactInbox } from '@/app/ovaloffice/contact/contact-inbox'
import {
  countOpenBusinessInquiries,
  listContactMessages,
} from '@/domain/contact/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * What people wrote in, and whether anybody answered.
 *
 * Filtered through the URL like the accounts search and the report queue, so a
 * view of the inbox is a link rather than client state. Two filters now: the
 * status it is in, and which door it came through - /contact or the booking
 * form at /events. Both are validated here rather than trusted, because both
 * go straight into an `eq()`.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>
}) {
  const { status, kind } = await searchParams
  const { admin } = await requireBackofficeSection('contact')

  const filter = status === 'handled' || status === 'all' ? status : 'open'
  const kindFilter = kind === 'business' || kind === 'general' ? kind : 'all'

  const [messages, openBusiness] = await Promise.all([
    listContactMessages(admin, filter, kindFilter),
    countOpenBusinessInquiries(admin),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Contact messages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sent from the form on the site, or from the booking form at /events. Replying happens
          in your mail client — marking one handled only takes it out of this list.
        </p>
      </div>

      <ContactInbox
        messages={messages}
        filter={filter}
        kind={kindFilter}
        openBusiness={openBusiness}
      />
    </div>
  )
}
