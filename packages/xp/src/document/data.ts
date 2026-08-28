/**
 * What a level keeps, declared by the level.
 *
 * `xp_store` has worked for weeks, the port is wired, and until this block
 * existed a level's **author** could not reach any of it: `PROGRESS_KEY` is the
 * runtime's own key and a race time goes into a stream the runtime chose. There
 * was no way for a document to say *this level keeps a number called `coins`,
 * per player, starting at zero* - so the store was a thing the platform used on
 * an author's behalf rather than a thing they could build with.
 *
 * docs/xp/backlog.md §7c is the design and the argument for each decision
 * below; this is the half the parser and the editor both read.
 *
 * ---------------------------------------------------------------------------
 * Numbers, and that is the version that composes
 * ---------------------------------------------------------------------------
 * A `Condition` compares a `prop` to a `number` and `setProp` writes one, so a
 * numeric field needs no new vocabulary anywhere - a rule reads and writes
 * saved data with the words it already has. Strings and objects would each need
 * a second comparison, a second verb and a second editor control, to serve
 * cases nobody has asked for and which a number naming a choice serves until
 * somebody does.
 *
 * That is a real limit rather than a stage: a level cannot save a name typed by
 * a player, and the day one wants to, this block grows a type field and every
 * reader of it grows a branch. Worth paying then, with a case in hand.
 *
 * ---------------------------------------------------------------------------
 * The scope is the whole of "who sees it"
 * ---------------------------------------------------------------------------
 * It is `xp_store`'s scope, unchanged, under a name the author chose - not a new
 * permission system. The three, as the editor says them:
 *
 *   - **`player`** - yours, read by you. Progress, inventory, coins.
 *   - **`space`** - one value for everybody, written by anybody in the space. A
 *     town, a shared total, a door somebody opened for good.
 *   - **`shared`** - yours to write, read by everyone. A best time, a score on
 *     a board.
 *
 * A field's scope is a decision about *disclosure* and cannot be inferred, which
 * is why it is required rather than defaulted. The store's own key refuses an
 * unscoped key for the same reason and in nearly the same words.
 */

/** The scopes `xp_store` has, which are the scopes a field may be in. */
export const DATA_SCOPES = ['player', 'space', 'shared', 'run'] as const

export type DataScope = (typeof DATA_SCOPES)[number]

/** One declared field. */
export interface XpField {
  scope: DataScope
  /**
   * What it is before anybody has played.
   *
   * Required, and the reason is `store.get` answering `undefined` for a field
   * nobody has written: a rule comparing `coins >= 10` against `undefined` is a
   * rule whose behaviour on a new player is an accident of JavaScript. Declaring
   * the starting value makes "the first time somebody opens this" a case the
   * author decided rather than one they meet in a bug report.
   */
  value: number
  /** What to call it on a screen. Absent means the field's own name. */
  label?: string
}

export type XpData = Readonly<Record<string, XpField>>

/**
 * What a field may be called.
 *
 * The store's keys are `scope:field`, so a colon is the one character that
 * cannot appear - and rather than banning one character this takes the same
 * shape an entity name and a script name already have. One alphabet across the
 * format is worth more than the extra names a looser rule would allow.
 */
export const DATA_NAME = /^[a-z][a-z0-9-]{0,31}$/

/**
 * How many fields one level may declare.
 *
 * Not a storage limit - `xp_store` already caps a row at 256 KB, and 32 numbers
 * is nothing against that. It is a limit on the *panel*: a model with two
 * hundred fields in it is one nobody can hold, and an author who has reached
 * thirty-two is describing something this block is the wrong shape for.
 */
export const MAX_DATA_FIELDS = 32

/** No block at all, which is what most levels want. */
export const NO_DATA: XpData = {}

/** Read it through this, like `rules` through `rulesOf`. */
export function dataOf(document: { data?: XpData }): XpData {
  return document.data ?? NO_DATA
}

/**
 * The store key a field is read and written under.
 *
 * The one place that knows a declared field becomes `player:coins`. A second
 * place that built the same string would be a second place that could disagree
 * about a scope, and a `player` blob promoted to `space` is somebody's progress
 * shown to the space - which is the exact failure `store.ts` refuses an unscoped
 * key to prevent.
 */
export function storeKeyOf(name: string, field: XpField): string {
  return `${field.scope}:${name}`
}

/**
 * Does this field outlive the match it was written in?
 *
 * ---------------------------------------------------------------------------
 * The scope that had to exist, and the bug that proves it
 * ---------------------------------------------------------------------------
 * Three of the four scopes persist, and until `run` there was nowhere to put a
 * number that is true for the length of a game and then is not. The board game
 * is what that costs when it is missing: `blue-home` counted pieces home into
 * the *space*, so a finished game left a four in the row **forever** - the next
 * table opened already won, with last week's roll still sitting on it.
 *
 * That is not a board game problem. Any level with a round has counters that
 * mean nothing once the round is over, and every one of them would have been
 * written somewhere permanent.
 *
 * ---------------------------------------------------------------------------
 * Not surviving is the behaviour, not an optimisation of it
 * ---------------------------------------------------------------------------
 * A `run` field is never read from the store and never written to it, so it
 * begins at its declared default every time the level opens. That is also the
 * whole answer to "does a phase survive a reload" - docs/xp/xp-flow.md's fourth
 * open question - because a thing defined not to survive cannot.
 *
 * ---------------------------------------------------------------------------
 * **It was local as well as temporary, and that was not the same wish**
 * ---------------------------------------------------------------------------
 * Worth keeping the paragraph, because the mistake is easy to make twice.
 * Scope has *two* axes - does it persist, and is it shared - and this design
 * used to make them one mechanism: the store was what other clients read, so
 * `space` meant shared *because* it was written down, and a field that is
 * never written was therefore never shared either. The board game reached for
 * `run` and lost the roll - three players each had their own `dice`, and only
 * the one who pressed saw a face - so the counters went back on `space` and
 * left every finished game sitting in the row.
 *
 * **This is now only half true, and the half that is left is the true one.**
 * A `run` field is still never *persisted*; it is no longer alone. The store
 * is not the only transport any more - see `arbitrated` below: a run field is
 * kept by whoever is arbitrating, published to everybody in the match, and
 * cleared by the rematch. Shared-and-fresh, which is what a table's counters
 * always wanted.
 *
 * It needed no run id in the end. Scores, lives and health are already
 * shared-and-fresh and already kept there, so this is one more number in the
 * same place rather than a new mechanism keyed by a new id.
 *
 * It is asked here rather than at each caller for the reason `storeKeyOf` is:
 * a reader that persists a field the writer skips is a field that is read back
 * as stale and never corrected.
 */
export function persists(field: XpField): boolean {
  return field.scope !== 'run'
}

/**
 * Is this field one *other people* can change?
 *
 * The other half of what a scope means, and the half nothing asked until an
 * end-to-end run went looking for it. `space` says "the space, together -
 * anybody here can change it" and `shared` says the same of a wider group, and
 * both promises were only half kept: a client wrote its changes and **never
 * read anybody else's** after the one read at open. Three players sat at a table
 * watching one of them roll a die only they could see.
 *
 * `player` is deliberately not here. It is yours, nobody else writes it, and
 * re-reading it on a timer would be a round trip per field for an answer that
 * cannot have changed - and worse, one that could arrive stale over a value you
 * just set.
 */
export function shares(field: XpField): boolean {
  return field.scope === 'space' || field.scope === 'shared'
}

/**
 * Is this field kept by whoever is arbitrating, for the length of one game?
 *
 * `run` and only `run`, and it is the answer to the thing the scope could not
 * do when it arrived: it did not persist, which was the point, and it did not
 * *travel* either, which was not - the store was the only transport a level's
 * data had, and a scope that skips the store skipped everybody else with it.
 * So a `run` field was a number one client kept to itself, and a table that
 * needed one had to count in `space` and leave last week's game sitting in the
 * row.
 *
 * The arbiter is where the rest of a match's shared-and-fresh state already
 * lives - scores, lives, health - so this is not a fourth transport, it is the
 * one that was already there. Everybody reads it, anybody in the match may
 * write it, and `reset` clears it, which is what makes the scope's second half
 * true at last.
 *
 * A level played alone has no arbiter, and that is not a degraded mode: a run
 * field on a single client is exactly what it always was. Nothing is lost that
 * a scope with no persistence ever promised to keep.
 */
export function arbitrated(field: XpField): boolean {
  return field.scope === 'run'
}

/** What every field starts at, for a session that has read nothing yet. */
export function defaultsOf(data: XpData): Map<string, number> {
  return new Map(Object.entries(data).map(([name, field]) => [name, field.value]))
}

/**
 * The block with one field written into it.
 *
 * Pure and here rather than in ./edit, because what a *document* looks like
 * with a field in it is a fact about this format, and `edit.ts` is about an
 * editing session - undo, selection, the dirty flag. The editor's callback is a
 * one-liner over this; a script writing a document from scratch is the same
 * one-liner without an editor around it.
 *
 * Overwrites by name, which is what an editor's "save this field" means. There
 * is deliberately no `addField` beside it: two functions differing only in
 * whether they refuse an existing name is two code paths for one gesture, and
 * the panel already knows whether it is adding or editing.
 */
export function withField(data: XpData, name: string, field: XpField): XpData {
  return { ...data, [name]: field }
}

/**
 * The block with one field gone.
 *
 * Note what this does **not** do: it does not touch the rules that named the
 * field. That is the parser's job and it is better at it - `undeclared` reports
 * every rule that reaches for a field nobody declared, with an address, the
 * next time the document is parsed. A remove that also went hunting through
 * blueprints would be a second implementation of that walk, silently editing
 * somebody's rules as a side effect of a delete.
 */
export function withoutField(data: XpData, name: string): XpData {
  const { [name]: _gone, ...rest } = data
  return rest
}

/**
 * Renaming, which is a remove and a write that must not lose the order.
 *
 * `{ ...rest, [to]: field }` would move the field to the end of the block, and
 * the panel lists fields in the order the document holds them - so renaming
 * `coins` to `gold` would silently reorder somebody's model. Rebuilt in place
 * instead.
 *
 * Answers with the block unchanged when there is nothing at `from`, or when
 * `to` is already taken: a rename that quietly overwrote another field would
 * take its scope and its default with it.
 */
export function renameField(data: XpData, from: string, to: string): XpData {
  const field = data[from]
  if (!field || from === to || Object.hasOwn(data, to)) return data

  return Object.fromEntries(
    Object.entries(data).map(([name, held]) => (name === from ? [to, field] : [name, held])),
  )
}

/**
 * Who sees this, in words rather than in our vocabulary.
 *
 * The scope names are `xp_store`'s and they are ours; an author choosing one is
 * making a decision about disclosure and should be reading a sentence about
 * people rather than a word about tables. The space's own settings card says
 * the same three things in nearly the same words, deliberately - somebody who
 * has read one should recognise the other.
 */
export function describeScope(scope: DataScope): string {
  switch (scope) {
    case 'player':
      return 'Each player, privately — only they can read it'
    case 'space':
      return 'The space, together — anybody here can change it'
    case 'run':
      return 'This player, this session — it starts over every time and is never shared'
    case 'shared':
      return 'Each player, visible to the space — a board everyone can see'
  }
}

/**
 * Field names a rule mentions that the block never declared.
 *
 * The check that makes declaring a model worth doing, and it is possible only
 * because a rule names its key **statically**: `addProp key: 'coin', target:
 * 'world'` is a typo the parser can see, where the same typo against an entity's
 * own props is a property that quietly springs into existence at zero.
 *
 * Answers with the names rather than a boolean so the message can say which one,
 * and sorted so two documents with the same mistake produce the same message.
 */
export function undeclared(mentioned: Iterable<string>, data: XpData): string[] {
  const missing = new Set<string>()
  for (const name of mentioned) {
    if (!Object.hasOwn(data, name)) missing.add(name)
  }
  return [...missing].sort()
}

/**
 * Everything wrong with a declared model, in the parser's own shape.
 *
 * Shaped like `readRules` rather than like `rulesProblems`: this both validates
 * and *returns the value*, because a half-valid data block is not a thing to
 * hand on with a default filled in. A field the parser could not read is a field
 * a rule may be about to write to.
 */
export function readData(
  raw: unknown,
  at: string,
  problems: { at: string; message: string }[],
): XpData | undefined {
  if (raw === undefined) return undefined

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push({ at, message: 'must be an object of named fields' })
    return undefined
  }

  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > MAX_DATA_FIELDS) {
    problems.push({
      at,
      message: `may declare ${MAX_DATA_FIELDS} fields at most, and this declares ${entries.length}`,
    })
    return undefined
  }

  const data: Record<string, XpField> = {}
  for (const [name, value] of entries) {
    const where = `${at}.${name}`

    if (!DATA_NAME.test(name)) {
      problems.push({
        at: where,
        message: 'a field is named in lowercase letters, digits and dashes, up to 32 characters',
      })
      continue
    }

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      problems.push({ at: where, message: 'must be an object with a scope and a starting value' })
      continue
    }

    const field = value as { scope?: unknown; value?: unknown; label?: unknown }

    if (typeof field.scope !== 'string' || !DATA_SCOPES.includes(field.scope as DataScope)) {
      problems.push({
        at: `${where}.scope`,
        message: `says who may see this, and is one of ${DATA_SCOPES.join(', ')}`,
      })
      continue
    }

    if (typeof field.value !== 'number' || !Number.isFinite(field.value)) {
      problems.push({
        at: `${where}.value`,
        message: 'is the number this starts at, before anybody has played',
      })
      continue
    }

    if (field.label !== undefined && (typeof field.label !== 'string' || field.label.length > 48)) {
      problems.push({ at: `${where}.label`, message: 'is a short name for a screen, or absent' })
      continue
    }

    data[name] = {
      scope: field.scope as DataScope,
      value: field.value,
      ...(field.label ? { label: field.label } : {}),
    }
  }

  // Absent rather than empty, the way `rules` and `backend` are: a materialised
  // `{}` is a field that appears in every file somebody opens and saves.
  return Object.keys(data).length > 0 ? data : undefined
}
