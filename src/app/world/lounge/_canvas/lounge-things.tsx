'use client'

import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, type ReactNode, Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useRainbowScenery } from '@/app/world/_canvas/rainbow'
import { useMediaQuery } from '@/app/world/lounge/_hud/touch-controls'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import { cellsIn, deckCells, type ThingSolids } from '@/app/world/lounge/_sim/thing-solids'
import {
  BOB_HEIGHT,
  BOB_RATE,
  firing,
  NEAR,
  SPIN_RATE,
  TOUCH,
} from '@/app/world/lounge/_sim/thing-actions'
import { dropTo } from '@/app/world/lounge/_sim/carry'
import { ballAt, bodyVelocity, type Ball, type Striker } from '@/app/world/lounge/_sim/football'
import { drifted, knockable, knocked } from '@/app/world/lounge/_sim/knock'
import { blockKey } from '@/domain/lounge/events'
import { GRAVITY } from '@/app/world/lounge/_sim/physics'
import type { BlockMap } from '@/app/world/lounge/_scene/scene-types'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { itemLook, type ItemLook } from '@/domain/thingiverse/craft'
import { ThingShots } from '@/app/world/lounge/_canvas/thing-shots'
import { offsetAt } from '@/domain/thingiverse/motion'
import { lookOf } from '@/domain/thingiverse/states'
import { useThingLife } from '@/app/world/lounge/_hooks/use-thing-life'
import { barOver, type Life } from '@/app/world/lounge/_sim/thing-life'
import { modelUrlFor } from '@/domain/thingiverse/models'
import { PIECE_ORIGIN, pieceTransform } from '@/domain/thingiverse/placement'
import { toPlace } from '@/domain/thingiverse/thing-commands'

/**
 * Forwarded, because this is where it used to live.
 *
 * `pieceTransform` moved into the domain when it turned out the composer had
 * its own copy of the same four lines - see `placement.ts`. The vehicle rig
 * imports it from here, so the name stays reachable at the old address rather
 * than being a rename somebody else has to notice mid-edit. New callers should
 * take it from the domain, where the composer reads it too.
 */
export { pieceTransform }
import {
  colliderOf,
  socketsOf,
  type BlueprintPart,
  type BlueprintSpec,
} from '@/domain/thingiverse/blueprint'
import { playing, WHOLE } from '@/domain/thingiverse/timeline'
import type { ThingView } from '@/domain/thingiverse/queries'

/**
 * The things standing in a world, and the one being carried.
 *
 * A sibling of <LoungeImages>, and the two are drawn the same way for the same
 * reason: anchored to a cell, turned in quarter steps, part of the world rather
 * than stuck on top of it. What is different is that a thing is a *model* out
 * of a pack the lounge has never loaded before, so three things this file has
 * to do that the pictures do not:
 *
 *   1. **Clone it.** `useGLTF` hands back one cached `Object3D` per URL and a
 *      single object cannot be in two places in a scene graph. Without a clone,
 *      a room with four benches shows one bench that teleports between them.
 *      Same as `Model` in the café.
 *   2. **Scale it onto the cell.** Every pack is authored at its own size (see
 *      `Pack.scale`), so a bb10 crate and a Tiny Treats bath agree about
 *      nothing until both are multiplied onto the one-metre grid.
 *   3. **Measure it.** Whether you can walk through it is a property somebody
 *      set, and *where* that stops you is the model's own footprint, which
 *      nothing in the packs writes down. See `./_sim/thing-solids`.
 */

/** Where a thing sits, given its cell, its pack and its two scales. */
export function thingTransform(
  spec: BlueprintSpec,
  thing: { x: number; y: number; z: number; facing: number; scale: number },
): { position: [number, number, number]; rotation: [number, number, number]; scale: number } {
  return {
    // Centred in its cell, like a block and unlike an image's corner anchor -
    // a bench summoned into a cell should stand in the middle of it, which is
    // where the preview ghost draws it and therefore where somebody aimed.
    position: [thing.x + 0.5, thing.y, thing.z + 0.5],
    rotation: [0, (thing.facing * Math.PI) / 2, 0],
    // Only the instance's own multiplier. The pack's conversion and the
    // blueprint's size belong to each *piece* - see `pieceTransform` - because
    // a thing is not one model any more: a market stall is a stall with crates
    // on it, and the crates come out of a pack with its own idea of a unit.
    scale: thing.scale,
  }
}

/**
 * How much room one drawn piece takes up, in the frame it is placed in.
 *
 * Measured off a holder rather than off the piece where it hangs, because the
 * answer wanted is a *local* one: the thing's own bounds, before it is turned
 * to face anywhere or dropped into a cell. World bounds of a rotated thing are
 * a bigger box than the thing, and both the collision and the carry box would
 * inherit the slack.
 */
function measure(
  object: THREE.Object3D,
  placed: ReturnType<typeof pieceTransform>,
): THREE.Box3 | null {
  const holder = new THREE.Group()
  holder.position.set(...placed.position)
  holder.rotation.set(...placed.rotation)
  holder.scale.setScalar(placed.scale)
  holder.add(object.clone(true))
  holder.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(holder)
  return box.isEmpty() ? null : box
}

/**
 * One item standing on a thing, already resolved to something drawable.
 *
 * The socket is carried through rather than dropped after the position is
 * worked out, because it is the identity of the *place* - and the place is what
 * keeps its React key stable while what is on it changes.
 */
export interface HeldItem {
  socket: string
  model: string
  /** Where the socket is, in the thing's own frame, in cells. */
  at: { x: number; y: number; z: number }
  turn: number
  scale: number
}

/** Shared, so a thing holding nothing does not rebuild a memo every render. */
const NOTHING_HELD: readonly HeldItem[] = []

/**
 * Scratch, because `worldBox` is now on a frame loop for anything that moves
 * and a fresh `Group` per thing per frame is garbage nobody needs. Safe as
 * module state: every caller is synchronous and reads the result before
 * yielding.
 */
const SCRATCH_HOLDER = new THREE.Group()
const SCRATCH_BOX = new THREE.Box3()
/**
 * A second one, for the union a multi-box mover's deck is taken over.
 *
 * Its own rather than shared with `SCRATCH_BOX`, which `worldBox` hands back
 * and which the loop is still reading from when the union is taken.
 */
const SCRATCH_DECK = new THREE.Box3()

function worldBox(
  bounds: THREE.Box3,
  position: [number, number, number],
  rotation: [number, number, number],
  scale: number,
): THREE.Box3 {
  SCRATCH_HOLDER.position.set(...position)
  SCRATCH_HOLDER.rotation.set(...rotation)
  SCRATCH_HOLDER.scale.setScalar(scale)
  SCRATCH_HOLDER.updateMatrixWorld(true)

  return SCRATCH_BOX.copy(bounds).applyMatrix4(SCRATCH_HOLDER.matrixWorld)
}

/**
 * The boxes this thing is solid in, in its own frame.
 *
 * One, and it is the measured bounds, unless somebody drew better ones - see
 * `BlueprintSpec.collider`, which argues why an arch's measured box is the
 * worst answer available. The blueprint's boxes are a *replacement* rather than
 * an addition: a thing blocked out by hand is blocked out by hand, and adding
 * the measured box back would put the wall straight back across the opening the
 * boxes were drawn to open.
 *
 * Returns empty when there is nothing to be solid in, which is the case for a
 * model that has not loaded yet - and an empty list stops nobody, which is the
 * right way round for a thing nobody can see.
 */
function solidBoxes(
  spec: BlueprintSpec,
  bounds: THREE.Box3 | null,
): THREE.Box3[] {
  const drawn = colliderOf(spec)
  if (drawn === 'none') return []
  if (drawn !== 'auto') {
    return drawn.map((box) => {
      const x = box.x ?? 0
      const y = box.y ?? 0
      const z = box.z ?? 0
      return new THREE.Box3(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(x + box.w, y + box.h, z + box.d),
      )
    })
  }
  return bounds ? [bounds] : []
}

/** The cells a world box fills, with a mover's partial top cell left out. */
function cellsOf(box: THREE.Box3, moving: boolean): string[] {
  const flat = {
    minX: box.min.x,
    minY: box.min.y,
    minZ: box.min.z,
    maxX: box.max.x,
    maxY: box.max.y,
    maxZ: box.max.z,
  }
  return moving ? deckCells(flat) : cellsIn(flat)
}

/**
 * The cells a drawn thing covers, in the world.
 *
 * Its own function because two callers need the same answer and one of them is
 * a frame loop: a thing that stands still registers its footprint once, and a
 * lift re-registers whenever its cells change. A second copy of this arithmetic
 * is a moving platform whose collision is subtly not where its picture is.
 *
 * `applyMatrix4` takes the eight corners rather than the two, which is what
 * keeps a bench turned across a doorway blocking the doorway rather than the
 * wall it was modelled facing.
 */
function footprint(
  boxes: readonly THREE.Box3[],
  position: [number, number, number],
  rotation: [number, number, number],
  scale: number,
  /**
   * Whether this thing moves, and so must not claim the cell its top sits in.
   *
   * A bench may: its top is rounded up to the boundary above it, you stand on
   * that boundary, and being three centimetres higher than the picture is
   * something nobody has ever noticed. A lift may not, and the reason is that
   * the cell it would claim is the cell the *rider* is standing in. Its deck is
   * at 1.3, the cell from 1 to 2 is claimed, so a body with its feet at 1.3 is
   * inside solid geometry - which is either a shove out of the platform or a
   * body frozen on top of it, depending on which rule reaches it first.
   *
   * So a moving thing is solid only up to the last whole cell beneath its
   * surface, and the surface itself is published as a deck instead - see
   * `ThingSolids.ride`. What this costs is that the top slab of a lift is not a
   * wall: you can walk into the side of the part of it that pokes above the
   * last full cell. That is at most one cell of a platform you are meant to be
   * standing on rather than pressed against, and it is a far smaller lie than
   * the one it replaces.
   */
  moving = false,
): string[] {
  const keys: string[] = []
  // A list because a hand-drawn collider is a list - an arch has two legs. One
  // box in it is the ordinary case and costs one pass either way; the union is
  // taken over cells rather than over boxes, which is what lets the air between
  // the legs stay air.
  for (const box of boxes) keys.push(...cellsOf(worldBox(box, position, rotation, scale), moving))
  return keys
}

function ThingModel({
  spec,
  thing,
  ghost,
  selected,
  solids,
  ground,
  loose,
  onSettled,
  life,
  holding,
}: {
  spec: BlueprintSpec
  thing: { id: string; x: number; y: number; z: number; facing: number; scale: number }
  ghost?: boolean
  selected?: boolean
  /** Where to report the footprint, when this thing is meant to stop people. */
  solids?: ThingSolids | null
  /**
   * Whether this one can be knocked about. See `knockable`.
   *
   * Decided by the list rather than here, because it is the instance's answer
   * that counts and the tuning that overrides a blueprint lives up there with
   * the row.
   */
  loose?: boolean
  /**
   * Where it came to rest, once it has.
   *
   * Only when it has actually travelled - see `drifted`. A ball is stepped by
   * whoever is looking at it and written down when it stops, rather than
   * broadcast every frame: sixty positions a second per ball is a match's worth
   * of traffic for a room where somebody is idly kicking something.
   */
  onSettled?: (cell: { x: number; y: number; z: number }) => void
  /**
   * The world, for the one question gravity asks: what is under this.
   *
   * Absent in the preview and in any scene with no blocks in it, which is the
   * same as saying nothing falls there - a ghost is a picture of a decision
   * nobody has taken, and a thing cannot land on a floor that is not loaded.
   */
  ground?: BlockMap | null
  /**
   * What this thing is doing right now, asked once a frame.
   *
   * A getter rather than the value, and that is what keeps the machine out of
   * React: a `Life` handed down as a prop would be a re-render every time a
   * burger got a fiftieth of a second more cooked. See `useThingLife`.
   */
  life?: (id: string) => Life | undefined
  /**
   * What is standing on it right now, already resolved to models.
   *
   * The words on a table are the machine's (`Life.slots`) and the models behind
   * them are the shelf's, and neither is this component's - so the join is done
   * once, above, and what arrives here is the same shape a `parts` entry has.
   * That is the whole trick: a bun on a board is drawn by the code that already
   * draws a crate bolted to a stall, at the socket the slot named.
   *
   * Deliberately *not* folded into `spec.parts`. A part is a fact about the
   * kind of thing - it is in the log, it is on every one of them - and what is
   * on this table is a fact about this minute. Merging them would put the
   * burger in the blueprint's own bounds, and a board whose footprint grew when
   * somebody put a bun on it is a board that pushes people out of the kitchen.
   */
  holding?: readonly HeldItem[]
}) {
  /**
   * Whether this reader has asked for less motion.
   *
   * Read per thing rather than threaded from the scene: it is one media query
   * with a cached result, and passing it through four components to save that
   * would be four props that can be forgotten on the fifth.
   */
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')

  const parts: readonly BlueprintPart[] = spec.parts ?? []

  /**
   * Every model this thing is made of, loaded in one call.
   *
   * An array rather than a component per piece, and that is a constraint rather
   * than a preference: loading a glTF is a hook, a hook cannot be called in a
   * loop, and a child component per piece would have to report its bounds back
   * up - which is a write during render or a `setState` in an effect, and the
   * compiler refuses both. `useGLTF` takes a list and returns one, so the whole
   * thing is measured and drawn in the same place that already knew how.
   *
   * The cost is that a stall arrives all at once rather than crate by crate.
   * That is the right way round anyway: half a stall standing in a room is not
   * a loading state anybody can read.
   */
  const held = holding ?? NOTHING_HELD
  const urls = useMemo(
    () =>
      [spec.model, ...parts.map((part) => part.model), ...held.map((one) => one.model)].map(
        modelUrlFor,
      ),
    // `parts` is rebuilt when `spec.parts` is, which is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec.model, spec.parts, held],
  )
  const loaded = useGLTF(urls)
  const animations = loaded[0]?.animations ?? []
  const { position, rotation, scale } = thingTransform(spec, thing)
  const skin = useRainbowScenery()
  const { playerRef, thingSpotsRef } = useSceneRefs()

  const group = useRef<THREE.Group>(null)
  /** Whether `touch` has already fired for this approach. See `firing`. */
  const latched = useRef(false)
  /** Which cells the footprint was last registered as. See the frame loop. */
  const covered = useRef('')
  /** Seconds since the scene started, for `bob`. Its own clock, so a thing
   *  summoned mid-session starts at the bottom of its bob rather than wherever
   *  the world's clock happened to be. */
  const clock = useRef(0)
  /** Where it is drawn while it falls, and how fast. See the frame loop. */
  const fallen = useRef(Number.POSITIVE_INFINITY)
  const speed = useRef(0)
  /**
   * Where the timeline has got to, and whether it is going at all.
   *
   * Its own clock rather than the one above, because the two are asking
   * different questions: `clock` is "how long has this been standing here",
   * which a bob reads and which never restarts, and this one is "how far into
   * the performance are we", which restarts every time the run does.
   */
  const runClock = useRef(0)
  const running = useRef(false)
  /** A `vanish` the timeline fired. Unlike an action's, it does not come back. */
  const hidden = useRef(false)
  /**
   * Where a loose thing actually is, and how fast. See `knocked`.
   *
   * The football's ball, standing in for the thing: its centre in world units
   * rather than the cell it is written down at, because between one kick and
   * the next it is nowhere in particular.
   */
  const ball = useRef<Ball | null>(null)
  /** Last frame's feet, to difference into a striker's velocity. */
  const strode = useRef<{ x: number; z: number } | undefined>(undefined)
  /** Whether it was rolling last frame, so that stopping is an event. */
  const rolling = useRef(false)
  /**
   * Clips a cue asked for and the frame has not started yet.
   *
   * A set between the two halves of the loop rather than a call in place,
   * because the clips are resolved further down and may not exist at all - and
   * a cue is crossed exactly once, so there is no second chance to ask.
   */
  const shots = useRef(new Set<string>())

  /**
   * The pieces, cloned, faded if this is a preview and skinned if the world is.
   *
   * The root is the first of them, at the origin with no turn, so that nothing
   * downstream has to hold two ideas of what a piece is. Its clone is named
   * again below because the `play` deed animates it and only it.
   */
  const pieces = useMemo(() => {
    const placed = [
      { model: spec.model, at: PIECE_ORIGIN, turn: 0, scale: spec.scale },
      ...parts,
    ]

    return placed.map((part, index) => {
      const copy = (loaded[index]?.scene ?? new THREE.Group()).clone(true)

      if (ghost || selected) {
        /**
         * Ghosting clones the *material* as well as the object.
         *
         * Materials are shared across every clone of a model, so fading the
         * preview's material would fade every bench already standing in the
         * room. The same trap the café's build preview documents.
         */
        copy.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return
          const faded = (node.material as THREE.Material).clone()
          faded.transparent = true
          faded.opacity = ghost ? 0.5 : 0.85
          if (ghost) faded.depthWrite = false
          node.material = faded
        })
      }

      if (skin && !ghost) {
        copy.traverse((node) => {
          if (node instanceof THREE.Mesh) node.material = skin
        })
      }

      return { object: copy, placed: pieceTransform(part.model, part.at, part.turn, part.scale) }
    })
    // `parts` is rebuilt when `spec.parts` is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, spec.model, spec.scale, spec.parts, ghost, selected, skin])

  /**
   * And what is standing on it, drawn the same way and measured separately.
   *
   * Its own memo rather than more entries in `pieces`, because `pieces` is what
   * `bounds` is the union of - and the bounds are the footprint, the carry box
   * and where the bar hangs. A burger must not widen the table it is on, must
   * not be inside the box somebody picks the table up by, and must not push the
   * health bar into the ceiling.
   *
   * The models come after the root and the parts in `urls`, so the offset is
   * exactly how many of those there are.
   */
  const carried = useMemo(() => {
    const first = 1 + parts.length
    return held.map((one, index) => {
      const copy = (loaded[first + index]?.scene ?? new THREE.Group()).clone(true)
      // No ghosting: an item is only ever drawn on a real thing, and the
      // preview under the crosshair carries nothing. The world's skin is
      // applied for the same reason it is above - a rainbow room is a rainbow
      // room, and a bun that stayed beige would be the one thing in it that
      // missed the memo.
      if (skin) {
        copy.traverse((node) => {
          if (node instanceof THREE.Mesh) node.material = skin
        })
      }
      return { object: copy, placed: pieceTransform(one.model, one.at, one.turn, one.scale) }
    })
  }, [loaded, held, parts.length, skin])

  /**
   * All of it, as one box in the thing's own frame.
   *
   * The union of the pieces rather than the root's own bounds, which is what
   * makes a stall's footprint the stall *and* its crates - and what a carried
   * one is drawn a box around.
   */
  const bounds = useMemo(() => {
    const all = new THREE.Box3()
    for (const piece of pieces) {
      const box = measure(piece.object, piece.placed)
      if (box) all.union(box)
    }
    return all.isEmpty() ? null : all
  }, [pieces])

  /**
   * And the boxes it is *solid* in, which is the same box unless somebody drew
   * better ones. See `solidBoxes`.
   *
   * Memoised on the drawn list rather than on the spec, so a keystroke in the
   * composer's clip field does not re-register every footprint in the room.
   */
  const solid = useMemo(
    () => solidBoxes(spec, bounds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds, spec.blocking, spec.collider],
  )

  /**
   * Report what this fills, once it is drawn.
   *
   * Measured from the *cloned and transformed* object rather than from the
   * glTF's own bounds, so the turn and both scales are already in the numbers -
   * a bench turned across a doorway blocks the doorway, not the wall it was
   * modelled facing.
   *
   * The ghost never reports: a preview is a picture of a decision nobody has
   * taken yet, and a preview you cannot walk through would trap somebody who
   * summoned a wall by accident.
   */
  useEffect(() => {
    if (!solids || ghost || !bounds) return

    // At home, which is where a thing with a trip starts and where one without
    // a trip stays. The frame loop takes it from here for anything that moves,
    // and `covered` is cleared so its first frame re-registers rather than
    // inheriting a key from the last blueprint this id wore.
    covered.current = ''
    solids.set(thing.id, footprint(solid, position, rotation, scale, !!spec.motion))

    return () => solids.drop(thing.id)
    // `position`/`rotation` are fresh arrays every render, so the contents are
    // named instead - the box only has to be recomputed when the thing has
    // actually moved, turned, resized or changed model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solids, ghost, solid, thing.id, thing.x, thing.y, thing.z, thing.facing, scale, spec.motion])

  /**
   * The clips the *model* carries, for the `play` deed.
   *
   * Most of the catalogue has none - these are furniture, not characters - and
   * that is fine: a name that finds nothing plays nothing, which is the same
   * promise `BlueprintSpec.clip` makes and the reason neither is checked
   * against a pack.
   */
  const { actions: clips } = useAnimations(animations, group)

  /**
   * How far the drawn middle of it is above the cell it stands on.
   *
   * A ball is stepped by its centre and written down by its corner, and the two
   * are a radius apart. Measured rather than assumed, so a barrel and a marble
   * both rest on the floor instead of half through it.
   */
  const middle = bounds ? ((bounds.min.y + bounds.max.y) / 2) * scale : 0

  /**
   * The world, as the question a rolling thing asks of it.
   *
   * The same test the player's own controller uses, so a ball cannot roll
   * through a wall somebody can walk into.
   */
  const isSolid = useMemo(
    () => (x: number, y: number, z: number) =>
      ground ? ground.has(blockKey(x, y, z)) : false,
    [ground],
  )

  /**
   * Put back where it is written down, whenever that changes.
   *
   * Which covers both halves of somebody else moving it: a kick of their own
   * that came to rest and landed on the wire, and a crate they picked up and
   * put somewhere else. The local roll is speculative and the log is the truth.
   */
  useEffect(() => {
    if (!loose) {
      ball.current = null
      return
    }
    ball.current = ballAt({
      x: thing.x + 0.5,
      y: thing.y + middle,
      z: thing.z + 0.5,
    })
    rolling.current = false
  }, [loose, thing.x, thing.y, thing.z, middle])

  /**
   * What it is doing, every frame.
   *
   * One `useFrame` per thing, and the cost is the reason a world is capped at
   * `MAX_THINGS_PER_WORLD`: this is a distance, a `Set` and at most two
   * assignments to a transform, which is nothing sixty-four times but is not
   * nothing four hundred times.
   *
   * Nothing here is state. A thing that spun by re-rendering would re-render
   * the scene sixty times a second, which is the trap every ref in this folder
   * exists to avoid.
   */
  /**
   * Where this thing is *drawn*, for anybody outside this component.
   *
   * The vector itself rather than a copy of it, and once rather than per frame:
   * three mutates `node.position` in place, so a reader holding this reference
   * is reading the current position by construction. A per-frame copy would be
   * the same number one frame later and an allocation sixty times a second.
   *
   * It matters because the row and the picture disagree. `thing.x/y/z` is where
   * this was *put*; a kicked ball is somewhere else entirely until it stops and
   * writes itself down. See <Usables>, which was measuring the reach to the
   * former and so kept "E to use" at the spot the ball was summoned at.
   *
   * Not for a ghost: the preview under a summon is not a thing anybody can
   * reach, and publishing it would put a second entry under an id that is about
   * to belong to the real one.
   */
  useEffect(() => {
    const node = group.current
    const spots = thingSpotsRef.current
    if (!node || ghost) return

    spots.set(thing.id, node.position)
    return () => {
      // Only if it is still ours: a re-mount installs the new node's vector
      // before the old one's cleanup runs, and deleting then would leave the
      // thing unreachable for as long as it stands there.
      if (spots.get(thing.id) === node.position) spots.delete(thing.id)
    }
  }, [thingSpotsRef, thing.id, ghost])

  useFrame((_, delta) => {
    const node = group.current
    if (!node || ghost) return

    // See `CarryBox`: the clock is the one thing the moving deeds read, so a
    // reader who asked for less motion gets a thing that spins and bobs
    // *nowhere* rather than one that is missing.
    if (!still) clock.current += delta

    const player = playerRef.current
    /*
      To where it is, not to where it was put.

      This read `position` - the transform off the row - which is the same bug
      the prompt had: a ball that has been kicked across the room still fired
      its `touch` deeds at the cell it was summoned in, and fired nothing where
      it actually was. `node.position` is the drawn one, which for everything
      that does not move is the same number.
    */
    const distance = Math.hypot(
      node.position.x - player.x,
      node.position.y - (player.y - EYE_HEIGHT),
      node.position.z - player.z,
    )

    const fired = firing(spec.actions, distance, latched.current)
    latched.current = fired.latched

    // A copy, because what follows adds the timeline's deeds to it and the set
    // `firing` hands back is derived from the props - which the compiler will
    // not let anything write to, and rightly: a rule's answer is not a
    // scratchpad.
    const active = new Set(fired.active)

    /**
     * The timeline, folded into the same set of deeds the actions produce.
     *
     * Deliberately not a second runtime: a cue that says `spin` puts `spin` in
     * the set the rest of this loop already reads, so the timeline and the
     * standing rules cannot disagree about what spinning looks like or drift
     * apart when one of them is changed.
     *
     * Cues that name a piece are read and dropped for now - the room draws the
     * root model and nothing else, so a piece is not yet something there is a
     * transform to turn. When it is, `holds` is already keyed by part.
     */
    const timeline = spec.timeline
    if (timeline) {
      const gate =
        timeline.when === 'always'
          ? true
          : timeline.when === 'near'
            ? distance <= NEAR
            : distance <= TOUCH || (running.current && distance <= NEAR)

      // A run always starts at its beginning: walking up to a thing half way
      // through its performance and being shown the second half of it is the
      // one reading nobody means.
      if (gate && !running.current) runClock.current = 0
      running.current = gate

      if (gate) {
        const before = runClock.current
        if (!still) runClock.current += delta
        const now = playing(timeline, before, runClock.current)

        const whole = now.holds.get(WHOLE)
        if (whole) active.add(whole)

        for (const cue of now.fires) {
          if (cue.part !== undefined) continue
          if (cue.deed === 'vanish') hidden.current = true
          if (cue.deed === 'play' && cue.value) shots.current.add(cue.value)
        }

        if (now.done) running.current = false
      }
    }

    // `vanish` is local and lasts until the room is next loaded, which is what
    // the blueprint promises. Nothing is written down: a pickup that stayed
    // picked up for everybody is a fact about the world, and this is a fact
    // about the moment you walked into it.
    node.visible = !active.has('vanish') && !hidden.current

    if (active.has('spin') && !still) {
      node.rotation.y += SPIN_RATE * delta
    } else if (!active.has('spin')) {
      node.rotation.y = rotation[1]
    }

    /**
     * Knocked about, for the things that are loose.
     *
     * Its own branch and its own arithmetic: everything below is a thing that
     * stands where it was put and falls to the floor under it, and a ball does
     * neither. Stepped by whoever is looking at it, written down when it stops.
     *
     * `bob` still reads, because the two are not in conflict - a bobbing ball
     * that somebody kicks is a bobbing ball somewhere else - but the fall is
     * the ball's own now.
     */
    if (loose && ball.current) {
      const feet = { x: player.x, z: player.z }
      const stride = bodyVelocity(strode.current, feet, delta)
      strode.current = feet

      /**
       * Everybody in the room, not only whoever is looking.
       *
       * Each client steps the ball for itself, so a peer walking into it has to
       * push it here as well or the ball would only move for the person who
       * kicked it. Their positions are interpolated and up to a packet old,
       * which `PUSH_REACH` is already generous about.
       */
      const bodies: Striker[] = [{ position: player, vx: stride.vx, vz: stride.vz }]

      const step = knocked({ ball: ball.current, bodies, delta, isSolid })
      ball.current = step.ball

      node.position.set(step.ball.x, step.ball.y - middle, step.ball.z)

      // Stopping is the event, not moving: one message when it comes to rest
      // rather than sixty a second while it rolls.
      if (rolling.current && !step.moving) {
        /*
          On the grid, and inside the world, before it is written down.

          A ball stops wherever it stops - 1.2493 - and the command refuses
          anything that is not a multiple of a tenth, on purpose: the log is
          immutable and a position that arrived as 3.0000000000000004 is in the
          history forever. Refusing is right for a position somebody *typed*
          and useless for one that was *measured*, so the tidying happens here,
          at the edge that did the measuring. It surfaced as "A height must be a
          multiple of 0.1 cells" over a room, which is a sentence with nothing
          the reader could do about it.

          The height needs the same treatment and did not get it the first time.
          `stepBall` rests a ball on the sim's one fixed radius; `middle` is the
          drawn half-height of whichever model is rolling, and those agree only
          at scale 1. A ball bigger than the sim's radius settles at a negative
          cell, and the room said "Too small: expected number to be >=0" at
          somebody who had done nothing but kick it. `toPlace` bounds as well as
          rounds.
        */
        const came = toPlace({
          x: step.ball.x - 0.5,
          y: step.ball.y - middle,
          z: step.ball.z - 0.5,
        })
        if (onSettled && drifted(thing, came)) onSettled(came)
      }
      rolling.current = step.moving

      if (active.has('bob')) {
        node.position.y += Math.sin(clock.current * BOB_RATE) * BOB_HEIGHT
      }
    }

    // A ball has already put itself somewhere. Everything below is how a
    // thing that stands where it was put finds the floor under it.
    if (!loose || !ball.current) {
      /**
       * Falling, for the things that have a body.
       *
       * Drawn rather than written down. The thing's *cell* is where somebody put
       * it and stays there; what gravity moves is the picture, from where it was
       * placed down to whatever is underneath. Writing each frame back would be
       * an event per frame per falling crate, and the log would be a recording of
       * an animation.
       *
       * Which also makes it self-correcting in the way that matters: dig the
       * floor out from under something and it falls again on the next frame,
       * because the resting height is asked of the world rather than remembered.
       *
       * Only downward. A thing placed inside the floor - by somebody building
       * under it - stays where it was put rather than being pushed up out of the
       * ground it is now part of.
       */
      let resting = position[1]
      if (ground && spec.body) {
        const floor = dropTo(ground, thing.x, thing.z, thing.y)
        resting = Math.min(position[1], floor + (position[1] - thing.y))

        /**
         * Where it starts falling from, the first time this runs.
         *
         * The ref is seeded with `Infinity` to mean "nothing yet", and that
         * has to be *replaced* rather than fallen from: `Infinity` minus any
         * speed is still `Infinity`, so the branch below could never bring it
         * down, `node.position.y` was set to a non-finite number every frame,
         * and three.js draws nothing at all at a non-finite height.
         *
         * Which is what "a lot of things dont get rendered" was. Only some:
         * scenery (`body: null`) takes the branch below and is fine, and a
         * loose thing is placed by the ball simulation above - so what went
         * missing was every solid thing that falls, which is most of what
         * anybody summons.
         *
         * It starts where it was put, which is what makes the fall a fall:
         * the thing appears at the cell somebody placed it in and drops to
         * whatever is underneath.
         */
        if (!Number.isFinite(fallen.current)) fallen.current = position[1]

        if (fallen.current > resting) {
          // A multiplier on the world's own gravity, so a balloon rises slowly
          // and a rock drops like the player does. See `BodySpec.gravity`.
          speed.current += GRAVITY * (spec.body.gravity ?? 1) * delta
          fallen.current = Math.max(resting, fallen.current - speed.current * delta)
        } else {
          fallen.current = resting
          speed.current = 0
        }
      } else {
        fallen.current = resting
      }

      node.position.y = active.has('bob')
        ? fallen.current + Math.sin(clock.current * BOB_RATE) * BOB_HEIGHT
        : fallen.current
    }

    /**
     * And where its trip has got to.
     *
     * Read out of the machine rather than off a local clock, which is the whole
     * difference between this and `bob`: the phase is the driver's, published
     * four times a second and run forward locally in between, so a lift is in
     * the same place on every screen. See `@/domain/thingiverse/motion`.
     *
     * Applied *after* the fall, so a crusher with a body still finds the floor
     * and then rides its own trip up from it.
     */
    if (spec.motion) {
      const shift = offsetAt(spec.motion, life?.(thing.id)?.phase ?? 0)
      node.position.x = position[0] + shift.x
      node.position.y += shift.y
      node.position.z = position[2] + shift.z

      /*
        The footprint follows, but only when it has actually moved a cell.

        Re-registering is O(everything standing in the room) - `ThingSolids.drop`
        rebuilds the occupied set from what is left, deliberately, because two
        things may share a cell. Doing that sixty times a second for one lift
        would cost more than the rest of this loop put together, and it would
        buy nothing anybody could see: the collision grid is cells, so a
        platform that has moved a tenth of a cell covers exactly what it did
        before.
      */
      if (solids && solid.length > 0 && !ghost) {
        /*
          Every box it is solid in, at where it has moved to this frame.

          The deck is their union, and that is an approximation with a name: a
          two-legged thing that also *moves* would offer a rider the air between
          its legs as a surface. Nothing in the packs is both - a lift is a slab
          and an arch stands still - and the alternative is a deck per box,
          which is a second index on `ThingSolids` for a case that does not
          exist yet. The cells are not approximated: they are taken box by box,
          so the legs are the only part that stops you.
        */
        const at: [number, number, number] = [
          node.position.x,
          node.position.y,
          node.position.z,
        ]
        const keys: string[] = []
        const deck = SCRATCH_DECK.makeEmpty()

        for (const local of solid) {
          const box = worldBox(local, at, rotation, scale)
          deck.union(box)
          keys.push(...cellsOf(box, true))
        }

        /*
          The deck, every frame, because this is the number a rider stands on
          and rounding it is the whole bug: a platform drawn at 1.3 whose
          surface is reported at 1.0 slides up through your feet and then
          teleports you a cell when it crosses 1.5. One `Map.set` of six
          numbers - none of the `drop` rebuild below.
        */
        solids.ride(thing.id, {
          minX: deck.min.x,
          maxX: deck.max.x,
          minZ: deck.min.z,
          maxZ: deck.max.z,
          top: deck.max.y,
        })

        /*
          The footprint follows, but only when the cells have actually changed.

          Re-registering is O(everything standing in the room) - `ThingSolids.drop`
          rebuilds the occupied set from what is left, deliberately, because two
          things may share a cell. Doing that sixty times a second for one lift
          would cost more than the rest of this loop put together.

          Compared against the cells themselves rather than against a rounded
          offset, which is what this used to do and what left a *descending*
          lift's collision hanging in the air above it: the cells were last
          written when the offset crossed a rounding boundary, so for the half
          cell after that the platform had fallen out from under a set that
          still claimed the space the rider was standing in. `escapeFrom` then
          read a rider standing correctly on the deck as a body buried in
          geometry and shoved it out - which is the second half of "i get lifted
          but i am not on the object". Computing the keys is a handful of string
          joins; only `set` is expensive, and it still runs about once a cell.
        */
        const cell = keys.join('|')
        if (cell !== covered.current) {
          covered.current = cell
          solids.set(thing.id, keys)
        }
      }
    }

    if (!clips) return

    /*
      A clip a cue asked for, started once and left to finish.

      Not the branch below, which holds an animation on for as long as the rule
      that started it is true: a cue is a moment, and "play the open" means play
      it through, not play it while somebody stands there.
    */
    for (const name of shots.current) {
      const clip = clips[name]
      shots.current.delete(name)
      if (!clip) continue
      // Once, and back to the first frame at the end. Not clamped on the last
      // one, which would mean writing to an action the renderer owns - and a
      // lid that stayed open would then need a second cue to shut it anyway.
      clip.setLoop(THREE.LoopOnce, 1)
      clip.reset().play()
    }

    for (const action of spec.actions) {
      if (action.deed !== 'play' || !action.value) continue
      const clip = clips[action.value]
      if (!clip) continue

      if (active.has('play')) {
        if (!clip.isRunning()) clip.reset().play()
      } else if (clip.isRunning()) {
        clip.stop()
      }
    }
  })

  return (
    <group
      ref={group}
      position={position}
      rotation={rotation}
      scale={scale}
      userData={ghost ? { ignoreRay: true } : undefined}
    >
      {pieces.map((piece, index) => (
        <group
          key={index}
          position={piece.placed.position}
          rotation={piece.placed.rotation}
          scale={piece.placed.scale}
        >
          <primitive object={piece.object} />
        </group>
      ))}

      {/*
        What is on it. Keyed by socket rather than by index, so taking the bun
        out of the middle of three does not renumber the two beside it into each
        other's models - the same argument `Socket` makes at length about names.
      */}
      {carried.map((piece, index) => (
        <group
          key={held[index]?.socket ?? index}
          position={piece.placed.position}
          rotation={piece.placed.rotation}
          scale={piece.placed.scale}
        >
          <primitive object={piece.object} />
        </group>
      ))}

      {ghost && bounds && (
        <CarryBox
          size={bounds.getSize(new THREE.Vector3())}
          centre={bounds.getCenter(new THREE.Vector3())}
          seed={spec.model}
          still={still}
        />
      )}

      {life && !ghost && (
        <ThingBar
          id={thing.id}
          spec={spec}
          life={life}
          /*
            Above the model rather than at a fixed height, because a bar over a
            coin and a bar over a gate are the same bar and only one of them is
            visible if the number is a constant. Measured off the same bounds
            the carry box uses, so the two never disagree about how tall
            something is.
          */
          top={bounds ? bounds.max.y + 0.35 : 1.2}
        />
      )}
    </group>
  )
}

/**
 * The bar over a thing: how hurt it is, or how far through something it is.
 *
 * ---------------------------------------------------------------------------
 * Why this draws itself rather than being told what to draw
 * ---------------------------------------------------------------------------
 * Because it moves every frame and nothing else about the thing does. A bar fed
 * from React would re-render the scene sixty times a second to slide a quad,
 * which is the same argument `SceneRefs` makes about the player's position and
 * the reason `useThingLife` hands out a getter rather than a value.
 *
 * So this reads the machine once a frame, writes a scale and a colour, and
 * allocates nothing. When there is nothing to say it hides itself rather than
 * unmounting - a mount per hit would be a scene graph edit sixty times a second
 * for a crate somebody is punching.
 *
 * ---------------------------------------------------------------------------
 * Two bars, one quad
 * ---------------------------------------------------------------------------
 * Health and progress are drawn in the same place and only one of them may be:
 * a burger that is cooking has no health worth showing, and a crate on its last
 * legs is not waiting for anything. `barOver` settles which, and settles it in
 * `_sim` so that a test can ask rather than a person having to look.
 */
function ThingBar({
  id,
  spec,
  life,
  top,
}: {
  id: string
  spec: BlueprintSpec
  life: (id: string) => Life | undefined
  top: number
}) {
  const group = useRef<THREE.Group>(null)
  const fill = useRef<THREE.Mesh>(null)

  /**
   * Held rather than rebuilt, because a material per frame is a shader compile
   * per frame on the first one and garbage on every one after.
   */
  const paint = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])
  useEffect(() => () => paint.dispose(), [paint])

  useFrame(() => {
    const node = group.current
    const bar = fill.current
    if (!node || !bar) return

    const now = barOver(
      { id, at: { x: 0, y: 0, z: 0 }, states: spec.states, fight: spec.fight, craft: spec.craft },
      life(id),
    )

    node.visible = now !== null
    if (!now) return

    // Grown from the left rather than from the middle, which is what every bar
    // anybody has ever read does - a health bar that shrinks towards its centre
    // reads as two bars.
    bar.scale.x = Math.max(0.001, now.at)
    bar.position.x = -(1 - now.at) / 2

    paint.color.setHex(
      now.kind === 'fill'
        ? 0xffc247
        : // Green while there is room to spare, red once there is not. One
          // threshold rather than a gradient: a colour that drifts is a colour
          // nobody notices changing, and the whole job of this one is to be
          // noticed.
          now.at > 0.3
          ? 0x5ad469
          : 0xe0503a,
    )
  })

  return (
    <group ref={group} position={[0, top, 0]} visible={false}>
      {/* Billboarded by the material rather than by a lookAt, so it costs
          nothing per frame and cannot lag the camera by one. */}
      <mesh>
        <planeGeometry args={[1, 0.11]} />
        <meshBasicMaterial color={0x11141b} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh ref={fill} position={[0, 0, 0.001]} material={paint}>
        <planeGeometry args={[1, 0.08]} />
      </mesh>
    </group>
  )
}

/**
 * The box a thing is carried in.
 *
 * ---------------------------------------------------------------------------
 * Why a box at all
 * ---------------------------------------------------------------------------
 * A translucent model hanging in the air says *what* you are holding and
 * nothing about *where it will land*. The block preview has never had that
 * problem - a block is a cube and the cube is the cell - but a bench is 2.4
 * across and 0.8 deep, and a ghost of a bench does not tell you it will not fit
 * through the door until it does not.
 *
 * So the ghost gets its own bounds drawn round it, measured off the model at
 * the scale it will actually stand at. It is the same measurement the collision
 * uses (`cellsIn`), which is the point: what the box shows is exactly the space
 * the thing is about to take up.
 *
 * ---------------------------------------------------------------------------
 * Why it looks like this
 * ---------------------------------------------------------------------------
 * Dark inside, drawn on the back faces so you look *into* it rather than at it;
 * a slow drift of stars in the volume; and edges that glow and wander through a
 * hue, seeded per pickup so two things being carried are never quite the same
 * colour. It is the sky this world already has - see `lounge-sky` - pulled into
 * a box the size of what you are holding.
 *
 * No shader. Points and lines with additive blending do the whole of it, which
 * costs one draw call each, cannot fail to compile on somebody's phone, and
 * leaves the model inside plainly visible - which is the one thing the box must
 * not get in the way of.
 */
function CarryBox({
  size,
  centre,
  seed,
  still,
}: {
  size: THREE.Vector3
  centre: THREE.Vector3
  /**
   * What the scatter and the hue are drawn from.
   *
   * A *string* - the model's own id - rather than `Math.random()`, and not only
   * because the compiler forbids randomness during a render. A box that
   * re-scattered its stars on every re-render would shimmer whenever anything
   * else in the scene changed, and the hue would jump. Seeded from the model,
   * the same thing picked up twice looks the same both times, and two different
   * things picked up together do not.
   */
  seed: string
  /**
   * Held still, for somebody who has asked for less motion.
   *
   * Held rather than switched off: the box is what says how much room the thing
   * needs and where it will land, and a reader who dislikes movement still
   * needs to be told that. So the stars stop turning and the glow stops
   * breathing, and everything that was *information* stays exactly where it
   * was - which is the same trade the canyon behind the landing page makes.
   */
  still: boolean
}) {
  const edges = useRef<THREE.LineSegments>(null)
  const stars = useRef<THREE.Points>(null)
  const aura = useRef<THREE.Mesh>(null)
  const lamp = useRef<THREE.PointLight>(null)
  const pool = useRef<THREE.Mesh>(null)

  /**
   * A galaxy, as a few hundred points inside the box.
   *
   * Scattered in the box's own space and scaled with it, so a coin gets a
   * pinch of stars and a wall gets a sky. The count is fixed rather than
   * proportional: a thing ten times the size does not want ten times the
   * points, it wants the same handful spread further apart.
   */
  const cloud = useMemo(() => {
    const next = noise(hash(seed))
    const count = 160
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (next() - 0.5) * size.x
      positions[i * 3 + 1] = (next() - 0.5) * size.y
      positions[i * 3 + 2] = (next() - 0.5) * size.z
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geometry
  }, [size, seed])

  const box = useMemo(() => new THREE.BoxGeometry(size.x, size.y, size.z), [size])
  const wire = useMemo(() => new THREE.EdgesGeometry(box), [box])

  /**
   * The aura: a second box just inside the first, lit from within.
   *
   * Slightly smaller so its faces never coincide with the dark shell's - two
   * surfaces at the same depth fight for the pixel and flicker as the camera
   * moves, and the fix is a gap rather than a depth bias, which is a number
   * somebody has to retune per GPU.
   */
  const inner = useMemo(
    () => new THREE.BoxGeometry(size.x * 0.92, size.y * 0.92, size.z * 0.92),
    [size],
  )

  /**
   * And the pool it stands in.
   *
   * Sized to the footprint rather than to the height, because what it says is
   * *this much floor* - the shadow a light would cast if the glow were real.
   */
  const puddle = useMemo(
    () => new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.75, 32),
    [size],
  )

  /** Where in the hue this one starts. Per model, so two things never agree. */
  const phase = useMemo(() => noise(hash(seed))(), [seed])
  /** And where in the breath, off the same stream. */
  const seedPhase = useMemo(() => noise(hash(seed) ^ 0x9e37)(), [seed])
  const hue = useRef(new THREE.Color())
  const clock = useRef(0)

  useFrame((_, delta) => {
    // The clock is what every moving part reads, so freezing it is the whole of
    // the reduced-motion rule here - one place, rather than a branch in each of
    // the four things it drives. The first frame still runs, so the box is lit
    // and coloured rather than black.
    if (!still) clock.current += delta

    // The northlight: a slow wander through the greens and violets this world
    // is already lit by, rather than the whole wheel - a preview that went
    // through red and yellow would stop reading as *this* sky.
    const wave = (Math.sin(clock.current * 0.6 + phase * Math.PI * 2) + 1) / 2
    hue.current.setHSL(0.45 + wave * 0.25, 0.9, 0.6)

    const line = edges.current
    if (line) {
      const material = line.material as THREE.LineBasicMaterial
      material.color.copy(hue.current)
    }

    /**
     * The aura breathes, and the light in it breathes with the same number.
     *
     * One sine driving colour, opacity and intensity together is what makes it
     * read as *one* thing glowing rather than three effects that happen to be
     * in the same place - the failure mode of stacking additive layers.
     */
    const breath = 0.5 + Math.sin(clock.current * 1.4 + seedPhase * Math.PI * 2) * 0.5

    if (aura.current) {
      const material = aura.current.material as THREE.MeshBasicMaterial
      material.color.copy(hue.current)
      material.opacity = 0.06 + breath * 0.07
    }

    if (lamp.current) {
      lamp.current.color.copy(hue.current)
      // Scaled to the box: a lamp tuned for a crate blows out a coin.
      lamp.current.intensity = (0.6 + breath * 0.5) * Math.max(0.4, size.y)
      lamp.current.distance = Math.max(size.x, size.y, size.z) * 2.5
    }

    if (pool.current) {
      const material = pool.current.material as THREE.MeshBasicMaterial
      material.color.copy(hue.current)
      material.opacity = 0.12 + breath * 0.1
    }

    // The stars turn, slowly, about the box's own middle. Slow enough to be
    // movement rather than motion: this is a thing somebody is trying to line
    // up, and a spinning box is a box you cannot judge the edge of.
    if (stars.current && !still) stars.current.rotation.y += delta * 0.08
  })

  return (
    <group position={centre} userData={{ ignoreRay: true }}>
      {/*
        The dark, on the inside faces.

        `BackSide` so the near wall is not drawn between the eye and the model:
        what you see is the far wall behind it, which is what makes the model
        look like it is standing *in* something.
      */}
      <mesh geometry={box} userData={{ ignoreRay: true }}>
        <meshBasicMaterial
          color="#05030f"
          transparent
          opacity={0.5}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/*
        The aura, inside the dark shell and drawn additively so it *adds* light
        rather than tinting what is behind it - the difference between a lit
        volume and a coloured pane of glass.
      */}
      <mesh ref={aura} geometry={inner} userData={{ ignoreRay: true }}>
        <meshBasicMaterial
          transparent
          opacity={0.1}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/*
        A real light, so the *model* is lit by the box it is standing in rather
        than merely surrounded by it. This is the one part that could not be
        faked with another translucent surface: what sells it is the highlight
        moving across the thing's own faces.
      */}
      <pointLight ref={lamp} distance={2} decay={2} />

      {/*
        The pool on the floor. Laid flat at the box's base and lifted a
        millimetre, because a plane exactly on the ground z-fights with it.
      */}
      <mesh
        ref={pool}
        geometry={puddle}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -size.y / 2 + 0.002, 0]}
        userData={{ ignoreRay: true }}
      >
        <meshBasicMaterial
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <points ref={stars} geometry={cloud} userData={{ ignoreRay: true }}>
        <pointsMaterial
          size={0.03}
          sizeAttenuation
          color="#cbd5ff"
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <lineSegments ref={edges} geometry={wire} userData={{ ignoreRay: true }}>
        <lineBasicMaterial
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  )
}

/**
 * A string to a number, and a number to a stream of them.
 *
 * Deterministic on purpose: everything the carry box scatters has to look the
 * same on every render of the same thing, and `Math.random()` in a render is
 * both a shimmer and a thing the React compiler refuses outright.
 *
 * FNV-1a and mulberry32 - two of the shortest well-behaved ones there are, and
 * neither is doing anything clever here. What matters is that the same model id
 * gives the same sky twice.
 */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

function noise(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One thing, wrapped so a missing model cannot take the world down.
 *
 * `useGLTF` suspends and throws on a 404, and a thing whose pack we later drop
 * would otherwise blank the whole canvas. A world missing one bench is a world;
 * a world showing an error boundary is not.
 */
/**
 * One thing failing to load must not take the room.
 *
 * A blueprint outlives the catalogue: `knownModel` checks the pack and builds
 * a path, so an id whose file has moved on parses fine and then throws inside
 * `useGLTF` - and a throw inside a Canvas deletes the whole canvas. The bench
 * met exactly this and grew a boundary per piece (see `Missing` in the
 * composer's stage); this is the room's copy of the same guard, drawing
 * *nothing* where the stage draws a wireframe, because a gap is what this file
 * already shows for a thing whose blueprint has not projected - an absence in
 * a room is ordinary, and a debug marker in one is furniture.
 *
 * Exported for the vehicle rig, which draws the same models off the lattice
 * and would otherwise take the room down with one retired wheel.
 */
export class Undrawable extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function OneThing(props: Parameters<typeof ThingModel>[0]) {
  /*
    Keyed on the models, because a boundary that has caught once stays caught:
    editing the blueprint onto a model that exists is the recovery, and an
    unkeyed boundary would hold the gap over the fixed thing forever.
  */
  const spec = props.spec
  const models = [spec.model, ...(spec.parts ?? []).map((part) => part.model)].join('|')

  return (
    <Undrawable key={models}>
      <Suspense fallback={null}>
        <ThingModel {...props} />
      </Suspense>
    </Undrawable>
  )
}

export function LoungeThings({
  things,
  selectedId,
  carrying,
  hidden,
  solids,
  ground,
  onMoved,
  live,
  fighting = false,
  onKill,
  items,
  onHit,
  onPush,
}: {
  things: ThingView[]
  selectedId: string | null
  /**
   * The thing currently in somebody's hands, if any.
   *
   * Hidden here rather than removed from the list, because it has not gone
   * anywhere - it is being carried, and putting it back down is a move rather
   * than a summon. Without this it is drawn twice: once where it still stands
   * in the log, and once as the ghost under the placement camera, which reads
   * as having accidentally made a second one.
   */
  carrying?: string | null
  /**
   * Things being *driven* right now - yours or a peer's - which are drawn
   * under their driver instead of at their cell. Skipped the way the carried
   * one is, and for the same reason: the thing has not gone anywhere, it is
   * just not standing where the log last wrote it down. Skipping also drops
   * its footprint, which is what stops a kart colliding with its own ghost.
   */
  hidden?: ReadonlySet<string>
  /** Null in a scene with no character controller - the studio, a still. */
  solids: ThingSolids | null
  /** The blocks, so anything with a body can find the floor. See `ThingModel`. */
  ground?: BlockMap | null
  /**
   * Where a loose thing ended up, for whoever can write it down.
   *
   * Absent in a scene with nobody to tell - a still, the showcase - which is
   * also a scene where a ball rolling back to where it started on reload is
   * nobody's problem.
   */
  onMoved?: (id: string, cell: { x: number; y: number; z: number }) => void
  /**
   * The wire the machines talk over, or absent for a scene with nobody in it.
   *
   * Handed down rather than reached for, because the socket it belongs to is
   * `use-things`', which lives outside the Canvas - and the clock that reads it
   * has to live inside one. See `useThingLife`, which is the join.
   */
  live?: Parameters<typeof useThingLife>[0]['live']
  /**
   * Whether hitting things is something that happens here.
   *
   * False in creative mode, where the same E that swings picks the crate up
   * instead - so a crate with fifty health is a crate with fifty health that
   * nobody can touch. The rule `@/domain/thingiverse/fight` states and declines
   * to enforce, kept here because the mode is the room's fact.
   */
  fighting?: boolean
  /**
   * We broke something that had health, and it may be worth a coin.
   *
   * Handed in rather than called from here, because paying is a space's
   * business and this component draws things - the same split `onMoved` keeps.
   * Only reaches the simulation in battle mode: in creative the E that would
   * swing is the E that picks the crate up, so there is nothing to be paid for.
   */
  onKill?: (thingId: string) => void
  /**
   * How to draw an item word, out of the shelf.
   *
   * Handed in rather than looked up here, because the shelf belongs to
   * `use-things` outside the Canvas and this is inside one. Absent in a scene
   * with no shelf to ask - a still, the composer's stage - where a table draws
   * as a table and whatever is on it is not drawn, which is the same shape
   * every other missing-source case in this file takes.
   */
  items?: ReadonlyMap<string, ItemLook>
  /**
   * What a shot costs whoever it was aimed at, when that is us.
   *
   * Passed down to `<ThingShots>` rather than applied here: our own health is
   * `useCombat`'s, which lives outside the Canvas, and the rule that keeps two
   * browsers agreeing is that only the person who was hit may write to it.
   */
  onHit?: (damage: number, from: string) => void
  /** And what a shove from one does to us. See `WeaponSpec.push`. */
  onPush?: (x: number, z: number, lift: number) => void
}) {
  const { playerRef, transformsRef, dashRef, kickRef } = useSceneRefs()
  const { states, held, readLife, takeShots } = useThingLife({
    things,
    live,
    playerRef,
    peersRef: transformsRef,
    dashRef,
    kickRef,
    fighting,
    // Battle mode only. A crate knocked over while somebody is decorating is
    // not a kill, and the room already says so - see `fighting`.
    onKill: fighting ? onKill : undefined,
  })

  return (
    <>
      {/*
        Anything in the air. Outside the per-thing map because a bullet outlives
        the frame it was fired on and belongs to the room rather than to the
        turret - and because a thing that has since been dismissed should not
        take its shot out of the sky with it.
      */}
      <ThingShots
        things={things}
        fired={takeShots}
        conn={live?.conn ?? 'me'}
        /*
          Only where hitting is a thing that happens. In creative mode a turret
          is a turret you can walk up to, which is the same call the rest of the
          fight block makes - see `fighting`.
        */
        onHit={fighting ? onHit : undefined}
        onPush={fighting ? onPush : undefined}
      />

      {things.map((thing) => {
        // A row whose blueprint has not projected yet, or whose space's shelf
        // was rebuilt. Skipped rather than drawn as something else: a grass
        // block standing where somebody's lamp was is worse than a gap.
        if (!thing.blueprint) return null

        // In somebody's hands. The ghost is where it is now.
        if (thing.id === carrying) return null

        // Under somebody. The vehicle rig is where it is now.
        if (hidden?.has(thing.id)) return null

        /*
          Whether it is furniture or something to kick, the instance's answer
          first - the same override the footprint reads, because "is this
          solid" is one question and both of them are asking it.
        */
        const blocking = thing.tuning.blocking ?? thing.blueprint.spec.blocking

        /*
          What the machine has made of it. `lookOf` is the one resolution, in
          the domain, for the reason it says: the composer's stage, the
          thumbnail and the shelf all ask the same question, and a rotation done
          four times is a rotation done two ways eventually.
        */
        const base = thing.blueprint.spec
        const state = base.states?.states.find((one) => one.name === states[thing.id])
        const look = lookOf({ model: base.model, clip: base.clip, blocking }, state)

        // Not there. Still standing where it was, still counted, still running
        // its clock - which is exactly what a respawn needs and what `vanish`
        // cannot give. See `ThingState.hidden`.
        if (look.hidden) return null

        const spec =
          look.model === base.model && look.clip === base.clip
            ? base
            : { ...base, model: look.model, clip: look.clip }

        /*
          What is on it, joined here because this is the one place that has both
          halves: the machine's slots (`held`, out of the hook) and the shelf's
          answer to what a word looks like (`items`, out of the scene).

          A word the shelf has never heard of draws nothing rather than a
          placeholder. That is the same call `resolveSummon` makes and the same
          one every clip name makes: the fix is to draw a blueprint called
          "bun", and a stand-in cube would hide the fact that nobody has.
        */
        const on = held[thing.id]
        const holding =
          on && items && on.length > 0
            ? on.flatMap(([socket, word]) => {
                const look = itemLook(items, word)
                if (!look) return []
                const at = socketsOf(base).find((one) => one.name === socket)
                if (!at) return []
                return [{ socket, model: look.model, at: at.at, turn: at.turn, scale: look.scale }]
              })
            : undefined

        return (
          <OneThing
            key={thing.id}
            spec={spec}
            holding={holding}
            life={readLife}
            thing={thing}
            selected={thing.id === selectedId}
            ground={ground}
            loose={knockable({ body: thing.blueprint.spec.body, blocking })}
            onSettled={onMoved && ((cell) => onMoved(thing.id, cell))}
            solids={
              // The instance's own answer first, then its kind's, then whatever
              // the state it is in says about it - a crate that has been broken
              // open is a crate you can walk through. This is the whole of what
              // `tuning` buys: the same crate is a wall in the corridor and a
              // barrel on the ramp.
              look.blocking ? solids : null
            }
          />
        )
      })}
    </>
  )
}

/**
 * The thing you are holding.
 *
 * Drawn at the cell under the crosshair, which is where a click would put it -
 * the same contract the block preview keeps, and the reason `/thingiverse ball`
 * hands you a ball rather than placing one. Nothing is written down until it is
 * put down.
 */
export function ThingPreview({
  model,
  cell,
  facing,
  scale,
}: {
  model: string
  cell: { x: number; y: number; z: number } | null
  facing: number
  scale: number
}) {
  if (!cell) return null

  return (
    <OneThing
      spec={{
        model,
        scale: 1,
        blocking: false,
        body: null,
        clip: null,
        actions: [],
        tags: [],
        // A preview is a picture of a decision nobody has taken yet: it is not
        // solid, it does not fall, and it is certainly not something you can
        // get into while you are holding it.
        use: null,
      }}
      thing={{ id: 'preview', ...cell, facing, scale }}
      ghost
      solids={null}
    />
  )
}
