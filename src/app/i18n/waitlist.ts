/**
 * The queue, in one place per language.
 *
 * This page has two faces - the door is open, or it is not - and both are here.
 * They are not variants of one sentence: "no waiting list at the moment, go and
 * sign up" and "leave your address" are opposite instructions, and translating
 * only one of them is how a German visitor gets told to queue for a door that
 * is standing open.
 */
import { type Locale, publicLocale, type PublicLocale } from '@/domain/i18n/locale'
export interface WaitlistDict {
  openTitle: string
  closedTitle: string
  openBody: string
  openCta: string
  closedBody: string
  invalidInvite: string
  haveAccount: string
  signIn: string
  form: {
    emailLabel: string
    nameLabel: string
    noteLabel: string
    optional: string
    newsletter: string
    newsletterNote: string
    submit: string
    submitting: string
    privacyLead: string
    privacyLink: string
    privacyTail: string
    listedTitle: string
    listedBody: string
    listedBack: string
  }
}

export const WAITLIST_EN: WaitlistDict = {
  openTitle: 'Registration is open',
  closedTitle: 'Ask for an invitation',
  openBody: 'No waiting list at the moment. You can create an account right now.',
  openCta: 'Create an account',
  closedBody:
    'Sign-up is by invitation at the moment. Leave your address and we’ll send you one when a place opens up.',
  invalidInvite:
    'That invitation link is not valid any more. Leave your address below and we’ll send a new one.',
  haveAccount: 'Already have an account?',
  signIn: 'Sign in',
  form: {
    emailLabel: 'Email',
    nameLabel: 'What should we call you?',
    noteLabel: 'What would you use it for?',
    optional: '(optional)',
    newsletter: 'Send me occasional news and updates by email.',
    newsletterNote:
      'Optional, and separate from your place on the list. Leaving it unticked does not affect your application. We record the time and IP address of this choice as proof of consent, and you can withdraw it at any time.',
    submit: 'Ask for an invitation',
    submitting: 'Adding you…',
    privacyLead:
      'We only use your address to answer your application and, if you asked for it, to send news. See our ',
    privacyLink: 'privacy notice',
    privacyTail: '.',
    listedTitle: 'You’re on the list.',
    listedBody:
      'We’ll email you an invitation when a place opens up. There’s nothing else to do.',
    listedBack: 'Back to the front page',
  },
}

export const WAITLIST_DE: WaitlistDict = {
  openTitle: 'Die Registrierung ist offen',
  closedTitle: 'Einladung anfragen',
  openBody: 'Zurzeit gibt es keine Warteliste. Sie können sofort ein Konto anlegen.',
  openCta: 'Konto anlegen',
  closedBody:
    'Die Anmeldung läuft zurzeit über Einladungen. Hinterlassen Sie Ihre Adresse, und wir schicken Ihnen eine, sobald ein Platz frei wird.',
  invalidInvite:
    'Dieser Einladungslink ist nicht mehr gültig. Hinterlassen Sie unten Ihre Adresse, und wir schicken einen neuen.',
  haveAccount: 'Sie haben schon ein Konto?',
  signIn: 'Anmelden',
  form: {
    emailLabel: 'E-Mail',
    nameLabel: 'Wie sollen wir Sie nennen?',
    noteLabel: 'Wofür würden Sie es nutzen?',
    optional: '(optional)',
    newsletter: 'Schicken Sie mir gelegentlich Neuigkeiten per E-Mail.',
    newsletterNote:
      'Optional und unabhängig von Ihrem Platz auf der Liste. Wenn Sie das Häkchen weglassen, ändert das nichts an Ihrer Anfrage. Wir speichern Zeitpunkt und IP-Adresse dieser Entscheidung als Einwilligungsnachweis; Sie können sie jederzeit widerrufen.',
    submit: 'Einladung anfragen',
    submitting: 'Sie werden eingetragen…',
    privacyLead:
      'Wir verwenden Ihre Adresse nur, um Ihre Anfrage zu beantworten, und – falls Sie darum gebeten haben – um Neuigkeiten zu schicken. Siehe unsere ',
    privacyLink: 'Datenschutzerklärung',
    privacyTail: '.',
    listedTitle: 'Sie stehen auf der Liste.',
    listedBody:
      'Wir schicken Ihnen eine Einladung per E-Mail, sobald ein Platz frei wird. Sonst ist nichts zu tun.',
    listedBack: 'Zurück zur Startseite',
  },
}

/**
 * Public copy, so English and German and nothing else. The selector still takes
 * any `Locale`, because its callers hold whatever language the reader has set
 * the app to; Bulgarian arrives here and reads the English page. See
 * `PublicLocale` in `@/domain/i18n/locale`.
 */
const DICTS: Record<PublicLocale, WaitlistDict> = { en: WAITLIST_EN, de: WAITLIST_DE }

export function waitlistDict(locale: Locale): WaitlistDict {
  return DICTS[publicLocale(locale)]
}
