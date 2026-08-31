import type { Guide } from '../guide'
import type { Text } from '../text'
import { MAKING_BOXING } from './boxing'
import { MAKING_MAUMAU } from './maumau'
import { MAKING_P5 } from './p5'

/**
 * The making-of shelf: how the games were actually built.
 *
 * A different genre from the chapters - not "what the law wants" but "what we
 * did and why", written from the packages themselves so every claim is
 * checkable against the code it describes. They live in the handbook because
 * the community edition ships these packages, and somebody about to build a
 * third game deserves the arguments, not just the source.
 */
export interface Making {
  /** The URL segment. */
  slug: string
  guide: Text<Guide>
}

export const MAKING: Making[] = [
  { slug: 'how-we-built-boxing', guide: MAKING_BOXING },
  { slug: 'how-we-built-maumau', guide: MAKING_MAUMAU },
  { slug: 'how-we-built-the-p5-cartridge', guide: MAKING_P5 },
]

export function makingBySlug(slug: string): Making | undefined {
  return MAKING.find((entry) => entry.slug === slug)
}
