import { DE } from '@/app/i18n/landing'
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, ogWords, scene } from '@/app/og'

/**
 * The front page's card, in German.
 *
 * Its own file rather than the root card reading a locale, because `/de` is
 * German by address: it says so in the URL, it is the half of the `hreflang`
 * pair a German search result points at, and a crawler asking for it sends no
 * cookie and frequently no `accept-language` either. Deciding this one from a
 * request header would mean the German page unfurling in English most of the
 * time, which is the exact failure the root card's note explains it cannot
 * avoid and this one can.
 */

export const alt = 'kxb.team — eine virtuelle Spielhalle, die du als Link verschickst.'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  const words = ogWords('de')

  return ogCard({
    eyebrow: words.arcade,
    headline: DE.meta.title,
    sub: DE.hero.sub,
    button: words.join,
    art: await scene('summon'),
  })
}
