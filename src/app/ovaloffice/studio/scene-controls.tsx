'use client'

import { useState } from 'react'
import {
  Boxes,
  Camera as CameraIcon,
  Frame,
  Goal as GoalIcon,
  Grid3x3,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react'
import { avatarShotUrl } from '@/domain/lounge/avatars'
import { FORMATS } from '@/domain/studio/formats'
import { framingFor } from '@/domain/scenes/world-import'
import {
  type ImportableWorld,
  importNote,
  WorldPicker,
} from '@/app/ovaloffice/studio/world-picker'
import {
  Add,
  EmoteSwatch,
  Num,
  Pick,
  PickGroups,
  Remove,
  Row,
  Section,
  Slide,
} from '@/app/ovaloffice/studio/parts'
import { EmoteGrid } from '@/app/world/_hud/emote-grid'
import { TERRAIN_BLOCKS } from '@/domain/lounge/palette'
import {
  type BallSpec,
  type BlockSpec,
  DEFAULT_LIGHT,
  LIGHT_PRESETS,
  NEON_LIGHT,
  DEFAULT_PEEP,
  DEFAULT_SCENE,
  type GoalSpec,
  type PeepSpec,
  STUDIO_AVATARS,
  STUDIO_CLIPS,
  type StudioScene,
} from '@/domain/studio/scene'


/**
 * Every knob in the studio.
 *
 * A panel of inputs over one immutable document: nothing here holds scene state
 * of its own, it takes a `StudioScene` and hands back a new one. The editor
 * above owns the only copy, which is what makes the URL a faithful record of
 * what is on screen - a control with private state would be a control whose
 * value does not survive a reload.
 *
 * The exception is which popover is open, below, which is about the panel and
 * not about the picture.
 */
export type { ImportableWorld }

export function SceneControls({
  scene,
  onChange,
  worlds = [],
}: {
  scene: StudioScene
  onChange: (next: StudioScene) => void
  /** Worlds this admin may pull in as a backdrop. */
  worlds?: ImportableWorld[]
}) {
  const patch = (fields: Partial<StudioScene>) => onChange({ ...scene, ...fields })

  return (
    <div className="flex flex-col gap-2">
      <Output scene={scene} patch={patch} />
      {worlds.length > 0 && (
        <WorldPicker
          worlds={worlds}
          current={scene.set?.worldId ?? null}
          onPick={(worldId, blocks, counts) => {
            patch({
              set: { worldId },
              // The studio's grass island goes with it. A world brings its own
              // floor, and the two together is a patch of lawn hovering in the
              // middle of somebody's town square.
              ground: null,
              // The camera goes with it too. The commonest way for a set to
              // look broken is to be standing perfectly off-screen.
              camera: { ...scene.camera, ...framingFor(blocks) },
            })
            return importNote(blocks.length, counts)
          }}
          onClear={() => patch({ set: null, ground: DEFAULT_SCENE.ground })}
        />
      )}
      <Camera scene={scene} patch={patch} />
      <Ground scene={scene} patch={patch} />
      <Peeps scene={scene} patch={patch} />
      <Blocks scene={scene} patch={patch} />
      <Football scene={scene} patch={patch} />
      <RainbowSection scene={scene} patch={patch} />
      <Light scene={scene} patch={patch} />
    </div>
  )
}

type Patch = (fields: Partial<StudioScene>) => void

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Output({ scene, patch }: { scene: StudioScene; patch: Patch }) {
  const preset = (width: number, height: number) => patch({ width, height })
  return (
    <Section title="Output" summary={`${scene.width} × ${scene.height}`} icon={Frame} open>
      <div className="grid grid-cols-2 gap-2">
        <Num label="Width" value={scene.width} min={64} max={4096} step={10} onChange={(width) => patch({ width })} />
        <Num label="Height" value={scene.height} min={64} max={4096} step={10} onChange={(height) => patch({ height })} />
      </div>
      {/* Named after where it is going rather than after its ratio - see
          `@/domain/studio/formats`, which the video studio reads too, so the
          two panels cannot drift into offering different shapes. The one that
          is on lights up. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FORMATS.map((format) => {
          const on = scene.width === format.width && scene.height === format.height
          return (
            <button
              key={format.label}
              type="button"
              title={format.hint}
              onClick={() => preset(format.width, format.height)}
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
    </Section>
  )
}

function Camera({ scene, patch }: { scene: StudioScene; patch: Patch }) {
  const { position, target, fov } = scene.camera
  const round = (value: number) => Math.round(value * 10) / 10
  return (
    <Section
      title="Camera"
      summary={`${fov}°`}
      icon={CameraIcon}
    >
      {/* Position is read-only on purpose: it is set by dragging in the
          viewport, and a number box that fights the orbit control is a number
          box that is wrong half the time. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Drag to orbit, scroll to zoom, right-drag to pan. The camera writes
        itself back into the link.
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
        <dt>position</dt>
        <dd className="text-foreground">{position.map(round).join(', ')}</dd>
        <dt>target</dt>
        <dd className="text-foreground">{target.map(round).join(', ')}</dd>
      </dl>
      <Slide
        label="Field of view"
        value={fov}
        min={10}
        max={90}
        step={1}
        unit="°"
        onChange={(next) => patch({ camera: { ...scene.camera, fov: next } })}
      />
    </Section>
  )
}

function Ground({ scene, patch }: { scene: StudioScene; patch: Patch }) {
  const ground = scene.ground
  return (
    <Section
      title="Ground"
      summary={ground ? `${ground.cols} × ${ground.rows}` : 'none'}
      icon={Grid3x3}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ground !== null}
          onChange={(event) =>
            patch({
              ground: event.target.checked
                ? { cols: 13, rows: 11, top: 'dirt_with_grass', rounded: true }
                : null,
            })
          }
        />
        Lay a floor
      </label>
      {ground && (
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
              onChange={(event) =>
                patch({ ground: { ...ground, rounded: event.target.checked } })
              }
            />
            Nibble the corners
          </label>
        </>
      )}
    </Section>
  )
}

function Peeps({ scene, patch }: { scene: StudioScene; patch: Patch }) {
  const set = (index: number, fields: Partial<PeepSpec>) =>
    patch({
      peeps: scene.peeps.map((peep, i) => (i === index ? { ...peep, ...fields } : peep)),
    })

  return (
    <Section title="Peeps" summary={`${scene.peeps.length}`} icon={Users} open>
      <div className="flex flex-col gap-1.5">
        {scene.peeps.map((peep, index) => (
          <PeepRow
            key={index}
            peep={peep}
            onChange={(fields) => set(index, fields)}
            onRemove={() =>
              patch({ peeps: scene.peeps.filter((_, i) => i !== index) })
            }
          />
        ))}
      </div>
      <Add
        label="Add a peep"
        disabled={scene.peeps.length >= 24}
        onClick={() =>
          patch({
            peeps: [
              ...scene.peeps,
              // Dropped just off the middle rather than on it, so a second peep
              // is visibly a second peep instead of one standing inside another.
              {
                ...DEFAULT_PEEP,
                avatar: STUDIO_AVATARS[scene.peeps.length % STUDIO_AVATARS.length],
                x: (scene.peeps.length % 3) - 1,
                z: Math.floor(scene.peeps.length / 3) - 1,
              },
            ],
          })
        }
      />
    </Section>
  )
}

function PeepRow({
  peep,
  onChange,
  onRemove,
}: {
  peep: PeepSpec
  onChange: (fields: Partial<PeepSpec>) => void
  onRemove: () => void
}) {
  const [picking, setPicking] = useState(false)

  return (
    <Row
      title={peep.avatar}
      detail={peep.say ? `“${peep.say.slice(0, 18)}”` : undefined}
      lead={
        /* The animal, rather than its name in a list. The whole panel is words
           in rounded boxes, and a cast is the one thing in it that has a face -
           these are the pre-rendered stills the roster already uses, so it costs
           an <img> rather than a canvas. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarShotUrl(peep.avatar)}
          alt=""
          className="size-8 shrink-0 rounded-lg border border-line/40 bg-surface-raised/60 object-contain"
        />
      }
      trailing={peep.emote !== null ? <EmoteSwatch id={peep.emote} /> : undefined}
    >
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-2">
          <Pick label="Animal" value={peep.avatar} options={STUDIO_AVATARS} onChange={(avatar) => onChange({ avatar })} />
          <Pick label="Clip" value={peep.clip} options={STUDIO_CLIPS} onChange={(clip) => onChange({ clip: clip as PeepSpec['clip'] })} />
        </div>
        {/* The clip never plays - it is posed at one moment and left there -
            so this slider is the only thing that decides which frame of the
            run cycle ends up in the picture. The label says so in two words
            rather than a paragraph, because the panel is scanned. */}
        <Slide label="Pose" value={peep.time} min={0} max={4} step={0.01} onChange={(time) => onChange({ time })} />
        <Slide label="Across" value={peep.x} min={-20} max={20} step={0.1} onChange={(x) => onChange({ x })} />
        <Slide label="Depth" value={peep.z} min={-20} max={20} step={0.1} onChange={(z) => onChange({ z })} />
        {/* Standing on a block, or caught mid-jump. A shot derives this from
            the jump arc; a still just puts them where they look best. */}
        <Slide label="Height" value={peep.y} min={0} max={8} step={0.05} onChange={(y) => onChange({ y })} />
        <Slide label="Facing" value={peep.rotation} min={-180} max={180} step={1} unit="°" onChange={(rotation) => onChange({ rotation })} />
        {/* Leaning and scaling are the two things a still can say that a clip
            cannot. Both default to standing upright at the size the animal is
            in the lounge, so an arrangement composed before they existed opens
            looking exactly as it did. */}
        <Slide label="Lean" value={peep.tilt} min={-60} max={60} step={1} unit="°" onChange={(tilt) => onChange({ tilt })} />
        <Slide label="Size" value={peep.scale} min={0.2} max={3} step={0.05} onChange={(scale) => onChange({ scale })} />
        {/* Exact positions, for when the answer is a round number rather than
            wherever the slider landed. */}
        <div className="flex items-end gap-1.5">
          <Num label="X" value={peep.x} min={-40} max={40} step={0.1} onChange={(x) => onChange({ x })} />
          <Num label="Y" value={peep.y} min={-8} max={24} step={0.1} onChange={(y) => onChange({ y })} />
          <Num label="Z" value={peep.z} min={-40} max={40} step={0.1} onChange={(z) => onChange({ z })} />
        </div>

        {/* --- the glow ---------------------------------------------------- */}
        <div className="mt-1 flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">Glow</span>
          <button
            type="button"
            onClick={() =>
              onChange({
                glow: peep.glow ? null : { colour: '#ff3ec8', sparkle: true, strength: 1 },
              })
            }
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition ${
              peep.glow ? 'border-accent text-ink' : 'border-line/60 text-ink-muted hover:border-accent/60'
            }`}
          >
            <Sparkles className="size-3.5" aria-hidden />
            {peep.glow ? 'on' : 'off'}
          </button>
          {peep.glow && (
            <input
              type="color"
              value={peep.glow.colour}
              onChange={(event) =>
                onChange({ glow: { ...peep.glow!, colour: event.target.value } })
              }
              className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
            />
          )}
        </div>
        {peep.glow && (
          <Slide
            label="Strength"
            value={peep.glow.strength}
            min={0}
            max={3}
            step={0.05}
            onChange={(strength) => onChange({ glow: { ...peep.glow!, strength } })}
          />
        )}

        {/* --- what they are saying --------------------------------------- */}
        <label className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
          Says
          <input
            value={peep.say ?? ''}
            placeholder="nothing"
            maxLength={120}
            onChange={(event) =>
              // Empty means no bubble at all, rather than an empty one: a blank
              // rounded rectangle over somebody's head is not a thing anybody
              // composes on purpose.
              onChange({ say: event.target.value.trim().length === 0 ? null : event.target.value })
            }
            className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-foreground"
          />
        </label>

        <div className="mt-1 flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">Emote</span>
          <button
            type="button"
            onClick={() => setPicking((open) => !open)}
            className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs transition hover:bg-secondary"
          >
            {peep.emote === null ? 'none' : <EmoteSwatch id={peep.emote} />}
            <span className="text-muted-foreground">choose</span>
          </button>
          {peep.emote !== null && (
            <button
              type="button"
              onClick={() => onChange({ emote: null })}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              clear
            </button>
          )}
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

        {(peep.emote !== null || peep.say !== null) && (
          <>
            <Slide label="Bubble up" value={peep.emoteHeight} min={0} max={8} step={0.05} onChange={(emoteHeight) => onChange({ emoteHeight })} />
            <Slide label="Bubble size" value={peep.emoteSize} min={0.3} max={2.5} step={0.05} onChange={(emoteSize) => onChange({ emoteSize })} />
          </>
        )}

        <Remove onClick={onRemove}>Remove</Remove>
      </div>
    </Row>
  )
}

function Blocks({ scene, patch }: { scene: StudioScene; patch: Patch }) {
  const set = (index: number, fields: Partial<BlockSpec>) =>
    patch({
      blocks: scene.blocks.map((block, i) => (i === index ? { ...block, ...fields } : block)),
    })

  return (
    <Section title="Blocks" summary={`${scene.blocks.length}`} icon={Boxes}>
      <div className="flex flex-col gap-1.5">
        {scene.blocks.map((block, index) => (
          <details key={index} className="rounded-xl border border-border/70 bg-secondary/40 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
              <span className="flex-1">{block.model}</span>
            </summary>
            <div className="mt-2 flex flex-col gap-1.5">
              <PickGroups label="Block" value={block.model} onChange={(model) => set(index, { model })} />
              <Slide label="Across" value={block.x} min={-20} max={20} step={0.5} onChange={(x) => set(index, { x })} />
              <Slide label="Depth" value={block.z} min={-20} max={20} step={0.5} onChange={(z) => set(index, { z })} />
              {/* Height of the block's *top face*, which is how the world grid
                  talks about it: "top 1" is a block sitting on the floor. */}
              <Slide label="Top at" value={block.top} min={-4} max={16} step={1} onChange={(top) => set(index, { top })} />
              <Slide label="Turn" value={block.rotation} min={-180} max={180} step={5} unit="°" onChange={(rotation) => set(index, { rotation })} />
              <Remove onClick={() => patch({ blocks: scene.blocks.filter((_, i) => i !== index) })}>
                Remove block
              </Remove>
            </div>
          </details>
        ))}
      </div>
      <Add
        label="Add a block"
        disabled={scene.blocks.length >= 120}
        onClick={() =>
          patch({ blocks: [...scene.blocks, { model: 'crate', x: 0, top: 1, z: -3, rotation: 0 }] })
        }
      />
    </Section>
  )
}

function Football({ scene, patch }: { scene: StudioScene; patch: Patch }) {
  const setGoal = (index: number, fields: Partial<GoalSpec>) =>
    patch({ goals: scene.goals.map((goal, i) => (i === index ? { ...goal, ...fields } : goal)) })
  const setBall = (index: number, fields: Partial<BallSpec>) =>
    patch({ balls: scene.balls.map((ball, i) => (i === index ? { ...ball, ...fields } : ball)) })

  return (
    <Section
      title="Football"
      summary={`${scene.goals.length}·${scene.balls.length}`}
      icon={GoalIcon}
    >
      {scene.goals.map((goal, index) => (
        <details key={`goal${index}`} className="mb-1.5 rounded-xl border border-border/70 bg-secondary/40 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-3 rounded-full border border-white/20"
              style={{ background: goal.colour }}
            />
            <span className="flex-1">Goal {index + 1}</span>
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <Slide label="Across" value={goal.x} min={-20} max={20} step={0.5} onChange={(x) => setGoal(index, { x })} />
            <Slide label="Depth" value={goal.z} min={-20} max={20} step={0.5} onChange={(z) => setGoal(index, { z })} />
            <Slide label="Turn" value={goal.rotation} min={-180} max={180} step={5} unit="°" onChange={(rotation) => setGoal(index, { rotation })} />
            <Slide label="Width" value={goal.width} min={2} max={14} step={0.5} onChange={(width) => setGoal(index, { width })} />
            <Slide label="Height" value={goal.height} min={1} max={8} step={0.25} onChange={(height) => setGoal(index, { height })} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-20 shrink-0">Colour</span>
              <input
                type="color"
                value={goal.colour}
                onChange={(event) => setGoal(index, { colour: event.target.value })}
                className="h-7 w-14 rounded border border-border bg-transparent"
              />
            </label>
            <Remove onClick={() => patch({ goals: scene.goals.filter((_, i) => i !== index) })}>
              Remove goal
            </Remove>
          </div>
        </details>
      ))}
      <Add
        label="Add a goal"
        disabled={scene.goals.length >= 8}
        onClick={() =>
          patch({
            goals: [
              ...scene.goals,
              { x: 0, z: -6, rotation: 0, width: 5, height: 3, colour: '#3b82f6' },
            ],
          })
        }
      />

      {scene.balls.map((ball, index) => (
        <details key={`ball${index}`} className="mt-1.5 rounded-xl border border-border/70 bg-secondary/40 px-3 py-2">
          <summary className="cursor-pointer list-none text-sm">Ball {index + 1}</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <Slide label="Across" value={ball.x} min={-20} max={20} step={0.1} onChange={(x) => setBall(index, { x })} />
            <Slide label="Depth" value={ball.z} min={-20} max={20} step={0.1} onChange={(z) => setBall(index, { z })} />
            {/* Off the ground is the whole trick of a football still: a ball on
                the grass is a prop, a ball in the air is a shot in progress. */}
            <Slide label="Height" value={ball.y} min={0} max={8} step={0.05} onChange={(y) => setBall(index, { y })} />
            <Slide label="Radius" value={ball.radius} min={0.15} max={1.5} step={0.01} onChange={(radius) => setBall(index, { radius })} />
            <Remove onClick={() => patch({ balls: scene.balls.filter((_, i) => i !== index) })}>
              Remove ball
            </Remove>
          </div>
        </details>
      ))}
      <Add
        label="Add a ball"
        disabled={scene.balls.length >= 8}
        onClick={() => patch({ balls: [...scene.balls, { x: 0, y: 0.42, z: 0, radius: 0.42 }] })}
      />
    </Section>
  )
}

/**
 * The world as rainbow glass.
 *
 * Two switches and a scrubber. The switches are separate because they are two
 * different pictures - a town of glass cubes still reads as a town, while glass
 * furniture reads as a shelf of smudges, which is sometimes the shot and never
 * the default. Animals are in neither, and there is deliberately no switch to
 * put them in one: a still where you cannot tell a fox from a panda is not a
 * still anybody wants.
 *
 * The scrubber is the whole of "animate it" for a *photograph*: the sweep moves
 * with time, and a still is one instant of it, so what a composer needs here is
 * to choose which instant. The video editor spells the same thing as a speed.
 */
function RainbowSection({ scene, patch }: { scene: StudioScene; patch: Patch }) {
  const rainbow = scene.rainbow
  const set = (fields: Partial<NonNullable<StudioScene['rainbow']>>) => {
    const next = { world: false, props: false, phase: 0, ...rainbow, ...fields }
    // Both off is the same statement as no rainbow, and saying it that way
    // keeps the document's null case the only way to spell "ordinary world".
    patch({ rainbow: next.world || next.props ? next : null })
  }

  return (
    <Section
      title="Rainbow"
      summary={
        rainbow ? [rainbow.world && 'world', rainbow.props && 'props'].filter(Boolean).join(' + ') : 'off'
      }
      icon={Sparkles}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rainbow?.world ?? false}
          onChange={(event) => set({ world: event.target.checked })}
        />
        Blocks and ground
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rainbow?.props ?? false}
          onChange={(event) => set({ props: event.target.checked })}
        />
        Furniture too
      </label>
      {rainbow && (
        <>
          <Slide
            label="Sweep"
            value={rainbow.phase}
            min={0}
            max={20}
            step={0.05}
            unit="s"
            onChange={(phase) => set({ phase })}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Where the colour band has got to. A still is one moment of a moving
            sweep — drag until the hues land where you want them.
          </p>
        </>
      )}
    </Section>
  )
}

function Light({ scene, patch }: { scene: StudioScene; patch: Patch }) {
  const light = scene.light
  const set = (fields: Partial<typeof light>) => patch({ light: { ...light, ...fields } })
  const preset = light.preset ?? 'daylight'
  return (
    <Section title="Light" summary={preset === 'neon' ? 'neon' : `sun ${light.sun}`} icon={Sun}>
      {/*
        The rig, before any of its knobs.

        Two rigs rather than one with the ambient dragged to zero: `neon` drops
        the sun, the sky and the ambient outright and lights the scene with
        three coloured sources instead - see `Rig`. Switching carries the whole
        preset in rather than patching one field, because the daylight defaults
        (ambient 0.75, hemisphere 1) are meaningless under neon and a half-
        switched rig is the state that looks broken.

        The sliders below still work in both: under neon, "sun strength" scales
        the violet key and "neon rim" scales the green and the yellow together.
        The two that do nothing are greyed rather than hidden, so the panel does
        not change shape when the rig does.
      */}
      <div className="flex gap-1.5">
        {LIGHT_PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            title={option.hint}
            onClick={() => patch({ light: option.id === 'neon' ? NEON_LIGHT : DEFAULT_LIGHT })}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition ${
              preset === option.id
                ? 'border-primary/60 bg-secondary text-foreground'
                : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Slide label="Sun from" value={light.azimuth} min={-180} max={180} step={1} unit="°" onChange={(azimuth) => set({ azimuth })} />
      <Slide label="Sun height" value={light.elevation} min={5} max={89} step={1} unit="°" onChange={(elevation) => set({ elevation })} />
      <Slide label="Sun strength" value={light.sun} min={0} max={6} step={0.05} onChange={(sun) => set({ sun })} />
      {preset === 'daylight' && (
        <>
          <Slide label="Ambient" value={light.ambient} min={0} max={3} step={0.05} onChange={(ambient) => set({ ambient })} />
          <Slide label="Sky bounce" value={light.hemisphere} min={0} max={3} step={0.05} onChange={(hemisphere) => set({ hemisphere })} />
        </>
      )}
      {/* One knob for both coloured lights. They are a rim treatment, not two
          independent lights, and tuning them apart has never once helped. */}
      <Slide label="Neon rim" value={light.rim} min={0} max={3} step={0.05} onChange={(rim) => set({ rim })} />
      <button
        type="button"
        onClick={() => patch({ light: DEFAULT_LIGHT })}
        className="mt-1 self-start rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      >
        Back to daylight
      </button>
    </Section>
  )
}

