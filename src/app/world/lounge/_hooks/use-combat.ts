'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyDamage,
  DASH_COOLDOWN,
  isDown,
  KICK_COOLDOWN,
  MAX_HEALTH,
  RESPAWN_INVULNERABLE,
} from '@/app/world/lounge/_sim/combat'
import type { SceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import type { Downfall } from '@/app/world/lounge/_scene/scene-types'
import { play } from '@/lib/audio/engine'

/**
 * Being hurt, going down, and getting back up.
 *
 * Everything about our *own* health in one place, which is the boundary that
 * makes it a hook rather than three hundred lines in the middle of the scene.
 * Health is the one thing in this room with a genuinely split ownership: the ref
 * in the bundle is what the network and the frame loop read, the state here is
 * what the HUD draws, and the rule that keeps them honest - the ref is written
 * first, the state from the ref, never the other way round - is a rule about
 * these lines and nothing else.
 *
 * It takes the ref bundle as an argument rather than reading the context,
 * because a hook is not in the tree: the provider is rendered *by* the scene, so
 * anything the scene calls is above it. See `useCreateSceneRefs`.
 *
 * Nothing here is written to the event log. Dying is not a fact about the lounge -
 * it is a fact about the ten minutes two people spent chasing each other round
 * it, and it should not outlive the tab, for the same reason positions do not.
 * The one exception is a match, which reports our own knockout through
 * `battle.onDefeated`.
 */
export function useCombat({
  refs,
  combat,
  battle,
  spawn,
}: {
  refs: SceneRefs
  /** Whether anybody can hurt anybody here. See the prop on the scene. */
  combat: boolean
  /** Present when this is a match rather than the lounge. */
  battle?: {
    battleId: string
    allies: ReadonlySet<string>
    teams: boolean
    onDefeated: (by?: string) => void
  }
  /** Where a respawn puts the body back. */
  spawn: [number, number, number]
}) {
  const {
    healthRef,
    playerRef,
    teleportedRef,
    dashRef,
    kickRef,
    knockRef,
    kickLungeRef,
    invulnerableUntilRef,
  } = refs

  /**
   * Health, held twice on purpose.
   *
   * `healthRef` in the bundle is the source of truth, because damage arrives
   * from a Realtime callback that has no business reading React state, and
   * because a second hit landing in the same tick has to see the first one. This
   * state exists only so the HUD re-renders - it is written from the ref, never
   * the other way round.
   */
  const [health, setHealth] = useState(MAX_HEALTH)
  const dead = isDown(health)

  /**
   * What put us down, for the respawn screen. Null while alive.
   *
   * Not just a name any more, because the lava is now one of the answers and
   * "The lava dashed you out" is a sentence about nothing. What killed you is
   * the one line that screen has to get right - it is the only account anybody
   * gets of a fight they just lost.
   */
  const [killedBy, setKilledBy] = useState<Downfall | null>(null)

  /** Flipped on for a moment when hit, to redden the screen. */
  const [hurt, setHurt] = useState(false)

  /** Damage we have dealt, shown briefly and then dropped. */
  const [hitMarks, setHitMarks] = useState<{ id: string; damage: number; name: string }[]>([])

  /** True while the dash is cooling down, so the HUD can say so. */
  const [dashCharging, setDashCharging] = useState(false)

  /** The same, for the kick. Separate cooldowns, so separate flags. */
  const [kickCharging, setKickCharging] = useState(false)

  /**
   * Behind a ref for the reason every other callback in this file is: it is
   * read from a Realtime callback, and putting it in `takeDamage`'s dependency
   * array would rebuild the damage handler - and with it the channel effect
   * downstream - every time the roster changed.
   */
  const battleRef = useRef(battle)
  useEffect(() => {
    battleRef.current = battle
  }, [battle])

  const takeDamage = useCallback((damage: number, from: string, lava = false) => {
    const next = applyDamage(healthRef.current, damage)
    healthRef.current = next
    setHealth(next)

    // Snap to red, then let the transition fade it out. Two states rather than
    // a keyframe animation, so there is nothing to define outside this file.
    setHurt(true)
    setTimeout(() => setHurt(false), 70)

    // The audible half of that flash. It matters most in the case the flash is
    // worst at: a hit taken while you are looking somewhere else, or on a
    // screen bright enough that a 70ms red tint does not register at all.
    play('hurt')

    if (isDown(next)) {
      // After the hurt, not instead of it - going down is a blow that landed
      // plus a consequence, and the two sounds say those two things.
      play('defeat')
      setKilledBy({ name: from, lava })
      /**
       * In a match, going down is a fact worth keeping - so it is reported
       * here, at the moment our own health reaches zero, by us and about us.
       *
       * In the lounge it is not: `battle` is undefined, nothing is written,
       * and respawning is the client-side reset it has always been.
       */
      // Nobody gets credit for the lava. It is the room, not an opponent, and a
      // match that logged it as a kill would hand a point to whoever happened
      // to be named in the packet - which for a burn is us.
      battleRef.current?.onDefeated(lava ? undefined : from)
    }
    // The refs are stable for the life of the scene - see `useCreateSceneRefs` -
    // so listing them changes nothing at runtime. They are listed because they
    // arrive here as ordinary destructured variables rather than as `useRef`
    // results, which is the one thing the lint rule cannot see through.
  }, [healthRef])

  /**
   * The lava, billed by the character controller.
   *
   * Routed through the same `takeDamage` as a dash, so there is one place that
   * knows what losing health means - the red flash, the report, the respawn
   * screen. What differs is only the story it tells afterwards.
   */
  const burn = useCallback(
    (damage: number) => takeDamage(damage, 'The lava', true),
    [takeDamage],
  )

  /** Somebody kicked us: hand the impulse to the controller and forget it. */
  const takePush = useCallback((x: number, z: number, lift: number) => {
    const knock = knockRef.current
    /**
     * Replaced rather than accumulated.
     *
     * Two kicks arriving together should not stack into one enormous launch -
     * the second boot is a second boot, not double the first. Taking the later
     * one whole also keeps the direction honest: it is the last thing that
     * happened to you, rather than an average of two shoves you never took.
     */
    knock.x = x
    knock.z = z
    knock.lift = Math.max(knock.lift, lift)
  }, [knockRef])

  const noteHitLanded = useCallback((damage: number, name: string) => {
    // A punch rather than the duller `hurt`, so a scrap tells you which way it
    // is going without reading either health bar.
    play('hit')

    const id = crypto.randomUUID()
    setHitMarks((current) => [...current, { id, damage, name }])
    setTimeout(() => {
      setHitMarks((current) => current.filter((mark) => mark.id !== id))
    }, 1100)
  }, [])


  /** How many charges the hosts have taken, for deciding when one comes back. */
  const punchesThrown = useRef(0)

  /**
   * A charge landed on a host.
   *
   * The same report as a hit on a person - the sound and the floating number -
   * because a host now has health for that number to be about: they go down at
   * zero and get back up a few seconds later. See `judgePunches` in
   * ./companions.
   *
   * And every other punch, one back. That is what the health bar is *for*: with
   * two bodies that cannot hurt you, it would sit at 100% for the whole visit
   * and read as a decoration on a HUD. Skipped on the punch that puts them
   * down, because somebody falling over does not get a parting shot in.
   */
  const notePunch = useCallback(
    (damage: number, name: string, downed: boolean) => {
      noteHitLanded(damage, name)
      if (downed) return

      punchesThrown.current += 1
      if (punchesThrown.current % 2 !== 0) return

      // Under `DASH_DAMAGE_MIN`, deliberately. A host is not an opponent and
      // this is not a duel - it is the room answering back, and it should take
      // a sustained argument with somebody to actually put you down.
      takeDamage(8, name)
    },
    [noteHitLanded, takeDamage],
  )

  /** A kick landed on a host. Takes nothing off them, so it is only a thud. */
  const noteShove = useCallback(() => {
    play('hit')
  }, [])

  const noteDash = useCallback(() => {
    setDashCharging(true)
    setTimeout(() => setDashCharging(false), DASH_COOLDOWN * 1000)
  }, [])

  const noteKick = useCallback(() => {
    setKickCharging(true)
    setTimeout(() => setKickCharging(false), KICK_COOLDOWN * 1000)
    // Restarted rather than advanced, so kicking again mid-lunge throws the
    // body forward from wherever it had got back to instead of being ignored.
    kickLungeRef.current = 0
  }, [kickLungeRef])

  /**
   * Back on your feet, briefly untouchable, and - if asked - back at the spawn
   * point.
   *
   * Deliberately a button and not a timer. Being put down is the one moment the
   * room stops being a place you are wandering around in, and choosing when to
   * walk back into it is the difference between a setback and being yanked.
   *
   * `move` is the whole of the split. Everything here is about the *state* a
   * body is in - full health, nothing queued, nothing shoving it - and only one
   * line is about where that body is standing. Coming back from a knockdown
   * wants both; being handed a clean slate at the start of a fight wants only
   * the first, which the note on the bell below explains.
   *
   * Nothing is written to the event log. Dying is not a fact about the lounge -
   * it is a fact about the ten minutes two people spent chasing each other round
   * it, and it should not outlive the tab, for the same reason positions do not.
   */
  const revive = useCallback(
    (move: boolean) => {
      healthRef.current = MAX_HEALTH
      setHealth(MAX_HEALTH)
      setKilledBy(null)

      if (move) {
        playerRef.current.set(...spawn)
        // Said out loud rather than inferred from how far the body moved. The
        // finish line sweeps the segment between frames, and the one thing that
        // can put a racer on the far side of the line without running there is
        // this. See `FinishLine`, which drops the next segment when it sees it.
        teleportedRef.current = true
      }

      // Cancel anything the corpse had queued, so a dash held down through the
      // death screen does not fire the instant you are back.
      dashRef.current.requested = false
      dashRef.current.timers = { remaining: 0, cooldown: 0 }
      kickRef.current.requested = false
      kickRef.current.cooldown = 0
      kickRef.current.thrown = false

      // And whatever shoved us. Carrying a boot through the death screen would
      // slide the new body off the spawn point the moment it appeared.
      knockRef.current.x = 0
      knockRef.current.z = 0
      knockRef.current.lift = 0

      invulnerableUntilRef.current = performance.now() + RESPAWN_INVULNERABLE * 1000
    },
    [
      spawn,
      dashRef,
      healthRef,
      invulnerableUntilRef,
      kickRef,
      knockRef,
      playerRef,
      teleportedRef,
    ],
  )

  /** The button on the death screen: up, and back at the spawn point. */
  const respawn = useCallback(() => revive(true), [revive])

  /**
   * Back at the door, on request, with everything else left exactly as it is.
   *
   * The escape hatch for a body that cannot move: wedged in the seam between two
   * blocks, sealed in by somebody building around you, at the bottom of a hole
   * with walls too high to jump. The world is editable by everybody in it, so
   * this is not an exotic failure - it is a Tuesday - and without a way out the
   * only one is reloading the page, which is a long way to go to walk again.
   *
   * `spawn` rather than a step aside, and for the same reason the XP runtime's
   * unstick uses the arrival: somebody pressing this cannot move, and the one
   * spot in a world guaranteed to be standable is the one the world puts people
   * down on.
   *
   * Deliberately *not* `revive`. That one is about the state a body is in - full
   * health, spawn protection - and this one is only about where it is standing.
   * Restoring health here would make it a heal button with a teleport attached,
   * which is a thing to press when you are losing a fight rather than when you
   * are stuck in a wall.
   */
  const unstick = useCallback(() => {
    playerRef.current.set(...spawn)
    // Said out loud rather than inferred from the distance, exactly as `revive`
    // does: the finish line sweeps the segment between frames, and a racer put
    // back at the start has not run past anything.
    teleportedRef.current = true

    // Whatever was queued against the old position goes with it. A dash held
    // down while stuck would otherwise fire the instant the body reappears.
    dashRef.current.requested = false
    dashRef.current.timers = { remaining: 0, cooldown: 0 }
    kickRef.current.requested = false
    kickRef.current.cooldown = 0
    kickRef.current.thrown = false
    knockRef.current.x = 0
    knockRef.current.z = 0
    knockRef.current.lift = 0
  }, [spawn, dashRef, kickRef, knockRef, playerRef, teleportedRef])

  /**
   * Everyone starts a match on full.
   *
   * The bell has just rung - `combat` went from off to on - so whatever
   * happened before it does not count. Without this, a scuff picked up while
   * milling about in the lobby would follow you into the fight, and a match
   * that began with somebody on 40% would be decided before it started.
   *
   * Only a *match* is teleported to the spawn point with it. A match has a
   * starting line-up and slots to stand in, so putting everybody on their mark
   * at the bell is the bell doing its job. The lounge has neither: flipping it
   * from creative to battle is somebody deciding the room is now for scrapping,
   * and it used to yank every person in it - mid-build, mid-conversation, from
   * wherever they were standing - back to the origin. `battle` is exactly the
   * difference between the two, and it is already the prop that says "this is a
   * match rather than a room".
   *
   * Keyed on the transition rather than on mount, because the scene is mounted
   * through the whole lobby and only becomes a fight partway through.
   */
  const wasFighting = useRef(combat)
  useEffect(() => {
    if (combat && !wasFighting.current) revive(Boolean(battle))
    wasFighting.current = combat
  }, [combat, revive, battle])

  /**
   * Let go of the mouse when you go down.
   *
   * The respawn button is ordinary DOM and cannot be clicked while the pointer
   * is captured - the same trade the block picker and the image menu already
   * make when they open.
   */
  useEffect(() => {
    if (dead && document.pointerLockElement) document.exitPointerLock()
  }, [dead])
  return {
    /** The number on the bar. `healthRef` is the loop's copy of it. */
    health,
    dead,
    killedBy,
    hurt,
    hitMarks,
    dashCharging,
    kickCharging,
    /** Somebody hit us, or the floor did. The one way health ever goes down. */
    takeDamage,
    /** The lava, billed by the character controller. */
    burn,
    /** Somebody kicked us: hand the impulse to the controller and forget it. */
    takePush,
    /** We hit somebody. Only ever a report - their health is theirs. */
    noteHitLanded,
    notePunch,
    noteShove,
    noteDash,
    noteKick,
    /** The button on the death screen. */
    respawn,
    /** The way out of a body that cannot move. Published to the rail. */
    unstick,
  }
}
