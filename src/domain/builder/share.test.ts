import { describe, expect, test } from 'bun:test'
import { cellsFor } from '@/domain/builder/draw'
import { stampText } from '@/domain/builder/glyphs'
import { decodeWorld, encodeWorld, MAX_SHARE_LENGTH, shareSize, toGroups } from '@/domain/builder/share'
import { DEFAULT_WORLD, place, type BuilderWorld, type Placement } from '@/domain/builder/world'

const spec = { model: 'bb10/stone', rotation: 0, scale: 1 }

function worldOf(placements: Placement[], over: Partial<BuilderWorld> = {}): BuilderWorld {
  return { ...DEFAULT_WORLD, placements, ...over }
}

/** Placements as a comparable set, since the codec is free to reorder them. */
const setOf = (placements: Placement[]) =>
  placements
    .map((p) => `${p.model}@${p.x},${p.y},${p.z}/${p.rotation}/${p.scale}`)
    .sort()

describe('folding into runs', () => {
  test('a straight wall is one run, not a hundred records', () => {
    const wall = place([], cellsFor('line', { x: -50, y: 0, z: 0 }, { x: 49, y: 0, z: 0 }), spec)
    const [group] = toGroups(wall)
    expect(group.rows).toHaveLength(1)
    expect(group.rows[0].runs).toEqual([{ x: -50, length: 100 }])
  })

  test('a gap in a row starts a new run', () => {
    const broken = place(
      [],
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ],
      spec,
    )
    expect(toGroups(broken)[0].rows[0].runs).toEqual([
      { x: 0, length: 2 },
      { x: 5, length: 1 },
    ])
  })

  test('different models are different groups', () => {
    const mixed = place(place([], [{ x: 0, y: 0, z: 0 }], spec), [{ x: 1, y: 0, z: 0 }], {
      ...spec,
      model: 'bb10/lava',
    })
    expect(toGroups(mixed)).toHaveLength(2)
  })

  test('so are different turns and sizes of the same model', () => {
    const turned = place(place([], [{ x: 0, y: 0, z: 0 }], spec), [{ x: 1, y: 0, z: 0 }], {
      ...spec,
      rotation: 90,
    })
    expect(toGroups(turned)).toHaveLength(2)
  })
})

describe('round trips', () => {
  test('an empty world', () => {
    expect(decodeWorld(encodeWorld(DEFAULT_WORLD))).toEqual(DEFAULT_WORLD)
  })

  test('one block', () => {
    const world = worldOf(place([], [{ x: 3, y: 2, z: -4 }], spec))
    expect(decodeWorld(encodeWorld(world))).toEqual(world)
  })

  test('a room, walls and all', () => {
    const world = worldOf(
      place([], cellsFor('box', { x: -6, y: 0, z: -6 }, { x: 6, y: 0, z: 6 }, { height: 4 }), spec),
    )
    expect(setOf(decodeWorld(encodeWorld(world)).placements)).toEqual(setOf(world.placements))
  })

  test('negative coordinates and levels below the ground', () => {
    const world = worldOf(
      place([], [{ x: -40, y: -8, z: -40 }, { x: -1, y: -1, z: -1 }], spec),
    )
    expect(setOf(decodeWorld(encodeWorld(world)).placements)).toEqual(setOf(world.placements))
  })

  test('turns and sizes survive', () => {
    const world = worldOf(
      place([], [{ x: 0, y: 0, z: 0 }], { model: 'park/bench', rotation: -135, scale: 2.25 }),
    )
    const [only] = decodeWorld(encodeWorld(world)).placements
    expect(only.rotation).toBe(-135)
    expect(only.scale).toBe(2.25)
    expect(only.model).toBe('park/bench')
  })

  test('a many-model world', () => {
    let placements: Placement[] = []
    const models = ['bb10/stone', 'bb10/lava', 'park/tree', 'plants/cactus_A', 'peeps/fox']
    models.forEach((model, index) => {
      placements = place(
        placements,
        cellsFor('line', { x: index * 10, y: 0, z: 0 }, { x: index * 10 + 8, y: 0, z: 0 }),
        { model, rotation: 0, scale: 1 },
      )
    })

    const world = worldOf(placements)
    expect(setOf(decodeWorld(encodeWorld(world)).placements)).toEqual(setOf(placements))
  })

  test('the camera, light, ground and name come back', () => {
    const world = worldOf([], {
      name: 'launch ad',
      width: 2560,
      height: 1440,
      camera: { position: [1.5, 2.5, 3.5], target: [0, 1, 0], fov: 55 },
      ground: { cols: 41, rows: 9, model: 'bb10/sand_A', rounded: true },
      background: '#0a0a0f',
      light: { azimuth: -30, elevation: 20, sun: 3.5, ambient: 0.2, hemisphere: 2, rim: 0 },
    })
    expect(decodeWorld(encodeWorld(world))).toEqual(world)
  })

  test('a stamped wordmark', () => {
    const world = worldOf(
      place([], stampText('KXB TEAM', { x: -20, y: 0, z: 0 }, { scale: 2, depth: 2 }), spec),
    )
    expect(setOf(decodeWorld(encodeWorld(world)).placements)).toEqual(setOf(world.placements))
  })
})

describe('how small it gets', () => {
  test('a wall is a link, not a file', () => {
    const wall = place([], cellsFor('wall', { x: -50, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, { height: 6 }), spec)
    expect(wall).toHaveLength(606)

    const { length, fits } = shareSize(worldOf(wall))
    expect(fits).toBe(true)
    // 606 placements as JSON is around 45 kB. Runs make it a rounding error.
    expect(length).toBeLessThan(700)
  })

  test('a walled compound with a paved floor still fits in a link', () => {
    let placements = place(
      [],
      cellsFor('box', { x: -20, y: 0, z: -20 }, { x: 20, y: 0, z: 20 }, { height: 6 }),
      spec,
    )
    placements = place(
      placements,
      cellsFor('rect', { x: -19, y: 0, z: -19 }, { x: 19, y: 0, z: 19 }, { filled: true }),
      { ...spec, model: 'bb10/stone_dark' },
    )

    // Six courses of a 41-square wall, plus the flagstones inside it.
    expect(placements).toHaveLength(960 + 39 * 39)
    expect(shareSize(worldOf(placements)).fits).toBe(true)
  })

  // The honest failure. Scattered single blocks are the worst case for runs,
  // and the editor has to be told rather than shipping a truncated link.
  test('scattered noise is reported as not fitting', () => {
    const scattered: Placement[] = []
    for (let index = 0; index < 4000; index += 1) {
      scattered.push({
        model: 'bb10/stone',
        x: (index * 37) % 161 - 80,
        y: (index * 13) % 40,
        z: (index * 53) % 161 - 80,
        rotation: 0,
        scale: 1,
      })
    }
    const { fits, length } = shareSize(worldOf(scattered))
    expect(length).toBeGreaterThan(MAX_SHARE_LENGTH)
    expect(fits).toBe(false)
  })
})

describe('a link that arrives damaged', () => {
  test('nothing at all is the default world', () => {
    expect(decodeWorld(undefined).name).toBe(DEFAULT_WORLD.name)
    expect(decodeWorld('').name).toBe(DEFAULT_WORLD.name)
  })

  test('rubbish is the default world, not a crash', () => {
    expect(() => decodeWorld('!!!!')).not.toThrow()
    expect(decodeWorld('b1~not-base64~zz').placements).toEqual([])
  })

  test('a version we do not know is refused rather than misread', () => {
    const code = encodeWorld(worldOf(place([], [{ x: 0, y: 0, z: 0 }], spec)))
    expect(decodeWorld(code.replace('b1~', 'b9~')).placements).toEqual([])
  })

  // A chat client that wraps the link cuts the end off, and the end is the
  // body - so what survives should be the part of the world that arrived.
  test('a truncated body keeps what it can', () => {
    const world = worldOf(
      place([], cellsFor('box', { x: -8, y: 0, z: -8 }, { x: 8, y: 0, z: 8 }, { height: 4 }), spec),
    )
    const code = encodeWorld(world)
    const cut = decodeWorld(code.slice(0, code.length - 40))

    expect(cut.placements.length).toBeGreaterThan(0)
    expect(cut.placements.length).toBeLessThan(world.placements.length)
    expect(cut.name).toBe(world.name)
  })

  test('a link naming a model we do not ship drops it', () => {
    const world = worldOf(place([], [{ x: 0, y: 0, z: 0 }], spec))
    const code = encodeWorld(world)
    // Rewrite the palette entry inside the metadata section.
    const [version, meta, body] = code.split('~')
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(meta.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      ),
    )
    decoded.p = ['bb10/../../etc/passwd']
    const forged = btoa(JSON.stringify(decoded)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    expect(decodeWorld(`${version}~${forged}~${body}`).placements).toEqual([])
  })

  test('a run claiming zero length does not hang the decoder', () => {
    expect(() => decodeWorld('b1~eyJwIjpbImJiMTAvc3RvbmUiXX0~2.0.0.c8.2.0.0.2.0.0')).not.toThrow()
  })
})
