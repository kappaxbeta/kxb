import { describe, expect, test } from 'bun:test'
import { clipInShot, deedsInShot } from '@/domain/studio/thing-deeds'

const spec = (actions: { when: string; deed: string; value?: string }[], clip: string | null = null) =>
  ({ actions, clip }) as never

describe('what a thing does in a shot', () => {
  test('an `always` deed runs without anybody touching anything', () => {
    expect([...deedsInShot(spec([{ when: 'always', deed: 'spin' }]), false)]).toEqual(['spin'])
  })

  test('the other three wait, because a shot has nobody to do them', () => {
    expect(deedsInShot(spec([{ when: 'touch', deed: 'bob' }]), false).size).toBe(0)
    expect(deedsInShot(spec([{ when: 'near', deed: 'bob' }]), false).size).toBe(0)
    expect(deedsInShot(spec([{ when: 'use', deed: 'bob' }]), false).size).toBe(0)
  })

  test('and run when the author stands in for one', () => {
    expect([...deedsInShot(spec([{ when: 'touch', deed: 'bob' }]), true)]).toEqual(['bob'])
  })

  test('two rules naming one deed is still one deed', () => {
    const both = spec([
      { when: 'always', deed: 'spin' },
      { when: 'touch', deed: 'spin' },
    ])
    expect(deedsInShot(both, true).size).toBe(1)
  })

  test('a blueprint with no actions does nothing at all', () => {
    expect(deedsInShot(spec([]), true).size).toBe(0)
  })

  test('the standing clip plays when no `play` deed is running', () => {
    expect(clipInShot(spec([{ when: 'touch', deed: 'play', value: 'open' }], 'idle'), false)).toBe('idle')
  })

  test('a running `play` names its own', () => {
    expect(clipInShot(spec([{ when: 'always', deed: 'play', value: 'open' }], 'idle'), false)).toBe('open')
  })

  test('a `play` with nothing named falls back to the standing clip', () => {
    expect(clipInShot(spec([{ when: 'always', deed: 'play' }], 'idle'), false)).toBe('idle')
  })
})
