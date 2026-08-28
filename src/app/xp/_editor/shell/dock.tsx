'use client'

import 'dockview-react/dist/styles/dockview.css'
import '@/app/xp/_editor/shell/dock.css'

/**
 * `dockview-react`, not `dockview`.
 *
 * Version 7 split the React bindings into their own package, and the parent
 * still installs and type-checks - it just re-exports `dockview-core`, so
 * `DockviewReact` is missing with a message that reads like the component was
 * removed rather than moved.
 */
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { heldFrom } from '@/app/xp/_runtime/body/skinned'
import type { DockviewApi } from 'dockview-react'
import { Inspector, Properties } from '@/app/xp/_editor/panels/inspector'
import { BehaviourPanel } from '@/app/xp/_editor/panels/behaviour'
import { DataPanel } from '@/app/xp/_editor/panels/data-panel'
import { FlowPanel } from '@/app/xp/_editor/panels/flow-panel'
import { WordsPanel } from '@/app/xp/_editor/panels/words-panel'
// The caps belong to the surface the document is *called something in*, not to
// the format - see `renameDocument`, which deliberately has neither.
import { XP_BLURB_MAX, XP_NAME_MAX } from '@/domain/xps/events'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { ScriptsPanel } from '@/app/xp/_editor/panels/scripts'
import { MODEL_DRAG, Picker } from '@/app/xp/_editor/panels/picker'
import { BLUEPRINT_DRAG, BlueprintsPanel, type StarterId } from '@/app/xp/_editor/panels/blueprints'
import { Camera } from '@/app/xp/_editor/panels/camera'
import { Mode } from '@/app/xp/_editor/panels/mode'
import { Talk } from '@/app/xp/_editor/panels/talk'
import { Scenes } from '@/app/xp/_editor/panels/scenes'
import { Movies } from '@/app/xp/_editor/panels/movies'
import { Animator } from '@/app/xp/_editor/animator/animator'
import type { XpClip } from '@kxb/xp/clips'
import type { ToolWindow } from '@/app/xp/_editor/shell/rail'
import type { FlowTarget } from '@kxb/xp/edit'
import { FillButton, useFill } from '@/app/xp/_editor/shell/fill'
import {
  Stage,
  SNAPS,
  type Dragged,
  type GizmoMode,
  type Selected,
  type Snap,
  type Tool,
  type PlacementPatch,
  type Transform,
} from '@/app/xp/_editor/stage/stage'
import type { Cell, EditState, PlaceTarget, Pivot, TriggerPatch } from '@kxb/xp/edit'
import type {
  Assign,
  Blueprint,
  Capability,
  BodySpec,
  Condition,
  EntitySpec,
  Mark,
  Part,
  PlayerKey,
  PlayerLook,
  CameraAxis,
  CameraKind,
  PlayerRole,
  Preset,
  Sides,
  Trigger,
  Verb,
  XpDocument,
  XpField,
  FlowStarterId,
  FlowStep,
} from '@kxb/xp'
import { dataOf, type Finish } from '@kxb/xp'
import { solidsFor } from '@kxb/xp/engine'
import { useRefusal } from '@/app/i18n/use-refusal'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * Panels you can drag, split and stack - and where they were last time.
 *
 * Called `dock.tsx` and not `layout.tsx`, which is not a preference: `layout`
 * is a reserved filename in the App Router, so a file with that name anywhere
 * under `src/app` is treated as the route's layout and must default-export a
 * component taking `children`. The error says a default export is missing,
 * which reads like a mistake in the file rather than a name Next had already
 * claimed.
 *
 * ---------------------------------------------------------------------------
 * A library, and why
 * ---------------------------------------------------------------------------
 * `dockview` rather than a hand-written dock, for the same reason the gizmo is
 * drei's: splitters, drop zones, tab groups, floating groups and the
 * serialisation of all of it is a fortnight of work that has been done
 * correctly many times, and none of it is what this project is about. The part
 * worth writing is which panels exist and what they know.
 *
 * ---------------------------------------------------------------------------
 * Panels read a context; they are not given props
 * ---------------------------------------------------------------------------
 * This is the one thing that has to be right or the whole layout is a
 * performance problem. Dockview holds its panel components across drags and
 * re-arrangements, and passing live editor state through `params` would mean
 * tearing panels down and rebuilding them every time somebody moves the mouse
 * over the viewport.
 *
 * So the panels take nothing and read everything from a context above the dock.
 * The dock itself renders once; the panels re-render when what they read
 * changes, which is React doing its ordinary job.
 */

export interface EditorApi {
  state: EditState
  tool: Tool
  setTool: (tool: Tool) => void
  model: string
  setModel: (model: string) => void
  rotation: number
  setRotation: (rotation: number) => void
  level: number
  setLevel: (level: number) => void
  selected: Selected
  setSelected: (selected: Selected) => void
  gizmo: GizmoMode
  setGizmo: (mode: GizmoMode) => void
  /** How far a gizmo handle moves between stops, or null for free. */
  snap: Snap
  setSnap: (snap: Snap) => void
  pivot: Pivot
  setPivot: (pivot: Pivot) => void
  onStroke: (cells: Cell[]) => void
  onErase: (cells: Cell[]) => void
  onEntity: (index: number, patch: Partial<EntitySpec>) => void
  /** Move or turn one piece of architecture, by its index in the document. */
  onPlacement: (index: number, patch: PlacementPatch) => void
  onRemove: (index: number) => void
  /** Take away whatever is selected, whichever list it is in. */
  onRemovePlacement: (index: number) => void
  onPick: (selected: NonNullable<Selected>) => void
  /** The cell under the pointer, written into a ref rather than into state. */
  onHover: (cell: Cell) => void
  /**
   * A model or a blueprint dragged out of a panel and let go.
   *
   * `at` is null when it landed somewhere with no world position of its own -
   * the Scene panel - and the shell falls back to where the pointer last was.
   * The kind decides what comes out: a model lays down a placement, a blueprint
   * makes a named entity.
   */
  onDropModel: (dragged: Dragged | null, at: { x: number; y: number; z: number } | null) => void
  /** A new mark, under the pointer, selected once it exists. */
  onAddMark: (kind: Mark['kind']) => void
  /**
   * Turn a placement into a blueprint and an entity of it, in its place.
   *
   * The placement is *consumed* - see `blueprintFrom`. A button that only added
   * the blueprint would leave an entity inside the scenery it was made from,
   * and two things in one cell that look identical and behave differently is
   * worse than either.
   */
  onBlueprintFrom: (index: number) => void
  onMark: (index: number, patch: Partial<Mark>) => void
  onRemoveMark: (index: number) => void
  /** Solid ground everywhere at `floorY`, so an empty level is standable. */
  onGround: (ground: boolean) => void
  /** Falling past `floorY` puts the player back at the spawn. */
  onRestart: (restart: boolean) => void
  /** Falling past `floorY` is a death rather than a walk back. */
  onFatal: (fatal: boolean) => void
  /** The sky. An empty string clears it, which means transparent. */
  onBackground: (colour: string) => void
  /** What mode the document is, and what ends it. `null` on a limit clears it. */
  onRules: (patch: {
    preset?: Preset
    sides?: Sides | null
    scoreLimit?: number | null
    timeLimit?: number | null
    assign?: Assign | null
  }) => void
  /**
   * Where the world is watched from. `null` on a number clears it.
   *
   * Beside `onRules` rather than folded into it: the two are different blocks
   * with different rules about what absent means, and `./camera` opens by
   * saying the camera block is an input mode that happens to also move the
   * camera - which is not a thing to bury inside "what game is this".
   */
  onCamera: (patch: {
    kind?: CameraKind
    axis?: CameraAxis
    distance?: number | null
    span?: number | null
    x?: number | null
    y?: number | null
    z?: number | null
    yaw?: number | null
    pitch?: number | null
    behind?: number | null
    above?: number | null
    beside?: number | null
    fov?: number | null
    far?: number | null
  }) => void
  /**
   * Whether anybody in this level may say anything.
   *
   * Two booleans and no `null`, unlike the blocks above, because there is no
   * third state to reach for: absent already means on, so turning something on
   * *is* clearing the field, and `setTalk` does that rather than making the
   * panel say it twice.
   */
  onTalk: (patch: { chat?: boolean; emotes?: boolean }) => void
  /**
   * The name, which is the project's as well as the document's.
   *
   * Async and answering with a name because the space may hand back a different
   * one - a name already taken comes back numbered. See `EditableTitle`, which
   * is the other way in to the same call.
   */
  onRenameDocument: (
    name: string,
  ) => Promise<{ ok: true; name: string } | { ok: false; error: string }>
  /** What the level is, in a sentence. Empty takes the field away. */
  onBlurb: (blurb: string) => void
  /**
   * What this level's cartridge is made of, on a shelf.
   *
   * Beside `onRules` rather than inside it: a finish is not a rule, it is what
   * the level looks like as an *object* - see `@kxb/xp`'s `./finish` - and the
   * two blocks round-trip separately.
   */
  onFinish: (finish: Finish | null) => void
  /** And its colour, as a hue. `null` lets the shelf derive one. */
  onColour: (hue: number | null) => void
  /** One phrase in one language. Empty takes the row out - see `setPhrase`. */
  onPhrase: (locale: string, key: string, text: string) => void
  onLanguageRemove: (locale: string) => void
  /** Who a person arrives as. `null` on a field clears it. */
  onPlayer: (patch: {
    blueprint?: string | null
    avatarSocket?: string | null
    weapon?: PlayerRole['weapon'] | null
    keys?: readonly PlayerKey[] | null
    /** What everybody wears when this level names no body. See `XpPlayer.wears`. */
    wears?: PlayerLook | null
  }) => void
  /** Where a person arrives when no spawn mark says otherwise. */
  onSpawn: (patch: Partial<{ x: number; y: number; z: number; facing: number }>) => void
  /** Which blueprint the Rules panel has open. Above the panel so a drag keeps it. */
  blueprint: string | null
  setBlueprint: (name: string | null) => void
  onTriggerAdd: (blueprint: string, trigger?: Trigger) => void
  onTriggerChange: (blueprint: string, index: number, patch: TriggerPatch) => void
  onTriggerRemove: (blueprint: string, index: number) => void
  onVerbAdd: (blueprint: string, trigger: number, verb?: Verb) => void
  onVerbChange: (blueprint: string, trigger: number, index: number, verb: Verb) => void
  onVerbRemove: (blueprint: string, trigger: number, index: number) => void
  /** Which script the Script panel has open. Held here so a drag does not close it. */
  /**
   * What the level keeps — declared, renamed, undeclared.
   *
   * No `open` beside these, unlike the scripts four below: a script panel edits
   * one source at a time and needs to know which, and the Data panel shows the
   * whole block at once because a model is a list you read down.
   */
  onDataWrite: (name: string, field: XpField) => void
  /**
   * The two decisions in a flow that are a list and a choice rather than a
   * graph. Pointing an arrow somewhere else is not here on purpose - see the
   * note at the top of ./flow-panel.
   */
  onPhaseAllow: (phase: string, allow: readonly string[] | undefined) => void
  onPhaseSays: (phase: string, says: string) => void
  onPhaseWho: (phase: string, who: 'turn' | null) => void
  onRounds: (rounds: number | null) => void
  /** Which of the level's rounds the flow panel edits, and how to change it. */
  flowTarget: FlowTarget
  setFlowTarget: (target: FlowTarget) => void
  /**
   * The room the editor is pointed at, and the document seen from inside it.
   *
   * `here` is `state.document` with the standing room's `world`, `spawn` and
   * `entities` in place of the root's - see `roomOf` in ../editor. A panel that
   * is about a *place* takes it: the viewport, the Inspector's three lists, the
   * Properties of whatever is selected, the ground and background fields, the
   * counts. A panel that is about the whole file - blueprints, scripts, words,
   * data, the flow, the mode - takes `state.document`, because those are the
   * game rather than the room it is played in.
   *
   * `standing` is the key that produced it, for the one control that is about
   * the choice itself. `undefined` is the level's own world.
   */
  here: XpDocument
  standing: PlaceTarget
  onOpenRoom: (where: PlaceTarget) => void
  /** A way into another room, put down in the one being edited. See `addDoor`. */
  onDoor: (to: string) => void
  /** The places this level holds. See ../panels/scenes. */
  onSceneAdd: (name: string) => void
  onSceneRename: (from: string, to: string) => void
  onSceneRemove: (name: string) => void
  /**
   * The movie half: a place becoming a shot, and the cuts made out of shots.
   *
   * `onMovieOpen` and `onCompose` are the two that leave the dock entirely -
   * they take over the screen, the way Try does, and Escape is what ends them.
   * Neither is a panel toggle, which is why neither is on the icon rail.
   */
  onMovieNew: () => void
  onMovieStop: (where: PlaceTarget) => void
  onMovieImport: (into: PlaceTarget, from: string) => void
  onMovieOpen: (where: PlaceTarget) => void
  onCutAdd: () => void
  onCutRename: (id: string, name: string) => void
  onCutRemove: (id: string) => void
  onCompose: (id: string) => void
  onFlowStart: (phase: string) => void
  onPhaseAdd: (name: string) => void
  onPhaseRemove: (name: string) => void
  onStepAdd: (from: string, step: FlowStep) => void
  onStepRemove: (from: string, at: number) => void
  /** What a phase does on entry, which is the same `Verb[]` a rule's `do` is. */
  onPhaseVerbAdd: (phase: string) => void
  onPhaseVerbChange: (phase: string, at: number, verb: Verb) => void
  onPhaseVerbRemove: (phase: string, at: number) => void
  /** A place becoming a run, and back. */
  onStartFlow: (name: string) => void
  onRemoveFlow: () => void
  /** A whole round from one of the shapes a game usually has. */
  onStarter: (id: FlowStarterId) => void
  onCapabilities: (capabilities: readonly Capability[]) => void
  onWins: (wins: Condition | null) => void
  onDataRename: (from: string, to: string) => void
  onDataRemove: (name: string) => void
  script: string | null
  setScript: (name: string | null) => void
  onScriptAdd: (name: string) => void
  onScriptWrite: (name: string, source: string) => void
  onScriptRename: (from: string, to: string) => void
  onScriptRemove: (name: string) => void
  onScriptAttach: (blueprint: string, name: string | null) => void
  /**
   * The animator's whole library, written into the level.
   *
   * A block rather than one clip, because that is how the animator holds them -
   * see `setClips`. The panel is the only caller.
   */
  onClips: (clips: Readonly<Record<string, XpClip>>) => void
  onBlueprintAdd: (name: string) => void
  /** A ready-made blueprint - see `STARTERS` in the blueprints panel. */
  onStarterAdd: (id: StarterId) => void
  /** `body: null` removes the physics block; see the blueprints panel's own
   * `onChange`, which this is passed straight to. */
  onBlueprintChange: (
    name: string,
    patch: Partial<Omit<Blueprint, 'script' | 'triggers' | 'body'>> & {
      body?: BodySpec | null
    },
  ) => void
  onBlueprintRename: (from: string, to: string) => void
  onBlueprintRemove: (name: string) => void
  /** The models a blueprint is made of. See `Part`. */
  onPartAdd: (blueprint: string) => void
  onPartChange: (blueprint: string, index: number, patch: Partial<Part>) => void
  onPartRemove: (blueprint: string, index: number) => void
}

const Editor = createContext<EditorApi | null>(null)

export function EditorProvider({
  api,
  children,
}: {
  api: EditorApi
  children: React.ReactNode
}) {
  return <Editor.Provider value={api}>{children}</Editor.Provider>
}

/** Every panel calls this. Throws rather than returning null: a panel outside the provider is a wiring mistake, not a state. */
function useEditor(): EditorApi {
  const api = useContext(Editor)
  if (!api) throw new Error('a panel was rendered outside the editor')
  return api
}

/**
 * One panel sending you to another.
 *
 * Separate from `EditorApi` on purpose: that context is the document and what
 * is selected in it, which the shell owns, and this is the dock's own furniture,
 * which only the dock knows about. Threading a `DockviewApi` through the editor
 * shell to get here would put a layout library's type in the signature of
 * everything that renders a panel.
 *
 * The default is a no-op rather than a throw. A panel rendered outside a dock -
 * a test, a storybook, the day one of these is used somewhere else - should
 * still draw; a link that goes nowhere is a worse failure than a crash only in
 * the one case where somebody clicks it, and much better in the rest.
 */
export const Navigate = createContext<(id: string) => void>(() => {})

function useShowWindow(): (id: string) => void {
  return useContext(Navigate)
}

// ---------------------------------------------------------------------------
// The panels
// ---------------------------------------------------------------------------

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto bg-neutral-950 p-3">{children}</div>
}

function ViewportPanel() {
  const api = useEditor()
  return (
    <div className="relative h-full w-full">
      <Stage
        document={api.here}
        level={api.level}
        tool={api.tool}
        onStroke={api.onStroke}
        onErase={api.onErase}
        selected={api.selected}
        gizmo={api.gizmo}
        model={api.model}
        brushRotation={api.rotation}
        snap={api.snap}
        onTransform={(patch) => {
          // One gizmo, two lists. The dispatch is here rather than inside the
          // stage because the stage's job is to report where the handle went,
          // not to know which array the answer belongs in.
          if (!api.selected) return
          if (api.selected.kind === 'entity') api.onEntity(api.selected.index, patch)
          else if (api.selected.kind === 'mark') {
            /**
             * A mark turns by `facing` rather than by `rotation`, and has no
             * scale at all. One handle, three lists, and this is the only place
             * that has to know they are not the same fields.
             *
             * Built key by key rather than spread with the odd one renamed: a
             * patch carrying `x: undefined` is not the same as a patch with no
             * `x`, because the edit layer spreads it over what is already there
             * and the explicit `undefined` wins.
             */
            api.onMark(api.selected.index, {
              ...(patch.x === undefined ? {} : { x: patch.x }),
              ...(patch.y === undefined ? {} : { y: patch.y }),
              ...(patch.z === undefined ? {} : { z: patch.z }),
              ...(patch.rotation === undefined ? {} : { facing: Math.round(patch.rotation) }),
            })
          } else if (api.selected.kind === 'player') {
            /**
             * The player's handle moves the document's own spawn, and turns it
             * by `facing` the way a mark does. No scale: `Gizmo` already falls
             * back to move for both, and a spawn has no size to report.
             */
            api.onSpawn({
              ...(patch.x === undefined ? {} : { x: patch.x }),
              ...(patch.y === undefined ? {} : { y: patch.y }),
              ...(patch.z === undefined ? {} : { z: patch.z }),
              ...(patch.rotation === undefined ? {} : { facing: Math.round(patch.rotation) }),
            })
          } else api.onPlacement(api.selected.index, patch)
        }}
        onPick={api.onPick}
        onHover={api.onHover}
        onDrop={(model, at) => api.onDropModel(model, at)}
      />
      {/**
        * The handle picker, over the viewport rather than in a panel.
        *
        * It was in the Scene panel, which is where a *property* belongs - and
        * this is not one. Which handle you are holding is a fact about the
        * gesture you are in the middle of, so it wants to be under the hand
        * that is doing it, not across the window next to a list of entities.
        *
        * Only while something is selected: three buttons that do nothing are
        * three things to wonder about.
        */}
      {api.selected ? <Handles gizmo={api.gizmo} onGizmo={api.setGizmo} /> : null}

      {/* Short, because everything it used to list is now somewhere you can
          see it: the tools are a panel, the handles are three icons above, and
          both carry their own keys. A line of help that repeats the interface
          is a line that wraps across the level in a narrow window. */}
      <p className="pointer-events-none absolute bottom-0 left-0 p-3 font-mono text-[10px] text-white/40">
        {xpEditorDict(useLocale()).chrome.viewportHint}
      </p>
    </div>
  )
}

function ToolsPanel() {
  const api = useEditor()
  const t = xpEditorDict(useLocale()).tools
  return (
    <Frame>
      {/* The tools themselves are in the top bar now - see ./toolbar. What is
          left here is everything *about* a tool rather than which one you are
          holding: how high you are working, what is under the world, and how
          far a handle moves. */}
      <PanelLabel className="mb-1.5 mt-4">{t.level}</PanelLabel>
      <div className="flex items-center gap-1.5">
        <Small onClick={() => api.setLevel(Math.max(0, api.level - 1))} label="−" />
        <div className="flex-1 text-center font-mono text-xs text-neutral-300">y = {api.level}</div>
        <Small onClick={() => api.setLevel(api.level + 1)} label="+" />
      </div>
      <Hint className="mt-1 leading-tight">{t.levelHint}</Hint>

      {/*
        Beside the level, because it is the same question from the other end:
        which height things happen at, and whether there is anything down there.
      */}
      <label className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-neutral-400">
        <input
          type="checkbox"
          checked={api.here.world.ground}
          onChange={(event) => api.onGround(event.target.checked)}
          className="accent-violet-500"
        />
        {fill(t.groundAt, { y: api.here.world.floorY })}
      </label>
      <Hint className="mt-1 leading-tight">{t.groundHint}</Hint>

      {/*
        Only when there is a fall to have. With ground on, a body never reaches
        the height that would send it back, so the parser refuses the pair - and
        a checkbox that saves a document the editor cannot reopen is the one
        thing this panel must not offer.
      */}
      {api.here.world.ground ? null : (
        <>
          <label className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={api.here.world.restart}
              onChange={(event) => api.onRestart(event.target.checked)}
              className="accent-violet-500"
            />
            {t.fallingRestarts}
          </label>
          <Hint className="mt-1 leading-tight">{t.fallingRestartsHint}</Hint>

          {/*
            The third answer to the same question, so it sits with the other
            two. Ticking one clears the other - `setWorld` does that rather than
            refusing, because a tick is a thing somebody just did and the parser
            refuses a document carrying both.
          */}
          <label className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={api.here.world.fatal}
              onChange={(event) => api.onFatal(event.target.checked)}
              className="accent-violet-500"
            />
            {t.fallingKills}
          </label>
          <Hint className="mt-1 leading-tight">{t.fallingKillsHint}</Hint>
        </>
      )}

      <PanelLabel className="mb-1.5 mt-4">{t.background}</PanelLabel>
      {/*
        A text field with a clear, not a colour swatch.

        Empty is the interesting value here rather than a missing one: a
        document with no background lets the page show through, which is how the
        runtime sits inside the site instead of covering it. A swatch always
        holds a colour, so it could not express the thing most documents want.

        Free text rather than a validated colour, because three.js parses named
        colours, `rgb()` and `hsl()` - a pattern strict enough to catch a typo
        would refuse half of what works.
      */}
      <div className="flex gap-1.5">
        <input
          value={api.here.world.background ?? ''}
          placeholder={t.transparent}
          onChange={(event) => api.onBackground(event.target.value)}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
        <span
          aria-hidden
          title={api.here.world.background ?? t.transparent}
          className="h-7 w-7 shrink-0 rounded border border-neutral-800"
          style={{ background: api.here.world.background ?? 'transparent' }}
        />
      </div>
      <Hint className="mt-1 leading-tight">{t.backgroundHint}</Hint>

      <PanelLabel className="mb-1.5 mt-4">{t.snap}</PanelLabel>
      <div className="flex gap-1.5">
        {SNAPS.map((step) => (
          <button
            key={String(step)}
            type="button"
            onClick={() => api.setSnap(step)}
            title={
              step === null
                ? t.snapFree
                : fill(t.snapStep, { step })
            }
            className={`flex-1 rounded border px-1 py-1 font-mono text-[11px] transition-colors ${
              api.snap === step
                ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
            }`}
          >
            {step === null ? t.snapOff : step}
          </button>
        ))}
      </div>
      <Hint className="mt-1 leading-tight">{t.snapHint}</Hint>

      <PanelLabel className="mb-1.5 mt-4">{fill(t.turn, { n: api.rotation })}</PanelLabel>
      <Small
        onClick={() => api.setRotation((api.rotation + 90) % 360)}
        label={t.rotate}
        wide
      />
    </Frame>
  )
}

/**
 * The two panels that look alike, told apart at the point of the gesture.
 *
 * Dragging a model lays down a *placement*; dragging a blueprint makes an
 * *entity*. `blueprints.tsx` calls that the one genuinely confusing part of this
 * editor, and it is right - but the confusion is not the split, which is real.
 * It is that the two panels never say which of the two they are, so the only
 * way to learn it is to drop one of each and read the Scene tree afterwards.
 *
 * So each panel carries one line saying what a drag out of it produces. A
 * legend rather than a tooltip: the question is asked while looking at the
 * grid, not while hovering one tile of it.
 */
function Legend({ children }: { children: React.ReactNode }) {
  return (
    <Hint className="mb-2 leading-tight">{children}</Hint>
  )
}

function ModelPanel() {
  const api = useEditor()
  const t = xpEditorDict(useLocale()).legend
  const show = useShowWindow()
  return (
    <Frame>
      <Legend>
        {t.modelLead} <span className="text-neutral-400">{t.scenery}</span> {t.modelTail}
      </Legend>
      <Picker value={api.model} onChange={api.setModel} />
      {/*
        The other half of the answer, and the reason this sits under the picker
        rather than in the Blueprints panel: "how do I combine two models" is a
        question somebody has while looking at models. Composition already
        exists - `Blueprint.parts`, with parents and sockets - so this is a
        signpost to a room that is already built, not a promise.
      */}
      <Hint className="mt-3 border-t border-neutral-900 pt-2 leading-tight">
        {t.joinedLead} <span className="text-neutral-400">{t.parts}</span>
        {t.joinedTail}{' '}
        <button
          type="button"
          onClick={() => show('blueprints')}
          className="text-violet-300 underline-offset-4 hover:underline"
        >
          {t.toBlueprints}
        </button>
      </Hint>
    </Frame>
  )
}

/**
 * Which of the two drags this is, from the types alone.
 *
 * The stage has its own copy of this over `DragEvent`; this one is over React's
 * synthetic `types`, which is a `readonly string[]` rather than a `DOMStringList`
 * and so is not the same expression. Two lines duplicated beats a shared helper
 * that has to be generic over both.
 */
function kindOf(types: readonly string[]): Dragged['kind'] | null {
  if (types.includes(MODEL_DRAG)) return 'model'
  if (types.includes(BLUEPRINT_DRAG)) return 'blueprint'
  return null
}

function ScenePanel() {
  const api = useEditor()
  /**
   * Whether a model is being dragged over this panel.
   *
   * Local state and not the editor's: it is a fact about a gesture in progress
   * over one panel, and nothing else on the screen has any use for it.
   */
  const [over, setOver] = useState(false)

  return (
    <Frame>
      {/*
        The tree is a drop target too.

        Dropping into the viewport puts a piece where you let go, which is the
        gesture that wants a position. This one is the other intention - "put
        this in the level, I will place it in a moment" - and it lands where the
        pointer last was, which is also what a new mark does.
      */}
      <div
        onDragEnter={(event) => {
          if (!kindOf(event.dataTransfer.types)) return
          event.preventDefault()
          setOver(true)
        }}
        onDragOver={(event) => {
          if (!kindOf(event.dataTransfer.types)) return
          // Both handlers, or the browser refuses the drop and animates the tile
          // flying home - which reads as a rejection rather than as nothing
          // listening.
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          // Only when the pointer has actually left, rather than crossed into a
          // child: `dragleave` fires for both.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setOver(false)
        }}
        onDrop={(event) => {
          const kind = kindOf(event.dataTransfer.types)
          if (!kind) return
          event.preventDefault()
          setOver(false)
          // The id when it is readable, and what the panel is holding when it is
          // not - see the note in ./stage.
          const id =
            event.dataTransfer.getData(kind === 'model' ? MODEL_DRAG : BLUEPRINT_DRAG) || null
          api.onDropModel({ kind, id }, null)
        }}
        className={`rounded transition-colors ${
          over ? 'outline outline-1 outline-offset-4 outline-violet-500/60' : ''
        }`}
      >
      <div className="flex flex-col gap-5">
        {/* The lists only. The fields for whatever is selected are their own
            panel now - see PropertiesWindow. */}
        <Inspector
          document={api.here}
          selected={api.selected}
          onSelect={api.setSelected}
          onAddMark={api.onAddMark}
          onPlayer={api.onPlayer}
          onBlueprintFrom={api.onBlueprintFrom}
          onRemove={api.onRemove}
          onRemovePlacement={api.onRemovePlacement}
          onRemoveMark={api.onRemoveMark}
        />

      </div>
      </div>
    </Frame>
  )
}

/**
 * Move, turn, size — as three icons in the corner of the viewport.
 *
 * Drawn rather than lettered. A gizmo handle is a shape you are looking at in
 * the scene, and the fastest way to say "this button gives you that shape" is
 * to draw the shape: arrows for the translate handle, a ring for the rotate
 * one, a square with a corner grip for scale. Three words in a row are three
 * things to read; three icons are one glance.
 *
 * The keys stay on them as a tooltip, because a person who has learned `G` will
 * never touch these again and a person who has not needs telling once.
 */
function Handles({
  gizmo,
  onGizmo,
}: {
  gizmo: GizmoMode
  onGizmo: (mode: GizmoMode) => void
}) {
  const shell = xpEditorDict(useLocale()).shell
  const modes = [
    { id: 'translate', key: 'G', title: shell.handles.translate, icon: MoveIcon },
    { id: 'rotate', key: 'T', title: shell.handles.rotate, icon: TurnIcon },
    { id: 'scale', key: 'Y', title: shell.handles.scale, icon: SizeIcon },
  ] as const

  return (
    <div className="absolute left-3 top-3 flex gap-1 rounded-lg border border-white/10 bg-neutral-950/70 p-1 backdrop-blur-sm">
      {modes.map(({ id, key, title, icon: Icon }) => (
        <button
          key={id}
          type="button"
          title={`${title} (${key})`}
          aria-label={title}
          aria-pressed={gizmo === id}
          onClick={() => onGizmo(id)}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            gizmo === id
              ? 'bg-violet-500/20 text-violet-200'
              : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
          }`}
        >
          <Icon />
        </button>
      ))}
    </div>
  )
}

/* Hand-drawn rather than an icon package: three 16px glyphs, and the shapes
   have to match the gizmo in the scene rather than a designer's idea of "move".
   `currentColor` so the active state above is the only place colour is decided. */

function MoveIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M8 2v12M2 8h12" strokeLinecap="round" />
      <path d="M8 2 6.2 4M8 2l1.8 2M8 14l-1.8-2M8 14l1.8-2" strokeLinecap="round" />
      <path d="M2 8l2-1.8M2 8l2 1.8M14 8l-2-1.8M14 8l-2 1.8" strokeLinecap="round" />
    </svg>
  )
}

function TurnIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      {/* An ellipse, not a circle: the ring you actually see is a Y-axis ring
          viewed from above the level, which is exactly this shape. */}
      <ellipse cx="8" cy="8.5" rx="6" ry="3.2" />
      <path d="M11.5 4.6 14 5.2l-.9 2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SizeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
      <path d="M11 11h3v-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 9.5 14 14" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The strip at the bottom: what the document says about itself.
 *
 * Not a console. A log of what the editor did is a log nobody reads - every
 * line is something they just watched happen. What is worth a panel is the
 * things you *cannot* see by looking at the level: how many of each thing there
 * are, whether the packs and capabilities line up, and what the document would
 * be refused for if it were reloaded right now.
 *
 * That last one is the point. An editor cannot produce a document its own
 * parser refuses - that is the property §9 says must hold - so anything here is
 * either a warning about the level's *design* or a bug in the editor, and both
 * are worth seeing before saving rather than after.
 */
/**
 * How many of a document's spawns have nothing holding them up.
 *
 * The same probe the character controller makes on its first frame - the cell
 * just under the feet - rather than a fresh idea about what standing means. A
 * hair below the feet and not at them, because a cell is filled from `c` to
 * `c + 1`, so a body resting on top of one is at a height that belongs to the
 * *empty* cell above it.
 *
 * Sub-cell heights come out supported rather than airborne, which is the right
 * answer for the case they exist for: a spawn typed at 0.5 is standing on a
 * step, half inside the block under it, and the physics pushes it out on the
 * first frame. It is not somebody in the sky.
 */
function airborne(document: XpDocument): number {
  const world = document.world
  const { isSolid } = solidsFor(world)
  const held = (at: { x: number; y: number; z: number }) =>
    isSolid(Math.floor(at.x), Math.floor(at.y - 0.02), Math.floor(at.z)) ||
    (world.ground && at.y <= world.floorY)

  const spawns = [document.spawn, ...world.marks.filter((mark) => mark.kind === 'spawn')]
  return spawns.filter((at) => !held(at)).length
}

function OutputPanel() {
  const t = xpEditorDict(useLocale()).document
  const api = useEditor()
  const document = api.state.document
  /**
   * Counted in the room, described for the file.
   *
   * The two halves of this panel ask different questions. How many placements,
   * how many marks, how many spawns are standing on nothing - those are about a
   * *place*, and answering them from the root while somebody is building in the
   * cellar would report an empty room as full and a full one as empty. What the
   * level is called, which blueprints it declares, which packs it draws from -
   * those are the file, and there is one of each however many rooms there are.
   */
  const here = api.here

  const models = useMemo(
    () => new Set(here.world.placements.map((placement) => placement.model)).size,
    [here.world.placements],
  )

  const notes = useMemo(() => {
    const found: string[] = []
    if (here.world.placements.length === 0) found.push(t.noPlacements)
    if (here.world.marks.length === 0) {
      found.push(t.noMarks)
    }
    const unnamed = here.entities.filter((entity) => !entity.name).length
    if (unnamed > 0 && here.entities.length > 0) {
      found.push(fill(unnamed === 1 ? t.unnamedOne : t.unnamedMany, { n: unnamed }))
    }
    /**
     * A spawn with nothing under it, which the editor no longer *makes*.
     *
     * Moving or placing one lands it on the ground now, so this can only be a
     * level from before that - or one whose floor was erased out from under a
     * spawn that was standing on it, which is the same thing arriving the other
     * way round. Said here rather than corrected on load: a document is not
     * rewritten by being looked at, and the fix is one nudge of the mark.
     *
     * The controller's own ground probe and not a guess, so what this calls
     * mid-air is what the physics will call mid-air a second later.
     */
    const air = airborne(here)
    if (air > 0) {
      found.push(fill(air === 1 ? t.airborneOne : t.airborneMany, { n: air }))
    }
    return found
    // `t` because every note is written in the reader's language.
  }, [here, t])

  return (
    <Frame>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-[11px]">
        {(
          [
            [t.counts.placements, String(here.world.placements.length)],
            [t.counts.distinctModels, `${models} — ${t.drawCalls}`],
            [t.counts.entities, String(here.entities.length)],
            [t.counts.blueprints, String(Object.keys(document.blueprints).length)],
            [t.counts.marks, String(here.world.marks.length)],
            [t.counts.capabilities, document.capabilities.join(', ')],
            [t.counts.packs, document.packs.map((pack) => pack.id).join(', ')],
            [t.counts.player, document.player.blueprint ?? t.builtInDummy],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-600">{label}</dt>
            <dd className="text-neutral-300">{value}</dd>
          </div>
        ))}
      </dl>

      {notes.length > 0 ? (
        <ul className="mt-3 space-y-1 font-mono text-[11px] text-amber-400/80">
          {notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 font-mono text-[11px] text-neutral-600">{t.nothingToFlag}</p>
      )}

      {/*
        What it is called and what it is, above everything the panel counts.

        The title is also editable in the title bar, and that is a second way in
        rather than a second answer - both call `onRenameDocument`, which renames
        the project row as well. It is here because the description had to live
        somewhere and the two are one thought: they are the pair a person reads
        before they open a level, and they are the pair the Words panel offers to
        translate first.
      */}
      <Says
        name={document.name}
        blurb={document.blurb ?? ''}
        words={document.words}
        onRename={api.onRenameDocument}
        onBlurb={api.onBlurb}
        onPhrase={api.onPhrase}
      />

      {/* What game this is, with the counts and the warnings - the other things
          true of the whole document rather than of whatever is selected. */}
      <Mode
        document={document}
        onChange={api.onRules}
        onFinish={api.onFinish}
        onColour={api.onColour}
      />

      {/* And where it is watched from, under the mode for the same reason the
          mode is here at all: both are facts about the document rather than
          about a selection, and neither is worth a window of its own. */}
      <Camera document={document} onChange={api.onCamera} />

      {/* The rooms it holds, under the mode for the same reason the mode is
          here: a place is a fact about the document rather than about whatever
          is selected. Above Talk because it is the one somebody comes looking
          for, and Talk is the one they only ever visit on purpose. */}
      <Scenes
        document={document}
        standing={api.standing}
        onOpen={api.onOpenRoom}
        onDoor={api.onDoor}
        onAdd={api.onSceneAdd}
        onRename={api.onSceneRename}
        onRemove={api.onSceneRemove}
      />

      {/* And which of those places play themselves. Directly under Places,
          because a shot *is* a place and the reader who has just seen the list
          of rooms is the one who needs telling that one can play itself. */}
      <Movies
        document={document}
        standing={api.standing}
        onNew={api.onMovieNew}
        onStop={api.onMovieStop}
        onOpen={api.onMovieOpen}
        onImport={api.onMovieImport}
        onAddCut={api.onCutAdd}
        onRenameCut={api.onCutRename}
        onRemoveCut={api.onCutRemove}
        onCompose={api.onCompose}
      />

      {/* And whether anybody in it may say anything. Same argument again, and
          last because it is the one an author only ever visits on purpose. */}
      <Talk document={document} onChange={api.onTalk} />
    </Frame>
  )
}

/**
 * What the level is called, and what it is.
 *
 * The two sentences a person reads before they decide to open something, so
 * they are together and they are first. Both commit on blur rather than per
 * keystroke: a description typed a character at a time is thirty undo steps and
 * thirty autosaves for one line, and a *name* typed that way is thirty renames
 * of the project row behind it.
 *
 * English, and the Words panel is where it is said in anything else. That is
 * the same arrangement as everywhere else in this format - the level's own text
 * is the key, so there is no "default language" setting to get wrong.
 */
function Says({
  name,
  blurb,
  words,
  onRename,
  onBlurb,
  onPhrase,
}: {
  name: string
  blurb: string
  /**
   * What the level says in other languages, so these two can be said in them
   * here.
   *
   * The Words panel lists every phrase a level has and these two are the first
   * of them - but a title is typed *here*, and asking somebody to type it and
   * then go to another panel to say it in German is asking them to hold a
   * sentence in their head across a click. The rows below are the same
   * `setPhrase` the Words panel writes, keyed on the English above them.
   */
  words: XpDocument['words']
  onRename: (name: string) => Promise<{ ok: true; name: string } | { ok: false; error: string }>
  onBlurb: (blurb: string) => void
  onPhrase: (locale: string, key: string, text: string) => void
}) {
  const refusal = useRefusal()
  const t = xpEditorDict(useLocale()).document
  const [title, setTitle] = useState<string | null>(null)
  const [about, setAbout] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Only what the level already has. Adding one is the Words panel's job -
  // there is a code to type and a limit to enforce, and neither belongs beside
  // a title field.
  const languages = Object.keys(words ?? {})

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-neutral-800 pt-3">
      <PanelLabel>{t.called}</PanelLabel>
      <input
        value={title ?? name}
        maxLength={XP_NAME_MAX}
        aria-label={t.calledLabel}
        className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 font-mono text-[11px] text-neutral-100 outline-none focus:border-neutral-600"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={async (event) => {
          const wanted = event.target.value.trim()
          setTitle(null)
          if (wanted.length === 0 || wanted === name) return
          const result = await onRename(wanted)
          setError(result.ok ? null : refusal(result.error))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setTitle(null)
            event.currentTarget.blur()
          }
          // The viewport binds single letters, and a name is letters.
          event.stopPropagation()
        }}
      />
      {error ? (
        <p role="alert" className="font-mono text-[10px] text-amber-300">
          {error}
        </p>
      ) : null}
      {languages.map((code) => (
        <Said
          key={code}
          code={code}
          phrase={name}
          text={words?.[code]?.[name] ?? ''}
          onWrite={(said) => onPhrase(code, name, said)}
        />
      ))}

      <PanelLabel>{t.about}</PanelLabel>
      <textarea
        value={about ?? blurb}
        rows={2}
        maxLength={XP_BLURB_MAX}
        placeholder={t.aboutPlaceholder}
        aria-label={t.aboutLabel}
        className="resize-y rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 font-mono text-[11px] leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-neutral-600"
        onChange={(event) => setAbout(event.target.value)}
        onBlur={(event) => {
          setAbout(null)
          onBlurb(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setAbout(null)
            event.currentTarget.blur()
          }
          event.stopPropagation()
        }}
      />
      {/*
        Only once there is a description to translate. A row for a language
        against an empty English is a box whose key is the empty string, which
        `setPhrase` refuses anyway - and offering it would look like the way to
        write a German-only description.
      */}
      {blurb
        ? languages.map((code) => (
            <Said
              key={code}
              code={code}
              phrase={blurb}
              text={words?.[code]?.[blurb] ?? ''}
              onWrite={(said) => onPhrase(code, blurb, said)}
            />
          ))
        : null}
    </div>
  )
}

/**
 * One language's answer to the title or the description.
 *
 * The same row the Words panel draws, close enough to be the same idea and
 * separate because the two panels' fields do not otherwise look alike. Commits
 * on blur, like everything else that writes a whole edit rather than a
 * keystroke.
 */
function Said({
  code,
  phrase,
  text,
  onWrite,
}: {
  code: string
  phrase: string
  text: string
  onWrite: (text: string) => void
}) {
  const [draft, setDraft] = useState(text)
  const [editing, setEditing] = useState(false)

  return (
    <label className="flex items-center gap-1.5">
      <span className="w-8 shrink-0 font-mono text-[10px] uppercase text-neutral-600">
        {code}
      </span>
      <input
        value={editing ? draft : text}
        placeholder={phrase}
        aria-label={`${code}: ${phrase}`}
        className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 font-mono text-[11px] text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-neutral-600"
        onChange={(event) => {
          setEditing(true)
          setDraft(event.target.value)
        }}
        onBlur={() => {
          setEditing(false)
          if (draft !== text) onWrite(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setEditing(false)
            setDraft(text)
            event.currentTarget.blur()
          }
          event.stopPropagation()
        }}
      />
    </label>
  )
}

function BehaviourWindow() {
  const api = useEditor()
  return (
    <Frame>
      <BehaviourPanel
        document={api.state.document}
        open={api.blueprint}
        onOpen={api.setBlueprint}
        onAdd={api.onTriggerAdd}
        onChange={api.onTriggerChange}
        onRemove={api.onTriggerRemove}
        onVerbAdd={api.onVerbAdd}
        onVerbChange={api.onVerbChange}
        onVerbRemove={api.onVerbRemove}
      />
    </Frame>
  )
}

function WordsWindow() {
  const api = useEditor()
  return (
    <Frame>
      <WordsPanel
        document={api.state.document}
        onPhrase={api.onPhrase}
        onLanguageRemove={api.onLanguageRemove}
      />
    </Frame>
  )
}

/**
 * Movies, on the rail.
 *
 * The same `Movies` component the Document panel draws, in a window of its own.
 * Not a copy and not a second view: a shot *is* a place, so movies belong under
 * Places - and that is exactly why they were hard to find, because somebody
 * looking for "where do I make a film" does not open a panel called Document.
 *
 * Two entries to one component is the cheap half of that problem. The
 * expensive half would have been a second component that drifted.
 */
function MovieWindow() {
  const api = useEditor()
  return (
    <Frame>
      <Movies
        document={api.state.document}
        standing={api.standing}
        onNew={api.onMovieNew}
        onStop={api.onMovieStop}
        onOpen={api.onMovieOpen}
        onImport={api.onMovieImport}
        onAddCut={api.onCutAdd}
        onRenameCut={api.onCutRename}
        onRemoveCut={api.onCutRemove}
        onCompose={api.onCompose}
      />
    </Frame>
  )
}

function DataWindow() {
  const api = useEditor()
  return (
    <Frame>
      <DataPanel
        data={dataOf(api.state.document)}
        onWrite={api.onDataWrite}
        onRename={api.onDataRename}
        onRemove={api.onDataRemove}
      />
    </Frame>
  )
}

function FlowWindow() {
  const api = useEditor()
  return (
    <Frame>
      <FlowPanel
        document={api.state.document}
        onAllow={api.onPhaseAllow}
        onSays={api.onPhaseSays}
        onWho={api.onPhaseWho}
        onStart={api.onFlowStart}
        onAddPhase={api.onPhaseAdd}
        onRemovePhase={api.onPhaseRemove}
        onAddStep={api.onStepAdd}
        onRemoveStep={api.onStepRemove}
        onVerbAdd={api.onPhaseVerbAdd}
        onVerbChange={api.onPhaseVerbChange}
        onVerbRemove={api.onPhaseVerbRemove}
        onStartFlow={api.onStartFlow}
        onRemoveFlow={api.onRemoveFlow}
        onStarter={api.onStarter}
        onCapabilities={api.onCapabilities}
        onWins={api.onWins}
        onRounds={api.onRounds}
        target={api.flowTarget}
        onTarget={api.setFlowTarget}
      />
    </Frame>
  )
}

function ScriptsWindow() {
  const api = useEditor()
  return (
    <Frame>
      <ScriptsPanel
        document={api.state.document}
        open={api.script}
        onOpen={api.setScript}
        onAdd={api.onScriptAdd}
        onWrite={api.onScriptWrite}
        onRename={api.onScriptRename}
        onDelete={api.onScriptRemove}
        onAttach={api.onScriptAttach}
      />
    </Frame>
  )
}

function PropertiesWindow() {
  const api = useEditor()
  return (
    <Frame>
      <Properties
        document={api.here}
        selected={api.selected}
        onChange={api.onEntity}
        onPlacement={api.onPlacement}
        onRemove={api.onRemove}
        onRemovePlacement={api.onRemovePlacement}
        onMark={api.onMark}
        onRemoveMark={api.onRemoveMark}
        onPlayer={api.onPlayer}
        onSpawn={api.onSpawn}
        pivot={api.pivot}
        onPivot={api.setPivot}
      />
    </Frame>
  )
}

function BlueprintsWindow() {
  const api = useEditor()
  return (
    <BlueprintsPanel
      document={api.state.document}
      open={api.blueprint}
      onOpen={api.setBlueprint}
      onAdd={api.onBlueprintAdd}
      onAddStarter={api.onStarterAdd}
      onChange={api.onBlueprintChange}
      onScriptAttach={api.onScriptAttach}
      onRename={api.onBlueprintRename}
      onDelete={api.onBlueprintRemove}
      onPartAdd={api.onPartAdd}
      onPartChange={api.onPartChange}
      onPartRemove={api.onPartRemove}
    />
  )
}

/**
 * The animator, in the creator.
 *
 * `task.md` §F and backlog §0.7: a screen rather than an argument, and the
 * thing it was waiting on was the editor decisions in §1, which are made.
 *
 * **The backoffice's animator, copied rather than imported**, and that is the
 * decision worth recording. Importing it is what this panel did first, for the
 * reason §F raises: two rigs to keep in step is the same drag-IK, the same
 * twenty-three bones and the same clip document drifting apart within a
 * fortnight. But `src/app/xp/` owns what it draws — docs/xp-creator.md §1.2,
 * and the `no-restricted-imports` rule in eslint.config.mjs, which is where
 * this was refused. The boundary is worth more than the duplication: the
 * backoffice is live and this is a prototype, and a shared animator means the
 * prototype either drags the product about or waits behind it.
 *
 * The copy is `./animator/`, whole and self-contained down to the clip format,
 * with a note at the top of each file saying where it came from. Two rigs is
 * now a real cost and it is the one that was chosen; a fix to one is not a fix
 * to the other.
 *
 * It goes in the *viewport's* group rather than a side column, because it is a
 * whole screen: a 3D stage, a timeline and forty controls do not fit in a sixth
 * of the width, and putting it there would be a panel nobody could use.
 *
 * ---------------------------------------------------------------------------
 * What it can and cannot do yet, said out loud
 * ---------------------------------------------------------------------------
 * It makes a clip and hands back a `.glb`, which is what it has always done. It
 * cannot yet put that clip *into this document*: an XP that carries its own art
 * is `xp/2`'s `assets` block (backlog §0.1), and until that exists there is
 * nowhere for the bytes to live. So the panel says so rather than leaving
 * somebody to discover that Save does not mean what they hoped.
 */
function AnimatorWindow(props: Partial<IDockviewPanelProps>) {
  const api = useEditor()
  const t = xpEditorDict(useLocale()).animator
  /**
   * `Fill`, and the `Normalize` that undoes it - see ../shell/fill. This is the
   * panel the button exists for: the note above says the animator is a whole
   * screen rather than a view of one, and the honest conclusion of that is a
   * way to give it the whole screen.
   */
  const fill = useFill(props)
  const doc = api.state.document
  /**
   * The held thing, resolved once for the stage - the same function the
   * runtime uses, so the pose editor's hand and the game's cannot disagree
   * about what the document means.
   */
  const held = useMemo(
    () => heldFrom(doc.player.weapon, doc.blueprints),
    [doc.player.weapon, doc.blueprints],
  )
  const onWeapon = useCallback(
    (weapon: PlayerRole['weapon'] | null) => api.onPlayer({ weapon }),
    [api],
  )
  const holds = useMemo(
    () => ({
      weapon: doc.player.weapon,
      names: Object.keys(doc.blueprints),
      onChange: onWeapon,
    }),
    [doc.player.weapon, doc.blueprints, onWeapon],
  )
  return (
    <div className="h-full overflow-y-auto bg-neutral-950 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <Hint>
          {t.dockLead}{' '}
          <span className="text-neutral-400">{t.dockSaveToLevel}</span> {t.dockTail}
        </Hint>
        {fill && (
          <FillButton
            filled={fill.filled}
            onToggle={fill.toggle}
            fillLabel={t.fill}
            normalizeLabel={t.normalize}
          />
        )}
      </div>
      <Animator
        clips={doc.clips}
        onSaveClips={api.onClips}
        {...(held ? { held } : {})}
        holds={holds}
      />
    </div>
  )
}

/**
 * Exported for the phone shell, which draws these one at a time under the
 * viewport rather than in a dock - see ./mobile. Same components, same
 * context; only the furniture around them changes.
 */
export const PANELS: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  viewport: ViewportPanel,
  animator: AnimatorWindow,
  tools: ToolsPanel,
  model: ModelPanel,
  scene: ScenePanel,
  output: OutputPanel,
  behaviour: BehaviourWindow,
  data: DataWindow,
  flow: FlowWindow,
  scripts: ScriptsWindow,
  blueprints: BlueprintsWindow,
  properties: PropertiesWindow,
  words: WordsWindow,
  movie: MovieWindow,
}

/**
 * Every tool window the rail can toggle. The viewport is not one - it is the work.
 *
 * The marks used to be letters and are now pictograms; `rail.tsx` carries the
 * argument for the change. What it cost here is the two entries that had a
 * comment explaining their letter: Behaviour was `R` because the panel used to
 * be called Rules, and Scripts was `J` because `S` was taken. A picture of
 * angle brackets needs neither excuse.
 */
export const TOOL_WINDOWS = [
  { id: 'scene', label: 'Scene', icon: 'scene' },
  { id: 'properties', label: 'Properties', icon: 'properties' },
  { id: 'model', label: 'Models', icon: 'models' },
  // Next to Models on purpose: the two panels are the same gesture - drag a tile
  // into the level - and differ only in what comes out.
  { id: 'blueprints', label: 'Blueprints', icon: 'blueprints' },
  { id: 'tools', label: 'Tools', icon: 'tools' },
  { id: 'output', label: 'Document', icon: 'document' },
  // Beside Document, because that is where the two sentences it translates are
  // written: the title and the description. Everything else it lists comes out
  // of the scripts.
  { id: 'words', label: 'Words', icon: 'words' },
  // 'Behaviour', not 'Rules'. The document has a `rules` block of its own - a
  // preset, a score limit, a clock - and two panels called Rules meaning
  // different things is the kind of collision that is free to avoid now and
  // permanent once somebody has learned the wrong one.
  { id: 'behaviour', label: 'Behaviour', icon: 'behaviour' },
  // Between Behaviour and Scripts, which is the order the three are used in: a
  // rule reaches for a field, and a script is the long way round when neither
  // will do.
  { id: 'data', label: 'Data', icon: 'data' },
  // Beside Data, because they are the two blocks a *match* is made of: what it
  // keeps and what it does with it. A flow's `when` reads a data field, so
  // reading one usually means looking at the other.
  { id: 'flow', label: 'Flow', icon: 'flow' },
  { id: 'scripts', label: 'Scripts', icon: 'scripts' },
  // Last, and on its own: it is the only one of these that is a whole screen
  // rather than a panel, and it opens over the viewport rather than beside it.
  { id: 'animator', label: 'Animator', icon: 'animator' },
  /**
   * Movies, as a window of their own.
   *
   * They live in the Document panel too, under Places, because a shot *is* a
   * place - and that is exactly why they were hard to find: somebody looking
   * for "where do I make a film" does not open a panel called Document. A
   * window with a clapperboard on the rail is the answer to that question, and
   * it is the same component either way.
   */
  { id: 'movie', label: 'Movie', icon: 'movie' },
] as const satisfies readonly ToolWindow[]

/** Where a tool window goes when the rail brings it back. */
const HOME: Record<string, { direction: 'left' | 'right' | 'below' | 'within'; title: string }> = {
  // `within`, which is the viewport's own group: the animator is a screen, and
  // a screen in a sixth of the width is a panel nobody can use.
  animator: { direction: 'within', title: 'Animator' },
  scene: { direction: 'left', title: 'Scene' },
  properties: { direction: 'right', title: 'Properties' },
  model: { direction: 'left', title: 'Models' },
  blueprints: { direction: 'left', title: 'Blueprints' },
  output: { direction: 'below', title: 'Document' },
  words: { direction: 'below', title: 'Words' },
  tools: { direction: 'below', title: 'Tools' },
  // On the right, on its own: a script is the one panel somebody reads for
  // minutes at a time rather than glances at, and it wants the height.
  data: { direction: 'right', title: 'Data' },
  // Beside Data, because they are the two blocks a *match* is made of: what it
  // keeps, and what it does with it. A flow's `when` reads a data field, so
  // reading one usually means looking at the other.
  flow: { direction: 'right', title: 'Flow' },
  scripts: { direction: 'right', title: 'Scripts' },
  // Beside it, and for the same reason: a rule is a stack of rows and the thing
  // you want beside them is the level, not another list.
  behaviour: { direction: 'right', title: 'Behaviour' },
}

/**
 * Which panels share a column, so a reopened one rejoins its neighbours.
 *
 * Derived from `HOME` rather than declared twice - two lists of the same fact
 * is one list that goes stale.
 */
const COLUMN = (id: string) =>
  Object.keys(HOME).filter((other) => HOME[other].direction === HOME[id]?.direction)

/**
 * Open it, or close it if it is already there.
 *
 * ---------------------------------------------------------------------------
 * Reopening rejoins the column it came from
 * ---------------------------------------------------------------------------
 * This used to add every panel relative to the viewport, which is right when
 * its column is gone and wrong the rest of the time - and the rest of the time
 * is the common case. Closing Scene while Models and Blueprints are still
 * tabbed beside it, then reopening it, put Scene in a *new* column of its own
 * between the old group and the viewport: the level got narrower every time
 * somebody toggled a panel they use, which is the opposite of what toggling a
 * panel is for.
 *
 * So: if anything from the same column is still open, the panel goes back into
 * that group as a tab. Only when the whole column has gone does it fall back to
 * making a new one against the viewport, which is the case the old behaviour
 * was actually written for.
 *
 * Still not "wherever it was last dragged". That position no longer exists once
 * the panel is closed, and guessing at a nearby group lands it somewhere
 * surprising more often than it helps.
 */
export function toggleWindow(
  api: DockviewApi,
  id: string,
  /**
   * What the tab says, in the reader's language.
   *
   * Passed rather than looked up: these are plain functions holding a
   * `DockviewApi`, and there is no React context to read from one. Left out,
   * the tab falls back to `HOME`'s own English - which is what a test and an
   * old caller want, and is a name rather than a blank either way.
   */
  title?: string,
): void {
  const existing = api.getPanel(id)
  if (existing) {
    api.removePanel(existing)
    return
  }
  addWindow(api, id, title)
}

/**
 * The half of `toggleWindow` that puts a panel back where it belongs.
 *
 * Three places to land, in order of how much they know: beside a panel from
 * this one's own column, beside the viewport, or nowhere in particular.
 *
 * That last one is not defensiveness. `dockview` *throws* on a
 * `referencePanel` it cannot find - "referencePanel 'viewport' does not exist"
 * - and the viewport can be closed, because its tab has an X like every other
 * panel's. So a dock whose column is empty and whose viewport has been shut is
 * a dock where every button on the rail crashes the editor. Reported exactly
 * that way.
 *
 * Left out entirely, `addPanel` puts the panel wherever it likes, which is the
 * right answer for a dock with nothing left to be relative to.
 */
function addWindow(api: DockviewApi, id: string, title?: string): void {
  const home = HOME[id]
  const sibling = COLUMN(id)
    .filter((other) => other !== id)
    .map((other) => api.getPanel(other))
    .find((panel) => panel !== undefined)

  const position = sibling
    ? ({ referencePanel: sibling, direction: 'within' } as const)
    : api.getPanel('viewport')
      ? ({ referencePanel: 'viewport', direction: home?.direction ?? 'right' } as const)
      : undefined

  api.addPanel({
    id,
    component: id,
    title: title ?? home?.title ?? id,
    ...(position ? { position } : {}),
  })
}

/**
 * Bring a tool window forward, adding it back only if it was closed.
 *
 * Not `toggleWindow`: a link that says "Blueprints →" and *closes* the
 * Blueprints panel because it happened to be open behind another tab is a link
 * that does the opposite of what it says. `setActive` is the part that matters
 * most of the time — the panel is usually already in the layout, tabbed behind
 * the one being read.
 */
export function showWindow(api: DockviewApi, id: string, title?: string): void {
  const existing = api.getPanel(id)
  if (existing) {
    existing.api.setActive()
    return
  }
  addWindow(api, id, title)
}

// ---------------------------------------------------------------------------
// The dock
// ---------------------------------------------------------------------------

/**
 * Where a rearranged layout is remembered - and why the number is in the key.
 *
 * A saved blob always wins over the default arrangement, which is the right
 * behaviour and also means that changing the default changes nothing for
 * anybody who has ever dragged a panel. Worse, a blob written before a panel
 * existed simply does not contain it, so a new panel would be invisible to
 * every existing user until they thought to clear their storage.
 *
 * So the version goes up whenever the *set* of panels changes or the default
 * arrangement is meant to be seen. Bumping it abandons saved layouts rather
 * than migrating them, which is the honest trade: a layout is thirty seconds of
 * dragging, and a migration between two versions of somebody else's serialised
 * format is a bug you find months later.
 *
 * v2: the Properties and Blueprints panels arrived, and the columns became
 * a sixth / four sixths / a sixth.
 * v3: the Rules panel became Behaviour, so its id changed - a saved layout
 * would otherwise ask the dock for a panel that no longer exists, and the one
 * thing a restored layout must not do is come back missing a window.
 * v5: the Flow panel arrived. A saved layout has no window for a panel that did
 * not exist when it was saved, so without the bump the new one is invisible to
 * everybody who has ever opened the editor - which is everybody who would want
 * it.
 */
const LAYOUT_KEY = (id: string) => `xp:layout:v5:${id}`

export function Dock({ id, onApi }: { id: string; onApi?: (api: DockviewApi) => void }) {
  /**
   * The dock's own api, kept here so a panel can send you to another panel.
   *
   * Held in a ref rather than in state: nothing in this component *renders*
   * differently once the dock is ready, so putting it in state would be a
   * re-render of the whole dock the moment it mounts, and the panels are
   * deliberately expensive to rebuild.
   */
  const self = useRef<DockviewApi | null>(null)
  const titles = xpEditorDict(useLocale()).chrome.windows
  const viewportTitle = xpEditorDict(useLocale()).shell.viewport
  const show = useCallback(
    (panel: string) => {
      if (self.current) showWindow(self.current, panel, titles[panel])
    },
    [titles],
  )

  const save = useCallback(
    (api: DockviewApi) => {
      try {
        window.localStorage.setItem(LAYOUT_KEY(id), JSON.stringify(api.toJSON()))
      } catch {
        // Out of quota. The layout still works; it just will not come back.
      }
    },
    [id],
  )

  /**
   * Where the panels start, and where they were left.
   *
   * A saved layout is restored and a broken one is ignored rather than
   * repaired: the shape dockview serialises is its own, so a version bump or a
   * renamed panel makes an old blob unreadable - and the right answer to
   * "unreadable" is the default layout, not an empty window.
   */
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      try {
        const saved = window.localStorage.getItem(LAYOUT_KEY(id))
        if (saved) {
          self.current = event.api
          onApi?.(event.api)
          event.api.fromJSON(JSON.parse(saved))
          // Still needed after a restore: the saved blob does not carry the
          // subscription, so without this a restored layout stops saving.
          event.api.onDidLayoutChange(() => save(event.api))
          return
        }
      } catch {
        // Fall through to the default.
      }

      self.current = event.api
      onApi?.(event.api)

      /**
       * The default arrangement.
       *
       * Scene on the left because it is what you navigate by, and Models tabbed
       * behind it because picking a model and picking a thing in the level are
       * the same gesture at different times - two panels fighting for the same
       * column is worse than one you switch.
       *
       * Tools sit with the Document at the bottom for the same reason: neither
       * is looked at continuously, and a wide short panel suits a row of
       * buttons and a table of counts better than a tall narrow one.
       */
      /**
       * A sixth, four sixths, a sixth.
       *
       * The viewport is the work and gets the room; the two columns beside it
       * are for glancing at, not reading. dockview sizes a panel when it is
       * added, so each `addPanel` carries the width it should end up with
       * rather than being resized afterwards - a resize pass would be a second
       * source of truth for the same number.
       *
       * Scene on the left because it is what you navigate by, with Models and
       * Blueprints tabbed behind it: picking a model, picking a kind of thing
       * and looking at what is in the level are the same gesture at different
       * times, and three panels fighting for one column is worse than one you
       * switch.
       *
       * Rules and Scripts on the right because both are read for minutes at a
       * time and want the height. Properties is tabbed with them: it is the
       * other thing you type into, and it is only ever about whatever the left
       * column just selected.
       */
      const sixth = Math.max(220, Math.round(window.innerWidth / 6))

      const viewport = event.api.addPanel({
        id: 'viewport',
        component: 'viewport',
        title: viewportTitle,
      })

      const scene = event.api.addPanel({
        id: 'scene',
        component: 'scene',
        title: titles.scene,
        position: { referencePanel: viewport, direction: 'left' },
        initialWidth: sixth,
      })
      event.api.addPanel({
        id: 'model',
        component: 'model',
        title: titles.model,
        position: { referencePanel: scene, direction: 'within' },
      })
      event.api.addPanel({
        id: 'blueprints',
        component: 'blueprints',
        title: titles.blueprints,
        position: { referencePanel: scene, direction: 'within' },
      })

      const scripts = event.api.addPanel({
        id: 'scripts',
        component: 'scripts',
        title: titles.scripts,
        position: { referencePanel: viewport, direction: 'right' },
        initialWidth: sixth,
      })
      event.api.addPanel({
        id: 'behaviour',
        component: 'behaviour',
        title: titles.behaviour,
        position: { referencePanel: scripts, direction: 'within' },
      })
      event.api.addPanel({
        id: 'properties',
        component: 'properties',
        title: titles.properties,
        position: { referencePanel: scripts, direction: 'within' },
      })

      // Under the viewport rather than beside it: neither is looked at
      // continuously, and a wide short panel suits a row of buttons and a table
      // of counts better than a tall narrow one.
      const output = event.api.addPanel({
        id: 'output',
        component: 'output',
        title: titles.output,
        position: { referencePanel: viewport, direction: 'below' },
        initialHeight: 200,
      })
      event.api.addPanel({
        id: 'tools',
        component: 'tools',
        title: titles.tools,
        position: { referencePanel: output, direction: 'within' },
      })

      // Save on every rearrangement rather than on unload: a tab that is closed
      // by the system never gets an unload, and a layout that only survives a
      // polite exit is a layout that does not survive.
      event.api.onDidLayoutChange(() => save(event.api))

      /**
       * The viewport comes back, because there is no other way to get it.
       *
       * Its tab carries an X like every other panel's, and dockview offers no
       * way to take one off. But the viewport is not a tool window: it is the
       * *level*, the rail has no button for it, and `TOOL_WINDOWS` deliberately
       * does not list one - so closing it left an editor with no level in it and
       * nothing that could put one back short of clearing `localStorage`.
       *
       * Put back rather than prevented, which is the honest version of what
       * dockview allows here. It reads as an X that does nothing, which is right
       * for the one panel that is the work rather than a view of it.
       *
       * Deferred by a microtask: this fires *during* the removal, and adding a
       * panel inside that mutation is asking dockview to rebuild a grid it is
       * halfway through taking apart.
       */
      event.api.onDidRemovePanel((panel) => {
        if (panel.id !== 'viewport') return
        queueMicrotask(() => {
          if (event.api.getPanel('viewport')) return
          event.api.addPanel({ id: 'viewport', component: 'viewport', title: viewportTitle })
        })
      })
    },
    /*
     * The titles, because this writes them. It only ever runs once - dockview
     * calls `onReady` when the dock mounts, and every run after the first
     * restores a saved layout instead - so naming them costs a callback nobody
     * calls again rather than a re-layout on every render.
     */
    [id, onApi, save, titles, viewportTitle],
  )


  const components = useMemo(() => PANELS, [])

  return (
    <Navigate.Provider value={show}>
      <DockviewReact
        components={components}
        onReady={onReady}
        // Our own theme over the library's structure - see ./dock.css for
        // why not one of the stock ones.
        className="dockview-theme-kxb h-full w-full"
      />
    </Navigate.Provider>
  )
}

function Small({
  onClick,
  label,
  wide,
  disabled,
}: {
  onClick: () => void
  label: string
  wide?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border border-neutral-800 px-2 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-600 disabled:cursor-not-allowed disabled:text-neutral-700 ${
        wide ? 'w-full' : 'w-8'
      }`}
    >
      {label}
    </button>
  )
}
