import Image from 'next/image'

/**
 * Voxel blocks and soft shapes drifting through the hero.
 *
 * These are the actual palette — `public/xo/blocks/*.png` is shot straight off
 * the glTF the lounge loads, by `scripts/render-blocks.ts`, on the same camera
 * the in-app block picker uses. So the hero cannot advertise a block you cannot
 * place, which is the rule the peep renders already follow.
 *
 * They are here to answer "what is this?" before the copy gets a chance to. A
 * workspace that is also a voxel world is an odd enough claim that a wall of
 * text about it reads as metaphor; a chest and a lava block floating past the
 * headline read as literal.
 *
 * Decorative, hence `aria-hidden` and the empty alts — the heading says what
 * the product is, and "a render of a crate" is noise to a screen reader.
 */

type Block = {
  model: string
  /** Percent across and down the hero. */
  x: number
  y: number
  /** Relative size, which doubles as depth. */
  scale: number
  /** The neon it is lit by, as an oklch hue. */
  hue: number
  /**
   * Dropped on small screens.
   *
   * At 375px the hero is barely wider than the headline, so a block in the
   * margin is a block on top of a word. The four that survive are the corners.
   */
  small?: boolean
}

/**
 * Ordered roughly back-to-front.
 *
 * Every one of these sits in the outer fifth of the hero and above its bottom
 * third, which is not an aesthetic choice: the headline owns the middle column
 * and the peep crowd owns the floor, and a block that lands on either stops
 * being decoration and starts being clutter.
 */
const BLOCKS: Block[] = [
  { model: 'dirt_with_grass', x: 7, y: 18, scale: 1, hue: 145, small: true },
  { model: 'chest', x: 93, y: 14, scale: 0.95, hue: 55, small: true },
  { model: 'water', x: 21, y: 8, scale: 0.55, hue: 230 },
  { model: 'stone_with_gold', x: 80, y: 29, scale: 0.6, hue: 85 },
  { model: 'melon', x: 15, y: 41, scale: 0.5, hue: 140 },
  { model: 'computer', x: 89, y: 50, scale: 0.78, hue: 200 },
  { model: 'lava', x: 6, y: 57, scale: 0.72, hue: 35, small: true },
  { model: 'gift', x: 95, y: 33, scale: 0.6, hue: 330 },
]

/**
 * Soft shapes drifting between the blocks - the reference's crescent, heart
 * and stars. Pure decoration and drawn in CSS, which is exactly why they are
 * allowed: a crescent moon claims nothing about the product, so it does not
 * have to come off a real asset the way the blocks and peeps do.
 *
 * All four live in the hero's lower half, in the air around the crowd, and that
 * is the same rule the blocks above follow rather than a different one.
 *
 * They used to fill the middle band on the grounds that the blocks stay out of
 * it - but the reason the blocks stay out of it is that the headline and the
 * subline are in it. A crescent at 27%/24% sat inside the counters of "HERE" and
 * the heart at 73%/20% capped the "L" of "PLAY": behind the type rather than
 * over it, so not an overlap so much as a smudge on the two lines the page is
 * actually judged on. Worse at the tablet widths, where the headline runs the
 * full content width and there is no outer column left to hide in.
 *
 * Below the terms line there is no type at any width, so this band is safe
 * everywhere, and the composition is better for it: quiet where the page is
 * read, busy where it is looked at.
 *
 * The x values dodge the two holograms, which stand at roughly 12-27% and
 * 76-89% from 1024px up. These shapes paint at `z-index: -1`, so a shape behind
 * a panel is not a collision, it is a shape that was thrown away.
 */
const SHAPES: { kind: 'crescent' | 'heart' | 'star'; x: number; y: number; hue: number }[] = [
  { kind: 'crescent', x: 5, y: 68, hue: 250 },
  { kind: 'heart', x: 95, y: 70, hue: 350 },
  { kind: 'star', x: 31, y: 88, hue: 90 },
  { kind: 'star', x: 74, y: 72, hue: 200 },
]

export function BlockDrift({
  /**
   * Which blocks drift, and where.
   *
   * The hero's own set by default. The use-case cards pass a shorter one -
   * three blocks in the corners of a card rather than eight around a whole
   * hero - because the arrangement is the only thing that differs between the
   * two, and everything underneath it (the renders, the neon drop-shadows, the
   * tumble that never completes) is the same idea in both places.
   */
  blocks = BLOCKS,
  /** The crescent, heart and stars. Off in the cards, where there is no room. */
  shapes = SHAPES,
  /**
   * Loaded eagerly, as the hero's are.
   *
   * The hero's blocks are above the fold and lazy-loading them makes it
   * assemble itself after the text has already been read. The cards are a long
   * way down the page, where the opposite is true.
   */
  priority = true,
}: {
  blocks?: Block[]
  shapes?: typeof SHAPES
  priority?: boolean
} = {}) {
  return (
    <div className="block-drift" aria-hidden="true">
      {blocks.map((block, i) => (
        <span
          key={block.model}
          className={`drift-block${block.small ? '' : ' drift-block-wide'}`}
          style={
            {
              '--x': `${block.x}%`,
              '--y': `${block.y}%`,
              '--scale': block.scale,
              '--hue': block.hue,
              // Staggered, so the set breathes instead of pulsing in lockstep.
              '--delay': `${(i * 0.83).toFixed(2)}s`,
              '--spin': i % 2 === 0 ? '1' : '-1',
            } as React.CSSProperties
          }
        >
          <Image
            src={`/xo/blocks/${block.model}.png`}
            alt=""
            width={512}
            height={512}
            /**
             * The width these are actually painted at, which is nothing like
             * the width they are stored at.
             *
             * Without this, `next/image` has only the `width` prop to reason
             * from and builds a 1x/2x srcset off it - so a retina visitor was
             * downloading a 1024px render to fill a 7rem hole, eight times,
             * above the fold, with `priority` making sure it happened before
             * anything else on the page. That is most of a megabyte spent on
             * decoration nobody is asked to look at.
             *
             * `.drift-block` is `--scale × 7rem`, and `--scale` never exceeds 1,
             * so 112px is the true ceiling and 72px is the ceiling under `sm`
             * where the rule drops to 4.5rem. Next rounds up to the nearest
             * generated width, which lands on 256px for a 2x screen - a quarter
             * of the pixels and about a tenth of the bytes.
             */
            sizes="(max-width: 640px) 72px, 112px"
            priority={priority}
          />
        </span>
      ))}
      {shapes.map((shape, i) => (
        <span
          key={`${shape.kind}-${shape.x}`}
          className={`deco deco-${shape.kind}`}
          style={
            {
              '--x': `${shape.x}%`,
              '--y': `${shape.y}%`,
              '--hue': shape.hue,
              '--delay': `${(i * 1.7 + 0.6).toFixed(2)}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
