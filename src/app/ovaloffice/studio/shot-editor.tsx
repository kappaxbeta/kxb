'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useStore, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  Diamond,
  Film,
  FileText,
  Gamepad2,
  ImageDown,
  Link2,
  Loader2,
  Lock,
  MousePointerClick,
  Move3d,
  PanelRightClose,
  PanelRightOpen,
  Square,
} from 'lucide-react'
import { EmoteSwatch, Stick } from '@/app/ovaloffice/studio/parts'
import { intentFromKeys, isTyping, useKeys } from '@/app/ovaloffice/studio/drive'
import { downloadText } from '@/app/ovaloffice/studio/capture'
import { canRecord, captureNote, FFMPEG_HINT, record } from '@/app/ovaloffice/studio/record'
import { useClientCapability } from '@/lib/use-client-capability'
import { captureAlpha, type AlphaFormat } from '@/app/ovaloffice/studio/frames'
import { SavePanel } from '@/app/ovaloffice/studio/save-panel'
import type { ImportableWorld } from '@/app/ovaloffice/studio/world-picker'
import { Backdrop } from '@/app/world/shots/pieces'
import {
  type BlueprintChoice,
  SceneStage,
  type ScenePosing,
} from '@/app/ovaloffice/studio/scene-stage'
import type { RigHandle } from '@/app/ovaloffice/animator/posing'
import type { BlueprintSpec } from '@/domain/thingiverse/blueprint'
import { emptyDoc, type Pose, putKey, snapTime } from '@/domain/animator/clip'
import { ShotControls } from '@/app/ovaloffice/studio/shot-controls'
import { Voice } from '@/app/ovaloffice/studio/speak'
import { type Selected, Timeline } from '@/app/ovaloffice/studio/timeline'
import type { SceneScope } from '@/domain/scenes/actions'
import { encodeScene, type PeepSpec, type StudioScene, type Vec3 } from '@/domain/studio/scene'
import { type Action, jumpLength, ordered, talkDuration } from '@/domain/studio/action'
import {
  applyTake,
  type Intent,
  type Puppet,
  type Sample,
  stepPuppet,
  type Take,
} from '@/domain/studio/puppet'
import { actorAt, encodeShot, parseShot, sceneAt, type ShotSpec } from '@/domain/studio/shot'
import { placeActor } from '@/domain/studio/staging'
import { transcribe, type TranscriptMode, transcriptFile } from '@/domain/studio/transcript'
import { park, parked } from '@/app/ovaloffice/studio/draft'
import { studioHref } from '@/app/ovaloffice/studio/where'

/**
 * The motion studio.
 *
 * The still editor with a time axis: same pieces, same lighting rig, same link
 * -in-the-URL persistence, except that what is drawn is `sceneAt(shot, t)` and
 * something moves `t`.
 *
 * ---------------------------------------------------------------------------
 * Two loops, not one
 * ---------------------------------------------------------------------------
 * Playback and capture both run on `requestAnimationFrame`, and they are not
 * the same loop. R3F owns one and draws the canvas from React state; the
 * recorder owns the other and only moves the playhead. They interleave rather
 * than fight because neither draws on the other's behalf - the recorder never
 * calls `gl.render`, it sets a time and lets the next R3F frame catch up.
 *
 * The alternative, driving `gl.render` by hand during a take the way the PNG
 * export does, does not work here: the scene graph has to be re-rendered by
 * React before it reflects the new time, and React does not promise to have
 * committed by the time an imperative call returns.
 *
 * ---------------------------------------------------------------------------
 * Where the playhead lives
 * ---------------------------------------------------------------------------
 * Inside the canvas, deliberately. Time changes sixty times a second, and the
 * controls panel beside it is several hundred inputs deep - if the playhead
 * were state up here, every frame of playback would re-render the whole panel
 * to move one marker.
 *
 * So the canvas owns it and the panel samples it on a timer, ten times a
 * second, which is faster than anybody reads a number and a sixth of the work.
 */

interface Clock {
  seek: (t: number) => void
  now: () => number
}

interface Parts {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
}

/**
 * Where this editor parks the minute it has not written to the URL yet.
 *
 * One key for the motion studio wherever it is mounted - the backoffice's copy
 * and a space's copy are the same editor and never both open in one tab, and
 * the draft is refused anyway unless it continues the exact address the page
 * opened on. See ./draft.ts.
 */
const DRAFT_KEY = 'studio:shot'

/**
 * What a draft parked against a *saved* scene continues from.
 *
 * The draft is keyed on the address it belongs to, and for an unsaved document
 * that address is the encoded shot itself. Once there is a row, the address is
 * the row - so the key has to be too, or a reload onto `?scene=<id>` would
 * compare an id against four thousand characters of base64, decide the draft
 * belongs to something else, and throw the unsaved minute away.
 */
const keptAddress = (id: string) => `scene:${id}`

/**
 * How long a pose beat is when the editor lays one down for you, in seconds.
 *
 * Long enough to see the pose land and short enough not to swallow whatever
 * comes after it. The clip's own length grows with the keys anyway - `putKey`
 * lengthens rather than refuses - and the beat is draggable like any other.
 */
const POSE_BEAT = 2

export function ShotEditor({
  initial,
  scene,
  worlds = [],
  blueprints = [],
}: {
  initial: ShotSpec
  /** Worlds that can be pulled in as a set, same list the picture studio offers. */
  worlds?: ImportableWorld[]
  /**
   * The things this space has on its shelf, for props that are blueprints.
   *
   * Empty in the backoffice, which is not a space and has no shelf - the
   * picker simply does not appear. Passing the whole spec rather than a name
   * and an id is what lets the stage draw one without a fetch of its own; see
   * `SceneStage.blueprints`.
   */
  blueprints?: BlueprintChoice[]
  /**
   * Where a save goes, and where the row it may already be is.
   *
   * Passed in rather than derived, because the same editor is opened from the
   * backoffice and (later) from a space, and which one it is decides who is
   * allowed to write - see `actorFor` in `@/domain/scenes/actions`.
   */
  scene: {
    scope: SceneScope
    id?: string | null
    name?: string
    blurb?: string
    visibility?: 'private' | 'public'
    /** May this person pin what they save to the space's board? */
    canPin?: boolean
    /** ...and may they make it lead the board? Admin work; see the save panel. */
    canPinTop?: boolean
  }
}) {
  const [shot, setShot] = useState(initial)

  /**
   * What the address bar last identified this document by.
   *
   * The encoded document while there is no row, and `keptAddress(id)` once
   * there is - the two are the two things the address can say, and the draft is
   * keyed on whichever it is currently saying. Keyed on this rather than on the
   * current state because it has to answer "which page load does this
   * continue", and that is the address, not the edit.
   */
  const written = useRef(scene.id ? keptAddress(scene.id) : encodeShot(initial))

  /**
   * The scene this editor is writing to, once there is one.
   *
   * Held here rather than only in the save panel because it decides what the
   * address bar says, and the address bar is what a reload comes back to. A
   * page opened on `?scene=<id>` starts with it; a save that lands sets it; a
   * "save as a copy" clears it, because there is no row behind the document
   * again until the next save makes one.
   *
   * The ref beside it is not a duplicate for its own sake: the debounced
   * rewrite below runs from a timer that closed over an older render, and a
   * timer that fires after a save has to be able to see that saving happened.
   * Without it the address flips back to `?v=` a fraction of a second after it
   * became the scene, which is the bug this whole change is about wearing a
   * different hat.
   */
  const [kept, setKept] = useState<string | null>(scene.id ?? null)
  const keptRef = useRef<string | null>(scene.id ?? null)

  /** The document as it is right now, for the callbacks that fire outside a render. */
  const shotRef = useRef(initial)

  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [name, setName] = useState('shot')

  /**
   * Whether this browser can record at all - see `useClientCapability` for
   * why this is not just `canRecord()` called here. The server's answer is
   * always "no", and calling it inline during render is how the record button
   * ended up permanently disabled for everyone.
   */
  const supported = useClientCapability(canRecord)

  /** What the timeline is pointing at, and what the panel therefore edits. */
  const [selected, setSelected] = useState<Selected | null>(null)

  /**
   * Clicking the ground walks the selected animal to it.
   *
   * A mode rather than a modifier key, because this studio is used on a tablet
   * as much as on a desk and there is no Alt to hold there. Off by default: the
   * ground is also the orbit surface, and a tool that rewrites the blocking on a
   * misjudged drag is a tool people turn off permanently after one accident.
   */
  const [walkTo, setWalkTo] = useState(false)

  /**
   * Which actor is being driven by hand, if any.
   *
   * The index rather than the actor, because the document is replaced on every
   * edit and a held reference would be to a stale copy the moment anything
   * else changed.
   */
  const [driving, setDriving] = useState<number | null>(null)

  /**
   * A picture behind the shot that never leaves this tab.
   *
   * Deliberately *not* on the document. `background.image` is a path on this
   * origin and travels in the URL, which is what makes a shot a link somebody
   * else can open - a picture off the desktop has no such path, and a data URL
   * of one would be a megabyte of base64 in an address bar and a megabyte
   * stored on the server the moment the shot is saved. Asked for as a picture
   * you can include "but not save on server".
   *
   * So it lives here, as an object URL: it draws, it records into the export,
   * and it is gone when the tab is. The panel says so.
   */
  const [localImage, setLocalImage] = useState<{ url: string; name: string } | null>(null)

  // Object URLs are a handle on a blob the browser holds for us; letting the
  // last one go is what stops a session of trying pictures leaking all of them.
  useEffect(() => {
    const url = localImage?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [localImage])

  /**
   * Which actor has handles on its bones, and which bone is lit.
   *
   * An index for the reason `driving` is one. The rig beside it is the *live*
   * body the stage is drawing - the panel's sliders and the viewport's handles
   * write to the same quaternions, which is what makes the two agree without
   * either owning the other.
   */
  const [posing, setPosing] = useState<number | null>(null)
  const [bone, setBone] = useState<string | null>(null)
  const [rig, setRig] = useState<RigHandle | null>(null)

  /**
   * What has been performed so far.
   *
   * A ref, not state. Samples arrive twenty times a second and events arrive
   * whenever a key goes down; putting either in state would re-render the whole
   * editor on each, and none of it is drawn from up here - the canvas reads it
   * inside its own loop.
   */
  const take = useRef<{ start: number; samples: Sample[]; events: Action[] }>({
    start: 0,
    samples: [],
    events: [],
  })

  const keys = useKeys(driving !== null)

  /**
   * The on-screen stick, for a thumb rather than a keyboard.
   *
   * A ref for the same reason the keys are: it changes on every pointer move
   * and is read inside the frame loop, and putting it in state would re-render
   * the editor to move an animal one step.
   */
  const stick = useRef<Intent | null>(null)

  /**
   * Whether the viewport is the author's camera or the shot's.
   *
   * Off by default, which is the answer that was missing: the shot's camera
   * keys were being sampled and thrown away, because `OrbitControls` owned the
   * real camera and nothing ever wrote a framing onto it. So playback - and,
   * worse, the recording - came out from wherever the last drag had left the
   * view, and the keys did nothing at all.
   *
   * On, the orbit control takes over and the keys are ignored, which is how a
   * new framing gets found. `Camera key here` is the way back: it writes what
   * you are looking at into the document, and from then on the shot goes there
   * by itself. Recording always follows the shot, whatever this says.
   */
  const [free, setFree] = useState(false)

  /**
   * Whether the controls panel is open.
   *
   * Open by default - it is where the work is - but a shot is judged by
   * looking, and nineteen rems of sliders beside a vertical 1080x1920 frame is
   * most of a tablet spent on the thing you are not currently looking at.
   */
  const [panel, setPanel] = useState(true)

  /** The playhead, as the panel sees it. Sampled, not subscribed. */
  const [time, setTime] = useState(0)

  const clock = useRef<Clock | null>(null)
  const gpu = useRef<Parts | null>(null)

  /**
   * The cast's voice.
   *
   * One per editor, built on first use and closed on unmount - an `AudioContext`
   * is a hardware handle, and browsers cap how many a page may hold. Held in a
   * ref rather than state because nothing about it is rendered.
   */
  const voice = useRef<Voice | null>(null)
  const speaker = () => {
    voice.current ??= new Voice()
    return voice.current
  }

  /**
   * How many times the playhead has been moved by hand.
   *
   * Not the time itself: the panel's copy of the playhead ticks ten times a
   * second during playback, and keying the dialogue off that would tear the
   * whole schedule down and rebuild it ten times a second. This changes only
   * when somebody scrubs.
   */
  const [scrub, setScrub] = useState(0)

  useEffect(() => () => voice.current?.close(), [])

  /**
   * The dialogue, following the picture.
   *
   * Rebuilt a beat after anything that invalidates it - starting playback,
   * landing a scrub, editing the shot - rather than immediately, because all
   * three of those arrive in bursts while a slider is moving and each rebuild
   * schedules every remaining line at once.
   */
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => speaker().start(shot, clock.current?.now() ?? 0), 120)
    return () => {
      clearTimeout(timer)
      voice.current?.stop()
    }
  }, [playing, scrub, shot])

  /**
   * Whatever this page load is a continuation of.
   *
   * On mount rather than in `useState`, and that is not a style choice: this
   * component is server-rendered, `sessionStorage` is not there, and an
   * initialiser that read it would hydrate into a document the server never
   * drew. One extra render is the price of the two passes agreeing.
   *
   * Runs once. A draft is a recovery from a page rebuild, and re-reading it
   * later would mean the editor could revert itself mid-edit - which is the
   * behaviour this whole mechanism exists to stop.
   */
  useEffect(() => {
    const draft = parked(DRAFT_KEY, written.current)
    if (draft !== null) setShot(parseShot(draft))
  }, [])

  /**
   * The link, rewritten as the shot changes. Same debounce as the still editor.
   *
   * The draft is parked on every change and *not* debounced, which is the whole
   * point of it: the 300ms this timer waits is exactly the work a rebuilt page
   * would otherwise lose. See ./draft.ts.
   */
  useEffect(() => {
    shotRef.current = shot
    park(DRAFT_KEY, written.current, shot)

    const timer = setTimeout(() => {
      /*
        Saved: the address is the scene, and every edit after that leaves it
        alone. The park above is what carries the unsaved minute now, and it is
        keyed on the same id the address is - so a reload lands on the scene and
        is handed the newer document over it.

        The ref rather than `kept`, because this timer closed over the render
        that scheduled it. React clears it on the re-render a save causes, but
        "React has re-rendered by now" is not something a 300ms timer gets to
        assume, and the cost of being wrong is the address flipping back to a
        document a moment after it became a scene.
      */
      if (keptRef.current !== null) return

      const next = encodeShot(shot)
      window.history.replaceState(null, '', `?v=${next}`)
      // The address has moved, so what a draft continues has moved with it.
      written.current = next
      park(DRAFT_KEY, next, shot)
    }, 300)
    return () => clearTimeout(timer)
  }, [shot])

  /**
   * A save landed, or somebody asked for a copy.
   *
   * Written here rather than left to the effect above, and imperatively: the
   * address has to change at the moment the row appears, not on the next edit.
   * Somebody who saves and immediately reloads is the person this is for, and
   * they are also the person the old behaviour lost work to - the reload came
   * back to `?v=`, the panel forgot it had saved, and the next press made a
   * second scene beside the first.
   */
  const onSaved = useCallback((id: string | null) => {
    keptRef.current = id

    if (id === null) {
      // No row behind this document again. Back to the address carrying it,
      // straight away, so a reload in the next second gets the document rather
      // than the scene it was a copy of.
      const next = encodeShot(shotRef.current)
      written.current = next
      window.history.replaceState(null, '', `?v=${next}`)
    } else {
      written.current = keptAddress(id)
      window.history.replaceState(null, '', `?scene=${id}`)
    }

    park(DRAFT_KEY, written.current, shotRef.current)
    setKept(id)
  }, [])

  /**
   * The panel's copy of the playhead.
   *
   * Ten a second while playing and not at all while stopped, because a stopped
   * playhead only moves when something up here moved it, and that path already
   * sets the state directly.
   */
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setTime(clock.current?.now() ?? 0), 100)
    return () => clearInterval(timer)
  }, [playing])

  const onReady = useCallback(() => setReady(true), [])

  /**
   * Move the playhead.
   *
   * The dialogue is torn down on every seek, and started again from the new
   * position only if we are still playing. Scrubbing through a line otherwise
   * leaves its remaining blips scheduled against a moment that no longer
   * matches the picture - Web Audio's clock does not care that the playhead
   * jumped, which is exactly the property that makes it good at playback.
   */
  const seek = useCallback((t: number) => {
    clock.current?.seek(t)
    setTime(t)
    voice.current?.stop()
    setScrub((n) => n + 1)
  }, [])

  /**
   * Where the camera ended up, as a key at the playhead.
   *
   * The only way to author a framing: orbit to it, then say when. Dragging in
   * the viewport does not write to the document by itself the way it does in
   * the still studio - there, the camera is the shot, and here it is one of
   * however many the shot passes through, so a drag that silently rewrote the
   * nearest key would make the timeline unpredictable to edit.
   */
  const keyCamera = useCallback(() => {
    const parts = gpu.current
    if (!parts) return
    const round = (value: number) => Math.round(value * 10) / 10
    const { camera } = parts
    const target = (
      (camera.userData.target as THREE.Vector3 | undefined) ?? { x: 0, y: 1.1, z: 0 }
    )
    const at = clock.current?.now() ?? 0

    setShot((current) => {
      const key = {
        t: Math.round(at * 100) / 100,
        position: [
          round(camera.position.x),
          round(camera.position.y),
          round(camera.position.z),
        ] as Vec3,
        target: [round(target.x), round(target.y), round(target.z)] as Vec3,
        fov: camera.fov,
      }
      // A second key at the same instant is not a thing a timeline can mean, so
      // landing on one replaces it. Which is also the gesture for "no, like
      // this instead" - scrub back to a key, re-frame, press again.
      const others = current.camera.filter((existing) => Math.abs(existing.t - key.t) > 0.02)
      return { ...current, camera: [...others, key].sort((a, b) => a.t - b.t) }
    })
    setNote(`camera key at ${at.toFixed(2)}s`)
    // Back to following the shot, because the framing is now *in* the shot.
    // Staying in free look after keying is how you end up convinced the keys do
    // nothing - the viewport looks identical either way at the moment you press
    // it, and only diverges once the playhead moves.
    setFree(false)
  }, [])

  /**
   * Roll.
   *
   * The renderer is resized to the delivered size first, exactly as the still
   * export does and for the same reason - the viewport is whatever the panel
   * left it, and `captureStream` samples the drawing buffer rather than the CSS
   * box. `updateStyle: false` keeps the element's on-screen size untouched, so
   * the picture does not jump while recording.
   */
  const shoot = async () => {
    const parts = gpu.current
    if (!parts) return
    const { gl, camera, canvas } = parts

    setPlaying(false)
    setNote(null)
    setWarning(false)
    setProgress(0)

    const previousSize = { x: gl.domElement.width, y: gl.domElement.height }
    const previousRatio = gl.getPixelRatio()
    const previousAspect = camera.aspect

    gl.setPixelRatio(1)
    gl.setSize(shot.width, shot.height, false)
    camera.aspect = shot.width / shot.height
    camera.updateProjectionMatrix()

    // The graph is opened before the take whether or not anybody speaks, so the
    // file always has an audio track - see `Voice.silence`.
    const speech = speaker()
    speech.silence()

    try {
      clock.current?.seek(0)
      // Started here rather than inside `record`, immediately before the
      // recorder does: both are scheduled synchronously from this tick, and the
      // voice's own lead-in covers what is left. The recorder's clock and the
      // audio clock are different clocks, so this is the closest the two can be
      // brought without handing `record` something to call back into.
      speech.start(shot, 0)

      const capture = await record(canvas, {
        fps: shot.fps,
        duration: shot.duration,
        width: shot.width,
        height: shot.height,
        render: (t) => clock.current?.seek(t),
        onProgress: setProgress,
        audio: speech.track(),
      })

      const url = URL.createObjectURL(capture.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${name || 'shot'}.webm`
      link.click()
      // Revoked on a timer rather than immediately: the click is handled
      // asynchronously, and pulling the blob out from under it cancels the save
      // on some builds.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      const outcome = captureNote(capture)
      setWarning(outcome.dropped)
      setNote(`${name || 'shot'}.webm — ${outcome.text}`)
    } catch (error) {
      setWarning(true)
      setNote(error instanceof Error ? error.message : 'The recording failed.')
    } finally {
      speech.stop()
      gl.setPixelRatio(previousRatio)
      gl.setSize(previousSize.x / previousRatio, previousSize.y / previousRatio, false)
      camera.aspect = previousAspect
      camera.updateProjectionMatrix()
      setProgress(null)
      seek(0)
    }
  }

  /**
   * Take the wheel.
   *
   * Playback starts with it, because a take is performed against the shot's own
   * clock: the camera moves where its keys say, the rest of the cast does what
   * their timelines say, and what is being recorded is this animal's part in
   * that. Driving with the clock stopped would be posing, not performing.
   */
  const drive = (index: number) => {
    const at = clock.current?.now() ?? 0
    const where = sceneAt(shot, at).peeps[index]
    take.current = { start: at, samples: [{ t: at, x: where.x, z: where.z }], events: [] }
    setDriving(index)
    setPlaying(true)
  }

  /**
   * Hand it back, and write down what happened.
   *
   * The take replaces whatever the actor was doing across the stretch that was
   * performed and leaves the rest alone - see `applyTake`. Nothing is written
   * if nobody moved and nothing was pressed, so a take taken by accident is not
   * an edit to undo.
   */
  const stopDriving = () => {
    const index = driving
    setDriving(null)
    setPlaying(false)
    if (index === null) return

    const performed = take.current
    const end = clock.current?.now() ?? performed.start
    if (performed.samples.length < 2 && performed.events.length === 0) return

    const finished: Take = {
      start: performed.start,
      end: Math.max(end, performed.start),
      from: { x: performed.samples[0].x, z: performed.samples[0].z },
      path: performed.samples,
      events: performed.events,
    }

    setShot((current) => ({
      ...current,
      cast: current.cast.map((actor, i) => (i === index ? applyTake(actor, finished) : actor)),
    }))
    setNote(`take kept — ${(finished.end - finished.start).toFixed(1)}s performed`)
  }

  /**
   * A pose, keyed onto the actor at the playhead.
   *
   * Where a drag in the viewport and a slider in the panel both end up. Three
   * things happen at once, and all three are what makes the pose you just made
   * the pose the shot plays:
   *
   *  - the actor gets a clip if it had none, starting at this instant;
   *  - the pose becomes a key on it, at the playhead;
   *  - a `pose` action is laid down if none covers the playhead, because a clip
   *    nothing plays is a clip you cannot see. Posing a body and watching it
   *    snap back to its walk is the whole reason this exists.
   *
   * The key's time is measured from where the covering beat *starts*, since
   * that is the clock `actorAt` samples the clip against.
   */
  const keyPose = useCallback(
    (index: number, pose: Pose) => {
      const at = Math.round((clock.current?.now() ?? 0) * 100) / 100
      setShot((current) => {
        const actor = current.cast[index]
        if (!actor) return current

        const covering = actor.actions.find(
          (action) => action.kind === 'pose' && at >= action.t && at <= action.t + action.duration,
        )
        const beat = covering ?? { kind: 'pose' as const, t: at, duration: POSE_BEAT }
        const into = snapTime(Math.max(0, at - beat.t), actor.pose?.fps ?? 24)

        const doc = actor.pose ?? { ...emptyDoc(pose, 'pose'), duration: POSE_BEAT }
        return {
          ...current,
          cast: current.cast.map((one, i) =>
            i === index
              ? {
                  ...one,
                  pose: putKey(doc, into, pose),
                  actions: covering ? one.actions : ordered([...one.actions, beat]),
                }
              : one,
          ),
        }
      })
    },
    [],
  )

  /**
   * Picking a body by clicking it.
   *
   * The timeline and the cast list were the only ways in, and both ask you to
   * find a row for something you are already looking at. Selecting here is
   * exactly what selecting there does - the panel follows the selection - so
   * this writes the same state and nothing else has to know where a click came
   * from.
   */
  const pick = useCallback((index: number) => {
    setSelected({ node: { kind: 'peep', index }, action: null })
  }, [])

  /** The same, for a prop. Blocks are keyframeable nodes like any other. */
  const pickBlock = useCallback((index: number) => {
    setSelected({ node: { kind: 'block', index }, action: null })
  }, [])

  /** Something discrete, at the moment it was pressed. */
  const perform = useCallback((build: (t: number) => Action) => {
    const at = Math.round((clock.current?.now() ?? 0) * 100) / 100
    take.current.events.push(build(at))
  }, [])

  /**
   * The keys that are events rather than movement.
   *
   * Separate from `useKeys`, which reports what is *held*: these are edges, and
   * a jump that fired once per frame for as long as the key was down would be a
   * take with forty jumps in it.
   */
  useEffect(() => {
    if (driving === null) return

    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.repeat) return
      const key = event.key.toLowerCase()

      if (key === ' ') {
        event.preventDefault()
        perform((t) => ({ kind: 'jump', t, duration: jumpLength(event.shiftKey), air: event.shiftKey }))
        return
      }
      if (key === 'q') perform((t) => ({ kind: 'dance', t, duration: 2.5 }))
      if (key === 'f') perform((t) => ({ kind: 'kick', t, duration: 0.5 }))
      if (key === 'g') perform((t) => ({ kind: 'hit', t, duration: 0.5 }))
      if (key === 'r') perform((t) => ({ kind: 'shake', t, duration: 0.96 }))

      const slot = Number(key)
      if (Number.isInteger(slot) && slot >= 1 && slot <= HOTBAR.length) {
        perform((t) => ({ kind: 'emote', t, duration: 3, emote: HOTBAR[slot - 1] }))
      }
    }

    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [driving, perform])

  /**
   * The words, as a file.
   *
   * The one export here that is not pixels, and the cheapest thing in this
   * component: no GPU, no take, no waiting - `transcribe` is a pure function of
   * the document, so this is a `Blob` and a click. It does not stop playback
   * for the same reason: nothing about the picture is involved.
   *
   * Two buttons rather than one with a menu, because they are two different
   * files people want at two different moments - a script to proof-read the
   * writing, a timeline to check the staging - and a mode switch you have to
   * set before pressing the button is a way of downloading the wrong one.
   */
  const writeTranscript = (mode: TranscriptMode) => {
    const file = transcriptFile(name, mode)
    // `text/plain` rather than `downloadText`'s JSON default: this is prose,
    // and a browser that previews it should show it rather than offer to
    // import it.
    downloadText(transcribe(shot, mode, name || 'shot'), file, 'text/plain;charset=utf-8')
    setWarning(false)
    setNote(
      `${file} — ${mode === 'dialogue' ? 'every line, with who says it' : 'every line and every verb, in order'}`,
    )
  }

  /**
   * Roll again, with a hole in it.
   *
   * The same take as `shoot` and deliberately not folded into it, because the
   * two differ in every step that matters: this one drives the clock frame by
   * frame rather than in real time, reads the canvas itself rather than handing
   * it to a recorder, and has no audio track to keep in sync - a picture format
   * cannot carry one. See `captureAlpha`.
   *
   * What is shared is the resize dance around it, which is the same problem the
   * still export and the recorder both have: the viewport is whatever size the
   * panel left it, and the export is whatever the output fields say.
   */
  const shootAlpha = async (format: AlphaFormat) => {
    const parts = gpu.current
    if (!parts) return
    const { gl, scene, camera, canvas } = parts

    setPlaying(false)
    setNote(null)
    setWarning(false)
    setProgress(0)

    const previousSize = { x: gl.domElement.width, y: gl.domElement.height }
    const previousRatio = gl.getPixelRatio()
    const previousAspect = camera.aspect
    const previousBackground = scene.background

    gl.setPixelRatio(1)
    gl.setSize(shot.width, shot.height, false)
    camera.aspect = shot.width / shot.height
    camera.updateProjectionMatrix()
    gl.setClearAlpha(0)

    try {
      const capture = await captureAlpha(canvas, format, {
        fps: shot.fps,
        duration: shot.duration,
        width: shot.width,
        height: shot.height,
        render: (t) => {
          /*
            The backdrop is taken off every frame, not once before the take.

            `<color attach="background">` re-installs itself whenever that
            element renders, and this export renders it plenty: `setProgress`
            is React state, so every frame of the capture is a re-render of the
            editor. Clearing it once at the top produced an animation that was
            transparent for its first frame and painted for all the rest.
          */
          scene.background = null
          clock.current?.seek(t)
        },
        onProgress: setProgress,
      })

      const url = URL.createObjectURL(capture.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${name || 'shot'}.${capture.extension}`
      link.click()
      // Revoked on a timer rather than immediately, for the reason the recorder
      // gives: the click is handled asynchronously, and pulling the blob out
      // from under it cancels the save on some builds.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      const size = Math.round(capture.blob.size / 1024)
      setNote(
        `${name || 'shot'}.${capture.extension} — ${capture.frames} frames, ${size} kB, ` +
          'transparent',
      )
    } catch (error) {
      setWarning(true)
      setNote(error instanceof Error ? error.message : 'The export failed.')
    } finally {
      scene.background = previousBackground
      gl.setClearAlpha(1)
      gl.setPixelRatio(previousRatio)
      gl.setSize(previousSize.x / previousRatio, previousSize.y / previousRatio, false)
      camera.aspect = previousAspect
      camera.updateProjectionMatrix()
      setProgress(null)
      seek(0)
    }
  }

  const recording = progress !== null

  /**
   * What the stage needs to put handles on a body, or nothing.
   *
   * Undefined while a take is being driven or recorded: both own the cast for
   * the length of the take, and a hand on a bone during either is two things
   * writing one body.
   */
  /**
   * The shelf, by id, for the stage to resolve a prop's reference against.
   *
   * A map rather than the list, because the stage asks per prop and a linear
   * scan per block per frame is the kind of thing that is fine until somebody
   * puts forty crates in a shot.
   */
  const byId = useMemo(
    () => Object.fromEntries(blueprints.map((one) => [one.id, one.spec])),
    [blueprints],
  )

  const scenePosing: ScenePosing | undefined =
    driving === null && !recording
      ? {
          onPick: pick,
          onPickBlock: pickBlock,
          index: posing,
          bone,
          onBone: setBone,
          onRig: setRig,
          onPose: (pose) => {
            if (posing !== null) keyPose(posing, pose)
          },
          // The camera has the left button in free look, so handles let go of
          // it - otherwise every attempt to orbit grabs whatever dot is under
          // the pointer.
          grabbable: !free,
        }
      : undefined

  return (
    // Two columns from `md`, not `lg`. A tablet in landscape is 1024 wide and
    // was getting the phone's stacked layout - the panel a full scroll below the
    // thing it edits, on a screen with room for both side by side.
    <div
      className={`grid gap-4 pb-24 md:pb-0 ${
        panel
          ? 'md:grid-cols-[minmax(0,1fr)_19rem] lg:grid-cols-[minmax(0,1fr)_22rem]'
          : // The column stays, at the width of the tab that reopens it. Removing
            // it outright would make the toggle jump somewhere else on the page
            // and the viewport snap width in the same frame.
            'md:grid-cols-[minmax(0,1fr)_2.75rem]'
      }`}
    >
      {/*
        `contents` on a phone, a column from `md`.

        This is what actually makes the viewport stay put. A sticky element can
        only travel inside its own parent's box, and this column's box ends at
        the timeline - so scrolling on to the panel below, which is the *next
        grid item* rather than a sibling in here, pushed the picture off the
        top. Reported as the canvas not staying fixed on mobile, and it was
        sticky the whole time.

        `display: contents` removes this box without moving anything: the
        viewport and the timeline become grid items of the editor itself, whose
        box runs the full height of the page - panel included - so the sticky
        viewport has that whole run to stay pinned across. From `md` the panel
        is beside the picture, nothing needs pinning, and the column comes back.

        This was reverted once on the strength of a canvas measured at 300x150 -
        the unsized default - which looked like `contents` collapsing the box.
        It was not: 300x150 is what you read whenever you measure before layout
        settles, and the same number turns up under the plain column too. Held
        against an isolated repro that waits properly, the two layouts size the
        canvas identically at both widths (388x217 and 1080x608) and only this
        one keeps the picture on screen. Measure after a real wait before
        believing this is at fault again.
      */}
      <div className="contents md:flex md:min-w-0 md:flex-col md:gap-3">
        {/*
          Stuck to the top on a narrow screen, and only there.
          A phone stacks the viewport, the timeline and several hundred inputs
          into one column, so every edit below the fold is made blind - you drag
          a slider and then scroll up to find out what it did. Pinned, the
          picture is always the thing you are looking at. On a wide screen the
          panel is beside it and there is nothing to pin.

          Capped at 45dvh because the aspect ratio is the author's: a vertical
          1080x1920 shot is taller than the phone it is being composed on. The
          cap is expressed as a *width* rather than a height, because
          `aspect-ratio` with a `max-height` does not shrink the width to keep
          the ratio - it keeps the width and breaks the ratio, which would show
          the shot at a framing it will never be exported at.
        */}
        <div
          className="sticky top-0 z-20 mx-auto w-full max-w-[var(--shot-cap)] overflow-hidden rounded-2xl border border-border bg-background md:relative md:max-w-none"
          style={
            {
              aspectRatio: `${shot.width} / ${shot.height}`,
              '--shot-cap': `calc(45dvh * ${shot.width / shot.height})`,
            } as React.CSSProperties
          }
        >
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            /*
              An alpha channel, and an opaque picture anyway.

              It was `alpha: false`, because video has none and a see-through
              canvas records as black. That is still true of the WebM - and it
              is not the whole of what leaves this studio any more: the
              transparent exports read the canvas themselves, and a context
              made without an alpha channel has no transparency to read no
              matter what is cleared to.

              Nothing about the recording changes. The shot always has a
              backdrop - a colour when it has no picture, see below - so every
              pixel of every frame is painted by the scene rather than left to
              the clear, and the clear alpha is put to one on creation for the
              corner where it is not.
            */
            gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
            onCreated={({ gl }) => gl.setClearAlpha(1)}
            camera={{
              position: initial.camera[0].position,
              fov: initial.camera[0].fov,
              near: 0.1,
              far: 400,
            }}
          >
            {/* One or the other, never both: `attach` re-installs the colour
                on every render, and would blank the texture the backdrop just
                put there. */}
            {shot.background.image === null && localImage === null && (
              <color attach="background" args={[shot.background.colour]} />
            )}
            {/* The local picture wins while there is one: it is the thing
                somebody just chose, and the document's own backdrop is still
                there underneath when they clear it. */}
            <Backdrop
              image={localImage?.url ?? shot.background.image}
              aspect={shot.width / shot.height}
            />
            <Bridge partsRef={gpu} />
            <OrbitControls
              makeDefault
              target={initial.camera[0].target}
              enableDamping={false}
              // Off while the shot owns the camera, or a stray drag fights the
              // keys and wins for exactly one frame.
              enabled={free && !recording}
            />
            {/*
              Click the ground to send the selected animal there.

              The pad in the panel is a joystick - it says "a bit that way" - and
              blocking out a shot is not a series of nudges, it is "stand over
              there, by that". Pointing at the spot is the version of that
              somebody would try first, and until now it did nothing.

              Only while `walkTo` is on, because the ground is also the thing you
              drag to orbit and every stray click would otherwise rewrite the
              blocking. R3F's `onClick` already refuses a drag, but "the camera
              gesture and the edit gesture are the same gesture" is not a thing
              to leave to a threshold.
            */}
            {walkTo && selected?.node.kind === 'peep' && (
              <GroundPick
                onPick={(x, z) => {
                  const index = selected.node.index
                  setShot((current) => ({
                    ...current,
                    cast: current.cast.map((actor, i) =>
                      i === index
                        ? placeActor(
                            actor,
                            time,
                            { x, z },
                            sceneAt(current, time).peeps[i] ?? { x: actor.x, z: actor.z },
                          )
                        : actor,
                    ),
                  }))
                }}
              />
            )}
            <Playhead
              shot={shot}
              driving={driving}
              posing={scenePosing}
              blueprints={byId}
              keysRef={keys}
              stickRef={stick}
              takeRef={take}
              free={free && !recording}
              playing={playing}
              clockRef={clock}
              onEnd={() => setPlaying(false)}
              onReady={onReady}
            />
          </Canvas>

          {/*
            The camera's two controls, on the camera.
            They were in the toolbar under the viewport, which is the wrong
            place for the pair you touch most: framing a shot is orbit, look,
            key, orbit again, and every one of those was a scroll away from the
            thing being framed.

            Bottom-right, small and translucent - the picture is the point, and
            a cluster that covers a corner of the shot is a cluster you resent.
            Low rather than high because a shot is framed on what is standing in
            it, and what is standing in it is usually in the upper half of the
            frame; the bottom corner is floor. It also puts these two within a
            thumb's reach of the transport directly below.

            Held off the bottom edge rather than tucked into the corner: a
            control sitting on the frame's own border reads as part of the
            border, and on a vertical shot the very bottom of the picture is
            where the ground meets the camera and there is most going on.
            `pointer-events-none` on the wrapper so the gaps between the buttons
            still pass a drag through to the orbit control underneath; the
            buttons take theirs back.

            DOM rather than drawn in the scene, so none of it reaches a
            recording: `captureStream` samples the canvas, and this is over it.
          */}
          {/*
            The performer's controls, opposite the camera's.

            Same argument the cluster on the right is there for, and the button
            row below the timeline made it twice over: these two are the ways to
            move an animal without typing a number, and you reach for both while
            looking at the picture. Down there they were a scroll past the
            timeline, so blocking a shot meant looking away from the thing being
            blocked, twice per move.

            Left rather than right because the two families should not be one
            cluster: everything on the right moves the *camera*, everything here
            moves a *body*. Same height, same treatment, so they read as a pair
            of tools rather than a row of six buttons.
          */}
          <div className="pointer-events-none absolute bottom-4 left-3 flex gap-1.5 sm:bottom-6">
            {selected?.node.kind === 'peep' && driving === null && (
              <>
                <button
                  type="button"
                  onClick={() => setWalkTo((on) => !on)}
                  disabled={!ready || recording}
                  title={
                    walkTo
                      ? 'Click the ground to move them there. Press again to orbit freely.'
                      : 'Turn on click-to-walk, then click the ground'
                  }
                  className={`pointer-events-auto flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs backdrop-blur-sm transition disabled:opacity-40 ${
                    walkTo
                      ? 'border-accent bg-black/60 text-white'
                      : 'border-white/20 bg-black/50 text-white/80 hover:border-white/50 hover:text-white'
                  }`}
                >
                  <MousePointerClick className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{walkTo ? 'Click a spot' : 'Walk here'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => drive(selected.node.index)}
                  disabled={!ready || recording}
                  title="Drive them with WASD, and keep whatever they do as a take"
                  className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-accent bg-black/50 px-2 py-1.5 text-xs text-white backdrop-blur-sm transition hover:bg-black/70 disabled:opacity-40"
                >
                  <Gamepad2 className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Take control</span>
                </button>
              </>
            )}

            {/* Ends the take, and stays where the button that started it was -
                a stop control somewhere else is one you hunt for while an
                animal is still walking. */}
            {driving !== null && (
              <button
                type="button"
                onClick={stopDriving}
                title="Stop driving and keep what they just did"
                className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground backdrop-blur-sm transition"
              >
                <Square className="size-4" aria-hidden />
                <span className="hidden sm:inline">Keep this take</span>
              </button>
            )}
          </div>

          <div className="pointer-events-none absolute right-3 bottom-4 flex gap-1.5 sm:bottom-6">
            <button
              type="button"
              onClick={() => setFree((on) => !on)}
              disabled={recording}
              title={
                free
                  ? 'Free look — drag to orbit. The shot’s own camera keys are ignored.'
                  : 'Locked to the shot’s camera keys. Click to take the wheel.'
              }
              className={`pointer-events-auto flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs backdrop-blur-sm transition disabled:opacity-40 ${
                free
                  ? 'border-accent bg-black/60 text-white'
                  : 'border-white/20 bg-black/50 text-white/80 hover:border-white/50 hover:text-white'
              }`}
            >
              {free ? (
                <Move3d className="size-4" aria-hidden />
              ) : (
                <Lock className="size-4" aria-hidden />
              )}
              {/* "Camera lock" rather than "Following", which never said what
                  was being followed - the answer being the shot's own camera
                  keys, which is the thing the lock is about. */}
              <span className="hidden sm:inline">{free ? 'Free look' : 'Camera lock'}</span>
            </button>

            <button
              type="button"
              onClick={keyCamera}
              disabled={recording}
              title="Save this framing as a camera key at the playhead"
              className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-sky-300/50 bg-black/50 px-2 py-1.5 text-xs text-white backdrop-blur-sm transition hover:border-sky-300 disabled:opacity-40"
            >
              {/* The same diamond the timeline draws a camera key as, so the
                  button and the thing it makes are recognisably one idea. */}
              <Diamond className="size-4 fill-sky-400 text-sky-200" aria-hidden />
              <span className="hidden sm:inline">Key here</span>
            </button>
          </div>
        </div>

        <Transport
          time={time}
          duration={shot.duration}
          playing={playing}
          disabled={!ready || recording}
          onPlay={() => setPlaying((on) => !on)}
          onSeek={seek}
        />

        {driving !== null && (
          <DriveBar
            name={shot.cast[driving]?.name || shot.cast[driving]?.avatar || 'them'}
            onStick={(intent) => {
              stick.current = intent
            }}
            onAction={perform}
            onEmote={(emote) => perform((t) => ({ kind: 'emote', t, duration: 3, emote }))}
            onSay={(text) =>
              perform((t) => ({ kind: 'talk', t, duration: talkDuration(text), text }))
            }
          />
        )}

        <Timeline
          shot={shot}
          time={time}
          selected={selected}
          onSelect={setSelected}
          onSeek={seek}
          onChange={setShot}
        />

        {/*
          A grid on a phone, a row on a desktop.
          Wrapped flex put three buttons of different widths on three ragged
          lines that then ran under the app's own floating docks. Two even
          columns is predictable, and every control keeps a full-width tap
          target.
        */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="File name"
            className="col-span-2 rounded-lg border border-border bg-transparent px-3 py-2 text-sm sm:w-32"
          />
          <RecordButton
            onClick={shoot}
            ready={ready}
            progress={progress}
            supported={supported}
          />
          {/* "Walk here", "Take control" and "Keep this take" used to be here.
              They are on the viewport now, above - a control that moves what is
              in the picture belongs on the picture. */}
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href)
              setNote('link copied')
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary"
          >
            <Link2 className="size-4" aria-hidden />
            Copy link
          </button>
          <a
            href={studioHref(
              'image',
              scene.scope.kind === 'space' ? scene.scope.slug : undefined,
              encodeScene(sceneAt(shot, time)),
            )}
            className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:col-span-1"
          >
            <ImageDown className="size-4" aria-hidden />
            This frame as a still
          </a>

          {/*
            The two transparent exports, beside the video rather than behind a
            mode switch.

            They are a different *kind* of output, not a setting on this one: a
            WebM is a master to re-encode and put on a timeline, and these are
            finished pictures to drop straight into a page. Nothing about the
            shot changes between them, so making somebody set a format first and
            press record second would be a mode with one honest use.

            WebP first because it is the one to use - real alpha, every colour,
            a fraction of the bytes. The GIF is the copy for everywhere that
            still cannot read one. See `captureAlpha`.
          */}
          <button
            type="button"
            onClick={() => shootAlpha('webp')}
            disabled={!ready || recording}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary disabled:opacity-40"
          >
            <Film className="size-4" aria-hidden />
            Transparent WebP
          </button>
          <button
            type="button"
            onClick={() => shootAlpha('gif')}
            disabled={!ready || recording}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Film className="size-4" aria-hidden />
            Transparent GIF
          </button>

          {/*
            The shot as text, which is the export nothing else here can stand
            in for.

            Not disabled while a take runs, unlike everything above it: those
            all want the canvas and this one only wants the document. Off to the
            side of the picture exports rather than in the panel, because it is
            an output - the panel edits the shot, this row leaves with it.
          */}
          <button
            type="button"
            onClick={() => writeTranscript('dialogue')}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title="Every line and who says it, with the time it goes up"
          >
            <FileText className="size-4" aria-hidden />
            Dialogue
          </button>
          <button
            type="button"
            onClick={() => writeTranscript('script')}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title="The same, with every move, jump and emote in its place"
          >
            <FileText className="size-4" aria-hidden />
            Dialogue + actions
          </button>
        </div>

        {note && (
          <p className={`text-sm ${warning ? 'text-amber-400' : 'text-muted-foreground'}`}>{note}</p>
        )}

        {/* Shown always rather than only after a take: the file that lands in
            Downloads is a WebM, and almost everywhere it is going wants an
            mp4. */}
        <details className="rounded-2xl border border-border bg-secondary/30 px-3 py-2.5">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground">
            Turning the WebM into an mp4
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-secondary/60 p-2 font-mono text-xs text-foreground">
            {FFMPEG_HINT}
          </pre>
        </details>
      </div>

      {/*
        Pinned, and scrolling inside itself.
        The panel is taller than any screen, so without this the whole page
        scrolls: the viewport slides away and every edit past the first few is
        made blind. `self-start` is the part that is easy to miss - a grid item
        stretches to the row height by default, and a `sticky` element that
        already fills its container has nothing to stick within.
      */}
      <aside className="min-w-0 md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:self-start md:overflow-y-auto md:pr-1">
        {/*
          The handle, at the top of the thing it opens and closes.
          Sticky within the panel's own scroll, so it is reachable from the
          bottom of a long list of sliders rather than only from the top - the
          moment you want the picture back is usually the moment you have just
          finished dragging something four screens down.
        */}
        <div className="sticky top-0 z-10 mb-2 flex justify-end py-1">
          <button
            type="button"
            onClick={() => setPanel((open) => !open)}
            title={panel ? 'Hide the controls' : 'Show the controls'}
            aria-expanded={panel}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
          >
            {panel ? (
              <>
                <PanelRightClose className="size-4" aria-hidden />
                <span className="hidden sm:inline">Hide</span>
              </>
            ) : (
              <PanelRightOpen className="size-4" aria-hidden />
            )}
          </button>
        </div>

        {panel && (
          <>
        <SavePanel
          shot={shot}
          scope={scene.scope}
          sceneId={kept}
          onSaved={onSaved}
          initialName={scene.name}
          initialBlurb={scene.blurb}
          initialVisibility={scene.visibility}
          canPin={scene.canPin}
          canPinTop={scene.canPinTop}
        />
        <ShotControls
          shot={shot}
          onChange={setShot}
          time={time}
          onSeek={seek}
          selected={selected}
          onSelect={setSelected}
          onDrive={driving === null && ready && !recording ? drive : undefined}
          localImage={localImage}
          onLocalImage={setLocalImage}
          posing={posing}
          onPosing={(index) => {
            setPosing(index)
            // A bone lit on the body you have just stopped posing is a panel
            // showing sliders for something with no handles on it.
            if (index === null) setBone(null)
          }}
          poseRig={{
            rig,
            bone,
            onBone: setBone,
            onPose: (pose) => {
              if (posing !== null) keyPose(posing, pose)
            },
          }}
          worlds={worlds}
          blueprints={blueprints}
        />
          </>
        )}
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * The clock, and the scene it implies.
 *
 * Lives inside the canvas so that advancing it re-renders the stage and nothing
 * else. `useFrame` rather than a `setInterval` because it has to agree with the
 * renderer's own cadence - a timer would tear against it.
 */
function Playhead({
  shot,
  playing,
  free,
  driving,
  posing,
  blueprints,
  keysRef,
  stickRef,
  takeRef,
  clockRef,
  onEnd,
  onReady,
}: {
  /** Handed straight through to the stage - see `ScenePosing`. */
  posing?: ScenePosing
  /** Likewise: resolved specs for props that name one. */
  blueprints?: Readonly<Record<string, BlueprintSpec>>
  shot: ShotSpec
  playing: boolean
  /** The author is orbiting, so the shot's framing is not applied. */
  free: boolean
  /** Which actor is on the keyboard, if any. */
  driving: number | null
  keysRef: React.RefObject<Set<string>>
  /** What the on-screen stick is saying, or null when nobody is touching it. */
  stickRef: React.RefObject<Intent | null>
  takeRef: React.RefObject<{ start: number; samples: Sample[]; events: Action[] }>
  clockRef: React.RefObject<Clock | null>
  onEnd: () => void
  onReady: () => void
}) {
  /**
   * The playhead, and the driven animal, as one update.
   *
   * Together rather than in two states because they change on the same frame
   * and are drawn in the same pass - and because the driven peep has to be
   * *computed in the loop* rather than read out of a ref during render. A ref
   * mutated by `useFrame` and read while rendering happens to work here, since
   * the loop schedules a render every frame anyway, but it is outside what
   * React promises and the linter is right to say so.
   */
  const [frame, setFrame] = useState<{ t: number; peep: PeepSpec | null }>({ t: 0, peep: null })
  const time = frame.t

  // The authority on where the playhead is. The state above is a copy kept for
  // rendering - reading `time` inside `useFrame` would close over a stale one.
  const now = useRef(0)

  /** Where the driven animal is, this instant. Null when nobody is driving. */
  const puppet = useRef<Puppet | null>(null)
  const sampled = useRef(0)

  useEffect(() => {
    clockRef.current = {
      seek: (t) => {
        now.current = t
        // A seek is not a performance, so nothing is driven at the new time -
        // and a stale driven peep left behind would be the animal standing
        // where the last take put them regardless of where the playhead went.
        setFrame({ t, peep: null })
      },
      now: () => now.current,
    }
  }, [clockRef])

  // Reset when the wheel changes hands, so a second take does not begin at the
  // position the first one ended at.
  useEffect(() => {
    if (driving === null) {
      puppet.current = null
      return
    }
    const first = takeRef.current?.samples[0]
    puppet.current = {
      x: first?.x ?? 0,
      z: first?.z ?? 0,
      heading: 0,
      distance: 0,
      speed: 0,
    }
    sampled.current = first?.t ?? 0
  }, [driving, takeRef])

  useFrame((state, delta) => {
    if (!playing) return
    const next = now.current + delta
    let live: PeepSpec | null = null

    /**
     * The animal, driven.
     *
     * Before the end-of-shot check below, so the last frame of a take is
     * recorded rather than dropped - and inside the same loop as the clock,
     * because a take's samples are stamped with shot time and the two must not
     * be able to disagree about what that is.
     */
    if (driving !== null && puppet.current && keysRef.current) {
      // Where the camera is looking, flattened onto the ground. This is what
      // makes W mean "away from me" rather than "towards negative z".
      state.camera.getWorldDirection(LOOK)
      const azimuth = (Math.atan2(LOOK.x, LOOK.z) * 180) / Math.PI

      // The keyboard and the on-screen stick are the same intent arrived at
      // differently, and the stick wins while a thumb is on it - a phone has no
      // shift key to be holding at the same time.
      const intent = stickRef.current ?? intentFromKeys(keysRef.current)
      puppet.current = stepPuppet(puppet.current, intent, delta, azimuth)

      // Twenty a second. Finer than the reduction can use and coarser than the
      // frame rate, so a take is the same path on a slow machine as on a fast one.
      if (next - sampled.current >= 0.05) {
        sampled.current = next
        takeRef.current?.samples.push({
          t: next,
          x: puppet.current.x,
          z: puppet.current.z,
        })
      }

      /**
       * The driven animal, drawn over the one the timeline describes.
       *
       * Through `actorAt` with the live motion rather than by drawing something
       * of its own - see `LiveMotion`. The actor handed in carries only the
       * events performed *so far*, because the clips being replaced must not
       * still be playing underneath the thing replacing them.
       */
      const actor = shot.cast[driving]
      if (actor) {
        live = actorAt(
          { ...actor, actions: takeRef.current?.events ?? [] },
          Math.min(next, shot.duration),
          puppet.current,
        )
      }
    }

    if (next >= shot.duration) {
      // Stops on the last frame rather than looping. A loop is nicer to watch
      // and worse to work with: it makes the end of a shot the one moment you
      // can never park on to judge.
      now.current = shot.duration
      setFrame({ t: shot.duration, peep: live })
      onEnd()
      return
    }
    now.current = next
    setFrame({ t: next, peep: live })
  })

  const scene = sceneAt(shot, time)
  // Computed in the loop, drawn here. See the note on `frame`.
  if (driving !== null && frame.peep) scene.peeps[driving] = frame.peep

  return (
    <>
      <Lens framing={scene.camera} active={!free} />
      <SceneStage scene={scene} onReady={onReady} posing={posing} blueprints={blueprints} />
    </>
  )
}

/**
 * Roll.
 *
 * ---------------------------------------------------------------------------
 * Why this is not one line of Tailwind any more
 * ---------------------------------------------------------------------------
 * It was, and it had a bug that is invisible in the source and obvious on
 * screen: the class list carried both `text-primary-foreground` and
 * `text-white`, and the later one wins. `--primary` in this theme is very
 * nearly white, so the label was white on white - a pill with a ghost of a word
 * in it. Two colour classes on one element is a thing to notice, not a thing to
 * merge.
 *
 * The rest is what the button has to say that a word cannot:
 *
 *  - **What it does.** A red dot is what a record button is, everywhere, and it
 *    reads at ten pixels where an icon of a camera does not.
 *  - **That it is working.** The percentage was in the label, which meant the
 *    label changed length on every frame and the button twitched. It is a fill
 *    behind the text now: a progress bar you do not have to read.
 *  - **Why it is dead.** Disabled with no explanation is the worst state a
 *    button has. There are two ways to get there - models still loading, or a
 *    browser with no `MediaRecorder` - and they say different things.
 */
function RecordButton({
  onClick,
  ready,
  progress,
  supported,
}: {
  onClick: () => void
  ready: boolean
  /** Nought to one while a take runs, or null when one is not. */
  progress: number | null
  supported: boolean
}) {
  const recording = progress !== null
  const percent = Math.round((progress ?? 0) * 100)

  const label = !supported
    ? 'Cannot record here'
    : recording
      ? `Recording ${percent}%`
      : ready
        ? 'Record'
        : 'Loading models…'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready || recording || !supported}
      title={
        !supported
          ? 'This browser cannot record video from a canvas.'
          : ready
            ? 'Record the whole shot and download it'
            : 'Waiting for the models to arrive'
      }
      className="relative flex items-center justify-center overflow-hidden rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-40"
    >
      {/* The take, as a fill. Behind the label rather than beside it, so the
          button never changes size while it runs. */}
      {recording && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-red-500/30 transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      )}

      <span className="relative flex items-center gap-1.5">
        {!ready && supported ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          /* A plain dot, not an icon. This is the one shape everybody already
             reads as "record", and it survives being 10px across. */
          <span
            aria-hidden
            className={`size-2.5 rounded-full bg-red-500 ${recording ? 'animate-pulse' : ''}`}
          />
        )}
        {label}
      </span>
    </button>
  )
}

/**
 * What you can do while you have the wheel.
 *
 * Shown only during a take, and deliberately under the viewport rather than
 * over it: an overlay would cover the animal you are driving, which is the one
 * thing you need to see.
 *
 * The line box is the reason this is a component at all. Typing dialogue and
 * driving with WASD are the same keyboard, so the box takes focus and
 * `isTyping` keeps the movement keys out of it - and pressing enter hands focus
 * straight back, because a take does not stop while you write.
 */
function DriveBar({
  name,
  onStick,
  onAction,
  onEmote,
  onSay,
}: {
  name: string
  onStick: (intent: Intent | null) => void
  onAction: (build: (t: number) => Action) => void
  onEmote: (emote: number) => void
  onSay: (text: string) => void
}) {
  const [line, setLine] = useState('')

  /**
   * The same verbs the keys fire, as buttons.
   *
   * Not a phone-only control. A key you have to be told about is a key nobody
   * presses, so the buttons are the legend as well as the input - and the
   * shortcut is written on each one rather than in a paragraph above them.
   */
  const verbs: { label: string; key: string; build: (t: number) => Action }[] = [
    { label: 'Jump', key: '␣', build: (t) => ({ kind: 'jump', t, duration: jumpLength(false), air: false }) },
    { label: 'Dance', key: 'Q', build: (t) => ({ kind: 'dance', t, duration: 2.5 }) },
    { label: 'Kick', key: 'F', build: (t) => ({ kind: 'kick', t, duration: 0.5 }) },
    { label: 'Hit', key: 'G', build: (t) => ({ kind: 'hit', t, duration: 0.5 }) },
    { label: 'Shake', key: 'R', build: (t) => ({ kind: 'shake', t, duration: 0.96 }) },
  ]

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-accent/50 bg-secondary/40 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">
        Driving <span className="capitalize text-foreground">{name}</span> — the stick or WASD, push
        past half to run.
      </p>

      <div className="flex items-center gap-3">
        <Stick onMove={onStick} />
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 sm:grid-cols-5">
          {verbs.map((verb) => (
            <button
              key={verb.label}
              type="button"
              onPointerDown={(event) => {
                // On pointer *down*, because a take is timed: waiting for the
                // click to complete would land every action a beat late.
                event.preventDefault()
                onAction(verb.build)
              }}
              className="flex touch-none items-center justify-center gap-1 rounded-lg border border-border px-2 py-2.5 text-xs transition hover:border-accent active:bg-accent/20"
            >
              {verb.label}
              <span className="font-mono text-[10px] text-muted-foreground">{verb.key}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {HOTBAR.map((emote, i) => (
          <button
            key={emote}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              onEmote(emote)
            }}
            title={`Emote ${i + 1}`}
            className="flex touch-none items-center gap-1 rounded-lg border border-border px-1.5 py-1.5 transition hover:border-accent active:bg-accent/20"
          >
            <EmoteSwatch id={emote} />
            <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
          </button>
        ))}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            const said = line.trim()
            if (said.length === 0) return
            onSay(said)
            setLine('')
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5"
        >
          <input
            value={line}
            maxLength={120}
            placeholder="Say something, then enter"
            onChange={(event) => setLine(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-foreground focus:border-accent focus:outline-none"
          />
        </form>
      </div>
    </div>
  )
}

/** Reused rather than allocated per frame - this runs sixty times a second. */
const LOOK = new THREE.Vector3()

/**
 * The six faces a take can reach without leaving the keyboard.
 *
 * A hotbar rather than the whole sheet, because ninety-one faces is a grid you
 * navigate and a take is a thing you perform - and anything you have to look
 * down at is a beat you missed. The rest of the sheet is still there
 * afterwards: an emote clip's face is editable in the inspector like everything
 * else.
 */
const HOTBAR = [2, 27, 14, 40, 5, 9]

/**
 * The shot's framing, on the real camera.
 *
 * The piece that was missing. `sceneAt` has always computed where the camera
 * should be; nothing put it there, so the keys were decoration and every
 * recording came out from wherever the viewport happened to be pointing.
 *
 * Written imperatively off the R3F store rather than through `<PerspectiveCamera>`
 * for the reason `<Lens>` in the still editor gives: this is a poke at a live
 * three.js object every frame of playback, and going through React state would
 * mean a re-render per frame to move a camera the renderer already owns.
 */
function Lens({
  framing,
  active,
}: {
  framing: StudioScene['camera']
  active: boolean
}) {
  const store = useStore()
  const [x, y, z] = framing.position
  const [tx, ty, tz] = framing.target
  const { fov } = framing

  useEffect(() => {
    if (!active) return
    const camera = store.getState().camera as THREE.PerspectiveCamera
    camera.position.set(x, y, z)
    camera.lookAt(tx, ty, tz)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    // The orbit control keeps its own idea of where it is looking, and would
    // yank the camera back the moment free look is turned on again if it were
    // left pointing at the last thing the author framed.
    const controls = store.getState().controls as { target?: THREE.Vector3 } | null
    controls?.target?.set(tx, ty, tz)
  }, [store, active, x, y, z, tx, ty, tz, fov])

  return null
}

/** Hands the renderer, camera and canvas out to the buttons outside. */
function Bridge({ partsRef }: { partsRef: React.RefObject<Parts | null> }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const store = useStore()

  useEffect(() => {
    partsRef.current = { gl, scene, camera, canvas: gl.domElement }
  }, [partsRef, gl, scene, camera])

  /**
   * The orbit control's target, parked on the camera.
   *
   * `keyCamera` needs both halves of a framing, and the control that owns the
   * target lives inside the canvas while the button does not. Stashing it in
   * `userData` is the smallest bridge that does not turn every orbit into a
   * React state update.
   *
   * Both objects come out of the store rather than off a hook, for the reason
   * `<Lens>` in the still editor gives: this is an imperative poke at a live
   * three.js object, and mutating something a hook handed back is exactly what
   * the compiler's immutability rule is for.
   */
  useFrame(() => {
    const state = store.getState()
    const controls = state.controls as { target?: THREE.Vector3 } | null
    if (controls?.target) state.camera.userData.target = controls.target
  })

  return null
}

/**
 * Play, scrub, and where we are.
 *
 * A plain range input rather than a drawn track: it is keyboard-operable and
 * drag-correct for free, and a timeline that cannot be nudged one frame with an
 * arrow key is a timeline you fight when you are trying to land a key on the
 * exact moment somebody's foot hits the ground.
 */
function Transport({
  time,
  duration,
  playing,
  disabled,
  onPlay,
  onSeek,
}: {
  time: number
  duration: number
  playing: boolean
  disabled: boolean
  onPlay: () => void
  onSeek: (t: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        className="w-20 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-secondary disabled:opacity-40"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        aria-label="Playhead"
        min={0}
        max={duration}
        step={0.01}
        value={Math.min(time, duration)}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="h-1 flex-1 accent-accent"
      />
      <span className="w-24 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {time.toFixed(2)} / {duration}s
      </span>
    </div>
  )
}

/**
 * The ground, as something to click on.
 *
 * A plain plane at y=0, big enough to cover any set the camera can frame, drawn
 * with a fully transparent material rather than `visible={false}` - an invisible
 * object is skipped by the raycaster, so it would be a click target that never
 * gets clicked.
 *
 * `depthWrite={false}` so it cannot occlude anything behind it, and no
 * `castShadow`/`receiveShadow`, so it contributes nothing to the picture. It is
 * mounted only while the mode is on, which means a recording never has it -
 * though it would be harmless either way.
 *
 * Rounded to a tenth of a block, matching what the action list stores and what
 * `Move 3.4, -1.2` prints on the clip. Somebody clicking a spot means "about
 * there", and a destination carrying fourteen decimal places is a number nobody
 * can then type back in.
 */
function GroundPick({ onPick }: { onPick: (x: number, z: number) => void }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
        // Ours alone. Without this the click also reaches whatever is behind
        // the plane, which in a set full of blocks is most of the set.
        event.stopPropagation()
        onPick(
          Math.round(event.point.x * 10) / 10,
          Math.round(event.point.z * 10) / 10,
        )
      }}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
