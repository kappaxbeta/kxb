import type { Guide } from '../guide'
import type { Text } from '../text'
import { GROWTH } from './growth'
import { LEGAL } from './legal'
import { PROMOTION } from './promotion'
import { STRIPE } from './stripe'

/**
 * The chapters that are true in every country, in reading order.
 *
 * The country guides carry what is national - which office, which form, which
 * threshold. These carry what is not: Stripe is the same dashboard in Vienna
 * and in Berlin, the EU legal shell travels, and the think-before-you-promote
 * list is the same list everywhere even where the statute behind an item
 * differs. Every country guide points into these rather than repeating them,
 * which is what keeps a country guide writable in an evening.
 *
 * Order is the order they become relevant: what to check before promoting,
 * the shell the site needs, then the payment rail.
 */
export interface Chapter {
  /** The URL segment. */
  slug: string
  guide: Text<Guide>
}

export const CHAPTERS: Chapter[] = [
  { slug: 'promotion', guide: PROMOTION },
  { slug: 'legal-shell', guide: LEGAL },
  { slug: 'stripe', guide: STRIPE },
  { slug: 'growth', guide: GROWTH },
]

export function chapterBySlug(slug: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.slug === slug)
}
