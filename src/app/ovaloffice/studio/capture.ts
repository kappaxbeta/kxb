'use client'

import type * as THREE from 'three'

/**
 * One frame, at the delivered size, as a PNG data URL.
 *
 * Lifted out of the scene editor so the world builder draws its exports through
 * the same code. Both surfaces have the same problem: the viewport is whatever
 * size the panel left it and the export is whatever the output fields say, so
 * the renderer has to be resized, drawn, read back and put straight again.
 *
 * `updateStyle: false` keeps the canvas element's CSS size untouched through
 * all of it, so the picture on screen does not jump while the shutter fires.
 * Pixel ratio 1, because the size asked for is the size delivered: at the
 * screen's ratio a 1600px export comes back 3200px wide on a retina display,
 * which is a surprise nobody wants in a filename that says 1600.
 *
 * The canvas must have been created with `preserveDrawingBuffer`. Without it
 * the colour buffer may be discarded after a draw and `toDataURL` reads back a
 * transparent rectangle on most drivers.
 */
export interface CaptureParts {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
}

export function capturePng(parts: CaptureParts, width: number, height: number): string {
  const { gl, scene, camera } = parts

  const previousSize = { x: gl.domElement.width, y: gl.domElement.height }
  const previousRatio = gl.getPixelRatio()
  const previousAspect = camera.aspect

  gl.setPixelRatio(1)
  gl.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  gl.render(scene, camera)

  const dataUrl = gl.domElement.toDataURL('image/png')

  gl.setPixelRatio(previousRatio)
  gl.setSize(previousSize.x / previousRatio, previousSize.y / previousRatio, false)
  camera.aspect = previousAspect
  camera.updateProjectionMatrix()
  gl.render(scene, camera)

  return dataUrl
}

/** How wide a saved scene's thumbnail is. Two cards across on a phone, retina. */
export const POSTER_WIDTH = 480

/**
 * The card picture for a saved scene.
 *
 * JPEG rather than PNG, and this is the one place in the studio where that is
 * right. Every other export here is a PNG because it is an artefact - a
 * transparent cut-out, a master to re-encode - and this is a thumbnail that
 * lives in a database row and is sent down with every listing. A 480px PNG of a
 * flat-shaded scene is a couple of hundred kilobytes; the same frame at JPEG
 * 0.72 is under twenty, and nobody is going to notice the difference at the
 * size a card draws it.
 *
 * The transparency that costs is not missed either: a poster is composited over
 * the shot's own backdrop, which is opaque by definition - see the note on
 * `Backdrop` about video having no alpha channel.
 */
export function capturePoster(parts: CaptureParts, aspect: number): string {
  const { gl, scene, camera } = parts

  const previousSize = { x: gl.domElement.width, y: gl.domElement.height }
  const previousRatio = gl.getPixelRatio()
  const previousAspect = camera.aspect

  const height = Math.max(1, Math.round(POSTER_WIDTH / aspect))

  gl.setPixelRatio(1)
  gl.setSize(POSTER_WIDTH, height, false)
  camera.aspect = aspect
  camera.updateProjectionMatrix()
  gl.render(scene, camera)

  const dataUrl = gl.domElement.toDataURL('image/jpeg', 0.72)

  gl.setPixelRatio(previousRatio)
  gl.setSize(previousSize.x / previousRatio, previousSize.y / previousRatio, false)
  camera.aspect = previousAspect
  camera.updateProjectionMatrix()
  gl.render(scene, camera)

  return dataUrl
}

/**
 * Hand bytes to the browser and let it save them.
 *
 * There is already a route that writes into `public/xo/scenes` - it is how
 * `scripts/shoot-scenes.ts` bakes the fixed set - and it is deliberately
 * dev-only: a running production server must not be able to write into its own
 * static directory, and in a container there is no repo to write into anyway.
 * The backoffice is a production surface, so the download is the whole
 * mechanism and it works identically in both places.
 */
export function download(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}

/** The same, for a document rather than a picture. */
export function downloadText(text: string, filename: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  download(url, filename)
  // Revoked on the next turn: revoking synchronously races the click on Safari,
  // which reads the blob after the handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
