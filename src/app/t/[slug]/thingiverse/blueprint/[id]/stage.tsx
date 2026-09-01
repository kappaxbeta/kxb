'use client'

import { useGLTF } from '@react-three/drei'
import { Component, type ReactNode, Suspense, useMemo } from 'react'
import * as THREE from 'three'
import {
  type BlueprintPart,
  type BlueprintSpec,
  seatAt,
  socketsOf,
} from '@/domain/thingiverse/blueprint'
import { modelUrlFor } from '@/domain/thingiverse/models'
import { PIECE_ORIGIN, pieceTransform } from '@/domain/thingiverse/placement'

/**
 * What the composer draws, inside the `<Canvas>`.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the lounge's thing renderer
 * ---------------------------------------------------------------------------
 * `_canvas/lounge-things` draws the same models and is deliberately not reused.
 * It draws a thing *in a world*: it falls under gravity, it answers `touch`, it
 * reports a footprint to the walking sim, it plays a clip, and it reads the
 * rainbow switch. Every one of those is a fact about a room, and this is a
 * bench on a turntable with nothing under it and nobody in it.
 *
 * Sharing it would mean threading a `preview` flag through six behaviours and
 * getting a renderer whose every frame asks whether it is real. The one thing
 * worth sharing is the arithmetic, and that is in the domain (`socketsOf`,
 * `seatAt`, `drawingOf`) where both can read it.
 *
 * The other half of the reason is ownership: the lounge's renderer is being
 * changed by somebody else this week. A preview that shares it inherits every
 * one of those changes at the exact moment somebody is trying to place a lamp.
 */

/**
 * A piece whose model will not load, drawn as the gap it is.
 *
 * ---------------------------------------------------------------------------
 * Why this is not optional
 * ---------------------------------------------------------------------------
 * `useGLTF` throws when a fetch 404s, and a throw inside a `<Canvas>` takes the
 * whole canvas with it - so one dead model does not degrade the bench, it
 * deletes it. Reported as "create blueprint from empty dont work": the
 * blueprint was written correctly and the editor came up as a stack trace.
 *
 * The domain already decided what should happen here and this is the renderer
 * finally keeping that promise. `drawingOf` returns null for an id neither
 * registry knows and says why in its own comment: *a model we no longer ship
 * should be a thing in the wrong place, not a scene that will not load.* A
 * blueprint outlives the catalogue - ids are in an append-only log - so a piece
 * that cannot be drawn is a normal state of the world, not an exception.
 *
 * A wireframe box at the piece's own size, because it has to be *findable*: the
 * whole recovery is selecting it and choosing a different model, and something
 * invisible cannot be clicked. Magenta because that is this palette's word for
 * "you can act on this", and acting on it is the entire point.
 */
class Missing extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <mesh>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          {/* Unlit and wireframe, so it reads as an absence rather than as a
              crate somebody placed. */}
          <meshBasicMaterial color="#f0abfc" wireframe />
        </mesh>
      )
    }
    return this.props.children
  }
}

function Piece(props: Parameters<typeof Model>[0]) {
  /*
    A boundary *and* a Suspense per piece, both keyed on the model.

    Keyed, because a boundary that has caught once stays caught: swapping the
    dead model for a good one is the recovery this whole thing exists for, and
    an unkeyed boundary would hold the wireframe over the new model forever.

    Per piece rather than one around the scene, so a stall with a dead crate on
    it still draws the stall. One boundary at the top would lose eleven good
    pieces to one bad id.
  */
  return (
    <Missing key={props.model}>
      <Suspense fallback={null}>
        <Model {...props} />
      </Suspense>
    </Missing>
  )
}

function Model({
  model,
  at,
  turn,
  scale,
  dim,
  hub,
  onPick,
}: {
  model: string
  at: { x: number; y: number; z: number }
  turn: number
  scale: number
  /** Everything that is not the piece being edited. See `Stage`. */
  dim: boolean
  /**
   * A wheel, hung on its axle rather than stood on the floor.
   *
   * The pack's `lift` answers "how far above its own origin is this model
   * drawn", which is what puts a barrel on the ground instead of half through
   * it. A wheel's origin is its *hub* - the point it turns about - so the same
   * lift raises it off the axle it is supposed to be on.
   *
   * Handled here rather than as a flag on `pieceTransform`, deliberately: the
   * shared function answers "where does a piece go", and every piece is stood
   * on the floor. A wheel is the one thing that is hung from a joint instead,
   * which is a fact about vehicles rather than about placement - so the y comes
   * back from the shared call and this puts it back.
   */
  hub?: boolean
  onPick?: () => void
}) {
  const { scene } = useGLTF(modelUrlFor(model))
  /*
    The shared one, not a local copy.

    There were two - this file's `place()` and the room's `pieceTransform` - and
    they were four lines apart and one day old, which is exactly long enough for
    a lift fix to land in one and not the other. `@/domain/thingiverse/placement`
    is where it lives now, beside `socketsOf` and `drawingOf`, for the same
    reason those are there: it is arithmetic two renderers must agree about, and
    it has no three.js in it.
  */
  const { position, rotation, scale: drawn } = pieceTransform(model, at, turn, scale)
  // See `hub`. The x and z are the shared answer; only the lift is undone.
  const placed: [number, number, number] = hub ? [position[0], at.y, position[2]] : position

  /**
   * A clone per piece, and it has to be one.
   *
   * `useGLTF` caches by URL and hands back the *same* object graph, so a stall
   * with three of the same crate on it would be one crate that jumps between
   * three positions. Cloning is what the builder and the lounge both do, for
   * this exact reason.
   *
   * Materials are cloned along with it only when this piece is dimmed: sharing
   * them is what makes a dozen pieces cheap, and the moment one of them needs
   * its own opacity it needs its own material or every other piece fades with
   * it.
   */
  const object = useMemo(() => {
    const copy = scene.clone(true)
    if (dim) {
      copy.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const source = child.material as THREE.Material | THREE.Material[]
        const fade = (one: THREE.Material) => {
          const own = one.clone()
          own.transparent = true
          own.opacity = 0.35
          own.depthWrite = false
          return own
        }
        child.material = Array.isArray(source) ? source.map(fade) : fade(source)
      })
    }
    return copy
  }, [scene, dim])

  return (
    <group
      position={placed}
      rotation={rotation}
      scale={drawn}
      onClick={
        onPick &&
        ((event) => {
          // Only the nearest piece under the pointer. Without this a click on a
          // crate standing in front of a bench selects both, and the one that
          // wins is whichever three.js listed last - which is not a rule
          // anybody clicking can hold in their head.
          event.stopPropagation()
          onPick()
        })
      }
    >
      <primitive object={object} />
    </group>
  )
}

/**
 * A socket, drawn as the thing it is: a point and the way it faces.
 *
 * A ring rather than a sphere, and a stick out of it, because a socket has an
 * orientation and a ball does not show one. Somebody placing the grip of a
 * rifle needs to see which way the barrel will point, and a dot leaves them
 * guessing until they have summoned it and looked.
 */
function SocketMark({
  at,
  turn,
  lit,
}: {
  at: { x: number; y: number; z: number }
  turn: number
  lit: boolean
}) {
  const colour = lit ? '#f0abfc' : '#5eead4'

  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, (turn * Math.PI) / 2, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.11, 0.014, 8, 24]} />
        {/* Unlit, so a marker reads the same from every angle - a gizmo that
            takes the room's light is a gizmo that disappears in a shadow. */}
        <meshBasicMaterial color={colour} transparent opacity={lit ? 1 : 0.75} />
      </mesh>
      <mesh position={[0.13, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.035, 0.1, 8]} />
        <meshBasicMaterial color={colour} transparent opacity={lit ? 1 : 0.75} />
      </mesh>
    </group>
  )
}

/**
 * A seat, drawn as a footprint rather than as a body.
 *
 * A whole peep standing on the bench would be the honest picture and is the
 * wrong one here: three of them hide the bench you are trying to place them on.
 * A ring on the floor plus a stub for the facing says where somebody lands and
 * leaves the thing visible, which is what this viewport is for.
 */
function SeatMark({ at, lit }: { at: { x: number; y: number; z: number }; lit: boolean }) {
  return (
    <group position={[at.x, at.y + 0.01, at.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, 0.22, 24]} />
        <meshBasicMaterial
          color={lit ? '#f0abfc' : '#a5b4fc'}
          transparent
          opacity={lit ? 0.95 : 0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

/**
 * The thing, its pieces, its sockets and its seats.
 *
 * `dim` rather than an outline for the selection, and the reason is what these
 * models are: untextured, single-material voxel props, most of them convex.
 * An outline pass on one of those reads as a halo the model already has, and
 * the two colours in this palette are both used by the markers. Fading
 * *everything else* leaves the piece you are moving as the only solid object in
 * the viewport, which is unambiguous at any angle and costs one material clone.
 */
export function Stage({
  spec,
  selected,
  onPick,
  showSockets,
  showSeats,
}: {
  spec: BlueprintSpec
  /** The piece being edited: `-1` is the root, `null` is nothing. */
  selected: number | null
  onPick: (index: number | null) => void
  showSockets: boolean
  showSeats: boolean
}) {
  const parts: readonly BlueprintPart[] = spec.parts ?? []
  const sockets = socketsOf(spec)
  const seats = spec.use?.seats ?? []

  return (
    <group>
      <Piece
        model={spec.model}
        at={PIECE_ORIGIN}
        turn={0}
        scale={spec.scale}
        dim={selected !== null && selected !== -1}
        onPick={() => onPick(-1)}
      />

      {parts.map((part, index) => (
        <Piece
          key={index}
          model={part.model}
          at={part.at}
          turn={part.turn}
          scale={part.scale}
          dim={selected !== null && selected !== index}
          onPick={() => onPick(index)}
        />
      ))}

      {/*
        The wheels, so a joint is placed against the body it hangs on rather
        than by typing numbers and summoning to check. Not pickable - a wheel
        is edited from its own panel, and a click here should keep selecting
        the pieces it is bolted to.
      */}
      {(spec.vehicle?.wheels ?? []).map((wheel, index) => (
        <Piece
          key={`wheel:${index}`}
          model={wheel.model}
          at={wheel.at}
          turn={0}
          scale={wheel.scale}
          hub
          dim={selected !== null}
        />
      ))}

      {showSockets &&
        sockets.map((socket) => (
          <SocketMark key={socket.name} at={socket.at} turn={socket.turn} lit={selected === null} />
        ))}

      {showSeats &&
        seats.map((seat, index) => (
          <SeatMark key={index} at={seatAt(spec, seat)} lit={selected === null} />
        ))}
    </group>
  )
}
