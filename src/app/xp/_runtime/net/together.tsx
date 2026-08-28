'use client'

import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { floorOffset } from '@kxb/xp/catalogue'
import { modelUrl, splitModel, skeletonOf } from '@kxb/xp/packs'
import {
  Crowd,
  delayFor,
  PLAYER_ID,
  sampleAt,
  sendDue,
  type Said,
  type Vec3,
} from '@kxb/xp/engine'

/**
 * How many names one packet may carry.
 *
 * Every one is a fan-out over the entity world on arrival, so an unbounded
 * array is a peer able to spend this client's frame. A rule-caused emit is a
 * body doing something, and a body does not do sixteen things in one frame -
 * this is far above any honest packet and well below one that hurts.
 */
const MAX_HEARD = 16
import type { XpNetwork, XpPlayer, XpSocket } from '@kxb/xp/host'
import { Rings } from '@/app/xp/_runtime/hud/rings'
import { sideOf } from '@/app/xp/_runtime/match/teams'
import { SkinnedCrowd } from '@/app/xp/_runtime/body/skinned'
import { EmoteBubble } from '@/app/xp/_runtime/body/emote-bubble'
import {
  isEmote,
  noEmote,
  showEmote,
  type EmoteId,
  type EmoteState,
} from '@/app/xp/_runtime/body/emotes'
import type { Mark, RoleView, XpRules } from '@kxb/xp'
import type { XpClip } from '@kxb/xp/clips'
import { readShare, type WorldShare } from '@kxb/xp/sharing'
import {
  claiming,
  ownsBodies,
  heldAfter,
  heldBy,
  readBodies,
  readClaim,
  readShove,
  resolve,
  type Held,
  type BodyShare,
  type Shove,
} from '@kxb/xp/owning'
import { arrivals } from '@/app/xp/_hosts/room-scene'
import { sceneTopic } from '@/lib/xp-rooms'

/**
 * Other people, in the same level.
 *
 * Two halves that have nothing to do with each other and one reason to be in the
 * same file: sending where *we* are, and drawing where *they* are. They meet at
 * the socket and nowhere else.
 *
 * ---------------------------------------------------------------------------
 * What goes on the wire
 * ---------------------------------------------------------------------------
 * Four numbers and an id, eight times a second. Not sixty: room traffic grows
 * with the square of the room, so a twenty-person room at 8 Hz is already 3,200
 * messages a second leaving the server - and interpolation on the receiving side
 * makes eight samples look like sixty, which is the whole argument for the
 * buffer in `@kxb/xp/engine`.
 *
 * ---------------------------------------------------------------------------
 * And a picture of what each client's own actions made true
 * ---------------------------------------------------------------------------
 * This file used to say the rest of the world needed no wire, because "a crate
 * that broke is a rule firing on everybody's machine". **That was half right
 * and the wrong half was most of a game.** It holds for a rule with a shared
 * cause - a timer, `finished`, a spawn - and fails for every rule caused by a
 * player's *body*, because `stepTriggers` is handed exactly one prober: the
 * local player. A peer's body trips nothing here, so they took the flag and it
 * stayed on the floor in front of you, and they emptied a pickup and it stayed
 * lit.
 *
 * So `world` carries the two facts a body causes and nobody can derive: what is
 * switched off, and what the sender is carrying. A picture rather than a change,
 * sent only when it differs, and applied idempotently - `@kxb/xp/sharing` has
 * the argument. It is the `self` tier of docs/xp/creator.md §9, which already
 * says you are authoritative over your own body; what you are holding is a fact
 * of exactly that kind.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately not here yet
 * ---------------------------------------------------------------------------
 * Authority over anything two people must *disagree* about. Remote bodies are
 * still drawn rather than simulated, so nothing a peer does can score, damage or
 * decide - a shot at another player goes through the arbiter and not through
 * here. That is §4 and a milestone of its own; this is the layer under it, which
 * answers "can two people see the same room" rather than "who won".
 */

/** Where the local player is, read once a tick by the sender. */
export interface Local {
  readonly current: Vec3
}

export function Together({
  network,
  me,
  room,
  scene,
  at,
  heading,
  dancing,
  down,
  model,
  clips,
  scale,
  marks,
  rules,
  looks,
  side,
  onCount,
  onRoster,
  onCrowd,
  emote,
  share,
  signal,
  onSignalled,
  onShared,
  bodiesNow,
  wantsBodies: wantsBodiesProp,
  onShoves,
  onBodies,
  onOwns,
  onShove,
  party,
  onParty,
  hit,
  onHit,
}: {
  network: XpNetwork
  me: XpPlayer
  /**
   * The instance, without a scene on it.
   *
   * Composed with `scene` below rather than taken ready-made, so that the two
   * halves arrive separately and this file is the one place that decides what a
   * topic looks like for the traffic it sends. `../_hosts/room-link` is on the
   * *other* one - the room, which does not move - and the split between them is
   * argued there.
   */
  room: string
  /**
   * Which room of the level this client is standing in.
   *
   * The topic, and therefore who can see whom. Two people in different scenes
   * are on different topics, so nothing is filtered and nothing is sent: a shot
   * in the lobby cannot reach the back room because the packet was never
   * addressed to anybody there. See `sceneTopic` in `src/lib/xp-rooms.ts`.
   */
  scene: string
  /** The local body, as the controller last left it. */
  at: Local
  heading: { readonly current: number }
  /**
   * Whether the local body is dancing, read once per outgoing packet.
   *
   * A reference rather than a value, like `at` and `heading` beside it and for
   * their reason: it changes on a keystroke and this component must not re-render
   * for it. Optional because the flag lives in ./simulation, which is mounted
   * inside the Canvas - a host that has not handed it over sends what it always
   * sent.
   */
  dancing?: { readonly current: boolean }
  /** Whether the local body has gone down. Beside `dancing`, on its terms. */
  down?: { readonly current: boolean }
  /** What a person looks like here - the document's body, or the dummy. */
  model: string
  /**
   * The level's own clips, laid over the pack's.
   *
   * Handed to co-players for the same reason the local body gets them: a
   * document that ships its own walk should be walked with it by everybody in
   * the room, not just by the person reading this sentence.
   */
  clips?: Readonly<Record<string, XpClip>>
  scale: number
  /**
   * The document's marks, for the ring under each body.
   *
   * Passed down rather than read off a document this component does not have,
   * and it is the *marks* rather than the sides because `sideOf` is what knows
   * how a side is derived - handing it a precomputed list would put that rule in
   * two places. Nothing about a peer's side goes on the wire: every client has
   * every id from presence and works out the same answer, which is the whole
   * argument in ./teams.
   */
  marks: readonly Mark[]
  /**
   * And what the document says about sides, for the same rings.
   *
   * Beside the marks rather than folded into them because the two answer
   * different halves of `sideOf`: the marks are what sides exist, and this is
   * whether they are being used. Without it a level that declares a
   * free-for-all would draw red and blue rings under people who have no side.
   */
  rules?: Pick<XpRules, 'assign' | 'sides'>
  /**
   * The lights, and whose switch it was.
   *
   * A match with this on draws every co-player standing in their own colour -
   * see ./glow, which is the lounge's party glow owned over here. Absent is off,
   * which is every match until somebody says otherwise.
   *
   * Threaded rather than read from a store, unlike the lounge's: the lounge has
   * one scene and a rail beside it, and a level is mounted by four different
   * pages. Whoever mounts it is the one that knows whether a party is on.
   */
  party?: { on: boolean; host?: string }
  /**
   * The room saying the lights are on, and who threw the switch.
   *
   * The other half of `party`: that one is what this client *asks* for, and
   * this is what the room turns out to agree about. Two directions rather than
   * one value, for the reason the emote and the picture are two: what somebody
   * pressed and what everybody sees are different facts, and a single prop
   * would make a peer's message look like a local press and be echoed back out.
   */
  onParty?: (on: boolean, from: string) => void
  /**
   * How each player may be drawn, as the arbiter published it.
   *
   * Keyed by player, and it says a *look* rather than a role — see the `looks`
   * state in ../_runtime/simulation for why that distinction is the whole of
   * docs/xp/xp-flow.md §3. Absent, and empty, are the same thing and are what
   * every level that hides nobody hands down.
   *
   * It filters this component's list rather than the crowd's buffer, and that is
   * deliberate: samples keep arriving and keep being interpolated, so somebody
   * who becomes visible again appears where they *are* rather than where they
   * were when they vanished.
   */
  looks?: Readonly<Record<string, RoleView>>
  /**
   * Which side this client is on, for the one look that depends on the looker.
   *
   * Handed down rather than derived here, unlike a peer's: the local player's
   * side can be given by a host (`assign: 'host'`), and this component has no
   * access to that. Undefined in every level with no sides — where `team` and
   * `nobody` collapse to the same answer, correctly: if nobody has a side, a
   * body drawn only to your own side is drawn to nobody.
   */
  side?: string
  onCount?: (peers: number) => void
  /**
   * Everybody presence knows about, us included, with their names.
   *
   * Beside `onCount` rather than replacing it, because most of what reads this
   * wants only the number and a component re-rendering on a whole array where a
   * count would do is one that re-renders when somebody changes their skin. The
   * scoreboard is what wants the names - see ../_runtime/standings.
   */
  onRoster?: (roster: readonly XpPlayer[]) => void
  /**
   * The buffer of where everybody else is, handed upward once.
   *
   * The component that fires a shot is the parent, and what a shot has to be
   * tested against is *this* - the interpolated bodies, which are the ones on
   * screen. Passing the buffer up rather than lifting it out keeps the receiving
   * side whole: everything that writes into it is still in this file.
   *
   * A callback rather than a ref prop so there is one way to write it and the
   * parent cannot hand over a ref it also assigns to.
   */
  onCrowd?: (crowd: Crowd) => void
  /**
   * A face this client pulled, to be shown to the room.
   *
   * A counter beside the id, exactly like `announce` above and for the same
   * reason: throwing the same face twice is an id that has not changed, and an
   * effect keyed on the value alone would send the first one and swallow the
   * second.
   */
  emote?: { id: EmoteId; at: number }
  /**
   * What this client's own actions have made true of the world.
   *
   * A picture rather than a change, and a counter beside it so an *unchanged*
   * picture is not re-sent - see `@kxb/xp/sharing` for why it is a picture. The
   * parent works it out because the parent owns the entity world; this file
   * owns the socket and nothing else.
   */
  share?: { value: WorldShare; at: number }
  /** A peer's picture of the world, already checked. See `readShare`. */
  onShared?: (from: string, share: WorldShare) => void
  /**
   * The elected tier, and the three things it needs from this component.
   *
   * `world` is a picture from anybody on change; this is one client on a clock.
   * See `@kxb/xp/owning` for why a body could not be either of the other two
   * tiers, and why the election costs no packets at all.
   *
   * `bodiesNow` is called eight times a second **only while this client is the
   * owner**, and answering null or an empty list sends nothing - so a level
   * with nothing moving in it, which is nearly every level nearly all the time,
   * puts nothing on the wire.
   *
   * `onShoves` is the other direction: it hands over the pushes a *script* made
   * here and empties whatever it was keeping them in, which is why it is a
   * callback rather than an array this component is allowed to clear - a queue
   * is drained by the thing that owns it. Called every frame rather than at the
   * send rate, because a kick is a moment and a moment that waits 125ms for the
   * next tick is a kick that feels late. Only *sent* when this client is not
   * the owner; the owner has already applied its own.
   */
  bodiesNow?: (resting?: boolean) => BodyShare | null
  onShoves?: () => Shove[]
  /**
   * `from` is who sent it, so the buffer can believe one owner at a time.
   *
   * It matters now that ownership follows the ball: for half a round trip after a
   * claim the old owner is still sending, because it has not heard yet.
   */
  onBodies?: (share: BodyShare, from: string) => void
  /**
   * Whether this client is standing on a body somebody else is simulating.
   *
   * Pulled at the send rate rather than pushed, exactly like `bodiesNow`, because
   * the answer is a property of the current frame and the parent is the only thing
   * that has the world to ask. True is a claim - see the send loop, and
   * `@kxb/xp/owning` for why a touch is what moves ownership.
   */
  wantsBodies?: () => boolean
  /** Told whenever ownership changes hands, so a new owner can stop following
   * and take the bodies over from the last thing the old one said. */
  onOwns?: (owns: boolean) => void
  onShove?: (shove: Shove) => void
  /**
   * Names this client's **rules** said, for the room to hear.
   *
   * An event and not a picture, which is why it is a topic of its own rather
   * than a field on `share`: that packet is a state everybody converges on, and
   * a name said once is a moment. Sending a moment as state means deciding when
   * to take it back out again, and there is no right answer to that.
   *
   * A counter for the reason `emote` has one - the same name said twice is two
   * events, and a receiver comparing values would hear the first only.
   *
   * A **script's** emit is deliberately not here: it already ran on every
   * client. The parent does that filtering, because the parent is what knows
   * which half of its frame an effect came out of.
   */
  signal?: { said: readonly Said[]; at: number }
  /** Names a peer's rules said. */
  onSignalled?: (said: readonly Said[]) => void
  /**
   * Somebody this client just landed a hit on, so they go and ask about it.
   *
   * ---------------------------------------------------------------------------
   * A nudge, and deliberately not the number
   * ---------------------------------------------------------------------------
   * The person who was hit is the one client the arbiter cannot reach: their
   * health comes back on a poll once a second, so being punched took up to a
   * second to *happen* to them - and everything hanging off it with it. In
   * capture the flag that is the whole mode, because "hit the carrier and the
   * flag drops" is a `damaged` rule on the far side of that second.
   *
   * ../simulation's poll says why the number itself must not travel: this is a
   * broadcast bus anybody in the room can shout into, so a pushed "you have 0
   * health" is a sentence another client gets to write. The name it gave the
   * cheaper version is the one built here - **a hint on the socket that
   * triggers the poll**. The packet carries no outcome at all, only *go and
   * look*, and the answer still comes from the only thing entitled to give it.
   *
   * So the worst a liar can do is make somebody re-read a number that has not
   * changed, which is one request. `at` is a counter for `emote`'s reason: two
   * hits on the same person are two events, and a receiver comparing values
   * would hear the first only.
   */
  hit?: { who: string; at: number }
  /** A peer says something happened to us; go and ask what. */
  onHit?: () => void
}) {
  /**
   * Everybody else's samples, buffered.
   *
   * A ref because it is written from a socket callback and read from a frame
   * loop, and neither is a render. In state this would be a re-render per packet
   * per player - at 8 Hz and sixteen players, 128 a second.
   */
  const crowd = useRef(new Crowd(delayFor(network.sendHz)))


  /**
   * Held in a ref so the join effect does not depend on it.
   *
   * A parent that rebuilds this callback would otherwise leave and rejoin the
   * room, which is a visible flicker of everybody in it - the same reason
   * `onCount` is left out of that effect's dependencies below.
   */
  /**
   * The parent gets the buffer once it exists.
   *
   * In an effect rather than during render, like everything else that writes a
   * ref here: a value handed over while rendering is one React has not
   * committed, and the shot that reads it would be reading a buffer belonging to
   * a render that never happened.
   */
  useEffect(() => {
    onCrowd?.(crowd.current)
  }, [onCrowd])

  const onWorld = useRef(onShared)
  const onBody = useRef(onBodies)
  const onPush = useRef(onShove)
  const sendBodies = useRef(bodiesNow)
  const takeShoves = useRef(onShoves)
  const wantsBodies = useRef(wantsBodiesProp)
  // Assigned in an effect rather than during render: a ref written while
  // rendering is a value React has not committed, and lint refuses it.
  useEffect(() => {
    onWorld.current = onShared
  }, [onShared])

  useEffect(() => {
    onBody.current = onBodies
    onPush.current = onShove
    sendBodies.current = bodiesNow
    takeShoves.current = onShoves
    wantsBodies.current = wantsBodiesProp
  }, [onBodies, onShove, bodiesNow, onShoves, wantsBodiesProp])


  const onSaid = useRef(onSignalled)
  useEffect(() => {
    onSaid.current = onSignalled
  }, [onSignalled])

  /**
   * The lights, in a ref for the two above's reason: it is read inside the join
   * effect, and a parent's freshly-built callback listed as a dependency would
   * leave and rejoin the room on every render - a visible flicker of everybody
   * standing in it.
   */
  const onLights = useRef(onParty)
  useEffect(() => {
    onLights.current = onParty
  }, [onParty])

  /**
   * And the nudge that says something happened to us, in a ref for the same
   * reason: it is read inside the join effect, and a parent's freshly-built
   * callback in that effect's dependencies would leave and rejoin the room on
   * every render.
   */
  const onHurt = useRef(onHit)
  useEffect(() => {
    onHurt.current = onHit
  }, [onHit])

  /**
   * One face-slot per peer, made on demand and handed to their bubble.
   *
   * A map of refs rather than state, for the reason everything else on this
   * path is a ref: an emote is a packet arriving, and putting it in state would
   * re-render every body in the room each time anybody in it pulled a face.
   *
   * The slot is created by *whoever asks first* - the renderer on its first
   * render, or the socket when a packet lands - and both get the same object
   * back, which is what makes the arrival order not matter. Emptied in
   * `onPeers` below rather than on a timer: presence is the authority on who is
   * here, and a slot for somebody who left is a face nobody can see attached to
   * a body that is not drawn.
   */
  const faces = useRef(new Map<string, EmoteState>())
  const faceFor = useCallback((id: string): EmoteState => {
    const held = faces.current.get(id)
    if (held) return held
    const fresh = noEmote()
    faces.current.set(id, fresh)
    return fresh
  }, [])

  const socket = useRef<XpSocket | null>(null)
  /** Only to redraw when the *number* of bodies changes, which is rare. */
  const [present, setPresent] = useState<string[]>([])
  /**
   * Which animal each co-player is, by id. Empty for a room of default bodies.
   *
   * State rather than a ref, unlike everything else about a peer: this decides
   * *which glTF to load*, so a change has to reach the renderer, and it changes
   * when somebody joins rather than eight times a second.
   */
  const [skins, setSkins] = useState<ReadonlyMap<string, string>>(new Map())

  /**
   * Who is integrating the bodies, and how many handovers deep the room is.
   *
   * ---------------------------------------------------------------------------
   * It follows the ball now, not the sort order of an id
   * ---------------------------------------------------------------------------
   * This used to be `useMemo(() => ownsBodies(me.id, present))` - a pure function
   * of the roster, the same answer on every machine, no packets. That property
   * was worth a lot and the rule it implemented was worth very little: the lowest
   * presence id owned the ball for the whole match, so in a two-player kickabout
   * one player's touches were resolved on the machine holding the true positions
   * and the other's were the owner **guessing** their shove from an interpolated
   * avatar box a quarter of a second old. Which of the two you were depended on a
   * string comparison.
   *
   * So it moves on a touch. The rule stays a pure function - `resolve` in
   * `@kxb/xp/owning`, called from two places below and from thirteen tests - but
   * its input is now what the room has *said* rather than who is in it, because
   * "am I nearest the ball" is not a question two clients can answer from the
   * same numbers. The header of that module has the argument at length.
   *
   * A ref rather than state, and the seq is the reason: this is read in the frame
   * loop and written from a socket callback, and a re-render per handover in a
   * game where handovers happen on every touch is a re-render per touch.
   */
  const held = useRef<Held>(heldBy([me.id, ...present]))
  /**
   * The same fact as `held.current.owner === me.id`, kept beside it.
   *
   * Two refs rather than one derived read because the derivation would happen
   * during render, which lint refuses and is right to: a ref read while rendering
   * is a value React has not committed. Both are written together by `settle`,
   * which is the only thing that writes either.
   *
   * Seeded from `heldBy`'s answer for a one-person room without reading the ref:
   * alone, the floor elects you, which is what keeps a level played by one person
   * running exactly as it always did.
   */
  const owning = useRef(ownsBodies(me.id, present))
  const announced = useRef<boolean | null>(null)

  /**
   * Everybody in the room, for `resolve` to check a claimant against.
   *
   * A ref of the same list `present` holds because the socket handlers below are
   * installed once, in an effect that must not depend on the roster - rejoining
   * the topic on every arrival is a visible flicker of everybody in it.
   */
  const everybody = useRef<string[]>([me.id, ...present])
  useEffect(() => {
    everybody.current = [me.id, ...present]
  }, [me.id, present])

  /**
   * Told the parent, and only on a change.
   *
   * `false -> true` is the interesting edge: a new owner has to seed the bodies
   * from the last thing the old one said before it integrates them, which is
   * `Balls.adopt`. Announced from here rather than discovered by the parent
   * because this is the component that knows.
   */
  const settle = useCallback(
    (next: Held) => {
      held.current = next
      const mine = next.owner === me.id
      owning.current = mine
      if (announced.current === mine) return
      announced.current = mine
      onOwns?.(mine)
    },
    [me.id, onOwns],
  )
  const settling = useRef(settle)
  useEffect(() => {
    settling.current = settle
  }, [settle])

  /**
   * The roster changed, so an owner may have walked out of the room.
   *
   * The old rule, kept exactly, as the floor under the new one: nobody sends
   * anything, everybody left reaches the same new owner from the same list, and
   * the seq moves so a claim the departing owner had in flight cannot win against
   * it. `heldAfter` is a no-op when the owner is still here, which is every
   * roster change except the one that matters.
   */
  useEffect(() => {
    settling.current(heldAfter(held.current, [me.id, ...present]))
  }, [me.id, present])

  /**
   * The topic, which is the room *and* which room of the level.
   *
   * Walking through a door changes this string, and the effect below leaves one
   * topic and joins another - which is not a special case in it, because
   * changing rooms and joining one are the same operation. That is the whole
   * argument of scenes.md §1.6: presence filtering is work, and not being on a
   * stream is free.
   *
   * The cost, said plainly: a scene switch has join latency, so there is a
   * moment of not seeing anybody. The loading screen already covers it.
   */
  const topic = sceneTopic(room, scene)

  useEffect(() => {
    let live = true
    let joined: XpSocket | null = null

    void network.join(topic).then((open) => {
      // Left before the join finished, which is what a fast reload looks like.
      if (!live) {
        open.leave()
        return
      }
      joined = open
      socket.current = open

      open.on('at', (payload, from) => {
        const sample = payload as {
          x?: number
          y?: number
          z?: number
          f?: number
          d?: boolean
          k?: boolean
        }
        if (
          typeof sample?.x !== 'number' ||
          typeof sample?.y !== 'number' ||
          typeof sample?.z !== 'number'
        ) {
          // A malformed packet is dropped rather than trusted. It is a message
          // from another machine, which makes it input, which makes it the one
          // thing in this file that must not be assumed well-formed.
          return
        }
        crowd.current.remember(
          from,
          {
            x: sample.x,
            y: sample.y,
            z: sample.z,
            facing: sample.f ?? 0,
            // Checked rather than coerced, like every other field here: a
            // client from before this shipped sends no `d` and reads as not
            // dancing, which is what it was doing.
            ...(sample.d === true ? { dance: true } : {}),
            // `k` for knocked down: `d` was already a dance by the time this
            // needed a letter, and `down` would have collided with it on sight.
            ...(sample.k === true ? { down: true } : {}),
          },
          performance.now(),
        )
      })

      /**
       * Somebody pulled a face.
       *
       * Checked with `isEmote` rather than trusted, for the reason the position
       * packet above is checked: this is a message from another machine, which
       * makes it input. An index past the end of our sheet would sample off the
       * edge of the texture and draw a stripe of whatever is next to it in
       * memory, so an emote we do not understand is one nobody sees.
       *
       * The clock starts when the packet *lands* rather than when it was sent.
       * There is no timestamp on the wire and there should not be: a sender's
       * clock is a number this client cannot check, and the cost of the choice
       * is that a face is up for three seconds of *your* time rather than
       * three seconds of theirs, which nobody can perceive and nobody can abuse.
       */
      /**
       * A peer's picture of the world.
       *
       * The gap this closes is the one capture the flag made obvious: the wire
       * carried position and facing, and `stepTriggers` probes only the local
       * body - so somebody took the flag and it stayed on the floor in front of
       * you. See `@kxb/xp/sharing`.
       */
      open.on('world', (payload, from) => {
        const share = readShare(payload)
        if (share) onWorld.current?.(from, share)
      })

      /**
       * Where the owner says the moving things are.
       *
       * Ignored while *this* client is the owner, which is not paranoia: an old
       * owner that has not noticed somebody lower joined is still sending, and
       * two clients each taking the other's word for it would hand a ball back
       * and forth between two simulations. The election settles within a
       * roster update and this is what keeps the moment before it harmless.
       */
      open.on('bodies', (payload, from) => {
        if (owning.current) return
        // Somebody has answered, whether or not it was an answer to this
        // client's own asking. Either way there is no longer anything to ask.
        knows.current = true
        const share = readBodies(payload)
        // Who sent it, so the buffer can believe one owner at a time. For half a
        // round trip after a claim the *old* owner is still sending, because it
        // has not heard yet, and a buffer that took both would interpolate
        // between two machines' idea of one ball.
        if (share) onBody.current?.(share, ((payload as { from?: unknown })?.from as string) || from)
      })

      /**
       * Somebody is on a body and is taking it over.
       *
       * Resolved rather than obeyed: `resolve` decides from what this client
       * already holds, so a duplicate is a no-op, a reordered packet is dropped,
       * and two people who touched the ball on the same tick land on the same one
       * of them **whichever order the two claims arrive here**. That last
       * property is the whole reason ownership moves on a message instead of
       * being computed from who is nearest - see `@kxb/xp/owning`.
       */
      /**
       * Somebody has just walked in and wants to know where things are.
       *
       * -----------------------------------------------------------------------
       * A pull, because the push had a hole in it
       * -----------------------------------------------------------------------
       * Arrival used to be handled entirely by the people already here: the
       * roster grows, everybody notices, and *the owner* sends the full picture
       * including the things that have stopped. That works right up until the
       * arrival changes who the owner is - which it does whenever the newcomer's
       * id sorts lowest, because ownership has no protocol and is simply the
       * lowest id present. The old owner has already handed over by the time the
       * greeting would go out, so it does not send one; the new owner is the
       * person who just arrived and knows nothing. Nobody sends anything, and
       * the room's ball is invisible to whoever joined - *"you dont see the ball
       * at all"*, on the second client, every time.
       *
       * So the newcomer asks. A request cannot be missed by whoever happens to
       * become the owner in the same tick, because it is answered *after* the
       * dust settles rather than during it, and it can be repeated - see the
       * retry where it is sent.
       *
       * Answered only by the owner, for the reason the greeting was: two clients
       * describing one ball is the thing the elected tier exists to prevent. And
       * answered with `resting` on, because the tick packet carries only what is
       * *moving* - a ball on the centre spot is exactly the case this is for.
       */
      open.on('hello', () => {
        if (!owning.current) return
        const all = sendBodies.current?.(true)
        if (all && all.b.length > 0) socket.current?.send('bodies', { from: me.id, ...all })
        /*
          Bodies only. The world picture - what this client's own rules have made
          true - is `self` tier, so everybody present already answers a newcomer
          with theirs on the roster change; it is the *elected* half that had the
          hole, because only one client may answer it and that one client is
          exactly who the arrival can change.
        */
      })

      open.on('claim', (payload) => {
        const claim = readClaim(payload)
        if (claim) settling.current(resolve(held.current, claim, everybody.current))
      })

      /**
       * Somebody who is not the owner kicked something.
       *
       * Only the owner acts on it, for the mirror-image reason: everybody else
       * has already predicted their own kick locally, and a client applying a
       * push it did not make *and* the correction that follows would apply it
       * twice.
       */
      open.on('shove', (payload) => {
        if (!owning.current) return
        const shove = readShove(payload)
        if (shove) onPush.current?.(shove)
      })

      /**
       * Somebody turned the lights on, or off.
       *
       * Checked rather than trusted, like every other topic here: this is a
       * message from another machine, which makes it input. Anything that is
       * not a boolean is dropped, so a malformed packet leaves the room exactly
       * as it was rather than half-lit.
       *
       * `from` is carried up because it decides *whose* colour cycles - the
       * person who threw the switch is the one the room can pick out. The
       * sender is read off the payload, for the reason the face below spells
       * out at length.
       */
      open.on('party', (payload, from) => {
        const on = (payload as { on?: unknown })?.on
        if (typeof on !== 'boolean') return
        onLights.current?.(on, ((payload as { from?: unknown })?.from as string) || from)
      })

      open.on('face', (payload, from) => {
        const said = (payload as { e?: unknown })?.e
        if (!isEmote(said)) return
        showEmote(faceFor(from), said, performance.now())
      })

      /**
       * Names a peer's rules said.
       *
       * Checked rather than trusted, for the reason the face above is: this is
       * another machine's message, which makes it input. What could go wrong is
       * duller than a texture read off the end - a name is only ever compared
       * against what a trigger asked for - but a thousand-element array of
       * objects would still be a thousand fan-outs over the entity world, so
       * the shape is checked and the count is capped.
       *
       * `PLAYER_ID` as the sender rather than anything off the wire: a peer's
       * entity ids are their own machine's and mean nothing here, and the
       * honest answer to "who said this" on this client is "the person whose
       * body you can see", which is what `applyShare` already resolves them to.
       */
      open.on('said', (payload) => {
        const names = (payload as { s?: unknown })?.s
        if (!Array.isArray(names)) return
        const heard = names
          .filter((one): one is string => typeof one === 'string' && one.length > 0)
          .slice(0, MAX_HEARD)
          .map((event) => ({ event, from: PLAYER_ID }))
        if (heard.length > 0) onSaid.current?.(heard)
      })

      /**
       * Somebody says they landed one on us. Go and ask what it was.
       *
       * The whole handler, on purpose: the packet names a victim and nothing
       * else, so there is nothing here to trust or to apply. `who` is compared
       * against our own id rather than acted on, because the bus is the room -
       * everybody hears every hit, and only the person named has anything to
       * do about it.
       *
       * The sender is not read at all. It would be a name for a message whose
       * only content is *look again*, and a hint from a liar and a hint from
       * the person who actually hit you produce the same one request to the
       * same authority.
       */
      open.on('hit', (payload) => {
        const who = (payload as { who?: unknown })?.who
        if (typeof who !== 'string' || who !== me.id) return
        onHurt.current?.()
      })

      open.onPeers((peers) => {
        const others = peers.filter((peer) => peer.id !== me.id).map((peer) => peer.id)
        /**
         * And what each of them arrived as.
         *
         * `XpPlayer.skin` has been on the roster since there was a roster - it
         * is the animal somebody picked at the door, or the one on their account
         * - and this component read the ids beside it and dropped the rest. So
         * every co-player in every level was drawn as the *local* body: two
         * people, one animal, and no way to tell who was who.
         *
         * Kept as a plain map rather than in the sample buffer because it is
         * roster-shaped: it changes when somebody joins and never between
         * packets, so it belongs where the names and the sides do.
         */
        setSkins(
          new Map(
            peers
              .filter((peer) => peer.id !== me.id && peer.skin)
              .map((peer) => [peer.id, peer.skin!] as const),
          ),
        )
        // Anybody who left is forgotten outright rather than left to go stale:
        // presence is the authority on who is *here*, and the buffer's own
        // silence rule is only about packets that did not arrive.
        for (const id of crowd.current.ids()) {
          if (!others.includes(id)) crowd.current.forget(id)
        }
        // And their face with them, for the same reason and one more: a slot
        // per person who has ever been in the room is a map that only grows,
        // in a session that can run for hours.
        for (const id of faces.current.keys()) {
          if (!others.includes(id)) faces.current.delete(id)
        }
        setPresent(others)
        onCount?.(others.length)
        // Everybody, not just the others: a scoreboard has a row for the person
        // reading it, and it is the only row they will look for first.
        onRoster?.(peers)
      })
    })

    return () => {
      live = false
      socket.current = null
      joined?.leave()
    }
    // `onCount` deliberately absent: a parent that rebuilds its callback would
    // otherwise leave and rejoin the room, which is a visible flicker of
    // everybody in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, topic, me.id])

  /**
   * Telling the room what face this client just pulled.
   *
   * The same counter shape as the door above and for the same reason: pulling
   * the same face twice is an id that has not changed, and a value-keyed effect
   * would swallow the second one.
   *
   * **Sent and shown separately.** Our own bubble is put up by the scene the
   * moment the face is picked rather than waiting for this to land, because
   * `XpSocket` makes no delivery guarantee - so an emote that only appeared
   * once it had been sent successfully would be one that sometimes silently did
   * not happen to the person who pressed the button. Everybody else finds out
   * over the wire; we already know.
   */
  /**
   * Telling the room what this client's actions made true.
   *
   * The same counter shape the door and the face use, and for the same reason:
   * the parent only bumps it when the picture actually changed, so a level
   * where nothing is switched off and nobody is carrying anything sends nothing
   * at all, forever.
   *
   * `from` is in the payload because `realtimeNetwork` reads the sender off the
   * message rather than off the transport - the trap the emote packet already
   * paid for once.
   */
  const told = useRef(share?.at)
  useEffect(() => {
    if (!share) return
    if (told.current === share.at) return
    told.current = share.at
    socket.current?.send('world', { from: me.id, ...share.value })
    /*
      The repeats are *not* armed here, and that is a lint rule rather than a
      preference: a ref written inside an effect may not also be written in the
      frame loop. So this writes `told` and the send loop notices it changed -
      see `repeated` there, which is the only thing that arms them.
    */
  }, [share, me.id])

  /**
   * The lights, out to the room, and again whenever somebody arrives.
   *
   * Two effects rather than one, and they are the pair the lounge's rainbow
   * needs too:
   *
   * - **the switch**, which sends when this client's answer changes. Keyed on
   *   the value rather than a counter, unlike the picture and the face above:
   *   those are events that can repeat identically, where this is a *state* and
   *   sending "still on" changes nothing;
   * - **the greeting**, because a room is not a record. Somebody who joins a
   *   lit match after the switch was thrown has heard nothing, so whoever has
   *   it on says so again when the roster grows. Without it, walking in late is
   *   walking into a party everybody else can see and you cannot.
   */
  const threw = useRef<boolean | null>(null)
  useEffect(() => {
    if (!party) return
    if (threw.current === party.on) return
    const first = threw.current === null
    threw.current = party.on
    /**
     * The first run says nothing, and that is the whole of the bug it fixes.
     *
     * Every client mounts with the lights off, so a client that announced its
     * starting value would walk into a lit match and turn it off for everybody
     * on the way in. What this client has to say is that *it threw the switch*,
     * which is a change from what it last said and never the state it started
     * in.
     */
    if (first) return
    socket.current?.send('party', { from: me.id, on: party.on })
  }, [party, me.id])

  /**
   * The greeting, keyed on the **roster** and nothing else.
   *
   * It read `party?.on` as a dependency once, and that is a room whose lights
   * cannot be turned off: receiving "on" flips this client's own answer, which
   * fired this effect, which announced "on" straight back - so every switch-off
   * was drowned by four clients insisting. Found with two browsers, where A
   * pressed the button twice and the room stayed lit.
   *
   * The value is read through a ref, so being lit is a *fact this effect reads*
   * rather than a reason for it to run.
   */
  const lit = useRef(party?.on ?? false)
  useEffect(() => {
    lit.current = party?.on ?? false
  }, [party?.on])

  useEffect(() => {
    if (!lit.current) return
    socket.current?.send('party', { from: me.id, on: true })
  }, [present.length, me.id])

  const shown = useRef(emote?.at)
  useEffect(() => {
    if (!emote) return
    if (shown.current === emote.at) return
    shown.current = emote.at
    /**
     * `from` is carried in the payload, and leaving it out is not cosmetic.
     *
     * `realtimeNetwork` reads the sender off the *message* rather than off the
     * transport — see `on` in ../_hosts/realtime — so a packet without it
     * arrives with an empty id. For a face that means every peer's emote lands
     * in one slot keyed by `''`, which belongs to nobody, and no bubble in the
     * room ever comes up. Found by sending one between two real browsers and
     * watching nothing happen on the other screen; `at` above has always done
     * this and that is why positions worked.
     */
    socket.current?.send('face', { from: me.id, e: emote.id })
  }, [emote, me.id])

  /**
   * And the hit, to the person it happened to.
   *
   * The counter shape the face uses, for the reason it uses it: two hits on one
   * person are two events, and a receiver comparing values would hear the first
   * only. The parent bumps it when a *verdict* comes back rather than when a
   * claim goes out, so nothing is said about a shot the arbiter refused.
   */
  const struck = useRef(hit?.at)
  useEffect(() => {
    if (!hit) return
    if (struck.current === hit.at) return
    struck.current = hit.at
    socket.current?.send('hit', { from: me.id, who: hit.who })
  }, [hit, me.id])

  /**
   * What this client's rules said, out to the room.
   *
   * The counter shape the picture and the face both use, for the third time and
   * the same reason: the parent only bumps it when there is something to say, so
   * a level whose rules never emit sends nothing at all.
   *
   * `from` in the payload, like every other topic here - `realtimeNetwork` reads
   * the sender off the message rather than off the transport, and a packet
   * without it arrives belonging to nobody.
   */
  const said = useRef(signal?.at)
  useEffect(() => {
    if (!signal) return
    if (said.current === signal.at) return
    said.current = signal.at
    if (signal.said.length === 0) return
    socket.current?.send('said', {
      from: me.id,
      // Names only. `from` on each one is a local entity id, which means
      // nothing on another machine - a peer resolves the sender as the peer,
      // which is the honest answer and the one `applyShare` already gives.
      s: signal.said.map((one) => one.event),
    })
  }, [signal, me.id])

  /**
   * Catching a newcomer up on what this client's actions made true.
   *
   * Without it somebody who joins after the flag was taken sees it lying on the
   * floor until the next time anything changes - which in a level with one
   * pickup is never. Read through a ref rather than listed as a dependency: the
   * value is read when the effect runs, and listing it would re-send the
   * picture every time it changed as well.
   *
   * **The door's greeting used to be on this edge too, and has moved.** It is
   * `../_runtime/room-link` now, on the topic that does not change, because
   * this one is per *scene* - and the person who most needs telling where the
   * room is is the person standing alone in the scene nobody else is in. The
   * repair cannot live on the stream it exists to repair. What stays here is
   * the world picture, which is scene-shaped by nature: it describes the
   * entities in the room you are both standing in.
   */
  const pictured = useRef(share?.value)
  useEffect(() => {
    pictured.current = share?.value
  }, [share])

  const greeted = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const fresh = arrivals(present, greeted.current)
    /**
     * Recorded even when there is nothing to say, so that a client with no
     * picture yet does not accumulate everybody in `present` as unseen and then
     * greet the whole room at once the first time it has something to send.
     */
    greeted.current = new Set(present)
    if (fresh.length === 0) return

    /**
     * Sent by everybody present rather than by an elected one, because there is
     * nobody to elect. Safe because applying a picture is idempotent: N answers
     * and one answer land in the same place.
     */
    const picture = pictured.current
    if (picture) socket.current?.send('world', { from: me.id, ...picture })

    /**
     * And where the moving things are - *including the ones that have stopped*.
     *
     * The tick packet carries only what is moving, so a ball resting on the
     * centre spot is never described and somebody who has just walked in draws
     * it wherever their own copy of the document put it. Reported exactly that
     * way: the ball "was on the start" for a new player.
     *
     * Only from the owner, unlike the world picture above: that one is `self`
     * tier and anybody may describe what they did, and this is the elected tier
     * where two clients answering would be two clients claiming to integrate.
     */
    if (owning.current) {
      const all = sendBodies.current?.(true)
      if (all && all.b.length > 0) socket.current?.send('bodies', { from: me.id, ...all })
    }
  }, [present, me.id])

  /** Seconds since the last packet went out. */
  const since = useRef(0)

  /**
   * Whether anybody has told this client where the moving things are.
   *
   * Set by the first `bodies` packet of any kind, and the only thing it decides
   * is whether to keep asking. A client that owns the bodies never needs an
   * answer - it *is* the answer - so it stops asking the moment it is elected.
   */
  const knows = useRef(false)
  /** Seconds since the owner last described the level whole. See the send. */
  const resting = useRef(0)
  /**
   * How many more times the last change to the picture is owed to the room, and
   * how long since one of them went. See where they are set.
   */
  const owed = useRef(0)
  const repeating = useRef(0)
  /**
   * Which change to the picture the repeats have already been armed for.
   *
   * The send loop's own copy of `told`, so that arming them is something this
   * frame loop does to its own refs: a ref written inside an effect may not also
   * be written here, and `told` is the effect's.
   */
  const repeated = useRef(share?.at)
  /** Seconds since the owner last said out loud that it is the owner. */
  const asserting = useRef(0)
  /** Seconds since the last ask, so a lost one is asked again rather than lost. */
  const asked = useRef(HELLO_EVERY)

  useFrame((_state, rawDelta) => {
    const open = socket.current
    if (!open) return
    /**
     * The remainder is carried, not thrown away.
     *
     * This read `since.current = 0` on send, which drops the overshoot: at
     * 8 Hz and 60fps the threshold is crossed on the 8th frame at 133 ms, so
     * the real rate was 7.5 Hz and wandered with the frame time. That matters
     * because the receiver's `INTERPOLATION_DELAY` is sized against the rate
     * this claims to send at - a sender 6% slow eats the margin that stops a
     * late packet freezing a body, which is what the stutter was.
     *
     * `sendDue` is in ./presence beside `sampleAt`, the other sender-side
     * thing, and is a function because this was wrong silently: a rate that is
     * a little off shows up in no type and in nothing anybody can see until
     * somebody else is in the room.
     */
    const due = sendDue(since.current + Math.min(rawDelta, 0.05), network.sendHz)
    since.current = due.since
    if (!due.send) return

    /**
     * Kicks, on the same tick as everything else.
     *
     * This drained every frame at first, on the argument that a push is a
     * *moment* and holding one back for an eighth of a second is a kick that
     * feels late. That was the wrong trade and it was asked to be changed:
     * **nothing in this feature goes on the wire faster than the send rate.**
     *
     * The reason is the ceiling rather than the bytes. `sendHz` is what the
     * whole room is designed against - one channel, traffic growing with the
     * square of the room, a tenant limit that decides how many people can be in
     * one instance - and a second stream running at frame rate is a stream
     * nobody sized. A kick is also not as urgent as it feels: it is already
     * predicted locally, so the person who pressed the key sees the ball go
     * immediately, and what waits for the tick is only the confirmation.
     *
     * Several presses inside one tick all go, rather than the last one winning.
     * They are separate kicks and each one was a key somebody hit.
     *
     * Only when this client is not the owner. An owner has already applied its
     * own pushes to the world it is authoritative over.
     */
    /**
     * And if this client still does not know where anything is, ask.
     *
     * Repeated rather than sent once, because the one thing a join cannot assume
     * is that anybody was listening: the owner may have been mid-handover, the
     * packet may have been dropped, or there may have been nobody here at all
     * when it went out. It stops the moment an answer arrives - or the moment
     * this client is elected, since an owner is not waiting on anybody.
     *
     * Not on a timer of its own: nothing in this feature goes on the wire faster
     * than the send rate, and a join is not urgent enough to be the exception.
     */
    if (!knows.current && !owning.current) {
      asked.current += 1 / network.sendHz
      if (asked.current >= HELLO_EVERY) {
        asked.current = 0
        open.send('hello', { from: me.id })
      }
    }

    const mine = takeShoves.current?.() ?? []
    if (mine.length > 0 && !owning.current) {
      for (const shove of mine) open.send('shove', { from: me.id, ...shove })
    }

    /**
     * And if this client is standing on something somebody else is simulating,
     * take it.
     *
     * **After the shoves and before the bodies**, and both halves of that are
     * deliberate. After, because a kick and a claim can land on the same tick and
     * the kick has to reach whoever still believes they are the owner - claiming
     * first would send it into a room where nobody thinks the shove is theirs to
     * apply, which loses it. Before, because from this tick on the samples are
     * mine to send.
     *
     * At the send rate like everything else here, which is the rule this file
     * states and the reason the shoves above stopped going per frame: nothing in
     * this feature goes on the wire faster than `sendHz`. The cost is up to one
     * tick of still being a follower after you are on the ball, which is a
     * fraction of the interpolation delay this replaces.
     *
     * Taken **optimistically** - resolved locally as though the claim had already
     * been agreed - because waiting a round trip to start simulating the thing
     * under your feet is exactly the latency this exists to remove. A race lost
     * to a lower id arrives as a `claim` above and puts this client back to
     * following.
     */
    if (!owning.current && wantsBodies.current?.()) {
      const claim = claiming(held.current, me.id)
      if (claim) {
        open.send('claim', { from: me.id, ...claim })
        settling.current(resolve(held.current, claim, everybody.current))
      }
    }

    /**
     * And, now and then, that this client is still the one simulating.
     *
     * ---------------------------------------------------------------------------
     * Two owners is silent, total, and reachable
     * ---------------------------------------------------------------------------
     * Every other repair here is about a packet that went missing. This one is
     * about a room that never agreed in the first place: two clients arriving
     * together each elect *themselves* on the floor - `heldBy` of a roster that
     * does not have the other person in it yet - and both then believe they are
     * integrating the ball. Seen with two browsers, both reporting they owned it
     * on the frame they joined. Nothing says so and nothing ever corrects it,
     * because a claim is only sent by somebody standing *on* the ball.
     *
     * So the owner asserts it, and `resolve` does the rest - the same pure
     * function the touch path uses, with no new rule to keep in step. The seq
     * carried here is the current one rather than the next, which is what makes
     * this an assertion and not a claim: a room that already agrees resolves it
     * to a no-op, and a room with two self-elected owners at the same seq settles
     * on the lower id, the same way on both machines.
     *
     * Which is *"look who was the last on the ball and this one we use"*: the seq
     * is exactly that, since it only moves when somebody takes the ball.
     *
     * Two seconds rather than the thirty that were suggested, and the reason is
     * that the window this closes is the one nobody is watching - a match whose
     * first half minute is two simulations of one ball is a match that felt
     * broken before it was fixed. It is one small packet from one client, against
     * the eight a second the same client is already sending bodies at.
     */
    if (owning.current) {
      asserting.current += 1 / network.sendHz
      if (asserting.current >= OWNING_AGAIN) {
        asserting.current = 0
        open.send('claim', { from: me.id, who: me.id, seq: held.current.seq })
      }
    }

    /**
     * The last change to the picture, said again twice, a second apart.
     *
     * ---------------------------------------------------------------------------
     * The one tier with no repair at all
     * ---------------------------------------------------------------------------
     * `applyShare` turns a thing off by taking it out of `alive` and deliberately
     * sets no `returns` row, so a client that did not run the rule itself has no
     * timer of its own. It is waiting to be told, and until now nothing would
     * ever tell it twice - so one lost packet was permanent.
     *
     * A goal takes kickabout's ball off every screen and puts it back four
     * seconds later, and the packet carrying *back on* is the one describing an
     * empty picture. "Only repeat while there is something to say" would skip
     * precisely the one that matters, so it is the **change** that is repeated,
     * whatever the change was.
     *
     * Bounded rather than periodic, which is the difference from the bodies tick
     * below: that one is a clock because a body moves continuously, and a picture
     * is an event. A level where nothing is ever switched off still sends nothing.
     *
     * Armed here rather than in the effect that does the first send, because a
     * ref written inside an effect may not also be written in a frame loop.
     */
    if (repeated.current !== told.current) {
      repeated.current = told.current
      owed.current = PICTURE_AGAIN
      repeating.current = 0
    }

    if (owed.current > 0) {
      repeating.current += 1 / network.sendHz
      if (repeating.current >= PICTURE_GAP) {
        repeating.current = 0
        owed.current -= 1
        const picture = pictured.current
        if (picture) open.send('world', { from: me.id, ...picture })
      }
    }

    /**
     * And where everything that moves has got to, if this client is the one
     * saying so.
     *
     * On the same tick as the position packet rather than a clock of its own:
     * the receiver's correction is sized against this rate, and a second timer
     * would be a second thing to keep in step with `INTERPOLATION_DELAY`.
     *
     * A level with nothing moving sends nothing - `bodiesOf` reports only what
     * has a velocity, and a body at rest has no row at all. So the cost of this
     * is proportional to what is happening rather than to how much is in the
     * level.
     */
    if (owning.current) {
      /**
       * Everything that is moving - and, now and then, everything that is not.
       *
       * The tick packet has always carried only what has a velocity, which is
       * what makes a settled level cost nothing. The hole in it is a body that
       * is *moved while at rest*: a goal resets the ball to the centre spot with
       * no velocity at all, so nothing describes it, and every client keeps
       * whatever its own copy of that reset produced. Reported as the ball
       * landing in the red half on one screen and the green on the other after
       * a goal - and it could never reconcile, because the next packet only
       * comes when somebody moves it again.
       *
       * A whole picture once a second fixes it without a protocol: it is one
       * body in this level, it is idempotent, and it is the same call the
       * arrival handshake makes. Anything the room disagrees about is settled
       * within a second whatever caused it - a reset, a dropped packet, a client
       * whose rules fired a moment apart from everybody else's.
       */
      resting.current += 1 / network.sendHz
      const whole = resting.current >= RESTING_EVERY
      if (whole) resting.current = 0
      const bodies = sendBodies.current?.(whole)
      if (bodies && bodies.b.length > 0) open.send('bodies', { from: me.id, ...bodies })
    }

    /**
     * The eye the controller holds, turned into the feet the wire carries.
     *
     * `sampleAt` and not a subtraction here: the conversion is the format's
     * business rather than this component's, and the bug it exists for - see the
     * note on it - was exactly a subtraction that nobody wrote because both
     * sides looked right on their own.
     */
    const body = sampleAt(at.current, heading.current, {
      dance: dancing?.current === true,
      down: down?.current === true,
    })
    /**
     * Short keys, because this is the one message that repeats.
     *
     * Eight times a second per player forever: `f` rather than `facing` is forty
     * bytes an hour per person of nothing, which is not much until it is sixteen
     * people and every one of them is paying for it in a rate limit.
     */
    open.send('at', {
      from: me.id,
      x: round(body.x),
      y: round(body.y),
      z: round(body.z),
      f: Math.round(body.facing),
      // Sent only while it is true, so the ordinary packet is unchanged - see
      // `Sample.dance` for why this is the one animation fact that travels.
      ...(body.dance ? { d: true } : {}),
      ...(body.down ? { k: true } : {}),
    })
  })

  /**
   * Everybody the level lets this client see.
   *
   * The three cases of docs/xp/xp-flow.md §3, and only one of them is new work:
   *
   *   `normal`  drawn, which is what everybody without a look is.
   *   `nobody`  gone from the list, so no body and no ring - the same removal
   *             `disarm` already does to a held thing.
   *   `team`    drawn to your own side. Decided here rather than anywhere near
   *             the wire because a side is *derived* from the marks and the id
   *             (see ./teams), so both halves of the comparison are already on
   *             this client and neither is a secret.
   *
   * A memo rather than a filter in the JSX: this list is the identity of every
   * body and ring below it, and rebuilding it each render would be a new array
   * every frame the parent moves.
   *
   * **The look decides drawing and nothing else.** Samples still arrive and are
   * still interpolated for somebody who is not drawn, which is what makes coming
   * back into view instant rather than a body that materialises where it last
   * was and then runs to catch up.
   */
  const drawn = useMemo(() => {
    if (!looks || Object.keys(looks).length === 0) return present
    return present.filter((id) => {
      const look = looks[id]
      if (look === undefined || look === 'normal') return true
      if (look === 'nobody') return false
      /*
       * Undefined is not a side, so two people who have none are not on the same
       * one - a `team` look in a free-for-all hides you from everybody, which is
       * the honest reading of "only to your own side" when there are no sides.
       */
      const theirs = sideOf(marks, { id }, rules)
      return theirs !== undefined && theirs === side
    })
  }, [present, looks, marks, rules, side])

  /**
   * The drawn, split by which body each of them is.
   *
   * Falling back to `model` for anybody the roster has no skin for - a host with
   * no account system, a level that names one body for everybody, or a peer
   * whose roster entry simply arrived without one. That fallback is what keeps
   * this identical to the old behaviour whenever nobody has chosen anything.
   */
  const byModel = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const id of drawn) {
      const which = skins.get(id) ?? model
      const held = groups.get(which)
      if (held) held.push(id)
      else groups.set(which, [id])
    }
    return groups
  }, [drawn, skins, model])

  return (
    <>
      {/*
        Bodies with bones, rather than the instanced path the rest of the level
        uses. An instanced mesh shares one geometry between every instance, and a
        skinned pose is a *different* geometry per body - so people get their own
        path and only people. See ./skinned.
      */}
      {/*
        One group per animal in the room, rather than one for the room.

        `SkinnedCrowd` loads a single glTF and draws every id against it, which
        is right for a room of one body and was quietly wrong for every other
        room: whatever this client happened to be, everybody else was drawn as.
        Grouping by skin keeps that arrangement - each group is still one file,
        one skeleton, one set of clips - and simply has as many of them as there
        are animals present, which in practice is two or three.
      */}
      {[...byModel].map(([which, ids]) => (
        <Peers
          key={which}
          crowd={crowd}
          ids={ids}
          model={which}
          {...(clips ? { clips } : {})}
          scale={scale}
          faceFor={faceFor}
          {...(party?.on ? { glow: true } : {})}
          {...(party?.host ? { host: party.host } : {})}
        />
      ))}
      {/* Outside `Bodies` rather than inside it: a ring is a plane and a colour
          with no model to load, and making the one thing that says which side
          somebody is on wait on their avatar would hide it for exactly as long
          as the geometry takes to arrive. */}
      <Rings crowd={crowd} ids={drawn} marks={marks} rules={rules} />
    </>
  )
}

/**
 * How often a client with no picture asks for one, in seconds.
 *
 * Long enough that a room of people joining together is not a burst of asking,
 * short enough that nobody stands on a pitch wondering where the ball is. It
 * stops at the first answer, so in the ordinary case this is asked exactly once.
 */
const HELLO_EVERY = 1

/**
 * How often the owner describes everything, moving or not, in seconds.
 *
 * Rare enough to be free - one body in a football level, a handful in a level
 * of crates - and often enough that a room which has come to disagree about
 * where something rests is put right before anybody plays a second ball off it.
 */
const RESTING_EVERY = 1

/**
 * How many extra copies of a change to the world picture the room is owed, and
 * how far apart they go.
 *
 * Three copies over two seconds. The number is small because the transport is a
 * WebSocket and therefore ordered and reliable *while it is up* - what this
 * covers is a server-side drop, which is rare and, on this one tier, permanent.
 * A reconnect is already repaired: the client comes back as an arrival and
 * everybody greets it with their picture.
 */
const PICTURE_AGAIN = 2
const PICTURE_GAP = 1

/**
 * How often the owner says out loud that it is the owner, in seconds.
 *
 * The argument for it being this rather than half a minute is where it is sent.
 */
const OWNING_AGAIN = 2

/** A centimetre is finer than anybody can see and half the characters. */
const round = (v: number) => Math.round(v * 100) / 100

/**
 * Everybody else, drawn.
 *
 * This was an `InstancedMesh` with baked part transforms - one draw call for the
 * whole room, refilled from the buffer every frame. That is the right shape for
 * a level and the wrong one for a person: instances share a single geometry, and
 * a skinned pose is a *different* geometry per body, so nobody could ever move
 * their legs. See ./skinned.
 *
 * What is left here is the pack arithmetic, which is the only part of the old
 * version that knew anything worth keeping: how far above its origin a model
 * stands, and what one cell means in the units it was authored in. `./skinned`
 * does not know what a pack is and should not.
 */
function Peers({
  crowd,
  ids,
  model,
  clips,
  scale,
  faceFor,
  glow,
  host,
}: {
  crowd: { readonly current: Crowd }
  ids: readonly string[]
  model: string
  /** The level's own clips, laid over the pack's - the local body gets these too. */
  clips?: Readonly<Record<string, XpClip>>
  scale: number
  /** This peer's face-slot, made on demand. See the map in `Together`. */
  faceFor: (id: string) => EmoteState
  /** The lights, passed straight through to the crowd. See ./glow. */
  glow?: boolean
  host?: string
}) {
  const pack = splitModel(model)?.pack

  if (ids.length === 0) return null

  return (
    <SkinnedCrowd
      crowd={crowd}
      ids={ids}
      url={modelUrl(model)}
      /*
       * The skeleton these bodies are, derived from the model exactly as the
       * local body derives its own. Without it every co-player was a peep
       * being asked for the dummy's clip names - see `SkinnedCrowd.rig`.
       */
      {...(skeletonOf(model) ? { rig: skeletonOf(model)! } : {})}
      {...(clips ? { carried: clips } : {})}
      // The pack's own idea of a cell, times whatever the document asked for.
      scale={(pack?.scale ?? 1) * scale}
      // World units, because this is the only place both halves are known.
      lift={((pack?.lift ?? 0) + floorOffset(model)) * scale}
      /*
       * Wrapped in `{ current }` rather than handed a ref, because a slot is an
       * object this file owns and the bubble only ever reads `.current`. Making
       * a real ref per peer would mean a hook per peer, which is a hook count
       * that changes when somebody joins - the one thing React refuses outright.
       */
      over={(id) => <EmoteBubble state={{ current: faceFor(id) }} />}
      {...(glow ? { glow } : {})}
      {...(host ? { host } : {})}
    />
  )
}
