/**
 * The two facts both language versions of the terms need to agree on.
 *
 * `TERMS_UPDATED` is the "Stand" line. It is not decoration: § 8 of the terms
 * promises that a change is announced before it takes effect, and the date is
 * how somebody checks whether the version they agreed to is the version they
 * are reading. Move it when the wording changes in substance, not when a typo
 * is fixed.
 *
 * `MIN_AGE` is 16 because that is the age from which a person can consent to an
 * information society service on their own under Art. 8 DSGVO as Germany has
 * enacted it. Below it, the parents would have to agree, and this service has
 * no way to collect or check that - so the honest answer is a floor rather than
 * a consent flow that nobody would complete truthfully.
 */
export const TERMS_UPDATED = {
  de: '6. August 2026',
  en: '6 August 2026',
} as const

export const MIN_AGE = 16
