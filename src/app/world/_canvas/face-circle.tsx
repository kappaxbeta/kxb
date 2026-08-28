'use client'

import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Somebody's camera, worn as a face.
 *
 * ---------------------------------------------------------------------------
 * Turned to the viewer, not to the front of the body
 * ---------------------------------------------------------------------------
 * There are two honest ways to hang a picture on an animal. It can be fixed to
 * the head, facing the way the body faces - which is truthful, and means you
 * see the back of somebody's head when they turn round, exactly as you would in
 * a room. Or it can turn to whoever is looking, like the nameplate above it.
 *
 * This does the second, because the question it was built to answer is whether
 * a face reads at all on these bodies, and the first arrangement answers it
 * only while somebody happens to be looking at you. It is also why the disc is
 * pushed *toward* the camera rather than centred on the head: a flat circle
 * standing in the middle of a skull is half inside it from every angle, and the
 * fix is a third of a metre of air rather than turning depth testing off.
 *
 * Levelled to the horizon on the way - the lean follows the viewer around the
 * body but never above or below it. A face that tips back when you look up at
 * somebody on a roof reads as a sticker on the lens.
 */

/**
 * How high the disc floats. Eye height is 1.7.
 *
 * Above the head rather than level with it. Measured by eye against the animals
 * rather than derived: they are not one shape, and the tallest of them - a lion
 * with a mane - has a head wide enough that a disc at eye height sits *inside*
 * it and comes out half occluded, which reads as a bug rather than as a face.
 */
export const FACE_HEIGHT = 2.0

/** Drawn a little narrower than the nameplate above it. */
export const FACE_RADIUS = 0.32

/**
 * How far in front of the head the disc floats.
 *
 * Enough to clear the widest head in the pack from any angle. Too little and
 * the head eats an edge of the picture as you walk round somebody - the failure
 * is not subtle and it is not symmetric, so it shows up as a face that is
 * whole from one side and bitten from the other.
 */
const LEAN = 0.62

/**
 * Scratch for working out where the disc goes.
 *
 * Module level, and shared by every face in the room, which is safe for the
 * narrow reason that `self-avatar` gives for *not* sharing its own: nothing
 * here is held across a frame or read after an await. Each face fills both
 * vectors and consumes them inside one synchronous callback, so the next face's
 * turn starts from a clean slate whatever the previous one did.
 */
const FACE_ANCHOR = new THREE.Vector3()
const FACE_AIM = new THREE.Vector3()

/** The rim, as a fraction of the picture. */
const RIM = 1.08

/**
 * A video element for a stream, parked off-screen.
 *
 * `display: none` would be the obvious way to hide it and is the one thing that
 * cannot be done: a hidden element is allowed to stop decoding, and a texture
 * fed by a video that is not decoding is a face frozen on whatever frame it
 * stopped at - which reads as somebody sitting very still rather than as a bug.
 * One transparent pixel in the corner is the price of the video actually
 * running.
 */
function playable(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video')

  // Both before `play()`. Muted autoplay is the only autoplay a browser allows
  // without a gesture, and `playsinline` is what stops iOS taking the picture
  // fullscreen the moment it starts.
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('muted', '')
  video.autoplay = true

  video.srcObject = stream

  video.style.position = 'fixed'
  video.style.top = '0'
  video.style.left = '0'
  video.style.width = '1px'
  video.style.height = '1px'
  video.style.opacity = '0'
  video.style.pointerEvents = 'none'
  document.body.append(video)

  // A rejected play is a picture that never starts, not a scene that falls
  // over. The watchdog on the connection cannot help with this one, so it is
  // simply the failure: no face, everything else in the room unaffected.
  void video.play().catch(() => {})

  return video
}

export function FaceCircle({
  stream,
  height = FACE_HEIGHT,
  radius = FACE_RADIUS,
}: {
  stream: MediaStream
  height?: number
  radius?: number
}) {
  const anchor = useRef<THREE.Group>(null)
  const surface = useRef<THREE.MeshBasicMaterial>(null)

  /**
   * The picture is hung imperatively, and there is no state here at all.
   *
   * The same discipline as `<HealthBar>`: the mesh is built once, starts
   * invisible, and an effect fills in the texture and reveals it. Through React
   * it would be a `MediaStream` in a state value - a live handle to a camera,
   * owned by a reconciler that is entitled to throw its own memos away and
   * recompute them, which is a `<video>` left decoding in the document with
   * nothing drawing it. It would also re-render a body on a frame where the
   * only news is that a face arrived.
   */
  useEffect(() => {
    const material = surface.current
    // Captured rather than read again in the cleanup: both are set by React
    // before this runs and neither is replaced for the life of the component,
    // and reading a ref on the way out is the mistake the rule is named for.
    const node = anchor.current
    if (!material) return

    const video = playable(stream)
    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    // No mipmaps, matching the nameplate: the disc is always roughly
    // screen-facing at roughly one size, and building a chain per frame for a
    // video texture is work with nothing to show for it.
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false

    material.map = texture
    material.needsUpdate = true

    /**
     * The square in the middle of the picture.
     *
     * A camera hands back 4:3 or 16:9 and the disc's own coordinates span a
     * square, so without this a face is stretched sideways by a third. Cropping
     * rather than letterboxing because the alternative is bars inside a circle,
     * and because the middle of a webcam picture is reliably the part with the
     * person in it.
     *
     * It is also what reveals the disc: until the video has said how big it is
     * there is no crop to apply, and a circle of undecoded black over somebody's
     * head is worse than a body with no face on it yet.
     */
    const crop = () => {
      const width = video.videoWidth
      const tall = video.videoHeight
      if (!width || !tall) return

      if (width > tall) {
        const keep = tall / width
        texture.repeat.set(keep, 1)
        texture.offset.set((1 - keep) / 2, 0)
      } else {
        const keep = width / tall
        texture.repeat.set(1, keep)
        texture.offset.set(0, (1 - keep) / 2)
      }

      if (node) node.visible = true
    }

    crop()
    video.addEventListener('loadedmetadata', crop)
    // A camera that changes resolution mid-call - a phone rotating, a track
    // renegotiated down under congestion - is a new crop, not a new face.
    video.addEventListener('resize', crop)

    return () => {
      if (node) node.visible = false
      video.removeEventListener('loadedmetadata', crop)
      video.removeEventListener('resize', crop)

      material.map = null
      material.needsUpdate = true
      texture.dispose()

      video.pause()
      // The stream belongs to whoever opened it - the store for our own camera,
      // the peer connection for everybody else's. Letting go of it here rather
      // than stopping its tracks is the difference between this component
      // unmounting and somebody's camera switching off.
      video.srcObject = null
      video.remove()
    }
  }, [stream])

  useFrame(({ camera }) => {
    const node = anchor.current
    const parent = node?.parent
    if (!node || !parent) return

    // The body's own frame loop moved it this frame; without this the face
    // trails it by one, which at a run is a face sliding off the front of an
    // animal.
    parent.updateWorldMatrix(true, false)

    const head = FACE_ANCHOR
    const aim = FACE_AIM
    parent.getWorldPosition(head)
    head.y += height

    aim.copy(camera.position).sub(head)
    // Levelled - see the header.
    aim.y = 0
    if (aim.lengthSq() < 1e-6) return

    aim.normalize().multiplyScalar(LEAN)
    head.add(aim)

    parent.worldToLocal(head)
    node.position.copy(head)
  })

  return (
    <group ref={anchor} visible={false}>
      <Billboard>
        {/* The rim first and behind, so the picture is never drawn over it. */}
        <mesh position={[0, 0, -0.002]} userData={{ ignoreRay: true }} renderOrder={11}>
          <circleGeometry args={[radius * RIM, 40]} />
          <meshBasicMaterial color="#0b0f14" toneMapped={false} />
        </mesh>

        {/*
          Depth testing left on, unlike the nameplate.
          A name is a label and should be readable through a wall; a face is a
          person, and seeing one through the floor above you is not a feature.
        */}
        <mesh userData={{ ignoreRay: true }} renderOrder={12}>
          <circleGeometry args={[radius, 40]} />
          <meshBasicMaterial ref={surface} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  )
}
