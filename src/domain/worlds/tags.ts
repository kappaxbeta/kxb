/**
 * The tag vocabulary.
 *
 * A fixed list, not free text, and that is the whole design decision here.
 *
 * Free tags are what you reach for when you want people to describe their own
 * work, and on a catalogue this size they produce `arena`, `Arena`, `arenas`
 * and `battle-arena` as four different filters within a week - at which point
 * the filter row is useless and the fix is a moderation queue nobody asked
 * for. A closed list means the discovery page's filters can be *the* filters:
 * every one of them has results, none of them are duplicates, and a world is
 * either in the bucket or it is not.
 *
 * The cost is that the day somebody builds something these words do not
 * describe, they cannot say so. That is a pull request, which is the right
 * amount of friction for a vocabulary the whole platform sorts by.
 *
 * Shared by the builder's tag picker and the discovery page's filter row, so
 * they cannot drift apart - and free of anything platform-specific, because
 * both halves of the app import it.
 */

export interface WorldTag {
  id: string
  label: string
  /** What it means, for the picker's tooltip. Stops `arena` and `pitch` blurring. */
  hint: string
}

export const WORLD_TAGS: readonly WorldTag[] = [
  { id: 'arena', label: 'Arena', hint: 'Built to fight in — cover, sightlines, no dead ends.' },
  { id: 'pitch', label: 'Pitch', hint: 'A football ground, with room for goals at each end.' },
  { id: 'hangout', label: 'Hangout', hint: 'Somewhere to stand around and talk.' },
  { id: 'showcase', label: 'Showcase', hint: 'Built to be looked at rather than played in.' },
  { id: 'event', label: 'Event', hint: 'A stage, seating, a room for a crowd.' },
  { id: 'office', label: 'Office', hint: 'Desks, meeting rooms, a place that reads as work.' },
  { id: 'nature', label: 'Nature', hint: 'Parks, trees, water, terrain.' },
  { id: 'city', label: 'City', hint: 'Streets and buildings.' },
  { id: 'maze', label: 'Maze', hint: 'Getting lost is the point.' },
  { id: 'parkour', label: 'Parkour', hint: 'Jumps, gaps, a route to the top.' },
  { id: 'small', label: 'Small', hint: 'A few hundred blocks — quick to drop into a space.' },
  { id: 'seasonal', label: 'Seasonal', hint: 'Snow, holidays, something that comes round once a year.' },
] as const

/** How many tags one world may carry. Matches the check constraint on the table. */
export const MAX_WORLD_TAGS = 6

const TAG_IDS = new Set(WORLD_TAGS.map((tag) => tag.id))

export function isWorldTag(value: string): boolean {
  return TAG_IDS.has(value)
}

export function tagLabel(id: string): string {
  return WORLD_TAGS.find((tag) => tag.id === id)?.label ?? id
}

/**
 * Whatever arrived, as a list of tags this vocabulary recognises.
 *
 * Unknown ids are dropped rather than rejected. The input is a form post and a
 * tag is decoration: refusing to save somebody's world because a stale tab sent
 * a tag id we have since renamed would be losing their building over a label.
 * Deduplicated and capped, and the order of `WORLD_TAGS` is what survives, so
 * two worlds with the same tags always list them the same way round.
 */
export function normaliseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const wanted = new Set(
    value.filter((entry): entry is string => typeof entry === 'string' && isWorldTag(entry)),
  )
  return WORLD_TAGS.filter((tag) => wanted.has(tag.id))
    .slice(0, MAX_WORLD_TAGS)
    .map((tag) => tag.id)
}
