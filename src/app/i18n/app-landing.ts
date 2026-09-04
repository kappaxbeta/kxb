import type { Locale } from '@/domain/i18n/locale'

/**
 * The first screen of the installed app.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the landing page's dictionary
 * ---------------------------------------------------------------------------
 * The marketing page is written for a stranger who arrived from a link and owes
 * us nothing: it has to earn thirty seconds, so it opens with a position, a
 * badge, four rows of proof and a price. Every one of those is the right answer
 * to the question "why should I care", and every one of them is the wrong thing
 * to put in front of somebody who has already installed the app.
 *
 * They have answered that question. What is left is smaller and gentler: say
 * what this is in one line, offer the two doors, and get out of the way. Hence
 * a separate dictionary rather than a subset of the other one - a subset would
 * drift back towards the pitch every time somebody edited the page it came
 * from.
 *
 * ---------------------------------------------------------------------------
 * What may not be in here
 * ---------------------------------------------------------------------------
 * No price, no plan, no "upgrade", and no link to the site to do any of those.
 * App Store guideline 3.1.1 covers the first three and the steering rule covers
 * the fourth - see `isAppShell` and `NOT_FOR_SALE_IN_APP`, which say the same
 * thing about actions rather than about words. Nothing here is sold, so nothing
 * here is priced, and the quiet is the feature.
 */
export interface AppLandingDict {
  /** Over the mark. Not a badge and not news - just a greeting. */
  greeting: string
  /**
   * The one paragraph, and there is only one.
   *
   * There is no `headline` key any more. The headline is the stance, and the
   * stance lives in `@/app/i18n/stance` because it is the one line the product
   * repeats verbatim on more than one surface - the landing page, the sign-in
   * card and now this. A second copy here would be a second thing to keep in
   * step, and the whole point of that module is that there is not one.
   */
  sub: string
  /** The two doors. */
  signIn: string
  signUp: string
  /** When sign-ups are closed, the second door says this instead. */
  waitlist: string
  /** Under both: a room to stand in without deciding anything first. */
  lookAround: string
  lookAroundHint: string

  /**
   * The two places worth going that are not a room.
   *
   * The channel and the handbook. Both are reading rather than playing, both
   * are free, and neither sells anything - which is what makes them the only
   * two outbound links this screen may carry.
   */
  universe: string
  universeHint: string
  /** `{number}` and `{title}` are the chapter that is on air. */
  universeNow: string
  community: string
  communityHint: string

  /** Over the events band, when there is one. */
  onNow: string
  /** `{name}` is the space. Read out to anyone who cannot see the banner. */
  openDoor: string

  /** The line at the very bottom. */
  footer: string
}

const EN: AppLandingDict = {
  greeting: 'Hello again',
  sub: 'Walk in, see who else is there, kick a ball about or sit and talk. Nothing to install, nothing to schedule — the room is just there.',
  signIn: 'Sign in',
  signUp: 'Create an account',
  waitlist: 'Ask for an invite',
  lookAround: 'Or look around first',
  lookAroundHint: 'A room with nobody watching. No account needed.',
  universe: 'The XO universe',
  universeHint: 'The story the worlds come out of. A chapter at a time.',
  universeNow: 'Chapter {number} — {title}',
  community: 'Community',
  communityHint: 'Guides, and what other people have made.',
  onNow: 'Open right now',
  openDoor: 'Go in to {name}',
  footer: 'Made in Berlin.',
}

const DE: AppLandingDict = {
  greeting: 'Schön, dass du da bist',
  sub: 'Reingehen, sehen, wer sonst da ist, einen Ball kicken oder einfach quatschen. Nichts zu installieren, nichts zu planen — der Raum ist einfach da.',
  signIn: 'Anmelden',
  signUp: 'Konto erstellen',
  waitlist: 'Einladung anfragen',
  lookAround: 'Oder erst mal umsehen',
  lookAroundHint: 'Ein Raum, in dem niemand zuschaut. Ohne Konto.',
  universe: 'Das XO-Universum',
  universeHint: 'Die Geschichte, aus der die Welten kommen. Kapitel für Kapitel.',
  universeNow: 'Kapitel {number} — {title}',
  community: 'Community',
  communityHint: 'Anleitungen, und was andere gebaut haben.',
  onNow: 'Gerade offen',
  openDoor: 'Rein zu {name}',
  footer: 'Gemacht in Berlin.',
}

const BG: AppLandingDict = {
  greeting: 'Радваме се, че си тук',
  sub: 'Влизаш, виждаш кой друг е вътре, ритваш топка или просто си говорите. Нищо за инсталиране, нищо за уговаряне — стаята просто е там.',
  signIn: 'Вход',
  signUp: 'Създай акаунт',
  waitlist: 'Поискай покана',
  lookAround: 'Или първо се огледай',
  lookAroundHint: 'Стая, в която никой не гледа. Без акаунт.',
  universe: 'XO вселената',
  universeHint: 'Историята, от която идват световете. Глава по глава.',
  universeNow: 'Глава {number} — {title}',
  community: 'Общност',
  communityHint: 'Наръчници, и какво са направили другите.',
  onNow: 'Отворено сега',
  openDoor: 'Влез в {name}',
  footer: 'Направено в Берлин.',
}

const DICTS: Record<Locale, AppLandingDict> = { en: EN, de: DE, bg: BG }

export function appLandingDict(locale: Locale): AppLandingDict {
  return DICTS[locale]
}
