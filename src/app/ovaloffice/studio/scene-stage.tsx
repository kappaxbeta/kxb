'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
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
import { Rainbow } from '@/app/world/_canvas/rainbow'
import { WorldSet } from '@/app/world/shots/world-set'
import type { StudioScene } from '@/domain/studio/scene'

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
}: {
  scene: StudioScene
  /** Fired once every model and texture in the scene has arrived. */
  onReady: () => void
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

          {scene.blocks.map((block, i) => (
            <Block
              key={`block${i}`}
              model={block.model}
              position={[block.x, blockY(block.top), block.z]}
              rotation={rad(block.rotation)}
            />
          ))}

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

          {scene.peeps.map((peep, i) => (
            <group key={`peep${i}`}>
              <Peep
                model={peep.avatar}
                clip={peep.clip}
                time={peep.time}
                position={[peep.x, peep.y, peep.z]}
                rotation={rad(peep.rotation)}
                tilt={rad(peep.tilt)}
                scale={peep.scale}
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
