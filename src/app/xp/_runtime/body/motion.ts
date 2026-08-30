/**
 * Which clip a body is playing, and how fast.
 *
 * The decision half of animation, separated from the playing half for the reason
 * everything in this folder is separated: the Browser pane never fires a frame,
 * so a mixer is a thing you can only reason about, and "does the walk switch to
 * a run at the right speed" is a question a screenshot cannot answer.
 *
 * ---------------------------------------------------------------------------
 * The dummy is already the right skeleton
 * ---------------------------------------------------------------------------
 * Worth recording, because it is the fact that made this a day rather than a
 * fortnight and nothing in the plan knew it. `public/xp/packs/dummy/Dummy.glb`
 * is skinned, and its 23 joints are *exactly* the 23 of `Rig_Medium` - root,
 * hips, upperleg.r, lowerleg.r, foot.r, toes.r, spine, chest, head, and so on.
 * Every name matches.
 *
 * So there is no retargeting step, no rig conversion and no second body model.
 * three.js binds an animation track to a bone by name, which means the 139 clips
 * in `public/xp/packs/animation/Rig_Medium/` play on the body we already draw.
 * §F warns that "a clip on the wrong rig is a body folded inside out"; the
 * check that warning asks for came back clean.
 *
 * ---------------------------------------------------------------------------
 * Why a state machine rather than a threshold
 * ---------------------------------------------------------------------------
 * A bare `speed > WALK_PACE ? run : walk` flickers. A player holding a corner,
 * or brushing a wall, sits within a hair of the boundary and the body snaps
 * between two clips several times a second - which reads as a broken model
 * rather than as a speed. So the current motion is an *input*, and leaving it
 * costs more than entering it did.
 *
 * That is invisible in a screenshot and trivial in a test, which is exactly the
 * split this file exists for.
 */

import { SPRINT_PACE, WALK_PACE } from '@kxb/xp/engine'
import type { SkeletonId } from '@kxb/xp/packs'
import { CLIPS } from '@/app/xp/_runtime/clips.generated'

export type Motion =
  | 'idle'
  | 'walk'
  | 'run'
  | 'air'
  | 'land'
  | 'dead'
  | 'dance'
  | 'shoot'
  | 'hit'
  | 'attack'

/**
 * The three that are things a body *does*, rather than ways it is standing.
 *
 * The distinction the renderer needs and this type did not have. `walk` and
 * `air` describe the whole body and are mutually exclusive with each other;
 * `shoot`, `hit` and `attack` are moments that happen *while* one of those is
 * true, and folding them into one field is what made a body stop walking to
 * throw a punch. ./layers is where they stop having to.
 *
 * `dead` is deliberately not here. A corpse is not walking, and a death played
 * over a run would be a body sprinting while it falls over - it is a stance,
 * and the one stance nothing can be inferred about from speed and footing.
 *
 * `dance` is not here either, and for the same reason rather than a similar one:
 * somebody dancing has *stopped* to dance. It is the whole body by definition,
 * it ends the moment they walk away from it, and no amount of looking at a speed
 * would ever imply it - which is exactly what makes it a stance somebody has to
 * hand in.
 */
export const GESTURES = ['shoot', 'hit', 'attack'] as const

export type Gesture = (typeof GESTURES)[number]

export function isGesture(motion: Motion): motion is Gesture {
  return (GESTURES as readonly string[]).includes(motion)
}

export interface Body {
  /** Horizontal speed, in cells a second. */
  speed: number
  grounded: boolean
  /** Positive is rising. Only its sign is read. */
  velocityY: number
}

/**
 * Below this, somebody is standing still rather than moving slowly.
 *
 * Not zero: a body resting against a wall still reports a fraction of a cell a
 * second from the collision slide, and a walk cycle playing at a fiftieth speed
 * because somebody is leaning on a doorframe is worse than an idle.
 */
export const STILL = 0.6

/**
 * How much faster than the boundary you have to be to change your mind.
 *
 * A fifth of a cell a second, applied in both directions, so the walk/run
 * boundary is a band rather than a line. Small enough that nobody can feel the
 * lag entering a run; large enough to swallow the wobble of a body sliding along
 * a wall.
 */
export const HYSTERESIS = 1.2

/**
 * Where a walk becomes a run, before hysteresis.
 *
 * Halfway between the two paces the controller actually produces, and the first
 * draft had it at `WALK_PACE + 1` - which put the *band* at 6.8 to 9.2, with
 * walking pace itself inside it. A body that had been running and slowed to a
 * walk stayed in the run clip forever, because 7 never fell below 6.8.
 *
 * The rule the midpoint encodes: both real paces have to sit clear of the band
 * on their own side, so `WALK_PACE` is unambiguously a walk and `SPRINT_PACE` is
 * unambiguously a run. What is left inside is the speeds in between - a body
 * accelerating, or sliding along a wall - which is exactly where a decision
 * should be sticky rather than sharp.
 */
export const RUN_ABOVE = (WALK_PACE + SPRINT_PACE) / 2

/**
 * What this body is doing now, given what it was doing.
 *
 * `was` is the whole reason this is a function rather than a lookup - see the
 * note above about flicker. Pass the previous answer back in; a caller that has
 * none yet can pass `idle` and will be right within a frame.
 *
 * **It never returns `dead`.** Being dead is not something a body's speed and
 * footing can tell you - a corpse and somebody standing still are the same two
 * numbers - so it is handed *in* by whoever knows, and this decides the other
 * five. A state machine that tried to infer it would be guessing.
 */
export function motionFor(body: Body, was: Motion): Motion {
  /**
   * Off the ground beats everything.
   *
   * Including `land`: a body that leaves the ground on the frame it touched it -
   * bouncing down a staircase, or double-jumping - is in the air, and playing a
   * landing while rising is the one combination that looks like a bug rather
   * than a compromise.
   */
  if (!body.grounded) return 'air'

  /**
   * Just landed, and only from the air.
   *
   * A one-frame state the caller turns into a one-shot clip. It deliberately
   * cannot be re-entered from `land` itself, or a body standing still after a
   * jump would restart the landing every frame and never reach idle.
   */
  if (was === 'air') return 'land'

  if (body.speed < STILL) return 'idle'

  /**
   * The band. Entering a run needs more than leaving it, and the same in
   * reverse, so a speed sitting exactly on the boundary keeps whichever clip it
   * already had rather than choosing again sixty times a second.
   */
  const boundary = was === 'run' ? RUN_ABOVE - HYSTERESIS : RUN_ABOVE + HYSTERESIS
  return body.speed >= boundary ? 'run' : 'walk'
}

/** What a motion is called in the pack, and whether it repeats. */
export interface Pose {
  clip: string
  loop: boolean
}

/**
 * The clip for a motion, on whichever body is doing it.
 *
 * ---------------------------------------------------------------------------
 * Two rigs, two vocabularies, and no overlap at all
 * ---------------------------------------------------------------------------
 * The dummy's names come from `Rig_Medium` - `Walking_A`, `Jump_Idle`,
 * `Ranged_1H_Shoot` - and which file each lives in is the loader's problem
 * rather than this one's. A peep's come from inside its own glb and there are
 * eight of them, full stop: `static`, `idle`, `walk`, `run`, `eat`, `dance`,
 * `gesture-positive`, `gesture-negative`. Not one name is in both lists.
 *
 * So this is a switch on the rig before it is a switch on the motion, and the
 * peep half is deliberately not a translation of the dummy half - it is a
 * shorter list of what a peep can actually do, with the gaps stated rather than
 * papered over. `armed` is dummy-only for the same reason: a peep has no hand
 * and nothing to hold in one.
 */
export function poseFor(motion: Motion, armed = false, rig: SkeletonId = 'dummy'): Pose {
  if (rig === 'peepz') return peepPose(motion)
  switch (motion) {
    case 'idle':
      /**
       * A body holding a gun stands differently, and this is the whole of it.
       *
       * Reported as "the weapon is not in the right position", which is worth
       * writing down because the attachment was never wrong: the gun really is
       * on the hand bone and really does follow it. `Idle_A` is an *unarmed*
       * idle - arms hanging at the sides, palms inward - so the hand it follows
       * is at hip height with its back to the world, and a gun held correctly in
       * that hand points sideways at the floor. Nothing to fix at the bone; the
       * body was standing like somebody carrying nothing.
       *
       * `CombatRanged` has `Aiming`, `Reload`, `Shoot` and `Shooting` for one
       * hand and **no walk or run**, which is a fact about the pack rather than
       * a decision here. So an armed body aims while it stands and swings its
       * arms while it moves, and the mismatch is only visible in the case where
       * the gun is hardest to look at anyway. Adding an armed walk means
       * authoring one; naming a clip that is not in the pack means a body that
       * silently keeps its last pose, which is the failure this file's test
       * against the real glTF exists to catch.
       */
      /**
       * Played **once** and held, not looped.
       *
       * `Ranged_1H_Aiming` is the act of bringing a weapon up, not a pose to
       * sit in. Looping it replays the raise over and over - reported as a body
       * that keeps lifting the gun and never just holds it - which is what a
       * clip named for a verb does when you treat it as a noun.
       *
       * A one-shot ends on its last frame and `clampWhenFinished` keeps it
       * there, and that final frame *is* the aim. The first version of this
       * argued the opposite - that a one-shot would freeze the body - and the
       * argument was wrong in the ordinary way: freezing on the last frame of a
       * raise is exactly the pose wanted, and there is nothing to loop back to.
       */
      return armed ? { clip: 'Ranged_1H_Aiming', loop: false } : { clip: 'Idle_A', loop: true }
    case 'walk':
      return { clip: 'Walking_A', loop: true }
    case 'run':
      return { clip: 'Running_A', loop: true }
    case 'air':
      /**
       * One clip for rising and falling, rather than `Jump_Start` into
       * `Jump_Idle`. The start is a crouch-and-push authored for a jump that
       * begins from a standstill, and this controller's jump is instant - so
       * playing it means the body is already three cells up before its knees
       * have bent. `Jump_Idle` is the pose a body holds in the air, which is
       * what is actually true for every frame of it.
       */
      return { clip: 'Jump_Idle', loop: true }
    case 'land':
      return { clip: 'Jump_Land', loop: false }
    case 'shoot':
      /**
       * A one-shot over whatever the legs are doing.
       *
       * `Ranged_1H_Shoot` rather than `Ranged_1H_Shooting`: the first is the
       * recoil - a single kick - and the second is a loop for somebody holding
       * a trigger down. A click is one shot, so it wants the one that ends.
       *
       * It replaces the whole body rather than blending onto the arms, which is
       * the honest limit of one mixer and one clip: a proper version masks the
       * upper body and leaves the legs running. That is a bigger idea and this
       * is the shape it grows from.
       */
      return { clip: 'Ranged_1H_Shoot', loop: false }
    case 'attack':
      /**
       * Swinging at something, which a body could not do at all.
       *
       * `player.keys` can bind `attack` and the level can hang a rule off it,
       * so a punching bag has been hittable since `pressed` existed - and the
       * body did nothing whatsoever. Pressing a key and watching a person stand
       * perfectly still is worse than an unbound key: the level responds, the
       * health goes down, and the only thing that does not move is the person
       * doing it.
       *
       * `Melee_Unarmed_Attack_Punch_A` empty-handed, because an empty hand
       * punches. Armed, `Melee_1H_Attack_Chop` - a downward swing that reads
       * with anything held in one hand, and the closest the pack has to a
       * generic "hit it with what you are carrying". Neither is in a file the
       * runtime used to load, which is why `SOURCES` in ./skinned grew a fourth
       * entry and `clips.generated.ts` grew twenty-two names.
       *
       * Unlike `shoot` and `hit`, this one has never had a whole-body version
       * to be compatible with - it arrives already knowing it is a gesture.
       */
      return armed
        ? { clip: 'Melee_1H_Attack_Chop', loop: false }
        : { clip: 'Melee_Unarmed_Attack_Punch_A', loop: false }
    case 'hit':
      /**
       * Taking one, as a one-shot over whatever the legs are doing.
       *
       * `Hit_A` and `Hit_B` have been in the pack since bodies could be
       * animated and nothing has ever played either of them - so a shot that
       * took twenty-five health off somebody looked exactly like a shot that
       * missed, from both ends. The shooter had no confirmation and the person
       * hit had no reason to move.
       *
       * `Hit_A` rather than `Hit_B` for the same reason `Death_A` beats its
       * sibling: one of a pair is a choice to make once, and alternating them
       * needs somewhere to remember which came last, which is a ref for a
       * flourish nobody asked for.
       *
       * It replaces the whole body rather than blending onto the torso, which
       * is the honest limit of one mixer and one clip - the same admission
       * `shoot` makes three cases up, and the same shape a masked upper body
       * would grow from.
       */
      return { clip: 'Hit_A', loop: false }
    /**
     * The rig has no dance, and this is the honest answer to that.
     *
     * `Rig_Medium` is a combat pack - swings, shots, blocks, a death - and
     * nothing in it is somebody enjoying themselves. The nearest moving clip
     * would be a two-handed spin, which is a body swinging an axe. So a dummy
     * asked to dance stands still, on the same terms this file already gives a
     * peep with no death: a wrong animation is worse than a neutral one, and a
     * level that wants a dummy to dance has `animate` and a clip of its own.
     *
     * The *peep* has a real one - see `peepPose` - which is the rig every
     * built-in body uses and the one `KeyG` was reserved for.
     */
    case 'dance':
      return { clip: 'Idle_A', loop: true }
    case 'dead':
      /**
       * A one-shot that stays down.
       *
       * `Death_A` rather than `Death_A_Pose`, which is the last frame on its
       * own: the fall is the part worth seeing, and `clampWhenFinished` holds
       * the pose afterwards anyway. Playing the pose would be a body that was
       * standing one frame and lying down the next.
       */
      return { clip: 'Death_A', loop: false }
  }
}

/**
 * Every clip a peep can play, which is every clip in its own file.
 *
 * Written out rather than generated, unlike the dummy's `clips.generated.ts`,
 * and the difference is where the list comes from. The dummy's depends on which
 * of eight shared files `skinned.tsx` chooses to download - a runtime decision a
 * script has to read out of the source. A peep's clips are *in the model*: if the
 * body is on screen its eight clips are already in memory, so the list is a fact
 * about the pack and not about the loader.
 *
 * All twenty-four animals ship exactly these eight, which is the premise that
 * makes one document play on any of them - `motion.test.ts` reads all twenty-four
 * files and says so, which is the same job `clips.test.ts` does for the dummy.
 *
 * `eat` and `dance` are here and unreachable from the stance machine, which is
 * correct: nothing about speed and footing implies eating. They are for
 * `runAnimation` and for a document that wants to say so.
 */
export const PEEP_CLIPS = [
  'static',
  'idle',
  'walk',
  'run',
  'eat',
  'dance',
  'gesture-positive',
  'gesture-negative',
] as const

/**
 * What a body of this rig can be asked to play, for a picker to offer.
 *
 * The narrowing the editor does and the parser deliberately does not - see the
 * note on `Blueprint.pose`. A name outside this list plays nothing and leaves
 * the body in its last pose, with no error anywhere, so the only honest fix is
 * to not offer it.
 */
export function clipsFor(rig: SkeletonId): readonly string[] {
  return rig === 'peepz' ? PEEP_CLIPS : CLIPS
}

/**
 * The same nine states, on an animal with eight clips.
 *
 * ---------------------------------------------------------------------------
 * What is missing, said out loud
 * ---------------------------------------------------------------------------
 * The pack has no jump, no landing and no death. That is not a gap to fill with
 * the nearest thing that moves - a peep playing `dance` because it fell off a
 * ledge is worse than a peep that holds still - so all three land on `static`,
 * which is the pack's own neutral pose and the only honest answer to "the clip
 * for this does not exist".
 *
 * `static` for `dead` is the one worth arguing with, and the argument settles
 * the same way: a corpse should look different from somebody standing, and the
 * only clips that would look different are a dance and an eat. Neither is a
 * death. A level that wants one has `runAnimation` and a document that can say
 * so; this is the built-in machine's answer, and it should be the boring one.
 *
 * ---------------------------------------------------------------------------
 * The two gestures are what the pack calls them
 * ---------------------------------------------------------------------------
 * `gesture-positive` and `gesture-negative` are a nod and a shake - a whole-body
 * bob and a whole-body recoil. Mapping `shoot` and `attack` to the first and
 * `hit` to the second is the closest thing to "I did something" and "something
 * happened to me" the pack has, and both read correctly masked to the body and
 * laid over a walk. See `PEEP_UPPER` in ./layers.
 */
function peepPose(motion: Motion): Pose {
  switch (motion) {
    case 'idle':
      return { clip: 'idle', loop: true }
    case 'walk':
      return { clip: 'walk', loop: true }
    case 'run':
      return { clip: 'run', loop: true }
    case 'air':
    case 'land':
    case 'dead':
      return { clip: 'static', loop: motion === 'air' }
    /**
     * The one clip in the pack that had nowhere to be reached from.
     *
     * `dance` and `eat` were noted above as unreachable from the stance machine,
     * which was right about `eat` and turned out to be a missing feature for
     * this one: `KeyG` is reserved by the format so that *every* XP has a dance,
     * the controls panel lists it, and nothing anywhere played it. Looped,
     * because a dance goes on until you stop it.
     */
    case 'dance':
      return { clip: 'dance', loop: true }
    case 'shoot':
    case 'attack':
      return { clip: 'gesture-positive', loop: false }
    case 'hit':
      return { clip: 'gesture-negative', loop: false }
  }
}

/**
 * How fast to play it, so the feet do not slide.
 *
 * A walk cycle is authored at one pace. Played at a fixed rate while the body
 * moves at another, the feet skate - the single most recognisable sign of an
 * animation bolted on rather than driven, and the reason this takes a speed at
 * all rather than just a name.
 *
 * Clamped, because the fix has a limit: a body at a tenth of walking pace does
 * not want a tenth-speed walk, it wants a slow walk and the small amount of
 * skating that comes with it. Beyond the clamp the alternative is a body moving
 * its legs so slowly it looks broken.
 *
 * ---------------------------------------------------------------------------
 * The floor is set by the touch stick, not by network wobble
 * ---------------------------------------------------------------------------
 * It was 0.55, chosen when the only *sustained* speeds were the keyboard's -
 * exactly `WALK_PACE` or exactly `SPRINT_PACE` - so the floor only ever caught
 * a moment of easing and nobody stood on it. The touch stick is analog and
 * squared (see `input/touch.ts`: the first half of the throw is for aiming), so
 * on a phone almost all walking happens at 1-4 cells a second - *below* where a
 * 0.55 floor lets the legs match. Every mobile walk was pinned at the floor,
 * legs striding at 3.85 cells a second over a body doing half that, which is
 * the report: the walking speed and the animation are not in sync.
 *
 * 0.3 is where the trade balances now. Speeds from 2.1 cells a second up play
 * exactly in step, which covers the stick from about half deflection; below
 * that the clamp is back to doing what it always did, preferring a slow walk
 * with a little skate over legs that look stopped mid-stride. The run's floor
 * never bites either way - hysteresis drops a run back to a walk long before
 * `speed / SPRINT_PACE` gets down to any floor.
 */
export function rateFor(motion: Motion, speed: number): number {
  if (motion !== 'walk' && motion !== 'run') return 1

  const authored = motion === 'run' ? SPRINT_PACE : WALK_PACE
  const wanted = speed / authored
  return Math.min(1.6, Math.max(0.3, wanted))
}


/**
 * How long a change in measured speed takes to become the speed we animate to.
 *
 * A time constant rather than a frame count, because the thing being smoothed
 * arrives at 8 Hz and is *drawn* at whatever the monitor does - a fixed fraction
 * per frame would mean a 144 Hz screen smoothing over half as long as a 60 Hz
 * one, and the same body walking differently on two machines.
 *
 * Short, because the large failure - a gap in the packets - is handled by not
 * measuring at all rather than by smoothing over it. All this has left to absorb
 * is the step at a packet boundary, so it can be brief enough that somebody who
 * genuinely stops is standing still in about a fifth of a second.
 */
export const SPEED_SETTLE = 0.07

/**
 * The speed the legs should believe, given what the wire implies this frame.
 *
 * ---------------------------------------------------------------------------
 * Why the measured number is not usable directly
 * ---------------------------------------------------------------------------
 * A peer's position is interpolated between two samples 125 ms apart, so across
 * the frames between packets the drawn position moves at a *constant* rate and
 * then changes rate in one step. Differentiating that gives a speed that is
 * flat, then steps, then - when a packet is late and the buffer holds the last
 * one - drops to exactly zero, and then spikes as the next pair covers the whole
 * gap in a single frame.
 *
 * Fed straight to `motionFor` that is a body which walks, stands to attention,
 * sprints and walks again several times a second on a network doing nothing
 * unusual. That is the "it keeps lagging" people report, and it is not the
 * positions - `Crowd` interpolates those and they are smooth. It is the
 * derivative of them.
 *
 * ---------------------------------------------------------------------------
 * Three separate things, because it is three separate faults
 * ---------------------------------------------------------------------------
 * **`null` means no information, and holds.** While the buffer is past its
 * newest sample it is showing the last thing somebody said, not an
 * interpolation - the position is frozen because nothing has arrived, which says
 * nothing at all about whether they are moving. Deriving zero from it is reading
 * a measurement out of an absence. `Placed.settled` is exactly this fact and
 * nothing read it until now.
 *
 * **Anything above a sprint is clamped.** A body cannot outrun `SPRINT_PACE`, so
 * a larger number is a buffer jump or a teleport rather than a gait, and the
 * fastest clip is already playing - clamping discards nothing an animation could
 * have shown and stops one bad frame from latching a run.
 *
 * **Then it is eased.** Exponential rather than a rolling window: one number
 * instead of a per-body buffer, and exact under any step size, which is what
 * makes two people watching the same body see the same walk.
 *
 * The hysteresis in `motionFor` is deliberately not the answer to any of this.
 * That stops a body flickering between two clips at a threshold; this stops the
 * number reaching the threshold. They are different halves and the first version
 * of this file had only one of them.
 */
export function easeSpeed(previous: number, measured: number | null, delta: number): number {
  if (delta <= 0 || measured === null) return previous
  const seen = Math.min(measured, SPRINT_PACE)
  return previous + (seen - previous) * (1 - Math.exp(-delta / SPEED_SETTLE))
}
