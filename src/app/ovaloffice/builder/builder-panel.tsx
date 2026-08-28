'use client'

import {
  ArrowUpFromLine,
  Blocks,
  Box,
  Brush,
  Circle,
  CloudSun,
  Cylinder,
  DoorOpen,
  Download,
  Eraser,
  FileJson,
  Flag,
  FlagTriangleRight,
  FolderOpen,
  Goal,
  Grid2x2,
  HardDriveDownload,
  Layers,
  Lightbulb,
  type LucideIcon,
  Minus,
  Moon,
  Package,
  Plus,
  RectangleHorizontal,
  Rotate3d,
  Scaling,
  Slash,
  Sparkles,
  Square,
  SquareDashed,
  SquareStack,
  Sun,
  Sunset,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import {
  deleteSlot,
  loadSlot,
  saveSlot,
  useSlots,
} from '@/app/ovaloffice/builder/saves'
import { downloadText } from '@/app/ovaloffice/studio/capture'
import { Section, Slide } from '@/app/ovaloffice/studio/parts'
import { describeModel } from '@/domain/builder/catalogue'
import { EXTRUDES, FILLABLE, type Tool, TOOLS } from '@/domain/builder/draw'
import { type TextOptions, textExtent, unsupportedCharacters } from '@/domain/builder/glyphs'
import { MAX_SHARE_LENGTH, shareSize } from '@/domain/builder/share'
import { STARTERS } from '@/domain/builder/starters'
import {
  type BuilderWorld,
  deserialiseWorld,
  MAX_LEVEL,
  MIN_LEVEL,
  serialiseWorld,
  type WorldLamp,
} from '@/domain/builder/world'

/**
 * Everything that is not the viewport.
 *
 * Ordered by how often it is touched rather than by what it belongs to: the
 * tool and what you are holding change constantly, the light and the output
 * size are set once per session. Grouping by subject would put "export width"
 * next to "export height" and both of them above the tool you use every second.
 *
 * Dressed as the studio's panel is dressed, out of the studio's own parts -
 * `Section` and `Slide` from `studio/parts`, which were split out of the scene
 * controls precisely so a second panel could look like one tool rather than
 * like a settings form that happens to sit next to a canvas. Two consequences
 * follow and both are the point: every group collapses, so the eight of them
 * fit on a laptop without scrolling past the light rig to reach Save; and every
 * group carries an icon, which is what lets somebody find "Sky" again in a
 * column of near-identical rounded rectangles without reading four labels on
 * the way down.
 */

/** What each tool is called, what it draws, and what it is for. */
const TOOL_COPY: Record<Tool, { label: string; key: string; hint: string; icon: LucideIcon }> = {
  brush: {
    label: 'Brush',
    key: 'B',
    hint: 'Paint cell by cell. Drag to draw a path.',
    icon: Brush,
  },
  line: { label: 'Line', key: 'L', hint: 'A gapless run between two cells.', icon: Slash },
  wall: {
    label: 'Wall',
    key: 'W',
    hint: 'A line, raised to the height below.',
    icon: RectangleHorizontal,
  },
  rect: { label: 'Rect', key: 'R', hint: 'A rectangle on this level.', icon: Square },
  box: { label: 'Box', key: 'X', hint: 'A rectangle, raised — a room in one drag.', icon: Box },
  circle: { label: 'Circle', key: 'C', hint: 'An ellipse inscribed in the drag.', icon: Circle },
  cylinder: {
    label: 'Cylinder',
    key: 'Y',
    hint: 'A circle, raised — a tower or a well.',
    icon: Cylinder,
  },
  text: {
    label: 'Text',
    key: 'T',
    hint: 'Stamp a word out of blocks. Click to place it.',
    icon: Type,
  },
  erase: {
    label: 'Erase',
    key: 'E',
    hint: 'Click one block, or drag a box to rub out everything in it. Raise Height to erase upward too.',
    icon: Eraser,
  },
}

export function BuilderPanel({
  world,
  onWorld,
  tool,
  onTool,
  model,
  onPickModel,
  blocksOnly = false,
  level,
  onLevel,
  onClimb,
  onSpawnHere,
  onMark,
  onClearMarks,
  stacking,
  onStacking,
  height,
  onHeight,
  filled,
  onFilled,
  rotation,
  onRotation,
  scale,
  onScale,
  text,
  onText,
  textOptions,
  onTextOptions,
  onNote,
}: {
  world: BuilderWorld
  onWorld: (next: (current: BuilderWorld) => BuilderWorld) => void
  tool: Tool
  onTool: (tool: Tool) => void
  model: string
  onPickModel: () => void
  /** Whether this builder offers only the palette blocks. See the picker. */
  blocksOnly?: boolean
  level: number
  onLevel: (level: number) => void
  onClimb: () => void
  /** Put the spawn point under the pointer. */
  onSpawnHere: () => void
  /** Stand a goal or race mark under the pointer. */
  onMark: (kind: 'red' | 'blue' | 'start' | 'finish') => void
  onClearMarks: () => void
  /** Whether blocks land on top of what is already there. */
  stacking: boolean
  onStacking: (stacking: boolean) => void
  height: number
  onHeight: (height: number) => void
  filled: boolean
  onFilled: (filled: boolean) => void
  rotation: number
  onRotation: (rotation: number) => void
  scale: number
  onScale: (scale: number) => void
  text: string
  onText: (text: string) => void
  textOptions: TextOptions
  onTextOptions: (options: TextOptions) => void
  onNote: (note: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Section title="Tool" summary={TOOL_COPY[tool].label} icon={TOOL_COPY[tool].icon} open>
        {/*
          The nine tools as pictures rather than as nine words in nine boxes.
          A shape is what you are choosing - a line, a box, a cylinder - so a
          grid of shapes is read at a glance where a grid of labels has to be
          spelled out. The word stays underneath: half of these are only
          unambiguous once you have used them.
        */}
        <div className="grid grid-cols-3 gap-1.5">
          {TOOLS.map((entry) => {
            const { label, key, hint, icon: Icon } = TOOL_COPY[entry]
            return (
              <button
                key={entry}
                type="button"
                onClick={() => onTool(entry)}
                title={`${hint} (${key})`}
                aria-pressed={tool === entry}
                className={`group/tool relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] transition ${
                  tool === entry
                    ? 'border-accent bg-accent/15 text-ink'
                    : 'border-line/50 bg-surface-raised/30 text-ink-muted hover:border-line hover:text-ink'
                }`}
              >
                <Icon
                  aria-hidden
                  className={`size-4 transition ${tool === entry ? 'text-accent' : ''}`}
                />
                {label}
                <span className="absolute top-1 right-1.5 font-mono text-[10px] opacity-50">
                  {key}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-xs text-ink-muted">{TOOL_COPY[tool].hint}</p>

        {/*
          Outline or solid, right under the tool rather than three sections
          down.

          It was a checkbox in "Where and how big", which is where nobody looked
          for it - so a rectangle came out hollow and read as a broken tool
          rather than as a setting. Two labelled buttons, next to the thing they
          are about, and only for the four tools that have an inside.
        */}
        {FILLABLE.has(tool) && (
          <div className="mt-2 flex gap-1.5">
            {(
              [
                [false, 'Outline', Square],
                [true, 'Filled', SquareStack],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={label}
                type="button"
                onClick={() => onFilled(value)}
                aria-pressed={filled === value}
                title={
                  value
                    ? 'Solid all the way through (F)'
                    : 'Just the edge, hollow inside (F)'
                }
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs transition ${
                  filled === value
                    ? 'border-accent bg-accent/15 text-ink'
                    : 'border-line/50 bg-surface-raised/30 text-ink-muted hover:border-line hover:text-ink'
                }`}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Holding" summary={describeModel(model)} icon={Package} open>
        <button
          type="button"
          onClick={onPickModel}
          className="flex items-center gap-2.5 rounded-xl border border-line/50 bg-surface-raised/40 px-2.5 py-2 text-left transition hover:border-accent/60"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/40 text-accent">
            <Blocks className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">{describeModel(model)}</span>
            <span className="block text-xs text-ink-muted">
              {blocksOnly
                ? 'Change — the blocks a world can keep'
                : 'Change — 1308 models across every pack'}
            </span>
          </span>
        </button>

        <Stepper
          label="Turn"
          icon={Rotate3d}
          value={rotation}
          onChange={onRotation}
          step={90}
          min={-270}
          max={270}
          suffix="°"
        />
        <Stepper
          label="Size"
          icon={Scaling}
          value={scale}
          onChange={onScale}
          step={0.25}
          min={0.25}
          max={6}
          suffix="×"
        />
      </Section>

      <Section
        title="Where and how big"
        summary={stacking ? `stacking · ${level}` : `level ${level}`}
        icon={Layers}
        open
      >
        {/*
          Stacking first, and the level under it, because that is the order they
          are now used in: building upward is what stacking does by itself, and
          the level is the thing you reach for only when you want to stop it.
        */}
        <Toggle
          icon={SquareStack}
          label="Stack on what is there"
          hint="Blocks land on top of whatever is under the pointer, so a wall grows by drawing over it. Off, everything lands on the level below."
          shortcut="S"
          checked={stacking}
          onChange={onStacking}
        />

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Stepper
              label={stacking ? 'Lowest level' : 'Level'}
              icon={Layers}
              value={level}
              onChange={onLevel}
              step={1}
              min={MIN_LEVEL}
              max={MAX_LEVEL}
            />
          </div>
          <Chip
            icon={ArrowUpFromLine}
            label="Snap to top"
            title="Move the drawing plane to the top of whatever is under the pointer (G)"
            onClick={onClimb}
          />
        </div>
        <p className="text-xs text-ink-muted">
          {stacking
            ? 'The floor nothing goes below — dig by lowering it.'
            : 'The grid you draw on.'}{' '}
          <kbd>,</kbd> and <kbd>.</kbd> move it.
        </p>

        {/*
          The door, set from where the pointer is rather than typed.

          Two numbers in a pair of steppers would be the obvious control and the
          wrong one: nobody knows the coordinates of the gap in their own wall,
          they know *where* it is, and they are already pointing at it.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            icon={DoorOpen}
            label="Spawn here"
            title="Put the spawn point under the pointer — this is where people arrive"
            onClick={onSpawnHere}
          />
          {world.spawn ? (
            <>
              <span className="font-mono text-xs text-ink-muted tabular-nums">
                {world.spawn.x}, {world.spawn.z}
              </span>
              <IconButton
                icon={X}
                label="Clear the spawn point"
                onClick={() => onWorld((current) => ({ ...current, spawn: null }))}
              />
            </>
          ) : (
            <span className="text-xs text-ink-muted">people arrive in the middle</span>
          )}
        </div>

        {/*
          Goals and race marks: the two ends of a pitch, and the two ends of a
          race. Placed from the pointer like the spawn, and for the same reason -
          you know where the gap in your wall is, not what its coordinates are.
        */}
        <div>
          <span className="mb-1.5 block font-mono text-[10px] tracking-[0.18em] text-ink-muted uppercase">
            Marks
          </span>
          <div className="flex flex-wrap gap-1.5">
            {MARKS.map((mark) => (
              <Chip
                key={mark.kind}
                icon={mark.icon}
                label={mark.label}
                tint={mark.tint}
                title={`Stand a ${mark.label.toLowerCase()} under the pointer`}
                onClick={() => onMark(mark.kind)}
              />
            ))}
            {world.marks.length > 0 && (
              <Chip
                icon={Trash2}
                label={`Clear ${world.marks.length}`}
                onClick={onClearMarks}
              />
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            What makes it a match, not a shape.
          </p>
        </div>

        {EXTRUDES.has(tool) && (
          <Stepper
            label="Height"
            icon={ArrowUpFromLine}
            value={height}
            onChange={onHeight}
            step={1}
            min={1}
            max={MAX_LEVEL}
          />
        )}

      </Section>

      {tool === 'text' && (
        <TextSection
          text={text}
          onText={onText}
          options={textOptions}
          onOptions={onTextOptions}
        />
      )}

      <GroundSection world={world} onWorld={onWorld} />
      <LightSection world={world} onWorld={onWorld} />
      <OutputSection world={world} onWorld={onWorld} onNote={onNote} />
    </div>
  )
}

/** The four marks, and the shape each one is. */
const MARKS: {
  kind: 'start' | 'finish' | 'red' | 'blue'
  label: string
  icon: LucideIcon
  tint?: string
}[] = [
  { kind: 'start', label: 'Start', icon: Flag },
  { kind: 'finish', label: 'Finish', icon: FlagTriangleRight },
  { kind: 'red', label: 'Red goal', icon: Goal, tint: 'text-red-400' },
  { kind: 'blue', label: 'Blue goal', icon: Goal, tint: 'text-sky-400' },
]

/** The wordmark controls. Only shown while the text tool is selected. */
function TextSection({
  text,
  onText,
  options,
  onOptions,
}: {
  text: string
  onText: (text: string) => void
  options: TextOptions
  onOptions: (options: TextOptions) => void
}) {
  const missing = unsupportedCharacters(text)
  const extent = textExtent(text, options)

  return (
    <Section title="Word" summary={`${extent.width}×${extent.height}`} icon={Type} open>
      <input
        value={text}
        onChange={(event) => onText(event.target.value)}
        placeholder="KXB"
        aria-label="Text to stamp"
        className="w-full rounded-lg border border-line/50 bg-transparent px-3 py-2 text-sm transition focus:border-accent focus:outline-none"
      />

      <div className="flex gap-1.5">
        {(
          [
            ['wall', 'Standing', RectangleHorizontal],
            ['floor', 'On the ground', Grid2x2],
          ] as const
        ).map(([plane, label, Icon]) => (
          <button
            key={plane}
            type="button"
            onClick={() => onOptions({ ...options, plane })}
            aria-pressed={(options.plane ?? 'wall') === plane}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition ${
              (options.plane ?? 'wall') === plane
                ? 'border-accent bg-accent/15 text-ink'
                : 'border-line/50 text-ink-muted hover:border-line hover:text-ink'
            }`}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <Stepper
        label="Letter size"
        icon={Scaling}
        value={options.scale ?? 1}
        onChange={(value) => onOptions({ ...options, scale: value })}
        step={1}
        min={1}
        max={6}
      />
      <Stepper
        label="Tracking"
        icon={Slash}
        value={options.tracking ?? 1}
        onChange={(value) => onOptions({ ...options, tracking: value })}
        step={1}
        min={0}
        max={6}
      />
      <Stepper
        label="Thickness"
        icon={Box}
        value={options.depth ?? 1}
        onChange={(value) => onOptions({ ...options, depth: value })}
        step={1}
        min={1}
        max={8}
      />

      {/* The question you have while typing, not after stamping forty blocks
          and undoing them. */}
      <p className="font-mono text-xs text-ink-muted tabular-nums">
        {extent.width} × {extent.height} cells
      </p>

      {missing.length > 0 && (
        <p className="text-xs text-amber-500">
          Not in this alphabet, so it will leave a gap: {missing.join(' ')}
        </p>
      )}
    </Section>
  )
}

function GroundSection({
  world,
  onWorld,
}: {
  world: BuilderWorld
  onWorld: (next: (current: BuilderWorld) => BuilderWorld) => void
}) {
  const ground = world.ground

  return (
    <Section
      title="Ground"
      summary={ground ? `${ground.cols}×${ground.rows}` : 'none'}
      icon={Grid2x2}
    >
      <Toggle
        icon={Grid2x2}
        label="Lay a floor"
        checked={ground !== null}
        onChange={(checked) =>
          onWorld((current) => ({
            ...current,
            ground: checked
              ? { cols: 25, rows: 25, model: 'bb10/dirt_with_grass', rounded: false }
              : null,
          }))
        }
      />

      {ground && (
        <>
          <Stepper
            label="Across"
            value={ground.cols}
            onChange={(value) =>
              onWorld((current) => ({
                ...current,
                ground: current.ground ? { ...current.ground, cols: value } : null,
              }))
            }
            step={2}
            min={1}
            max={161}
          />
          <Stepper
            label="Deep"
            value={ground.rows}
            onChange={(value) =>
              onWorld((current) => ({
                ...current,
                ground: current.ground ? { ...current.ground, rows: value } : null,
              }))
            }
            step={2}
            min={1}
            max={161}
          />
          <Toggle
            icon={Circle}
            label="Round the corners"
            checked={ground.rounded}
            onChange={(checked) =>
              onWorld((current) => ({
                ...current,
                ground: current.ground ? { ...current.ground, rounded: checked } : null,
              }))
            }
          />
          <p className="text-xs text-ink-muted">
            The floor is drawn, not placed — it costs nothing and cannot be rubbed out.
          </p>
        </>
      )}
    </Section>
  )
}

function LightSection({
  world,
  onWorld,
}: {
  world: BuilderWorld
  onWorld: (next: (current: BuilderWorld) => BuilderWorld) => void
}) {
  const set = (key: keyof BuilderWorld['light']) => (value: number) =>
    onWorld((current) => ({ ...current, light: { ...current.light, [key]: value } }))

  const sky = SKIES.find((entry) => entry.background === world.background)

  return (
    <>
      <Section title="Sky" summary={sky?.label ?? 'custom'} icon={CloudSun}>
        {/*
          A preset is a whole look, not a colour: the sky, the sun, the ambient
          fill and both lamps move together, because that is how any of them
          reads as a time of day. Picking one is an ordinary edit with undo
          behind it, so trying all four costs nothing.
        */}
        <div className="grid grid-cols-4 gap-1.5">
          {SKIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.hint}
              aria-pressed={world.background === entry.background}
              onClick={() => onWorld((current) => ({ ...current, ...entry.apply(current) }))}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] transition ${
                world.background === entry.background
                  ? 'border-accent bg-accent/15 text-ink'
                  : 'border-line/50 bg-surface-raised/30 text-ink-muted hover:border-line hover:text-ink'
              }`}
            >
              <entry.icon
                aria-hidden
                className={`size-4 ${world.background === entry.background ? 'text-accent' : ''}`}
              />
              {entry.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="color"
            value={world.background ?? '#101018'}
            onChange={(event) =>
              onWorld((current) => ({ ...current, background: event.target.value }))
            }
            aria-label="Sky colour"
            className="h-7 w-10 cursor-pointer rounded border border-line/60 bg-transparent"
          />
          <span className="flex-1">Behind everything</span>
          {/* Transparent is the export's default and worth being able to get
              back to: a cut-out standing on a page reads as a place. */}
          <Chip
            icon={SquareDashed}
            label={world.background ? 'Clear' : 'Transparent'}
            onClick={() => onWorld((current) => ({ ...current, background: null }))}
          />
        </label>
      </Section>

      <Section title="Light" summary={`sun ${world.light.sun}`} icon={Sun}>
        <Slide label="Sun from" value={world.light.azimuth} onChange={set('azimuth')} min={-180} max={180} step={1} unit="°" />
        <Slide label="Height" value={world.light.elevation} onChange={set('elevation')} min={2} max={89} step={1} unit="°" />
        <Slide label="Sun" value={world.light.sun} onChange={set('sun')} min={0} max={8} step={0.1} />
        <Slide label="Ambient" value={world.light.ambient} onChange={set('ambient')} min={0} max={4} step={0.05} />
        <Slide label="Sky bounce" value={world.light.hemisphere} onChange={set('hemisphere')} min={0} max={4} step={0.05} />
      </Section>

      <Section title="Coloured lights" summary={`rim ${world.light.rim}`} icon={Lightbulb}>
        <p className="text-xs text-ink-muted">
          The two tinted lamps that make a world look photographed rather than
          diagrammed. Master dial first, then each lamp.
        </p>

        <Slide label="Both" value={world.light.rim} onChange={set('rim')} min={0} max={4} step={0.05} />

        {world.lamps.map((lamp, index) => (
          <LampControls
            key={index}
            lamp={lamp}
            index={index}
            onLamp={(next) =>
              onWorld((current) => {
                const lamps: [WorldLamp, WorldLamp] = [current.lamps[0], current.lamps[1]]
                lamps[index] = { ...lamps[index], ...next }
                return { ...current, lamps }
              })
            }
          />
        ))}
      </Section>
    </>
  )
}

/**
 * Four looks, as whole rigs.
 *
 * Named after the light rather than the hour - "Dusk" says what you get, "18:00"
 * would not - and each one is the smallest set of values that produces it. They
 * deliberately move the lamps too: a night sky under a magenta and cyan pair is
 * the picture people mean when they say the stills look good, and a preset that
 * changed only the background would leave a midday world with a black sky
 * behind it.
 */
const SKIES: {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  background: string | null
  apply: (world: BuilderWorld) => Partial<BuilderWorld>
}[] = [
  {
    id: 'none',
    label: 'None',
    hint: 'No sky at all — the export is a cut-out.',
    icon: SquareDashed,
    background: null,
    apply: () => ({ background: null }),
  },
  {
    id: 'day',
    label: 'Day',
    hint: 'Overhead sun, pale sky, the lamps barely there.',
    icon: Sun,
    background: '#bcd8f2',
    apply: (world) => ({
      background: '#bcd8f2',
      light: { ...world.light, elevation: 62, sun: 2.8, ambient: 0.9, hemisphere: 1.2, rim: 0.35 },
    }),
  },
  {
    id: 'dusk',
    label: 'Dusk',
    hint: 'Low sun, warm sky, both lamps doing the work.',
    icon: Sunset,
    background: '#3b2a4d',
    apply: (world) => ({
      background: '#3b2a4d',
      light: { ...world.light, elevation: 14, sun: 1.6, ambient: 0.5, hemisphere: 0.6, rim: 1.4 },
    }),
  },
  {
    id: 'night',
    label: 'Night',
    hint: 'No sun to speak of. Everything you see is the two lamps.',
    icon: Moon,
    background: '#0d0f1a',
    apply: (world) => ({
      background: '#0d0f1a',
      light: { ...world.light, elevation: 8, sun: 0.35, ambient: 0.22, hemisphere: 0.3, rim: 2.2 },
    }),
  },
]

/** One lamp: where it stands, what colour it is, how bright. */
function LampControls({
  lamp,
  index,
  onLamp,
}: {
  lamp: WorldLamp
  index: number
  onLamp: (next: Partial<WorldLamp>) => void
}) {
  return (
    <div className="rounded-xl border border-line/40 bg-surface-raised/40 p-2">
      <label className="mb-1 flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="color"
          value={lamp.color}
          onChange={(event) => onLamp({ color: event.target.value })}
          aria-label={`Lamp ${index + 1} colour`}
          className="h-7 w-10 cursor-pointer rounded border border-line/60 bg-transparent"
        />
        <Lightbulb className="size-3.5" aria-hidden style={{ color: lamp.color }} />
        <span>Lamp {index + 1}</span>
      </label>
      <Slide
        label="Brightness"
        value={lamp.intensity}
        onChange={(value) => onLamp({ intensity: value })}
        min={0}
        max={4}
        step={0.05}
      />
      <Slide
        label="From"
        value={lamp.azimuth}
        onChange={(value) => onLamp({ azimuth: value })}
        min={-180}
        max={180}
        step={1}
        unit="°"
      />
      <Slide
        label="Up"
        value={lamp.height}
        onChange={(value) => onLamp({ height: value })}
        min={-4}
        max={30}
        step={0.5}
      />
    </div>
  )
}

function OutputSection({
  world,
  onWorld,
  onNote,
}: {
  world: BuilderWorld
  onWorld: (next: (current: BuilderWorld) => BuilderWorld) => void
  onNote: (note: string) => void
}) {
  // Through the store rather than into state on mount, so writing a slot
  // updates the list without anybody remembering to refresh it. The server
  // snapshot is "none yet", which is also what the first client render sees.
  const slots = useSlots()
  const share = shareSize(world)

  return (
    <Section
      title="This file"
      summary={`${world.placements.length} placed`}
      icon={FolderOpen}
    >
      {/*
        Offered first, and offered always rather than only on an empty world:
        the second starter somebody loads is usually the one they meant, and a
        picker that disappears the moment you draw a block is a picker you have
        to clear the world to get back. Loading one goes through `onWorld`, so
        it is an ordinary edit with undo behind it - which is the whole
        confirmation this needs.
      */}
      <div>
        <span className="mb-1.5 block font-mono text-[10px] tracking-[0.18em] text-ink-muted uppercase">
          Start from
        </span>
        <div className="flex flex-wrap gap-1.5">
          {STARTERS.map((starter) => (
            <Chip
              key={starter.id}
              icon={Sparkles}
              label={starter.name}
              title={starter.hint}
              onClick={() => {
                const built = starter.build()
                onWorld(() => built)
                onNote(`loaded “${starter.name}” — ${built.placements.length} placed · undo goes back`)
              }}
            />
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block font-mono text-[10px] tracking-[0.18em] text-ink-muted uppercase">
          Name
        </span>
        <input
          value={world.name}
          onChange={(event) => onWorld((current) => ({ ...current, name: event.target.value }))}
          className="w-full rounded-lg border border-line/50 bg-transparent px-3 py-2 text-sm transition focus:border-accent focus:outline-none"
        />
      </label>

      <Stepper
        label="Export width"
        value={world.width}
        onChange={(value) => onWorld((current) => ({ ...current, width: value }))}
        step={80}
        min={64}
        max={4096}
      />
      <Stepper
        label="Export height"
        value={world.height}
        onChange={(value) => onWorld((current) => ({ ...current, height: value }))}
        step={80}
        min={64}
        max={4096}
      />

      <Slide
        label="Lens"
        value={world.camera.fov}
        onChange={(value) =>
          onWorld((current) => ({ ...current, camera: { ...current.camera, fov: value } }))
        }
        min={10}
        max={110}
        step={1}
        unit="°"
      />

      <p className="font-mono text-xs text-ink-muted tabular-nums">
        {world.placements.length} placed ·{' '}
        {share.fits ? (
          `link is ${share.length} characters`
        ) : (
          <span className="text-amber-500">
            too big to link ({share.length} of {MAX_SHARE_LENGTH}) — send the file
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Chip
          icon={HardDriveDownload}
          label="Keep in this browser"
          onClick={() => {
            saveSlot(world)
            onNote(`kept “${world.name}” in this browser`)
          }}
        />
        <Chip
          icon={FileJson}
          label="Download .json"
          onClick={() => {
            downloadText(serialiseWorld(world), `${world.name || 'world'}.json`)
            onNote(`saved ${world.name || 'world'}.json`)
          }}
        />
        {/* Undoable like any other edit, which is why it needs no "are you
            sure" - the confirmation is that Cmd-Z puts it all back. */}
        <Chip
          icon={Trash2}
          label="Clear all"
          disabled={world.placements.length === 0}
          onClick={() => {
            const gone = world.placements.length
            onWorld((current) => ({ ...current, placements: [] }))
            onNote(`cleared ${gone} placements — undo puts them back`)
          }}
        />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line/50 px-2.5 py-1 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink">
          <Download className="size-3.5" aria-hidden />
          Open file
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              const loaded = deserialiseWorld(await file.text())
              onWorld(() => loaded)
              onNote(`opened “${loaded.name}” — ${loaded.placements.length} placed`)
              // Cleared so opening the same file twice fires the change event
              // the second time.
              event.target.value = ''
            }}
          />
        </label>
      </div>

      {slots.length > 0 && (
        <ul className="space-y-1">
          {slots.map((slot) => (
            <li key={slot.name} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const loaded = loadSlot(slot.name)
                  if (!loaded) return
                  onWorld(() => loaded)
                  onNote(`opened “${loaded.name}”`)
                }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line/40 bg-surface-raised/40 px-2.5 py-1.5 text-left text-xs transition hover:border-accent/60"
              >
                <FolderOpen className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{slot.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-muted tabular-nums">
                  {slot.placements}
                </span>
              </button>
              <IconButton
                icon={Trash2}
                label={`Forget ${slot.name}`}
                onClick={() => deleteSlot(slot.name)}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/**
 * A button that is a word and a picture, in the shape the studio uses for its
 * secondary actions.
 *
 * Everything in this panel that *does* something rather than sets a number is
 * one of these, which is what stops "Spawn here", "Snap to top" and "Download
 * .json" reading as three different kinds of control.
 */
function Chip({
  icon: Icon,
  label,
  title,
  tint,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  label: string
  title?: string
  /** A colour for the icon, where the mark itself has one. */
  tint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-full border border-line/50 px-2.5 py-1 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-40 disabled:hover:border-line/50"
    >
      <Icon className={`size-3.5 shrink-0 ${tint ?? ''}`} aria-hidden />
      {label}
    </button>
  )
}

/** A picture on its own, for the actions whose label would only repeat the row. */
function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-7 shrink-0 place-items-center rounded-lg border border-line/40 text-ink-muted transition hover:border-red-500/50 hover:text-red-400"
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  )
}

/**
 * A switch, dressed as a row rather than as a checkbox.
 *
 * The native box is still the control - it is what the keyboard and the screen
 * reader get - and everything around it is the part you can see from across the
 * panel: an icon tile that lights up, and the whole row as the hit target.
 */
function Toggle({
  icon: Icon,
  label,
  hint,
  shortcut,
  checked,
  onChange,
}: {
  icon: LucideIcon
  label: string
  hint?: string
  shortcut?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-2.5 py-2 transition ${
        checked
          ? 'border-accent/50 bg-accent/10'
          : 'border-line/40 bg-surface-raised/30 hover:border-line'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`grid size-7 shrink-0 place-items-center rounded-lg border transition ${
          checked ? 'border-accent/70 text-accent' : 'border-line/50 text-ink-muted'
        }`}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 text-xs">
        <span className={checked ? 'text-ink' : 'text-ink-muted'}>{label}</span>
        {shortcut && (
          <span className="ml-1.5 font-mono text-[10px] text-ink-muted opacity-70">
            {shortcut}
          </span>
        )}
        {hint && <span className="mt-0.5 block text-ink-muted">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * A number with two buttons.
 *
 * Preferred over a bare input for everything on a lattice: the values are all
 * whole steps, and a stepper cannot be left holding "1." mid-keystroke the way
 * a text field can. The optional icon is for the ones that sit alone in a
 * section, where the label is the only thing telling you what you are changing.
 */
function Stepper({
  label,
  icon: Icon,
  value,
  onChange,
  step,
  min,
  max,
  suffix = '',
}: {
  label: string
  icon?: LucideIcon
  value: number
  onChange: (value: number) => void
  step: number
  min: number
  max: number
  suffix?: string
}) {
  const clamp = (next: number) =>
    // Rounded to the step's own precision, so 0.25 steps do not accumulate
    // into 1.7500000000000002 after seven presses.
    Math.min(max, Math.max(min, Math.round(next * 1000) / 1000))

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
        {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label={`${label} down`}
          className="grid size-6 place-items-center rounded-lg border border-line/50 text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-40 disabled:hover:border-line/50"
        >
          <Minus className="size-3" aria-hidden />
        </button>
        <span className="w-14 text-center font-mono text-xs tabular-nums">
          {value}
          {suffix}
        </span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label={`${label} up`}
          className="grid size-6 place-items-center rounded-lg border border-line/50 text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-40 disabled:hover:border-line/50"
        >
          <Plus className="size-3" aria-hidden />
        </button>
      </span>
    </div>
  )
}
