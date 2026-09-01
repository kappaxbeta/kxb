'use client'

import {
  ArrowBigUp,
  Boxes,
  Camera as CameraIcon,
  EyeOff,
  FolderOpen,
  Footprints,
  Frame,
  Grid3x3,
  Gamepad2,
  ImagePlus,
  MousePointerClick,
  Sun,
  Users,
  type LucideIcon,
  MessageCircle,
  Music,
  Palette,
  PersonStanding,
  RotateCw,
  Smile,
  Sparkles,
  Swords,
  Wind,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Add,
  EmoteSwatch,
  ModelField,
  Num,
  Pad,
  Pick,
  PickCast,
  PickGroups,
  Remove,
  Section,
  Slide,
  Tint,
} from '@/app/ovaloffice/studio/parts'
import { PosePanel } from '@/app/ovaloffice/studio/pose-panel'
import type { BlueprintChoice } from '@/app/ovaloffice/studio/scene-stage'
import type { RigHandle } from '@/app/ovaloffice/animator/posing'
import type { Pose } from '@/domain/animator/clip'
import {
  type NodeRef,
  type Selected,
  sameNode,
  writeTracks,
} from '@/app/ovaloffice/studio/timeline'
import { EmoteGrid } from '@/app/world/_hud/emote-grid'
import { parseAnyDoc } from '@/domain/animator/clip'
import { TERRAIN_BLOCKS } from '@/domain/lounge/palette'
import { FORMATS } from '@/domain/studio/formats'
import { framingFor } from '@/domain/scenes/world-import'
import {
  type ImportableWorld,
  importNote,
  WorldPicker,
} from '@/app/ovaloffice/studio/world-picker'
import {
  type Action,
  ACTION_KINDS,
  ACTION_META,
  type ActionKind,
  jumpLength,
  MAX_LINE,
  newAction,
  ordered,
  talkDuration,
} from '@/domain/studio/action'
import {
  ANIMATABLE,
  type Animatable,
  animatable,
  dropKey,
  EASES,
  type Ease,
  type Key,
  keyedProperties,
  type NodeKind,
  putTrackKey,
  sampleTracks,
  type Tracks,
  at,
} from '@/domain/studio/keys'
import { DEFAULT_LIGHT, lookLabel, lookShotUrl } from '@/domain/studio/scene'
import { atStart, placeActor, turnActor } from '@/domain/studio/staging'
import {
  type Actor,
  BACKDROP_IMAGE,
  DEFAULT_ACTOR,
  DEFAULT_SHOT,
  sceneAt,
  type ShotSpec,
} from '@/domain/studio/shot'

/**
 * The panel beside the timeline.
 *
 * Two halves. The top is the shot itself - size, length, backdrop, whether the
 * cast is audible - and is always there. The bottom is an inspector for
 * whatever the timeline has selected, and is the only place a value other than
 * a time is edited.
 *
 * ---------------------------------------------------------------------------
 * Why an inspector rather than a panel of everything
 * ---------------------------------------------------------------------------
 * The old version listed every peep, every waypoint, every jump and every emote
 * at once, and it worked while a shot was three peeps doing one thing each. A
 * vocabulary of nine verbs over a cast of twenty-four is several hundred inputs
 * in a column, and the one you want is always past the fold.
 *
 * Selection is what a timeline is *for*: you point at the thing you can see and
 * the controls follow. So this panel holds no selection state of its own - the
 * timeline owns it, this reads it - and stays a pure function of the document
 * exactly as `SceneControls` is.
 */
export function ShotControls({
  shot,
  onChange,
  time,
  onSeek,
  selected,
  onSelect,
  onDrive,
  posing: posingIndex,
  onPosing,
  poseRig,
  localImage = null,
  onLocalImage,
  worlds = [],
  blueprints = [],
}: {
  shot: ShotSpec
  onChange: (next: ShotSpec) => void
  /** Where the playhead is, so the add buttons know where "here" is. */
  time: number
  onSeek: (t: number) => void
  selected: Selected | null
  onSelect: (selection: Selected) => void
  /** Hands an actor to the keyboard. Absent where performing is not offered. */
  onDrive?: (index: number) => void
  /** Which cast member has handles on it in the viewport, or null. */
  posing?: number | null
  /** Turning posing on for one of them, or off with null. */
  onPosing?: (index: number | null) => void
  /** The live rig of the posed body, and which bone the panel is showing. */
  poseRig?: PoseRig
  /** A picture chosen from this machine, held by the editor and never saved. */
  localImage?: { url: string; name: string } | null
  onLocalImage?: (picture: { url: string; name: string } | null) => void
  /** Worlds that can be pulled in as a set. Empty is simply no picker. */
  worlds?: ImportableWorld[]
  /** The space's shelf, for props that are things. Empty in the backoffice. */
  blueprints?: BlueprintChoice[]
}) {
  const patch = (fields: Partial<ShotSpec>) => onChange({ ...shot, ...fields })

  /**
   * The inspector, brought into view when the selection changes.
   *
   * Picking a body in the scene chooses what this panel edits, and the panel is
   * a long column - on a phone, where it sits under the viewport, the controls
   * for what you just tapped were reliably a screen and a half away. So the
   * selection scrolls its own editor into view: same gesture, same place to
   * look. `nearest` rather than `center`, so a selection made while the
   * inspector is already on screen does not jerk the page to re-centre it.
   *
   * Keyed on the node rather than on the whole selection, because choosing a
   * different *action* on the same body is a move within the panel you are
   * already reading.
   */
  const inspector = useRef<HTMLDivElement>(null)
  const node = selected?.node
  const at = node ? `${node.kind}:${node.index}` : null
  useEffect(() => {
    if (!at) return
    inspector.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [at])

  return (
    <div className="flex flex-col gap-2">
      <Output
        shot={shot}
        patch={patch}
        localImage={localImage}
        onLocalImage={onLocalImage}
      />
      <div ref={inspector} className="scroll-mt-2">
      <Inspector
        shot={shot}
        onChange={onChange}
        time={time}
        onSeek={onSeek}
        selected={selected}
        onSelect={onSelect}
        onDrive={onDrive}
        posing={posingIndex}
        onPosing={onPosing}
        poseRig={poseRig}
      />
      </div>
      <Cast shot={shot} patch={patch} selected={selected} onSelect={onSelect} />
      <Props
        shot={shot}
        patch={patch}
        selected={selected}
        onSelect={onSelect}
        blueprints={blueprints}
      />
      <Ground shot={shot} patch={patch} />
      {worlds.length > 0 && (
        <WorldPicker
          worlds={worlds}
          current={shot.set?.worldId ?? null}
          onPick={(worldId, blocks, counts) => {
            /*
             * The one place a shot differs from a still.
             *
             * A still has one framing and re-aiming it is obviously right. A
             * shot has a *list* of them, and rewriting a camera move somebody
             * authored because they imported a set is losing work to a
             * convenience. So the camera is only re-framed when there is
             * nothing to lose - a single locked-off key - and otherwise it is
             * left alone and the note says so, because a set that lands
             * off-camera otherwise reads as an import that did nothing.
             */
            const framed = shot.camera.length === 1
            patch({
              set: { worldId },
              // The studio's grass island goes with it: a world brings its own
              // floor, and the two together is a lawn hovering in a town square.
              ground: null,
              ...(framed
                ? { camera: [{ ...shot.camera[0], ...framingFor(blocks) }] }
                : {}),
            })
            return framed
              ? importNote(blocks.length, counts)
              : `${importNote(blocks.length, counts)} — camera left alone, you have ${shot.camera.length} framings`
          }}
          onClear={() => patch({ set: null, ground: DEFAULT_SHOT.ground })}
        />
      )}
      {/* Under the set, because the commonest thing to turn to glass is the
          world that was just imported. */}
      <RainbowSection shot={shot} patch={patch} />
    </div>
  )
}

type Patch = (fields: Partial<ShotSpec>) => void

/**
 * What the panel needs to drive the body the viewport is drawing.
 *
 * The rig is the editor's, not this panel's: it comes from the stage, because
 * the stage is what drew the body. All the panel does with it is read angles
 * off it and write angles back - the same two things a handle does.
 */
export interface PoseRig {
  rig: RigHandle | null
  bone: string | null
  onBone: (bone: string) => void
  onPose: (pose: Pose) => void
}

/**
 * The world as rainbow glass, over the length of a shot.
 *
 * The still editor's section with one field swapped, and the swap is the whole
 * difference between a photograph and a video: a still picks the instant of the
 * sweep it wants, and a shot picks the *rate* and lets the playhead supply the
 * instant. That is why this is a track rather than a value - see `rainbowAt` -
 * and it is what makes an export reproducible: recorded twice, the same file
 * twice.
 */
function RainbowSection({ shot, patch }: { shot: ShotSpec; patch: Patch }) {
  const rainbow = shot.rainbow
  const set = (fields: Partial<typeof rainbow>) =>
    patch({ rainbow: { ...rainbow, ...fields } })
  const on = rainbow.world || rainbow.props

  return (
    <Section
      title="Rainbow"
      summary={on ? [rainbow.world && 'world', rainbow.props && 'props'].filter(Boolean).join(' + ') : 'off'}
      icon={Sparkles}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rainbow.world}
          onChange={(event) => set({ world: event.target.checked })}
        />
        Blocks and ground
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rainbow.props}
          onChange={(event) => set({ props: event.target.checked })}
        />
        Furniture too
      </label>
      {on && (
        <>
          <Slide
            label="Sweep speed"
            value={rainbow.speed}
            min={0}
            max={4}
            step={0.05}
            unit="×"
            onChange={(speed) => set({ speed })}
          />
          {/* Visible because a still lifted into a shot arrives with one set:
              it is the moment that still was composed at, and a value the
              document carries but the panel hides is one nobody can undo. */}
          <Slide
            label="Starts at"
            value={rainbow.start}
            min={0}
            max={20}
            step={0.05}
            unit="s"
            onChange={(start) => set({ start })}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            One is the speed the lounge sweeps at. Zero freezes the colours
            where they start, which is a perfectly good shot. The animals stay
            themselves at every setting.
          </p>
        </>
      )}
    </Section>
  )
}

/**
 * The same node without one optional field.
 *
 * Deleting rather than setting `undefined`, because this document is compared
 * by its encoding: a prop that has been a blueprint and been set back to a
 * plain model has to encode exactly as one that never was, or the address bar
 * changes for a change nobody made.
 */
function without<T extends object, K extends keyof T>(node: T, key: K): Omit<T, K> {
  const copy = { ...node }
  delete copy[key]
  return copy
}

/**
 * What a chosen thing will actually do in the shot, in a sentence.
 *
 * A blueprint's deeds are a list of pairs somebody set on another page, and the
 * question here is narrower than that page's: of the things this can do, which
 * will happen in a recording where nobody is standing? Answering it in the
 * panel is what stops the checkbox above being a switch you flip to see what
 * happens.
 */
function whatItDoes(choice: BlueprintChoice | undefined, triggered: boolean): string {
  if (!choice) return 'That thing is not on this shelf any more — the prop draws its model instead.'

  const running = (choice.spec.actions ?? []).filter(
    (action) => action.when === 'always' || triggered,
  )
  const waiting = (choice.spec.actions ?? []).filter((action) => action.when !== 'always')

  if (running.length === 0) {
    return waiting.length > 0
      ? `It only acts when touched or used. Tick the box and it will ${list(waiting.map((a) => a.deed))} for the whole shot.`
      : 'It stands still — this one has nothing it does on its own.'
  }
  return `It will ${list(running.map((action) => action.deed))}.`
}

/** `a`, `a and b`, `a, b and c`. */
function list(words: string[]): string {
  const seen = [...new Set(words)]
  if (seen.length <= 1) return seen[0] ?? 'do nothing'
  return `${seen.slice(0, -1).join(', ')} and ${seen[seen.length - 1]}`
}

/**
 * The floor, including having none.
 *
 * The still studio has had this since it had a floor; the video studio never
 * did, so a shot inherited whatever ground the still it was lifted from
 * carried and there was no way to take it off. Asked for as opening on an
 * empty ground in the video editor.
 *
 * Off is a real answer, not an empty size: `null` rather than a nought-by-
 * nought patch, so "there is no floor" and "there is a floor of no size" stay
 * different things - the first is what you want when a world is standing in as
 * the set, or when the shot is a body against a flat backdrop.
 */
function Ground({ shot, patch }: { shot: ShotSpec; patch: Patch }) {
  const ground = shot.ground

  return (
    <Section
      title="Ground"
      summary={ground ? `${ground.cols} × ${ground.rows}` : 'empty'}
      icon={Grid3x3}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ground !== null}
          onChange={(event) =>
            patch({
              ground: event.target.checked
                ? (DEFAULT_SHOT.ground ?? { cols: 13, rows: 11, top: 'dirt_with_grass', rounded: true })
                : null,
            })
          }
        />
        Lay a floor
      </label>
      {ground ? (
        <>
          <Slide
            label="Across"
            value={ground.cols}
            min={1}
            max={41}
            step={2}
            onChange={(cols) => patch({ ground: { ...ground, cols } })}
          />
          <Slide
            label="Deep"
            value={ground.rows}
            min={1}
            max={41}
            step={2}
            onChange={(rows) => patch({ ground: { ...ground, rows } })}
          />
          <Pick
            label="Top layer"
            value={ground.top}
            options={TERRAIN_BLOCKS}
            onChange={(top) => patch({ ground: { ...ground, top } })}
          />
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ground.rounded}
              onChange={(event) => patch({ ground: { ...ground, rounded: event.target.checked } })}
            />
            Nibble the corners
          </label>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nothing underfoot. What is behind the cast is the backdrop above —
          or a world, if one is standing in as the set.
        </p>
      )}
    </Section>
  )
}

/**
 * The verbs' icons, resolved from the names in `ACTION_META`.
 *
 * A map here rather than components in the domain module, so nothing the
 * sampler or the tests import pulls in an icon set. Missing names fall back to
 * the label alone rather than to a broken render.
 */
const ICONS: Record<string, LucideIcon> = {
  ArrowBigUp,
  EyeOff,
  Footprints,
  MessageCircle,
  Music,
  PersonStanding,
  RotateCw,
  Smile,
  Sparkles,
  Swords,
  Wind,
  Zap,
}

function ActionIcon({ kind, className }: { kind: ActionKind; className?: string }) {
  const Icon = ICONS[ACTION_META[kind].icon]
  return Icon ? <Icon className={className ?? 'size-3.5'} aria-hidden /> : null
}

// ---------------------------------------------------------------------------

function Output({
  shot,
  patch,
  localImage = null,
  onLocalImage,
}: {
  shot: ShotSpec
  patch: Patch
  localImage?: { url: string; name: string } | null
  onLocalImage?: (picture: { url: string; name: string } | null) => void
}) {
  return (
    <Section
      title="Output"
      summary={`${shot.width}×${shot.height} · ${shot.fps}fps`}
      icon={Frame}
      open
    >
      <div className="grid grid-cols-2 gap-2">
        <Num label="Width" value={shot.width} min={64} max={4096} step={10} onChange={(width) => patch({ width })} />
        <Num label="Height" value={shot.height} min={64} max={4096} step={10} onChange={(height) => patch({ height })} />
      </div>
      {/* Named after where it is going rather than after its ratio - see
          `@/domain/studio/formats`. The one that is on lights up, because
          "which of these am I already" is the question a row of buttons
          otherwise refuses to answer. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FORMATS.map((format) => {
          const on = shot.width === format.width && shot.height === format.height
          return (
            <button
              key={format.label}
              type="button"
              title={format.hint}
              onClick={() => patch({ width: format.width, height: format.height })}
              className={`rounded-lg border px-2 py-1 text-xs transition ${
                on
                  ? 'border-accent text-ink'
                  : 'border-line/60 text-ink-muted hover:border-accent/60 hover:text-ink'
              }`}
            >
              {format.label}
            </button>
          )
        })}
      </div>
      <Slide label="Length" value={shot.duration} min={1} max={60} step={0.5} unit="s" onChange={(duration) => patch({ duration })} />
      {/* Thirty rather than sixty by default: it halves what the recorder has
          to keep up with, and nothing in a shot like this moves fast enough to
          show the difference. */}
      <Slide label="Frame rate" value={shot.fps} min={12} max={60} step={1} onChange={(fps) => patch({ fps })} />
      <label className="mt-1 flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 text-muted-foreground">Backdrop</span>
        <input
          type="color"
          value={shot.background.colour}
          onChange={(event) =>
            patch({ background: { ...shot.background, colour: event.target.value } })
          }
          className="h-7 w-14 cursor-pointer rounded border border-border bg-transparent"
        />
        <span className="font-mono text-xs text-muted-foreground">{shot.background.colour}</span>
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => patch({ background: { ...shot.background, image: null } })}
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition ${
            shot.background.image === null
              ? 'border-accent text-foreground'
              : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          <Palette className="size-3.5" aria-hidden />
          Flat
        </button>
        <button
          type="button"
          onClick={() => patch({ background: { ...shot.background, image: BACKDROP_IMAGE } })}
          title={BACKDROP_IMAGE}
          className={`h-8 w-14 overflow-hidden rounded-lg border bg-cover bg-center transition ${
            shot.background.image === BACKDROP_IMAGE
              ? 'border-accent'
              : 'border-border hover:border-accent/60'
          }`}
          style={{ backgroundImage: `url(${BACKDROP_IMAGE})` }}
        >
          <span className="sr-only">Use the app backdrop</span>
        </button>
      </div>
      {/*
        A picture off this machine, for the length of this tab.

        Separate from the two buttons above, and the label says why: those set
        a field on the document, which travels in the link and is stored when
        the shot is saved. This one is held by the editor, drawn behind the
        scene and recorded into the export - and then it is gone. A file the
        browser reads locally is same-origin, so unlike an image from another
        site it does not taint the canvas and the recording still works.
      */}
      {onLocalImage && (
        <div className="mt-1 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground">
              <ImagePlus className="size-3.5" aria-hidden />
              {localImage ? 'Change picture' : 'Use a picture from this device'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onLocalImage({ url: URL.createObjectURL(file), name: file.name })
                  event.target.value = ''
                }}
              />
            </label>
            {localImage && (
              <button
                type="button"
                onClick={() => onLocalImage(null)}
                className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          {localImage && (
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {localImage.name}
            </p>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Video has no transparency — unlike a still, a shot is composited over
        this. A picture from this device stays in this tab: it records into the
        file, and it is not uploaded, not in the link, and gone on reload. The
        app backdrop above is the one that travels with a saved shot.
      </p>
      <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={shot.voice}
          onChange={(event) => patch({ voice: event.target.checked })}
          className="accent-accent"
        />
        Let them be heard
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Every line gets a little synthesised voice, pitched by animal, recorded
        into the file. Off leaves the bubbles and the silence.
      </p>
      <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={shot.ease}
          onChange={(event) => patch({ ease: event.target.checked })}
          className="accent-accent"
        />
        Camera settles on each key
      </label>
    </Section>
  )
}

// ---------------------------------------------------------------------------

function Cast({
  shot,
  patch,
  selected,
  onSelect,
}: {
  shot: ShotSpec
  patch: Patch
  selected: Selected | null
  onSelect: (selection: Selected) => void
}) {
  return (
    <Section title="Cast" summary={`${shot.cast.length}`} icon={Users} open>
      {shot.cast.map((actor, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelect({ node: { kind: 'peep', index }, action: null })}
          className={`flex items-center gap-2.5 rounded-xl border px-2 py-1.5 text-left text-xs transition ${
            selected && sameNode(selected.node, { kind: 'peep', index })
              ? 'border-accent/60 bg-surface-raised/60 text-ink'
              : 'border-line/40 text-ink-muted hover:border-line'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lookShotUrl(actor.avatar)}
            alt=""
            className="size-7 shrink-0 rounded-lg border border-line/40 object-contain"
          />
          <span className="flex-1 truncate capitalize">{actor.name || lookLabel(actor.avatar)}</span>
          <span className="font-mono opacity-60">{actor.actions.length}</span>
        </button>
      ))}
      <Add
        label="Add peep"
        disabled={shot.cast.length >= 24}
        onClick={() => {
          patch({ cast: [...shot.cast, { ...DEFAULT_ACTOR }] })
          onSelect({ node: { kind: 'peep', index: shot.cast.length }, action: null })
        }}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Ground, blocks and goals are composed in the still studio and lifted from
        there — they do not move on their own, so they have no editor here. What
        they can do is carry keyframes: select one in the timeline.
      </p>
    </Section>
  )
}

/**
 * Blocks, addable here rather than only inherited.
 *
 * They used to arrive one way only: compose a still, lift it, and the blocks
 * came with it. That was right while a block was scenery - it does not move, so
 * the studio that arranges things that do not move is where it belongs.
 *
 * It stopped being right when blocks became keyframeable. A rock that wobbles
 * when somebody kicks it is a *performer*, and having to leave the video studio,
 * add it in the picture studio and lift the whole scene back - losing the
 * timeline on the way - is not a workflow anybody would sit through.
 *
 * So a block can be added here, and everything about animating it is the same
 * generic key machinery every other node uses: select it in the timeline, key
 * `x`, `top`, `z` or `rotation`.
 */
function Props({
  shot,
  patch,
  selected,
  onSelect,
  blueprints = [],
}: {
  shot: ShotSpec
  patch: Patch
  selected: Selected | null
  onSelect: (selection: Selected) => void
  /** The space's shelf. Empty in the backoffice, which has none. */
  blueprints?: BlueprintChoice[]
}) {
  const [model, setModel] = useState('stone')

  return (
    <Section title="Props" summary={`${shot.blocks.length}`} icon={Boxes} open>
      {shot.blocks.map((block, index) => {
        const isSelected = Boolean(selected && sameNode(selected.node, { kind: 'block', index }))
        return (
          <div key={index} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onSelect({ node: { kind: 'block', index }, action: null })}
              className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-xs transition ${
                isSelected
                  ? 'border-accent/60 bg-surface-raised/60 text-ink'
                  : 'border-line/40 text-ink-muted hover:border-line'
              }`}
            >
              <Boxes className="size-3.5 shrink-0" aria-hidden />
              <span className="flex-1 truncate">
                {(block.blueprint &&
                  blueprints.find((one) => one.id === block.blueprint)?.name) ||
                  block.model}
              </span>
              <span className="font-mono opacity-60">
                {keyedProperties(block.tracks).length > 0
                  ? `${keyedProperties(block.tracks).length} keyed`
                  : ''}
              </span>
            </button>
            {/*
              What this prop *is*, changeable after the fact.

              The picker below the Add button chooses what the next prop will
              be, and for a long time that was the only one here - so a prop
              added as a stone was a stone forever, and the way to get a galaxy
              was to delete it and add another. Which is not what a picker
              sitting in the panel looks like it does. Shown only for the
              selected prop, because ten always-open selects is a panel nobody
              can find the timeline under.
            */}
            {isSelected && (
              <div className="flex flex-col gap-1 pl-2">
                <PickGroups
                  label="Is a"
                  value={block.model}
                  onChange={(model) =>
                    patch({
                      blocks: shot.blocks.map((one, i) => (i === index ? { ...one, model } : one)),
                    })
                  }
                />
                {/*
                  Or typed, for the rest of the catalogue.

                  The select above offers the palette and a couple of packs on
                  purpose - fourteen hundred options is a control nobody can
                  find anything in - but "we ship it and you cannot pick it" is
                  the wrong end of that trade to land on. So the id is also a
                  field: `cosmos/galaxy`, `park/fountain`, anything
                  `isBuildable` says yes to. A name that is not one is left in
                  the box rather than thrown away mid-word, and simply does not
                  draw until it is finished - the same promise the model field
                  makes everywhere else in this product.
                */}
                <ModelField
                  value={block.model}
                  onChange={(model) =>
                    patch({
                      blocks: shot.blocks.map((one, i) => (i === index ? { ...one, model } : one)),
                    })
                  }
                />

                {/*
                  Or a whole thing off the shelf, rather than one model.

                  Only where there is a shelf: in the backoffice this list is
                  empty and the control does not appear, because the backoffice
                  is not a space and has no blueprints to offer. A blueprint
                  brings its parts, its own scale and whatever it does with
                  itself - see `BlueprintProp` - so picking one supersedes the
                  model above rather than sitting beside it. "None" gives the
                  model back.
                */}
                {blueprints.length > 0 && (
                  <>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Or a thing
                      <select
                        value={block.blueprint ?? ''}
                        onChange={(event) => {
                          const id = event.target.value
                          patch({
                            blocks: shot.blocks.map((one, i) =>
                              i === index
                                ? id
                                  ? { ...one, blueprint: id }
                                  : // Dropped rather than set to undefined, so a
                                    // prop that is a plain model again encodes
                                    // exactly as one that never was.
                                    without(one, 'blueprint')
                                : one,
                            ),
                          })
                        }}
                        className="rounded-lg border border-border bg-secondary px-2 py-1 text-sm text-foreground"
                      >
                        <option value="">None — just the model</option>
                        {blueprints.map((one) => (
                          <option key={one.id} value={one.id}>
                            {one.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {block.blueprint && (
                      <>
                        {/*
                          A thing says when it acts, and a shot has nobody to
                          do the acting. This is the author standing in for
                          them - see `BlockSpec.triggered`.
                        */}
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={block.triggered ?? false}
                            onChange={(event) =>
                              patch({
                                blocks: shot.blocks.map((one, i) =>
                                  i === index
                                    ? event.target.checked
                                      ? { ...one, triggered: true }
                                      : without(one, 'triggered')
                                    : one,
                                ),
                              })
                            }
                            className="accent-accent"
                          />
                          Act as if somebody touched it
                        </label>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {whatItDoes(blueprints.find((one) => one.id === block.blueprint), block.triggered ?? false)}
                        </p>
                      </>
                    )}
                  </>
                )}
                <Slide
                  label="Pitch"
                  value={block.pitch}
                  min={-180}
                  max={180}
                  step={5}
                  unit="°"
                  onChange={(pitch) =>
                    patch({
                      blocks: shot.blocks.map((one, i) => (i === index ? { ...one, pitch } : one)),
                    })
                  }
                />
                <Slide
                  label="Roll"
                  value={block.roll}
                  min={-180}
                  max={180}
                  step={5}
                  unit="°"
                  onChange={(roll) =>
                    patch({
                      blocks: shot.blocks.map((one, i) => (i === index ? { ...one, roll } : one)),
                    })
                  }
                />
                <Slide
                  label="Size"
                  value={block.scale}
                  min={0.1}
                  max={12}
                  step={0.05}
                  onChange={(scale) =>
                    patch({
                      blocks: shot.blocks.map((one, i) => (i === index ? { ...one, scale } : one)),
                    })
                  }
                />
                <Tint
                  value={block.tint}
                  onChange={(tint) =>
                    patch({
                      blocks: shot.blocks.map((one, i) => (i === index ? { ...one, tint } : one)),
                    })
                  }
                />
                {/*
                  And a way back out.

                  The section has had an Add since it existed and never a
                  Remove, so a prop dropped in by a misclick was in the shot for
                  good - the only way out was the link, by hand. Selection is
                  moved to the camera first: an index into a list that is about
                  to be one shorter points at a different prop a frame later,
                  and at nothing at all when the one removed was the last.
                */}
                <Remove
                  onClick={() => {
                    onSelect({ node: { kind: 'camera', index: 0 }, action: null })
                    patch({ blocks: shot.blocks.filter((_, i) => i !== index) })
                  }}
                >
                  Remove prop
                </Remove>
              </div>
            )}
          </div>
        )
      })}

      <PickGroups label="Add" value={model} onChange={setModel} />
      <Add
        label="Add a prop"
        disabled={shot.blocks.length >= 120}
        onClick={() => {
          // At the origin, on the floor. Somewhere visible beats somewhere
          // clever: the first thing anybody does is drag it, and a prop that
          // lands off-camera reads as a button that did nothing.
          patch({
            blocks: [...shot.blocks, { model, x: 0, top: 1, z: 0, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} }],
          })
          onSelect({ node: { kind: 'block', index: shot.blocks.length }, action: null })
        }}
      />
      {shot.blocks.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Select one to move it, or key its height and turn to make it wobble.
        </p>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// The inspector
// ---------------------------------------------------------------------------

function Inspector({
  shot,
  onChange,
  time,
  onSeek,
  selected,
  onSelect,
  onDrive,
  posing: posingIndex,
  onPosing,
  poseRig,
}: {
  shot: ShotSpec
  onChange: (next: ShotSpec) => void
  time: number
  onSeek: (t: number) => void
  selected: Selected | null
  onSelect: (selection: Selected) => void
  onDrive?: (index: number) => void
  /** Which cast member has handles on it in the viewport, or null. */
  posing?: number | null
  /** Turning posing on for one of them, or off with null. */
  onPosing?: (index: number | null) => void
  /** The live rig of the posed body, and which bone the panel is showing. */
  poseRig?: PoseRig
}) {
  if (!selected) {
    return (
      <Section title="Selected" summary="nothing" icon={MousePointerClick} open>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Pick a row or a clip in the timeline. Times are dragged there; every
          other value is edited here.
        </p>
      </Section>
    )
  }

  const { node } = selected

  if (node.kind === 'camera') {
    return <CameraInspector shot={shot} onChange={onChange} onSeek={onSeek} selected={selected} />
  }

  if (node.kind === 'peep') {
    const actor = shot.cast[node.index]
    if (!actor) return null
    return (
      <ActorInspector
        shot={shot}
        onChange={onChange}
        time={time}
        onSeek={onSeek}
        selected={selected}
        onSelect={onSelect}
        actor={actor}
        index={node.index}
        onDrive={onDrive}
        posing={posingIndex}
        onPosing={onPosing}
        poseRig={poseRig}
      />
    )
  }

  return <NodeInspector shot={shot} onChange={onChange} time={time} node={node} />
}

// ---------------------------------------------------------------------------

function ActorInspector({
  shot,
  onChange,
  time,
  onSeek,
  selected,
  onSelect,
  actor,
  index,
  onDrive,
  posing: posingIndex,
  onPosing,
  poseRig,
}: {
  shot: ShotSpec
  onChange: (next: ShotSpec) => void
  time: number
  onSeek: (t: number) => void
  selected: Selected
  onSelect: (selection: Selected) => void
  actor: Actor
  index: number
  onDrive?: (index: number) => void
  /** Which cast member has handles on it in the viewport, or null. */
  posing?: number | null
  /** Turning posing on for one of them, or off with null. */
  onPosing?: (index: number | null) => void
  /** The live rig of the posed body, and which bone the panel is showing. */
  poseRig?: PoseRig
}) {
  const set = (fields: Partial<Actor>) =>
    onChange({
      ...shot,
      cast: shot.cast.map((existing, i) => (i === index ? { ...existing, ...fields } : existing)),
    })

  /** Whether *this* actor is the one with handles on it. */
  const posing = posingIndex === index

  /** Where they are right now, so a new action starts from there. */
  const here = sceneAt(shot, time).peeps[index] ?? { x: actor.x, z: actor.z, rotation: actor.rotation }

  /**
   * Whether an edit here lands on the playhead or on the start pose.
   *
   * The single question the position controls below branch on. `atStart` rather
   * than `time === 0` because the playhead is a float off a scrubber and lands
   * on 0.004 as readily as on nought.
   */
  const staging = !atStart(time)

  /** Put them here, as of now. See `placeActor` for what "as of now" costs. */
  const stage = (spot: { x?: number; z?: number }) =>
    onChange({
      ...shot,
      cast: shot.cast.map((existing, i) =>
        i === index ? placeActor(existing, time, spot, here) : existing,
      ),
    })

  const add = (kind: ActionKind) => {
    const action = newAction(kind, at(time), {
      x: Math.round(here.x * 10) / 10,
      z: Math.round(here.z * 10) / 10,
      rotation: Math.round(here.rotation),
    })
    const actions = ordered([...actor.actions, action])
    set({ actions })
    onSelect({ node: selected.node, action: actions.indexOf(action) })
  }


  /** Whatever the last clip load said, good or bad. */
  const [clipNote, setClipNote] = useState<string | null>(null)

  const chosen = selected.action === null ? null : actor.actions[selected.action]

  return (
    <Section
      title={actor.name || lookLabel(actor.avatar)}
      summary={`${actor.actions.length} actions`}
      icon={Users}
      open
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Name
        <input
          value={actor.name}
          placeholder={actor.avatar}
          maxLength={24}
          onChange={(event) => set({ name: event.target.value })}
          className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-foreground"
        />
      </label>
      <PickCast label="Body" value={actor.avatar} onChange={(avatar) => set({ avatar })} />

      {/*
        Where they are *now*, which at the top of the shot is where they start.

        The heading changes with the playhead because the control does: scrubbed
        away from zero, dragging the pad writes a walk that lands on this instant
        rather than shifting the pose the whole performance is measured from. See
        `placeActor` - the panel used to silently do the second thing, so moving
        somebody into frame at four seconds moved them at nought seconds too and
        the shot you were composing came apart behind you.
      */}
      <p className="mt-2 text-xs font-medium text-foreground">
        {staging ? `At ${time.toFixed(2)}s` : 'Starts at'}
      </p>
      <div className="flex items-end gap-2">
        <Pad
          // The live pose, not the start pose. At the top they are the same
          // thing; anywhere else, showing the start would put the knob and the
          // numbers somewhere the animal on screen visibly is not.
          x={staging ? here.x : actor.x}
          z={staging ? here.z : actor.z}
          min={-40}
          max={40}
          onChange={(x, z) => stage({ x, z })}
        />
      <div className="flex min-w-0 flex-1 items-end gap-1.5">
        <Num label="X" value={staging ? here.x : actor.x} min={-40} max={40} step={0.1} onChange={(x) => stage({ x })} />
        {/* Off the floor from the top of the shot - standing on a crate, or
            hanging in the air. A jump is added to this rather than replacing
            it, so a peep on a block can still hop off it.

            Not staged, and deliberately: height over time is a *keyed* property
            rather than an action - there is no "walk upwards" - so the honest
            place for it is the Y track in the timeline. Writing a fake one here
            would put two mechanisms on one number. */}
        <Num label="Y" value={actor.y} min={-8} max={24} step={0.1} onChange={(y) => set({ y })} />
        <Num label="Z" value={staging ? here.z : actor.z} min={-40} max={40} step={0.1} onChange={(z) => stage({ z })} />
      </div>
      </div>
      {staging && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Moving them here writes a walk that arrives at {time.toFixed(2)}s. Scrub
          to the start to change where they begin.
        </p>
      )}
      <Slide
        label="Facing"
        value={staging ? here.rotation : actor.rotation}
        min={-180}
        max={180}
        step={1}
        unit="°"
        onChange={(rotation) =>
          onChange({
            ...shot,
            cast: shot.cast.map((existing, i) =>
              i === index ? turnActor(existing, time, rotation) : existing,
            ),
          })
        }
      />
      {/* One is the size the animal is in the lounge, which is what every shot
          composed before this existed is still drawn at. */}
      <Slide label="Size" value={actor.scale} min={0.2} max={3} step={0.05} onChange={(scale) => set({ scale })} />
      <Slide label="Stride" value={actor.stride} min={0.4} max={4} step={0.05} onChange={(stride) => set({ stride })} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Blocks covered per second of walk cycle. Turn it up if the feet skate,
        down if they scurry.
      </p>
      {/* Party mode, for one animal.
          A mode rather than a colour, because a rainbow is a *behaviour* - the
          hue is a function of the playhead, so it survives a recording. */}
      <p className="mt-2 text-xs font-medium text-foreground">Glow</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['off', 'colour', 'rainbow'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => set({ glow: { ...actor.glow, mode } })}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs capitalize transition ${
              actor.glow.mode === mode
                ? 'border-accent text-ink'
                : 'border-line/60 text-ink-muted hover:border-accent/60 hover:text-ink'
            }`}
          >
            {mode === 'rainbow' && <Sparkles className="size-3.5" aria-hidden />}
            {mode}
          </button>
        ))}
        {actor.glow.mode === 'colour' && (
          <input
            type="color"
            value={actor.glow.colour}
            onChange={(event) => set({ glow: { ...actor.glow, colour: event.target.value } })}
            className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
          />
        )}
      </div>
      {actor.glow.mode !== 'off' && (
        <>
          <Slide
            label="Glow"
            value={actor.glow.strength}
            min={0}
            max={3}
            step={0.05}
            onChange={(strength) => set({ glow: { ...actor.glow, strength } })}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={actor.glow.sparkle}
              onChange={(event) => set({ glow: { ...actor.glow, sparkle: event.target.checked } })}
              className="accent-accent"
            />
            Dust in the light
          </label>
        </>
      )}

      <Slide label="Bubble up" value={actor.emoteHeight} min={0} max={8} step={0.05} onChange={(emoteHeight) => set({ emoteHeight })} />
      <Slide label="Bubble size" value={actor.emoteSize} min={0.3} max={2.5} step={0.05} onChange={(emoteSize) => set({ emoteSize })} />

      {/* --- what they do ------------------------------------------------- */}
      {/* The way in to performing, next to the animal it performs. The button
          under the viewport is the other one, and it only shows once something
          is selected - which is a fine rule and a terrible way to find out the
          feature exists. */}
      {onDrive && (
        <button
          type="button"
          onClick={() => onDrive(index)}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-accent/60 px-2 py-2.5 text-sm text-foreground transition hover:bg-secondary"
        >
          <Gamepad2 className="size-4" aria-hidden />
          Control &amp; record
        </button>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Drive them around with WASD while the clock runs; jumps, emotes and
        lines land at the moment you press them. Stopping turns the whole take
        into clips on the timeline.
      </p>

      <p className="mt-3 text-xs font-medium text-foreground">Do something at {time.toFixed(1)}s</p>
      <div className="flex flex-wrap gap-1.5">
        {ACTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={actor.actions.length >= 64}
            onClick={() => add(kind)}
            className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition hover:border-accent/60 hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <ActionIcon kind={kind} />
            {ACTION_META[kind].label}
          </button>
        ))}
      </div>

      {/* The skeleton, posed where it stands. This is where the clip a Pose
          action plays comes from, so the two sit together. */}
      <button
        type="button"
        onClick={() => onPosing?.(posing ? null : index)}
        aria-pressed={posing}
        className={`mt-1 flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm transition ${
          posing
            ? 'border-accent bg-accent/15 text-foreground'
            : 'border-accent/60 text-foreground hover:bg-secondary'
        }`}
      >
        <PersonStanding className="size-4" aria-hidden />
        {posing ? 'Done posing' : 'Pose the skeleton'}
      </button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Puts handles on their bones in the viewport. Drag one and it writes a
        key at the playhead — bones you never touch keep walking, so a wave
        rides on a stroll. A Pose action on the timeline is what plays it back.
      </p>
      {actor.pose && (
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{actor.pose.keys.length}</span> keys over{' '}
          <span className="font-mono">{actor.pose.duration.toFixed(1)}s</span>.
        </p>
      )}
      {/*
        A clip off disk, rather than one keyed here.

        The animator's Save work writes exactly this file, in the backoffice
        and in a space's clip shelf alike, so a performance made once can stand
        in as many shots as you like - and the two editors stay one tool rather
        than two that each own their own animations.

        Read with `parseAnyDoc`, which is the rig-free reader: there is no model
        loaded at this point to say what bones exist, and the honest reading of
        a file here is the bones it actually names. Anything it cannot make a
        clip of says so rather than quietly doing nothing.
      */}
      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground">
        <FolderOpen className="size-3.5" aria-hidden />
        {actor.pose ? 'Load a different clip' : 'Load a clip'}
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void file.text().then((text) => {
              let doc = null
              try {
                doc = parseAnyDoc(JSON.parse(text))
              } catch {
                doc = null
              }
              if (!doc) {
                setClipNote('That file has no clip in it.')
                return
              }
              /*
                A beat to play it on, when there is not one already.

                A clip loaded on to an actor with no Pose action is a clip that
                changes nothing on screen - the commonest way for an import to
                look broken. One beat at the top, as long as the clip, is the
                smallest thing that makes it visible; the row is a chip you can
                drag or delete like any other.
              */
              const hasBeat = actor.actions.some((one) => one.kind === 'pose')
              set({
                pose: doc,
                ...(hasBeat
                  ? {}
                  : {
                      actions: ordered([
                        ...actor.actions,
                        { kind: 'pose' as const, t: at(time), duration: doc.duration },
                      ]),
                    }),
              })
              setClipNote(
                hasBeat
                  ? `Loaded ${doc.name}.`
                  : `Loaded ${doc.name}, and dropped a Pose beat at ${at(time).toFixed(1)}s to play it.`,
              )
            })
          }}
        />
      </label>
      {clipNote && <p className="text-xs text-muted-foreground">{clipNote}</p>}
      {actor.pose && <Remove onClick={() => set({ pose: null })}>Forget the clip</Remove>}

      {/* The bone under the hand, with the pad and the list. Only while this
          actor is the one being posed - it is a second panel's worth of
          controls, and drawing it beside a body with no handles on it would be
          a set of sliders that write to nothing. */}
      {posing && poseRig && (
        <PosePanel
          rig={poseRig.rig}
          look={actor.avatar}
          bone={poseRig.bone}
          pose={here.pose ?? null}
          onBone={poseRig.onBone}
          onPose={poseRig.onPose}
        />
      )}

      {chosen && selected.action !== null && (
        <ActionFields
          action={chosen}
          onSeek={onSeek}
          onChange={(fields) =>
            set({
              actions: actor.actions.map((existing, i) =>
                i === selected.action ? ({ ...existing, ...fields } as Action) : existing,
              ),
            })
          }
          onRemove={() => {
            set({ actions: actor.actions.filter((_, i) => i !== selected.action) })
            onSelect({ node: selected.node, action: null })
          }}
        />
      )}

      <Keys
        kind="peep"
        tracks={actor.tracks}
        time={time}
        onSeek={onSeek}
        valueNow={(property) =>
          sampleTracks(actor.tracks, property, time, currentOf(here, property))
        }
        onTracks={(tracks) => set({ tracks })}
      />

      <Remove
        onClick={() => {
          onChange({ ...shot, cast: shot.cast.filter((_, i) => i !== index) })
          onSelect({ node: { kind: 'peep', index: Math.max(0, index - 1) }, action: null })
        }}
      >
        Remove peep
      </Remove>

    </Section>
  )
}

/** A peep's live value for a property, for seeding a key with what you see. */
function currentOf(peep: object, property: string): number {
  const value = (peep as Record<string, unknown>)[property]
  return typeof value === 'number' ? Math.round(value * 100) / 100 : 0
}

// ---------------------------------------------------------------------------

/** The fields one verb has, and nothing else's. */
function ActionFields({
  action,
  onChange,
  onRemove,
  onSeek,
}: {
  action: Action
  onChange: (fields: Partial<Action>) => void
  onRemove: () => void
  onSeek: (t: number) => void
}) {
  const [picking, setPicking] = useState(false)
  const meta = ACTION_META[action.kind]

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-accent/40 bg-secondary/60 px-2.5 py-2">
      <div className="flex items-center gap-2 text-xs">
        <ActionIcon kind={action.kind} className="size-4 text-accent" />
        <span className="font-medium text-foreground">{meta.label}</span>
        <button
          type="button"
          onClick={() => onSeek(action.t)}
          className="rounded border border-border px-1 py-0.5 font-mono text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          {action.t.toFixed(2)}s
        </button>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {action.duration.toFixed(2)}s long
        </span>
      </div>

      {meta.resizable && (
        <Slide
          label="Length"
          value={action.duration}
          min={0.1}
          max={20}
          step={0.05}
          unit="s"
          onChange={(duration) => onChange({ duration })}
        />
      )}

      {action.kind === 'pose' && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Plays the clip saved on this actor — Animate the skeleton, below, is
          where one gets made. A clip shorter than this beat loops to fill it;
          bones it never keys stay with the walk.
        </p>
      )}

      {action.kind === 'move' && (
        <>
          <p className="text-xs text-muted-foreground">Walks to</p>
          <div className="flex items-end gap-2">
            <Pad
              x={action.x}
              z={action.z}
              min={-40}
              max={40}
              onChange={(x, z) => onChange({ x, z })}
            />
            <div className="flex min-w-0 flex-1 items-end gap-1.5">
              <Num label="X" value={action.x} min={-40} max={40} step={0.1} onChange={(x) => onChange({ x })} />
              <Num label="Z" value={action.z} min={-40} max={40} step={0.1} onChange={(z) => onChange({ z })} />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The clip picks itself from the speed — shorten this and they run.
          </p>
        </>
      )}

      {action.kind === 'turn' && (
        <Slide
          label="To face"
          value={action.rotation}
          min={-180}
          max={180}
          step={1}
          unit="°"
          onChange={(rotation) => onChange({ rotation })}
        />
      )}

      {action.kind === 'jump' && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={action.air}
            onChange={(event) =>
              // The length goes with it: a double jump hangs longer, and that is
              // the game's number rather than the author's.
              onChange({ air: event.target.checked, duration: jumpLength(event.target.checked) })
            }
            className="accent-accent"
          />
          Double jump
        </label>
      )}

      {action.kind === 'talk' && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Says
            <textarea
              value={action.text}
              rows={2}
              maxLength={MAX_LINE}
              onChange={(event) => onChange({ text: event.target.value })}
              className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange({ duration: talkDuration(action.text) })}
            className="self-start rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            Fit the length to the line
          </button>
        </>
      )}

      {action.kind === 'emote' && (
        <>
          <div className="flex items-center gap-2">
            <EmoteSwatch id={action.emote} />
            <button
              type="button"
              onClick={() => setPicking((open) => !open)}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              {picking ? 'Close' : 'Change face'}
            </button>
          </div>
          {picking && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-border/70 bg-secondary/60 p-2">
              <EmoteGrid
                onPick={(id) => {
                  onChange({ emote: id })
                  setPicking(false)
                }}
              />
            </div>
          )}
        </>
      )}

      {(action.kind === 'kick' || action.kind === 'hit' || action.kind === 'shake') && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          The pack has no clip for this — it is mimed with the body, so point
          them the right way first with a turn.
        </p>
      )}

      <Remove onClick={onRemove}>Remove {meta.label.toLowerCase()}</Remove>
    </div>
  )
}

// ---------------------------------------------------------------------------

function CameraInspector({
  shot,
  onChange,
  onSeek,
  selected,
}: {
  shot: ShotSpec
  onChange: (next: ShotSpec) => void
  onSeek: (t: number) => void
  selected: Selected
}) {
  return (
    <Section title="Camera" summary={`${shot.camera.length} keys`} icon={CameraIcon} open>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Park the playhead, orbit to the framing you want, then press{' '}
        <span className="text-foreground">Camera key here</span> under the
        viewport. Drag the diamonds to re-time it.
      </p>
      {shot.camera.map((key, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 rounded-lg px-1 py-0.5 ${
            selected.action === i ? 'bg-secondary' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => onSeek(key.t)}
            className="w-14 shrink-0 rounded border border-border px-1 py-0.5 font-mono text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            {key.t.toFixed(2)}s
          </button>
          <span className="flex-1 font-mono text-xs text-muted-foreground">
            {key.position.map((n) => Math.round(n)).join(', ')} · {Math.round(key.fov)}°
          </span>
          {shot.camera.length > 1 && (
            <button
              type="button"
              onClick={() => onChange({ ...shot, camera: shot.camera.filter((_, j) => j !== i) })}
              className="px-1 text-xs text-muted-foreground transition hover:text-red-400"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </Section>
  )
}

// ---------------------------------------------------------------------------

/**
 * A block, a ball, a goal or the rig.
 *
 * None of them has a verb, so the whole inspector is the property list from
 * `ANIMATABLE` and the ability to key any of it. Which is also why it is one
 * component for four node types rather than four - there is nothing in here
 * that knows what a goal is.
 */
function NodeInspector({
  shot,
  onChange,
  time,
  node,
}: {
  shot: ShotSpec
  onChange: (next: ShotSpec) => void
  time: number
  node: NodeRef
}) {
  const kind = node.kind as NodeKind
  const target = nodeOf(shot, node)
  if (!target) return null

  const set = (fields: Record<string, number>) => onChange(writeNode(shot, node, fields))

  return (
    <Section
      title={titleOf(shot, node)}
      summary={`${keyedProperties(target.tracks).length} keyed`}
      icon={node.kind === 'light' ? Sun : Boxes}
      open
    >
      {/* Positions get a typed box and everything else a slider: a coordinate
          is a number you usually know, and an intensity is one you find. */}
      <div className="flex items-end gap-2">
        {'x' in target.values && 'z' in target.values && (
          <Pad
            x={Number(target.values.x ?? 0)}
            z={Number(target.values.z ?? 0)}
            min={-40}
            max={40}
            onChange={(x, z) => set({ x, z })}
          />
        )}
        <div className="flex min-w-0 flex-1 items-end gap-1.5">
        {ANIMATABLE[kind]
          .filter((entry) => PLACES.has(entry.property))
          .map((entry) => (
            <Num
              key={entry.property}
              label={entry.label}
              value={Number(target.values[entry.property] ?? entry.min)}
              min={entry.min}
              max={entry.max}
              step={entry.step}
              onChange={(value) => set({ [entry.property]: value })}
            />
          ))}
        </div>
      </div>
      {ANIMATABLE[kind]
        .filter((entry) => !PLACES.has(entry.property))
        .map((entry) => (
          <Slide
            key={entry.property}
            label={entry.label}
            value={Number(target.values[entry.property] ?? entry.min)}
            min={entry.min}
            max={entry.max}
            step={entry.step}
            unit={entry.unit}
            onChange={(value) => set({ [entry.property]: value })}
          />
        ))}

      {kind === 'light' && (
        <button
          type="button"
          onClick={() => onChange({ ...shot, light: { ...DEFAULT_LIGHT, tracks: shot.light.tracks } })}
          className="mt-1 self-start rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          Back to daylight
        </button>
      )}

      <Keys
        kind={kind}
        tracks={target.tracks}
        time={time}
        onSeek={() => undefined}
        valueNow={(property) =>
          sampleTracks(target.tracks, property, time, Number(target.values[property] ?? 0))
        }
        onTracks={(tracks) => onChange(writeTracks(shot, node, tracks))}
      />
    </Section>
  )
}

/** The properties that are a coordinate rather than a quantity. */
const PLACES = new Set(['x', 'y', 'z', 'top'])

/** The static values and keys of whatever is selected, without a switch per use. */
function nodeOf(
  shot: ShotSpec,
  node: NodeRef,
): { values: Record<string, unknown>; tracks: Tracks } | null {
  switch (node.kind) {
    case 'block': {
      const block = shot.blocks[node.index]
      return block ? { values: { ...block }, tracks: block.tracks } : null
    }
    case 'ball': {
      const ball = shot.balls[node.index]
      return ball ? { values: { ...ball }, tracks: ball.tracks } : null
    }
    case 'goal': {
      const goal = shot.goals[node.index]
      return goal ? { values: { ...goal }, tracks: goal.tracks } : null
    }
    case 'light':
      return { values: { ...shot.light }, tracks: shot.light.tracks }
    default:
      return null
  }
}

function titleOf(shot: ShotSpec, node: NodeRef): string {
  if (node.kind === 'block') return shot.blocks[node.index]?.model ?? 'Block'
  if (node.kind === 'ball') return 'Ball'
  if (node.kind === 'goal') return 'Goal'
  return 'Light'
}

/** The static half written back. Keys go through `writeTracks`. */
function writeNode(shot: ShotSpec, node: NodeRef, fields: Record<string, number>): ShotSpec {
  switch (node.kind) {
    case 'block':
      return {
        ...shot,
        blocks: shot.blocks.map((block, i) =>
          i === node.index ? { ...block, ...fields } : block,
        ),
      }
    case 'ball':
      return {
        ...shot,
        balls: shot.balls.map((ball, i) => (i === node.index ? { ...ball, ...fields } : ball)),
      }
    case 'goal':
      return {
        ...shot,
        goals: shot.goals.map((goal, i) => (i === node.index ? { ...goal, ...fields } : goal)),
      }
    case 'light':
      return { ...shot, light: { ...shot.light, ...fields } }
    default:
      return shot
  }
}

// ---------------------------------------------------------------------------

/**
 * Keyframes on one node.
 *
 * The gesture is the same one the camera has always had, generalised: park the
 * playhead, set the value you want with the sliders above, press the property's
 * name. What gets written is whatever the property reads *right now*, which is
 * why the first key on a property never changes the picture - it pins what was
 * already there, and the second one is the one that makes it move.
 *
 * Editing a key's value by hand is the other way in, and the one somebody
 * reaches for to say "be up there from here". That works because a key only
 * applies from its own moment on: everything before the first one is still the
 * sliders' value. See `sampleKeys`.
 */
function Keys({
  kind,
  tracks,
  time,
  onSeek,
  valueNow,
  onTracks,
}: {
  kind: NodeKind
  tracks: Tracks
  time: number
  onSeek: (t: number) => void
  valueNow: (property: string) => number
  onTracks: (tracks: Tracks) => void
}) {
  const [property, setProperty] = useState<string>(ANIMATABLE[kind][0].property)
  const keyed = keyedProperties(tracks)

  const write = (name: string, ease: Ease = 'smooth') => {
    const key: Key = { t: at(time), value: Math.round(valueNow(name) * 100) / 100, ease }
    onTracks(putTrackKey(tracks, name, key))
  }

  return (
    <div className="mt-3 flex flex-col gap-1.5 rounded-xl border border-border/70 bg-secondary/40 px-2.5 py-2">
      <p className="text-xs font-medium text-foreground">Animate a property</p>
      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <Pick
            label=""
            value={property}
            options={ANIMATABLE[kind].map((entry) => entry.property)}
            onChange={setProperty}
          />
        </div>
        <button
          type="button"
          onClick={() => write(property)}
          className="shrink-0 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          Key at {time.toFixed(1)}s
        </button>
      </div>

      {keyed.length === 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nothing keyed. A key pins the value it reads now, and applies from its
          own moment on — before the first one the sliders still rule. Put one
          where the movement should start, then another where it should end.
        </p>
      )}

      {keyed.map((name) => (
        <div key={name} className="flex flex-col gap-1">
          <p className="mt-1 text-xs text-muted-foreground">
            {animatable(kind, name)?.label ?? name}
          </p>
          {tracks[name].map((key, i) => (
            <KeyRow
              key={i}
              entry={animatable(kind, name)}
              value={key}
              onSeek={() => onSeek(key.t)}
              onChange={(fields) =>
                onTracks({
                  ...tracks,
                  [name]: tracks[name]
                    .map((existing, j) => (i === j ? { ...existing, ...fields } : existing))
                    .sort((a, b) => a.t - b.t),
                })
              }
              onRemove={() => onTracks(dropKey(tracks, name, i))}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function KeyRow({
  entry,
  value,
  onSeek,
  onChange,
  onRemove,
}: {
  entry: Animatable | undefined
  value: Key
  onSeek: () => void
  onChange: (fields: Partial<Key>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onSeek}
        title="Move the playhead here"
        className="w-14 shrink-0 rounded border border-border px-1 py-0.5 font-mono text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      >
        {value.t.toFixed(2)}s
      </button>
      <input
        type="number"
        value={value.value}
        min={entry?.min ?? -1000}
        max={entry?.max ?? 1000}
        step={entry?.step ?? 0.1}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange({ value: next })
        }}
        className="w-16 rounded-lg border border-border bg-transparent px-1.5 py-0.5 text-xs text-foreground"
      />
      <select
        value={value.ease}
        onChange={(event) => onChange({ ease: event.target.value as Ease })}
        className="rounded-lg border border-border bg-secondary px-1 py-0.5 text-xs text-foreground"
      >
        {EASES.map((ease) => (
          <option key={ease} value={ease}>
            {ease}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        className="px-1 text-xs text-muted-foreground transition hover:text-red-400"
      >
        ×
      </button>
    </div>
  )
}
