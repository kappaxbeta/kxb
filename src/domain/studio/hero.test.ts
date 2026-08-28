import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_HERO,
  decodeHero,
  encodeHero,
  heroBlocks,
  heroShapes,
  heroStars,
  imageBox,
  isSessionImage,
  logoBox,
  parseHero,
  type StudioHero,
  textBox,
} from '@/domain/studio/hero'

const hero = (patch: Partial<StudioHero> = {}): StudioHero => ({ ...DEFAULT_HERO, ...patch })

describe('the link', () => {
  test('round-trips a composition', () => {
    const composed = hero({
      seed: 12345,
      layout: 'text-right',
      text: { ...DEFAULT_HERO.text, headline: 'Bring the crew', accent: 'now.' },
      image: { src: '/xo/scenes/crew.webp', x: 30, y: 48, scale: 0.4, rotation: -4, float: 2, shadow: true },
    })
    expect(decodeHero(encodeHero(composed))).toEqual(composed)
  })

  test('a truncated link opens the default hero rather than throwing', () => {
    const encoded = encodeHero(hero({ seed: 4 }))
    expect(decodeHero(encoded.slice(0, encoded.length - 12))).toEqual(DEFAULT_HERO)
    expect(decodeHero('not base64 at all')).toEqual(DEFAULT_HERO)
    expect(decodeHero(undefined)).toEqual(DEFAULT_HERO)
  })

  test('drops an imported file, which cannot travel', () => {
    const imported = hero({
      image: { src: 'blob:http://localhost/abc', x: 70, y: 50, scale: 0.3, rotation: 0, float: 1, shadow: false },
    })
    expect(isSessionImage(imported)).toBe(true)
    expect(decodeHero(encodeHero(imported)).image).toBeNull()
  })
})

describe('parsing what a hand-edited link may contain', () => {
  test('clamps numbers instead of trusting them', () => {
    const parsed = parseHero({
      width: 99_999,
      height: -3,
      seed: 1e12,
      blocks: { count: 500, scale: 40 },
      sky: { stars: 9000 },
      motion: { fps: 900, duration: 0 },
    })
    expect(parsed.width).toBe(4096)
    expect(parsed.height).toBe(240)
    expect(parsed.seed).toBe(999_999)
    expect(parsed.blocks.count).toBe(30)
    expect(parsed.sky.stars).toBe(400)
    expect(parsed.motion.fps).toBe(60)
    expect(parsed.motion.duration).toBe(1)
  })

  test('keeps a headline whatever else is wrong', () => {
    expect(parseHero({ text: { headline: '   ' } }).text.headline).toBe(DEFAULT_HERO.text.headline)
    expect(parseHero({ text: { headline: 42 } }).text.headline).toBe(DEFAULT_HERO.text.headline)
  })

  test('drops a block name with no render behind it', () => {
    expect(parseHero({ blocks: { models: ['chest', 'not_a_block', 7] } }).blocks.models).toEqual([
      'chest',
    ])
  })

  test('drops a picture source it will not fetch', () => {
    const src = (value: unknown) => parseHero({ image: { src: value } }).image
    expect(src('javascript:alert(1)')).toBeNull()
    expect(src('data:image/png;base64,AAAA')).toBeNull()
    expect(src('http://example.com/a.png')).toBeNull()
    expect(src('/xo/scenes/crew.webp')?.src).toBe('/xo/scenes/crew.webp')
    expect(src('https://example.com/a.png')?.src).toBe('https://example.com/a.png')
  })

  test('an absent button is the default pair and an explicit null is off', () => {
    expect(parseHero({}).cta).toEqual(DEFAULT_HERO.cta)
    expect(parseHero({ cta: null }).cta).toBeNull()
    // A pill with no words on it is not a button.
    expect(parseHero({ cta: { label: '  ' } }).cta).toBeNull()
    expect(parseHero({ cta: { label: 'Go', secondary: '' } }).cta?.secondary).toBeNull()
  })

  test('an absent logo is the default one and an explicit null is off', () => {
    // A link written before the field existed has no `logo` key at all, and it
    // has to open with the lockup on it — otherwise adding the field silently
    // stripped the brand off every composition anybody had bookmarked.
    expect(parseHero({}).logo).toEqual(DEFAULT_HERO.logo)
    expect(parseHero({ logo: null }).logo).toBeNull()
    expect(parseHero({ logo: { src: 'javascript:x' } }).logo).toBeNull()
    expect(parseHero({ logo: { src: '/lockup.png', corner: 'middle' } })?.logo?.corner).toBe(
      'top-left',
    )
  })

  test('an unknown layout or entrance falls back rather than reaching the painter', () => {
    expect(parseHero({ layout: 'diagonal' }).layout).toBe(DEFAULT_HERO.layout)
    expect(parseHero({ motion: { entrance: 'explode' } }).motion.entrance).toBe(
      DEFAULT_HERO.motion.entrance,
    )
  })
})

describe('the arrangement', () => {
  test('is the same every time for the same seed', () => {
    expect(heroBlocks(hero({ seed: 99 }))).toEqual(heroBlocks(hero({ seed: 99 })))
    expect(heroStars(hero({ seed: 99 }))).toEqual(heroStars(hero({ seed: 99 })))
  })

  test('a reroll actually moves things', () => {
    const a = heroBlocks(hero({ seed: 1 }))
    const b = heroBlocks(hero({ seed: 2 }))
    expect(a.map((block) => `${block.x},${block.y}`)).not.toEqual(
      b.map((block) => `${block.x},${block.y}`),
    )
  })

  test('nothing is placed on the copy', () => {
    for (const layout of ['centred', 'text-left', 'text-right'] as const) {
      for (let seed = 0; seed < 40; seed += 1) {
        const composed = hero({ layout, seed, blocks: { ...DEFAULT_HERO.blocks, count: 30 } })
        const box = textBox(composed)
        for (const block of [...heroBlocks(composed), ...heroShapes(composed)]) {
          const inside =
            block.x > box.x && block.x < box.x + box.w && block.y > box.y && block.y < box.y + box.h
          expect(inside).toBe(false)
        }
      }
    }
  })

  test('nothing is placed on the lockup, in any corner', () => {
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      for (let seed = 0; seed < 25; seed += 1) {
        const composed = hero({
          seed,
          logo: { src: '/lockup.png', corner, scale: 0.14, margin: 3.5, opacity: 1 },
          blocks: { ...DEFAULT_HERO.blocks, count: 12 },
        })
        const box = logoBox(composed)
        expect(box).not.toBeNull()
        for (const block of [...heroBlocks(composed), ...heroShapes(composed)]) {
          const inside =
            box !== null &&
            block.x > box.x &&
            block.x < box.x + box.w &&
            block.y > box.y &&
            block.y < box.y + box.h
          expect(inside).toBe(false)
        }
      }
    }
  })

  test('nothing is placed on the picture', () => {
    const composed = hero({
      seed: 5,
      blocks: { ...DEFAULT_HERO.blocks, count: 8 },
      image: { src: '/xo/scenes/crew.webp', x: 74, y: 52, scale: 0.34, rotation: 0, float: 1, shadow: true },
    })
    const box = imageBox(composed)
    expect(box).not.toBeNull()
    for (const block of heroBlocks(composed)) {
      const inside =
        box !== null &&
        block.x > box.x &&
        block.x < box.x + box.w &&
        block.y > box.y &&
        block.y < box.y + box.h
      expect(inside).toBe(false)
    }
  })

  test('asks for no more blocks than the copy leaves room for', () => {
    // A full-width centred column and thirty blocks: fewer than thirty come
    // back, because the copy is a hard keep-out and there is nowhere else.
    const crowded = hero({ layout: 'centred', blocks: { ...DEFAULT_HERO.blocks, count: 30 } })
    expect(heroBlocks(crowded).length).toBeLessThan(30)
    expect(heroBlocks(crowded).length).toBeGreaterThan(0)
  })

  test('a picture over every free cell still gets its blocks, behind it', () => {
    // The picture is a soft constraint — see `ranked`. Answering a request for
    // eight blocks with none, because a big render happens to cover the frame,
    // is worse than eight blocks nobody can see.
    const covered = hero({
      layout: 'centred',
      blocks: { ...DEFAULT_HERO.blocks, count: 8 },
      image: { src: '/a.png', x: 50, y: 80, scale: 1.5, rotation: 0, float: 0, shadow: false },
    })
    expect(heroBlocks(covered).length).toBe(8)
  })

  test('only draws blocks from the chosen pool', () => {
    const narrowed = hero({ blocks: { ...DEFAULT_HERO.blocks, models: ['chest', 'lava'] } })
    for (const block of heroBlocks(narrowed)) {
      expect(['chest', 'lava']).toContain(block.model)
    }
  })

  test('changing the block count leaves the stars where they were', () => {
    const few = heroStars(hero({ blocks: { ...DEFAULT_HERO.blocks, count: 2 } }))
    const many = heroStars(hero({ blocks: { ...DEFAULT_HERO.blocks, count: 20 } }))
    expect(few).toEqual(many)
  })
})
