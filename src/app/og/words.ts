import type { Locale } from '@/domain/i18n/locale'

/**
 * The handful of words a preview card says in its own right.
 *
 * ---------------------------------------------------------------------------
 * Why a dictionary of its own
 * ---------------------------------------------------------------------------
 * Almost everything on a card is borrowed - the landing card's headline is the
 * landing page's headline, the channel card's tagline is the channel's own.
 * That is deliberate: a preview is a promise about what is on the other end of
 * the link, and a promise written in a second place is a promise that drifts.
 *
 * What is left over is the vocabulary the card invented, which is the button
 * and the line above it. A card has a button that nobody can press - it is a
 * picture of one - and it is there because an unfurl is read in a fifth of a
 * second and a pill shape says "there is something to do here" faster than any
 * sentence does. Those strings exist nowhere else in the app, so they live
 * here rather than being smuggled into a page's dictionary that has no use for
 * them.
 *
 * ---------------------------------------------------------------------------
 * Three languages, and one of them is not Latin
 * ---------------------------------------------------------------------------
 * The public site is English and German (see `PublicLocale`), but an
 * invitation is not a public page: it is a link somebody inside a space sends
 * to somebody they know, and the app is readable in Bulgarian. So the cards
 * carry all three, and everything drawn from this file is set in Geist rather
 * than in the pixel face - which has no Cyrillic and would render `Присъедини`
 * as a row of boxes.
 */
export interface OgWords {
  /** The button on the landing card and on every invitation. */
  join: string
  /** The button on the channel and chapter cards. */
  watch: string
  /** What the landing card calls this place, above the headline. */
  arcade: string
  /** The line above an invitation's headline, naming who is inviting. */
  invitation: string
  /** An invitation into a match. */
  toBattle: string
  /** An invitation into a room. */
  toRoom: string
  /** An invitation with no destination of its own - the lounge, the space. */
  toSpace: string
  /** The one thing worth promising on an invitation card. */
  noAccount: string
}

const EN: OgWords = {
  join: 'Join now',
  watch: 'Read the episode',
  arcade: 'Virtual arcade space',
  invitation: 'An invitation',
  toBattle: 'You are invited to a battle',
  toRoom: 'You are invited to a room',
  toSpace: 'You are invited to play',
  noAccount: 'No account needed.',
}

const DE: OgWords = {
  join: 'Jetzt mitspielen',
  watch: 'Folge lesen',
  arcade: 'Virtuelle Spielhalle',
  invitation: 'Eine Einladung',
  toBattle: 'Du bist zu einem Battle eingeladen',
  toRoom: 'Du bist in einen Raum eingeladen',
  toSpace: 'Du bist zum Spielen eingeladen',
  noAccount: 'Kein Konto nötig.',
}

const BG: OgWords = {
  join: 'Влез сега',
  watch: 'Прочети епизода',
  arcade: 'Виртуална зала',
  invitation: 'Покана',
  toBattle: 'Поканен си на битка',
  toRoom: 'Поканен си в стая',
  toSpace: 'Поканен си да играеш',
  noAccount: 'Не е нужен акаунт.',
}

const WORDS: Record<Locale, OgWords> = { en: EN, de: DE, bg: BG }

export function ogWords(locale: Locale): OgWords {
  return WORDS[locale]
}
