'use client'

import { Sparkles, useGLTF } from '@react-three/drei'
import { useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useRainbowFor, useRainbowSkin } from '@/app/world/_canvas/rainbow'
import { type AvatarClip, avatarUrl, isSkinLook } from '@/domain/lounge/avatars'
import type { Pose } from '@/domain/animator/clip'
/**
 * From the file rather than the `Addons.js` barrel, for the reason the XP
 * runtime gives: the barrel drags a CDN-fetching lottie loader into the bundle
 * and fails outright outside a browser. See `@/app/xp/_runtime/body/skinned`.
 */
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { modelUrl as tinyUrl } from '@kxb/peepz-world/catalog'
import { modelUrl as blockUrl } from '@/domain/lounge/palette'
import { drawingOf, modelUrlFor } from '@/domain/thingiverse/models'
import {
  EMOTE_COLUMNS,
  EMOTE_ROWS,
  EMOTE_SHEET,
  type EmoteId,
  emoteUvOffset,
} from '@/domain/world/emotes'
import type { LightSpec } from '@/domain/studio/scene'
import { SAID_BLUE, SAID_BLUE_DEEP, SAID_INK } from '@/domain/world/speech'

/**
 * The things a still is built out of.
 *
 * Shared by the two surfaces that compose one: `/world/shots`, which draws the
 * fixed set of marketing scenes, and the backoffice studio, which lets an admin
 * arrange the same pieces by hand. They have to be the same components or the
 * editor becomes a preview of a different renderer - somebody would arrange a
 * shot in one and export it from the other, and the two would disagree.
 *
 * ---------------------------------------------------------------------------
 * Why nothing here uses the frame loop
 * ---------------------------------------------------------------------------
 * No `useFrame` anywhere: animation clips are posed by calling `mixer.setTime`
 * with an absolute moment, so what is drawn is a function of the props and not
 * of how many frames have gone by. The same scene gives the same pixels, rather
 * than whatever frame the walk cycle happened to be on when the capture fired.
 *
 * It is also what makes the studio capturable from an automated browser at
 * all. A pane that never runs `requestAnimationFrame` - a hidden tab, a
 * headless driver - renders nothing under the normal loop, and would sit there
 * handing back a blank canvas forever.
 *
 * This is what lets the same pieces make video without becoming a different
 * renderer. A moving shot is `sceneAt(shot, t)` from `@/domain/studio/shot`
 * sampled repeatedly - the time that advances is an argument, not internal
 * state - so playback and capture differ only in what drives the clock, and a
 * scrubber can jump backwards as cheaply as it goes forwards.
 *
 * The editor does run a loop, because orbiting a camera needs one, and playback
 * runs one for the same reason. That is a difference in how the canvas is
 * driven, not in what is drawn.
 */

// ---------------------------------------------------------------------------
// The pack's scales
// ---------------------------------------------------------------------------

/** bb10 is authored at 2 units per block; the world grid is 1 per cell. */
export const BLOCK_SCALE = 0.5

/** Where one bb10 block's centre goes so its top face is the given height. */
export const blockY = (top: number) => top - 0.5

/** Tiny Treats grass tiles are 2x2 units with their top face at y = 0. */
export const TINY_TILE = 2

export type Vec3 = [number, number, number]

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * A glTF, cloned and set to cast shadows.
 *
 * `useGLTF` caches one scene per URL, and one object cannot stand in two
 * places - so every piece that puts a model in the world takes a copy. Doing
 * it here rather than three times over is the only reason this exists.
 */
function useModel(url: string): THREE.Object3D {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })
    return copy
  }, [scene])
}

interface PeepProps {
  model: string
  clip?: AvatarClip
  /** Seconds into the clip. */
  time?: number
  position: Vec3
  /** Turn about Y, in radians. */
  rotation?: number
  /**
   * Lean forward about the body's own side-to-side axis, in radians.
   *
   * Applied in a group inside the turn rather than alongside it, so a lean is
   * always towards where the animal is looking. Rotating both on one object
   * would make a kick go north at one facing and east at another.
   */
  tilt?: number
  scale?: number
  /**
   * A neon edge around the silhouette, as a CSS hex, or null for none.
   *
   * The third part of party mode, and the one that actually makes a body look
   * lit rather than stood next to a lamp - see the note on `<Glow>`. It was a
   * flat additive disc behind the body in the lounge first, and that is exactly
   * what it looked like: a pale circle stuck to the floor, brightest where a
   * glow should be weakest.
   */
  rim?: string | null
  /**
   * A pose laid over the clip, or null for the clip alone.
   *
   * Already sampled - `actorAt` blends the keys, so what arrives here is where
   * every bone stands at this instant, and drawing it stays a function of the
   * props. Bones the pose names follow it; bones it never mentions stay with
   * the clip, which is what lets an authored wave ride on a derived walk.
   */
  pose?: Pose | null
  /**
   * Clicking the body itself, for an editor that wants selection in the scene.
   *
   * Undefined everywhere a still is only being *drawn* - the marketing shots,
   * the capture - where a body that swallowed clicks would be a body the
   * camera cannot be orbited through.
   */
  onPick?: () => void
  /**
   * The drawn body's own node graph, handed over once it exists.
   *
   * What makes posing-in-place possible: the editor gets the same object the
   * renderer is drawing, so handles land on the body standing in the shot
   * rather than on a second copy in a second viewport. Fired once per clone.
   */
  onBody?: (root: THREE.Object3D) => void
  /**
   * Hands the skeleton over entirely: no clip, no pose, nothing written.
   *
   * For while a pointer is dragging a bone. Anything writing quaternions
   * behind the solver's back is a pose that fights the hand holding it.
   */
  posing?: boolean
}

/**
 * Where the rigged bodies' shared clips live.
 *
 * The same two files the XP runtime fetches (see the note on `SOURCES` in
 * `@/app/xp/_runtime/body/skinned`, whose path this deliberately repeats
 * rather than imports - that module is a live-room thing built around a frame
 * loop, and everything in this file is posed by hand). `Idle_A` is in
 * `General`; the walk and run are in `MovementBasic`.
 */
const RIGGED_CLIP_SOURCES = [
  '/xp/packs/animation/Rig_Medium/Rig_Medium_MovementBasic.glb',
  '/xp/packs/animation/Rig_Medium/Rig_Medium_General.glb',
]

/**
 * The studio's four verbs, in the shared pack's names.
 *
 * `dance` maps to the idle on purpose: the rig has no dance, and the runtime
 * already gives the same honest answer (see `poseFor` in the XP body's motion
 * module). A dancing knight is what the pose track is for.
 */
const RIGGED_CLIPS: Record<AvatarClip, string> = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  dance: 'Idle_A',
}

/**
 * What shrinks a dummy-rig body onto the peep's metre grid.
 *
 * The XP runtime's `PLAYER_SCALE`, repeated rather than imported: that
 * constant lives beside the half-megabyte generated catalogue, and this file
 * is in the marketing pages' bundle. A knight drawn at 1 stands a head over
 * the tallest peep and reads as a different product.
 */
const RIGGED_SCALE = 0.71

/**
 * One body, posed - whichever of the two kinds it is.
 *
 * A component boundary rather than a branch, because the two kinds get their
 * clips from opposite places and hooks cannot be conditional: a peep's four
 * clips live inside its own glb, while a rigged look (`pack/Name`, the same
 * shape the lounge's skins wear) fetches the shared `Rig_Medium` pack - one
 * download for the whole cast, and nothing at all for a scene of foxes.
 *
 * `time` is chosen per peep so a room full of the same idle clip does not read
 * as a room of clones breathing in unison.
 */
export function Peep(props: PeepProps) {
  return isSkinLook(props.model) ? <RiggedPeep {...props} /> : <AnimalPeep {...props} />
}

function AnimalPeep(props: PeepProps) {
  const { scene, animations } = useGLTF(avatarUrl(props.model))
  return <Body {...props} scene={scene} animations={animations} clipName={props.clip ?? 'idle'} />
}

function RiggedPeep(props: PeepProps) {
  const { scene } = useGLTF(`/xp/packs/${props.model}.glb`)
  const movement = useGLTF(RIGGED_CLIP_SOURCES[0])
  const general = useGLTF(RIGGED_CLIP_SOURCES[1])
  const animations = useMemo(
    () => [...movement.animations, ...general.animations],
    [movement.animations, general.animations],
  )
  return (
    <Body
      {...props}
      scene={scene}
      animations={animations}
      clipName={RIGGED_CLIPS[props.clip ?? 'idle']}
      scale={(props.scale ?? 1) * RIGGED_SCALE}
    />
  )
}

function Body({
  scene,
  animations,
  clipName,
  time = 0,
  position,
  rotation = 0,
  tilt = 0,
  scale = 1,
  rim = null,
  pose = null,
  onPick,
  onBody,
  posing = false,
}: Omit<PeepProps, 'model' | 'clip'> & {
  scene: THREE.Object3D
  animations: THREE.AnimationClip[]
  /** The clip's name in `animations`, already translated per body kind. */
  clipName: string
}) {
  /**
   * The body and its mixer, which outlive any one pose.
   *
   * Deliberately not keyed on `time`. A still only ever asks for one moment, so
   * rebuilding per pose cost nothing and read more simply - but the studio's
   * shots sample this thirty times a second, and a fresh `scene.clone(true)`
   * plus a fresh `AnimationMixer` per avatar per frame is a scene that cannot
   * play back, let alone capture. The clone is the expensive part and the pose
   * is not, so they are separated.
   */
  const { object, mixer, nodes } = useMemo(() => {
    // `SkeletonUtils.clone` rather than `scene.clone(true)`: the rigged bodies
    // are skinned, and a plain clone leaves their meshes bound to the cached
    // original's skeleton - two knights in a shot would share one pose. On the
    // unskinned peeps it does the same thing the plain clone did.
    const copy = cloneSkinned(scene)
    /**
     * Every named node, indexed, with the quaternion it woke up with.
     *
     * The index is how a pose finds its bones; the rest rotations are how it
     * lets go of them. A clip only rewrites the bones its own tracks drive, so
     * a posed head on a clip that never tracks the head would otherwise stay
     * tilted after the pose ends - putting everything back to rest before each
     * sample keeps the drawn frame a function of the props, which is the rule
     * this whole file exists to keep.
     */
    const nodes = new Map<
      string,
      { node: THREE.Object3D; rest: THREE.Quaternion; stood: THREE.Vector3 }
    >()
    copy.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
      if (node.name) {
        nodes.set(node.name, {
          node,
          rest: node.quaternion.clone(),
          stood: node.position.clone(),
        })
      }
    })
    return { object: copy, mixer: new THREE.AnimationMixer(copy), nodes }
  }, [scene])

  /**
   * The rim's colour, as one object that outlives any one value.
   *
   * This is the whole reason the effect below can exist. The lounge holds a
   * mutable `THREE.Color` and a rainbow is one `setHSL` a frame; here the
   * colour arrives as a *string* that `glowAt` recomputes every frame, so
   * rebuilding the material when it changes would clone and recompile every
   * mesh on this animal sixty times a second.
   *
   * So the string is written into one long-lived `Color`, the shader's uniform
   * holds a reference to that same object, and the expensive effect depends
   * only on whether there is a rim at all - not on what colour it is.
   */
  const rimColour = useMemo(() => new THREE.Color(), [])
  const rimOn = rim !== null && rim !== undefined

  // In an effect rather than during render. Writing to it inline would work -
  // the object is memoised and the write is idempotent - but mutating anything
  // while rendering is the habit that produces the bugs React's rules exist to
  // prevent, and this costs one `Color.set` after paint instead.
  useEffect(() => {
    if (rim) rimColour.set(rim)
  }, [rim, rimColour])

  /**
   * The rim, applied to this body's materials and taken off again.
   *
   * `scene.clone(true)` shares materials with every other clone of the same
   * animal - that is what makes a scene of six pandas cheap - so the first
   * thing this does is give *this* body its own copies. Without it, one peep
   * glowing would light up everybody who picked the same animal, in their
   * colour.
   *
   * Lifted from `<AvatarModel rim>` rather than imported: that component is the
   * lounge's, and it is a live-room thing built around `useAnimations` and a
   * frame loop. Everything in this file is posed by hand. The shader is
   * deliberately identical, because the two have to look the same.
   */
  useEffect(() => {
    if (!rimOn) return

    const restore: { mesh: THREE.Mesh; material: THREE.Material }[] = []

    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const source = mesh.material
      if (Array.isArray(source)) return

      const material = source.clone()
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uRimColour = { value: rimColour }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\nuniform vec3 uRimColour;`)
          /**
           * At the very end, after tone mapping and colour space, so the edge
           * stays the neon it was asked for instead of being rolled back
           * towards white by the tone mapper.
           *
           * `vViewPosition` is the fragment-to-camera vector every lit material
           * in three declares; its dot with the normal is one at the centre of
           * a surface facing you and zero at its edge, so one minus that,
           * raised to a power, is a band that hugs the silhouette.
           */
          .replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
  float rimFacing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  float rimBand = pow(1.0 - rimFacing, 2.4);
  gl_FragColor.rgb += uRimColour * rimBand * 1.6;`,
          )
      }
      material.needsUpdate = true

      restore.push({ mesh, material: source })
      mesh.material = material
    })

    return () => {
      for (const entry of restore) {
        const worn = entry.mesh.material
        entry.mesh.material = entry.material
        if (!Array.isArray(worn)) worn.dispose()
      }
    }
  }, [object, rimOn, rimColour])

  /**
   * Which clip is playing, swapped when it changes.
   *
   * `stopAllAction` rather than fading between them: a shot samples an absolute
   * moment, so there is no previous frame for a blend to be relative to, and
   * scrubbing backwards across a clip change would otherwise leave the old
   * action still weighted.
   */
  useEffect(() => {
    const track = animations.find((candidate) => candidate.name === clipName)
    if (!track) return
    mixer.stopAllAction()
    mixer.clipAction(track).play()
  }, [animations, clipName, mixer])

  /**
   * What the last authored pose touched, so letting go can be surgical.
   *
   * The obvious cleanup - put every bone back to rest before each sample - is
   * wrong in a way three.js keeps to itself: `PropertyMixer.apply` only
   * writes a bone when its *own* consecutive evaluations differ, so a mixer
   * asked for the same instant twice writes nothing, and a reset made behind
   * its back simply stays. It looked like the clip dying the moment a pose
   * arrived, because the pose is a fresh object every sample and re-fired
   * this effect at an unchanged time - and every re-fire left the body at
   * bind. So nothing is reset wholesale; only bones the previous pose drove
   * and the current one has let go of go back to rest, which is also what an
   * unbaked bone means everywhere else.
   */
  const touched = useRef<ReadonlySet<string>>(new Set())

  /**
   * The pose. The whole animation system, for one moment.
   *
   * `setTime` from zero every time rather than `update(delta)`, so the pose is a
   * function of the argument and not of how many frames have been drawn - which
   * is what keeps a shot reproducible and what lets a scrubber jump backwards.
   *
   * Clip first, authored pose last - the same layering `actorAt` promises:
   * the clip drives what its tracks name, and the pose overrides the bones
   * *its* keys name over that. The root's translation comes with it, because
   * a keyed jump has to leave the floor.
   */
  // Handed over once, when the clone exists. The editor holds it for as long
  // as this body is on screen; a new clone is a new body and a new handover.
  useEffect(() => {
    onBody?.(object)
  }, [object, onBody])

  useEffect(() => {
    // A hand on a handle owns the skeleton outright - see `posing`.
    if (posing) return
    const current = new Set(pose ? Object.keys(pose.bones) : [])
    const rooted = nodes.get('root')
    for (const name of touched.current) {
      if (current.has(name)) continue
      const found = nodes.get(name)
      if (found) found.node.quaternion.copy(found.rest)
    }
    if (touched.current.size > 0 && !pose && rooted) rooted.node.position.copy(rooted.stood)
    touched.current = current

    mixer.setTime(time)
    if (!pose) return
    for (const [name, quat] of Object.entries(pose.bones)) {
      const found = nodes.get(name)
      if (found) found.node.quaternion.set(quat[0], quat[1], quat[2], quat[3])
    }
    if (rooted) rooted.node.position.set(pose.root[0], pose.root[1], pose.root[2])
  }, [mixer, nodes, time, clipName, pose, posing])

  // Releases the mixer's hold on the clone's tracks when the peep goes away.
  useEffect(
    () => () => {
      mixer.stopAllAction()
    },
    [mixer],
  )

  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      /*
        Selectable only where somebody asked for it.

        Without `onPick` this is the same inert body it always was, which is
        what every drawn still needs - a mesh that ate clicks would be a mesh
        the camera cannot be orbited through. `stopPropagation` keeps the click
        off whatever is behind, so picking the near peep in a crowd picks the
        near one.
      */
      onClick={
        onPick
          ? (event) => {
              event.stopPropagation()
              onPick()
            }
          : undefined
      }
    >
      {/* The pivot is the feet, so a lean tips the animal over its toes rather
          than about its middle - which is the difference between a lunge and a
          model that sinks into the floor. */}
      <group rotation={[tilt, 0, 0]} scale={scale}>
        <primitive object={object} />
      </group>
    </group>
  )
}

/**
 * A face over somebody's head.
 *
 * The still version of `<EmoteBubble>`: same sheet, same UV maths, none of the
 * pop-and-fade, and turned to face the camera once instead of every frame. The
 * texture is cloned per bubble because `offset` lives on the texture - one
 * shared texture would give the whole cast the same face, which is exactly the
 * bug the live bubble's comment warns about.
 */
export function Emote({
  id,
  position,
  size = 0.95,
}: {
  id: EmoteId
  position: Vec3
  size?: number
}) {
  const camera = useThree((state) => state.camera)
  const group = useRef<THREE.Group>(null)

  /**
   * Loaded through `useLoader`, unlike the live bubble's plain `TextureLoader`.
   *
   * The live one deliberately avoids suspending, because it hangs off an avatar
   * that is already inside a Suspense boundary and would blink the body away
   * the first time anybody emoted. A still has the opposite requirement: the
   * capture fires as soon as the boundary resolves, so anything that loads
   * *outside* the boundary is a face that is still arriving when the shutter
   * goes. Cloning gives each bubble its own `offset` over the one shared upload.
   */
  const sheet = useLoader(THREE.TextureLoader, EMOTE_SHEET)

  const texture = useMemo(() => {
    const loaded = sheet.clone()
    loaded.needsUpdate = true
    loaded.colorSpace = THREE.SRGBColorSpace
    loaded.magFilter = THREE.NearestFilter
    loaded.minFilter = THREE.LinearMipmapLinearFilter
    loaded.wrapS = THREE.ClampToEdgeWrapping
    loaded.wrapT = THREE.ClampToEdgeWrapping
    loaded.repeat.set(1 / EMOTE_COLUMNS, 1 / EMOTE_ROWS)
    const { x, y } = emoteUvOffset(id)
    loaded.offset.set(x, y)
    return loaded
  }, [id, sheet])

  useEffect(() => () => texture.dispose(), [texture])

  /**
   * Billboarded on every camera change rather than every frame.
   *
   * In a still the camera does not move, so "always faces the camera" and
   * "faces the camera" are the same requirement. In the editor it does move,
   * and the bubbles turn when the orbit settles rather than continuously -
   * which is the same picture at the only moment that gets exported.
   */
  useEffect(() => {
    group.current?.lookAt(camera.position)
  })

  return (
    <group ref={group} position={position}>
      {/* The plate behind the face, so a pale emote still reads against grass. */}
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[size * 0.62, 32]} />
        <meshBasicMaterial color="#120a24" transparent opacity={0.72} />
      </mesh>
      <mesh>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.5} />
      </mesh>
      {/* The little tail, pointing back down at whoever pulled the face. */}
      <mesh position={[0, -size * 0.6, -0.02]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[size * 0.18, size * 0.18]} />
        <meshBasicMaterial color="#120a24" transparent opacity={0.72} />
      </mesh>
    </group>
  )
}

/**
 * A line of dialogue, over somebody's head.
 *
 * ---------------------------------------------------------------------------
 * Why a canvas and not `<Text>`
 * ---------------------------------------------------------------------------
 * drei's `<Text>` is the obvious answer and the wrong one here. It is troika
 * underneath, which fetches a font - by default a Roboto off a CDN - and this
 * has to draw the *first* time it is asked, in a headless capture, on a page
 * whose CSP does not reach off-origin. A texture painted from a 2D canvas needs
 * nothing but the browser's own font stack, is one upload, and is legible at
 * the sizes a bubble is ever drawn at.
 *
 * The cost is that the text is a picture: it does not reflow, and the wrap is
 * decided here in characters rather than by a shaper. For one or two lines over
 * an animal's head that is the whole of what a shaper would have done anyway.
 */
export function Say({
  text,
  position,
  size = 1,
}: {
  text: string
  position: Vec3
  /** Height of one line of text, in blocks. The bubble is drawn around it. */
  size?: number
}) {
  const camera = useThree((state) => state.camera)
  const group = useRef<THREE.Group>(null)

  const { texture, width, height } = useMemo(() => painted(text), [text])

  useEffect(() => () => texture.dispose(), [texture])

  // Billboarded on every render rather than every frame, exactly as `<Emote>`
  // is and for the reason given there.
  useEffect(() => {
    group.current?.lookAt(camera.position)
  })

  const plate = size * height

  return (
    <group ref={group} position={position}>
      <mesh>
        <planeGeometry args={[size * width, plate]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
      {/* The tail, pointing back down at whoever is talking. Painted in the
          gradient's deep end, which is the edge of the box it grows out of. */}
      <mesh position={[0, -plate * 0.56, -0.01]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[plate * 0.22, plate * 0.22]} />
        <meshBasicMaterial color={SAID_BLUE_DEEP} />
      </mesh>
    </group>
  )
}

/** Characters before the line wraps. Past this a bubble is wider than the animal. */
const WRAP = 22

/** And how many lines it will hold before the rest is an ellipsis. */
const LINES = 3

/** Greedy wrap. Long enough words are broken rather than allowed to overflow. */
function wrap(text: string): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of text.trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= WRAP) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = word.length > WRAP ? `${word.slice(0, WRAP - 1)}-` : word
  }
  if (line) lines.push(line)

  if (lines.length <= LINES) return lines
  const kept = lines.slice(0, LINES)
  kept[LINES - 1] = `${kept[LINES - 1].slice(0, WRAP - 1)}…`
  return kept
}

/** Pixels per line in the texture. Generous: this gets read at 1080p. */
const LINE_PX = 64

/**
 * The bubble, as a texture and the shape to stretch it over.
 *
 * `width` and `height` come back in multiples of one line's height, so the
 * caller sizes the plane by how tall the text should be and the aspect takes
 * care of itself.
 */
function painted(text: string): { texture: THREE.Texture; width: number; height: number } {
  const lines = wrap(text)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  const pad = LINE_PX * 0.5
  const font = `600 ${LINE_PX * 0.62}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`

  // Measured before the canvas is sized, because setting width or height clears
  // the context - including the font, which is why it is set twice.
  if (context) context.font = font
  const widest = context
    ? Math.max(...lines.map((line) => context.measureText(line).width))
    : LINE_PX * 8

  canvas.width = Math.ceil(widest + pad * 2)
  canvas.height = Math.ceil(lines.length * LINE_PX + pad * 1.2)

  if (context) {
    const radius = LINE_PX * 0.45
    context.font = font
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    // Blue and opaque, matching the live bubble in a room — see
    // `@/domain/world/speech`. Opaque because the fill is what says "somebody
    // said this", and a blue you can see grass through is not one blue.
    const fill = context.createLinearGradient(0, 0, 0, canvas.height)
    fill.addColorStop(0, SAID_BLUE)
    fill.addColorStop(1, SAID_BLUE_DEEP)

    context.fillStyle = fill
    context.beginPath()
    context.roundRect(0, 0, canvas.width, canvas.height, radius)
    context.fill()

    context.fillStyle = SAID_INK
    lines.forEach((line, i) => {
      context.fillText(line, canvas.width / 2, pad * 0.6 + (i + 0.5) * LINE_PX)
    })
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  return {
    texture,
    width: canvas.width / LINE_PX,
    height: canvas.height / LINE_PX,
  }
}

/**
 * A body that lights the room, as party mode does it.
 *
 * The lounge's `<PartyGlow>` is the same three parts - a lamp at chest height,
 * the sparkle around it, and a rim on the body - and this is deliberately not
 * an import of it. That one is built for a live room: its light *breathes* off
 * the wall clock and its colour cycles off a shared clock, both of which are
 * exactly what a shot must not do. Everything in this file is a function of its
 * props, so the same scene gives the same pixels and a recording is
 * reproducible.
 *
 * So the colour arrives already resolved - `glowAt` in `@/domain/studio/shot`
 * does the cycling as a function of `t` - and the pulse is dropped rather than
 * faked. A lamp that breathed on the wall clock would beat against the shot's
 * own clock during a capture, which is worse than a lamp that does not breathe.
 */
export function Glow({
  colour,
  sparkle,
  strength,
  position,
}: {
  colour: string
  sparkle: boolean
  /** Multiplies the lamp. One is the intensity the lounge uses. */
  strength: number
  position: Vec3
}) {
  // The lounge's own numbers, so a party composed here reads like the party
  // people have already stood in.
  const INTENSITY = 11
  const DISTANCE = 9
  const CHEST = 1.1

  return (
    <group position={[position[0], position[1] + CHEST, position[2]]}>
      <pointLight
        intensity={INTENSITY * strength}
        distance={DISTANCE}
        decay={2}
        color={colour}
      />
      {sparkle && (
        /* Few and slow: this is dust catching a light, not a firework, and a
           body trailing forty of them stops reading as a person. */
        <Sparkles count={16} scale={[1.5, 2.4, 1.5]} size={4} speed={0} opacity={0.7} color={colour} />
      )}
    </group>
  )
}

/**
 * A picture behind everything, sized to cover.
 *
 * `scene.background` rather than a plane in front of the camera: three draws it
 * before anything else with depth writing off, so it cannot be walked in front
 * of, cannot catch a shadow, and costs one full-screen blit. A plane would need
 * to be parented to the camera and kept outside the near plane, which is three
 * more things to get wrong in a shot where the camera moves.
 *
 * The texture is fitted rather than stretched. Three's default stretches the
 * image to the drawing buffer, so the same backdrop is a different picture in a
 * vertical export than in a wide one - which is exactly the case this is for,
 * because the point of the presets is to shoot the same scene at three shapes.
 */
export function Backdrop({ image, aspect }: { image: string | null; aspect: number }) {
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    if (!image) return

    const loader = new THREE.TextureLoader()
    let live = true
    let loaded: THREE.Texture | null = null

    loader.load(image, (texture) => {
      // The component may have gone, or the path changed, while this was in
      // flight - in which case the texture is nobody's and is disposed rather
      // than installed over whatever is there now.
      if (!live) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      // Cover, in the CSS sense: fill the frame, crop the overflowing axis,
      // centred. `image.width / image.height` is the picture's own shape.
      const source = texture.image as { width: number; height: number }
      const picture = source.width / source.height
      if (picture > aspect) {
        texture.repeat.set(aspect / picture, 1)
        texture.offset.set((1 - aspect / picture) / 2, 0)
      } else {
        texture.repeat.set(1, picture / aspect)
        texture.offset.set(0, (1 - picture / aspect) / 2)
      }
      loaded = texture
      scene.background = texture
    })

    return () => {
      live = false
      // Only if it is still ours: a later effect may already have replaced it,
      // and clearing then would blank a backdrop that is currently correct.
      if (loaded && scene.background === loaded) scene.background = null
      loaded?.dispose()
    }
  }, [scene, image, aspect])

  return null
}

/**
 * One block in a world cell - or one model out of the wider catalogue.
 *
 * ---------------------------------------------------------------------------
 * Why the same component draws both
 * ---------------------------------------------------------------------------
 * A still names what stands in it by id, and there was only ever one kind of id
 * here: a palette block, at bb10's two-units-to-the-cell. The catalogue the
 * builder builds worlds out of is 1,394 models on the same grid, and none of
 * them could be put in a shot - not because a shot could not draw one, but
 * because this function only knew how to turn a name into one URL.
 *
 * So the *name* decides, and everything downstream is unchanged: the studio's
 * block list, its animation track, the URL the scene lives in and the recorder
 * all still see a string and a position. A parallel `props` list would have
 * needed its own codec, its own timeline and its own panel to arrive at the
 * same picture.
 *
 * The two differ in exactly two facts, and both come from the pack table rather
 * than from a branch here: how many units make a cell (`scale`), and how far
 * the model's own origin sits above the cell floor (`lift`).
 */
export function Block({
  model,
  position,
  rotation = 0,
  time = 0,
  size = 1,
  pitch = 0,
  roll = 0,
  tint = null,
  onPick,
}: {
  model: string
  position: Vec3
  rotation?: number
  /** Seconds into whatever clip the model carries. See below. */
  time?: number
  /** Multiplier on the pack's own scale. See `BlockSpec.scale`. */
  size?: number
  /** The other two axes, in radians. See `BlockSpec.pitch`. */
  pitch?: number
  roll?: number
  /** A colour multiplied over the model, or nothing for its own. */
  tint?: string | null
  /** Clicking the prop itself. See the same prop on `<Peep>`. */
  onPick?: () => void
}) {
  // `drawingOf` answers for the catalogue and returns null for a palette block,
  // which is what keeps the 58 drawing exactly as they always have.
  const drawing = drawingOf(model)
  const object = useModel(drawing ? modelUrlFor(model) : blockUrl(model))
  // Repainted rather than given a `material` prop: this is a cloned glTF and
  // the meshes inside it already have their own. The clone is ours, so the
  // hook swaps them and puts them back on the way out.
  useRainbowSkin(object, useRainbowFor(model))

  /**
   * The tint, multiplied into the clone's own materials.
   *
   * ---------------------------------------------------------------------------
   * Why the materials are cloned before they are touched
   * ---------------------------------------------------------------------------
   * `useModel` clones the *scene graph*, which is what stops two crates sharing
   * a transform - but three.js shares the materials across that clone by
   * design, because that is normally exactly what you want. It is not what you
   * want here: writing a colour onto a shared material tints every other block
   * drawn from the same glTF, including ones in a different scene, and the last
   * one to render wins. So a tinted block gets materials of its own.
   *
   * Both channels again, and for the reason the pack's own tinted variants give
   * at length: `color` is what the room's lights land on and `emissive` is what
   * the model makes by itself, so tinting one gives something that changes
   * colour when the lights go out.
   */
  useEffect(() => {
    if (!tint) return
    const colour = new THREE.Color(tint)
    const swapped: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }[] = []

    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const original = mesh.material
      const paint = (material: THREE.Material): THREE.Material => {
        const copy = material.clone()
        const lit = copy as THREE.MeshStandardMaterial
        if (lit.color) lit.color.multiply(colour)
        if (lit.emissive) lit.emissive.multiply(colour)
        return copy
      }
      mesh.material = Array.isArray(original) ? original.map(paint) : paint(original)
      swapped.push({ mesh, original })
    })

    return () => {
      for (const { mesh, original } of swapped) {
        const made = mesh.material
        mesh.material = original
        // The clones are ours and nothing else can be holding them.
        if (Array.isArray(made)) made.forEach((one) => one.dispose())
        else made.dispose()
      }
    }
  }, [object, tint])

  /**
   * Whatever the model brought with it, posed at `time`.
   *
   * Posed, not played: see the note at the top of this file. A clip driven by
   * the frame loop would make the same scene export different pixels on every
   * run and would draw nothing at all under a headless driver, which is the one
   * thing every piece in here is arranged to avoid. `time` is the shot's own
   * clock, so a galaxy is at the same point in its turn in the viewport, in the
   * scrubber and in frame 400 of the recording.
   *
   * A palette block carries no clips and none of this runs for one.
   */
  const clips = useGLTF(drawing ? modelUrlFor(model) : blockUrl(model)).animations
  const mixer = useMemo(
    () => (clips.length > 0 ? new THREE.AnimationMixer(object) : null),
    [object, clips.length],
  )

  useEffect(() => {
    if (!mixer) return
    // The one it stands in, not the one it arrives with: `plop` is a spawn and
    // looping it would make the thing pulse for the whole shot.
    const standing = clips.find((clip) => clip.name === 'spin' || clip.name === 'idle') ?? clips[0]
    const action = mixer.clipAction(standing)
    action.play()
    // `setTime` rather than `update`: absolute, so a scrubber dragged backwards
    // lands on the same pose it showed on the way forward.
    mixer.setTime(time)
    return () => {
      action.stop()
      mixer.uncacheAction(standing)
    }
  }, [mixer, clips, time])

  return (
    <group
      position={
        drawing ? [position[0], position[1] + drawing.lift, position[2]] : position
      }
      rotation={[pitch, rotation, roll]}
      scale={(drawing ? drawing.scale : BLOCK_SCALE) * size}
      onClick={
        onPick
          ? (event) => {
              event.stopPropagation()
              onPick()
            }
          : undefined
      }
    >
      <primitive object={object} />
    </group>
  )
}

/** One Tiny Treats model, at world scale. */
export function Tiny({
  model,
  position,
  rotation = 0,
  scale = 1,
}: {
  model: string
  position: Vec3
  rotation?: number
  scale?: number
}) {
  const object = useModel(tinyUrl(model))
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <primitive object={object} />
    </group>
  )
}

/** Rounded corners, so a patch of ground stops raggedly. */
export const rounded = (cols: number, rows: number) => (x: number, z: number) => {
  const hx = cols / 2
  const hz = rows / 2
  return (x / hx) ** 2 + (z / hz) ** 2 < 1.05
}

/**
 * A patch of ground, as blocks.
 *
 * Two layers: grass on top and plain dirt under it, so the island has a visible
 * side rather than reading as a decal. The edge is nibbled by `keep` so the
 * patch stops raggedly - a perfect rectangle of grass floating in the dark
 * looks like a texture swatch, and this is meant to look like somewhere.
 */
export function GrassPatch({
  cols,
  rows,
  /** Which cells exist, in patch coordinates centred on the origin. */
  keep = () => true,
  top = 'dirt_with_grass',
}: {
  cols: number
  rows: number
  keep?: (x: number, z: number) => boolean
  top?: string
}) {
  const cells = useMemo(() => {
    const out: { x: number; z: number }[] = []
    for (let x = -Math.floor(cols / 2); x <= Math.floor(cols / 2); x++) {
      for (let z = -Math.floor(rows / 2); z <= Math.floor(rows / 2); z++) {
        if (keep(x, z)) out.push({ x, z })
      }
    }
    return out
  }, [cols, rows, keep])

  return (
    <group>
      {cells.map(({ x, z }) => (
        <Block key={`g${x}:${z}`} model={top} position={[x, blockY(0), z]} />
      ))}
      {cells.map(({ x, z }) => (
        <Block key={`d${x}:${z}`} model="dirt" position={[x, blockY(-1), z]} />
      ))}
    </group>
  )
}

/** The football, as `<FootballBall>` draws it: white sphere, dark seam band. */
export function Ball({ position, radius = 0.42 }: { position: Vec3; radius?: number }) {
  return (
    <group position={position} rotation={[0.4, 0.8, 0.2]}>
      <mesh castShadow>
        <sphereGeometry args={[radius, 24, 18]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh>
        <torusGeometry args={[radius * 0.99, radius * 0.16, 10, 28]} />
        <meshStandardMaterial color="#1e293b" roughness={0.7} />
      </mesh>
    </group>
  )
}

/** A goal, as `<Goals>` draws it: tinted mouth, thick emissive frame, no net. */
export function Goal({
  position,
  width = 5,
  height = 3,
  colour,
  rotation = 0,
}: {
  position: Vec3
  width?: number
  height?: number
  colour: string
  rotation?: number
}) {
  const post = 0.18
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, height / 2, 0]} renderOrder={2}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={0.13}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {[-width / 2, width / 2].map((x) => (
        <mesh key={x} position={[x, height / 2, 0]} castShadow>
          <boxGeometry args={[post, height, post]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.35} />
        </mesh>
      ))}
      <mesh position={[0, height, 0]} castShadow>
        <boxGeometry args={[width + post, post, post]} />
        <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.35} />
      </mesh>
    </group>
  )
}

/**
 * The turn that points an animal at something.
 *
 * Every model in the pack faces +Z, so aiming one is `atan2` of the horizontal
 * offset and nothing else. Written down because a football scene is almost
 * entirely animals looking at a ball, and a hand-typed radian that is out by a
 * third of a turn reads as a player who has given up on the game.
 */
export const facing = (from: Vec3, to: Vec3) => Math.atan2(to[0] - from[0], to[2] - from[2])

/**
 * The light rig.
 *
 * Daylight by default, unlike the lounge's own cosmic rig: these sit on a
 * marketing page next to block renders lit the same way, and a scene lit in
 * violet would read as a different product from the one in the boxes above it.
 * The two coloured point lights are the one concession to the site's palette -
 * they separate the silhouettes from the sky they are cut out against.
 *
 * The sun is given as an angle rather than a position so the editor has one
 * knob for "where is it coming from" instead of three coordinates that have to
 * stay on a sphere between them.
 */
export function Rig({
  light,
  radius = 14,
}: {
  light: LightSpec
  /** Half-width of the shadow camera's box. Set it to fit the scene. */
  radius?: number
}) {
  const sun = useMemo<Vec3>(() => {
    const azimuth = (light.azimuth * Math.PI) / 180
    const elevation = (light.elevation * Math.PI) / 180
    const distance = 19
    return [
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    ]
  }, [light.azimuth, light.elevation])

  /**
   * The neon rig: no ambient, three colours, three angles.
   *
   * A branch inside `Rig` rather than a second component, so every surface that
   * already takes a `LightSpec` - the baked shots, the backoffice image studio,
   * the video studio - gets the preset for free the moment it can set the
   * field. A parallel `<NeonRig>` would have meant three call sites choosing
   * between two components and the studio's own light panel driving only one
   * of them.
   *
   * Ambient and hemisphere are *dropped*, not dimmed. The gaps between the
   * three colours are the whole effect, and any ambient at all lifts the faces
   * the colours miss back out of black - which is exactly what the first
   * attempt at these shots did.
   *
   * The violet is the only caster: on a dense pile, three shadow-casting lights
   * is three overlapping maps and a mush of half-shadows. The other two only
   * separate silhouettes, and both are deliberately short-range - on objects
   * that already have their own bright colours, a long-throw green stops being
   * a rim and turns the whole subject green.
   */
  if (light.preset === 'neon') {
    return (
      <>
        <directionalLight
          position={sun}
          intensity={5.4 * light.sun}
          color="#b8a5ff"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-camera-left={-radius}
          shadow-camera-right={radius}
          shadow-camera-top={radius}
          shadow-camera-bottom={-radius}
        />
        {/* Green, low and camera-right, catching undersides the key cannot. */}
        <pointLight position={[8, -1.5, 6]} intensity={95 * light.rim} color="#16a34a" distance={22} />
        {/* Yellow, behind and above, drawing the top edge of every piece. This
            is what keeps the back half of a pile from merging into one shape. */}
        <pointLight position={[3.5, 8, -9]} intensity={180 * light.rim} color="#facc15" distance={20} />
        {/* A weak violet opposite the key, so the shadow side has a colour
            rather than only an absence. Any brighter and it is an ambient. */}
        <pointLight position={[-9, 2, -6]} intensity={120 * light.rim} color="#7c3aed" distance={30} />
      </>
    )
  }

  return (
    <>
      <ambientLight intensity={light.ambient} color="#fff6ea" />
      <hemisphereLight args={['#bcd6ff', '#3f6b34', light.hemisphere]} />
      <directionalLight
        position={sun}
        intensity={light.sun}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-camera-left={-radius}
        shadow-camera-right={radius}
        shadow-camera-top={radius}
        shadow-camera-bottom={-radius}
      />
      <pointLight
        position={[-10, 6, -8]}
        intensity={90 * light.rim}
        color="#f0abfc"
        distance={40}
      />
      <pointLight
        position={[8, 4, 10]}
        intensity={45 * light.rim}
        color="#67e8f9"
        distance={40}
      />
    </>
  )
}
