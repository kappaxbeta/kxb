/**
 * The client-side half of a ban, and an honest account of what it is worth.
 *
 * Lives under `src/app` rather than `src/domain`, and the lint rule that
 * insists on it is right: this is browser storage, which is a detail of how a
 * page behaves rather than a rule about the product. The durable half of a ban
 * is `tenant_bans`, and that one *is* domain.
 *
 * ----------------------------------------------------------------------------
 * This is friction, not a boundary
 * ----------------------------------------------------------------------------
 * A marker in `localStorage` is cleared by clearing site data, sidestepped by a
 * private window, and absent in a different browser. Anybody who wants past it
 * gets past it in about fifteen seconds.
 *
 * It is still worth having, because it answers the common case rather than the
 * adversarial one. The person removed from an event at 2am is usually annoyed,
 * not determined - they click the link again out of reflex, and this is what
 * makes the second click say "you were removed from this event" instead of
 * quietly minting them a fresh anonymous identity and putting them back in the
 * room. That is a real reduction in how often an admin has to press the button
 * twice.
 *
 * What it must never be is the thing anybody *relies* on. The durable half is
 * `tenant_bans` in the database, keyed to the identity that was banned, and the
 * only control that stops a determined person is revoking the link - which
 * ejects everybody it admitted and is a deliberate, visible act. Every piece of
 * copy in the UI says so.
 *
 * Kept deliberately dumb: no expiry, no signature, no obfuscation. Signing it
 * would imply a guarantee it cannot make, and an admin reading this file should
 * be able to see in ten seconds exactly how much it is worth.
 */

const KEY = 'kxb.removed'

interface Removal {
  /** Which space they were removed from. */
  slug: string
  /** When, so the message can say "earlier today" rather than nothing. */
  at: string
}

function read(): Removal[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Removal[]) : []
  } catch {
    // Corrupt, full, or disabled entirely - Safari's private mode throws on
    // write. None of those are errors worth surfacing for a hint.
    return []
  }
}

/** Remember that this browser was removed from a space. */
export function rememberRemoval(slug: string): void {
  if (typeof window === 'undefined') return
  try {
    const next = [
      ...read().filter((entry) => entry.slug !== slug),
      { slug, at: new Date().toISOString() },
    ].slice(-20)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // See above. A failure here costs a hint, nothing more.
  }
}

/** Was this browser removed from this space? */
export function wasRemovedFrom(slug: string): Removal | null {
  return read().find((entry) => entry.slug === slug) ?? null
}

/**
 * Forget a removal.
 *
 * Exists because an admin who removed somebody by mistake needs a sentence to
 * give them - "clear your site data and use the link again" is that sentence,
 * and this is what the door calls once the database no longer has a ban.
 */
export function forgetRemoval(slug: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(read().filter((entry) => entry.slug !== slug)),
    )
  } catch {
    /* nothing to do */
  }
}
