'use client'

import { useEffect, useState } from 'react'
import { isDown, MAX_HEALTH, RESPAWN_INVULNERABLE } from '@/app/world/lounge/_sim/combat'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import type { Downfall } from '@/app/world/lounge/_scene/scene-types'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'

/**
 * Health, the dash cooldown, and the screen you get when you run out of the
 * former.
 *
 * Separate from <Hud> rather than folded into it because it is the only part of
 * the interface that changes several times a second under fire, and because it
 * is conditional in a way nothing else is - a solo room or the public showcase
 * renders none of this, and the block counter should not have to know that.
 *
 * State rather than refs, unlike almost everything else in this scene, and that
 * is the right way round: these values change when somebody is hit, not when a
 * frame runs. `healthRef` in ./scene-refs is the loop's copy and the source of
 * truth; this is the number on screen.
 */
export function CombatHud({
  health,
  hurt,
  dashCharging,
  kickCharging,
  hitMarks,
  killedBy,
  onRespawn,
  canRespawn,
  isTouch,
}: {
  health: number
  hurt: boolean
  dashCharging: boolean
  kickCharging: boolean
  hitMarks: { id: string; damage: number; name: string }[]
  killedBy: Downfall | null
  onRespawn: () => void
  /** Which corner is free. On a phone the bottom two are the controls. */
  isTouch: boolean
  /**
   * Whether going down is something you get up from.
   *
   * True in the lounge, where death is not a fact about anything - you dust
   * yourself off and carry on. False in a match, where it is the fact the whole
   * match is about: being knocked out is how you leave it, and a respawn button
   * would mean nobody could ever win.
   */
  canRespawn: boolean
}) {
  const t = worldDict(useLocale()).combat
  const fraction = Math.max(0, Math.min(1, health / MAX_HEALTH))
  const dead = isDown(health)

  return (
    <>
      {/*
        Taking a hit reddens the whole frame.

        Snaps on with no transition and fades out over half a second, which is
        the shape of an impact - the other way round reads as a mood light. Done
        with two durations on one element rather than a keyframe animation, so
        there is nothing to declare in globals.css for one effect.
      */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-[3rem] bg-red-600/40 ${
          hurt ? 'opacity-100 duration-0' : 'opacity-0 transition-opacity duration-500'
        }`}
      />

      {/*
        Bottom left on a mouse. On touch that corner is the thumbstick's zone,
        which is 11rem of it, so the bar goes to the top *left*, tucked under
        the readout chip.

        The two positions it must not take are the ones it has been in: the
        middle of the bottom edge is in front of the thumbs and in front of the
        room, and the middle of the top edge is where a scene puts whatever it
        has to say to the person standing in it - the demo's banner, with the
        switch that turns fighting on, is the case that proved that one. A
        corner is the only place a persistent readout belongs.
      */}
      {!dead && (
        <div
          className={`pointer-events-none absolute w-52 ${
            isTouch
              ? 'left-[var(--hud-edge-x)] top-[calc(var(--hud-edge-top)+3.25rem)]'
              : 'bottom-6 left-6'
          }`}
        >
          <div className="mb-1 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wide text-white/70">
            <span>{t.health}</span>
            <span className={fraction <= 0.25 ? 'text-red-300' : 'text-white/70'}>
              {health}%
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full border border-white/20 bg-black/50 backdrop-blur-sm">
            {/* Colour follows the number rather than being read off a label, so
                "nearly out" is legible from peripheral vision. */}
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${
                fraction > 0.5
                  ? 'bg-emerald-400'
                  : fraction > 0.25
                    ? 'bg-amber-400'
                    : 'bg-red-500'
              }`}
              style={{ width: `${fraction * 100}%` }}
            />
          </div>

          {/* Named for the control that is actually on screen. On a phone
              there is no F to press - there is a Dash button - and telling a
              touch player about a key is telling them about nothing. */}
          <div className="mt-2 flex gap-3 font-mono text-[10px] tracking-wide">
            {dashCharging ? (
              <span className="text-white/35">
                {isTouch ? t.dash : 'F'} · {t.charging}
              </span>
            ) : (
              <span className="text-amber-200/90">
                {isTouch ? t.dash : 'F'} · {t.ready}
              </span>
            )}
            {/* The kick's own line, because it has its own cooldown - one
                readout covering both would have to lie about one of them. */}
            <span className={kickCharging ? 'text-white/35' : 'text-amber-200/90'}>
              {isTouch ? t.kick : 'Q'} · {kickCharging ? t.charging : t.ready}
            </span>
          </div>
        </div>
      )}

      {/*
        What your last few hits did.

        Beside the crosshair and gone in about a second. It exists because the
        victim's health is *theirs* - the number on their bar is a round trip
        away - and without this the moment between connecting and seeing their
        bar move reads as a swing that missed.
      */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 ml-8 -translate-y-1/2 space-y-1">
        {hitMarks.map((mark) => (
          <div
            key={mark.id}
            className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-xs font-medium text-amber-300 backdrop-blur-sm"
          >
            −{mark.damage}% {mark.name}
          </div>
        ))}
      </div>

      {dead && (
        <div className="absolute inset-0 flex items-center justify-center rounded-[3rem] bg-black/75 backdrop-blur-sm">
          <div className="text-center text-white">
            <p className="text-2xl font-medium">{t.wentDown}</p>
            <p className="mt-2 text-sm text-white/60">
              {killedBy?.lava
                ? t.lava
                : killedBy
                  ? fill(t.byPlayer, { name: killedBy.name })
                  : t.takenOut}
            </p>

            {canRespawn ? (
              <>
                <button
                  type="button"
                  onClick={onRespawn}
                  className="mt-6 rounded-full bg-white px-6 py-2 text-sm font-medium text-black transition hover:bg-white/85"
                >
                  {t.respawn}
                </button>

                <p className="mt-3 text-[10px] text-white/40">
                  {fill(t.respawnNote, { n: RESPAWN_INVULNERABLE })}
                </p>
              </>
            ) : (
              /* Out, and staying out. Left standing where you fell rather than
                 removed, so you can watch the rest of it finish. */
              <p className="mt-6 text-sm text-white/70">
                {t.outOfThisOne}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * The kickoff countdown.
 *
 * After a goal the ball is held at the centre spot and contacts are not resolved
 * for `KICKOFF_PAUSE` seconds - see the pause branch in multiplayer.tsx. Without
 * this, that stretch is indistinguishable from lag: the ball is sitting there,
 * you run at it, and nothing happens for no visible reason. The number turns
 * "broken" into "not yet".
 *
 * Correct on every screen, not just the owner's, because the pause travels on
 * the wire as the ball message's `k` - so a client that owns nothing still counts
 * down against the same clock the simulation is actually using.
 *
 * Polled rather than driven from the frame loop: this is DOM outside the
 * <Canvas>, where there is no `useFrame` to hang it on. Four samples a second is
 * plenty for a display that only ever shows whole seconds, and re-rendering a
 * two-node subtree four times a second costs nothing - which is the whole reason
 * the pause is a ref the scene never reads rather than state.
 */
export function KickoffCountdown() {
  const t = worldDict(useLocale()).combat
  const { kickoffRef } = useSceneRefs()
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    // Ceil, so the last whole second is shown as "1" rather than flicking to 0
    // while play is still frozen. React bails out when the value is unchanged,
    // so three of every four of these samples re-render nothing.
    const id = setInterval(() => setSeconds(Math.ceil(kickoffRef.current)), 250)
    return () => clearInterval(id)
  }, [kickoffRef])

  if (seconds <= 0) return null

  return (
    /*
      Above the crosshair rather than on it. Dead centre is where you are aiming,
      and the scoreboard already owns the top of the screen in a battle - this
      sits in the gap between them, and it is gone within ten seconds anyway.

      No `aria-live`: a region that re-announces every second talks over
      everything else a screen reader is trying to say, and the same fact is
      already audible as the game simply not responding to a kick.
    */
    <div className="pointer-events-none absolute left-1/2 top-[34%] -translate-x-1/2 text-center">
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/70">
        {t.kickoffIn}
      </p>
      <p className="font-pixel mt-1 text-6xl leading-none text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.9)]">
        {seconds}
      </p>
    </div>
  )
}

/**
 * The warning that the ball has no living author.
 *
 * Says the one thing the room cannot work out for itself. Every other way a
 * match goes wrong announces itself - a disconnection turns the presence dot
 * red, a lost round trip shows up as a block that snaps back - but a stalled
 * ball owner looks exactly like a game that has decided to ignore you. People
 * kick harder, blame their own connection, and reload. See `stalledRef` in
 * multiplayer.tsx for why presence cannot see it.
 *
 * Polled on the same interval as the countdown, and for the same reason: it is
 * DOM outside the <Canvas>, and a boolean that flips at most once every few
 * seconds does not want a frame loop.
 */
export function HostStalledBadge() {
  const t = worldDict(useLocale()).combat
  const { hostStalledRef } = useSceneRefs()
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setStalled(hostStalledRef.current), 250)
    return () => clearInterval(id)
  }, [hostStalledRef])

  if (!stalled) return null

  return (
    /*
      Top left, clear of the scoreboard the battle room puts top centre and of
      the crosshair. `role="status"` rather than the countdown's silence: this
      one is worth announcing, because it fires once and it is the difference
      between "wait" and "reload".
    */
    <div
      role="status"
      className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-amber-300/40 bg-black/70 px-3 py-1.5 text-xs text-amber-100 backdrop-blur-sm"
    >
      {/* A plug pulled out of its socket: the ball has nobody driving it. */}
      <svg
        viewBox="0 0 16 16"
        width={14}
        height={14}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6.4 2v3M9.6 2v3M4.6 5h6.8v2.2a3.4 3.4 0 0 1-3.4 3.4A3.4 3.4 0 0 1 4.6 7.2V5ZM8 10.6V14" />
        <path d="M2 2l12 12" className="text-amber-300" />
      </svg>
      {t.hostStalled}
    </div>
  )
}
