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

export interface BoneSpec {
  /** The loaded name - what everything looks this bone up by. See above. */
  name: string
  /** What the GLB calls it. Documentation; nothing resolves through it. */
  glb: string
  /** What the panel calls it. */
  label: string
  /** Legs, arms, torso - only for grouping the list. */
  group: 'torso' | 'arms' | 'legs'
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

export const GROUP_LABELS: Record<BoneSpec['group'], string> = {
  torso: 'Body',
  arms: 'Arms',
  legs: 'Legs',
}

/** Where the model lives. One file, and the tool is pointed at it. */
export const DUMMY_URL = '/xo/pda/dummy/Dummy.glb'
