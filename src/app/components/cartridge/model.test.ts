import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import { CART, LABEL } from '@/app/components/cartridge/model'

/**
 * The constants against the mesh they were measured off.
 *
 * ---------------------------------------------------------------------------
 * Why this test exists
 * ---------------------------------------------------------------------------
 * `model.ts` carries five numbers that describe a *file*: how big the shell is
 * and where its sticker recess sits. Nothing in the running app can notice when
 * those stop being true - the cover plane would simply float in front of the
 * plastic, or sink into it, or hang off the edge, on a page nobody screenshots
 * in CI. Re-exporting the cartridge from Blender with a different scale or a
 * different quarter-turn is a completely reasonable thing for somebody to do,
 * and this is what makes it a failing test rather than a subtly wrong shelf.
 *
 * So the GLB is read here rather than mocked, and the numbers are checked
 * against its actual vertices.
 */

const GLB = path.join(process.cwd(), 'public', 'xp', 'models', 'cartridge.glb')

/** Every POSITION in the file, in the coordinates three.js will see them in. */
function positions(): { x: number; y: number; z: number }[] {
  const file = readFileSync(GLB)
  const jsonLength = file.readUInt32LE(12)
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8')) as {
    accessors: { bufferView: number; byteOffset?: number; count: number; type: string }[]
    bufferViews: { byteOffset?: number }[]
    meshes: { primitives: { attributes: Record<string, number> }[] }[]
  }

  // The binary chunk starts after the JSON chunk and its own 8-byte header.
  const binary = 20 + jsonLength + 8
  const out: { x: number; y: number; z: number }[] = []

  for (const primitive of json.meshes[0].primitives) {
    const accessor = json.accessors[primitive.attributes.POSITION]
    const view = json.bufferViews[accessor.bufferView]
    const start = binary + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)

    for (let index = 0; index < accessor.count; index += 1) {
      const at = start + index * 12
      out.push({
        x: file.readFloatLE(at),
        y: file.readFloatLE(at + 4),
        z: file.readFloatLE(at + 8),
      })
    }
  }

  return out
}

describe('the cartridge model', () => {
  const points = positions()
  const span = (pick: (p: (typeof points)[number]) => number) => {
    const all = points.map(pick)
    return { min: Math.min(...all), max: Math.max(...all) }
  }

  test('is centred, one unit tall, and the size `CART` says', () => {
    const x = span((p) => p.x)
    const y = span((p) => p.y)
    const z = span((p) => p.z)

    // Centred on every axis, so a shelf can place one by its middle.
    for (const axis of [x, y, z]) {
      expect(Math.abs(axis.min + axis.max)).toBeLessThan(0.001)
    }

    expect(y.max - y.min).toBeCloseTo(1, 3)
    expect(x.max - x.min).toBeCloseTo(CART.width, 3)
    expect(y.max - y.min).toBeCloseTo(CART.height, 3)
    expect(z.max - z.min).toBeCloseTo(CART.depth, 3)
  })

  test('lies flat: the thin axis is depth, and it faces the camera', () => {
    const x = span((p) => p.x)
    const y = span((p) => p.y)
    const z = span((p) => p.z)

    // A cartridge is wider than it is tall and far thinner than either. If a
    // re-export lands on its side this is the assertion that says so.
    expect(x.max - x.min).toBeGreaterThan(y.max - y.min)
    expect(z.max - z.min).toBeLessThan((y.max - y.min) / 3)
  })

  test('the cover plane lands inside the shell, in front of the recess floor', () => {
    const x = span((p) => p.x)
    const y = span((p) => p.y)
    const z = span((p) => p.z)

    // Inside the front face, on both axes.
    expect(LABEL.x - LABEL.width / 2).toBeGreaterThan(x.min)
    expect(LABEL.x + LABEL.width / 2).toBeLessThan(x.max)
    expect(LABEL.y - LABEL.height / 2).toBeGreaterThan(y.min)
    expect(LABEL.y + LABEL.height / 2).toBeLessThan(y.max)

    /*
     * And *inside* the moulding rather than floating off the front of it. The
     * recess is only about five thousandths deep, so this is the assertion that
     * catches a re-export at a different scale: at twice the size the picture
     * would sit half a millimetre proud of the plastic and catch no shadow, and
     * nothing else here would notice.
     */
    expect(LABEL.z).toBeLessThan(z.max)
    expect(LABEL.z).toBeGreaterThan(z.max - CART.depth / 8)
  })
})
