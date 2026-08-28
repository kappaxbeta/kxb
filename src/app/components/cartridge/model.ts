import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type * as THREE from 'three'

/**
 * The cartridge, and the two numbers everything else on the shelf is derived
 * from.
 *
 * ---------------------------------------------------------------------------
 * Where these came from
 * ---------------------------------------------------------------------------
 * `Cartridge.obj` arrived out of Cinema 4D at an arbitrary rotation and a scale
 * of several hundred units, with the edge connector running up one *side*. It
 * was aligned by taking the three dominant face-normal clusters - which for a
 * moulded shell are exactly the front, the sides and the top, and came out
 * orthogonal to five decimal places - turned a quarter so the pins sit along
 * the bottom where a console would read them, centred, and scaled so the shell
 * is one unit tall. Then exported as GLB.
 *
 * So the numbers below are *measured off the mesh*, not chosen. They are in the
 * file because the cover art is a separate plane rather than a remapped UV, and
 * a plane has to be told exactly where the recess is.
 *
 * ---------------------------------------------------------------------------
 * Why the cover is a plane and not a texture on the model
 * ---------------------------------------------------------------------------
 * The shell's own UVs are a Cinema 4D unwrap: fine for tiling a grain across
 * the plastic, useless for landing a rectangular picture inside one recess. A
 * plane floating half a millimetre above the recess floor is a rectangle we
 * control completely, it takes any aspect the picture happens to be, and it
 * costs two triangles.
 */

export const CARTRIDGE_MODEL = '/xp/models/cartridge.glb'

/** The shell's own extent, in the units the GLB is authored in. */
export const CART = { width: 1.1697, height: 1, depth: 0.2045 } as const

/**
 * The label recess, which is where a cover goes.
 *
 * Off-centre, and deliberately left that way: the moulding has the sticker well
 * to the left of the shell with the right shoulder plain, and a cover centred
 * over the whole face would sit half on the plastic. `z` is the recess floor
 * plus a whisker - the outer face is at 0.1023, so the picture is still sunk
 * inside the moulding and catches its shadow.
 */
export const LABEL = {
  x: -0.20805,
  y: 0.13685,
  z: 0.0975,
  width: 0.7413,
  height: 0.4701,
} as const

/** The recess aspect, so a cover can be cropped to it rather than squashed. */
export const LABEL_ASPECT = LABEL.width / LABEL.height

interface CartridgeParts {
  /** The moulded body. Every face that is not the sticker well. */
  shell: THREE.BufferGeometry
  /** The recessed plate: the well itself, and the pin comb along the bottom. */
  plate: THREE.BufferGeometry
}

/**
 * The two halves of the shell, keyed by the material the .mtl named them.
 *
 * By name rather than by index, because a re-export from Blender is free to
 * reorder primitives and a shelf that silently swapped its plastic for its
 * label plate would be a very confusing morning.
 */
export function useCartridgeParts(): CartridgeParts | null {
  const { scene } = useGLTF(CARTRIDGE_MODEL)

  return useMemo(() => {
    const found: Record<string, THREE.BufferGeometry> = {}

    scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const material = mesh.material as THREE.Material | THREE.Material[]
      const name = Array.isArray(material) ? material[0]?.name : material?.name
      if (name) found[name] = mesh.geometry
    })

    const shell = found.Grey
    const plate = found.White
    if (!shell || !plate) return null

    return { shell, plate }
  }, [scene])
}

useGLTF.preload(CARTRIDGE_MODEL)
