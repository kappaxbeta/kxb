import { randomBytes } from 'node:crypto'
import { normaliseCode } from '@/domain/promo/application'

/**
 * Making up a code.
 *
 * Its own file purely because of the import above. `application.ts` is reached
 * from Client Components - the sign-up field and the redeem box both normalise
 * what somebody typed - and a `node:crypto` import anywhere in that module's
 * graph either drags the polyfill into the browser bundle or fails the build.
 * The same split, for the same reason, as `analytics/campaign.ts` next to
 * `analytics/track.ts`.
 *
 * Deliberately *not* marked `server-only`: nothing here touches a request, a
 * secret or a database, and the marker would only stop the tests importing it.
 * What keeps it off the client is that the one caller is a backoffice action.
 */

/**
 * The alphabet, minus the characters people get wrong.
 *
 * No O, I, L, 0 or 1. Those are the pairs that go astray when a code is copied
 * off a screen into a phone or read out over a noisy room, and a code that is
 * routinely mistyped is a campaign that under-reports itself.
 */
const MINT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * A fresh code for the backoffice to suggest.
 *
 * Eight characters from a 31-symbol alphabet is around 40 bits, far more than
 * guessing resistance needs here - a promo code is printed on things, so it is
 * not a secret, and `max_uses` is what actually bounds the damage of one
 * leaking. The length and the hyphen are chosen for reading aloud.
 */
export function mintPromoCode(prefix = ''): string {
  const bytes = randomBytes(8)
  let body = ''
  for (const byte of bytes) body += MINT_ALPHABET[byte % MINT_ALPHABET.length]

  /**
   * The prefix is clipped *before* it is validated, not after the code is
   * assembled.
   *
   * Clipping afterwards looks equivalent and is not: an over-long prefix fails
   * `normaliseCode` outright, so the code would come back with no prefix at all
   * rather than a shortened one. A campaign code that silently stopped saying
   * HBF is a campaign whose redemptions get attributed to nothing.
   *
   * 31 leaves room for the hyphen and the eight-character body inside the
   * column's 40.
   */
  const head = normaliseCode(prefix.replace(/\s+/g, '').slice(0, 31))

  return head ? `${head}-${body}` : `${body.slice(0, 4)}-${body.slice(4)}`
}
