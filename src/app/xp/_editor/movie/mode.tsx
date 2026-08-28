'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Camera as CameraIcon, Download, Film, Users } from 'lucide-react'
import {
  ANIMATABLE,
  BACKDROP_KINDS,
  CAMERA_NAME,
  DEFAULT_LINE_SECONDS,
  keyedProperties,
  liveCamera,
  framingAt,
  posedAt,
  propertyOfProp,
  propOfProperty,
  type BackdropKind,
  type XpAction,
  type XpTimeline,
  type Ease,
} from '@kxb/xp/movie'
import { MAIN_SCENE, type EntitySpec, type XpDocument } from '@kxb/xp'
import { CATALOGUE } from '@kxb/xp/catalogue'
import { PACK_ORDER, PACKS, skeletonOf, thumbnailUrl, type SkeletonId } from '@kxb/xp/packs'
import { CLIPS } from '@/app/xp/_runtime/clips.generated'
import { placeIn, snap, type PlaceTarget } from '@kxb/xp/edit'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { Hint } from '@/app/xp/_editor/chrome'
import { Add, Name, Pick, Remove, Row, Section, Slide } from '@/app/xp/_editor/movie/parts'
import { BoneTransformer, Transformer, type Tool } from '@/app/xp/_editor/movie/transform'
import { Does, nextBeat } from '@/app/xp/_editor/movie/actions'
import { useNarrow } from '@/app/xp/_editor/shell/mobile'
import { movieClock } from '@/app/xp/_editor/movie/clock'
import { Framed, frameOf, FRAMES, type FrameId } from '@/app/xp/_editor/movie/parts'
import { Pose, poseStart } from '@/app/xp/_editor/movie/pose'
import { PackPane } from '@/app/xp/_editor/movie/packs'
import { MODEL_MIME } from '@/app/xp/_editor/movie/carry'
import type { XpClip } from '@kxb/xp/clips'
import { LIVE, MovieStage } from '@/app/xp/_editor/movie/stage'
import { nearestFraming, type GizmoTarget } from '@/app/xp/_editor/movie/gizmo'
import { Timeline } from '@/app/xp/_editor/movie/timeline'
import {
  canRecord,
  capturePng,
  dropped,
  FFMPEG_HINT,
  record,
  save,
  type CaptureParts,
} from '@/app/xp/_editor/movie/export'

/**
 * The movie editor, over the whole screen.
 *
 * ---------------------------------------------------------------------------
 * Why it takes the screen rather than being a panel
 * ---------------------------------------------------------------------------
 * The dock is built for editing *a place*: eight tool windows about what is in
 * the level and where. A shot is a different question - when, from where, and
 * for how long - and every one of its controls is about a time axis that the
 * dock has nowhere to put. Squeezing a timeline into the bottom of a docked
 * layout was the obvious first idea and it makes both worse: the panels lose a
 * third of their height permanently, for a strip that is meaningless in every
 * level that is not a movie.
 *
 * So it is the same shape Try is: a full-screen mode over the same draft, with
 * Escape to leave, and no icon on the rail. The rail's rule is that closing
 * something is undoable by clicking the same icon, and this is not a toggle.
 *
 * ---------------------------------------------------------------------------
 * On a phone the panels become one drawer
 * ---------------------------------------------------------------------------
 * The same argument the editor's own narrow shell makes: at 375 pixels a side
 * column is one you can see is there and cannot read. The picture and the
 * timeline stay - those are the two things a movie *is* - and everything else
 * becomes a strip of names with one open at a time.
 */

/**
 * The player's own rig, and what "+ actor" adds when nobody has chosen.
 *
 * Named rather than looked up, because it is a *decision* - the dummy is the
 * body the player wears, so a shot built around it is a shot of the game rather
 * than a shot of a cast the game does not have.
 */
const AVATAR = 'dummy/Dummy'

/** The other rig, as a grid. See `CastPicker`. */
const PEEPZ = CATALOGUE.filter((one) => skeletonOf(one.id) === 'peepz')

/**
 * The packs worth dressing a stage out of: everything that is not a skeleton.
 *
 * Derived rather than listed, so a pack added to the catalogue appears here
 * without anybody remembering to come back - the failure a hand-written list
 * has, once, quietly.
 */
const PROP_PACKS = PACK_ORDER.filter((id) => !PACKS[id]?.skeleton)

/**
 * How many props the grid shows before it says there are more.
 *
 * Sixty is about six rows in a 320px column, which is as far as anybody scrolls
 * before they reach for the search box - and the note under it is what stops a
 * cut-off grid reading as the whole pack.
 */
const PROPS_SHOWN = 60

export interface MovieModeProps {
  document: XpDocument
  /** Which place is being shot. `undefined` is the root. */
  where: PlaceTarget
  onClose: () => void
  /**
   * Leave, and open the animator on this rig.
   *
   * A single callback rather than "close" plus "open a window", because the two
   * are one act: a mode that closed and left the author looking at the level
   * wondering where the animator went is worse than not offering the button.
   */
  onAnimate: (rig: SkeletonId) => void
  /** Every writer the panels need, bound to this place by the editor. */
  edits: MovieEdits
}

export interface MovieEdits {
  onSetMovie: (patch: { duration?: number; fps?: number; backdrop?: XpTimeline['backdrop'] }) => void
  onKey: (entity: string, property: string, value: number, at: number) => void
  onDropKey: (entity: string, property: string, index: number) => void
  onClearKeys: (entity: string) => void
  /** How a key leaves for the next. See `setKeyEase`. */
  onKeyEase: (entity: string, property: string, index: number, ease: Ease) => void
  /**
   * Several keys on one body, in one edit.
   *
   * A pad reports two axes from a single push and two `onKey` calls would keep
   * only the last - see `putEntityKeys`.
   */
  onKeys: (entity: string, values: Readonly<Record<string, number>>, at: number) => void
  onAddCamera: (framing: { position: [number, number, number]; target: [number, number, number]; fov: number }) => void
  onRemoveCamera: (name: string) => void
  /** Take one framing off a camera. Refused when it is the only one. */
  onDropFraming: (camera: string, index: number) => void
  onRenameCamera: (from: string, to: string) => void
  onFraming: (camera: string, framing: { t: number; position: [number, number, number]; target: [number, number, number]; fov: number }) => void
  onCameraEase: (camera: string, ease: boolean) => void
  onCut: (at: number, camera: string) => void
  onDropCut: (index: number) => void
  onCue: (entity: string, clip: string, loop: boolean, at: number) => void
  onSay: (entity: string, text: string, seconds: number, at: number) => void
  /** Any action, whole. What the action row's own controls call. */
  onAction: (action: XpAction) => void
  onDropAction: (index: number) => void
  /** An action moved or resized on the strip. */
  /**
   * Any part of an action, not only its two ends.
   *
   * It used to be `{ t, duration }` because the strip was the only thing that
   * edited one - `setAction` has always taken a whole `Partial<XpAction>`. The
   * payload editor needs the rest; the kind stays unpatchable, which the
   * writer refuses on its own.
   */
  onSetAction: (index: number, patch: Partial<XpAction>) => void
  /** An action, as the keys it was producing - and the keys back into a move. */
  onBake: (index: number) => void
  onLift: (entity: string) => void
  /** The clips this level carries. A pose is one of them - see `./pose`. */
  onClips: (clips: Readonly<Record<string, XpClip>>) => void
  /**
   * A pose saved *and* put on the body, in one edit.
   *
   * Separate from `onClips` because it has to be one commit: two writes from
   * one handler both start from this render's state, so the second discards the
   * first - which lost the pose entirely and said nothing.
   */
  onPose: (
    entity: string,
    clips: Readonly<Record<string, XpClip>>,
    clip: string,
    at: number,
  ) => void
  /** Somebody new, in front of the camera. */
  onAddActor: (model: string, at: { x: number; y: number; z: number }) => void
  /**
   * One more of her, a cell aside, with her children and her keys.
   *
   * By name like every other actor writer here - see `onSetActor` in ../editor
   * for why the panel never holds an index.
   */
  onDuplicateActor: (entity: string) => void
  /** Take her off the stage entirely, with anything hanging off her. */
  onRemoveActor: (entity: string) => void
  /**
   * The body itself, rather than a key on it.
   *
   * What a slider writes with auto-key **off**: the pose a shot begins from.
   * Separate from `onKey` because they are different edits to different parts of
   * the file, and a single call that guessed between them would be the thing the
   * switch exists to avoid.
   */
  onSetActor: (entity: string, patch: Partial<EntitySpec>) => void
  /** A handle to hang things off. See `addNode`. */
  onAddEmpty: (at: { x: number; y: number; z: number }) => void
  /** Group this body under another, or set it free. */
  onParent: (entity: string, parent: string | null) => void
  /** A handle dragged, which in a shot means keying where it was dragged to. */
  onMoveActor: (entity: string, at: number, to: { x: number; y: number; z: number }) => void
  /** Several bodies, by the same shift, in one edit. See `moveActorsAt`. */
  onMoveActors: (
    entities: readonly string[],
    at: number,
    by: { x: number; y: number; z: number },
  ) => void
  onMoveFraming: (
    camera: string,
    index: number,
    what: 'position' | 'target',
    to: { x: number; y: number; z: number },
  ) => void
}

export function MovieMode({ document: xp, where, onClose, onAnimate, edits }: MovieModeProps) {
  const t = xpEditorDict(useLocale()).movie
  const narrow = useNarrow()

  const place = placeIn(xp, where)
  const timeline = place?.timeline

  /**
   * The playhead, in two forms, and both are load-bearing.
   *
   * `clock` is a ref the frame loop reads and writes; nothing re-renders when
   * it moves. `at` is what the panels draw, and the stage pushes it over
   * whenever the hundredth of a second changes. Two values for one number looks
   * redundant and is the entire reason the picture plays at all - see the note
   * on `MovieStage`.
   */
  const clock = useMemo(() => movieClock(), [])
  const [at, setAt] = useState(0)
  const [running, setRunning] = useState(false)

  /** What the picture is on: free look, the cut, or one camera by name. */
  const [through, setThrough] = useState<string | null>(null)
  /**
   * Who is selected. A list, because moving a set together is the point.
   *
   * The *last* one is what the panel opens - a cast list where selecting a
   * second body closed the first one's controls would make grouping cost you
   * the row you were working in.
   */
  const [selected, setSelected] = useState<readonly string[]>([])

  /**
   * Add to the selection, or replace it.
   *
   * Shift is the modifier every editor uses for this and it costs nothing to
   * match. Clicking somebody already in a multi-selection with shift removes
   * them, which is the other half people expect and the only way to correct a
   * mis-click without starting again.
   */
  const choose = (name: string, add: boolean) => {
    /*
      Picking a body drops the bone.

      Otherwise the corner keeps showing a knee after you have clicked a crate,
      and the two halves of "what is selected" disagree. Clicking the body is
      also how you get *out* of posing and back to moving the whole thing,
      which needs no explaining once it works.
    */
    setBone(null)
    setPreview(null)
    setSelected((was) => {
      if (!add) return [name]
      return was.includes(name) ? was.filter((one) => one !== name) : [...was, name]
    })
    setHandles(
      add && selected.length > 0 && !selected.includes(name)
        ? { kind: 'actors', names: [...selected, name] }
        : { kind: 'actor', name },
    )
  }
  /**
   * What has handles on it: the selected actor, or a camera's own point.
   *
   * Held here rather than derived from `selected`, because a camera is not a
   * member of the cast and "aim this camera" is a mode somebody is in rather
   * than a selection they have made. Selecting an actor takes the handles back,
   * which is the behaviour that needs no explaining.
   */
  const [handles, setHandles] = useState<GizmoTarget | null>(null)
  /**
   * The shape this is delivered in.
   *
   * Held here rather than in the document, and that is a real choice: a movie
   * has one *set* and may be cut for three places - the same film goes out wide
   * and tall. Putting it in the file would make one of those the truth and the
   * others a re-export nobody remembers to redo.
   */
  const [frame, setFrame] = useState<FrameId>('landscape')
  /**
   * Whether the pack pane is up.
   *
   * A view beside the stage rather than a sidebar section, because browsing
   * 3,892 models is not something a 320px column can do - see `./packs`. It
   * stays up until you close it: dressing a stage is many models, not one.
   */
  const [browsing, setBrowsing] = useState(false)
  /** Whether a model from the picker is being held over the stage. */
  const [over, setOver] = useState(false)
  /**
   * Which bone of the selected body is being turned.
   *
   * Up here because it has two doors - the panel's select and a click on a
   * joint in the viewport - and one of them is in the stage while the other is
   * in the sidebar. Held by name rather than by index, since the rigs do not
   * agree on an order and a peep has bones a dummy does not.
   */
  const [bone, setBone] = useState<string | null>(null)
  /** See the note on `autoKey` in `Panels`: the corner writes through it too. */
  const [autoKey, setAutoKey] = useState(true)
  /**
   * Which pad mode both copies of the transform controls are in, and what is
   * pinned. One state, because they are one control - see `Transformer`.
   */
  const [tool, setTool] = useState<Tool>('move')
  const [locked, setLocked] = useState<ReadonlySet<'x' | 'y' | 'z'>>(new Set())
  /**
   * A clip being looked at rather than placed. See `preview` on `MovieStage`.
   *
   * Dropped when the film takes over - pressing play, or picking somebody else
   * - because both of those are the moment you stopped asking the question.
   */
  const [preview, setPreview] = useState<{ entity: string; clip: string } | null>(null)
  /** A stretch to cycle rather than running to the end. See `MovieClock`. */
  const [loop, setLoop] = useState<{ from: number; to: number } | null>(null)
  /** Filled by the stage with a way to read a body's pose as drawn. */
  const poses = useRef<((entity: string) => Record<string, number[]> | null) | null>(null)
  /** Whether the phone's control drawer is open. See the note where it is drawn. */
  const [sheet, setSheet] = useState(false)
  /**
   * Whether picking adds to the selection instead of replacing it.
   *
   * A latch rather than a modifier, because a finger cannot hold shift - and
   * grouping things is exactly what somebody does on a phone with the stage
   * finally big enough to see. It stays down until pressed again: choosing
   * four bodies is four taps, not four taps and four reaches for a key.
   */
  const [adding, setAdding] = useState(false)

  const parts = useRef<CaptureParts | null>(null)
  const onReady = (ready: CaptureParts) => {
    parts.current = ready
  }

  /**
   * Escape leaves, and it is the only key bound here.
   *
   * Deliberately not `space` for play/pause: this screen has text fields in it -
   * a camera's name, a clip - and a global space bar is how somebody types a
   * space into a name and watches the film start instead.
   */
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  /**
   * The transport, as plain functions.
   *
   * Not wrapped in `useCallback`: the React Compiler is on in this repo and it
   * refuses to optimise a component whose manual memoization it cannot
   * reproduce, which is what these were - every one of them touches a ref, and
   * the inferred dependencies never matched the written ones. Leaving them
   * plain lets the compiler memoize the whole component, which is both faster
   * and the thing the codebase has already decided to trust.
   */
  const scrub = (seconds: number) => {
    clock.seek(seconds)
    setRunning(false)
    setAt(seconds)
  }

  const play = () => {
    if (!timeline) return
    setPreview(null)
    // Playing from the end starts again, rather than doing nothing - which is
    // what the button appears to do otherwise, once, to everybody.
    if (clock.at() >= timeline.duration - 0.001) clock.seek(0)
    clock.play()
    setRunning(true)
  }

  const pause = () => {
    clock.pause()
    setRunning(false)
  }

  const onEnded = () => setRunning(false)

  if (!place || !timeline) return null

  const named = place.entities.filter(
    (one): one is EntitySpec & { name: string } => !!one.name,
  )

  const panels = (
    <Panels
      document={xp}
      timeline={timeline}
      entities={named}
      at={at}
      selected={selected}
      onSelect={choose}
      through={through}
      handles={handles}
      onHandles={setHandles}
      bone={bone}
      onBone={setBone}
      autoKey={autoKey}
      onAutoKey={setAutoKey}
      tool={tool}
      onTool={setTool}
      locked={locked}
      onLocked={setLocked}
      onPreview={setPreview}
      onSeek={scrub}
      poseNow={(entity) => poses.current?.(entity) ?? null}
      parts={parts}
      running={running}
      onPlay={play}
      onPause={pause}
      edits={edits}
      onAnimate={onAnimate}
      frame={frame}
      onBrowse={() => setBrowsing(true)}
    />
  )

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-neutral-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-300">
          {t.editingAShot}
        </span>
        <span className="truncate font-mono text-[10px] text-neutral-500">
          {where ?? MAIN_SCENE}
        </span>

        <Chip on={adding} onClick={() => setAdding(!adding)} title={t.addToPickTitle}>
          {t.addToPick}
        </Chip>
        <Transport
          running={running}
          onPlay={play}
          onPause={pause}
          onStart={() => scrub(0)}
          at={at}
          loop={loop}
          onLoop={setLoop}
        />

        {/*
          What the picture is on, as chips.

          Three states rather than two, and the middle one earns its place: you
          line a camera up by watching *it* whatever the cut says, and you check
          the film by watching the cut. A single toggle would make lining up a
          camera that is not live yet impossible.
        */}
        <span className="ml-auto flex items-center gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">
            {t.view}
          </span>
          <Chip on={through === null} onClick={() => setThrough(null)} title={t.freeLookTitle}>
            {t.freeLook}
          </Chip>
          <Chip on={through === LIVE} onClick={() => setThrough(LIVE)} title={t.theCutTitle}>
            {t.theCut}
          </Chip>
          {timeline.cameras.map((camera) => (
            <Chip
              key={camera.name}
              on={through === camera.name}
              onClick={() => setThrough(camera.name)}
            >
              {camera.name}
            </Chip>
          ))}
        </span>

        {/*
          The delivered shape, beside the view chips rather than in the Shot
          section where it started.

          It belongs here because of what it *does*: it changes what the
          viewport draws - the frame mask follows it - so it is a fact about
          looking, like the chips next to it, rather than a document setting
          filed under Shot. It was also unreachable there, three clicks deep in
          a collapsed section, which is a poor home for the control an author
          sets before composing anything.
        */}
        <span className="flex items-center gap-1">
          {FRAMES.map((one) => (
            <Chip key={one.id} on={frame === one.id} onClick={() => setFrame(one.id)}>
              {one.label}
            </Chip>
          ))}
        </span>

        <button
          type="button"
          onClick={onClose}
          title={t.closeTitle}
          className="shrink-0 rounded px-2 py-0.5 font-mono text-[10px] text-neutral-500 transition-colors hover:text-neutral-200"
        >
          {t.close}
        </button>
      </header>

      <div className={`flex min-h-0 flex-1 ${narrow ? 'flex-col' : 'flex-row'}`}>
        {/*
          Beside the stage rather than over it. See `PackPane` for why: a
          picker you cannot see the stage from is one you cannot drag out of,
          and dragging out of it is the whole point of having it here.
        */}
        {browsing ? (
          <PackPane
            document={xp}
            narrow={narrow}
            onPlace={(model) => edits.onAddActor(model, inFrontOf(parts.current?.camera ?? null))}
            onClose={() => setBrowsing(false)}
          />
        ) : null}

        <div
          /*
            `min-w-0` is load-bearing: a flex child defaults to `min-width:
            auto`, which means "never smaller than my contents", and the
            contents here are a canvas. Without it the stage refuses to give
            room to the pack pane, the row overflows, and the panel sidebar is
            pushed off the right-hand edge of the screen.
          */
          /*
            `flex-1` on a phone too, rather than a fixed 45%.

            It was `h-[45%]`, which is the report "on mobile the scene is half"
            said back word for word: the panels below are capped at 40% and the
            strip takes another 160px, so the picture was given less than half a
            screen while the things *about* the picture took the rest. The
            stage takes what is left over now, and the two below it are the ones
            that are capped - which is the right way round, because the shot is
            the thing you are looking at.
          */
          className={`relative min-h-0 min-w-0 flex-1`}
          /*
            The drop target is this wrapper rather than the canvas, because a
            canvas under a WebGL renderer is not somewhere to hang React events
            - and the wrapper is the same box, so the rect used for the ray is
            the rect the user aimed at.
          */
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(MODEL_MIME)) return
            // Both, and in this order: without the preventDefault the browser
            // will not fire a drop at all, and without the dropEffect the
            // cursor says "no" the whole way across a target that accepts.
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
            if (!over) setOver(true)
          }}
          onDragLeave={(event) => {
            // Only when the pointer actually left: dragging across a child
            // fires leave for the child, and a ring that flickers over its own
            // contents reads as a target that keeps changing its mind.
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            setOver(false)
          }}
          onDrop={(event) => {
            const model = event.dataTransfer.getData(MODEL_MIME)
            setOver(false)
            if (!model || !(model === AVATAR || CATALOGUE.some((one) => one.id === model))) return
            event.preventDefault()
            edits.onAddActor(
              model,
              onFloorAt(
                parts.current?.camera ?? null,
                event.currentTarget.getBoundingClientRect(),
                event.clientX,
                event.clientY,
              ),
            )
          }}
        >
          {/*
            Said with a ring rather than a cursor, because the cursor is over
            the thumbnail you are holding and the question is about here.
          */}
          {over ? (
            <div className="pointer-events-none absolute inset-0 z-10 rounded ring-2 ring-inset ring-violet-500/70" />
          ) : null}

          {/*
            The controls, in the corner, for whatever was clicked last.

            Asked for by name, and the reason is the distance between the two
            halves of one act: you click a body in the picture and then go to a
            320px column to move it, which is a trip across the screen for
            something you are looking straight at. This is the same
            `Transformer` the row holds - not a second copy, because two copies
            of a control drift the first time one of them is fixed.

            Bottom left, which is the one corner nothing else wants: the frame
            mask is centred, the shot chrome is along the top, and the timeline
            is below.
          */}
          {/*
            On a phone as well, which it was not.

            It was hidden on narrow while the stage was 39% of the screen and
            the panels took a third below it - a floating panel over a picture
            that small is most of the picture. The drawer changed that: the shot
            has the room now, and this is the one control set that *wants* a
            thumb. Pads, a play button, and no scrolling to reach any of it -
            the sidebar it replaces is two taps away behind a handle.
          */}
          {handles?.kind === 'actor' ? (
            <div className="absolute bottom-2 left-2 z-10 max-w-[19rem] rounded-lg border border-neutral-800 bg-neutral-950/85 px-2 py-1.5 backdrop-blur-sm">
              {/*
                The transport, here as well as on the shot bar.

                The corner is where your hand is once you have clicked
                something in the picture, and *play* is the next thing you do
                after moving it - watching the change is the point of making
                it. Reaching back across the screen for a button breaks the one
                loop this panel exists to shorten.
              */}
              <button
                type="button"
                onClick={running ? pause : play}
                className="mb-1 w-full rounded bg-violet-500/15 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-violet-200 transition-colors hover:bg-violet-500/30"
              >
                {running ? t.pause : t.play}
              </button>
              {(() => {
                const one = named.find((each) => each.name === handles.name)
                if (!one) return null
                const rig = skeletonOf(xp.blueprints[one.blueprint]?.model ?? '')
                /*
                  The bone wins when there is one.

                  Clicking a joint and being handed the *body's* controls is
                  the report "when I select the dummy and a bone, the dummy is
                  selected not the bone" - the click had landed, the panel had
                  followed it, and the one control in front of you was still
                  about the whole body.
                */
                return rig && bone ? (
                  <>
                    <span className="mb-1 block truncate font-mono text-[9px] uppercase tracking-[0.18em] text-amber-300">
                      {one.name} · {bone}
                    </span>
                    <BoneTransformer
                      entity={one.name}
                      rig={rig}
                      clips={xp.clips}
                      bone={bone}
                      onClips={edits.onClips}
                      onPose={(clips, clip, from) => edits.onPose(one.name, clips, clip, from)}
                      at={at}
                      start={poseStart(timeline, one.name)}
                      poseNow={() => poses.current?.(one.name) ?? null}
                    />
                  </>
                ) : (
                  <>
                    <span className="mb-1 block truncate font-mono text-[9px] uppercase tracking-[0.18em] text-violet-300">
                      {one.name}
                    </span>
                    <Transformer
                      actor={one}
                      timeline={timeline}
                      at={at}
                      autoKey={autoKey}
                      edits={edits}
                      tool={tool}
                      onTool={setTool}
                      locked={locked}
                      onLocked={setLocked}
                      compact
                    />
                  </>
                )
              })()}
            </div>
          ) : null}

          {/*
            The delivered frame, over a view that is already the shot. See
            `Framed` for why this is a mask rather than a second render.
          */}
          <Framed frame={frame} on={through !== null} />

          <MovieStage
            document={xp}
            world={place.world}
            entities={place.entities}
            timeline={timeline}
            clock={clock}
            through={through}
            onTime={setAt}
            onEnded={onEnded}
            onPick={choose}
            gizmo={handles}
            liveCamera={through === LIVE ? liveCamera(timeline, at) : through}
            onPickCamera={(name) => setThrough(name)}
            onDrag={(to) => {
              if (!handles) return
              if (handles.kind === 'actor') edits.onMoveActor(handles.name, at, to)
              // A group reports a *shift* rather than a place - see `GizmoTarget`.
              else if (handles.kind === 'actors') edits.onMoveActors(handles.names, at, to)
              else edits.onMoveFraming(handles.name, handles.index, handles.what, to)
            }}
            onReady={onReady}
            bone={bone}
            onPickBone={setBone}
            preview={preview}
            loop={loop}
            adding={adding}
            onPoses={(read) => {
              poses.current = read
            }}
          />
        </div>

        {narrow ? null : (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800 px-3 py-2">
            {panels}
          </aside>
        )}
      </div>

      {/* Shorter on a phone: the strip is a thing you glance at, and every row
          of it is a row the picture does not get. */}
      <div className={`shrink-0 border-t border-neutral-800 ${narrow ? 'h-28' : 'h-56'}`}>
        <Timeline
          timeline={timeline}
          at={at}
          onScrub={scrub}
          loop={loop}
          onLoop={setLoop}
          selected={selected}
          onSelect={(name) => choose(name, false)}
          onDropKey={edits.onDropKey}
          onKeyEase={edits.onKeyEase}
          onDropCut={edits.onDropCut}
          onDropAction={edits.onDropAction}
          onSetAction={edits.onSetAction}
        />
      </div>

      {/*
        On a phone the panels are a drawer, not a third of the screen.

        They were below the timeline and always open, which took 34% for the
        controls, another 112px for the strip, and left the picture with 39% -
        the report *"on mobile the scene is half"*, and generous at that. There
        is room for one thing at a time on a phone and the job is choosing
        which, so the shot gets the room until you ask for the controls.

        The handle stays whichever way it is, because a drawer you cannot see
        the edge of is a drawer nobody opens twice.
      */}
      {narrow ? (
        <>
          <button
            type="button"
            onClick={() => setSheet(!sheet)}
            className="flex shrink-0 items-center justify-center gap-2 border-t border-neutral-800 bg-neutral-900/60 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500"
          >
            <span aria-hidden className="h-0.5 w-8 rounded-full bg-neutral-700" />
            {sheet ? t.hideControls : t.showControls}
          </button>
          {sheet ? (
            <div className="max-h-[52%] shrink-0 overflow-y-auto border-t border-neutral-800 px-3 py-2">
              {panels}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function Chip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      {...(title ? { title } : {})}
      className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
        on ? 'bg-violet-500/15 text-violet-300' : 'text-neutral-500 hover:text-neutral-300'
      }`}
    >
      {children}
    </button>
  )
}

function Transport({
  running,
  onPlay,
  onPause,
  onStart,
  at,
  loop,
  onLoop,
}: {
  running: boolean
  onPlay: () => void
  onPause: () => void
  onStart: () => void
  /** Where the playhead is, which is what the in and out points are set from. */
  at: number
  loop: { from: number; to: number } | null
  onLoop: (loop: { from: number; to: number } | null) => void
}) {
  const t = xpEditorDict(useLocale()).movie
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={onStart}
        title={t.toStart}
        className="rounded px-2 py-0.5 font-mono text-[10px] text-neutral-500 transition-colors hover:text-neutral-200"
      >
        ⏮
      </button>
      <button
        type="button"
        onClick={running ? onPause : onPlay}
        className="rounded bg-violet-500/15 px-2.5 py-0.5 font-mono text-[10px] text-violet-300 transition-colors hover:bg-violet-500/25"
      >
        {running ? t.pause : t.play}
      </button>

      {/*
        In and out, set from the playhead.

        Two presses rather than a pair of draggable flags on the ruler: the
        gesture is *"from here"* and *"to here"*, and the playhead is already
        where you are looking. A flag you drag is a second way to say a number
        the scrubber can already say.

        `out` before `in` sets an empty stretch, which the clock ignores - it
        only cycles when `to` is past `from`. So the pair is never in a state
        that quietly stops playback working.
      */}
      <button
        type="button"
        onClick={() => onLoop({ from: at, to: loop?.to ?? at })}
        title={t.loopFromTitle}
        className="rounded px-1.5 py-0.5 font-mono text-[9px] text-neutral-500 transition-colors hover:text-violet-300"
      >
        {t.loopFrom}
      </button>
      <button
        type="button"
        onClick={() => onLoop({ from: loop?.from ?? 0, to: at })}
        title={t.loopToTitle}
        className="rounded px-1.5 py-0.5 font-mono text-[9px] text-neutral-500 transition-colors hover:text-violet-300"
      >
        {t.loopTo}
      </button>
      {loop && loop.to > loop.from ? (
        <button
          type="button"
          onClick={() => onLoop(null)}
          title={t.loopOffTitle}
          className="rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[9px] text-amber-300 transition-colors hover:bg-amber-400/25"
        >
          {fill(t.loopingRange, { a: loop.from.toFixed(1), b: loop.to.toFixed(1) })}
        </button>
      ) : null}
    </span>
  )
}

/**
 * Everything that is not the picture or the time axis.
 *
 * One component so the wide layout and the narrow one draw exactly the same
 * controls - two copies is how a checkbox comes to exist on a laptop and not on
 * a phone, and nobody finds out for a month.
 *
 * ---------------------------------------------------------------------------
 * Sections and rows, in the studio's idiom
 * ---------------------------------------------------------------------------
 * Asked for by name, and it is the right instinct: the first version was a flat
 * column of labelled fields, which is fine for four numbers and hopeless for a
 * cast. A collapsed section with "3 cameras" on it tells you whether to open
 * it; eight stacked headings tell you nothing and take the whole column.
 *
 * ---------------------------------------------------------------------------
 * Auto-key, and why a slider needs a mode at all
 * ---------------------------------------------------------------------------
 * A slider in a scene inspector moves a thing. A slider in a *movie* has two
 * possible meanings and they are both reasonable: move where this body starts,
 * or say where it is at this moment. Guessing between them is how an author
 * loses an afternoon - drag at four seconds, come back to zero, and the actor
 * has moved there too.
 *
 * So it is a switch, in the Cast header where it applies. **Off**, a slider
 * edits the body: this is the pose the shot begins from. **On**, every slider
 * writes a key at the playhead, which is what makes scrub-drag-scrub-drag into
 * a path. It is the same word and the same behaviour the animator already has,
 * deliberately - two editors in one product that disagree about what auto-key
 * means would be worse than either.
 */
function Panels({
  document: xp,
  timeline,
  entities,
  at,
  selected,
  onSelect,
  through,
  handles,
  onHandles,
  parts,
  running,
  onPlay,
  onPause,
  edits,
  onAnimate,
  bone,
  onBone,
  autoKey,
  onAutoKey,
  tool,
  onTool,
  locked,
  onLocked,
  onPreview,
  onSeek,
  poseNow,
  frame,
  onBrowse,
}: {
  document: XpDocument
  timeline: XpTimeline
  entities: readonly (EntitySpec & { name: string })[]
  at: number
  selected: readonly string[]
  onSelect: (name: string, add: boolean) => void
  through: string | null
  handles: GizmoTarget | null
  onHandles: (target: GizmoTarget | null) => void
  parts: React.RefObject<CaptureParts | null>
  running: boolean
  onPlay: () => void
  onPause: () => void
  edits: MovieEdits
  onAnimate: (rig: SkeletonId) => void
  /** Which bone the selected body is being posed by. See `MovieMode`. */
  bone: string | null
  onBone: (bone: string | null) => void
  /**
   * Whether editing a value pins it at the playhead.
   *
   * Held above the panels because the stage's corner controls write through
   * the same path - see `Transformer` - and a corner that always keyed while
   * the checkbox said otherwise would be one control disagreeing with another
   * about what pressing it does.
   */
  autoKey: boolean
  onAutoKey: (on: boolean) => void
  /** Shared with the stage's corner copy - see `Transformer`. */
  tool: Tool
  onTool: (tool: Tool) => void
  locked: ReadonlySet<'x' | 'y' | 'z'>
  onLocked: (locked: ReadonlySet<'x' | 'y' | 'z'>) => void
  onPreview: (preview: { entity: string; clip: string } | null) => void
  /** Put the playhead somewhere. A pose's moments are clickable. */
  onSeek: (seconds: number) => void
  poseNow: (entity: string) => Record<string, number[]> | null
  frame: FrameId
  onBrowse: () => void
}) {
  const t = xpEditorDict(useLocale()).movie

  return (
    <div className="flex flex-col gap-1.5">
      <Section
        title={t.cameras}
        icon={CameraIcon}
        summary={fill(timeline.cameras.length === 1 ? t.oneCamera : t.someCameras, {
          n: String(timeline.cameras.length),
        })}
        open
      >
        <Cameras
          timeline={timeline}
          at={at}
          through={through}
          handles={handles}
          onHandles={onHandles}
          parts={parts}
          edits={edits}
          onSeek={onSeek}
        />
      </Section>

      <Section
        title={t.cast}
        icon={Users}
        summary={fill(entities.length === 1 ? t.oneActor : t.someActors, {
          n: String(entities.length),
        })}
        open
      >
        {/*
          The switch sits above the cast rather than on each row, because it is
          one decision about what a drag *means* - and a per-actor version would
          be eight switches somebody has to keep in agreement.
        */}
        <label className="flex items-center gap-1.5 self-start rounded border border-neutral-900 px-1.5 py-1 font-mono text-[10px] text-neutral-500">
          <input
            type="checkbox"
            checked={autoKey}
            onChange={(event) => onAutoKey(event.target.checked)}
            className="size-3 accent-amber-500"
          />
          <span title={t.autoKeyTitle}>{t.autoKey}</span>
        </label>

        {entities.length === 0 ? <Hint>{t.nobodyNamedLead}</Hint> : null}

        {entities.map((one) => (
          <Actor
            key={one.name}
            document={xp}
            actor={one}
            cast={entities.map((each) => each.name)}
            at={at}
            autoKey={autoKey}
            timeline={timeline}
            open={selected.includes(one.name)}
            onOpen={(add) => onSelect(one.name, add)}
            edits={edits}
            onAnimate={onAnimate}
            bone={bone}
            onBone={onBone}
            entities={entities}
            tool={tool}
            onTool={onTool}
            locked={locked}
            onLocked={onLocked}
            onPreview={onPreview}
            onSeek={onSeek}
            poseNow={poseNow}
          />
        ))}

        <CastPicker
          document={xp}
          parts={parts}
          onAdd={edits.onAddActor}
          onEmptyAt={edits.onAddEmpty}
          onBrowse={onBrowse}
        />
      </Section>

      <Section
        title={t.shot}
        icon={Film}
        summary={`${timeline.duration}s · ${timeline.fps}fps`}
      >
        <Shot timeline={timeline} edits={edits} />
      </Section>

      <Section title={t.exportHeading} icon={Download}>
        <Export
          timeline={timeline}
          at={at}
          parts={parts}
          running={running}
          frame={frame}
          onPlay={onPlay}
          onPause={onPause}
        />
      </Section>
    </div>
  )
}

/**
 * The cameras, and the two gestures that make a shot out of a view.
 *
 * "Put a camera here" and "move this one here" are the same act at two
 * different moments in an author's afternoon, and both read the *live* camera
 * rather than asking for numbers. That is the whole affordance: you fly to a
 * view you like and press a button. Typing a position into six fields is how
 * every engine used to do this and nobody ever found the shot that way.
 *
 * Both are refused while the picture is on a camera, and the refusal is the
 * honest one: if the view is being driven by the cut, "where you are looking
 * from" is a framing that already exists, and pressing the button would key a
 * camera onto itself.
 */
function Cameras({
  onSeek,
  timeline,
  at,
  through,
  handles,
  onHandles,
  parts,
  edits,
}: {
  timeline: XpTimeline
  at: number
  through: string | null
  handles: GizmoTarget | null
  onHandles: (target: GizmoTarget | null) => void
  parts: React.RefObject<CaptureParts | null>
  edits: MovieEdits
  /** Put the playhead on a framing. Clicking one is a request to see it. */
  onSeek: (seconds: number) => void
}) {
  const t = xpEditorDict(useLocale()).movie

  /** Where the viewport is looking from, as a framing. */
  const framing = () => {
    const camera = parts.current?.camera
    if (!camera) return null
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    // A target four metres out, which is a plausible subject distance and is
    // what a `lookAt` needs: a direction alone cannot be stored as a framing,
    // because the format keeps a *point* so two framings can be interpolated
    // without the camera's aim swinging the long way round.
    const target = camera.position.clone().add(direction.multiplyScalar(4))
    return {
      position: [camera.position.x, camera.position.y, camera.position.z] as [number, number, number],
      target: [target.x, target.y, target.z] as [number, number, number],
      fov: camera.fov,
    }
  }

  const free = through === null

  return (
    <>
      <ul className="space-y-1">
        {timeline.cameras.map((camera) => (
          <li key={camera.name} className="rounded border border-neutral-900 px-2 py-1.5">
            <div className="flex items-center gap-2">
              {/*
                Held text, because `renameCamera` refuses more than it accepts -
                an empty field, a space, a name already taken. See `Name`.
              */}
              <Name
                value={camera.name}
                onChange={(to) => edits.onRenameCamera(camera.name, to)}
                legal={(to) =>
                  CAMERA_NAME.test(to) &&
                  !timeline.cameras.some((one) => one.name === to && one.name !== camera.name)
                }
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[10px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
              />
              <span className="shrink-0 font-mono text-[9px] text-neutral-600">
                {camera.keys.length}
              </span>
              {timeline.cameras.length > 1 ? (
                <button
                  type="button"
                  onClick={() => edits.onRemoveCamera(camera.name)}
                  className="shrink-0 font-mono text-[10px] text-neutral-600 transition-colors hover:text-red-400"
                >
                  {t.removeCamera}
                </button>
              ) : null}
            </div>
            {/*
              The moments this camera is framed at, and which one you are on.

              The header has always shown the *count* and nothing could act on
              it: `moveFraming` adds one at the playhead, so a camera collected
              framings and could never lose one. `dropFraming` was written for
              this and had never been called by anything but its own test.

              The same strip the pose moments use, and deliberately: they are
              the same question asked of a camera instead of a body, and two
              shapes for that would be two things to learn.
            */}
            {camera.keys.length > 1 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">
                  {t.framings}
                </span>
                {camera.keys.map((key, index) => (
                  <button
                    key={`${key.t}-${index}`}
                    type="button"
                    onClick={() => onSeek(key.t)}
                    title={t.goToMoment}
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
                      index === nearestFraming(timeline, camera.name, at)
                        ? 'bg-violet-500/20 text-violet-200'
                        : 'text-neutral-600 hover:text-neutral-300'
                    }`}
                  >
                    {key.t.toFixed(1)}s
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const index = nearestFraming(timeline, camera.name, at)
                    if (index !== null) edits.onDropFraming(camera.name, index)
                  }}
                  title={t.dropFramingTitle}
                  className="ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] text-neutral-600 transition-colors hover:text-red-400"
                >
                  ×
                </button>
              </div>
            ) : null}

            {/*
              Where it stands and what it looks at, as six numbers.

              Asked for after the frustum went in, and the pair is the point:
              the gizmo tells you *roughly* where a camera is pointing and these
              tell you exactly. Neither replaces the other - you find a shot by
              flying to it, and you fix one by typing 0.

              The framing edited is the one nearest the playhead, the same one
              the drag and aim handles are on, so all four controls agree about
              which of a camera's framings they are touching.
            */}
            {(() => {
              const index = nearestFraming(timeline, camera.name, at)
              const framing = index === null ? undefined : camera.keys[index]
              if (index === null || !framing) return null
              return (
                <div className="mt-1 flex flex-col gap-1">
                  {(['position', 'target'] as const).map((what) => (
                    <div key={what} className="flex items-center gap-1">
                      <span className="w-10 shrink-0 truncate font-mono text-[9px] text-neutral-600">
                        {what === 'position' ? t.stands : t.looksAt}
                      </span>
                      {[0, 1, 2].map((axis) => (
                        <input
                          key={axis}
                          type="number"
                          step={0.5}
                          value={Math.round(framing[what][axis]! * 100) / 100}
                          onChange={(event) => {
                            const next = Number(event.target.value)
                            if (!Number.isFinite(next)) return
                            const point = [...framing[what]] as [number, number, number]
                            point[axis] = next
                            edits.onMoveFraming(camera.name, index, what, {
                              x: point[0],
                              y: point[1],
                              z: point[2],
                            })
                          }}
                          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-0.5 text-right font-mono text-[9px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
                        />
                      ))}
                    </div>
                  ))}
                  <Slide
                    label={t.lens}
                    value={framing.fov}
                    min={10}
                    max={110}
                    step={1}
                    unit="°"
                    onChange={(fov) =>
                      edits.onFraming(camera.name, {
                        t: framing.t,
                        // Copied rather than spread: the format keeps a framing's
                        // points readonly, and a writer that took the same array
                        // would let a panel mutate a document in place.
                        position: [...framing.position] as [number, number, number],
                        target: [...framing.target] as [number, number, number],
                        fov,
                      })
                    }
                  />
                </div>
              )
            })()}

            <div className="mt-1 flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={!free}
                title={t.keyHereTitle}
                onClick={() => {
                  const now = framing()
                  if (now) edits.onFraming(camera.name, { t: at, ...now })
                }}
                className="rounded border border-neutral-800 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400 transition-colors hover:border-violet-600 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.keyHere}
              </button>
              <button
                type="button"
                title={t.cutHereTitle}
                onClick={() => edits.onCut(at, camera.name)}
                className="rounded border border-neutral-800 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400 transition-colors hover:border-violet-600 hover:text-violet-300"
              >
                {t.cutHere}
              </button>
              {/*
                Handles on this camera's nearest framing, as two chips.

                Nearest to the playhead rather than a list to pick from, because
                a framing is not a number to an author - it is the one they can
                see. `nearestFraming` is that, and it means scrubbing changes
                which point the handle is on, which is what somebody expects
                from a timeline.
              */}
              {(['position', 'target'] as const).map((what) => {
                const index = nearestFraming(timeline, camera.name, at)
                const on =
                  handles?.kind === 'camera' &&
                  handles.name === camera.name &&
                  handles.what === what
                return (
                  <button
                    key={what}
                    type="button"
                    disabled={index === null || !free}
                    onClick={() =>
                      onHandles(
                        on || index === null
                          ? null
                          : { kind: 'camera', name: camera.name, index, what },
                      )
                    }
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      on
                        ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
                    }`}
                  >
                    {what === 'position' ? t.moveIt : t.aimIt}
                  </button>
                )
              })}

              <label className="ml-auto flex items-center gap-1 font-mono text-[9px] text-neutral-500">
                <input
                  type="checkbox"
                  checked={camera.ease}
                  onChange={(event) => edits.onCameraEase(camera.name, event.target.checked)}
                  className="size-3 accent-violet-500"
                />
                <span title={t.easeTitle}>{t.ease}</span>
              </label>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={!free}
        title={t.addCameraTitle}
        onClick={() => {
          const now = framing()
          if (now) edits.onAddCamera(now)
        }}
        className="mt-1.5 rounded border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 transition-colors hover:border-violet-600 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t.addCamera}
      </button>
    </>
  )
}


/**
 * One member of the cast, as a row that opens.
 *
 * ---------------------------------------------------------------------------
 * Sliders, not a column of read-only numbers with a key button beside each
 * ---------------------------------------------------------------------------
 * The first version printed the value and offered `key`, which meant the only
 * way to *change* anything was the gizmo in the viewport - so a body could be
 * keyed exactly where it already was and nowhere else. A slider is how you find
 * a value by looking at it, which is the whole job here.
 *
 * The `key` button stays beside each one, and it is not redundant with
 * auto-key: pinning a value you are happy with, without nudging it, is a
 * different act from changing it - "stay here until four seconds" is one press
 * and no drag.
 */
function Actor({
  document: xp,
  actor,
  cast,
  at,
  autoKey,
  timeline,
  open,
  onOpen,
  edits,
  onAnimate,
  bone,
  onBone,
  entities,
  tool,
  onTool,
  locked,
  onLocked,
  onPreview,
  onSeek,
  poseNow,
}: {
  document: XpDocument
  actor: EntitySpec & { name: string }
  /** Every named body here, for the parent picker. */
  cast: readonly string[]
  at: number
  autoKey: boolean
  timeline: XpTimeline
  open: boolean
  onOpen: (add: boolean) => void
  edits: MovieEdits
  onAnimate: (rig: SkeletonId) => void
  bone: string | null
  onBone: (bone: string | null) => void
  /** The whole cast, so a head can be aimed at one of them. See `look`. */
  entities: readonly (EntitySpec & { name: string })[]
  /** Shared with the stage's corner copy - see `Transformer`. */
  tool: Tool
  onTool: (tool: Tool) => void
  locked: ReadonlySet<'x' | 'y' | 'z'>
  onLocked: (locked: ReadonlySet<'x' | 'y' | 'z'>) => void
  /** Show a clip on this body without putting it in the shot. */
  onPreview: (preview: { entity: string; clip: string } | null) => void
  onSeek: (seconds: number) => void
  /** Read a body's pose as drawn. See `poseNow` in `useBoneTurn`. */
  poseNow: (entity: string) => Record<string, number[]> | null
}) {
  const t = xpEditorDict(useLocale()).movie
  const [clip, setClip] = useState('')
  const [loop, setLoop] = useState(false)
  const [line, setLine] = useState('')
  const [seconds, setSeconds] = useState(DEFAULT_LINE_SECONDS)

  /**
   * Which skeleton this body is, or none.
   *
   * Read off the blueprint's model rather than the entity, because a rig is a
   * fact about the *model* - the same lookup `posedBodies` makes to decide which
   * bodies get a skeleton, so the panel and the picture cannot disagree about
   * who has bones.
   */
  const rig = skeletonOf(xp.blueprints[actor.blueprint]?.model ?? '')

  /**
   * What the body is at **this moment** - keys, actions and all.
   *
   * ---------------------------------------------------------------------------
   * Reported as "when I change values it jitters and stays the same"
   * ---------------------------------------------------------------------------
   * And that is exactly what it did. The sliders read the entity's *base* value
   * while auto-key wrote a **key** at the playhead - so a drag published a
   * change the slider's own value never reflected, React re-rendered it back to
   * where it started, and the next pointer event fought the last one. The
   * document was taking every edit correctly the whole time; the control was
   * showing a number that could not move.
   *
   * Reading the posed value fixes both halves at once. With auto-key on, keying
   * moves what is displayed because it moves what is *there*. With it off, the
   * base and the posed value are the same thing until something is keyed - and
   * once something is, a slider that appears stuck is telling the truth: the key
   * is overriding, which is what a key is for.
   */
  const posed = useMemo(
    () => posedAt(actor, timeline, at).entity,
    [actor, timeline, at],
  )

  const own = (property: string): number => {
    switch (property) {
      case 'x':
        return posed.x
      case 'y':
        return posed.y
      case 'z':
        return posed.z
      case 'rotation':
        return posed.rotation
      case 'pitch':
        return posed.pitch ?? 0
      case 'roll':
        return posed.roll ?? 0
      case 'scale':
        return posed.scale
      case 'visible':
        return 1
      default:
        return 0
    }
  }

  /**
   * What a slider does, which is the one decision this panel is built around.
   *
   * With auto-key on it writes a key at the playhead; off, it moves the body
   * itself. See the note on `Panels` for why guessing between the two is worse
   * than a switch.
   */
  const set = (property: string, value: number) => {
    if (autoKey) {
      edits.onKey(actor.name, property, value, at)
      return
    }
    const prop = propOfProperty(property)
    if (prop !== null) {
      edits.onSetActor(actor.name, { props: { ...actor.props, [prop]: value } })
      return
    }
    if (property === 'visible') return
    edits.onSetActor(actor.name, { [property]: value })
  }

  /**
   * The cameras and the rest of the cast, where they are at this moment.
   *
   * Resolved here rather than in `Pose`, which knows about one body's bones and
   * has no business reading a timeline. Everything is taken *at the playhead* -
   * a camera that moves and a body that walks are both somewhere different a
   * second later, and aiming a head at where something used to be is the one
   * way this can be quietly wrong.
   */
  const look = useMemo(() => {
    const spots: { name: string; label: string; at: { x: number; y: number; z: number } }[] = []
    for (const camera of timeline.cameras) {
      const framing = framingAt(camera, at)
      spots.push({
        name: `camera:${camera.name}`,
        label: `${t.theCamera} ${camera.name}`,
        at: { x: framing.position[0], y: framing.position[1], z: framing.position[2] },
      })
    }
    for (const one of entities) {
      if (one.name === actor.name) continue
      const where = posedAt(one, timeline, at).entity
      spots.push({ name: one.name, label: one.name, at: { x: where.x, y: where.y, z: where.z } })
    }
    return spots
  }, [timeline, at, entities, actor.name, t.theCamera])

  const keyed = keyedProperties(timeline.tracks[actor.name]).length

  const props = Object.keys(xp.blueprints[actor.blueprint]?.props ?? {})

  /**
   * Everything this could hang off: the rest of the cast.
   *
   * Itself excluded, which `setEntity` also refuses - but a select offering a
   * choice that is always refused is a choice somebody makes once. Deeper loops
   * are left to the writer, because "would this be a cycle" is a walk rather
   * than a comparison and the answer is the same either way: nothing happens.
   */
  const others = cast.filter((one) => one !== actor.name)

  return (
    <Row
      title={actor.name}
      detail={keyed > 0 ? fill(t.keyedCount, { n: String(keyed) }) : (rig ?? actor.blueprint)}
      open={open}
      onToggle={(next) => {
        if (next) onOpen(false)
      }}
      lead={
        <span
          className={`size-2 shrink-0 rounded-full ${rig ? 'bg-violet-400' : 'bg-neutral-600'}`}
          aria-hidden
        />
      }
    >
      {/*
        What this hangs off, which is how a set gets grouped.

        `parent` has been in the format since bodies could be attached to each
        other, and it is exactly grouping: move the node and everything under it
        comes along. First in the row because it changes what *moving* means -
        a body with a parent moves in its parent's frame, and finding that out
        after dragging it is a surprise.

        `setEntity` refuses a parent that is not in this place and one that
        would make a loop, so nothing here has to check either.
      */}
      <Pick
        label={t.hangsOff}
        value={actor.parent ?? ''}
        options={[
          ['', t.nothing] as const,
          ...others.map((one) => [one, one] as const),
        ]}
        onChange={(parent) => edits.onParent(actor.name, parent === '' ? null : parent)}
      />

      {/*
        Position first, and as a gesture rather than three numbers.

        Above the sliders because it is the coarse control - "over there" comes
        before "and 0.4 further" - and because it is the one that works on a
        phone, where three number boxes are not a serious proposition.
      */}
      {/*
        The pads, shared with the corner of the stage - see `Transformer`.
      */}
      <Transformer
        actor={actor}
        timeline={timeline}
        at={at}
        autoKey={autoKey}
        edits={edits}
        tool={tool}
        onTool={onTool}
        locked={locked}
        onLocked={onLocked}
      />

      {ANIMATABLE.filter((entry) => entry.property !== 'visible').map((entry) => (
        <Slide
          key={entry.property}
          label={entry.label}
          value={own(entry.property)}
          min={entry.min}
          max={entry.max}
          step={entry.step}
          {...(entry.unit ? { unit: entry.unit } : {})}
          onChange={(value) => set(entry.property, value)}
          trailing={
            <KeyButton
              onClick={() => edits.onKey(actor.name, entry.property, own(entry.property), at)}
            />
          }
        />
      ))}

      {/*
        Shown is a switch rather than a slider, because it is a boolean wearing a
        number: `ANIMATABLE` keeps it as 0 or 1 with a hold ease so it goes
        through one key system rather than two, and a slider between them would
        offer half a body.
      */}
      <label className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-500">
        <input
          type="checkbox"
          defaultChecked
          onChange={(event) =>
            edits.onKey(actor.name, 'visible', event.target.checked ? 1 : 0, at)
          }
          className="size-3 accent-violet-500"
        />
        {t.shownHere}
      </label>

      {props.length > 0 ? (
        <div className="mt-1 border-t border-neutral-900 pt-1.5">
          {props.map((prop) => (
            <Slide
              key={prop}
              label={prop}
              value={posed.props[prop] ?? xp.blueprints[actor.blueprint]?.props?.[prop] ?? 0}
              min={-360}
              max={360}
              step={1}
              onChange={(value) => set(propertyOfProp(prop), value)}
              trailing={
                <KeyButton
                  onClick={() =>
                    edits.onKey(
                      actor.name,
                      propertyOfProp(prop),
                      posed.props[prop] ?? xp.blueprints[actor.blueprint]?.props?.[prop] ?? 0,
                      at,
                    )
                  }
                />
              }
            />
          ))}
        </div>
      ) : null}

      {/*
        And the two things that are neither a number nor a pose: a clip and a
        line. Both *start* at this moment rather than holding a value, which is
        why they are buttons and the rest are sliders.
      */}
      <div className="mt-1 flex items-center gap-1.5 border-t border-neutral-900 pt-1.5">
        <select
          value={clip}
          onChange={(event) => {
            setClip(event.target.value)
            // Picking one is *not* a request to see it. It was, and it read as
            // the body going wrong: you are usually part-way through posing or
            // placing when you touch this list, and a clip taking the body over
            // unbidden looks like something broke rather than like an answer.
            // The button beside it is the request.
            onPreview(null)
          }}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[10px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
        >
          <option value="">{t.clip}</option>
          {Object.keys(xp.clips ?? {}).map((one) => (
            <option key={`own:${one}`} value={one}>
              {one}
            </option>
          ))}
          {CLIPS.map((one) => (
            <option key={`pack:${one}`} value={one}>
              {one}
            </option>
          ))}
        </select>
        <label className="flex shrink-0 items-center gap-1 font-mono text-[9px] text-neutral-500">
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => setLoop(event.target.checked)}
            className="size-3 accent-sky-500"
          />
          {t.loop}
        </label>
        <Add
          disabled={clip.trim().length === 0}
          title={t.seeItTitle}
          onClick={() =>
            onPreview(clip.trim() ? { entity: actor.name, clip: clip.trim() } : null)
          }
        >
          {t.seeIt}
        </Add>
        <Add
          disabled={clip.trim().length === 0}
          title={t.playsTitle}
          onClick={() => edits.onCue(actor.name, clip.trim(), loop, nextBeat(timeline, actor.name, at))}
        >
          {t.plays}
        </Add>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={line}
          onChange={(event) => setLine(event.target.value)}
          placeholder={t.line}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[10px] text-neutral-300 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
        <input
          type="number"
          min={0.2}
          max={30}
          step={0.5}
          value={seconds}
          onChange={(event) => setSeconds(Number(event.target.value))}
          className="w-11 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 text-right font-mono text-[10px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
        />
        <Add
          disabled={line.trim().length === 0}
          title={t.saysTitle}
          onClick={() => {
            edits.onSay(actor.name, line.trim(), seconds, nextBeat(timeline, actor.name, at))
            // Cleared, because the next thing anybody types is the *next* line
            // rather than an edit of the one just placed - and a field that
            // keeps its text is one people place twice by accident.
            setLine('')
          }}
        >
          {t.says}
        </Add>
      </div>

      {/*
        Posing, in the frame rather than in another window.

        Above the animator button rather than instead of it: sliders here are
        for "this arm, a bit lower", which is nine tenths of what a shot needs;
        the animator is for a walk cycle, which nobody builds in a 320px column.
        Both write the same thing - a clip in the document - so neither owns the
        result. See `./pose`.
      */}
      {rig ? (
        <Pose
          entity={actor.name}
          rig={rig}
          clips={xp.clips}
          onClips={edits.onClips}
          onPose={(clips, clip, from) => edits.onPose(actor.name, clips, clip, from)}
          at={at}
          start={poseStart(timeline, actor.name)}
          onSeek={onSeek}
          poseNow={() => poseNow(actor.name)}
          onCue={(clip) => edits.onCue(actor.name, clip, false, at)}
          bone={bone}
          onBone={onBone}
          look={{
            from: { x: posed.x, y: posed.y, z: posed.z },
            facing: posed.rotation,
            targets: look,
          }}
        />
      ) : null}

      <Does
        actor={{ name: actor.name, x: posed.x, z: posed.z, rotation: posed.rotation }}
        timeline={timeline}
        at={at}
        edits={edits}
      />

      <div className="flex items-center gap-1.5">
        {rig ? (
          <Add onClick={() => onAnimate(rig)} title={t.animateTitle}>
            {t.animate}
          </Add>
        ) : null}
        <Add onClick={() => edits.onDuplicateActor(actor.name)} title={t.duplicateTitle}>
          {t.duplicate}
        </Add>
        <span className="ml-auto flex items-center gap-1.5">
          <Remove onClick={() => edits.onClearKeys(actor.name)} confirm={t.clearKeysSure}>
            {t.clearKeys}
          </Remove>
          {/*
            Deleting the body, next to deleting only her keys, because they are
            the two things "remove" could mean here and reading them side by
            side is what tells them apart.
          */}
          <Remove
            onClick={() => edits.onRemoveActor(actor.name)}
            confirm={t.deleteActorSure}
            title={t.deleteActorTitle}
          >
            {t.deleteActor}
          </Remove>
        </span>
      </div>
    </Row>
  )
}

/** The little diamond that pins a value where it is. Matches the timeline's. */
function KeyButton({ onClick }: { onClick: () => void }) {
  const t = xpEditorDict(useLocale()).movie
  return (
    <button
      type="button"
      onClick={onClick}
      title={t.keyTitle}
      aria-label={t.key}
      className="size-3 shrink-0 rotate-45 border border-amber-300/60 bg-amber-400/30 transition-colors hover:border-amber-200 hover:bg-amber-400/60"
    />
  )
}

/**
 * Where the camera is looking at the floor.
 *
 * ---------------------------------------------------------------------------
 * One definition, because two callers ask the same question
 * ---------------------------------------------------------------------------
 * The sidebar's picker and the full-screen pack viewer both put a model *there*
 * - where the view is pointed - and it started as a closure inside one of them.
 * A second copy would be two answers to "where does a thing land", and they
 * would drift the first time either was tuned.
 *
 * The floor rather than a fixed distance ahead: the first version put things
 * four metres in front, and a camera ten metres from its subject puts four
 * metres under its own chin, so everything arrived off the bottom of the frame.
 * A camera aimed at or above the horizon has no floor to meet, and then six
 * metres ahead is the honest fallback rather than a point at infinity.
 */
function inFrontOf(camera: THREE.PerspectiveCamera | null): {
  x: number
  y: number
  z: number
} {
  if (!camera) return { x: 0, y: 0, z: 0 }

  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)

  if (direction.y < -0.05) {
    // Capped, because a camera almost level with the floor meets it hundreds of
    // metres away, and a model placed out there is one nobody can find.
    const reach = Math.min(camera.position.y / -direction.y, 40)
    const at = camera.position.clone().add(direction.clone().multiplyScalar(reach))
    return { x: at.x, y: 0, z: at.z }
  }

  const flat = direction.clone()
  flat.y = 0
  if (flat.lengthSq() < 0.0001) flat.set(0, 0, -1)
  flat.normalize().multiplyScalar(6)
  const at = camera.position.clone().add(flat)
  return { x: at.x, y: 0, z: at.z }
}

/**
 * The floor, as a plane to cast a dropped model onto.
 *
 * A stage has a ground at y=0 and nothing else worth landing on: dropping onto
 * a *prop* would need the real world's colliders, and a movie's world is
 * whatever the last import left behind. The floor is the one surface that is
 * always there and always means the same thing.
 */
const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

/**
 * Where a model dropped at a screen point should land.
 *
 * The pointer rather than the camera, because that is the entire difference
 * between clicking a thumbnail and dragging one: a click says *put it in the
 * shot* and has no better answer than the middle of the view, while a drag
 * says *put it there* and it would be perverse to ignore the there.
 *
 * Falls back to `inFrontOf` when the ray misses - dropping against the sky, or
 * onto a horizon so shallow the floor is met two hundred metres out. Both give
 * a mathematically real point that is no use to anybody, so the honest answer
 * is the one the click would have given.
 */
function onFloorAt(
  camera: THREE.PerspectiveCamera | null,
  rect: DOMRect,
  clientX: number,
  clientY: number,
): { x: number; y: number; z: number } {
  if (!camera) return { x: 0, y: 0, z: 0 }

  const caster = new THREE.Raycaster()
  caster.setFromCamera(
    new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    ),
    camera,
  )

  const hit = new THREE.Vector3()
  if (!caster.ray.intersectPlane(FLOOR, hit)) return inFrontOf(camera)
  if (hit.distanceTo(camera.position) > 80) return inFrontOf(camera)
  return { x: hit.x, y: 0, z: hit.z }
}

/**
 * Somebody, or something, to put on the stage.
 *
 * ---------------------------------------------------------------------------
 * Bodies and props, and why the first version had only bodies
 * ---------------------------------------------------------------------------
 * This offered the 25 rigged models and nothing else, on the reasoning that a
 * shot is short of somebody to point the camera at and *"a crate is scenery,
 * and scenery is built in the editor, where the brush is"*. That was true when
 * a movie was your level with a timeline on it. It stopped being true the
 * moment a movie became an **empty stage**: there is no brush here, no level
 * underneath, and a film that can only contain people is one you cannot put a
 * table in.
 *
 * So there are two tabs. **Bodies** is the short list that matters most - the
 * avatar first, because it is the rig the player wears, then the peepz.
 * **Props** is the whole catalogue, by pack, because dressing a set is a
 * different job with a different question: not "who" but "what have I got".
 *
 * ---------------------------------------------------------------------------
 * 3,892 models need a search box, not a longer grid
 * ---------------------------------------------------------------------------
 * The level editor's picker is a full panel and can afford a scroll; this is a
 * 320px column with a cast list above it. So props are filtered by pack *and*
 * by typing, and the grid shows what the filter left - which is the only
 * arrangement where finding a lamp takes one guess rather than a scroll through
 * two hundred walls.
 *
 * ---------------------------------------------------------------------------
 * They arrive in front of the camera, on the floor
 * ---------------------------------------------------------------------------
 * Not at the origin, which in a stage built anywhere else is off screen, and
 * not at the camera's own height, which puts a crate in the air. Where the
 * camera's ray meets the ground, which is where "put it there" points when
 * somebody says it out loud - and a capped distance, because a camera almost
 * level with the floor meets it hundreds of metres away.
 */
function CastPicker({
  document,
  parts,
  onAdd,
  onEmptyAt,
  onBrowse,
}: {
  document: XpDocument
  parts: React.RefObject<CaptureParts | null>
  onAdd: (model: string, at: { x: number; y: number; z: number }) => void
  onEmptyAt: (at: { x: number; y: number; z: number }) => void
  /** Open the full-screen viewer, with somewhere for what it places to land. */
  onBrowse: () => void
}) {
  const t = xpEditorDict(useLocale()).movie
  const [tab, setTab] = useState<'bodies' | 'props' | null>(null)
  const [pack, setPack] = useState<string>(PROP_PACKS[0] ?? 'proto')
  const [hunt, setHunt] = useState('')

  const inFront = () => inFrontOf(parts.current?.camera ?? null)

  /** The packs the document already declares. See the note on the select. */
  const installed = new Set(document.packs.map((one) => one.id))

  const onEmpty = () => onEmptyAt(inFront())

  const wanted = hunt.trim().toLowerCase()
  const props = CATALOGUE.filter(
    (one) =>
      one.packId === pack &&
      !skeletonOf(one.id) &&
      (wanted === '' || one.label.toLowerCase().includes(wanted)),
  ).slice(0, PROPS_SHOWN)

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <Add onClick={() => onAdd(AVATAR, inFront())} title={t.addActorTitle}>
          {t.addActor} · {t.theAvatar}
        </Add>
        {/*
          Something to hang things off.
          
          Beside the bodies rather than in Props, because it is not a model you
          are choosing - it is a *handle*. `Blueprint.draw` was written for this
          and its own note carries the argument: a node is an entity that draws
          nothing, so it gets naming, parenting, selection and a gizmo for free.
        */}
        <Add onClick={onEmpty} title={t.addEmptyTitle}>
          {t.addEmpty}
        </Add>
        {/*
          The pack viewer, up here rather than inside Props.

          It was a text link two clicks in - open the tab, find the link - and
          two clicks in is indistinguishable from absent. It is also not a peer
          of the pack select it sat beside: that select narrows a grid of sixty,
          this one is how you look at all 3,892.
        */}
        <Add onClick={onBrowse} title={t.packsTitle}>
          {t.packs}
        </Add>
        <Chip on={tab === 'bodies'} onClick={() => setTab(tab === 'bodies' ? null : 'bodies')}>
          {t.thePeepz}
        </Chip>
        <Chip on={tab === 'props'} onClick={() => setTab(tab === 'props' ? null : 'props')}>
          {t.theProps}
        </Chip>
      </div>

      {tab === 'bodies' ? (
        <>
          <div className="grid grid-cols-4 gap-1">
            {PEEPZ.map((one) => (
              <Thumb
                key={one.id}
                model={one.id}
                label={one.label}
                onAdd={() => onAdd(one.id, inFront())}
              />
            ))}
          </div>
          <Hint>{t.orDragOne}</Hint>
        </>
      ) : null}

      {tab === 'props' ? (
        <>
          <div className="flex items-center gap-1">
            {/*
              Which packs this document already carries, marked.

              A document declares its packs and the parser refuses one it uses
              without saying so - `packs` is where an export reads the author
              and the licence from, so an undeclared pack is a licence claim
              being wrong rather than a lint. `addBlueprint` adds the pack when
              a model needs it, so nothing here can produce a file that will not
              re-open; what the mark adds is *knowing*, before you pick, which
              of these are already part of the level and which will grow it.
            */}
            <select
              value={pack}
              onChange={(event) => setPack(event.target.value)}
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[10px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
            >
              {PROP_PACKS.map((one) => (
                <option key={one} value={one}>
                  {installed.has(one) ? `● ${one}` : `○ ${one}`}
                </option>
              ))}
            </select>
            <input
              value={hunt}
              onChange={(event) => setHunt(event.target.value)}
              placeholder={t.findAModel}
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[10px] text-neutral-300 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-4 gap-1">
            {props.map((one) => (
              <Thumb
                key={one.id}
                model={one.id}
                label={one.label}
                onAdd={() => onAdd(one.id, inFront())}
              />
            ))}
          </div>

          {/*
            Said rather than silently cut off. A grid that stops at sixty with
            no note is one an author believes is the whole pack, and the model
            they are looking for is the one that did not fit.
          */}
          <Hint>{t.orDragOne}</Hint>

          {props.length >= PROPS_SHOWN ? (
            <Hint>{fill(t.andMore, { n: String(PROPS_SHOWN) })}</Hint>
          ) : null}
          {props.length === 0 ? <Hint>{t.nothingMatches}</Hint> : null}
          {/*
            Said once, under the grid, rather than on every thumbnail: taking a
            model from a pack the level does not carry yet adds the pack, which
            is a change to the document an author should know they are making.
          */}
          {installed.has(pack) ? null : <Hint>{t.willAddPack}</Hint>}
        </>
      ) : null}
    </div>
  )
}

/**
 * One model, as a picture you can press.
 *
 * A thumbnail rather than a name, because a pack is a visual thing and
 * `Wall_Corner_B` is not a description of anything. The name is underneath
 * anyway - at 10px it is a reminder rather than a label, and it is what makes
 * the grid searchable by eye once somebody knows what they are after.
 */
function Thumb({
  model,
  label,
  onAdd,
}: {
  model: string
  label: string
  onAdd: () => void
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      title={label}
      /*
        Click *and* drag, rather than a choice between them. A click puts it in
        the shot, which is what you want when you are filling a stage; a drag
        puts it where you let go, which is what you want when you are dressing
        one. They are the same gesture until you move, so nothing is lost by
        offering both.
      */
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(MODEL_MIME, model)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      className="group/thumb flex cursor-grab flex-col items-center gap-0.5 rounded border border-neutral-800 p-1 transition-colors hover:border-violet-600 active:cursor-grabbing"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a pack thumbnail is
          a static webp in `public`, and Next's loader would put an optimiser in
          front of sixty of them for no gain. */}
      <img
        src={thumbnailUrl(model)}
        alt=""
        loading="lazy"
        className="size-8 object-contain opacity-80 transition-opacity group-hover/thumb:opacity-100"
      />
      <span className="w-full truncate text-center font-mono text-[8px] text-neutral-600">
        {label}
      </span>
    </button>
  )
}

/** How long the shot runs, how fast, and what is behind it. */
function Shot({ timeline, edits }: { timeline: XpTimeline; edits: MovieEdits }) {
  const t = xpEditorDict(useLocale()).movie
  const backdrop = timeline.backdrop

  const labels: Record<BackdropKind, string> = {
    none: t.backdropNone,
    colour: t.backdropColour,
    image: t.backdropImage,
    sky: t.backdropSky,
  }

  return (
    <>
      <Slide
        label={t.length}
        value={timeline.duration}
        min={0.5}
        max={120}
        step={0.5}
        unit="s"
        onChange={(duration) => edits.onSetMovie({ duration })}
      />
      <Slide
        label={t.rate}
        value={timeline.fps}
        min={1}
        max={60}
        step={1}
        onChange={(fps) => edits.onSetMovie({ fps })}
      />

      <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-neutral-600">
        {t.backdrop}
      </span>
      <div className="grid grid-cols-4 gap-1">
        {BACKDROP_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() =>
              edits.onSetMovie({
                backdrop: {
                  kind,
                  // Carried across so switching to `colour` and back does not
                  // lose the picture somebody chose, the way `setCamera` carries
                  // a field only where it still means something.
                  ...(backdrop.colour ? { colour: backdrop.colour } : { colour: '#101018' }),
                  ...(backdrop.image ? { image: backdrop.image } : {}),
                },
              })
            }
            className={`rounded border px-1 py-1 font-mono text-[9px] transition-colors ${
              backdrop.kind === kind
                ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
            }`}
          >
            {labels[kind]}
          </button>
        ))}
      </div>

      {backdrop.kind === 'colour' ? (
        <input
          type="color"
          value={backdrop.colour ?? '#101018'}
          onChange={(event) =>
            edits.onSetMovie({ backdrop: { ...backdrop, colour: event.target.value } })
          }
          className="mt-1.5 h-7 w-full rounded border border-neutral-800 bg-neutral-900"
        />
      ) : null}

      {/*
        Held text, for the reason `Name` gives: `setMovie` refuses a path that
        does not start with `/` and refuses an image backdrop with no picture -
        so typed straight through, the field could not be cleared to retype and
        every character before the slash was rejected and snapped back.
      */}
      {backdrop.kind === 'image' || backdrop.kind === 'sky' ? (
        <Name
          value={backdrop.image ?? ''}
          onChange={(image) => edits.onSetMovie({ backdrop: { ...backdrop, image } })}
          legal={(path) => path.startsWith('/') && path.length > 1}
          placeholder={t.backdropPath}
          className="mt-1.5 w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[10px] text-neutral-300 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
      ) : null}

      {/*
        The one thing about this that has to be said out loud rather than
        discovered: a transparent canvas records as black, silently.
      */}
      {backdrop.kind === 'none' ? <Hint className="mt-1.5">{t.backdropNoneBlurb}</Hint> : null}
    </>
  )
}

/** A frame as a PNG, and a take as a WebM. */
function Export({
  timeline,
  at,
  parts,
  running,
  frame,
  onPlay,
  onPause,
}: {
  timeline: XpTimeline
  at: number
  parts: React.RefObject<CaptureParts | null>
  running: boolean
  frame: FrameId
  onPlay: () => void
  onPause: () => void
}) {
  const t = xpEditorDict(useLocale()).movie
  /*
   * The delivered size is the frame's, not a setting of its own. Two controls
   * for one thing is how a portrait movie comes out letterboxed inside a
   * landscape file - the mask said one thing and the exporter did another.
   */
  const size = frameOf(frame)
  const [recording, setRecording] = useState<{ stop: () => void } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const able = useMemo(() => canRecord(), [])

  /* Named `snap` rather than `frame`, which is the delivered *shape* here. */
  const snap = () => {
    const ready = parts.current
    if (!ready) return
    save(capturePng(ready, size.width, size.height), `frame-${at.toFixed(2)}.png`)
  }

  const start = () => {
    const canvas = parts.current?.gl.domElement
    if (!canvas) return
    setNote(null)
    const take = record(canvas, { ...size, fps: timeline.fps, duration: timeline.duration })
    setRecording({ stop: take.stop })
    onPlay()
    void take.done.then((capture) => {
      setRecording(null)
      onPause()
      save(capture.blob, 'shot.webm')
      const missing = dropped(capture)
      setNote(
        missing > 0
          ? fill(t.droppedFrames, { dropped: String(missing), wanted: String(capture.wanted) })
          : null,
      )
    })
  }

  /**
   * The take ends when playback does, rather than on a timer of its own.
   *
   * Two clocks deciding when a recording stops is how a file comes out a frame
   * short of the shot, or a frame long with a frozen tail - and the one the
   * author is watching is the one that should win.
   */
  useEffect(() => {
    if (recording && !running) recording.stop()
  }, [recording, running])

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={snap}
          title={t.saveFrameTitle}
          className="rounded border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
        >
          {t.saveFrame}
        </button>
        <button
          type="button"
          disabled={!able}
          title={t.recordTitle}
          onClick={() => (recording ? recording.stop() : start())}
          className="rounded border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 transition-colors hover:border-red-600 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {recording ? t.stopRecording : t.record}
        </button>
      </div>

      {able ? null : <Hint className="mt-1.5">{t.cannotRecord}</Hint>}
      {recording ? (
        <p className="mt-1.5 font-mono text-[10px] text-red-300">{t.recording}</p>
      ) : null}
      {note ? <p className="mt-1.5 font-mono text-[10px] text-amber-300">{note}</p> : null}

      <Hint className="mt-2">
        {t.ffmpegHint}
        <code className="mt-1 block break-all text-neutral-500">{FFMPEG_HINT}</code>
      </Hint>
    </>
  )
}
