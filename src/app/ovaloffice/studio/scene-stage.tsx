'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type * as THREE from 'three'
import {
  Ball,
  Block,
  blockY,
  Emote,
  Goal,
  Glow,
  GrassPatch,
  Peep,
  Rig,
  rounded,
  Say,
} from '@/app/world/shots/pieces'
import { BlueprintProp } from '@/app/world/shots/blueprint-prop'
import { Rainbow } from '@/app/world/_canvas/rainbow'
import { WorldSet } from '@/app/world/shots/world-set'
import { Posing, rigFrom, type RigHandle } from '@/app/ovaloffice/animator/posing'
import type { Pose } from '@/domain/animator/clip'
import { RIGS, type RigId } from '@/domain/animator/rig'
import type { BlueprintSpec } from '@/domain/thingiverse/blueprint'
import { isRiggedLook, type StudioScene } from '@/domain/studio/scene'

/**
 * Taking hold of one body in the scene.
 *
 * The video editor hands this down when a cast member is selected: which one,
 * which bone within it, and where a drag should be sent. `pick` is separate
 * from the rest because selecting by clicking works whether or not anybody is
 * posing - it is how you *get* to posing.
 */
export interface ScenePosing {
  /** Clicking a body in the scene. The index is into `scene.peeps`. */
  onPick?: (index: number) => void
  /** Clicking a prop. The index is into `scene.blocks`. */
  onPickBlock?: (index: number) => void
  /** Which body has handles on it, or null for none. */
  index: number | null
  /** Which bone is lit, and what the panel is showing. */
  bone: string | null
  onBone: (bone: string) => void
  /** A drag, finished. `keyable` is true for a deliberate one. */
  onPose: (pose: Pose, keyable: boolean) => void
  /** The rig, so the panel's sliders can drive the same live bones. */
  onRig?: (rig: RigHandle | null) => void
  /** False while the camera has the left button. */
  grabbable?: boolean
  slideMode?: boolean
}

/**
 * One thing on a space's shelf, as the studio needs it.
 *
 * Here rather than in the editor because both the editor and its panel want
 * it, and the editor imports the panel - a type living there would be a cycle
 * for no reason. The stage is the thing that ultimately draws one, so it is a
 * fair owner.
 */
export interface BlueprintChoice {
  id: string
  name: string
  spec: BlueprintSpec
}

/** Degrees in, radians out. The document is in degrees; three.js is not. */
const rad = (degrees: number) => (degrees * Math.PI) / 180

/**
 * A scene document, as geometry.
 *
 * The one place that turns the studio's document into the shared pieces, so
 * "what a scene means" is written once. Everything it draws comes from
 * `@/app/world/shots/pieces`, which is also what the baked marketing shots are
 * made of - the editor is a preview of the real renderer or it is not worth
 * having.
 */
export function SceneStage({
  scene,
  onReady,
  posing,
  blueprints,
}: {
  scene: StudioScene
  /** Fired once every model and texture in the scene has arrived. */
  onReady: () => void
  /**
   * The specs a prop's `blueprint` reference resolves against, by id.
   *
   * Handed in rather than fetched here: the space's page already loads every
   * blueprint somebody may pick from, and a canvas that fetched its own would
   * be a second copy of that list arriving late. A reference this map cannot
   * answer falls back to the plain model - see `BlockSpec.blueprint`.
   */
  blueprints?: Readonly<Record<string, BlueprintSpec>>
  /**
   * Posing a body where it stands, or undefined for a stage that only draws.
   *
   * The video editor's, and nobody else's. Everything about it is optional
   * because this component's other callers - the still studio, the capture -
   * want a scene they can look at rather than one they can take hold of.
   */
  posing?: ScenePosing
}) {
  /**
   * Memoised because `GrassPatch` keys its cell list off this function.
   *
   * A fresh closure on every render would rebuild a couple of hundred block
   * positions every time a slider moves - and the camera reports its position
   * on every orbit, so "every time a slider moves" is most frames.
   */
  const keep = useMemo(
    () =>
      scene.ground && scene.ground.rounded
        ? rounded(scene.ground.cols, scene.ground.rows)
        : undefined,
    [scene.ground],
  )

  /**
   * The body being posed, indexed, and whether a hand is on it.
   *
   * The rig is built from the object `<Peep>` draws rather than from a model
   * this component loads: handles have to land on the body standing in the
   * shot, not on a second copy of it. Which look the selected actor wears
   * decides which bone list to draw, because a fox has five bones and a knight
   * has twenty-three.
   */
  const [held, setHeld] = useState<{ index: number; rig: RigHandle } | null>(null)
  const [dragging, setDragging] = useState(false)

  const posed = posing?.index ?? null
  const posedLook = posed === null ? undefined : scene.peeps[posed]?.avatar
  const rigId: RigId = posedLook && isRiggedLook(posedLook) ? 'dummy' : 'peep'
  const body = RIGS[rigId]

  const onBody = useCallback(
    (root: THREE.Object3D) => {
      if (posed === null) return
      setHeld({ index: posed, rig: rigFrom(root, body.specs) })
    },
    [posed, body.specs],
  )

  /**
   * The rig, but only while it still belongs to the selected body.
   *
   * Kept beside the index it was built from rather than cleared by an effect
   * watching the selection: a stale rig and a stale index are the same fact,
   * and comparing them here means there is no moment where one has been
   * updated and the other has not.
   */
  const rig = held && held.index === posed ? held.rig : null

  // Handed up so the panel's sliders write to the same live bones the handles
  // do. Withdrawn when the body goes, which is what stops a panel driving a
  // rig that is no longer on screen.
  const report = posing?.onRig
  useEffect(() => {
    report?.(rig)
    return () => report?.(null)
  }, [rig, report])

  /**
   * How far the set reaches, once it has arrived.
   *
   * State rather than a value read off the document, because a set is a
   * reference: the stage does not have its blocks and cannot measure them. The
   * component that fetches them reports back, which happens once per world.
   *
   * Which world it measured is kept beside the number, so the answer is thrown
   * away by the change that invalidates it rather than by an effect watching
   * for one. Otherwise a scene that swaps its set - or drops it - keeps a
   * shadow camera sized to a world that is no longer standing there.
   */
  const [reported, setReported] = useState<{ worldId: string; reach: number } | null>(null)
  const onReach = useCallback(
    (worldId: string, reach: number) => setReported({ worldId, reach }),
    [],
  )
  const setReach =
    scene.set && reported?.worldId === scene.set.worldId ? reported.reach : 0

  /**
   * The shadow camera's box, sized to whatever is actually on the ground.
   *
   * A fixed box is wrong in both directions: too small and the far half of a
   * big pitch has no shadows at all, too large and the same 2048px map is
   * spread over empty space until the contact shadows go soft and the peeps
   * stop touching the floor. A set counts towards it for that first reason -
   * a world is the biggest thing that will ever be standing here.
   */
  const radius = useMemo(() => {
    const reach = [
      scene.ground ? Math.max(scene.ground.cols, scene.ground.rows) / 2 : 0,
      setReach,
      ...scene.peeps.map((peep) => Math.max(Math.abs(peep.x), Math.abs(peep.z))),
      ...scene.blocks.map((block) => Math.max(Math.abs(block.x), Math.abs(block.z))),
    ]
    return Math.max(...reach, 6) + 3
  }, [scene.ground, scene.peeps, scene.blocks, setReach])

  return (
    <>
      <Rig light={scene.light} radius={radius} />
      {/*
        The rainbow wraps everything the stage draws, and the pieces decide for
        themselves whether they wear it: blocks and the ground do, furniture
        does when the second switch is on, and the animals never do - see
        `useRainbowFor`. Peeps are inside the provider only because wrapping
        them costs nothing and excluding them by position would put the rule in
        two places.

        `phase` comes off the document rather than off a clock, which is what
        makes an export reproducible - a recording of a rainbow is the same file
        every time it is recorded.
      */}
      <Rainbow
        world={scene.rainbow?.world ?? false}
        props={scene.rainbow?.props ?? false}
        phase={scene.rainbow?.phase ?? 0}
      >
        <Suspense fallback={null}>
          {scene.ground && (
            <GrassPatch
              cols={scene.ground.cols}
              rows={scene.ground.rows}
              top={scene.ground.top}
              keep={keep}
            />
          )}

          {/* Inside the same Suspense boundary as everything else, so a scene
              standing in a world is not "ready" - and not exportable - until the
              world is actually on screen. */}
          {scene.set && <WorldSet worldId={scene.set.worldId} onReach={onReach} />}

          {scene.blocks.map((block, i) => {
            /*
              A thing off the shelf, where the reference resolves.

              The fallback is the plain block rather than nothing, which is the
              same degrading a link gets when it names a world that has been
              taken down: a picture of the wrong crate beats a hole in the
              scene, and the panel says which prop is which.
            */
            const spec = block.blueprint ? blueprints?.[block.blueprint] : undefined
            if (spec) {
              return (
                <BlueprintProp
                  key={`block${i}`}
                  spec={spec}
                  position={[block.x, blockY(block.top), block.z]}
                  rotation={rad(block.rotation)}
                  scale={block.scale}
                  time={block.time}
                  triggered={block.triggered ?? false}
                />
              )
            }
            return (
              <Block
                key={`block${i}`}
                model={block.model}
                position={[block.x, blockY(block.top), block.z]}
                rotation={rad(block.rotation)}
                time={block.time}
                size={block.scale}
                pitch={rad(block.pitch)}
                roll={rad(block.roll)}
                tint={block.tint}
                onPick={posing?.onPickBlock ? () => posing.onPickBlock?.(i) : undefined}
              />
            )
          })}

          {scene.goals.map((goal, i) => (
            <Goal
              key={`goal${i}`}
              position={[goal.x, 0, goal.z]}
              rotation={rad(goal.rotation)}
              width={goal.width}
              height={goal.height}
              colour={goal.colour}
            />
          ))}

          {scene.balls.map((ball, i) => (
            <Ball key={`ball${i}`} position={[ball.x, ball.y, ball.z]} radius={ball.radius} />
          ))}

          {scene.peeps.map((peep, i) =>
            /*
              A hidden peep draws nothing and keeps its place.

              `null` in the map rather than a `filter`, because the index is
              the cast member's identity everywhere else - it is what the panel
              selects by, what a pose is written to, and what the driver takes
              hold of. Filtering would renumber everybody after whoever
              vanished, mid-shot.
            */
            peep.hidden ? null : (
            <group key={`peep${i}`}>
              <Peep
                model={peep.avatar}
                clip={peep.clip}
                time={peep.time}
                position={[peep.x, peep.y, peep.z]}
                rotation={rad(peep.rotation)}
                tilt={rad(peep.tilt)}
                scale={peep.scale}
                pose={peep.pose ?? null}
                onPick={posing?.onPick ? () => posing.onPick?.(i) : undefined}
                onBody={posing && posing.index === i ? onBody : undefined}
                posing={dragging && posed === i}
                // The rim is the same colour as the lamp, because they are one
                // light: the body is edged in the hue it is throwing.
                rim={peep.glow ? peep.glow.colour : null}
              />
              {peep.glow && (
                <Glow
                  colour={peep.glow.colour}
                  sparkle={peep.glow.sparkle}
                  strength={peep.glow.strength}
                  position={[peep.x, peep.y, peep.z]}
                />
              )}
              {peep.say !== null && (
                <Say
                  text={peep.say}
                  position={[peep.x, peep.y + peep.emoteHeight, peep.z]}
                  size={peep.emoteSize * 0.5}
                />
              )}
              {peep.emote !== null && (
                /* The bubble rides with them. `emoteHeight` is above the head
                   rather than above the floor, so a peep who jumps and a peep who
                   stands both get it in the same place relative to themselves.
                   It steps up out of the way when they are also talking, because
                   the two share that spot and a face behind a sentence reads as a
                   rendering bug. */
                <Emote
                  id={peep.emote}
                  position={[
                    peep.x,
                    peep.y + peep.emoteHeight + (peep.say === null ? 0 : peep.emoteSize * 1.5),
                    peep.z,
                  ]}
                  size={peep.emoteSize}
                />
              )}
            </group>
          ))}

          {/* The handles, on whichever body is selected. Inside the Suspense
              boundary with everything else, because there is nothing to take
              hold of until the body has arrived. */}
          {posing && rig && (
            <Posing
              rig={rig}
              bones={body.bones}
              specs={body.specs}
              selected={posing.bone}
              grabbable={posing.grabbable ?? true}
              slideMode={posing.slideMode ?? false}
              onSelect={posing.onBone}
              onPose={posing.onPose}
              onDragging={setDragging}
            />
          )}

          <Ready onReady={onReady} />
        </Suspense>
      </Rainbow>
    </>
  )
}

/**
 * Fires once the Suspense boundary above it resolves.
 *
 * Everything the scene needs loads through Suspense - the glTFs through
 * `useGLTF`, the emote sheet through `useLoader` - so "this component mounted"
 * is the same statement as "the scene is complete". Which is exactly what the
 * export button needs to know: a PNG taken while a model is still arriving is
 * a PNG with a hole in it, and nothing about the file says so afterwards.
 */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady])
  return null
}
