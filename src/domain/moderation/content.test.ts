import { describe, expect, test } from 'bun:test'

import {
  MAX_REPORT_REASON,
  MIN_REPORT_REASON,
  REPORT_KIND_LABELS,
  REPORT_KINDS,
  reportProblems,
  tableFor,
} from '@/domain/moderation/content'

describe('what can be reported', () => {
  test('every kind has a label and a table', () => {
    for (const kind of REPORT_KINDS) {
      expect(REPORT_KIND_LABELS[kind]).toBeTruthy()
      expect(tableFor(kind)).toMatch(/^[a-z_]+$/)
    }
  })

  test('the kinds that share a table share it on purpose', () => {
    // A vehicle *is* a blueprint, and a script lives inside an XP document.
    // Collapsing them would lose the only thing the reporter knew.
    expect(tableFor('vehicle')).toBe(tableFor('blueprint'))
    expect(tableFor('script')).toBe(tableFor('xp'))
    expect(tableFor('clip')).not.toBe(tableFor('blueprint'))
    expect(tableFor('movie')).not.toBe(tableFor('xp'))
  })
})

describe('the ways a report can be no use', () => {
  const fine = { kind: 'blueprint', reason: 'the name is a racist slur' }

  test('a good one has nothing wrong with it', () => {
    expect(reportProblems(fine)).toEqual([])
  })

  test('"bad" is not a report anybody can act on', () => {
    const problems = reportProblems({ ...fine, reason: 'bad' })
    expect(problems.some((one) => one.includes(String(MIN_REPORT_REASON)))).toBe(true)
  })

  test('nor is a whole essay', () => {
    const problems = reportProblems({ ...fine, reason: 'x'.repeat(MAX_REPORT_REASON + 1) })
    expect(problems.some((one) => one.includes(String(MAX_REPORT_REASON)))).toBe(true)
  })

  test('and a kind nobody ships is refused', () => {
    expect(reportProblems({ ...fine, kind: 'sandwich' })).toContain(
      'sandwich is not something you can report',
    )
  })

  test('whitespace does not pad a reason into being long enough', () => {
    expect(reportProblems({ ...fine, reason: `  bad${' '.repeat(40)}` }).length).toBe(1)
  })
})
