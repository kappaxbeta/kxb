'use client'

/**
 * Copied from `src/app/ovaloffice/animator/animator.tsx`.
 *
 * `src/app/xp/` owns what it draws, and the copy is the rule rather than an
 * accident: docs/xp-creator.md §1.2, enforced by `no-restricted-imports` in
 * eslint.config.mjs. The backoffice's animator is a live surface and this
 * editor is a prototype; sharing one would mean the prototype either drags
 * the product about or waits behind it, and the two are allowed to differ.
 *
 * Verbatim as of this commit, so a diff against the original is the honest
 * way to see how far the two have drifted. Fix things here when they are
 * this editor's problem; the other copy does not hear about it.
 */

import { GizmoHelper, GizmoViewcube, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import {
  Bird,
  Bone,
  Clapperboard,
  ChevronDown,
  ChevronUp,
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
  Hand,
  Keyboard,
  type LucideIcon,
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
import { saveDoc } from '@/app/xp/_editor/animator/download'
import {
  AnimatorStage,
  boneEuler,
  type DragAxis,
  type Nudge,
  type RigHandle,
  setBoneEuler,
} from '@/app/xp/_editor/animator/stage'
import { Timeline } from '@/app/xp/_editor/animator/timeline'
import type { Held } from '@/app/xp/_runtime/body/skinned'
import type { PlayerRole } from '@kxb/xp'
import { Num, Pick, Slide } from '@/app/xp/_editor/animator/parts'
import { Button } from '@/components/ui/button'
import {
  type AnimationDoc,
  type ClipLibrary,
  CLIP_VERSION,
  currentClip,
  emptyLibrary,
  parseLibrary,
  renameClip,
  withClip,
  type Ease,
  EASES,
  MAX_DURATION,
  MAX_FPS,
  MIN_FPS,
  type Pose,
  clonePose,
  declaredVersion,
  keyAt,
  moveKey,
  putKey,
  removeKey,
  setDuration,
  setEase,
  setFps,
  snapTime,
} from '@/app/xp/_editor/animator/clip'
import { clipsForLevel } from '@/app/xp/_editor/animator/to-level'
import { ClipList } from '@/app/xp/_editor/animator/clip-list'
import { Panel } from '@/app/xp/_editor/animator/panel'
import {
  coalesces,
  fresh,
  type History,
  MAX_UNDO,
  pushed,
  redone,
  undone,
} from '@/app/xp/_editor/animator/history'
import {
  type BoneSpec,
  DEFAULT_RIG,
  GROUP_LABELS,
  RIGS,
  type Rig,
} from '@/app/xp/_editor/animator/rig'
import { presetsFor, type Preset, stamp, stampLength } from '@/app/xp/_editor/animator/presets'
import { describeModel } from '@kxb/xp/catalogue'
import { modelUrl, type SkeletonId } from '@kxb/xp/packs'
import type { XpClip } from '@kxb/xp/clips'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict, type XpEditorDict } from '@/app/i18n/xp-editor'

/**
 * A face for each move.
 *
 * Here rather than in the catalogue because `@/app/xp/_editor/animator/presets` is
 * data and maths and has no business importing a component library. A preset
 * with no icon falls back to the panel's own, so adding one to the catalogue
 * never breaks this.
 */
/**
 * A bone's label, and a preset's, in the reader's language.
 *
 * The tables in `./rig` and `./presets` keep their English. Those files are a
 * *description of a skeleton and of seven canned moves* - the labels are part
 * of what they document, and the animator is their only reader - so the German
 * is looked up beside them rather than moved out of them. A bone this
 * dictionary has never heard of falls back to what the rig calls it, which is
 * the same promise `t()` makes to a level.
 */
/**
 * A square of screen that moves the selected joint.
 *
 * The stage's `Nudge` does all the thinking - this is only a pointer capture
 * that feeds it pixel deltas, the same mechanics as the inspector's `Pad`:
 * capture on down, deltas per move, release ends the gesture. `+y` is
 * screen-up, so the vertical delta flips sign on the way through.
 */
function NudgePad({
  label,
  nudge,
}: {
  label: string
  nudge: React.RefObject<Nudge | null>
}) {
  const last = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      role="slider"
      aria-label={label}
      // The joint has no single number to report - the pad is a 2D nudge - so
      // the slider contract is satisfied with a neutral midpoint.
      aria-valuenow={0}
      aria-valuemin={-1}
      aria-valuemax={1}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        last.current = { x: event.clientX, y: event.clientY }
        nudge.current?.(0, 0, 'start')
      }}
      onPointerMove={(event) => {
        if (!last.current) return
        const dx = event.clientX - last.current.x
        const dy = event.clientY - last.current.y
        last.current = { x: event.clientX, y: event.clientY }
        nudge.current?.(dx, -dy, 'move')
      }}
      onPointerUp={() => {
        if (!last.current) return
        last.current = null
        nudge.current?.(0, 0, 'end')
      }}
      onPointerCancel={() => {
        if (!last.current) return
        last.current = null
        nudge.current?.(0, 0, 'end')
      }}
      className="pointer-events-auto grid size-24 touch-none select-none place-items-center rounded-2xl border border-border bg-background/70 backdrop-blur"
    >
      <span className="pointer-events-none max-w-[5.5rem] truncate font-mono text-[10px] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

/**
 * The knob beside the pad: up is up, down is down.
 *
 * The pad moves the joint in the plane the camera is looking through, which is
 * the right answer for a free drag and the wrong one for the single motion
 * somebody wants most - lifting a foot, dropping a hand. From three-quarters
 * on, "straight up" on that pad is a diagonal you have to find, and finding it
 * costs an orbit or an axis lock and two more gestures.
 *
 * So: one dimension, held to world `+Y` - `NudgeSpace` in ./stage - and drawn
 * as a tall pill rather than a dial. A dial reads as "turn me", and turning is
 * the one thing this does not do.
 *
 * ---------------------------------------------------------------------------
 * Not only on a coarse pointer, unlike the pad
 * ---------------------------------------------------------------------------
 * The pad exists because a fingertip cannot hit an eight-pixel handle; a mouse
 * can, so the pad would be a duplicate of the mouse and stays hidden. This is
 * not that. A mouse can hit the handle and still cannot drag it *up* without
 * first arranging the camera or the lock, so the knob is worth its corner on
 * both. It is the same argument the axis buttons beneath it already won.
 *
 * Arrow keys move it too, which is the accessible reading of `role="slider"`
 * and also the precise one: a press is a fixed step rather than a hand's worth
 * of travel, and Shift makes it four times the step.
 */
function LiftKnob({
  label,
  disabled,
  title,
  nudge,
}: {
  label: string
  /** The axis lock is on some other axis, so a lift would be projected away. */
  disabled?: boolean
  title?: string
  nudge: React.RefObject<Nudge | null>
}) {
  const last = useRef<number | null>(null)
  /** Pixels of travel one arrow press is worth - the same units a drag sends. */
  const step = (shift: boolean) => (shift ? 32 : 8)
  return (
    <div
      role="slider"
      aria-label={label}
      aria-orientation="vertical"
      // One dimension, but no number of its own: the joint's height is a
      // consequence of a whole chain, not a value this control owns. Same
      // neutral midpoint the pad reports, and for the same reason.
      aria-valuenow={0}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      {...(title ? { title } : {})}
      onPointerDown={(event) => {
        if (disabled) return
        event.currentTarget.setPointerCapture(event.pointerId)
        last.current = event.clientY
        nudge.current?.(0, 0, 'start', 'up')
      }}
      onPointerMove={(event) => {
        if (last.current === null) return
        const dy = event.clientY - last.current
        last.current = event.clientY
        // Screen-down is world-down, so the sign flips exactly as it does on
        // the pad.
        nudge.current?.(0, -dy, 'move', 'up')
      }}
      onPointerUp={() => {
        if (last.current === null) return
        last.current = null
        nudge.current?.(0, 0, 'end', 'up')
      }}
      onPointerCancel={() => {
        if (last.current === null) return
        last.current = null
        nudge.current?.(0, 0, 'end', 'up')
      }}
      onKeyDown={(event) => {
        if (disabled) return
        const up = event.key === 'ArrowUp'
        const down = event.key === 'ArrowDown'
        if (!up && !down) return
        event.preventDefault()
        // A whole gesture per press: the pre-bend a grab does, the move, and
        // the release that makes the pose keyable. Anything less and a
        // key-stepped edit is the one kind auto-key never sees.
        nudge.current?.(0, 0, 'start', 'up')
        nudge.current?.(0, (up ? 1 : -1) * step(event.shiftKey), 'move', 'up')
        nudge.current?.(0, 0, 'end', 'up')
      }}
      className={`pointer-events-auto flex h-24 w-10 touch-none flex-col items-center justify-between rounded-2xl border border-border bg-background/70 py-2 backdrop-blur transition ${
        disabled
          ? 'cursor-not-allowed opacity-40'
          : 'cursor-ns-resize hover:border-accent/50 focus-visible:border-accent focus-visible:outline-none'
      }`}
    >
      <ChevronUp className="pointer-events-none size-4 text-muted-foreground" aria-hidden />
      <span className="pointer-events-none font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        y
      </span>
      <ChevronDown className="pointer-events-none size-4 text-muted-foreground" aria-hidden />
    </div>
  )
}

/**
 * The pair, in the corner of the stage.
 *
 * One box so the two are laid out beside each other rather than each guessing
 * where the other ends - the knob showing alone on a mouse is the case that
 * made an `absolute right-28` wrong.
 *
 * They float over the viewport rather than sitting in the panel because the
 * figure has to stay in view while the thumb works: the whole failure they
 * replace is a fingertip covering the thing it is moving.
 */
function PoseControls({
  t,
  spec,
  coarse,
  axis,
  nudge,
}: {
  t: XpEditorDict['animator']
  spec: { name: string; label: string }
  /** A finger, which is when the 2D pad earns its space. The knob does not ask. */
  coarse: boolean
  axis: DragAxis | null
  nudge: React.RefObject<Nudge | null>
}) {
  const bone = boneLabel(t, spec)
  // Held to some other axis, so a lift would be projected away to nothing. The
  // knob says so rather than looking broken.
  const locked = axis !== null && axis !== 'y'
  return (
    <div className="pointer-events-none absolute right-2 bottom-12 flex items-end gap-2">
      <LiftKnob
        label={fill(t.liftKnob, { bone })}
        disabled={locked}
        {...(locked && axis ? { title: fill(t.liftLocked, { axis: axis.toUpperCase() }) } : {})}
        nudge={nudge}
      />
      {coarse ? <NudgePad label={fill(t.movePad, { bone })} nudge={nudge} /> : null}
    </div>
  )
}

/**
 * The grip, as six numbers and a size - the exact fields the format keeps.
 *
 * Offsets in cells, angles in degrees applied yaw-pitch-roll, all defaulting
 * to nothing: a field dialled back to its default leaves the document rather
 * than writing a zero into it, so an untouched grip round-trips as absent -
 * the same manners every optional block here has.
 */
function HoldsGrip({
  weapon,
  t,
  onChange,
}: {
  weapon: NonNullable<PlayerRole['weapon']>
  t: XpEditorDict['animator']
  onChange: (weapon: PlayerRole['weapon']) => void
}) {
  const put = (key: 'x' | 'y' | 'z' | 'pitch' | 'yaw' | 'roll' | 'scale', value: number, blank: number) => {
    const next = { ...weapon }
    if (value === blank) delete next[key]
    else next[key] = value
    onChange(next)
  }
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {(['x', 'y', 'z'] as const).map((key) => (
          <Num
            key={key}
            label={key}
            value={weapon[key] ?? 0}
            min={-2}
            max={2}
            step={0.05}
            onChange={(value) => put(key, value, 0)}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['yaw', 'pitch', 'roll'] as const).map((key) => (
          <Num
            key={key}
            label={key}
            value={weapon[key] ?? 0}
            min={-180}
            max={180}
            step={5}
            onChange={(value) => put(key, value, 0)}
          />
        ))}
      </div>
      <Num
        label={t.holdsScale}
        value={weapon.scale ?? 1}
        min={0.1}
        max={4}
        step={0.1}
        onChange={(value) => put('scale', value, 1)}
      />
    </>
  )
}

function boneLabel(t: XpEditorDict['animator'], bone: { name: string; label: string }): string {
  return t.bones[bone.name] ?? bone.label
}

function presetWords(
  t: XpEditorDict['animator'],
  rig: SkeletonId,
  preset: Preset,
): { label: string; hint: string } {
  return t.presets[rig]?.[preset.id] ?? preset
}

const MOVE_ICONS: Record<string, LucideIcon> = {
  walk: Footprints,
  run: Rabbit,
  armswing: Waves,
  wave: Hand,
  dance: Music4,
  idle: Wind,
  jump: Rocket,
  // The peeps' two extra moves. Shared ids - `walk`, `run`, `idle`, `dance` -
  // are the same idea on a different body and deliberately wear the same face.
  wag: Waves,
  flap: Bird,
}

/**
 * The six ways of looking at a body, as directions out from what the camera
 * orbits.
 *
 * ---------------------------------------------------------------------------
 * Front is +Z, which is a fact about the model rather than a convention
 * ---------------------------------------------------------------------------
 * The dummy stands in its T-pose facing +Z - the same fact every sign in
 * `presets.ts` is measured against - so the camera looking *at* its front is the
 * one sitting on +Z. A peep faces the same way. Getting this backwards is the
 * kind of thing nobody notices until they pose an arm from what they think is
 * the left and find it was the right.
 *
 * Y is up, so `top` is straight overhead and `under` is straight beneath, which
 * is the one view the viewport could not reach at all - see `maxPolarAngle`.
 */
const VIEWS = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0],
  under: [0, -1, 0],
} as const satisfies Record<string, readonly [number, number, number]>

type ViewName = keyof typeof VIEWS

/**
 * The animator.
 *
 * Four things, in the order somebody uses them: a body to animate, a viewport
 * with handles you drag to pose it, a strip of keys underneath, and a save
 * button. That is the whole tool, and the shape is a video editor's on purpose - the
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

/** Where the working file lives between visits. Same bargain as the builder. */
const STORE = 'ovaloffice:animator'

/**
 * One working file per rig, and the dummy keeps the old key.
 *
 * Switching rig cannot mean "throw away what you were animating". A peep clip
 * and a dummy clip share not one bone name, so they cannot be the same document,
 * and one slot would mean the walk you spent an afternoon on is gone the moment
 * you look at what a fox would do. Two slots and the switch is free.
 *
 * The dummy stays on the unsuffixed key deliberately: anybody with a working
 * file in this editor right now has it under that name, and a rename would lose
 * it to make the code tidier.
 */
function storeKey(rig: SkeletonId): string {
  return rig === DEFAULT_RIG ? STORE : `${STORE}:${rig}`
}

const NO_REST: Pose = { root: [0, 0, 0], bones: {} }

export function Animator({
  clips,
  onSaveClips,
  held,
  holds,
}: {
  /**
   * What the level already carries, so the panel can say whether this library
   * is in it.
   *
   * Read-only here. The animator does not *load* from the document, and that is
   * deliberate: a document clip is baked samples, so reading one back would give
   * you a timeline of one key a frame - technically the same animation and
   * completely uneditable. The working file is the editable thing, and it is the
   * one that persists.
   */
  clips?: Readonly<Record<string, XpClip>>
  /** Absent when the animator is open outside a level. */
  onSaveClips?: (clips: Readonly<Record<string, XpClip>>) => void
  /**
   * What the body is holding, resolved for the stage - see `heldFrom`.
   *
   * Separate from `holds` below because they answer different questions:
   * this is *what to draw on the hand*, already resolved to a file and a
   * scale, and it changes the picture. `holds` is *what the document says
   * and how to change it*, and it changes the level.
   */
  held?: Held
  /**
   * The document's held-thing field, editable from here.
   *
   * The same `player.weapon` the Properties panel edits - one field, two
   * doors, because the pose editor is where somebody is when the grip looks
   * wrong. Absent outside a level, like `onSaveClips`.
   */
  holds?: {
    weapon: PlayerRole['weapon']
    names: readonly string[]
    onChange: (weapon: PlayerRole['weapon'] | null) => void
  }
} = {}) {
  const t = xpEditorDict(useLocale()).animator
  const [rig, setRig] = useState<RigHandle | null>(null)
  /**
   * Which skeleton is being animated, and which model of it is on screen.
   *
   * Two pieces of state rather than one, because they are two decisions. The rig
   * decides what a document *is* - its bone names, its presets, its own working
   * file - and switching it starts a different clip. The model only decides what
   * you are looking at while you author: the peeps name their parts identically
   * across all twenty-four, so posing on a fox and playing on an elephant is the
   * same clip either way, and swapping animal mid-session throws nothing away.
   *
   * `null` is the rig's own default, which keeps the dummy - one model, no
   * choice to make - from needing an entry.
   */
  const [rigId, setRigId] = useState<SkeletonId>(DEFAULT_RIG)
  const [model, setModel] = useState<string | null>(null)
  const skeleton: Rig = RIGS[rigId]
  const url = model ? modelUrl(model) : skeleton.url

  const [history, setHistory] = useState<History>(() => fresh(emptyLibrary(NO_REST)))
  const library = history.library
  const doc = currentClip(library)
  const [pose, setPose] = useState<Pose>(NO_REST)
  const [selected, setSelected] = useState<string | null>(null)
  const [pins, setPins] = useState<ReadonlySet<string>>(() => new Set())
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [autoKey, setAutoKey] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
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
   * The pad's line into the stage - see `Nudge` there.
   *
   * A ref because the function only exists once the canvas has a camera, and
   * the pad only exists on a coarse pointer; neither should re-render the
   * other into being.
   */
  const nudge = useRef<Nudge | null>(null)
  const onNudge = useCallback((fn: Nudge | null) => {
    nudge.current = fn
  }, [])
  /**
   * Whether the pointer is a finger, which is when the pad earns its space.
   *
   * `pointer: coarse` rather than sniffing for touch events, for the reason
   * the lounge's touch controls give: hybrid laptops fire touch events at a
   * mouse, and what the pad is *for* is a pointer too blunt to grab an
   * eight-pixel handle.
   */
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)')
    const sync = () => setCoarse(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  /**
   * Which world axis a drag is held to, or null for the free plane.
   *
   * A mode rather than a modifier held down, because posing precisely is a
   * *stretch* of work rather than one gesture: lining a foot up along z is
   * three or four drags, and a key held through all of them is a key nobody
   * holds. Shift already means "along the floor" and is the modifier that
   * belongs to one drag.
   */
  const [axis, setAxis] = useState<DragAxis | null>(null)
  const [clipboard, setClipboard] = useState<{ pose: Pose; ease: Ease } | null>(null)
  const [speed, setSpeed] = useState(1)
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
  /**
   * The orbit control, so a button outside the canvas can aim it.
   *
   * `makeDefault` already publishes it to everything *inside* the canvas - the
   * gizmo cube finds it that way - and the six view buttons are in the overlay,
   * which is ordinary DOM sitting on top. A ref is the join.
   */
  const controls = useRef<React.ComponentRef<typeof OrbitControls> | null>(null)

  /**
   * Look at the body from one of the six sides.
   *
   * The distance is kept, deliberately: this is a change of *angle*, and a
   * button that also reframed would undo the zoom somebody set to look at a
   * hand. So the camera moves onto the axis at the radius it already had.
   *
   * Written straight onto the camera and then `update()`, rather than tweened.
   * The gizmo cube tweens because it is a *thing you point at* and the
   * animation is what tells you the click landed; a labelled button that says
   * "front" is already unambiguous, and a body being animated is a body you
   * want to see from the front *now*.
   */
  const look = useCallback((view: ViewName) => {
    const orbit = controls.current
    if (!orbit) return
    const camera = orbit.object
    const target = orbit.target
    const radius = camera.position.distanceTo(target) || 3
    const [x, y, z] = VIEWS[view]
    camera.position.set(target.x + x * radius, target.y + y * radius, target.z + z * radius)
    /**
     * Nudged off the pole, for `top` and `under` only.
     *
     * A camera exactly above its target has no horizontal direction left to be
     * up, and three's own `Spherical.makeSafe` deals with that by clamping to a
     * hair off the pole - which is fine, except that *which* hair it lands on
     * depends on where the camera came from, so pressing `top` twice from two
     * different angles gives two different pictures. A deliberate hair of Z is
     * the same picture every time.
     */
    if (x === 0 && z === 0) camera.position.z += radius * 0.001
    camera.lookAt(target)
    orbit.update()
  }, [])

  const timeRef = useRef(0)
  /**
   * Set before anything that must not be overwritten by the frame loop.
   *
   * Nothing sets it any more, and it stays because the *stage* is what reads
   * it: the frame loop's "hands off the rig entirely" case is a real state and
   * removing the prop would mean removing that guard from the viewport. It was
   * held by the GLB exporter, whose texture encoding is asynchronous - a frame
   * landing mid-encode would put the posed rig back while the exporter was
   * reading the bind pose out of it. The exporter is gone from this copy; the
   * next asynchronous thing that touches the rig will want this again.
   */
  const frozen = useRef(false)

  const seek = useCallback((next: number) => {
    timeRef.current = next
    setTime(next)
  }, [])

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

  /**
   * A change to the whole collection that undo should be able to take back.
   *
   * The undo stack moved up from the clip to the library when the library
   * arrived, and that is a feature rather than an accident of the refactor:
   * adding a clip, removing one and renaming one are exactly the edits somebody
   * most wants back, and a stack that only held keyframes would have watched a
   * clip be deleted and offered to undo the last drag instead.
   */
  const shape = useCallback((change: (library: ClipLibrary) => ClipLibrary, tag?: string) => {
    const now = performance.now()
    const coalesce = coalesces(lastEdit.current, tag, now)
    lastEdit.current = tag === undefined ? null : { tag, at: now }

    setHistory((current) => pushed(current, change(current.library), coalesce))
  }, [])

  /**
   * A change to the clip on the timeline.
   *
   * Every existing caller writes one of these - `edit((doc) => putKey(...))` -
   * and none of them had to change: the collection is threaded in here, once,
   * rather than at forty call sites that have no business knowing there is one.
   */
  const edit = useCallback(
    (change: (doc: AnimationDoc) => AnimationDoc, tag?: string) => {
      shape((current) => withClip(current, change(currentClip(current))), tag)
    },
    [shape],
  )

  /** A change nobody would ever want to undo one keystroke at a time. */
  const tweak = useCallback((change: (doc: AnimationDoc) => AnimationDoc) => {
    setHistory((current) => ({
      ...current,
      library: withClip(current.library, change(currentClip(current.library))),
    }))
  }, [])

  const undo = useCallback(() => {
    lastEdit.current = null
    setHistory(undone)
  }, [])

  const redo = useCallback(() => {
    lastEdit.current = null
    setHistory(redone)
  }, [])

  /** A different collection altogether. Opening one is not an edit of the last. */
  const replace = useCallback((next: ClipLibrary) => {
    lastEdit.current = null
    setHistory(fresh(next))
  }, [])

  /**
   * The model has loaded: adopt whatever was left here last time.
   *
   * The document cannot exist before this point - every key holds a full pose,
   * and there is nothing to pose until the skeleton is in memory. That is also
   * why the stored file is parsed against `rig.rest`: a bone the file does not
   * mention has to come from somewhere, and the model is the only authority.
   */
  const onReady = useCallback(
    (handle: RigHandle) => {
      setRig(handle)
      setPose(handle.rest)
      // Neither survives a change of body: a selected `upperarml` on a fox is a
      // panel of sliders for a bone that is not there, and a pin remembers a
      // world position that meant something on the last skeleton.
      setSelected(null)
      setPins(new Set())

      let stored: ClipLibrary | null = null
      try {
        const raw = window.localStorage.getItem(storeKey(rigId))
        if (raw) {
          const parsed = parseLibrary(JSON.parse(raw), handle.rest)
          // Belt and braces over the per-rig key: a file that says it is for a
          // different rig is a file whose every bone name will bind to nothing,
          // and opening it would be a blank body and no explanation.
          if (parsed.rig === rigId) stored = parsed
        }
      } catch {
        // A corrupt working file opens as a new one rather than as a blank page
        // with an error on it. There is nothing here worth a dialogue.
      }
      replace(stored ?? emptyLibrary(handle.rest, rigId))
    },
    [replace, rigId],
  )

  // Autosave. An afternoon's animation lost to a refresh is the only
  // unforgivable bug an editor like this can have.
  useEffect(() => {
    if (!rig) return
    try {
      // Keyed by the *document's* rig rather than the panel's, so the frame
      // between a switch and the new model loading cannot write a dummy clip
      // into the peep's slot.
      window.localStorage.setItem(storeKey(library.rig), JSON.stringify(library))
    } catch {
      // Quota, private mode. Not worth interrupting anybody over.
    }
  }, [library, rig])

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
  /**
   * Change which clips there are, or which one is showing.
   *
   * One helper because the rule is one rule: stop, change, and put the playhead
   * back to the start - the playhead is a position in *this* clip, and two
   * clips are rarely the same length. See ./clip-list, which used to say it
   * four times.
   */
  const applyToClips = useCallback(
    (change: (library: ClipLibrary) => ClipLibrary) => {
      setPlaying(false)
      shape(change)
      seek(0)
    },
    [shape, seek],
  )

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

  /**
   * The whole library, baked and written into the level.
   *
   * ---------------------------------------------------------------------------
   * Baked here rather than in the edit layer
   * ---------------------------------------------------------------------------
   * `bake` needs the rig's rest pose - a bone the document never mentions has to
   * come from *somewhere*, and the model is the only authority - and the rest
   * pose lives in this component, off the loaded body. The edit layer has never
   * seen a glTF and should not start.
   *
   * ---------------------------------------------------------------------------
   * Rounded, and that is not cosmetic
   * ---------------------------------------------------------------------------
   * A quaternion out of the solver is seventeen significant figures, and a
   * two-second clip is fifty samples of twenty-three of them. Written out in
   * full that is a document measured in hundreds of kilobytes; at four decimals
   * it is under half of that, and four decimals of a unit quaternion is an angle
   * error of about a hundredth of a degree - which is a tenth of what the
   * editor's own sliders can express.
   */
  const saveToLevel = useCallback(() => {
    if (!rig || !onSaveClips) return

    const { clips: next, saved, skipped } = clipsForLevel(library, rig.rest, clips)
    onSaveClips(next)

    const names =
      skipped.length === 0
        ? ''
        : fill(skipped.length === 1 ? t.notes.skippedOne : t.notes.skippedMany, {
            names: skipped.join(', '),
          })
    setNote(
      saved === 0
        ? skipped.length === 1
          ? t.notes.nothingToSaveOne
          : t.notes.nothingToSaveMany
        : fill(saved === 1 ? t.notes.savedOne : t.notes.savedMany, { n: saved, skipped: names }),
    )
  }, [rig, onSaveClips, library, clips, t])

  /** Which of this library's clips the level already carries, by name. */
  const inLevel = library.clips
    .filter((one) => clips?.[one.name]?.rig === library.rig)
    .map((one) => one.name)

  /**
   * Roughly what saving would add to the document, in bytes.
   *
   * Counted rather than measured, because measuring means baking every clip on
   * every render. Four numbers a bone a sample plus one time, at about six
   * characters each once rounded - close enough for a number whose only job is
   * to stop somebody being surprised.
   */
  const weight = library.clips.reduce((total, one) => {
    const samples = Math.max(1, Math.round(one.duration * one.fps))
    const tracks = Object.keys(one.keys[0]?.pose.bones ?? {}).length
    return total + samples * (tracks * 4 + 1) * 6
  }, 0)

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
      const parsed = parseLibrary(raw, rig.rest)
      replace(parsed)
      seek(0)

      /**
       * The rig follows the file, rather than the file being dropped onto
       * whichever body was on screen.
       *
       * The whole point of a clip declaring its rig. Opening a fox's library
       * while looking at the dummy used to give twenty-one bone names binding to
       * nothing and a figure standing perfectly still with no error anywhere.
       */
      if (parsed.rig !== rigId) {
        setModel(null)
        setRigId(parsed.rig)
      }

      const first = currentClip(parsed)
      const many =
        parsed.clips.length > 1 ? fill(t.notes.ofMany, { n: parsed.clips.length }) : ''

      // Said, not refused. A newer file is very likely still mostly readable -
      // keys and times are the bulk of it - and opening it with a warning beats
      // refusing to open something somebody can see the contents of.
      setNote(
        declared > CLIP_VERSION
          ? fill(t.notes.openedOld, {
              name: first.name,
              many,
              keys: first.keys.length,
              declared,
              known: CLIP_VERSION,
            })
          : fill(t.notes.opened, {
              name: first.name,
              many,
              keys: first.keys.length,
              seconds: first.duration.toFixed(2),
              fps: first.fps,
            }),
      )
    },
    [rig, rigId, seek, replace, t],
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
        fill(t.notes.stamped, {
          preset: presetWords(t, rigId, preset).label.toLowerCase(),
          at: timeRef.current.toFixed(2),
          length: stampLength(preset, speed).toFixed(2),
        }),
      )
    },
    /*
     * `t` because every one of these writes a note in the reader's language.
     * It is one of two module-level objects and changes only when the shell
     * reloads, so naming it costs a re-created callback nobody will observe.
     */
    [rig, rigId, speed, edit, t],
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
        // The axis lock, on the letters it is named after. Pressing the one
        // that is already on lets go, which is what the buttons do too - there
        // is no key for "free" because the key you just pressed is it.
        x: () => setAxis((was) => (was === 'x' ? null : 'x')),
        y: () => setAxis((was) => (was === 'y' ? null : 'y')),
        z: () => setAxis((was) => (was === 'z' ? null : 'z')),
        Escape: () => setAxis(null),
      }

      const action = actions[event.key]
      if (!action) return
      event.preventDefault()
      action()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyNow, dropKey, seek, stepFrame, jumpKey, undo, redo, copyKey, pasteKey])

  const spec = selected ? skeleton.specs[selected] ?? null : null
  /** Which parts the loaded body has, as against the rig's whole table. */
  const present = useMemo(() => (rig ? new Set(rig.bones.keys()) : null), [rig])
  const onKeyframe = keyAt(doc, time) >= 0
  const angles = useMemo(
    () => (rig && selected ? boneEuler(rig, pose, selected) : { x: 0, y: 0, z: 0 }),
    [rig, pose, selected],
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-3">
        <div
          className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-secondary/30"
          style={{ touchAction: 'none' }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            camera={{ position: [1.9, 1.5, 2.4], fov: 40, near: 0.05, far: 100 }}
            onPointerMissed={() => setSelected(null)}
          >
            <OrbitControls
              ref={controls}
              makeDefault
              target={[0, 0.8, 0]}
              enableDamping={false}
              // Off while a handle is held: the same left button drives both,
              // and a drag that also orbited would move the target out from
              // under the hand it was placing.
              enabled={!dragging}
              /**
               * All the way round, where this used to stop just past level.
               *
               * The old limit kept the camera above the floor, which reads as a
               * sensible guard and costs the one view a pose editor actually
               * needs and cannot fake: the soles of the feet, the underside of a
               * hand, whether a knee is bent through the leg. `under` in the
               * view buttons is exactly that, and a limit that silently clamped
               * it would be a button that did half of what it said.
               *
               * It is safe here because the floor is a front-facing plane: from
               * below it is culled entirely, so going under does not put a slab
               * of grey between the camera and the figure - only the grid, which
               * is what you want for judging where a foot is.
               */
              maxPolarAngle={Math.PI}
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
            {/*
              The box in the corner: which way you are looking, and a face to
              click to look at it straight on.

              Outside the `Suspense` deliberately. It has nothing to load, and a
              gizmo that vanished while a body was being fetched would be a
              control that flickers on every change of model - which is exactly
              when somebody is most likely to want to re-orient.
            */}
            <GizmoHelper alignment="top-right" margin={[64, 64]}>
              <GizmoViewcube
                // The panel's own greys rather than drei's white, which sits on
                // this viewport like a sticker.
                color="#1e293b"
                hoverColor="#a78bfa"
                textColor="#e2e8f0"
                strokeColor="#475569"
                opacity={0.9}
                // Its own axis order - right, left, top, bottom, front, back -
                // and `front` has to be the +Z face for the reason `VIEWS` gives.
                faces={['Right', 'Left', 'Top', 'Under', 'Front', 'Back']}
              />
            </GizmoHelper>

            <Suspense fallback={null}>
              <AnimatorStage
                skeleton={skeleton}
                url={url}
                grabbable={!looking}
                axis={axis}
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
                onNudge={onNudge}
                {...(held ? { held } : {})}
              />
            </Suspense>
          </Canvas>

          {/*
            The six sides, as words.

            Beside the cube rather than instead of it, and they are not the same
            control: the cube says *where you are* and is aimed by pointing at a
            picture of a box, which is quick and imprecise. These say where you
            want to be and land there exactly, which is what you need when you
            are checking whether an arm is straight.

            Top-left because the bottom of this viewport is already a line of
            help text and two toggles, and the top-right is the cube.
          */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-start p-2">
            <div className="pointer-events-auto flex flex-wrap gap-1 rounded-lg bg-background/70 p-1 backdrop-blur">
              {(Object.keys(VIEWS) as ViewName[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => look(view)}
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition hover:bg-accent/15 hover:text-foreground"
                >
                  {view}
                </button>
              ))}
            </div>
          </div>

          {/*
            The pad: the handle's gesture at thumb size.

            Only on a coarse pointer, only while a joint is selected, and gone
            while the Look button has the finger - the three states in which a
            second way to drag would either duplicate the mouse, aim at
            nothing, or fight the camera. It floats over the viewport rather
            than sitting in the panel because the figure has to stay in view
            while the thumb works: the whole failure it replaces is a fingertip
            covering the thing it is moving.
          */}
          {spec && !looking ? (
            <PoseControls t={t} spec={spec} coarse={coarse} axis={axis} nudge={nudge} />
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
            <p className="rounded-lg bg-background/70 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
              {t.stageHint}
            </p>
            <div className="flex shrink-0 gap-1.5">
              {/*
                The lock, beside the two toggles rather than in a panel: it is a
                thing you change *while dragging something*, and a trip across
                the window to a sidebar is the whole cost of the feature.

                Three buttons and no fourth for "free": the lit one is the mode,
                and pressing it again lets go. A fourth button would be a fourth
                thing to aim at for the state you are already in most of the
                time.
              */}
              <div
                className="pointer-events-auto flex overflow-hidden rounded-md border border-border"
                role="group"
                aria-label={t.lockTitle}
              >
                {(['x', 'y', 'z'] as const).map((one) => (
                  <button
                    key={one}
                    type="button"
                    onClick={() => setAxis((was: DragAxis | null) => (was === one ? null : one))}
                    aria-pressed={axis === one}
                    title={
                      axis === one
                        ? t.lockTitle
                        : fill(t.lockAxisTitle, { axis: one.toUpperCase() })
                    }
                    className={`px-2 py-1 font-mono text-[11px] uppercase transition ${
                      axis === one
                        ? 'bg-accent/30 text-foreground'
                        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {one}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant={looking ? 'default' : 'secondary'}
                className="pointer-events-auto"
                onClick={() => setLooking((on) => !on)}
                aria-pressed={looking}
                title={t.oneFingerToCamera}
              >
                <Orbit className="size-3.5" aria-hidden /> {t.look}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showGrid ? 'secondary' : 'ghost'}
                className="pointer-events-auto"
                onClick={() => setShowGrid((on) => !on)}
                aria-pressed={showGrid}
              >
                <Grid3x3 className="size-3.5" aria-hidden /> {t.floor}
              </Button>
            </div>
          </div>
        </div>

        <Transport
          doc={doc}
          time={time}
          playing={playing}
          autoKey={autoKey}
          onKeyframe={onKeyframe}
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
      </div>

      <aside className="flex flex-col gap-3">
        {/*
          First, above the clip, because it decides what the clip *is*.

          A rig switch further down would read as a view setting - "show me a
          fox" - and it is not one: the two rigs share no bone names, so the
          document under it is a different document with its own working file.
          Putting it first is the panel saying so before anybody keys anything.
        */}
        <Panel
          title={t.body}
          icon={PersonStanding}
          hint={t.bodyHint}
        >
          <div className="flex gap-1.5">
            {Object.values(RIGS).map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={option.id === rigId ? 'default' : 'secondary'}
                className="flex-1"
                onClick={() => {
                  if (option.id === rigId) return
                  setPlaying(false)
                  // The model choice is the *rig's*, so it cannot survive a
                  // switch: `peepz/fox` means nothing to the dummy.
                  setModel(null)
                  setRigId(option.id)
                }}
              >
                {option.id === 'peepz' ? (
                  <Rabbit className="size-3.5" aria-hidden />
                ) : (
                  <PersonStanding className="size-3.5" aria-hidden />
                )}
                {t.rigs[option.id]}
              </Button>
            ))}
          </div>

          {/*
            Which animal, for the rig that has more than one of them.

            Not a second rig switch and drawn to look unlike one: the parts are
            named identically across the pack, so this changes what you are
            looking at and nothing about the clip you are writing. A fox's walk
            plays on a cow.
          */}
          {skeleton.models.length > 1 && (
            <Pick
              label={t.model}
              value={model ?? skeleton.models[0]}
              options={skeleton.models}
              format={describeModel}
              onChange={setModel}
            />
          )}
        </Panel>

        {/*
          The collection, above the clip it is showing.

          Nobody animates a walk; they animate a *character* - a walk, an idle, a
          wave, a death, authored in one sitting against one rig and only useful
          together. One file each meant four working files and an editor that
          could hold one of them at a time.
        */}
        <ClipList library={library} t={t} rest={rig?.rest} apply={applyToClips} />

        <Panel title={t.clip} icon={Diamond}>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t.name}
            <input
              value={doc.name}
              /**
               * Through `renameClip`, so two clips cannot end up with one name.
               *
               * They are played by name and written into a document keyed by
               * name, so two called `walk` is two things one lookup cannot tell
               * apart. Numbered rather than refused - the moment somebody wants
               * a second walk they want it now.
               */
              onChange={(event) => tweak(() => currentClip(renameClip(library, event.target.value)))}
              className="w-full rounded-lg border border-border bg-secondary/40 px-2 py-1 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Num
              label={t.fps}
              value={doc.fps}
              min={MIN_FPS}
              max={MAX_FPS}
              step={1}
              onChange={(value) => edit((current) => setFps(current, value), 'fps')}
            />
            <Num
              label={t.lengthSeconds}
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
          {/*
            Always here, and off when the playhead is not on a key.

            It used to be removed instead, which is tidier and wrong: every
            control below it moved up, and during playback the playhead crosses
            keys constantly - so the panel jumped on and off several times a
            second. Reported exactly that way. A field that cannot apply right
            now is still a field this panel *has*, and saying so costs one row
            of grey.
          */}
          <Pick
            label={t.easeOut}
            value={onKeyframe ? doc.keys[keyAt(doc, time)].ease : (doc.keys[0]?.ease ?? 'smooth')}
            options={EASES}
            disabled={!onKeyframe}
            onChange={(value) => edit((current) => setEase(current, time, value as Ease))}
          />
        </Panel>

        <Panel
          icon={spec ? Bone : PersonStanding}
          title={spec ? boneLabel(t, spec) : t.bones_}
          hint={
            spec
              ? t.dragItsDot
              : t.pickADot
          }
        >
          {spec && rig && (
            <>
              <div className="flex flex-col gap-0.5">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <Slide
                    key={axis}
                    label={axis === 'x' ? 'Pitch' : axis === 'y' ? 'Turn' : 'Roll'}
                    value={angles[axis]}
                    min={-180}
                    max={180}
                    step={1}
                    unit="°"
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
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={resetBone}>
                  <RotateCcw className="size-3.5" aria-hidden />{' '}
                  {fill(t.straighten, { bone: boneLabel(t, spec) })}
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
            skeleton={skeleton}
            present={present}
            selected={selected}
            pins={pins}
            onSelect={setSelected}
            onPin={togglePin}
          />
        </Panel>

        {/*
          The document's held thing, editable where its grip is on screen.

          The same `player.weapon` the Properties panel edits - one field, two
          doors. This one exists because dialling in a grip is a *looking*
          job: the numbers only mean anything with the hand and the thing in
          it in view, and the Properties panel is a tab away from both. The
          preview on the stage updates as each number commits.
        */}
        {holds ? (
          <Panel icon={Hand} title={t.holdsTitle} hint={t.holdsHint}>
            <Pick
              label={t.holdsWhat}
              value={holds.weapon?.blueprint ?? ''}
              options={['', ...holds.names]}
              format={(option) => (option === '' ? t.holdsNothing : option)}
              onChange={(name) =>
                holds.onChange(
                  name
                    ? name === holds.weapon?.blueprint
                      ? holds.weapon
                      : { blueprint: name }
                    : null,
                )
              }
            />
            {holds.weapon ? (
              <HoldsGrip weapon={holds.weapon} t={t} onChange={holds.onChange} />
            ) : null}
          </Panel>
        ) : null}

        <Panel
          title={t.moves}
          icon={Sparkles}
          hint={t.movesHint}
        >
          <div className="grid grid-cols-2 gap-1.5">
            {presetsFor(rigId).map((preset) => {
              const Icon = MOVE_ICONS[preset.id] ?? Sparkles
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!rig}
                  onClick={() => stampPreset(preset)}
                  title={presetWords(t, rigId, preset).hint}
                  className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:border-accent hover:text-foreground disabled:opacity-40"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {presetWords(t, rigId, preset).label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px]">
                    {stampLength(preset, speed).toFixed(1)}s
                  </span>
                </button>
              )
            })}
          </div>
          <Slide
            label={t.speed}
            value={speed}
            min={0.25}
            max={3}
            step={0.05}
            unit="×"
            onChange={setSpeed}
          />
          <p className="text-[10px] text-muted-foreground">
            {t.movesBlurb}
          </p>
        </Panel>

        <Panel title={t.pose} icon={Copy}>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={copyKey}>
              <Clipboard className="size-3.5" aria-hidden /> {t.copyKey}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!clipboard || !rig}
              onClick={pasteKey}
            >
              <ClipboardCheck className="size-3.5" aria-hidden /> {t.pasteKey}
            </Button>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={resetAll}>
            <RotateCcw className="size-3.5" aria-hidden /> {t.backToRest}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            {clipboard
              ? `Holding a ${clipboard.ease} key. Paste writes it wherever the playhead is.`
              : t.poseBlurb}
          </p>
        </Panel>

        {/*
          One file, and it is the editable one.

          The GLB export is gone from this copy of the animator. It made sense
          while an animation's destination was `public/xo` - a model with a clip
          baked in, ready for `useGLTF`, which is what every other body in the
          repo already is. It is the wrong shape for an XP: a clip here belongs
          to a *document*, played by name off a rig the level already loads, and
          a second binary of the fox with one walk welded into it is a thing
          nobody in this editor has anywhere to put.

          Two rigs is what settled it. A peep's own file carries its eight clips;
          shipping a twenty-fifth animal that is a fox with a ninth would mean
          the level fetching two foxes to play one walk.

          The backoffice's animator keeps its GLB button - see the copy note at
          the top of this file - because that tool really does ship models.
        */}
        <Panel title={t.save} icon={Download}>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" onClick={() => saveDoc(library)}>
              <Save className="size-3.5" aria-hidden /> {t.saveWork}
            </Button>
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
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t.fileBlurbLead} <code>.animation.json</code>
            {t.fileBlurbTail}
          </p>

          <Paste onApply={(text) => applyText(text, 'paste')} disabled={!rig} />
        </Panel>

        {/*
          Into the level, which is the thing this panel could not do.

          Reported as "you can't save the clip to your document", and the panel
          used to say so itself - on the grounds that a document cannot carry its
          own files. True of a `.glb`, which is bytes; a clip is *numbers*, and a
          document has carried numbers since it existed. There was nothing to
          wait for.
        */}
        {onSaveClips ? (
          <Panel
            title={t.level}
            icon={Clapperboard}
            hint={t.levelHint}
          >
            <Button type="button" disabled={!rig} onClick={saveToLevel}>
              <Save className="size-4" aria-hidden />{' '}
              {fill(t.saveNToLevel, { n: library.clips.length })}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              {inLevel.length === 0
                ? t.nothingInLevel
                : `In the level: ${inLevel.join(', ')}.`}
            </p>
            {/*
              What it costs, said before it is paid rather than discovered.

              A clip is baked to one sample a frame, so a long one at a high
              frame rate is a real number of kilobytes in a document that is
              loaded before it is looked at. Nobody can guess that from a button.
            */}
            <p className="text-[10px] text-muted-foreground">
              {fill(t.savedAsSamples, {
                kb: Math.max(1, Math.round(weight / 1024)),
                n: library.clips.length,
              })}
            </p>
          </Panel>
        ) : null}

        <Panel title={t.shortcuts} icon={Keyboard}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {[
              ['Space', t.playOrPause],
              ['K', t.keyThePose],
              ['Delete', t.removeTheKey],
              ['← →', t.oneFrame],
              ['↑ ↓', t.nextOrPrevious],
              ['Home', t.backToStart],
              ['C / V', t.copyAndPaste],
              ['⌘Z / ⇧⌘Z', fill(t.undoRedoDepth, { n: MAX_UNDO })],
              ['Shift-drag', t.moveAlongFloor],
              ['X / Y / Z', t.lockHint],
            ].map(([key, what]) => (
              <div key={key} className="contents">
                <dt className="font-mono text-foreground">{key}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </aside>
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
  const t = xpEditorDict(useLocale()).animator
  const [text, setText] = useState('')

  return (
    <details className="rounded-lg border border-border bg-secondary/30 px-2 py-1.5">
      <summary className="cursor-pointer list-none text-[11px] text-muted-foreground">
        {t.pasteInstead}
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
}: {
  doc: AnimationDoc
  time: number
  playing: boolean
  autoKey: boolean
  onKeyframe: boolean
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
}) {
  const t = xpEditorDict(useLocale()).animator
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title={`${t.undo} (⌘Z)`}
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
        title={`${t.redo} (⇧⌘Z)`}
      >
        <Redo2 className="size-4" aria-hidden />
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      <Button type="button" size="sm" variant="ghost" onClick={onHome} aria-label={t.backToStart}>
        <SkipBack className="size-4" aria-hidden />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onJump(-1)} aria-label={t.previousKey}>
        <ChevronsLeft className="size-4" aria-hidden />
      </Button>
      <Button type="button" size="sm" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onJump(1)} aria-label={t.nextKey}>
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

      <Button type="button" size="sm" variant={autoKey ? 'default' : 'ghost'} onClick={onAutoKey}>
        Auto-key {autoKey ? 'on' : 'off'}
      </Button>
      <Button type="button" size="sm" variant={doc.loop ? 'default' : 'ghost'} onClick={onLoop} aria-label="Loop">
        <Repeat className="size-3.5" aria-hidden />
      </Button>

      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
        {time.toFixed(2)}s
      </span>
    </div>
  )
}

/** Every handle, by name, for when a dot is behind something. */
function BoneList({
  skeleton,
  present,
  selected,
  pins,
  onSelect,
  onPin,
}: {
  skeleton: Rig
  /**
   * The parts the loaded model actually has, or null while nothing is loaded.
   *
   * The peep table is the union of twenty-four animals - see the note on
   * `PEEPZ_BONES` - so listing it unfiltered offers a fish two front legs and a
   * tail it does not have. The viewport already filters its handles the same
   * way; a list that disagreed with the dots on screen would be worse than
   * either alone.
   */
  present: ReadonlySet<string> | null
  selected: string | null
  pins: ReadonlySet<string>
  onSelect: (bone: string) => void
  onPin: (bone: string) => void
}) {
  const t = xpEditorDict(useLocale()).animator
  const groups = useMemo(() => {
    const out = new Map<BoneSpec['group'], BoneSpec[]>()
    for (const bone of skeleton.bones) {
      if (present && !present.has(bone.name)) continue
      const list = out.get(bone.group) ?? []
      list.push(bone)
      out.set(bone.group, list)
    }
    // The rig's own order, not insertion order, so a peep reads body-legs-
    // wings-tail whichever parts it happens to have.
    return skeleton.groups.flatMap((group) => {
      const bones = out.get(group)
      return bones ? [[group, bones] as const] : []
    })
  }, [skeleton, present])

  return (
    <div className="flex flex-col gap-2">
      {groups.map(([group, bones]) => (
        <div key={group}>
          <p className="mb-1 font-mono text-[10px] text-muted-foreground uppercase">
            {GROUP_LABELS[group]}
          </p>
          <div className="flex flex-wrap gap-1">
            {bones.map((bone) => (
              <span key={bone.name} className="inline-flex">
                <button
                  type="button"
                  onClick={() => onSelect(bone.name)}
                  className={`rounded-l-md border px-2 py-0.5 text-[11px] transition ${
                    selected === bone.name
                      ? 'border-accent bg-accent/20 text-foreground'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                  } ${bone.pinnable ? '' : 'rounded-r-md'}`}
                >
                  {boneLabel(t, bone)}
                </button>
                {bone.pinnable && (
                  <button
                    type="button"
                    onClick={() => onPin(bone.name)}
                    aria-label={fill(pins.has(bone.name) ? t.unpin : t.pin, {
                      bone: boneLabel(t, bone),
                    })}
                    className={`rounded-r-md border border-l-0 px-1 py-0.5 transition ${
                      pins.has(bone.name)
                        ? 'border-accent bg-accent/30 text-foreground'
                        : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Pin className="size-3" aria-hidden />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
