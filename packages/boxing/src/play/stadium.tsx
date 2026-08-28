'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useLoader, useStore } from '@react-three/fiber'
import * as THREE from 'three'
import { MTLLoader, OBJLoader } from 'three-stdlib'

import { RING_HALF } from '../rules/fight'

/**
 * The arena: a voxel ring, lit, with a crowd of empty seats behind it.
 *
 * ---------------------------------------------------------------------------
 * Loaded as OBJ rather than converted to glTF
 * ---------------------------------------------------------------------------
 * The rest of the app's art is `.glb`, measured into `@kxb/xp/catalogue` and
 * fetched by id. None of that machinery applies here: this game is not an XP
 * and its five models are not placeable, so the catalogue would be carrying a
 * boxing ring nobody can place for the benefit of nobody.
 *
 * What is left is a straight trade. glTF is smaller and loads faster; OBJ is
 * what the pack ships and needs no conversion step to go stale. At 180KB for
 * the ring and a 256x1 palette texture the size argument is not worth a build
 * step, so the pack's own format wins. If the arena ever grows past a handful
 * of pieces this is the first thing to revisit.
 *
 * ---------------------------------------------------------------------------
 * The scale comes from the rules, not the other way round
 * ---------------------------------------------------------------------------
 * `RING_HALF` says how far a fighter may walk. The model's canvas - the flat
 * inside the ropes - is `CANVAS_UNITS` across in the units MagicaVoxel exported.
 * Dividing one by the other is the scale, so a change to the rules moves the
 * ropes rather than leaving a fighter walking through them.
 *
 * The alternative, which was the first draft, is a hand-tuned `scale={0.8}`
 * that is right until somebody widens the ring by a metre and does not think to
 * look in a renderer for the reason their fighter now clips the ropes.
 */

/**
 * The canvas, in the model's own units, measured off the mesh.
 *
 * `awk` over `RING.obj`: the widest flat run of vertices below the ropes spans
 * x 1.3 to 8.5. The apron and the posts are outside it and are not somewhere a
 * fighter stands.
 */
const CANVAS_UNITS = 7.2

/** Model units from the platform's underside to the top of the mat. */
const MAT_UNITS = 0.4

/** Breathing room between the ropes and the furthest a fighter may walk. */
const MARGIN = 0.15

const SCALE = (RING_HALF + MARGIN) / (CANVAS_UNITS / 2)

/** Where the fighters stand, in metres. Everything else is placed off this. */
export const FLOOR = MAT_UNITS * SCALE

/**
 * How far forward the ring is drawn before it starts being in the way.
 *
 * ---------------------------------------------------------------------------
 * The near ropes are the shot's only real problem
 * ---------------------------------------------------------------------------
 * A ring is a box you stand *inside*, so any camera outside it looks through
 * one wall of rope to see the fight. At this height the second and third ropes
 * cross both fighters at the neck and the knee - it reads as the sprites being
 * torn rather than as ropes, which is the worst kind of visual bug: it looks
 * like the renderer is broken.
 *
 * Two things do not fix it. Raising the camera above the top rope puts you five
 * metres up looking down at the canvas, and side-on sprites seen from above are
 * cardboard. Drawing the fighters over the top of everything works and is a
 * lie that shows the moment anything else needs to be in front of them.
 *
 * So the near ropes are simply not drawn. This is what a television camera
 * achieves by being level with the ring and a long way back, and what a
 * broadcast director achieves by cutting to the side the action is not on -
 * and what a 2.5D game achieves by deleting the wall between you and the
 * fight, which is the oldest trick in the genre.
 *
 * The *mat* in front is still drawn: it is below the fighters and it is what
 * they stand on. See `Ring` for how the two halves are cut.
 */
const NEAR_CUT = 2.6

/**
 * One voxel model, centred on the ring and scaled with it.
 *
 * MagicaVoxel exports with the origin at a corner rather than the centre, so
 * every piece needs the same recentring - which is why this is a component and
 * not five `<primitive>` tags.
 */
function Piece({
  assets,
  name,
  position = [0, 0, 0],
  rotation = 0,
  scale = SCALE,
  clip,
}: {
  assets: string
  name: string
  position?: [number, number, number]
  rotation?: number
  scale?: number
  /**
   * Planes this copy is cut by, in world space. Everything on the *negative*
   * side of every plane is discarded, which is three.js's convention and worth
   * stating because getting the sign backwards leaves you with only the piece
   * you meant to remove.
   */
  clip?: THREE.Plane[]
}) {
  const materials = useLoader(MTLLoader, `${assets}/stadium/${name}.mtl`, (loader) => {
    // Where `map_Kd RING.png` is resolved from. Without it the browser looks
    // beside the *page* - `/boxing/RING.png` - gets a 404, and three treats a
    // texture that failed to load as no texture at all: the ring draws in flat
    // white with nothing logged. The build script rewrites these names, so the
    // failure would only appear once, in production, on a model that worked.
    ;(loader as MTLLoader).setResourcePath(`${assets}/stadium/`)
  })

  const object = useLoader(OBJLoader, `${assets}/stadium/${name}.obj`, (loader) => {
    materials.preload()
    ;(loader as OBJLoader).setMaterials(materials)
  })

  /**
   * Our own copy, recentred and filtered.
   *
   * `useLoader` caches by URL, so two `<Piece name="SEAT">` are the same object
   * three times over - and adding one to the scene graph twice moves it rather
   * than duplicating it. `clone()` is what makes a crowd possible.
   */
  const model = useMemo(() => {
    const own = object.clone(true)

    const box = new THREE.Box3().setFromObject(own)
    const centre = box.getCenter(new THREE.Vector3())
    own.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry = child.geometry.clone()

      /**
       * Materials have to be cloned too, and `Object3D.clone` does not.
       *
       * It clones the graph and *shares* the materials, which is normally what
       * you want and is exactly wrong here: the ring is drawn twice with two
       * different sets of clipping planes, and sharing one material means the
       * second assignment silently wins for both. The symptom is half a ring
       * and no error.
       */
      if (clip) {
        child.material = Array.isArray(child.material)
          ? child.material.map((one) => one.clone())
          : (child.material as THREE.Material).clone()
      }
      // Centre on x and z, and put the model's base at y = 0. Not centred on y:
      // things stand on a floor, and a piece centred vertically is a piece
      // half-buried in it.
      child.geometry.translate(-centre.x, -box.min.y, -centre.z)

      const material = child.material as THREE.Material | THREE.Material[]
      for (const one of Array.isArray(material) ? material : [material]) {
        if (clip) {
          one.clippingPlanes = clip
          // Every plane has to pass, which is what makes "near *and* above the
          // mat" expressible at all - a single plane can only ever cut a
          // half-space, and the region being removed here is a corner.
          one.clipIntersection = false
          one.needsUpdate = true
        }
        const map = (one as THREE.MeshPhongMaterial).map
        if (!map) continue
        // The palette is a 256x1 strip and every voxel samples one texel of it.
        // Linear filtering blends neighbouring palette entries, which puts a
        // seam of the wrong colour along every edge between two colours - the
        // classic way voxel art comes out looking dirty.
        map.magFilter = THREE.NearestFilter
        map.minFilter = THREE.NearestFilter
        map.generateMipmaps = false
        map.colorSpace = THREE.SRGBColorSpace
        map.needsUpdate = true
      }
    })

    return own
  }, [object, clip])

  return (
    <primitive
      object={model}
      position={position}
      rotation={[0, rotation, 0]}
      scale={scale}
    />
  )
}

/**
 * Turn local clipping on, on the renderer itself.
 *
 * ---------------------------------------------------------------------------
 * Not through the `gl` prop, and the difference is a whole missing ring
 * ---------------------------------------------------------------------------
 * `localClippingEnabled` is a *property of the renderer*, not one of the options
 * its constructor takes. Passing it in `<Canvas gl={{...}}>` works only because
 * R3F copies unknown keys onto the instance afterwards - a convention rather
 * than a contract, and one that does nothing if the renderer was already made or
 * if a future version stops copying.
 *
 * When it silently does nothing, every `clippingPlanes` below is ignored and the
 * ring draws whole: the near ropes and the dark apron come back in front of the
 * fight, which reads as the mat having turned black.
 */
function Clipping() {
  /**
   * Through the store rather than `useThree(s => s.gl)`.
   *
   * The renderer is a value React's compiler hands out and considers frozen, so
   * assigning to a property of it is an error it refuses to compile - correctly,
   * in general. Reaching it through `getState()` inside the effect is the same
   * object and says plainly that this is an imperative escape into a long-lived
   * instance rather than a render-time mutation.
   */
  const store = useStore()
  useEffect(() => {
    store.getState().gl.localClippingEnabled = true
  }, [store])
  return null
}

/**
 * The ring, in two halves, so the near ropes can be missing and the near mat
 * cannot.
 *
 * Cut rather than filtered by mesh name: the pack exports the whole ring as one
 * object with one material, so there is no "ropes" node to hide. A clipping
 * plane works on the geometry itself and needs to know nothing about how the
 * model was authored - which also means it keeps working if the pack is
 * re-exported.
 */
function Ring({ assets }: { assets: string }) {
  const halves = useMemo(() => {
    // Keep everything behind the cut: the far ropes, the posts, both far
    // corners, and the whole mat back there.
    const back = [new THREE.Plane(new THREE.Vector3(0, 0, -1), NEAR_CUT)]
    // And in front of the cut, keep only what is at or below the mat - the
    // canvas the fighters stand on and the apron under it.
    const front = [
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -NEAR_CUT),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), FLOOR + 0.02),
    ]
    return { back, front }
  }, [])

  return (
    <>
      <Piece assets={assets} name="RING" clip={halves.back} />
      <Piece assets={assets} name="RING" clip={halves.front} />
    </>
  )
}

/**
 * The seats: two banks of blocks well behind the ring, in one draw call.
 *
 * ---------------------------------------------------------------------------
 * Instanced, and the first version only said it was
 * ---------------------------------------------------------------------------
 * The comment here used to claim "coloured boxes at that distance do it for one
 * draw call" over code that rendered `seats.map(...)` into **260 separate
 * meshes**. Two hundred and sixty draw calls for scenery nobody looks at, and
 * the comment was describing the intention rather than the code.
 *
 * On a GPU that is merely wasteful. In software rendering it is fatal, and the
 * way it failed is worth writing down: the frame loop dropped to about four
 * frames a second, and because this game advances its match clock by `dt` per
 * frame with `dt` capped at 50ms, **the round clock ran at a fifteenth of real
 * time**. A three-second walkout took forty-five seconds. Nothing looked broken
 * - both fighters were connected, both agreed, the clock was counting - it was
 * simply counting far too slowly to look like anything but a hang.
 *
 * One `InstancedMesh` is one geometry, one material, one call, and a matrix per
 * seat written once on mount.
 */
function Crowd() {
  const rows = 5
  const perRow = 26
  const count = rows * perRow * 2

  const mesh = useRef<THREE.InstancedMesh>(null)

  /**
   * Written once, in an effect rather than during render.
   *
   * `setMatrixAt` mutates the instance, which is exactly the kind of thing that
   * must not happen while rendering - and the seats never move, so there is no
   * reason for it to happen again.
   */
  useEffect(() => {
    const instances = mesh.current
    if (!instances) return

    const at = new THREE.Object3D()
    const tint = new THREE.Color()
    let index = 0

    for (let row = 0; row < rows; row++) {
      for (let seat = 0; seat < perRow; seat++) {
        const x = (seat - (perRow - 1) / 2) * 0.62
        // A slight rake, so the back rows are visible over the front ones.
        const y = 0.1 + row * 0.34
        for (const side of [-1, 1]) {
          at.position.set(x, y, side * (7.4 + row * 0.75))
          at.updateMatrix()
          instances.setMatrixAt(index, at.matrix)
          // Three colours in a fixed pattern rather than at random: a crowd is
          // scenery, and scenery that differs between two clients is two people
          // looking at different rooms.
          tint.set((row + seat) % 3 === 0 ? '#1e3a5f' : seat % 2 === 0 ? '#2a2f3a' : '#3a2a2f')
          instances.setColorAt(index, tint)
          index += 1
        }
      }
    }

    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.42, 0.5, 0.42]} />
      <meshLambertMaterial />
    </instancedMesh>
  )
}

export function Stadium({
  assets,
  transparent = false,
}: {
  assets: string
  /**
   * Leave out the ground plane, because something else is behind this.
   *
   * The 80m plane is what stops an opaque frame looking like a ring floating in
   * space. In a transparent one it is the opposite: a black rectangle painted
   * over whatever page the game was embedded in, which is the exact hole the
   * transparency was for. The crowd and the ring stay - they are the arena; the
   * plane is only a backdrop.
   */
  transparent?: boolean
}) {
  return (
    <group>
      <Clipping />
      <Ring assets={assets} />

      {/*
        The four lamps that make it a fight and not a rehearsal.

        Placed above the corners rather than dead centre, which is where a real
        rig hangs them: a single overhead light puts both fighters in their own
        shadow, and the sprites are unlit anyway - what these are actually for
        is lighting the *ring*, whose ropes and posts are the only thing in the
        scene with real geometry to catch them.
      */}
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Piece
            key={`${x}:${z}`}
            assets={assets}
            name="LIGHT"
            position={[x * 3.4, 6.2, z * 3.4]}
            rotation={Math.atan2(-x, -z)}
            scale={SCALE * 1.4}
          />
        )),
      )}

      <Crowd />

      {/*
        The floor the ring stands on. Big, flat, and dark enough that the ring
        reads as lit rather than as a model on a plane - and left out entirely
        when the frame is transparent, see the prop.
      */}
      {transparent ? null : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshLambertMaterial color="#0a0a0c" />
        </mesh>
      )}
    </group>
  )
}

/**
 * The light, which is most of what makes a voxel model look like a place.
 *
 * Four spots over the corners would be truthful and cost four shadow maps for a
 * scene whose two main characters are unlit quads. This is the cheap version of
 * the same picture: a warm key from above and in front, a cold fill from
 * behind, and enough ambient that the ring's dark side is not black.
 */
export function Lights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#8899bb', '#221a1a', 0.5]} />
      <directionalLight position={[4, 9, 6]} intensity={1.5} color="#fff4e0" />
      <directionalLight position={[-5, 6, -6]} intensity={0.6} color="#7aa2ff" />
      {/* Straight down onto the canvas, so the mat is the brightest thing on screen. */}
      <spotLight
        position={[0, 8.5, 0]}
        angle={0.75}
        penumbra={0.6}
        intensity={45}
        distance={22}
        color="#ffffff"
      />
    </>
  )
}
