import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TRIGGER_EVENTS } from '../rules/triggers'
import { PRESETS, SIDES } from '../document/rules'
import { CAMERA_KINDS } from '../world/camera'

/**
 * The reference, checked against the thing it is a reference to.
 *
 * `docs/README.md` says it out loud - *"reference and plan are different
 * documents; `manual.md` is what the code does today"* - and a reference nobody
 * checks is a reference that quietly becomes a plan. This one had gone: its verb
 * table listed eight of eighteen, and the ten it was missing included every verb
 * added since capture the flag was built. Nothing anywhere said so.
 *
 * ---------------------------------------------------------------------------
 * Names, not prose
 * ---------------------------------------------------------------------------
 * What is checked is that every name in a closed vocabulary *appears* in the
 * document. Not that it is explained well, not where it appears, not in what
 * order - none of that is a thing a test can have an opinion about, and a test
 * that tried would be one people route around by pasting a word in a comment.
 *
 * What it does catch is the failure that actually happens: somebody adds a verb,
 * a trigger event or a mode, ships it, and the manual goes on describing the
 * vocabulary from before. That is silent today and loud here.
 */

/**
 * Both documents that carry the vocabulary, read as one.
 *
 * `manual.md` is the reference and `editor-guide.md` is what to press, and both
 * list the verbs - so both go stale the same way. The guide's table was headed
 * "the eight verbs" for a long time after there were eighteen.
 *
 * Joined rather than checked separately, deliberately: a name has to appear
 * *somewhere* a reader will meet it, and demanding every verb in the tutorial
 * would push it toward being a second reference. Where each name belongs is an
 * editorial question, and this is not the thing to have an opinion about it.
 */
const DOCS = ['manual.md', 'editor-guide.md']
  .map((name) =>
    readFileSync(path.join(import.meta.dir, '..', '..', '..', '..', 'docs', 'xp', name), 'utf8'),
  )
  .join('\n')

const MANUAL = DOCS

/**
 * Every `op` the verb union has, read out of the source.
 *
 * From the file rather than from an exported array, because there is no
 * exported array - the union *is* the list, and a hand-written copy of it beside
 * the union would be one more thing that can disagree. The regex is anchored to
 * the union's own shape, so a verb declared any other way is one this cannot see
 * and would rather fail loudly about than skip.
 */
function opsInSource(): string[] {
  const source = readFileSync(path.join(import.meta.dir, '..', 'rules', 'verbs.ts'), 'utf8')
  const found = [...source.matchAll(/^ {2}\| \{ op: '([a-z]+)'/gm)].map((m) => m[1]!)
  return [...new Set(found)].sort()
}

describe('the manual keeps up with the vocabulary', () => {
  test('every verb is named in it', () => {
    const ops = opsInSource()
    // A sanity floor, so a regex that stops matching reads as a broken test
    // rather than as a manual that is suddenly complete.
    expect(ops.length).toBeGreaterThan(10)

    const missing = ops.filter((op) => !MANUAL.includes(`\`${op}\``))
    expect({ missing }).toEqual({ missing: [] })
  })

  test('every trigger event is named in it', () => {
    const missing = TRIGGER_EVENTS.filter((event) => !MANUAL.includes(`\`${event}\``))
    expect({ missing }).toEqual({ missing: [] })
  })

  test('every mode and every shape of sides is named in it', () => {
    const missing = [...PRESETS, ...SIDES].filter((name) => !MANUAL.includes(`\`${name}\``))
    expect({ missing }).toEqual({ missing: [] })
  })

  test('every camera kind is named in it', () => {
    const missing = CAMERA_KINDS.filter((kind) => !MANUAL.includes(`\`${kind}\``))
    expect({ missing }).toEqual({ missing: [] })
  })
})
