/**
 * Is this keystroke somebody typing, rather than somebody playing?
 *
 * Trivial, and load-bearing. Every scene in this app listens for keys on the
 * *window* - the character controller records `event.code` into a map with no
 * conditions at all, and the lounge's hotkeys read E, Z, G, Q, F and V straight
 * off the same stream. That worked for as long as there was nothing in a scene
 * to type into.
 *
 * Chat is the first thing there is. Without this guard, typing "we should" into
 * the panel opens the block picker on the E, toggles the dance on the G, throws
 * a kick on the Q, and walks the player across the room on the W - while the
 * letters land in the box, so the only evidence is an avatar wandering off
 * mid-sentence. It is not a chat bug; it is every existing key handler being
 * right about a world that no longer exists.
 *
 * Kept in its own module rather than repeated inline because the number of
 * places that have to agree about it is exactly the number of places that
 * listen for keys, and one of them forgetting is the failure above.
 */
export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable === true
  )
}
