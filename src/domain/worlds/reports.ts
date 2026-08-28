/**
 * What can be wrong with a world, as a fixed list.
 *
 * These are *quality* reports, not moderation ones, and the difference decides
 * everything about the list. A moderation report ends with an admin taking
 * something off the platform; one of these ends with a label on a card, so that
 * the next space knows before it copies the world in rather than ten minutes
 * after, standing in front of a finish line it cannot reach.
 *
 * The test a reason has to pass to be here: somebody who built the world could
 * *fix* it. "The finish is walled off" is a note; "I did not like it" is not.
 * The one exception is `offensive`, which is on the list because a person who
 * has just seen something they want gone should not have to work out that the
 * report they want is somewhere else - it hands them straight to the moderation
 * queue that already exists (see 20260803080000_world_reports.sql).
 *
 * Client-safe: the picker on the world page and the labels on the cards are on
 * opposite sides of the wire and must agree.
 */

export interface WorldReportReason {
  id: string
  /** What the reporter picks. Phrased as the thing they saw. */
  label: string
  /** What the card says when enough people have said it. Shorter, and neutral. */
  badge: string
  hint: string
  /**
   * Whether this is really a moderation matter.
   *
   * Reported the same way, handled differently: the label is not the point, and
   * the action tells the reporter where it has actually gone.
   */
  moderation?: boolean
}

export const WORLD_REPORT_REASONS: readonly WorldReportReason[] = [
  {
    id: 'blocked-finish',
    label: 'The finish line is blocked',
    badge: 'finish blocked',
    hint: 'You cannot reach the end of the course, or it is walled in.',
  },
  {
    id: 'unreachable-goal',
    label: 'A goal cannot be reached',
    badge: 'goal unreachable',
    hint: 'A goal is inside the scenery, out of bounds, or has no way to it.',
  },
  {
    id: 'bad-spawn',
    label: 'People arrive in a bad place',
    badge: 'bad spawn',
    hint: 'The spawn is inside a wall, on the roof, or outside the world.',
  },
  {
    id: 'impossible-jump',
    label: 'A jump is impossible',
    badge: 'impossible jump',
    hint: 'A gap nobody can clear, so the route stops there.',
  },
  {
    id: 'empty',
    label: 'There is nothing here',
    badge: 'nearly empty',
    hint: 'The world arrives empty, or almost — most of it did not survive the copy.',
  },
  {
    id: 'not-as-described',
    label: 'It is not what it says it is',
    badge: 'mislabelled',
    hint: 'The name, the picture or the tags describe a different world.',
  },
  {
    id: 'offensive',
    label: 'Something in it should not be here',
    badge: 'reported',
    hint: 'Words or shapes nobody should be sent into. This one reaches a human.',
    moderation: true,
  },
] as const

const REASONS = new Map(WORLD_REPORT_REASONS.map((reason) => [reason.id, reason]))

export function isReportReason(value: string): boolean {
  return REASONS.has(value)
}

export function reportReason(id: string): WorldReportReason | undefined {
  return REASONS.get(id)
}

/**
 * How many reports of one kind before a card says so.
 *
 * Two, not one. A single report is often somebody who could not find the door,
 * and putting "finish blocked" on a world because one person said so hands
 * anybody a button that damages other people's work. Two independent people
 * saying the same specific thing is a different claim.
 *
 * The exception is the moderation arm, which is not a label at all - it goes to
 * the queue on the first press.
 */
export const REPORTS_BEFORE_LABEL = 2

export interface WorldLabel {
  id: string
  badge: string
  count: number
}

/**
 * The labels a world has earned, from the counts on its row.
 *
 * Ordered by how many people said it, so the loudest problem is first. Reasons
 * this build does not recognise are dropped, for the reason the tags are: a
 * retired id is still sitting in rows written before it went, and a card cannot
 * render a badge it has no words for.
 */
export function labelsFor(counts: unknown): WorldLabel[] {
  if (!counts || typeof counts !== 'object') return []

  return Object.entries(counts as Record<string, unknown>)
    .flatMap(([id, tally]) => {
      const reason = REASONS.get(id)
      const count = typeof tally === 'number' ? tally : 0
      // The moderation arm never becomes a badge: "somebody reported this" on a
      // public card is a thing anybody can put there, about anybody's world.
      if (!reason || reason.moderation || count < REPORTS_BEFORE_LABEL) return []
      return [{ id, badge: reason.badge, count }]
    })
    .sort((a, b) => b.count - a.count)
}
