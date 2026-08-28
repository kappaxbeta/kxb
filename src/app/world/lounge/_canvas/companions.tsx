'use client'

import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import {
  applyDamage,
  type DashRuntime,
  dashConnects,
  isDown,
  type KickRuntime,
  kickConnects,
  MAX_HEALTH,
  type Point3,
  rollDamage,
} from '@/app/world/lounge/_sim/combat'
import { ChatBubble } from '@/app/world/_canvas/chat-bubble'
import { HealthBar, showHealth, useHealthBar } from '@/app/world/_canvas/health-bar'
import { Nameplate } from '@/app/world/_canvas/nameplate'
import {
  angleDelta,
  nothingSaid,
  showSaid,
  WALK_SPEED,
} from '@/app/world/_presence/presence-core'
import {
  type Chatter,
  CHATTER_RANGE,
  speak,
  startChatter,
} from '@/domain/world/chatter'

/**
 * Bodies that are nobody.
 *
 * The lounge already draws other people - `RemoteAvatar` in ./multiplayer -
 * and the obvious way to put two hosts in the demo would have been to invent
 * two presence packets and let that code draw them. It is deliberately not what
 * happens here. `RemoteAvatar` is the *rendering half of a network protocol*:
 * every part of it exists because a packet arrived late, or twice, or not at
 * all, and it holds health, teams, dashes and knockdowns because a peer can be
 * in a fight. A host in a demo is none of those things and has no channel to be
 * on, so feeding it fake packets would mean carrying a fake wire format around
 * forever and would put a fictional user id in front of code that is entitled
 * to assume ids are real.
 *
 * What is shared instead is everything that should be: the same model pack, the
 * same nameplate, the same speech bubble, the same easing constants. A host is
 * drawn by the same means as a person and simulated by none of them.
 *
 * Deterministic and self-contained: a host stands where it was put and turns
 * toward whoever is near, so two tabs looking at the demo see the same thing
 * without anybody broadcasting anything - the trick ./autonomy.ts uses at
 * length, applied to something small enough to keep here.
 *
 * The one thing that does happen *to* them is being hit, which the demo turns
 * on with `hittable`. That is local by definition - there is nobody to tell -
 * so it is the one place a body diverges between two tabs, and the only cost of
 * it is that two strangers watching the same demo see Mo fall over at different
 * moments. Neither of them is wrong.
 */

export interface Companion {
  id: string
  name: string
  avatar: string
  /** Where they stand, in world units. Not necessarily a whole cell. */
  x: number
  z: number
  /** Said once, the first time somebody comes near. */
  greeting: string
  /** Said in turn, on a slow loop, for as long as somebody stays. */
  lines: readonly string[]
  /**
   * Said when somebody hits them, in order, the last one repeating.
   *
   * Empty or absent is a body that takes a punch in silence, which is the
   * default: being hittable is a thing the demo turns on, not a thing every
   * scripted body everywhere has to have a script for.
   */
  punchLines?: readonly string[]
  /** Said as they go down, and again as they pick themselves up. */
  downLine?: string
  upLine?: string
}

/**
 * How quickly a body turns toward what it is looking at. Matches `TURN_RATE` in ./roamers.
 *
 * Turning is now the *whole* of the idle. There used to be a slow circular
 * drift on top of it - a body easing a half block left and right on a loop -
 * and it read as floating rather than as standing about, for a reason that is
 * worth writing down: the drift was well under `WALK_SPEED`, so it never
 * promoted the model to its walk clip. What you saw was a figure in an idle
 * pose sliding sideways with its feet still, which is the exact recipe for a
 * body that looks like it is on ice. A host planted on its post and turning to
 * face you is both calmer and more alive.
 */
const TURN_RATE = 6

/**
 * How far a punch knocks a body off its post, in blocks, and how quickly that
 * offset bleeds back.
 *
 * A displacement rather than a velocity, unlike the shove a player takes: a
 * host has no character controller, no collision and no ground to be pushed
 * along, so there is nothing here for `Knockback` to be integrated by. What
 * this has to do is much smaller - say "that landed" in the half second after
 * it did - and a decaying offset does exactly that while keeping a body glued
 * to the spot the world was designed around.
 */
const PUNCH_RECOIL = 0.7

/** Slower than a kick's decay, so the stagger is watchable rather than a twitch. */
const PUNCH_SETTLE = 3.4

/**
 * How long a body stays down before picking itself up, in seconds.
 *
 * Long enough to be a consequence, short enough that a visitor who knocked the
 * only two people in the room over does not spend the rest of the demo alone.
 * No respawn button, unlike a player's: they are the room rather than
 * opponents, and the room comes back by itself.
 */
const FAINT_SECONDS = 7

/** How far over a fainted body tips, and how quickly it gets there. */
const FAINT_TILT = Math.PI / 2
const FAINT_RATE = 7

/**
 * One body, as the punch arbiter sees it.
 *
 * The same shape, and the same reason, as `PeerTransform` in ./multiplayer: the
 * thing that decides who got hit has to know where everybody is *now* and how
 * much they have left, and each body is the only thing that knows where it is
 * standing this frame. So each one publishes itself into a shared map and the
 * arbitration reads it.
 */
interface CompanionBodyState {
  name: string
  /** Where they are standing this frame. Written every frame by their own body. */
  at: Point3
  /**
   * What they have left, out of `MAX_HEALTH`. Zero is fainted.
   *
   * Written by `judgePunches` and read by the body, which is the opposite of
   * the rule combat.ts keeps for players - there, everybody is authoritative
   * over their own health and nobody else's. That rule exists because two
   * clients can disagree; a host is a local fiction with nothing to disagree
   * with, so the arbiter simply keeps the number.
   */
  health: number
  /** Take one: stagger, say something, and go down if that was the last. */
  punch: (dir: { x: number; z: number }, downed: boolean) => void
}

export function Companions({
  companions,
  feetY,
  hittable = false,
  onPunch,
  onShove,
}: {
  companions: readonly Companion[]
  /**
   * The height everybody's feet sit at. One number for the whole cast, because
   * they all stand on the same paving - a body per surface would need the block
   * map, which is a dependency this has no other use for.
   */
  feetY: number
  /**
   * Whether swinging at these bodies does anything.
   *
   * Off by default, and the caller must be sure there is no `<Multiplayer>` in
   * the scene before turning it on: judging a dash *consumes* it (see
   * `judgePunches`), so a room where both this and the peer arbitration are
   * live would have them eating each other's sweeps at random. The demo is the
   * one scene with hosts and no channel, which is exactly why it is the one
   * scene this is on in.
   */
  hittable?: boolean
  /**
   * A charge landed, and what it took off. `downed` is the punch that put them
   * out - the caller uses it to decide whether anything comes back.
   */
  onPunch?: (damage: number, name: string, downed: boolean) => void
  /** A kick landed. No damage, by the same rule as `KICK_RANGE`: a kick shoves. */
  onShove?: (name: string) => void
}) {
  /**
   * The player's eye, and the live dash and kick.
   *
   * From the bundle rather than from props: they are the frame loop's values, and
   * this component both reads them (where is the player) and consumes them
   * (judging a punch clears the sweep). See ./scene-refs.
   */
  const { playerRef, dashRef, kickRef } = useSceneRefs()

  /**
   * Every body, by id, kept across renders.
   *
   * A ref rather than state because it is written from the frame loop: a map
   * that re-rendered the cast every time somebody took a step would be a
   * re-render per frame per host.
   */
  const bodies = useRef(new Map<string, CompanionBodyState>())

  useFrame(() => {
    if (!hittable) return
    judgePunches({
      bodies: bodies.current,
      dash: dashRef.current,
      kick: kickRef.current,
      onPunch,
      onShove,
    })
  })

  return (
    <>
      {companions.map((companion, index) => (
        <CompanionBody
          key={companion.id}
          companion={companion}
          index={index}
          feetY={feetY}
          bodies={bodies}
        />
      ))}
    </>
  )
}

/**
 * Decide which bodies this frame's swing caught, and stagger them.
 *
 * `judgeDash` and `judgeKick` in ./multiplayer, with everything to do with the
 * wire taken out - which is most of them. There is no packet to send and nobody
 * to be authoritative over, so what is left is the arithmetic: the same roll,
 * the same clamp, the same rule that one charge hits each body once.
 *
 * Both flags are cleared whether or not anything was caught, for the reason
 * they are cleared there: one swing is judged once, including on the frames it
 * hits nothing.
 */
function judgePunches({
  bodies,
  dash,
  kick,
  onPunch,
  onShove,
}: {
  bodies: Map<string, CompanionBodyState>
  dash: DashRuntime | null
  kick: KickRuntime | null
  onPunch?: (damage: number, name: string, downed: boolean) => void
  onShove?: (name: string) => void
}) {
  if (dash?.swept) {
    dash.swept = false

    for (const [id, body] of bodies) {
      // One charge hits each body once - `dash.hits` is keyed by whatever the
      // sweep has already caught, and a host id sits in it as happily as a
      // peer's does. Somebody already down is not a target either: there is
      // nothing left to take off them, and charging a body on the floor should
      // not restart its clock.
      if (dash.hits.has(id) || isDown(body.health)) continue
      if (!dashConnects(dash.from, dash.to, body.at)) continue

      dash.hits.add(id)
      const damage = rollDamage()
      body.health = applyDamage(body.health, damage)

      const downed = isDown(body.health)
      body.punch(dash.dir, downed)
      onPunch?.(damage, body.name, downed)
    }
  }

  if (kick?.thrown) {
    kick.thrown = false

    for (const body of bodies.values()) {
      if (isDown(body.health)) continue
      if (!kickConnects(kick.origin, kick.dir, body.at)) continue

      // A kick takes nothing off anybody - see the note on KICK_RANGE. Here
      // that is the whole of it: they stagger, they complain, they stay up.
      body.punch(kick.dir, false)
      onShove?.(body.name)
    }
  }
}

function CompanionBody({
  companion,
  index,
  feetY,
  bodies,
}: {
  companion: Companion
  index: number
  feetY: number
  /** The cast's shared roster, which this body writes itself into. */
  bodies: React.RefObject<Map<string, CompanionBodyState>>
}) {
  /** What "somebody is near" is measured from. See ./scene-refs. */
  const { playerRef } = useSceneRefs()

  const group = useRef<THREE.Group>(null)
  const [clip, setClip] = useState<'idle' | 'walk'>('idle')

  /**
   * The bar over their head - the same one a person gets, from the same file.
   *
   * It stays hidden until they have actually been hit, which is what makes it
   * an answer rather than decoration: a host standing about in a creative-mode
   * room has nothing to report, and the bar appearing is itself the news that
   * this has become a fight.
   */
  const bar = useHealthBar()

  /**
   * How far the last punch shifted them, and how many they have taken.
   *
   * Refs, both of them: the offset is written every frame by the render loop,
   * and the count only ever picks a line - neither is anything React should be
   * asked to draw.
   */
  const recoil = useRef({ x: 0, z: 0 })
  const punches = useRef(0)

  /**
   * The clock reading they went down at, or null while they are on their feet.
   *
   * `performance.now()` rather than the render clock, so it is the same clock
   * `speak` is driven by and the two cannot disagree about how long a body has
   * been lying there.
   */
  const downAt = useRef<number | null>(null)

  /** The body that falls over. Separate, so the nameplate stays upright. */
  const figure = useRef<THREE.Group>(null)

  /**
   * Which way they face with nobody about: back toward the arrival square.
   *
   * So the demo opens on two faces rather than two backs, whatever the entry
   * camera does on the way in.
   */
  const restingYaw = useMemo(
    () => Math.atan2(-companion.x, -companion.z),
    [companion.x, companion.z],
  )

  const yaw = useRef(restingYaw)
  const said = useRef(nothingSaid())
  const chatter = useRef<Chatter>(startChatter(index))

  /** Last drawn ground position, for reading the gait off actual travel. */
  const at = useRef({ x: companion.x, z: companion.z })

  /**
   * The entry this body keeps in the cast's roster.
   *
   * Held rather than rebuilt so `at` is one object the frame loop mutates -
   * `judgePunches` reads it in the same frame, and handing it a fresh position
   * object every frame would be an allocation per host per frame for no gain.
   */
  const entry = useRef<CompanionBodyState>({
    name: companion.name,
    at: { x: companion.x, y: feetY, z: companion.z },
    health: MAX_HEALTH,
    punch: (dir, downed) => {
      recoil.current.x += dir.x * PUNCH_RECOIL
      recoil.current.z += dir.z * PUNCH_RECOIL

      if (downed) {
        downAt.current = performance.now()
        if (companion.downLine) showSaid(said.current, companion.downLine)
        return
      }

      const lines = companion.punchLines ?? []
      if (lines.length > 0) {
        // The last line repeats, so a visitor who keeps swinging keeps getting
        // an answer rather than being met with silence once the script runs
        // out - and the *first* one is the one everybody hears, which is why
        // it is the one worth writing.
        showSaid(said.current, lines[Math.min(punches.current, lines.length - 1)])
      }
      punches.current += 1
    },
  })

  useEffect(() => {
    const roster = bodies.current
    const id = companion.id
    if (!roster) return

    roster.set(id, entry.current)
    return () => {
      roster.delete(id)
    }
  }, [bodies, companion.id])

  useFrame((state, delta) => {
    const node = group.current
    const player = playerRef.current
    if (!node || !player) return

    const now = performance.now()

    /**
     * Back on their feet, after long enough on the floor.
     *
     * Handled here rather than on a timeout, so it is on the same clock as
     * everything else this body does and cannot fire into a scene that has been
     * unmounted from under it. Full health, and the count of punches taken is
     * left alone: somebody who knocks Mo down twice should get further into his
     * script the second time, not start it again.
     */
    const down = downAt.current !== null
    if (down && now - (downAt.current ?? 0) > FAINT_SECONDS * 1000) {
      downAt.current = null
      entry.current.health = MAX_HEALTH
      if (companion.upLine) showSaid(said.current, companion.upLine)
    }

    /**
     * Whatever the last punch shifted them by, bleeding back to nothing.
     *
     * Decayed before it is used rather than after, so the frame a punch lands
     * on draws it at very nearly its full reach - decaying afterwards would
     * spend the first and largest part of the stagger on a frame nobody sees.
     */
    const settle = Math.exp(-PUNCH_SETTLE * delta)
    recoil.current.x *= settle
    recoil.current.z *= settle

    // Planted on their post, plus whatever the last punch moved them by. See
    // the note on TURN_RATE for why there is no idle drift.
    const x = companion.x + recoil.current.x
    const z = companion.z + recoil.current.z

    // Published for `judgePunches`, which runs in the parent's own frame
    // callback and so reads what was written here last frame. A frame of lag on
    // a body that drifts half a block a second is nothing anybody can see, and
    // it is the same lag `<Multiplayer>` judges peers with.
    entry.current.at.x = x
    entry.current.at.y = feetY
    entry.current.at.z = z

    showHealth(bar, entry.current.health)

    const dx = player.x - x
    const dz = player.z - z
    const distance = Math.hypot(dx, dz)
    const company = distance < CHATTER_RANGE

    // Turn to whoever is here, or back to the door when nobody is. The head is
    // the whole of the acknowledgement - there is no path-finding and no
    // approach, because a body that walks up to you in a demo you cannot talk
    // back in reads as a sales pitch rather than as somebody saying hello.
    // A body on the floor keeps the heading it fell with.
    const wanted = company ? Math.atan2(dx, dz) : restingYaw
    if (!down) {
      yaw.current += angleDelta(yaw.current, wanted) * Math.min(1, TURN_RATE * delta)
    }

    node.position.set(x, feetY, z)
    node.rotation.y = yaw.current

    /**
     * The fall, and getting up: the figure tips onto its side and back.
     *
     * On an inner group so the nameplate and the speech bubble stay upright -
     * they are labels attached to a body, not parts of one, and a name lying
     * face down in the paving is a bug rather than a joke. Eased toward the
     * target rather than set, which is what makes both directions readable:
     * they go over in about a fifth of a second and get up in the same.
     */
    const figureNode = figure.current
    if (figureNode) {
      const tilt = down ? FAINT_TILT : 0
      figureNode.rotation.z += (tilt - figureNode.rotation.z) * Math.min(1, FAINT_RATE * delta)
    }

    const travelled = Math.hypot(x - at.current.x, z - at.current.z)
    at.current = { x, z }

    const next = travelled / Math.max(delta, 0.0001) > WALK_SPEED ? 'walk' : 'idle'
    if (next !== clip) setClip(next)

    // Nothing to say while out cold. The bubble keeps whatever they said as
    // they went down, which is the right last word.
    if (down) return

    const line = speak(chatter.current, {
      company,
      now,
      greeting: companion.greeting,
      lines: companion.lines,
    })
    chatter.current = line.chatter
    // Mutated rather than set: `<ChatBubble>` watches the ref and promotes the
    // text to state itself, once per sentence. See its own note on why.
    if (line.text) showSaid(said.current, line.text)
  })

  return (
    <group ref={group} position={[companion.x, feetY, companion.z]}>
      <group ref={figure}>
        <Suspense fallback={null}>
          {/* Not an obstacle to the crosshair, for the same reason a peer is
              not: being unable to place a block because somebody is standing
              where you were aiming is a worse problem than clipping through
              them. */}
          <AvatarModel model={companion.avatar} clip={clip} ignoreRay />
        </Suspense>
      </group>
      {/* Outside <figure>, like a peer's is outside its body: a bar and a name
          over somebody lying on the floor should stay upright and readable. */}
      <HealthBar {...bar} />
      <Nameplate name={companion.name} />
      <ChatBubble state={said} />
    </group>
  )
}
