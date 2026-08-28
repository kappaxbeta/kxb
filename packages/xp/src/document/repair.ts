import { arbiterReasons } from './format'

/**
 * A saved document, brought forward to the rules the parser has today.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 * ---------------------------------------------------------------------------
 * `parseXp` gets stricter, and the documents already in the database do not
 * change when it does. docs/xp/server-authority.md §4.2 added one such rule -
 * a level that deals roles, hands one of them the working gun or calls a vote
 * must say `needs: ["arbiter"]` - and the two games in the repository were
 * corrected in the same commit. The copy somebody had *saved* was not, because
 * nothing was looking at it: it opened on Wednesday and 404'd on Thursday, with
 * no way from the screen to find out why.
 *
 * So: the parser stays strict and the *reader* moves the document forward. That
 * split is the point. A repair that lived in `parseXp` would mean a rule the
 * editor could go on breaking forever, because the thing meant to refuse it
 * would quietly fix it instead - and §4.2's whole argument is that a document
 * handed to somebody else's infrastructure has to be honest on its own.
 *
 * ---------------------------------------------------------------------------
 * What may go in here, and what may not
 * ---------------------------------------------------------------------------
 * Only a change with exactly one correct outcome, which the document already
 * implies and an author would make by hand on being told. Promoting `arbiter`
 * qualifies: a level that deals roles cannot run without one, so there is no
 * second reading of what the author meant.
 *
 * A default nobody chose does not qualify, and neither does anything that
 * changes what the level *is*. When the answer needs a person, the answer is
 * the refusal with its reasons on screen - not a guess written back over
 * somebody's work.
 *
 * Nothing here throws and nothing here validates. Junk goes through untouched
 * and comes out of `parseXp` as the problems it always was; this only ever
 * walks what it recognises.
 */

export interface XpRepair {
  /** The document to parse, repaired or exactly as it arrived. */
  document: unknown
  /**
   * What was changed, in the same voice as a parse problem. Empty when nothing
   * was - which is the normal case, and the one worth keeping cheap.
   */
  repairs: string[]
}

export function repairXp(raw: unknown): XpRepair {
  if (!isRecord(raw)) return { document: raw, repairs: [] }

  const repairs: string[] = []
  let document = raw

  const promoted = promoteArbiter(document)
  if (promoted) {
    document = promoted.document
    repairs.push(promoted.repair)
  }

  return { document, repairs }
}

/**
 * `arbiter` from `wants` to `needs`, for a level that cannot run without one.
 *
 * `wants` degrades and `needs` refuses, and the difference only shows up on a
 * host that has no arbiter - which in this app is nowhere, and on somebody
 * else's infrastructure is the entire question. Both games shipped with it in
 * `wants` because both ran fine here.
 *
 * The value is *moved* rather than copied. A capability in both lists says the
 * level would like the thing it cannot start without, which is not a statement
 * about anything, and the round trip through the editor would preserve it
 * forever.
 *
 * A document that never named an arbiter at all still gets one, and that is the
 * same repair rather than a different one: the fields that force it are already
 * in the document, so this is reading them out, not adding a requirement.
 */
function promoteArbiter(document: Record<string, unknown>): { document: Record<string, unknown>; repair: string } | null {
  const rules = isRecord(document.rules) ? document.rules : null
  const blueprints = isRecord(document.blueprints) ? document.blueprints : {}

  const reasons = arbiterReasons(
    rules,
    // Walked defensively rather than cast: this is unparsed JSON, so a
    // `triggers` that is a string is a thing that can arrive here, and it must
    // reach `parseXp` as the problem it is rather than as a crash in here.
    Object.fromEntries(
      Object.entries(blueprints).map(([id, blueprint]) => [
        id,
        { triggers: isRecord(blueprint) ? asArray(blueprint.triggers).map(asTrigger) : [] },
      ]),
    ),
  )
  if (reasons.length === 0) return null

  const backend = isRecord(document.backend) ? document.backend : {}
  const needs = asArray(backend.needs)
  if (needs.includes('arbiter')) return null

  const wants = asArray(backend.wants)
  const wasWanted = wants.includes('arbiter')

  const repaired: Record<string, unknown> = { ...backend, needs: [...needs, 'arbiter'] }
  if (wasWanted) {
    const kept = wants.filter((want) => want !== 'arbiter')
    // Deleted rather than written back as `[]` when moving the arbiter out
    // empties it. `readBackend` treats absent and empty the same, and a document
    // that grows an empty list by being opened is a diff nobody made.
    if (kept.length > 0) repaired.wants = kept
    else delete repaired.wants
  }

  return {
    document: { ...document, backend: repaired },
    repair: `this level ${reasons.join(' and ')}, so "arbiter" ${
      wasWanted ? 'was moved from backend.wants to backend.needs' : 'was added to backend.needs'
    }`,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asTrigger(value: unknown): { do?: readonly { op?: unknown }[] } {
  if (!isRecord(value)) return {}
  return { do: asArray(value.do).map((verb) => (isRecord(verb) ? { op: verb.op } : {})) }
}
