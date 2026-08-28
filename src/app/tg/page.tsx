import type { Metadata } from 'next'
import { Enter } from '@/app/tg/enter'

/**
 * Where Telegram is pointed, and the only URL BotFather is given.
 *
 * A Mini App has exactly one configured Web App URL for every link that opens
 * it, which is why this route exists rather than Telegram being aimed straight
 * at `/g/[token]`: the token does not arrive in the path, it arrives in a query
 * parameter on a fixed address.
 *
 * `noindex` for the same reason the guest door has it. Nothing here is useful
 * to a search engine, and a crawler that files this address away is filing the
 * front of a redirector.
 */
export const metadata: Metadata = {
  title: 'Opening',
  robots: { index: false, follow: false },
}

export default function TelegramEntryPage() {
  return <Enter />
}
