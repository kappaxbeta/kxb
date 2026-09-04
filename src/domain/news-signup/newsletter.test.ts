import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { BACKOFFICE_SECTIONS } from '@/domain/backoffice/sections'
import { CONSENT, SIGNUP_COPY } from '@/domain/news-signup/consent'
import { LOCALES } from '@/domain/i18n/locale'

/**
 * The signup's promises - the legal ones as much as the mechanical ones.
 *
 * Most of what matters here cannot be checked by rendering: that the server
 * writes its own wording rather than the client's, that a duplicate does not
 * announce itself, that nothing is sendable before it is confirmed. Those are
 * decisions living in a few lines each, and a few lines are exactly what gets
 * "simplified" by somebody who does not know why they are there.
 */

const ACTION = readFileSync('src/domain/news-signup/actions.ts', 'utf8')
const MIGRATION = readFileSync(
  'supabase/migrations/20270210000000_somewhere_to_write_your_address.sql',
  'utf8',
)

describe('consent', () => {
  test('every language the site speaks has a sentence to agree to', () => {
    for (const locale of LOCALES) {
      expect(CONSENT[locale].length).toBeGreaterThan(60)
      expect(SIGNUP_COPY[locale].submit.length).toBeGreaterThan(0)
    }
  })

  test('each one says it can be withdrawn, which is the half people forget', () => {
    expect(CONSENT.en).toMatch(/withdraw|unsubscribe/i)
    expect(CONSENT.de).toMatch(/widerrufen|abmelden|Abmeldelink/i)
    expect(CONSENT.bg).toMatch(/оттегл|отпис/i)
  })

  test('the server writes the wording, never the request', () => {
    // A consent record saying whatever the signer's browser claimed is
    // worthless in the argument it exists to settle.
    expect(ACTION).toContain('consent_text: CONSENT[locale]')
    expect(ACTION).not.toMatch(/consent_text:\s*(input|parsed)\./)
  })

  test('the box cannot be satisfied by anything but a true', () => {
    // `z.literal(true)` rather than a boolean: "false" is not consent, and
    // neither is a string that happens to be truthy.
    expect(ACTION).toContain('consented: z.literal(true)')
  })
})

describe('what the form refuses to leak', () => {
  test('a duplicate signup gets the same answer as a new one', () => {
    // Otherwise the form is an oracle: type an address, learn whether that
    // person is on the list.
    expect(ACTION).toContain("if (error.code === '23505') return { ok: true }")
  })

  test('nobody but the backoffice can read the table', () => {
    expect(MIGRATION).toContain('news_subscribers_select_admin')
    expect(MIGRATION).not.toMatch(/for select[\s\S]{0,80}to anon/)
  })

  test('anyone may add an address, because requiring an account defeats the point', () => {
    expect(MIGRATION).toMatch(/news_subscribers_insert[\s\S]{0,120}to anon, authenticated/)
  })
})

describe('nothing is sendable until it is confirmed', () => {
  test('the sendable index is the one that says so', () => {
    expect(MIGRATION).toContain('where confirmed_at is not null and unsubscribed_at is null')
  })

  test('a new row starts unconfirmed - there is no default that would skip it', () => {
    expect(MIGRATION).toMatch(/confirmed_at\s+timestamptz,/)
  })
})

describe('the backoffice section', () => {
  const section = BACKOFFICE_SECTIONS.find((s) => s.key === 'newsletter')

  test('is registered, so the page can be granted as well as opened', () => {
    expect(section).toBeDefined()
    expect(section?.path).toBe('/ovaloffice/newsletter')
  })

  test('is delegable - reading a mailing list is not a superadmin-only power', () => {
    expect(section?.superadminOnly).toBeUndefined()
  })
})
