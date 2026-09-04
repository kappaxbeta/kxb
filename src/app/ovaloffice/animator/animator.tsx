'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import {
  Bone,
  Clapperboard,
  ChevronsLeft,
  ChevronsRight,
  Clipboard,
  ClipboardCheck,
  Copy,
  Diamond,
  Download,
  FolderOpen,
  Footprints,
  Grid3x3,
  Image as ImageIcon,
  Hand,
  Keyboard,
  type LucideIcon,
  Maximize2,
  Minimize2,
  Move,
  Music4,
  Orbit,
  Pause,
  PersonStanding,
  Pin,
  Play,
  Rabbit,
  Redo2,
  Repeat,
  Rocket,
  RotateCcw,
  Save,
  SkipBack,
  Sparkles,
  Trash2,
  Undo2,
  Waves,
  Wind,
} from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CoinPrice } from '@/app/components/coin-price'
import { exportGlb, fileStem, save, saveDoc } from '@/app/ovaloffice/animator/download'
import { draftKey } from '@/app/ovaloffice/animator/draft'
import {
  AnimatorStage,
  boneEuler,
  type RigHandle,
  setBoneEuler,
} from '@/app/ovaloffice/animator/stage'
import { Timeline } from '@/app/ovaloffice/animator/timeline'
import { Num, Pick, Slide } from '@/app/ovaloffice/studio/parts'
import { Button } from '@/components/ui/button'
import { AXIS, BoneList, PosePad } from '@/app/ovaloffice/animator/bone-panel'
import { FrameShot, saveDataUrl, type TakeFrame } from '@/app/ovaloffice/animator/frame-shot'
import {
  type AnimationDoc,
  bake,
  type BakedClip,
  CLIP_VERSION,
  type Ease,
  EASES,
  MAX_DURATION,
  MAX_FPS,
  MIN_FPS,
  type Pose,
  clonePose,
  declaredVersion,
  emptyDoc,
  keyAt,
  moveKey,
  parseDoc,
  putKey,
  removeKey,
  setDuration,
  setEase,
  setFps,
  snapTime,
} from '@/domain/animator/clip'
import { searchModels } from '@/domain/thingiverse/models'
import {
  type Rig as BodyRig,
  isRigId,
  type RigId,
  RIG_IDS,
  RIGS,
} from '@/domain/animator/rig'
import { PRESETS, type Preset, stamp, stampLength } from '@/domain/animator/presets'

/**
 * A face for each move.
 *
 * Here rather than in the catalogue because `@/domain/animator/presets` is
 * data and maths and has no business importing a component library. A preset
 * with no icon falls back to the panel's own, so adding one to the catalogue
 * never breaks this.
 */
const MOVE_ICONS: Record<string, LucideIcon> = {
  walk: Footprints,
  run: Rabbit,
  armswing: Waves,
  wave: Hand,
  dance: Music4,
  idle: Wind,
  jump: Rocket,
}

/**
 * The animator.
 *
 * Three things, in the order somebody uses them: a viewport with handles you
 * drag to pose the dummy, a strip of keys underneath, and a download button.
 * That is the whole tool, and the shape is a video editor's on purpose - the
 * bet is that "scrub, pose, it keys itself, scrub, pose" is learnable in about
 * a minute by anybody who has ever trimmed a video, where a bone hierarchy and
 * a graph editor is not.
 *
 * Auto-key is on by default and that is the single most important default
 * here. With it off, the tool has a failure mode where you pose a whole walk
 * cycle, scrub back to look at it, and find it gone - because posing and
 * *recording* the pose were two actions and nothing said so. With it on,
 * moving the playhead and moving a hand is all there is to it.
 *
 * What owns what: React owns the document, three.js owns the live rig, and the
 * two meet at a `Pose`. See the note at the top of `stage.tsx`.
 */

const NO_REST: Pose = { root: [0, 0, 0], bones: {} }

/**
 * How many steps back you can take.
 *
 * Five, because that is what was asked for and because a deeper stack on a
 * document this size is a false promise: every entry is a whole copy of every
 * key, and the thing people actually reach for undo for here is the last drag
 * that went wrong, not an archaeology of the afternoon. The autosaved working
 * file and Save work are what cover the rest.
 */
const MAX_UNDO = 5

/**
 * The document, and the road back to what it was.
 *
 * One state rather than three, so an undo cannot half-happen: taking a step
 * back moves the document, shortens the past and lengthens the future in a
 * single update, and every one of these transitions is a pure function of what
 * came before it. That last part matters more than it looks - React invokes a
 * state updater twice in development, and a version of this that pushed onto a
 * separate history from inside `setDoc` recorded every edit twice.
 */
interface History {
  doc: AnimationDoc
  past: AnimationDoc[]
  future: AnimationDoc[]
}

/**
 * Somewhere for a clip to go, when this editor is not the backoffice's.
 *
 * The animator was written as a working file in a browser: it poses the dummy,
 * bakes the keys and hands back a `.glb` you keep wherever you keep files. That
 * is still the whole of what /ovaloffice/animator does, and it is right for an
 * admin's tool.
 *
 * A *space* wants the other thing - a clip on its own shelf, that a blueprint
 * can name - and the way to give it one is not a second animator. It is one
 * optional prop: the editor stays the editor, and where a clip lands becomes
 * the caller's business. See `/t/[slug]/thingiverse/clips`.
 */
export interface ClipShelf {
  /**
   * What saving this will cost, in coins. Zero draws nothing.
   *
   * The caller's, and only ever a *new* clip's price: saving over one already
   * on the shelf costs nothing, so a studio holding an existing clip passes
   * zero. `saveClip` charges from `nextPrice`, which is where the number comes
   * from, so the button and the purse cannot disagree.
   */
  price?: number
  /** What the button says. The caller's, because it is the caller's shelf. */
  label: string
  /** True while the save is in flight; the button says so and goes dead. */
  saving: boolean
  /** Whatever the last save said, good or bad. Drawn under the button. */
  note: string | null
  /** The name, held by the caller so it can be edited beside the button. */
  name: string
  onName: (name: string) => void
  /** Bake and store. The baked half is what plays; the doc is what reopens. */
  onSave: (baked: BakedClip, doc: AnimationDoc) => void
  /**
   * A clip being reopened, rather than a new one.
   *
   * Parsed against the rig's rest pose when the model loads - see `onReady`,
   * where the same thing happens to the working file in localStorage and for
   * the same reason: a bone the document does not mention has to come from
   * somewhere, and the model is the only authority.
   */
  initial?: unknown
}

export function Animator({
  shelf,
  skin = null,
  initialRig = 'dummy',
}: {
  shelf?: ClipShelf
  /**
   * The body this account actually wears, as a catalogue id.
   *
   * Posing a grey mannequin and then watching the clip play on a knight is a
   * small, constant translation somebody has to do in their head - and the two
   * are not even the same shape, so an arm that cleared the body on the dummy
   * can end up inside a pauldron. The skins share the dummy's skeleton exactly
   * (`hips`, `spine`, `upperarm.l`, `handslot.r` - every name), so this is a
   * different *file* on the same rig and nothing else changes.
   *
   * Null is the dummy, which is what an account with no skin wears anyway.
   */
  skin?: string | null
  /**
   * Which rig to open on. The choice stays the editor's - the Body panel still
   * switches - but a caller that already knows what the clip will play on (the
   * video studio, animating a fox) opens on that body rather than making
   * somebody find the toggle first.
   */
  initialRig?: RigId
} = {}) {
  const [rig, setRig] = useState<RigHandle | null>(null)

  /**
   * Which body is being posed, and what is in its hand.
   *
   * Both are the editor's own state rather than part of the document: a clip is
   * bones and times, and the body it was keyed on is recorded once, on the way
   * to the shelf. What a body happens to be holding is never recorded at all -
   * see `AnimatorStage.hold`.
   */
  const [rigId, setRigId] = useState<RigId>(initialRig)
  const [holding, setHolding] = useState<{ model: string; socket: string } | null>(null)
  const [holdQuery, setHoldQuery] = useState('')

  /**
   * A few things to put in a hand.
   *
   * Six, off the same search the thingiverse uses - which reaches the level
   * packs as well as the world's, and that is where the swords are. Not a
   * picker with thumbnails: this is a posing aid, the panel is 22rem wide, and
   * somebody looking for a sword types "sword".
   */
  const holdHits = useMemo(() => {
    if (holdQuery.trim().length < 2) return []
    return searchModels(holdQuery).slice(0, 6)
  }, [holdQuery])

  const body = useMemo<BodyRig>(() => {
    const base = RIGS[rigId]
    // The skin is a person, so it only replaces the person. Wearing a knight
    // does not change what a fox looks like.
    if (rigId !== 'dummy' || !skin) return base
    return { ...base, url: `/xp/packs/${skin}.glb` }
  }, [rigId, skin])
  /**
   * The shelf, mirrored into a ref.
   *
   * `onReady` fires once, when the model finishes loading, and it is memoised
   * on `replace` alone - deliberately, because a callback that changed identity
   * whenever the save note changed would re-run the "adopt what was left here"
   * branch and throw away whatever had been keyed since.
   */
  const shelfRef = useRef<ClipShelf | undefined>(shelf)
  /** The same trick for the rig: `onReady` must not change identity for it. */
  const rigRef = useRef<RigId>(rigId)
  useEffect(() => {
    shelfRef.current = shelf
    rigRef.current = rigId
  })

  const [history, setHistory] = useState<History>(() => ({
    doc: emptyDoc(NO_REST, 'idle'),
    past: [],
    future: [],
  }))
  const doc = history.doc
  const [pose, setPose] = useState<Pose>(NO_REST)
  const [selected, setSelected] = useState<string | null>(null)
  const [pins, setPins] = useState<ReadonlySet<string>>(() => new Set())
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [autoKey, setAutoKey] = useState(true)
  const [showGrid, setShowGrid] = useState(true)

  /**
   * The viewport's own capture function, handed out from inside the Canvas.
   *
   * A ref rather than state because it is a *capability*, not a value: nothing
   * on this page should re-render when the renderer becomes available, and a
   * `useState` here would re-render the whole editor once on mount for no
   * visible change.
   */
  const takeFrame = useRef<TakeFrame | null>(null)
  /**
   * Whether one finger belongs to the camera rather than to the handles.
   *
   * A phone has no second mouse button to give the camera and no modifier key
   * to hold, so on touch the two things that both want a single finger - drag
   * a bone, turn the view - have to be divided some other way. The same
   * division the world builder makes: one finger poses, two fingers pinch to
   * zoom and drag to pan, and turning the view is a button that lends the
   * camera the one finger for as long as it is on.
   *
   * On a mouse it is redundant and harmless: the left button already orbits
   * anywhere that is not a handle.
   */
  const [looking, setLooking] = useState(false)
  /**
   * The mobile stand-in for shift-drag.
   *
   * A touchscreen has no shift key, so "move along the floor" has to be a
   * button instead of a modifier there - and since the same button costs a
   * mouse user nothing, it is not gated behind touch detection. See the note
   * on `slideMode` in `AnimatorStage`.
   */
  const [slideMode, setSlideMode] = useState(false)
  /**
   * The viewport, alone, filling the screen.
   *
   * The side panels are the thing most in the way of actually looking at a
   * pose on a small screen, so this drops them rather than shrinking them.
   * Save and Download stay reachable regardless - see the floating bar below
   * the canvas - because the one thing worse than a cramped panel is a save
   * button you can no longer find at all.
   */
  const [fullscreen, setFullscreen] = useState(false)
  const [clipboard, setClipboard] = useState<{ pose: Pose; ease: Ease } | null>(null)
  const [speed, setSpeed] = useState(1)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [time, setTime] = useState(0)

  /**
   * The playhead, twice.
   *
   * The ref is the truth - the frame loop reads and writes it sixty times a
   * second - and the state is a mirror for the parts that draw. Writing only
   * the state would make the clock as slow as React; writing only the ref
   * would leave the strip frozen. See `Playhead`.
   */
  const timeRef = useRef(0)
  /** Set before anything that must not be overwritten by the frame loop. */
  const frozen = useRef(false)

  const seek = useCallback((next: number) => {
    timeRef.current = next
    setTime(next)
  }, [])

  /**
   * Save the current frame.
   *
   * The floor is hidden for a cut-out and put back afterwards, and that is
   * done here rather than inside the capture because `showGrid` is this
   * component's state - the shot cannot reach across and change it. Two
   * renders and a frame's delay, which nobody sees and which is honest about
   * where the state actually lives.
   */
  const shoot = useCallback(
    ({ transparent }: { transparent: boolean }) => {
      const hideFloor = transparent && showGrid
      if (hideFloor) setShowGrid(false)

      // After the render that took the floor away, not before it.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const url = takeFrame.current?.({ transparent })
          if (hideFloor) setShowGrid(true)
          if (!url) return
          const frame = String(Math.round(timeRef.current * doc.fps)).padStart(4, '0')
          saveDataUrl(url, `${doc.name || 'clip'}-${frame}.png`)
        })
      })
    },
    [showGrid, doc.fps, doc.name],
  )

  /**
   * The last thing an edit was tagged with, and when.
   *
   * Dragging a rotation slider is one gesture and should be one step back, not
   * forty. Without this the five slots fill in a fifth of a second and undo
   * cannot reach past the slider you are still holding. Tagged edits that
   * repeat inside the window replace the top of the stack instead of pushing a
   * new one; anything untagged - a drag on a handle, a stamp, a delete - is
   * always its own step.
   */
  const lastEdit = useRef<{ tag: string; at: number } | null>(null)

  /** A change to the document that undo should be able to take back. */
  const edit = useCallback((change: (doc: AnimationDoc) => AnimationDoc, tag?: string) => {
    const now = performance.now()
    const coalesce =
      tag !== undefined && lastEdit.current?.tag === tag && now - lastEdit.current.at < 900
    lastEdit.current = tag === undefined ? null : { tag, at: now }

    setHistory((current) => {
      const next = change(current.doc)
      // Reference equality, and the document helpers cooperate: the ones that
      // decline - deleting the only key, moving a key that is not there -
      // hand back the same object rather than a copy of it.
      if (next === current.doc) return current
      return coalesce && current.past.length > 0
        ? { doc: next, past: current.past, future: [] }
        : { doc: next, past: [...current.past, current.doc].slice(-MAX_UNDO), future: [] }
    })
  }, [])

  /** A change nobody would ever want to undo one keystroke at a time. */
  const tweak = useCallback((change: (doc: AnimationDoc) => AnimationDoc) => {
    setHistory((current) => ({ ...current, doc: change(current.doc) }))
  }, [])

  const undo = useCallback(() => {
    lastEdit.current = null
    setHistory((current) => {
      if (current.past.length === 0) return current
      return {
        doc: current.past[current.past.length - 1],
        past: current.past.slice(0, -1),
        future: [current.doc, ...current.future].slice(0, MAX_UNDO),
      }
    })
  }, [])

  const redo = useCallback(() => {
    lastEdit.current = null
    setHistory((current) => {
      if (current.future.length === 0) return current
      return {
        doc: current.future[0],
        past: [...current.past, current.doc].slice(-MAX_UNDO),
        future: current.future.slice(1),
      }
    })
  }, [])

  /** A different document altogether. Opening one is not an edit of the last. */
  const replace = useCallback((next: AnimationDoc) => {
    lastEdit.current = null
    setHistory({ doc: next, past: [], future: [] })
  }, [])

  /**
   * The model has loaded: adopt whatever was left here last time.
   *
   * The document cannot exist before this point - every key holds a full pose,
   * and there is nothing to pose until the skeleton is in memory. That is also
   * why the stored file is parsed against `rig.rest`: a bone the file does not
   * mention has to come from somewhere, and the model is the only authority.
   */
  const onReady = useCallback((handle: RigHandle) => {
    setRig(handle)
    setPose(handle.rest)

    /**
     * A clip being reopened wins over the working file.
     *
     * Somebody who clicked a clip on the shelf means *that* clip, and the
     * localStorage draft is whatever they happened to be doing last time in a
     * different tab. The draft is not cleared - it is still there when they
     * come back to a blank editor.
     */
    if (shelfRef.current?.initial) {
      try {
        replace(parseDoc(shelfRef.current.initial, handle.rest))
        return
      } catch {
        // A stored document the parser will not have opens as a new one, for
        // the same reason a corrupt draft does.
      }
    }

    let stored: AnimationDoc | null = null
    try {
      const raw = window.localStorage.getItem(draftKey(rigRef.current))
      if (raw) stored = parseDoc(JSON.parse(raw), handle.rest)
    } catch {
      // A corrupt working file opens as a new one rather than as a blank page
      // with an error on it. There is nothing here worth a dialogue.
    }
    replace(stored ?? emptyDoc(handle.rest, 'idle'))
  }, [replace])

  // Autosave. An afternoon's animation lost to a refresh is the only
  // unforgivable bug an editor like this can have.
  useEffect(() => {
    if (!rig) return
    try {
      window.localStorage.setItem(draftKey(rigId), JSON.stringify(doc))
    } catch {
      // Quota, private mode. Not worth interrupting anybody over.
    }
  }, [doc, rig, rigId])

  /**
   * A pose arriving from the viewport.
   *
   * `keyable` is what separates "you moved something" from "the playhead moved
   * and this is what it looks like there". Only the first may auto-key; the
   * second keying itself would write a key every frame of playback.
   */
  const onPose = useCallback(
    (next: Pose, keyable: boolean) => {
      setPose(next)
      if (keyable && autoKey) edit((current) => putKey(current, timeRef.current, next))
    },
    [autoKey, edit],
  )

  const keyNow = useCallback(() => {
    if (!rig) return
    const captured = rig.capture()
    setPose(captured)
    edit((current) => putKey(current, timeRef.current, captured))
  }, [rig, edit])

  const dropKey = useCallback(() => {
    edit((current) => removeKey(current, timeRef.current))
  }, [edit])

  const stepFrame = useCallback(
    (frames: number) => {
      setPlaying(false)
      seek(Math.min(Math.max(timeRef.current + frames / doc.fps, 0), doc.duration))
    },
    [doc.fps, doc.duration, seek],
  )

  const jumpKey = useCallback(
    (direction: 1 | -1) => {
      setPlaying(false)
      const times = doc.keys.map((key) => key.time)
      const found =
        direction === 1
          ? times.find((t) => t > timeRef.current + 1e-6)
          : [...times].reverse().find((t) => t < timeRef.current - 1e-6)
      if (found !== undefined) seek(found)
    },
    [doc.keys, seek],
  )

  /** The rig, put back exactly as it shipped. */
  const resetAll = useCallback(() => {
    if (!rig) return
    rig.apply(rig.rest)
    onPose(clonePose(rig.rest), true)
  }, [rig, onPose])

  const resetBone = useCallback(() => {
    if (!rig || !selected) return
    const bind = rig.restQuats.get(selected)
    const bone = rig.bones.get(selected)
    if (!bind || !bone) return
    bone.quaternion.copy(bind)
    bone.updateMatrixWorld(true)
    onPose(rig.capture(), true)
  }, [rig, selected, onPose])

  /**
   * The key under the playhead, held for the session.
   *
   * The whole key and not just the pose: a hold that has been copied and
   * pasted as a smooth is not the same key, and having to notice that and set
   * the easing again by hand is exactly the sort of small betrayal that makes
   * a tool feel unreliable.
   *
   * Between two keys rather than on one, it takes the blend - which is what is
   * on screen, and what you meant.
   */
  const copyKey = useCallback(() => {
    const at = keyAt(doc, timeRef.current)
    setClipboard({
      pose: clonePose(at >= 0 ? doc.keys[at].pose : pose),
      ease: at >= 0 ? doc.keys[at].ease : 'smooth',
    })
    setNote(null)
  }, [doc, pose])

  const pasteKey = useCallback(() => {
    if (!rig || !clipboard) return
    rig.apply(clipboard.pose)
    setPose(clonePose(clipboard.pose))
    edit((current) => putKey(current, timeRef.current, clipboard.pose, clipboard.ease))
  }, [rig, clipboard, edit])

  const togglePin = useCallback((bone: string) => {
    setPins((current) => {
      const next = new Set(current)
      if (next.has(bone)) next.delete(bone)
      else next.add(bone)
      return next
    })
  }, [])

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  const downloadGlb = useCallback(async () => {
    if (!rig) return
    setPlaying(false)
    setBusy(true)
    // Set on the ref rather than through state, because the exporter's own
    // work is asynchronous - it encodes the texture through a canvas - and a
    // frame landing in the middle of that would put the posed rig back while
    // the exporter was reading the bind pose out of it.
    frozen.current = true
    try {
      const blob = await exportGlb(rig.root, doc, rig.rest, rig.apply, pose)
      save(blob, `${fileStem(doc.name)}.glb`)
      setNote(`Saved ${fileStem(doc.name)}.glb — drop it in public/xo and play it by the name “${doc.name}”.`)
    } catch (error) {
      setNote(`Could not build the GLB: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      frozen.current = false
      setBusy(false)
    }
  }, [rig, doc, pose])

  /**
   * Text in, document out. The one road in for both a file and a paste.
   *
   * Written once because the two are the same act with different plumbing, and
   * because the interesting part - deciding whether what arrived is an
   * animation at all, and whether it is one this version understands - is
   * exactly the part that must not exist twice and drift.
   */
  const applyText = useCallback(
    (text: string, source: string) => {
      if (!rig) return
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        setNote(`That ${source} is not JSON.`)
        return
      }

      const declared = declaredVersion(raw)
      const parsed = parseDoc(raw, rig.rest)
      replace(parsed)
      seek(0)

      // Said, not refused. A newer file is very likely still mostly readable -
      // keys and times are the bulk of it - and opening it with a warning beats
      // refusing to open something somebody can see the contents of.
      setNote(
        declared > CLIP_VERSION
          ? `Opened “${parsed.name}” — ${parsed.keys.length} keys. It says version ${declared} and this editor knows version ${CLIP_VERSION}, so anything newer than that has been dropped.`
          : `Opened “${parsed.name}” — ${parsed.keys.length} keys, ${parsed.duration.toFixed(2)}s at ${parsed.fps}fps.`,
      )
    },
    [rig, seek, replace],
  )

  /**
   * A preset, laid down from the playhead.
   *
   * One step back undoes the whole stamp rather than each of its keys, which
   * is the only sane granularity for something that writes five at once.
   */
  const stampPreset = useCallback(
    (preset: Preset) => {
      if (!rig) return
      setPlaying(false)
      edit((current) => stamp(current, preset, timeRef.current, rig.rest, speed))
      setNote(
        `Stamped ${preset.label.toLowerCase()} from ${timeRef.current.toFixed(2)}s — ${stampLength(preset, speed).toFixed(2)}s of it. It only touched the bones it names, so anything else you posed is still there.`,
      )
    },
    [rig, speed, edit],
  )

  // -------------------------------------------------------------------------
  // Keys on the keyboard, as opposed to keys on the strip
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Space in a text box is a space. Every shortcut here is a single
      // character, so any field at all has to be allowed to keep them.
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return
      }

      // Undo first, because it is the one shortcut that carries a modifier and
      // the plain-key table below refuses modified events outright.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const actions: Record<string, () => void> = {
        ' ': () => setPlaying((on) => !on),
        k: keyNow,
        Delete: dropKey,
        Backspace: dropKey,
        Home: () => {
          setPlaying(false)
          seek(0)
        },
        ArrowLeft: () => stepFrame(-1),
        ArrowRight: () => stepFrame(1),
        ArrowDown: () => jumpKey(-1),
        ArrowUp: () => jumpKey(1),
        c: copyKey,
        v: pasteKey,
      }

      const action = actions[event.key]
      if (!action) return
      event.preventDefault()
      action()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyNow, dropKey, seek, stepFrame, jumpKey, undo, redo, copyKey, pasteKey])

  // Escape backs out of fullscreen, and the page behind it holds still while
  // it's up rather than scrolling underneath a viewport that is supposedly
  // the whole screen.
  useEffect(() => {
    if (!fullscreen) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onEscape)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onEscape)
      document.body.style.overflow = previousOverflow
    }
  }, [fullscreen])

  const spec = selected ? body.bones.find((bone) => bone.name === selected) ?? null : null
  const onKeyframe = keyAt(doc, time) >= 0
  const angles = useMemo(
    () => (rig && selected ? boneEuler(rig, pose, selected) : { x: 0, y: 0, z: 0 }),
    [rig, pose, selected],
  )

  /**
   * The transport, the strip, and whatever save just said.
   *
   * One definition used in two places: below the viewport in the normal
   * layout, and floating over it in fullscreen. Save and Download live inside
   * `Transport` now rather than only at the bottom of the side panel, so
   * neither ever depends on a dock that fullscreen just removed.
   */
  const controls = (
    <>
      <Transport
        doc={doc}
        time={time}
        playing={playing}
        autoKey={autoKey}
        onKeyframe={onKeyframe}
        busy={busy}
        canDownload={!!rig}
        fullscreen={fullscreen}
        onPlay={() => setPlaying((on) => !on)}
        onHome={() => {
          setPlaying(false)
          seek(0)
        }}
        onStep={stepFrame}
        onJump={jumpKey}
        onKeyNow={keyNow}
        onDrop={dropKey}
        onAutoKey={() => setAutoKey((on) => !on)}
        onLoop={() => edit((current) => ({ ...current, loop: !current.loop }))}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onSaveWork={() => saveDoc(doc)}
        onDownload={downloadGlb}
        onToggleFullscreen={() => setFullscreen((on) => !on)}
        onCopyKey={copyKey}
        onPasteKey={pasteKey}
        onResetPose={resetAll}
        canPaste={!!clipboard && !!rig}
      />

      <Timeline
        doc={doc}
        time={time}
        onSeek={(next) => {
          setPlaying(false)
          seek(next)
        }}
        onMoveKey={(from, to) => {
          edit((current) => moveKey(current, from, to), `move:${from}`)
          seek(snapTime(to, doc.fps))
        }}
      />

      {note && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </>
  )

  return (
    /*
      The stage holds still and the panel scrolls past it.

      `items-start` and a sticky first column, which between them are the whole
      of it: the sidebar is a column of a dozen panels and is taller than any
      screen, and reading the bottom of it used to scroll the body you were
      posing off the top. Sticky rather than a fixed-height pane with its own
      scrollbar, because a page with two scrollbars is a page where the wheel
      does different things depending on where the pointer happens to be.

      It is the same answer on a phone, where the columns stack: the viewport
      sits at the top and stays there while the panels move under it. Which is
      why the stage is capped in height below `xl` - a sticky element taller
      than the screen is an element that cannot stick.
    */
    <div
      className={
        fullscreen ? 'block' : 'grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]'
      }
    >
      <div
        className={
          fullscreen
            ? 'fixed inset-0 z-50 flex flex-col bg-background p-2'
            : /*
                Capped and scrollable, which is what makes the timeline
                reachable.

                A `sticky` element taller than the viewport is a trap: the page
                scrolls, the element stays pinned at `top-2`, and whatever hangs
                off its bottom can never be brought into view. Here that bottom
                is the timeline - reported as cut off, with scrolling to the end
                doing nothing, because there was nothing further to scroll to.

                So the column takes at most the window and scrolls inside
                itself, which is the same pattern the scene editor's control
                panel uses one directory over. `overscroll-contain` keeps a
                wheel that reaches the end of this column from carrying on into
                the page behind it, which on an editor you are working inside is
                the difference between a limit and a lurch.
              */
              'sticky top-2 z-20 flex max-h-[calc(100dvh-1rem)] flex-col gap-3 self-start overflow-y-auto overscroll-contain bg-background pb-2'
        }
      >
        <div
          className={
            fullscreen
              ? 'relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-secondary/30'
              : 'relative h-[56vh] min-h-[16rem] overflow-hidden rounded-2xl border border-border bg-secondary/30 sm:h-[46vh] xl:aspect-[4/3] xl:h-auto xl:min-h-0'
          }
          style={{ touchAction: 'none' }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            /* `preserveDrawingBuffer` so a frame can be read back as a PNG -
               see `frame-shot.tsx`. `alpha` so a transparent shot has
               something to be transparent *to*: without it the canvas is
               composited onto opaque black and every "transparent" export is
               a black rectangle. */
            gl={{ preserveDrawingBuffer: true, alpha: true }}
            camera={{ position: [1.9, 1.5, 2.4], fov: 40, near: 0.05, far: 100 }}
            onPointerMissed={() => setSelected(null)}
          >
            <OrbitControls
              makeDefault
              target={[0, 0.8, 0]}
              enableDamping={false}
              // Off while a handle is held: the same left button drives both,
              // and a drag that also orbited would move the target out from
              // under the hand it was placing.
              enabled={!dragging}
              maxPolarAngle={Math.PI / 1.9}
              minDistance={0.6}
              maxDistance={12}
              // The wheel moves towards whatever is under the pointer, which is
              // most of what panning is for and costs no button at all.
              zoomToCursor
              mouseButtons={{
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
              }}
              /**
               * On a touchscreen there are no buttons to divide up, so the
               * division is by how many fingers. One finger poses, which is
               * the gesture you make constantly and the only one that can be
               * aimed. Two pinch to zoom and drag to pan, which is what two
               * fingers do everywhere else on a phone. Turning the view is
               * what is left over, and it goes behind the Look button.
               *
               * The default here would be one finger rotating - which, with
               * the handles also on one finger, means every attempt to place a
               * hand is also a camera swing.
               */
              touches={{
                ONE: looking ? THREE.TOUCH.ROTATE : undefined,
                TWO: THREE.TOUCH.DOLLY_PAN,
              }}
            />
            <Suspense fallback={null}>
              <AnimatorStage
                body={body}
                hold={holding}
                grabbable={!looking}
                slideMode={slideMode}
                doc={doc}
                timeRef={timeRef}
                playing={playing}
                frozen={frozen}
                selected={selected}
                pins={pins}
                showGrid={showGrid}
                onReady={onReady}
                onTime={setTime}
                onSelect={setSelected}
                onPose={onPose}
                onDragging={setDragging}
              />
            </Suspense>
            <FrameShot takeRef={takeFrame} />
          </Canvas>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
            {/*
              Three lines of it, over the body, on the screen with the least
              room for either. The short form keeps the one thing somebody
              cannot guess - that the dots are the control - and drops the two
              they will find by trying: Slide is a labelled button already, and
              pinching to zoom is what fingers do everywhere.
            */}
            <p className="rounded-lg bg-background/70 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
              drag a dot to pose
              <span className="hidden sm:inline">
                {' '}· shift-drag or Slide moves along the floor · wheel or pinch to zoom
              </span>
            </p>
            <div className="flex shrink-0 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={slideMode ? 'default' : 'secondary'}
                className="pointer-events-auto"
                onClick={() => setSlideMode((on) => !on)}
                aria-pressed={slideMode}
                title="Drag handles along the floor — the touch equivalent of shift-drag"
              >
                <Move className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Slide</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={looking ? 'default' : 'secondary'}
                className="pointer-events-auto"
                onClick={() => setLooking((on) => !on)}
                aria-pressed={looking}
                title="Give one finger to the camera"
              >
                <Orbit className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Look</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showGrid ? 'secondary' : 'ghost'}
                className="pointer-events-auto"
                onClick={() => setShowGrid((on) => !on)}
                aria-pressed={showGrid}
                title="Toggle the floor grid"
              >
                <Grid3x3 className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Floor</span>
              </Button>
              {/*
                The frame, as a picture.

                Two buttons rather than one with a modifier, because they are
                two different deliverables: the cut-out goes into the video
                editor over whatever is behind it, and the flat one is what you
                paste into a message to show somebody a pose. A single button
                would have to guess which, and guessing wrong is a re-export.
              */}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="pointer-events-auto"
                onClick={() => shoot({ transparent: true })}
                title="Save this frame as a PNG with no background"
              >
                <ImageIcon className="size-3.5" aria-hidden />{' '}
                <span className="hidden sm:inline">Cut-out</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="pointer-events-auto"
                onClick={() => shoot({ transparent: false })}
                title="Save this frame as a PNG, background and all"
              >
                <ImageIcon className="size-3.5" aria-hidden />{' '}
                <span className="hidden sm:inline">Frame</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="pointer-events-auto"
                onClick={() => setFullscreen((on) => !on)}
                aria-pressed={fullscreen}
                title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fill the screen with the viewport'}
              >
                {fullscreen ? (
                  <Minimize2 className="size-3.5" aria-hidden />
                ) : (
                  <Maximize2 className="size-3.5" aria-hidden />
                )}
              </Button>
            </div>
          </div>

          {fullscreen && (
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-background/90 p-3 backdrop-blur-md">
              {controls}
            </div>
          )}
        </div>

        {!fullscreen && <div className="flex flex-col gap-3">{controls}</div>}
      </div>

      {!fullscreen && (
      <aside className="flex flex-col gap-3">
        <Panel title="Clip" icon={Clapperboard}>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Name
            <input
              value={doc.name}
              onChange={(event) =>
                tweak((current) => ({ ...current, name: event.target.value.slice(0, 60) }))
              }
              className="w-full rounded-lg border border-border bg-secondary/40 px-2 py-1 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Num
              label="Frames per second"
              value={doc.fps}
              min={MIN_FPS}
              max={MAX_FPS}
              step={1}
              onChange={(value) => edit((current) => setFps(current, value), 'fps')}
            />
            <Num
              label="Length (s)"
              value={doc.duration}
              min={0.1}
              max={MAX_DURATION}
              step={0.1}
              onChange={(value) => {
                edit((current) => setDuration(current, value), 'duration')
                if (timeRef.current > value) seek(value)
              }}
            />
          </div>
          {onKeyframe && (
            <Pick
              label="Ease out of the key under the playhead"
              value={doc.keys[keyAt(doc, time)].ease}
              options={EASES}
              onChange={(value) => edit((current) => setEase(current, time, value as Ease))}
            />
          )}
        </Panel>

        <Panel
          icon={spec ? Bone : PersonStanding}
          title={spec ? spec.label : 'Bones'}
          hint={
            spec
              ? 'Drag its dot in the viewport, or turn it exactly here.'
              : 'Pick a dot in the viewport, or a name below.'
          }
        >
          {spec && rig && (
            <>
              {/*
                The pad and the numbers, side by side rather than one under the
                other: they are two ways of saying the same thing, and a column
                would read as two steps.
              */}
              <div className="flex items-start gap-3">
                <PosePad
                  pitch={angles.x}
                  turn={angles.y}
                  roll={angles.z}
                  onChange={(next) => {
                    const turned = setBoneEuler(rig, spec.name, {
                      ...angles,
                      x: next.pitch,
                      y: next.turn,
                      z: next.roll,
                    })
                    if (!turned) return
                    setPose(turned)
                    if (autoKey) {
                      edit((current) => putKey(current, timeRef.current, turned), `pad:${spec.name}`)
                    }
                  }}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <Slide
                      key={axis}
                      label={axis === 'x' ? 'Pitch' : axis === 'y' ? 'Turn' : 'Roll'}
                      value={angles[axis]}
                      min={-180}
                      max={180}
                      step={1}
                      unit="°"
                      /* The pad's own two colours, and blue for the one it has
                         no surface for. See `AXIS`. */
                      tint={axis === 'x' ? AXIS.pitch : axis === 'y' ? AXIS.turn : AXIS.roll}
                      onChange={(value) => {
                        const next = setBoneEuler(rig, spec.name, { ...angles, [axis]: value })
                        if (!next) return
                        setPose(next)
                        if (autoKey) {
                          edit(
                            (current) => putKey(current, timeRef.current, next),
                            // Tagged per bone and axis, so dragging one slider is
                            // one step back but moving on to the next is another.
                            `slider:${spec.name}:${axis}`,
                          )
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={resetBone}>
                  <RotateCcw className="size-3.5" aria-hidden /> Straighten {spec.label}
                </Button>
                {spec.pinnable && (
                  <Button
                    type="button"
                    size="sm"
                    variant={pins.has(spec.name) ? 'default' : 'secondary'}
                    onClick={() => togglePin(spec.name)}
                  >
                    <Pin className="size-3.5" aria-hidden /> {pins.has(spec.name) ? 'Pinned' : 'Pin'}
                  </Button>
                )}
              </div>
            </>
          )}

          <BoneList
            bones={body.bones}
            selected={selected}
            pins={pins}
            onSelect={setSelected}
            onPin={togglePin}
          />
        </Panel>

        {/*
          Saving it to the space, when there is a space to save it to.

          First in the panel, above even the body, because it is the *point* of
          the editor when it is opened from a workspace: everything below is how
          you get there. The backoffice's animator passes no shelf and this is
          not drawn at all - its clip comes out as a file, which is the right
          shape for an admin's tool and the reason this is a prop rather than a
          second editor.
        */}
        {shelf && (
          <Panel
            title="Shelf"
            icon={Clapperboard}
            hint="Saved to this space, where a blueprint can name it."
          >
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Name
                <input
                  value={shelf.name}
                  onChange={(event) => shelf.onName(event.target.value)}
                  className="rounded-lg border border-border bg-secondary px-2 py-1 text-sm text-foreground"
                />
              </label>

              <Button
                type="button"
                size="sm"
                disabled={!rig || shelf.saving}
                onClick={() => {
                  if (!rig) return
                  /*
                   * Baked here rather than on the server, and that is where it
                   * belongs: baking needs the rig's *rest pose*, which is a
                   * property of a glTF that only the browser has loaded. The
                   * server would have to parse a model to check the arithmetic
                   * it was being handed, which is a great deal of machinery to
                   * re-derive a number the editor is holding.
                   */
                  shelf.onSave(bake(doc, rig.rest), doc)
                }}
              >
                {shelf.saving ? 'Saving…' : shelf.label}
                {/* Never beside "Saving…" - a price read after the press is a
                    price read too late to be a decision. */}
                {!shelf.saving && <CoinPrice coins={shelf.price ?? 0} />}
              </Button>

              {shelf.note && (
                <p className="text-[11px] text-muted-foreground">{shelf.note}</p>
              )}

              <p className="text-[11px] text-muted-foreground">
                Keyed on the {RIGS[rigId].label.toLowerCase()}. A clip binds to bones by
                name, so it plays on that body and stands still on the other.
              </p>
            </div>
          </Panel>
        )}

        <BodyPanel
          rigId={rigId}
          skin={skin}
          holding={holding}
          holdQuery={holdQuery}
          holdHits={holdHits}
          onQuery={setHoldQuery}
          onHold={setHolding}
          onRig={(next) => {
            if (next === rigId) return
            setSelected(null)
            setPins(new Set())
            setHolding(null)
            setRigId(next)
          }}
        />

        <Panel
          title="Moves"
          icon={Sparkles}
          hint="Stamped from the playhead, over whatever is already there."
        >
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((preset) => {
              const Icon = MOVE_ICONS[preset.id] ?? Sparkles
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!rig}
                  onClick={() => stampPreset(preset)}
                  title={preset.hint}
                  className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:border-accent hover:text-foreground disabled:opacity-40"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{preset.label}</span>
                  <span className="shrink-0 font-mono text-[10px]">
                    {stampLength(preset, speed).toFixed(1)}s
                  </span>
                </button>
              )
            })}
          </div>
          <Slide
            label="Speed"
            value={speed}
            min={0.25}
            max={3}
            step={0.05}
            unit="×"
            onChange={setSpeed}
          />
          <p className="text-[10px] text-muted-foreground">
            Each one writes only the bones it names, so Walk and then Arm swing at the same spot is
            a whole walk — and neither has touched the head you posed.
          </p>
        </Panel>

        <Panel title="Pose" icon={Copy}>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={copyKey}>
              <Clipboard className="size-3.5" aria-hidden /> Copy key
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!clipboard || !rig}
              onClick={pasteKey}
            >
              <ClipboardCheck className="size-3.5" aria-hidden /> Paste key
            </Button>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={resetAll}>
            <RotateCcw className="size-3.5" aria-hidden /> Back to the rest pose
          </Button>
          <p className="text-[10px] text-muted-foreground">
            {clipboard
              ? `Holding a ${clipboard.ease} key. Paste writes it wherever the playhead is.`
              : 'Copy takes the whole key — the pose and its easing. Closing a loop is copy frame one, scrub to the end, paste.'}
          </p>
        </Panel>

        <Panel
          title="Save"
          icon={Download}
          hint="Also in the transport bar on a wide screen, and in fullscreen anywhere — so saving never depends on this panel. This is where a file comes back in."
        >
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" onClick={downloadGlb} disabled={!rig || busy}>
              <Download className="size-3.5" aria-hidden /> {busy ? 'Building…' : '.glb'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => saveDoc(doc)}>
              <Save className="size-3.5" aria-hidden /> Save work
            </Button>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium transition hover:bg-secondary/70">
            <FolderOpen className="size-3.5" aria-hidden /> Open
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void file.text().then((text) => applyText(text, 'file'))
                event.target.value = ''
              }}
            />
          </label>
          <p className="text-[10px] text-muted-foreground">
            The <code>.glb</code> is the dummy with the clip baked in, ready for <code>useGLTF</code> —
            the file you ship. Save work is the editable JSON: keys, easing, timing. A GLB cannot be
            reopened for editing, so keep the JSON too.
          </p>

          <Paste onApply={(text) => applyText(text, 'paste')} disabled={!rig} />
        </Panel>

        <Panel title="Shortcuts" icon={Keyboard}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {[
              ['Space', 'Play or pause'],
              ['K', 'Key the pose here'],
              ['Delete', 'Remove the key here'],
              ['← →', 'One frame'],
              ['↑ ↓', 'Next or previous key'],
              ['Home', 'Back to the start'],
              ['C / V', 'Copy and paste the key'],
              ['⌘Z / ⇧⌘Z', `Undo and redo, ${MAX_UNDO} deep`],
              ['Shift-drag', 'Move along the floor'],
              ['Esc', 'Exit fullscreen'],
            ].map(([key, what]) => (
              <div key={key} className="contents">
                <dt className="font-mono text-foreground">{key}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </aside>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * A document, pasted in as text.
 *
 * The other half of "save work", and the half that makes the `.json` a thing
 * you can send somebody in a message rather than only a file you keep. The box
 * holds its own text - it is a scratch surface, not a view of the document -
 * and empties when what is in it has been taken.
 */
function Paste({ onApply, disabled }: { onApply: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState('')

  return (
    <details className="rounded-lg border border-border bg-secondary/30 px-2 py-1.5">
      <summary className="cursor-pointer list-none text-[11px] text-muted-foreground">
        Paste an animation instead…
      </summary>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder='{ "version": 1, "name": "wave", … }'
        rows={4}
        className="mt-2 w-full resize-y rounded-lg border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground transition focus:border-accent focus:outline-none"
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-1.5 w-full"
        disabled={disabled || text.trim() === ''}
        onClick={() => {
          onApply(text)
          setText('')
        }}
      >
        <ClipboardCheck className="size-3.5" aria-hidden /> Apply
      </Button>
    </details>
  )
}

/**
 * A titled box in the side column.
 *
 * The icon earns its place the same way it does in the studio's panel: this is
 * a column of near-identical rounded rectangles told apart only by a word, and
 * a shape at the left edge is what lets somebody find the one they want again
 * without reading four labels on the way down.
 */
function Panel({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string
  hint?: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-secondary/20 p-3">
      <h3 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-accent/40 text-accent">
          <Icon className="size-3.5" aria-hidden />
        </span>
        {title}
      </h3>
      {hint && <p className="-mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      {children}
    </section>
  )
}

/**
 * The transport, and the two toggles that change what pressing things means.
 *
 * Auto-key sits here rather than in a settings panel because it is the one
 * switch that changes whether your work is being recorded, and a switch like
 * that belongs where you can see it while you work.
 */
function Transport({
  doc,
  time,
  playing,
  autoKey,
  onKeyframe,
  busy,
  canDownload,
  fullscreen,
  onPlay,
  onHome,
  onStep,
  onJump,
  onKeyNow,
  onDrop,
  onAutoKey,
  onLoop,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSaveWork,
  onDownload,
  onToggleFullscreen,
  onCopyKey,
  onPasteKey,
  onResetPose,
  canPaste,
}: {
  doc: AnimationDoc
  time: number
  playing: boolean
  autoKey: boolean
  onKeyframe: boolean
  /** Building the GLB — see `downloadGlb`. */
  busy: boolean
  /** Whether the rig has loaded, i.e. whether there is anything to export. */
  canDownload: boolean
  fullscreen: boolean
  onPlay: () => void
  onHome: () => void
  onStep: (frames: number) => void
  onJump: (direction: 1 | -1) => void
  onKeyNow: () => void
  onDrop: () => void
  onAutoKey: () => void
  onLoop: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onSaveWork: () => void
  onDownload: () => void
  onToggleFullscreen: () => void
  onCopyKey: () => void
  onPasteKey: () => void
  onResetPose: () => void
  /** Whether there is a key held and a rig to paste it on to. */
  canPaste: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (⌘Z)"
      >
        <Undo2 className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (⇧⌘Z)"
      >
        <Redo2 className="size-4" aria-hidden />
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      <Button type="button" size="sm" variant="ghost" onClick={onHome} aria-label="Back to the start">
        <SkipBack className="size-4" aria-hidden />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onJump(-1)} aria-label="Previous key">
        <ChevronsLeft className="size-4" aria-hidden />
      </Button>
      <Button type="button" size="sm" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onJump(1)} aria-label="Next key">
        <ChevronsRight className="size-4" aria-hidden />
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      <Button type="button" size="sm" variant="secondary" onClick={() => onStep(-1)}>
        −1f
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => onStep(1)}>
        +1f
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      <Button type="button" size="sm" variant={onKeyframe ? 'default' : 'secondary'} onClick={onKeyNow}>
        <Diamond className="size-3.5" aria-hidden /> {onKeyframe ? 'Re-key' : 'Key'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onDrop}
        disabled={!onKeyframe || doc.keys.length <= 1}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      <Button
        type="button"
        size="sm"
        variant={autoKey ? 'default' : 'ghost'}
        onClick={onAutoKey}
        title={`Auto-key ${autoKey ? 'on' : 'off'} — whether a drag writes a key by itself`}
      >
        {/* The state is carried by the button lighting up, so the word for it
            is what goes first when the row is short. */}
        Auto<span className="hidden sm:inline">-key {autoKey ? 'on' : 'off'}</span>
      </Button>
      <Button type="button" size="sm" variant={doc.loop ? 'default' : 'ghost'} onClick={onLoop} aria-label="Loop">
        <Repeat className="size-3.5" aria-hidden />
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      {/*
        The pose clipboard, in the transport's own wrap rather than under it.

        It was a row of its own, which on a phone is a row the viewport pays
        for: four bands of chrome between the body you are posing and the strip
        you are scrubbing, on the one screen where there is no room for them.
        Here the three buttons fill whatever the wrap has left over - a full
        line on a desktop, tucked in beside the others on a phone - and the
        labels go below `sm`, where an icon and a tooltip say as much as a word
        does and cost a third of the width.
      */}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onCopyKey}
        aria-label="Copy key"
        title="Copy the whole key — the pose and its easing"
      >
        <Clipboard className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Copy</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onPasteKey}
        disabled={!canPaste}
        aria-label="Paste key"
        title="Paste the held key at the playhead"
      >
        <ClipboardCheck className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Paste</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onResetPose}
        aria-label="Back to the rest pose"
        title="Back to the rest pose"
      >
        <RotateCcw className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Rest</span>
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      {/*
        The two file buttons, on a phone only while fullscreen.

        They were put in this bar so that saving never depended on a dock that
        fullscreen removes, and that reason holds exactly as far as fullscreen:
        in the ordinary layout the Save panel is a short scroll below and has
        both, while here they are two more things wrapping the row onto a third
        line above a viewport that wanted the height. So they stay for the case
        they were added for and step out of the one they crowd.
      */}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onSaveWork}
        aria-label="Save work"
        title="Save work — the editable .json"
        className={fullscreen ? undefined : 'hidden sm:inline-flex'}
      >
        <Save className="size-3.5" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onDownload}
        disabled={!canDownload || busy}
        aria-label={busy ? 'Building the GLB' : 'Download .glb'}
        title={busy ? 'Building…' : 'Download .glb — the file you ship'}
        className={fullscreen ? undefined : 'hidden sm:inline-flex'}
      >
        <Download className="size-3.5" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onToggleFullscreen}
        aria-pressed={fullscreen}
        aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
      >
        {fullscreen ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
      </Button>

      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
        {time.toFixed(2)}s
      </span>
    </div>
  )
}

/**
 * Which body, and what is in its hand.
 *
 * Its own component rather than eighty more lines in `Animator`, which was
 * already the longest function in the file - and because everything in here is
 * about the *editor's* state rather than the document's: nothing it touches
 * ends up in a clip.
 */
function BodyPanel({
  rigId,
  skin,
  holding,
  holdQuery,
  holdHits,
  onQuery,
  onHold,
  onRig,
}: {
  rigId: RigId
  skin: string | null
  holding: { model: string; socket: string } | null
  holdQuery: string
  holdHits: { id: string; label: string }[]
  onQuery: (query: string) => void
  onHold: (hold: { model: string; socket: string } | null) => void
  onRig: (rig: RigId) => void
}) {
  return (
    <Panel
      title="Body"
      icon={PersonStanding}
      hint="A clip binds to bones by name, so it only plays on the body it was keyed on."
    >
      <div className="flex flex-col gap-2">
        <Pick
          label="Posing"
          value={rigId}
          options={RIG_IDS}
          onChange={(value) => {
            if (isRigId(value)) onRig(value)
          }}
        />

        {skin && rigId === 'dummy' && (
          <p className="text-[11px] text-muted-foreground">
            Wearing your own body. It is the same skeleton as the dummy, so the clip
            plays on either.
          </p>
        )}

        {/*
          Something in a hand, and only on a rig that has hands.

          A posing aid and nothing else: it is drawn, it is never keyed, and it
          does not travel with the clip. What a thing is holding in a world is
          the world's business - see `AnimatorStage.hold`.
        */}
        {rigId === 'dummy' && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Holding
              <input
                value={holdQuery}
                onChange={(event) => onQuery(event.target.value)}
                placeholder="sword, cup, book…"
                className="rounded-lg border border-border bg-secondary px-2 py-1 text-sm text-foreground"
              />
            </label>

            {holding && (
              <button
                type="button"
                onClick={() => onHold(null)}
                className="rounded-lg border border-border px-2 py-1 text-left text-xs text-muted-foreground transition hover:text-foreground"
              >
                Put down {holding.model}
              </button>
            )}

            <div className="flex flex-wrap gap-1">
              {holdHits.map((entry) => (
                <span key={entry.id} className="flex gap-1">
                  {(['handslot.l', 'handslot.r'] as const).map((socket) => (
                    <button
                      key={socket}
                      type="button"
                      onClick={() => onHold({ model: entry.id, socket })}
                      title={`${entry.label} in the ${socket === 'handslot.l' ? 'left' : 'right'} hand`}
                      className="rounded-lg border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-accent hover:text-foreground"
                    >
                      {entry.label} {socket === 'handslot.l' ? 'L' : 'R'}
                    </button>
                  ))}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

/** Every handle, by name, for when a dot is behind something. */
