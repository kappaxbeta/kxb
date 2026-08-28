'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { placeOf, type EntitySpec, type XpDocument } from '@kxb/xp'
import { spawnEntities, type EntityWorld } from '@kxb/xp/engine'
import {
  actedAt,
  cuedAt,
  cuesAt,
  framingAt,
  liveCamera,
  posedAt,
  sequenceLength,
  type XpSequence,
  type XpTimeline,
} from '@kxb/xp/movie'
import { Bubbles } from '@/app/xp/_runtime/world/bubbles'
import { LiveEntities } from '@/app/xp/_runtime/world/live'
import { Placements } from '@/app/xp/_runtime/world/instances'

/**
 * A cut, played over a level that is still there.
 *
 * ---------------------------------------------------------------------------
 * Why this is drawn over the game rather than loaded instead of it
 * ---------------------------------------------------------------------------
 * The obvious build is `load`: a cutscene is somewhere else, so go there and
 * come back. It is wrong in three ways at once, and the verb's own note in
 * `@kxb/xp` spells them out - a load takes the **whole room** with it, so one
 * person walking into a trigger drags everybody into a film they did not start;
 * it throws the entity world away, so "come back" means rebuilding the level
 * and everything anybody was standing on; and it is a broadcast, so a shot
 * cannot be something one player sees.
 *
 * So a cut is a *film*. It draws its own scene - built out of the document the
 * runtime is already holding - with its own camera, over a level that carries
 * on existing underneath. Nothing is fetched, because every place a take names
 * is in the same file.
 *
 * ---------------------------------------------------------------------------
 * What it does not do, said out loud
 * ---------------------------------------------------------------------------
 * **The simulation keeps running.** Scripts tick, timers fire, and in a room
 * other people keep moving. That is deliberate rather than unfinished: pausing
 * the world is a thing one client cannot do to a room, so a cutscene that froze
 * the level would be honest only when nobody else was in it. What the host does
 * instead is stop reading input while this is up, so somebody watching cannot
 * walk off a ledge - but they can still be shot. A level that cares should play
 * its cut somewhere nothing can reach the player.
 *
 * That last paragraph described the intent for as long as this file has existed
 * and described nothing the code did: `filming` is the prop that finally does
 * it, threaded from ../scene through `Running` to `./player`. Until then a held
 * key walked the player blind for the length of the shot - and, because the
 * camera hangs off the body's rig, dragged the framing along with them. See
 * `aim` below for the other half of that.
 *
 * **The level is still drawn underneath.** A cut adds its own set and cast to
 * the same scene rather than replacing what is there, so a cut of the place the
 * player is standing in draws that place twice. That is a real limitation and it
 * is stated here rather than discovered: what a film should composite over is a
 * decision about the feature, not a bug in this file.
 *
 * ---------------------------------------------------------------------------
 * Mounted with a `key`, so replaying starts at the beginning
 * ---------------------------------------------------------------------------
 * Every piece of state here - the playhead, which take is showing - is about
 * *this run of this cut*. Rather than a hook that notices the cut changed and
 * resets, the caller keys the component on the run, which is what React's own
 * remount is for and needs no code here at all.
 */

export interface CutsceneProps {
  document: XpDocument
  sequence: XpSequence
  /** Called when the cut runs out, or when somebody skips it. */
  onEnd: () => void
}

export function Cutscene({ document: xp, sequence, onEnd }: CutsceneProps) {
  const at = useRef(0)
  const total = useMemo(() => sequenceLength(sequence), [sequence])

  /**
   * Which take is on screen. The one thing here that has to re-render.
   *
   * A cut *is* a change of scene, so this is a genuine React state change - and
   * it is the only one, which is what keeps a film from re-rendering the tree
   * thirty times a second. Everything else is written into a world in a ref.
   */
  const [index, setIndex] = useState(0)

  const take = sequence.takes[index]
  const place = take ? placeOf(xp, take.scene) : null
  const timeline = place?.timeline

  /**
   * This take's world, and the specs it was built from.
   *
   * **Both**, and the pair is the point. The world is what gets posed and drawn;
   * the specs are what a key falls back to *before its first key*, which is a
   * document fact and must not come from the world. Reading the fallback back
   * out of the world would make every unkeyed frame start from the last posed
   * one, so a property with a key at two seconds would drift for the two
   * seconds before it - visible as a shot that is subtly different every time
   * it plays.
   */
  const scene = useMemo(() => {
    if (!place) return null
    const entities = [...place.entities]
    return {
      held: { current: spawnEntities({ ...xp, entities }) },
      byName: new Map(
        entities.filter((one) => one.name).map((one) => [one.name!, one] as const),
      ),
    }
  }, [place, xp])

  return (
    <>
      <Driver
        sequence={sequence}
        total={total}
        at={at}
        scene={scene}
        timeline={timeline}
        onTake={setIndex}
        onEnd={onEnd}
      />

      {place && scene && timeline ? (
        <Suspense fallback={null}>
          <Placements placements={place.world.placements} />
          {/*
            Keyed on the cast, because `LiveEntities` is built for a world that
            is *mutated*: it measures its models on mount and recounts only when
            an instanced group overflows. A cut replaces its world at every take,
            so nothing ever overflows - without this it draws the first take's
            cast for the whole film.
          */}
          <LiveEntities
            key={place.entities.map((one) => `${one.name}:${one.blueprint}`).join('|')}
            world={scene.held}
            blueprints={xp.blueprints}
            {...(xp.clips ? { carried: xp.clips } : {})}
            /*
              The stance worked out from the drawn motion, which is the truth
              here and is not in a level. See `measured` on `LiveEntities`:
              without it a `move` walks a body across the set with its feet
              still, because every frame's position reads as an absence of news.
            */
            measured
          />
          {/*
            And what anybody is saying.

            **Inside a boundary of its own, and that is not optional.** drei's
            `<Text>` suspends while troika fetches its font, and a component that
            suspends with no boundary above it suspends the whole R3F root - the
            level underneath this cut, not just the cut. `MovieStage` gives its
            copy a separate boundary for the same reason.

            The lines were the third thing a cut in the game did not have. A shot
            whose subject is two people talking played in silence; `linesAt` was
            written and tested and only the editor ever called it.
          */}
          <Suspense fallback={null}>
            <Bubbles world={scene.held} timeline={timeline} at={() => at.current} />
          </Suspense>
        </Suspense>
      ) : null}
    </>
  )
}

/**
 * The frame loop: advance the clock, pick the take, pose it, aim the camera.
 *
 * One `useFrame` rather than several, because the order matters and a single
 * hook is the only way to say so - the clock has to move before the take is
 * chosen, and the take has to be chosen before anything is posed.
 */
function Driver({
  sequence,
  total,
  at,
  scene,
  timeline,
  onTake,
  onEnd,
}: {
  sequence: XpSequence
  total: number
  at: React.RefObject<number>
  scene: { held: { current: EntityWorld }; byName: ReadonlyMap<string, EntitySpec> } | null
  timeline: XpTimeline | undefined
  onTake: (index: number) => void
  onEnd: () => void
}) {
  const { camera } = useThree()
  const ended = useRef(false)

  useFrame((_, delta) => {
    if (ended.current) return

    // Clamped, so a tab returning from the background does not skip the whole
    // film in one frame - the same clamp every other loop in this runtime uses.
    advance(at, Math.min(delta, 0.1))

    const cued = cuedAt(sequence, at.current)
    if (!cued || at.current >= total) {
      // Latched, because `onEnd` unmounts this and a second call on the same
      // frame would be a state update after the component has gone.
      ended.current = true
      onEnd()
      return
    }

    onTake(cued.index)
    if (!scene || !timeline) return

    poseInto(scene.held.current, scene.byName, timeline, cued.local)
    if (camera instanceof THREE.PerspectiveCamera) aim(camera, timeline, cued.local)
  })

  return null
}

/** Move the playhead. A function so the loop is not assigning to a prop. */
function advance(at: React.RefObject<number>, by: number) {
  at.current += by
}

/**
 * The world, posed at `t`.
 *
 * A module-level function for the reason the editor's copy is one: the React
 * Compiler will not optimise a component that assigns to fields of a value
 * reached through its props, and it is right to be suspicious. Out here it is a
 * plain function over a world with nothing about React in it.
 *
 * Copied rather than shared with `_editor/movie/stage`, per creator.md §1.2 -
 * this is the runtime and that is a host panel, and the two are allowed to
 * disagree. The editor's also answers a picker's selection; this one never will.
 */
function poseInto(
  world: EntityWorld,
  byName: ReadonlyMap<string, EntitySpec>,
  timeline: XpTimeline,
  t: number,
) {
  world.seconds = t

  for (const [id, name] of world.name) {
    const spec = byName.get(name)
    if (!spec) continue
    const posed = posedAt(spec, timeline, t)

    /**
     * And what this body has **done**, folded on top of where its keys put it.
     *
     * The editor's copy of this function carries the same block and the same
     * note, and the note is about exactly this failure: `actedAt` was written,
     * parsed, tested and drawn on the strip, and for a while nothing called it.
     * That was found and fixed in `_editor/movie/stage`, and this file - the one
     * that plays a cut **in the game**, which is the only place a `movie` verb
     * ever shows anybody anything - was left as it was.
     *
     * So `move`, `turn` and `jump` did nothing here. A film triggered by a rule
     * played its cameras and its cuts perfectly over a cast standing perfectly
     * still, and the shipped example - whose whole joke is somebody tripping
     * over a crate - was eight seconds of two figures not moving. Nothing about
     * it fails to type, nothing about it fails to parse, and the editor showed
     * it working the entire time.
     *
     * Keys first and actions second, because that is what each is for: a key
     * says where a body *is* at a moment, an action says what it does from
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

    /**
     * And whatever they are playing, through the world's own clip row.
     *
     * The other half that was missing, and it needs no new component: a rigged
     * body drawn by `LiveEntities` already reads `world.clip` every frame, which
     * is how a script's `play` reaches one. A cue is the same request from a
     * timeline instead of from a script.
     *
     * Written only when it **changes**, keyed on the moment the cue began rather
     * than on now. `SkinnedBody` treats a fresh `at` as "start this again", so
     * setting it every frame would restart the animation on every frame - a body
     * frozen on the first pose of a clip it never gets to play. `t - since` is
     * the action's own `t`, which is a constant for as long as the cue is in
     * force; rounded to the millisecond because it is a constant *algebraically*
     * and floating point does not promise the bits back unchanged.
     */
    const cue = cuesAt(timeline, name, t)[0]
    if (cue) {
      const began = Math.round((t - cue.since) * 1000) / 1000
      const already = world.clip.get(id)
      if (already?.name !== cue.clip || already.at !== began) {
        world.clip.set(id, {
          name: cue.clip,
          loop: cue.loop,
          at: began,
          ...(cue.parts ? { parts: cue.parts } : {}),
        })
      }
    } else if (world.clip.has(id)) {
      // A cut that has run past its last `play` leaves the body to the stance
      // machine again, rather than holding the final frame of a clip forever.
      world.clip.delete(id)
    }

    // Being keyed off *is* being despawned as far as the renderer is concerned,
    // which is why hiding somebody in a shot needs no drawing code of its own.
    if (posed.visible) world.alive.add(id)
    else world.alive.delete(id)
  }
}

/**
 * The camera, put where the shot says it is at `t`.
 *
 * ---------------------------------------------------------------------------
 * A framing is a world transform, and this camera is not at the world root
 * ---------------------------------------------------------------------------
 * The line that used to be here was `camera.position.set(...)` and nothing else,
 * copied from the editor's `aim` where it is exactly right: on the movie stage
 * the camera hangs off the scene, so its own position *is* its world position.
 *
 * In the game it is not. `./player` parents the camera to a rig group and moves
 * the rig - three's own answer to a headset owning where you look while the game
 * owns where you stand, and the note there explains why it has to be that way.
 * The consequence for a film is total and silent: `position` is a local offset
 * inside that rig, so a shot framed at `(7, 4.2, 9)` in the editor was drawn
 * from `(7, 6.9, 19)` in the level, rotated by whichever way the player happened
 * to be facing. Measured at 72 frames out of 72 - not an edge case, every frame
 * of every cut in every level, and the picture is plausible enough that it reads
 * as a badly framed shot rather than as a bug.
 *
 * So the framing is converted into the parent's space. `lookAt` needs no such
 * help - it is already parent-aware, and it reads the camera's world position
 * out of `matrixWorld`, which is why `updateWorldMatrix` has to come between the
 * two: without it the aim is computed from where the camera was last frame.
 *
 * The parent's own matrix is a frame old, because the rig moves in `Running`'s
 * loop and this one runs first. That is exact while the rig is still, which is
 * what `filming` now guarantees - see `frozen` on ./player.
 */
function aim(camera: THREE.PerspectiveCamera, timeline: XpTimeline, t: number) {
  const name = liveCamera(timeline, t)
  const one = timeline.cameras.find((each) => each.name === name) ?? timeline.cameras[0]
  if (!one) return

  const framing = framingAt(one, t)
  camera.position.set(framing.position[0], framing.position[1], framing.position[2])
  camera.parent?.worldToLocal(camera.position)
  camera.updateWorldMatrix(true, false)
  camera.lookAt(framing.target[0], framing.target[1], framing.target[2])
  if (camera.fov !== framing.fov) {
    camera.fov = framing.fov
    camera.updateProjectionMatrix()
  }
}
