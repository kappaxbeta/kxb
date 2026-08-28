import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'bun:test'
import { emailVerified } from '@/domain/profile/email-verification'

/**
 * The banner's whole decision lives in this one function, and every branch of
 * it is a person who either gets nagged or does not. Both ways of being wrong
 * are bad in ways worth pinning down: nagging a guest asks for something they
 * cannot do, and letting an unconfirmed address read as confirmed puts the
 * feature back to doing nothing at all.
 */
function user(over: Partial<User> = {}): User {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
    ...over,
  } as User
}

const identity = (provider: string, email: string) => ({
  identity_id: `id-${provider}`,
  id: `sub-${provider}`,
  user_id: '00000000-0000-0000-0000-000000000000',
  provider,
  identity_data: { email },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: '2026-01-01T00:00:00Z',
})

const markedFor = (email: string) => ({
  provider: 'email',
  providers: ['email'],
  email_verified_for: email,
  email_verified_at: '2026-08-23T12:00:00Z',
})

describe('emailVerified', () => {
  it('never nags a guest', () => {
    // The case the product cares most about: somebody let in through a guest
    // link is anonymous, has no address, and was invited to one room for one
    // afternoon.
    expect(emailVerified(user({ is_anonymous: true }))).toBe(true)
    expect(emailVerified(user({ is_anonymous: true, email: '' }))).toBe(true)
  })

  it('never nags an account with no address to prove', () => {
    expect(emailVerified(user({ email: undefined }))).toBe(true)
    expect(emailVerified(user({ email: '' }))).toBe(true)
  })

  it('is false for an address nobody has ever opened a link at', () => {
    // The default for a password sign-up under autoconfirm: GoTrue has stamped
    // email_confirmed_at, and it means nothing.
    expect(
      emailVerified(
        user({
          email: 'someone@example.com',
          email_confirmed_at: '2026-08-23T12:00:00Z',
          app_metadata: { provider: 'email', providers: ['email'] },
        }),
      ),
    ).toBe(false)
  })

  it('is true once a link to that address has been opened', () => {
    expect(
      emailVerified(
        user({ email: 'someone@example.com', app_metadata: markedFor('someone@example.com') }),
      ),
    ).toBe(true)
  })

  it('ignores case and stray whitespace on both sides', () => {
    // Addresses arrive from a form, from a provider and from our own mark, and
    // only one of those three is under our control.
    expect(
      emailVerified(
        user({ email: 'Someone@Example.com', app_metadata: markedFor(' someone@example.com ') }),
      ),
    ).toBe(true)
  })

  it('goes back to false when the address changes', () => {
    // The reason the mark stores the address rather than a bare boolean: a
    // completed email change has to un-verify the account without anything
    // having to remember to clear a flag.
    expect(
      emailVerified(
        user({ email: 'new@example.com', app_metadata: markedFor('old@example.com') }),
      ),
    ).toBe(false)
  })

  it('trusts an address Google or Apple vouched for', () => {
    // No mark of ours, and still verified: the provider only ever hands over an
    // address it owns, so this also covers every OAuth account that existed
    // before any of this shipped. No backfill.
    expect(
      emailVerified(
        user({
          email: 'someone@gmail.com',
          app_metadata: { provider: 'google', providers: ['google'] },
          identities: [identity('google', 'someone@gmail.com')],
        }),
      ),
    ).toBe(true)
  })

  it('does not trust a federated identity for a different address', () => {
    // An account that signed up with Google and has since been moved to another
    // address has proved nothing about the new one.
    expect(
      emailVerified(
        user({
          email: 'moved@example.com',
          identities: [identity('google', 'original@gmail.com')],
        }),
      ),
    ).toBe(false)
  })

  it('does not treat the email provider itself as proof', () => {
    // `identities` always carries an `email` entry for a password account, and
    // its address always matches. Counting it would make every account verified
    // and the banner would never appear for anybody.
    expect(
      emailVerified(
        user({
          email: 'someone@example.com',
          identities: [identity('email', 'someone@example.com')],
        }),
      ),
    ).toBe(false)
  })
})
