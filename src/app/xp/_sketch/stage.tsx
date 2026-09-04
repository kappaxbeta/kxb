'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  flowAllows,
  flowOnEvent,
  flowSays,
  flowTick,
  MAX_SENDS_PER_SECOND,
  packFlow,
  readFrameMessage,
  readPackedFlow,
  readWireControl,
  startFlow,
  WIRE_CONTROL,
  WIRE_DATA,
  WIRE_EMIT,
  WIRE_FLOW,
  WIRE_STATE,
  type SketchFlowState,
  type StageMessage,
  type XpDocument,
} from '@kxb/xp'
import type { XpPlayer, XpSocket } from '@kxb/xp/host'
import { useLocale } from '@/app/i18n/locale-context'
import { useIsTouch } from '@/app/xp/_runtime/hud/touch-controls'
import { sketchSrcdoc } from '@/app/xp/_sketch/srcdoc'

/**
 * The stage a sketch container stands on: one iframe and everything that
 * connects it to the platform.
 *
 * ---------------------------------------------------------------------------
 * The division of labour
 * ---------------------------------------------------------------------------
 * The container (see `./srcdoc.ts`) holds the author's code and the SDK, and
 * knows nothing about Supabase, sockets or React. This component holds
 * everything the container must not touch: the socket, whose messages it
 * relays in both directions; the keyboard, forwarded when focus is out here;
 * the on-screen buttons a phone needs; the flow driver, when the document
 * has a run; and the rate limits, enforced on this side of the membrane
 * because the other side is the code being limited.
 *
 * ---------------------------------------------------------------------------
 * Everything from the frame is a stranger talking
 * ---------------------------------------------------------------------------
 * Every message is read through `readFrameMessage` before anything acts on
 * it, and the handler checks `event.source` is *our* iframe - any window can
 * post to a page, and a page with two sketches on it (the editor's preview
 * next to a running one) must not cross their wires.
 *
 * ---------------------------------------------------------------------------
 * The flow is driven here, not inside
 * ---------------------------------------------------------------------------
 * The lowest id in the roster runs `flow-driver.ts` and broadcasts the
 * result; everybody else applies what arrives, newest `seq` wins. It lives
 * on this side because the driver is platform behaviour - the container only
 * raises events (`xp.emit`) and hears phases, which keeps a hacked sketch
 * able to lie about its *own* run at worst, exactly the authority a level's
 * client already has over `self` tier facts.
 */

export interface SketchStageProps {
  xp: XpDocument
  /** The wire, when this is being played with people. Null is solo: the
   * editor's preview, or a level with no network need. */
  socket?: XpSocket | null
  me?: { id: string; name: string } | null
  /** Where console lines and errors from inside the container go. The play
   * page shows the last error as a chip; the editor shows all of it. */
  onLog?: (level: 'log' | 'warn' | 'error', line: string) => void
  /** The editor forces touch to preview buttons; absent lets the device say. */
  touch?: boolean
  /** What the host decided about this match, for `xp.match` inside. Absent
   * is a stage nothing scheduled - the sketch decides everything. */
  match?: { started: boolean | null; timeLimit: number | null; scoreLimit: number | null }
}

/** The driver's clock: seconds, monotonic, local. Deadlines never travel -
 * `packFlow` turns them into "seconds left" at the edge. */
const now = () => performance.now() / 1000

/**
 * The thumbstick, when the document asked for one (`sketch.stick`).
 *
 * A ring and a puck, bottom-left - the buttons keep the right, the same
 * corners the level runtime deals its touch controls to. It reports the
 * offset from where the finger *went down*, normalised to the ring's radius,
 * so a thumb never has to find the centre first - the same forgiveness the
 * runtime's stick earned. Zeros on release, always: a stick that stays
 * deflected after the finger left is a player who cannot stop.
 */
function Stick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [puck, setPuck] = useState<{ x: number; y: number } | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const RADIUS = 44

  const report = (event: React.PointerEvent) => {
    const from = downAt.current
    if (!from) return
    let x = (event.clientX - from.x) / RADIUS
    let y = (event.clientY - from.y) / RADIUS
    const length = Math.sqrt(x * x + y * y)
    if (length > 1) {
      x /= length
      y /= length
    }
    setPuck({ x, y })
    onMove(x, y)
  }

  const release = (event: React.PointerEvent) => {
    event.currentTarget.releasePointerCapture(event.pointerId)
    downAt.current = null
    setPuck(null)
    onMove(0, 0)
  }

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-end p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div
        className="pointer-events-auto relative grid h-28 w-28 touch-none select-none place-items-center rounded-full border border-white/15 bg-white/5 backdrop-blur"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          downAt.current = { x: event.clientX, y: event.clientY }
          report(event)
        }}
        onPointerMove={report}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          className="h-12 w-12 rounded-full border border-white/25 bg-white/15"
          style={
            puck
              ? { transform: `translate(${puck.x * RADIUS}px, ${puck.y * RADIUS}px)` }
              : undefined
          }
        />
      </div>
    </div>
  )
}

export function SketchStage({ xp, socket, me, onLog, touch: forceTouch, match }: SketchStageProps) {
  const sketch = xp.sketch
  const keys = useMemo(() => xp.player.keys ?? [], [xp.player.keys])
  const flow = xp.flow
  const isTouch = useIsTouch(forceTouch)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const readyRef = useRef(false)
  const meId = me?.id ?? 'you'

  /**
   * `location.origin`, as an external store rather than state set in an
   * effect - the same shape `useIsTouch` argues for. The srcdoc bakes
   * absolute URLs and a CSP around the origin, and during SSR there is none:
   * the server snapshot is `null`, so the server renders an empty stage and
   * the client fills it in on the first client render, which for an iframe
   * full of game is the right hydration story anyway.
   */
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => null,
  )

  /** The last thing that went wrong inside, shown so play-mode errors are
   * never invisible - the lesson the battle panels already learned. */
  const [trouble, setTrouble] = useState<string | null>(null)

  /**
   * The reader's language, answered here so the container never has to ask.
   * The words block is keyed by English sentence, so English needs no table
   * and an absent locale falls back to the sentence itself inside.
   */
  const locale = useLocale()
  const words = xp.words?.[locale] ?? null

  const srcdoc = useMemo(() => {
    if (!sketch || origin === null) return null
    return sketchSrcdoc({
      sketch,
      origin,
      me: me ?? null,
      keys,
      flow: flow ?? null,
      match: match ?? null,
      words,
    })
  }, [sketch, origin, me, keys, flow, match, words])

  const post = useCallback((message: StageMessage) => {
    frameRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  // --- the roster, pushed whole; the SDK diffs it into join/leave -----------
  const rosterRef = useRef<XpPlayer[]>([])
  const pushRoster = useCallback(() => {
    if (!readyRef.current) return
    const named = rosterRef.current.some((one) => one.id === meId)
      ? rosterRef.current
      : [{ id: meId, name: me?.name ?? 'You' }, ...rosterRef.current]
    post({
      t: 'roster',
      players: named.map((one) => ({
        id: one.id,
        name: one.name,
        ...(one.team ? { team: one.team } : {}),
        ...(one.skin ? { skin: one.skin } : {}),
        you: one.id === meId,
      })),
    })
  }, [post, meId, me?.name])

  // --- the run --------------------------------------------------------------
  /**
   * One state, two roles. The ref is what the driver ticks and what incoming
   * broadcasts overwrite; the `view` state is the same thing at render pace,
   * for the strip below.
   */
  const flowRef = useRef<SketchFlowState | null>(null)
  const [flowView, setFlowView] = useState<SketchFlowState | null>(null)

  const leading = useCallback(() => {
    const peers = rosterRef.current
    return peers.every((one) => one.id >= meId)
  }, [meId])

  /**
   * The wire's `from` contract: the realtime host reads the sender out of
   * the payload itself (`_hosts/realtime.ts` - `payload.from`), and uses it
   * to drop your own echo. A payload without one arrives as from '' - which
   * is exactly how the first two-browser probe failed: claims travelled
   * (they carry their owner inside) while avatars, fields and presses all
   * keyed off an empty sender and fell on the floor.
   */
  const shareFlow = useCallback(
    (state: SketchFlowState) => {
      flowRef.current = state
      setFlowView(state)
      const packed = packFlow(state, now())
      if (readyRef.current) post({ t: 'flow', flow: packed })
      if (leading()) socket?.send(WIRE_FLOW, { from: meId, ...packed })
    },
    [post, socket, leading, meId],
  )

  useEffect(() => {
    if (!flow) return
    if (!flowRef.current) shareFlow(startFlow(flow, now()))

    const beat = setInterval(() => {
      const state = flowRef.current
      if (!state) return
      if (leading()) {
        const moved = flowTick(flow, state, now())
        if (moved !== state) {
          shareFlow(moved)
          return
        }
      }
      // The countdown moves even when the phase does not.
      setFlowView({ ...state })
    }, 250)
    return () => clearInterval(beat)
  }, [flow, shareFlow, leading])

  /** An event reached the driver - locally from our own frame, or off the
   * wire from somebody else's. Only the leader may move the run with it. */
  const drive = useCallback(
    (event: string) => {
      if (!flow || !flowRef.current || !leading()) return
      const moved = flowOnEvent(flow, flowRef.current, event, now())
      if (moved !== flowRef.current) shareFlow(moved)
    },
    [flow, shareFlow, leading],
  )

  useEffect(() => {
    if (!socket) {
      rosterRef.current = []
      pushRoster()
      return
    }
    rosterRef.current = socket.peers()
    pushRoster()
    return socket.onPeers((peers) => {
      rosterRef.current = peers
      pushRoster()
      // Whoever now leads says where the run stands, so a joiner is not
      // left in phase one of a round everybody else finished.
      if (flowRef.current && leading()) {
        socket.send(WIRE_FLOW, { from: meId, ...packFlow(flowRef.current, now()) })
      }
    })
  }, [socket, pushRoster, leading, meId])

  // --- what the container says ----------------------------------------------
  const sendsRef = useRef({ since: 0, count: 0, warned: false })
  useEffect(() => {
    const heard = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
      const message = readFrameMessage(event.data)
      if (!message) return

      if (message.t === 'ready') {
        readyRef.current = true
        pushRoster()
        if (flowRef.current) post({ t: 'flow', flow: packFlow(flowRef.current, now()) })
      } else if (message.t === 'send') {
        if (!socket) return
        /**
         * A rolling second. Beyond the cap the send is dropped, not queued -
         * a hot `draw()` calling `xp.send` sixty times a second would
         * otherwise build unbounded lag, and the square law on room traffic
         * is the host's promise to keep, not the sketch's.
         */
        const at = performance.now()
        const window_ = sendsRef.current
        if (at - window_.since > 1000) {
          window_.since = at
          window_.count = 0
        }
        window_.count += 1
        if (window_.count > MAX_SENDS_PER_SECOND) {
          if (!window_.warned) {
            window_.warned = true
            onLog?.('warn', `xp.send is capped at ${MAX_SENDS_PER_SECOND}/s; extra sends are dropped`)
          }
          return
        }
        socket.send(WIRE_DATA, { from: meId, data: message.data })
      } else if (message.t === 'state') {
        // Already size-capped by the reader; cadence is the SDK's ten a
        // second, and a container that patched its own SDK gains nothing -
        // the socket's own sendHz shaping is still in front of the wire.
        socket?.send(WIRE_STATE, { from: meId, state: message.state })
      } else if (message.t === 'control') {
        socket?.send(WIRE_CONTROL, { from: meId, name: message.name, down: message.down })
      } else if (message.t === 'emit') {
        if (leading()) drive(message.name)
        else socket?.send(WIRE_EMIT, { from: meId, name: message.name })
      } else if (message.t === 'log') {
        onLog?.(message.level, message.line)
      } else if (message.t === 'trouble') {
        const where = message.line ? ` (line ${message.line})` : ''
        setTrouble(`${message.message}${where}`)
        onLog?.('error', `${message.message}${where}`)
      }
    }
    window.addEventListener('message', heard)
    return () => window.removeEventListener('message', heard)
  }, [socket, onLog, pushRoster, post, drive, leading, meId])

  // --- what the wire says ---------------------------------------------------
  useEffect(() => {
    if (!socket) return
    const offs = [
      // Unwrapped from the `from`-carrying envelope the sends above build -
      // the sender id the container sees is the one the host verified the
      // echo against, not a field the payload merely claims... it is the
      // same field, but a missing one arrives as '' and is dropped here
      // rather than becoming a ghost player with an empty name.
      socket.on(WIRE_DATA, (payload, from) => {
        if (!from || typeof payload !== 'object' || payload === null || !('data' in payload)) return
        post({ t: 'peer', from, data: (payload as { data: unknown }).data })
      }),
      socket.on(WIRE_STATE, (payload, from) => {
        if (!from || typeof payload !== 'object' || payload === null || !('state' in payload)) return
        post({ t: 'peer-state', from, state: (payload as { state: unknown }).state })
      }),
      socket.on(WIRE_CONTROL, (payload, from) => {
        const edge = readWireControl(payload)
        if (from && edge) post({ t: 'control', player: from, name: edge.name, down: edge.down })
      }),
      socket.on(WIRE_EMIT, (payload) => {
        const name =
          typeof payload === 'object' && payload !== null && 'name' in payload
            ? (payload as { name: unknown }).name
            : null
        if (typeof name === 'string' && name.length <= 64) drive(name)
      }),
      socket.on(WIRE_FLOW, (payload) => {
        const arrived = readPackedFlow(payload, now())
        if (!arrived) return
        // Newest seq wins, whoever said it - the wire has no ordering
        // promise, and a leader change mid-broadcast must not roll back.
        if (flowRef.current && arrived.seq <= flowRef.current.seq) return
        flowRef.current = arrived
        setFlowView(arrived)
        if (readyRef.current) post({ t: 'flow', flow: packFlow(arrived, now()) })
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [socket, post, drive])

  // --- the keyboard, forwarded when focus is out here -----------------------
  useEffect(() => {
    /**
     * When the iframe has focus these listeners never fire - the events land
     * inside, where p5 and the SDK already hear them. So this path only
     * exists for the other focus state, and the two can never double up.
     */
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    const forward = (down: boolean) => (event: KeyboardEvent) => {
      if (event.repeat || typing(event.target)) return
      // The page must not scroll under a game that thinks it has the arrows.
      if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault()
      post({ t: 'key', code: event.code, key: event.key, down })
    }
    const onDown = forward(true)
    const onUp = forward(false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [post])

  // --- on-screen buttons, because a phone has no keys to forward ------------
  const buttonEdge = useCallback(
    (name: string, down: boolean) => {
      post({ t: 'control', player: meId, name, down })
      socket?.send(WIRE_CONTROL, { from: meId, name, down })
    },
    [post, socket, meId],
  )

  if (!sketch) return null

  const allowedNow = flow && flowView ? flowAllows(flow, flowView) : undefined
  const saysNow = flow && flowView ? flowSays(flow, flowView) : undefined
  const leftNow =
    flowView && flowView.endsAt !== null ? Math.max(0, Math.ceil(flowView.endsAt - now())) : null

  return (
    /*
      Transparent around a rounded window, exactly the frame the xo lounge
      and the XP scene draw (`rounded-[3rem]` + the inset sky vignette, see
      `_runtime/scene.tsx`). The page shows through outside the rounding, so
      a sketch sits in a room the way every other world does rather than as
      a pasted-on rectangle; the sky inside comes from the srcdoc body.
    */
    <div className="relative h-full w-full">
      <div className="absolute inset-0 touch-none overflow-hidden rounded-[3rem]">
        {srcdoc !== null && (
          <iframe
            ref={frameRef}
            title={xp.name}
            /**
             * The whole containment in one attribute: scripts and nothing else.
             * No `allow-same-origin` is what makes the origin opaque - see
             * `./srcdoc.ts` for the two layers under this one.
             */
            sandbox="allow-scripts"
            /*
              Motion sensors, granted to the (opaque-origin) frame: p5 listens
              for device tilt on boot, and a policy that refuses logs a console
              violation per listener - noise in every sketch author's console
              for a sensor that is a perfectly good game input on a phone.
              `*` because an opaque origin matches nothing narrower; the frame
              still cannot reach anything the CSP and sandbox do not allow.
            */
            allow="accelerometer *; gyroscope *; magnetometer *"
            srcDoc={srcdoc}
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>
      <div
        className="pointer-events-none absolute inset-0 rounded-[3rem]"
        style={{ boxShadow: 'inset 0 0 140px 60px #02000b' }}
      />
      {flowView && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
          <div className="flex max-w-[90%] items-center gap-3 rounded-full border border-white/15 bg-black/50 px-4 py-1.5 backdrop-blur">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/50">
              {flowView.over ? 'over' : `round ${flowView.round}`}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/90">
              {flowView.over ? 'the run is done' : flowView.phase}
            </span>
            {!flowView.over && leftNow !== null && (
              <span className="min-w-8 text-right font-mono tabular-nums text-[11px] text-white/70">
                {leftNow}s
              </span>
            )}
          </div>
        </div>
      )}
      {saysNow && !flowView?.over && (
        <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center px-6">
          <p className="max-w-md text-center text-sm leading-snug text-white/70">{saysNow}</p>
        </div>
      )}
      {isTouch && sketch.stick && <Stick onMove={(x, y) => post({ t: 'stick', x, y })} />}
      {isTouch && keys.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {keys.map((one) => {
            const dead = allowedNow !== undefined && !allowedNow.includes(one.does)
            return (
              <button
                key={one.does}
                type="button"
                disabled={dead}
                className={`pointer-events-auto grid h-16 w-16 select-none place-items-center rounded-full border font-mono text-[11px] uppercase tracking-wide backdrop-blur ${
                  dead
                    ? 'border-white/10 bg-white/5 text-white/25'
                    : 'border-white/20 bg-white/10 text-white/80 active:bg-white/25'
                }`}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  buttonEdge(one.does, true)
                }}
                onPointerUp={() => buttonEdge(one.does, false)}
                onPointerCancel={() => buttonEdge(one.does, false)}
                onContextMenu={(event) => event.preventDefault()}
              >
                {one.does}
              </button>
            )
          })}
        </div>
      )}
      {trouble && (
        <button
          type="button"
          onClick={() => setTrouble(null)}
          className="absolute bottom-4 left-4 max-w-[70%] truncate rounded-md border border-red-400/30 bg-red-950/80 px-3 py-1.5 text-left font-mono text-[11px] text-red-200"
          title="The sketch hit an error. Tap to dismiss."
        >
          {trouble}
        </button>
      )}
    </div>
  )
}
