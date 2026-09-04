import type { Locale } from '@/domain/i18n/locale'

/**
 * What somebody is agreeing to, per language - and the only copy of it.
 *
 * Shared by the form that shows the sentence and the action that records it,
 * which is the entire reason this is its own module. The action does *not*
 * take the consent text from the request: a client can send any string it
 * likes, including an empty one, and a consent record that says whatever the
 * signer's browser claimed is worth nothing in the argument it exists to
 * settle. The server writes down what the server shows.
 *
 * Wording chosen for the two things German law actually asks of it: it says
 * what will be sent and who by, and it says the permission can be withdrawn.
 * The link to the privacy policy is rendered next to it by the form rather
 * than being part of the sentence, because a URL inside a stored consent
 * string ages badly.
 */
export const CONSENT: Record<Locale, string> = {
  en: 'Yes, email me news about Project Oasis and kxb.team — new chapters, and the occasional thing we have made. I can withdraw this at any time, and every email has an unsubscribe link.',
  de: 'Ja, schickt mir Neuigkeiten zu Project Oasis und kxb.team per E-Mail — neue Kapitel und gelegentlich etwas, das wir gebaut haben. Ich kann das jederzeit widerrufen, und jede E-Mail enthält einen Abmeldelink.',
  bg: 'Да, изпращайте ми новини за Project Oasis и kxb.team по имейл — нови глави и от време на време по нещо, което сме направили. Мога да оттегля съгласието си по всяко време и всеки имейл съдържа връзка за отписване.',
}

/**
 * The rest of the form's words. Here rather than in `@kxb/xo-universe` because
 * the package is the book and this is the product asking for an address - it
 * would not travel with the story if the story moved out.
 */
export interface SignupCopy {
  heading: string
  blurb: string
  placeholder: string
  submit: string
  privacy: string
  /** Shown after a successful signup, and after a duplicate - see the action. */
  done: string
  errorEmail: string
  errorConsent: string
  errorGeneric: string
  /** The confirmation and unsubscribe landing pages. */
  confirmed: { heading: string; blurb: string }
  unsubscribed: { heading: string; blurb: string }
  unknownToken: { heading: string; blurb: string }
}

export const SIGNUP_COPY: Record<Locale, SignupCopy> = {
  en: {
    heading: 'Get the next chapter',
    blurb: 'Chapters go up as they are ready. Leave an address and we will tell you when the next one is on.',
    placeholder: 'you@example.com',
    submit: 'Keep me posted',
    privacy: 'Privacy policy',
    done: 'Thank you — check your inbox to confirm.',
    errorEmail: 'That does not look like an email address.',
    errorConsent: 'Please tick the box so we know it is alright to write to you.',
    errorGeneric: 'That did not go through. Try again in a moment.',
    confirmed: {
      heading: 'You are on the list',
      blurb: 'We will write when the next chapter is up, and not otherwise. Every email has an unsubscribe link in it.',
    },
    unsubscribed: {
      heading: 'You are off the list',
      blurb: 'No more emails. We keep a record that you had once agreed, because we have to be able to say where an address came from — nothing else.',
    },
    unknownToken: {
      heading: 'That link has expired or was never ours',
      blurb: 'Nothing has changed. If you meant to unsubscribe and this did not work, write to us and we will take the address off by hand.',
    },
  },
  de: {
    heading: 'Das nächste Kapitel bekommen',
    blurb: 'Kapitel erscheinen, wenn sie fertig sind. Lass eine Adresse da, dann sagen wir dir Bescheid, wenn das nächste läuft.',
    placeholder: 'du@beispiel.de',
    submit: 'Haltet mich auf dem Laufenden',
    privacy: 'Datenschutzerklärung',
    done: 'Danke — bestätige bitte noch die E-Mail in deinem Postfach.',
    errorEmail: 'Das sieht nicht nach einer E-Mail-Adresse aus.',
    errorConsent: 'Bitte setz den Haken, damit wir wissen, dass wir dir schreiben dürfen.',
    errorGeneric: 'Das hat nicht geklappt. Versuch es gleich noch einmal.',
    confirmed: {
      heading: 'Du bist dabei',
      blurb: 'Wir schreiben, wenn das nächste Kapitel läuft, und sonst nicht. In jeder E-Mail steht ein Abmeldelink.',
    },
    unsubscribed: {
      heading: 'Du bist abgemeldet',
      blurb: 'Keine E-Mails mehr. Wir behalten den Nachweis, dass du einmal zugestimmt hast, weil wir sagen können müssen, woher eine Adresse stammt — sonst nichts.',
    },
    unknownToken: {
      heading: 'Dieser Link ist abgelaufen oder war nie von uns',
      blurb: 'Es hat sich nichts geändert. Wenn du dich abmelden wolltest und es nicht geklappt hat, schreib uns — wir nehmen die Adresse von Hand raus.',
    },
  },
  bg: {
    heading: 'Получи следващата глава',
    blurb: 'Главите излизат, когато са готови. Остави адрес и ще ти кажем, когато тръгне следващата.',
    placeholder: 'ti@primer.bg',
    submit: 'Дръжте ме в течение',
    privacy: 'Политика за поверителност',
    done: 'Благодарим — потвърди от имейла в пощата си.',
    errorEmail: 'Това не прилича на имейл адрес.',
    errorConsent: 'Моля, сложи отметката, за да знаем, че можем да ти пишем.',
    errorGeneric: 'Не се получи. Опитай пак след малко.',
    confirmed: {
      heading: 'Вече си в списъка',
      blurb: 'Ще пишем, когато излезе следващата глава, и иначе не. Всеки имейл съдържа връзка за отписване.',
    },
    unsubscribed: {
      heading: 'Отписан си',
      blurb: 'Повече имейли няма. Пазим само записа, че някога си се съгласил, защото трябва да можем да кажем откъде идва един адрес — нищо друго.',
    },
    unknownToken: {
      heading: 'Връзката е изтекла или не е наша',
      blurb: 'Нищо не е променено. Ако си искал да се отпишеш и не се получи, пиши ни и ще махнем адреса ръчно.',
    },
  },
}
