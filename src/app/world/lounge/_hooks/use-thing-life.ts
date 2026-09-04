'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'

import {
  apply,
  drift,
  driving,
  gather,
  PULSE_EVERY,
  stale,
  unheard,
  worthSending,
  type Claim,
  type LiveThing,
  type Pulse,
  type Shot,
  type Watched,
} from '@/domain/thingiverse/live'
import { publishClaims } from '@/app/world/_stores/thing-life-store'
import { putInPocket } from '@/app/world/_stores/pocket-store'
import { filling, stateNamed } from '@/domain/thingiverse/states'
import type { BlueprintSpec } from '@/domain/thingiverse/blueprint'
import type { ThingView } from '@/domain/thingiverse/queries'
import {
  hurtsIt,
  KICK_PRICE,
  stepRoom,
  type Alive,
  type Effects,
  type Life,
  type Signal,
} from '@/app/world/lounge/_sim/thing-life'
import {
  dashConnects,
  DASH_DAMAGE_MAX,
  DASH_DAMAGE_MIN,
  kickConnects,
  type DashRuntime,
  type KickRuntime,
} from '@/app/world/lounge/_sim/combat'

/**
 * Running every machine in the room, or watching somebody else run them.
 *
 * ---------------------------------------------------------------------------
 * Why this is a hook inside the Canvas and not part of `use-things`
 * ---------------------------------------------------------------------------
 * Because it is a frame loop. `use-things` owns rows, commands and a socket -
 * things that change when somebody clicks - and every one of its forty exports
 * is React state, which is right for a shelf and wrong for a burger that is
 * three fifths cooked. Putting a sixty-hertz clock in there would re-render the
 * scene to move a bar two pixels, which is the same argument `SceneRefs` makes
 * at length about the player's own position.
 *
 * So the socket stays there and the clock lives here, and the two meet at two
 * refs and two callbacks (`live`, handed over by `use-things`).
 *
 * ---------------------------------------------------------------------------
 * The one thing that *is* React state, and why
 * ---------------------------------------------------------------------------
 * `states` - which named state each thing is in. It has to be, because it
 * decides which *model* is drawn, and swapping a glTF is a render rather than a
 * matrix write. It is set only when a state actually changes, which for a room
 * of furniture is a few times a minute, so the re-render it costs is the one it
 * was always going to cost.
 *
 * Everything else - health, the fill bar, what is on the table - is read out of
 * `livesRef` by whoever draws it, once a frame, allocating nothing.
 */
export function useThingLife({
  things,
  live,
  playerRef,
  onKill,
  peersRef,
  dashRef,
  kickRef,
  fighting,
}: {
  things: readonly ThingView[]
  /**
   * The wire, from `use-things`, or absent.
   *
   * Absent in every scene that draws things without anybody to share them
   * with - the composer's stage, a still, the showcase. Those scenes still want
   * a burger that looks like a burger, so the machines are *not* skipped: they
   * run locally, drive nothing over a socket, and elect nobody. That is the
   * same shape `onMoved` already has here, and for the same reason - a room
   * with nobody in it is not a broken room.
   */
  live?: {
    conn: string
    /** Every tab on the topic, from the channel's own presence. See `elect`. */
    roomRef: React.RefObject<string[]>
    pulseRef: React.RefObject<Pulse | null>
    claimsRef: React.RefObject<Claim[]>
    pulse: (message: Pulse) => void
    claim: (message: Claim) => void
  }
  /** Our own body, for everything that asks how close somebody is. */
  playerRef?: React.RefObject<THREE.Vector3 | null>
  /**
   * We broke something that had health, and it was ours to be paid for.
   *
   * Called with the thing's id, at most once per thing - a thing reaches zero
   * once. Absent in every scene that is not a room somebody is playing in: the
   * composer's stage and the showcase break crates all day and nobody is owed
   * anything for it, which is the same shape `onMoved` and `live` already have.
   *
   * Whether the kill is actually *worth* anything is not decided here. The
   * server reads the blueprint's price and pays only when it cost more to
   * summon than the kill pays - see `THING_KILL`.
   */
  onKill?: (thingId: string) => void
  /** Our own charge and our own shove, for hitting things with them. */
  dashRef?: React.RefObject<DashRuntime>
  kickRef?: React.RefObject<KickRuntime>
  /**
   * Everybody else's, as drawn.
   *
   * `SceneRefs.transformsRef`. Absent in a scene with no presence - the
   * composer's stage, a still - which is a scene with one body in it.
   */
  peersRef?: React.RefObject<Map<string, { current: { x: number; y: number; z: number } }> | null>
  /**
   * Whether hitting things is a thing that can happen here.
   *
   * The rule `./fight` states and declines to enforce: a fight block means
   * nothing in a creative world, because in creative mode the same E that
   * swings picks the crate up to move it. Passed in rather than read, because
   * the mode is the room's fact and this hook is handed a list of rows.
   */
  fighting: boolean
}) {
  /** What each thing is doing, if we are the one deciding. */
  const livesRef = useRef(new Map<string, Life>())
  /** What each thing is doing, if somebody else is. */
  const watchedRef = useRef(new Map<string, Watched>())

  /**
   * Which named state each thing is in.
   *
   * The ref is the working copy and the state is the published one, written
   * only from inside the frame loop - never synced back during render, which is
   * a ref write React rightly refuses. They cannot drift, because there is
   * exactly one writer and it sets both in the same breath.
   */
  const [states, setStates] = useState<Readonly<Record<string, string>>>({})
  const statesRef = useRef<Readonly<Record<string, string>>>({})

  /**
   * What is standing *on* each thing: socket, then the item's word.
   *
   * Published as render state for the same reason `states` is, and it is the
   * same reason twice: what changes is which *model* is drawn, and swapping a
   * glTF is a render rather than a matrix write. A bun landing on a board is a
   * few times a minute in a busy kitchen and never at all in a room with no
   * kitchen in it, so the re-render it costs is the one it was always going to
   * cost - and everything that moves per frame (the bar, the health) stays in
   * `livesRef` where nothing re-renders for it.
   *
   * Flat rather than a `Map` of `Map`s so that the value can be compared and
   * handed to a component without either side owning a mutable thing the frame
   * loop is still writing to.
   */
  const [held, setHeld] = useState<Readonly<Record<string, readonly [string, string][]>>>({})
  const heldRef = useRef<Readonly<Record<string, readonly [string, string][]>>>({})

  /**
   * Words shouted last frame.
   *
   * Held for a frame on purpose - see the note on `Pulse.said`: a signal and
   * the change that caused it have to reach the room together, or somebody sees
   * the bell ring before the cooker finished.
   */
  const saidRef = useRef<Signal[]>([])
  const sincePulse = useRef(0)
  const clock = useRef(0)

  /**
   * The things, as the simulation needs them.
   *
   * Rebuilt when the rows change rather than every frame, because it is a map
   * over up to sixty-four rows and the frame loop should allocate nothing. A
   * row with no blueprint yet is skipped for the same reason the renderer skips
   * it: there is nothing to be.
   */
  const alive = useMemo<Alive[]>(() => {
    const out: Alive[] = []
    for (const thing of things) {
      const spec: BlueprintSpec | undefined = thing.blueprint?.spec
      if (!spec) continue
      if (!spec.states && !spec.fight && !spec.craft && !spec.motion) continue
      out.push({
        id: thing.id,
        at: { x: thing.x, y: thing.y, z: thing.z },
        states: spec.states,
        // Whatever a fight block says, nothing can be hit in a room where
        // nobody can swing. See `fighting`.
        fight: fighting ? spec.fight : undefined,
        craft: spec.craft,
        /*
          How far this one's shouts carry, and what they are wired to. The
          instance's, not its kind's - the same place `blocking` and `body`
          overrides come from, and for the same reason: two of the same button
          in two corridors are wired to two different doors.
        */
        motion: spec.motion,
        reach: thing.tuning.reach,
        wires: thing.tuning.wires,
      })
    }
    return out
  }, [things, fighting])

  /** What one thing is doing, whoever is deciding it. Read by the renderer. */
  const readLife = useCallback((id: string): Life | undefined => {
    const mine = livesRef.current.get(id)
    if (mine) return mine
    const theirs = watchedRef.current.get(id)
    if (!theirs) return undefined
    // A watcher's belief, in the shape the drawing code already reads. Built
    // here rather than stored that way so there is exactly one type flowing
    // into the renderer, and the renderer never has to ask who is driving.
    return {
      standing: theirs.state === undefined ? undefined : { state: theirs.state, since: theirs.since },
      health: theirs.health,
      slots: new Map(theirs.slots),
      cooling: 0,
      phase: theirs.phase,
    }
  }, [])

  /**
   * What is on a thing right now, for the key handler outside the Canvas.
   *
   * A second reader beside `readLife` rather than exposing the whole `Life`,
   * because the caller wants one question answered - what would G do at this
   * table - and `reachFor` takes exactly this map and nothing else.
   */
  const slotsOn = useCallback(
    (id: string): ReadonlyMap<string, string> => readLife(id)?.slots ?? EMPTY_SLOTS,
    [readLife],
  )

  /**
   * Say what you just did.
   *
   * Sent to the driver *and* applied locally when we are the driver, which is
   * the same call either way - `stepRoom` reads its own queue. That symmetry is
   * what stops the two paths drifting: there is no "if I am driving, do it
   * differently" branch anywhere above this line.
   */
  const claim = useCallback(
    (message: Claim) => {
      // Nobody to tell, and nobody else to be wrong: a scene with no wire is a
      // scene where we are the only client, so every claim is ours to apply.
      if (!live || driving(room(live), live.conn)) {
        loneClaims.current.push(message)
        return
      }
      live.claim(message)
    },
    [live],
  )

  /** Claims with nowhere to go, for a scene with no wire and for our own. */
  const loneClaims = useRef<Claim[]>([])

  /** The last heartbeat we acted on. See the note where it is read. */
  const applied = useRef<Pulse | null>(null)

  /** The cooldown a kick had last time we judged one. See `swing`. */
  const lastKick = useRef(0)

  /** Who got what this pulse, reused between frames rather than rebuilt. */
  const gave = useRef<(readonly [string, string])[]>([]).current
  /** Kills to hand out on the next pulse. See `Pulse.broke`. */
  const broke = useRef<(readonly [string, string])[]>([]).current

  /**
   * Shots fired since the last heartbeat, waiting to go out.
   *
   * Separate from `firedRef`, which is what *this* client draws: one is drained
   * by the renderer every frame and the other by the pulse four times a second,
   * and sharing an array would mean whichever ran first emptied it for the
   * other.
   */
  const pendingShots = useRef<{ i: string; to: string }[]>([]).current

  /**
   * The bodies handed to the simulation, reused between frames.
   *
   * Refilled rather than rebuilt, because this runs sixty times a second over
   * everybody in the room and the frame loop must not make garbage - the same
   * rule `advance` keeps for the poses it reads.
   */
  const bodies = useRef<{ id: string; at: { x: number; y: number; z: number } }[]>([]).current

  /**
   * Say where a claim goes, for as long as this scene is mounted.
   *
   * Published rather than returned, because the callers are `keydown` handlers
   * outside the Canvas - see `thing-life-store`. Cleared on the way out, so a
   * torn-down scene stops collecting claims nobody will drain.
   */
  useEffect(() => {
    publishClaims(claim, slotsOn, live?.conn ?? 'me')
    return () => publishClaims(null)
  }, [claim, slotsOn, live])

  /** Whatever the machines did this frame, for whoever wants to draw it. */
  const effectsRef = useRef<Effects | null>(null)

  /**
   * Shots waiting to be drawn, drained by whoever draws them.
   *
   * A queue rather than a piece of state, and it is the same argument the bar
   * makes: a bullet is a thing that happens, the drawing of it is a frame loop,
   * and a `setState` per shot would re-render the room to start an animation.
   * Whoever draws them takes them out; anything nobody drained by the next
   * frame is dropped by the drain rather than growing forever.
   *
   * Filled on both paths - our own shots the frame we decide them, and the
   * driver's the frame we hear about them - so the code that draws one does not
   * know or care which client fired it.
   */
  const firedRef = useRef<Shot[]>([])

  /**
   * Take what is in it, leaving it empty.
   *
   * A callback rather than the ref itself, because the ref belongs to this hook
   * and a reader that emptied it would be writing through a prop - which the
   * compiler refuses, and is refusing something real: two readers of one queue,
   * each clearing it, is a shot one of them never sees. The same shape the
   * watcher's pulse already takes, one screen down.
   */
  const takeShots = useCallback((): Shot[] => {
    const queue = firedRef.current
    if (queue.length === 0) return NO_SHOTS
    return queue.splice(0, queue.length)
  }, [])

  useFrame((_, dt) => {
    // A long frame is a tab that was in the background. Clamping rather than
    // letting it through, because a burger that cooked for the eight minutes
    // somebody spent in another tab is a burger that was never watched - and
    // the alternative, a machine that fast-forwards on focus, is a room that
    // visibly lurches when you come back to it.
    const step = Math.min(dt, 0.25)
    clock.current += step

    // Our own charge and our own shove, judged against the things in the room
    // before the queue is drained - so a hit landed this frame is a hit this
    // frame's step sees, rather than one that waits for the next.
    if (fighting) swing(alive, dashRef?.current, kickRef?.current, lastKick, claim)

    // Aliased to locals before anything is drained: the queues are refs handed
    // to a callback, and the compiler will not have them written through the
    // names it can see being captured.
    const ours = loneClaims.current
    const claims = live ? live.claimsRef.current : ours
    if (live && ours.length > 0) {
      claims.push(...ours)
      ours.splice(0, ours.length)
    }
    const iDrive = !live || driving(room(live), live.conn)

    if (iDrive) {
      /*
        Everybody in the room, not just us.

        Our own eye, plus every peer's *drawn* pose out of `transformsRef` -
        which is the interpolated position <Multiplayer> publishes for the
        avatars, and is the right one: what a turret should react to is where
        somebody appears to be standing. Null in a scene with no presence,
        which is a scene where we are the only body there is.
      */
      const me = playerRef?.current
      bodies.length = 0
      if (me) bodies.push({ id: 'me', at: { x: me.x, y: me.y, z: me.z } })
      for (const [id, peer] of peersRef?.current ?? []) {
        bodies.push({ id, at: { x: peer.current.x, y: peer.current.y, z: peer.current.z } })
      }

      const effects = stepRoom(alive, livesRef.current, bodies, claims, step, saidRef.current)
      effectsRef.current = effects
      saidRef.current = effects.said
      watchedRef.current.clear()

      /*
        Handing over what came off a table.

        Ours goes straight into the pocket - we decided it, so there is nothing
        to wait for. Everybody else's rides the next heartbeat, which is what
        makes a take exactly-once: only the client the driver *named* pockets
        it, so two people reaching for one patty end with one patty. See
        `Pulse.gave`.
      */
      gave.length = 0
      for (const one of effects.took) {
        if (one.by === null || one.by === (live?.conn ?? 'me')) putInPocket(one.item)
        else gave.push([one.by, one.item] as const)
      }

      /*
        Paying for what somebody broke.

        The same handover `gave` makes, and for the same reason: the driver is
        the only client that knows a thing reached zero, and the person who
        earned the coin is usually somebody else. Ours is claimed here; theirs
        rides the next pulse and is claimed by the client the driver named.

        A break with no `by` pays nobody. A crate that fell to a bump is not
        something anybody is owed for, and crediting the driver would mean a
        thing paid its own owner for being smashed by a guest.
      */
      broke.length = 0
      for (const one of effects.broke) {
        if (one.by === null) continue
        if (one.by === (live?.conn ?? 'me')) onKill?.(one.id)
        else broke.push([one.by, one.id] as const)
      }

      /*
        Ours, drawn at once and sent on the next heartbeat.

        Translated out of the simulation's own name for us: `stepRoom` calls the
        driver's body `me`, and a packet saying `me` would name a different
        person on every machine that read it.
      */
      for (const shot of effects.shots) {
        const at = shot.toward === 'me' ? (live?.conn ?? 'me') : shot.toward
        if (!at) continue
        const fired = { i: shot.from, to: at }
        firedRef.current.push(fired)
        pendingShots.push(fired)
      }

      sincePulse.current += step
      if (live && sincePulse.current >= PULSE_EVERY) {
        sincePulse.current = 0
        const payload: LiveThing[] = []
        for (const thing of alive) {
          const life = livesRef.current.get(thing.id)
          if (!life) continue
          payload.push({
            i: thing.id,
            ...(life.standing ? { s: life.standing.state, t: round(life.standing.since) } : {}),
            ...(life.health === undefined ? {} : { h: life.health }),
            ...(life.slots.size > 0 ? { o: [...life.slots.entries()] } : {}),
            // Only for the things that go anywhere. Rounded like every other
            // number on this packet: nobody can see a hundredth of a second of
            // a lift, and shorter numbers are smaller frames four times a second.
            ...(thing.motion ? { p: round(life.phase) } : {}),
          })
        }
        /*
          A shot forces a heartbeat even in a room where nothing else has
          anything to say. `worthSending` is about *state* - a room of plain
          furniture is a room with nothing to publish - and a spike trap with no
          machine and no health is exactly that room right up until it fires.
        */
        if (worthSending(payload) || pendingShots.length > 0) {
          live.pulse({
            d: live.conn,
            things: payload,
            /*
              Words only, because that is all a watcher does with them: it draws
              what the driver decided and steps no machine of its own, so who
              shouted a word - which is what the *delivery* rule needs, see
              `earshot` - is a fact that never leaves the driver.
            */
            ...(effects.said.length > 0
              ? { said: effects.said.map((signal) => signal.word) }
              : {}),
            ...(gave.length > 0 ? { gave: [...gave] } : {}),
            ...(broke.length > 0 ? { broke: [...broke] } : {}),
            ...(pendingShots.length > 0 ? { shots: [...pendingShots] } : {}),
          })
          pendingShots.length = 0
        }
      }
    } else {
      // Watching. The clock runs so the bar moves smoothly; nothing else does.
      // See the note in `./live` about why a watcher must not take the change.
      /*
        Compared by identity rather than cleared after reading. The obvious
        version writes `null` back into the ref, and that ref belongs to
        `use-things` - writing through a prop is exactly the aliasing React's
        compiler refuses, and it is refusing something real: two readers of one
        queue, each clearing it, is a packet one of them never sees. Remembering
        which object we have already applied needs no write at all.
      */
      const heard = live?.pulseRef.current ?? null
      if (heard && heard !== applied.current) {
        applied.current = heard
        for (const one of heard.things) watchedRef.current.set(one.i, apply(one, clock.current))
        // What the driver decided we got. The only way an item reaches a
        // watcher's pocket - see `Pulse.gave`.
        /*
          A kill the driver says was ours. Claimed here rather than where it
          happened, because it happened on somebody else's machine - see
          `Pulse.broke`.
        */
        for (const [who, thingId] of heard.broke ?? []) {
          if (who === (live?.conn ?? 'me')) onKill?.(thingId)
        }

        for (const [who, item] of heard.gave ?? []) {
          if (who === live?.conn) putInPocket(item)
        }
        // Every shot is drawn by everybody; only the one it names pays for it,
        // which is decided by whoever draws them. See `Pulse.shots`.
        for (const shot of heard.shots ?? []) firedRef.current.push(shot)
      }
      for (const [id, was] of watchedRef.current) {
        if (!stale(was, clock.current)) watchedRef.current.set(id, drift(was, step))
      }
      livesRef.current.clear()
    }

    claims.splice(0, claims.length)

    // Which model each thing wears. Set only when it actually changed, which is
    // what keeps a sixty-hertz loop from re-rendering a scene sixty times.
    let changed = false
    const next: Record<string, string> = {}
    for (const thing of alive) {
      if (!thing.states) continue
      const life = iDrive ? livesRef.current.get(thing.id) : undefined
      const name = iDrive
        ? life?.standing?.state
        : watchedRef.current.get(thing.id)?.state
      if (!name) continue
      next[thing.id] = name
      if (statesRef.current[thing.id] !== name) changed = true
    }
    if (changed || Object.keys(next).length !== Object.keys(statesRef.current).length) {
      statesRef.current = next
      setStates(next)
    }

    /*
      And what is on each of them, by the same rule and for the same reason.

      Read out of the driver's own lives or out of what the driver last said,
      exactly as the state above is - a watcher draws the bun on the board
      because the pulse carries the slots (see `LiveThing.o`), not because it
      worked out that somebody put one there.

      Things holding nothing are left out rather than written as an empty list,
      so the common room - no kitchen, no rack - compares as `{}` against `{}`
      and never sets state at all.
    */
    let onChanged = false
    let onCount = 0
    const on: Record<string, readonly [string, string][]> = {}
    for (const thing of alive) {
      const slots = iDrive
        ? livesRef.current.get(thing.id)?.slots
        : watchedRef.current.get(thing.id)?.slots
      if (!slots || slots.size === 0) continue
      onCount += 1
      const was = heldRef.current[thing.id]
      const now: [string, string][] = [...slots.entries()]
      on[thing.id] = now
      if (
        !was ||
        was.length !== now.length ||
        now.some(([socket, item], index) => was[index][0] !== socket || was[index][1] !== item)
      ) {
        onChanged = true
      }
    }
    if (onChanged || onCount !== Object.keys(heldRef.current).length) {
      heldRef.current = on
      setHeld(on)
    }
  })

  return { states, held, readLife, slotsOn, claim, effectsRef, takeShots, livesRef }
}

/** Shared, so draining an empty queue allocates nothing sixty times a second. */
const NO_SHOTS: Shot[] = []

/**
 * The election's candidates: everybody on the topic, and us.
 *
 * Ourselves added rather than assumed present, because presence takes a beat to
 * sync after subscribing and a room that briefly contains nobody would elect
 * nobody - which is a room where every machine stops for a frame or two on
 * load. Deduplication is not worth the Set: `elect` takes a minimum, and a
 * duplicate of the smallest is still the smallest.
 */
function room(live: { conn: string; roomRef: React.RefObject<string[]> }): string[] {
  return [...(live.roomRef.current ?? []), live.conn]
}

/** How far a fill bar has got, for whoever is drawing one. */
export function fillOf(spec: BlueprintSpec, life: Life | undefined): number | null {
  if (!spec.states || !life?.standing) return null
  return filling(spec.states, life.standing)
}

/** The state a thing is in, by name, or undefined for a thing with no machine. */
export function stateOf(spec: BlueprintSpec, name: string | undefined) {
  if (!spec.states || !name) return undefined
  return stateNamed(spec.states, name)
}

/** A table with nothing on it, shared rather than allocated per miss. */
const EMPTY_SLOTS: ReadonlyMap<string, string> = new Map()

/** Two decimals. A clock nobody typed should not fill a packet with digits. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

export { unheard, gather }

/**
 * Hitting things with the charge and the shove you already had.
 *
 * ---------------------------------------------------------------------------
 * Why this is here and not beside the loop that hits *people*
 * ---------------------------------------------------------------------------
 * That loop lives in `multiplayer.tsx` and walks the peer transforms, which is
 * the only list it has. Things are not in it, and putting them there would mean
 * handing the channel a second list it has no other use for - and a channel
 * that knows about furniture is one that has to be told when furniture changes.
 *
 * The geometry is the same function either way (`dashConnects`, `kickConnects`),
 * which is the part that had to be shared and is.
 *
 * ---------------------------------------------------------------------------
 * Two different latches, because the two runtimes offer different ones
 * ---------------------------------------------------------------------------
 * A dash carries `hits`, the set of who this charge has already caught, and
 * reusing it is exact: thing ids are uuids and peer ids are not, so one set
 * holds both without collision, and "one charge hits each thing once" is the
 * rule it already enforces for people. It also means this never touches
 * `swept`, which `multiplayer.tsx` clears - two consumers of one flag is a race
 * decided by whichever frame callback React happens to run first.
 *
 * A kick carries no such set, and its `thrown` flag has that same problem. What
 * it does have is a cooldown *set* the frame it lands, so a rise in it is
 * exactly one kick. That edge is ours alone to read.
 */
function swing(
  things: readonly Alive[],
  dash: DashRuntime | null | undefined,
  kick: KickRuntime | null | undefined,
  lastKick: React.RefObject<number>,
  claim: (claim: Claim) => void,
): void {
  if (dash && dash.timers.remaining > 0) {
    for (const thing of things) {
      if (!hurtsIt(thing, 'dash') || dash.hits.has(thing.id)) continue
      if (!dashConnects(dash.from, dash.to, thing.at)) continue
      dash.hits.add(thing.id)
      // Rolled rather than taken as a constant, so a crate and a person are
      // worth the same swing - which is what makes "a crate takes three dashes"
      // arithmetic somebody can do while looking at it.
      claim({
        i: thing.id,
        hit: Math.round(DASH_DAMAGE_MIN + Math.random() * (DASH_DAMAGE_MAX - DASH_DAMAGE_MIN)),
      })
    }
  }

  if (!kick) return
  const rose = kick.cooldown > lastKick.current
  lastKick.current = kick.cooldown
  if (!rose) return

  for (const thing of things) {
    if (!hurtsIt(thing, 'kick')) continue
    if (!kickConnects(kick.origin, kick.dir, thing.at)) continue
    claim({ i: thing.id, hit: KICK_PRICE })
  }
}
