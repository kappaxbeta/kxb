import { describe, expect, test } from 'bun:test'
import { addMark, editing, setCapabilities, setRules } from './edit'
import { parseXp, XP_FORMAT, type XpDocument } from './format'

function doc(overrides: Record<string, unknown> = {}): XpDocument {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'x',
    name: 'X',
    packs: [{ id: 'proto' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

describe('what a level says it can be used for', () => {
  test('a bare level is freeplay, and can stop being only that once it has the marks', () => {
    const bare = editing(doc())
    expect(bare.document.capabilities).toEqual(['freeplay'])
    // One spawn is not a match.
    expect(setCapabilities(bare, ['freeplay', 'match'])).toBeNull()
    const twoSpawns = addMark(addMark(bare, { kind: 'spawn', x: 0, y: 1, z: 0, team: 'red' })!, {
      kind: 'spawn',
      x: 4,
      y: 1,
      z: 0,
      team: 'blue',
    })!
    const both = setCapabilities(twoSpawns, ['match', 'freeplay'])!
    // Canonical order, whatever order it was asked in.
    expect(both.document.capabilities).toEqual(['freeplay', 'match'])
  })

  test('battles only: freeplay can be taken away, and the room then cannot be kept', () => {
    const bare = editing(doc())
    const twoSpawns = addMark(addMark(bare, { kind: 'spawn', x: 0, y: 1, z: 0, team: 'red' })!, {
      kind: 'spawn',
      x: 4,
      y: 1,
      z: 0,
      team: 'blue',
    })!
    const onlyMatch = setCapabilities(twoSpawns, ['match'])!
    expect(onlyMatch.document.capabilities).toEqual(['match'])
    // And round-trips: the parser does not put freeplay back on a level that
    // declares something else.
    const parsed = parseXp(JSON.parse(JSON.stringify(onlyMatch.document)))
    expect(parsed.ok && parsed.document.capabilities).toEqual(['match'])
  })

  test('nothing at all is refused rather than silently becoming freeplay', () => {
    expect(setCapabilities(editing(doc()), [])).toBeNull()
  })

  test('the capability a preset leans on cannot be taken away under it', () => {
    const withRace = editing(
      doc({
        capabilities: ['freeplay', 'competition'],
        world: {
          floorY: 0,
          placements: [],
          marks: [
            { kind: 'start', x: 0, y: 1, z: 0, facing: 0, width: 2, height: 2 },
            { kind: 'finish', x: 9, y: 1, z: 0, facing: 0, width: 2, height: 2 },
          ],
        },
      }),
    )
    const parkour = setRules(withRace, { preset: 'parkour' })!
    expect(setCapabilities(parkour, ['freeplay'])).toBeNull()
    expect(setCapabilities(withRace, ['freeplay'])).not.toBeNull()
  })

  test('asking for what is already there is not an edit', () => {
    const bare = editing(doc())
    expect(setCapabilities(bare, ['freeplay'])).toBe(bare)
  })
})
