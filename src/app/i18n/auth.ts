/**
 * Sign-in and sign-up.
 *
 * One dictionary for both, because they are one form with a mode flag - and
 * the pair of them is where the two languages are most likely to drift, since
 * half the strings differ only by whether you are arriving or being created.
 *
 * The server-side half lives at the bottom: four messages the actions can
 * return. Everything else Supabase reports (`error.message`) and every zod
 * issue stays English. Those are reachable, unlike the contact form's, but
 * translating them means either a mapping table keyed on Supabase's own English
 * text - which breaks silently the first time they reword one - or a locale
 * threaded into the schemas. Neither is worth doing blind; see the note in the
 * handover.
 */
import { type Locale, publicLocale, type PublicLocale } from '@/domain/i18n/locale'
export interface AuthDict {
  signInTitle: string
  signUpTitle: string
  /**
   * The line under the title, and one per door rather than one shared.
   *
   * They were the same sentence, and it was the sentence about the event log -
   * true, and an answer to a question nobody standing at a sign-in form is
   * asking. Someone arriving already has an account and wants to know they are
   * in the right place; someone signing up wants to know what it costs. Those
   * are two different sentences.
   */
  blurbSignIn: string
  blurbSignUp: string
  google: string
  or: string
  emailLabel: string
  passwordLabel: string
  methodLabel: string
  methodPassword: string
  methodMagic: string
  signIn: string
  signingIn: string
  createAccount: string
  creating: string
  magicSubmit: string
  magicSending: string
  magicNoteGated: string
  magicNoteOpen: string
  mailpitLead: string
  mailpitLink: string
  mailpitTail: string
  keepTitle: string
  keepNote: string
  invitedTitle: string
  invitedBody: string
  /**
   * The promo code field, which is on the sign-up form and nowhere else.
   *
   * `codeApplied` is what somebody who followed /code/CAFE24 reads: the field
   * is already filled in, and the notice says what it is about to do. The field
   * stays editable underneath it - a code applying itself invisibly is the
   * thing to avoid, and somebody who was handed the wrong flyer needs to be
   * able to correct it without hunting for a cookie.
   */
  codeLabel: string
  codeHint: string
  codeApplied: string
  /**
   * The standing offers, read off the codes named `SIGNUP…`.
   *
   * `offerDays` and `offerForever` are the whole headline of an offer, so they
   * carry the plan name in them - "30 days of xo, free" says the two things
   * that decide it, and a separate tier badge beside a generic "free month"
   * would say them twice.
   */
  offerDays: string
  offerForever: string
  /**
   * The second half of an offer that carries bucks, on its own line under the
   * headline. `{n}` is how many.
   *
   * Its own key rather than a suffix baked into `offerDays`, because it is not
   * always there: most codes are a month and nothing else, and a headline
   * template with an empty tail in it would leave a dangling "plus" in two
   * languages the day somebody minted one.
   */
  offerBucks: string
  /** `{n}` bearer codes to pass on. Rare, and never shown at 0. */
  offerVouchers: string
  /** `{n}` coins into the wallet. */
  offerCoins: string
  offerNote: string
  offerSpaces: string
  offerRemaining: string
  offerCloses: string
  offerUse: string
  offerApplied: string
  gatedLead: string
  gatedStrong: string
  gatedMid: string
  gatedLink: string
  gatedTail: string
  waitlistLink: string
  waitlistTail: string
  noAccount: string
  createOne: string
  haveAccount: string
  signInLink: string
  /**
   * The § 305 BGB notice, in five pieces because two of them are links.
   *
   * Split rather than templated so the two link texts can be translated as
   * words instead of being spliced into a sentence by index - and so the German
   * version can put them where German word order wants them.
   */
  termsLead: string
  termsLink: string
  termsMid: string
  termsPrivacyLink: string
  termsTail: string
  linkErrors: {
    invalid_link: string
    expired_link: string
    oauth_cancelled: string
    oauth_failed: string
  }
}

export const AUTH_EN: AuthDict = {
  signInTitle: 'Sign in',
  signUpTitle: 'Create an account',
  blurbSignIn: 'Your spaces are where you left them.',
  blurbSignUp: 'Free, and it comes with a space of your own.',
  google: 'Continue with Google',
  or: 'or',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  methodLabel: 'Sign-in method',
  methodPassword: 'Password',
  methodMagic: 'Email link',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  createAccount: 'Create account',
  creating: 'Creating…',
  magicSubmit: 'Email me a link',
  magicSending: 'Sending…',
  magicNoteGated:
    'The link signs you in. While sign-up is by invitation, it only works for an account that already exists, or for an invitation addressed to your email.',
  magicNoteOpen:
    'No password required. The link signs you in, and creates the account if you don’t have one.',
  mailpitLead: 'Running locally? The mail never leaves your machine, so open ',
  mailpitLink: 'Mailpit',
  mailpitTail: ' to click the link.',
  keepTitle: 'Keep me signed in',
  keepNote: 'Uncheck on a shared computer — you’ll be signed out when the browser closes.',
  invitedTitle: 'You have an invitation.',
  invitedBody: 'Finish signing up below and it will be redeemed.',
  codeLabel: 'Code (optional)',
  codeHint: 'Got a code? It gets you a month free — no card needed.',
  codeApplied: 'Your code is ready. Create the account and the free month starts.',
  offerDays: '{n} days of {tier}, free',
  offerForever: '{tier}, free, with no end',
  offerBucks: 'plus {n} bucks to spend on skins',
  offerVouchers: 'plus {n} voucher codes to give away',
  offerCoins: 'plus {n} coins',
  offerNote: 'No card, and nothing is charged when it runs out.',
  offerSpaces: 'Covers {n} of your spaces.',
  offerRemaining: '{n} left',
  offerCloses: 'Until {date}',
  offerUse: 'Use it',
  offerApplied: 'Applied',
  gatedLead: 'Sign-up is ',
  gatedStrong: 'by invitation',
  gatedMid: ' at the moment. ',
  gatedLink: 'Ask for one',
  gatedTail: '.',
  waitlistLink: 'Ask for an invitation',
  waitlistTail: 'and we’ll be in touch.',
  noAccount: 'No account yet?',
  createOne: 'Create one',
  haveAccount: 'Already registered?',
  signInLink: 'Sign in',
  termsLead: 'By creating an account you agree to our ',
  termsLink: 'Terms of Use',
  termsMid: ' and confirm you have read the ',
  termsPrivacyLink: 'Privacy Policy',
  termsTail: '.',
  linkErrors: {
    invalid_link: 'That link was malformed. Request a new one below.',
    expired_link: 'That link has expired or was already used. Request a new one below.',
    oauth_cancelled: 'Sign-in was cancelled.',
    oauth_failed: 'That provider could not sign you in. Try again, or use email below.',
  },
}

export const AUTH_DE: AuthDict = {
  signInTitle: 'Anmelden',
  signUpTitle: 'Konto anlegen',
  blurbSignIn: 'Ihre Räume sind da, wo Sie sie gelassen haben.',
  blurbSignUp: 'Kostenlos, mit einem eigenen Raum dazu.',
  google: 'Weiter mit Google',
  or: 'oder',
  emailLabel: 'E-Mail',
  passwordLabel: 'Passwort',
  methodLabel: 'Anmeldeverfahren',
  methodPassword: 'Passwort',
  methodMagic: 'E-Mail-Link',
  signIn: 'Anmelden',
  signingIn: 'Wird angemeldet…',
  createAccount: 'Konto anlegen',
  creating: 'Wird angelegt…',
  magicSubmit: 'Link per E-Mail schicken',
  magicSending: 'Wird gesendet…',
  magicNoteGated:
    'Der Link meldet Sie an. Solange die Anmeldung über Einladungen läuft, funktioniert er nur für ein bereits bestehendes Konto oder für eine Einladung an Ihre Adresse.',
  magicNoteOpen:
    'Kein Passwort nötig. Der Link meldet Sie an und legt das Konto an, falls Sie noch keines haben.',
  mailpitLead: 'Läuft lokal? Die Mail verlässt Ihren Rechner nicht – öffnen Sie ',
  mailpitLink: 'Mailpit',
  mailpitTail: ', um den Link anzuklicken.',
  keepTitle: 'Angemeldet bleiben',
  keepNote:
    'Auf einem gemeinsam genutzten Rechner abwählen — Sie werden dann abgemeldet, sobald der Browser schließt.',
  invitedTitle: 'Sie haben eine Einladung.',
  invitedBody: 'Schließen Sie die Anmeldung unten ab, dann wird sie eingelöst.',
  codeLabel: 'Aktionscode (optional)',
  codeHint: 'Sie haben einen Code? Damit ist der erste Monat frei — ohne Karte.',
  codeApplied:
    'Ihr Code liegt bereit. Legen Sie das Konto an, dann startet der Gratismonat.',
  offerDays: '{n} Tage {tier}, gratis',
  offerForever: '{tier}, gratis, ohne Ende',
  offerBucks: 'plus {n} Bucks für Skins',
  offerVouchers: 'plus {n} Gutscheincodes zum Weitergeben',
  offerCoins: 'plus {n} Coins',
  offerNote: 'Ohne Karte, und am Ende wird nichts abgebucht.',
  offerSpaces: 'Gilt für {n} Ihrer Räume.',
  offerRemaining: 'noch {n}',
  offerCloses: 'Bis {date}',
  offerUse: 'Nehmen',
  offerApplied: 'Übernommen',
  gatedLead: 'Die Anmeldung läuft zurzeit ',
  gatedStrong: 'über Einladungen',
  gatedMid: '. ',
  gatedLink: 'Fragen Sie eine an',
  gatedTail: '.',
  waitlistLink: 'Einladung anfragen',
  waitlistTail: 'und wir melden uns.',
  noAccount: 'Noch kein Konto?',
  createOne: 'Jetzt anlegen',
  haveAccount: 'Schon registriert?',
  signInLink: 'Anmelden',
  termsLead: 'Mit dem Anlegen eines Kontos akzeptieren Sie unsere ',
  termsLink: 'Nutzungsbedingungen',
  termsMid: ' und bestätigen, die ',
  termsPrivacyLink: 'Datenschutzerklärung',
  termsTail: ' gelesen zu haben.',
  linkErrors: {
    invalid_link: 'Dieser Link war fehlerhaft. Fordern Sie unten einen neuen an.',
    expired_link:
      'Dieser Link ist abgelaufen oder wurde bereits verwendet. Fordern Sie unten einen neuen an.',
    oauth_cancelled: 'Die Anmeldung wurde abgebrochen.',
    oauth_failed:
      'Dieser Anbieter konnte Sie nicht anmelden. Versuchen Sie es erneut, oder nehmen Sie unten E-Mail.',
  },
}

/**
 * Public copy, so English and German and nothing else. The selector still takes
 * any `Locale`, because its callers hold whatever language the reader has set
 * the app to; Bulgarian arrives here and reads the English form. See
 * `PublicLocale` in `@/domain/i18n/locale`.
 */
const DICTS: Record<PublicLocale, AuthDict> = { en: AUTH_EN, de: AUTH_DE }

export function authDict(locale: Locale): AuthDict {
  return DICTS[publicLocale(locale)]
}

/**
 * The four messages the auth actions themselves return.
 *
 * Kept beside the form's dictionary rather than in the domain, because they are
 * the same conversation - and separated into their own export so a server
 * action can import them without pulling the whole UI dictionary with it.
 */
export const AUTH_REPLIES = {
  en: {
    badCredentials: 'Invalid email or password',
    confirmEmail: 'Check your email to confirm your account.',
    /** `{email}` is the address the link went to. */
    magicSent: 'Check {email} for a sign-in link.',
    invitationOnly: 'Sign-up is by invitation at the moment.',
  },
  de: {
    badCredentials: 'E-Mail-Adresse oder Passwort stimmt nicht',
    confirmEmail: 'Bitte bestätigen Sie Ihr Konto über die E-Mail, die wir geschickt haben.',
    magicSent: 'Schauen Sie in {email} nach dem Anmeldelink.',
    invitationOnly: 'Die Anmeldung läuft zurzeit über Einladungen.',
  },
} as const satisfies Record<PublicLocale, Record<string, string>>
