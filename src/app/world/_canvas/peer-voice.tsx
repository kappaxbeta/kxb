'use client'

import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { FACE_HEIGHT } from '@/app/world/_canvas/face-circle'

/**
 * Somebody's voice, coming from where they are standing.
 *
 * ---------------------------------------------------------------------------
 * Positional, and that is the feature rather than a flourish
 * ---------------------------------------------------------------------------
 * A conference call mixes everybody to the same place, so a room can hold
 * exactly one conversation and the second one is called interrupting. Voice
 * that falls off with distance holds as many conversations as the room has
 * corners: you drift toward somebody and you are talking to them, you walk away
 * and it fades, and neither of those needed a control.
 *
 * It is also what makes an open mic tolerable. In a flat mix, everyone hears
 * everything anybody's microphone picks up, forever; with falloff, the blast
 * radius of somebody's keyboard is a few metres of a world.
 *
 * ---------------------------------------------------------------------------
 * Why the audio element exists at all
 * ---------------------------------------------------------------------------
 * `PositionalAudio.setMediaStreamSource` is the documented way to do this and
 * it has a known hole: several browsers will not decode a `MediaStream` fed
 * only into WebAudio, because nothing is "playing" it. The cure everybody
 * arrives at is to also attach the stream to a muted `<audio>` element, which
 * makes the browser pull frames; the element itself is silent and the sound
 * comes out of the graph. Without it this is a speaker that never makes a
 * sound, on exactly the browsers you would want to test on.
 */

/** How far away somebody stops being audible, in cells. */
const EARSHOT = 18

/** Where the falloff starts. Inside this, they are simply at full volume. */
const INTIMATE = 2.5

/**
 * How sharply it falls off between the two.
 *
 * Linear rather than inverse, which is not the physically correct model and is
 * the right one here: inverse falloff is almost all of its range in the first
 * couple of metres, so somebody drifts from clear to inaudible over one step
 * and the middle distance - the one where a room's conversations actually
 * separate - barely exists.
 */
const ROLLOFF = 1

export function PeerVoice({ stream }: { stream: MediaStream }) {
  const holder = useRef<THREE.Group>(null)
  const camera = useThree((three) => three.camera)

  /**
   * Built imperatively rather than as `<positionalAudio>`.
   *
   * Not a style choice: `PositionalAudio` takes its listener as a constructor
   * argument and exposes it read-only afterwards, and the listener is a thing
   * that has to be found-or-made on the camera at the moment this mounts. JSX
   * would need the listener before the effect that creates it has run.
   */
  useEffect(() => {
    const parent = holder.current
    if (!parent) return

    /**
     * One listener on the camera, made once and shared.
     *
     * `THREE.AudioListener` is what turns positions into a stereo image, and it
     * belongs on the thing the person is looking through. A second one would
     * not be twice the ears - the graph takes the last, and the rest sit there
     * holding an AudioContext each.
     */
    let ears = camera.children.find(
      (child): child is THREE.AudioListener => child instanceof THREE.AudioListener,
    )
    if (!ears) {
      ears = new THREE.AudioListener()
      camera.add(ears)
    }

    const node = new THREE.PositionalAudio(ears)
    // At head height, so the stereo image agrees with the face above it. Not
    // leaned toward the listener the way the picture is: a sound source has no
    // front, and moving it closer would flatten the falloff this exists for.
    node.position.set(0, FACE_HEIGHT, 0)
    parent.add(node)

    /**
     * See the header: silent, and the reason the graph gets any frames at all.
     *
     * Parked in the document rather than left detached, which is the same
     * mistake `face-circle` documents for video and worth repeating because it
     * is one line and invisible when wrong: an element outside the document is
     * not reliably decoded, and a pump that is not pulling frames is a speaker
     * that never makes a sound. One transparent pixel in the corner is the
     * price of the audio actually running.
     */
    const pump = document.createElement('audio')
    pump.srcObject = stream
    pump.muted = true
    pump.autoplay = true
    pump.style.position = 'fixed'
    pump.style.top = '0'
    pump.style.left = '0'
    pump.style.width = '1px'
    pump.style.height = '1px'
    pump.style.opacity = '0'
    pump.style.pointerEvents = 'none'
    document.body.append(pump)
    void pump.play().catch(() => {})

    node.setMediaStreamSource(stream)
    node.setRefDistance(INTIMATE)
    node.setMaxDistance(EARSHOT)
    node.setRolloffFactor(ROLLOFF)
    node.setDistanceModel('linear')

    /**
     * The browser's own gate.
     *
     * An AudioContext starts suspended until the person has interacted with the
     * page, and in a world they always have - they clicked to come in. Resumed
     * anyway, because "always" is doing a lot of work in that sentence and the
     * failure is a room where nobody can hear anybody.
     */
    if (ears.context.state === 'suspended') void ears.context.resume().catch(() => {})

    return () => {
      try {
        node.disconnect()
      } catch {
        // Never connected - the stream ended before the graph was built.
      }
      parent.remove(node)
      pump.pause()
      pump.srcObject = null
      pump.remove()
    }
  }, [stream, camera])

  return <group ref={holder} />
}
