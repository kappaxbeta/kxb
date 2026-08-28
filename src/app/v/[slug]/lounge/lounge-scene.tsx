'use client'

import { Cloud, Clouds, Grid, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRouter } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import * as THREE from 'three'
import {
  BlockPicker,
  SelectedBlockChip,
} from '@/app/world/lounge/_hud/block-picker'
import {
  HoldButton,
  Joystick,
  type LookDelta,
  type MoveInput,
  useIsTouch,
  useLookDrag,
} from '@/app/world/lounge/_hud/touch-controls'
import { CLOUD_TEXTURE } from '@/app/world/_canvas/cloud-texture'
import { useHand } from '@/lib/controls/use-hand'
import { usePreloadedBlocks } from '@/app/world/lounge/_hooks/block-preload'
import { BlockPlaceholders } from '@/app/world/_canvas/rainbow'
import { useEditBuffer } from '@/app/world/lounge/_hooks/use-edit-buffer'
import { applyWorldTemplate, generateFloor } from '@/domain/lounge/actions'
import { blockKey, DEFAULT_WORLD_SIZE, WORLD_HEIGHT } from '@/domain/lounge/events'
import { DEFAULT_GROUND_MODEL, DEFAULT_MODEL, modelUrl } from '@/domain/lounge/palette'
import type { BlockView } from '@/domain/lounge/queries'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Creative-mode building on a 1x1x1 grid, in a cosmic void.
 *
 * The whole scene is driven by one `Map<"x,y,z", model>`. Rendering groups that
 * map by model and draws each group as a single InstancedMesh - the difference
 * between a few dozen draw calls and one per block, which is what separates a
 * playable world from a slideshow at a few thousand blocks.
 */

/**
 * Scratch objects, allocated once.
 *
 * The targeting and movement code both run every frame. Allocating vectors per
 * frame hands the garbage collector a few hundred short-lived objects a second,
 * which shows up as periodic stutter. There is only ever one player.
 */
const FORWARD = new THREE.Vector3()
const RIGHT = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const SCREEN_CENTRE = new THREE.Vector2(0, 0)

/** How far you can reach, in blocks. Minecraft uses about five. */
const REACH = 8

/**
 * The bb10 pack is authored at 2 units per block, centred on the origin - every
 * model's POSITION accessor runs from -1 to +1. The world grid is 1 unit per
 * cell, so everything has to be halved to sit 1:1 in a cell.
 *
 * Measured from the glTF accessors rather than eyeballed: `glass` and `wood`
 * are exactly 2.0, which is the pack's canonical cube.
 *
 * Deliberately a single constant rather than per-model normalisation. Several
 * models overshoot slightly on purpose - dirt_with_grass is 2.166 wide because
 * its grass tufts overhang the cube, and anvil is 2.31 deep - and scaling each
 * model to its own bounding box would shrink exactly those details away, so a
 * grass block would end up visibly smaller than the glass block beside it.
 * Uniform scaling keeps the pack's proportions and lets the overhangs overhang,
 * which is what they were modelled to do.
 */
const BLOCK_SCALE = 0.5

/**
 * Camera height above whatever you are standing on, in blocks.
 *
 * Minecraft puts the eye at about 1.62. Slightly higher here because there is
 * no walking bob or collision to sell the scale, and a lower eye in a flying
 * camera reads as crouching.
 */
const EYE_HEIGHT = 1.7

type Cell = { x: number; y: number; z: number }
type BlockMap = Map<string, { x: number; y: number; z: number; model: string }>

/**
 * What the crosshair is currently on.
 *
 * `hit` is the block you would break; `place` is the empty cell you would fill.
 * Both are null when you are staring into space.
 */
interface Target {
  hit: Cell | null
  place: Cell | null
}

const NO_TARGET: Target = { hit: null, place: null }

function toBlockMap(blocks: BlockView[]): BlockMap {
  const map: BlockMap = new Map()
  for (const block of blocks) {
    map.set(blockKey(block.x, block.y, block.z), block)
  }
  return map
}

export function LoungeScene({
  slug,
  initialBlocks,
  readOnly,
  isOwner,
}: {
  slug: string
  initialBlocks: BlockView[]
  readOnly: boolean
  /** Resetting wipes every member's work, so it is the owner's call alone. */
  isOwner: boolean
}) {
  const t = worldDict(useLocale())
  const [blocks, setBlocks] = useState<BlockMap>(() => toBlockMap(initialBlocks))

  /**
   * Fetch the world's models now rather than when the canvas asks.
   *
   * This page more than the member one: whoever opens it is a visitor who came
   * from a link, and the first thing they are owed is the place rendering.
   */
  usePreloadedBlocks(
    useMemo(() => initialBlocks.map((block) => block.model), [initialBlocks]),
  )
  const [selected, setSelected] = useState<string>(DEFAULT_MODEL)
  const [locked, setLocked] = useState(false)
  const [target, setTarget] = useState<Target>(NO_TARGET)

  const isTouch = useIsTouch()
  /* Which way round the touch rig goes. Shared with the workspace lounge, so a
     visitor who set it there is not asked again here. */
  const { hand } = useHand()
  // Touch has no pointer lock to be "in", so entering is just a flag. `active`
  // is what the HUD keys off, so the rest of the UI does not care which it was.
  const [touchActive, setTouchActive] = useState(false)
  const active = locked || touchActive

  // Continuous input lives in refs, not state: the thumbstick updates dozens of
  // times a second and is consumed inside the frame loop, so routing it through
  // React would re-render the scene continuously to deliver a number the loop
  // was going to read anyway.
  const moveRef = useRef<MoveInput>({
    forward: 0,
    strafe: 0,
    vertical: 0,
    sprint: false,
  })
  const lookRef = useRef<LookDelta>({ dx: 0, dy: 0 })

  const lookDrag = useLookDrag(lookRef, isTouch && touchActive)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [resetting, startReset] = useTransition()
  const router = useRouter()

  /**
   * Wipe the world and lay one of the catalogue's templates in it.
   *
   * Clears local state immediately so the old world does not linger while the
   * clear-and-lay runs server-side, then refreshes to pull the new world
   * down. Not optimistic: a whole world is not something to invent client-side
   * and hope the server agrees.
   */
  function handleTemplate(templateId: string) {
    setPickerOpen(false)
    startReset(async () => {
      const result = await applyWorldTemplate(slug, templateId)
      if (result.ok) {
        setBlocks(new Map())
        router.refresh()
      }
    })
  }

  /**
   * E opens the picker, Escape closes it.
   *
   * Opening releases pointer lock, which is what Minecraft does and what makes
   * the rest work: the place/break handler only fires while the pointer is
   * locked, so letting go of the mouse also disarms building. No extra guard
   * needed.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'KeyE') {
        event.preventDefault()
        setPickerOpen((current) => {
          if (!current && document.pointerLockElement) document.exitPointerLock()
          return !current
        })
      } else if (event.code === 'Escape') {
        setPickerOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // The click handler needs the *current* target without re-subscribing a DOM
  // listener every time the crosshair moves, which is many times a second.
  // `selected` is not in the same boat - it changes only when someone clicks
  // the palette, so it can just be a dependency below.
  const targetRef = useRef<Target>(NO_TARGET)

  const { queuePlace, queueRemove, pending, error, saving } = useEditBuffer(slug)

  const place = useCallback(
    (cell: Cell, model: string) => {
      if (readOnly) return
      if (cell.y < 0 || cell.y >= WORLD_HEIGHT) return

      const key = blockKey(cell.x, cell.y, cell.z)
      setBlocks((current) => {
        if (current.get(key)?.model === model) return current
        const next = new Map(current)
        next.set(key, { ...cell, model })
        return next
      })
      queuePlace({ ...cell, model })
    },
    [queuePlace, readOnly],
  )

  const remove = useCallback(
    (cell: Cell) => {
      if (readOnly) return

      const key = blockKey(cell.x, cell.y, cell.z)
      setBlocks((current) => {
        if (!current.has(key)) return current
        const next = new Map(current)
        next.delete(key)
        return next
      })
      queueRemove(cell)
    },
    [queueRemove, readOnly],
  )

  const onTarget = useCallback((next: Target) => {
    targetRef.current = next
    setTarget(next)
  }, [])

  // Clicks come from the document, not from the canvas. Under pointer lock the
  // cursor does not move, so react-three-fiber's pointer events never fire -
  // the crosshair is the cursor, and the ray is cast from screen centre.
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (!document.pointerLockElement) return
      event.preventDefault()

      const current = targetRef.current
      if (event.button === 0 && current.hit) {
        remove(current.hit)
      } else if (event.button === 2 && current.place) {
        place(current.place, selected)
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [place, remove, selected])

  const grouped = useMemo(() => {
    const groups = new Map<string, Cell[]>()
    for (const block of blocks.values()) {
      const bucket = groups.get(block.model)
      if (bucket) bucket.push(block)
      else groups.set(block.model, [block])
    }
    return groups
  }, [blocks])

  /**
   * Where the player starts: standing on the ground at the origin.
   *
   * Derived from the world rather than hardcoded, because "the ground" is not a
   * fixed height. On an empty lounge it is the y=0 plane; on a generated floor
   * the blocks occupy y=0 (spanning 0..1) so the walkable surface is y=1; if
   * someone has built a tower at the origin you spawn on top of it rather than
   * inside it.
   *
   * Computed from `initialBlocks` and not from live `blocks` on purpose - this
   * feeds the Canvas camera prop, which only applies on mount. Recomputing it
   * as people build would be dead state that looks like it does something.
   */
  const spawn = useMemo<[number, number, number]>(() => {
    let surface = 0
    for (const block of initialBlocks) {
      // The four cells that touch the world origin. A generated floor is an
      // even number of blocks wide, so its centre is the corner where those
      // four meet rather than the middle of any one of them - and standing on
      // that corner is what "centred" actually means here.
      //
      // Scoped to those four on purpose: scanning the whole world for its
      // highest block would launch you into the sky off someone's tower.
      const touchesOrigin =
        (block.x === 0 || block.x === -1) && (block.z === 0 || block.z === -1)

      if (touchesOrigin && block.y + 1 > surface) {
        surface = block.y + 1
      }
    }
    return [0, surface + EYE_HEIGHT, 0]
  }, [initialBlocks])

  return (
    <div className="relative h-[calc(100vh-9rem)] w-full">
      {/*
        The dream framing. A radial mask feathers the canvas out to nothing at
        the edges instead of ending on a hard rectangle, which is what makes it
        read as a vision rather than a viewport. Done in CSS because a
        post-processing pass would mean another renderer dependency for an
        effect that is, in the end, a soft-edged oval.
      */}
      <div
        className="absolute inset-0 touch-none overflow-hidden rounded-[3rem] bg-[#f6f3ff]"
        {...(isTouch ? lookDrag : {})}
        style={{
          maskImage:
            'radial-gradient(ellipse 78% 78% at 50% 50%, black 55%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 78% 78% at 50% 50%, black 55%, transparent 100%)',
        }}
      >
        {/* No rotation set, so the camera starts looking level along -Z rather
            than angled down at the floor it is standing on. */}
        <Canvas shadows="percentage" camera={{ position: spawn, fov: 70, far: 600 }}>
          <color attach="background" args={['#f6f3ff']} />
          {/*
            Fog tuned to the same colour as the background, which is what makes
            distance read as haze rather than as a fade-to-grey. Denser than a
            normal scene would want: the point is that things dissolve close in,
            so the world feels like it is sitting inside a cloud rather than in
            front of a backdrop.
          */}
          <fogExp2 attach="fog" args={['#f6f3ff', 0.026]} />

          {/*
            Volumetric clouds, layered at different heights and drifting at
            different speeds. The parallax between layers is what stops it
            reading as wallpaper - without it, soft white in every direction is
            just an empty background.

            These are billboarded sprites, so they are cheap, and they are
            invisible to the targeting raycast: the loop in <Targeting> only
            recognises the ground and instanced blocks, and skips anything else
            it hits.
          */}
          <Clouds material={THREE.MeshBasicMaterial} texture={CLOUD_TEXTURE}>
            <Cloud
              segments={48}
              bounds={[90, 10, 90]}
              volume={44}
              opacity={0.5}
              color="#ffffff"
              speed={0.12}
              position={[0, 30, 0]}
            />
            <Cloud
              segments={36}
              bounds={[110, 8, 110]}
              volume={38}
              opacity={0.34}
              color="#ede9ff"
              speed={0.08}
              position={[-20, 14, -30]}
            />
            <Cloud
              segments={28}
              bounds={[120, 6, 120]}
              volume={30}
              opacity={0.26}
              color="#fdf2ff"
              speed={0.05}
              position={[30, 4, 25]}
            />
          </Clouds>

          {/* Bright and almost shadowless. A key light this soft leaves the
              blocks lit from every side, which is what keeps the scene from
              acquiring the hard contrast that would break the daydream. */}
          <ambientLight intensity={1.5} color="#ffffff" />
          <hemisphereLight args={['#ffffff', '#d9d0ff', 1.1]} />
          <directionalLight
            position={[30, 50, 20]}
            intensity={1.5}
            color="#fffdf7"
            castShadow
          />
          <pointLight position={[-30, 20, -20]} intensity={140} color="#e9d5ff" distance={160} />
          <pointLight position={[30, 14, 25]} intensity={120} color="#cffafe" distance={160} />

          {/*
            One boundary per model rather than one around all of them, so the
            world materialises model by model as each glTF lands. The fallback
            is the same cells drawn as rainbow glass - a visitor who arrives on
            a slow connection sees the shape of the place immediately, and this
            page is the one where a first impression is the whole point.
          */}
          {[...grouped.entries()].map(([model, positions]) => (
            <Suspense key={model} fallback={<BlockPlaceholders positions={positions} />}>
              <BlockInstances model={model} positions={positions} />
            </Suspense>
          ))}

          <CosmicGround />
          <Targeting onTarget={onTarget} />
          {!readOnly && <Preview target={target} />}
          <FlyControls
            onLockChange={setLocked}
            moveRef={moveRef}
            lookRef={lookRef}
            pointerLock={!isTouch}
          />
        </Canvas>
      </div>

      {/* Vignette on top of the mask. Now white rather than black: the mask
          fades the canvas to transparent, and this blooms the remaining edge
          outward so the scene looks like it is dissolving into light instead of
          ending at a border. */}
      <div className="pointer-events-none absolute inset-0 rounded-[3rem] shadow-[inset_0_0_150px_70px_rgba(255,255,255,0.92)]" />

      <Hud
        locked={active}
        readOnly={readOnly}
        blockCount={blocks.size}
        pending={pending}
        saving={saving}
        error={error}
        hasTarget={target.hit !== null || target.place !== null}
        slug={slug}
        isTouch={isTouch}
        onEnterTouch={() => setTouchActive(true)}
        selected={selected}
        onOpenPicker={() => {
          if (document.pointerLockElement) document.exitPointerLock()
          setPickerOpen(true)
        }}
      />

      <BlockPicker
        open={pickerOpen}
        selected={selected}
        onSelect={setSelected}
        onClose={() => setPickerOpen(false)}
        resetting={resetting}
        templates={
          readOnly || !isOwner
            ? undefined
            : { onApply: handleTemplate, busy: resetting }
        }
      />

      {/*
        Touch controls sit outside the Hud because they need `place`, `remove`
        and the live target - and because they are input, not display.

        Place and break are buttons rather than gestures. Tap-to-place plus
        hold-to-break is what Minecraft does, but it competes with drag-to-look
        for the same finger on the same surface, and disambiguating by duration
        makes both feel unreliable. Explicit buttons cost two thumbs' worth of
        screen and are never ambiguous.
      */}
      {/*
        Not gated on `readOnly`. This page always passes it as true - every visitor
        to the showcase is read-only by definition - so gating movement on it meant a
        visitor on a phone could look around and never walk anywhere. Only the two
        editing buttons below are a permission question; the joystick is how you get
        across the room, and flying is what a read-only visitor does here instead of
        building.
      */}
      {isTouch && touchActive && (
        <>
          <Joystick
            /* Mirrored for a left-handed player, whose buttons are on the
               left instead. Whole strings rather than an interpolated corner:
               Tailwind reads the source for class names it has never run. */
            className={
              hand === 'right'
                ? 'absolute bottom-40 left-6 bottomScreen'
                : 'absolute bottom-40 right-6 bottomScreen'
            }
            onChange={(strafe, forward) => {
              moveRef.current.strafe = strafe
              moveRef.current.forward = forward
            }}
          />

          <div
            className={
              hand === 'right'
                ? 'absolute bottom-40 right-6 flex flex-col items-end gap-3'
                : 'absolute bottom-40 left-6 flex flex-col items-start gap-3'
            }
          >
            <div className="flex gap-3">
              <HoldButton
                label="▲"
                onHold={(held) => {
                  moveRef.current.vertical = held ? 1 : 0
                }}
              />
              <HoldButton
                label="▼"
                onHold={(held) => {
                  moveRef.current.vertical = held ? -1 : 0
                }}
              />
            </div>
            {!readOnly && (
            <div className="flex gap-3">
              <button
                type="button"
                aria-label={t.controls.mine}
                onClick={() => {
                  const current = targetRef.current
                  if (current.hit) remove(current.hit)
                }}
                className="size-14 touch-none select-none rounded-full border border-white/25 bg-red-500/40 text-xs font-medium text-white backdrop-blur-sm active:bg-red-500/70"
              >
                {t.softKeys.break}
              </button>
              <button
                type="button"
                aria-label={t.controls.build}
                onClick={() => {
                  const current = targetRef.current
                  if (current.place) place(current.place, selected)
                }}
                className="size-14 touch-none select-none rounded-full border border-white/25 bg-violet-400/60 text-xs font-medium text-white backdrop-blur-sm active:bg-violet-400"
              >
                {t.softKeys.place}
              </button>
            </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One InstancedMesh per model, sharing the glTF's geometry and material.
 *
 * `useGLTF` caches by URL, so a model used by 4,000 blocks is fetched and
 * parsed once. The positions array is stashed on `userData` so the targeting
 * raycast can turn an `instanceId` back into a world cell.
 */
function BlockInstances({ model, positions }: { model: string; positions: Cell[] }) {
  const { scene } = useGLTF(modelUrl(model))
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const source = useMemo(() => {
    let found: THREE.Mesh | null = null
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!found && mesh.isMesh) found = mesh
    })
    return found as THREE.Mesh | null
  }, [scene])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    const translation = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3(BLOCK_SCALE, BLOCK_SCALE, BLOCK_SCALE)

    positions.forEach((position, index) => {
      // Cells are addressed by their integer corner and the model is centred on
      // its own origin, so the mesh goes at the centre of the cell. Once scaled
      // to 0.5 the authored 2-unit cube spans exactly x..x+1, which is what
      // makes blocks meet flush and line up with the grid.
      translation.set(position.x + 0.5, position.y + 0.5, position.z + 0.5)
      matrix.compose(translation, rotation, scale)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.count = positions.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.userData.positions = positions
  }, [positions])

  if (!source) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[source.geometry, source.material as THREE.Material, Math.max(positions.length, 1)]}
      castShadow
      receiveShadow
    />
  )
}

/**
 * Casts a ray from the centre of the screen every frame and reports what it
 * finds.
 *
 * This replaces per-object pointer handlers entirely. Under pointer lock the
 * mouse never moves, so DOM pointer events are useless - the crosshair is
 * fixed, and what matters is what lies along the camera's forward axis.
 *
 * State is only pushed upward when the target *changes*, which for a player
 * standing still is never. Setting React state 60 times a second would re-render
 * the whole scene continuously.
 */
function Targeting({ onTarget }: { onTarget: (target: Target) => void }) {
  const { camera, scene } = useThree()
  const lastKey = useRef<string>('')

  // Our own Raycaster rather than the one from useThree(). Setting `far` on the
  // shared instance would silently impose this component's reach limit on every
  // other consumer of it.
  const raycaster = useMemo(() => {
    const instance = new THREE.Raycaster()
    instance.far = REACH
    return instance
  }, [])

  useFrame(() => {
    raycaster.setFromCamera(SCREEN_CENTRE, camera)

    const hits = raycaster.intersectObjects(scene.children, true)

    let next: Target = NO_TARGET

    for (const hit of hits) {
      const object = hit.object

      // The preview ghost must not occlude the thing it is previewing.
      if (object.userData.ignoreRay) continue

      if (object.userData.isGround) {
        const cell = {
          x: Math.floor(hit.point.x),
          y: 0,
          z: Math.floor(hit.point.z),
        }
        next = { hit: null, place: cell }
        break
      }

      const positions = object.userData.positions as Cell[] | undefined
      if (positions && hit.instanceId !== undefined) {
        const cell = positions[hit.instanceId]
        if (!cell) continue

        const normal = faceNormal(hit.point, cell)
        next = {
          hit: cell,
          place: { x: cell.x + normal.x, y: cell.y + normal.y, z: cell.z + normal.z },
        }
        break
      }
    }

    const key = `${cellKey(next.hit)}|${cellKey(next.place)}`
    if (key !== lastKey.current) {
      lastKey.current = key
      onTarget(next)
    }
  })

  return null
}

/** Keeps summed keyboard + thumbstick input inside a unit range. */
function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

function cellKey(cell: Cell | null): string {
  return cell ? `${cell.x},${cell.y},${cell.z}` : '-'
}

/**
 * Which face of a cube was hit, as a unit vector.
 *
 * Derived from the hit point rather than the geometry's face normal: the normal
 * would need transforming out of instance space, while the offset from the cell
 * centre gives the answer directly and its dominant axis is the face.
 */
function faceNormal(point: THREE.Vector3, cell: Cell): Cell {
  const dx = point.x - (cell.x + 0.5)
  const dy = point.y - (cell.y + 0.5)
  const dz = point.z - (cell.z + 0.5)

  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const az = Math.abs(dz)

  if (ax >= ay && ax >= az) return { x: Math.sign(dx) || 1, y: 0, z: 0 }
  if (ay >= ax && ay >= az) return { x: 0, y: Math.sign(dy) || 1, z: 0 }
  return { x: 0, y: 0, z: Math.sign(dz) || 1 }
}

/**
 * The placement preview.
 *
 * Two overlays, because they answer different questions: a glowing shell on the
 * cell that would be filled, and a wireframe cage on the block that would
 * break. Without them, building by eye against a dark void is guesswork - you
 * cannot tell which face of a cube you are pointing at until a block appears in
 * the wrong place.
 */
function Preview({ target }: { target: Target }) {
  return (
    <>
      {target.place && (
        <mesh
          position={[target.place.x + 0.5, target.place.y + 0.5, target.place.z + 0.5]}
          userData={{ ignoreRay: true }}
        >
          <boxGeometry args={[1.001, 1.001, 1.001]} />
          {/* Saturated rather than pale: against a near-white scene a light
              ghost is invisible, so the preview leans violet and opaque enough
              to read against both the clouds and a white block. */}
          <meshBasicMaterial
            color="#7c3aed"
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}

      {target.hit && (
        <lineSegments
          position={[target.hit.x + 0.5, target.hit.y + 0.5, target.hit.z + 0.5]}
          userData={{ ignoreRay: true }}
        >
          <edgesGeometry args={[new THREE.BoxGeometry(1.02, 1.02, 1.02)]} />
          <lineBasicMaterial color="#4c1d95" transparent opacity={0.9} />
        </lineSegments>
      )}
    </>
  )
}

/**
 * The cloud floor.
 *
 * Pale rather than black, so the ground reads as the top of a cloudbank rather
 * than as a surface the world is standing on. A near-white plane under white
 * fog has almost no visible horizon, which is the intended effect - the grid is
 * what tells you where you are, and it fades out rather than ending.
 */
function CosmicGround() {
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        userData={{ isGround: true }}
      >
        <planeGeometry args={[512, 512]} />
        {/* Slightly warmer than the fog so it separates by a hair, and rough
            so it scatters rather than reflecting a hard highlight. */}
        <meshStandardMaterial color="#fbf9ff" roughness={1} metalness={0} />
      </mesh>

      <Grid
        position={[0, 0.002, 0]}
        args={[512, 512]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#ded6ff"
        sectionSize={16}
        sectionThickness={1}
        // Sections are chunk-sized on purpose: the stronger lines are the
        // actual boundaries between event streams, so the grid shows you the
        // aggregate seams while you build.
        sectionColor="#a78bfa"
        fadeDistance={70}
        fadeStrength={1.6}
        infiniteGrid
      />
    </>
  )
}

/**
 * Fly camera: pointer lock to look, WASD to move, Space/Ctrl for altitude.
 *
 * Hand-written rather than drei's PointerLockControls so movement is
 * frame-rate independent and so lock changes can be reported to the HUD.
 */
function FlyControls({
  onLockChange,
  moveRef,
  lookRef,
  pointerLock,
}: {
  onLockChange: (locked: boolean) => void
  moveRef: React.RefObject<MoveInput>
  lookRef: React.RefObject<LookDelta>
  /** False on touch devices, where pointer lock does not exist. */
  pointerLock: boolean
}) {
  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

  useEffect(() => {
    const canvas = gl.domElement

    const onKeyDown = (event: KeyboardEvent) => {
      /**
       * L toggles the look lock without needing a click.
       *
       * Alt-tabbing or clicking off the canvas releases pointer lock, and
       * re-requesting it normally takes a click back onto the canvas. A
       * keypress counts as user activation too, so this hands back control -
       * and takes it away again - without one, and without touching `euler`,
       * so the camera is exactly where it was left.
       */
      if (event.code === 'KeyL' && !event.repeat && pointerLock) {
        if (document.pointerLockElement === canvas) document.exitPointerLock()
        // Swallowed because the browser refuses a re-lock for about a second
        // after an exit, and toggling straight back on is the obvious thing to
        // do with a toggle. A refusal means the look stays off, not an error.
        else void canvas.requestPointerLock().catch(() => {})
        return
      }
      keys.current[event.code] = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current[event.code] = false
    }

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      euler.current.setFromQuaternion(camera.quaternion)
      euler.current.y -= event.movementX * 0.002
      euler.current.x -= event.movementY * 0.002
      // Stop the camera flipping over at the poles.
      euler.current.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, euler.current.x),
      )
      camera.quaternion.setFromEuler(euler.current)
    }

    const onPointerLockChange = () => {
      onLockChange(document.pointerLockElement === canvas)
    }

    const onCanvasClick = () => {
      // Requesting pointer lock on a touch device either throws or silently
      // does nothing, and would swallow the tap that should have been a look
      // drag. Touch gets its own entry path.
      if (!pointerLock) return
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock()
    }

    // Right-click places blocks, so the context menu has to go.
    const onContextMenu = (event: Event) => event.preventDefault()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    canvas.addEventListener('click', onCanvasClick)
    canvas.addEventListener('contextmenu', onContextMenu)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('click', onCanvasClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [camera, gl, onLockChange, pointerLock])

  // Movement goes through three.js' own mutators rather than assigning to
  // camera.position.y. Both mutate the same object, but the method form is what
  // react-hooks/immutability recognises as intentional scene-graph mutation -
  // which is react-three-fiber's whole programming model.
  useFrame((_, delta) => {
    // Drain any accumulated touch-drag look. Applying it here rather than in
    // the touch handler ties turn rate to frames, so the camera moves the same
    // amount whether the OS delivered one big move event or ten small ones.
    const look = lookRef.current
    if (look.dx !== 0 || look.dy !== 0) {
      euler.current.setFromQuaternion(camera.quaternion)
      euler.current.y -= look.dx * 0.004
      euler.current.x -= look.dy * 0.004
      euler.current.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, euler.current.x),
      )
      camera.quaternion.setFromEuler(euler.current)
      look.dx = 0
      look.dy = 0
    }

    // Keyboard and thumbstick are summed rather than switched between, so a
    // tablet with a keyboard attached can use either without a mode to get
    // wrong. Clamped because pressing W while pushing the stick forward should
    // not be double speed.
    const move = moveRef.current
    const forward = clamp(
      (keys.current.KeyW ? 1 : 0) - (keys.current.KeyS ? 1 : 0) + move.forward,
    )
    const strafe = clamp(
      (keys.current.KeyD ? 1 : 0) - (keys.current.KeyA ? 1 : 0) + move.strafe,
    )
    const vertical = clamp(
      (keys.current.Space ? 1 : 0) - (keys.current.ControlLeft ? 1 : 0) + move.vertical,
    )
    const sprint = keys.current.ShiftLeft || move.sprint

    if (forward === 0 && strafe === 0 && vertical === 0) return

    const speed = (sprint ? 24 : 10) * delta

    camera.getWorldDirection(FORWARD)
    RIGHT.crossVectors(FORWARD, camera.up).normalize()

    if (forward !== 0) camera.position.addScaledVector(FORWARD, speed * forward)
    if (strafe !== 0) camera.position.addScaledVector(RIGHT, speed * strafe)
    if (vertical !== 0) camera.position.addScaledVector(UP, speed * vertical)
  })

  return null
}

function Hud({
  locked,
  readOnly,
  blockCount,
  pending,
  saving,
  error,
  hasTarget,
  slug,
  isTouch,
  onEnterTouch,
  selected,
  onOpenPicker,
}: {
  locked: boolean
  readOnly: boolean
  blockCount: number
  pending: number
  saving: boolean
  error: string | null
  hasTarget: boolean
  slug: string
  isTouch: boolean
  onEnterTouch: () => void
  selected: string
  onOpenPicker: () => void
}) {
  const refusal = useRefusal()
  const t = worldDict(useLocale())
  const router = useRouter()
  const [generating, startGenerating] = useTransition()
  const [genError, setGenError] = useState<string | null>(null)

  /**
   * Seeding writes ~196 events server-side and never touches the local block
   * map, so the scene has no idea it happened. router.refresh() re-runs the
   * page's server render and hands down the new world - the one place in the
   * lounge where a round trip is the right answer, because 40,000 blocks are
   * not something to replay optimistically.
   */
  function seed() {
    setGenError(null)
    startGenerating(async () => {
      const result = await generateFloor(slug, DEFAULT_GROUND_MODEL, DEFAULT_WORLD_SIZE)
      if (result.ok) router.refresh()
      else setGenError(refusal(result.error))
    })
  }

  return (
    <>
      {/* The crosshair dims when nothing is in reach, so "why is nothing
          happening" answers itself before you click. */}
      {locked && (
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity ${
            hasTarget ? 'opacity-90' : 'opacity-25'
          }`}
        >
          <div className="relative h-5 w-5">
            {/* Dark, because the sky is now white. */}
            <span className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-violet-950" />
            <span className="absolute left-0 top-1/2 h-px w-5 -translate-y-1/2 bg-violet-950" />
          </div>
        </div>
      )}

      {!locked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl bg-black/70 px-5 py-4 text-center text-sm text-white backdrop-blur-sm">
            {isTouch ? (
              <>
                <button
                  type="button"
                  onClick={onEnterTouch}
                  className="pointer-events-auto rounded-full bg-white/90 px-5 py-2 font-medium text-black"
                >
                  {t.showcase.tapEnter}
                </button>
                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  {t.showcase.touchLines.map((line, index) => (
                    <span key={line}>
                      {index > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">{t.showcase.clickEnter}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  {t.showcase.mouseLines.map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                  {t.showcase.chooseLead}
                  <span className="text-white/80">E</span>
                  {t.showcase.chooseTail}
                </p>
              </>
            )}

            {/* Only offered on a genuinely empty world. Once anything has been
                built, laying 40,000 blocks under it is almost never what
                someone means to click. */}
            {blockCount === 0 && !readOnly && (
              <div className="pointer-events-auto mt-4 border-t border-white/15 pt-3">
                <button
                  type="button"
                  disabled={generating}
                  onClick={seed}
                  className="rounded-full bg-violet-400 px-4 py-1.5 text-xs font-medium text-black transition hover:bg-violet-300 disabled:opacity-50"
                >
                  {generating
                    ? t.lounge.layingFloor
                    : fill(t.lounge.generateFloor, { n: DEFAULT_WORLD_SIZE })}
                </button>
                <p className="mt-2 text-[10px] leading-relaxed text-white/45">
                  {fill(t.lounge.floorNote, {
                    blocks: DEFAULT_WORLD_SIZE * DEFAULT_WORLD_SIZE,
                  })}
                </p>
                {genError && (
                  <p role="alert" className="mt-2 text-[10px] text-red-300">
                    {genError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute left-6 top-6 rounded-full bg-black/50 px-3 py-1 font-mono text-xs text-white/80 backdrop-blur-sm">
        {fill(t.lounge.blocks, { n: blockCount })}
        {pending > 0 && (
          <span className="ml-2 text-amber-300">{fill(t.lounge.queued, { n: pending })}</span>
        )}
        {saving && <span className="ml-2 text-white/50">{t.lounge.saving}</span>}
      </div>

      {readOnly && (
        <div className="absolute right-6 top-6 rounded-full bg-red-600/80 px-3 py-1 text-xs text-white">
          {t.lounge.readOnly}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="absolute left-1/2 top-6 max-w-md -translate-x-1/2 rounded-lg bg-red-600/90 px-3 py-2 text-xs text-white"
        >
          {error} — reload to resync.
        </div>
      )}

      {/* What you are holding, and the way in to change it. */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
        {!readOnly && (
          <SelectedBlockChip selected={selected} onOpen={onOpenPicker} isTouch={isTouch} />
        )}
      </div>

    </>
  )
}
