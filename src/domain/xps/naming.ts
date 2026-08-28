import { XP_NAME_MAX } from '@/domain/xps/events'

/**
 * What a copy is called.
 *
 * Its own module rather than a helper in `actions.ts`, because that file is
 * `'use server'` and every export in one has to be an async server action —
 * a sync helper cannot live there, and a pure naming rule should not have to
 * become a network call to be tested.
 *
 * "Minigolf" becomes "Minigolf copy"; "Minigolf copy" becomes "Minigolf copy 2"
 * rather than "Minigolf copy copy". Somebody duplicating the same thing four
 * times gets a list they can read instead of a stutter.
 */
export function nameForCopy(name: string): string {
  const match = /^(.*) copy(?: (\d+))?$/.exec(name)
  const next = match
    ? `${match[1]} copy ${match[2] ? Number(match[2]) + 1 : 2}`
    : `${name} copy`

  /**
   * Trimmed, because a name already at the cap plus a suffix is over it — and
   * the decider would refuse the copy for a reason nobody could act on ("a name
   * cannot be longer than 80 characters", about a name they never typed).
   * Truncating is the only answer that leaves the button working.
   */
  return next.length <= XP_NAME_MAX ? next : `${next.slice(0, XP_NAME_MAX - 1).trimEnd()}…`
}

/**
 * A name no other project in this space is already using.
 *
 * ---------------------------------------------------------------------------
 * A different question from `nameForCopy`
 * ---------------------------------------------------------------------------
 * That one asks *what is a copy called* and answers from the source's name
 * alone - it has never looked at the space, so duplicating "Minigolf" twice
 * produced "Minigolf copy" twice. This asks *what is free*, and the two compose:
 * the copy rule proposes, this disposes.
 *
 * It matters most for a remix, where nobody types anything. Two people taking
 * the same level we ship got two projects called "Steal a Plant" and no way to
 * tell them apart in a list whose whole job is telling them apart.
 *
 * ---------------------------------------------------------------------------
 * Counting from the stem, not stacking suffixes
 * ---------------------------------------------------------------------------
 * The naive version appends " 2" to whatever it was handed, so a second
 * "Minigolf 2" becomes "Minigolf 2 2". Instead a trailing number is read as a
 * number rather than as part of the name: the stem is what is left, and the
 * search counts up from there.
 *
 * **The wanted name is tried first, exactly as given.** A space with nothing
 * called "Minigolf 4" gets "Minigolf 4" when that is what somebody typed - the
 * stem is only consulted once the name is actually taken, so this never
 * renumbers a name that was free.
 *
 * ---------------------------------------------------------------------------
 * Case-insensitive, and why there is no unique index behind it
 * ---------------------------------------------------------------------------
 * "minigolf" and "Minigolf" are the same name to everybody reading the list, so
 * they are the same name here. What this is *not* is a constraint: there is no
 * unique index on `(tenant_id, name)`, deliberately. One would refuse a rename
 * rather than adjust it, would break every space that already holds duplicates,
 * and would turn two people pressing Remix in the same second into an error for
 * one of them instead of a "2" - which is the outcome this exists to produce.
 *
 * So this is de-duplication at the moment of naming, and the honest failure is
 * a race producing two "Steal a Plant 2"s. That is a list somebody can fix by
 * typing, which is the thing a constraint would have taken away.
 *
 * `taken` is whatever the caller could see. A member who cannot read a private
 * project in the space cannot collide with it either - RLS decides what is in
 * the list, and this does not second-guess it.
 */
export function nameInSpace(wanted: string, taken: Iterable<string>): string {
  const used = new Set<string>()
  for (const name of taken) used.add(name.trim().toLowerCase())

  const free = (candidate: string) => !used.has(candidate.trim().toLowerCase())
  if (free(wanted)) return wanted

  const match = /^(.*?)\s+(\d+)$/.exec(wanted)
  const stem = match ? match[1]! : wanted
  const from = match ? Number(match[2]!) + 1 : 2

  /**
   * Bounded, because an unbounded search is a loop a caller cannot reason about.
   *
   * The ceiling is arbitrary and the fallback is deliberate rather than a throw:
   * a space with a thousand levels of one name has a problem this function is
   * not going to solve, and refusing to create the thousand-and-first would be
   * this rule deciding what somebody may build.
   */
  for (let n = from; n < from + 1000; n += 1) {
    const candidate = numbered(stem, n)
    if (free(candidate)) return candidate
  }

  return numbered(stem, from)
}

/**
 * A stem and its number, with the *stem* trimmed to make room.
 *
 * The trim has to fall on the name rather than on the end of the string, which
 * is the mistake the obvious version makes: truncating `"<80 chars> 2"` to the
 * cap cuts the number off, so every candidate comes out identical and the search
 * above spins through a thousand of the same string. Taking the room out of the
 * stem keeps the one character that makes two names different.
 *
 * Trimmed at all for the reason `nameForCopy` is: a name already at the cap plus
 * a suffix is over it, and the decider would refuse the create with a message
 * about the length of a name nobody typed.
 */
function numbered(stem: string, n: number): string {
  const suffix = ` ${n}`
  const room = XP_NAME_MAX - suffix.length
  return `${stem.length <= room ? stem : stem.slice(0, room).trimEnd()}${suffix}`
}
