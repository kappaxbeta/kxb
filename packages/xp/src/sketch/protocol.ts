/**
 * The membrane between the stage and the container, spelled once.
 *
 * ---------------------------------------------------------------------------
 * Why this lives in the package
 * ---------------------------------------------------------------------------
 * This module moved here from `src/app/xp/_sketch/protocol.ts` because the
 * runtime now has two hosts: a web iframe and a phone's WebView. Both need
 * the same message shapes and the same validation, and a host-agnostic
 * string/pure-function module belongs where both can reach it - the same
 * argument the contract package makes for `packages/api`: one shape, read by
 * every consumer, rather than a copy per client that drifts.
 *
 * ---------------------------------------------------------------------------
 * Two sides, one file
 * ---------------------------------------------------------------------------
 * A sketch runs in an opaque-origin iframe (`sandbox` without
 * `allow-same-origin`), so the only channel either side has is
 * `postMessage` - and a protocol that lives half in the stage and half in an
 * inlined SDK string is a protocol that drifts. Both sides import (or are
 * generated from) this file, and the tests assert the SDK source mentions
 * every message type listed here.
 *
 * Everything crossing is data, never code, and the *stage* treats the frame
 * as untrusted in both directions: a message from the container is a
 * stranger's script talking, so every handler validates shape and clamps
 * size before acting.
 *
 * ---------------------------------------------------------------------------
 * Who derives what
 * ---------------------------------------------------------------------------
 * Named controls (the document's `player.keys`) are derived *inside* the
 * container, because that is the only place that hears the keyboard in both
 * focus states: focused, the iframe gets real key events; unfocused, the
 * stage forwards them as `key` messages and the SDK synthesises the same
 * events. One listener, one derivation, no double press.
 *
 * The stage owns everything that touches the platform: the socket (peers'
 * control edges and data arrive through it and are relayed in), the touch
 * buttons (a phone has no keyboard to forward), and the rate limits below.
 */

/** Stage → container. */
export type StageMessage =
  | {
      t: 'roster'
      players: { id: string; name: string; team?: string; you: boolean }[]
    }
  /** A key edge heard by the page while the container was not focused. */
  | { t: 'key'; code: string; key: string; down: boolean }
  /** The thumbstick, when the document asked for one (`sketch.stick`).
   * Normalised to the unit circle; {0,0} on release. Feeds `xp.input`. */
  | { t: 'stick'; x: number; y: number }
  /**
   * A named control edge. For the local player this is a touch button (a
   * keyboard edge is derived inside); for everybody else it is their edge,
   * relayed off the socket.
   */
  | { t: 'control'; player: string; name: string; down: boolean }
  /** Somebody's `xp.send`, relayed. */
  | { t: 'peer'; from: string; data: unknown }
  /** Somebody's avatar-and-objects packet, relayed. The SDK smooths it. */
  | { t: 'peer-state'; from: string; state: unknown }
  /** The run moved. Packed by `flow-driver.ts`; the SDK looks the phase up
   * in its own copy of the flow block. */
  | { t: 'flow'; flow: { p: string; r: number; l: number | null; o: boolean; v: number } }

/** Container → stage. */
export type FrameMessage =
  /** The SDK booted; the stage answers with the first roster. */
  | { t: 'ready' }
  /** `xp.send(data)` - broadcast me to everybody. */
  | { t: 'send'; data: unknown }
  /** A local key became a named control edge; the stage broadcasts it. */
  | { t: 'control'; name: string; down: boolean }
  /** The SDK's ten-a-second avatar-and-objects packet; the stage broadcasts it. */
  | { t: 'state'; state: unknown }
  /** `xp.emit(name)` - an event the document's flow may be listening for. */
  | { t: 'emit'; name: string }
  /** `console.log`/`warn`/`error` from inside, for the editor's console. */
  | { t: 'log'; level: 'log' | 'warn' | 'error'; line: string }
  /** A thrown error or rejected promise, with whatever position it had. */
  | { t: 'trouble'; message: string; file?: string; line?: number }

/** The socket message types a sketch instance uses. Namespaced so a level's
 * own wire vocabulary (`share`, claims, chat) can never collide with it. */
export const WIRE_DATA = 'sketch:data'
export const WIRE_CONTROL = 'sketch:control'
export const WIRE_STATE = 'sketch:state'
export const WIRE_FLOW = 'sketch:flow'
export const WIRE_EMIT = 'sketch:emit'

/**
 * How many `xp.send` broadcasts a second one container may ask for.
 *
 * Twenty is a game loop's worth of state sharing; what it is not is a
 * `draw()` at sixty calling `xp.send` every frame, which would be the square
 * law `XpNetwork.sendHz` warns about, asked for by whoever wrote the sketch
 * rather than by the host. Beyond the cap, sends are dropped newest-first
 * and a warning is logged once - dropping is honest, queueing would let a
 * hot loop build unbounded lag.
 */
export const MAX_SENDS_PER_SECOND = 20

/** The longest one `xp.send` payload may be, JSON-encoded. */
export const MAX_SEND_BYTES = 8 * 1024

/**
 * The longest a state packet may be, JSON-encoded. Smaller than a send,
 * because it travels ten times a second from every player - an avatar and a
 * handful of objects is a few hundred bytes, and four kilobytes is already a
 * sketch stuffing a level's worth of world into the position channel.
 */
export const MAX_STATE_BYTES = 4 * 1024

/** The longest console line the container may put in the editor's log. */
export const MAX_LOG_LINE = 400

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Read a message from the container, or nothing.
 *
 * The narrow door: whatever a sketch posts, only these shapes come through,
 * with strings cut to size. `send` payloads are measured here rather than
 * trusted, because the byte cap is a promise the stage makes to the wire.
 */
export function readFrameMessage(raw: unknown): FrameMessage | null {
  if (!isObject(raw) || typeof raw.t !== 'string') return null

  switch (raw.t) {
    case 'ready':
      return { t: 'ready' }
    case 'send': {
      if (!('data' in raw)) return null
      try {
        const encoded = JSON.stringify(raw.data)
        if (encoded === undefined || encoded.length > MAX_SEND_BYTES) return null
      } catch {
        // Circular, or a getter that throws - a payload that cannot travel.
        return null
      }
      return { t: 'send', data: raw.data }
    }
    case 'control': {
      if (typeof raw.name !== 'string' || raw.name.length === 0 || raw.name.length > 32) return null
      if (typeof raw.down !== 'boolean') return null
      return { t: 'control', name: raw.name, down: raw.down }
    }
    case 'state': {
      if (!('state' in raw)) return null
      try {
        const encoded = JSON.stringify(raw.state)
        if (encoded === undefined || encoded.length > MAX_STATE_BYTES) return null
      } catch {
        return null
      }
      return { t: 'state', state: raw.state }
    }
    case 'emit': {
      if (typeof raw.name !== 'string' || raw.name.length === 0 || raw.name.length > 64) return null
      return { t: 'emit', name: raw.name }
    }
    case 'log': {
      const level = raw.level === 'warn' || raw.level === 'error' ? raw.level : 'log'
      if (typeof raw.line !== 'string') return null
      return { t: 'log', level, line: raw.line.slice(0, MAX_LOG_LINE) }
    }
    case 'trouble': {
      if (typeof raw.message !== 'string') return null
      return {
        t: 'trouble',
        message: raw.message.slice(0, MAX_LOG_LINE),
        ...(typeof raw.file === 'string' ? { file: raw.file.slice(0, 128) } : {}),
        ...(typeof raw.line === 'number' && Number.isFinite(raw.line) ? { line: raw.line } : {}),
      }
    }
    default:
      return null
  }
}

/**
 * And the same door on the wire: a control edge that arrived on the socket
 * was written by somebody else's client, which is somebody else's sketch.
 */
export function readWireControl(raw: unknown): { name: string; down: boolean } | null {
  if (!isObject(raw)) return null
  if (typeof raw.name !== 'string' || raw.name.length === 0 || raw.name.length > 32) return null
  if (typeof raw.down !== 'boolean') return null
  return { name: raw.name, down: raw.down }
}
