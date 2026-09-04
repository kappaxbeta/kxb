import type { Metadata } from 'next'
import { NewsOutcome } from '@/app/news/outcome'
import { confirmSubscriber } from '@/domain/news-signup/tokens'

/**
 * The far end of the double opt-in.
 *
 * `noindex`, and it matters more here than on an ordinary page: these URLs
 * carry a token that is the only credential on the row, and a crawler that
 * indexes one has published it. The mail should mark them `noindex` too, but
 * this is the half we control.
 *
 * `force-dynamic` because it writes. A cached confirmation page would mean the
 * second person to follow a link gets the first person's answer.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <NewsOutcome outcome={await confirmSubscriber(token)} kind="confirmed" />
}
