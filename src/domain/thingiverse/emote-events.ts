import type { DomainEvent } from '@/es/types'
import type { EmoteTree } from '@/domain/thingiverse/emote-tree'

/**
 * What happens to a space's emote menu over its life.
 *
 * ---------------------------------------------------------------------------
 * One stream per *space*, not per node and not per person
 * ---------------------------------------------------------------------------
 * Every other noun in this domain has identity - a blueprint is renamed, handed
 * over and retired, so it gets a stream each. The menu has none of that. There
 * is exactly one per space, it is never handed to anybody, and the only thing
 * that ever happens to it is that somebody rearranged it.
 *
 * So the stream id *is* the tenant id. That is unusual here and it is the
 * honest shape for a singleton: minting a separate id would mean a lookup
 * before every write to answer "which menu", and a table whose one row has a
 * key nobody can derive.
 *
 * ---------------------------------------------------------------------------
 * The whole tree travels, every time
 * ---------------------------------------------------------------------------
 * `EmoteTreeSet` carries the entire menu rather than the branch that changed,
 * and the reason is the edit that would otherwise be two events: dragging a
 * clip from one branch to another is *one decision* touching two places, and as
 * a remove-then-add it has a window where the clip is in neither branch or in
 * both. A reader that caught the log mid-move would draw a menu nobody has.
 *
 * The size makes it free. A menu is at most a hundred and twenty rows of a
 * label, a key and a clip name - a few kilobytes, written when somebody presses
 * Save and not otherwise. `BlueprintReshaped` makes the same trade against a
 * smaller document and a better-argued case; this one is easier.
 *
 * There is no `EmoteTreeCleared`. An empty menu is a tree with no roots, which
 * `EmoteTreeSet` can carry, and a second event meaning "the same as that one
 * but empty" is a second thing every reader has to handle to learn nothing.
 */

export const EMOTE_TREE_STREAM_TYPE = 'thingiverse_emotes'

export type EmoteTreeSet = DomainEvent<
  'EmoteTreeSet',
  {
    tree: EmoteTree
    /**
     * Who arranged it.
     *
     * In the data as well as in the metadata's `actorId`, exactly as
     * `BlueprintDrawn` carries an owner: the actor is *who did this*, and this
     * is *whose arrangement the space is now looking at*. They are the same
     * person at the moment of writing and come apart the first time somebody
     * wants to know who moved the wave - a question the metadata answers only
     * if you go and read it, and a projection cannot.
     */
    byId: string
  }
>

export type EmoteTreeEvent = EmoteTreeSet
