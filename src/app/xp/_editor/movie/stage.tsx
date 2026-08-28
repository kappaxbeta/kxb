'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { drawnModels, spawnEntities, worldTransform } from '@kxb/xp/engine'
import { actedAt, cuesAt, framingAt, liveCamera, posedAt, type XpTimeline } from '@kxb/xp/movie'
import type { EntityWorld } from '@kxb/xp/engine'
import type { MovieClock } from '@/app/xp/_editor/movie/clock'
import type { EntitySpec, XpDocument, XpWorld } from '@kxb/xp'
import { LiveEntities, PosedEntity } from '@/app/xp/_runtime/world/live'
import { skeletonOf, type SkeletonId } from '@kxb/xp/packs'
import { RIGS } from '@/app/xp/_editor/animator/rig'
import { MAX_POSED, posedBodies } from '@/app/xp/_runtime/body/posed'
import { Placements } from '@/app/xp/_runtime/world/instances'
import { Marks } from '@/app/xp/_runtime/world/marks'
import { Bubbles } from '@/app/xp/_runtime/world/bubbles'
import { CameraGizmos, MovieGizmo, type GizmoTarget } from '@/app/xp/_editor/movie/gizmo'

/**
 * The movie viewport.
 *
 * ---------------------------------------------------------------------------
 * Nothing here re-renders while the film plays
 * ---------------------------------------------------------------------------
 * The obvious build is a `t` in React state, `stageAt` in a memo, and the posed
 * entities handed down as props. It would be correct and it would re-render a
 * tree holding every instanced mesh in the level thirty times a second.
 *
 * The runtime already solved this and the solution is reusable as it stands:
 * `LiveEntities` draws out of an `EntityWorld` held in a **ref**, read in
 * `useFrame`, with matrices written straight into the instance buffers. React
 * is told only when the *shape* changes - a new model appearing, a group
 * outgrowing its buffer.
 *
 * So a movie does not draw itself. It **writes into that world**, once a frame,
 * from `stageAt`, and the existing renderer picks it up on the same frame with
 * no idea a timeline exists. The playhead is a ref for the same reason, and the
 * one thing that costs is that the panels have to be told the time separately -
 * see `onTime`, which is throttled rather than per-frame.
 *
 * A pleasing consequence: `visible` is written as membership of `world.alive`,
 * which the renderer already honours because that is what despawning is. A
 * keyed-off actor is drawn by exactly the code that draws a despawned one.
 *
 * ---------------------------------------------------------------------------
 * Two ways to look, and only one of them is the film
 * ---------------------------------------------------------------------------
 * **Free look** is orbit controls and is for *building* the shot: you fly to a
 * view you like and press a button to make a camera stand there. **Through a
 * camera** is the film, and while it is on the mouse does nothing to the view -
 * which is the point. A viewport that both follows the cut and answers the
 * mouse is one where a nudge silently desynchronises what you are looking at
 * from what will be exported.
 *
 * The two are one prop rather than two components, because everything else -
 * the world, the lights, the grid - is identical and a component boundary would
 * remount the whole scene every time somebody looked around.
 */

export interface MovieStageProps {
  document: XpDocument
  /** The place being shot: its world, and who is in it. */
  world: XpWorld
  entities: readonly EntitySpec[]
  timeline: XpTimeline
  /** The playhead. Moving it costs no render - see `./clock`. */
  clock: MovieClock
  /** Which camera the picture is on, or null for free look. */
  through: string | null
  /** Told the time now and then, for the scrubber. Never per frame. */
  onTime: (seconds: number) => void
  /** Told when playback runs off the end, so the panel can put the button back. */
  onEnded: () => void
  /**
   * Clicking an actor, and whether it adds to the selection.
   *
   * Shift is the modifier every editor uses for "and this one too", so the
   * viewport reports it rather than the panel guessing - a click in the picture
   * is where somebody builds a group.
   */
  onPick?: (name: string, add: boolean) => void
  /** What has handles on it, if anything. See `MovieGizmo`. */
  gizmo?: GizmoTarget | null
  /** Which camera the cut is on, so its frustum can be lit. */
  liveCamera?: string | null
  /** Clicking a camera's lens in the viewport. */
  onPickCamera?: (name: string) => void
  /** Where a handle was dragged to. */
  onDrag?: (to: { x: number; y: number; z: number }) => void
  /**
   * Which bone of the selected body is being posed, and clicking one.
   *
   * The panel's own list is a select of twenty-three names, which is fine for
   * "the left knee" and useless for *"that one"* - and pointing at the thing
   * you mean is the whole reason a viewport is here. So the bones are drawn on
   * the body and the panel follows, rather than the other way round.
   */
  bone?: string | null
  onPickBone?: (bone: string) => void
  /**
   * A clip to show on one body *without* putting it in the shot.
   *
   * Picking `Walking_A` from a list of ninety and having to place a block,
   * watch it, and take the block out again to see whether it was the one you
   * meant is three steps for a question - "what does this look like" - that the
   * body can answer directly. It overrides whatever the timeline says that body
   * is playing, and only while it is set.
   */
  preview?: { entity: string; clip: string } | null
  /** A stretch to cycle rather than running to the end. See `MovieClock`. */
  loop?: { from: number; to: number } | null
  /**
   * Filled with a way to read a body's pose *as drawn*.
   *
   * The panel needs it to start a pose from what is on screen rather than from
   * the bind pose - see `poseNow` in `useBoneTurn`.
   *
   * Handed over the way `onReady` hands over the renderer: the stage *calls*
   * this and the caller keeps what it is given. Filling a ref the caller passed
   * in would be a child writing through a prop, which is exactly the shape the
   * note on `MovieClock` spends a paragraph refusing - and the compiler refuses
   * it too, in as many words.
   */
  onPoses?: (read: (entity: string) => Record<string, number[]> | null) => void
  /**
   * Whether a click adds to the selection rather than replacing it.
   *
   * Shift does this for a keyboard and nothing did it for a finger, which is
   * the report: multi-select needs a tool. It is a latch on the shot bar, so
   * the gesture is the same one on both - pick, pick, pick - and the only
   * difference is what you are holding down.
   */
  adding?: boolean
  /**
   * Handed the renderer once it exists, so the export can borrow it.
   *
   * A ref rather than a callback with the pieces in it, because the exporter
   * needs all three at the moment the shutter fires and they are only ever
   * meaningful together.
   */
  onReady?: (parts: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera }) => void
}

export function MovieStage(props: MovieStageProps) {
  const { document: xp, timeline } = props

  /**
   * One world, made here and handed to both halves.
   *
   * This was two calls to `useHeldWorld` for about ten minutes - one in the
   * renderer's props and one inside the driver - and it type-checked perfectly:
   * two memos, two worlds, the loop posing one and the meshes drawn from the
   * other. Nothing moved and nothing said why. A shared value has to be made
   * once and passed, which is what this line is.
   */
  const { world, held } = useHeldWorld(xp, props.entities)

  /**
   * The bodies with bones, and which clip each is playing.
   *
   * Split out of `LiveEntities` because a cue is per actor and its clip comes
   * from the blueprint - see the note where they are drawn. The *list* is
   * stable (it changes when the cast does); the *clips* change as the playhead
   * crosses cues, which is a handful of times in a shot rather than per frame,
   * so it is honest React state driven from the loop.
   */
  const bodies = useMemo(
    () => posedBodies(world, xp.blueprints, MAX_POSED),
    [world, xp.blueprints],
  )
  const hidden = useMemo(() => new Set(bodies.map((one) => one.id)), [bodies])

  /** Each drawn body's wrapper, so `Bones` can find a skeleton by entity id. */
  const rigs = useRef<Map<number, THREE.Group>>(new Map())

  /**
   * A body's pose as it is drawn, this instant.
   *
   * Reads the *evaluated* bone orientations - what the mixer has put there,
   * idle frame and all - which is the whole point: "start from what I can see".
   * Every bone is returned and the caller keeps the ones its rig calls
   * poseable, because which those are is a fact about a rig and this is a
   * renderer.
   */
  useEffect(() => {
    props.onPoses?.((entity) => {
      let id: number | null = null
      for (const [candidate, who] of held.current.name) {
        if (who === entity) {
          id = candidate
          break
        }
      }
      if (id === null) return null
      const root = rigs.current.get(id)
      if (!root) return null

      const out: Record<string, number[]> = {}
      root.traverse((node) => {
        if (!(node as THREE.Bone).isBone) return
        const q = (node as THREE.Bone).quaternion
        out[node.name] = [q.x, q.y, q.z, q.w].map((one) => Math.round(one * 10000) / 10000)
      })
      return out
    })
  }, [props, held])

  /**
   * How far into its clip each body is, written every frame by the driver.
   *
   * A ref because it changes per frame - see `since` on `PosedEntity`. It is
   * what stops a pose clip running past underneath a playhead that is not
   * moving: `cuesAt` has always returned this and the stage threw it away,
   * keeping only the clip's name.
   */
  const since = useRef<Map<number, number>>(new Map())

  /**
   * Whose bones to draw: exactly one selected body, and only one.
   *
   * Taken from the gizmo target rather than a prop of its own, because "what
   * has handles on it" and "whose skeleton is showing" are the same question -
   * and a multi-selection deliberately has no answer, since posing is a thing
   * you do to one body at a time.
   */
  const posing = props.gizmo?.kind === 'actor' ? props.gizmo.name : null
  const posingRig = useMemo(() => {
    const spec = posing ? props.entities.find((one) => one.name === posing) : undefined
    const model = spec ? xp.blueprints[spec.blueprint]?.model : undefined
    return model ? (skeletonOf(model) ?? null) : null
  }, [posing, props.entities, xp.blueprints])
  const [playing, setPlaying] = useState<ReadonlyMap<number, string>>(new Map())

  /**
   * The bodies that draw nothing, by name.
   *
   * `drawnModels` is the one answer to "does this appear", and it is the same
   * call that decides which glTFs a document fetches - so asking it here keeps
   * the marker and the loader agreeing about what a node is.
   */
  const empties = useMemo(
    () =>
      new Set(
        props.entities
          .filter((one) => {
            const blueprint = xp.blueprints[one.blueprint]
            return !!one.name && !!blueprint && drawnModels(blueprint).length === 0
          })
          .map((one) => one.name!),
      ),
    [props.entities, xp.blueprints],
  )

  return (
    <Canvas
      /**
       * `preserveDrawingBuffer`, because the frame export reads the canvas back.
       *
       * Without it the colour buffer may be discarded after a draw and
       * `toDataURL` hands back a transparent rectangle on most drivers - which
       * is indistinguishable from a correct transparent export, and is the one
       * failure that would be discovered by somebody else, later, in a file.
       *
       * `alpha` for the same export: a movie whose backdrop is `none` is one
       * somebody wants as a cut-out, and a canvas with no alpha has nothing to
       * cut out. The backdrop, when there is one, is painted rather than being
       * the absence of this.
       */
      gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
      dpr={[1, 2]}
      /**
       * Free look starts where the shot starts.
       *
       * The Canvas's own default is a fixed point in space, which in a level
       * built away from its origin is inside a wall - and the first thing an
       * author sees on opening a movie should be the shot they are about to
       * edit rather than a rectangle of floor. Read once at mount, which is all
       * R3F does with this prop anyway; the live camera is driven per frame.
       */
      camera={{
        position: timeline.cameras[0]?.keys[0]?.position ?? [8, 5, 8],
        fov: timeline.cameras[0]?.keys[0]?.fov ?? 40,
        near: 0.1,
        far: 400,
      }}
      className="h-full w-full"
    >
      <Backdrop backdrop={timeline.backdrop} />

      {/*
        The editor's own two lights, at the editor's own strengths.

        Copied rather than re-chosen, and the first attempt at re-choosing is
        why the note is here: an ambient at 0.9 *on top of* a hemisphere and a
        key light blew every surface to a flat wash, and a shot composed against
        that is one whose contrast arrives as a surprise on the play route. What
        a movie must not do is invent a second lighting model - a camera placed
        under one and played back under the other is a shot nobody can trust.
      */}
      <hemisphereLight args={['#cfd6ff', '#2a2233', 1.2]} />
      <directionalLight position={[20, 34, 14]} intensity={2} />

      <Driver
        {...props}
        held={held}
        onPlaying={setPlaying}
        since={since}
        preview={props.preview ?? null}
        loop={props.loop ?? null}
      />

      <Suspense fallback={null}>
        <Placements placements={props.world.placements} />

        {/*
          The bodies with bones, drawn here rather than by `LiveEntities`.

          `LiveEntities` takes a body's clip from `blueprint.pose`, which is
          per-*blueprint* - and a cue is per-actor-per-moment, which is the whole
          point of one. So the rigged bodies are hidden from it and drawn here
          with the clip the timeline says they are playing.

          **This is the inch the clip half was missing.** `cuesAt` was written,
          parsed and tested, and nothing read it: a `play` action changed the
          document and never moved anybody. Everything else was correct, which is
          exactly why it went unnoticed.
        */}
        {bodies.map((body) => (
          <group
            key={body.id}
            /*
              A wrapper at identity, purely to have something to traverse for
              bones. `SkinnedBody` owns its own group and moves it every frame;
              wrapping is what lets the skeleton be found without reaching into
              something that is busy being a body - the same argument
              `PosedEntity` makes for putting its click handler on a group.
            */
            ref={(node) => {
              if (node) rigs.current.set(body.id, node)
              else rigs.current.delete(body.id)
            }}
          >
          <PosedEntity
            key={body.id}
            id={body.id}
            model={body.model}
            scale={body.scale}
            {...(playing.get(body.id) ?? body.pose
              ? { pose: playing.get(body.id) ?? body.pose! }
              : {})}
            world={held}
            measured
            since={since}
            {...(xp.clips ? { carried: xp.clips } : {})}
          />
          </group>
        ))}

        {/*
          The skeleton of whoever is selected, as something you can click. See
          `Bones` - one pool of dots rather than a set per body, because a body
          is only identified by name inside the frame loop.
        */}
        <Bones
          world={held}
          rigs={rigs}
          actor={posing}
          rig={posingRig}
          chosen={props.bone ?? null}
          {...(props.onPickBone ? { onPick: props.onPickBone } : {})}
        />
        <LiveEntities
          /*
           * The rigged bodies are drawn above, with the clip the timeline says
           * they are playing - so they are hidden here rather than drawn twice.
           */
          hide={hidden}
          /**
           * Remounted when the cast changes, and that is not belt-and-braces.
           *
           * `LiveEntities` is built for a world that is **mutated**: it counts
           * the models once on mount and recounts only when an instanced group
           * writes past its buffer, which is how a rule spawning something gets
           * noticed. Its own note states the invariant - *every path that can
           * change the live set calls `overflow`*.
           *
           * A movie does not mutate its world, it *replaces* it: the memo below
           * rebuilds one whenever the cast changes, so no buffer ever overflows
           * and the component keeps drawing the shape it measured on mount. The
           * symptom was an actor that arrived in the cast list, in the document
           * and in the saved file, and never appeared on screen.
           *
           * Keyed on the cast's **shape** rather than on the entity array, which
           * changes identity on every keystroke - a remount per key would
           * re-clone every glTF in the room while somebody is typing.
           */
          key={props.entities.map((one) => `${one.name}:${one.blueprint}`).join('|')}
          world={held}
          blueprints={xp.blueprints}
          {...(xp.clips ? { carried: xp.clips } : {})}
        />
      </Suspense>

      {/*
        And what anybody is saying, which follows where they actually are.

        **Inside a boundary of its own, and that is not optional.** drei's
        `<Text>` suspends while troika fetches its font, and a component that
        suspends with no boundary above it suspends the whole R3F root - so
        mounting this beside `Marks` blanked the entire viewport, permanently,
        with no error anywhere. The canvas was the right size and drew nothing,
        which looks exactly like a scene that failed to build.
        `Signs` in the runtime is inside a boundary for the same reason; this
        one is its own rather than sharing the world's, so a font that is slow
        does not hold up the level and a level that is slow does not hold up a
        bubble.
      */}
      <Suspense fallback={null}>
        <Bubbles world={held} timeline={timeline} at={props.clock.at} />
      </Suspense>

      {/*
        Something to click on, per named body.

        `LiveEntities` draws out of instanced buffers and skinned meshes and
        offers no picking - the editor's own stage gets that from `Entities` and
        `PosedEntity`, which are the *static* path and not the one a movie uses.
        Rather than teaching the runtime's renderer about selection, the movie
        puts an invisible box where each body is drawn and clicks that.

        Invisible but raycastable, which `visible={false}` would not be: a hidden
        mesh is skipped by the raycaster entirely, so it is a transparent
        material with `depthWrite` off instead.

        Sized roughly rather than from the model's bounds. It is a hit target for
        a click, not a collider, and one that matched every model exactly would
        be a second copy of the geometry to keep in step for no gain.
      */}
      <Handles
        world={held}
        entities={props.entities}
        empties={empties}
        posing={props.onPickBone ? posing : null}
        adding={props.adding ?? false}
        onPick={props.onPick}
      />

      {/*
        The cameras themselves, so you can see where they are and which way
        they look. Free look only - looking *through* one means the viewport is
        the shot, and a shot with a wireframe pyramid in it is not the shot.
      */}
      {props.through === null ? (
        <CameraGizmos
          timeline={timeline}
          clock={props.clock}
          live={props.liveCamera ?? null}
          {...(props.onPickCamera ? { onPick: props.onPickCamera } : {})}
        />
      ) : null}

      {/*
        Handles, on whatever is selected - but never while the picture is on a
        camera. A gizmo dragged in a view the author does not control is one
        whose axes point somewhere they did not choose, and grabbing it would
        fight the cut for the same pointer.
      */}
      {props.through === null && props.onDrag ? (
        <MovieGizmo
          target={props.gizmo ?? null}
          world={held}
          timeline={timeline}
          onMove={props.onDrag}
        />
      ) : null}

      <Marks marks={props.world.marks} selected={null} coordinates />

      {/*
        The grid is drawn only in free look.

        It is a building aid, not part of the picture, and the picture is
        precisely what "through a camera" means. Leaving it on would put a grid
        in the export, which somebody would find in the file rather than here.
      */}
      {props.through === null ? (
        <Grid
          args={[200, 200]}
          cellSize={1}
          cellColor="#2a2a2a"
          sectionSize={8}
          sectionColor="#3a3a3a"
          fadeDistance={90}
          infiniteGrid
        />
      ) : null}

      {/*
        Orbiting turns around what the shot is looking at, not around the world's
        origin. The default is the origin, and in a level built anywhere else
        that makes the one gesture an author uses constantly - swing round to see
        the other side of the subject - swing round something off screen instead.
      */}
      <OrbitControls
        enabled={props.through === null}
        target={timeline.cameras[0]?.keys[0]?.target ?? [0, 1, 0]}
        makeDefault
      />
    </Canvas>
  )
}

/**
 * The world the movie writes into, built once and held.
 *
 * Assigning `.current` during render is what React's compiler refuses, and
 * rightly - it is how a render-time write and a frame-time read come to
 * disagree. Building the object *inside* the memo is the same value with none
 * of that: created when the place changes, never written again from render.
 *
 * The same trick the editor's stage uses, and lifted here rather than shared,
 * because these are two hosts of one engine and neither owns the other.
 */
function useHeldWorld(document: XpDocument, entities: readonly EntitySpec[]) {
  const world = useMemo(() => {
    // `spawnEntities` reads the document's own place. A movie may be shooting a
    // scene instead, so the entity list is substituted rather than the document
    // being trusted to be the right room.
    return spawnEntities({ ...document, entities: [...entities] })
  }, [document, entities])

  /*
   * The ref-shaped holder, made *in* a memo rather than written during render.
   *
   * The same call the editor's own stage makes: assigning `.current` during
   * render is what React's compiler refuses, and rightly - it is how a
   * render-time write and a frame-time read come to disagree. Building the
   * object in a memo is the same value with none of that.
   *
   * Both are returned because two things need them: the loop wants the ref, and
   * the *draw list* wants the world itself - deriving that from `held.current`
   * during render is the thing the compiler cannot see through, and it refused
   * to optimise the component for exactly that reason.
   */
  const held = useMemo(() => ({ current: world }), [world])
  return { world, held }
}

/**
 * The frame loop: advance the clock, pose the world, aim the camera.
 *
 * One component and one `useFrame` rather than three, because the order matters
 * and a single hook is the only way to say so: the clock has to move before the
 * world is posed, and the world has to be posed before the camera is aimed at
 * it. Three hooks would run in mount order, which is a fact about the tree
 * rather than about the shot.
 */
function Driver({
  entities,
  timeline,
  clock,
  through,
  onTime,
  onEnded,
  onReady,
  held,
  onPlaying,
  since,
  preview,
  loop,
}: MovieStageProps & {
  held: { current: EntityWorld }
  /** Which clip each rigged body is playing, when that changes. */
  onPlaying: (playing: ReadonlyMap<number, string>) => void
  /** Filled each frame with how far into its clip each body is. */
  since: React.RefObject<Map<number, number>>
}) {
  const { camera, gl, scene } = useThree()

  /**
   * Who is who, by name, built once.
   *
   * The loop walks `world.name` every frame, and looking each one up with a
   * `find` over the entity list is a quadratic sweep sixty times a second on
   * the one code path where that is least affordable.
   */
  const byName = useMemo(
    () => new Map(entities.filter((one) => one.name).map((one) => [one.name!, one])),
    [entities],
  )

  /** What the scrubber was last told, so it is told again only when it matters. */
  const announced = useRef(-1)
  /**
   * The clips in force last frame, so the panel is told only on a change.
   *
   * A cue is crossed a handful of times in a shot; comparing here is what keeps
   * that from being a `setState` sixty times a second. Joined into one string
   * because the comparison is "is this the same set", and a map has no cheap
   * equality.
   */
  const cued = useRef('')

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      onReady?.({ gl, scene, camera })
    }
  }, [camera, gl, scene, onReady])

  useFrame((_, delta) => {
    if (clock.advance(delta, timeline.duration, loop) === 'ended') onEnded()
    const t = clock.at()

    poseInto(held.current, byName, timeline, t)
    if (through !== null && camera instanceof THREE.PerspectiveCamera) {
      aim(camera, timeline, through, t)
    }

    // --- and what each body is playing ---------------------------------------
    const playing = new Map<number, string>()
    since.current.clear()
    for (const [id, name] of held.current.name) {
      /*
        Every body is placed by the playhead, cued or not.

        A body with nothing to play still has an idle, and an idle running at
        its own pace means the picture at two seconds is a different picture
        every time you look at it. A shot has to be the same shot - scrub away
        and back and see what you saw - so the *default* is the playhead itself
        and a cue only changes where in its own clip that lands.
      */
      since.current.set(id, t)
      // The whole-body clip is the first `cuesAt` returns; masked layers come
      // after it and are a renderer feature this stage does not have yet.
      const first = cuesAt(timeline, name, t)[0]
      if (first) {
        playing.set(id, first.clip)
        // Where in the clip the playhead is. Without this the body plays the
        // animation at its own speed under a playhead that may not be moving.
        since.current.set(id, first.since)
      }
      /*
        A preview wins over the shot, and only for the body it is about: it is
        a question being asked of one model, not a change to the film.

        And it runs *free* - no `since` - because a preview is the one case
        where you want to watch the clip rather than inspect a moment of it.
      */
      if (preview && preview.entity === name) {
        playing.set(id, preview.clip)
        since.current.delete(id)
      }
    }
    const signature = [...playing].map(([id, clip]) => `${id}:${clip}`).join('|')
    if (signature !== cued.current) {
      cued.current = signature
      onPlaying(playing)
    }

    // A hundredth of a second is finer than the scrubber can draw and coarser
    // than a frame, so this is a re-render only when the number on screen would
    // actually change.
    const shown = Math.round(t * 100)
    if (shown !== announced.current) {
      announced.current = shown
      onTime(t)
    }
  })

  return null
}

/**
 * An invisible box per named body, so the viewport can be clicked.
 *
 * Placed from the world every frame rather than from the document, for the
 * reason the bubbles are: during playback a body is wherever its keys have put
 * it, and a target drawn from the document would sit at the un-keyed position
 * and drift away from the thing it is meant to select.
 */
/**
 * How many bone handles exist at once.
 *
 * A fixed pool, because the alternative is a mesh per bone per body and the
 * dots would then have to be created and destroyed as the selection moves.
 * `dummy` has 23 poseable bones and the peepz rigs add wings and a tail; 40 is
 * comfortably above both and costs nothing when unused.
 */
const BONE_DOTS = 40

/**
 * The geometry's radius, which is only ever a unit for the scale to divide by.
 *
 * The drawn size is a pixel count - see `perPixel` - so this number's own value
 * does not matter, as long as the two agree.
 */
const DOT_RADIUS = 0.028

/**
 * A dot that is not there when it cannot be seen.
 *
 * three's raycaster does **not** check `visible` - it walks the graph and asks
 * every object with a matching layer. Without this, the twenty-odd parked dots
 * of the pool sit at the origin swallowing clicks on whatever is behind them,
 * which reads as "the floor stopped working" and has nothing on screen to
 * explain it.
 */
function whenSeen(
  this: THREE.Mesh,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[],
) {
  if (!this.visible) return
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersects)
}

/**
 * The selected body's skeleton, as something you can point at.
 *
 * ---------------------------------------------------------------------------
 * One pool, driven from the frame loop
 * ---------------------------------------------------------------------------
 * A body is identified by *name* only inside the loop - `world.name` is a live
 * map from id to name and there is no render-time equivalent - so a component
 * per body could not know whether it was the selected one without being told,
 * and telling it means the name would have to be resolved at render anyway.
 *
 * So this is one set of dots for the whole stage. Each frame it finds the
 * selected body, walks it for the bones the rig calls poseable, and parks the
 * rest. Nothing is created or destroyed as the selection moves.
 *
 * ---------------------------------------------------------------------------
 * The poseable ones, not every bone
 * ---------------------------------------------------------------------------
 * A glTF rig carries helpers, twist bones and an armature root that nobody
 * poses. `RIGS` already lists the ones the panel offers - with the hinge
 * constraints that stop knees bending sideways - and drawing anything it does
 * not name would offer a handle for a bone the sliders cannot turn.
 */
function Bones({
  world,
  rigs,
  actor,
  rig,
  chosen,
  onPick,
}: {
  world: { current: EntityWorld }
  rigs: React.RefObject<Map<number, THREE.Group>>
  /** Whose skeleton, by name. `null` draws nothing. */
  actor: string | null
  rig: SkeletonId | null
  chosen: string | null
  onPick?: (bone: string) => void
}) {
  const dots = useRef<(THREE.Mesh | null)[]>([])
  /** Which bone each dot is currently standing on, so a click knows its name. */
  const wearing = useRef<(string | null)[]>([])
  /** The bones found for one body, kept until the selection or the body changes. */
  const found = useRef<{ id: number; bones: THREE.Bone[] } | null>(null)

  const poseable = useMemo(
    () => new Set((rig ? RIGS[rig].bones : []).map((one) => one.name)),
    [rig],
  )

  // Dropped rather than trusted across a change of body: the objects in it
  // belong to a skeleton that may have just been unmounted.
  useEffect(() => {
    found.current = null
  }, [actor, rig])

  useFrame(({ camera, size }) => {
    const park = (from: number) => {
      for (let i = from; i < BONE_DOTS; i += 1) {
        const dot = dots.current[i]
        if (dot) dot.visible = false
        wearing.current[i] = null
      }
    }

    if (!actor || poseable.size === 0) {
      park(0)
      return
    }

    let id: number | null = null
    for (const [candidate, name] of world.current.name) {
      if (name === actor) {
        id = candidate
        break
      }
    }
    if (id === null) {
      park(0)
      return
    }

    if (found.current?.id !== id) {
      const root = rigs.current?.get(id)
      if (!root) {
        park(0)
        return
      }
      const bones: THREE.Bone[] = []
      root.traverse((node) => {
        if ((node as THREE.Bone).isBone && poseable.has(node.name)) bones.push(node as THREE.Bone)
      })
      // Not cached when empty: the body may simply not have loaded yet, and a
      // cached "no bones" is a skeleton that never appears.
      if (bones.length === 0) {
        park(0)
        return
      }
      found.current = { id, bones }
    }

    /**
     * How many world units one screen pixel is worth, per unit of distance.
     *
     * The dots are sized in **pixels**, not metres, and this is the whole
     * reason: a fixed world radius that reads well up close is two pixels
     * across from the far side of a set, and a two-pixel target is one nobody
     * can hit. A systematic sweep of the body at seven-pixel steps found no
     * bone at all - the handles were drawn, lit and correct, and simply too
     * small to click, which is a failure with nothing on screen to explain it.
     */
    const perPixel =
      'isPerspectiveCamera' in camera && camera.isPerspectiveCamera
        ? (2 * Math.tan((camera.fov * Math.PI) / 360)) / size.height
        : 1 / size.height

    const at = new THREE.Vector3()
    const list = found.current.bones
    const many = Math.min(list.length, BONE_DOTS)
    for (let i = 0; i < many; i += 1) {
      const dot = dots.current[i]
      const bone = list[i]!
      if (!dot) continue
      bone.getWorldPosition(at)
      dot.position.copy(at)
      dot.visible = true
      // The chosen one bigger rather than only recoloured, because a colour
      // change on something this small is not a signal on its own.
      const big = bone.name === chosen
      dot.scale.setScalar(
        ((big ? 9 : 6) * perPixel * at.distanceTo(camera.position)) / DOT_RADIUS,
      )
      const material = dot.material as THREE.MeshBasicMaterial
      material.color.set(big ? '#ddd6fe' : '#8b5cf6')
      material.opacity = big ? 1 : 0.7
      wearing.current[i] = bone.name
    }
    park(many)
  })

  if (!onPick) return null

  return (
    <>
      {Array.from({ length: BONE_DOTS }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          raycast={whenSeen}
          renderOrder={999}
          ref={(node) => {
            dots.current[i] = node
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            // Or the handle box behind it re-selects the actor, which closes
            // the very panel the click was aiming at.
            event.stopPropagation()
            const name = wearing.current[i]
            if (name) onPick(name)
          }}
        >
          <sphereGeometry args={[DOT_RADIUS, 10, 10]} />
          {/*
            `depthTest` off for the reason the entity handles give: a joint you
            can only see when nothing is in front of it is a joint you cannot
            click on a body that is facing away from you.
          */}
          <meshBasicMaterial color="#8b5cf6" depthTest={false} transparent opacity={0.7} />
        </mesh>
      ))}
    </>
  )
}

/** A handle that is not there at all. See `posing` in `Handles`. */
function never() {}

function Handles({
  world,
  entities,
  empties,
  posing,
  adding,
  onPick,
}: {
  world: { current: EntityWorld }
  entities: readonly EntitySpec[]
  /** The names that draw nothing, so their handle is drawn instead. */
  empties: ReadonlySet<string>
  /** Whether the toolbar's *add to selection* latch is down. See `MovieMode`. */
  adding: boolean
  /**
   * Whose bones are showing, if anybody's.
   *
   * That body's handle stops intercepting rays. The handle is a 1.8m box
   * *around* the body and three picks the nearest intersection, so the box is
   * hit before anything inside it - which made every bone dot unclickable, in a
   * way nothing on screen could explain: the dots were drawn, lit, and simply
   * never received the click.
   *
   * Nothing is lost by standing it down. The only thing the box does is select
   * this body, and this body is the selected one.
   */
  posing: string | null
  onPick?: ((name: string, add: boolean) => void) | undefined
}) {
  const boxes = useRef<Map<string, THREE.Mesh>>(new Map())
  const named = useMemo(
    () => entities.filter((one) => one.name).map((one) => one.name!),
    [entities],
  )

  useFrame(() => {
    for (const [id, name] of world.current.name) {
      const box = boxes.current.get(name)
      if (!box) continue
      const at = worldTransform(world.current, id)
      if (!at) continue
      // Follows being keyed off, so a hidden body is not a thing you can still
      // click on - which would be a selection nobody can see the result of.
      box.visible = world.current.alive.has(id)
      box.position.set(at.x, at.y + 0.9, at.z)
    }
  })

  if (!onPick) return null

  return (
    <>
      {named.map((name) => (
        <mesh
          key={name}
          ref={(node) => {
            if (node) boxes.current.set(name, node)
            else boxes.current.delete(name)
          }}
          {...(name === posing ? { raycast: never } : {})}
          onClick={(event) => {
            event.stopPropagation()
            // `adding` is the toolbar's latch; shift is the same thing for a
            // hand already on a keyboard. Either one means "and this too".
            onPick(name, event.nativeEvent.shiftKey || adding)
          }}
        >
          <boxGeometry args={[0.9, 1.8, 0.9]} />
          {/*
            Invisible over a body, faintly visible over a node.

            A node draws nothing by design - that is what makes it a node - so
            without this its handle is a box you can only find by remembering
            where you put it. The wireframe is the *only* thing on screen that
            says a group is there, so it is drawn rather than merely clickable.

            `depthTest` off, because a handle you can see only when nothing is
            in front of it is a handle you cannot find in a dressed set.
          */}
          <meshBasicMaterial
            wireframe={empties.has(name)}
            color="#a78bfa"
            transparent
            opacity={empties.has(name) ? 0.35 : 0}
            depthTest={!empties.has(name)}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  )
}

/**
 * The world, posed at `t`.
 *
 * A module-level function rather than a block inside the loop, for the reason
 * `./clock` gives about the playhead: the React Compiler will not optimise a
 * component that assigns to fields of a value reached through its props, and it
 * is right to be suspicious. Out here it is a plain function over a world, with
 * nothing about React in it - which is also what makes it the same shape as
 * everything else in the engine.
 *
 * `visible` becomes membership of `world.alive`, which is worth pausing on: an
 * actor keyed off is drawn by exactly the code that draws a despawned one, so
 * hiding something in a shot needs no rendering support at all.
 */
function poseInto(
  world: EntityWorld,
  byName: ReadonlyMap<string, EntitySpec>,
  timeline: XpTimeline,
  t: number,
) {
  world.seconds = t

  for (const [id, name] of world.name) {
    const entity = byName.get(name)
    if (!entity) continue
    const posed = posedAt(entity, timeline, t)

    /**
     * And what this body has *done*, folded on top of where it is.
     *
     * `actedAt` was written, tested and drawn on the strip, and nothing called
     * it: `poseInto` applied the keys and stopped. So `move`, `turn` and `jump`
     * could be made, edited, dragged, retimed and removed, and three of the
     * five kinds of action had never moved a body. It took a demo with a
     * punchline to notice - the shot played, the lines appeared, and the figure
     * stood in one place through all of it.
     *
     * Keys first and actions second, because that is what each is for: a key
     * says where a body *is* at a moment, and an action says what it does from
     * wherever that leaves it.
     */
    const acted = actedAt(timeline, name, t, {
      x: posed.entity.x,
      y: posed.entity.y,
      z: posed.entity.z,
      rotation: posed.entity.rotation,
    })

    world.position.set(id, { x: acted.x, y: acted.y, z: acted.z })
    world.rotation.set(id, acted.rotation)
    if (posed.entity.pitch !== undefined) world.pitch.set(id, posed.entity.pitch)
    if (posed.entity.roll !== undefined) world.roll.set(id, posed.entity.roll)
    world.scale.set(id, posed.entity.scale)
    world.props.set(id, posed.entity.props)

    if (posed.visible) world.alive.add(id)
    else world.alive.delete(id)
  }
}

/** The camera, put where the shot says it is at `t`. */
function aim(
  camera: THREE.PerspectiveCamera,
  timeline: XpTimeline,
  through: string,
  t: number,
) {
  const name = through === LIVE ? liveCamera(timeline, t) : through
  const one = timeline.cameras.find((each) => each.name === name) ?? timeline.cameras[0]
  if (!one) return

  const framing = framingAt(one, t)
  camera.position.set(framing.position[0], framing.position[1], framing.position[2])
  camera.lookAt(framing.target[0], framing.target[1], framing.target[2])
  if (camera.fov !== framing.fov) {
    camera.fov = framing.fov
    camera.updateProjectionMatrix()
  }
}

/**
 * What is behind the world.
 *
 * `none` paints nothing at all, which is not the same as painting black: the
 * canvas keeps its alpha and a frame exported from it is a cut-out. That is the
 * whole reason the kind exists, and it is why this is a component rather than a
 * `scene.background` assignment tucked into the driver - the absence has to be
 * as deliberate as the presence.
 */
function Backdrop({ backdrop }: { backdrop: XpTimeline['backdrop'] }) {
  const { scene } = useThree()

  useEffect(() => paint(scene, backdrop), [backdrop, scene])

  return null
}

/**
 * Put the backdrop on the scene, and hand back the way to take it off.
 *
 * Out here for the reason `poseInto` is: the React Compiler will not optimise a
 * component that assigns to a value a hook returned, and `scene.background` is
 * exactly that. The rule is a good one - a component that mutates something
 * shared is one whose effect order starts to matter - and this is the honest
 * shape anyway: painting a backdrop is a fact about a three.js scene, with
 * nothing about React in it.
 */
function paint(scene: THREE.Scene, backdrop: XpTimeline['backdrop']): () => void {
  scene.background = null
  scene.fog = null

  if (backdrop.kind === 'colour' && backdrop.colour) {
    const colour = new THREE.Color(backdrop.colour)
    scene.background = colour
    /*
     * The fog follows the background, which is the part that is easy to get
     * wrong: fog in a different colour draws a visible ring where the far plane
     * ends, and the whole job of fog here is that there is no such ring. The
     * same rule `world.background` states for a level.
     */
    scene.fog = new THREE.Fog(colour, 60, 260)
    return () => {}
  }

  if ((backdrop.kind === 'image' || backdrop.kind === 'sky') && backdrop.image) {
    let live = true
    let loaded: THREE.Texture | null = null

    new THREE.TextureLoader().load(backdrop.image, (texture) => {
      // The load is async and the backdrop may have changed while it ran, so a
      // late arrival paints over whatever replaced it unless this asks first.
      if (!live) {
        texture.dispose()
        return
      }
      loaded = texture
      texture.colorSpace = THREE.SRGBColorSpace
      /*
       * A sky wraps the world and a picture sits flat behind it. The same file
       * either way, and the mapping is the whole difference - which is why they
       * are two kinds rather than one kind with a checkbox: an author choosing
       * between them is choosing what the picture *is*, not how it is drawn.
       */
      texture.mapping =
        backdrop.kind === 'sky' ? THREE.EquirectangularReflectionMapping : THREE.UVMapping
      scene.background = texture
    })

    return () => {
      live = false
      loaded?.dispose()
    }
  }

  return () => {}
}

/**
 * The camera name meaning "whichever the cut says".
 *
 * A sentinel rather than `null`, because `null` already means free look and the
 * three states are genuinely different: looking around, watching one camera
 * whatever the cut does, and watching the film. The middle one is what somebody
 * uses to line up a camera that is not live yet.
 */
export const LIVE = '@live'
