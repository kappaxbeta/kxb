import type { Guide } from './guide'
import { pick, type Text } from './text'

/**
 * The URL a document earns from its own title.
 *
 * `/community/de` used to *be* the Germany guide; now it is Germany's hub,
 * and the guide lives one segment deeper under a slug readers and crawlers
 * can both read: `/community/de/starting-a-business-in-germany`. The slug is
 * derived from the English title on both language routes - one canonical
 * name per document, so the hreflang pair differs only in its prefix and a
 * shared link never lands somewhere else in the other language.
 *
 * Derived rather than stored, so a title edit is a slug change is a build
 * change - visible in the diff, never silently divergent. Titles are treated
 * as stable; renaming one is renaming a URL and should be done knowingly.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    // Strip diacritics: ü → u, so a German word in an English title cannot
    // put a non-ASCII byte in a URL.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The canonical slug of one document: its English title, slugified. */
export function guideSlug(text: Text<Guide>): string {
  return slugify(pick(text, 'en').doc.title)
}
