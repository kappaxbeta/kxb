import type { DomainEvent } from '@/es/types'

/**
 * The marks a match is played between: football's two goals, and a race's start
 * and finish.
 *
 * A third kind of thing in the world, after blocks and images, and it lands on
 * the same side of the line images did: a goal has *identity*. It is moved,
 * resized, reassigned to the other side and taken away again, and every one of
 * those refers to the same object over time. That is a lifecycle, and a
 * lifecycle gets its own stream. See ./image-events.ts, which makes the argument
 * at length, and ./events.ts for why blocks are the other way round.
 *
 * A race's start and finish live here rather than in a stream of their own,
 * because they are the same object: a rectangle standing on the block lattice
 * that something crosses. A finish line is a goal you run through instead of
 * kicking into, and it is placed, dragged, resized and turned by the same hands
 * with the same buttons - so it gets the same stream, the same read model, the
 * same per-world key and, for free, the one property that decides it: marks
 * travel with a world when it is saved as a battlefield. A parallel stream would
 * have meant an arena whose finish line stayed behind.
 *
 * The one way this differs from an image: a goal names its **world**. Images
 * exist only in a workspace's lounge, so their read model needs nothing beyond
 * a tenant; goals have to survive being saved as a battlefield and fought on by
 * a visiting space, which means they are keyed the way blocks are - by
 * `worldId`, defaulting to the tenant's own lounge. An arena whose goals stayed
 * behind when it was saved would be an arena you cannot play football on.
 *
 * What a goal is *geometrically* - a rectangle the ball either crossed or did
 * not - lives in src/app/world/lounge/football.ts, which imports the shape
 * from here. The rule of that split is the one ./streams.ts states: the durable
 * facts and their bounds belong to the domain, and anything that needs a frame
 * loop to mean something does not.
 */

export const LOUNGE_GOAL_STREAM_TYPE = 'lounge_goal'

/** The two sides. Deliberately the same words the team battle mode uses. */
export const GOAL_TEAMS = ['red', 'blue'] as const
export type GoalTeam = (typeof GOAL_TEAMS)[number]

/**
 * What a mark is for.
 *
 * The two football goals are named by the side that defends them, which is why
 * `red` and `blue` sit in the same union as `start` and `finish` rather than
 * under a separate `team` field: every mark answers exactly one question - what
 * is this rectangle - and a start line with a team would be a fact in the log
 * that nothing will ever read.
 *
 * `start` is where a race lines up and where a knocked-out racer comes back;
 * `finish` is the plane that ends their run. One start per course - two would
 * mean half the grid runs a different race - and any number of finishes, so a
 * wide finish can be built from several panels.
 */
export const GOAL_KINDS = ['red', 'blue', 'start', 'finish'] as const
export type GoalKind = (typeof GOAL_KINDS)[number]

export function isGoalTeam(kind: string): kind is GoalTeam {
  return (GOAL_TEAMS as readonly string[]).includes(kind)
}

export function isGoalKind(kind: string): kind is GoalKind {
  return (GOAL_KINDS as readonly string[]).includes(kind)
}

/** The side a mark belongs to, or undefined for the ones that belong to nobody. */
export function teamOf(goal: { kind: GoalKind }): GoalTeam | undefined {
  return isGoalTeam(goal.kind) ? goal.kind : undefined
}

/**
 * Size limits in cells.
 *
 * The floor is 1, not 0: a goal with no width is invisible and unscoreable, and
 * somebody who shrinks one to nothing has no way of finding it again to undo
 * that. The ceiling keeps a goal a goal rather than a wall you cannot help
 * scoring in.
 */
export const MIN_GOAL_SIZE = 1
export const MAX_GOAL_SIZE = 24

/**
 * What a freshly placed goal measures.
 *
 * Five by four: wide enough that a shot from distance is worth taking, short
 * enough that standing in it is goalkeeping rather than filling it. The pitch
 * template lays down the same size, so a goal placed by hand matches the ones
 * that came with the arena.
 */
export const DEFAULT_GOAL_WIDTH = 5
export const DEFAULT_GOAL_HEIGHT = 4

/**
 * What a freshly placed start or finish measures.
 *
 * Wider than a goal and for a different reason: nobody shoots at it, and both
 * jobs it does are about *spread*. A start line is the grid - racers stand along
 * it, so nine cells is room for a full field abreast rather than a queue - and a
 * finish has to be hard to run around, since a racer who misses the plane
 * finishes nothing and has no way of knowing why.
 */
export const DEFAULT_LINE_WIDTH = 9
export const DEFAULT_LINE_HEIGHT = 4

/**
 * How many marks one world may hold.
 *
 * More than two, because an arena with two goals at each end is a reasonable
 * thing to build and the scoring rule does not care how many there are - any
 * ball through any red goal is a point for blue. Bounded all the same, so a
 * world cannot accumulate goals until the frame loop is testing hundreds of
 * planes per ball.
 *
 * One budget for goals and race marks together, rather than one each: they are
 * the same object and the same per-frame cost, and a ground with a pitch at one
 * end and a course round the outside is a world doing two things at once, which
 * is a fine thing for a world to do until it is doing eight.
 */
export const MAX_GOALS_PER_WORLD = 8

/**
 * A mark, as the world holds it.
 *
 * `x`/`y`/`z` name the cell its bottom centre sits in, on the same lattice the
 * blocks and images sit on - so a goal can be lined up against something built,
 * which is why it is placed in creative mode rather than typed into a form.
 *
 * `facing` is quarter turns about Y, exactly as an image's is: 0 and 2 put the
 * rectangle across Z, 1 and 3 across X. The two pairs are not distinguished, and
 * deliberately - a plane has no front, and a goal scored from behind is still a
 * goal. A finish crossed the wrong way is the same story: see `goalCrossed`.
 */
export interface Goal {
  id: string
  /**
   * What this rectangle is: a side's goal, or a race's start or finish.
   *
   * For the two goals it is whose goal it is - not who scores in it, which is
   * `scoringSide`'s answer and the opposite one.
   */
  kind: GoalKind
  x: number
  y: number
  z: number
  /** Cells across. */
  width: number
  /** Cells tall, measured up from `y`. */
  height: number
  facing: number
}

/** The world a goal is in. Absent means the workspace's own lounge, as ever. */
export type GoalWorld = { worldId?: string }

/**
 * A mark stood in the world.
 *
 * `kind` is what it is; `team` is what `kind` was called before a race needed
 * marks that belong to nobody, and every event written up to that point carries
 * it. Both are optional here and exactly one is present in any real event -
 * `evolve` reads `kind ?? team`, which is the whole of the migration: an old red
 * goal replays as `kind: 'red'` because that is what it always meant.
 */
export type GoalPlaced = DomainEvent<
  'GoalPlaced',
  GoalWorld & {
    kind?: GoalKind
    /** Written before race marks existed. Read only as a fallback for `kind`. */
    team?: GoalTeam
    x: number
    y: number
    z: number
    width: number
    height: number
    facing: number
  }
>

export type GoalMoved = DomainEvent<'GoalMoved', { x: number; y: number; z: number }>

export type GoalResized = DomainEvent<'GoalResized', { width: number; height: number }>

export type GoalRotated = DomainEvent<'GoalRotated', { facing: number }>

/**
 * Handed to the other side, or turned into something else entirely.
 *
 * Its own event rather than a field on a general "goal edited", because which
 * side defends which end is the single most consequential thing about a goal -
 * getting it wrong means every point in a match went to the wrong team - and a
 * log that says plainly when it changed is worth more than one that makes you
 * diff two snapshots to find out.
 *
 * `kind` widens it to the marks that have no team without a second event that
 * would say the same thing: re-marking a finish as a start is the same act as
 * handing a goal to blue, and the name it was given first is not worth a schema
 * change to the log.
 */
export type GoalTeamChanged = DomainEvent<
  'GoalTeamChanged',
  { kind?: GoalKind; team?: GoalTeam }
>

export type GoalRemoved = DomainEvent<'GoalRemoved', Record<string, never>>

export type LoungeGoalEvent =
  | GoalPlaced
  | GoalMoved
  | GoalResized
  | GoalRotated
  | GoalTeamChanged
  | GoalRemoved

export const LOUNGE_GOAL_EVENT_LABELS: Record<LoungeGoalEvent['type'], string> = {
  GoalPlaced: 'goal placed',
  GoalMoved: 'goal moved',
  GoalResized: 'goal resized',
  GoalRotated: 'goal turned',
  GoalTeamChanged: 'goal reassigned',
  GoalRemoved: 'goal removed',
}
