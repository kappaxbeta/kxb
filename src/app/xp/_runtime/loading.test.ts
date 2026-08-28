/**
 * The four ways a door fails to be a simple fetch.
 *
 * A `load` looks like "go here", and every one of these is a case where doing
 * that literally is wrong: a name nobody has written yet, a door back into the
 * room you are standing in, the same door firing again a frame later, and a
 * destination somebody else controls.
 */
import { describe, expect, test } from 'bun:test'
import { planLoad, worthAnnouncing, xpUrl } from '@/app/xp/_runtime/loading'

const plan = (over: Partial<Parameters<typeof planLoad>[0]> = {}) =>
  planLoad({
    name: 'cellar',
    // The older door, and the default here because it is the one every case
    // below was written against: a name that is a room here if the table says
    // so and a document to fetch otherwise.
    names: 'either',
    scenes: undefined,
    currentId: 'first-room',
    standing: 'main',
    busy: false,
    ...over,
  })

/** A place in this document, as the parser leaves one. */
const ROOM = { world: { floorY: 0, ground: false, restart: false, fatal: false, placements: [], marks: [] }, spawn: { x: 0, y: 0, z: 0, facing: 0 }, entities: [] }

describe('where a target lives', () => {
  test('an internal id is a file this app serves', () => {
    expect(xpUrl('ladder-run', false)).toBe('/xp/xps/ladder-run.xp.json')
  })

  test('an external target is already an address', () => {
    expect(xpUrl('https://elsewhere.example/x.xp.json', true)).toBe(
      'https://elsewhere.example/x.xp.json',
    )
  })
})

describe('a door that does not open', () => {
  /**
   * An author may name a scene before writing it, which `resolveScene` is
   * explicit about. A name that resolves to nothing is not an error.
   */
  test('a name that resolves to nothing is closed, not broken', () => {
    expect(plan({ name: 'nowhere at all' })).toEqual({ kind: 'closed', name: 'nowhere at all' })
  })

  test('and the name is carried, so the level can say which door', () => {
    const result = plan({ name: 'a name with spaces' })
    expect(result.kind === 'closed' && result.name).toBe('a name with spaces')
  })
})

describe('a door into the room you are already in', () => {
  /**
   * The trap that makes this a function rather than an `if`. A `pressed` or an
   * `enter` rule on a plate can fire on many frames, and reloading the current
   * level would restart it under somebody every time they stood on it - which
   * reads as the level resetting at random.
   */
  test('loading the current document does nothing', () => {
    expect(plan({ name: 'first-room' })).toEqual({ kind: 'here' })
  })

  test('through the scenes table too, since that is the same place', () => {
    expect(plan({ name: 'home', scenes: { home: 'first-room' } })).toEqual({ kind: 'here' })
  })

  /**
   * Checked before `busy`, so standing on the plate for your own level is a
   * no-op rather than something that queues behind an unrelated fetch.
   */
  test('and it stays a no-op even while something else is loading', () => {
    expect(plan({ name: 'first-room', busy: true })).toEqual({ kind: 'here' })
  })

  /**
   * An external URL is not comparable to a local id: two different sites may
   * both call a level `arena`, and treating a stranger's `first-room` as "you
   * are already here" would silently refuse to follow the link.
   */
  test('an external target that merely spells the same is not here', () => {
    const result = plan({
      name: 'away',
      scenes: { away: 'https://elsewhere.example/first-room.xp.json' },
    })
    expect(result.kind).toBe('ask')
  })
})

describe('the same door, one frame later', () => {
  /**
   * Without this, every frame the rule fires starts another fetch of the same
   * file, and which of them lands last decides where you end up.
   */
  test('a load already in flight refuses another', () => {
    expect(plan({ name: 'cellar', busy: true })).toEqual({ kind: 'busy' })
  })
})

describe('a real destination', () => {
  test('an internal one goes straight there', () => {
    expect(plan({ name: 'cellar' })).toEqual({
      kind: 'go',
      target: 'cellar',
      url: '/xp/xps/cellar.xp.json',
    })
  })

  test('the scenes table wins over the bare name', () => {
    expect(plan({ name: 'cellar', scenes: { cellar: 'deep-dark' } })).toEqual({
      kind: 'go',
      target: 'deep-dark',
      url: '/xp/xps/deep-dark.xp.json',
    })
  })

  /**
   * The trust decision, which this file deliberately does not make - it asks
   * `resolveScene` and reports the answer. What is pinned here is that an
   * external destination reaches the host as something to *ask* about rather
   * than something to fetch.
   */
  test('somebody else’s level asks first', () => {
    expect(plan({ name: 'roof', scenes: { roof: 'https://elsewhere.example/x.xp.json' } })).toEqual({
      kind: 'ask',
      target: 'https://elsewhere.example/x.xp.json',
      url: 'https://elsewhere.example/x.xp.json',
    })
  })

  test('and a local one never does', () => {
    for (const name of ['cellar', 'ladder-run', 'a-b-c']) {
      expect(plan({ name }).kind).toBe('go')
    }
  })
})

describe('what the room is told about', () => {
  test('only doors that go somewhere', () => {
    expect(worthAnnouncing(plan({ name: 'cellar' }))).toBe(true)
    expect(
      worthAnnouncing(plan({ name: 'roof', scenes: { roof: 'https://elsewhere.example/x.xp.json' } })),
    ).toBe(true)
  })

  /**
   * The sharp one. A plate somebody is standing on fires on many frames, so
   * announcing `here` would tell the room to reload the level it is already in,
   * over and over, for as long as somebody stood still.
   */
  test('never a door back into the level we are in', () => {
    expect(worthAnnouncing(plan({ name: 'first-room' }))).toBe(false)
  })

  test('nor one that resolves to nothing, nor one that arrived mid-fetch', () => {
    expect(worthAnnouncing(plan({ name: 'nowhere at all' }))).toBe(false)
    expect(worthAnnouncing(plan({ name: 'cellar', busy: true }))).toBe(false)
  })

  /**
   * The one the topic change makes non-negotiable. A scene is part of the
   * topic, so a client that walked into the back room without saying so is on a
   * stream nobody else is on - and the room is two rooms with nothing on either
   * screen to say why.
   */
  test('and a room in this document most of all', () => {
    expect(worthAnnouncing(plan({ name: 'cellar', scenes: { cellar: ROOM } }))).toBe(true)
  })
})

describe('a room in this document', () => {
  test('is a scene rather than something to fetch', () => {
    expect(plan({ name: 'cellar', scenes: { cellar: ROOM } })).toEqual({
      kind: 'scene',
      name: 'cellar',
    })
  })

  /**
   * The order this file exists to get right. `main` is not in the table - the
   * parser refuses to let it be - so a fall-through to `resolveScene` would
   * make it a bare id, and a bare id is a *fetch*: `load main` would go looking
   * for `public/xp/xps/main.xp.json` instead of walking back into the level's
   * own front room.
   */
  test('and `main` is one of them, without being in the table', () => {
    expect(plan({ name: 'main', standing: 'cellar' })).toEqual({ kind: 'scene', name: 'main' })
  })

  test('the room you are standing in is `here`, exactly as the document is', () => {
    expect(plan({ name: 'cellar', standing: 'cellar', scenes: { cellar: ROOM } })).toEqual({
      kind: 'here',
    })
    expect(plan({ name: 'main', standing: 'main' })).toEqual({ kind: 'here' })
  })

  /**
   * A scene wins over a document of the same name, which is what makes one
   * table with two kinds of value work: `load cellar` does not care which the
   * cellar is, and the document's own answer is the one an author controls.
   */
  test('a place here beats a document that spells the same', () => {
    expect(plan({ name: 'cellar', scenes: { cellar: ROOM } }).kind).toBe('scene')
    expect(plan({ name: 'cellar', scenes: { cellar: 'deep-dark' } }).kind).toBe('go')
  })

  /**
   * Nothing is fetched, so there is nothing to be busy with. A scene switch is
   * a swap of two things already on this machine, and refusing it because an
   * unrelated document is in flight would make a door in a hub stop working
   * while somebody else's link was loading.
   */
  test('and a fetch already in flight does not hold it up', () => {
    expect(plan({ name: 'cellar', scenes: { cellar: ROOM }, busy: true })).toEqual({
      kind: 'scene',
      name: 'cellar',
    })
  })
})

/**
 * A door the author said was a room, which is the same question with the
 * fallback taken away.
 *
 * `load xp: "cellar"` has walked into the cellar since the topic change, because
 * the table is consulted before a name is treated as a document. What it cannot
 * do is *stay* a room: delete `scenes.cellar` and the same verb becomes a
 * request for `public/xp/xps/cellar.xp.json`, which is a different failure, at
 * play, from the one the author made in the editor.
 */
describe('a door that said it was a room', () => {
  const room = (over: Partial<Parameters<typeof planLoad>[0]> = {}) =>
    plan({ names: 'scene', ...over })

  test('reaches a room here exactly as the older door does', () => {
    expect(room({ scenes: { cellar: ROOM } })).toEqual({ kind: 'scene', name: 'cellar' })
    expect(room({ name: 'main', standing: 'cellar' })).toEqual({ kind: 'scene', name: 'main' })
  })

  /**
   * The whole of it. Without the distinction this is a `go`, and a `go` is a
   * request to the network for a file the author never mentioned.
   */
  test('and a name the table does not answer for is closed, never fetched', () => {
    expect(room({ name: 'cellar' })).toEqual({ kind: 'closed', name: 'cellar' })
    expect(room({ name: 'ladder-run' })).toEqual({ kind: 'closed', name: 'ladder-run' })
  })

  /**
   * Including one that is a door *out* in the same table. `scenes.roof` as a
   * string is somebody else's level, and a verb that said `scene` did not ask
   * to leave the document - so this is closed rather than an `ask`, and the
   * author is told on the ticker rather than shown a permission prompt for a
   * trip they did not write.
   */
  test('a door out of the document is not a room, so it does not open', () => {
    expect(room({ name: 'roof', scenes: { roof: 'deep-dark' } })).toEqual({
      kind: 'closed',
      name: 'roof',
    })
    expect(
      room({ name: 'roof', scenes: { roof: 'https://elsewhere.example/x.xp.json' } }).kind,
    ).toBe('closed')
  })

  test('the room you are standing in is still a no-op', () => {
    expect(room({ name: 'cellar', standing: 'cellar', scenes: { cellar: ROOM } })).toEqual({
      kind: 'here',
    })
  })

  test('and a closed one is not announced to the room', () => {
    expect(worthAnnouncing(room({ name: 'cellar' }))).toBe(false)
    expect(worthAnnouncing(room({ scenes: { cellar: ROOM } }))).toBe(true)
  })
})
