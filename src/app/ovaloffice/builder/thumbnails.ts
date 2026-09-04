'use client'

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { placementUrl } from '@/domain/builder/props'

/**
 * Pictures of models, drawn on demand.
 *
 * The lounge's block picker does this for 58 blocks by rendering all of them on
 * first open (see `@/app/world/lounge/block-thumbnails`), which takes a few
 * hundred milliseconds and is the right trade at that size. It is not the right
 * trade at 1308: the same approach here would download every glTF we ship - a
 * few hundred megabytes - to fill a grid of which twenty tiles are on screen.
 *
 * So this one is a queue. The picker asks for the tiles that scrolled into
 * view, they are drawn in the order asked for, and the cache keeps them for the
 * session. Scrolling fast enqueues and abandons hundreds of requests, which is
 * why `request` is cheap and cancellation is by dropping the callback rather
 * than by tearing anything down.
 *
 * One renderer for the whole session, not one per batch. Browsers cap
 * simultaneous WebGL contexts at around sixteen and start silently discarding
 * the oldest - and the main editor scene is holding one of those the entire
 * time this is running.
 */

const SIZE = 96

/** Session cache, model id to data URL. */
const cache = new Map<string, string>()

/** Models that could not be drawn, so a broken one is not retried on every scroll. */
const failed = new Set<string>()

export function cachedThumbnail(model: string): string | undefined {
  return cache.get(model)
}

type Listener = (model: string, dataUrl: string) => void

/** Model ids waiting to be drawn, most recently asked for first. */
const queue: string[] = []
const listeners = new Set<Listener>()
let running = false

/**
 * The shared renderer, built on first use.
 *
 * Kept alive rather than torn down between batches: creating and destroying a
 * WebGL context per batch is expensive enough to be visible as a stutter in the
 * editor's own canvas, which is a different context on the same GPU.
 */
let parts: {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
  loader: GLTFLoader
} | null = null

function setup() {
  if (parts) return parts

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    // Required for toDataURL: without it the drawing buffer may be cleared
    // after each frame and the read comes back empty.
    preserveDrawingBuffer: true,
  })
  renderer.setSize(SIZE, SIZE, false)
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  // Flat, even lighting. A thumbnail is an icon, not a render - readable
  // silhouette and true colours beat drama at 96px.
  scene.add(new THREE.AmbientLight(0xffffff, 2.2))
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(3, 5, 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xdfe6ff, 1.1)
  fill.position.set(-4, 1, -3)
  scene.add(fill)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

  parts = { renderer, scene, camera, canvas, loader: new GLTFLoader() }
  return parts
}

/**
 * Draw one model, centred and framed to whatever size it happens to be.
 *
 * The lounge's version can hard-code a camera because every model it draws is
 * the same two-unit cube. Here a tile might be a lamp post or a teaspoon, so
 * the camera is placed from the model's own bounding box - otherwise half the
 * catalogue is a speck and the other half overflows its tile.
 */
async function draw(model: string): Promise<string | null> {
  const { renderer, scene, camera, canvas, loader } = setup()
  const url = placementUrl(model)
  if (!url) return null

  let loaded: THREE.Object3D
  try {
    loaded = (await loader.loadAsync(url)).scene
  } catch {
    return null
  }

  const box = new THREE.Box3().setFromObject(loaded)
  const centre = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y, size.z) || 1

  loaded.position.sub(centre)
  scene.add(loaded)

  // The three-quarter angle that reads as "a thing", at whatever distance fits
  // this particular thing. The 1.9 is the fudge that leaves a little air around
  // the silhouette instead of cropping it at the tile's edge.
  const distance = extent * 1.9
  camera.position.set(distance, distance * 0.8, distance)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()

  renderer.render(scene, camera)
  const dataUrl = canvas.toDataURL('image/png')

  scene.remove(loaded)
  dispose(loaded)

  return dataUrl
}

async function pump(): Promise<void> {
  if (running) return
  running = true

  try {
    while (queue.length > 0) {
      // Popped from the end: the picker pushes what scrolled into view, so the
      // most recent request is the one the user is actually looking at. A queue
      // drained from the front fills the tiles somebody scrolled past ten
      // seconds ago while the visible ones stay blank.
      const model = queue.pop()
      if (!model || cache.has(model) || failed.has(model)) continue

      const dataUrl = await draw(model)
      if (dataUrl === null) {
        failed.add(model)
        continue
      }

      cache.set(model, dataUrl)
      for (const listener of listeners) listener(model, dataUrl)

      // Hand the frame back, so the picker paints what it has and the editor's
      // own canvas keeps moving. Without this a scroll through the catalogue
      // locks the page for as long as the queue is long.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } finally {
    running = false
  }
}

/**
 * Ask for a model's picture.
 *
 * Returns nothing. The answer arrives through `subscribe`, because by the time
 * it is ready the tile that asked may have been scrolled away and unmounted -
 * and a promise per tile would mean a thousand pending promises resolving into
 * unmounted components.
 */
export function request(model: string): void {
  if (cache.has(model) || failed.has(model) || queue.includes(model)) return
  queue.push(model)
  void pump()
}

/** Hear about every thumbnail as it finishes. Returns the unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Drop everything still waiting. Called when the picker closes. */
export function clearQueue(): void {
  queue.length = 0
}

function dispose(root: THREE.Object3D): void {
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
