/**
 * The shapes a round usually has, ready to be written into a level.
 *
 * ---------------------------------------------------------------------------
 * Why these exist when `startFlow` already does
 * ---------------------------------------------------------------------------
 * `startFlow` writes one empty phase and the panel draws the one warning that
 * is true of it - nothing leaves here. That is the right smallest thing for an
 * author who knows what a flow is. It is the wrong *first* thing for everybody
 * else, who has played a match and a board game and a race, and has never once
 * thought of any of them as "phases with arrows between them". What they know
 * is the shape of the game, and the shape is what these hand them.
 *
 * Each one is a flow the runtime already plays, every verb in it is a verb the
 * engine already has, and none of them invents vocabulary - which is the same
 * argument `flow.ts` makes about the block itself. The one this file adds is
 * that a starter may bring what a flow *needs to mean anything*: a field to
 * count in, a key to press, a thing to press it on. A board-game turn with no
 * die and no `roll` key is a machine with nothing to drive it, and the panel's
 * "nothing emits this" warning on every arrow would be the only thing it said.
 *
 * ---------------------------------------------------------------------------
 * What a starter may carry
 * ---------------------------------------------------------------------------
 *   `flow`         the block itself. Must hold on its own - `flowProblems` is
 *                  run over every one of these by the tests.
 *   `data`         fields the flow reads or writes. Added only where the level
 *                  does not already declare a field of that name; a starter
 *                  never overwrites what an author typed in the Data panel.
 *   `keys`         bindings the phases `allow`. Merged by `does` name, so a
 *                  level that already has `use` keeps its own key for it.
 *   `blueprints`   a thing the flow needs in the level, with the rules that
 *                  make it drive the flow. Skipped when the name is taken.
 *   `entities`     where that thing is put down, relative to the spawn.
 *
 * The `live` entry is the odd one: it is not a flow, it is the *absence* of
 * one, and it is in the list because the choice between a world and a run is
 * the first decision and the panel has to be able to say so. Applying it to a
 * level with a flow removes the flow; applying it to one without is a no-op.
 *
 * ---------------------------------------------------------------------------
 * Which scope a counter gets
 * ---------------------------------------------------------------------------
 * `run`, now that a `run` field travels - see `arbitrated` in ./data. This
 * paragraph used to say `space`, and say why: `run` did not persist, which was
 * the point, and it did not reach anybody else either, so a die rolled into one
 * was a die only the roller could see. The cost of the workaround was the bug
 * `data.ts` documents - a finished game leaving its numbers in the space's row
 * for ever, so the next table opened already won.
 *
 * It said the starter could change its mind in one word when the scope learned
 * to travel. This is that word.
 */

import type { Blueprint } from './blueprints'
import type { XpField } from './data'
import { ROUND_AGAIN, type XpFlow } from './flow'
import type { EntitySpec, PlayerKey } from './format'

export type FlowStarterId = 'live' | 'countdown' | 'match' | 'rounds' | 'board'

export interface FlowStarter {
  id: FlowStarterId
  /** English. The editor's dictionary carries the other languages by id. */
  name: string
  blurb: string
  /** The phases, in the order a player meets them. For the card, not the machine. */
  stages: readonly string[]
  /** Absent for `live`, which is the decision to have none. */
  flow?: XpFlow
  data?: Readonly<Record<string, XpField>>
  keys?: readonly PlayerKey[]
  blueprints?: Readonly<Record<string, Blueprint>>
  /** Offsets from the spawn, because a starter does not know the level's shape. */
  entities?: readonly (Omit<EntitySpec, 'x' | 'y' | 'z' | 'rotation' | 'scale' | 'props'> & {
    dx: number
    dy: number
    dz: number
    scale?: number
  })[]
}

/**
 * A turn a board game can be driven by, as a thing you press.
 *
 * One die with two rules on it. `pressed roll` asks the table for a number and
 * says so; `pressed done` clears the number, hands the turn on and says that.
 * Both events are what the flow's arrows listen for, so the flow and the die
 * arrive agreeing about the names - which is the whole point of shipping them
 * together.
 *
 * `collider: 'none'` because a die you can walk into is a die that gets kicked
 * off the table, and `within` is left absent so the press works from anywhere:
 * the turn is yours wherever you are standing.
 */
const DIE: Blueprint = {
  model: 'boardgame/D6_A',
  collider: 'none',
  tags: ['die'],
  props: {},
  sockets: {},
  triggers: [
    {
      on: 'pressed',
      key: 'roll',
      do: [
        { op: 'roll', key: 'dice', sides: 6 },
        { op: 'sound', sound: 'tap' },
        { op: 'emit', event: 'rolled' },
      ],
    },
    {
      on: 'pressed',
      key: 'done',
      do: [
        { op: 'setProp', key: 'dice', value: 0, target: 'world' },
        { op: 'pass' },
        { op: 'emit', event: 'done' },
      ],
    },
  ],
}

export const FLOW_STARTERS: readonly FlowStarter[] = [
  {
    id: 'live',
    name: 'A live world',
    blurb:
      'No start and no end. People come and go, and what the level keeps in its space and shared fields is still there tomorrow. Most levels are this.',
    stages: [],
  },
  {
    id: 'countdown',
    name: 'Countdown, then play',
    blurb:
      'A held breath and then everything at once. Nobody can move for the first seconds, which is how a race or a scramble starts fair.',
    stages: ['ready', 'play'],
    flow: {
      start: 'ready',
      phases: {
        ready: {
          says: 'Get ready…',
          allow: [],
          next: [{ after: 5, go: 'play' }],
        },
        play: {
          says: 'Go!',
          does: [{ op: 'sound', sound: 'tap' }],
        },
      },
    },
  },
  {
    id: 'match',
    name: 'Kick-off, play, full time',
    blurb:
      'A match with a clock. Three seconds to get set, three minutes of play, and a whistle nobody can argue with. Score and time limits are in Mode.',
    stages: ['kickoff', 'play', 'over'],
    flow: {
      start: 'kickoff',
      phases: {
        kickoff: {
          says: 'Kick-off in a moment…',
          allow: [],
          next: [{ after: 3, go: 'play' }],
        },
        play: {
          says: 'Play!',
          next: [{ after: 180, go: 'over' }],
        },
        over: {
          says: 'Full time.',
          allow: [],
          does: [{ op: 'sound', sound: 'fanfare' }],
        },
      },
    },
  },
  {
    id: 'rounds',
    /**
     * Best of three, and the shape that made `flow.rounds` worth having.
     *
     * This starter used to say three four times: a declared `round` field, an
     * `addProp` in a phase nobody plays, a `when` comparing that field, and a
     * `wins` comparing it again. Every one of them had to agree, and an author
     * changing "three" to "five" edited three of them and left the fourth
     * ending the match a round early - silently, because a `wins` that holds
     * is indistinguishable from a match that was won.
     *
     * Now the machine counts: `rounds: 3` and a step to the seam. No field, no
     * verb, no condition, and nothing left to keep in step - which is the test
     * xp-flow.md §7 sets for the whole idea.
     */
    name: 'Best of three',
    blurb:
      'The same fight three times with a breather between. The level counts the rounds itself, and the match is over at the end of the third.',
    stages: ['ready', 'play', 'between'],
    flow: {
      rounds: 3,
      start: 'ready',
      phases: {
        ready: {
          says: 'Next round…',
          allow: [],
          next: [{ after: 3, go: 'play' }],
        },
        play: {
          says: 'Fight!',
          next: [{ after: 90, go: 'between' }],
        },
        between: {
          says: 'Round over.',
          allow: [],
          does: [{ op: 'sound', sound: 'tap' }],
          next: [{ after: 4, go: ROUND_AGAIN }],
        },
      },
    },
  },
  {
    id: 'board',
    name: 'Roll, move, next seat',
    blurb:
      'A turn that goes round the table. Roll the die, move while it is yours, hand it on. Comes with the die and the keys, so it plays before you add a single piece.',
    stages: ['roll', 'move'],
    data: {
      dice: { scope: 'run', value: 0, label: 'roll' },
    },
    keys: [
      { key: 'KeyE', does: 'use' },
      { key: 'KeyR', does: 'roll' },
      { key: 'KeyF', does: 'done' },
    ],
    blueprints: { die: DIE },
    entities: [{ blueprint: 'die', name: 'the-die', dx: 0, dy: 1.5, dz: 3, scale: 25 }],
    flow: {
      start: 'roll',
      phases: {
        /**
         * Both phases are the turn-holder's - `who: 'turn'` - because a table
         * is the level `FlowPhase.who` was written for: the arbiter already
         * refused an out-of-turn roll, and four live dice with one working
         * one was the silence that asked for the field.
         */
        roll: {
          says: 'Press R to roll the die.',
          allow: ['roll'],
          who: 'turn',
          next: [{ on: 'rolled', go: 'move' }],
        },
        move: {
          says: 'Your move — E picks up and puts down. F ends your turn.',
          allow: ['use', 'done'],
          who: 'turn',
          next: [{ on: 'done', go: 'roll' }],
        },
      },
    },
  },
]

export function flowStarterById(id: string): FlowStarter | undefined {
  return FLOW_STARTERS.find((starter) => starter.id === id)
}
