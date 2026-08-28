import { describe, expect, test } from 'bun:test'
import { parseXp } from '../document/format'
import {
  entityByName,
  spawnEntities,
  spawnPlayer,
  deactivate,
  despawn,
  PLAYER_ID,
} from '../world/entities'
import { applyVerbs } from '../rules/verbs'
import {
  applyShare,
  nothingShared,
  readShare,
  sameShare,
  shareOf,
} from './sharing'

/**
 * What one client tells the room about the world.
 *
 * The gap this closes was found by asking the right question of capture the
 * flag: the socket carried position and facing, and `stepTriggers` probes only
 * the local body — so a peer took the flag and it stayed on the floor in front
 * of you. Everything below is the engine half of the answer; whether the flag
 * is *drawn* on the peer's hand is `_runtime/together.tsx`'s.
 */

const document = (() => {
  const parsed = parseXp({
    format: 'xp/1',
    id: 'share',
    name: 'Share',
    packs: [{ id: 'proto' }, { id: 'dummy' }],
    world: { floorY: 0, ground: true, placements: [], marks: [] },
    player: { blueprint: 'body' },
    blueprints: {
      body: { model: 'dummy/Dummy' },
      flag: { model: 'proto/Primitive_Cube_Small', collider: 'none' },
      pickup: { model: 'proto/Primitive_Cube_Small', collider: 'none' },
    },
    entities: [
      { blueprint: 'flag', name: 'flag', x: 0, y: 0, z: 0 },
      { blueprint: 'pickup', name: 'coin', x: 4, y: 0, z: 0 },
      { blueprint: 'pickup', name: 'gate', x: 8, y: 0, z: 0 },
    ],
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems))
  return parsed.document
})()

const world = () => {
  const live = spawnEntities(document)
  // The player too: `carry` refuses a carrier that is not alive, so a world
  // without a body in it cannot hold anything.
  spawnPlayer(live, document, { x: 0, y: 1, z: 0 })
  return {
    live,
    flag: entityByName(live, 'flag')!,
    coin: entityByName(live, 'coin')!,
    gate: entityByName(live, 'gate')!,
  }
}

describe('what a client would say', () => {
  test('a level where nothing has happened says nothing at all', () => {
    const { live } = world()
    expect(shareOf(live, PLAYER_ID)).toEqual(nothingShared())
  })

  test('something switched off is in the picture', () => {
    const { live, coin } = world()
    deactivate(live, coin, 15)
    expect(shareOf(live, PLAYER_ID).off).toEqual([coin])
  })

  test('and so is something despawned, in the same list', () => {
    const { live, coin } = world()
    despawn(live, coin)
    // One list, because a receiver only ever needs to know what to stop
    // drawing - the difference between the two is about coming back.
    expect(shareOf(live, PLAYER_ID).off).toEqual([coin])
  })

  test('what this player is carrying is in it', () => {
    const { live, flag } = world()
    applyVerbs(live, document.blueprints, [{ op: 'carry', target: 'self' }], {
      self: flag,
      other: PLAYER_ID,
    })
    expect(shareOf(live, PLAYER_ID).hold).toEqual([flag])
  })

  test('what somebody else is carrying is not', () => {
    const { live, flag } = world()
    // Hung off the coin rather than the player, standing in for a peer.
    const { coin } = world()
    live.parent.set(flag, { id: coin })
    expect(shareOf(live, PLAYER_ID).hold).toEqual([])
  })

  /**
   * The only question ever asked of two of these is whether they differ, so an
   * unsorted pair would send a packet a second every time a Map rehashed.
   */
  test('the lists are sorted, so an unchanged world compares equal', () => {
    const { live, coin, gate } = world()
    deactivate(live, gate)
    deactivate(live, coin)
    const first = shareOf(live, PLAYER_ID)

    const second = world()
    deactivate(second.live, second.coin)
    deactivate(second.live, second.gate)

    expect(sameShare(first, shareOf(second.live, PLAYER_ID))).toBe(true)
  })

  test('and a real change does not compare equal', () => {
    const { live, coin } = world()
    const before = shareOf(live, PLAYER_ID)
    deactivate(live, coin)
    expect(sameShare(before, shareOf(live, PLAYER_ID))).toBe(false)
  })
})

describe('reading one off the wire', () => {
  test('a well-formed packet survives', () => {
    expect(readShare({ off: [3, 4], hold: [7] })).toEqual({
      off: [3, 4],
      hold: [7],
      // Empty rather than absent: the three lists that used to be dropped here
      // are parsed now, and a sender that mentions none of them is a sender
      // saying nothing is hurt, nothing is playing and nothing is moving.
      hurt: [],
      clip: [],
      motion: [],
    })
  })

  test('a missing list is an empty one, so an old sender still parses', () => {
    expect(readShare({})).toEqual({ off: [], hold: [], hurt: [], clip: [], motion: [] })
    expect(readShare({ off: [1] })).toEqual({ off: [1], hold: [], hurt: [], clip: [], motion: [] })
  })

  /**
   * This is a message from another machine, which makes it input — the same
   * rule the position packet follows.
   */
  test('anything malformed is dropped rather than trusted', () => {
    for (const bad of [
      null,
      undefined,
      42,
      'off',
      { off: 'all' },
      { off: [1.5] },
      { off: [-1] },
      { off: ['3'] },
      { hold: [null] },
      { off: Array.from({ length: 513 }, (_, i) => i) },
    ]) {
      expect(readShare(bad)).toBeNull()
    }
  })
})

describe('applying what a peer says', () => {
  test('their pickup goes out on this screen too', () => {
    const { live, coin } = world()
    expect(live.alive.has(coin)).toBe(true)

    applyShare(live, { off: [coin], hold: [] }, PLAYER_ID)
    expect(live.alive.has(coin)).toBe(false)
  })

  /**
   * The first draft only ever turned things *off*, and it was wrong in exactly
   * the case the feature exists for: a pickup a peer emptied is one this client
   * never set a timer for, so it stayed dark forever.
   */
  test('and comes back when their picture says it is back', () => {
    const { live, coin } = world()
    applyShare(live, { off: [coin], hold: [] }, PLAYER_ID)
    applyShare(live, { off: [], hold: [] }, PLAYER_ID)

    expect(live.alive.has(coin)).toBe(true)
    // And the timer with it, or `stepReturns` announces a return for something
    // that is already back.
    expect(live.returns.has(coin)).toBe(false)
  })

  test('an id from a document we are not running is ignored, not invented', () => {
    const { live } = world()
    const before = new Set(live.alive)
    applyShare(live, { off: [9999], hold: [9998] }, PLAYER_ID)
    expect(live.alive).toEqual(before)
  })

  test('what they are carrying stops hanging off whatever it hung off', () => {
    const { live, flag, coin } = world()
    live.parent.set(flag, { id: coin })

    const held = applyShare(live, { off: [], hold: [flag] }, PLAYER_ID)

    expect(live.parent.has(flag)).toBe(false)
    // Handed back rather than placed: where a peer's hands are is the host's
    // question, and this module has no idea what a metre is.
    expect(held).toEqual([flag])
  })

  /**
   * Two people cannot hold one crate, and if they disagree the client holding
   * it locally wins — it is the authority on its own hands, which is the tier.
   */
  test('and it never takes something out of your own hands', () => {
    const { live, flag } = world()
    applyVerbs(live, document.blueprints, [{ op: 'carry', target: 'self' }], {
      self: flag,
      other: PLAYER_ID,
    })

    const held = applyShare(live, { off: [], hold: [flag] }, PLAYER_ID)

    expect(live.parent.get(flag)?.id).toBe(PLAYER_ID)
    expect(held).toEqual([])
  })

  /**
   * The property that makes the picture safe on a transport that promises
   * nothing: the same packet twice is the same world.
   */
  test('applying the same picture twice changes nothing the second time', () => {
    const { live, coin, flag } = world()
    const share = { off: [coin], hold: [flag] }

    applyShare(live, share, PLAYER_ID)
    const after = { alive: new Set(live.alive), parent: new Map(live.parent) }
    applyShare(live, share, PLAYER_ID)

    expect(live.alive).toEqual(after.alive)
    expect(live.parent).toEqual(after.parent)
  })

  test('and the order two pictures arrive in does not matter to the last one', () => {
    const one = world()
    applyShare(one.live, { off: [one.coin], hold: [] }, PLAYER_ID)
    applyShare(one.live, { off: [one.gate], hold: [] }, PLAYER_ID)

    const two = world()
    applyShare(two.live, { off: [two.gate], hold: [] }, PLAYER_ID)
    applyShare(two.live, { off: [two.coin], hold: [] }, PLAYER_ID)

    // Both end up believing the *last* picture each was told, which is the
    // whole point of sending a picture rather than a change.
    expect(one.live.alive.has(one.gate)).toBe(false)
    expect(one.live.alive.has(one.coin)).toBe(true)
    expect(two.live.alive.has(two.coin)).toBe(false)
    expect(two.live.alive.has(two.gate)).toBe(true)
  })
})

describe('damage crossing the wire', () => {
  /**
   * Reported: hitting something gave no feedback. Half of that was that nothing
   * drew a bar; the other half is this — the number went down on the shooter's
   * machine and every other screen showed an untouched crate until it vanished.
   */
  const LEVEL = () => {
    const parsed = parseXp({
      format: 'xp/1',
      id: 'hurt',
      name: 'Hurt',
      packs: [{ id: 'proto' }, { id: 'dummy' }],
      world: { floorY: 0, placements: [], marks: [] },
      player: { blueprint: 'body' },
      blueprints: {
        // With health on it, because the bug below is about a *body*: the tests
        // above it spawn no player, so the number never had anywhere to come
        // from and the hole stayed invisible for as long as the list existed.
        body: { model: 'dummy/Dummy', props: { hp: 100 } },
        crate: { model: 'proto/Box_A', collider: 'auto', props: { hp: 40 } },
        rock: { model: 'proto/Barrel_A', collider: 'auto' },
      },
      entities: [
        { blueprint: 'crate', name: 'one', x: 0, y: 0, z: 0 },
        { blueprint: 'rock', name: 'stone', x: 3, y: 0, z: 0 },
      ],
    })
    if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
    return parsed.document
  }

  test('an untouched level says nothing about health', () => {
    // The common case is empty, which is why it is a list of pairs and not a
    // map of everything.
    const document = LEVEL()
    const world = spawnEntities(document)
    expect(shareOf(world, PLAYER_ID, document.blueprints).hurt).toEqual([])
  })

  test('what is below its blueprint is reported, with the number', () => {
    // The number rather than a fraction: the receiver has the blueprint, so it
    // has the ceiling — and a fraction would round differently on two machines
    // showing the same crate.
    const document = LEVEL()
    const world = spawnEntities(document)
    world.props.get(0)!.hp = 12

    expect(shareOf(world, PLAYER_ID, document.blueprints).hurt).toEqual([{ id: 0, hp: 12 }])
  })

  test('a receiver takes the sender word for it', () => {
    // Not the lower of the two: the sender is the one shooting, so theirs is the
    // newer number — and "keep whichever is smaller" would leave a thing that
    // was repaired stuck at the health it had when it broke.
    const document = LEVEL()
    const world = spawnEntities(document)
    applyShare(world, { off: [], hold: [], hurt: [{ id: 0, hp: 7 }] }, PLAYER_ID)
    expect(world.props.get(0)?.hp).toBe(7)

    applyShare(world, { off: [], hold: [], hurt: [{ id: 0, hp: 30 }] }, PLAYER_ID)
    expect(world.props.get(0)?.hp).toBe(30)
  })

  test('health claimed for something that has none is ignored', () => {
    // A peer running a different document. Inventing the property would make a
    // rule about `hp` start firing on scenery.
    const document = LEVEL()
    const world = spawnEntities(document)
    applyShare(world, { off: [], hold: [], hurt: [{ id: 1, hp: 3 }] }, PLAYER_ID)
    expect(world.props.get(1)?.hp).toBeUndefined()
  })

  /**
   * Reported from capture the flag: *hit the carrier and they keep the flag.*
   *
   * The `damaged` rules were right, the arbiter was right, and the reason
   * nothing fired is here. `PLAYER_ID` is a constant, so a player who had been
   * shot broadcast their own health under the id every other client's own body
   * wears - and the receiver wrote it onto themselves. The runtime only calls
   * `damage()` when the arbiter's number is *lower* than the local one, so a
   * body already dragged down to that number was a body no hit could reach: no
   * `damage()`, no `damaged`, no drop, no stun.
   */
  test('a body does not tell the room its own health', () => {
    const document = LEVEL()
    const world = spawnEntities(document)
    spawnPlayer(world, document, { x: 0, y: 1, z: 0 })
    world.props.get(PLAYER_ID)!.hp = 75

    // The crate is still reported: a thing in the level is the same thing on
    // every screen, which is the whole reason this list exists.
    world.props.get(0)!.hp = 20
    expect(shareOf(world, PLAYER_ID, document.blueprints).hurt).toEqual([{ id: 0, hp: 20 }])
  })

  test('and would not believe a peer that told it', () => {
    // The other end of the same fact, guarded separately because a packet from
    // a client that has not been updated must not be able to do this either.
    const document = LEVEL()
    const world = spawnEntities(document)
    spawnPlayer(world, document, { x: 0, y: 1, z: 0 })

    applyShare(world, { off: [], hold: [], hurt: [{ id: PLAYER_ID, hp: 25 }] }, PLAYER_ID, 'peer')
    expect(world.props.get(PLAYER_ID)?.hp).toBe(100)
  })

  test('nor that its own body is switched off', () => {
    // The same id in the same packet, one list along: `off` would have made this
    // player vanish from their own screen for as long as a peer was dead.
    const document = LEVEL()
    const world = spawnEntities(document)
    spawnPlayer(world, document, { x: 0, y: 1, z: 0 })

    applyShare(world, { off: [PLAYER_ID], hold: [], hurt: [] }, PLAYER_ID, 'peer')
    expect(world.alive.has(PLAYER_ID)).toBe(true)
  })

  test('a picture with no health in it is the same picture', () => {
    // `hurt` is optional, so every caller written before damage crossed the wire
    // keeps working — and two pictures that differ only in an absent list must
    // not read as a change worth sending.
    expect(sameShare({ off: [], hold: [] }, { off: [], hold: [], hurt: [] })).toBe(true)
    expect(
      sameShare({ off: [], hold: [], hurt: [{ id: 0, hp: 4 }] }, { off: [], hold: [], hurt: [{ id: 0, hp: 5 }] }),
    ).toBe(false)
  })
})

/**
 * The gap between two things that were each tested.
 *
 * `hurt` has been produced by `shareOf`, compared by `sameShare` and applied by
 * `applyShare` since damage first crossed the wire - and `readShare`, the only
 * gate between the socket and all three, built its answer out of `off` and
 * `hold` and nothing else. So the packet was made, sent, received and thinned
 * to two fields before anybody looked at it: a crate hit on one machine still
 * showed untouched on every other, which is the exact bug that work was for.
 *
 * Every test for it passed, because every one of them called `applyShare` with
 * a hand-built picture. These go through the door instead.
 */
describe('what actually survives the wire', () => {
  test('health does, which it did not', () => {
    const read = readShare({ off: [], hold: [], hurt: [{ id: 2, hp: 12 }] })
    expect(read?.hurt).toEqual([{ id: 2, hp: 12 }])
  })

  test('and a clip does, with the tick that makes two of them two events', () => {
    const read = readShare({
      off: [],
      hold: [],
      clip: [{ id: 3, name: 'Wave', loop: false, at: 91 }],
    })
    expect(read?.clip).toEqual([{ id: 3, name: 'Wave', loop: false, at: 91 }])
  })

  test('with the parts it was aimed at, when it was aimed at any', () => {
    const read = readShare({
      off: [],
      hold: [],
      clip: [{ id: 3, name: 'Wave', loop: true, at: 4, parts: ['arms'] }],
    })
    expect(read?.clip?.[0]?.parts).toEqual(['arms'])
  })

  test('and nonsense from another machine is refused rather than written in', () => {
    // Input, like everything else off the wire. `NaN` into `hp` would put every
    // later comparison about that entity beyond arithmetic, and it costs one
    // machine one bad packet to do it to everybody in the room.
    expect(readShare({ off: [], hold: [], hurt: [{ id: 2, hp: Number.NaN }] })).toBeNull()
    expect(readShare({ off: [], hold: [], hurt: [{ id: -1, hp: 1 }] })).toBeNull()
    expect(readShare({ off: [], hold: [], clip: [{ id: 1, name: '', loop: false, at: 0 }] })).toBeNull()
    expect(readShare({ off: [], hold: [], clip: [{ id: 1, name: 'W', loop: 'yes', at: 0 }] })).toBeNull()
    expect(
      readShare({ off: [], hold: [], clip: [{ id: 1, name: 'W'.repeat(200), loop: false, at: 0 }] }),
    ).toBeNull()
  })
})

describe('a clip crossing the wire', () => {
  test('a body playing something says so', () => {
    const world = spawnEntities(document)
    world.clip.set(0, { name: 'Wave', loop: true, at: 7, parts: ['arms'] })
    expect(shareOf(world, PLAYER_ID, document.blueprints).clip).toEqual([
      { id: 0, name: 'Wave', loop: true, at: 7, parts: ['arms'] },
    ])
  })

  test('and a receiver plays it too', () => {
    const live = spawnEntities(document)
    applyShare(live, { off: [], hold: [], clip: [{ id: 0, name: 'Wave', loop: false, at: 3 }] }, PLAYER_ID)
    expect(live.clip.get(0)).toEqual({ name: 'Wave', loop: false, at: 3 })
  })

  test('a picture with nothing playing stops what was', () => {
    // The map is only ever populated while something is playing, so an entry
    // going away is exactly how a script says "stop".
    const live = spawnEntities(document)
    live.clip.set(0, { name: 'Wave', loop: true, at: 1 })
    applyShare(live, { off: [], hold: [], clip: [] }, PLAYER_ID)
    expect(live.clip.has(0)).toBe(false)
  })

  test('and a picture that says nothing about clips at all leaves them alone', () => {
    // An older sender, or a caller that never had any. Silence is not a stop.
    const live = spawnEntities(document)
    live.clip.set(0, { name: 'Wave', loop: true, at: 1 })
    applyShare(live, { off: [], hold: [] }, PLAYER_ID)
    expect(live.clip.get(0)?.name).toBe('Wave')
  })

  test('the same clip asked for twice is two pictures, not one', () => {
    // `at` is in `sameShare` and has to be, or the second wave is swallowed as
    // "nothing changed" and never sent.
    const first = { off: [], hold: [], hurt: [], clip: [{ id: 0, name: 'Wave', loop: false, at: 1 }] }
    const again = { off: [], hold: [], hurt: [], clip: [{ id: 0, name: 'Wave', loop: false, at: 2 }] }
    expect(sameShare(first, first)).toBe(true)
    expect(sameShare(first, again)).toBe(false)
  })
})

/**
 * Two machines counting their own frames, which is every room with two people.
 *
 * The flaw found by asking "is the animation actually sent": it is, and `at` is
 * the sender's own tick. A script is deterministic, so both clients run
 * `runAnimation` for the same entity and each broadcasts it stamped with a
 * different number - and the renderer restarts a clip whenever `at` changes.
 * Written in as-is that is an animation which stutters at the packet rate in
 * company and plays perfectly alone, which is the worst shape a bug can have.
 */
describe('a clip arriving from somebody else who is also playing it', () => {
  test('the same clip again keeps playing rather than restarting', () => {
    const live = spawnEntities(document)
    live.clip.set(0, { name: 'Wave', loop: true, at: 1200 })
    applyShare(live, { off: [], hold: [], clip: [{ id: 0, name: 'Wave', loop: true, at: 1198 }] }, PLAYER_ID)
    expect(live.clip.get(0)?.at).toBe(1200)
  })

  test('and again, and again, because the packets keep coming', () => {
    const live = spawnEntities(document)
    live.clip.set(0, { name: 'Wave', loop: true, at: 1200 })
    for (const at of [1198, 1206, 1211, 1219]) {
      applyShare(live, { off: [], hold: [], clip: [{ id: 0, name: 'Wave', loop: true, at }] }, PLAYER_ID)
    }
    expect(live.clip.get(0)?.at).toBe(1200)
  })

  test('but a different clip is a new event and takes the new tick', () => {
    const live = spawnEntities(document)
    live.clip.set(0, { name: 'Wave', loop: true, at: 1200 })
    applyShare(live, { off: [], hold: [], clip: [{ id: 0, name: 'Cheer', loop: false, at: 1198 }] }, PLAYER_ID)
    expect(live.clip.get(0)).toEqual({ name: 'Cheer', loop: false, at: 1198 })
  })

  test('so is the same clip aimed at different parts', () => {
    // A wave on the arms and a wave on the whole body are two different things
    // to watch, whatever they are called.
    const live = spawnEntities(document)
    live.clip.set(0, { name: 'Wave', loop: true, at: 1200, parts: ['arms'] })
    applyShare(live, { off: [], hold: [], clip: [{ id: 0, name: 'Wave', loop: true, at: 9 }] }, PLAYER_ID)
    expect(live.clip.get(0)?.at).toBe(9)
  })

  test('and so is one arriving at a body that had nothing', () => {
    const live = spawnEntities(document)
    applyShare(live, { off: [], hold: [], clip: [{ id: 0, name: 'Wave', loop: false, at: 44 }] }, PLAYER_ID)
    expect(live.clip.get(0)?.at).toBe(44)
  })
})
