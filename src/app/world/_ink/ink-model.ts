import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

import { extrude, type ExtrudeOptions } from '@/app/world/_ink/extrude'
import type { Note } from '@/domain/ink/note'

/**
 * The drawing, as a file somebody else's software can open.
 *
 * A second scene rather than the one on screen, and the difference is the whole
 * reason this file exists: what you are looking at is drawn with an additive
 * shader that means nothing outside this app - export it and every other
 * program sees an untextured surface with a custom material it cannot compile.
 * So the export is built from the same geometry with a *standard* material,
 * coloured and emissive, which is the nearest thing glTF has to "this is made
 * of light".
 *
 * Everything else follows from that: the walls are the same walls, so a model
 * dropped into Blender lines up with what the slider showed, and the file has
 * no dependency on anything in this repository.
 */
export async function glbOf(
  note: Note,
  options: ExtrudeOptions,
  name = 'xoinggan',
): Promise<Blob> {
  const group = new THREE.Group()
  group.name = name

  for (const wall of extrude(note, options)) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(wall.positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(wall.uvs, 2))
    // Flat walls have no normals of their own until somebody asks for them, and
    // a model with none lights as a silhouette in most viewers.
    geometry.computeVertexNormals()

    const colour = new THREE.Color().setHSL(((wall.hue % 360) + 360) % 360 / 360, 0.85, 0.6)
    group.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: colour,
          emissive: colour,
          emissiveIntensity: 1.4,
          roughness: 0.35,
          metalness: 0,
          // A wall is a surface with no inside; seen from behind it would
          // otherwise disappear, which is exactly where somebody will orbit to.
          side: THREE.DoubleSide,
        }),
      ),
    )
  }

  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(group, { binary: true })
  const bytes = result instanceof ArrayBuffer ? result : new TextEncoder().encode(JSON.stringify(result))
  return new Blob([bytes as BlobPart], { type: 'model/gltf-binary' })
}

/**
 * Hand a blob to the browser as a download.
 *
 * The object URL is revoked on the next tick rather than immediately: some
 * browsers have not finished reading it when `click()` returns, and a revoked
 * URL is a download that silently produces nothing.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
