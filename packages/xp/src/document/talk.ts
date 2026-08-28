/**
 * `@kxb/xp/talk` - whether the people in this level may say anything.
 *
 * docs/xp/backlog.md §7b's off switch, and it covers **both halves in one
 * block** because they are one question. A level that turns chat off and leaves
 * ninety-one faces on has not turned anything off - somebody who wanted quiet
 * gets a room where nobody can type and everybody is pulling a face.
 *
 * ---------------------------------------------------------------------------
 * Absent means on, and that is the decision rather than the fallback
 * ---------------------------------------------------------------------------
 * Every document written before this block existed says nothing, and *silence
 * is the surprising default in a game with other people in it*. A level whose
 * author never thought about chat is a level where two people who walked in
 * together should be able to talk; the author who genuinely wants a silent
 * level is the one who has thought about it, and is the one who can say so.
 *
 * It is the opposite of the way a `need` reads in ./host, and deliberately: a
 * need is a thing the level cannot do without, so absent has to mean "asks for
 * nothing". This is a thing the level would have to take *away*, so absent has
 * to mean "took nothing away". Both defaults are "the document said nothing";
 * they differ because the sentences they complete are opposites.
 *
 * ---------------------------------------------------------------------------
 * A declaration, not a hidden button
 * ---------------------------------------------------------------------------
 * The runtime could simply not draw the panel, and that is the version worth
 * naming so it is not drifted into: a level where chat is *meant* to be off but
 * the runtime merely does not draw a panel is a level where the first person to
 * find the key is the problem. It is in the document, it survives being
 * exported, and any host reading this format gets the same answer.
 *
 * ---------------------------------------------------------------------------
 * It can only ever take away
 * ---------------------------------------------------------------------------
 * `chat: true` does not conjure a conversation. Whether there is anywhere for a
 * message to *go* is the host's answer (`XpChat` in ./host) and the product's -
 * a space with chat switched off is a space with chat switched off, and a
 * document is not a way round that. So the two compose one way only: on here
 * and on there is on, and off in either place is off.
 *
 * That asymmetry is why this is not a `need`. A level that declared `needs:
 * ['chat']` would refuse to open on a host with none, which is right for a
 * level whose whole point is talking and wrong for the ninety-nine that merely
 * allow it. Both exist, and they are different sentences: `backend.needs` says
 * *I cannot run without this*, and this block says *I do not want this*.
 */

export interface XpTalk {
  /**
   * Whether anybody may type in this level. Absent is yes.
   *
   * Yes still means "wherever the host has somewhere to put it" - see the note
   * above. A level standing in a space whose chat is off has no panel whatever
   * this says.
   */
  chat?: boolean
  /**
   * Whether the faces are offered. Absent is yes.
   *
   * The emote picker only ever mounts in a room anyway - an emote with nobody
   * to see it is a face over your own head - so this is the *second* condition
   * on it rather than the only one.
   */
  emotes?: boolean
}

/** Both answers filled in, which is what a reader actually wants. */
export interface Talking {
  chat: boolean
  emotes: boolean
}

/**
 * What a document that says nothing means.
 *
 * Written out rather than expressed as `Required<XpTalk>` with two `?? true`s
 * at the call site, for the reason `DEFAULT_CAMERA` is a constant: the default
 * is a decision, and a decision spread across every reader is one that is
 * eventually made differently in one of them.
 */
export const DEFAULT_TALK: Talking = { chat: true, emotes: true }

/**
 * The block, with both answers filled in.
 *
 * The same shape as `rulesOf` and `cameraOf` and there for the same reason: the
 * field is absent in every document written before it existed, and a reader
 * that tested it directly would be a reader with a `?? true` in it, which is
 * the default living in two places.
 */
export function talkOf(document: { talk?: XpTalk }): Talking {
  return {
    chat: document.talk?.chat ?? DEFAULT_TALK.chat,
    emotes: document.talk?.emotes ?? DEFAULT_TALK.emotes,
  }
}

/**
 * Is this the block a document without one would have had?
 *
 * Asked before writing, so a document that has never turned anything off does
 * not grow the block by being opened and saved - the rule `rules`, `camera`,
 * `data` and `backend` all follow, because the editor stringifies the parsed
 * document straight back out.
 *
 * The cost, said plainly: an author who writes `{"chat": true}` by hand to mean
 * *I have thought about this and I want it on* gets it deleted on the next save.
 * That is the same trade `isDefaultCamera` makes for `{"kind": "follow"}`, and
 * the alternative is a block in every file that means nothing, which is worse
 * for exactly the reason this format keeps optional blocks optional.
 */
export function isDefaultTalk(talk: XpTalk): boolean {
  const filled = talkOf({ talk })
  return filled.chat === DEFAULT_TALK.chat && filled.emotes === DEFAULT_TALK.emotes
}
