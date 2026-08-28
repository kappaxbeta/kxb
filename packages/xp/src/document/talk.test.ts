import { describe, expect, test } from 'bun:test'
import { parseXp, XP_FORMAT } from './format'
import { DEFAULT_TALK, isDefaultTalk, talkOf } from './talk'

/**
 * The off switch for chat and emotes, and almost all of it is about one word:
 * **absent means on.** A default that got this backwards would be a silent
 * level for every document written before the block existed, which is every
 * document there is.
 */

function doc(overrides: Record<string, unknown> = {}) {
  return {
    format: XP_FORMAT,
    id: 'first',
    name: 'First',
    packs: [{ id: 'proto' }],
    world: {
      floorY: 0,
      placements: [{ model: 'proto/Primitive_Floor', x: 0, y: 0, z: 0 }],
    },
    spawn: { x: 0, y: 1, z: 0, facing: 0 },
    ...overrides,
  }
}

describe('what a document that says nothing means', () => {
  test('both on', () => {
    expect(talkOf({})).toEqual({ chat: true, emotes: true })
    expect(DEFAULT_TALK).toEqual({ chat: true, emotes: true })
  })

  test('and an empty block is the same as no block', () => {
    expect(talkOf({ talk: {} })).toEqual({ chat: true, emotes: true })
    expect(isDefaultTalk({})).toBe(true)
  })

  test('half a block leaves the other half on', () => {
    expect(talkOf({ talk: { chat: false } })).toEqual({ chat: false, emotes: true })
    expect(talkOf({ talk: { emotes: false } })).toEqual({ chat: true, emotes: false })
  })

  test('an explicit yes says nothing its absence does not', () => {
    expect(isDefaultTalk({ chat: true, emotes: true })).toBe(true)
    expect(isDefaultTalk({ chat: false })).toBe(false)
    expect(isDefaultTalk({ emotes: false })).toBe(false)
  })
})

describe('the block, through the parser', () => {
  test('a level can turn both halves off', () => {
    const result = parseXp(doc({ talk: { chat: false, emotes: false } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(talkOf(result.document)).toEqual({ chat: false, emotes: false })
  })

  test('a document that says nothing does not grow a block by being parsed', () => {
    const result = parseXp(doc())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The editor stringifies this straight back out, so a materialised default
    // would appear in every file anybody opened.
    expect(result.document.talk).toBeUndefined()
    expect('talk' in result.document).toBe(false)
  })

  test('and neither does one that only says yes', () => {
    const result = parseXp(doc({ talk: { chat: true, emotes: true } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.talk).toBeUndefined()
  })

  test('a block with something off in it keeps what the author wrote', () => {
    const result = parseXp(doc({ talk: { chat: false, emotes: true } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    /*
     * The redundant `emotes: true` survives, and that is the camera's rule
     * rather than an oversight: the parser drops the *block* when it says
     * nothing and never edits one that says something. Tidying a field an
     * author wrote on purpose is the editor's job, and `setTalk` does it.
     */
    expect(result.document.talk).toEqual({ chat: false, emotes: true })
  })

  test('a value that is not a boolean is refused rather than read as yes', () => {
    // The failure this cannot have: the person who writes this block is the
    // person who wanted quiet, and truthiness would hand them a loud level.
    const result = parseXp(doc({ talk: { chat: 'no' } }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.at)).toContain('talk.chat')
  })

  test('and so is a block that is not an object', () => {
    expect(parseXp(doc({ talk: true })).ok).toBe(false)
    expect(parseXp(doc({ talk: [] })).ok).toBe(false)
  })
})
