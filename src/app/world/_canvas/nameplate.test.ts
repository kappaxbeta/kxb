import { describe, expect, test } from 'bun:test'
import { plateName } from '@/app/world/_canvas/nameplate'

/**
 * The plate is a label floating over a body, so its whole job is to stay
 * narrower than the body. These are the cases where it stops doing that.
 */
describe('plateName', () => {
  test('drops the domain, which is the same for everyone in the workspace', () => {
    expect(plateName('ada@example.com')).toBe('ada')
    expect(plateName('sam.smith@a.very.long.domain.example.com')).toBe('sam.smith')
  })

  test('leaves a plain name alone', () => {
    expect(plateName('Ada')).toBe('Ada')
    expect(plateName('Zoë Ω 日本')).toBe('Zoë Ω 日本')
  })

  test('an empty or blank name still labels somebody', () => {
    expect(plateName('')).toBe('Someone')
    expect(plateName('   ')).toBe('Someone')
  })

  test('trims, so stray whitespace does not pad the plate', () => {
    expect(plateName('  ada@example.com  ')).toBe('ada')
  })

  /**
   * A leading `@` would slice to an empty string and render a plate with
   * nothing on it - a black smudge over somebody's head with no explanation.
   */
  test('a leading @ is not treated as an empty local part', () => {
    expect(plateName('@handle')).toBe('@handle')
  })

  test('a long local part is cut short with an ellipsis', () => {
    const long = 'a-very-long-local-part-indeed@example.com'
    const label = plateName(long)
    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBe(16)
  })

  test('nothing it returns is ever wider than the cap', () => {
    for (const name of [
      'ada@example.com',
      'a'.repeat(200),
      `${'b'.repeat(200)}@example.com`,
      '@'.repeat(50),
      'Someone',
    ]) {
      expect(plateName(name).length).toBeLessThanOrEqual(16)
    }
  })
})
