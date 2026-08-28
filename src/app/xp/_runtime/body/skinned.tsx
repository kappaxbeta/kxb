'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { modelUrl, splitModel, type SkeletonId } from '@kxb/xp/packs'
import { denser, type XpClip } from '@kxb/xp/clips'
import type { XpMaterial } from '@kxb/xp'
import { useRainbowMaterial } from '@/app/xp/_runtime/world/rainbow'
import { PeerGlow } from '@/app/xp/_runtime/body/glow'
import { gripFrame } from '@/app/xp/_runtime/body/grip'
/**
 * From the file rather than the `Addons.js` barrel.
 *
 * The barrel re-exports every example module three ships, one of which reaches
 * for `lottie-web` from a CDN at import time - which fails outright outside a
 * browser and drags a loader nothing here uses into the bundle inside one.
 * Found by trying to load a body in a test; the specific path costs nothing and
 * has neither problem.
 */
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { bonesFor, gestureOf, layerOf } from '@/app/xp/_runtime/body/layers'
import {
  easeSpeed,
  isGesture,
  motionFor,
  poseFor,
  rateFor,
  type Gesture,
  type Motion,
} from '@/app/xp/_runtime/body/motion'

/**
 * A body with bones in it.
 *
 * Everything else in this runtime is an `InstancedMesh` with baked part
 * transforms, which is right for a level - a thousand walls are one draw call
 * and none of them move on their own. It is exactly wrong for a person: an
 * instanced mesh has one geometry shared by every instance, and a skinned pose
 * is a *different* geometry per body. So bodies get their own path, and only
 * bodies.
 *
 * ---------------------------------------------------------------------------
 * The clips already fit the body we draw
 * ---------------------------------------------------------------------------
 * `Dummy.glb` is skinned and its 23 joints are exactly `Rig_Medium`'s 23, name
 * for name. three.js binds an animation track to a bone by name, so the pack's
 * clips play on it with no retargeting - which is the one thing §F warns can go
 * badly ("a clip on the wrong rig is a body folded inside out") and the one
 * thing that turned out not to be a problem.
 *
 * ---------------------------------------------------------------------------
 * Two things that are load-bearing and look like boilerplate
 * ---------------------------------------------------------------------------
 * **`SkeletonUtils.clone`, not `scene.clone()`.** `useGLTF` caches by URL and
 * hands every caller the same object. A plain clone copies the meshes and leaves
 * them bound to the *original* skeleton, so two people in a room share one pose
 * and the second one to move drags the first around with it. `SkeletonUtils`
 * rebuilds the bone graph and rebinds - it is the difference between two bodies
 * and one body drawn twice.
 *
 * **One mixer per body.** A mixer owns time. Sharing one would mean everybody in
 * the room is at the same frame of the same walk cycle, which reads as a chorus
 * line rather than a crowd.
 */

/**
 * Where the clips live.
 *
 * A path rather than `modelUrl`, because the animation pack is not registered in
 * the catalogue - it holds clips rather than models, and `xp:pack` reports it as
 * unregistered for that reason. Registering it would mean claiming eight glTFs
 * are placeable art, which they are not.
 */
const CLIPS = '/xp/packs/animation/Rig_Medium'

/**
 * The two files the movement clips are cut across.
 *
 * `Idle_A` is in `General` and the walk, run and jump are in `MovementBasic`,
 * which is a fact about how the pack was published rather than about what a body
 * does - `poseFor` names clips and this is the only place that knows where they
 * came from.
 */
const SOURCES = [
  `${CLIPS}/Rig_Medium_MovementBasic.glb`,
  `${CLIPS}/Rig_Medium_General.glb`,
  `${CLIPS}/Rig_Medium_CombatRanged.glb`,
  // The swings. A level that binds `attack` had a key that changed the world
  // and moved nobody, because the only melee clips in the pack were in a file
  // nothing fetched.
  `${CLIPS}/Rig_Medium_CombatMelee.glb`,
]

/**
 * How long a body takes to go down, in seconds.
 *
 * Slower than a stumble and faster than a swoon. Long enough to read as a fall
 * that had weight, short enough that whoever did it is still looking - a death
 * nobody sees is a death that may as well have been a body vanishing, which is
 * the thing this replaces.
 */
const FALL_SECONDS = 0.55

/** Flat on its back. */
const HALF_TURN = Math.PI / 2

/**
 * How far into the floor a lying body settles, in cells.
 *
 * A model's origin is between its feet, so a body tipped flat about that point
 * has its whole depth above the ground and hangs over its own shadow. Sinking
 * about a third of a cell puts its back on the floor instead - measured by eye
 * on a peep, and generous enough not to leave a taller one floating.
 */
const SINK = 0.3

/** How long one clip takes to become another. */
const BLEND = 0.15

/**
 * How long a gesture takes to come on and go off again.
 *
 * Shorter than `BLEND`, and both ends matter for different reasons. Coming on,
 * a punch is a fast thing and a fade you can see is a punch that starts as a
 * suggestion. Going off, it is the opposite worry: an additive layer that
 * snapped to zero would put the arms back mid-swing in one frame, which reads
 * as the animation being cut rather than finished.
 */
const GESTURE_BLEND = 0.08

/**
 * The bone a held thing hangs from, by the names three gives them.
 *
 * `GLTFLoader` strips the dots - `handslot.r` in the file arrives as
 * `handslotr` - so these are the runtime names rather than the authored ones.
 * The list is a preference order: the dummy has a slot authored for exactly this
 * and a plain hand bone behind it, and a body with neither simply does not get
 * to hold anything.
 */
export const HANDS = ['handslotr', 'handr', 'handslotl', 'handl']

/**
 * A thing in a hand: what to draw, and where it sits.
 *
 * The transform is the document's `player.weapon` grip, passed through rather
 * than re-derived — `simulation.tsx` is where the blueprint and the pack scale
 * are both already known.
 */
export interface Held {
  url: string
  /** The pack's scale times whatever the document asked for. */
  scale: number
  x?: number
  y?: number
  z?: number
  /** Degrees. Applied yaw, then pitch, then roll. */
  pitch?: number
  yaw?: number
  roll?: number
}

/**
 * A document's held thing, resolved to what the hand bone needs.
 *
 * Lifted out of the simulation's memo so the pose editor can hold the same
 * object the game does: the blueprint names the model, the pack knows its
 * scale, and the grip passes through whole. Undefined when nothing is held or
 * the blueprint has no model - a `Held` with no file would be a fetch of
 * nothing.
 */
export function heldFrom(
  held:
    | {
        blueprint: string
        x?: number
        y?: number
        z?: number
        pitch?: number
        yaw?: number
        roll?: number
        scale?: number
      }
    | undefined,
  blueprints: Readonly<Record<string, { model?: string }>>,
): Held | undefined {
  const model = held ? blueprints[held.blueprint]?.model : undefined
  if (!held || !model) return undefined
  const pack = splitModel(model)?.pack
  return {
    url: modelUrl(model),
    scale: (pack?.scale ?? 1) * (held.scale ?? 1),
    ...(held.x !== undefined ? { x: held.x } : {}),
    ...(held.y !== undefined ? { y: held.y } : {}),
    ...(held.z !== undefined ? { z: held.z } : {}),
    ...(held.pitch !== undefined ? { pitch: held.pitch } : {}),
    ...(held.yaw !== undefined ? { yaw: held.yaw } : {}),
    ...(held.roll !== undefined ? { roll: held.roll } : {}),
  }
}

/**
 * Something to hand `useGLTF` when there is nothing to hold.
 *
 * Hooks cannot be conditional and `useGLTF(undefined)` throws, so an empty hand
 * loads the body it is already loading. One cached fetch, never attached.
 */
const HELD_NOTHING = '/xp/packs/dummy/Dummy.glb'

export interface Motive {
  /** Horizontal speed in cells a second, and whether the feet are down. */
  speed: number
  grounded: boolean
  velocityY: number
}

/**
 * One animated body, on whichever of the two rigs it is.
 *
 * ---------------------------------------------------------------------------
 * Why the clips arrive as a prop rather than being loaded here
 * ---------------------------------------------------------------------------
 * The two rigs get their clips from opposite places. The dummy's are a shared
 * pack of four glTFs fetched by path - 139 clips, one download for the whole
 * room. A peep's eight live *inside its own file*, so there is nothing extra to
 * fetch and nothing shared between the twenty-four animals.
 *
 * Both of those are `useGLTF` calls, and hooks cannot be conditional. Loading
 * both unconditionally would mean a level made entirely of foxes downloading
 * four rigged human glTFs it will never draw a frame of. So the choice is made
 * at a *component boundary* - `SkinnedBody` below picks one of two thin wrappers
 * - and everything from here down is the half that is the same either way.
 */
/**
 * Put a look on a body's meshes, if it is not already wearing it.
 *
 * Out here rather than inside the component for the reason `windSweep` in
 * ./rainbow is: this writes to objects a memo owns, which is imperative
 * renderer state, and React's compiler refuses a function declared during
 * render that does it. A plain function taking everything it touches as an
 * argument is neither a memo nor a ref, and it is honest about what it does.
 *
 * `worn` is the guard rather than a comparison per mesh: walking a skeleton
 * sixty times a second to write back the material that is already there is work
 * for nothing, and `material` is a setter three watches.
 */
function dress(
  own: ReadonlyMap<THREE.Mesh, THREE.Material | THREE.Material[]>,
  worn: React.RefObject<XpMaterial | null>,
  rainbow: THREE.Material,
  look: XpMaterial,
) {
  if (worn.current === look) return
  worn.current = look
  for (const [mesh, original] of own) {
    mesh.material = look === 'rainbow' ? rainbow : original
  }
}

function Body({
  rig,
  clips,
  url,
  scale,
  lift,
  sample,
  holding,
  rest,
  wears,
  children,
}: {
  rig: SkeletonId
  /** Every clip this body can play, by name. See the note above. */
  clips: Map<string, THREE.AnimationClip>
  url: string
  scale: number
  /**
   * How far above its origin the model stands, in **world units**.
   *
   * Already multiplied by the body's scale by the caller rather than scaled
   * here, because the pack's own lift and the pack's own scale are two different
   * numbers and only the caller has both. Doing the arithmetic here would mean
   * passing both in so it could be got wrong in one more place.
   */
  lift: number
  /**
   * Where this body is, asked once a frame.
   *
   * A function rather than a ref, and that is what lets each body own its own
   * state: the *parent* used to keep a map of refs and hand one to each child,
   * which meant reading refs during render - which React's compiler refuses, and
   * rightly, since a render-time read of a frame-time value is how the two come
   * to disagree. A closure costs one allocation per render, and renders here
   * happen when somebody joins or leaves.
   */
  sample: (now: number) => {
    x: number
    y: number
    z: number
    facing: number
    /**
     * Whether they are dancing, straight off the wire.
     *
     * The one animation fact a sample carries rather than one this file derives -
     * see `Sample.dance` in `@kxb/xp/presence` for why a stance has to be said
     * when a gait does not. Read where the crowd is sampled below and turned into
     * the `motion` beneath it; nothing else in here looks at it.
     */
    dance?: boolean
    /** Whether they have gone down. The other stance that cannot be derived. */
    down?: boolean
    /**
     * True while this is the last thing they said rather than a point between
     * two samples - which is to say, while nothing has arrived and the position
     * is frozen for want of news.
     *
     * `Crowd` has computed this since it was written and nothing read it. It is
     * the difference between "they are standing still" and "we do not know", and
     * conflating the two is what made peers stutter. See `easeSpeed`.
     */
    settled?: boolean
    /**
     * Where in its clip this body should be, in seconds.
     *
     * When present the mixer stops running on its own and is *placed*: the clip
     * is evaluated at exactly this time and advanced by nothing. That is what
     * makes scrubbing mean anything - a pose clip is an animation now, and a
     * paused playhead over a clip that keeps playing shows a moment nobody
     * asked for.
     *
     * Absent is a clip running at its own pace, which is every body in a level
     * and is why this is opt-in. Crossfades do not happen while it is set, and
     * should not: a blend is a thing that takes time, and here there is none.
     */
    hold?: number
    /**
     * What this body is made of, this frame.
     *
     * Beside `clip` and for its reason word for word: a rule or a script can
     * change it on any frame, and a prop would be a re-render of the whole tree
     * every time something started glowing. The sample is already the
     * once-a-frame channel between the world and a body, so the look rides it.
     *
     * Absent leaves the `wears` prop in charge, which is how the *player's* own
     * body says it - there the answer is known at render and never changes
     * inside a frame.
     */
    wears?: XpMaterial
    /**
     * A motion to play instead of the one movement implies.
     *
     * For the states no amount of looking at a body can tell you - being dead,
     * or the kick of a shot, since a corpse and somebody standing still report
     * the same speed and the same footing. Whoever knows hands it in; `motionFor`
     * decides the rest. See ./motion.
     *
     * Here rather than a prop, which is what it was: the things that know are a
     * countdown and a timer that live in refs, and a prop would mean reading
     * `.current` during render - which React's compiler refuses, and rightly. It
     * is a per-frame fact and this is the per-frame question.
     */
    motion?: Motion
    /**
     * A clip a script asked for, which replaces everything else.
     *
     * The one channel that outranks the stance machine, and deliberately: a
     * script saying `runAnimation('Cheer')` has said something specific, and a
     * body that kept walking through it would be a call that did nothing
     * visible. `at` is what makes the *same* clip twice two events - see the
     * note on `clip` in `@kxb/xp/engine`.
     *
     * Only entities carry one. A player's body is animated from how it moves
     * and from the gestures below, which is the host's business rather than the
     * document's.
     */
    clip?: { name: string; loop: boolean; at: number; parts?: readonly string[] }
  } | null
  /**
   * Something held in the hand, hung off the *bone* rather than an offset.
   *
   * A blueprint `socket` is a fixed `{x, y, z}` from the body's origin - the
   * shooter's `hand` is (0.32, 1.15, 0.34), which is a decent guess at where a
   * hand is while the body stands still and a completely wrong one the moment it
   * swings an arm. That was invisible while nothing moved. It is the first thing
   * anybody will notice now that everything does.
   *
   * So the gun becomes a *child of the hand bone* and inherits the animation for
   * free. The socket offset is deliberately not applied on top: it was standing
   * in for the bone's position, not offset from it, so adding it would move the
   * gun a metre out of the hand it was approximating.
   */
  holding?: Held | undefined
  /**
   * The clip this body holds when it is standing still, from its blueprint.
   *
   * Absent is the ordinary case and means `poseFor` decides, which is what
   * every body did before a document could say otherwise.
   */
  rest?: string | undefined
  /**
   * Anything that should ride along above this body — today, an emote.
   *
   * Inside the group that is positioned every frame, so whatever is put here
   * follows the body without a second copy of the interpolation. `children`
   * rather than an `emote` prop deliberately: this component knows how to place
   * a body and nothing about what a face means, and the day something else
   * wants to float over somebody's head it needs no change here at all.
   */
  /**
   * What this body is made of, when it is not made of its own model.
   *
   * Swapped onto the clone rather than into a group key, which is what the
   * *instanced* path does - and the difference is honest rather than an
   * inconsistency: an `InstancedMesh` has one material for every slot, so there
   * two looks are two buffers. A skinned body already owns its own clone of the
   * scene, so its material is a field on a mesh nobody else is holding.
   */
  wears?: XpMaterial
  children?: React.ReactNode
}) {
  const { scene } = useGLTF(url)
  /**
   * Loaded unconditionally, because hooks cannot be conditional.
   *
   * `HELD_NOTHING` is a real model that every document already ships rather than
   * an empty string, since `useGLTF` on nothing throws. It is never attached -
   * see below - so it costs one cached fetch and no draw.
   */
  const held = useGLTF(holding?.url ?? HELD_NOTHING)

  /** This body's own copy, with its own skeleton. See the note above. */
  const body = useMemo(() => cloneSkinned(scene), [scene])

  const rainbow = useRainbowMaterial()

  /**
   * The look, put on and taken off again.
   *
   * The model's own materials are remembered on the way in rather than read
   * back from the cached glTF, because `SkeletonUtils.clone` shares material
   * *references* with the source: writing the original back from `scene` would
   * work, and reaching into the shared object to find it is exactly how a body
   * that stopped glowing takes the whole pack's crates with it one day. A map
   * per body costs a handful of entries and cannot do that.
   *
   * In an effect and not a memo: this mutates renderer state on an object the
   * memo above owns, which is the thing a memo body may not do.
   */
  const own = useMemo(() => {
    const table = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    body.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.isMesh && mesh.material) table.set(mesh, mesh.material)
    })
    return table
  }, [body])

  /**
   * What is on the meshes right now, so the swap happens on the frame it
   * changes and not on every frame.
   *
   * Walking a skeleton's meshes sixty times a second to write the same material
   * back is work for nothing, and `material` is a setter three watches - so this
   * is the same guard `clip` has one field up: an event, remembered, and acted
   * on once.
   */
  const worn = useRef<XpMaterial | null>(null)

  // The prop's answer, for a body whose look is known at render - the player's
  // own. A sample carrying one overrides it every frame below.
  useEffect(() => {
    dress(own, worn, rainbow, wears ?? 'own')
  }, [own, rainbow, wears])

  /**
   * The held thing, parented to the hand bone.
   *
   * Done in the memo that builds the body rather than in a frame, because it is
   * a change to the *scene graph* and the graph is built once. Once it is a child
   * of the bone, three composes it with the animated pose every frame and this
   * file never touches it again - which is the whole reason to do it this way
   * rather than by copying a matrix.
   */
  const armed = useMemo(() => {
    if (!holding) return null

    let bone: THREE.Object3D | null = null
    body.traverse((node) => {
      if (!bone && HANDS.includes(node.name)) bone = node
    })
    if (!bone) return null

    const item = cloneSkinned(held.scene)
    /**
     * Undo the body's own scale.
     *
     * The bone is inside a body drawn at the pack's scale, so a child of it
     * inherits that scale on top of its own. Without this a gun on a body scaled
     * to 1.6 arrives 1.6 times too big, which reads as a comedy prop.
     */
    const undo = 1 / (scale || 1)
    item.scale.setScalar(holding.scale * undo)

    /**
     * Which way the *bone* is pointing before anything animates it.
     *
     * The fix for the second half of "the weapon is not in the right position",
     * reported again as *"in third person the weapon should rotate 45 degrees so
     * it faces where you look"*. A hand slot is a bone, and a bone's axes are
     * whoever rigged it's business: `handslot.r` in `Dummy.glb` has its +z
     * pointing at the **sky** in the rest pose. A gun authored with its barrel
     * along its own +z - which is every gun in the prototype pack - therefore
     * arrived aimed straight up, and the only way out was for every document to
     * dial in a rotation nobody could derive without opening the glTF.
     *
     * So the grip is taken *relative to the body* instead: the bone's rest
     * orientation is measured once and divided out, which makes an unturned gun
     * point exactly where the body is facing and stand the right way up. That is
     * the frame an author can actually reason about - `yaw: 45` means forty-five
     * degrees off where you are looking - and it is the same frame ./viewmodel
     * puts the first-person one in, so one document reads the same in both views.
     *
     * **Against the body and not against the world**, which is the whole reason
     * this is a function in ./grip with tests under it. Measuring it with
     * `getWorldQuaternion` reads the clone where it already hangs - under a
     * group turned to face wherever the player is looking - so the correction
     * carries the body's *heading* in it and welds the gun to a compass
     * direction. It keeps pointing north while the body turns underneath, which
     * is what "the weapon position was stuck" looks like from the outside. That
     * shipped, and somebody found it by playing.
     */
    const rest = gripFrame(bone as THREE.Object3D, body)

    /**
     * The grip: where it sits in the hand, and how it is turned there.
     *
     * Until the document could say this, the *model's own origin* decided
     * everything - which is right for a gun authored around its grip and puts a
     * centred one through the body's chest. All of it defaults to nothing, so a
     * document that says none of it is now drawn pointing forward.
     *
     * The offset is divided by the body's scale for the same reason the size is:
     * these are cells in the world, and the bone is inside something already
     * scaled. Doing it here rather than asking an author to pre-divide is the
     * difference between a number they can reason about and one they discover.
     * It is turned by `rest` as well, so "a tenth of a cell forward" means
     * forward for the body rather than forward for a bone.
     */
    item.position
      .set((holding.x ?? 0) * undo, (holding.y ?? 0) * undo, (holding.z ?? 0) * undo)
      .applyQuaternion(rest)
    // `YXZ`, so the angles are applied yaw, pitch, roll - the order the format
    // documents, and the one that makes each control feel like the thing it is
    // named after when the other two are not zero.
    item.quaternion.copy(rest).multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(holding.pitch ?? 0),
          THREE.MathUtils.degToRad(holding.yaw ?? 0),
          THREE.MathUtils.degToRad(holding.roll ?? 0),
          'YXZ',
        ),
      ),
    )
    ;(bone as THREE.Object3D).add(item)
    return item
  }, [body, held.scene, holding, scale])

  const mixer = useMemo(() => new THREE.AnimationMixer(body), [body])
  const playing = useRef<{
    motion: Motion
    armed: boolean
    /**
     * The `rest` clip this action was chosen under.
     *
     * Remembered for the same reason `armed` is, and it was the same bug one
     * step later: the stance machine only re-picks a clip when the *motion*
     * changes, so a body standing still when its pose arrives kept whatever it
     * was already doing. `blueprint.pose` set at load happened to work - there
     * was no action yet, so `playing.current === null` carried it - and a pose
     * that *arrives* did not, which is every pose an editor writes while
     * somebody is looking at the body.
     */
    rest: string | undefined
    /**
     * The clip object itself, not only its name.
     *
     * A pose being *edited* keeps its name and changes its contents - the
     * editor rewrites `pose-<body>` on every turn of a bone - so a guard that
     * compares names alone sees nothing to do and the mixer keeps playing the
     * clip it bound the first time. What that looks like is a body that takes
     * the first bone you turn and then ignores every one after it, which is the
     * report *"I can't see in realtime when I change something in the bones"*.
     */
    clip: THREE.AnimationClip
    action: THREE.AnimationAction
  } | null>(
    null,
  )
  const motion = useRef<Motion>('idle')
  /**
   * The clip a script asked for, while it is running.
   *
   * Null whenever the body is animating itself, which is every body in every
   * document that never calls `runAnimation`. `action` is null for a name the
   * host did not load - remembered rather than retried, so a script asking for
   * a clip that is not in the pack costs one lookup instead of one a frame.
   */
  const scriptClip = useRef<{
    name: string
    at: number
    loop: boolean
    /** Over the stance rather than instead of it. Set by a `parts` list. */
    layered: boolean
    action: THREE.AnimationAction | null
  } | null>(null)
  /**
   * The upper-body layer: what is being swung, and what it is swinging.
   *
   * `gesture` is the name currently on screen, so a `shoot` held for the whole
   * recoil window starts one action rather than one a frame. Null between
   * gestures, which is what makes the *next* punch an edge - see ./layers for
   * why the two layers exist at all.
   *
   * The masked, additive clips are cached per name and per body. Per name
   * because `makeClipAdditive` is not free and a body punching four times a
   * second would pay for it four times; per body rather than per module because
   * these are cheap and a module-level cache outlives the room.
   */
  const gesture = useRef<{ name: Gesture; armed: boolean; action: THREE.AnimationAction } | null>(
    null,
  )
  /**
   * A ref rather than a memo, which the compiler is right about.
   *
   * It is written from inside `useFrame` - a masked clip is built the first time
   * a body throws that particular swing - and a `useMemo` result mutated after
   * render is a value React is entitled to assume is stable. Every other piece
   * of per-frame state in this file is already a ref for the same reason.
   */
  const layers = useRef(new Map<string, THREE.AnimationClip | null>())
  const group = useRef<THREE.Group>(null)
  /** Where it was last frame, which is the only way to know how fast it is going. */
  const was = useRef<{ x: number; y: number; z: number } | null>(null)
  /**
   * The smoothed speed, which is what the legs are actually driven by.
   *
   * Kept across frames because `easeSpeed` needs the previous answer, and per
   * body because two people on the same screen have their own networks. See
   * ./motion for why the raw measurement is unusable.
   */
  const pace = useRef(0)
  /**
   * How far into the fall a body that has gone down is, in seconds.
   *
   * Zeroed the moment it is anything but dead, so a respawn stands the body
   * straight back up - and so somebody who dies twice falls twice rather than
   * being already flat the second time.
   */
  const fell = useRef(0)

  /**
   * Let go of the mixer when the body does.
   *
   * A mixer holds bindings into the skeleton, and a room somebody joins and
   * leaves repeatedly would otherwise accumulate one per visit.
   */
  useEffect(() => {
    return () => {
      mixer.stopAllAction()
      // Taken off the bone as well, so a body that comes back does not arrive
      // holding two of everything.
      armed?.removeFromParent()
    }
  }, [mixer, armed])

  useFrame((_state, rawDelta) => {
    const node = group.current
    if (!node) return

    const delta = Math.min(rawDelta, 0.05)
    const spot = sample(performance.now())
    /**
     * A body with no packet yet is hidden rather than drawn at the origin - the
     * same rule the rings follow, and for the same reason: somebody standing in
     * the middle of the level who is not there is worse than an absence.
     */
    if (spot?.wears !== undefined) dress(own, worn, rainbow, spot.wears)

    node.visible = spot !== null
    if (!spot) {
      was.current = null
      pace.current = 0
      return
    }

    node.position.set(spot.x, spot.y + lift, spot.z)
    node.rotation.y = (spot.facing * Math.PI) / 180

    /**
     * Speed and footing, **derived rather than sent.**
     *
     * The same argument `./teams` makes about sides, and it pays the same way:
     * the wire carries four numbers at 8 Hz, and two more per person forever
     * would be paying for something the receiver can work out. Measured against
     * the *interpolated* position, which is what is actually drawn - so the walk
     * cycle stays in step with the feet somebody is looking at rather than with
     * the packets behind them.
     *
     * Footing is the honest approximation: a body whose height is changing is in
     * the air. Right whenever it matters - a jump, a fall - and wrong only in a
     * case nobody can see.
     */
    const lastY = was.current ? (spot.y - was.current.y) / delta : 0
    /**
     * `null` on the frames there is nothing to measure.
     *
     * Two of them: the first frame, where there is no previous position, and any
     * frame where the buffer is holding a settled sample - a frozen position is
     * an absence of news rather than evidence of standing still. `easeSpeed`
     * holds the previous answer through both. See ./motion.
     */
    const measured =
      was.current && !spot.settled
        ? Math.hypot(spot.x - was.current.x, spot.z - was.current.z) / delta
        : null
    pace.current = easeSpeed(pace.current, measured, delta)

    const motive: Motive = {
      speed: pace.current,
      // Footing is the honest approximation: a body whose height is changing is
      // in the air. Right whenever it matters - a jump, a fall - and wrong only
      // in a case nobody can see. Held through a settled sample for the same
      // reason the speed is: a frozen `y` is not a measurement of standing.
      grounded: spot.settled ? true : Math.abs(lastY) < 0.5,
      velocityY: spot.settled ? 0 : lastY,
    }
    was.current = { x: spot.x, y: spot.y, z: spot.z }

    /**
     * What the legs are doing, and what the arms are doing, asked separately.
     *
     * The wire is unchanged and deliberately so: a sample still carries **one**
     * `motion`, because the stance is already derived here from the interpolated
     * position - the same argument this file makes two blocks up about speed and
     * footing being worked out rather than sent. So a `shoot` arriving over the
     * network is read as "this person is shooting", and whether they are
     * shooting while walking is a question the receiver can already answer by
     * looking at where they were last frame.
     *
     * Which is the whole fix. Before this, a sent gesture *was* the motion, so
     * the walk it happened during was thrown away by the sender and could not be
     * recovered by anybody. Now nothing is thrown away, because the stance was
     * never the sender's to know.
     */
    const sent = spot.motion ?? null
    const swing = sent !== null && isGesture(sent) ? sent : null
    const next = sent !== null && !isGesture(sent) ? sent : motionFor(motive, motion.current)

    /**
     * Going down, which is a transform rather than a clip.
     *
     * -------------------------------------------------------------------------
     * Why this is not `poseFor('dead')`
     * -------------------------------------------------------------------------
     * The dummy rig has a real `Death_A` and plays it. The peep pack has no
     * death at all - eight clips, none of them falling over - so `peepPose` sends
     * `dead` to `static`, which is honest and reads as a body that has simply
     * stopped. Asked for as *"a die animation, like it sinks on the back"*, and
     * that is a thing you can do to any body without a clip for it: tip it over
     * and let it settle into the floor.
     *
     * So the *clip* stays whatever the rig has and this happens on top of it,
     * which is why it is the whole group rather than the model - and why it works
     * for both rigs without either of them needing to own a death.
     *
     * `YXZ` is what makes it fall **backwards** instead of sideways. The default
     * order applies the tip about the world's X axis, so a body facing along Z
     * would keel over to one side; with the yaw first, the tip is about the
     * body's own side axis whichever way it is turned. The same order
     * `./live.tsx` composes its tilted placements in, for the same reason.
     *
     * Eased rather than linear, and the ease is where the *weight* is: a body
     * falls slowly for the first instant and then goes, which a straight ramp
     * reads as a plank being lowered.
     */
    if (next === 'dead') fell.current = Math.min(FALL_SECONDS, fell.current + delta)
    else fell.current = 0

    if (fell.current > 0) {
      const t = fell.current / FALL_SECONDS
      const over = t * t
      node.rotation.order = 'YXZ'
      node.rotation.x = -HALF_TURN * over
      // Into the floor rather than onto it, which is what stops a lying body
      // hovering over its own shadow: a model's origin is between its feet, so a
      // body rotated flat about that point sits half its depth in the air.
      node.position.y -= SINK * over
    }

    /**
     * A script's own clip, which outranks the stance machine while it runs.
     *
     * `runAnimation` is a specific instruction and a body that carried on
     * walking through it would be a call that did nothing. So the stance is
     * suspended, not blended: this is the *whole* body, unlike a gesture, which
     * is why a script asking for `Walking_A` gets a walk rather than an argument
     * with one.
     *
     * A one-shot hands the body back when it ends - `asked.loop` false and the
     * action past its own duration - rather than holding the last frame the way
     * a landing does. A wave that left the arm up would be a wave nobody would
     * use twice. A looping one runs until the script says otherwise.
     */
    const asked = spot.clip
    /**
     * Named parts make it a layer; no parts make it the body.
     *
     * The whole distinction, and it is the one an author actually reasons
     * about. `runAnimation('Death_A')` is a thing happening *to* the body and
     * should replace what it was doing. `runAnimation('Wave', true, ['arms'])`
     * is a thing happening *as well*, and a body that stopped walking to wave
     * would be a worse answer than the one the caller asked for.
     */
    const layered = asked?.parts !== undefined && asked.parts.length > 0
    const fresh = asked && (asked.at !== scriptClip.current?.at || asked.name !== scriptClip.current.name)

    if (fresh && asked && !layered) {
      const clip = clips.get(asked.name)
      if (clip) {
        const action = mixer.clipAction(clip)
        action.reset()
        action.setLoop(asked.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
        action.clampWhenFinished = !asked.loop
        action.play()
        if (playing.current) action.crossFadeFrom(playing.current.action, BLEND, true)
        // Taken over from the stance machine. Nulling `playing` is deliberate:
        // when this ends, the stance block sees no current action and starts the
        // right one cleanly rather than crossfading from a stopped one.
        playing.current = null
        motion.current = 'idle'
        scriptClip.current = { name: asked.name, at: asked.at, loop: asked.loop, action, layered: false }
      } else {
        // A name the host did not load. Remembered rather than retried, so a
        // script asking for a clip that is not in the pack costs one lookup
        // instead of one a frame - and the body keeps doing what it was doing,
        // the same contract `blueprint.pose` has.
        scriptClip.current = { name: asked.name, at: asked.at, loop: asked.loop, action: null, layered: false }
      }
    }

    if (fresh && asked && layered) {
      const key = `${asked.name}::${asked.parts!.join(',')}`
      let layer = layers.current.get(key)
      if (layer === undefined) {
        const source = clips.get(asked.name)
        layer = source ? layerOf(source, bonesFor(asked.parts!, rig), key) : null
        layers.current.set(key, layer)
      }
      scriptClip.current?.action?.fadeOut(GESTURE_BLEND)
      if (layer) {
        const action = mixer.clipAction(layer, undefined, THREE.AdditiveAnimationBlendMode)
        action.reset()
        action.setLoop(asked.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
        action.clampWhenFinished = !asked.loop
        action.fadeIn(GESTURE_BLEND)
        action.play()
        scriptClip.current = { name: asked.name, at: asked.at, loop: asked.loop, action, layered: true }
      } else {
        scriptClip.current = { name: asked.name, at: asked.at, loop: asked.loop, action: null, layered: true }
      }
    }

    /**
     * Cleared when the request goes away, and when a one-shot has run out.
     *
     * A one-shot hands the body back rather than holding its last frame the way
     * a landing does: a wave that left the arm up is a wave nobody would use
     * twice. A looping one runs until the script says otherwise.
     */
    if (scriptClip.current && !asked) {
      scriptClip.current.action?.fadeOut(scriptClip.current.layered ? GESTURE_BLEND : BLEND)
      scriptClip.current = null
    } else if (scriptClip.current && !scriptClip.current.loop && scriptClip.current.action) {
      const clip = scriptClip.current.action.getClip()
      if (scriptClip.current.action.time >= clip.duration - 1e-3) {
        scriptClip.current.action.fadeOut(scriptClip.current.layered ? GESTURE_BLEND : BLEND)
        scriptClip.current = null
      }
    }

    /**
     * Whether there is anything in the hand, read once for both layers.
     *
     * It used to sit just above the stance because the stance was the only
     * thing that asked. Both layers ask now - an armed body swings a different
     * clip as well as standing in a different pose - and one answer read twice
     * is a body that could disagree with itself about what it is holding.
     */
    const armed = holding !== undefined

    /**
     * The gesture layer, started on the edge and left alone after it.
     *
     * `swing` stays set for as long as the sender says so - a whole recoil
     * window, a whole flinch - so the comparison is against what is *already
     * playing* rather than against the previous frame's value. Restarting a
     * punch sixty times a second is a body vibrating with its arms out.
     *
     * `armed` is in the comparison for the reason it is in the stance's: the
     * clip for a swing depends on whether there is anything in the hand, and a
     * weapon arriving mid-gesture should finish with the right one.
     */
    if (swing === null) {
      if (gesture.current) {
        gesture.current.action.fadeOut(GESTURE_BLEND)
        gesture.current = null
      }
    } else if (gesture.current?.name !== swing || gesture.current.armed !== armed) {
      const pose = poseFor(swing, armed, rig)
      let layer = layers.current.get(pose.clip)
      if (layer === undefined) {
        const source = clips.get(pose.clip)
        // Cached even when it comes back null, so a clip with nothing above the
        // hips is masked once rather than on every press.
        layer = source ? gestureOf(source, rig) : null
        layers.current.set(pose.clip, layer)
      }
      if (layer) {
        gesture.current?.action.fadeOut(GESTURE_BLEND)
        const action = mixer.clipAction(layer, undefined, THREE.AdditiveAnimationBlendMode)
        action.reset()
        action.setLoop(THREE.LoopOnce, 1)
        // Held on the last frame rather than snapped back, and the last frame of
        // an additive clip is the pose it was authored from - so a finished
        // punch adds nothing, which is exactly what the fade is fading out of.
        action.clampWhenFinished = true
        action.fadeIn(GESTURE_BLEND)
        action.play()
        gesture.current = { name: swing, armed, action }
      }
    }
    /**
     * Picking a gun up changes the pose without changing the motion.
     *
     * An armed idle is a different clip from an unarmed one, so a body standing
     * still when a weapon arrives would otherwise keep its empty-handed stance
     * until it happened to walk. Compared rather than assumed, because "the
     * motion did not change" was the only condition here and it is no longer
     * the whole question.
     *
     * **And `rest` is the third of these**, found the same way and one step
     * later. A pose that is set at *load* works without it - there is no action
     * yet, so `playing.current === null` lets it through - and a pose that
     * *arrives* does not, because a body standing still has changed neither its
     * motion nor its weapon. Which is every pose the movie editor writes: the
     * clip was in the document, the right name reached this component as a prop,
     * and the body stood in its bind pose.
     */
    /**
     * The stance machine, suspended while a script owns the body.
     *
     * Without the guard it would notice on the very next frame that
     * `playing.current` is null and crossfade a walk straight over the clip that
     * had just been asked for - a `runAnimation` that lasted one frame. Nulling
     * `playing` above is deliberate for the other half of the same reason: when
     * the scripted clip ends, this sees no current action and starts the right
     * one cleanly rather than crossfading from a stopped one.
     */
    /**
     * The document's own pose, and only where it can mean anything.
     *
     * `Blueprint.pose` says what a body holds *at rest*, so it replaces the
     * idle and nothing else: a guard posted with `Ranged_1H_Aiming` still walks
     * with a walk and still falls with a fall. Anything wider would let a
     * document freeze a running body mid-stride, and whether the feet are
     * moving is the controller's to know.
     *
     * A name the loaded files do not hold falls back rather than sticking:
     * `clips.get` misses and the block below leaves whatever was playing. The
     * editor is what stops that happening, by offering only clips these files
     * carry.
     *
     * Resolved *before* the guard rather than inside it, because whether the
     * clip has been rewritten under the same name is now part of the question.
     */
    const held = next === 'idle' && rest ? { clip: rest, loop: true } : null
    const pose = held ?? poseFor(next, armed, rig)
    const clip = clips.get(pose.clip)

    /** The same pose, with different angles in it. See `playing.clip`. */
    const rewritten =
      playing.current !== null && clip !== undefined && playing.current.clip !== clip

    if (
      !(scriptClip.current && !scriptClip.current.layered) &&
      (next !== motion.current ||
        playing.current === null ||
        playing.current.armed !== armed ||
        playing.current.rest !== rest ||
        rewritten)
    ) {
      if (clip) {
        const action = mixer.clipAction(clip)
        action.reset()
        action.setLoop(pose.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
        // A one-shot that snapped back to the first frame would flick the body
        // into a landing crouch after it had finished landing.
        action.clampWhenFinished = !pose.loop
        action.play()
        /*
          A rewritten pose swaps; anything else blends.

          A crossfade is right when a body changes what it is *doing* - the
          quarter second is the weight of the change. It is wrong when the same
          pose has been edited, because then the quarter second is just lag: the
          slider moves and the body arrives after it, which reads as a control
          that is not connected to anything.

          And no crossfade at all when a timeline is *placing* the clip.

          A fade is weights moving over *mixer time*, and a placed body's mixer
          is advanced by nothing - so the fade would never progress: the new
          clip would sit at weight zero and the body would go on showing the old
          one for as long as the shot lasted. Silent, and it would have made
          every cue in a movie invisible.

          Nothing is lost. A blend takes time and a scrubbed frame has none: at
          3.8 seconds the body is doing what the shot says at 3.8 seconds, with
          no memory of what it was doing before.
        */
        if (playing.current && !rewritten && spot.hold === undefined) {
          action.crossFadeFrom(playing.current.action, BLEND, true)
        } else if (playing.current) {
          if (spot.hold !== undefined) action.setEffectiveWeight(1)
          playing.current.action.stop()
          /*
            Only a *rewritten* clip is uncached.

            That one is a per-edit object nothing will ask for again, and the
            mixer caches an action per clip - left alone, a minute of posing
            leaves a few thousand behind. The clip a placed body is leaving is
            usually a pack clip that every other body is also using, and
            uncaching that would take the idle away from all of them.
          */
          if (rewritten) mixer.uncacheClip(playing.current.clip)
        }
        playing.current = { motion: next, armed, rest, clip, action }
      }
      motion.current = next
    }

    if (playing.current) {
      playing.current.action.timeScale = rateFor(motion.current, motive.speed)
    }
    /*
      Placed, or advanced.

      See `hold` on the sample: a timeline that says where in the clip this
      body is gets an exact evaluation there, and everything else gets the
      ordinary step. The clamp on that step is the same one every other loop
      here uses - a tab returning from the background must not advance a walk
      cycle by a whole second.
    */
    if (spot.hold !== undefined && playing.current) {
      const span = playing.current.action.getClip().duration || 0.0001
      /*
        Wrapped when the clip loops, clamped when it does not.
        
        An idle held at `t` seconds would otherwise clamp to its last frame a
        few seconds into every shot and stand there - which looks exactly like
        the body having died quietly.
      */
      playing.current.action.time =
        playing.current.action.loop === THREE.LoopRepeat
          ? ((spot.hold % span) + span) % span
          : Math.max(0, Math.min(spot.hold, span))
      mixer.update(0)
    } else {
      mixer.update(delta)
    }
  })

  return (
    <group ref={group}>
      <primitive object={body} scale={scale} />
      {children}
    </group>
  )
}

/**
 * The level's own clips, as three.js clips, by name.
 *
 * ---------------------------------------------------------------------------
 * Built once for the room, not once per body
 * ---------------------------------------------------------------------------
 * A document's clips are baked samples - flat arrays of numbers - and turning
 * them into `AnimationClip`s is a walk over every one of them. Twenty people in
 * a room would do that twenty times for the same result, so the memo is keyed by
 * the block itself: the document does not change while a level is running, so
 * this runs once.
 *
 * Filtered by rig, because the two share not one bone name. A dummy clip handed
 * to a fox binds nothing and plays nothing, silently - so a fox is not offered
 * it at all, and `clips.get` misses in the one place that already knows what to
 * do about a miss.
 */
function useXpClips(
  rig: SkeletonId,
  carried: Readonly<Record<string, XpClip>> | undefined,
): Map<string, THREE.AnimationClip> {
  return useMemo(() => {
    const out = new Map<string, THREE.AnimationClip>()
    for (const [name, sparse] of Object.entries(carried ?? {})) {
      if (sparse.rig !== rig) continue
      /*
       * Eased segments filled in first.
       *
       * three interpolates a quaternion track linearly and has no smooth mode
       * for one, so a `smooth` on a pose sample is a field nothing would read.
       * `denser` bakes the shape into the *times* instead - and hands back
       * anything without eases untouched, which is every packed clip.
       */
      const clip = denser(sparse)
      const times = new Float32Array(clip.times)
      const tracks: THREE.KeyframeTrack[] = []
      for (const [bone, values] of Object.entries(clip.bones)) {
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, new Float32Array(values)))
      }
      // The root only when the clip actually moves it - see `XpClip.root`.
      if (clip.root) {
        tracks.push(new THREE.VectorKeyframeTrack('root.position', times, new Float32Array(clip.root)))
      }
      if (tracks.length > 0) out.set(name, new THREE.AnimationClip(name, clip.duration, tracks))
    }
    return out
  }, [rig, carried])
}

/** What a caller hands in, whichever rig the body turns out to be. */
type BodyProps = Omit<Parameters<typeof Body>[0], 'rig' | 'clips'> & {
  /**
   * Which skeleton this url is.
   *
   * Absent is the dummy, so every existing call site means what it always
   * meant. Handed in rather than derived from the url, because the caller has
   * the *model id* - `peepz/fox` - and `skeletonOf` answers this off the pack in
   * one lookup, where a url would have to be pattern-matched back into one.
   */
  rig?: SkeletonId
  /**
   * The clips this level carries itself, if it carries any.
   *
   * Merged *over* the pack's, so a level that authors its own `Idle_A` gets its
   * own - which is the reading somebody who went to the trouble of making one
   * would expect, and the only one that lets a level fix a clip it does not
   * like. The pack is the fallback, not the authority.
   */
  carried?: Readonly<Record<string, XpClip>>
}

/**
 * A body, on either rig.
 *
 * Two wrappers under one name, and the split is a hook problem rather than a
 * design one: each rig loads its clips from a different place, `useGLTF` is a
 * hook, and hooks cannot be conditional. A component boundary is the only place
 * a choice like that can be made - see the note on `Body`.
 */
export function SkinnedBody({ rig = 'dummy', ...props }: BodyProps) {
  return rig === 'peepz' ? <PeepBody {...props} /> : <DummyBody {...props} />
}

/** The pack's clips with the level's own laid over them. See `carried`. */
function merged(
  pack: Map<string, THREE.AnimationClip>,
  own: Map<string, THREE.AnimationClip>,
): Map<string, THREE.AnimationClip> {
  if (own.size === 0) return pack
  const all = new Map(pack)
  for (const [name, clip] of own) all.set(name, clip)
  return all
}

/**
 * The dummy's clips: four files, fetched once for the whole room.
 *
 * `useGLTF` caches by url, so the twentieth person in a level costs no download
 * at all - which is the whole reason it is worth this pack being shared rather
 * than baked into the body model.
 */
function DummyBody({ carried, ...props }: BodyProps) {
  const basic = useGLTF(SOURCES[0])
  const general = useGLTF(SOURCES[1])
  const ranged = useGLTF(SOURCES[2])
  const melee = useGLTF(SOURCES[3])

  const clips = useMemo(() => {
    const all = new Map<string, THREE.AnimationClip>()
    for (const clip of [
      ...basic.animations,
      ...general.animations,
      ...ranged.animations,
      ...melee.animations,
    ]) {
      all.set(clip.name, clip)
    }
    return all
  }, [basic.animations, general.animations, ranged.animations, melee.animations])

  const own = useXpClips('dummy', carried)
  return <Body rig="dummy" clips={merged(clips, own)} {...props} />
}

/**
 * A peep's clips: the eight inside its own file, and nothing else.
 *
 * The same `useGLTF(url)` call `Body` makes for the scene, which costs nothing -
 * it is one cached entry and this reads the other half of it. There is no pack
 * to fetch, no retargeting and no shared clip: a fox's walk is a fox's walk.
 *
 * Which also means a level of peeps downloads nothing beyond the animals it
 * draws. That is the saving the component split is for; loading `SOURCES`
 * unconditionally would have added four rigged human glTFs to a level that has
 * no humans in it.
 */
function PeepBody({ carried, ...props }: BodyProps) {
  const { animations } = useGLTF(props.url)

  const clips = useMemo(() => {
    const all = new Map<string, THREE.AnimationClip>()
    for (const clip of animations) all.set(clip.name, clip)
    return all
  }, [animations])

  const own = useXpClips('peepz', carried)
  return <Body rig="peepz" clips={merged(clips, own)} {...props} />
}

/**
 * Everybody else, with bones.
 *
 * One `SkinnedBody` per person, each sampling the shared buffer for itself. The
 * first draft kept a map of refs up here and handed one to each child, which
 * meant reading refs during render - React's compiler refuses that, and rightly:
 * a render-time read of a frame-time value is exactly how the two come to
 * disagree. Pushing the state into the child removed the map and the rule
 * violation together, which is usually the sign the rule was pointing at
 * something real.
 */
export function SkinnedCrowd({
  crowd,
  ids,
  url,
  scale,
  lift,
  rig,
  carried,
  over,
  glow,
  host,
}: {
  crowd: {
    readonly current: {
      at(
        id: string,
        now: number,
      ): {
        x: number
        y: number
        z: number
        facing: number
        dance?: boolean
        down?: boolean
      } | null
    }
  }
  ids: readonly string[]
  url: string
  scale: number
  lift: number
  /**
   * Which skeleton these bodies are, so the right clips are played on them.
   *
   * **This was missing**, and it is the whole of "the peepz on the network are
   * not animated". `SkinnedBody` defaults to the dummy, so every co-player was
   * drawn as a peep and then asked for `Idle_A` and `Walking_A` - names that
   * exist on the prototype dummy and on nothing else. A clip a rig does not
   * have leaves the body in whatever pose it was already in, silently, which
   * is a peep standing perfectly still while it slides around the pitch.
   *
   * The local body has always passed it. Peers went through a second call site
   * that did not, which is exactly the kind of divergence one prop threaded
   * through two paths invites.
   */
  rig?: SkeletonId
  /** The level's own clips, laid over the pack's. Same as the local body's. */
  carried?: Readonly<Record<string, XpClip>>
  /**
   * What to float above each person, by id.
   *
   * A function rather than a map prop for the same reason `sample` is one: the
   * thing it reaches for is a per-peer ref, and building it here would mean a
   * map read during render. The caller closes over its own store and this
   * component stays a body-placer that has never heard of an emote.
   */
  over?: (id: string) => React.ReactNode
  /**
   * Whether the lights are on, and whose switch it was.
   *
   * A boolean and an id rather than a colour per peer, for the reason ./glow
   * gives: a hue is a function of who somebody is, so nobody has to send one.
   * Absent is a match with the lights off, which is every one until somebody
   * turns them on.
   */
  glow?: boolean
  /** Who turned them on, so they are the one person cycling the wheel. */
  host?: string
}) {
  return (
    <>
      {ids.map((id) => (
        <SkinnedBody
          key={id}
          {...(rig ? { rig } : {})}
          {...(carried ? { carried } : {})}
          url={url}
          scale={scale}
          lift={lift}
          /*
            The buffer's own answer, plus the one thing in it that is not a place.

            A gait is derived here from where the body has been - see the note on
            `motion` above - and a dance is the one animation that cannot be,
            because a dancing body and a standing one have identical positions.
            So it arrives as a flag on the sample and is turned into the stance
            the machine already knows about. Everything else about how a peer
            moves is still worked out rather than sent.
          */
          sample={(now) => {
            const spot = crowd.current.at(id, now)
            if (!spot) return spot
            if (spot.down) return { ...spot, motion: 'dead' as const }
            return spot.dance ? { ...spot, motion: 'dance' as const } : spot
          }}
        >
          {over?.(id)}
          {/*
            Inside the body's own group, so the light goes where they go and
            this component stays a body-placer that has never heard of a party.
          */}
          {glow ? <PeerGlow id={id} host={id === host} /> : null}
        </SkinnedBody>
      ))}
    </>
  )
}
