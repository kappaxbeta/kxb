import { describe, expect, test } from 'bun:test'
import { MAX_XP_REF, formatXpRef, parseXpRef } from '@/domain/xps/ref'

/**
 * The column's own constraint, copied from 20260921000000_battle_xp.sql.
 *
 * Restated here rather than imported, because there is nothing to import it
 * from: it is SQL. A test that asserts against a copy of the rule is worth
 * having anyway - the failure it catches is "we invented a spelling the
 * database will reject", which is otherwise found in production by the first
 * person to summon a match.
 */
const COLUMN = /^[a-z0-9][a-z0-9-]{0,63}$/

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('reading a reference', () => {
  test('a bare name is a document we ship', () => {
    expect(parseXpRef('sidestep')).toEqual({ kind: 'builtin', id: 'sidestep' })
    expect(parseXpRef('football-pitch')).toEqual({ kind: 'builtin', id: 'football-pitch' })
  })

  test('a project carries its version', () => {
    expect(parseXpRef(`p-${UUID}-v3`)).toEqual({
      kind: 'project',
      xpId: UUID,
      version: 3,
    })
  })

  test('what a reference means round-trips', () => {
    for (const ref of [
      { kind: 'builtin', id: 'sidestep' },
      { kind: 'project', xpId: UUID, version: 1 },
      { kind: 'project', xpId: UUID, version: 240 },
    ] as const) {
      expect(parseXpRef(formatXpRef(ref))).toEqual(ref)
    }
  })

  /**
   * The one ambiguity in the scheme, pinned.
   *
   * A builtin is free-form and a project reference is a builtin-shaped string,
   * so the two alphabets overlap. Project wins, and a filename that collided
   * would be unreachable - which is fine and is why we name the files.
   */
  test('the project shape wins over the builtin shape', () => {
    expect(parseXpRef(`p-${UUID}-v3`)?.kind).toBe('project')
  })

  test('near misses are builtins rather than broken projects', () => {
    // No version, a version of zero, a leading zero, and a uuid that is short
    // by a character. None of these may be read as "version 3 of something".
    for (const value of [`p-${UUID}`, `p-${UUID}-v0`, `p-${UUID}-v03`, 'p-550e8400-v3']) {
      expect(parseXpRef(value)?.kind).toBe('builtin')
    }
  })

  test('anything outside the alphabet is refused', () => {
    for (const value of ['', '../secrets', 'Sidestep', 'side step', 'p/1', '-leading']) {
      expect(parseXpRef(value)).toBeNull()
    }
  })

  test('a reference longer than the column is refused rather than truncated', () => {
    expect(parseXpRef('a'.repeat(MAX_XP_REF))).not.toBeNull()
    expect(parseXpRef('a'.repeat(MAX_XP_REF + 1))).toBeNull()
  })
})

describe('what we write into the column', () => {
  test('a project reference fits the constraint the migration set', () => {
    const written = formatXpRef({ kind: 'project', xpId: UUID, version: 999_999 })

    expect(written).toMatch(COLUMN)
    expect(written.length).toBeLessThanOrEqual(MAX_XP_REF)
  })
})
