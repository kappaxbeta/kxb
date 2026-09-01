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

/**
 * The other body somebody might want to animate.
 *
 * ---------------------------------------------------------------------------
 * A peep is not a skeleton, and it does not matter
 * ---------------------------------------------------------------------------
 * The animal packs ship with `skins: 0` - there is no skinned mesh and no
 * armature. Each animal is seven nodes with a mesh on most of them, animated by
 * turning the *nodes*: `root`, `body`, `tail` and four legs.
 *
 * That is a rig as far as everything in this editor is concerned. A pose here
 * is a root translation plus a quaternion per named node, and three.js binds a
 * quaternion track to a node by name whether or not the node is a `Bone`. The
 * pack's own clips are built exactly this way - `idle` turns `leg-front-left`
 * and the rest - so a clip keyed here is the same kind of object the pack
 * already ships.
 *
 * `root` is even called `root`, so `ROOT_BONE` is the same word for both rigs.
 * That is luck rather than design, and it is worth writing down because it is
 * the reason nothing else in the editor had to learn about a second name for
 * the thing that translates.
 *
 * ---------------------------------------------------------------------------
 * What a peep has not got
 * ---------------------------------------------------------------------------
 * Arms, a spine, a head that turns, and knees. Four legs of one bone each,
 * hung off the root, and a tail off the body. So every `reach` here is 1 - a
 * drag turns the leg it is on and nothing above it - and there are no hinges,
 * because a single-bone limb has no plane to get wrong.
 *
 * The legs are pinnable for the same reason the dummy's feet are: lowering the
 * body should crouch the animal rather than sink it through its own feet.
 */
export const PEEP_BONES: BoneSpec[] = [
  bone('body', { label: 'Body', group: 'torso', reach: 1 }),
  bone('tail', { label: 'Tail', group: 'torso', reach: 1 }),
  bone('leg-front-left', { label: 'Front L', group: 'legs', reach: 1, pinnable: true }),
  bone('leg-front-right', { label: 'Front R', group: 'legs', reach: 1, pinnable: true }),
  bone('leg-back-left', { label: 'Back L', group: 'legs', reach: 1, pinnable: true }),
  bone('leg-back-right', { label: 'Back R', group: 'legs', reach: 1, pinnable: true }),
]

export const PEEP_SPECS: Record<string, BoneSpec> = Object.fromEntries(
  PEEP_BONES.map((spec) => [spec.name, spec]),
)

/**
 * The fox, standing in for every animal in the pack.
 *
 * They all share these seven nodes under these seven names - the pack is one
 * rig with twenty-odd skins on it - so a clip keyed against the fox plays on
 * the penguin. Which one the editor *draws* is cosmetic, and the fox is the
 * one with a tail long enough to see what a tail key did.
 */
export const PEEP_URL = '/xo/peeps/animal-fox.glb'

/**
 * A body the animator can pose, as one value.
 *
 * The editor was written against the dummy and reached for `DUMMY_BONES`,
 * `BONE_SPECS` and `DUMMY_URL` as module constants. That is fine for one rig
 * and is the whole of what stopped there being two: nothing in the stage, the
 * IK or the panel is *about* the dummy - they take a bone list, a spec lookup
 * and a reach - so making the three a parameter is what lets the same tool
 * animate an animal.
 *
 * `id` is what a saved clip records, so a picker can offer a clip on the bodies
 * it will actually play on. A clip binds to nodes by name, and `hand.l` means
 * nothing to a fox.
 */
export interface Rig {
  id: RigId
  label: string
  url: string
  bones: BoneSpec[]
  specs: Record<string, BoneSpec>
}

export const RIG_IDS = ['dummy', 'peep'] as const
export type RigId = (typeof RIG_IDS)[number]

export const RIGS: Record<RigId, Rig> = {
  dummy: {
    id: 'dummy',
    label: 'Person',
    url: DUMMY_URL,
    bones: DUMMY_BONES,
    specs: BONE_SPECS,
  },
  peep: { id: 'peep', label: 'Peep', url: PEEP_URL, bones: PEEP_BONES, specs: PEEP_SPECS },
}

/**
 * Every bone this app knows, whichever body it belongs to.
 *
 * The two rigs share no names - a dummy has `hips` and `upperarm.l`, a peep has
 * `body` and `leg-front-left` - so one map answers "what part of a body is this
 * bone" without anybody having to say which rig they are asking about. Which is
 * exactly the question a *clip* raises: it arrives as a list of bone names and
 * nothing else, and what plays it should not have to be told twice.
 */
export const ALL_SPECS: Record<string, BoneSpec> = { ...BONE_SPECS, ...PEEP_SPECS }

/**
 * Which parts of a body a set of bone names touches.
 *
 * Derived rather than declared, which is the whole reason a clip does not carry
 * a `parts` field: `bake` already drops every bone that never moves, so what a
 * clip *drives* is a fact about its own tracks. A stored list could disagree
 * with them, and the disagreement would show up as an animation that does not
 * do what its label says.
 *
 * Bones no rig here knows are ignored rather than counted as a fourth group: a
 * clip from a pack we later drop, or from a rig somebody imported, should read
 * as touching nothing rather than as touching something unnamed.
 */
export function groupsIn(
  bones: Iterable<string>,
  specs: Record<string, BoneSpec>,
): Set<BoneSpec['group']> {
  const groups = new Set<BoneSpec['group']>()
  for (const bone of bones) {
    const spec = specs[bone]
    if (spec) groups.add(spec.group)
  }
  return groups
}

/**
 * Whether a clip is meant to play *over* something rather than instead of it.
 *
 * A wave is arms. A walk is legs and a bit of everything. Played the usual way
 * - one action crossfading to another - a wave stops the walk, and somebody
 * waving while crossing the room stands still to do it.
 *
 * So a clip that leaves a whole part of the body alone is taken as a layer, and
 * the runtime plays it additively on top of the gait. A clip that touches all
 * three parts is a whole-body animation and replaces the gait, which is what a
 * sit-down wants.
 *
 * The rule is derived from the tracks and not from a switch somebody sets,
 * because it is the same fact twice: a clip with no leg tracks *cannot* drive
 * the legs, whatever anybody ticked.
 */
export function isPartial(groups: ReadonlySet<BoneSpec['group']>): boolean {
  return groups.size > 0 && groups.size < 3
}

export function isRigId(value: unknown): value is RigId {
  return typeof value === 'string' && (RIG_IDS as readonly string[]).includes(value)
}
