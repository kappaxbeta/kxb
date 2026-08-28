'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

import { MOVES } from '../rules/moves'
import { elapsedOf, type Corner, type Fight } from '../rules/fight'
import { frameOf, liftOf, quadOf, type Character } from '../art/sprites'

/**
 * A fighter: one quad, one atlas, and a rectangle of it per frame.
 *
 * ---------------------------------------------------------------------------
 * This is the 2.5D
 * ---------------------------------------------------------------------------
 * The world is three-dimensional - a voxel ring, a perspective camera, real
 * depth behind the ropes - and the fighters are flat. Both of them stand on the
 * same line, both face along it, and the camera never leaves the side. That is
 * the whole trick, and it is a deliberate choice rather than a shortcut: the
 * art is a side-on sprite sheet with no three-quarter frames, so a camera that
 * orbited would show two pieces of card turning edge-on.
 *
 * It is also why the game's geometry is one axis. `@kxb/boxing` has an `x` and
 * nothing else, and every rule in it - reach, separation, the ropes - is a
 * subtraction. A fighting game that has to be *fair* is much easier to make
 * fair in one dimension, and the depth is spent on making it look like
 * somewhere rather than on making it somewhere to walk.
 *
 * ---------------------------------------------------------------------------
 * The texture has to be cloned, and that is not defensive
 * ---------------------------------------------------------------------------
 * `useLoader` caches by URL and hands every caller the same `Texture`. The
 * frame is chosen by writing `offset` on it, so two components sharing one
 * texture is two boxers drawing whatever the last one wrote - and today the two
 * corners use different atlases, so it would work, right up until somebody puts
 * the same fighter in both corners.
 */

export function Boxer({
  fight,
  corner,
  character,
  now,
  floor,
  assets,
}: {
  fight: Fight
  corner: Corner
  character: Character
  /** Where this host serves the package's `assets/` from. No trailing slash. */
  assets: string
  /** The host's clock, read fresh each frame - see `XpHost.now`. */
  now: () => number
  /** Where the canvas is, in metres. */
  floor: number
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)

  const atlas = useLoader(THREE.TextureLoader, `${assets}/${character.atlas}`)

  /**
   * Our own copy of the atlas, set up for pixel art.
   *
   * `NearestFilter` on both, or every frame is a blurred smear - the default
   * linear filter is exactly wrong for art drawn a pixel at a time, and it is
   * the single most common way a sprite sheet ends up looking like a mistake.
   *
   * `ClampToEdgeWrapping` because the offsets below land a rectangle inside a
   * grid, and the default repeat wrap bleeds the opposite edge of the sheet
   * into a frame's border as a one-pixel line of the wrong animation.
   */
  const texture = useMemo(() => {
    const own = atlas.clone()
    own.magFilter = THREE.NearestFilter
    own.minFilter = THREE.NearestFilter
    own.generateMipmaps = false
    own.wrapS = THREE.ClampToEdgeWrapping
    own.wrapT = THREE.ClampToEdgeWrapping
    own.colorSpace = THREE.SRGBColorSpace
    own.needsUpdate = true
    return own
  }, [atlas])

  useEffect(() => () => texture.dispose(), [texture])

  const quad = useMemo(() => quadOf(character), [character])
  const lift = useMemo(() => liftOf(character), [character])

  /** The atlas grid, as fractions of the sheet. Written into `repeat` once. */
  const grid = useMemo(() => {
    const columns = Math.max(...character.clips.map((clip) => clip.frames))
    return { columns, rows: character.clips.length }
  }, [character])

  useEffect(() => {
    texture.repeat.set(1 / grid.columns, 1 / grid.rows)
  }, [texture, grid])

  /**
   * Which alternate is playing, bumped once per move rather than per frame.
   *
   * A counter and not a random number: `frameOf` is handed this, and two
   * clients that disagreed about which glove was out would be two clients
   * drawing different fights. Keyed on `since`, which changes exactly when a
   * move begins - including when it begins because a packet said so.
   */
  const take = useRef(0)
  const lastMove = useRef<{ move: string; since: number }>({ move: '', since: -1 })

  useFrame(() => {
    const boxer = fight[corner]
    const mine = mesh.current
    if (!mine) return

    const seconds = now()

    if (boxer.move !== lastMove.current.move || boxer.since !== lastMove.current.since) {
      if (boxer.move !== lastMove.current.move) take.current += 1
      lastMove.current = { move: boxer.move, since: boxer.since }
    }

    const cell = frameOf(character, boxer.move, elapsedOf(boxer, seconds), take.current)
    texture.offset.set(
      cell.column / grid.columns,
      // Rows are counted from the top of the sheet and UVs from the bottom.
      // Getting this backwards draws the whole fight upside down in the
      // animation list - a boxer who celebrates when hit - and looks like a
      // logic bug rather than an axis.
      1 - (cell.row + 1) / grid.rows,
    )

    /**
     * Which way they are looking.
     *
     * A negative x scale, which mirrors the quad. The alternative - two sets of
     * art - is what the pack does not ship, and mirroring a side-on boxer is
     * exactly right: the only asymmetry in the drawing is which hand leads,
     * and that swaps too, which is what you want when they turn round.
     */
    const facing = fight[corner].x <= fight[corner === 'red' ? 'blue' : 'red'].x ? 1 : -1
    mine.scale.x = facing
    mine.position.x = boxer.x
    mine.position.y = floor + lift

    // Kept even though `depthTest` is off and `renderOrder` now settles who is
    // in front: the centimetre costs nothing and it is what keeps the two of
    // them from sharing a plane if the depth test is ever turned back on.
    mine.position.z = corner === 'red' ? 0.01 : -0.01

    // Out cold, and the sprite says so on its own. Nothing else to draw.
    if (material.current) {
      material.current.opacity = boxer.move === 'out' ? 0.85 : 1
    }
  })

  return (
    /**
     * Drawn last, and over everything.
     *
     * `renderOrder` plus `depthTest: false` on the material below. The reason is
     * the near ropes: a fighter stands at the centre of the ring and the near
     * side of it is between them and the camera, so an honest depth test draws
     * four white bars across both boxers - one of them exactly at neck height.
     * It looked like the sprites were being torn in half, and it was the ropes.
     *
     * The alternative is a camera high enough to see over the top rope, which
     * works and costs the whole shot: from up there you are looking down at the
     * canvas, and side-on sprites viewed from above read as cardboard.
     *
     * **What it gives up.** Nothing in the ring can ever occlude a fighter, so a
     * boxer knocked into the near ropes draws in front of them rather than
     * behind. That is wrong and it is invisible - the fighters are the only
     * thing in this scene that is *inside* the ring, so the only geometry that
     * could correctly cover them is the geometry this is deliberately ignoring.
     */
    <mesh ref={mesh} renderOrder={corner === 'red' ? 11 : 10} position={[fight[corner].x, floor + lift, 0]}>
      <planeGeometry args={[quad.width, quad.height]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        /**
         * `alphaTest` as well as `transparent`, and the number matters.
         *
         * Transparent meshes are not written to the depth buffer, so two
         * fighters and a set of ropes sort by draw order and get it wrong from
         * some angles. An alpha test puts the opaque pixels back in the depth
         * buffer where they belong, and 0.5 is above the fringe of nearly
         * transparent pixels the pack exports around each figure - the same
         * fringe `--measure` steps over.
         */
        alphaTest={0.5}
        side={THREE.DoubleSide}
        /**
         * See the `renderOrder` note above. With the depth test off, draw order
         * decides who is in front, which is why `renderOrder` is per corner and
         * fixed rather than sorted by position: a clinch where the two of them
         * swap depth every frame would flicker, and "the red corner is nearer"
         * is a convention a player reads once and then stops noticing.
         */
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  )
}

/**
 * The shadow a fighter casts, as a dark ellipse on the canvas.
 *
 * Not a real shadow: the fighter is a flat quad, so a shadow map would draw a
 * rectangle. This is the oldest trick there is and it does the one job a
 * shadow does in a game - saying where on the floor somebody is standing -
 * which for two sprites on a line is most of the depth cue there is.
 */
export function Footprint({
  fight,
  corner,
  floor,
}: {
  fight: Fight
  corner: Corner
  floor: number
}) {
  const mesh = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const mine = mesh.current
    if (!mine) return
    const boxer = fight[corner]
    mine.position.x = boxer.x
    // Smaller while they are off their feet, which is the only vertical
    // movement in this game and would otherwise be invisible from the side.
    const airborne = boxer.move === 'down' || boxer.move === 'out'
    mine.scale.setScalar(airborne ? 1.45 : 1)
    const material = mine.material as THREE.MeshBasicMaterial
    material.opacity = airborne ? 0.18 : 0.32
  })

  return (
    <mesh
      ref={mesh}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[fight[corner].x, floor + 0.012, 0]}
    >
      <circleGeometry args={[0.42, 24]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
    </mesh>
  )
}

/** Named for the HUD, so a bar and a boxer cannot disagree about which is which. */
export const cornerColour: Record<Corner, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
}

/** Which way a fighter is looking, for anything outside the mesh that needs it. */
export function facingIn(fight: Fight, corner: Corner): 1 | -1 {
  return fight[corner].x <= fight[corner === 'red' ? 'blue' : 'red'].x ? 1 : -1
}

/** Re-exported so the ring can size the camera without importing the rules twice. */
export { MOVES }
