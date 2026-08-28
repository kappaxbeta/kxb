'use client'

import {
  ArrowBigUp,
  Boxes,
  Camera as CameraIcon,
  Footprints,
  Frame,
  Gamepad2,
  MousePointerClick,
  Sun,
  Users,
  type LucideIcon,
  MessageCircle,
  Music,
  Palette,
  RotateCw,
  Smile,
  Sparkles,
  Swords,
  Wind,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import {
  Add,
  EmoteSwatch,
  Num,
  Pad,
  Pick,
  PickGroups,
  Remove,
  Section,
  Slide,
} from '@/app/ovaloffice/studio/parts'
import {
  type NodeRef,
  type Selected,
  sameNode,
  writeTracks,
} from '@/app/ovaloffice/studio/timeline'
import { EmoteGrid } from '@/app/world/_hud/emote-grid'
import { avatarShotUrl } from '@/domain/lounge/avatars'
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
import { DEFAULT_LIGHT, STUDIO_AVATARS } from '@/domain/studio/scene'
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
  worlds = [],
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
  /** Worlds that can be pulled in as a set. Empty is simply no picker. */
  worlds?: ImportableWorld[]
}) {
  const patch = (fields: Partial<ShotSpec>) => onChange({ ...shot, ...fields })

  return (
    <div className="flex flex-col gap-2">
      <Output shot={shot} patch={patch} />
      <Inspector
        shot={shot}
        onChange={onChange}
        time={time}
        onSeek={onSeek}
        selected={selected}
        onSelect={onSelect}
        onDrive={onDrive}
      />
      <Cast shot={shot} patch={patch} selected={selected} onSelect={onSelect} />
      <Props shot={shot} patch={patch} selected={selected} onSelect={onSelect} />
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
 * The verbs' icons, resolved from the names in `ACTION_META`.
 *
 * A map here rather than components in the domain module, so nothing the
 * sampler or the tests import pulls in an icon set. Missing names fall back to
 * the label alone rather than to a broken render.
 */
const ICONS: Record<string, LucideIcon> = {
  ArrowBigUp,
  Footprints,
  MessageCircle,
  Music,
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

function Output({ shot, patch }: { shot: ShotSpec; patch: Patch }) {
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
      <p className="text-xs leading-relaxed text-muted-foreground">
        Video has no transparency — unlike a still, a shot is composited over
        this. A picture has to be ours: an image from another site taints the
        canvas, and a tainted canvas records nothing at all.
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
            src={avatarShotUrl(actor.avatar)}
            alt=""
            className="size-7 shrink-0 rounded-lg border border-line/40 object-contain"
          />
          <span className="flex-1 truncate capitalize">{actor.name || actor.avatar}</span>
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
}: {
  shot: ShotSpec
  patch: Patch
  selected: Selected | null
  onSelect: (selection: Selected) => void
}) {
  const [model, setModel] = useState('stone')

  return (
    <Section title="Props" summary={`${shot.blocks.length}`} icon={Boxes} open>
      {shot.blocks.map((block, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelect({ node: { kind: 'block', index }, action: null })}
          className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-xs transition ${
            selected && sameNode(selected.node, { kind: 'block', index })
              ? 'border-accent/60 bg-surface-raised/60 text-ink'
              : 'border-line/40 text-ink-muted hover:border-line'
          }`}
        >
          <Boxes className="size-3.5 shrink-0" aria-hidden />
          <span className="flex-1 truncate">{block.model}</span>
          <span className="font-mono opacity-60">
            {keyedProperties(block.tracks).length > 0
              ? `${keyedProperties(block.tracks).length} keyed`
              : ''}
          </span>
        </button>
      ))}

      <PickGroups label="" value={model} onChange={setModel} />
      <Add
        label="Add a prop"
        disabled={shot.blocks.length >= 120}
        onClick={() => {
          // At the origin, on the floor. Somewhere visible beats somewhere
          // clever: the first thing anybody does is drag it, and a prop that
          // lands off-camera reads as a button that did nothing.
          patch({
            blocks: [...shot.blocks, { model, x: 0, top: 1, z: 0, rotation: 0, tracks: {} }],
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
}: {
  shot: ShotSpec
  onChange: (next: ShotSpec) => void
  time: number
  onSeek: (t: number) => void
  selected: Selected | null
  onSelect: (selection: Selected) => void
  onDrive?: (index: number) => void
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
}) {
  const set = (fields: Partial<Actor>) =>
    onChange({
      ...shot,
      cast: shot.cast.map((existing, i) => (i === index ? { ...existing, ...fields } : existing)),
    })

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

  const chosen = selected.action === null ? null : actor.actions[selected.action]

  return (
    <Section
      title={actor.name || actor.avatar}
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
      <Pick label="Animal" value={actor.avatar} options={STUDIO_AVATARS} onChange={(avatar) => set({ avatar })} />

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
