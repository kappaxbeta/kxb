'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import type { XpHost } from '@kxb/xp/host'

import { NO_INTENT, RING_HALF, gapOf, type Corner, type Fight, type FightEvent } from '../rules/fight'
import { characterFor } from '../art/characters'
import { joinBoxing, type BoxingSession } from '../net/session'
import { reportFight } from '../net/arbiter'

import { Boxer, Footprint } from './boxer'
import { FLOOR, Lights, Stadium } from './stadium'
import {
  Backgrounded,
  Callout,
  Hud,
  Lobby,
  Waiting,
  readoutOf,
  useHidden,
  type Readout,
} from './hud'
import { pad } from './keys'
import { TouchControls, useCoarse } from './touch'
import type { Ears, EarsFor } from './ears'
import { WordsProvider, useWords } from './words-context'
// Aliased: this file already has a `say` - the callout in the middle of the
// screen - and two of them one scope apart is a bug waiting to be written.
import { say as phrase } from './words'

/**
 * A boxing match, on a canvas, over an `XpHost`.
 *
 * ---------------------------------------------------------------------------
 * What this file is and is not
 * ---------------------------------------------------------------------------
 * It is the *host* half. Everything about how a fight works lives in
 * `@kxb/boxing` and is tested with no browser at all; this reads a keyboard,
 * draws two quads and a voxel ring, and calls `session.step` once a frame. If
 * something here is deciding a rule, it is in the wrong file.
 *
 * ---------------------------------------------------------------------------
 * Everything from outside arrives as a prop
 * ---------------------------------------------------------------------------
 * The transport, the identity, the clock and the speaker are all handed in.
 * This file names no app, imports no `@/` and knows no URL - which is what
 * makes "lift `packages/boxing` out and drop it in another project" a true
 * sentence rather than an aspiration.
 *
 * Concretely: this app passes a `BroadcastChannel` host, so two tabs are two
 * fighters with no server and no account. Passing the Supabase Realtime host
 * instead makes the same game playable between two machines, and nothing below
 * this comment changes.
 *
 * ---------------------------------------------------------------------------
 * The fight is mutated, so React must not own it
 * ---------------------------------------------------------------------------
 * `stepFight` writes into the same object sixty times a second, which is what
 * makes it cheap and what makes it invisible to React. So the fight lives in a
 * ref, the scene reads it inside `useFrame`, and the only thing that crosses
 * into React state is a small snapshot for the HUD at 10Hz. Putting the fight
 * in `useState` would be six hundred renders a second to move a boxer sideways.
 */

/** How often the HUD's numbers are lifted out of the simulation. */
const READOUT_HZ = 10

export interface BoxingGameProps {
  /**
   * Everything this game cannot supply for itself: who you are, how a message
   * reaches the other fighter, what time it is, and somewhere a result can be
   * kept. `@kxb/xp/host` declares the shape; the host implements it.
   */
  host: XpHost
  /** The room. Two clients on the same topic are two fighters. */
  topic: string
  /**
   * Where the host serves this package's `assets/` from. No trailing slash.
   *
   * A prop rather than a constant because the package does not know one
   * deployment's URL layout - see `../art/characters.ts`. Copy `assets/`
   * anywhere public and say where it went.
   */
  assets?: string
  /**
   * Somewhere to make a noise, or nothing.
   *
   * Optional and it means it: sound is the host's, exactly like the transport,
   * and a host with no audio system gets a silent fight rather than a broken
   * one. `./ears` is the port and this app's implementation is thirty lines.
   */
  ears?: EarsFor
  /** Force the thumb controls on, for a desktop that wants to see them. */
  forceTouch?: boolean
  /**
   * Whether whatever mounted this has a lobby of its own. See `FrameProps`.
   *
   * `null` - the default - means it has not, so this game runs one.
   */
  started?: boolean | null
  /**
   * What the host decided about this match. See `FrameProps.match`.
   *
   * Only `timeLimit` is used, and it is read as the whole match's fighting
   * time: three minutes is three one-minute rounds, which is both what a
   * boxing match is and what this game already defaulted to.
   *
   * `scoreLimit` is deliberately ignored. A boxing match is scored on the cards
   * - ten-point must, a knockdown worth two - and "first to five" is not a
   * thing that can be mapped onto it without inventing a different sport. A
   * setting quietly reinterpreted is worse than one plainly not supported.
   */
  match?: { timeLimit: number | null; scoreLimit: number | null }
  /**
   * Which language to say everything in, as a two-letter tag.
   *
   * The host's, like the clock and the transport - it is the one thing about a
   * reader that a game cannot work out for itself and a platform already knows.
   * The *copy* is this package's; see `./words` for where that line falls and
   * why it does not fall the other way round.
   *
   * Anything unrecognised, and absence, is English.
   */
  locale?: string | null
  /**
   * Let whatever is behind the canvas show through.
   *
   * Default, and the default is the interesting half. A game is nearly always
   * mounted *inside* something - a match room with its own background, a header
   * and a rail - and one that paints an opaque rectangle in the middle of that
   * is a hole cut in the page rather than a game sitting in it.
   *
   * What it costs is the fog. A transparent canvas has nothing to fade the far
   * seats *into*, so the fog is dropped rather than left fading to a colour the
   * page may not be - which is why this is a prop and not a CSS class somebody
   * puts on the wrapper.
   */
  transparent?: boolean
}

export function BoxingGame({
  host,
  topic,
  assets = '/boxing',
  ears,
  forceTouch = false,
  transparent = true,
  started = null,
  match,
  locale = null,
}: BoxingGameProps) {
  const [session, setSession] = useState<BoxingSession | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let joined: BoxingSession | null = null

    joinBoxing({ host, topic, matchSeconds: match?.timeLimit ?? null })
      .then((made) => {
        if (!live) {
          made.leave()
          return
        }
        joined = made
        setSession(made)
      })
      .catch((reason: unknown) => {
        if (live) setFailed(reason instanceof Error ? reason.message : String(reason))
      })

    return () => {
      live = false
      joined?.leave()
    }
  }, [host, topic, match?.timeLimit])

  /*
    One provider around all three outcomes, not around the fight.

    The two screens above the fight - the failure and the lacing-up - are the
    ones a reader is most likely to be looking at when something has gone wrong,
    and a game that only translated itself once it had successfully joined would
    print its one English sentence at exactly the worst moment.
  */
  return (
    <WordsProvider locale={locale}>
      {failed ? (
        <Failed reason={failed} />
      ) : !session ? (
        <LacingUp />
      ) : (
        <Bout
          session={session}
          assets={assets}
          ears={ears}
          host={host}
          forceTouch={forceTouch}
          transparent={transparent}
          started={started}
        />
      )}
    </WordsProvider>
  )
}

function Failed({ reason }: { reason: string }) {
  const t = useWords()
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <p className="max-w-sm text-sm text-white/60">{phrase(t.joining.failed, { reason })}</p>
    </div>
  )
}

function LacingUp() {
  const t = useWords()
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-white/40">{t.joining.lacingUp}</p>
    </div>
  )
}

function Bout({
  session,
  assets,
  ears,
  host,
  forceTouch,
  transparent,
  started,
}: {
  session: BoxingSession
  assets: string
  ears: EarsFor | undefined
  host: XpHost
  forceTouch: boolean
  transparent: boolean
  started: boolean | null
}) {
  const t = useWords()
  const { fight, mine } = session
  const [readout, setReadout] = useState<Readout>(() => readoutOf(fight, mine, session.connected()))
  const [connected, setConnected] = useState(session.connected())

  /**
   * The pad, made once and attached once.
   *
   * Outside React's state entirely - `take()` is called from `useFrame` and its
   * result is never rendered, so a re-render on every key would be a re-render
   * ten times a second for nothing.
   */
  const controller = useMemo(() => pad(), [])
  useEffect(() => controller.listen(), [controller])

  const coarse = useCoarse(forceTouch)
  const hidden = useHidden()

  /**
   * The link that brings somebody into this fight.
   *
   * The page's own URL, and that is the whole trick: every way into this game
   * already carries the room in it - `?ring=` on the game's own route, the
   * battle's id in `/battle/<id>`, `?room=` on the workbench. So there is no
   * invite to *construct*, only one to hand over, and a link built from a topic
   * would be a second spelling of the same thing that goes wrong the first time
   * a route changes.
   */
  const invite = typeof window === 'undefined' ? '' : window.location.href

  /**
   * The big word in the middle, and what put it there.
   *
   * State rather than a ref because it is rendered - it is one of the few
   * things in this component that genuinely wants a re-render, and it changes
   * about six times a match.
   */
  const [say, setSay] = useState<{ text: string; sub?: string; at: number } | null>(null)

  /**
   * A callout clears itself.
   *
   * Two seconds, and a timer per call rather than one interval: the words are
   * set by an event handler at an unpredictable moment, and a shared clock
   * would cut a knockdown's announcement short because a bell rang half a
   * second earlier.
   */
  useEffect(() => {
    if (!say) return
    const timer = setTimeout(() => setSay(null), 2000)
    return () => clearTimeout(timer)
  }, [say])

  useEffect(
    () =>
      session.on((event: FightEvent) => {
        const at = session.clock()
        if (event.type === 'down') {
          setSay({
            text: t.callout.down,
            sub: `${session.fight[event.who].name} · ${phrase(t.callout.count, { n: event.count })}`,
            at,
          })
        } else if (event.type === 'over') {
          const { verdict } = event
          setSay({
            text:
              verdict.how === 'ko'
                ? t.callout.ko
                : verdict.how === 'tko'
                  ? t.callout.tko
                  : t.callout.time,
            sub: verdict.winner
              ? phrase(t.callout.wins, { name: session.fight[verdict.winner].name })
              : t.callout.draw,
            at,
          })
        } else if (event.type === 'started') {
          // The one the rules had to grow an event for - see `FightEvent`.
          setSay({
            text:
              event.round > 1 ? phrase(t.callout.round, { n: event.round }) : t.callout.fight,
            at,
          })
        } else if (event.type === 'bell') {
          setSay({
            text: t.callout.endOfRound,
            sub: `${event.card.red} – ${event.card.blue}`,
            at,
          })
        }
      }),
    [session, t],
  )



  /**
   * Somebody else's lobby, obeyed.
   *
   * When the platform runs one - a battle room, with its own sides and its own
   * whistle - this game shows none and simply reports what it was told. The
   * consent mechanism is unchanged: `say` is still what moves the fight out of
   * the lobby phase, it is just being pressed by the battle rather than by a
   * button in here.
   *
   * `started === null` is the platform saying it has no lobby, and then this
   * does nothing at all - see `FrameProps.started` for why absence needed a
   * third state rather than a `false`.
   */
  useEffect(() => {
    if (started === null) return
    session.say(started)
  }, [session, started])

  /**
   * Sound, or a silence that costs nothing to call.
   *
   * The stub means every call site below can be unconditional. A `ears?.hear(x)`
   * on each of four lines is four chances to forget the `?`, and the failure is
   * a crash in a game that was only ever meant to be quiet.
   */
  const listening = useMemo<Ears>(
    () => ears?.(mine) ?? { hear: () => {}, wake: () => {} },
    [ears, mine],
  )

  /**
   * Report the result, once, when there is one.
   *
   * Both clients watch the same fight end and both will call this, which is
   * exactly what `../../../packages/boxing/src/net/arbiter.ts` is built for:
   * the first report wins and the second is handed the stored outcome rather
   * than an error. `localHost` has no arbiter at all, so here this is only the
   * `persistence.append` half - a record in `localStorage` and no countersign.
   */
  /**
   * Sound, from the same event stream the renderer reads.
   *
   * On `session.on` rather than on `step`'s return value, because that
   * subscription also carries the events that *arrived* - a punch the other
   * client landed on us is a `contact` synthesised in `takeLanded`, and a fight
   * where only your own hits made a noise would be a fight you cannot hear
   * losing.
   */
  useEffect(() => session.on((event: FightEvent) => listening.hear([event])), [session, listening])

  return (
    <div className={`relative h-full w-full ${transparent ? '' : 'bg-neutral-950'}`}>
      <Canvas
        // No shadows. The two things anybody looks at are unlit sprites, so a
        // shadow map would be a per-frame cost spent on the ropes.
        shadows={false}
        dpr={[1, 2]}
        gl={{
          antialias: false,
          // Without an alpha buffer a transparent clear colour is still opaque
          // black, and the frame's `background` setting would do nothing at all.
          alpha: transparent,
          /**
           * Required for `material.clippingPlanes` to do anything at all.
           *
           * Off by default, and its being off is silent: the planes are stored,
           * the shader never reads them, and the ring draws whole. See
           * `./stadium` for what is being cut and why.
           */
          localClippingEnabled: true,
        }}
        camera={{ position: [0, 3.5, 8.4], fov: 36, near: 0.1, far: 120 }}
      >
        {/*
          Nothing painted behind the scene when the frame is transparent.

          `<color attach="background">` is not a style - it clears the buffer
          every frame - so it has to be left off rather than made see-through.
          The fog goes with it: fog fades distant geometry *into a colour*, and
          with no background there is no colour to fade into, so it would draw
          the far seats dissolving into a grey that matches nothing on the page.
        */}
        {transparent ? null : (
          <>
            <color attach="background" args={['#07070a']} />
            <fog attach="fog" args={['#07070a', 16, 46]} />
          </>
        )}
        <Lights />

        {/*
          A Suspense boundary around the models only.

          The fighters and the ring are `useLoader` calls, which suspend. Without
          a boundary *inside* the Canvas the whole canvas unmounts while they
          load, which takes the frame loop with it - and the frame loop is what
          drives the match.
        */}
        <Suspense fallback={null}>
          <Stadium assets={assets} transparent={transparent} />
          <Boxer
            fight={fight}
            corner="red"
            character={characterFor('red')}
            now={() => nowOf(session)}
            floor={FLOOR}
            assets={assets}
          />
          <Boxer
            fight={fight}
            corner="blue"
            character={characterFor('blue')}
            now={() => nowOf(session)}
            floor={FLOOR}
            assets={assets}
          />
        </Suspense>

        <Footprint fight={fight} corner="red" floor={FLOOR} />
        <Footprint fight={fight} corner="blue" floor={FLOOR} />

        <Loop
          session={session}
          take={() => controller.take()}
          wake={listening.wake}
          publish={setReadout}
          onReady={setConnected}
        />
        <Chase fight={fight} />
      </Canvas>

      <Hud
        readout={readout}
        onAgain={(want) => {
          listening.wake()
          session.say(want)
          setReadout(readoutOf(session.fight, session.mine, session.connected()))
        }}
      />
      <Callout say={say} />
      {/*
        Thumb controls only while there is something to control.

        They sit across the bottom of the screen, which is also where every
        panel that asks a question lives - the lobby's ready button, the
        result's *fight again*. On a phone the punches were drawn straight over
        both: a result card reading "You win" with a JAB button on top of it,
        and no way to reach the rematch underneath.

        `walkout`, `fighting` and `between` are the phases where a fighter can
        move. In the other two the screen belongs to the question being asked.
      */}
      {coarse && readout.phase !== 'lobby' && readout.phase !== 'over' ? (
        <TouchControls pad={controller} onFirst={listening.wake} />
      ) : null}
      {readout.phase === 'lobby' && started === null ? (
        <Lobby
          readout={readout}
          connected={connected}
          invite={invite}
          onReady={(next) => {
            // The first press is also the gesture that lets us make a noise for
            // the rest of the match. See `Ears.wake`.
            listening.wake()
            session.say(next)
            setReadout(readoutOf(session.fight, session.mine, session.connected()))
          }}
        />
      ) : null}
      {/*
        Their absence, drawn. Not while the lobby is up - somebody who has not
        arrived yet is what the lobby is already about - and not when this tab
        is the one that stopped, which has its own screen and its own cause.
      */}
      {!connected && readout.phase !== 'lobby' && !hidden ? (
        <Waiting
          name={readout[readout.mine === 'red' ? 'blue' : 'red'].name}
          silence={session.silence()}
        />
      ) : null}
      {hidden ? <Backgrounded /> : null}
    </div>
  )
}

/**
 * The host's clock, reached through the session.
 *
 * A function rather than a number so the sprite reads it *this* frame: the
 * animation is `now - since`, and a stale `now` is a boxer whose punch is
 * frozen a frame behind the simulation that is deciding whether it landed.
 */
function nowOf(session: BoxingSession): number {
  // The fight's own clock is the host's, and `since` is written from it. There
  // is no second clock to get out of step with, which is the whole reason
  // `XpHost.now` exists rather than every component reading `performance.now`.
  return session.clock()
}

/**
 * One frame: read the pad, step the fight, publish a little of it.
 *
 * A component with no output, which is how R3F lets something join the frame
 * loop. It has to be *inside* the Canvas - `useFrame` is the loop, and there is
 * no loop outside it.
 */
function Loop({
  session,
  take,
  wake,
  publish,
  onReady,
}: {
  session: BoxingSession
  take: () => ReturnType<ReturnType<typeof pad>['take']>
  wake: () => void
  publish: (readout: Readout) => void
  onReady: (ready: boolean) => void
}) {
  const nextReadout = useRef(0)
  /**
   * `null` until the first frame has reported, and that is the fix rather than
   * a style.
   *
   * Seeded with `session.connected()` it was a race that always lost: `Bout` reads
   * the same call for its initial state, `Loop` mounts a moment later, and in
   * that moment the other fighter's `__here` arrives. Both sides then hold a
   * *different* "initial" value, the change never fires, and the waiting card
   * stays up over a fight that is already running - the state being wrong in
   * the one direction where nothing looks broken enough to investigate.
   */
  const wasReady = useRef<boolean | null>(null)

  useFrame((_, delta) => {
    /**
     * Clamped, but far less tightly than it was.
     *
     * ---------------------------------------------------------------------------
     * What the clamp is for, and what it was breaking
     * ---------------------------------------------------------------------------
     * `delta` is wall-clock since the last frame, and a tab that was frozen and
     * came back hands over one enormous one. Unclamped, a fighter crosses the
     * whole ring in a single step and every punch in flight resolves at once.
     *
     * It was 50ms, which is three frames at 60Hz - and that quietly made this
     * game unplayable on anything slower than about 20fps. The step advances the
     * *round clock* by `dt` as well as the bodies, so a client rendering at five
     * frames a second was handed 50ms fifteen times a second's worth of real
     * time: a three-second walkout took forty-five seconds. Nothing looked
     * broken. Both fighters were connected, both agreed, the clock was counting -
     * far too slowly to read as anything but a hang.
     *
     * A quarter of a second still catches the case it was written for - a
     * genuine freeze is seconds, not milliseconds - and lets a slow machine run
     * the match at the right speed, just choppily. The frozen-tab case has a
     * better answer anyway, which is that the game notices and says so: see
     * `Backgrounded`.
     */
    const dt = Math.min(delta, 0.25)

    const live = session.connected()
    if (live !== wasReady.current) {
      wasReady.current = live
      onReady(live)
    }

    const intent = live ? take() : NO_INTENT
    // The browser will not start an audio context until a gesture, and the
    // first key press is the gesture. Cheap to ask every frame; `wake` is
    // idempotent and returns immediately after the first one.
    if (intent.punch || intent.guard || intent.walk !== 0) wake()
    session.step(intent, dt)

    const now = session.clock()
    if (now >= nextReadout.current) {
      nextReadout.current = now + 1 / READOUT_HZ
      publish(readoutOf(session.fight, session.mine, live))
    }
  })

  return null
}

/**
 * The camera, which does more work here than anything else on screen.
 *
 * A fixed side-on camera is correct and dull: two small figures in the middle
 * of a wide shot, and the distance between them - the single most important
 * thing in a boxing match - is hard to read. So it does what a broadcast camera
 * does, which is stay square to the action and push in when they close.
 *
 * Everything below is smoothed towards a target rather than set. A camera that
 * tracked exactly would snap a metre sideways every time somebody dashed, and
 * the shot is the one place in this game where being a few frames late is
 * better than being right.
 */
function Chase({ fight }: { fight: Fight }) {
  const { camera } = useThree()
  const target = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const settled = useRef(false)

  useFrame((_, delta) => {
    const centre = (fight.red.x + fight.blue.x) / 2
    const gap = gapOf(fight)

    /**
     * Pull back as they separate, in but not all the way.
     *
     * The range is narrow on purpose. A camera that framed the pair exactly
     * would be at its widest in the moment before an exchange and its tightest
     * during one, which inverts what the shot should be doing: the tense part
     * of a boxing match is two people not quite in range of each other.
     */
    const distance = 7.9 + gap * 0.45

    /**
     * Just above the fighters' heads, looking very slightly down.
     *
     * This number was chased twice. At chest height the near ropes crossed both
     * boxers; the answer looked like "get above the top rope", which meant a
     * camera five metres up looking down onto the canvas - and side-on sprites
     * seen from above read as cardboard lying in a ring.
     *
     * The ropes are dealt with in ./boxer instead, by not letting them draw over
     * a fighter at all. That frees the camera to sit where the shot wants it,
     * which is barely above the action, and lets the ropes stay in frame - a
     * boxing shot with no ropes in it stops reading as a ring.
     */
    target.set(centre * 0.5, 3.5, distance)
    // Below the fighters' heads, so the down-angle is gentle: steeper reads as
    // a security camera, and the sprites are drawn from the side.
    look.set(centre * 0.68, FLOOR + 1, 0)

    /**
     * Frame-rate independent smoothing.
     *
     * `1 - e^(-k·dt)` rather than a fixed `lerp(0.1)`: a constant factor moves
     * twice as far per second at 120fps as at 60, so the camera would feel
     * different on different machines - and this game is played on two at once.
     */
    const ease = 1 - Math.exp(-6 * delta)

    if (!settled.current) {
      // The first frame has no history to smooth from, and easing towards the
      // target from wherever the Canvas initialised the camera is a visible
      // swoop into position every time the page loads.
      camera.position.copy(target)
      settled.current = true
    } else {
      camera.position.lerp(target, ease)
    }
    camera.lookAt(look)
  })

  return null
}

/** The furthest a fighter can be from the centre, for anything that frames the shot. */
export { RING_HALF }
export type { Corner }
