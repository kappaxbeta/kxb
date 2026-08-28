'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { BALL_RADIUS, goalCentre } from '@/app/world/lounge/_sim/football'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import type { Goal, GoalKind } from '@/domain/lounge/goal-events'

/**
 * The ball and the goals, drawn.
 *
 * Its own file rather than more of lounge-scene.tsx, and the split is along the same
 * line every other part of this feature follows: nothing here decides anything. The
 * ball's position was decided by whichever client owns it, whether a goal was scored
 * was decided there too, and where the goals stand came out of the event log. This
 * only puts geometry where it is told.
 *
 * Both components read their position from a ref inside `useFrame` rather than
 * taking it as a prop. A ball moves sixty times a second, and re-rendering the scene
 * for each new position is the mistake `<Multiplayer>` already avoids for bodies -
 * see the note at the top of multiplayer.tsx.
 */

/**
 * What each mark is painted in.
 *
 * Red and blue as the goals and the nameplates already use them; green for a
 * start, because there is exactly one thing in a world that means "go"; and
 * white for a finish, which is the chequered flag as far as a frame of coloured
 * posts can be one. All four read against grass, snow and a night sky, which is
 * the test the first two were picked to pass.
 */
const KIND_COLOURS: Record<GoalKind, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  start: '#22c55e',
  finish: '#f8fafc',
}

/**
 * The ball.
 *
 * White with a dark seam pattern would be nicer and is not worth a texture fetch;
 * a bright sphere with a rim of shadow reads as a football at the distance it is
 * actually seen from, and it stays legible against grass, snow and a night sky.
 */
export function FootballBall() {
  /** Where to draw it, filled in by <Multiplayer>. See ./scene-refs. */
  const { ballRef } = useSceneRefs()

  const group = useRef<THREE.Group>(null)

  useFrame(() => {
    const node = group.current
    const ball = ballRef.current
    if (!node) return

    // Hidden rather than unmounted while there is no ball - before kickoff, or
    // before the first packet from whoever is stepping it. Unmounting would throw
    // away the mesh and rebuild it a frame later.
    node.visible = ball !== null
    if (!ball) return

    node.position.set(ball.x, ball.y, ball.z)

    /**
     * Rolled, not slid.
     *
     * Spun about the axis perpendicular to travel, by the distance covered over the
     * radius - which is what rolling without slipping means. Derived from velocity
     * rather than from the change in position, because the position is adopted whole
     * from the wire on every client but the owner's, and differentiating that would
     * make the spin jump with every packet.
     */
    const speed = Math.hypot(ball.vx, ball.vz)
    if (speed > 0.01) {
      ROLL_AXIS.set(ball.vz, 0, -ball.vx).normalize()
      node.rotateOnWorldAxis(ROLL_AXIS, (speed * ROLL_STEP) / BALL_RADIUS)
    }
  })

  return (
    <group ref={group}>
      {/* Not a target for the crosshair. Being unable to place a block because the
          ball rolled between you and the wall would be worse than the alternative. */}
      <mesh castShadow userData={{ ignoreRay: true }}>
        <sphereGeometry args={[BALL_RADIUS, 20, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.55} metalness={0.05} />
      </mesh>

      {/* A dark band, so the roll is visible. Without it a plain sphere spinning
          looks exactly like a plain sphere standing still. */}
      <mesh userData={{ ignoreRay: true }}>
        <torusGeometry args={[BALL_RADIUS * 0.99, BALL_RADIUS * 0.16, 8, 24]} />
        <meshStandardMaterial color="#1e293b" roughness={0.7} />
      </mesh>
    </group>
  )
}

/** Scratch, so the frame loop allocates nothing. */
const ROLL_AXIS = new THREE.Vector3()

/**
 * Radians of spin per block travelled, near enough.
 *
 * A frame's rotation is speed x delta / radius; this folds in a nominal delta rather
 * than taking the real one, because the visible result is a ball that spins about
 * right and nobody is measuring it. Using the true delta would be more correct and
 * would make the spin stutter with the frame rate.
 */
const ROLL_STEP = 1 / 60

/**
 * The marks: the goals a ball crosses, and the lines a racer does.
 *
 * A plane you can see through, with a thick coloured frame around it. Deliberately
 * not a net: what a goal *is*, for scoring, is a surface the ball crossed, and
 * drawing a box with a back to it would suggest the ball can be trapped in there -
 * which it cannot, because nothing about the goal is solid. The ball passes through
 * and carries on, and the frame is there to tell you where the line was.
 *
 * A start and a finish are the same drawing in another colour, and that is not a
 * shortcut: they are the same object doing the same job. What you see is a plane
 * you run through, which is exactly what it is.
 *
 * `renderOrder` and a transparent fill rather than a solid one, so a keeper standing
 * in the goal is still visible through it.
 */
export function Goals({ goals }: { goals: readonly Goal[] }) {
  return (
    <>
      {goals.map((goal) => (
        <GoalPlane key={goal.id} goal={goal} />
      ))}
    </>
  )
}

/** How thick the frame around the mouth is drawn, in blocks. */
const POST = 0.18

function GoalPlane({ goal }: { goal: Goal }) {
  const centre = goalCentre(goal)
  const colour = KIND_COLOURS[goal.kind]

  /**
   * Turned to match the axis the plane spans.
   *
   * `facing` is quarter turns, and the geometry below is built across X - so an
   * even facing, which spans Z in the domain's terms, needs no rotation here and an
   * odd one needs a quarter turn. Kept as one expression rather than branching the
   * whole subtree, because the two cases differ by exactly this angle.
   */
  const rotation: [number, number, number] =
    goal.facing % 2 === 0 ? [0, 0, 0] : [0, Math.PI / 2, 0]

  const { width, height } = goal

  return (
    <group position={[centre.x, centre.y, centre.z]} rotation={rotation}>
      {/* The mouth. Faintly tinted, so it reads as a surface rather than a gap,
          and double-sided because a goal can be scored from either direction. */}
      <mesh userData={{ ignoreRay: true }} renderOrder={2}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={0.13}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* The frame: two posts and a bar. No bottom edge - the ground is the bottom
          edge, and a bar lying on the grass would be something to trip over. */}
      <mesh position={[-width / 2, 0, 0]} userData={{ ignoreRay: true }}>
        <boxGeometry args={[POST, height, POST]} />
        <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[width / 2, 0, 0]} userData={{ ignoreRay: true }}>
        <boxGeometry args={[POST, height, POST]} />
        <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, height / 2, 0]} userData={{ ignoreRay: true }}>
        <boxGeometry args={[width + POST, POST, POST]} />
        <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.35} />
      </mesh>
    </group>
  )
}
