'use client'

import { TransformControls, useAnimations, useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import {
  Component,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import {
  type BlueprintPart,
  type BlueprintSpec,
  seatAt,
  seatClip,
  socketsOf,
} from '@/domain/thingiverse/blueprint'
import { asAvatarClip } from '@/domain/lounge/avatars'
import type { PlacementBox } from '@kxb/xp/blueprints'
import { modelUrlFor } from '@/domain/thingiverse/models'
import { PIECE_ORIGIN, pieceTransform } from '@/domain/thingiverse/placement'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { SkinModel } from '@/app/world/lounge/_canvas/skin-model'

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
  onMeasured,
  playClip,
  onClipStatus,
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
  /**
   * Where this piece ended up, once it is drawn, in the thing's own frame.
   *
   * Measured rather than declared for the reason `_sim/thing-solids` gives at
   * length: the packs ship no bounds, and the model itself is the only thing
   * that knows how big it is. The composer wants the answer so somebody
   * blocking a thing out by hand can start from what the room would have
   * measured, instead of guessing at numbers and summoning it to check.
   */
  onMeasured?: (box: THREE.Box3) => void
  /**
   * A clip name to play from this model's own animations, the same lookup the
   * lounge's `play` deed does - see `lounge-things.tsx`. Undefined means this
   * piece was not asked; only the root piece is, from `Stage`. Null explicitly
   * plays nothing, which still has to be reported so a stale "not found" does
   * not linger from the clip typed before it.
   */
  playClip?: string | null
  /** Told once per change whether `playClip` names a track this model has. */
  onClipStatus?: (found: boolean) => void
}) {
  const { scene, animations } = useGLTF(modelUrlFor(model))
  const group = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, group)
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

  /**
   * The clip somebody typed, played and stopped.
   *
   * `undefined` skips this entirely - every piece but the root is called with
   * no `playClip` at all, and reading `actions` for a wheel nobody asked about
   * would be work with no purpose. `null` is the machine's own "nothing", and
   * still has to run the effect: it is what clears whichever clip was playing
   * before the field was blanked, and it is what turns a stale "not found"
   * back off.
   */
  /**
   * How big this piece turned out, once it is in the scene.
   *
   * After the object is mounted rather than off the glTF's own bounds, because
   * the answer wanted is the *drawn* one - the pack's own scale, the piece's
   * scale and its turn are all in the group this measures, and none of them is
   * in the file. The group sits in the thing's own frame, so no conversion is
   * needed: `Stage` has no transform of its own, deliberately.
   */
  useEffect(() => {
    const node = group.current
    if (!node || !onMeasured) return
    node.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(node)
    if (!box.isEmpty()) onMeasured(box)
    // The numbers rather than the arrays `pieceTransform` builds out of them:
    // those are fresh on every render, and an effect that traverses a scene
    // graph must not run on every keystroke in a panel three components away.
  }, [object, model, at.x, at.y, at.z, turn, scale, hub, onMeasured])

  useEffect(() => {
    if (playClip === undefined) return
    if (!playClip) {
      onClipStatus?.(true)
      return
    }

    const action = actions[playClip]
    onClipStatus?.(Boolean(action))
    if (!action) return

    action.reset().play()
    return () => {
      action.stop()
    }
  }, [playClip, actions, onClipStatus])

  return (
    <group
      ref={group}
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
 * What a hand-drawn collide box is, as three.js wants it: a middle and a size.
 *
 * The format stores a *corner* and a size - see `PlacementBox`, which argues
 * why - and a mesh is placed by its middle, so the conversion has to happen
 * somewhere. Here rather than in the domain, because the corner is the honest
 * description of the thing and the middle is a fact about drawing it.
 */
export function boxCentre(box: PlacementBox): [number, number, number] {
  return [(box.x ?? 0) + box.w / 2, (box.y ?? 0) + box.h / 2, (box.z ?? 0) + box.d / 2]
}

/** The other way, for a gizmo that has just moved one. */
function boxCorner(
  centre: THREE.Vector3,
  size: { w: number; h: number; d: number },
): PlacementBox {
  return {
    // A hundredth of a cell, which is finer than anybody can see and coarse
    // enough that a document does not fill up with floating-point noise from a
    // drag. The same rounding the XP editor applies on the way into a document.
    x: round(centre.x - size.w / 2),
    y: round(centre.y - size.h / 2),
    z: round(centre.z - size.d / 2),
    w: round(size.w),
    h: round(size.h),
    d: round(size.d),
  }
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * One box a thing is solid in, drawn so you can see what it fills.
 *
 * Two meshes rather than one: a wireframe alone is hard to judge a *volume*
 * from at an angle - the far edges read as near ones - and a solid alone hides
 * the model it is supposed to be measured against. A faint fill with its edges
 * drawn on top is the shape every level editor settled on for the same reason.
 *
 * `depthWrite` off on the fill so two overlapping boxes do not punch holes in
 * each other, and both are unlit, for the reason `SocketMark` gives: a gizmo
 * that takes the room's light disappears in a shadow.
 */
function CollideMark({
  box,
  lit,
  onPick,
}: {
  box: PlacementBox
  lit: boolean
  onPick?: () => void
}) {
  const colour = lit ? '#f0abfc' : '#38bdf8'
  const size: [number, number, number] = [box.w, box.h, box.d]

  return (
    <group position={boxCentre(box)}>
      <mesh
        onClick={
          onPick &&
          ((event) => {
            event.stopPropagation()
            onPick()
          })
        }
      >
        <boxGeometry args={size} />
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={lit ? 0.18 : 0.09}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <boxGeometry args={size} />
        <meshBasicMaterial color={colour} wireframe transparent opacity={lit ? 0.9 : 0.45} />
      </mesh>
    </group>
  )
}

/** Which handle the box gizmo is offering. */
export type BoxHandle = 'move' | 'size'

/**
 * Handles on the box being edited.
 *
 * The same three decisions the XP editor's gizmo makes, and made the same way
 * because they are the same problem - see `app/xp/_editor/stage/stage.tsx`,
 * which explains each at length:
 *
 *   - **a proxy object, not the drawn mesh.** The mesh is rebuilt from the
 *     spec on every keystroke; a handle attached to it would be attached to
 *     something that stops existing while you are holding it.
 *   - **changes are reported continuously**, and the caller decides what to do
 *     with them. A drag fires every frame and the composer folds them into one
 *     edit.
 *   - **the camera is handed back on unmount**, unconditionally. Controls are
 *     disabled while a handle is held and re-enabled on release, which never
 *     happens if the gizmo is deleted mid-drag - and the symptom is a viewport
 *     that never turns again, with nothing pointing back here.
 *
 * Resizing is centre-out rather than corner-out: a box grown from its middle
 * stays over the part of the model you were looking at, and the alternative -
 * anchoring a corner - makes every widening also a move.
 */
function BoxGizmo({
  box,
  handle,
  onChange,
}: {
  box: PlacementBox
  handle: BoxHandle
  onChange: (next: PlacementBox) => void
}) {
  const [proxy] = useState(() => new THREE.Object3D())
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null

  useEffect(() => {
    return () => {
      if (controls && controls.enabled === false) controls.enabled = true
    }
  }, [controls])

  useLayoutEffect(() => {
    proxy.position.set(...boxCentre(box))
    // Always one: the size lives in the geometry, so the handle reports a ratio
    // against a scale that is reset from the spec on every render.
    proxy.scale.setScalar(1)
  }, [box, proxy])

  const report = () => {
    if (handle === 'move') {
      onChange(boxCorner(proxy.position, box))
      return
    }
    onChange(
      boxCorner(proxy.position, {
        w: Math.max(MIN_DRAWN, box.w * proxy.scale.x),
        h: Math.max(MIN_DRAWN, box.h * proxy.scale.y),
        d: Math.max(MIN_DRAWN, box.d * proxy.scale.z),
      }),
    )
  }

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        object={proxy}
        mode={handle === 'move' ? 'translate' : 'scale'}
        // Half again as big as drei's default, for the reason the XP editor
        // gives: the handles are sized in screen space and the default was
        // chosen for a closer camera than any editor actually uses.
        size={1.5}
        translationSnap={null}
        scaleSnap={0.05}
        onObjectChange={report}
      />
    </>
  )
}

/**
 * The floor under a dragged size, in cells.
 *
 * A box scaled to nothing is a box nobody can grab again to fix, which is the
 * same trap `MIN_THING_SCALE` exists to close - and a gizmo makes it one
 * careless flick away rather than a number somebody typed.
 */
const MIN_DRAWN = 0.05

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
  collide,
  onMeasured,
  poseFor,
  playClip,
  onClipStatus,
  driver,
}: {
  spec: BlueprintSpec
  /** The piece being edited: `-1` is the root, `null` is nothing. */
  selected: number | null
  onPick: (index: number | null) => void
  showSockets: boolean
  showSeats: boolean
  /**
   * The collide boxes, and the one being edited.
   *
   * A single prop rather than four, because they are one mode: the boxes are
   * only drawn while somebody is blocking the thing out, and a picked box with
   * nothing to pick from is not a state this viewport can be in. Absent draws
   * nothing at all, which is what every other surface that mounts a `Stage`
   * wants - the rehearsal, the showcase, the shelf's preview.
   */
  collide?: {
    boxes: readonly PlacementBox[]
    /** Which one has the handles, or null while none is picked. */
    picked: number | null
    handle: BoxHandle
    onPick: (index: number | null) => void
    onChange: (index: number, box: PlacementBox) => void
  } | null
  /**
   * How big the whole thing measures, in its own frame, once it is drawn.
   *
   * The union of the pieces rather than the root's own bounds - which is what
   * makes a market stall's footprint the stall *and* its crates, exactly as
   * `lounge-things` unions them for the room. Reported whenever it changes and
   * not otherwise: the pieces measure themselves on every render, and a caller
   * holding this in state would otherwise re-render forever.
   */
  onMeasured?: (box: { w: number; h: number; d: number; x: number; y: number; z: number }) => void
  /**
   * A clip name, made playable, for the body standing in the first seat.
   *
   * Handed in rather than resolved here, for the reason `BodyModel.pose` gives:
   * which clips a space has made is knowledge the page loaded, and a body
   * should be handed what to play rather than sent looking for it. Absent
   * leaves the preview on the four the pack itself carries.
   */
  poseFor?: (clip: string) => THREE.AnimationClip | null
  /**
   * A clip to play on the root piece's own model, or null to play nothing.
   * Undefined - the default everywhere but the Machine panel - never asks the
   * root for it at all, which is the same "not asked" the wheels stay at.
   */
  playClip?: string | null
  onClipStatus?: (found: boolean) => void
  /**
   * The reader's own body, stood up in the first seat. See `previewDriver`.
   * Absent or null draws nothing - most things have no seat to stand one in.
   */
  driver?: { avatar: string; skin: string | null } | null
}) {
  const parts: readonly BlueprintPart[] = spec.parts ?? []
  const sockets = socketsOf(spec)
  const seats = spec.use?.seats ?? []
  const driverSeat = seats[0]

  /**
   * Every piece's own box, and the last union we told anybody about.
   *
   * `useState` with an initialiser rather than a ref, and the linter is right
   * to insist: a ref read while a component renders is a value React has not
   * committed, and the callbacks below are built during render. A state
   * initialiser gives the same made-once-never-replaced object with none of
   * that - the same trick the XP editor's gizmo uses for its proxy.
   *
   * Nothing here draws it. The whole job is to hand a number up, and holding it
   * as real state would re-render the viewport every time a piece reported the
   * box it reported last frame. `said` is the guard that keeps that from
   * becoming a loop upstairs, too.
   */
  const [ledger] = useState(() => ({ boxes: new Map<string, THREE.Box3>(), said: '' }))

  /**
   * One callback per piece, rebuilt only when the pieces change.
   *
   * The pieces measure themselves in an effect keyed on this callback, so a
   * fresh closure per render would re-run every one of those on every keystroke
   * - a scene-graph traversal per piece for an answer that has not changed.
   */
  const report = useMemo(() => {
    const made = new Map<string, (box: THREE.Box3) => void>()
    if (!onMeasured) return made

    const one = (key: string) => (box: THREE.Box3) => {
      ledger.boxes.set(key, box)

      const all = new THREE.Box3()
      for (const each of ledger.boxes.values()) all.union(each)
      if (all.isEmpty()) return

      const next = {
        x: round(all.min.x),
        y: round(all.min.y),
        z: round(all.min.z),
        w: round(all.max.x - all.min.x),
        h: round(all.max.y - all.min.y),
        d: round(all.max.z - all.min.z),
      }

      const word = JSON.stringify(next)
      if (word === ledger.said) return
      ledger.said = word
      onMeasured(next)
    }

    made.set('root', one('root'))
    for (let index = 0; index < parts.length; index += 1) {
      made.set(`part:${index}`, one(`part:${index}`))
    }
    return made
  }, [ledger, onMeasured, parts.length])

  /**
   * A piece that has gone stops counting towards the measurement.
   *
   * The keys are positional, so removing the middle of three parts shifts the
   * other two down and leaves the last key describing a piece nobody is
   * drawing - and a measurement that includes a crate that is not there is
   * exactly the wrong number to start blocking a thing out from.
   */
  useEffect(() => {
    for (const key of ledger.boxes.keys()) {
      const index = key.startsWith('part:') ? globalThis.Number(key.slice(5)) : -1
      if (index >= parts.length) ledger.boxes.delete(key)
    }
  }, [ledger, parts.length])

  return (
    <group>
      <Piece
        model={spec.model}
        at={PIECE_ORIGIN}
        turn={0}
        scale={spec.scale}
        dim={selected !== null && selected !== -1}
        onPick={() => onPick(-1)}
        onMeasured={report.get('root')}
        playClip={playClip}
        onClipStatus={onClipStatus}
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
          onMeasured={report.get(`part:${index}`)}
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

      {/*
        The boxes, and handles on whichever one is picked.

        Drawn last so they sit over the model rather than inside it - a
        transparent fill drawn before the thing it measures is a fill the thing
        writes over half of, and half a box is a box you cannot judge.
      */}
      {collide?.boxes.map((box, index) => (
        <CollideMark
          key={index}
          box={box}
          lit={collide.picked === index}
          onPick={() => collide.onPick(index)}
        />
      ))}

      {collide && collide.picked !== null && collide.boxes[collide.picked] && (
        <BoxGizmo
          // Keyed on which box, so picking another one rebuilds the handles
          // rather than sliding them across while a drag is still live.
          key={collide.picked}
          box={collide.boxes[collide.picked]}
          handle={collide.handle}
          onChange={(next) => collide.onChange(collide.picked!, next)}
        />
      )}

      {/*
        The driver, standing rather than sitting - see `previewDriver`. Always
        the first seat: that is the rule `vehicleProblems` writes down for who
        drives, stated again here rather than offered as a choice.
      */}
      {driver && driverSeat && spec.use && (
        <Driver
          at={seatAt(spec, driverSeat)}
          body={driver}
          // What they would actually be doing in that seat - the seat's own clip
          // if it has one, the block's otherwise. The preview used to draw an
          // idle body with a comment saying there was no clip for sitting;
          // there is one now, if the space has animated it, and the whole point
          // of choosing it is being able to see it.
          clip={seatClip(spec.use, 0)}
          poseFor={poseFor}
        />
      )}
    </group>
  )
}

/**
 * One body, at a seat, doing whatever that seat says.
 *
 * Idle when the seat says nothing, which is both the fallback and the honest
 * picture: a thing with no clip chosen puts a body there standing, and that is
 * what the room will draw too.
 *
 * The clip is handed to whichever model is being worn without translation. A
 * name neither body knows plays nothing and leaves it standing - the same
 * promise every other clip field in this product makes, and the reason the
 * panel beside this offers a list instead of a text box.
 */
function Driver({
  at,
  body,
  clip,
  poseFor,
}: {
  at: { x: number; y: number; z: number }
  body: { avatar: string; skin: string | null }
  clip: string | null
  poseFor?: (clip: string) => THREE.AnimationClip | null
}) {
  /*
    The two vocabularies a body has, exactly as the lounge hands them to a peer:
    one of the pack's own four goes in as a name, and anything this space
    animated goes in as a built clip and wins over it. A name in neither leaves
    the body standing, which is what a seat with a clip nobody made looks like
    in the room too.
  */
  const named = asAvatarClip(clip) ?? 'idle'
  const made = clip ? (poseFor?.(clip) ?? null) : null

  return (
    <group position={[at.x, at.y, at.z]}>
      {body.skin ? (
        <SkinModel model={body.skin} clip={named} pose={made} />
      ) : (
        <AvatarModel model={body.avatar} clip={named} pose={made} />
      )}
    </group>
  )
}
