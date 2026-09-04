/**
 * `og/` - what a link to this site looks like before anybody clicks it.
 *
 * Five `opengraph-image.tsx` routes draw through here, and none of them knows
 * how a card is laid out:
 *
 *   - `assets.ts`  - the fonts and pictures, read off disk once.
 *   - `art.tsx`    - the right-hand half: one render, or the channel's mark.
 *   - `card.tsx`   - the frame, and the only place that talks to satori.
 *   - `words.ts`   - the few strings a card says in its own right, per language.
 *
 * A sixth card is a route file, a line in `art.tsx` if it wants a new picture,
 * and nothing else.
 */
export { scene, universeMark } from '@/app/og/art'
export { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/app/og/card'
export type { CardSpec } from '@/app/og/card'
export { ogWords } from '@/app/og/words'
export type { OgWords } from '@/app/og/words'
