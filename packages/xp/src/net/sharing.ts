/**
 * What one client tells the room about the world, and what it does with what
 * it is told.
 *
 * ---------------------------------------------------------------------------
 * The hole this closes
 * ---------------------------------------------------------------------------
 * The socket carried where somebody is and which way they face, and nothing
 * else — and `stepTriggers` is handed exactly one prober, the local player. So
 * a peer's body never tripped anything on your machine: they took the flag and
 * it stayed on the floor in front of you, they emptied a pickup and it stayed
 * lit, they opened a gate and it stayed shut.
 *
 * ./together used to say a crate that broke was "a rule firing on everybody's
 * machine". That is true of a rule with a shared cause — a timer, `finished`, a
 * spawn — and false of every rule caused by a player's own body, which is most
 * of a game.
 *
 * ---------------------------------------------------------------------------
 * Who is allowed to say what, and why this needs no election
 * ---------------------------------------------------------------------------
 * docs/xp/creator.md §9 fixes three tiers: `self`, `elected` and `server`. This
 * is squarely **`self`** — the tier that already says you are authoritative over
 * your own position and your own health. What you are carrying is a fact about
 * your own body, in exactly that class, and so is "I turned that off", because
 * the only way you turned it off was by walking into it.
 *
 * So there is no owner to elect and no conflict to resolve: the last client to
 * touch a thing is the one describing it, and two clients describing the same
 * change describe the *same* change. Anything two players must genuinely
 * *disagree* about — who scored, who won — is the `server` tier and stays where
 * it is, with the arbiter.
 *
 * ---------------------------------------------------------------------------
 * The whole picture, not a delta
 * ---------------------------------------------------------------------------
 * A delta is smaller and buys three bugs: a packet lost on a transport that
 * promises nothing leaves the two worlds different forever, a newcomer needs a
 * separate catch-up message, and two deltas that cross need an order to be
 * applied in. Sending the *state* makes every packet idempotent and
 * order-independent — the last one to arrive is right, whenever it arrives, and
 * a newcomer is caught up by the next one rather than by a second mechanism.
 *
 * It is affordable because it is sent **on change** rather than on a clock: a
 * level where nothing is switched off and nobody is carrying anything sends
 * nothing at all, forever. What it costs is a level that deactivates two
 * hundred things, which sends two hundred integers each time one more goes —
 * and that is the level to reach for a delta for, if it ever exists.
 */

import type { Blueprint } from '../document/blueprints'
import type { EntityId, EntityWorld } from '../world/entities'

/**
 * Everything one client claims about the world, as a picture rather than a
 * change.
 *
 * Deliberately tiny and deliberately only the two facts a *body* causes.
 * Position is already on the wire eight times a second and health is the
 * arbiter's; anything else a rule can do — a property, a score, a spawn — is
 * either derivable, or somebody else's tier, or not yet worth the bytes. Adding
 * a third fact here is a decision about authority, not a field.
 */
export interface WorldShare {
  /**
   * Entities that are not alive on the sender's machine.
   *
   * One list for `deactivate` and `despawn` together, because the difference is
   * about *coming back* and coming back is a fact the owner will send again
   * when it happens. A receiver only ever needs to know what to stop drawing.
   */
  off: EntityId[]
  /**
   * Entities the sender is carrying.
   *
   * Ids only. Where they are drawn is the receiver's business, because the
   * receiver already knows where the sender is — it has been told eight times a
   * second — and sending a carried thing's position would be sending the same
   * number twice and inviting the two to disagree.
   */
  hold: EntityId[]
  /**
   * What has been hurt, and how much it has left.
   *
   * Reported because damage is otherwise **invisible to everybody but the
   * person doing it**: a crate is hit on one machine, its `hp` goes down there,
   * and every other screen shows an untouched box until it vanishes. Which is
   * the bug this list is for — you cannot tell whether you are hitting
   * something, and neither can anybody watching.
   *
   * Only what is *below* full, so a level of untouched scenery sends nothing.
   * That is also why it is a list of pairs rather than a map of everything: the
   * common case is empty, and the interesting case is small.
   *
   * The number and not a fraction, because the receiver has the blueprint and
   * therefore the ceiling — and a fraction would round differently on two
   * machines showing the same crate.
   */
  /**
   * Optional, for the reason `from` on `applyShare` is: every caller and every
   * test written before damage crossed the wire keeps working unchanged, and a
   * picture with no `hurt` in it is a picture of a level where nothing is.
   */
  hurt?: { id: EntityId; hp: number }[]
  /**
   * What each body has been told to play, so everybody sees the same wave.
   *
   * Reported for the reason `hurt` is, and it is worth being precise about
   * which half of the feature needs it, because the obvious answer is wrong.
   *
   * A **script** does not need this. Scripts are deterministic and run on every
   * client, so `runAnimation` in an `onTick` already happens on every machine
   * without a packet.
   *
   * A **rule** does. `stepTriggers` is handed exactly one prober - the local
   * player - so an `enter` fires only on the machine of the person who walked
   * in. An `animate` verb on that rule is the same hole ./sharing was written
   * for in the first place: they walk onto the pad, the guard salutes on their
   * screen, and stands still on everybody else's.
   *
   * `at` goes with it, and it is the field that makes the packet work at all:
   * the same clip asked for twice is two events, and a receiver comparing only
   * names would play the first wave and ignore every one after it. It is the
   * sender's tick, which is meaningless as a *time* on the receiver and perfect
   * as an identity - all anybody does with it is notice that it changed. What a
   * receiver must **not** do with it is take it at face value on a clip it is
   * already playing; see `applyShare`, where two clients counting their own
   * frames would otherwise restart each other's animations at the packet rate.
   *
   * Optional, like `hurt`, so every caller and every test written before this
   * is unchanged and a level with nothing animating sends nothing.
   */
  clip?: { id: EntityId; name: string; loop: boolean; at: number; parts?: readonly string[] }[]
  /**
   * And which of its own **motions** each thing is running, and since when.
   *
   * The same hole as `clip` and a different one, because the two numbers next to
   * a name are doing opposite jobs.
   *
   * `clip.at` is an *identity* - the sender's tick, meaningless as a time on the
   * receiver, and all anybody does with it is notice that it changed. Which is
   * why the receiver has to be careful with it: two clients counting their own
   * frames would otherwise restart each other's animations at the packet rate.
   *
   * `motion.since` is a *time*, on a clock both machines are running from their
   * own first frame - and that is what makes it easier rather than harder.
   * Where a door is now is `poseAt(motion, now - since)`, a pure function, so
   * two people watching one door agree because they are evaluating the same
   * expression rather than exchanging positions. Nothing about where the door is
   * travels; only when it started.
   *
   * The clocks are not identical - they start when each client loads - so the
   * receiver keeps its **own** `since` for a motion already running under the
   * same name, exactly as `clip` keeps its own `at`. What survives is the
   * distinction that matters: a *different* motion, or one arriving at something
   * that had none, is a new event.
   *
   * Optional, like `hurt` and `clip`, so a level with nothing moving sends
   * nothing and every caller written before this is unchanged.
   */
  motion?: { id: EntityId; name: string; since: number }[]
}

/** Nothing off and nothing held, which is most levels most of the time. */
export function nothingShared(): WorldShare {
  return { off: [], hold: [], hurt: [], clip: [], motion: [] }
}

/**
 * What this client would tell the room, right now.
 *
 * Sorted, because the *only* question asked of two of these is whether they are
 * the same — an unsorted pair that differ by iteration order would send a
 * packet a second every time a Map rehashed.
 */
export function shareOf(
  world: EntityWorld,
  me: EntityId,
  /**
   * The blueprints, for the ceiling a hurt thing is measured against.
   *
   * Optional and last so every caller that predates `hurt` is unchanged — and a
   * caller with none simply reports nothing hurt, which is the same picture a
   * level with no damage in it sends.
   */
  blueprints: Readonly<Record<string, Blueprint>> = {},
): WorldShare {
  const off: EntityId[] = []
  for (const id of world.blueprint.keys()) {
    // `blueprint` rather than `alive`: `alive` is what we are reporting on, and
    // an entity that has been despawned is out of it. The blueprint map is the
    // set of ids that have ever existed, which is the set to ask about.
    if (!world.alive.has(id)) off.push(id)
  }

  const hold: EntityId[] = []
  for (const [child, link] of world.parent) {
    if (link.id === me) hold.push(child)
  }

  /**
   * Anything below the health its blueprint starts it at.
   *
   * The blueprint's own `props.hp` is the ceiling — it is what `spawnEntities`
   * copied in, so a thing at full health is a thing whose number still matches
   * it. No separate maximum to store and keep in step.
   */
  const hurt: { id: EntityId; hp: number }[] = []
  for (const [id, props] of world.props) {
    if (!world.alive.has(id)) continue
    /**
     * Never our own body, and this was a bug with teeth.
     *
     * `PLAYER_ID` is a **constant**: every client's own body is entity 9000000,
     * so "entity 9000000 has 75 health" is a sentence about a different body on
     * every machine that reads it. A player who had been shot broadcast their
     * own number under that id and every peer wrote it onto *themselves* - two
     * people fighting dragged each other's health down without a shot being
     * fired at either.
     *
     * And the second-order failure is the one that was actually reported.
     * ./_runtime/simulation.tsx applies the arbiter's readback only when it is
     * *lower* than the local number, so once a peer's picture had pulled the
     * local `hp` down to what the arbiter was about to say, `damage()` stopped
     * being called - and with it every `damaged` rule in the document. In
     * capture the flag that is the whole mode: hit the carrier and they kept
     * the flag, because nothing on their machine believed they had been hit.
     *
     * A body's health is the arbiter's answer (`xp_arbiter_view`), which every
     * client asks for itself. There is nothing here for a peer to add, and the
     * only thing they could do with the id is overwrite a body that is not
     * theirs. `hold` below is the deliberate opposite: it is about the sender's
     * *children*, whose ids are the level's and mean the same thing everywhere.
     */
    if (id === me) continue
    const hp = props.hp
    if (hp === undefined) continue
    const full = blueprints[world.blueprint.get(id) ?? '']?.props?.hp
    if (full === undefined || hp >= full) continue
    hurt.push({ id, hp })
  }

  /**
   * Every body currently playing something, sorted like everything else here.
   *
   * The whole map rather than a diff, because it is *already* the diff: an
   * entry only exists while a clip has been asked for and not cleared, so the
   * common case is empty and the interesting case is one or two rows.
   */
  const clip: NonNullable<WorldShare['clip']>[number][] = []
  for (const [id, playing] of world.clip) {
    if (!world.alive.has(id)) continue
    clip.push({ id, name: playing.name, loop: playing.loop, at: playing.at, ...(playing.parts ? { parts: playing.parts } : {}) })
  }

  /**
   * And every thing running one of its own motions.
   *
   * The whole map rather than a diff, for `clip`'s reason: an entry only exists
   * while a motion is running, so the common case is empty.
   */
  const motion: NonNullable<WorldShare['motion']>[number][] = []
  for (const [id, running] of world.motion) {
    if (!world.alive.has(id)) continue
    motion.push({ id, name: running.name, since: running.since })
  }

  return {
    off: off.sort(compare),
    hold: hold.sort(compare),
    hurt: hurt.sort((a, b) => a.id - b.id),
    clip: clip.sort((a, b) => a.id - b.id),
    motion: motion.sort((a, b) => a.id - b.id),
  }
}

const compare = (a: number, b: number) => a - b

/** Is this the same picture as last time, so nothing needs saying? */
export function sameShare(a: WorldShare, b: WorldShare): boolean {
  return (
    same(a.off, b.off) &&
    same(a.hold, b.hold) &&
    // Compared by value rather than by length: a crate going from 40 to 20 is
    // the same two ids and is exactly the change worth sending.
    (a.hurt?.length ?? 0) === (b.hurt?.length ?? 0) &&
    (a.hurt ?? []).every((one, at) => one.id === b.hurt?.[at]?.id && one.hp === b.hurt[at]?.hp) &&
    // `at` is in the comparison and has to be: the same clip asked for twice is
    // two waves, and a picture that looked unchanged would send the first and
    // swallow the rest.
    (a.clip?.length ?? 0) === (b.clip?.length ?? 0) &&
    (a.clip ?? []).every(
      (one, at) =>
        one.id === b.clip?.[at]?.id &&
        one.name === b.clip[at]?.name &&
        one.at === b.clip[at]?.at &&
        one.loop === b.clip[at]?.loop,
    ) &&
    /**
     * `since` is deliberately *not* in this comparison, and `at` above is.
     *
     * A clip's `at` is an identity, so two different values are two events and a
     * picture that looked unchanged would swallow the second. A motion's `since`
     * is a time on the sender's own clock, and comparing it would make every
     * packet different from the last for as long as anything was running -
     * a broadcast a frame, forever, describing a door that has not changed its
     * mind. What is worth sending is *which* motion is running on what, and
     * `applyShare` keeps its own `since` for one it is already running.
     */
    (a.motion?.length ?? 0) === (b.motion?.length ?? 0) &&
    (a.motion ?? []).every(
      (one, at) => one.id === b.motion?.[at]?.id && one.name === b.motion[at]?.name,
    )
  )
}

function same(a: readonly EntityId[], b: readonly EntityId[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * A packet off the wire, or null.
 *
 * Everything here is a message from another machine, which makes it input — the
 * same rule the position packet follows. An id is checked for being a whole
 * number rather than against the world, deliberately: a peer running a document
 * we do not have is a peer naming ids we have never heard of, and the honest
 * response is to accept the packet and let the *application* ignore ids it does
 * not know rather than to refuse the whole thing.
 */
export function readShare(payload: unknown): WorldShare | null {
  if (typeof payload !== 'object' || payload === null) return null
  const raw = payload as { off?: unknown; hold?: unknown; hurt?: unknown; clip?: unknown; motion?: unknown }

  const off = ids(raw.off)
  const hold = ids(raw.hold)
  if (off === null || hold === null) return null

  /**
   * And the two lists that were being sent and thrown away here.
   *
   * `hurt` has been in `shareOf` since damage first crossed the wire, is
   * compared by `sameShare`, and is applied by `applyShare` - and this function,
   * which is the *only* gate between the socket and all three, returned an
   * object without it. So the sender built the packet, the transport carried it,
   * and the receiver dropped the one field the feature is made of: a crate hit
   * on one machine still showed untouched on every other, which is exactly the
   * bug that work was written to fix.
   *
   * Worth being precise about why it survived review: every test for the
   * feature calls `applyShare` directly with a hand-built picture, so all of
   * them passed. The gap was between two things that were each tested.
   */
  const hurt = hurts(raw.hurt)
  const clip = clips(raw.clip)
  const motion = motions(raw.motion)
  if (hurt === null || clip === null || motion === null) return null

  return { off, hold, hurt, clip, motion }
}

/** How long a clip name off the wire may be. Longer is not a name. */
const MAX_NAME = 64
/** And how many parts one may aim at. The rig has fewer bones than this. */
const MAX_PARTS = 32

function hurts(value: unknown): NonNullable<WorldShare['hurt']> | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_SHARED) return null

  const out: NonNullable<WorldShare['hurt']> = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { id, hp } = entry as { id?: unknown; hp?: unknown }
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return null
    // Finite rather than merely a number: `NaN` written into `hp` would put
    // every later comparison about that entity beyond arithmetic, and it costs
    // one machine sending one bad packet to do it to everybody.
    if (typeof hp !== 'number' || !Number.isFinite(hp)) return null
    out.push({ id, hp })
  }
  return out
}

function clips(value: unknown): NonNullable<WorldShare['clip']> | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_SHARED) return null

  const out: NonNullable<WorldShare['clip']> = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { id, name, loop, at, parts } = entry as {
      id?: unknown
      name?: unknown
      loop?: unknown
      at?: unknown
      parts?: unknown
    }
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return null
    if (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME) return null
    if (typeof loop !== 'boolean') return null
    if (typeof at !== 'number' || !Number.isFinite(at)) return null

    if (parts === undefined) {
      out.push({ id, name, loop, at })
      continue
    }
    if (!Array.isArray(parts) || parts.length > MAX_PARTS) return null
    for (const part of parts) {
      if (typeof part !== 'string' || part.length === 0 || part.length > MAX_NAME) return null
    }
    out.push({ id, name, loop, at, parts: parts as string[] })
  }
  return out
}

function motions(value: unknown): NonNullable<WorldShare['motion']> | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_SHARED) return null

  const out: NonNullable<WorldShare['motion']> = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { id, name, since } = entry as { id?: unknown; name?: unknown; since?: unknown }
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return null
    if (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME) return null
    // Finite, for `hurts`'s reason: a `NaN` here would be subtracted from the
    // clock on every frame, and `poseAt` of `NaN` seconds is a door drawn
    // nowhere - one machine sending one bad packet doing it to everybody.
    if (typeof since !== 'number' || !Number.isFinite(since)) return null
    out.push({ id, name, since })
  }
  return out
}

/** How many ids one packet may carry. A level with more has other problems. */
const MAX_SHARED = 512

function ids(value: unknown): EntityId[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_SHARED) return null

  const out: EntityId[] = []
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0) return null
    out.push(entry)
  }
  return out
}

/**
 * Apply what a peer says about the world.
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does not touch
 * ---------------------------------------------------------------------------
 * **Anything the local player is carrying.** Two people cannot hold one crate,
 * and if they disagree the one holding it locally wins — because that client is
 * the authority on its own hands, which is the whole tier. Without this a peer
 * whose packet crossed with your pickup would take the thing out of your hands
 * on your own screen.
 *
 * ---------------------------------------------------------------------------
 * Applied literally, which is what makes it converge
 * ---------------------------------------------------------------------------
 * Everything in `off` goes off and everything else that exists comes back on.
 * The tempting alternative — only ever turn things *off*, and leave coming back
 * to the local timer — was the first draft and is wrong in the case the feature
 * exists for: a pickup a *peer* emptied is one this client never set a timer
 * for, so it would stay dark forever.
 *
 * Applying the picture literally means the last packet to arrive is right, and
 * both machines run the same `stepReturns` anyway, so they agree without being
 * told. The one visible cost is a peer joining mid-timer: their picture has the
 * pickup lit, this client relights it, and its own timer puts it back a moment
 * later. A flicker, self-correcting, and cheaper than a second mechanism.
 *
 * Returns the ids that are now being carried by this peer, because *where* to
 * draw them is a question only the host can answer: it has the peer's
 * interpolated position and this module has no idea what a metre is.
 */
export function applyShare(
  world: EntityWorld,
  share: WorldShare,
  /** The local player, whose own hands are not up for discussion. */
  me: EntityId,
  /**
   * Who sent it, so the fact can be *kept* rather than only acted on.
   *
   * Written into `world.heldBy`, which is what makes "am I held" read the same
   * on every screen: a rule or a script asking about a flag in somebody's hands
   * gets the same answer whether it is running on the machine of the person
   * holding it or on anybody else's. Without it the state crossed the wire as a
   * *drawing* and not as a fact, and only the carrier's own client could react
   * to it.
   *
   * Optional so the tests written before it - and any caller that only wants
   * the drawing - keep working unchanged.
   */
  from?: string,
): EntityId[] {
  const mine = new Set<EntityId>()
  for (const [child, link] of world.parent) {
    if (link.id === me) mine.add(child)
  }

  /**
   * Nothing a peer says about `me` is about the body on this screen.
   *
   * The one id in this world that does not mean the same thing on two machines:
   * `PLAYER_ID` is a constant, so every client's own body wears it, and a packet
   * that names it is naming the *sender's* body. Every list below is keyed by id
   * and is therefore guarded - `off` would make this player vanish, `hurt` would
   * hand them somebody else's health, `clip` and `motion` would animate them.
   *
   * `hold` is the exception and the reason the guard is per-list rather than at
   * the top: it names the sender's **children**, which are level entities with
   * level ids, and carrying them across is the entire point of it.
   *
   * See `shareOf`, which no longer sends its own body's health at all. Both ends,
   * because the failure was silent: the number arrived, it was plausible, and the
   * `damaged` rules it stopped were three files away.
   */

  const off = new Set(share.off)
  for (const id of world.blueprint.keys()) {
    // `blueprint.keys()` rather than the packet, so an id we have never heard
    // of is skipped rather than invented: a peer on a different document is a
    // peer talking about a world that is not this one.
    if (id === me) continue
    if (off.has(id)) {
      world.alive.delete(id)
    } else if (!world.alive.has(id)) {
      world.alive.add(id)
      // The timer goes with it. Leaving a stale `returns` row behind would have
      // `stepReturns` announce a return for something already back.
      world.returns.delete(id)
    }
  }

  const held: EntityId[] = []
  for (const id of share.hold) {
    if (mine.has(id)) continue
    if (!world.blueprint.has(id)) continue
    /**
     * Unparented rather than parented to the peer, because a peer is not an
     * entity in this world — it is an interpolated sample the crowd buffer
     * holds. The host puts it where the peer is; what matters here is that it
     * stops hanging off whatever it was hanging off.
     */
    world.parent.delete(id)
    if (from !== undefined) world.heldBy.set(id, from)
    held.push(id)
  }

  /**
   * And anything this peer *stopped* carrying stops being held.
   *
   * The picture is the whole of what they claim, so a thing of theirs that is
   * not in it is a thing they put down - which has to clear here or a flag
   * dropped on their screen stays "held" on everybody else's forever, and the
   * `dropped` trigger never fires.
   */
  if (from !== undefined) {
    const claimed = new Set(share.hold)
    for (const [id, holder] of world.heldBy) {
      if (holder === from && !claimed.has(id)) world.heldBy.delete(id)
    }
  }

  /**
   * And what they say is hurt, so damage is visible on every screen.
   *
   * Written straight in rather than taken as the lower of the two: the sender is
   * the one shooting, so their number is the newer one — and "keep whichever is
   * smaller" would leave a crate that somebody repaired stuck at the health it
   * had when it was broken.
   *
   * Only entities we know, like everything else here. And only ones that
   * already carry an `hp`: a peer claiming health for a thing whose blueprint
   * has none is a peer running a different document, and inventing the property
   * would make a rule about `hp` start firing on scenery.
   */
  for (const { id, hp } of share.hurt ?? []) {
    if (id === me) continue
    if (!world.blueprint.has(id) || !Number.isFinite(hp)) continue
    const props = world.props.get(id)
    if (!props || props.hp === undefined) continue
    props.hp = hp
  }

  /**
   * And what they say each body is playing, so a wave happens on every screen.
   *
   * Taken as told, like `hurt` and for the same reason: a script runs against
   * one machine's copy of the world, and the machine that ran it is the one
   * that knows. A receiver comparing and keeping "whichever is newer" would be
   * inventing an ordering out of two clocks that have never been compared -
   * `at` is the *sender's* tick, which is an identity here and not a time.
   *
   * A row that is missing from the picture is a body that has stopped: the map
   * is only ever populated while something is playing, so an entry going away
   * is exactly how a script says "stop". Cleared only for entities the sender
   * actually knows about, so a peer running a different document cannot silence
   * something it has never heard of.
   */
  if (share.clip) {
    const told = new Set(share.clip.map((one) => one.id))
    for (const id of world.clip.keys()) {
      if (id !== me && !told.has(id)) world.clip.delete(id)
    }
    for (const { id, name, loop, at, parts } of share.clip) {
      if (id === me || !world.blueprint.has(id)) continue
      /**
       * The same clip arriving again is not a second wave.
       *
       * `at` is the *sender's* tick, and two clients counting their own frames
       * are never on the same one. A script is deterministic, so both machines
       * run `runAnimation` for the same entity - and each then broadcasts the
       * request stamped with its own count. Written in as-is, that makes `at`
       * change on every packet, and the renderer restarts a clip whenever `at`
       * changes: an animation that stutters eight times a second in any room
       * with two people in it, and plays perfectly alone.
       *
       * So a row describing the clip that is already playing keeps the `at` it
       * is already playing at. What survives is the distinction that matters -
       * a *different* clip is a new event, and so is one arriving at an entity
       * that had nothing - and what is given up is a peer re-firing the same
       * clip restarting it on this screen. That is the smaller loss by a long
       * way, and it only applies across the wire: the machine whose own rule
       * fired bumps its own tick and restarts locally, which is where somebody
       * is looking when they do it.
       */
      const playing = world.clip.get(id)
      const same =
        playing !== undefined &&
        playing.name === name &&
        playing.loop === loop &&
        (playing.parts ?? []).join(',') === (parts ?? []).join(',')
      world.clip.set(id, {
        name,
        loop,
        at: same ? playing.at : at,
        ...(parts ? { parts } : {}),
      })
    }
  }

  /**
   * And which of its own motions each thing is running.
   *
   * A row missing from the picture is a motion that has stopped - `rest`, or a
   * despawn - for the same reason a missing `clip` row is: the map is only ever
   * populated while something is running.
   *
   * The receiver keeps its **own** `since` for a motion already running under
   * the same name. Two clients' clocks start when each of them loaded, so the
   * sender's second is not this machine's second, and writing it in would jump
   * a half-open door to wherever the arithmetic landed - on every packet. What
   * a peer is authoritative about is *which* motion is running; when it started
   * on this screen is this screen's business, and both agree on the shape
   * because both are evaluating `poseAt` rather than exchanging angles.
   */
  if (share.motion) {
    const told = new Set(share.motion.map((one) => one.id))
    for (const id of world.motion.keys()) {
      if (id !== me && !told.has(id)) world.motion.delete(id)
    }
    for (const { id, name, since } of share.motion) {
      if (id === me || !world.blueprint.has(id)) continue
      const running = world.motion.get(id)
      world.motion.set(id, {
        name,
        since: running?.name === name ? running.since : Math.min(since, world.seconds),
      })
    }
  }

  return held
}
