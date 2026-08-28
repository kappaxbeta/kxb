/**
 * What a rule is allowed to do.
 *
 * A closed vocabulary, and closed is the whole design. A trigger's `do` is a
 * list of these and nothing else - no expressions that reach anywhere, no
 * function that could be anything. That makes a rule serialisable, diffable,
 * safe to load from a file somebody else wrote, and possible to show in a panel
 * as a row rather than as a text editor.
 *
 * It is also enough. Every mode in docs/xp/creator.md §8 - football, all against
 * all, parkour, the shooter - is expressible in these, and the shape of the
 * thing that is not (a rule that needs to *compute*) is Stage 2 in §10: a script
 * in a worker. The verbs stay for everything that has to be immediate, because
 * a worker costs a frame.
 *
 * ---------------------------------------------------------------------------
 * Effects leave; changes stay
 * ---------------------------------------------------------------------------
 * Two kinds of verb, and the line between them is the one that keeps the engine
 * pure:
 *
 * - **Changes** happen to the world here and now - health, properties, whether
 *   something still exists. They are applied to the entity world directly,
 *   synchronously, because a crate that breaks has to stop blocking you on the
 *   frame it broke.
 * - **Effects** are things only the host can do: put a score somewhere durable,
 *   tell the other players, play a sound. Those are *returned*, not performed.
 *
 * The reason is in ./entities: a system that awaits is a system whose order
 * stops being deterministic, and determinism is the only reason a match can be
 * run inside a test.
 */

import type { Mark } from '../document/format'
import { markByName } from '../document/capabilities'
import { isSound } from '../assets/sounds'
import type { Blueprint, XpMaterial } from '../document/blueprints'
import { entityBox } from '../document/blueprints'
import { DEFAULT_REACH } from '../world/swinging'
import {
  activate,
  deactivate,
  despawn,
  entityByName,
  worldTransform,
  WEAPON_NAME,
  type EntityId,
  type EntityWorld,
  type WorldTransform,
} from '../world/entities'

/**
 * Bake a composed orientation onto something that has just stopped hanging.
 *
 * All three angles, not only the yaw. A rifle dropped by somebody who was
 * pitched over kept its parent's turn and lost its parent's tilt, which put it
 * flat on the floor at the instant it left the hand - a thing visibly snapping
 * upright with nothing in the level to explain it.
 *
 * Written back as *rows*, and cleared when they are zero, so an entity that was
 * never tilted stays out of the sparse maps the way the format keeps it out of
 * the document.
 */
function detach(world: EntityWorld, id: EntityId, placed: WorldTransform): void {
  world.rotation.set(id, placed.rotation)
  if (placed.pitch) world.pitch.set(id, placed.pitch)
  else world.pitch.delete(id)
  if (placed.roll) world.roll.set(id, placed.roll)
  else world.roll.delete(id)
}

/** Who a verb acts on. */
export type VerbTarget =
  /** The entity the trigger is on. */
  | 'self'
  /** Whoever set it off - the player who walked in, the shot that landed. */
  | 'other'
  /**
   * The level itself, and the data it declared it keeps.
   *
   * docs/xp/backlog.md §7c. A third noun rather than a second vocabulary: the
   * alternative on the table was `setData` / `addData` / a condition of its own,
   * and it was refused because those would mean the same three things as
   * `setProp`, `addProp` and a condition, in different words, in three files
   * that already share one set.
   *
   * It is not an entity, and every verb that acts on one does nothing with it -
   * `pick` answers null, so `damage target: 'world'` is a no-op here and a
   * refusal in the parser, where an author can still see it. What it *is* is a
   * place to read and write named numbers that outlive the session, which is
   * the only thing `setProp` and `addProp` were ever doing anyway.
   */
  | 'world'

/**
 * Who a door between two rooms takes with it. docs/xp/scenes.md §1.5.
 *
 * **One value, and it is the field's whole point.** §1.5 offers three - the
 * room, whoever set it off, and a named party - and the other two are S6,
 * because they are a subscription change and a list of people rather than a
 * word in a file. So this is a vocabulary with one member today.
 *
 * A type with one value looks like a field that should not exist yet, and the
 * argument for writing it now is the one S0 made about a scene's `entities`:
 * **refusing loudly beats dropping quietly.** An author reading §1.5 writes
 * `who: "self"`, and without this the parser keeps a document it does not
 * understand and the load takes the whole room through a door meant for one
 * person - a level that is subtly wrong rather than one that said what it could
 * not do yet. With it, they are told in the editor, by name, that the word is
 * real and the behaviour is not built.
 *
 * It is on the scene door and not on the one out of the document, which is a
 * line worth holding: a scene is which Realtime topic you are on (§1.6), so who
 * comes with you is a question about *subscription*. Leaving the document is a
 * question about the session - one person in a room running a different level
 * is not a smaller version of the same idea, it is a second room.
 */
export type SceneWho = 'room'

export type Verb =
  /**
   * Health off, by a fixed number or by anything between two.
   *
   * `upTo` is the whole of "a swing is not a measurement". A punching bag that
   * comes off at exactly ten every time is a bag you can count rather than one
   * you hit, and the ask that produced this field said so directly: *lose 10-20
   * hp*. Absent, it is one number and this verb is exactly what it always was.
   *
   * ---------------------------------------------------------------------------
   * Where the number comes from, and why not from here
   * ---------------------------------------------------------------------------
   * `VerbContext.random`, which the host supplies. Nothing in this file may
   * reach for `Math.random`: a verb pass that is not a function of its inputs
   * cannot be stepped twice by a test and cannot be reasoned about at all, and
   * this package's whole shape (see the note at the top) is built on it being
   * one. A host with no random rolls the **low** end - the honest floor, and
   * the same shape as a `deactivate` with no clock: what is promised without
   * the thing that makes it possible is the smallest true answer, not a guess.
   *
   * Both ends are inclusive and both are integers by the time the parser is
   * done, so `10 upTo 20` is one of eleven numbers rather than a real in a
   * range - "you took 14" is a game, "you took 13.9994" is a spreadsheet.
   *
   * Two clients rolling different numbers for the same swing is not a problem
   * this has to solve, and that is worth being explicit about: the hitter deals
   * the damage and `@kxb/xp/sharing` sends the resulting health, which every
   * other screen takes the sender's word for. The roll is the shooter's, the
   * outcome is everybody's.
   */
  | { op: 'damage'; amount: number; upTo?: number; target: VerbTarget }
  /** Health back on. `upTo` means the same as it does on `damage`. */
  | { op: 'heal'; amount: number; upTo?: number; target: VerbTarget }
  | { op: 'setProp'; key: string; value: number; target: VerbTarget }
  /**
   * A number nobody at this table chose, into one of the level's own fields.
   *
   * A dice, and the reason it is a verb rather than something a script does with
   * `Math.random` is the whole of docs/xp/server-authority.md §4: a roll every
   * client can reproduce is a roll every client can re-do until it likes the
   * answer. `./random` is a seeded stream deliberately - it is for scenery, and
   * scenery is exactly the case where everybody agreeing matters more than
   * nobody being able to predict it. A dice is the opposite case.
   *
   * So this **produces an effect and changes nothing here**, like `load` and
   * `stun`: the host asks whatever authority it has, and writes the answer into
   * the field. With an arbiter that is a number no client saw coming; without
   * one it is the host's own random, which is honest for a level somebody is
   * playing alone and is why a document that cannot tolerate it says
   * `needs: arbiter`.
   *
   * The result lands in `data`, which is why this could not have existed before
   * §7c: there was nowhere to put a number that a rule could then read back.
   */
  | { op: 'roll'; key: string; sides: number }
  /**
   * Asking the table for a seat, by name.
   *
   * ---------------------------------------------------------------------------
   * A verb rather than a setting, for the reason `roll` is one
   * ---------------------------------------------------------------------------
   * Who is on which side has always been *derived* - `sideOf` hashes an id, or
   * a host hands one down - and both are answers a player has no say in. A board
   * game wants the third thing: **you sit down in the chair you picked**, and
   * one person to a chair.
   *
   * That cannot be derived, because it is a fact about what somebody chose, and
   * it cannot be local, because "one person to a chair" is a race between two
   * clients pressing at the same moment. It is the same shape as a dice: the
   * verb happens here and the *answer* comes from whoever is keeping the table
   * honest. So this returns an effect and writes nothing, exactly like `roll` -
   * a seat with no host to ask is a seat nobody took, rather than one silently
   * granted.
   *
   * `team` names a side the document already has - the same string a spawn
   * mark's `team` carries and `Trigger.by` reads through `team:<name>`.
   */
  | { op: 'sit'; team: string }
  | { op: 'addProp'; key: string; value: number; target: VerbTarget }
  /**
   * A piece, moved along a track of marks by a number the level rolled.
   *
   * The verb a board game could not be written without, and the reason is that
   * `teleport` names **one** mark statically: "go three fields further on"
   * depends on where the piece is *now*, and no rule can compute that. This is
   * the smallest addition that makes any track game expressible.
   *
   * `along` names two things that are deliberately one name: the marks
   * (`track-0`, `track-1`, …) and the property on the piece that remembers which
   * one it is on. A piece on `track-4` has `props.track = 4`, so where it stands
   * and where it thinks it stands cannot drift apart — and a rule can read that
   * number like any other, which is how "am I home yet" gets asked.
   *
   * `by` is a field in the level's `data`, which is almost always the one a
   * `roll` just landed in. A step count in the *document* would be a board where
   * every move is the same length.
   *
   * ---------------------------------------------------------------------------
   * Running off the end is not a move
   * ---------------------------------------------------------------------------
   * When `track-<n>` does not exist the piece does not move at all, which is the
   * rule Mensch ärgere dich nicht actually has: you need the exact roll to come
   * home, and a six when you need a two is a turn you sit out. Clamping to the
   * last field instead would be a different game and a worse one — everybody
   * would pile up on the final square.
   */
  | { op: 'advance'; target: VerbTarget; by: string; along: string; bump?: string }
  /**
   * Call a meeting: everybody stops and votes on somebody.
   *
   * The last of the arbiter's three that no game reached. `vote_open` has been
   * there since 20261014000000, the panel that shows an open vote and lets you
   * press a number has been there since, and nothing could *start* one — so a
   * level with a deck of secret roles could deal them and then had no way to
   * accuse anybody.
   *
   * An effect for the same reason `roll` is: the answer is the arbiter's, the
   * deadline is measured with `now()` on the server, and this package has
   * neither. `seconds` is how long the room has to decide, clamped there rather
   * than here because a client that could set it is a client that can extend a
   * vote it is losing.
   *
   * A second meeting while one is running is refused by the arbiter — one
   * question at a time, or the room splits between two and neither reaches a
   * majority. So a level may put this on as many buttons as it likes.
   */
  | { op: 'meet'; seconds?: number }
  /**
   * Done: hand the turn to the next player.
   *
   * The other half of the arbiter knowing whose turn it is. `roll` refuses when
   * it is not yours, and this is how it stops being yours — a client saying "I
   * am finished", which is the same division every rule here follows: the
   * arbiter decides what a client may not, and the client decides what only it
   * knows.
   *
   * **When** a turn ends is a rule about the game and this deliberately does not
   * know any: rolling a six and going again is the document's business, so a
   * level puts this on whatever moment it means.
   */
  | { op: 'pass' }
  /**
   * Take something from somebody else's save, in a world you are not in.
   *
   * The verb §4.3 of docs/xp/server-authority.md was built for, and the last of
   * the three arguments that reopened §17: not secrecy and not fairness between
   * devices, but two people's state changing together with one of them offline.
   * What moves is the `visit` block's field, by its amount, at most once per its
   * cooldown.
   *
   * **It carries nothing, including who.** That is the design and not an
   * omission: the arbiter picks at random among everybody who can spare it,
   * because a player who could name a target would name the same one - which is
   * the farming docs/xp/state.md §7.6 lists fairness rules to prevent. Not
   * offering the choice is a stronger rule than any of them, and it means a
   * level needs no way to say a name, which is a text field in a world whose
   * pointer is locked.
   *
   * An effect for the same reason `roll` and `meet` are: the answer is the
   * server's, and this package has none. Without an arbiter the level says so
   * rather than quietly doing nothing.
   */
  | { op: 'raid' }
  /**
   * Play a clip on this body, and optionally on only part of it.
   *
   * The verb half of `runAnimation`. A script has been able to do this since it
   * existed and a *rule* could not, which made "the door opens and the guard
   * salutes" a level that needed a script for the second half of a sentence
   * whose first half was one verb.
   *
   * `loop` is off unless asked for, because most of what anybody wants is a
   * moment - a wave, a nod, a swing - and a one-shot hands the body back when it
   * ends. A looping one runs until something else is asked for.
   *
   * `parts` is what turns a clip into a **layer**. Absent, it is the whole body
   * and replaces what it was doing, which is right for a death and wrong for a
   * wave. Present - `["arms"]`, `["torso", "head"]` - it applies to those parts
   * and is laid over whatever else is happening, so a character can wave while
   * it walks. Which names mean which bones is the host's business: they name
   * parts of a *rig*, and a document played on two different bodies would be
   * naming two different things.
   *
   * Nothing is checked against a pack here for the reason `blueprint.pose` is
   * not: this package does not know which glTFs a host has loaded, so a clip it
   * does not hold leaves the body doing what it was doing, and the editor is
   * what stops an author naming one.
   */
  | {
      op: 'animate'
      clip: string
      loop?: boolean
      parts?: readonly string[]
      target: VerbTarget
    }
  /**
   * Start one of this thing's own motions, by name.
   *
   * ---------------------------------------------------------------------------
   * Not `animate`, and the difference is what moves
   * ---------------------------------------------------------------------------
   * `animate` plays a **clip** on a **skeleton**: a name the host loaded from a
   * pack, bound track by track to bones, and meaningless on anything without
   * them. `play` runs a **motion** on the entity's **own model nodes** - the
   * blade of a fan, the lid of a crate, the barrel of a turret - authored in the
   * document as a sequence of turns. Nearly everything in a level is the second
   * kind of thing and could not be animated at all until now.
   *
   * Two verbs rather than one because the names live in different places and
   * mean different things. A clip name is the host's vocabulary and this package
   * deliberately does not check it; a motion name is *this blueprint's*, and the
   * parser does - a `play` naming a motion the blueprint does not have is
   * refused rather than left to do nothing.
   *
   * Playing the same motion again restarts it, which is what a door being told
   * to open while it is opening should do. Stopping is `rest`.
   */
  | { op: 'play'; motion: string; target: VerbTarget }
  /**
   * Put every node back where the model draws them, and forget the motion.
   *
   * The other half, and it is not "pause": a paused motion would be a fourth
   * state (running, finished-and-held, stopped, never-started) for a renderer
   * that today has two. A finished motion already holds its last frame - see
   * `poseAt` - so "the door stays open" needs no verb at all, and the only thing
   * left to want is "the door is a door again".
   */
  | { op: 'rest'; target: VerbTarget }
  | { op: 'despawn'; target: VerbTarget }
  /**
   * Off for a while, then back. `seconds` absent means until something says so.
   *
   * The verb ammunition wanted. `despawn` is permanent, so a box that should
   * refill has to spawn a replacement - losing the original's name, its
   * properties, and anything a rule had written on it.
   */
  | { op: 'deactivate'; target: VerbTarget; seconds?: number }
  /** Back on, whether or not its timer was up. */
  | { op: 'activate'; target: VerbTarget }
  /**
   * Picked up by whoever set the trigger off, and carried until dropped.
   *
   * The target is the thing being carried; the *carrier* is always `other`,
   * which on a pickup's `enter` trigger is the person who walked into it. That
   * asymmetry matches `damage target: 'other'` - the target names what the verb
   * happens to, and the rest comes from the context.
   *
   * No new mechanism: this is `parent` and `socket`, which is already how a
   * rider sits in a kart and a gun hangs off a hand. A thing being carried is a
   * thing parented to a body.
   */
  | { op: 'carry'; target: VerbTarget; socket?: string }
  /** Put down where it currently is, keeping its place in the world. */
  | { op: 'drop'; target: VerbTarget }
  /**
   * Make this one let go of everything it is carrying.
   *
   * The other half of `carry`, and not the same as `drop`. `drop` names the
   * *thing being carried* - which is exactly right for "the crate is put back"
   * and useless for the case capture the flag is built on: a rule on the
   * player, firing when they are hit, that has to let go of whatever they
   * happen to be holding without knowing what it is.
   *
   * A rule can address the entity it is on and whoever set it off, and the
   * flag in somebody's hand is neither. So this addresses the *carrier*, and
   * every child comes off where it stands - the same arithmetic `drop` does,
   * once per thing held.
   *
   * Deliberately not `drop` with a flag on it. "Put this down" and "let go of
   * everything" are two sentences, and a boolean that switches which one a verb
   * means is how a row in the rules panel stops being readable.
   */
  | { op: 'unhand'; target: VerbTarget }
  /**
   * The gun in this one's hand, put away - and `arm` is the other half.
   *
   * `player.weapon` is a document-level fact: the host hangs one entity off the
   * player's hand at load and nothing ever turned it off. So a mode where
   * carrying something *costs* you - capture the flag, where a runner with a
   * gun is a runner nobody can stop - could not be written at all.
   *
   * ---------------------------------------------------------------------------
   * A verb pair rather than a rule the mode owns
   * ---------------------------------------------------------------------------
   * The alternative on the table was a flag in the rules block - "carrying
   * disarms you" - and it was refused for three reasons.
   *
   * **The engine would learn a mode's idea.** Carrying is a *property* in this
   * format, not a notion the engine has: the flag writes `flag: 1` onto whoever
   * took it and a base reads it back. A rule that disarmed "while carrying"
   * would have to invent the notion the template deliberately does without, and
   * every other mode would pay for it in a branch.
   *
   * **The moments already exist.** The gun goes the instant the flag is taken
   * and comes back the instant it is dropped, and both of those are already
   * rules with a `do` list. A verb goes in that list; a rule the mode owns is a
   * second thing firing near it, which is a second thing that can be out of
   * step with it.
   *
   * **And it composes.** A disarm that only ever meant "while holding the flag"
   * is one sentence; a verb is also the stun that takes your gun for a moment,
   * the water you cannot shoot in, the shop you check it at the door of.
   *
   * ---------------------------------------------------------------------------
   * No mechanism, and no `seconds`
   * ---------------------------------------------------------------------------
   * The weapon is already an ordinary entity - named, parented at a socket - so
   * this is `deactivate` aimed at a thing a rule has no way to name. What the
   * verb adds is the *addressing*: `self` and `other` are the only two nouns a
   * rule has, and neither of them is the gun in somebody's hand.
   *
   * Deliberately no timer, unlike `deactivate`. A disarm ends when the thing
   * that caused it ends - the flag is dropped, the round is over - and those
   * are events with rules on them already. A number here would be a second
   * clock able to hand the gun back mid-carry, which is the bug rather than the
   * feature.
   */
  | { op: 'disarm'; target: VerbTarget }
  /** The gun back in this one's hand. Arming somebody already armed is nothing. */
  | { op: 'arm'; target: VerbTarget }
  /**
   * Rooted to the spot for a moment.
   *
   * `deactivate` turns an *entity* off and the shape is right, but it cannot do
   * a player: being unable to move is a fact about the **controller**, and the
   * controller owns where a player is regardless of what this world says. A
   * deactivated player would be a body that stopped being drawn and carried on
   * walking, which is the opposite of the thing asked for.
   *
   * So this changes nothing here and is only ever an effect, the way `load` is.
   * The host already has the whole path - the respawn wait holds the body down
   * and ignores the keys - and this is that path reached for a second reason.
   * Which is also why the body stays *standing*: dying plays a corpse, and a
   * stun that played one too would read as a death you got back up from.
   *
   * `seconds` is required and positive. Absent means "until told" for
   * `deactivate` because something can turn an entity back on; nothing can turn
   * a player back on, so a stun with no end is a player who has left the game.
   */
  | { op: 'stun'; target: VerbTarget; seconds: number }
  /**
   * Shoved forward, the length of a dash.
   *
   * The other half of `stun`. That one takes the controller away for a moment;
   * this one borrows it for a moment, and neither can be written here for the
   * same reason: the host owns where a player is and overwrites this world's
   * idea of it every frame. So `dash` writes nothing and is only ever an
   * effect, and the host - which is the only thing that knows which way you are
   * *looking* - decides the direction and slides you there.
   *
   * **`cells`, not a speed.** "How far does a dash get me" is the question a
   * level is built around and the one an author can pace out, exactly as
   * `player.jump` is a distance rather than a launch velocity. How long it
   * takes is the host's, and is short enough to read as one move.
   *
   * **Through the wall it cannot pass.** The slide goes into the same
   * character-controller step that walking does, so a dash into a pillar stops
   * at the pillar. That is the whole reason this is not `teleport` with a
   * cheerful name: a teleport is a position and a dash is a *journey*, and the
   * difference only shows up when there is something in the way.
   */
  | { op: 'dash'; target: VerbTarget; cells: number }
  /**
   * A swing at whatever is in front of this one, at arm's length.
   *
   * The third of `stun`'s family and the one that had to exist for a level
   * about taking something off somebody. A shot is a weapon and a weapon is an
   * entity on a socket, so before this the *only* way to hurt anybody was to be
   * holding a gun - and "put that down and hit them with your hands" was a
   * sentence no document could write.
   *
   * **Nothing is written here**, for `stun` and `dash`'s reason and a sharper
   * one: what is in front of you includes other *players*, who are not entities
   * in this world at all. They are interpolated samples in the host's crowd
   * buffer, and their health belongs to the arbiter. So this reports a swing and
   * the host decides what it met - which is also what keeps two clients from
   * each deciding they won the same shoulder. See docs/xp/server-authority.md.
   *
   * **What it takes off is `damage` on the swinger**, not a field here. The
   * same place `ammo` lives and for the same reason: it is a fact about the
   * body, one number the whole document can see, and the arbiter is told it
   * once when this client joins. A number on the rule instead would be a
   * document that can quietly disagree with what the server is charging.
   *
   * **Both hands full is a refusal**, and it is the one rule of this verb worth
   * knowing. You cannot swing while carrying something, so a level that hands
   * you a flag has taken your fists away by doing so - which is a rule about
   * hands rather than about flags, and is why it lives here rather than in
   * whichever document needed it first.
   */
  | { op: 'swing'; target: VerbTarget; reach?: number }
  /**
   * What it is made of, changed.
   *
   * `blueprint.material` says what a thing wears when it arrives and this says
   * what it wears now - the same division `light` has between the blueprint's
   * lamp and the row a script dims. Which is what the feature is *for*: a ball
   * that goes rainbow when it is kicked and comes back when it stops is two
   * rules and no new kind of entity.
   *
   * `own` is the way back, and is why the material is a word rather than a
   * flag. A boolean could be turned off; it could not say "wear your own
   * model", which is the thing a level actually means when it stops glowing.
   */
  | { op: 'material'; target: VerbTarget; material: XpMaterial }
  /**
   * Moved to wherever a named entity is - usually an empty node.
   *
   * `to` is a *name*, not coordinates, because a destination that is an entity
   * can be moved by the author without every trigger pointing at it having to
   * be edited, and can itself be carried, parented or turned off. A node with
   * `draw: false` is what this was built for; nothing stops it being a crate.
   *
   * The one thing it cannot do on its own is move the **player**, and that is
   * not a bug in this verb. The host's character controller owns where a player
   * is and writes it into this world every frame, so the position set here
   * would be overwritten before anybody saw it. Hence the effect: this reports
   * where the thing should end up, and a host that has a controller applies it.
   */
  | { op: 'teleport'; target: VerbTarget; to: string }
  /**
   * A save point: from now on, dying puts you here rather than at the start.
   *
   * The target is who it is *for* - `other` on an `enter` trigger, the person
   * who walked onto the pad - and the pad itself is `self`, which supplies both
   * the place and the number. Same asymmetry as `carry`: the target names who
   * the verb happens to, and the rest comes from the context.
   *
   * ---------------------------------------------------------------------------
   * The number, and why the highest wins
   * ---------------------------------------------------------------------------
   * Each pad carries an `order` in its properties, and taking one only counts
   * if its order is *higher* than the best you have reached. Without that rule
   * a course doubling back on itself would quietly undo your progress: walking
   * past the second checkpoint on the way to the third would be fine, but
   * crossing the first one again on a loop would send your next death back to
   * the beginning, and nothing on screen would say why.
   *
   * `order` lives in `props` rather than on the verb because properties are
   * per *entity* - the blueprint says what a save point is, and each one placed
   * in the level carries its own number, which is exactly the shape wanted. It
   * is also why they are integers and not names: every property is a number.
   *
   * Zero, or absent, is never taken. "The highest reached so far" starts at
   * zero, so a pad numbered zero is indistinguishable from not having reached
   * one at all - and rather than invent a sentinel, the number line simply
   * starts at one, which is where an author counting save points starts anyway.
   */
  | { op: 'checkpoint'; target: VerbTarget }
  /**
   * A door to another XP: the level changes, the room does not.
   *
   * Asked for as "a trigger to load another XP like a link — the room stays the
   * same". The room is a Realtime topic keyed on the space rather than on the
   * document, so the transport genuinely does not care which level is loaded;
   * what has to change is the scene, with everybody in the room coming along.
   *
   * Which is why this is only ever an *effect*. There is nothing for a verb to
   * do to the entity world here - the entity world is the thing being thrown
   * away - and a client that swapped its own level would be a room where two
   * people cannot see each other and nothing says why. The host broadcasts, and
   * everybody swaps together or nobody does.
   */
  | { op: 'load'; xp: string }
  /**
   * A door to another room of *this* level: nothing is fetched at all.
   *
   * The sibling above and this one are one verb with two kinds of destination,
   * because that is what the document's `scenes` table is (one table, two kinds
   * of value - see `resolveScene`). They are two members here rather than one
   * field that could hold either, and the reason is that a bare string cannot
   * say which it is: a scene name and an XP id share an alphabet, so `cellar`
   * is either a room here or somebody else's file and only the author knows.
   *
   * ---------------------------------------------------------------------------
   * What spelling it out buys, given `xp` already reached a scene
   * ---------------------------------------------------------------------------
   * `{ op: 'load', xp: 'cellar' }` has walked into the cellar since S1, because
   * the host looks in the table before it treats a name as a document. Two
   * things are still wrong with it, and they are why this exists.
   *
   * **It is a fetch waiting to happen.** The name resolves against a table
   * entry, so deleting `scenes.cellar` turns a door between two rooms into a
   * request for `public/xp/xps/cellar.xp.json` - a different failure, at play,
   * from the one the author made in the editor.
   *
   * **And it cannot say `main`.** The root is a scene that is not in the table
   * (the parser refuses `scenes.main`), so `xp: "main"` is a well-formed id for
   * a document nobody wrote. That is not a detail: `main` is the way *back*, so
   * without this the front room is the one place in a level a door cannot
   * reach, which is exactly the hole `two-rooms.xp.json` was shipped with.
   */
  | { op: 'load'; scene: string; who?: SceneWho }
  | { op: 'spawn'; blueprint: string; dx: number; dy: number; dz: number }
  | { op: 'score'; amount: number }
  | { op: 'emit'; event: string }
  /**
   * Make a noise. docs/xp/backlog.md §0.5.
   *
   * `sound` is a name from the pack's alphabet (`./sounds`), never a filename
   * and never a URL: an author asks for `hit`, and which of five recordings of
   * a punch that turns into is the host's business.
   *
   * **No target, and that is a decision rather than an omission.** Every other
   * verb here acts on an entity; this one acts on the room. Making it
   * positional means a `PositionalAudio` per source, a listener on the camera
   * and a falloff to tune — a real feature, and one that would arrive as a
   * *field on this verb* rather than a second op, so nothing here has to be
   * unpicked to get it. Until then a sound is as loud from across the level as
   * it is underfoot, which is the honest version of what it does.
   */
  | { op: 'sound'; sound: string }
  /**
   * Play a cut, and let whoever is playing watch it.
   *
   * ---------------------------------------------------------------------------
   * Why this is a picture over the game rather than a change of room
   * ---------------------------------------------------------------------------
   * The obvious build is `load`: a cutscene is somewhere else, so go there and
   * come back. It is wrong in three ways at once. A `load` takes the **whole
   * room** with it, so one person walking into a trigger would drag everybody
   * into a cutscene they did not start. It throws the entity world away, so
   * "come back" means rebuilding the level and everything anybody was standing
   * on. And it is a broadcast, so a shot cannot be something one player sees.
   *
   * A cut is a *film*. What the runtime does is draw it over the top - its own
   * scene, built from the document, posed by `stageAt`, with its own camera -
   * while the level underneath carries on existing untouched. Which is also why
   * this needs no new loader: every place a take names is already in the
   * document the runtime is holding.
   *
   * ---------------------------------------------------------------------------
   * An effect, never performed here
   * ---------------------------------------------------------------------------
   * The same reason `load` is one. There is nothing to do to the entity world -
   * the entity world is the thing being drawn *over* - and a verb that reached
   * into the renderer would be the rules layer knowing there is a screen.
   */
  | { op: 'movie'; sequence: string }

/** Something only the host can carry out. Returned, never performed here. */
export type Effect =
  | { kind: 'score'; amount: number; by: EntityId | null }
  /**
   * Somebody said a name. `emitted` triggers listening for it will hear it.
   *
   * `script` says a **script** said it rather than a rule, and it exists for
   * exactly one consumer: the host deciding whether to put it on the wire.
   * Scripts are deterministic and run on every client, so a script's emit has
   * already happened everywhere and broadcasting it would fire every listener
   * twice; a rule's has not, because `stepTriggers` is handed only the local
   * player. See `@kxb/xp/sharing` for the same argument about animation.
   *
   * Optional, so every caller and every test written before signals crossed the
   * wire is unchanged, and absent reads as "a rule said it" - which is what
   * `applyVerb` produces and what the conservative answer should be: a signal
   * wrongly shared fires a rule twice, one wrongly withheld never arrives.
   */
  | { kind: 'emit'; event: string; from: EntityId; script?: true }
  /**
   * Play one of the pack's sounds.
   *
   * An effect rather than a change, because it is the definition of one: there
   * is nothing in the entity world to write, and only the host has an audio
   * context. It is also why the engine can stay testable — a match runs to
   * completion in `bun test` and simply collects these.
   *
   * The *name*, not a URL. `soundUrl` turns one into the other and needs a
   * pick to choose a take, which is a random number this package does not have
   * and does not want: two people hearing different recordings of the same
   * punch is what makes a fight sound like a fight. See `./sounds`.
   */
  | { kind: 'sound'; sound: string }
  /** Watch a cut. See the `movie` verb for why this is not a `load`. */
  | { kind: 'movie'; sequence: string }
  | { kind: 'spawned'; id: EntityId; blueprint: string }
  | { kind: 'died'; id: EntityId; blueprint: string }
  /**
   * Somebody should now be somewhere else.
   *
   * Reported even though the world has already been written, because for the
   * one entity that matters - the player - the write does not stick. A host
   * without a character controller can ignore this and the world is already
   * correct; a host with one has to move the controller, which is the only
   * thing that decides where a player actually is.
   *
   * Feet, like `Sample.y` and unlike the camera. A host that puts an eye here
   * gets a player standing inside the ceiling.
   */
  | {
      kind: 'teleport'
      id: EntityId
      x: number
      y: number
      z: number
      facing: number
      /**
       * The track and the square, when the move was an `advance`.
       *
       * Absent for a plain `teleport`, which has no track to be on. Present so
       * a host can hand the move to the *other* clients as what it was - a
       * piece is where it is and remembers which field it is on, and a peer
       * given only coordinates has a piece in the right place with the wrong
       * idea of where it is. Its next roll would move it from the wrong square.
       */
      along?: string
      to?: number
    }
  /**
   * Everybody in this room should now be in a different level.
   *
   * The host's work, all of it: tell the room over the socket, fetch the
   * document, swap the scene. None of that can happen here - this package has
   * no network and no `fetch`, which is the property that lets a match be run
   * inside a test.
   */
  | { kind: 'load'; xp: string }
  /**
   * Everybody in this room should now be in a different room of the same level.
   *
   * The host's work again, and less of it: nothing is fetched, because the
   * world, the spawn and the marks are already on this machine and what changes
   * is which of them is on screen. What it must still do is *say so* - the
   * scene is in the Realtime topic (docs/xp/scenes.md §1.6), so a client that
   * changed room quietly has left the topic everybody else is on, and the room
   * becomes two rooms with nothing on either screen to explain it.
   *
   * **No `who`, and that is not an omission.** `who: "room"` is the only value
   * the format has today and it means "everybody here" - which is what this
   * effect already is, by its own name. A field whose one value restates the
   * thing it is a field on is a field with no reader, and the day `self` and
   * parties land (S6) is the day it carries something.
   */
  | { kind: 'load'; scene: string }
  /**
   * Somebody should roll, and the answer belongs in this field.
   *
   * The host's work for the reason `load`'s is: this package has no arbiter and
   * no random it would be honest to use here. It carries the field rather than
   * the number, so the one place that knows what was asked for is the one place
   * that writes it.
   */
  | { kind: 'roll'; key: string; sides: number }
  /** A seat asked for. Granted, refused or ignored by whoever is host. */
  | { kind: 'sit'; team: string }
  /**
   * Everybody should stop and vote.
   *
   * Carries only how long, because who is voting and on whom is the room's
   * business and the panel's — this is the level saying *now*, which is the one
   * part of a meeting a document has an opinion about.
   */
  | { kind: 'meet'; seconds?: number }
  /** The turn should move on. Carries nothing: the order is the arbiter's. */
  | { kind: 'pass' }
  /** Take from somebody. Carries nothing: whose is the arbiter's too. */
  | { kind: 'raid' }
  /**
   * Where this player should reappear from now on.
   *
   * Returned rather than written, for the same reason `teleport` is: the host's
   * controller owns where a player is, and it owns where a player *restarts*
   * too - both the revive and the fall-through-the-floor catch. Feet, like
   * `teleport`.
   *
   * Only ever emitted when the number actually beat the best so far, so a host
   * can treat every one of these as news and say so on the HUD.
   */
  | { kind: 'checkpoint'; id: EntityId; x: number; y: number; z: number; facing: number; order: number }
  /**
   * This one cannot move for a while.
   *
   * Nothing was written to the world, unlike every other verb that reports -
   * there is nowhere to write it. The controller decides where a player is, and
   * whether it listens to the keyboard is state that lives with it, so a host
   * without one can ignore this and nothing is left half-applied.
   *
   * Reported for whoever the verb named rather than only for the player,
   * because this package has no idea which id a given host drives. A host that
   * only freezes its own reads the id and drops the rest.
   */
  | { kind: 'stunned'; id: EntityId; seconds: number }
  /**
   * This one goes forward, fast, for a moment.
   *
   * `stunned`'s twin in every structural way: nothing was written to the world,
   * because the direction is not in it. Which way a body is *pointing* is a
   * component here; which way somebody is *going* is a camera and a thumbstick,
   * and only the host has those. A host without a controller ignores this and
   * nothing is left half-applied.
   *
   * `cells` is a distance and may be negative, which is a hop backwards - the
   * one thing a level asks for that a positive-only number would make somebody
   * write a second verb for.
   */
  | { kind: 'dashed'; id: EntityId; cells: number }
  /**
   * This one has swung at whatever is in front of it.
   *
   * The third of the family, and the one that reports the least: no direction,
   * no outcome, not even who it landed on. Only the host knows which way this
   * body is looking, which other people are in the room, and where they are
   * being drawn - and on a body that is not the local player it knows none of
   * that, so a host reads the id and drops the rest exactly as it does for
   * `stunned`.
   *
   * `reach` travels because it is the author's number: how long an arm is, in
   * cells, is a fact about the level's fiction rather than about the runtime.
   * What it *takes off* does not travel - see the verb.
   */
  | { kind: 'swung'; id: EntityId; reach: number }

/** What a verb runs against: the entity it is on, and whatever set it off. */
export interface VerbContext {
  self: EntityId
  /** Null when nothing set it off - a timer, a spawn. */
  other: EntityId | null
  /**
   * What time it is, in seconds, when the caller knows.
   *
   * Optional, and that is a compatibility choice rather than a design one:
   * every existing caller of `applyVerbs` predates the only verb that needs it,
   * and making it required would have been a signature change rippling through
   * `fire`, `stepTriggers` and both lanes' call sites for one field.
   *
   * Absent, a `deactivate` with `seconds` on it turns the thing off *without* a
   * return - which is the honest failure: a host that cannot say what time it is
   * cannot promise to bring anything back, and silently treating "no clock" as
   * "no delay" would make a timed pickup reappear instantly.
   */
  now?: number
  /**
   * The document's marks, so a `teleport` can name one.
   *
   * Optional for the reason `now` is: every caller predates the only verb that
   * reads it, and making it required would be a signature change through
   * `fire`, `stepTriggers` and both lanes' call sites for one field. Absent, a
   * `to` that names a mark finds nothing and the teleport does not happen -
   * which is the same honest failure as a despawned destination rather than a
   * silent trip to the origin.
   */
  marks?: readonly Mark[]
  /**
   * The level's own declared data, if the host is keeping any.
   *
   * A map rather than a second props table on the world, and optional for the
   * reason `now` and `marks` are: every existing caller predates it. Absent, a
   * verb aimed at `world` does nothing - which is the same honest failure as a
   * teleport to a mark that is not there, and is exactly the state a host with
   * no store is in.
   *
   * **Mutated in place, deliberately.** The host owns this map, watches it, and
   * writes changed fields back to the store; handing back a new one per verb
   * would make "what changed" a diff somebody has to compute against a copy
   * they remembered to keep. It is the same arrangement `world.props` already
   * has one layer down.
   *
   * Only fields the document declared are here. `parseXp` refuses a rule naming
   * one that was not, so a key arriving that this map has never heard of is a
   * document that did not come through the parser.
   */
  data?: Map<string, number>
  /**
   * A draw in `[0, 1)`, when the host has a stream to draw from.
   *
   * Read by exactly one thing - a `damage` or `heal` with `upTo` on it - and
   * optional for the reason `now`, `marks` and `data` are: every existing
   * caller predates it, and a required field would be a signature change
   * through `fire` and `stepTriggers` for a verb most levels never write.
   *
   * A function rather than a number so a rule with three rolls in it gets three
   * numbers. Absent, a range takes its low end - see the note on `damage`.
   *
   * **Not `Math.random`, wherever it comes from.** The host that has one hands
   * over `./random`'s stream addressed by seed, tick and index, which is the
   * same thing a script's `world.random()` draws from and for the same reason
   * (see ./random): a cursor each machine keeps is a cursor that silently
   * diverges the moment somebody joins a match already running.
   */
  random?: () => number
}

/**
 * Where a spawned entity's id comes from.
 *
 * Above every id the document could have used, so a runtime spawn can never
 * collide with an authored one - and counting up from there so two clients
 * running the same rules on the same tick agree about which is which.
 *
 * Not random. A random id is a debris cloud where every client sees different
 * debris, which is fine right up until a rule refers to one of them.
 */
export const RUNTIME_ID_BASE = 1_000_000

/**
 * What an XP id is allowed to be, checked here because this one reaches a path.
 *
 * A document id names a file - `public/xp/xps/<id>.xp.json` - so an id with a
 * slash or a dot-dot in it is an id that walks out of the directory it names on
 * its way into a `fetch`. The route that serves them applies the same rule on
 * the server (`safeId` in `src/app/xp/[id]/page.tsx`), and this is deliberately
 * a second copy rather than an import: the server one is the enforcement, and
 * this one exists so that a document carrying such an id is refused when it is
 * *parsed*, in the editor, by its author, instead of at the moment somebody
 * walks through the door.
 */
const XP_ID = /^[a-z0-9][a-z0-9-]*$/

export function isXpId(value: string): boolean {
  return XP_ID.test(value)
}

/**
 * Where a `load` is actually going, and whether to ask first.
 *
 * The document's own `scenes` table wins, and a bare id is the fallback - the
 * same precedence a hosts file has over DNS, and for the same reason: the
 * level's own names are the ones its author controls.
 *
 * The `ask` flag is the whole point of doing this here rather than in the host.
 * "Internal is instant, external asks permission" is a rule about *trust*, and
 * trust is decided by where a document came from, which is a fact this function
 * has and a `fetch` call site does not. A host that had to work it out again
 * would be a second place that could get it wrong, and getting it wrong means
 * either a prompt on every door or no prompt on a stranger's.
 *
 * Null means the name resolves to nothing, which a host should treat as a door
 * that does not open rather than as an error - an author may name a scene
 * before writing it.
 */
export function resolveScene(
  name: string,
  scenes: Readonly<Record<string, unknown>> | undefined,
): { target: string; external: boolean } | null {
  const mapped = scenes?.[name]
  /**
   * A place in this document is not a document to fetch.
   *
   * The table holds both since scenes arrived, and this function answers only
   * the second question - *what do I load* - so a name that turns out to be a
   * room here is a null, the same as a name that resolves to nothing. Falling
   * through to the bare-id branch instead would be worse than useless: a scene
   * called `cellar` would resolve to the *document* `cellar`, which is a fetch
   * for a file that probably does not exist and, if it does, is the wrong one.
   *
   * Standing in one is `placeOf`, in ./format, which is where the root being
   * called `main` is known.
   */
  if (mapped !== undefined && typeof mapped !== 'string') return null
  if (mapped !== undefined) {
    // Already validated at parse: an id, or an https URL. Nothing else survives.
    return isXpId(mapped)
      ? { target: mapped, external: false }
      : { target: mapped, external: true }
  }
  return isXpId(name) ? { target: name, external: false } : null
}

/**
 * The entity a verb is aimed at, or null when it is not aimed at one.
 *
 * The `world` branch is not tidiness. This was `target === 'self' ? self :
 * other`, and adding a third target made that ternary answer **`other`** for
 * it - so `damage target: 'world'` would have hurt whoever set the trigger off,
 * silently, and typechecked. Named exhaustively so the next target added here
 * has to be thought about rather than falling into the last branch.
 */
function pick(context: VerbContext, target: VerbTarget): EntityId | null {
  if (target === 'self') return context.self
  if (target === 'other') return context.other
  return null
}

/**
 * One number out of a range, or the one number there was.
 *
 * Both ends inclusive, which is what `10 upTo 20` reads as to the person who
 * wrote it - a swing that can take exactly twenty off. The floor and ceiling
 * are already integers by the time a document has been through the parser, so
 * the span is a whole count and no rounding decision is being made here.
 *
 * The low end when there is no stream, deliberately, and it is the same
 * decision `deactivate` makes without a clock: a host that cannot roll should
 * do the smallest true thing rather than the average, because a floor is a
 * number an author can predict and a silent mean is a bug that looks like
 * balance. It is also what keeps every test in this package deterministic
 * without any of them having to pass a stub.
 */
function rollAmount(amount: number, upTo: number | undefined, random?: () => number): number {
  if (upTo === undefined || upTo <= amount || !random) return amount
  const draw = random()
  // A stream that answers with nonsense is a stream that is not there. Clamped
  // rather than trusted: a draw of 1 would put the result one past the ceiling,
  // and `NaN` would put `hp` beyond arithmetic for the rest of the session.
  if (!Number.isFinite(draw)) return amount
  return amount + Math.min(upTo - amount, Math.floor(Math.max(0, draw) * (upTo - amount + 1)))
}

/**
 * The gun hanging off this one, if there is one.
 *
 * By name and by who it hangs from, rather than by `WEAPON_ID`. The id is
 * fixed - three things have to agree about it - but it is *the local player's*
 * weapon, and a rule saying "disarm whoever walked in" is a sentence about
 * somebody, not about that constant. Asking the world instead means the verb
 * says the same thing on the day a second body carries one.
 *
 * Walked rather than indexed: a level has one weapon in it today and the map is
 * the size of the things that are parented to something, which is the flags and
 * the guns. If that stops being true the index goes on the world, not here.
 *
 * A gun that has been put away is still found - `deactivate` leaves the parent
 * link alone - which is what lets `arm` be the reverse of `disarm` rather than
 * a second `spawnWeapon`.
 */
function weaponOf(world: EntityWorld, holder: EntityId): EntityId | null {
  for (const [child, link] of world.parent) {
    if (link.id === holder && world.name.get(child) === WEAPON_NAME) return child
  }
  return null
}

/**
 * Run one verb.
 *
 * Returns any effects it produced. Everything else has already happened to the
 * world by the time this returns, which is what lets a caller run a list of
 * verbs in order and have each one see what the last one did - a `damage`
 * followed by a "if it is dead, despawn" is the common shape and it only works
 * if the damage is already applied.
 */
export function applyVerb(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  verb: Verb,
  context: VerbContext,
): Effect[] {
  switch (verb.op) {
    case 'damage':
    case 'heal': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      const props = world.props.get(id)
      if (!props || props.hp === undefined) return []
      const rolled = rollAmount(verb.amount, verb.upTo, context.random)
      const delta = verb.op === 'damage' ? -rolled : rolled
      // Clamped at zero rather than allowed to go negative: "how dead is it"
      // is not a question, and a negative health is a number every later rule
      // has to remember to clamp itself.
      props.hp = Math.max(0, props.hp + delta)
      /**
       * And at full, going the other way.
       *
       * Full is the blueprint's own `props.hp`, which is already the one
       * ceiling in this system: `hurtIn` draws a bar against it and
       * `@kxb/xp/sharing` decides what is worth sending by it, both on the rule
       * that a thing at full health is a thing whose number still equals what
       * it was spawned with. A heal that sailed past it would put a fourth
       * answer to "is this hurt" on the wire and a bar drawn fuller than full
       * on the screen.
       *
       * It is also what makes "back to full" writable at all. A rule that has
       * to bring a thing back from zero cannot read its own maximum - there is
       * no verb that reads anything - so the only way to say it is to heal by
       * more than enough and let the ceiling do the arithmetic. Without the
       * clamp that sentence is unsayable and every author has to hard-code the
       * blueprint's number into a second place.
       *
       * A thing whose blueprint declares no `hp` has no ceiling to hit; a thing
       * spawned above one keeps whatever it was given, because clamping *down*
       * on a heal would be a verb taking health away.
       */
      if (verb.op === 'heal') {
        const full = blueprints[world.blueprint.get(id) ?? '']?.props?.hp
        if (full !== undefined && Number.isFinite(full) && props.hp > full) {
          props.hp = Math.max(full, props.hp - delta)
        }
      }
      return []
    }

    case 'setProp':
    case 'addProp': {
      /**
       * The level's own data, when that is what is being addressed.
       *
       * Before the entity branch rather than inside it, because `world` has no
       * id and every line below assumes one. A host with no data map does
       * nothing at all here - see the note on `VerbContext.data`.
       */
      if (verb.target === 'world') {
        if (!context.data) return []
        const held = context.data.get(verb.key)
        // An undeclared key cannot arrive through the parser, and a host that
        // hands one over anyway starts it at the same zero `addProp` uses for a
        // property an entity has never had.
        context.data.set(
          verb.key,
          verb.op === 'setProp' ? verb.value : (held ?? 0) + verb.value,
        )
        return []
      }

      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      const props = world.props.get(id)
      if (!props) return []
      props[verb.key] =
        verb.op === 'setProp' ? verb.value : (props[verb.key] ?? 0) + verb.value
      return []
    }

    case 'roll':
      /**
       * Nothing happens here, and that is the whole verb.
       *
       * A roll with no host to ask is a roll that did not happen, rather than a
       * zero written into the field: a rule reading `dice == 0` after a failed
       * roll would be a rule that behaves like the dice came up nothing, which
       * is a face no dice has.
       */
      return [{ kind: 'roll', key: verb.key, sides: verb.sides }]

    case 'sit':
      // Nothing here either, and for the reason above the verb: a seat is not
      // this client's to grant.
      return [{ kind: 'sit', team: verb.team }]

    case 'play': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      /**
       * The second it started, on the clock a document speaks.
       *
       * `now` rather than `world.tick`, unlike `animate` above, and the reason
       * is that the two numbers are doing different jobs. A clip's `at` is an
       * *identity* - all a renderer does with it is notice that it changed. A
       * motion's `since` is the **origin of time** for a function this package
       * evaluates itself, so it has to be in the units the steps are authored
       * in. Seconds, and the same seconds `deactivate` counts.
       *
       * Set unconditionally, so playing a motion that is already running starts
       * it over.
       */
      /**
       * No clock, no motion - and said rather than assumed.
       *
       * The same honest failure `deactivate` makes two verbs down: a host that
       * cannot say what time it is cannot be the origin of one, and starting a
       * motion at second zero would run it from wherever the level's clock
       * happens to be - a door that flies open having already been opening for
       * four minutes. Every caller that matters passes `now`.
       */
      if (context.now === undefined) return []
      world.motion.set(id, { name: verb.motion, since: context.now })
      return []
    }

    case 'rest': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      world.motion.delete(id)
      return []
    }

    case 'animate': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      /**
       * `world.tick` is what makes the same clip twice two events.
       *
       * A renderer comparing only the name would see `Wave` both times and
       * leave the first one running, so a rule firing once a second would
       * animate once and then stand still. The tick is an identity rather than
       * a time - all anybody does with it is notice that it changed - which is
       * also why it survives the wire unchanged (see `@kxb/xp/sharing`).
       */
      world.clip.set(id, {
        name: verb.clip,
        loop: verb.loop === true,
        at: world.tick,
        ...(verb.parts && verb.parts.length > 0 ? { parts: verb.parts } : {}),
      })
      return []
    }

    case 'despawn': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      const blueprint = world.blueprint.get(id) ?? ''
      despawn(world, id)
      // Announced rather than silent: something scores, something spawns in its
      // place, something tells the room. The data is still there to read.
      return [{ kind: 'died', id, blueprint }]
    }

    case 'deactivate': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      const at =
        verb.seconds !== undefined && context.now !== undefined
          ? context.now + verb.seconds
          : Infinity
      deactivate(world, id, at)
      // Not `died`. A thing that is coming back has not died, and a rule
      // listening for a death - a score, a replacement, a message - should not
      // fire because an ammo box went quiet for eight seconds.
      return []
    }

    case 'activate': {
      const id = pick(context, verb.target)
      if (id === null) return []
      activate(world, id)
      return []
    }

    case 'carry': {
      const id = pick(context, verb.target)
      const carrier = context.other
      if (id === null || carrier === null || id === carrier) return []
      if (!world.alive.has(id) || !world.alive.has(carrier)) return []

      /**
       * One thing per hand, and the yard is why.
       *
       * A `pressed` trigger with a `within` fires on **every** entity in reach,
       * which is right for a rule that lights three lamps and wrong for a rule
       * that picks something up: standing among your own four pieces and
       * pressing once put all four in one hand, because each of them ran the
       * same correct rule.
       *
       * Refused here rather than solved in the document, because no document can
       * say it - a trigger cannot know what the trigger on the next entity is
       * about to do. And refused rather than swapped: a hand that quietly put
       * down what it was holding to take something else is how you lose the
       * thing you were carrying by walking past a shelf.
       *
       * Per *socket*, so a level that holds a gun in one hand and a flag in the
       * other still works. A carry with no socket is the empty hand, and there
       * is one of those.
       */
      for (const [child, to] of world.parent) {
        if (to.id !== carrier || child === id) continue
        if (to.socket === verb.socket) return []
      }

      /**
       * Sat at the socket, not where it was lying.
       *
       * A carried thing's position becomes an offset from its carrier - that is
       * what `worldTransform` composes - so keeping the world position it had
       * would place a coin picked up across the room that same distance from the
       * person now holding it. Zero is "at the socket", which is where a thing
       * in your hand is.
       */
      world.parent.set(id, { id: carrier, ...(verb.socket ? { socket: verb.socket } : {}) })
      world.position.set(id, { x: 0, y: 0, z: 0 })
      world.rotation.set(id, 0)
      return []
    }

    case 'unhand': {
      const carrier = pick(context, verb.target)
      if (carrier === null) return []

      /**
       * Every child, worked out before any link is cut.
       *
       * Collected first because dropping one changes the map being walked, and
       * a map mutated inside its own iteration is the kind of bug that shows up
       * as "one of the two things you were holding stayed stuck to you".
       */
      const held: EntityId[] = []
      for (const [child, link] of world.parent) {
        if (link.id !== carrier) continue
        /**
         * Except the gun, which is worn rather than picked up.
         *
         * The weapon hangs off the hand because the *host* put it there at
         * load, not because a rule carried it, and "let go of everything you
         * are holding" is a sentence about the things you picked up. Without
         * this, the rule capture the flag is built on - being hit makes you
         * drop it - would also leave your gun lying on the floor where you were
         * standing, and the verb that puts one back (`arm`) would hand you back
         * a gun that is no longer attached to you.
         */
        if (world.name.get(child) === WEAPON_NAME) continue
        held.push(child)
      }

      for (const child of held) {
        // The same three lines `drop` does, and for the same reason: the stored
        // position is relative to the carrier, so the composed transform is the
        // only moment both halves are known.
        const placed = worldTransform(world, child, blueprints)
        world.parent.delete(child)
        world.position.set(child, { x: placed.x, y: placed.y, z: placed.z })
        detach(world, child, placed)
      }
      return []
    }

    case 'disarm':
    case 'arm': {
      const holder = pick(context, verb.target)
      if (holder === null) return []
      const gun = weaponOf(world, holder)
      if (gun === null) return []
      // The same two functions `deactivate` and `activate` call, so a gun that
      // is away is away in exactly the sense the rest of the engine already
      // understands: out of `alive`, still holding every component row it had,
      // and drawn by nothing.
      if (verb.op === 'disarm') deactivate(world, gun)
      else activate(world, gun)
      return []
    }

    case 'stun': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      // Nothing to write. See the type: the only state a stun has lives in the
      // host's controller, and a number below one is a stun that ended before
      // it began.
      return verb.seconds > 0 ? [{ kind: 'stunned', id, seconds: verb.seconds }] : []
    }

    case 'dash': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      // Nothing to write, for `stun`'s reason word for word. Zero is dropped
      // rather than reported because a host would slide somebody nowhere over a
      // fifth of a second, which is a fifth of a second of not being able to
      // walk properly in exchange for nothing happening.
      return verb.cells === 0 ? [] : [{ kind: 'dashed', id, cells: verb.cells }]
    }

    case 'swing': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []

      /**
       * Not with your hands full, which is the whole of this verb's rule.
       *
       * A person carrying a flag cannot also punch, and a document should not
       * have to remember to say so: the level that wanted this wrote the same
       * thing three ways - a prop set on pickup, a condition on the swing, and
       * a rule to clear it - and every one of those is a place to forget. What
       * is in a hand is already in the world, so this is one question asked of
       * it.
       *
       * The **worn weapon is not carrying**. It hangs off the hand because the
       * host put it there at load rather than because anybody picked it up -
       * the same distinction `unhand` makes a few cases down - so a level where
       * everybody has a gun is not a level where nobody can swing.
       */
      for (const [child, link] of world.parent) {
        if (link.id !== id) continue
        if (world.name.get(child) === WEAPON_NAME) continue
        return []
      }

      // Nothing to write, for `stun` and `dash`'s reason: what is in front of
      // this body is a question about a room full of people, and this world
      // holds neither the room nor the people.
      return [{ kind: 'swung', id, reach: verb.reach ?? DEFAULT_REACH }]
    }

    case 'material': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      // Deleted rather than written, because absence *is* `own` - see the
      // component's own note. Two ways to say the same thing would be a row the
      // renderer has to ask two questions about.
      if (verb.material === 'own') world.material.delete(id)
      else world.material.set(id, verb.material)
      // Nothing to report: unlike `dash` and `stun` this is a fact about the
      // world, and the renderer reads the world.
      return []
    }

    case 'drop': {
      const id = pick(context, verb.target)
      if (id === null || !world.parent.has(id)) return []

      /**
       * Where it is *now*, worked out before the link is cut.
       *
       * Its stored position is relative to whoever is carrying it, so clearing
       * the parent first would leave a thing that had been in somebody's hand
       * sitting at the origin of the level. The composed transform is the only
       * moment both halves are known.
       */
      const placed = worldTransform(world, id, blueprints)
      world.parent.delete(id)
      world.position.set(id, { x: placed.x, y: placed.y, z: placed.z })
      detach(world, id, placed)
      return []
    }

    case 'pass':
      // Nothing here, for the reason `meet` has nothing: the order is the
      // arbiter's and a host with none has no turn to hand on.
      return [{ kind: 'pass' }]

    case 'raid':
      // And nothing here either, including who: see the op above. A host with
      // no arbiter has nobody's world to take from.
      return [{ kind: 'raid' }]

    case 'meet':
      /**
       * Nothing here either. The room, the deadline and who may call one are all
       * the arbiter's, and a host with none has no meeting to hold.
       */
      return [{ kind: 'meet', ...(verb.seconds === undefined ? {} : { seconds: verb.seconds }) }]

    case 'advance': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []

      /**
       * No dice, no move.
       *
       * A host with no data has no roll to read, and a roll that has not landed
       * yet is a field holding what it held before. Both come out here as "the
       * piece stays where it is", which is the same answer as an impossible move
       * and needs no separate story.
       */
      const steps = context.data?.get(verb.by) ?? 0
      if (!Number.isFinite(steps) || steps <= 0) return []

      const props = world.props.get(id)
      if (!props) return []

      const at = props[verb.along] ?? 0
      const next = at + Math.floor(steps)

      // The end of the track is a wall, not a limit to clamp to. See the note on
      // the verb: the exact roll is the rule.
      const mark = context.marks ? markByName(context.marks, `${verb.along}-${next}`) : null
      if (!mark) return []

      props[verb.along] = next

      /**
       * Whatever was already standing there is told it was landed on.
       *
       * -----------------------------------------------------------------------
       * Why the *move* marks them, rather than a rule working out who moved
       * -----------------------------------------------------------------------
       * "Two pieces on one field, and the one already standing goes back" is a
       * rule about which of two entities *just arrived*, and a `collide` cannot
       * pose it: both pieces see the other, both conditions read the same, and
       * both fire - so both go home. The natural fix is a flag on the mover,
       * and it does not work either, because nothing can clear the last mover's
       * flag: `VerbTarget` is `self`, `other` and `world`, so there is no way to
       * say "and clear this on every piece".
       *
       * Inverting it removes the clearing problem entirely. The verb sets the
       * mark on the **occupant** and clears it on the **mover**, so both writes
       * are made by the thing that knows which is which, and a piece carries the
       * mark only between being landed on and its own next move. No rule has to
       * remember to tidy up, because moving is the tidying up.
       *
       * A property name rather than a boolean flag on the verb, so the level
       * chooses the word and reads it with the condition vocabulary it already
       * has - the same reason `Trigger.by` names a property rather than
       * introducing a `groups` list.
       */
      if (verb.bump !== undefined) {
        props[verb.bump] = 0
        for (const other of world.alive) {
          if (other === id) continue
          const there = world.position.get(other)
          // Same field, not merely nearby: `advance` lands things exactly on a
          // mark, so this is an equality test with room for the float rather
          // than a proximity one. A radius here would send home a piece on the
          // next square along.
          if (!there || Math.abs(there.x - mark.x) > 0.01 || Math.abs(there.z - mark.z) > 0.01) {
            continue
          }
          const theirs = world.props.get(other)
          if (theirs) theirs[verb.bump] = 1
        }
      }

      world.parent.delete(id)
      world.position.set(id, { x: mark.x, y: mark.y, z: mark.z })
      world.rotation.set(id, mark.facing)

      /**
       * The track and the square, carried with the position.
       *
       * A `teleport` effect says where something ended up, which is everything
       * a *local* renderer needs and not enough for another client: a piece is
       * where it is *and* remembers which field it is on, and a peer given only
       * coordinates has a piece standing in the right place with the wrong idea
       * of where it is. The next roll would then move it from the wrong square.
       *
       * Only `advance` fills these in. A `teleport` verb has no track.
       */
      return [
        {
          kind: 'teleport',
          id,
          x: mark.x,
          y: mark.y,
          z: mark.z,
          facing: mark.facing,
          along: verb.along,
          to: next,
        },
      ]
    }

    case 'teleport': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []

      const to = entityByName(world, verb.to)

      /**
       * A mark, when no entity answers to the name.
       *
       * Entities first, so nothing about an existing document changes. Marks
       * second, and they cannot collide with an entity name because the parser
       * refuses that outright - so the order is compatibility rather than
       * precedence.
       *
       * This is the half that was missing: `spawn`, `start` and `finish` had no
       * `name` and nothing could address one, so "send them back to the start"
       * meant standing an empty node on the spawn and naming *that* - two
       * things to keep in one place, which is one thing to get wrong.
       */
      if (to === null) {
        const mark = context.marks ? markByName(context.marks, verb.to) : null
        if (!mark) return []

        world.parent.delete(id)
        world.position.set(id, { x: mark.x, y: mark.y, z: mark.z })
        world.rotation.set(id, mark.facing)

        return [{ kind: 'teleport', id, x: mark.x, y: mark.y, z: mark.z, facing: mark.facing }]
      }

      // Nothing to say where "there" is. A destination that was despawned or
      // deactivated is not a destination, and sending somebody to the origin of
      // the level instead is the kind of helpfulness that reads as a bug.
      if (to === id) return []

      const placed = worldTransform(world, to, blueprints)

      /**
       * Whatever was holding it lets go.
       *
       * A carried thing's position is an offset from its carrier, so writing a
       * world position into it without cutting the link would put it that far
       * from the person still holding it - the same trap `drop` documents from
       * the other side. Being sent somewhere and being held are incompatible
       * claims about where a thing is, and the teleport is the newer one.
       */
      world.parent.delete(id)
      world.position.set(id, { x: placed.x, y: placed.y, z: placed.z })
      world.rotation.set(id, placed.rotation)

      return [{ kind: 'teleport', id, x: placed.x, y: placed.y, z: placed.z, facing: placed.rotation }]
    }

    case 'checkpoint': {
      const id = pick(context, verb.target)
      if (id === null || !world.alive.has(id)) return []
      // The pad supplies the place and the number, so a pad that has been
      // despawned or deactivated is not a save point to take.
      if (!world.alive.has(context.self)) return []

      const order = world.props.get(context.self)?.order ?? 0
      const reached = world.props.get(id)?.checkpoint ?? 0
      // Strictly higher: re-crossing an earlier pad on a loop must not undo
      // progress, and re-crossing the *same* one must not re-announce it.
      if (order <= reached) return []

      const props = world.props.get(id)
      if (props) props.checkpoint = order
      else world.props.set(id, { checkpoint: order })

      const placed = worldTransform(world, context.self, blueprints)
      return [
        {
          kind: 'checkpoint',
          id,
          x: placed.x,
          y: placed.y,
          z: placed.z,
          facing: placed.rotation,
          order,
        },
      ]
    }

    case 'load':
      /**
       * Nothing happens to the world, on purpose.
       *
       * Every other verb changes something here and returns what only the host
       * can do. This one has nothing to change: the world it would write to is
       * the one about to be discarded, and half-applying a level swap - moving
       * something a frame before the scene is thrown away - is a change nobody
       * can observe and everybody has to reason about.
       *
       * Checked again rather than trusted, even though `readVerb` refuses a bad
       * id: `applyVerbs` is called by scripts too, and a script builds verbs at
       * runtime out of whatever it likes.
       *
       * A scene name is held to the same alphabet, and the reason is narrower
       * than the id's: it does not reach a path, so nothing here can walk out of
       * a directory - but it *is* the second half of a Realtime topic, and a
       * topic is a string every client has to agree on and the policy has to
       * match. A room called `../x` is a subscription nobody else computes.
       */
      if ('scene' in verb) return isXpId(verb.scene) ? [{ kind: 'load', scene: verb.scene }] : []
      return isXpId(verb.xp) ? [{ kind: 'load', xp: verb.xp }] : []

    case 'spawn': {
      const blueprint = blueprints[verb.blueprint]
      const at = world.position.get(context.self)
      if (!blueprint || !at) return []

      const id = nextRuntimeId(world)
      const position = { x: at.x + verb.dx, y: at.y + verb.dy, z: at.z + verb.dz }
      const rotation = world.rotation.get(context.self) ?? 0

      world.alive.add(id)
      world.blueprint.set(id, verb.blueprint)
      world.position.set(id, position)
      world.rotation.set(id, rotation)
      world.scale.set(id, 1)
      world.props.set(id, { ...blueprint.props })
      const box = entityBox(blueprint, position, rotation, 1)
      if (box) world.box.set(id, box)

      return [{ kind: 'spawned', id, blueprint: verb.blueprint }]
    }

    case 'score':
      return [{ kind: 'score', amount: verb.amount, by: context.other }]

    case 'emit':
      return [{ kind: 'emit', event: verb.event, from: context.self }]

    case 'sound':
      /**
       * Checked again rather than trusted, exactly as `load` is and for the
       * same reason: `readVerb` refuses an unknown name, but `applyVerbs` is
       * called by scripts too, and a script builds verbs at runtime out of
       * whatever it likes. This name reaches a path.
       */
      return isSound(verb.sound) ? [{ kind: 'sound', sound: verb.sound }] : []

    case 'movie':
      /**
       * Not checked against the document's `sequences`, and that is deliberate.
       *
       * `applyVerbs` has a **world**, not a document - which is the whole reason
       * it can be tested without one and run against a host that assembled its
       * world some other way. `readVerb` is where a name is checked against the
       * cuts a file declares, and the host is what refuses one it cannot find.
       * A check here would need a document threaded through every call site to
       * repeat something already done.
       */
      return [{ kind: 'movie', sequence: verb.sequence }]
  }
}

/** The next free runtime id, above everything the document authored. */
function nextRuntimeId(world: EntityWorld): EntityId {
  let id = RUNTIME_ID_BASE
  // A scan rather than a counter on the world, because the world is a plain
  // struct a host may build itself - a counter that lives outside it is a
  // counter that can be out of step with it.
  for (const existing of world.blueprint.keys()) {
    if (existing >= id) id = existing + 1
  }
  return id
}

/** Run a list in order, collecting what the host has to do. */
export function applyVerbs(
  world: EntityWorld,
  blueprints: Readonly<Record<string, Blueprint>>,
  verbs: readonly Verb[],
  context: VerbContext,
): Effect[] {
  const effects: Effect[] = []
  for (const verb of verbs) {
    effects.push(...applyVerb(world, blueprints, verb, context))
  }
  return effects
}
