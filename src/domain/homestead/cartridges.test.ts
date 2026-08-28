import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parseXp } from '@kxb/xp'

import { fightable } from '@/domain/battle/xp-rules'

/**
 * The café and the house, as documents on disk.
 *
 * ---------------------------------------------------------------------------
 * Against the real files, for the reason the catalogue's own test gives
 * ---------------------------------------------------------------------------
 * Every claim below is a claim about a *file*, and a fixture would go on
 * passing while the file drifted away from it. What these pin is the handful of
 * facts that decide where these two cartridges may be used - which surface
 * offers them, which refuses them, and which purse they spend from - and each
 * of them is one word in a JSON file that nothing else would notice losing.
 */

const DIR = path.join(process.cwd(), 'public', 'xp', 'xps')

async function documentOf(id: string) {
  const parsed = parseXp(JSON.parse(await readFile(path.join(DIR, `${id}.xp.json`), 'utf8')))
  if (!parsed.ok) {
    throw new Error(`${id} does not parse: ${parsed.problems.map((p) => p.at).join(', ')}`)
  }
  return parsed.document
}

describe('the homestead cartridges', () => {
  test('both are framed, and each names its own game', async () => {
    expect((await documentOf('dream-restaurant')).frame?.game).toBe('dream-restaurant')
    expect((await documentOf('peepz-world')).frame?.game).toBe('peepz-world')
  })

  test('a place, not a match - so the battle wizard will not offer one', async () => {
    for (const id of ['dream-restaurant', 'peepz-world']) {
      const document = await documentOf(id)

      /*
       * The two halves of it, and both matter.
       *
       * `freeplay` is what lets the level be kept as a room - `pinXp` refuses a
       * level without it by name - and keeping it as a room is the whole point:
       * a café you walk into is the thing being built here.
       *
       * No `match` is what keeps it out of the battle list. On a *level* that
       * would decide nothing, because half the shelf declares only `freeplay`
       * and is opened as a match anyway; on a cartridge it is the whole answer.
       * See `fightable`.
       */
      expect(document.capabilities).toContain('freeplay')
      expect(document.capabilities).not.toContain('match')
      expect(fightable({ framed: true, capabilities: document.capabilities })).toBe(false)
    }
  })

  test('boxing is the other way round, so the rule is not simply "no cartridges"', async () => {
    const boxing = await documentOf('boxing')
    expect(boxing.capabilities).toContain('match')
    expect(fightable({ framed: true, capabilities: boxing.capabilities })).toBe(true)
  })

  test('they need you signed in, because the purse is yours', async () => {
    /*
     * The stream id is derived from the session's own user - see
     * `homesteadStreamId` - so a café opened by nobody has nowhere to put a
     * lunch service. Declared rather than discovered: without this the game
     * loads and the first purchase fails.
     */
    for (const id of ['dream-restaurant', 'peepz-world']) {
      expect((await documentOf(id)).backend?.needs).toContain('identity')
    }
  })

  test('the art is credited, and the credit comes from the pack table', async () => {
    /*
     * `parseXp` fills `author`, `licence` and `source` in from the pack table
     * and ignores whatever the document said, which is what stops a
     * hand-written file claiming somebody else's work. So this asserts the
     * *result*: the two people whose kits these rooms are built out of, and
     * Kenney for the body you walk around in.
     */
    const cafe = await documentOf('dream-restaurant')
    const authors = new Set(cafe.packs.map((pack) => pack.author))
    expect(authors).toContain('Kay Lousberg')
    expect(authors).toContain('Isa Lousberg')
    expect(authors).toContain('Kenney')
    for (const pack of cafe.packs) expect(pack.licence).toBe('CC0')

    const house = await documentOf('peepz-world')
    expect(house.packs.map((pack) => pack.id)).toContain('tiny-park')
    // The peep, which is what you are in both of them.
    expect(house.packs.map((pack) => pack.id)).toContain('peepz')
  })
})
