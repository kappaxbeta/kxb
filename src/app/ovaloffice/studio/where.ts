/**
 * Which studio a link out of a studio leads to.
 *
 * The three editors are shared between the backoffice and a space, and they
 * hand work to each other: a shot offers "this frame as a still", a still
 * offers "animate this" and a way over to the banner studio. Those links were
 * written as `/ovaloffice/studio?…`, which is where the editors happen to live
 * on disk - so somebody working in their space's studio pressed one and landed
 * in the platform backoffice, or, far more often, on the sign-in it redirects
 * to.
 *
 * The two addresses do not have the same shape, which is why this is a
 * function rather than a prefix. The backoffice keeps all three editors on one
 * page and picks between them by which key is in the query string; a space
 * gives each its own segment and uses the key only to carry the document. Both
 * end up carrying it under the same letter, so a link minted here can be
 * pasted into either.
 */

/** The three studios, by the segment a space addresses them with. */
export type StudioKind = 'video' | 'image' | 'hero'

/** The query key each document travels under. Shared by both addresses. */
const KEY: Record<StudioKind, string> = { video: 'v', image: 's', hero: 'h' }

/**
 * @param kind Which editor to open.
 * @param slug The space this editor is mounted in, or undefined in the backoffice.
 * @param document The encoded document to carry across. Empty opens it blank -
 *   which is still a key, and the backoffice needs the key present to choose.
 */
export function studioHref(kind: StudioKind, slug: string | undefined, document = ''): string {
  const query = `?${KEY[kind]}=${document}`
  return slug === undefined
    ? `/ovaloffice/studio${query}`
    : `/t/${slug}/studio/${kind}${query}`
}
