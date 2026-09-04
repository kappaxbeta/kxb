import type { Metadata } from 'next'
import { NewsOutcome } from '@/app/news/outcome'
import { unsubscribeSubscriber } from '@/domain/news-signup/tokens'

/**
 * One click, no questions, no login.
 *
 * That is the requirement rather than a courtesy: an unsubscribe that asks
 * somebody to sign in, or to confirm on a second page, is one that does not
 * work for the person who has forgotten they ever signed up - which is most of
 * them. Following the link is the whole of it.
 *
 * A `GET` doing a write is normally wrong, and here it is the only thing that
 * can be right: the link is in a mail, and a mail can only offer a link. The
 * write is idempotent, so a prefetching mail client unsubscribing somebody who
 * only hovered is the failure worth guarding - which is why the copy says
 * plainly what happened and how to get back on.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <NewsOutcome outcome={await unsubscribeSubscriber(token)} kind="unsubscribed" />
}
