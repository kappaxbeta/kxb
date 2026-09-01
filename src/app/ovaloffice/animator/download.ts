import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { type AnimationDoc, type Pose, bake } from '@/domain/animator/clip'
/**
 * The clip builder moved to `@/app/world/_canvas/baked-clip` when a world
 * wanted one too - re-exported here because this file's callers had it from
 * here, and because two builders of one object is how a downloaded clip and a
 * played clip start disagreeing about the root.
 */
export { toClip } from '@/app/world/_canvas/baked-clip'
import { toClip } from '@/app/world/_canvas/baked-clip'

/**
 * Getting the animation out of the browser.
 *
 * Two files, and they are for different things.
 *
 * The `.glb` is the *result*: the dummy with the clip inside it, which is what
 * every other model in this codebase already is and what `useAnimations` will
 * play by name without anything else being written. Drop it in `public/xo` and
 * it works exactly like the animal pack does.
 *
 * The `.json` is the *working file*: keys, easing, frame rate. A GLB cannot be
 * reopened for editing without guessing back the keys from baked samples, so
 * the editable thing has to be its own file. Same bargain the world builder
 * makes, and for the same reason - see the note there about a document with no
 * table behind it.
 */

/**
 * The baked samples, as a three.js clip.
 *
 * Track names are `<bone>.quaternion`, which is what binds a track to a node
 * by name at play time - so the bone half has to be the name the *loaded*
 * scene uses, `upperarml`, not the `upperarm.l` the source file spells. That
 * is exactly what `BakedClip.bones` is keyed by, because the pose it came from
 * was captured off live objects. See the note on naming in
 * `@/domain/animator/rig`; getting this wrong is silent in both directions.
 *
 * It also means the GLB written here names its nodes without the dots, which
 * is the only spelling three can bind a track to anyway.
 */

/**
 * The model and the clip, as one `.glb`.
 *
 * The rig is put back into its bind pose first and restored afterwards.
 * The exporter writes each node's *current* transform as that node's resting
 * transform, so exporting mid-pose would bake whatever frame happened to be
 * under the playhead into the model itself - invisible while the clip plays
 * over the top of it, and glaringly wrong the moment anything cross-fades to
 * or from it.
 */
export async function exportGlb(
  root: THREE.Object3D,
  doc: AnimationDoc,
  rest: Pose,
  apply: (pose: Pose) => void,
  current: Pose,
): Promise<Blob> {
  const clip = toClip(bake(doc, rest))

  apply(rest)
  try {
    const gltf = await new GLTFExporter().parseAsync(root, {
      binary: true,
      animations: [clip],
      // Skinning and morph targets both ride on the mesh, and dropping either
      // would export a puppet with no strings.
      includeCustomExtensions: false,
    })
    return new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' })
  } finally {
    // Even if the exporter threw. Leaving the editor stuck in its bind pose
    // after a failed save would look like the failure lost the work.
    apply(current)
  }
}

/** A safe-ish file stem from whatever the clip is called. */
export function fileStem(name: string): string {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stem || 'clip'
}

export function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // The object URL holds the blob alive until it is let go, and a GLB of a
  // skinned model is not small. The delay is for Safari, which has been known
  // to cancel a download whose URL is revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function saveDoc(doc: AnimationDoc): void {
  save(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${fileStem(doc.name)}.animation.json`)
}
