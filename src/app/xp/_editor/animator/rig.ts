/**
 * Copied from `src/domain/animator/rig.ts`, and the first of these files to
 * genuinely diverge.
 *
 * `src/app/xp/` owns what it draws, and the copy is the rule rather than an
 * accident: docs/xp-creator.md §1.2, enforced by `no-restricted-imports` in
 * eslint.config.mjs. The backoffice's animator is a live surface and this
 * editor is a prototype; sharing one would mean the prototype either drags
 * the product about or waits behind it, and the two are allowed to differ.
 *
 * They now do. The backoffice animates the dummy and only the dummy; this one
 * has two rigs in it, because an XP can be *played* as a peep and a body nobody
 * can author for is a body stuck with the eight clips it shipped with. Do not
 * diff the two files expecting them to converge again - the `RIGS` table below
 * is this editor's, and the other copy does not hear about it.
 */

import { packModels } from '@kxb/xp/catalogue'
import { modelUrl, type SkeletonId } from '@kxb/xp/packs'

/**
 * The dummy's skeleton, described for an editor.
 *
 * The KayKit prototype dummy - `/xo/pda/dummy/Dummy.glb` - is 23 bones with no
 * clips in it at all, which is what makes it the thing to animate against:
 * nothing to overwrite, and the same proportions as everything else in the
 * prototype pack, which is now `proto` in the builder's catalogue.
 *
 * ---------------------------------------------------------------------------
 * What this file is for
 * ---------------------------------------------------------------------------
 * The GLB knows the hierarchy. It does not know that an elbow only bends one
 * way, that dragging a hand should move three bones and dragging a shoulder
 * only one, or that the two nodes called `handslot` are places to hang a
 * weapon rather than parts of a body. All of that is judgement about *this*
 * rig, and it is the difference between a solver that poses an arm and one
 * that ties it in a knot.
 *
 * The numbers are read off the bind pose. Every bone in this pack points down
 * its own +Y - each child sits at a positive Y offset in its parent's space -
 * so a joint's hinge is one of the other two axes, and which one is visible in
 * the rest rotation: the knees rest at a small turn about X and the elbows at
 * a small turn about Z. Those small turns are also the pre-bend, which is what
 * tells the solver which way the joint is allowed to fold.
 *
 * ---------------------------------------------------------------------------
 * Why `name` is not what the file calls it
 * ---------------------------------------------------------------------------
 * The bones in the GLB are named `upperarm.l`, `hand.r`, `toes.l`. By the time
 * three.js has loaded them they are called `upperarml`, `handr`, `toesl` -
 * `GLTFLoader` puts every node name through `PropertyBinding.sanitizeNodeName`,
 * which strips the five characters reserved by the animation track syntax, and
 * `.` is one of them.
 *
 * That is not cosmetic. Every lookup in this editor is by name: the handles
 * find their bones by it, the solver finds a joint's limits by it, a pose is
 * keyed by it, and an exported track binds by it. Written with the dots, all
 * sixteen dotted bones silently resolve to nothing - which looks like sixteen
 * handles stacked at the origin at their unscaled size, one grey ball a metre
 * across sitting in the middle of the floor, and a figure whose limbs cannot
 * be grabbed at all.
 *
 * So `name` is the loaded name, because that is the one every consumer needs,
 * and `glb` records what it is called in the file for anybody comparing this
 * against Blender. `rig.test.ts` checks the pair against the actual GLB, so
 * this cannot drift if the model is ever re-exported.
 */

/**
 * A node name as three.js will have it after loading.
 *
 * The same five reserved characters `PropertyBinding.sanitizeNodeName` removes,
 * reimplemented rather than imported, so that this module stays free of three
 * and can be read by the tests without a renderer.
 */
export function boneKey(name: string): string {
  return name.replace(/\s/g, '_').replace(/[[\]./:]/g, '')
}

/** Local axis a hinge turns about. Bones here point down +Y, so never that. */
export type Hinge = 'x' | 'z'

/**
 * What kind of part this is, for grouping the panel's list.
 *
 * Five rather than the dummy's three, because a fox has a tail and a parrot has
 * wings and neither is an arm. A rig uses whichever of these it has and names
 * them itself - see `Rig.groups` - so nothing here claims every body has all
 * five.
 */
export type BoneGroup = 'torso' | 'arms' | 'legs' | 'wings' | 'tail'

export interface BoneSpec {
  /** The loaded name - what everything looks this bone up by. See above. */
  name: string
  /** What the GLB calls it. Documentation; nothing resolves through it. */
  glb: string
  /** What the panel calls it. */
  label: string
  /** Legs, arms, torso - only for grouping the list. */
  group: BoneGroup
  /**
   * How many bones above this one a drag is allowed to turn.
   *
   * The handle sits on the bone's own origin, and a bone turning cannot move
   * its own origin, so the chain starts at the parent. Three at the hands
   * gives a whole arm; one at a shoulder gives a shrug rather than a lurch of
   * the whole spine.
   */
  reach: number
  /**
   * The one axis this joint may turn about, if it is a hinge.
   *
   * Without this, inverse kinematics on a straight limb picks whatever plane
   * the maths lands in, and knees end up bending sideways - the single most
   * recognisable way for a posed figure to look wrong. Constraining the two
   * hinges in each limb is what makes dragging a foot produce a leg.
   */
  hinge?: {
    axis: Hinge
    /** Degrees, relative to the bind pose. Signed: which way the joint folds. */
    min: number
    max: number
  }
  /**
   * Whether this bone can be pinned in place.
   *
   * A pin re-solves the limb after the body moves, so that lowering the hips
   * is a crouch rather than the whole figure sinking through its own feet.
   * Only the four ends of the four limbs, which are the only things that
   * plausibly stay put while the rest of a body moves.
   */
  pinnable?: boolean
  /**
   * A single segment: a drag turns *this* bone rather than a chain above it.
   *
   * The dummy needed nothing like it, and that is why it did not exist. Every
   * draggable bone on that rig hangs off at least one other one you would want
   * moved - pulling a hand should bend the whole arm - so `reach` counting
   * *parents* was a complete description of dragging.
   *
   * A peep's leg has no such chain. Its parent is `root`, which the solver is
   * forbidden from turning (see `chainAbove`) and rightly: a leg that rotated
   * the root would spin the whole animal about the floor. So `chainAbove`
   * returns nothing, `reachFor` returns on its first line, and a leg handle you
   * can grab and drag does *nothing at all* - which reads as a broken editor
   * rather than as a rig with short limbs.
   *
   * What a one-segment limb actually wants is the other gesture: point it where
   * the pointer is. Same solver, one-bone chain, and the effector is a tip
   * synthesised at the part's own centre - see `RigHandle.tips` - because a
   * bone dragged by its own origin has no direction to aim.
   */
  swivel?: true
}

/**
 * The bone every pose is measured against, and the only one that translates.
 *
 * `hips` would be the intuitive choice and is wrong: it is inside the skin, so
 * a hips-driven jump moves the legs' parent and the mesh with it, but leaves
 * anything parented to the model behind. `root` sits under the whole rig at
 * the origin, which is what a clip in this pack expects to be moved by.
 */
export const ROOT_BONE = 'root'

/**
 * Handles, in the order the panel lists them.
 *
 * `handslot.l` and `handslot.r` are deliberately absent: they are empty
 * attachment points with nothing drawn on them, so a handle there is a dot
 * floating beside a hand that does nothing you can see. They still get keyed -
 * every bone in the skeleton does - they just have nowhere to grab.
 */
/** `glb` in, `name` derived, so the two can never be written out of step. */
function bone(glb: string, spec: Omit<BoneSpec, 'name' | 'glb'>): BoneSpec {
  return { ...spec, glb, name: boneKey(glb) }
}

export const DUMMY_BONES: BoneSpec[] = [
  // ---- torso -------------------------------------------------------------
  bone('hips', {
    label: 'Hips',
    group: 'torso',
    // Zero, and special-cased by the stage: dragging the hips slides the root
    // node instead of turning anything. It is the handle you use to make the
    // figure crouch, jump or lean, and it is the only translation there is.
    reach: 0,
  }),
  bone('spine', { label: 'Spine', group: 'torso', reach: 1 }),
  bone('chest', { label: 'Chest', group: 'torso', reach: 1 }),
  bone('head', { label: 'Head', group: 'torso', reach: 2 }),

  // ---- arms --------------------------------------------------------------
  bone('upperarm.l', { label: 'Shoulder L', group: 'arms', reach: 1 }),
  bone('lowerarm.l', {
    label: 'Elbow L',
    group: 'arms',
    reach: 1,
    // The left elbow rests at -0.055 about Z and folds further negative.
    hinge: { axis: 'z', min: -150, max: 4 },
  }),
  bone('wrist.l', { label: 'Wrist L', group: 'arms', reach: 2 }),
  bone('hand.l', { label: 'Hand L', group: 'arms', reach: 3, pinnable: true }),
  bone('upperarm.r', { label: 'Shoulder R', group: 'arms', reach: 1 }),
  bone('lowerarm.r', {
    label: 'Elbow R',
    group: 'arms',
    reach: 1,
    hinge: { axis: 'z', min: -4, max: 150 },
  }),
  bone('wrist.r', { label: 'Wrist R', group: 'arms', reach: 2 }),
  bone('hand.r', { label: 'Hand R', group: 'arms', reach: 3, pinnable: true }),

  // ---- legs --------------------------------------------------------------
  bone('upperleg.l', { label: 'Hip L', group: 'legs', reach: 1 }),
  bone('lowerleg.l', {
    label: 'Knee L',
    group: 'legs',
    reach: 1,
    // A knee only folds backwards. Both knees rest at +0.106 about X and go
    // further positive from there, so the range is the same on both sides -
    // unlike the elbows, which are mirrored.
    hinge: { axis: 'x', min: -4, max: 150 },
  }),
  bone('foot.l', { label: 'Foot L', group: 'legs', reach: 2, pinnable: true }),
  bone('toes.l', { label: 'Toes L', group: 'legs', reach: 1 }),
  bone('upperleg.r', { label: 'Hip R', group: 'legs', reach: 1 }),
  bone('lowerleg.r', {
    label: 'Knee R',
    group: 'legs',
    reach: 1,
    hinge: { axis: 'x', min: -4, max: 150 },
  }),
  bone('foot.r', { label: 'Foot R', group: 'legs', reach: 2, pinnable: true }),
  bone('toes.r', { label: 'Toes R', group: 'legs', reach: 1 }),
]

export const BONE_SPECS: Record<string, BoneSpec> = Object.fromEntries(
  DUMMY_BONES.map((spec) => [spec.name, spec]),
)

export const GROUP_LABELS: Record<BoneGroup, string> = {
  torso: 'Body',
  arms: 'Arms',
  legs: 'Legs',
  wings: 'Wings',
  tail: 'Tail',
}

/** Where the model lives. One file, and the tool is pointed at it. */
export const DUMMY_URL = '/xo/pda/dummy/Dummy.glb'

/**
 * The peeps' rig, which is not a skeleton at all.
 *
 * ---------------------------------------------------------------------------
 * Six rigid parts on a node hierarchy
 * ---------------------------------------------------------------------------
 * `skins` is empty in all twenty-four files. There are no joints, no weights and
 * no bind pose - a peep is `root`, a `body` with a `tail` and a pair of `wing`s
 * hung under it, and up to four `leg`s beside it, each a whole mesh that the
 * clips move rigidly. Everything in this editor works on `THREE.Object3D` and
 * looks bones up by name, so all of that is fine; the two places it shows are
 * `swivel` above and the fact that `SkeletonUtils.clone` has nothing to rebind.
 *
 * ---------------------------------------------------------------------------
 * Which parts exist depends on the animal, and that is deliberately not modelled
 * ---------------------------------------------------------------------------
 * This is the **union** of the twenty-four, not any one of them. A fish has no
 * legs. A bunny has no tail. A parrot has legs, wings *and* a tail; a fox has
 * legs and a tail and no wings.
 *
 * One table for all of them rather than twenty-four is right for two reasons.
 * The panel only ever draws a handle for a part the loaded model actually has -
 * it walks `rig.bones`, which comes off the file - so a missing part costs
 * nothing on screen. And a clip is meant to be *portable between animals*: the
 * part names are identical across the pack, so a walk authored on the fox drives
 * a dog, a cow and a bee correctly, and its two `tail` tracks simply bind to
 * nothing on a bunny. That is three.js's own behaviour and it is the behaviour
 * wanted - the alternative is twenty-four near-identical walks.
 *
 * ---------------------------------------------------------------------------
 * The legs hang off `root`, not off `body`
 * ---------------------------------------------------------------------------
 * Read off the files and worth stating, because it is the thing that makes a
 * peep pose differently from a person: lowering the body does **not** move the
 * legs, so there is no crouch to solve for and nothing to pin. Which is also
 * why none of these are `pinnable` - a pin re-solves a limb after the body
 * moves, and here the body moving is already independent of the legs.
 */
export const PEEPZ_BONES: BoneSpec[] = [
  bone('body', {
    label: 'Body',
    group: 'torso',
    // Zero and not `swivel`, so this takes the same branch the dummy's hips do:
    // a drag slides `root` and moves the whole animal. It is the only handle on
    // a peep that translates, and the sliders are what turn it.
    reach: 0,
  }),
  bone('tail', { label: 'Tail', group: 'tail', reach: 0, swivel: true }),

  bone('wing-left', { label: 'Wing L', group: 'wings', reach: 0, swivel: true }),
  bone('wing-right', { label: 'Wing R', group: 'wings', reach: 0, swivel: true }),

  bone('leg-front-left', { label: 'Front L', group: 'legs', reach: 0, swivel: true }),
  bone('leg-front-right', { label: 'Front R', group: 'legs', reach: 0, swivel: true }),
  bone('leg-back-left', { label: 'Back L', group: 'legs', reach: 0, swivel: true }),
  bone('leg-back-right', { label: 'Back R', group: 'legs', reach: 0, swivel: true }),
]

export const PEEPZ_SPECS: Record<string, BoneSpec> = Object.fromEntries(
  PEEPZ_BONES.map((spec) => [spec.name, spec]),
)

/**
 * The animals, read out of the catalogue rather than listed here.
 *
 * There are twenty-four and the pack could grow, and a hand-written list is a
 * list that is wrong the first time somebody drops a twenty-fifth glb in the
 * folder and nobody re-pastes it - the same argument `packPreview` makes about
 * hand-picked previews. `xp:catalogue` walks the disk; this walks the catalogue.
 */
const PEEPZ_MODELS: readonly string[] = packModels('peepz').map((entry) => entry.id)

/**
 * A rig, as everything downstream of "which skeleton" needs to see it.
 *
 * The thing `rig.ts` was before this: a module of constants that every consumer
 * imported directly. That is a perfectly good shape for one rig and an
 * impossible one for two - `stage.tsx` cannot import `DUMMY_BONES` and draw a
 * fox - so the constants stay exported (the tests and `layers.ts` read them) and
 * the consumers take one of these instead.
 */
export interface Rig {
  /** The same id `Pack.skeleton` uses, so a model resolves straight to a rig. */
  id: SkeletonId
  /** What the switch calls it. */
  label: string
  /** The model the tool poses by default. */
  url: string
  /**
   * Every model this rig can be posed on, as catalogue ids.
   *
   * One for the dummy and twenty-four for the peeps. A list rather than a single
   * url because which animal you pose on is a real choice for the peeps - the
   * parts are named identically across the pack, so it changes what you are
   * looking at and not what you are authoring.
   */
  models: readonly string[]
  /** The node every pose is measured against, and the only one that translates. */
  root: string
  bones: BoneSpec[]
  specs: Record<string, BoneSpec>
  /** The groups this rig actually has, in the order the panel lists them. */
  groups: readonly BoneGroup[]
  /**
   * Whether the model is skinned.
   *
   * Only `stage.tsx` reads it, and only to say why it clones the way it does.
   * `SkeletonUtils.clone` is correct for both - it falls through to an ordinary
   * deep clone when there is nothing bound - so this is documentation that
   * happens to be typed rather than a branch.
   */
  skinned: boolean
}

export const RIGS: Record<SkeletonId, Rig> = {
  dummy: {
    id: 'dummy',
    label: 'Dummy',
    url: DUMMY_URL,
    models: ['dummy/Dummy'],
    root: ROOT_BONE,
    bones: DUMMY_BONES,
    specs: BONE_SPECS,
    groups: ['torso', 'arms', 'legs'],
    skinned: true,
  },
  peepz: {
    id: 'peepz',
    label: 'Peep',
    // The fox: four legs and a tail, which is the most parts any one animal has
    // short of the parrot, and the one everything else in this repo reaches for
    // when it needs a peep to stand in a picture.
    url: modelUrl('peepz/fox'),
    models: PEEPZ_MODELS,
    root: ROOT_BONE,
    bones: PEEPZ_BONES,
    specs: PEEPZ_SPECS,
    groups: ['torso', 'legs', 'wings', 'tail'],
    skinned: false,
  },
}

/** Which rig to open on, and what a document with nothing to say is read as. */
export const DEFAULT_RIG: SkeletonId = 'dummy'

/**
 * The rig for an id, falling back rather than throwing.
 *
 * A saved document names its rig as a string, and a string from a file can be
 * anything. Falling back to the dummy means an unreadable name opens as
 * *something* poseable, which beats a blank canvas and an error nobody can act
 * on - the same contract `parseDoc` gives every other field it reads.
 */
export function rigFor(id: string | undefined): Rig {
  return RIGS[id as SkeletonId] ?? RIGS[DEFAULT_RIG]
}

/** Whether a rig id is one we ship, for the parser that has to decide. */
export function isRigId(id: unknown): id is SkeletonId {
  return typeof id === 'string' && id in RIGS
}
