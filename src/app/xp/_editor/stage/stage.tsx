'use client'

import { Grid, OrbitControls, TransformControls } from '@react-three/drei'
import { dragButtons, dragTouches } from '@/app/xp/_editor/stage/camera-drag'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Entities, Placements } from '@/app/xp/_runtime/world/instances'
import { PosedEntity } from '@/app/xp/_runtime/world/live'
import { MAX_POSED, posedBodies } from '@/app/xp/_runtime/body/posed'
import { eulerOf, turnedBy } from '@/app/xp/_editor/stage/angles'
import { SkinnedBody } from '@/app/xp/_runtime/body/skinned'
import { floorOffset, PLAYER_SCALE } from '@kxb/xp/catalogue'
import { modelUrl, skeletonOf, splitModel } from '@kxb/xp/packs'
import { Marks } from '@/app/xp/_runtime/world/marks'
import { MODEL_DRAG } from '@/app/xp/_editor/panels/picker'
import { BLUEPRINT_DRAG } from '@/app/xp/_editor/panels/blueprints'
import { useGhostMaterial } from '@/app/xp/_editor/stage/rainbow'

/**
 * What was dragged into the level, and which of the two things that means.
 *
 * A model lays down a **placement** - bulk scenery, rasterised into cells once
 * and then forgotten. A blueprint makes an **entity** - a named thing with
 * properties that something can happen to. The gestures are identical and the
 * results are not, which is the split `blueprints.ts` opens with.
 *
 * `id` is nullable because a browser may keep a drag's payload sealed even at
 * the drop. The kind never is: it comes from `types`, which is readable
 * throughout.
 */
export type Dragged = { kind: 'model' | 'blueprint'; id: string | null }
import { ndcFor, planeHit } from '@/app/xp/_editor/stage/drop-point'
import { drawList, placementCells, spawnEntities, worldTransform } from '@kxb/xp/engine'
import { box, line, outline, type Cell } from '@kxb/xp/edit'
import type { PlacementCollider, XpDocument } from '@kxb/xp'

/**
 * The editor's viewport.
 *
 * ---------------------------------------------------------------------------
 * One level at a time, on a plane
 * ---------------------------------------------------------------------------
 * The pointer is cast against an invisible plane at the level you are working
 * on, not against the geometry already standing there. That is a decision and
 * not a shortcut, and it is worth the paragraph.
 *
 * Casting against the geometry is what the *game* does - the lobby's highlight
 * sits against the face you point at, and it is the right feel when you are
 * inside the world stacking one block on another. In an editor looking down at
 * a floor plan it is the wrong one: you cannot place anything where nothing
 * already is, so laying a floor means finding something to lean the first tile
 * against, and the height of what you place depends on what happens to be under
 * the cursor rather than on what you chose.
 *
 * A level plane makes the height explicit and the empty parts of the world
 * reachable, which is most of what an editor is for. `cellFromHit` is still
 * there in `@kxb/xp/edit` for the day the runtime wants in-world building.
 *
 * ---------------------------------------------------------------------------
 * The drag preview is not the document
 * ---------------------------------------------------------------------------
 * Dragging shows the cells a stroke *would* fill, drawn as ghosts, and only
 * commits on release. That is what makes a wall one undo step - see the note on
 * `stroke` - and it is also what lets a drag be abandoned by pulling back to
 * where it started.
 */

/**
 * What a gesture means.
 *
 * `place` and `draw` are the two halves of what one tool used to be, and
 * splitting them was somebody watching it: a tool that paints while the button
 * is down cannot put down exactly one piece, because a hand moves a pixel
 * between press and release and that is a second cell. So `place` ignores the
 * drag entirely and `draw` is the one that follows it.
 */
export type Tool = 'select' | 'place' | 'draw' | 'erase' | 'line' | 'rect' | 'room' | 'hand'

/**
 * Tools that never change the level.
 *
 * `select` picks things; `hand` does not even do that. Both are here because
 * every guard that stops a click from building has to name both of them, and a
 * guard that named only `select` is how the hand tool would quietly become a
 * brush.
 */
const PASSIVE: ReadonlySet<Tool> = new Set<Tool>(['select', 'hand'])

/**
 * How far the gizmo moves between stops, in cells.
 *
 * `null` is off - free movement, snapped only by `setPlacement`'s own tenth,
 * which exists so a drag does not write 3.0000000000000004 into a document
 * nobody can then diff.
 *
 * A tenth was the only setting for a long time and is still the default,
 * because it matches the step on the number fields beside it and a gizmo that
 * snaps differently from the numbers is two tools disagreeing about one thing.
 * The whole-cell stop is the one this list exists for: architecture is drawn on
 * whole metres, and lining a wall up by tenths is a job nobody should have.
 */
export const SNAPS = [null, 0.1, 0.5, 1] as const
export type Snap = (typeof SNAPS)[number]

export type GizmoMode = 'translate' | 'rotate' | 'scale'

/**
 * What is selected, and which list it is in.
 *
 * Tagged rather than two separate pieces of state, because the two are mutually
 * exclusive by nature - one gizmo, one properties form, one thing highlighted -
 * and holding them apart means every reader has to know which of the two wins
 * when both are set. There is no answer to that question, so it is better not
 * to be able to ask it.
 */
/**
 * What the panels are pointed at.
 *
 * Three of the four are a list and an index. The fourth is the player, which is
 * the one thing in a level there is exactly one of - it has no list to be the
 * nth of, and giving it a pretend index would make every reader carry a special
 * case in the shape of an ordinary one.
 *
 * It is here because the body standing at the spawn was drawn and not clickable:
 * everything else in the viewport opens its own panel when you click it, and the
 * player could only be reached by knowing which tab its fields were filed under.
 */
export type Selected =
  | { kind: 'entity' | 'placement' | 'mark'; index: number }
  | { kind: 'player' }
  | null

/**
 * What a gizmo drag or an inspector field reports. A placement and an entity
 * both have all of them.
 *
 * **The gizmo only ever sends the first five.** Its rotate ring is yaw and
 * stays yaw: a three-ring trackball is a fortnight of work and a control most
 * people fight, and the two tilt angles are reachable as typed fields in the
 * inspector today rather than as a handle some day. `stretch` has no handle for
 * the same reason - drei's scale gizmo drags one uniform number, and giving it
 * three axes means writing the gizmo.
 */
export type Transform = Partial<{
  x: number
  y: number
  z: number
  rotation: number
  pitch: number
  roll: number
  scale: number
  stretch: { x?: number; y?: number; z?: number }
}>

/**
 * A transform, plus the one thing about a placement that is not one.
 *
 * `collider` is deliberately outside `Transform`: that type is shared with
 * entities and describes where a thing is, and an entity's collider is a
 * different shape meaning a slightly different thing (`ColliderSpec`, centred,
 * one box). Widening the shared type to hold a field only one of the two has is
 * how one type becomes two types wearing one name.
 *
 * `undefined` is a value here rather than an absence - it is what the
 * inspector sends to put a piece back on the measured shape, and `setPlacement`
 * deletes the key when it arrives.
 */
export type PlacementPatch = Transform & { collider?: PlacementCollider }

export interface StageProps {
  document: XpDocument
  level: number
  tool: Tool
  /** Cells to lay down, once the drag is over. */
  onStroke: (cells: Cell[]) => void
  onErase: (cells: Cell[]) => void
  /** What the gizmo is on, if anything. */
  selected: Selected
  gizmo: GizmoMode
  /**
   * What the brush is holding, and which way up, for the preview alone.
   *
   * The note below says the model and the turn are deliberately *not* passed
   * down, and that is still true of the commit: the stage reports which cells
   * and the shell decides what goes in them. A preview is the other half of the
   * same gesture, though, and one drawn as a unit cube for a four-metre wall is
   * a preview that lies about where the piece lands. So the ghost gets them,
   * and only the ghost.
   */
  model?: string
  /** The turn the brush is holding, for the preview. Degrees. */
  brushRotation?: number
  /** How far a gizmo handle moves between stops, or null for free. */
  snap: Snap
  onTransform: (patch: Transform) => void
  /** Clicking a thing in the viewport. Only listens while the select tool is on. */
  onPick: (selected: NonNullable<Selected>) => void
  /**
   * The cell under the pointer, whenever it moves.
   *
   * Written into a ref by the shell rather than into state, and that is the
   * whole reason it is a callback rather than a piece of `Selected`-shaped
   * state: this fires on every pointer move, and a re-render of the editor at
   * that rate would cost more than everything else on the screen put together.
   * What reads it is a button - "put a spawn here" - which only needs the answer
   * at the moment it is pressed.
   */
  onHover?: (cell: Cell) => void
  /**
   * A model dragged out of the picker and let go over the level.
   *
   * The point is where the ray from the cursor met something - the top of a
   * floor, the side of a wall, or the working plane where there is nothing -
   * which is the whole of what "put it where I dropped it" can mean.
   */
  onDrop?: (dragged: Dragged | null, at: { x: number; y: number; z: number } | null) => void
}

/** How far the editable plane reaches. Matches the format's world radius. */
const REACH = 128

export function Stage({
  document,
  level,
  tool,
  onStroke,
  onErase,
  selected,
  gizmo,
  model,
  brushRotation = 0,
  snap,
  onTransform,
  onPick,
  onHover,
  onDrop,
}: StageProps) {
  /**
   * The entities, split the way the runtime splits them.
   *
   * An author placing a character should be building against the body they will
   * play with. Drawing everything instanced here meant a rigged entity stood in
   * its bind pose on the stage and turned into a posed one the moment they
   * pressed Play - which reads as the editor being wrong about the level rather
   * than as two paths, because from the outside there is only the level.
   *
   * The same `posedBodies` the runtime asks, so the two cannot disagree about
   * which eight get a skeleton. The world is spawned once and held, because it
   * is what both the draw list and the split are read from.
   */
  const world = useMemo(() => spawnEntities(document), [document])

  const posed = useMemo(
    () => posedBodies(world, document.blueprints, MAX_POSED),
    [world, document.blueprints],
  )

  /**
   * A ref-shaped holder, made in the memo rather than written during render.
   *
   * `PosedEntity` samples the world every frame - it is built for a running
   * level where a rule can move something - so it wants a ref. Here nothing
   * moves it, and re-reading a static world costs less than a second component
   * that does not.
   *
   * Assigning `.current` during render is the thing React's compiler refuses,
   * and rightly: it is how a render-time write and a frame-time read come to
   * disagree. Building the object *in* the memo is the same value with none of
   * that - it is created when the world changes and never written again.
   */
  const held = useMemo(() => ({ current: world }), [world])

  const entities = useMemo(() => {
    const skinned = new Set(posed.map((body) => body.id))
    return drawList(world, document.blueprints).filter((entity) => !skinned.has(entity.id))
  }, [world, document.blueprints, posed])

  /**
   * Whether the gizmo has the pointer, so a click on a handle is not also a
   * click on whatever the handle is drawn over.
   *
   * Reported as the thing it feels like: *"I try to move something and instead
   * I select the thing that overlapped the arrow."* Both are true at once —
   * three's `TransformControls` does its own raycasting against the handles on
   * a listener of its own, and R3F raycasts the scene for the same pointerdown
   * and dispatches it to the mesh underneath. Neither knows about the other,
   * and the mesh's `stopPropagation` cannot help because the two never share an
   * event.
   *
   * So the gizmo publishes what it is doing and picking asks first. `axis` is
   * non-null whenever the pointer is *over* a handle, which is what makes this
   * work on the press rather than one frame late: by the time `dragging` is
   * true the selection has already changed.
   *
   * A ref rather than state on purpose — this is read inside a pointer handler
   * and never rendered, and a re-render per hover of an arrow would be a
   * re-render per frame of a drag.
   */
  const handles = useRef<{ axis: string | null; dragging: boolean } | null>(null)

  /**
   * A pick, unless the gizmo is claiming the pointer.
   *
   * Wrapped once here rather than checked in three places: the three lists all
   * pick the same way and would drift the moment one of them forgot.
   */
  const claim = useCallback(
    (state: { axis: string | null; dragging: boolean } | null) => {
      handles.current = state
    },
    [],
  )

  const pick = useCallback(
    (selected: NonNullable<Selected>) => {
      if (handles.current?.axis || handles.current?.dragging) return
      onPick(selected)
    },
    [onPick],
  )

  /**
   * The cell the pointer is over, wherever it came from.
   *
   * Two sources feed it: the geometry, which knows how high it is, and the
   * plane, which is everywhere. Whichever the pointer touched last wins, and
   * because the geometry stops the event before the plane sees it, that is
   * always the more specific answer.
   *
   * This is what "find the y from the laser" means in practice - and the plane
   * is why it is a fallback rather than a replacement: pointing at empty sky
   * hits nothing, and laying the first floor tile of an empty world has to work.
   */
  const [surface, setSurface] = useState<Cell | null>(null)
  const onSurface = (y: number, x: number, z: number) => setSurface({ x, y, z })

  /**
   * Where a model being dragged would land, as a ghost.
   *
   * A drag has no pointer events - the browser stops sending them the moment one
   * starts - so this is the only feedback there is between picking a model up
   * and letting it go. Without it a drop is a guess, and the way to find out
   * where it went is to look for it.
   */
  const [dropAt, setDropAt] = useState<Cell | null>(null)

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: [18, 22, 26], fov: 40, near: 0.1, far: 800 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[SKY]} />

      <hemisphereLight args={['#cfd6ff', '#2a2233', 1.2]} />
      <directionalLight
        position={[20, 34, 14]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      {/*
        The lattice, drawn at the level being edited so there is never a
        question of which height a click means. Fading with distance rather
        than ending at an edge, because a grid that stops looks like a boundary
        and this one is not.
      */}
      <Grid
        position={[0, level + 0.01, 0]}
        args={[REACH * 2, REACH * 2]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#3b3a55"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#6b5f9e"
        fadeDistance={90}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />

      {/*
        The geometry is a raycast target as well as scenery, so pointing at a
        wall puts the next piece on top of it rather than back down at the
        working level. `onSurface` reports the height; the plane below catches
        everywhere there is nothing to hit, which is what makes the empty part
        of a world reachable at all.
      */}
      <Suspense fallback={null}>
        <group
          onPointerMove={(event) => {
            event.stopPropagation()
            onSurface(Math.round(event.point.y), Math.floor(event.point.x), Math.floor(event.point.z))
          }}
        >
          <Placements
            placements={document.world.placements}
            onPick={
              tool === 'select' ? (index) => pick({ kind: 'placement', index }) : undefined
            }
          />
          {/*
            Only the select tool listens. A viewport where clicking a crate
            selects it *and* the brush lays a wall is one gesture doing two
            things, and which one wins depends on what happened to be under the
            cursor.
          */}
          <Entities
            entities={entities}
            onPick={tool === 'select' ? (id) => pick({ kind: 'entity', index: id }) : undefined}
          />

          {/*
            The ones with bones, clickable like everything else.

            The instanced path picks by `instanceId` - there is no object per
            crate, only a buffer index - and a skinned body is the opposite case:
            it *is* an object, so the handler sits on a group around it. Same
            tool gate as the entities above, for the same reason: a viewport
            where clicking selects *and* the brush builds is one gesture doing
            two things.
          */}
          {posed.map((body) => (
            <PosedEntity
              key={body.id}
              id={body.id}
              model={body.model}
              scale={body.scale}
              {...(body.pose ? { pose: body.pose } : {})}
              world={held}
              {...(tool === 'select'
                ? { onPick: (id: number) => pick({ kind: 'entity', index: id }) }
                : {})}
            />
          ))}
        </group>
      </Suspense>

      {/*
        The facts about the level, drawn and clickable.

        Outside the Suspense boundary above: a mark is lines and a plane with no
        model to load, and making them wait on the level's geometry would hide
        the one thing that tells an author their goal is in the wrong place.
      */}
      <Marks
        marks={document.world.marks}
        selected={selected?.kind === 'mark' ? selected.index : null}
        onPick={tool === 'select' ? (index) => pick({ kind: 'mark', index }) : undefined}
        /* The ground a spawn needs, which the editor is the one place to see:
           "does this fit on my platform" is an authoring question, and a level
           in play would have a grid of circles under everybody at kick-off. */
        footprint
        /* And the `point` marks, for the same reason: a named place is
           something you position here and something you play *on* there. A
           board's 176 fields drawn in play are 176 grey panes over the board. */
        coordinates
      />

      {/*
        Somebody standing where the level starts.

        Asked for directly — *"put the dummy at the spawn point as a
        placeholder, so I can see the weapon"* — and it earns its place beyond
        that: a spawn is four numbers and a ring on the floor, and four numbers
        do not say whether the player will start facing the wall, inside a
        crate, or a metre above the ground. A body does, at a glance.

        It is the *runtime's* body component, given a sample that never moves.
        The alternative — a plain GLB at the mark — would have been half the
        code and the wrong half: the weapon hangs off a hand *bone*, so a body
        with no skeleton has nowhere to put it, and the grip somebody is
        adjusting in the panel next door would be invisible in the one place
        they are looking. This way the placeholder is drawn by the same code
        that draws the player, which is the only way the two cannot disagree.
      */}
      {/*
        And clickable, because everything else in here is.

        The body is drawn at the first spawn *mark* when there is one, so that
        is what a click selects - the thing it is standing on rather than a
        second panel about the same place. With no marks it selects the player,
        whose panel carries the document's own spawn. One rule, and it is the
        one the drawing already follows.
      */}
      <Suspense fallback={null}>
        <SpawnBody
          document={document}
          onPick={
            tool === 'select'
              ? () => {
                  const at = document.world.marks.findIndex((mark) => mark.kind === 'spawn')
                  pick(at === -1 ? { kind: 'player' } : { kind: 'mark', index: at })
                }
              : undefined
          }
        />
      </Suspense>

      {/*
        The model and the turn are not passed down: the stage reports *which
        cells*, and the shell decides what goes in them. That keeps the
        pointer's job to geometry and means changing the model mid-drag does
        not need a re-render down here.
      */}
      {onDrop ? (
        <Drops
          level={level}
          onOver={(at) =>
            setDropAt((current) => {
              const cell = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) }
              return current && current.x === cell.x && current.y === cell.y && current.z === cell.z
                ? current
                : cell
            })
          }
          onLeave={() => setDropAt(null)}
          onDrop={onDrop}
        />
      ) : null}

      {dropAt ? (
        <Ghost cells={[dropAt]} level={level} erasing={false} model={model} rotation={brushRotation} />
      ) : null}

      <Pointer
        level={level}
        surface={surface}
        tool={tool}
        model={model}
        brushRotation={brushRotation}
        onStroke={onStroke}
        onErase={onErase}
        onHover={onHover}
      />

      {selected ? (
        <Gizmo
          key={selected.kind === 'player' ? 'player' : `${selected.kind}-${selected.index}`}
          document={document}
          selected={selected}
          mode={gizmo}
          snap={snap}
          onTransform={onTransform}
          claim={claim}
        />
      ) : null}

      {/*
        Building and orbiting are both the left button, which is the one
        conflict here - resolved by the plane swallowing the event when the
        pointer is over it and the controls getting it otherwise.
      */}
      <OrbitControls
        makeDefault
        enablePan
        enableDamping
        maxPolarAngle={Math.PI / 2.05}
        /**
         * The hand drags the world; everything else turns around it.
         *
         * The hand tool was built as a tool that *suppresses* things - no
         * stroke, no pick - which is half of what a hand is and not the half
         * anybody reaches for it for. Left-drag still orbited, exactly as
         * Select does, so picking it up and dragging did the same thing as not
         * picking it up, and it was reported as the viewport not moving at all.
         *
         * A hand pans in every other program that has one, and panning is the
         * gesture that had no button anybody would find: it was on the right
         * button only, which is a context menu everywhere else and is not
         * discoverable by trying things.
         *
         * Right-drag still pans in every tool, so the way somebody already
         * knows keeps working.
         */
        mouseButtons={dragButtons(tool)}
        /**
         * And the same for fingers, which the mapping above never reached: on
         * drei's defaults one finger orbits whatever tool is chosen, so on a
         * phone the hand tool moved nothing and the camera circled a point it
         * could not leave. One finger follows the tool; two pinch and pan
         * everywhere. See ./camera-drag.
         */
        touches={dragTouches(tool)}
      />
    </Canvas>
  )
}

/** DESIGN.md's `sky`, oklch(0.08 0.04 285), as the hex three.js can parse. */
const SKY = '#02000b'

/**
 * Three arrows, three rings, three handles - on the selected entity.
 *
 * `TransformControls` from drei rather than a hand-written gizmo, and that is
 * not laziness: a gizmo is a fortnight of hit-testing, screen-space sizing and
 * axis-plane maths that has been written correctly a hundred times, and none of
 * it is the thing this project is about.
 *
 * What is worth writing is the two lines around it. **The handle is attached to
 * a proxy object, not to the drawn entity** - the entities are instanced, so
 * there is no per-entity object to grab, and a proxy is also what lets a child
 * be dragged in world space while its numbers stay relative to its parent.
 *
 * **Changes are reported continuously and the edit layer decides.** A drag
 * fires every frame; `setEntity` refuses a change that changes nothing, which
 * is what keeps the undo stack to one step per gesture rather than one per
 * frame.
 */
function Gizmo({
  document,
  selected,
  mode: wanted,
  snap,
  onTransform,
  claim,
}: {
  document: XpDocument
  selected: NonNullable<Selected>
  mode: GizmoMode
  /** How far a handle moves between stops, or null for free. */
  snap: Snap
  onTransform: (patch: Transform) => void
  /**
   * Somewhere to say "the pointer is mine", read by the pick handlers above.
   *
   * A callback rather than a shared ref object, so the direction is one way:
   * this component tells the stage what the controls are doing and never reads
   * anything back. See the note on `pick`.
   */
  claim: (state: { axis: string | null; dragging: boolean } | null) => void
}) {
  /**
   * A mark has no size, and neither has the spawn, so the size handle falls
   * back to move for both.
   *
   * Rather than drawing a handle that reports a number the format has nowhere to
   * put. A goal's width and height are fields on the form beside it - they are
   * two numbers in cells, not a uniform scale, and dragging one corner of a goal
   * to make it wider is a gesture that would have to mean both.
   */
  const sizeless = selected.kind === 'mark' || selected.kind === 'player'
  const mode: GizmoMode = sizeless && wanted === 'scale' ? 'translate' : wanted
  /**
   * The two things in a document that are a pair of feet rather than an object.
   *
   * The player's handle moves `document.spawn`, and a spawn mark is the same
   * fact for a side - and the edit layer lands both on whatever is beneath them,
   * so neither has a height of its own to drag. Everything else here floats on
   * purpose: a lamp hangs, a platform is up there because somebody put it there.
   */
  const standsOnGround =
    selected.kind === 'player' ||
    (selected.kind === 'mark' && document.world.marks[selected.index]?.kind === 'spawn')
  /**
   * `useState`, not `useRef`.
   *
   * The proxy is *read* during render - it is handed to two components as a
   * prop - and a ref read during render is a value React has not committed
   * yet. It happened to work and the rule is right to refuse it. A state
   * initialiser gives the same "made once, never replaced" object as a plain
   * value, which is what this actually is.
   */
  /**
   * Give the camera back, whatever happens to this gizmo.
   *
   * `TransformControls` disables the orbit controls the moment a handle is
   * grabbed and re-enables them on release - which is correct, and which never
   * happens if the gizmo stops existing in between. It stops existing more often
   * than it sounds: this component is keyed on the selection, so clicking
   * another object, pressing Escape, or deleting the thing under the handle all
   * unmount it, and a `Delete` while dragging is not an unusual way to work.
   *
   * The symptom is that the viewport stops turning and never starts again -
   * reported as "I move an object and then I cannot look around anymore" - and
   * nothing about it points back here, because by then the gizmo is gone.
   *
   * So the cleanup hands the camera back unconditionally. Re-enabling controls
   * that are already enabled costs nothing; leaving them disabled costs the
   * whole viewport until a reload.
   */
  /**
   * The controls themselves, for the listener above to ask at press time.
   *
   * State rather than a ref, and the compiler is right to insist: the effect
   * below reads it, and a ref written from a JSX callback is a value that
   * changes without anything being told. One extra render when a gizmo appears
   * is the whole cost.
   */
  const [held, setHeld] = useState<{ axis: string | null; dragging: boolean } | null>(null)
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null
  useEffect(() => {
    return () => {
      if (controls && controls.enabled === false) controls.enabled = true
    }
  }, [controls])

  /**
   * The handles get the press before anything under them can have it.
   *
   * The first attempt at this asked the controls, from inside the mesh's own
   * pick handler, whether a handle was hovered — and it was reported still
   * broken, with the detail that makes it obvious: *the arrow was already
   * highlighted, and the click still went through to the thing behind it.* So
   * the answer was right and the question was asked too late.
   *
   * Both listeners are on the **same element**: three's `TransformControls`
   * adds its `pointerdown` to the canvas, and R3F adds its own there too. At
   * the target, listeners fire in registration order whatever their capture
   * flag says — and R3F's was registered first, when the Canvas mounted, so a
   * gizmo that mounts later can never get in front of it by listening there.
   *
   * A capture listener on the canvas's *parent* can, because the capture phase
   * on an ancestor runs before the target's listeners run at all. That is the
   * whole trick: this fires first, sees that a handle is under the pointer, and
   * latches — and the pick, which happens a moment later in R3F's dispatch,
   * finds the latch closed.
   *
   * Released on `pointerup` anywhere, including outside the window, so a drag
   * that ends off-screen cannot leave a viewport that never selects again.
   */
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    const above = gl.domElement.parentElement
    if (!above) return

    const down = () => {
      if (held?.axis) claim({ axis: held.axis, dragging: true })
    }
    const up = () => claim(null)

    above.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up)
    return () => {
      above.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up)
      claim(null)
    }
  }, [gl, claim, held])

  const [proxy] = useState(() => new THREE.Object3D())
  const kind = selected.kind
  // The player has no index because there is one of it. Read as -1 here so the
  // memo below has a stable dependency rather than a conditional one.
  const index = selected.kind === 'player' ? -1 : selected.index

  /**
   * The thing's own numbers - what a change is applied to.
   *
   * Three lists now, and they agree on enough to share one handle: a placement
   * and an entity have the same five, and a mark has a position and a `facing`
   * that is a turn about Y by another name. What it does not have is a scale,
   * which is why the size handle is hidden for one below rather than reporting a
   * number the format has nowhere to put.
   */
  const base = useMemo(() => {
    if (kind === 'entity') return document.entities[index] ?? null
    if (kind === 'placement') return document.world.placements[index] ?? null
    /**
     * The player's numbers are the document's own spawn, which is the place a
     * person arrives when no mark says otherwise - so dragging the body drags
     * exactly the thing the body is standing on. A level *with* spawn marks
     * selects the mark instead, because that is what the body is drawn at.
     */
    if (kind === 'player') {
      const at = document.spawn
      return { x: at.x, y: at.y, z: at.z, rotation: at.facing, scale: 1 }
    }
    const mark = document.world.marks[index]
    return mark ? { x: mark.x, y: mark.y, z: mark.z, rotation: mark.facing, scale: 1 } : null
  }, [document, index, kind])

  /**
   * Where the handle sits.
   *
   * An entity's *world* position, walked up its parents - a rider's own numbers
   * are relative to the kart, and a handle floating at the origin because of
   * that would be a handle nobody can find. A placement and a mark have no
   * parents, so their own numbers are already the answer.
   */
  const placed = useMemo(() => {
    if (kind === 'entity') {
      const world = spawnEntities(document)
      return worldTransform(world, index, document.blueprints)
    }
    return base
  }, [base, document, index, kind])

  useLayoutEffect(() => {
    if (!placed) return
    proxy.position.set(placed.x, placed.y, placed.z)
    // All three, in the order the renderer composes them. See ./angles - the
    // set and the read have to be exact inverses, which is why they live
    // together somewhere a test can reach them.
    const euler = eulerOf(placed)
    proxy.rotation.set(euler.x, euler.y, euler.z, 'YXZ')
    proxy.scale.setScalar(placed.scale)
  }, [placed, proxy])

  if (!base || !placed) return null

  /** How far the world moved, applied to the entity's own numbers. */
  const report = () => {
    const object = proxy
    switch (mode) {
      case 'translate':
        onTransform({
          x: base.x + (object.position.x - placed.x),
          y: base.y + (object.position.y - placed.y),
          z: base.z + (object.position.z - placed.z),
        })
        break
      case 'rotate':
        /*
         * Three angles out, the same way three went in - reading only
         * `rotation.y` is what made the other two rings dead controls. The
         * Euler is already `YXZ`: the proxy was set that way and
         * `TransformControls` turns it rather than replacing it.
         */
        onTransform(turnedBy(base, placed, object.rotation))
        break
      case 'scale':
        // One number, not three: a placement's scale is uniform, because the
        // collision box is derived from the model and a squashed box is a box
        // that no longer matches what is drawn.
        onTransform({ scale: base.scale * (object.scale.x / (placed.scale || 1)) })
        break
    }
  }

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        /**
         * The live instance, handed up so the pick guard can ask it.
         *
         * Its own `axis` and `dragging` are what three writes as the pointer
         * moves over a handle and as a drag starts, so publishing the object
         * once is enough - reading fields off a copy would be reading what was
         * true when the copy was made, which for a hover is always the frame
         * before.
         *
         * Cleared on unmount, and that matters more than it looks: a stale
         * claim is a viewport that never selects anything again, which is a
         * worse bug than the one this fixes.
         */
        ref={(controls: unknown) => {
          setHeld(controls as { axis: string | null; dragging: boolean } | null)
          return () => setHeld(null)
        }}
        object={proxy}
        mode={mode}
        /**
         * Half again as big as drei's default.
         *
         * The handles are sized in screen space and scaled by distance, which
         * makes them consistent and, at the default of 1, consistently small -
         * reported as exactly that. A level is worked on from further out than
         * a single model is, because the thing being placed has a room around
         * it, so the distance scaling is doing its job and the starting size
         * was chosen for a closer camera than this editor ever uses.
         *
         * Not larger still: the arrows have to sit on the piece they move
         * without covering it, and a gizmo that hides its own subject is the
         * other way to get this wrong.
         */
        size={1.5}
        /**
         * Whatever the toolbar is holding, except for a mark.
         *
         * A mark is whole cells whatever the setting says, because that is what
         * the format stores and what `setMark` rounds to - a handle free to
         * slide by a tenth would jump back on release, which reads as the
         * editor fighting you.
         *
         * `null` off means no snap at all here; `setPlacement` still rounds to
         * a tenth on the way into the document, so "off" is free movement
         * rather than a document full of floating-point noise.
         */
        translationSnap={kind === 'mark' ? 1 : snap}
        rotationSnap={(15 * Math.PI) / 180}
        scaleSnap={0.1}
        /**
         * Turning is Y and only Y.
         *
         * This read `showY={mode !== 'rotate'}`, which hid the one ring that
         * works and left the two that cannot: a placement's `rotation` is a
         * single number of degrees about Y, and so is an entity's - the whole
         * engine turns about Y alone, because that is what keeps a collision
         * box axis-aligned and `placementCells` exact. Dragging the red or blue
         * ring moved a proxy object and reported a change the document had
         * nowhere to put.
         *
         * So in rotate mode there is one ring and it is the one you want. Move
         * and size keep all three.
         */
        showX={mode !== 'rotate'}
        /**
         * All three, except the height of a spawn - which the ground decides.
         *
         * `setSpawn` and `setMark` drop a spawn onto whatever is under it, so a
         * y handle here would report a change the edit layer immediately undoes.
         * That is the failure the `translationSnap` note above is already about
         * in a smaller way: a handle whose value comes back different is an
         * editor that fights you, and one you can drag a metre while the body
         * underneath it does not move is worse than one that is not offered.
         *
         * Rotate keeps its Y ring, because turning a spawn is the one thing
         * about it a person does set - it is which way you are looking when you
         * arrive.
         */
        showY={mode !== 'translate' || !standsOnGround}
        showZ={mode !== 'rotate'}
        onObjectChange={report}
      />
    </>
  )
}

/**
 * Catching a model dragged out of the picker.
 *
 * Native drag events on the canvas rather than R3F's own pointer handlers, and
 * that is forced rather than chosen: a browser stops sending pointer events the
 * moment a drag starts, so the whole of R3F's event system - which is what
 * `Pointer` above is built on - goes silent for exactly the gesture this is
 * about. `dragover` and `drop` are what is left.
 *
 * Which means doing by hand the one thing R3F was doing for us: turning a
 * cursor into a point in the world. That is a ray from the camera through the
 * cursor, and the nearest thing it meets.
 */
function Drops({
  level,
  onOver,
  onLeave,
  onDrop,
}: {
  /** The working height, which is where a drop over nothing lands. */
  level: number
  onOver: (at: { x: number; y: number; z: number }) => void
  onLeave: () => void
  onDrop: (dragged: Dragged | null, at: { x: number; y: number; z: number } | null) => void
}) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)

  /**
   * Our own raycaster, not the one out of `useThree`.
   *
   * That one belongs to R3F's event system and is re-aimed on every pointer
   * move; borrowing it to answer a different question mid-frame is the sort of
   * shared mutable state that works until the day it does not.
   */
  const caster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])

  useEffect(() => {
    const canvas = gl.domElement

    /** Where in the world the cursor is, or null over nothing at all. */
    const pointAt = (event: DragEvent) => {
      const at = ndcFor(
        { x: event.clientX, y: event.clientY },
        canvas.getBoundingClientRect(),
      )
      if (!at) return null
      ndc.set(at.x, at.y)
      /**
       * The graph, brought up to date first.
       *
       * A raycast reads `matrixWorld`, which is only recomputed when a frame is
       * drawn - and a drag is exactly the gesture during which one might not
       * have been. Without this the ray is cast against wherever everything was
       * when the last frame happened to run, which is *usually* right and
       * silently wrong the first time it is not.
       */
      camera.updateMatrixWorld()
      scene.updateMatrixWorld()
      caster.setFromCamera(ndc, camera)

      /**
       * The level, and nothing else in the scene.
       *
       * A raycast against everything also hits the gizmo's handles and the grid
       * helper, and a piece dropped onto the arrow you happen to be pointing at
       * lands wherever that arrow is. So the two things a drop may land on say
       * so: the geometry is instanced, and the working plane carries a flag.
       */
      for (const hit of caster.intersectObjects(scene.children, true)) {
        const object = hit.object as THREE.InstancedMesh
        if (object.userData.dropPlane === true || object.isInstancedMesh) return hit.point
      }

      /**
       * Nothing under the cursor, so the working height answers.
       *
       * Worked out rather than raycast, and it is the belt to the plane mesh's
       * braces: a drop that finds nothing must still put the piece *somewhere*,
       * because the gesture visibly happened and a gesture with no result is
       * indistinguishable from an editor that is broken. The plane is infinite
       * and flat, so this is a division rather than a search.
       */
      const onPlane = planeHit(caster.ray.origin, caster.ray.direction, level)
      return onPlane ? new THREE.Vector3(onPlane.x, onPlane.y, onPlane.z) : null
    }

    /**
     * Which of the two kinds of drag this is, or null for somebody else's.
     *
     * From `types` rather than from the payload, and that is what makes this
     * work at all: `types` is readable throughout a drag while `getData` stays
     * sealed until the drop and sometimes past it. So the *kind* is always
     * known - which is the half that decides whether a placement or an entity
     * comes out - and only the id needs a fallback.
     */
    const carried = (event: DragEvent): Dragged['kind'] | null => {
      const types = event.dataTransfer?.types
      if (!types) return null
      if (types.includes(MODEL_DRAG)) return 'model'
      if (types.includes(BLUEPRINT_DRAG)) return 'blueprint'
      return null
    }

    const over = (event: DragEvent) => {
      if (!carried(event)) return
      // Without `preventDefault` on *both* of these the browser refuses the drop
      // and animates the tile flying back to where it came from - which reads as
      // the editor rejecting it rather than as a missing handler.
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      const at = pointAt(event)
      if (at) onOver(at)
    }

    const drop = (event: DragEvent) => {
      const kind = carried(event)
      if (!kind) return
      event.preventDefault()
      /**
       * The id, when the browser will part with it.
       *
       * `getData` is sealed until the drop, and there are cases - another
       * window, a synthetic event, a policy - where it stays sealed even then.
       * So the id is a convenience rather than the mechanism: both panels select
       * what is picked up, so the shell can fall back to what it is holding.
       */
      const id =
        event.dataTransfer?.getData(kind === 'model' ? MODEL_DRAG : BLUEPRINT_DRAG) || null
      const at = pointAt(event)
      onLeave()
      // The id and the point may both be null - a sealed payload, and a camera
      // looking along the horizon with nowhere for a drop to land. The shell
      // falls back for each rather than doing nothing, because nothing happening
      // is the one outcome a visible gesture must not have.
      onDrop({ kind, id }, at)
    }

    // `dragleave` fires on the way into a child as well, which is why the ghost
    // is cleared on the drop and on leaving the canvas rather than on every one
    // of them.
    const leave = (event: DragEvent) => {
      if (event.target === canvas) onLeave()
    }

    canvas.addEventListener('dragenter', over)
    canvas.addEventListener('dragover', over)
    canvas.addEventListener('drop', drop)
    canvas.addEventListener('dragleave', leave)
    return () => {
      canvas.removeEventListener('dragenter', over)
      canvas.removeEventListener('dragover', over)
      canvas.removeEventListener('drop', drop)
      canvas.removeEventListener('dragleave', leave)
    }
  }, [camera, caster, gl, level, ndc, onDrop, onLeave, onOver, scene])

  return null
}

/**
 * The plane you build on, and the ghost that shows where.
 *
 * Invisible but not absent: it has to be a mesh for the raycaster to hit it,
 * and it has to be huge so the empty part of a world is reachable. `visible`
 * would stop it being hit at all, so it is fully transparent instead.
 */
function Pointer({
  level,
  surface,
  tool,
  model,
  brushRotation = 0,
  onStroke,
  onErase,
  onHover,
}: {
  level: number
  /** What the brush holds, for the ghost. See the note on Stage's own copy. */
  model?: string
  brushRotation?: number
  /** The last cell the geometry reported, if the pointer was on it. */
  surface: Cell | null
  tool: Tool
  onStroke: (cells: Cell[]) => void
  onErase: (cells: Cell[]) => void
  onHover?: (cell: Cell) => void
  /**
   * A model dragged out of the picker and let go over the level.
   *
   * The point is where the ray from the cursor met something - the top of a
   * floor, the side of a wall, or the working plane where there is nothing -
   * which is the whole of what "put it where I dropped it" can mean.
   */
  onDrop?: (dragged: Dragged | null, at: { x: number; y: number; z: number } | null) => void
}) {
  const [hover, setHover] = useState<Cell | null>(null)
  const [from, setFrom] = useState<Cell | null>(null)
  /**
   * Every cell the pointer has crossed since the button went down.
   *
   * A path, not two corners - which is the difference between drawing and the
   * shape tools. `line` from the start to the cursor is a straight run whatever
   * route the hand took; this is the route the hand took.
   *
   * De-duplicated on the way in rather than at the end: a pointer sitting still
   * fires move events at whatever rate the browser feels like, and appending
   * each one turns a pause into a thousand identical cells.
   */
  const [path, setPath] = useState<Cell[]>([])

  /**
   * Which cell the pointer is over.
   *
   * The plane's own hit, at the working level. The surface's height wins when
   * the pointer is on geometry *at the same spot*, which is the check that
   * keeps a stale reading from a moment ago out of it: the two events arrive
   * for the same pointer position, so agreeing on x and z means they are about
   * the same place.
   */
  const cellAt = (event: ThreeEvent<PointerEvent>): Cell => {
    const x = Math.floor(event.point.x)
    const z = Math.floor(event.point.z)
    if (surface && surface.x === x && surface.z === z) return { x, y: surface.y, z }
    return { x, y: level, z }
  }

  /** The cells the current gesture would fill. */
  const preview = useMemo<Cell[]>(() => {
    if (!hover) return []

    // One, and only ever one. A drag does not extend it - that is what `draw`
    // is for, and the whole reason the two are separate tools.
    if (PASSIVE.has(tool)) return []
    if (tool === 'place') return [hover]

    if (!from) return [hover]

    switch (tool) {
      // No `select` case: the early return above already handled it, and a
      // second one here is unreachable - which the type checker says out loud
      // because `tool` has been narrowed by then.
      case 'draw':
      case 'erase':
        return path
      case 'line':
        return line(from, hover)
      case 'rect':
        return box(from, hover)
      case 'room':
        return outline(from, hover)
      default:
        return [hover]
    }
  }, [from, hover, path, tool])

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, level, 0]}
        // Named, so a dropped model can land on it. A raycast against the whole
        // scene also finds the gizmo's handles and the grid helper, and neither
        // is a place to put a wall.
        userData={{ dropPlane: true }}
        onPointerMove={(event) => {
          event.stopPropagation()
          const cell = cellAt(event)
          setHover((current) =>
            current && current.x === cell.x && current.z === cell.z ? current : cell,
          )
          // Straight out, unconditionally: it lands in a ref, so it costs a
          // property write, and the guard above is about React rather than
          // about this.
          onHover?.(cell)
          if (!from) return
          setPath((current) => {
            const last = current.at(-1)
            if (last && last.x === cell.x && last.z === cell.z) return current
            /**
             * Bridge the gap.
             *
             * A fast drag reports one move event every few cells, so appending
             * only what was reported leaves a dotted line - and a dotted wall
             * is a wall with holes in it that nobody sees from above.
             */
            return last ? [...current, ...line(last, cell).slice(1)] : [cell]
          })
        }}
        onPointerOut={() => {
          setHover(null)
          setFrom(null)
          setPath([])
        }}
        onPointerDown={(event) => {
          /**
           * Select never builds.
           *
           * This is the bug it fixes and it was a bad one: the plane took every
           * press, and on release the fallback below - "no preview, so use the
           * cell under the cursor" - laid a piece. So clicking anywhere in the
           * level with Select on put down a wall, which is the one thing the
           * tool that exists for *not* changing anything must not do. Somebody
           * building for an hour would collect a wall per stray click.
           */
          if (PASSIVE.has(tool)) return
          // Only the primary button builds. Orbiting is the left button too,
          // but the controls never see an event the plane stopped.
          if (event.button !== 0) return
          event.stopPropagation()
          const cell = cellAt(event)
          setFrom(cell)
          setPath([cell])
        }}
        onPointerUp={(event) => {
          if (PASSIVE.has(tool)) return
          if (event.button !== 0 || !from) return
          event.stopPropagation()
          // `place` commits the cell under the cursor, not the one the button
          // went down on: a hand drifts between press and release, and the
          // piece belongs where you are looking when you let go.
          const cells = tool === 'place' ? [cellAt(event)] : preview.length > 0 ? preview : [cellAt(event)]
          if (tool === 'erase') onErase(cells)
          else onStroke(cells)
          setFrom(null)
          setPath([])
        }}
      >
        <planeGeometry args={[REACH * 2, REACH * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Erasing takes away whatever is there rather than laying this down, so
          the model would be the wrong shape to outline. */}
      <Ghost
        cells={preview}
        level={level}
        erasing={tool === 'erase'}
        {...(tool === 'erase' ? {} : { model, rotation: brushRotation })}
      />
    </>
  )
}

/**
 * The cells a gesture would fill, as translucent cubes.
 *
 * Cubes rather than the actual model, deliberately: a preview drawn with the
 * real geometry has to load it, place it and turn it, and at forty cells of a
 * four-cell wall it is a solid block of overlapping walls that hides the level
 * underneath. A cube per cell says *where* without pretending to say what.
 */
/**
 * What is about to be put down, at the size it will actually be.
 *
 * This drew a 1x1x1 cube per cell, which is a lie for most of the catalogue: a
 * four-metre wall previewed as a one-metre box, so the piece landed somewhere
 * other than where the preview said it would and the only way to find out was
 * to place it and look.
 *
 * The size comes from `placementCells` rather than from the model's raw bounds,
 * and that is the important choice. It is the same function the *collision*
 * grid is built from, so what the ghost outlines is exactly the cells the piece
 * will occupy - including the quarter-turn, where a rotated model's offset
 * moves as well as its extent. A preview drawn from the bounding box would be
 * right about the size and wrong about where a hinged door swings to.
 *
 * Two shapes, because "how big is it" and "where does it land" are different
 * questions: a box at the piece's full extent, and a flat shadow on the working
 * plane underneath it. The shadow is what tells you the footprint when the box
 * is tall enough to be mostly above your eye.
 */
function Ghost({
  cells,
  level,
  erasing,
  model,
  rotation = 0,
}: {
  cells: readonly Cell[]
  level: number
  erasing: boolean
  /** What is being placed, when that is known. Cells alone without it. */
  model?: string
  rotation?: number
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const shadow = useRef<THREE.InstancedMesh>(null)
  /**
   * The held look, wound forward every frame.
   *
   * Called before the early return below, because a hook that runs only when
   * there is something to preview is a hook that changes count between renders.
   */
  const held = useGhostMaterial()

  /**
   * The box each cell's piece will fill, in cells.
   *
   * Null for a model the catalogue does not know, which falls the whole thing
   * back to the one-cell cube it used to be - a preview of the wrong size beats
   * no preview at all, and an unknown model is refused by the edit layer a
   * moment later anyway.
   */
  const boxes = useMemo(
    () =>
      cells.map((cell) => {
        const box = model
          ? placementCells({ model, x: cell.x, y: cell.y, z: cell.z, rotation, scale: 1 })
          : null
        if (!box) {
          return { x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5, w: 1, h: 1, d: 1 }
        }
        const w = box.maxX - box.minX + 1
        const h = box.maxY - box.minY + 1
        const d = box.maxZ - box.minZ + 1
        return { x: box.minX + w / 2, y: box.minY + h / 2, z: box.minZ + d / 2, w, h, d }
      }),
    [cells, model, rotation],
  )

  /**
   * `useLayoutEffect`, not `useMemo`.
   *
   * The first version wrote the matrix buffer inside a memo, which runs *during*
   * render - so it touched a ref React had not committed yet. It happened to
   * work and the lint rule is right to refuse it: a memo may run twice, may be
   * thrown away, and has no guarantee the ref points at the mesh that will
   * actually be on screen. A layout effect runs after commit and before paint,
   * which is exactly when a buffer must be filled - later and the ghost flashes
   * as a pile of cubes at the origin first.
   */
  useLayoutEffect(() => {
    const target = mesh.current
    const under = shadow.current
    const matrix = new THREE.Matrix4()
    const scale = new THREE.Vector3()
    const at = new THREE.Vector3()
    const still = new THREE.Quaternion()

    boxes.forEach((box, index) => {
      if (target) {
        at.set(box.x, box.y, box.z)
        scale.set(box.w, box.h, box.d)
        matrix.compose(at, still, scale)
        target.setMatrixAt(index, matrix)
      }
      if (under) {
        // A hair above the plane, or it fights the grid for the same pixels.
        at.set(box.x, level + 0.02, box.z)
        scale.set(box.w, 1, box.d)
        matrix.compose(at, still, scale)
        under.setMatrixAt(index, matrix)
      }
    })

    if (target) {
      target.instanceMatrix.needsUpdate = true
      target.count = boxes.length
    }
    if (under) {
      under.instanceMatrix.needsUpdate = true
      under.count = boxes.length
    }
  }, [boxes, level])

  if (cells.length === 0) return null

  const colour = erasing ? '#f87171' : '#a78bfa'

  return (
    <>
      {/*
        The box, as suspended glass rather than a flat violet solid.

        It was `meshBasicMaterial` at 28% - which says "something is here" and
        nothing else. A piece being placed is *held*: it has a size, it has a
        depth you should be able to see through, and it is not part of the level
        yet. The Fresnel skin says all three at once, and it is the same
        substance a block wears in the lounge while its model is still arriving,
        which is the same idea one step earlier - a shape that is right before
        the thing is really there. See ./rainbow.

        **Erasing keeps the flat red.** A rainbow that meant both "about to
        appear" and "about to disappear" would be a signal that says nothing, and
        red is the one colour in this editor that already means "gone".
      */}
      <instancedMesh
        // Keyed on the count because `args` is read once at construction: a
        // buffer sized for ten does not grow to eleven, it keeps drawing ten.
        key={`box-${cells.length}-${level}`}
        ref={mesh}
        args={[undefined, undefined, cells.length]}
        {...(erasing ? {} : { material: held })}
      >
        <boxGeometry args={[1, 1, 1]} />
        {erasing && (
          <meshBasicMaterial color={colour} transparent opacity={0.28} depthWrite={false} />
        )}
      </instancedMesh>

      <instancedMesh
        key={`shadow-${cells.length}-${level}`}
        ref={shadow}
        args={[undefined, undefined, cells.length]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {/* Turned by the mesh above rather than by the geometry, so the same
            unit plane serves every footprint through its instance scale. */}
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={0.5}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </>
  )
}

/**
 * The player, standing at the spawn, not moving.
 *
 * Drawn for the *first* spawn mark and the document's own spawn otherwise,
 * which is the same order `spawn.ts` resolves in: a level with team spawns has
 * several and one body is enough to answer the question this is here for.
 *
 * `motion: 'idle'` is handed in rather than derived, because a body that never
 * moves reports a speed of zero and `motionFor` would agree - but only after a
 * frame of measuring, and the first frame of a placeholder is the one somebody
 * looks at.
 */
function SpawnBody({
  document,
  onPick,
}: {
  document: XpDocument
  onPick?: () => void
}) {
  const spawn = document.world.marks.find((mark) => mark.kind === 'spawn')
  const at = spawn ?? document.spawn
  const facing = 'facing' in at ? at.facing : 0

  const model = document.player.blueprint
    ? (document.blueprints[document.player.blueprint]?.model ?? DUMMY)
    : DUMMY
  const pack = splitModel(model)?.pack
  // The built-in body is the dummy at play scale; a document that names its own
  // blueprint is drawn at the scale it asked for. Same arithmetic as the
  // runtime's `body` memo, and the same reason: the pack's cell times the
  // document's own.
  const scale = document.player.blueprint ? 1 : PLAYER_SCALE
  const drawn = (pack?.scale ?? 1) * scale

  const held = document.player.weapon
  const weapon = held ? document.blueprints[held.blueprint]?.model : undefined
  const weaponPack = weapon ? splitModel(weapon)?.pack : undefined

  const sample = useCallback(
    () => ({ x: at.x, y: at.y, z: at.z, facing, motion: 'idle' as const }),
    [at.x, at.y, at.z, facing],
  )

  if (!model) return null

  /**
   * The listener is on a wrapper rather than on the body.
   *
   * `SkinnedBody` draws the runtime's player and has no business knowing it is
   * in an editor - and a group's click handler covers whatever it draws,
   * including the weapon in its hand, which is the part somebody is most likely
   * to aim at when they want to adjust the grip.
   *
   * `stopPropagation` because the floor plane behind it is what places things:
   * without it, clicking the player also puts a crate where its feet are.
   */
  const body = (
    <SkinnedBody
      {...(skeletonOf(model) ? { rig: skeletonOf(model)! } : {})}
      // The level's own clips, so a pose authored in the animator is what the
      // editor's preview stands in - the same body the runtime draws.
      {...(document.clips ? { carried: document.clips } : {})}
      url={modelUrl(model)}
      scale={drawn}
      lift={((pack?.lift ?? 0) + floorOffset(model)) * scale}
      sample={sample}
      {...(weapon && held
        ? {
            holding: {
              url: modelUrl(weapon),
              scale: (weaponPack?.scale ?? 1) * (held.scale ?? 1),
              ...(held.x !== undefined ? { x: held.x } : {}),
              ...(held.y !== undefined ? { y: held.y } : {}),
              ...(held.z !== undefined ? { z: held.z } : {}),
              ...(held.pitch !== undefined ? { pitch: held.pitch } : {}),
              ...(held.yaw !== undefined ? { yaw: held.yaw } : {}),
              ...(held.roll !== undefined ? { roll: held.roll } : {}),
            },
          }
        : {})}
      {...(document.player.blueprint &&
      document.blueprints[document.player.blueprint]?.pose
        ? { rest: document.blueprints[document.player.blueprint].pose }
        : {})}
    />
  )

  if (!onPick) return body

  return (
    <group
      onClick={(event) => {
        event.stopPropagation()
        onPick()
      }}
    >
      {body}
    </group>
  )
}

/** The rigged body every document has without asking for one. */
const DUMMY = 'dummy/Dummy'
