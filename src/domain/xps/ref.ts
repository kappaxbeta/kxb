/**
 * How a place names the XP it is playing.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * `battles_read_model.xp_id` is a text column with a shape constraint on it -
 * `^[a-z0-9][a-z0-9-]{0,63}$` - and until now every value in it was a filename
 * under `public/xp/xps/`. That was true when an XP was a file and only a file.
 * It stopped being true the day a space could make one: a project lives in
 * `xps_read_model` with a numbered version beside it, and a battle pointing at
 * it has nothing to put in that column.
 *
 * So the column holds a **reference** rather than a filename, and this module
 * is the only place that knows how one is spelled. Two kinds:
 *
 * | | Spelling | Means |
 * |---|---|---|
 * | `builtin` | `sidestep` | A document we ship, read off disk |
 * | `project` | `p-<uuid>-v3` | Version 3 of a project in the database |
 *
 * ---------------------------------------------------------------------------
 * The version is in the reference, and that is the decision
 * ---------------------------------------------------------------------------
 * docs/xp/backlog.md §11.5 asks whether a place *pins* an XP or *copies* it,
 * and answers: pin the version, not the project. This is where that answer
 * lives. A match created against `p-<id>-v3` is fought inside v3 for as long as
 * the row exists, so an author saving v4 mid-tournament cannot change the
 * ground under people standing on it - and nobody has to copy 40MB of models to
 * get that guarantee, because `xp_versions` already keeps every version.
 *
 * ---------------------------------------------------------------------------
 * No migration, and that is not luck
 * ---------------------------------------------------------------------------
 * A UUID is `[a-f0-9-]`, `p-` and `-v` are in the alphabet, and the whole thing
 * is 41 characters against a limit of 64. The existing constraint, the zod
 * regex in `domain/battle/commands.ts` and the path guard on the disk read all
 * keep working unchanged, which is why the reference is spelled this way rather
 * than as the `p:<uuid>@3` that reads better and would have needed three
 * migrations to allow.
 *
 * **The collision is checked rather than assumed.** A builtin whose filename
 * happened to be `p-<a real uuid>-v<n>` would be read as a project, so
 * `parseXpRef` tries the project shape first and `ref.test.ts` pins the rule.
 * Nothing on disk is close, and a document is not free to name itself: the
 * filename is ours.
 */

/** A document we ship, addressed by the filename under `public/xp/xps/`. */
export interface BuiltinRef {
  kind: 'builtin'
  id: string
}

/** One version of one project in `xp_versions`. */
export interface ProjectRef {
  kind: 'project'
  xpId: string
  version: number
}

export type XpRef = BuiltinRef | ProjectRef

/**
 * The builtin alphabet.
 *
 * The same one `domain/battle/actions.ts` checks before joining it to a path,
 * and it is checked here as well rather than instead: this module decides what
 * a reference *means*, and the read decides what it is safe to open. A
 * validator that lives in only one place is one that is enforced only where
 * somebody remembered to call it - the argument `commands.ts` already makes
 * about the same alphabet.
 */
const BUILTIN = /^[a-z0-9][a-z0-9-]*$/

/**
 * `p-`, a lowercase UUID, `-v`, a version.
 *
 * Anchored, and the version has no leading zero, so one version has exactly one
 * spelling. Two references that mean the same thing would each be a row nothing
 * else matches.
 */
const PROJECT = /^p-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-v([1-9][0-9]{0,8})$/

/** The column's own limit, restated so a formatter cannot outgrow it silently. */
export const MAX_XP_REF = 64

export function formatXpRef(ref: XpRef): string {
  return ref.kind === 'builtin' ? ref.id : `p-${ref.xpId}-v${ref.version}`
}

/**
 * Every version of one project, as the string they all start with.
 *
 * For asking a question about a *world* rather than about a version of one -
 * how much was it played, which `xp_sessions` answers by prefix. It is here
 * rather than at the call site for the reason at the top of this file: a second
 * place that knows a reference begins `p-<uuid>-v` is a second place that can
 * be wrong about it, and this one is wrong in the direction where a query
 * quietly matches nothing.
 *
 * The trailing `-v` is what makes it safe to use as a prefix at all. Without it
 * a uuid that is a prefix of another uuid would collect somebody else's
 * sessions - which cannot happen with fixed-length uuids, and the `-v` means
 * nobody has to know that to read the query.
 */
export function projectRefPrefix(xpId: string): string {
  return `p-${xpId}-v`
}

/**
 * Read a reference, or refuse it.
 *
 * Project first, for the collision above. `null` rather than a throw because
 * every caller is holding a value out of a database column or a form, and the
 * honest answer to an unreadable one is "no such XP" rather than a 500.
 */
export function parseXpRef(value: string): XpRef | null {
  if (value.length === 0 || value.length > MAX_XP_REF) return null

  const project = PROJECT.exec(value)
  if (project) {
    return { kind: 'project', xpId: project[1]!, version: Number(project[2]) }
  }

  return BUILTIN.test(value) ? { kind: 'builtin', id: value } : null
}
