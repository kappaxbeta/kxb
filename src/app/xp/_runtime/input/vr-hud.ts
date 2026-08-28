/**
 * The HUD, for the case where there is no HUD.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists at all
 * ---------------------------------------------------------------------------
 * `./hud` is DOM, and the note at the top of it is right about why: a handful of
 * numbers that change a few times a second is exactly what React is good at, and
 * putting text into a WebGL context to avoid a re-render would be paying for a
 * font atlas to save nothing.
 *
 * That argument holds until somebody puts a headset on. An immersive session
 * draws only what the renderer draws - the page is still there, and nobody in
 * the headset can see a pixel of it. So the score, the clock, the ammunition and
 * the "you are down for 3" countdown all vanish at precisely the moment they
 * matter most, which is a battle. Reported by the user, and it is not a bug in
 * the HUD: it is the DOM being the wrong surface for one of the two ways this
 * runtime can be watched.
 *
 * So there are two HUDs and they say the same things. This file is the half that
 * decides *what* they say and *where the panel goes*, because both of those are
 * arithmetic and arithmetic can be tested. The drawing is `./vr-panel.tsx`.
 *
 * ---------------------------------------------------------------------------
 * A panel bolted to the face is how you make people ill
 * ---------------------------------------------------------------------------
 * The obvious implementation - parent the panel to the camera - is the one to
 * avoid. A rectangle welded to the head never moves relative to the eye, so it
 * fights every vestibular cue the wearer has: they turn, the world turns, and
 * the thing they are reading does not. It is the single most reliable way to
 * make somebody take a headset off.
 *
 * What works is a panel that is *body*-locked: it follows where you are looking,
 * slowly, and only in yaw. Glance left and it stays put, so you can look past it
 * at the world; turn and walk left and it catches up and settles in front of
 * you. Pitch is deliberately not followed at all - look down at your feet and
 * the panel stays at the horizon rather than sliding down the inside of your
 * visor.
 */

import type { Match } from '@/app/xp/_runtime/match/match'
import type { Run } from '@/app/xp/_runtime/match/race'
import { bindingsFor, VR_JUMP, type VrButton } from '@/app/xp/_runtime/input/vr'

/**
 * How far in front of the wearer the panel sits, in metres.
 *
 * Not centimetres from the nose: a virtual surface closer than about a metre
 * asks the eyes to converge harder than they focus, which is the other reliable
 * way to give somebody a headache in a headset. Two metres is comfortably past
 * that and close enough to read.
 */
export const PANEL_DISTANCE = 2

/**
 * How far below eye level, in metres at `PANEL_DISTANCE`.
 *
 * Below rather than centred, because the middle of the view is where the game
 * is. A HUD in a headset is a thing you glance down at, the way you glance at a
 * dashboard - not a layer the world is behind.
 */
export const PANEL_DROP = 0.75

/**
 * How long the panel takes to catch up with a turn.
 *
 * The one number that decides whether this is comfortable, so it is here with a
 * reason rather than inline. It is pulled in two directions and both of them
 * matter:
 *
 * Long enough that a **glance leaves it behind** - which is the whole point,
 * since a panel that tracked instantly would be the welded one this file exists
 * to avoid. At this value a tenth of a second of looking away moves the panel
 * less than a third of the way, so you can look past it at the world.
 *
 * Short enough that it has **stopped visibly trailing** by the time you have
 * finished turning. The first draft was half again as slow and was still a
 * degree out two full seconds after the wearer stopped moving, which does not
 * read as a comfortable HUD - it reads as one that is broken. Here it is inside
 * a tenth of a degree by then, and most of the way there within a second.
 */
export const PANEL_SETTLE = 0.3

/**
 * Where the panel should be pointing now.
 *
 * Angles in radians here rather than the document's degrees, because both
 * callers are three.js: the head's yaw comes off a camera and the answer goes
 * onto an `Object3D.rotation`. `./camera` owns the conversion at the boundary
 * where a document meets a scene, and this is not that boundary.
 *
 * Frame-rate independent for the same reason `easeSpeed` is, and it matters more
 * here: a headset runs at 72, 90 or 120 Hz depending on the hardware and what it
 * is doing about heat, so a fixed fraction per frame would make the panel drift
 * differently on the same headset from one minute to the next.
 *
 * Turning the short way round, because a wearer who turns past north should not
 * watch the panel travel 350° the other way to meet them. Same fix `lerpAngle`
 * makes in `presence`, in radians.
 */
export function followYaw(panel: number, head: number, delta: number): number {
  if (delta <= 0) return panel
  const turn = Math.PI * 2
  const shortest = ((((head - panel) % turn) + turn * 1.5) % turn) - Math.PI
  return panel + shortest * (1 - Math.exp(-delta / PANEL_SETTLE))
}

/**
 * Where the panel sits, given where it is pointing and where the wearer is.
 *
 * Separate from `followYaw` because they are two different facts - which way it
 * faces, and where it hangs - and a single function returning both would be
 * tested by one caller that only cares about one of them.
 */
export function panelSpot(
  head: { x: number; y: number; z: number },
  yaw: number,
): { x: number; y: number; z: number } {
  return {
    /**
     * The three.js convention, not the document's.
     *
     * A camera at yaw 0 looks down **-z**, which is why this is `-cos` where
     * `./spawn` and `./race` use `+cos`. The two conventions are reconciled by
     * `yawFor` at the document boundary; inside a scene, three's is the one that
     * is true. Getting this backwards puts the HUD behind the wearer, where it
     * is invisible and looks exactly like a HUD that failed to mount.
     */
    x: head.x - Math.sin(yaw) * PANEL_DISTANCE,
    y: head.y - PANEL_DROP,
    z: head.z - Math.cos(yaw) * PANEL_DISTANCE,
  }
}

/** One line of the panel, and how much it wants to be noticed. */
export interface HudLine {
  text: string
  /** `loud` is drawn large. At most one thing on the panel should be. */
  tone: 'loud' | 'plain' | 'quiet'
}

/**
 * What the panel says, from the same state the DOM HUD is given.
 *
 * Deliberately fewer lines than `./hud`. That one can afford a corner of debug
 * readouts because a corner of a monitor is free; a panel two metres in front of
 * somebody's face is not, and every line on it is a line of world they cannot
 * see. So this carries what a *player* needs mid-match - am I alive, what have I
 * got, what is the score, how long left - and nothing a developer wants.
 *
 * The ordering is by how quickly you need it. Being down is first because it is
 * the only line that answers "why can I not do anything".
 */
export function hudLines(state: {
  vitals: { hp?: number; ammo?: number }
  /**
   * The real `Match` and `Run`, not a shape of my own.
   *
   * Deliberate. A panel that took `{ us, them, left }` would compile forever and
   * quietly describe a game this runtime does not play - there is one score, not
   * two, because whose kill it was cannot cross the wire yet. Typed against what
   * the simulation actually produces, the day a second score exists this stops
   * compiling instead of continuing to look right.
   */
  match: Match | null
  run: Run | null
  downFor: number | null
  said: readonly { id: number; text: string }[]
  /**
   * The level's own declared numbers, labelled, in the order it declared them.
   *
   * The panel had no idea these existed, which is survivable for a level
   * counting coins towards a door and fatal for one whose whole loop runs
   * through them: the board game rolls a die into `dice`, and in a headset
   * there was no surface at all that could say what you rolled. The DOM HUD is
   * not one - there is no DOM in a headset.
   */
  tally?: readonly { label: string; value: number }[]
  /**
   * Which side this player is on, and which phase of its round the level is in.
   *
   * Both were added to the page and neither reached here, which is the same
   * omission the tally had and the same reason it matters more: there is no DOM
   * in a headset, so a fact that lives only on the page is a fact somebody
   * wearing one does not have. At a table they are the two questions you ask
   * before every press - *which of these am I* and *what am I meant to do now* -
   * and `allow` answers the second only by a button quietly not working.
   */
  seat?: string
  phase?: string | null
  /**
   * Whose go it is, by colour, and the die that just landed.
   *
   * The same omission again, and the one that matters most at a turn-based
   * table: both were added to the page and neither reached here. *It is red's
   * turn* and *red rolled four* are the two facts a board game produces, and in
   * a headset there was no surface that carried either - so somebody wearing one
   * could see the pieces move and never know whose move it was.
   *
   * `turn` is already resolved to a colour by the caller rather than an account
   * id, because an account id is the one fact about a table nobody sitting at it
   * can see.
   */
  turn?: { seat: string | null; mine: boolean } | null
  rolled?: { seat: string | null; face: number; at: number } | null
}): HudLine[] {
  const lines: HudLine[] = []

  if (state.downFor !== null) {
    lines.push({ text: `DOWN ${state.downFor}`, tone: 'loud' })
  }

  /**
   * The level's numbers, and **the first one is the loud one**.
   *
   * Declaration order deciding which matters most is not a guess: it is the
   * rule `player.keys` already sets, where document order decides which face
   * button a binding lands on and which order the thumb buttons are drawn in.
   * A level that leads with `dice` is a level saying the roll is the thing to
   * look at, and it does not need a second field on `XpField` to say so twice.
   *
   * Above the score rather than below it, and only demoted when somebody is
   * down: at most one thing on a panel should be large, and "why can I not do
   * anything" beats every other question there is.
   */
  /**
   * Who you are and what you are doing, above the numbers.
   *
   * One line rather than two, because a panel two metres from somebody's face
   * pays for every line on it in world they cannot see - and these two are read
   * together anyway. Quiet, because they are context for the loud line rather
   * than the thing that just changed.
   */
  const who = [state.seat, state.phase].filter((one) => one).join('  ·  ')
  if (who.length > 0) lines.push({ text: who.toUpperCase(), tone: 'quiet' })

  /**
   * Whose go it is, loud when it is yours.
   *
   * Above the numbers and above the score, because at a turn-based table it is
   * the question asked before every other one - and *your turn* is the only
   * version of the sentence anybody acts on, so it is the one that gets the
   * emphasis. Somebody else's go is context: you want to know it, you do not
   * want it shouting at you for the minute it lasts.
   */
  if (state.turn) {
    const named = state.turn.seat ? state.turn.seat.toUpperCase() : 'SOMEBODY'
    lines.push({
      text: state.turn.mine ? 'YOUR TURN' : `${named}'S TURN`,
      tone: state.turn.mine ? 'loud' : 'quiet',
    })
  }

  /**
   * And the die, as the sentence rather than the number.
   *
   * `RED ROLLED 4` rather than a bare face, for the reason the page's banner
   * says the same words: the number alone is only useful to whoever threw it,
   * and the whole point of a roll at a table is that everybody watches it. The
   * tally still carries the standing value - this is the *event*.
   */
  if (state.rolled) {
    const named = state.rolled.seat ? state.rolled.seat.toUpperCase() : 'SOMEBODY'
    lines.push({ text: `${named} ROLLED ${state.rolled.face}`, tone: 'plain' })
  }

  state.tally?.forEach((field, at) => {
    lines.push({
      text: `${field.label.toUpperCase()} ${field.value}`,
      tone: at === 0 && state.downFor === null ? 'loud' : 'plain',
    })
  })

  if (state.match) {
    const { score, remaining, phase } = state.match
    const over = phase === 'over'
    lines.push({ text: `SCORE ${score}`, tone: state.downFor === null ? 'loud' : 'plain' })
    // Only while it is running. A clock on a finished match is a number nobody
    // has a use for, and the same rule the DOM HUD follows - the user asked for
    // it there and it is not less true in a headset.
    if (!over && remaining !== null) lines.push({ text: clock(remaining), tone: 'plain' })
    if (over) lines.push({ text: 'FULL TIME', tone: 'plain' })
  }

  if (state.run?.phase === 'running') lines.push({ text: runTime(state.run.time), tone: 'plain' })

  const vitals: string[] = []
  if (state.vitals.hp !== undefined) vitals.push(`HP ${Math.max(0, Math.round(state.vitals.hp))}`)
  if (state.vitals.ammo !== undefined) vitals.push(`AMMO ${state.vitals.ammo}`)
  if (vitals.length > 0) lines.push({ text: vitals.join('   '), tone: 'plain' })

  /**
   * The last thing that happened, and only the last one.
   *
   * The DOM HUD fades five of them up the screen. Five lines of history on a
   * panel in front of somebody's eyes is a wall, and in a headset the thing you
   * missed is usually the thing that just happened - so this takes the newest
   * and drops the rest.
   */
  const latest = state.said.at(-1)
  if (latest) lines.push({ text: latest.text, tone: 'quiet' })

  return lines
}

/** `m:ss`, which is how long is left rather than how long it took. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Hundredths, because a race is won by them. Same shape as `formatRunTime`. */
function runTime(seconds: number): string {
  return `${seconds.toFixed(2)}`
}

/**
 * How long the controls card stays up after somebody puts the headset on.
 *
 * Asked for by the user, and the duration is the part they did not ask about:
 * long enough to read seven short lines without hurrying, short enough that it
 * is gone before it becomes something to dismiss. A card with a close button
 * would need a button to press, and which button that is is exactly what the
 * card is there to explain.
 */
export const CONTROLS_SECONDS = 8

/** What a physical input is called on the card. */
const BUTTON_LABEL: Record<VrButton, string> = {
  a: 'A (right)',
  b: 'B (right)',
  x: 'X (left)',
  y: 'Y (left)',
  triggerR: 'right trigger',
  triggerL: 'left trigger',
  gripL: 'left grip',
  gripR: 'right grip',
}

/**
 * The card shown on arrival: what every input on the controllers does *here*.
 *
 * Built from `bindingsFor` rather than written out, which is the point of it
 * existing in this file. A card that listed the bindings separately would be a
 * second copy of the mapping, and the first thing anybody would notice is that
 * it disagreed with the controllers - in a headset, with no way to check.
 *
 * The unreachable bindings are on the card too. `./vr` is explicit that a fifth
 * key has nowhere to go and that the caller is expected to *say so*; this is the
 * caller, and a headset is exactly where somebody needs to be told that the
 * level binds something they cannot press. Saying nothing would be the silent
 * failure that file was written to prevent.
 */
export function controlLines(keys: readonly { key: string; does: string }[]): HudLine[] {
  const { bound, unreachable } = bindingsFor(keys)

  const lines: HudLine[] = [
    { text: 'CONTROLS', tone: 'loud' },
    { text: 'thumbstick   move', tone: 'plain' },
    { text: `${BUTTON_LABEL[VR_JUMP]}   jump`, tone: 'plain' },
  ]

  for (const binding of bound) {
    lines.push({ text: `${BUTTON_LABEL[binding.button]}   ${binding.does}`, tone: 'plain' })
  }

  for (const does of unreachable) {
    lines.push({ text: `${does} — no button left for this`, tone: 'quiet' })
  }

  return lines
}
