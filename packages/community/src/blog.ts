import type { Section } from './guide'
import { pick, type Lang, type Text } from './text'

/**
 * The community blog.
 *
 * Posts are the same section vocabulary the guides use - a post is mostly
 * prose, but nothing stops one carrying a steps or sources section, and the
 * renderer already knows every shape. What a post adds over a guide is a date
 * that means "published" rather than "checked", and an ordering: the blog
 * index lists newest first.
 *
 * Same `Text<>` language rule as everywhere: a whole post per language,
 * English required, and the page admits a fallback rather than hiding it.
 */
export interface BlogPost {
  title: string
  /** ISO date of publication. */
  date: string
  /** One sentence under the title, and the whole preview on the index. */
  standfirst: string
  sections: Section[]
}

export interface BlogEntry {
  /** The URL segment under /community/blog/. */
  slug: string
  post: Text<BlogPost>
}

/**
 * Empty on purpose: the first posts were drafted and then pulled - the blog
 * launches when there is something real to say, and until then the index
 * says "coming soon" rather than padding itself. The machinery above stays
 * so a post is one entry here, nothing else.
 */
export const BLOG: BlogEntry[] = []

export function blogBySlug(slug: string): BlogEntry | undefined {
  return BLOG.find((entry) => entry.slug === slug)
}

/** Newest first, resolved for one language - what the blog index renders. */
export function blogIndex(lang: Lang) {
  return [...BLOG]
    .map((entry) => ({ slug: entry.slug, ...pick(entry.post, lang) }))
    .sort((a, b) => (a.doc.date < b.doc.date ? 1 : -1))
}
