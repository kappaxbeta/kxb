import { localeFromPath, publicLocale, type PublicLocale } from '@/domain/i18n/locale'

/**
 * What a rejected enquiry says back, in the language it was sent in.
 *
 * The locale is read off the `path` field the forms already submit, which is
 * the one piece of the request that knows which page the person was standing
 * on. No new hidden field, and nothing for the proxy to forward.
 *
 * Scope worth stating: these are the failures a visitor can actually reach -
 * the throttle and a database write that did not land. The per-field messages
 * come from zod's own defaults and are still English. They are close to
 * unreachable in practice, because every field in both forms is `required` and
 * the browser refuses the submit first; you would have to be running without
 * JavaScript *and* defeat native validation to see one. Translating them means
 * giving both schemas a locale, which is a bigger change than it is worth until
 * somebody reports having seen one.
 */
const REPLIES = {
  en: {
    throttled: 'That is a few messages in a row — give us a moment to read them.',
    failed: 'Could not send that: ',
    rejectedMessage: 'That message cannot be sent',
    rejectedEnquiry: 'That enquiry cannot be sent',
  },
  de: {
    throttled: 'Das sind ein paar Nachrichten hintereinander — geben Sie uns einen Moment zum Lesen.',
    failed: 'Konnte nicht gesendet werden: ',
    rejectedMessage: 'Diese Nachricht kann nicht gesendet werden',
    rejectedEnquiry: 'Diese Anfrage kann nicht gesendet werden',
  },
} as const satisfies Record<PublicLocale, Record<string, string>>

export function repliesFor(path: string | null | undefined) {
  // Both forms live on public pages, so the path can only ever name a public
  // locale; the narrowing is here so that stays true if one is ever mounted
  // somewhere an app language can reach it.
  return REPLIES[publicLocale(localeFromPath(path))]
}
