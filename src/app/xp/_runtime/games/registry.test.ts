import { describe, expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { parseXp } from '@kxb/xp'

import { GAMES, gameNamed } from '@/app/xp/_runtime/games/registry'

/**
 * That the documents we ship name games this deployment can actually run.
 *
 * ---------------------------------------------------------------------------
 * The one failure the registry's own design cannot prevent
 * ---------------------------------------------------------------------------
 * `frame.game` is an opaque string and stays one - that is the whole argument
 * in `packages/xp/src/document/frame.ts`, and it is right: a host that has never
 * heard of a game has to be able to refuse it by name rather than fail to
 * compile. The cost is that a typo in a file we ship is indistinguishable from a
 * game somebody else wrote, and the refusal - *"nothing here knows what that
 * is"* - is perfectly good English arriving in front of a player.
 *
 * So the coupling the format refuses to have at compile time is asserted here
 * instead, against the real folder. A cartridge added to `public/xp/xps/` with
 * no entry beside it fails this rather than a room somebody walked into.
 */

const DIR = path.join(process.cwd(), 'public', 'xp', 'xps')

describe('the games this deployment can run', () => {
  test('every cartridge we ship names one of them', async () => {
    const files = (await readdir(DIR)).filter((file) => file.endsWith('.xp.json'))
    const framed: string[] = []

    for (const file of files) {
      const parsed = parseXp(JSON.parse(await readFile(path.join(DIR, file), 'utf8')))
      if (!parsed.ok || !parsed.document.frame) continue
      framed.push(file)
      expect(gameNamed(parsed.document.frame.game)).toBeDefined()
    }

    // A guard on the guard: if the filter above ever stops finding anything,
    // this test passes by looking at nothing at all.
    expect(framed.length).toBeGreaterThanOrEqual(3)
  })

  test('ids are unique, because the lookup is a find', () => {
    const ids = GAMES.map((game) => game.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('and every id is one a document is allowed to spell', () => {
    // `readFrame` refuses anything else, so an entry outside this alphabet is
    // an entry no document could ever reach - see the note there about a string
    // that becomes a lookup key and a chunk name.
    for (const id of GAMES.map((game) => game.id)) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
  })
})
