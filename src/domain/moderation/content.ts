/**
 * Reporting something somebody made, and taking it down.
 *
 * ---------------------------------------------------------------------------
 * One table, six kinds, rather than six tables
 * ---------------------------------------------------------------------------
 * `world_reports` exists and is shaped exactly right for one kind of thing: it
 * has a foreign key to `battlefields_read_model`, an open-per-reporter index,
 * and a queue an admin reads. The obvious move is to copy it per kind - and it
 * is wrong here, because the six things a person can report are not six
 * features. They are one: *somebody published something offensive, and it has
 * to go.*
 *
 * Six tables would mean six migrations, six policies, six queues on the
 * moderation page, and six chances for the fifth one to be forgotten when a
 * seventh kind of content ships. What an admin wants is one list, oldest first,
 * with a word saying what each row is.
 *
 * ---------------------------------------------------------------------------
 * What that costs, and why it is worth it
 * ---------------------------------------------------------------------------
 * A polymorphic target cannot have a foreign key. `world_reports` gets
 * `on delete cascade` for free; this cannot, so a report can outlive the thing
 * it is about.
 *
 * That turns out to be the behaviour you want rather than the price you pay. A
 * report is a record that somebody complained and what was decided - and the
 * most interesting reports are precisely the ones whose target is gone, because
 * *that is what upholding one does*. A cascade would delete the evidence at the
 * moment it started to matter.
 *
 * It does mean a row has to be readable on its own, which is why `title` is
 * captured at report time rather than joined at read time. An admin opening a
 * queue a week later must not be shown "a blueprint" and a uuid: by then the
 * thing may be hidden, retired or deleted, and a report you cannot identify is
 * a report you cannot act on.
 */

/**
 * The kinds of thing a person can report.
 *
 * Several of them share a table, and that is deliberate rather than sloppy: a
 * vehicle *is* a blueprint - one with a `vehicle` block on it - and a script
 * lives inside an XP document. Collapsing those to `blueprint` and `xp` would
 * lose the only thing the reporter actually knew, which is what they were
 * looking at when they hit the button. An admin reading "script" goes and looks
 * at the script.
 *
 * See `tableFor`, which is where the sharing is written down once.
 */
export const REPORT_KINDS = [
  'blueprint',
  'vehicle',
  'clip',
  'xp',
  'script',
  'movie',
  /**
   * A member's show, and one episode of it.
   *
   * Both point into `channel_releases_read_model`, because that is the table
   * with the published copy in it - a draft is not reportable, having never
   * been shown to anybody. Two kinds rather than one for the reason the
   * blueprint/vehicle pair gives: the reporter knew which of the two they were
   * looking at, and an admin reading "episode" opens the episode.
   */
  'show',
  'episode',
] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

/** What each kind is called in a queue somebody reads. */
export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  blueprint: 'blueprint',
  vehicle: 'vehicle',
  clip: 'clip',
  xp: 'XP',
  script: 'script',
  movie: 'movie',
  show: 'show',
  episode: 'episode',
}

/**
 * Which table a kind's `target_id` points into.
 *
 * The one place the sharing above is written down. Anything that has to resolve
 * a report to the thing it is about - the queue's link, the hiding - asks here
 * rather than restating the mapping, because a second copy is how `vehicle`
 * ends up looking somewhere `blueprint` does not.
 *
 * Not a foreign key, and not enforceable as one. See the note at the top.
 */
export type ReportTable =
  | 'thingiverse_blueprints_read_model'
  | 'thingiverse_clips_read_model'
  | 'xps_read_model'
  | 'published_scenes'
  | 'channel_releases_read_model'

export function tableFor(kind: ReportKind): ReportTable {
  switch (kind) {
    case 'blueprint':
    case 'vehicle':
      return 'thingiverse_blueprints_read_model'
    case 'clip':
      return 'thingiverse_clips_read_model'
    case 'xp':
    case 'script':
      return 'xps_read_model'
    case 'movie':
      return 'published_scenes'
    case 'show':
    case 'episode':
      return 'channel_releases_read_model'
  }
}

/**
 * How long a reason may be, and how short.
 *
 * A floor as well as a ceiling, because "bad" is not a report anybody can act
 * on and the person who wrote it is the only one who could have said more. Ten
 * characters is about four words, which is enough for "racist name" and is not
 * enough for a keystroke sent by accident.
 *
 * The ceiling is a paragraph. Past that it is a conversation, and the contact
 * form is the thing that already handles those.
 */
export const MIN_REPORT_REASON = 10
export const MAX_REPORT_REASON = 600

/** How long a captured title may be. A label, not the content. */
export const MAX_REPORT_TITLE = 120

/** Where a report can get to. The same three `world_reports` uses. */
export const REPORT_STATUSES = ['open', 'upheld', 'dismissed'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

/**
 * What upholding one does.
 *
 * **Hides, rather than deletes**, and the reasoning is `banned_worlds`' in as
 * many words: a ban takes something off the platform, it does not confiscate
 * somebody's building. The row stays where it is, the space that made it keeps
 * it, and every query that serves it to anybody else stops.
 *
 * Three things follow from that and all three are the point:
 *
 *   - it is reversible, by an admin who got it wrong, without anything having
 *     been reconstructed from a log;
 *   - the projections stay clean, so `resetProjection` cannot resurrect
 *     something that was taken down - which is the specific bug the arena ban
 *     was shaped to avoid;
 *   - the author is not silently robbed. What they see is that nobody else can
 *     see it, which is the honest description of what happened.
 */
export interface Hidden {
  kind: ReportKind
  targetId: string
  reason: string
}

/** Whatever is wrong with a report, said in words. */
export function reportProblems(input: {
  kind: string
  reason: string
  title?: string
}): string[] {
  const problems: string[] = []

  if (!(REPORT_KINDS as readonly string[]).includes(input.kind)) {
    problems.push(`${input.kind} is not something you can report`)
  }

  const reason = input.reason.trim()
  if (reason.length < MIN_REPORT_REASON) {
    problems.push(`say what is wrong with it, in at least ${MIN_REPORT_REASON} characters`)
  }
  if (reason.length > MAX_REPORT_REASON) {
    problems.push(`a reason is at most ${MAX_REPORT_REASON} characters`)
  }

  if (input.title !== undefined && input.title.length > MAX_REPORT_TITLE) {
    problems.push(`a title is at most ${MAX_REPORT_TITLE} characters`)
  }

  return problems
}
