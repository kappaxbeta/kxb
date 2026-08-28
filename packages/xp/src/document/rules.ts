/**
 * The mode, and its knobs.
 *
 * `./capabilities` answers "who may schedule this XP" - can a lobby set a match
 * here, can a tournament rank two runs of it. This answers the next question
 * down: given that somebody has, **what ends it, and how is it scored**. The two
 * are deliberately different files because they are read by different things at
 * different times - a lobby filters on capabilities before anybody joins, and a
 * mode system reads these while people are playing.
 *
 * ---------------------------------------------------------------------------
 * Why this block exists at all
 * ---------------------------------------------------------------------------
 * It is the single missing thing under most of §C of task.md. `xp-match-room.tsx`
 * says so in its own header comment: it has no clock, no full-time whistle and
 * no result, because every one of those reads a result out of the scene and an
 * XP did not report one. A document could describe a level that scores and there
 * was nowhere to write down what the score was *for*.
 *
 * ---------------------------------------------------------------------------
 * Three fields, and the ones that are missing on purpose
 * ---------------------------------------------------------------------------
 * §3 of docs/xp/creator.md sketches a fuller block - `assign`, `respawn`,
 * `friendlyFire`, `teams`. None of them are here, and the argument is the one
 * ./capabilities already makes at length: a field nobody checks is a promise
 * nobody verifies. `friendlyFire: false` in a document that nothing reads is
 * worse than no field at all, because an author sets it, believes it, and finds
 * out otherwise by shooting a team-mate. Each knob arrives with the system that
 * reads it.
 *
 * The exception the plan argues for - the pack `integrity` hash, in the format
 * from M1 with nothing reading it - is a leaf that a later migration would have
 * to touch every document to add. A rules knob is not: adding one is adding an
 * optional field, and every document written before it keeps parsing.
 */

import type { XpCapabilities } from './capabilities'
// Type-only, so there is no runtime cycle back to the module that imports this
// one for its validators. The same shape `./capabilities` already uses.
import type { Mark } from './format'

/**
 * The five modes of §8, as a closed vocabulary.
 *
 * A union rather than a string, for the reason `MarkKind` is one: a preset the
 * runtime has never heard of is a document that loads, looks finished, and has
 * no rules at all - which is indistinguishable from a level whose author has not
 * finished it.
 */
export const PRESETS = ['freestyle', 'deathmatch', 'football', 'parkour', 'shooter'] as const

export type Preset = (typeof PRESETS)[number]

const PRESET_SET: ReadonlySet<string> = new Set(PRESETS)

export function isPreset(value: string): value is Preset {
  return PRESET_SET.has(value)
}

/**
 * What this level *is*, which is a different question from what you do in it.
 *
 * ---------------------------------------------------------------------------
 * Two axes, because they were one and it did not fit
 * ---------------------------------------------------------------------------
 * `preset` answers **what you do** - shoot, score, run a course - and it has
 * been quietly answering a second question as well: whether the thing is a
 * *round* at all. `freestyle` is on that list as "no score and no end", which
 * is not a game you play so much as a statement that no game is being played,
 * and it is why the list reads oddly: four styles and an absence.
 *
 * They separate cleanly, and the separation is the same one `Sides` already
 * made for a different pair. A deathmatch can be a round that starts and ends,
 * or a thing running in the corner of a lobby all evening, and neither is a
 * different *style* of game. Folding them together would mean a `lobby-shooter`
 * beside `shooter`, which is a product of two lists rather than a list.
 *
 * - **`space`** is a place that is simply *there*. No round, nothing to win,
 *   and what happens in it persists. `steal-a-plant` is one: your plants are on
 *   the shelf tomorrow. This is the **default**, because it is what every
 *   document on disk already is - a level that never said anything about rounds
 *   is not one, and defaulting to anything else would retroactively put a
 *   whistle in levels that never asked for one.
 * - **`lobby`** is where people gather before or between rounds. It is a space
 *   that can still keep score - the whole point of it being its own value
 *   rather than a flag is that a lobby carries the rest of the block: a
 *   `scoreLimit`, sides, a flow, all of it. A kickabout in the foyer is a
 *   lobby.
 * - **`battle`** is a run: it starts, it has an end, and what it counted should
 *   be gone afterwards. See xp-flow.md §5, which makes the same distinction for
 *   the data block and is where the `run` scope came from.
 *
 * Read through `modeOf` rather than off the field, for `sidesOf`'s reason:
 * absent is a shape, not a missing value.
 */
export const MODES = ['space', 'lobby', 'battle'] as const

export type Mode = (typeof MODES)[number]

const MODE_SET: ReadonlySet<string> = new Set(MODES)

export function isMode(value: string): value is Mode {
  return MODE_SET.has(value)
}

/**
 * What absent means, named so the editor and the parser cannot disagree.
 *
 * The same shape `DEFAULT_ASSIGN` has, and for the same reason: `setRules`
 * clears the field when it is asked for this value, so a document that says
 * nothing stays a document that says nothing.
 */
export const DEFAULT_MODE: Mode = 'space'

/** What a level is, whether or not it says so. Absent is a space. */
export function modeOf(rules: XpRules): Mode {
  return rules.mode ?? DEFAULT_MODE
}

/**
 * How the room is divided, as the three shapes a fight can have.
 *
 * The other half of a mode, and the half `./capabilities` and `PRESETS` between
 * them could not say. A preset answers *what you do* - shoot, score, run a
 * course - and this answers *who is against whom*, which is a separate question
 * with the same three answers whatever the preset is: a deathmatch can be every
 * player for themselves or two sides of four, and neither is a different game.
 * Folding them into one vocabulary would mean a `team-deathmatch` preset beside
 * `deathmatch`, and then a `team-shooter` beside `shooter`, which is a product
 * of the two lists rather than a list.
 *
 * The words are the host's, deliberately. `BattleMode` in the battle domain has
 * meant `ffa | team | one_vs_all` since long before this field existed, the
 * lobby prints "all against all" and "one against everyone" for them, and an XP
 * that named the same three things differently would be two vocabularies for
 * one idea with a translation table between them - which is a table that gets
 * out of step. `-` rather than `_` is the only difference, because this format
 * is hand-written JSON and every other multi-word value in it is hyphenated.
 *
 * - **`ffa`** - nobody has a side. Team spawn marks in the world are not read.
 * - **`team`** - the sides the spawn marks name, handed out by `assign`.
 * - **`one-vs-all`** - one player against everybody else, and the one is named
 *   by a host. Nothing here can pick them: choosing exactly one out of a room
 *   needs the roster, and the roster is not there on the frame a side decides
 *   which spawn somebody arrives at. That is the same refusal `ASSIGNS` makes
 *   about `balanced`, arriving at the same answer - a mechanism that can hold a
 *   roster does it, and until one does, an unhosted one-vs-all level is a level
 *   where nobody has a side, exactly as `assign: 'host'` already is.
 */
export const SIDES = ['ffa', 'team', 'one-vs-all'] as const

export type Sides = (typeof SIDES)[number]

const SIDES_SET: ReadonlySet<string> = new Set(SIDES)

export function isSides(value: string): value is Sides {
  return SIDES_SET.has(value)
}

/** One line for a picker, in the words the battle lobby already uses. */
export function describeSides(sides: Sides): string {
  switch (sides) {
    case 'ffa':
      return 'All against all - everybody for themselves, and no team spawns are read'
    case 'team':
      return 'Teams - the sides the spawn marks name, split by the setting below'
    case 'one-vs-all':
      return 'One against everyone - a match names the one; on your own, nobody has a side'
  }
}

/**
 * How the rest of the room may draw somebody, while their role is dealt.
 *
 * The "how do others view them" half of docs/xp/xp-flow.md §3, and a closed
 * vocabulary for the reason `SIDES` is one: a document naming a fourth way of
 * being looked at is a document that loads and is drawn the ordinary way, which
 * is the exact opposite of what its author wrote.
 *
 * Three values, and two of them already exist in the runtime:
 *
 *   `normal`  body, name, team ring - what everybody is today.
 *   `team`    drawn to your own side and to nobody else. The one new case, and
 *             it is decidable by the client doing the drawing because a side is
 *             *derived* from the marks (`sideOf`) rather than sent - so nothing
 *             about it has to cross the wire or come back from the arbiter.
 *   `nobody`  not drawn at all. Whoever it is walks around the level and no
 *             other screen has a body for them.
 *
 * **Absent is `normal`, everywhere.** A deck that says nothing about how it is
 * seen is every hidden-role level built before this, and those levels are
 * played by people who can see each other.
 */
export const ROLE_VIEWS = ['normal', 'team', 'nobody'] as const

export type RoleView = (typeof ROLE_VIEWS)[number]

const ROLE_VIEW_SET: ReadonlySet<string> = new Set(ROLE_VIEWS)

export function isRoleView(value: string): value is RoleView {
  return ROLE_VIEW_SET.has(value)
}

/**
 * What being dealt one particular value means.
 *
 * `rules.roles` is a deck and `rules.lethal` is one hard-coded question about
 * it - "do this role's shots count". This is the generalisation docs/xp/xp-flow.md
 * §3 asks for, and it deliberately generalises to *two* questions rather than to
 * a mechanism: what you may do, and how you are seen. Both are things the
 * runtime already decides for everybody; a role only moves the answer.
 */
export interface RoleRule {
  /**
   * Which of `player.keys` are live while this role is dealt, by `does` name.
   *
   * **It intersects, never widens** - see `allowedFor` in ./flow, where the same
   * rule is already written for a phase's `allow`. A phase saying *nobody acts*
   * must not be overridable by a role, or `allow` stops being readable at all:
   * you would have to hold two tables in your head to know whether a button
   * does anything.
   *
   * Absent means "whatever the phase left live", which is what every player
   * without a role gets. Empty means none, and is how a role says *watch*.
   */
  allow?: readonly string[]
  /** How the rest of the room may draw somebody holding this. Absent is `normal`. */
  seen?: RoleView
}

/**
 * What a document that never said means, read off the world rather than fixed.
 *
 * **Derived, because a constant here would change what existing levels are.**
 * Sides have been read off the spawn marks since `teamsOf` was written - two
 * marks with team names *is* how a document says it has sides - so a default of
 * `ffa` would silently turn every team level built so far into a free-for-all,
 * and a default of `team` would put a `hostage` label on the hundred levels
 * that have one spawn and no sides at all. Deriving is the only answer that
 * leaves every document already on disk behaving exactly as it did.
 *
 * That is also why `one-vs-all` is never derived: there is nothing in a world
 * that means it. A level that wants it says so, which is the whole reason this
 * field exists rather than being another thing read off the marks.
 */
export function sidesOf(rules: XpRules, marks: readonly Mark[]): Sides {
  return rules.sides ?? (teamsOf(marks).length >= 2 ? 'team' : 'ffa')
}

/**
 * How somebody ends up on a side, when a host has not already said.
 *
 * **Two values, and the two missing ones are the point.** §9 of the plan
 * sketches `fixed | balanced | first-come | pick`, and I am not landing four:
 *
 * - **`pick` is not the document's business.** It means a lobby screen, and a
 *   lobby is a host. The battle lobby already picks sides before anybody loads
 *   the document, and when it has, none of this is consulted. An XP declaring a
 *   screen it does not own is the same mistake as a capability nobody verifies.
 * - **`balanced` and `first-come` both need a roster**, and there is no roster
 *   to have: presence arrives some milliseconds after the world is built, and a
 *   side decides which spawn mark somebody arrives at on the first frame. They
 *   arrive with the mechanism that can hold a roster, not before it - the same
 *   rule that kept `friendlyFire` out of this block.
 *
 * What is left is the real choice a document has today: split the room by
 * yourself, or wait to be told.
 *
 * ---------------------------------------------------------------------------
 * And then a board game asked for the third thing
 * ---------------------------------------------------------------------------
 * **`claim` is the one where the player decides.** Every other value answers
 * *which side is this person on* without asking them: a hash, a join order, or a
 * host. At a table that is the wrong question - you sit in the chair you picked,
 * and one person to a chair - and the failure when it is guessed is not subtle:
 * two people dealt blue by a hash both watch four blue pieces and neither game
 * makes sense.
 *
 * It is the one value that could not have been on the original list, and for the
 * reason `balanced` and `first-come` are still not: it needs somewhere
 * authoritative to hold the answer, because *one person to a chair* is a race
 * between two clients pressing in the same moment. The arbiter is that now, so
 * this is a mechanism arriving with the thing that can hold it rather than a
 * setting that quietly does not work.
 *
 * **A host may not overrule it, and that is the whole point of the value.** Every
 * other mode is a default a match can decide instead - the battle lobby picks
 * sides before anybody loads the document, and none of the derivation runs. A
 * document saying `claim` is saying *this is not a thing to be decided for
 * people*, so `sideOf` ignores `given` here. A level whose seats mean something
 * to the person in them - a colour they will play for an hour - cannot have that
 * handed to them by a lobby.
 */
export const ASSIGNS = ['spread', 'order', 'host', 'claim'] as const

export type Assign = (typeof ASSIGNS)[number]

const ASSIGN_SET: ReadonlySet<string> = new Set(ASSIGNS)

export function isAssign(value: string): value is Assign {
  return ASSIGN_SET.has(value)
}

/** One line for a picker. */
export function describeAssign(assign: Assign): string {
  switch (assign) {
    case 'spread':
      return 'Split the room across the sides, so a public room works with nobody organising it'
    case 'order':
      return 'Seat people in the order the room agrees on: the first side to the first player'
    case 'host':
      return 'Only a match may put somebody on a side; on their own, a player has none'
    case 'claim':
      return 'Everybody picks their own side, one person to each, and nobody may be moved'
  }
}

/**
 * Splitting the room is the default, because the alternative fails silently.
 *
 * A level with two team spawns and `host` in it, opened by two people who found
 * it themselves, puts both of them on no side at all - which looks exactly like
 * teams being broken. `spread` is wrong only for a document that is *only* ever
 * played as a scheduled match, and that document can say so.
 */
export const DEFAULT_ASSIGN: Assign = 'spread'

/**
 * The ways onto a side that promise **one person to each**.
 *
 * Named rather than tested inline, because two places have to agree about it and
 * one of them is a spawn: `arrivalSpot` scatters several arrivals round one mark
 * so they do not stand inside each other, and that grid is exactly wrong for a
 * chair - a board game puts your seat within arm's length of your own pieces,
 * and a cell of scatter is the difference between reaching them and not.
 *
 * `spread` is the one that is missing, and deliberately: under it a side is a
 * *team*, several people deep, and the grid is what keeps them apart. `host` is
 * missing too, because a host that hands the same side to four people is doing
 * something this cannot see and should not second-guess.
 */
export const SEATS_ONE: ReadonlySet<Assign> = new Set<Assign>(['order', 'claim'])

export interface XpRules {
  preset: Preset
  /**
   * What this level is - a space, a lobby, or a battle. Absent is `space`.
   *
   * The other axis from `preset`, and the argument for splitting them is at
   * `MODES`. Absent rather than defaulted into the block, because every
   * document on disk predates the field and none of them is a round.
   */
  mode?: Mode
  /**
   * How the room is divided. Absent is read off the spawn marks.
   *
   * Read it through `sidesOf` rather than testing it: absent is a *shape*, not a
   * missing field, and the shape it means depends on the world - see there.
   */
  sides?: Sides
  /**
   * How a player ends up on a side. Absent is `spread`.
   *
   * Only ever consulted for a document that has sides at all - see `teamsOf` -
   * and never for `one-vs-all`, where the one is named by a host and there is
   * nothing left for this to decide.
   */
  assign?: Assign
  /**
   * First to this many points ends it. Absent means the score is a tally rather
   * than a race to a number, which is what a level with a coin in it wants.
   */
  scoreLimit?: number
  /**
   * Seconds, after which it ends whatever the score. Absent means nothing ends
   * it on a clock - a course is over when somebody finishes it, and putting five
   * minutes on that would be ending runs people were in the middle of.
   */
  timeLimit?: number
  /**
   * How long a player waits before coming back. Absent is none at all.
   *
   * The default is instant because that is what every level has today, and
   * `simulation.tsx` argues for it in the mode it was written for: on a course,
   * being back at the start *is* the cost, and a second of staring at a grey
   * overlay is a second added to every mistake somebody already knows they made.
   *
   * That argument is right for `parkour` and wrong for a deathmatch, where an
   * instant respawn means dying costs nothing and a fight never resolves. So the
   * document says which it is, rather than the engine guessing from the preset -
   * a `freestyle` room with hazards in it may well want a pause, and a `shooter`
   * built for practice may not.
   */
  respawn?: number
  /**
   * How many people this level is for.
   *
   * docs/xp/backlog.md §3 asked for this and said what it is: a fact about the
   * *level*, not a setting on the room it is played in. A board game for four
   * is for four wherever it is opened, and a host who could raise that number
   * would be handing the fifth player a seat that does not exist.
   *
   * **`min` is the useful half.** A game needing four that starts with two is
   * broken in a way the runtime can detect and say something about, and that is
   * the whole reason a lower bound is worth carrying: without it, "start" is a
   * button that produces an unplayable board and no explanation.
   *
   * **`max` is what a door reads.** An XP room takes its capacity from it (see
   * `createXpRoom`), so the fifth person is turned away at the door with a
   * sentence rather than admitted into a game with no seat for them.
   *
   * Both optional, and absent means what it has always meant: as many as the
   * transport will carry, which is the cap in §16.6 rather than a number this
   * level chose. Every document written before this parses unchanged.
   */
  players?: { min?: number; max?: number }
  /**
   * What each player is secretly told at the start of a round.
   *
   * One value per player, dealt by the arbiter and readable only by the player
   * it went to (`docs/xp/server-authority.md` §4.1). The engine never sees any
   * of them: to this package it is a list of opaque strings, which is the whole
   * reason it is safe to put in a document at all - a role the *client* could
   * interpret would be a role the client could infer.
   *
   * **The list is what is dealt, not a description of it.** `["impostor",
   * "crew", "crew", "crew"]` is one impostor in four; three impostors is three
   * entries. Counts rather than proportions, because a document that said "25%
   * impostors" would deal differently to four players than to five and an
   * author would have to work out which.
   *
   * There must be at least as many values as there are players when the deal
   * happens - the arbiter refuses a short deck rather than leaving somebody with
   * nothing - which is why this is bounded by `players.max` at parse time
   * instead of at the moment a round starts, in front of everybody.
   *
   * Absent is every level built so far: nothing hidden, nothing dealt, and no
   * call made.
   *
   * **Dealt from the top.** The arbiter takes as many values as there are
   * players, *in the order they are written*, and only then shuffles who gets
   * which. So a ten-entry deck played by three deals the first three entries -
   * which is why the roles that must be in play go first. Shuffling the whole
   * deck and taking three would make one impostor in ten into a coin toss
   * nobody asked for: three draws from that deck find the impostor less than a
   * third of the time, and the round that results is a hunt with nothing in it.
   */
  roles?: string[]
  /**
   * The one dealt value whose shots take health off anybody.
   *
   * Names a value from `roles`. **A hit counts only if the shooter was dealt
   * it**; everybody else's shots leave the muzzle, draw their tracer, land on
   * the body they were aimed at and change nothing. One player is armed and the
   * room cannot tell which, because a gun that does nothing looks exactly like
   * a gun that does.
   *
   * That is the whole asymmetry of a hidden-role game in one field, and the
   * side it leaves defenceless is the point rather than an oversight: the crew
   * do not shoot back, they **vote**. A majority of those still standing
   * eliminates whoever it names, and it is not asked to be right - name the bug
   * and the round is over, name a colleague and the colleague is gone and the
   * bug is still aboard. `meet` is how a level opens one.
   *
   * It is a *rule* rather than an arrangement of blueprints because no client
   * can keep it. This one knows its own secret and nothing about anybody
   * else's, so it cannot be trusted to decide whether its own shot counted -
   * that is the arbiter's, and it is the only party that has ever seen the
   * whole deal.
   *
   * Absent is every level with roles in it before this: a deal that decides
   * nothing about damage, which is right for a game whose roles are only read
   * by a rule in the document.
   */
  lethal?: string
  /**
   * What each dealt value *means*, keyed by the value.
   *
   * A second block rather than a richer `roles`, and the deck is why: `roles` is
   * a list because **the list is what is dealt** - three of four players being
   * `crew` is three entries, in the order they are dealt from. A map cannot say
   * that, so the counts stay in the deck and the meanings sit beside it. A value
   * with nothing to say about it simply has no entry.
   *
   * Every key has to be in the deck (`rulesProblems`), because a rule for a role
   * nobody is dealt is the same silence `lethal` is checked against: it looks
   * set, and it never once applies.
   *
   * Absent is every level with roles in it before this, which is the honest
   * default - a deal that decides who may act and who can be seen is a much
   * bigger thing than a deal that decides nothing, and no existing document
   * asked for it.
   */
  perRole?: Readonly<Record<string, RoleRule>>
}

/**
 * The widest a document may say it is for.
 *
 * Not a taste: it is the transport's ceiling (docs/xp/backlog.md §3, §16.6),
 * and a level declaring room for forty would be a level whose door admits
 * fifteen people into a channel that drops the rest. Stated here so the parser
 * refuses the claim rather than the room discovering it.
 */
export const MAX_DECLARED_PLAYERS = 25

/**
 * What a document says it is for, with the absent halves filled in.
 *
 * One place to ask, so a door and a start button cannot disagree about whether
 * a level is for four. `max` falls back to the transport's ceiling and `min` to
 * one - a level that did not say is a level for anybody, which is what every
 * `.xp.json` written before this field meant.
 */
export function playersOf(rules: XpRules): { min: number; max: number } {
  const min = rules.players?.min ?? 1
  const max = rules.players?.max ?? MAX_DECLARED_PLAYERS
  // Clamped rather than trusted even here: `parseXp` refuses a crossed pair, so
  // this can only be reached by a caller that built rules by hand - and a `min`
  // above `max` would make every room permanently un-startable.
  return { min: Math.min(min, max), max }
}

/**
 * What a document with no rules block is.
 *
 * Freestyle, because that is what every `.xp.json` written before this existed
 * *was*: a world with no score and no end. Defaulting to anything else would
 * retroactively put a whistle in levels that never asked for one.
 */
export const DEFAULT_RULES: XpRules = { preset: 'freestyle' }

/**
 * Is this block the one a document without a block would have got?
 *
 * Asked at *write* time, and it is the difference between a format change and a
 * format change everybody notices. `parseXp` fills the default in, and the
 * editor writes the parsed document straight back out - so without this, opening
 * any level and saving it would grow a `rules` block nobody typed, and every
 * future diff would carry one.
 *
 * The same trade `scripts` already makes on the document and `parts` makes on a
 * blueprint: omitted when empty, so a thing that has never had one round-trips
 * unchanged. An author who explicitly types `{ preset: 'freestyle' }` loses the
 * field on save, exactly as an author who types `"scripts": {}` does, and for
 * the same reason - it says nothing that its absence does not.
 */
export function isDefaultRules(rules: XpRules): boolean {
  return (
    rules.preset === DEFAULT_RULES.preset &&
    rules.scoreLimit === undefined &&
    rules.timeLimit === undefined &&
    /**
     * Every optional field, and this one has to be listed or it is deleted.
     *
     * A `{ preset: 'freestyle', assign: 'host' }` block says something its
     * absence does not, so forgetting it here would silently drop an author's
     * setting on the next save - the failure mode of this function is not a
     * wrong answer, it is a lost field, which nobody notices until the level
     * behaves differently a week later.
     *
     * Anything added to `XpRules` belongs in this list. There is a test that
     * fails when one is missed.
     */
    rules.assign === undefined &&
    // Absent is `space`, so an explicit `battle` is a thing the author said and
    // this line is what stops the next save unsaying it.
    rules.mode === undefined &&
    // Absent is derived rather than fixed, which makes this line matter more
    // than the others: dropping an explicit `ffa` from a level that has team
    // spawns does not lose a setting, it turns the level back into a team game.
    rules.sides === undefined &&
    rules.respawn === undefined &&
    // The field this function's own warning was written about, and it caught
    // this one: a freestyle level for four says something its absence does not,
    // and without this line the four was dropped on the next save.
    rules.players === undefined &&
    // The least droppable field of the lot: losing the deck turns a level with
    // secrets back into an ordinary one, and the only sign is that nobody is
    // told anything at the start of the round.
    rules.roles === undefined &&
    // And losing this one turns a hidden-role game back into a deathmatch that
    // happens to have roles in it - every gun live against everybody, which is
    // the game the field exists to stop being.
    rules.lethal === undefined &&
    // Dropping this one is the quietest of the lot: the deal still happens, so
    // the level looks like it is working, and the role that was meant to be
    // invisible walks around in plain sight.
    rules.perRole === undefined
  )
}

/**
 * The rules a document is playing, whether or not it says so.
 *
 * The read side of the omission above, and the reason the omission costs
 * nothing: absent is a *mode*, not a missing field, so no reader needs a branch.
 * Everything in the runtime goes through here rather than touching `xp.rules`.
 *
 * Structurally typed rather than taking an `XpDocument`, because `./format`
 * imports this file and the arrow cannot point both ways. One field is all it
 * needs, which is a hint that the dependency is the right way round.
 */
export function rulesOf(document: { rules?: XpRules }): XpRules {
  return document.rules ?? DEFAULT_RULES
}

/** The lines a picker shows, in the language this package speaks. */
export const PRESETS_EN: Record<Preset, string> = {
  freestyle: 'No score and no end - a world to be in',
  deathmatch: 'No teams; kills score, and the highest wins',
  football: 'Two sides, one ball, and a goal at each end',
  parkour: 'A start, a finish, and the clock between them',
  shooter: 'Weapons and targets, scored by what you hit',
}

/** A line for a picker, so an author choosing a mode can see what it does. */
export function describePreset(
  preset: Preset,
  /** In the reader's language when a caller has one. See `describeNeed`. */
  words: Record<Preset, string> = PRESETS_EN,
): string {
  return words[preset]
}

/**
 * The capability a preset cannot work without.
 *
 * The join between the two files, and it is what stops a preset being a tag.
 * A capability already names what the *world* must contain -
 * `capabilityProblems` refuses a `football` claim with no goals and a
 * `competition` claim with no finish - so pointing a preset at one inherits that
 * check rather than restating it. Saying "a football preset needs two goals"
 * here would be the same rule in two places, and the day they disagree the
 * document is refused by one and accepted by the other.
 *
 * Three presets need nothing. `freestyle` has no end condition to be missing;
 * `deathmatch` and `shooter` are scored by what players do to each other rather
 * than by anything placed in the world, which is exactly why they are the two
 * modes that will run in a bare room.
 */
export function presetNeeds(preset: Preset): XpCapabilities[number] | null {
  switch (preset) {
    case 'football':
      return 'football'
    case 'parkour':
      return 'competition'
    case 'freestyle':
    case 'deathmatch':
    case 'shooter':
      return null
  }
}

/**
 * The sides a document has, in the order it names them.
 *
 * Read off the spawn marks rather than declared in a `teams` block, because
 * that is where a level already says it has sides: `capabilityProblems` refuses
 * a `match` with fewer than two spawns, and a document that placed a red spawn
 * and a blue spawn has said everything a team system needs. A second list would
 * be a second place to say it, and the day the two disagree the level has a side
 * nobody can spawn on.
 *
 * Lives here rather than in the runtime that first needed it because the editor
 * needs the same answer - to grey out the assignment picker on a document with
 * no sides, and to colour the team field on a mark. An editor reaching into
 * `_runtime` for a rule would be the wrong direction, and two copies of "what
 * counts as a side" is how they come to disagree.
 */
export function teamsOf(marks: readonly Mark[]): string[] {
  const seen: string[] = []
  for (const mark of marks) {
    if (mark.kind !== 'spawn') continue
    if (mark.team !== undefined && !seen.includes(mark.team)) seen.push(mark.team)
  }
  return seen
}

/**
 * What colour a side is.
 *
 * The first two are the lounge's own pair, which have meant red and blue since
 * football existed here and which `marks.tsx` already draws a red and a blue
 * goal in. Somebody who has seen one should not have to learn the other.
 *
 * **One table, in the package, because two tables is how red stops matching
 * red.** The ring under a player and the team field on a mark form are in
 * different lanes and different halves of the app, and they have to agree - a
 * player whose ring is one pink and whose spawn marker is another has been told
 * two things.
 *
 * ---------------------------------------------------------------------------
 * Four, because something asked
 * ---------------------------------------------------------------------------
 * This was two, with a note saying a third was worth half an hour whenever a
 * document wanted one and that a `teams` block naming colours was the wrong
 * thing to add before then. The board game is the document: four seats round
 * one table, and a side is what makes a seat somebody's.
 *
 * **Nothing else had to change**, which is the part worth recording. `teamsOf`
 * has always collected whatever the spawn marks say, `sideOf` has always
 * hashed across however many that is, and `arrivalSpot` has always sent you to
 * your own. Two was never in the mechanism - it was in this table, and only
 * here.
 *
 * The two new ones are the same family as the first two: light enough to read
 * as a ring on a dark floor, far enough apart to tell at a glance across a
 * board, and deliberately *not* the lime and amber `marks.tsx` uses for a start
 * and a finish - a side and a finish line meaning the same colour is how you
 * run at the wrong one.
 *
 * A table rather than a field on the document, still. The argument that held
 * for the third holds for the fifth: a `teams` block is worth adding when a
 * document wants a colour we have not got, not when it wants one more of ours.
 */
export function teamColour(team: string | undefined): string {
  switch (team) {
    case 'red':
      return '#f0abfc'
    case 'blue':
      return '#67e8f9'
    case 'green':
      return '#86efac'
    case 'yellow':
      return '#fcd34d'
    default:
      // A side the table has never heard of still gets a colour, because a ring
      // that vanishes is indistinguishable from a player with no side at all.
      return '#ffffff'
  }
}

/**
 * The sides this build can colour, for anywhere that offers a choice.
 *
 * The editor's team field is a text box - `Mark.team` is a free string and
 * stays one, because a level with sides called `home` and `away` is a level,
 * not a mistake - so this is a suggestion list rather than a vocabulary. Same
 * shape and same reason as `SUGGESTED_TAGS`: the words we ship, offered, and
 * nothing refused for being absent from it.
 */
export const TEAM_COLOURS = ['red', 'blue', 'green', 'yellow'] as const

/**
 * Why these rules do not hold, or an empty list if they do.
 *
 * Every reason rather than the first, like `capabilityProblems` and for the same
 * reason: an author who has set a score limit of zero on a football match with
 * no goals should be told about both.
 *
 * **The marks are a parameter rather than an optional extra**, and that is the
 * one thing about this signature worth defending: `sides` is a claim about the
 * world, exactly as a capability is, and a claim checked only when somebody
 * remembered to pass the world in is `./capabilities`' "a field nobody verifies"
 * with an extra step. Every caller has the marks - the parser is holding the
 * parsed world when it asks, and the editor is holding the document.
 *
 * Marks rather than the whole world, unlike `capabilityProblems`, because
 * `teamsOf` is the only thing this asks and a narrower parameter is a narrower
 * thing to get wrong.
 */
export function rulesProblems(
  rules: XpRules,
  capabilities: XpCapabilities,
  marks: readonly Mark[],
): string[] {
  const problems: string[] = []

  const needs = presetNeeds(rules.preset)
  if (needs !== null && !capabilities.includes(needs)) {
    problems.push(
      `the "${rules.preset}" preset needs the "${needs}" capability, which this does not declare`,
    )
  }

  /**
   * A side nobody can spawn on, refused where the author can still fix it.
   *
   * Both sided shapes need two spawn marks with team names, and the failure
   * without this check is the quiet one this whole file is written against: the
   * document says "teams", `sideOf` finds no sides to hand out, everybody
   * arrives on the level's own spawn, and the level looks like teams are broken
   * rather than undeclared. `ffa` needs nothing - a level with team marks that
   * says `ffa` is an author choosing not to use them, which is the point of
   * being able to say it.
   *
   * Only ever reported for a document that said so out loud, because `sidesOf`
   * derives `team` from exactly the marks this is checking for - a derived
   * value cannot fail its own test.
   */
  if (rules.sides === 'team' || rules.sides === 'one-vs-all') {
    const teams = teamsOf(marks)
    if (teams.length < 2) {
      problems.push(
        `"${rules.sides}" needs a spawn for each side; this has ${
          teams.length === 0 ? 'none with a team on it' : 'one'
        }`,
      )
    }
  }

  /**
   * Splitting a room that has one champion in it is not a thing that can be
   * done, so saying to do it is refused rather than ignored.
   *
   * Only the *written* `spread` - absent means nobody asked, and refusing a
   * document for a field it never contains would make `one-vs-all` unwritable.
   */
  if (rules.sides === 'one-vs-all' && rules.assign === 'spread') {
    problems.push(
      'one against everyone is handed out by a match; nothing here can pick which player is the one',
    )
  }

  /**
   * A limit of zero is a match that is over before it starts.
   *
   * Refused rather than treated as "no limit", because the two are different
   * intentions and an author who typed a zero meant one of them. Absent is how
   * you say there is no limit; zero is how you say the game ends immediately,
   * and nobody means that.
   */
  if (rules.scoreLimit !== undefined && rules.scoreLimit <= 0) {
    problems.push('a score limit of zero or less is a match nobody can play')
  }
  if (rules.timeLimit !== undefined && rules.timeLimit <= 0) {
    problems.push('a time limit of zero or less is a match that is over on the first frame')
  }
  /**
   * Zero is allowed here, unlike the limits above, and that is not an
   * inconsistency: zero respawn is a real setting - it is the behaviour every
   * level has today - whereas a zero *limit* is a match nobody can play. What is
   * refused is negative, and anything long enough to read as the game having
   * frozen rather than as a penalty.
   */
  if (rules.respawn !== undefined && (rules.respawn < 0 || rules.respawn > 30)) {
    problems.push('a respawn delay must be between 0 and 30 seconds')
  }

  /**
   * A deck that cannot cover the room, refused here rather than at the deal.
   *
   * The arbiter refuses a short deck too, and that refusal arrives at the worst
   * possible moment: a round that will not start, in front of everybody, with
   * the reason in a corner of one person's screen. An author gets it in the
   * editor instead.
   *
   * Measured against the *largest* the level says it is for, because that is the
   * number of people who can be standing there when somebody presses start.
   */
  if (rules.roles !== undefined) {
    const most = rules.players?.max ?? MAX_DECLARED_PLAYERS
    if (rules.roles.length < most) {
      problems.push(
        `there are ${rules.roles.length} roles for up to ${most} players — every player needs one`,
      )
    }
  }

  /**
   * A lethal role that is not in the deck, refused where an author can read it.
   *
   * The failure it prevents is the quietest one this format has: a typo in
   * `lethal` is a role nobody is ever dealt, so nobody's shots count, and the
   * level is a room full of people holding guns that do nothing to each other.
   * Nothing would say why - the arbiter is keeping the rule perfectly, about a
   * role that does not exist.
   */
  if (rules.lethal !== undefined) {
    if (rules.roles === undefined) {
      problems.push('a lethal role needs a deck of roles to be dealt from')
    } else if (!rules.roles.includes(rules.lethal)) {
      problems.push(`nobody is dealt "${rules.lethal}", so nobody's shots would count`)
    }
  }

  /**
   * A rule for a role that is not in the deck, refused for `lethal`'s reason.
   *
   * It is the same failure and it is quieter, because there is no gun to notice
   * going off and doing nothing: a `perRole` keyed on a typo is a role that is
   * never dealt, so the phase's own `allow` stands and everybody is drawn the
   * ordinary way. The level plays exactly as though the block were not there,
   * which is indistinguishable from an author who has not written it yet.
   */
  if (rules.perRole !== undefined) {
    const named = Object.keys(rules.perRole)
    if (rules.roles === undefined) {
      problems.push('a per-role rule needs a deck of roles to be dealt from')
    } else {
      for (const role of named) {
        if (!rules.roles.includes(role)) {
          problems.push(`nobody is dealt "${role}", so its rule would never apply`)
        }
      }
    }
  }

  /*
   * The same three refusals the parser makes, in the sentence an author reads.
   *
   * Both places, and not redundantly: the parser is a boundary and speaks in
   * `at` paths for a file, and this is what the editor puts under a field. The
   * rule that matters is that they agree, which is why the ceiling is one
   * exported constant rather than two literals.
   */
  const players = rules.players
  if (players) {
    for (const [field, value] of [
      ['smallest', players.min],
      ['largest', players.max],
    ] as const) {
      if (value === undefined) continue
      if (!Number.isInteger(value) || value < 1) {
        problems.push(`the ${field} number of players must be a whole number, at least 1`)
      } else if (value > MAX_DECLARED_PLAYERS) {
        problems.push(`the ${field} number of players must be ${MAX_DECLARED_PLAYERS} or fewer`)
      }
    }

    if (
      players.min !== undefined &&
      players.max !== undefined &&
      players.min > players.max
    ) {
      problems.push('the smallest number of players is more than the largest')
    }
  }

  return problems
}

/**
 * What a dealt value means, for whoever holds it.
 *
 * Null-safe on both sides on purpose: `role` is null for most of a round - the
 * deal lands a couple of seconds after the world does, and a level with no deck
 * never gets one at all - so every caller would otherwise open with the same
 * two-branch check. Absent is not an error here, it is the ordinary case.
 */
export function roleRule(rules: XpRules, role: string | null | undefined): RoleRule | undefined {
  if (!role) return undefined
  return rules.perRole?.[role]
}

/**
 * How the room may draw somebody, given what they were dealt.
 *
 * A total function rather than an optional, because the caller is a draw loop
 * and `undefined` there would be a third case to write a branch for that means
 * the same as the first. See `ROLE_VIEWS`.
 */
export function seenAs(rules: XpRules, role: string | null | undefined): RoleView {
  return roleRule(rules, role)?.seen ?? 'normal'
}

/**
 * How the room may draw each dealt value, for the party that has to publish it.
 *
 * The map the arbiter is handed with the deck (`deal`), and the reason it goes
 * there rather than being worked out by each client: **only the arbiter has ever
 * seen the whole deal.** A client asked to decide whether to draw somebody would
 * need that person's role to decide it, and handing a client somebody else's
 * role is the one thing this whole subsystem exists to not do. So the arbiter is
 * told what each value *looks like*, deals as it always did, and publishes the
 * look rather than the value.
 *
 * Empty when nothing is hidden, which is what keeps an ordinary deck free: an
 * empty map means the arbiter stores nothing and the view says nothing.
 */
export function viewsOf(rules: XpRules): Record<string, RoleView> {
  const views: Record<string, RoleView> = {}
  for (const [role, rule] of Object.entries(rules.perRole ?? {})) {
    if (rule.seen && rule.seen !== 'normal') views[role] = rule.seen
  }
  return views
}

/**
 * Whether this document takes turns, which is whether anything in it passes.
 *
 * `pass` is the verb that means a turn and it has never meant anything else, so
 * a document containing one is a document with an order - and one containing
 * none must never have a roll refused for being out of turn, because there is no
 * turn to be out of.
 *
 * Asked of the whole document rather than declared as a rule, deliberately: a
 * second way to say it would be a second thing to keep in step, and the first
 * time they disagreed the level would either refuse every press or none.
 */
export function takesTurns(document: {
  blueprints: Readonly<Record<string, { triggers?: readonly { do: readonly { op: string }[] }[] }>>
  flow?: { phases: Readonly<Record<string, { does?: readonly { op: string }[] }>> }
}): boolean {
  for (const blueprint of Object.values(document.blueprints)) {
    for (const trigger of blueprint.triggers ?? []) {
      if (trigger.do.some((verb) => verb.op === 'pass')) return true
    }
  }
  for (const phase of Object.values(document.flow?.phases ?? {})) {
    if ((phase.does ?? []).some((verb) => verb.op === 'pass')) return true
  }
  return false
}
