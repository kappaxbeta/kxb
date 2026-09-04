import { landingDict } from '@/app/i18n/landing'
import { readLocale } from '@/app/i18n/preference'
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, ogWords, scene } from '@/app/og'

/**
 * The card every link into this site falls back to, and the front page's own.
 *
 * ---------------------------------------------------------------------------
 * Why this one is in the root segment
 * ---------------------------------------------------------------------------
 * A file here is inherited by every route below that does not bring its own -
 * `/pricing`, `/browse`, a workspace page somebody pasted into a chat. That is
 * the same inheritance that used to hand all of them one silent picture, and
 * it is worth keeping rather than routing around: the fallback should be the
 * site introducing itself, which is exactly what the front page's card is.
 *
 * Three routes override it: `/de`, the story channel, and an invitation.
 *
 * ---------------------------------------------------------------------------
 * The language
 * ---------------------------------------------------------------------------
 * `readLocale` and not a fixed English, even though this route is the English
 * front page. The reason is the inheritance above: this card is also what a
 * *signed-in* page unfurls as, and somebody reading the app in German who
 * pastes a link to it should not hand their colleague an English picture.
 *
 * For the front page itself a crawler carries no cookie and usually no
 * `accept-language` either, so this comes out English - which is right, `/`
 * *is* the English front page and `/de` has its own card below.
 */

export const alt = 'kxb.team — a virtual arcade space you send as a link.'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  const locale = await readLocale()
  const dict = landingDict(locale)
  const words = ogWords(locale)

  return ogCard({
    eyebrow: words.arcade,
    headline: dict.meta.title,
    sub: dict.hero.sub,
    button: words.join,
    // The summon: a peep arriving inside a ring of light, which is the one
    // picture in the set that is a picture of the verb rather than of a place.
    art: await scene('summon'),
  })
}
