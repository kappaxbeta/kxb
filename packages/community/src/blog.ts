import type { Section } from './guide'
import { POST_BATTLE_FROM_THE_CHAT } from './posts/battle-from-the-chat'
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
 * This list was empty on purpose until there was something real to say - the
 * first drafts were pulled, and the index said "coming soon" rather than
 * padding itself. `/battle` is the something: a post is one entry here,
 * nothing else, newest handled by the sort in `blogIndex`.
 */
export const BLOG: BlogEntry[] = [
  { slug: 'battle-from-the-chat', post: POST_BATTLE_FROM_THE_CHAT },
]

export function blogBySlug(slug: string): BlogEntry | undefined {
  return BLOG.find((entry) => entry.slug === slug)
}

/** Newest first, resolved for one language - what the blog index renders. */
export function blogIndex(lang: Lang) {
  return [...BLOG]
    .map((entry) => ({ slug: entry.slug, ...pick(entry.post, lang) }))
    .sort((a, b) => (a.doc.date < b.doc.date ? 1 : -1))
}
