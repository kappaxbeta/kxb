'use client'

/**
 * The seam between typing `/battle` and the menu that opens.
 *
 * `<ChatDock>` is where the words arrive and `<SummonDock>` is where the menu
 * lives, and neither should import the other's state: the dock pattern in this
 * folder is one subscriber per concern, published across module-level seams -
 * `here-store` and `match-store` are the write-ups. This is the smallest
 * possible one: a bell, rung by the chat, heard by whoever draws the menu.
 *
 * Behaviour crosses here and data does not, which is the *opposite* trade to
 * `match-store` - and it is the same rule applied, not an exception: everything
 * the menu needs (the roster, the levels, the channel) already belongs to the
 * summon dock, so the only thing the chat has to say is "now".
 */

const listeners = new Set<() => void>()

/** `/battle` was typed. Open the menu, whoever owns one. */
export function callSummon(): void {
  for (const listener of listeners) listener()
}

/** Hear the call. Returns the unsubscribe, for an effect's cleanup. */
export function onSummon(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
