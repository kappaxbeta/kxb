import { rulesOf, type XpDocument } from '@kxb/xp'

/**
 * Who a level is being made for, asked before which template.
 *
 * The wizard was asked for as *"movie, singleplayer, see templates"*, and
 * docs/xp/backlog.md §1b takes that apart: those are not three kinds of thing.
 * A movie is §8 - a scene that plays itself, and not a document kind at all. A
 * singleplayer level is an ordinary document with a people cap of one. Only the
 * templates are documents.
 *
 * So the honest question is the one that *changes what gets built*, and there
 * are two answers to it rather than three. A third button producing the same
 * document as the second would teach somebody that the choice did not matter,
 * which is worse than not asking.
 */
export type Audience = 'one' | 'together'

/**
 * The answer carried in the URL, or nothing.
 *
 * A query key rather than a path segment, and it is the opposite call from the
 * studio's `?v=` - which was wrong because it carried a whole *document* where
 * a name belonged. This carries one of two words, the page is the same page
 * either way, and an unanswered question has to be a state the URL can be in.
 *
 * Anything else reads as unanswered rather than as an error: this is a link
 * somebody may have typed or trimmed, and the cost of being wrong is a question
 * asked twice.
 */
export function readAudience(raw: string | string[] | undefined): Audience | null {
  return raw === 'one' || raw === 'together' ? raw : null
}

/**
 * Can this document be played by one person?
 *
 * Derived from what the document *declares* rather than from a flag on the
 * template, because the two would drift and only one of them is checked: a
 * `match` capability is verified against the marks at parse time, so a document
 * claiming it really does have two sides to put people on.
 *
 * A race alone is a time trial and a room alone is a room, so `competition` and
 * `freeplay` say nothing about needing company. `match` is the one that does.
 */
export function playableAlone(document: XpDocument): boolean {
  return !document.capabilities.includes('match')
}

/**
 * The same document, declared to be for exactly one person.
 *
 * `rules.players` is the whole of singleplayer - backlog §3 - and this is the
 * one place that writes it, so "on your own" cannot come to mean two things.
 * Both halves are set: `max` is what a door reads, so it is what stops a second
 * person arriving, and `min` is what tells a start button the level is playable
 * with the one person standing there.
 *
 * A copy rather than a mutation, because a template's `build` hands out a fresh
 * document and the caller may well be about to hand it to an editor that will
 * write it back to disk.
 */
export function forOnePlayer(document: XpDocument): XpDocument {
  return { ...document, rules: { ...rulesOf(document), players: { min: 1, max: 1 } } }
}
