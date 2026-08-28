import { describe, expect, test } from 'bun:test'
import type { XpDocument } from '@kxb/xp'
import type { Scripts } from '@kxb/xp/script'
import { scriptState } from '@/app/xp/_runtime/hud/hud'

/**
 * What the HUD says about the scripts.
 *
 * The readout somebody checks when their script does nothing, which makes a
 * wrong answer here more expensive than a wrong answer almost anywhere else on
 * the HUD: it is the line that sends them looking at the engine instead of at
 * their own document.
 */

/** Enough of a document for this one function. */
function doc(
  scripts: Record<string, string>,
  blueprints: Record<string, { script?: string }>,
): XpDocument {
  return { scripts, blueprints } as unknown as XpDocument
}

/** The opened sandbox, which this function only ever tests for presence. */
const OPEN = {} as Scripts

describe('scriptState', () => {
  test('a document with no scripts says so', () => {
    expect(scriptState(doc({}, { Gun: {} }), OPEN, [])).toBe('no scripts')
  })

  test('a script attached to nothing is not "running"', () => {
    // The bug this file was written for: `NO_SCRIPTS` is truthy, so a level
    // with one unattached script reported "1 scripts running" while the engine
    // had compiled nothing at all.
    expect(scriptState(doc({ test: '' }, { Gun: {} }), OPEN, [])).toBe('1 scripts · none attached')
  })

  test('attached and open is running', () => {
    expect(scriptState(doc({ test: '' }, { Gun: { script: 'test' } }), OPEN, [])).toBe(
      '1 scripts running',
    )
  })

  test('some attached, some not, shows the fraction', () => {
    const document = doc(
      { patrol: '', orbit: '', spare: '' },
      { block: { script: 'patrol' }, coin: { script: 'orbit' } },
    )
    expect(scriptState(document, OPEN, [])).toBe('2/3 scripts running')
  })

  test('two blueprints running one script counts the script once', () => {
    const document = doc({ patrol: '' }, { a: { script: 'patrol' }, b: { script: 'patrol' } })
    expect(scriptState(document, OPEN, [])).toBe('1 scripts running')
  })

  test('attached but the sandbox has not arrived is loading', () => {
    expect(scriptState(doc({ test: '' }, { Gun: { script: 'test' } }), null, [])).toBe(
      '1 scripts loading',
    )
  })

  test('broken beats everything, because it is the thing to fix', () => {
    expect(scriptState(doc({ test: '' }, { Gun: {} }), null, ['nope'])).toBe('1 scripts · 1 broken')
  })
})
