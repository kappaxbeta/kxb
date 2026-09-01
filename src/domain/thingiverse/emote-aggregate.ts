import type { Asker } from '@/domain/thingiverse/commands'
import {
  EMOTE_TREE_STREAM_TYPE,
  type EmoteTreeEvent,
} from '@/domain/thingiverse/emote-events'
import { type EmoteTree, freshTree, treeProblems, walk } from '@/domain/thingiverse/emote-tree'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * Commands against a space's emote menu.
 *
 * One command, because there is one thing anybody does to a menu: they arrange
 * it and press Save. Adding a row, renaming one and dragging one between
 * branches are all "the menu is now this", and the editor holds the whole thing
 * anyway - see `EmoteTreeSet` for why it travels whole.
 *
 * ---------------------------------------------------------------------------
 * Who may
 * ---------------------------------------------------------------------------
 * Any member, and that is deliberately wider than a blueprint's rule. A
 * blueprint is *somebody's* - it has an owner, it can be handed over, and only
 * the owner or an admin may reshape it. A menu is the space's: there is one, it
 * is what everybody in the room reaches for, and making it an owned object
 * would mean the first person to arrange it owns the only menu the space has.
 *
 * The cost is that two people editing it at once is a last-writer-wins fight.
 * That is what the version check on `executeCommand` already turns into a
 * refusal - "Someone else changed that. Try again." - which is the right answer
 * for a document one person edits at a time and nobody edits often.
 */
export type EmoteCommand = { type: 'SetEmoteTree'; by: Asker; tree: EmoteTree }

export interface EmoteTreeState {
  /** What the menu is now. `freshTree()` for a space nobody has arranged. */
  tree: EmoteTree
  /** How many rows it holds, for the no-op check. See `decide`. */
  rows: number
}

export const initialEmoteTreeState: EmoteTreeState = { tree: freshTree(), rows: 0 }

export const emoteTreeDecider: Decider<EmoteTreeState, EmoteCommand, EmoteTreeEvent> = {
  streamType: EMOTE_TREE_STREAM_TYPE,
  initialState: initialEmoteTreeState,

  evolve(state, event) {
    switch (event.type) {
      case 'EmoteTreeSet':
        return { tree: event.data.tree, rows: walk(event.data.tree).length }
      default:
        return state
    }
  },

  decide(state, command) {
    switch (command.type) {
      case 'SetEmoteTree': {
        const problems = treeProblems(command.tree)
        if (problems.length > 0) {
          // Joined rather than thrown one at a time: the editor already marks
          // every bad row as you type, so a refusal that reaches the server has
          // got past that and is worth printing in full - it is the only copy
          // of the reason somebody will see.
          throw new DomainError(problems.join('; '))
        }

        /**
         * Saving a menu nobody touched records nothing.
         *
         * Compared as JSON, which is the honest comparison for a document that
         * is *stored* as JSON: two trees that serialise identically are the
         * same tree as far as every reader of this log is concerned, and a
         * structural walk would additionally have to decide whether an absent
         * `key` and an undefined one differ. They do not - `JSON.stringify`
         * drops both.
         *
         * Worth having because the editor's Save is one button for the whole
         * menu, so pressing it twice is normal and a log with a second
         * identical event in it is a log that says somebody rearranged the
         * menu when nobody did.
         */
        if (JSON.stringify(state.tree) === JSON.stringify(command.tree)) return []

        return [
          {
            type: 'EmoteTreeSet',
            data: { tree: command.tree, byId: command.by.actorId },
          },
        ]
      }
      default:
        return []
    }
  },
}
