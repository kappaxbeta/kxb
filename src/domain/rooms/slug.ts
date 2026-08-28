/**
 * A room's name, as it appears in a URL.
 *
 * Rooms are addressed by name rather than by uuid - `/t/acme/rooms/workshop`
 * instead of `/t/acme/rooms/4f1c…`. A uuid in a link is unreadable, unsayable
 * over a desk and impossible to check against the room you meant to open; the
 * name is all three, and it is what everybody calls the place anyway.
 *
 * Derived, never stored on the event. The read model holds a `slug` column so
 * the database can enforce that two open rooms in one space never collide, but
 * the value in it is always this function applied to the room's current name -
 * which means a replay of the log reproduces every URL exactly, and a rename
 * moves the room's address with it. That is the trade: rename a room and old
 * links to it stop resolving. Worth it, because the alternative is a URL that
 * says `workshop` for a room now called `Storage`.
 *
 * No diacritics, no punctuation, no runs of dashes, nothing that needs
 * percent-encoding - a link that survives being pasted into a chat message.
 */
export const ROOM_SLUG_MAX = 60

export function slugifyRoomName(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Strip the combining marks NFKD just separated out, so "Café" is `cafe`
      // rather than `caf-`. Names in this app are typed by people, and people
      // type accents.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, ROOM_SLUG_MAX)
      // The slice can leave a trailing dash behind that the trim above already
      // removed once.
      .replace(/-+$/, '')
  )
}

/**
 * The slug a room is actually reachable at.
 *
 * A name made entirely of characters that do not survive slugifying - emoji,
 * or a script this transliteration does not cover - would produce the empty
 * string, and every such room in a space would produce the same empty string.
 * Those fall back to the room's id: unreadable, but unique and never a
 * collision, and the space can rename its way out of it.
 */
export function roomSlug(name: string, roomId: string): string {
  return slugifyRoomName(name) || roomId
}
