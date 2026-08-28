/**
 * Who a world is by.
 *
 * One function rather than a ternary on every card, because the answer has a
 * fallback that is easy to get wrong: a space world whose space the reader
 * cannot see comes back with no name (see `attachSpaces`), and the honest thing
 * to print then is "a space" - not an empty string, and certainly not the
 * platform's name, which would credit us with somebody else's work.
 *
 * Free of `server-only`: the builder's panel and the discovery cards both say
 * this, and they are on opposite sides of the wire.
 */

/**
 * What a world built in the backoffice is credited to.
 *
 * The team rather than the person. A world published from /ovaloffice is the
 * product's own furniture, and putting an individual admin's name on it would
 * make a staffing detail into something every visitor reads.
 */
export const PLATFORM_CREDIT = 'the kxb.team team'

export function creditFor(world: {
  origin: 'platform' | 'space'
  spaceName: string | null
}): string {
  if (world.origin === 'platform') return PLATFORM_CREDIT
  return world.spaceName ?? 'a space'
}

/** The short form, for a badge on a card where the sentence is implied. */
export function creditBadge(world: {
  origin: 'platform' | 'space'
  spaceName: string | null
}): string {
  if (world.origin === 'platform') return 'kxb.team'
  return world.spaceName ?? 'a space'
}
