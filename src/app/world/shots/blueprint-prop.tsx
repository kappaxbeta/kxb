'use client'

import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '@/app/world/shots/pieces'
import { BOB_HEIGHT, BOB_RATE, SPIN_RATE } from '@/app/world/lounge/_sim/thing-actions'
import type { BlueprintSpec } from '@/domain/thingiverse/blueprint'
import { drawingOf, modelUrlFor } from '@/domain/thingiverse/models'
import { clipInShot, deedsInShot } from '@/domain/studio/thing-deeds'

/**
 * A thing out of the thingiverse, standing in a shot.
 *
 * The studio's props were palette blocks: one model, no moving parts, nothing
 * to say. A blueprint is the other thing a space already builds - a root model
 * with parts bolted to it, a scale, and a list of what it does and when - and
 * this draws one at a moment.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the lounge's thing renderer
 * ---------------------------------------------------------------------------
 * `@/app/world/lounge/_canvas/lounge-things` already draws these and is
 * deliberately not imported, for the reason the top of `./pieces` gives about
 * every other piece in this folder: that one is built for a live room. It
 * spins by adding `SPIN_RATE * delta` to a rotation each frame, bobs off a
 * clock that starts when the thing is summoned, and gates both on how far away
 * the player is standing. All three are exactly what a shot must not do - a
 * recording of a scene has to be the same file every time it is recorded.
 *
 * So the motion here is a function of `time` and nothing else, and it is the
 * same motion: the rates are imported from the room's own constants rather
 * than guessed, so a spinning crate turns at the speed people have watched it
 * turn at. `SPIN_RATE * delta` accumulated over t seconds *is* `SPIN_RATE * t`,
 * which is why the two agree exactly rather than approximately.
 *
 * ---------------------------------------------------------------------------
 * What "when" means where nobody is standing
 * ---------------------------------------------------------------------------
 * A blueprint says *when* it does things: `always`, or on `touch`, `near` and
 * `use`. A shot has no player, so three of those four can never happen and a
 * renderer that honoured them strictly would draw every prop standing still -
 * which is the whole feature not working.
 *
 * `always` runs, always. The other three run when the author says the prop is
 * being triggered, which is what `triggered` is: not a claim that somebody
 * touched it, but the author saying "shoot it as though somebody had". It is
 * off by default, because the deed a crate does on touch is often `vanish` and
 * a prop that disappears the moment you place it is a prop nobody would place
 * twice.
 */
export function BlueprintProp({
  spec,
  position,
  rotation = 0,
  scale = 1,
  time,
  triggered = false,
}: {
  spec: BlueprintSpec
  position: Vec3
  /** Turn about Y, in radians. */
  rotation?: number
  /** The author's multiplier, on top of the blueprint's own. */
  scale?: number
  /** Seconds. The shot's clock, which is what every motion below is drawn from. */
  time: number
  /** Whether to also run the deeds that need somebody. See the note above. */
  triggered?: boolean
}) {
  /** Which deeds are running, and what is playing. Both rules live in one
   *  pure module so they can be read and tested without a GPU. */
  const deeds = useMemo(() => deedsInShot(spec, triggered), [spec, triggered])
  const clip = useMemo(() => clipInShot(spec, triggered), [spec, triggered])

  // Gone, and nothing else about it matters. A `vanish` deed takes the thing
  // away until the room is next loaded, and the shot's version of "until" is
  // the whole shot.
  if (deeds.has('vanish')) return null

  const spun = deeds.has('spin') ? time * SPIN_RATE : 0
  const bobbed = deeds.has('bob') ? Math.sin(time * BOB_RATE) * BOB_HEIGHT : 0

  return (
    <group
      position={[position[0], position[1] + bobbed, position[2]]}
      rotation={[0, rotation + spun, 0]}
      scale={spec.scale * scale}
    >
      <Piece model={spec.model} clip={clip} time={time} />
      {(spec.parts ?? []).map((part, index) => {
        // A quarter turn about up, done in whole numbers, the way `socketsOf`
        // does it - see the note there about keeping typed coordinates exact.
        const quarter = ((part.turn % 4) + 4) % 4
        return (
          <group
            key={index}
            position={[part.at.x, part.at.y, part.at.z]}
            rotation={[0, (quarter * Math.PI) / 2, 0]}
            scale={part.scale}
          >
            <Piece model={part.model} clip={null} time={time} />
          </group>
        )
      })}
    </group>
  )
}

/**
 * One model of a thing, at the pack's own scale and lift.
 *
 * `drawingOf` is the thingiverse's rule rather than the pack's - one authored
 * unit is one metre - so a die summoned into a room and a die standing in a
 * shot are the same size. A model neither registry knows draws at 1 and
 * unlifted, which is the failure that leaves a thing in the wrong place rather
 * than a scene that will not load.
 */
function Piece({
  model,
  clip,
  time,
}: {
  model: string
  clip: string | null
  time: number
}) {
  const url = modelUrlFor(model)
  const { scene, animations } = useGLTF(url)
  const drawing = drawingOf(model)

  // Cloned per piece and kept across poses, exactly as `<Peep>` does it and for
  // the reason given there: the clone is the expensive half and the pose is
  // not, so a shot sampled thirty times a second must not rebuild it.
  const { object, mixer } = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })
    return { object: copy, mixer: new THREE.AnimationMixer(copy) }
  }, [scene])

  useEffect(() => {
    const track = clip ? animations.find((candidate) => candidate.name === clip) : undefined
    mixer.stopAllAction()
    if (track) mixer.clipAction(track).play()
  }, [animations, clip, mixer])

  // `setTime` from an absolute moment rather than `update(delta)`, so what is
  // drawn is a function of the argument. See the note at the top of `./pieces`.
  useEffect(() => {
    mixer.setTime(Math.max(0, time))
  }, [mixer, time, clip])

  useEffect(
    () => () => {
      mixer.stopAllAction()
    },
    [mixer],
  )

  return (
    <group position={[0, drawing?.lift ?? 0, 0]} scale={drawing?.scale ?? 1}>
      <primitive object={object} />
    </group>
  )
}
