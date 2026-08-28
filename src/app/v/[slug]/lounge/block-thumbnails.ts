'use client'

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { modelUrl } from '@/domain/lounge/palette'

/**
 * Renders each block model to a PNG data URL, once per session.
 *
 * The obvious approach - a little <Canvas> per palette tile - does not work.
 * Browsers cap simultaneous WebGL contexts at around 16 and start silently
 * discarding the oldest, so 58 tiles would blank most of themselves out. The
 * approach after that - shipping pre-rendered PNGs in the repo - means a build
 * step and 58 files that go stale the moment the asset pack changes.
 *
 * So: one offscreen renderer, used to draw every model in turn, torn down when
 * finished. The images are cached in memory for the session. Regenerating on
 * the next page load costs a few hundred milliseconds and is always correct,
 * which is the better trade for something nobody sees loading.
 */

const THUMBNAIL_SIZE = 128

/** Session cache. Keyed by model id. */
const cache = new Map<string, string>()

export function getCachedThumbnail(model: string): string | undefined {
  return cache.get(model)
}

/**
 * Draw thumbnails for `models`, reporting each as it finishes.
 *
 * Progressive by design: the picker shows tiles filling in rather than a blank
 * grid followed by everything at once, and yielding between models keeps the
 * main thread responsive while the 3D scene behind it is still rendering.
 */
export async function generateThumbnails(
  models: readonly string[],
  onThumbnail: (model: string, dataUrl: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const pending = models.filter((model) => !cache.has(model))

  // Serve whatever is already cached before doing any work.
  for (const model of models) {
    const cached = cache.get(model)
    if (cached) onThumbnail(model, cached)
  }
  if (pending.length === 0) return

  const canvas = document.createElement('canvas')
  canvas.width = THUMBNAIL_SIZE
  canvas.height = THUMBNAIL_SIZE

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    // Required for toDataURL: without it the drawing buffer is cleared after
    // each frame and the read comes back empty.
    preserveDrawingBuffer: true,
  })
  renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false)
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()

  // Flat, even lighting. A thumbnail is an icon, not a render - readable
  // silhouette and true colours beat drama at 128px.
  scene.add(new THREE.AmbientLight(0xffffff, 2.2))
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(3, 5, 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xdfe6ff, 1.1)
  fill.position.set(-4, 1, -3)
  scene.add(fill)

  // Models are 2 units cubed (see BLOCK_SCALE), so this frames a 2-unit box
  // with a little padding, from the three-quarter angle that reads as "block".
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(4.2, 3.4, 4.2)
  camera.lookAt(0, 0, 0)

  const loader = new GLTFLoader()

  try {
    for (const model of pending) {
      if (signal?.aborted) return

      let loaded: THREE.Group
      try {
        const gltf = await loader.loadAsync(modelUrl(model))
        loaded = gltf.scene
      } catch {
        // A missing or malformed model should cost that one tile, not the
        // whole picker.
        continue
      }

      if (signal?.aborted) return

      // Centre on the origin. Several models are authored slightly off-centre
      // (props especially), and without this they drift around their tiles.
      const box = new THREE.Box3().setFromObject(loaded)
      const centre = box.getCenter(new THREE.Vector3())
      loaded.position.sub(centre)

      scene.add(loaded)
      renderer.render(scene, camera)
      const dataUrl = canvas.toDataURL('image/png')
      scene.remove(loaded)

      disposeTree(loaded)

      cache.set(model, dataUrl)
      onThumbnail(model, dataUrl)

      // Hand the frame back so the picker can paint what it has so far.
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  } finally {
    // Contexts are a scarce resource and the main scene needs one. Releasing
    // this explicitly rather than waiting for GC matters on mobile, where the
    // cap is lower.
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

/** Free the GPU memory a loaded model holds. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return

    mesh.geometry?.dispose()
    const material = mesh.material
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose()
    } else {
      material?.dispose()
    }
  })
}
