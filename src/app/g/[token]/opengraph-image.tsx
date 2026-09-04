import { readLocale } from '@/app/i18n/preference'
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, ogWords, scene } from '@/app/og'
import { guestLandingSpot } from '@/domain/guests/application'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What an invitation looks like in the chat it was pasted into.
 *
 * ---------------------------------------------------------------------------
 * This is the card that matters most
 * ---------------------------------------------------------------------------
 * Every other card is a page somebody might find. This one is a link a person
 * sent to a person, and it is read in a message thread beside whatever they
 * typed above it. The page's own `generateMetadata` has said the useful
 * sentence - "you got invited to join Acme", "no account needed" - since the
 * door shipped, and the picture beside it was three animals standing still on
 * a green floor, the same picture the front page had. So the words said "come
 * and play a match" and the picture said "a website".
 *
 * Now the picture says which. A link into a match shows two peeps going for
 * the same ball; a link into a room or a space shows a room with people
 * standing in it. That is the whole idea: the artwork is the one part of an
 * unfurl somebody takes in before deciding whether to read the rest.
 *
 * ---------------------------------------------------------------------------
 * What it is allowed to say
 * ---------------------------------------------------------------------------
 * The space's name and the *kind* of place, and nothing else - the same
 * disclosure the page's metadata already makes, for the same reason: the name
 * is what makes an invitation legible, and whoever is rendering this holds the
 * token already. Not the room's name, not the match's, not who is in it.
 *
 * A dead or invented token gets the generic card rather than a broken image,
 * matching `generateMetadata` exactly: an unfurl must not be the place
 * somebody learns which guesses were real.
 *
 * ---------------------------------------------------------------------------
 * The language
 * ---------------------------------------------------------------------------
 * `readLocale`, which for a crawler is `accept-language` and otherwise
 * English. It is the best answer available - the link carries no language of
 * its own - and it is the honest half of "in the language they need": the card
 * follows the reader where the reader says anything, and the *page* behind it
 * has always followed them properly, because a person arrives with a browser
 * that asks.
 */

export const alt = 'You got invited to play on kxb.team.'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export const dynamic = 'force-dynamic'

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const words = ogWords(await readLocale())

  // Service role, exactly as the page's metadata does it: the visitor has no
  // session and `guest_links` is admin-only. Two columns, and neither of them
  // is about what is inside the space.
  const admin = createAdminClient()
  const { data: link } = await admin
    .from('guest_links')
    .select('tenant_id, destination')
    .eq('token', token)
    .maybeSingle()

  const { data: tenant } = link
    ? await admin
        .from('tenants_read_model')
        .select('name, slug')
        .eq('id', link.tenant_id)
        .maybeSingle()
    : { data: null }

  // The same reading of the destination the host's own list of links uses, so
  // "this link goes into a match" cannot mean one thing on the dashboard and
  // another in the preview. Anything that could not be honoured comes back as
  // the lounge, which is where the visitor would in fact land.
  const landing = tenant ? guestLandingSpot(link?.destination, tenant.slug) : null

  const headline =
    landing?.kind === 'match'
      ? words.toBattle
      : landing?.kind === 'room'
        ? words.toRoom
        : words.toSpace

  return ogCard({
    eyebrow: tenant?.name ?? words.invitation,
    headline,
    sub: words.noAccount,
    button: words.join,
    art: await scene(landing?.kind === 'match' ? 'duel' : 'crew'),
  })
}
