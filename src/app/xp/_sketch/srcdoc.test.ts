import { describe, expect, test } from 'bun:test'
import { parseXp } from '@kxb/xp'
import { sketchSrcdoc } from './srcdoc'

/**
 * The container's document, tested at its seam: the containment - what
 * would be an XSS if the armour slipped.
 *
 * Was `sketch.test.ts`, alongside three subjects that have since moved to
 * `packages/xp/src/sketch/` (`protocol.test.ts`, `sdk.test.ts`,
 * `flow-driver.test.ts`) - this file kept the one subject that is still
 * host-specific: `srcdoc.ts` builds a *web* iframe's document, CSP and all,
 * which stays here.
 */

const sketchOf = (files: Record<string, string>, entry = 'main.js') => {
  const parsed = parseXp({
    format: 'xp/1',
    id: 'probe',
    name: 'Probe',
    capabilities: [],
    sketch: { engine: 'p5', entry, files },
  })
  if (!parsed.ok) throw new Error('should have parsed')
  return parsed.document.sketch!
}

const ORIGIN = 'https://example.test'

describe('the srcdoc', () => {
  test('a source written to break out of its tag cannot', () => {
    const evil = 'var s = "</script><script>alert(1)</script>"'
    const html = sketchSrcdoc({
      sketch: sketchOf({ 'main.js': evil }),
      origin: ORIGIN,
      me: null,
      keys: [],
    })
    // The raw close tag must not survive anywhere the parser would see one.
    expect(html).not.toContain('</script><script>alert')
    expect(html).toContain('<\\/script>')
  })

  test('the boot config cannot spell a tag either', () => {
    const html = sketchSrcdoc({
      sketch: sketchOf({ 'main.js': '' }),
      origin: ORIGIN,
      me: { id: 'u1', name: '</script><b>' },
      keys: [],
    })
    expect(html).not.toContain('name":"</script>')
  })

  test('every file is there, entry last', () => {
    const html = sketchSrcdoc({
      sketch: sketchOf({ 'main.js': 'MAIN()', 'lib/helper.js': 'HELPER()' }, 'main.js'),
      origin: ORIGIN,
      me: null,
      keys: [],
    })
    expect(html.indexOf('HELPER()')).toBeGreaterThan(-1)
    expect(html.indexOf('MAIN()')).toBeGreaterThan(html.indexOf('HELPER()'))
  })

  test('a shader is carried into the boot, never into a script tag', () => {
    const parsed = parseXp({
      format: 'xp/1',
      id: 'probe',
      name: 'Probe',
      capabilities: [],
      sketch: {
        engine: 'p5',
        entry: 'main.js',
        files: { 'glow.frag': 'GLOW_SOURCE()', 'main.js': 'MAIN()' },
      },
    })
    if (!parsed.ok) throw new Error('should have parsed')
    const html = sketchSrcdoc({ sketch: parsed.document.sketch!, origin: ORIGIN, me: null, keys: [] })
    // In the boot JSON (escaped), not as an executable tag.
    expect(html).not.toContain('<script>/* glow.frag */')
    expect(html).toContain('GLOW_SOURCE()')
  })

  test('the containment headers are present and pinned to the origin', () => {
    const html = sketchSrcdoc({
      sketch: sketchOf({ 'main.js': '' }),
      origin: ORIGIN,
      me: null,
      keys: [],
    })
    expect(html).toContain(`default-src 'none'`)
    expect(html).toContain(`connect-src ${ORIGIN}`)
    expect(html).toContain(`${ORIGIN}/xp/vendor/p5.min.js`)
  })
})
