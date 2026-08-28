'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { floorOffset } from '@kxb/xp/catalogue'
import { modelUrl, skeletonOf, splitModel } from '@kxb/xp/packs'
import { poseAt } from '@kxb/xp/motions'
import type { XpClip } from '@kxb/xp/clips'
import {
  drawnModels,
  isFlat,
  partTransforms,
  Rolling,
  stretchOf,
  worldTransform,
  type Blueprint,
  type EntityWorld,
  type Smoothing,
  type WorldTransform,
} from '@kxb/xp/engine'
import type { XpMaterial } from '@kxb/xp'
import { capacityFor, useParts } from '@/app/xp/_runtime/world/instances'
import { shakeOf } from '@/app/xp/_runtime/body/shake'
import { SkinnedBody } from '@/app/xp/_runtime/body/skinned'
import {
  groupOf,
  instancedCounts,
  MAX_POSED,
  posedBodies,
  type PosedBody,
} from '@/app/xp/_runtime/body/posed'
import { useRainbowMaterial } from '@/app/xp/_runtime/world/rainbow'


/**
 * Entities drawn from the simulation rather than from props.
 *
 * The difference from `Entities` in ./instances is where the numbers come from,
 * and it is the whole reason both exist: a script that lifts a platform changes
 * a position sixty times a second, and passing that through React would be sixty
 * re-renders a second of a tree holding thousands of instanced meshes. So the
 * world stays in a ref, `useFrame` reads it, and the matrices are written
 * straight into the buffer. React is told only when the *shape* changes - a new
 * model appearing, or a group outgrowing its buffer.
 *
 * The static version is kept and still used, for placements and for the editor's
 * preview, because a level of scenery should not pay for a frame loop it has no
 * use for.
 */

/**
 * Entities that move, drawn from the simulation rather than from props.
 *
 * The difference from `Entities` above is where the numbers come from, and it is
 * the whole reason this exists: a script that lifts a platform changes a
 * position sixty times a second, and passing that through React would be sixty
 * re-renders a second of a tree holding thousands of instanced meshes. So the
 * world stays in a ref, `useFrame` reads it, and the matrices are written
 * straight into the buffer. React is told only when the *shape* changes - a new
 * model appearing, or a group outgrowing its buffer.
 *
 * The static version is kept and still used for a document with nothing running
 * in it, because a level of scenery should not pay for a frame loop it has no
 * use for.
 */
export function LiveEntities({
  world,
  blueprints,
  carried,
  hide,
  shaking,
  smoothing,
  measured,
}: {
  world: React.RefObject<EntityWorld | null>
  blueprints: Readonly<Record<string, Blueprint>>
  /** The clips this level carries itself. Passed on to every rigged body. */
  carried?: Readonly<Record<string, XpClip>>
  /**
   * How much flinch each thing has left, in seconds. See ./shake.
   *
   * A ref rather than a prop full of numbers, and it is the same decision every
   * other moving thing in this file is drawn from: the map changes on the frame
   * something is hit and is read on every frame after it, so as state it would
   * be a re-render of the whole scene per hit and a stale value in between.
   *
   * Absent in the editor's preview, which draws the same entities with nothing
   * shooting at them.
   */
  shaking?: React.RefObject<Map<number, number>>
  /**
   * How far behind its real position each thing is still being drawn.
   *
   * A ref for `shaking`'s reason and read the same way, and it is doing the same
   * kind of job: the entity is exactly where the world says it is - triggers,
   * goals, contacts and claims all read that - and this is a gap on its way to
   * zero that only the mesh knows about. See `@kxb/xp/drawing`, which is where
   * the handover it absorbs is argued out.
   *
   * Absent in the editor's preview, which has no network to be behind.
   */
  smoothing?: React.RefObject<Smoothing>
  /**
   * Entities to leave undrawn.
   *
   * One caller and one member: the player's own body, in first person. The body
   * is an entity like everything else - which is what lets a script find it and
   * a trigger name it - and in first person the camera is inside its head, so
   * drawing it is drawing the inside of a face across the whole screen.
   *
   * Not a despawn, and the difference matters: a body that stopped existing
   * would stop being something a rule can address, and pressing V would change
   * the game rather than the view.
   */
  hide?: ReadonlySet<number>
  /**
   * Work each rigged body's stance out from how far it actually moves.
   *
   * Off by default, which is right for a level: an entity only moves when the
   * step moves it, so a position that has not changed is an absence of news
   * rather than evidence of standing still - see `settled` on `PosedEntity`.
   *
   * A **cut** is the case where it is wrong. There a timeline moves bodies every
   * frame and the movement is the entire subject, so without this a `move`
   * action slid a figure across the floor with its feet still and a `jump`
   * lifted one that never left the ground as far as the stance machine was
   * concerned. `MovieStage` has always drawn its bodies itself and passed this;
   * `Cutscene` goes through here, and could not.
   */
  measured?: boolean
}) {
  /**
   * How many of each model to make room for.
   *
   * State holding the answer rather than a memo recomputed when a counter ticks.
   * The memo version needed a `generation` in its dependency list that nothing
   * in the body read - it existed only to force the recomputation - which lints
   * as an unnecessary dependency and is, honestly, a lie about what the value
   * depends on. It depends on the *world*, which is a ref and cannot be a
   * dependency of anything.
   *
   * So the recount is an event: it happens when a group overflows its buffer or
   * when a model appears that had none. Sizes are rounded up to a power of two,
   * so a rule that spawns three pieces of debris does not re-render the scene
   * three times - the buffer already had room.
   */
  /**
   * Both halves of the same question, asked once.
   *
   * They used to be two loops that disagreed - see `./posed`, which is where
   * the disagreement and the body it lost are written down.
   */
  function look() {
    const live = world.current
    if (!live) return { posed: [] as PosedBody[], capacities: [] as (readonly [string, number])[] }

    const posed = posedBodies(live, blueprints, MAX_POSED)
    const counts = instancedCounts(live, blueprints, posed)
    return {
      posed,
      capacities: [...counts].map(([model, count]) => [model, capacityFor(count)] as const),
    }
  }

  function measure() {
    return look().capacities
  }

  const [capacities, setCapacities] = useState(measure)

  /**
   * The entities drawn with a skeleton rather than a buffer slot.
   *
   * ---------------------------------------------------------------------------
   * A third path, and why there has to be one
   * ---------------------------------------------------------------------------
   * Instancing shares one geometry between every copy, and a skinned pose is a
   * *different* geometry per body - so a rigged model drawn the ordinary way is
   * a bind pose. Silently: nothing throws, the model appears, and it stands with
   * its arms out. That is what every dummy placed as an entity has done.
   *
   * So they come out of the instanced count above and get a `SkinnedBody` each,
   * which already takes exactly what a static one needs: a `sample` for where it
   * is and a `rest` for what it holds. `blueprint.pose` is that rest - a field
   * that has been in the format since bodies could be animated and, until now,
   * was read for exactly one blueprint.
   *
   * **Capped, and the cap is said out loud** rather than a list that quietly
   * stops. One draw call and one mixer each is the opposite trade from the one
   * instancing makes, so this is for the handful of characters in a level, not
   * for its architecture. Past the cap they fall back to being drawn instanced -
   * a T-posed body is wrong-looking and *there*, which beats vanishing.
   */
  function posedNow(): PosedBody[] {
    return look().posed
  }

  const [posed, setPosed] = useState(posedNow)

  /**
   * Recount, and keep the array identity when nothing changed.
   *
   * Without the comparison, an overflow that resolves to the same sizes still
   * hands React a new array and remounts every group - which is the exact
   * churn this is here to avoid, arriving through the fix for it.
   */
  function overflow() {
    setCapacities((previous) => {
      const next = measure()
      const same =
        previous.length === next.length &&
        previous.every(([model, room], i) => next[i][0] === model && next[i][1] === room)
      return same ? previous : next
    })

    /**
     * The posed set is recounted on the same event, and it has to be.
     *
     * The instanced groups notice a change because one of them *overflows* -
     * a spawn writes past the end of a buffer and says so. A posed body writes
     * into no buffer at all, so nothing about it can overflow: without
     * recounting here, a rigged entity spawned by a rule would never appear, and
     * one despawned would be drawn forever.
     *
     * Which means the invariant is that every path that can change the live set
     * calls this. It is the same one `measure` already depends on, so a rigged
     * spawn is covered by the model appearing; what this adds is the second and
     * later ones, which change nothing about capacities and everything about
     * this.
     */
    setPosed((previous) => {
      const next = posedNow()
      const same =
        previous.length === next.length &&
        previous.every(
          (was, i) =>
            next[i]!.id === was.id &&
            next[i]!.model === was.model &&
            next[i]!.pose === was.pose &&
            next[i]!.scale === was.scale,
        )
      return same ? previous : next
    })
  }

  return (
    <>
      {capacities.map(([key, room]) => {
        const group = groupOf(key)
        return (
          <LiveModel
            key={key}
            model={group.model}
            wears={group.material}
            room={room}
            world={world}
            blueprints={blueprints}
            hide={hide}
            {...(shaking ? { shaking } : {})}
            {...(smoothing ? { smoothing } : {})}
            onOverflow={overflow}
          />
        )
      })}

      {/*
        Hidden ones are skipped here rather than rendered as nothing.

        The instanced path counts a hidden entity and simply does not write it,
        because a buffer sized without it is a buffer that stays empty when the
        view changes back. A posed body has no buffer to size, so there is
        nothing to keep a slot for - and unmounting costs a re-clone of a glTF
        `useGLTF` has already cached rather than a fetch.
      */}
      {posed
        .filter((body) => !hide?.has(body.id))
        .map((body) => (
          <PosedEntity
            key={body.id}
            id={body.id}
            model={body.model}
            scale={body.scale}
            {...(body.pose ? { pose: body.pose } : {})}
            {...(carried ? { carried } : {})}
            {...(measured ? { measured } : {})}
            world={world}
          />
        ))}
    </>
  )
}

/**
 * One entity drawn with its skeleton.
 *
 * A thin wrapper on `SkinnedBody`, which already does all of it - the point of
 * this component is the `sample`, and the point of the sample is that it reads
 * the *world* every frame rather than a position captured at render. An entity
 * moves because a rule moved it, and a rule runs in a frame.
 *
 * `settled: true` on every sample, deliberately: the flag means "this is the
 * last thing we heard rather than a point between two", and for an entity there
 * is nothing to interpolate - the world holds where it *is*. Saying otherwise
 * would put the peer easing on a thing that never had a network between it and
 * the truth.
 */
export function PosedEntity({
  id,
  model,
  scale,
  pose,
  world,
  carried,
  onPick,
  measured = false,
  since,
}: {
  id: number
  model: string
  scale: number
  pose?: string
  world: React.RefObject<EntityWorld | null>
  /**
   * The clips this level carries itself, if it carries any.
   *
   * Threaded down rather than read from a context, because this file has no
   * document - it draws out of `EntityWorld`, which is deliberately the *live*
   * state and not the thing it was built from. One prop is cheaper than giving
   * the renderer an opinion about where documents come from.
   */
  carried?: Readonly<Record<string, XpClip>>
  /**
   * Called with the entity's id when it is clicked. Only the editor passes one.
   *
   * The instanced path cannot do this without `instanceId` - there is no object
   * per crate, only a buffer index - and a skinned body is the opposite: it *is*
   * an object, so the handler goes on a group around it and three's own
   * raycasting against the mesh does the rest.
   *
   * Absent in a running level, deliberately and for the reason `Marks` gives:
   * something you can click in a game is something you expect to *do* something,
   * so a shot fired at a character should pass through rather than select it.
   */
  onPick?: (id: number) => void
  /**
   * Work the stance out from how far this body actually moves.
   *
   * Only the movie stage wants this - see `settled` in the sample below.
   */
  measured?: boolean
  /**
   * How far into its clip each body is, when something is driving the time.
   *
   * A ref rather than a prop value, because it changes every frame and a prop
   * would be a re-render of the tree sixty times a second - the same argument
   * the position rides in the sample for. Absent leaves the clip running at its
   * own pace, which is what a level wants.
   */
  since?: React.RefObject<ReadonlyMap<number, number>>
}) {
  const pack = splitModel(model)?.pack
  const drawn = (pack?.scale ?? 1) * scale
  // The same arithmetic the player's body does, and for the same reason: the
  // catalogue's size is already in cells, so only the document's own scale
  // multiplies it. See `floorOffset`.
  const lift = ((pack?.lift ?? 0) + floorOffset(model)) * scale

  /**
   * A plain closure, not a `useCallback`.
   *
   * It reads `world.current`, and the compiler infers that as a dependency of a
   * memo whose declared ones are `[id, world]` - which is the ref-during-render
   * refusal `SkinnedBody`'s own `sample` doc spends a paragraph on. The answer
   * there is the answer here: a closure costs one allocation per render, and
   * renders here happen when a body spawns or despawns rather than per frame.
   */
  const sample = () => {
    const live = world.current
    if (!live || !live.alive.has(id)) return null
    const at = live.position.get(id)
    if (!at) return null
    /**
     * And whatever a script has asked this body to play.
     *
     * Read here rather than passed as a prop, for the reason the position is:
     * a script can change it on any frame, and a prop would be a re-render of
     * the tree every time something waved. It rides in the sample because that
     * is already the once-a-frame channel between the world and a body.
     */
    const clip = live.clip.get(id)
    return {
      x: at.x,
      y: at.y,
      z: at.z,
      facing: live.rotation.get(id) ?? 0,
      /**
       * Whether this sample is news or a held frame.
       *
       * `settled` tells `SkinnedBody` *not* to measure: it holds the last speed
       * and calls the body grounded, because a frozen position is an absence of
       * news rather than evidence of standing still.
       *
       * That is right for a level, where a body only moves when the step moves
       * it. It is wrong for a **shot**, where the timeline moves bodies every
       * frame and the movement is the whole point - and the cost was total: no
       * speed was ever measured, so `motionFor` answered `idle` forever. A
       * `move` action slid a figure across the floor with its feet still, and a
       * `jump` lifted it without ever leaving the ground as far as the stance
       * machine was concerned.
       *
       * Off by default, so nothing in the runtime changes. The movie stage asks
       * for measurement because there it is the truth.
       */
      settled: !measured,
      ...(clip ? { clip } : {}),
      /**
       * Where in its clip this body should be, if a timeline is saying.
       *
       * The point of a shot: scrub to two seconds and see *that* moment, not
       * the clip running past at its own speed underneath a frozen playhead.
       * See `hold` in `SkinnedBody`.
       */
      ...(since?.current?.has(id) ? { hold: since.current.get(id)! } : {}),
      // Absence is `own`, and it is sent rather than left out: a body that
      // stopped glowing has to be told, and "no field" would read as "no news".
      wears: live.material.get(id) ?? ('own' as const),
    }
  }

  const body = (
    <SkinnedBody
      {...(skeletonOf(model) ? { rig: skeletonOf(model)! } : {})}
      {...(carried ? { carried } : {})}
      url={modelUrl(model)}
      scale={drawn}
      lift={lift}
      sample={sample}
      {...(pose ? { rest: pose } : {})}
    />
  )

  if (!onPick) return body

  /*
   * The handler on a group around it rather than on the mesh.
   *
   * `SkinnedBody` owns its own group and moves it every frame; wrapping is what
   * lets a click be added without this reaching inside something that is busy
   * being a body. `stopPropagation` for the reason every other picker in this
   * editor has it: the floor is behind everything, and a click that reached both
   * would select the ground somebody was trying to click a character on.
   */
  return (
    <group
      onPointerDown={(event) => {
        event.stopPropagation()
        onPick(id)
      }}
    >
      {body}
    </group>
  )
}

function LiveModel({
  model,
  wears,
  room,
  world,
  blueprints,
  hide,
  shaking,
  smoothing,
  onOverflow,
}: {
  model: string
  /**
   * The look every entity in this group is wearing.
   *
   * Half of the group's identity rather than a flag on it: an `InstancedMesh`
   * has one material for every slot, so "the crates" and "the glowing crates"
   * are two buffers and this is which one this is. Entities wearing anything
   * else are skipped in the loop below - they are in the other group.
   */
  wears: XpMaterial
  room: number
  world: React.RefObject<EntityWorld | null>
  blueprints: Readonly<Record<string, Blueprint>>
  hide?: ReadonlySet<number>
  shaking?: React.RefObject<Map<number, number>>
  smoothing?: React.RefObject<Smoothing>
  onOverflow: () => void
}) {
  const url = modelUrl(model)
  const pack = splitModel(model)?.pack
  const parts = useParts(url)
  /**
   * The level's one rainbow, taken whether this group wears it or not.
   *
   * Hooks cannot be conditional, and the cost of holding one is a reference:
   * `useRainbowMaterial` memoises a single material for the whole tree, so a
   * group of plain crates asking for it compiles nothing and allocates nothing.
   */
  const rainbow = useRainbowMaterial()
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])

  /**
   * How far round each of this group's rolling bodies has turned.
   *
   * Per group rather than per level, which is the one thing to know about it: an
   * entity that changes `material` moves to a different buffer and starts its
   * rolling again from square. On a ball that is invisible, it happens when
   * somebody switches a level to rainbow, and the alternative is threading a ref
   * down from the runtime for a value the runtime has no use for - this is
   * derived from the drawn position and nothing else, so it belongs here and
   * nowhere else.
   */
  const rolling = useRef(new Rolling())

  /**
   * Where each blueprint draws this model, in its own local space.
   *
   * Worked out once per blueprint set rather than per frame: `partTransforms`
   * walks a tree and allocates a row per part, and doing that sixty times a
   * second for every entity is exactly the cost this whole file is arranged to
   * avoid. What changes every frame is where the *entity* is, and that is a
   * lookup.
   *
   * The identity transform stands for the root, so a blueprint that is one
   * model gets a one-entry list and the loop below has no special case.
   */
  const occurrences = useMemo(() => {
    const table = new Map<
      string,
      { x: number; y: number; z: number; rotation: number; scale: number; isRoot: boolean }[]
    >()
    for (const [name, blueprint] of Object.entries(blueprints)) {
      const rows: { x: number; y: number; z: number; rotation: number; scale: number; isRoot: boolean }[] = []
      if (blueprint.model === model) {
        rows.push({ x: 0, y: 0, z: 0, rotation: 0, scale: 1, isRoot: true })
      }
      for (const placed of partTransforms(blueprint)) {
        if (placed.part.model !== model) continue
        rows.push({
          x: placed.x,
          y: placed.y,
          z: placed.z,
          rotation: placed.rotation,
          scale: placed.scale,
          isRoot: false,
        })
      }
      if (rows.length > 0) table.set(name, rows)
    }
    return table
  }, [blueprints, model])

  /**
   * Which blueprints spin one of this model's own nodes, and which part that is.
   *
   * Resolved once per part set rather than per frame, same reason `occurrences`
   * is: `blueprint.spin.node` is a name, and turning it into a buffer index by
   * scanning `parts` sixty times a second for every entity is the cost this
   * whole file exists to avoid. Only ever matches a *root* occurrence - `spin`
   * names a node in the blueprint's own `model`, not in a `Part`, so a row that
   * came from `partTransforms` never carries one.
   */
  const spins = useMemo(() => {
    const table = new Map<string, { partIndex: number; axis: 'x' | 'y' | 'z'; prop: string }>()
    for (const [name, blueprint] of Object.entries(blueprints)) {
      if (blueprint.model !== model || !blueprint.spin) continue
      const partIndex = parts.findIndex((part) => part.name === blueprint.spin!.node)
      // A name that matches nothing turns nothing - the same silent-failure
      // shape `pose` already has, for the same reason: the editor's picker is
      // what only ever offers a name that exists.
      if (partIndex === -1) continue
      table.set(name, { partIndex, axis: blueprint.spin.axis, prop: blueprint.spin.prop })
    }
    return table
  }, [blueprints, model, parts])

  /**
   * Which buffer row each of this model's own nodes is, by name.
   *
   * The general form of what `spins` resolves for its one node, and it exists
   * for the same reason: `motion.steps[].node` is a *string*, and turning a
   * string into a buffer index by scanning `parts` sixty times a second for
   * every entity is the cost this whole file is written to avoid.
   *
   * Every node rather than only the ones some blueprint currently names,
   * because unlike `spins` this is not keyed by blueprint - a motion can be
   * added, edited or renamed in the editor between frames, and a table that had
   * to be rebuilt for that would be rebuilt on every keystroke.
   */
  const nodeIndex = useMemo(() => {
    const table = new Map<string, number>()
    parts.forEach((part, index) => {
      // Only the *root* occurrences. A motion turns a node inside the
      // blueprint's own `model`, never one inside a `Part`, which is a whole
      // separate model with its own place in the document - the same boundary
      // `spins` draws and for the same reason.
      if (part.name && !table.has(part.name)) table.set(part.name, index)
    })
    return table
  }, [parts])

  const scratch = useMemo(
    () => ({
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      axis: new THREE.Vector3(0, 1, 0),
      /** For the tilted path only. Allocated once, like everything else here. */
      euler: new THREE.Euler(),
      offset: new THREE.Vector3(),
      spin: new THREE.Quaternion(),
      /** How a rolling body is turned. Untouched on everything else. */
      roll: new THREE.Quaternion(),
      size: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
      composed: new THREE.Matrix4(),
      /**
       * Which parts a running motion is turning this frame, and by how much.
       *
       * Reused and cleared per entity rather than allocated, like everything
       * else here. A `Map` rather than an array indexed by part because a motion
       * names two or three nodes out of a model that may have forty, and the
       * clear is then two deletes instead of forty writes.
       */
      turns: new Map<number, { axis: 'x' | 'y' | 'z'; angle: number }>(),
      /** The live rotation `spins` injects for one part - unused on every other. */
      nodeAxis: new THREE.Vector3(),
      nodeSpin: new THREE.Quaternion(),
      nodeSpinMatrix: new THREE.Matrix4(),
      /**
       * Where an unused slot goes.
       *
       * A zero scale rather than a position off in the distance: a degenerate
       * matrix draws nothing at all, where a far-away one is still a triangle
       * the GPU transforms and still stretches the bounding sphere so the whole
       * group survives a frustum test it should have failed.
       */
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
    }),
    [],
  )

  useFrame(() => {
    const live = world.current
    if (!live || parts.length === 0) return

    const scale = pack?.scale ?? 1
    const lift = pack?.lift ?? 0
    const stand = floorOffset(model)

    let slot = 0
    for (const id of live.alive) {
      if (hide?.has(id)) continue
      const name = live.blueprint.get(id)
      const blueprint = name ? blueprints[name] : undefined
      if (!blueprint) continue
      // Somebody else's group. `instancedCounts` sized this one for the
      // entities wearing `wears`, so counting a differently-dressed one here
      // would overflow a buffer that was never asked to hold it.
      if ((live.material.get(id) ?? 'own') !== wears) continue
      // Where this blueprint draws *this* model - its root, a part, or both.
      const here = occurrences.get(name!) ?? []
      if (here.length === 0) continue
      if (slot + here.length > room) {
        // More of this model than the buffer holds. Ask React for a bigger one
        // and draw what fits until the next render - a frame missing the
        // hundredth crate beats a frame missing all of them.
        onOverflow()
        break
      }

      const placed: WorldTransform = live.parent.has(id)
        ? worldTransform(live, id, blueprints)
        : {
            x: live.position.get(id)?.x ?? 0,
            y: live.position.get(id)?.y ?? 0,
            z: live.position.get(id)?.z ?? 0,
            rotation: live.rotation.get(id) ?? 0,
            pitch: live.pitch.get(id) ?? 0,
            roll: live.roll.get(id) ?? 0,
            scale: live.scale.get(id) ?? 1,
            ...(live.stretch.get(id) ? { stretch: live.stretch.get(id) } : {}),
          }

      /**
       * The flinch, added to where it stands rather than to where it is.
       *
       * Onto the *drawn* transform and nowhere else, which is the whole reason
       * this lives in the renderer and not in a verb: the entity has not moved.
       * Its position, its box and its collider are all exactly where they were,
       * so a thing you can see wobbling is still a thing you can hit where you
       * can see it. A shake written into `world.position` would be a target
       * that dodges by a hand's width every time you connect with it, and would
       * cross the wire besides.
       *
       * Both branches below read `placed`, so this is one place rather than
       * two - and it is deliberately not in the per-occurrence loop: a
       * blueprint drawn as three models is one thing recoiling, not three
       * things recoiling independently.
       */
      const left = shaking?.current.get(id)
      if (left !== undefined && left > 0) {
        const wobble = shakeOf(left, id)
        placed.x += wobble.x
        placed.z += wobble.z
        placed.rotation += wobble.turn
      }

      /**
       * And however far behind itself it is still being drawn.
       *
       * The same trick as the flinch above and for a much more pointed reason:
       * the ball you have just claimed is authoritative from this frame, and this
       * is what stops it *jumping* the interpolation delay's worth of travel to
       * get there. It catches up over about a sixth of a second while nothing in
       * the level - not a goal line, not a trigger, not the next claim - reads
       * anything but the real position. See `@kxb/xp/drawing`.
       *
       * Before the roll below, so a ball rolls the distance it appears to cover
       * rather than the distance it teleported.
       */
      const behind = smoothing?.current.offsetOf(id)
      if (behind) {
        placed.x += behind.x
        placed.y += behind.y
        placed.z += behind.z
      }

      /**
       * Rolling, worked out once for the entity rather than once per occurrence.
       *
       * `Rolling.rolled` integrates, so asking it twice on one frame rolls the
       * ball twice - and a blueprint drawn as three models is one thing rolling.
       * It is fed the *drawn* position because that is the only signal every
       * client has: a follower's velocity row is deleted by `Balls.place` on
       * purpose, so anything derived from `world.velocity` would roll on the
       * owner's screen and skate on everybody else's, which is what the old
       * `spec.roll` did.
       *
       * A blueprint drawn as several models rolls them all about the entity's
       * own centre, which is right for a ball with a decal on it and would be
       * wrong for a cart with wheels. Nothing in the packs is the second thing.
       */
      const turns = blueprint.body?.roll ?? 0
      const rolled = turns === 0 ? null : rolling.current.rolled(id, placed.x, placed.z, turns)

      /**
       * Level and unstretched, which nearly everything in a level is.
       *
       * Read once per entity rather than per occurrence, and used to keep the
       * old arithmetic *exactly* below: a document that never tilts anything
       * must draw through the same handful of multiplies it always did, at the
       * same cost, landing on the same floats.
       */
      const level = isFlat(placed) && !placed.stretch
      const stretch = level ? null : stretchOf(placed.stretch)

      for (const local of here) {
        /**
         * The part's own offset, carried into the world by the entity's turn.
         *
         * The same derivation `drawList` uses - and it has to be, or a turret
         * is drawn in one place in the editor and somewhere else in the game.
         * Done here by hand rather than by calling `drawList` because this runs
         * every frame and that allocates a row per entity per model.
         */
        if (level) {
          const radians = (placed.rotation * Math.PI) / 180
          const cos = Math.cos(radians)
          const sin = Math.sin(radians)
          const lx = local.x * cos + local.z * sin
          const lz = -local.x * sin + local.z * cos

          scratch.position.set(
            placed.x + lx * placed.scale,
            placed.y + (local.y + lift + stand) * placed.scale,
            placed.z + lz * placed.scale,
          )
          scratch.quaternion.setFromAxisAngle(
            scratch.axis,
            ((placed.rotation + local.rotation) * Math.PI) / 180,
          )
          scratch.size.setScalar(scale * placed.scale * local.scale)
        } else {
          /**
           * The tilted, stretched version of the four lines above.
           *
           * `YXZ`, the order the format documents and `instances.tsx` builds.
           * The part's offset goes through the entity's stretch and then its
           * whole rotation, and the part's own yaw is multiplied on rather than
           * added - a `Part` has only a yaw, but composing it with an arbitrary
           * parent rotation by adding axes is wrong the moment two of them are
           * non-zero. `drawList` does this same thing with matrices.
           */
          const factor = scale * placed.scale * local.scale
          scratch.euler.set(
            (placed.pitch * Math.PI) / 180,
            (placed.rotation * Math.PI) / 180,
            (placed.roll * Math.PI) / 180,
            'YXZ',
          )
          scratch.quaternion.setFromEuler(scratch.euler)
          scratch.offset
            .set(local.x * stretch!.x, local.y * stretch!.y, local.z * stretch!.z)
            .applyQuaternion(scratch.quaternion)
          scratch.position.set(
            placed.x + scratch.offset.x * placed.scale,
            // The lift stays in world Y, outside the rotation, because that is
            // where `placementCells` and `entityBox` add it.
            placed.y + scratch.offset.y * placed.scale + (lift + stand) * placed.scale * stretch!.y,
            placed.z + scratch.offset.z * placed.scale,
          )
          scratch.spin.setFromAxisAngle(scratch.axis, (local.rotation * Math.PI) / 180)
          scratch.quaternion.multiply(scratch.spin)
          scratch.size.set(factor * stretch!.x, factor * stretch!.y, factor * stretch!.z)
        }
        /**
         * The roll, outside everything else rather than folded into it.
         *
         * `premultiply` so it is applied in *world* space: the axis is
         * perpendicular to the way the thing is travelling across the level, and
         * composing it inside the entity's own yaw would turn it about an axis
         * that moves with the model. A ball would roll sideways as soon as
         * anything else turned it.
         */
        if (rolled) {
          scratch.roll.set(rolled.x, rolled.y, rolled.z, rolled.w)
          scratch.quaternion.premultiply(scratch.roll)
        }
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.size)

        /**
         * Which of this model's nodes are turned, and by how much.
         *
         * Two sources, one table, and the merge order is the design: a `spin` is
         * put in first and a running **motion** may overwrite it. Both name a
         * node of the same model, so a blueprint carrying both could point them
         * at the same one - and a motion is a deliberate instruction with a
         * beginning, where a `spin` is a standing arrangement with a property
         * behind it. The instruction wins for as long as it is running, and the
         * standing arrangement is what the node goes back to.
         *
         * Only a root row, for `spins`'s own reason: a motion turns a node
         * inside the blueprint's `model`, and a row that came from
         * `partTransforms` is a separate model with its own place in the
         * document.
         */
        scratch.turns.clear()
        if (local.isRoot && name) {
          const spin = spins.get(name)
          if (spin) {
            scratch.turns.set(spin.partIndex, {
              axis: spin.axis,
              angle: live.props.get(id)?.[spin.prop] ?? 0,
            })
          }

          const running = live.motion.get(id)
          const motion = running ? blueprints[name]?.motions?.[running.name] : undefined
          if (running && motion) {
            /**
             * Where every node is, worked out rather than looked up.
             *
             * `poseAt` allocates one small object, once per animated entity per
             * frame, in a file that otherwise allocates nothing at all - and it
             * is worth it here rather than hoisting a scratch bag into the
             * format package, because the number of entities *with a motion
             * running* is a handful in a level of hundreds. If that ever stops
             * being true this is the line to come back to.
             */
            const pose = poseAt(motion, live.seconds - running.since)
            for (const node of Object.keys(pose)) {
              const at = nodeIndex.get(node)
              // A node the model does not have turns nothing, silently - the
              // same contract `spin` has, and the editor's picker is what only
              // ever offers a name that exists.
              if (at !== undefined) scratch.turns.set(at, pose[node]!)
            }
          }
        }

        for (let part = 0; part < parts.length; part += 1) {
          const mesh = meshes.current[part]
          if (!mesh) continue
          const turn = scratch.turns.get(part)
          if (turn) {
            // `pivot` is everything above the node; `ownLocal` is the node's own
            // rest transform. The live angle goes between them, in the node's
            // own frame, so it turns about its own pivot rather than the
            // model's - a fan blade spins on its hub, not on the model's origin.
            scratch.nodeAxis.set(
              turn.axis === 'x' ? 1 : 0,
              turn.axis === 'y' ? 1 : 0,
              turn.axis === 'z' ? 1 : 0,
            )
            scratch.nodeSpin.setFromAxisAngle(scratch.nodeAxis, (turn.angle * Math.PI) / 180)
            scratch.nodeSpinMatrix.makeRotationFromQuaternion(scratch.nodeSpin)
            scratch.composed.multiplyMatrices(scratch.matrix, parts[part].pivot)
            scratch.composed.multiply(scratch.nodeSpinMatrix)
            scratch.composed.multiply(parts[part].ownLocal)
          } else {
            scratch.composed.multiplyMatrices(scratch.matrix, parts[part].local)
          }
          mesh.setMatrixAt(slot, scratch.composed)
        }
        slot += 1
      }
    }

    for (let part = 0; part < parts.length; part += 1) {
      const mesh = meshes.current[part]
      if (!mesh) continue
      for (let spare = slot; spare < room; spare += 1) mesh.setMatrixAt(spare, scratch.hidden)
      mesh.instanceMatrix.needsUpdate = true
    }

    // Or a despawned ball's rolling is inherited by whatever reuses its id -
    // which would arrive as a new ball spinning like a drill on its first frame,
    // from the distance between where the old one died and where this one
    // spawned. Unguarded: a group of scenery has nothing in here to walk.
    rolling.current.sweep(live.alive)
  })

  if (parts.length === 0) return null

  return (
    <>
      {parts.map((part, index) => (
        <instancedMesh
          key={`${index}-${room}`}
          ref={(node) => {
            meshes.current[index] = node
          }}
          args={[part.geometry, wears === 'own' ? part.material : rainbow, room]}
          castShadow
          receiveShadow
          // The bounds are recomputed from a buffer that changes every frame,
          // which is expensive and wrong by one frame anyway. A whole level's
          // worth of entities is not what a frustum test is for.
          frustumCulled={false}
        />
      ))}
    </>
  )
}

