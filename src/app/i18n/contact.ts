/**
 * The contact form, its page, and the floating launcher.
 *
 * One dictionary for all three because they are one form: the widget in the
 * root layout, the standalone page a footer link points at, and the fallback
 * somebody gets when the widget's JavaScript never arrives. Copy that drifted
 * between them would be the same complaint answered two different ways.
 */
import { type Locale, publicLocale, type PublicLocale } from '@/domain/i18n/locale'
export interface ContactDict {
  meta: { title: string }
  back: string
  title: string
  intro: string
  legalLead: string
  legalLink: string
  legalTail: string
  widget: { open: string; close: string; dialogTitle: string; dialogIntro: string }
  form: {
    nameLabel: string
    namePlaceholder: string
    emailLabel: string
    emailPlaceholder: string
    phoneLabel: string
    phoneOptional: string
    phonePlaceholder: string
    subjectLabel: string
    subjectPlaceholder: string
    messageLabel: string
    messagePlaceholder: string
    note: string
    sending: string
    submit: string
    sentTitle: string
    sentBody: string
  }
}

export const CONTACT_EN: ContactDict = {
  meta: { title: 'Contact' },
  back: '← Back',
  title: 'Contact',
  intro:
    'Something broken, something missing, or just a question. Leave an address we can answer at, and a phone number only if you want to be called.',
  legalLead: 'Postal address and the rest of the legal details are in the ',
  legalLink: 'Impressum',
  legalTail: '.',
  widget: {
    open: 'Contact',
    close: 'Close',
    dialogTitle: 'Write to us',
    dialogIntro: 'Something broken, something missing, or just a question.',
  },
  form: {
    nameLabel: 'Your name',
    namePlaceholder: 'How should we call you?',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    phoneLabel: 'Phone',
    phoneOptional: '(optional)',
    phonePlaceholder: '+49 …',
    subjectLabel: 'Subject',
    subjectPlaceholder: 'What is this about?',
    messageLabel: 'Message',
    messagePlaceholder: 'Tell us what is going on.',
    note: 'We only use this to answer you.',
    sending: 'Sending…',
    submit: 'Send message',
    sentTitle: 'Message sent.',
    sentBody:
      'We read every one of these. If it needs an answer, it goes to the address you gave us.',
  },
}

export const CONTACT_DE: ContactDict = {
  meta: { title: 'Kontakt' },
  back: '← Zurück',
  title: 'Kontakt',
  intro:
    'Etwas ist kaputt, etwas fehlt, oder Sie haben einfach eine Frage. Hinterlassen Sie eine Adresse, an die wir antworten können – und eine Telefonnummer nur, wenn Sie angerufen werden möchten.',
  legalLead: 'Postanschrift und die übrigen rechtlichen Angaben stehen im ',
  legalLink: 'Impressum',
  legalTail: '.',
  widget: {
    open: 'Kontakt',
    close: 'Schließen',
    dialogTitle: 'Schreiben Sie uns',
    dialogIntro: 'Etwas ist kaputt, etwas fehlt, oder Sie haben einfach eine Frage.',
  },
  form: {
    nameLabel: 'Ihr Name',
    namePlaceholder: 'Wie sollen wir Sie nennen?',
    emailLabel: 'E-Mail',
    emailPlaceholder: 'sie@beispiel.de',
    phoneLabel: 'Telefon',
    phoneOptional: '(optional)',
    phonePlaceholder: '+49 …',
    subjectLabel: 'Betreff',
    subjectPlaceholder: 'Worum geht es?',
    messageLabel: 'Nachricht',
    messagePlaceholder: 'Erzählen Sie uns, was los ist.',
    note: 'Wir verwenden das nur, um Ihnen zu antworten.',
    sending: 'Wird gesendet…',
    submit: 'Nachricht senden',
    sentTitle: 'Nachricht gesendet.',
    sentBody:
      'Wir lesen jede einzelne davon. Wenn sie eine Antwort braucht, geht sie an die Adresse, die Sie uns gegeben haben.',
  },
}

/**
 * Public copy, so English and German and nothing else. The selector still takes
 * any `Locale`, because its callers hold whatever language the reader has set
 * the app to; Bulgarian arrives here and reads the English page. See
 * `PublicLocale` in `@/domain/i18n/locale`.
 */
const DICTS: Record<PublicLocale, ContactDict> = { en: CONTACT_EN, de: CONTACT_DE }

export function contactDict(locale: Locale): ContactDict {
  return DICTS[publicLocale(locale)]
}
