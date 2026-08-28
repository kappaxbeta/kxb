'use client'

import { useSyncExternalStore } from 'react'

/**
 * Cameras: yours, and everybody else's as they arrive.
 *
 * A module store on the same terms as `here-store`, and for the same reason
 * read in both directions at once. The HUD owns the switch and lives outside
 * the canvas; the bodies that wear the pictures live inside it; the thing that
 * negotiates the connections is a hook hanging off the scene. Three surfaces,
 * one fact, and no ancestor common to all of them worth threading a provider
 * through.
 *
 * It also has to survive a re-render without touching a `MediaStream`. A stream
 * is a live handle to a camera - putting one in React state and letting a
 * reconciliation decide when it is replaced is how you get a second permission
 * prompt, or a light that stays on after the switch says off. Here the stream
 * is a value in a `Map`, and React is told that the value changed rather than
 * being asked to own it.
 *
 * Ephemeral by construction, like every other store here: nothing is persisted,
 * nothing rehydrates, and a tab that closes takes its camera with it.
 */

/**
 * What the switch can say.
 *
 * `denied` and `missing` are separate because the fix is different and the
 * person is the one who has to apply it: a refused permission is a decision to
 * change in the browser, a missing device is a camera to plug in. A single
 * "off, sorry" would send half the people who hit it to the wrong place.
 */
export type CameraState = 'off' | 'asking' | 'on' | 'denied' | 'missing'

/**
 * What we ask the camera for.
 *
 * Small on purpose, and the number that matters is not the bandwidth - it is
 * the texture upload. Every one of these streams becomes a `VideoTexture` that
 * is pushed to the GPU on the frames it has new pixels, in a scene that is
 * already fill-rate bound. 320x240 at 15fps is a face at the size a face is
 * drawn here, and asking for 720p to then draw it 60 pixels across would be
 * paying for the decode twice over.
 *
 * No audio. Voice in a world is a design rather than a constraint - who is
 * audible, from how far, and whether it is push-to-talk - and answering it
 * badly by accident, because `audio: true` was easier to type, would be a worse
 * outcome than not having it.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 320 },
    height: { ideal: 240 },
    frameRate: { ideal: 15, max: 24 },
    facingMode: 'user',
  },
  audio: false,
}

/**
 * What we ask the microphone for.
 *
 * Echo cancellation is the one that is not optional. Two people in one room
 * with speakers on is a feedback loop, and the person it deafens is not the
 * one who could have prevented it. Noise suppression and gain control are the
 * browser's own, and better than anything worth writing here.
 */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
}

let state: CameraState = 'off'
let local: MediaStream | null = null
let faces = new Map<string, MediaStream>()

let mic: CameraState = 'off'
let voice: MediaStream | null = null
let voices = new Map<string, MediaStream>()

const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The switch, for the HUD. */
export function useCamera(): CameraState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    // Always off on the server: there is no camera there, and rendering the
    // button as on for one commit would flash a state nobody chose.
    () => 'off' as const,
  )
}

/** Our own picture, for the mirror. */
export function useLocalFace(): MediaStream | null {
  return useSyncExternalStore(subscribe, () => local, () => null)
}

/**
 * One person's picture, or nothing.
 *
 * Keyed by user rather than by connection, because what reads this is a body,
 * and presence draws one body per person however many tabs they have open. Two
 * tabs of the same account both broadcasting therefore end up as one picture -
 * whichever connected last - which is the correct amount of effort to spend on
 * a case that only happens while somebody is testing this.
 */
export function useFace(userId: string): MediaStream | null {
  return useSyncExternalStore(
    subscribe,
    () => faces.get(userId) ?? null,
    () => null,
  )
}

/** Whether anybody in the room has a picture. */
export function useAnyFace(): boolean {
  return useSyncExternalStore(subscribe, () => faces.size > 0, () => false)
}

export function cameraState(): CameraState {
  return state
}

/** The mic switch, for the HUD. */
export function useMic(): CameraState {
  return useSyncExternalStore(subscribe, () => mic, () => 'off' as const)
}

export function micState(): CameraState {
  return mic
}

/** Our own microphone, or nothing. */
export function localVoice(): MediaStream | null {
  return voice
}

/** One person's voice, for the speaker standing where their body is. */
export function useVoice(userId: string): MediaStream | null {
  return useSyncExternalStore(
    subscribe,
    () => voices.get(userId) ?? null,
    () => null,
  )
}

export function localFace(): MediaStream | null {
  return local
}

/**
 * Ask for the camera.
 *
 * The prompt is the reason this is a function somebody presses rather than
 * something the scene does on mount: a world that asks for your camera because
 * you walked into it has asked the wrong question.
 */
export async function startCamera(): Promise<MediaStream | null> {
  if (state === 'on' && local) return local
  if (state === 'asking') return null

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    // No `mediaDevices` at all is the insecure-origin case as often as it is an
    // old browser - it is absent outside https and localhost.
    state = 'missing'
    announce()
    return null
  }

  state = 'asking'
  announce()

  try {
    const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)

    // Switched off again while the prompt was up. Rare, and it happens: the
    // prompt is modal to the page but not to the person. Without this the
    // camera light comes on after they have already changed their mind.
    if (state !== 'asking') {
      for (const track of stream.getTracks()) track.stop()
      return null
    }

    local = stream
    state = 'on'
    announce()

    /**
     * The other way a camera stops: the person revoked it, unplugged it, or the
     * system took it for something else. Nothing else would notice - the tracks
     * simply stop producing frames and the circle freezes on the last one,
     * which reads as somebody sitting very still rather than as a camera that
     * is off.
     */
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (local === stream) stopCamera()
      })
    }

    return stream
  } catch (error) {
    state =
      error instanceof DOMException && error.name === 'NotFoundError'
        ? 'missing'
        : 'denied'
    announce()
    return null
  }
}

/** Give the camera back. The light goes out here and nowhere else. */
export function stopCamera(): void {
  if (local) {
    for (const track of local.getTracks()) track.stop()
  }
  local = null
  // Back to plain `off` rather than keeping `denied`: pressing the button again
  // should be allowed to ask again, and a browser that remembered the refusal
  // will simply refuse again without a prompt.
  state = 'off'
  announce()
}

export async function toggleCamera(): Promise<void> {
  if (state === 'on' || state === 'asking') {
    stopCamera()
    return
  }
  await startCamera()
}

/**
 * Ask for the microphone.
 *
 * The twin of `startCamera` and deliberately a separate switch. Plenty of
 * people want to be heard and not seen, and rather more want the reverse; one
 * control for both would make each of those a choice to give something up.
 *
 * What it does *not* decide is whether the mic is live - see `micIsLive` in
 * `@/lib/controls/voice-mode`. In push-to-talk this opens the device and sends
 * nothing until a key is held.
 */
export async function startMic(): Promise<MediaStream | null> {
  if (mic === 'on' && voice) return voice
  if (mic === 'asking') return null

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    mic = 'missing'
    announce()
    return null
  }

  mic = 'asking'
  announce()

  try {
    const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)

    // Switched off again while the prompt was up - see the same guard in
    // `startCamera`. Worse here than there: a microphone nobody meant to open.
    if (mic !== 'asking') {
      for (const track of stream.getTracks()) track.stop()
      return null
    }

    /**
     * Silent until something says otherwise.
     *
     * The device is open the moment this resolves, and in push-to-talk that is
     * exactly the moment nothing should be audible. Starting enabled and
     * switching off a frame later is a frame of a room somebody did not agree
     * to send.
     */
    for (const track of stream.getAudioTracks()) track.enabled = false

    voice = stream
    mic = 'on'
    announce()

    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (voice === stream) stopMic()
      })
    }

    return stream
  } catch (error) {
    mic =
      error instanceof DOMException && error.name === 'NotFoundError'
        ? 'missing'
        : 'denied'
    announce()
    return null
  }
}

/** Give the microphone back. */
export function stopMic(): void {
  if (voice) {
    for (const track of voice.getTracks()) track.stop()
  }
  voice = null
  mic = 'off'
  announce()
}

export async function toggleMic(): Promise<void> {
  if (mic === 'on' || mic === 'asking') {
    stopMic()
    return
  }
  await startMic()
}

/**
 * Open the mic, or close it, without giving the device back.
 *
 * `track.enabled` rather than `replaceTrack`, because this is pressed and
 * released many times a minute and has to be instant: toggling a flag on a
 * track that is already negotiated takes effect on the next packet, while
 * swapping a track is a round of plumbing per press.
 *
 * It is a real gate and not a volume control. A disabled track transmits
 * silence rather than sound somebody else can turn up, which is the property
 * push-to-talk is *for* - muting on the far end would still put the room on the
 * wire.
 */
export function setMicLive(live: boolean): void {
  if (!voice) return
  let changed = false
  for (const track of voice.getAudioTracks()) {
    if (track.enabled === live) continue
    track.enabled = live
    changed = true
  }
  if (changed) announce()
}

/** Whether the mic is passing sound this instant. Drives the HUD's dot. */
export function micLive(): boolean {
  return Boolean(voice?.getAudioTracks().some((track) => track.enabled))
}

export function useMicLive(): boolean {
  return useSyncExternalStore(subscribe, micLive, () => false)
}

/** Somebody's voice arrived, or their connection went away. */
export function putVoice(userId: string, stream: MediaStream | null): void {
  if (!stream) {
    if (!voices.has(userId)) return
    const next = new Map(voices)
    next.delete(userId)
    voices = next
    announce()
    return
  }

  if (voices.get(userId) === stream) return
  const next = new Map(voices)
  next.set(userId, stream)
  voices = next
  announce()
}

/** Somebody's picture arrived, or their connection went away. */
export function putFace(userId: string, stream: MediaStream | null): void {
  if (!stream) {
    if (!faces.has(userId)) return
    const next = new Map(faces)
    next.delete(userId)
    faces = next
    announce()
    return
  }

  if (faces.get(userId) === stream) return
  const next = new Map(faces)
  next.set(userId, stream)
  faces = next
  announce()
}

/**
 * Everybody's picture, gone.
 *
 * Called when the scene unmounts. The streams themselves belong to the peer
 * connections that produced them and are stopped by closing those - dropping
 * the references here without closing the links would leave the far end still
 * sending to a room nobody is drawing.
 */
export function clearFaces(): void {
  if (faces.size === 0 && voices.size === 0) return
  faces = new Map()
  voices = new Map()
  announce()
}
