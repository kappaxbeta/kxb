import type { XpFlow } from '@kxb/xp'
import { ROUND_AGAIN, RUN_OVER } from '@kxb/xp'

/**
 * The document's `flow`, driven for a sketch - phases, rounds, and the two
 * ways out of one.
 *
 * ---------------------------------------------------------------------------
 * What of `flow` a sketch honours, and what it cannot
 * ---------------------------------------------------------------------------
 * A level's flow runs inside the simulation, where a step's `when` can read
 * the data block and a phase's `does` can fire verbs at entities. A sketch
 * has neither - its world is inside code we cannot see - so the honest subset
 * is the *shape* of a run: named phases, `says` lines, which keys `allow`
 * leaves live, `after` timers, `on` events (the sketch raises them with
 * `xp.emit`), `rounds`, and the two reserved destinations. Steps carrying a
 * `when` never hold here, and `does` fires nothing - both documented in
 * docs/xp/sketch.md rather than silently half-working: a condition that read
 * `undefined` would advance a round on a comparison nobody wrote.
 *
 * ---------------------------------------------------------------------------
 * One client drives, everybody follows
 * ---------------------------------------------------------------------------
 * The same election `owning.ts` uses for a ball, because it costs zero
 * messages: the lowest id in the roster is the driver, every machine agrees,
 * and a driver leaving promotes the next lowest on the spot. The driver runs
 * this module's pure functions and broadcasts the result; everybody else
 * (and the driver itself) renders the state and hands it to the SDK. Pure so
 * that the whole run can be played in a test with a fake clock.
 */

export interface SketchFlowState {
  phase: string
  /** 1-based, like a scoreboard says it. */
  round: number
  /** When the current phase's `after` step fires, on the caller's clock -
   * whatever "now" the caller passes in is the clock this deadline is on. */
  endsAt: number | null
  over: boolean
  /** Grows on every change, so a stale broadcast can never roll a client
   * back - the wire has no ordering promise. */
  seq: number
}

const entered = (flow: XpFlow, phase: string, round: number, now: number, seq: number): SketchFlowState => {
  const steps = flow.phases[phase]?.next ?? []
  // The first timed step is the phase's own clock; `when` steps never hold
  // here (see the header), so they are passed over rather than waited on.
  const timed = steps.find((one) => one.after !== undefined && one.when === undefined)
  return {
    phase,
    round,
    endsAt: timed?.after !== undefined ? now + timed.after : null,
    over: false,
    seq,
  }
}

export function startFlow(flow: XpFlow, now: number): SketchFlowState {
  return entered(flow, flow.start, 1, now, 1)
}

const go = (flow: XpFlow, state: SketchFlowState, destination: string, now: number): SketchFlowState => {
  const seq = state.seq + 1
  if (destination === RUN_OVER) return { ...state, endsAt: null, over: true, seq }
  if (destination === ROUND_AGAIN) {
    if (flow.rounds !== undefined && state.round >= flow.rounds) {
      return { ...state, endsAt: null, over: true, seq }
    }
    return entered(flow, flow.start, state.round + 1, now, seq)
  }
  return entered(flow, destination, state.round, now, seq)
}

/** A named event arrived - `xp.emit(name)`, from whichever client. */
export function flowOnEvent(
  flow: XpFlow,
  state: SketchFlowState,
  event: string,
  now: number,
): SketchFlowState {
  if (state.over) return state
  const steps = flow.phases[state.phase]?.next ?? []
  const step = steps.find((one) => one.on === event && one.when === undefined)
  if (!step) return state
  return go(flow, state, step.go, now)
}

/** The clock moved. Returns the same object when nothing fired, so a caller
 * can broadcast on identity change alone. */
export function flowTick(flow: XpFlow, state: SketchFlowState, now: number): SketchFlowState {
  if (state.over || state.endsAt === null || now < state.endsAt) return state
  const steps = flow.phases[state.phase]?.next ?? []
  const step = steps.find((one) => one.after !== undefined && one.when === undefined)
  if (!step) return state
  return go(flow, state, step.go, state.endsAt)
}

/** What the current phase leaves live, `undefined` meaning everything - the
 * same reading `FlowPhase.allow` documents. */
export function flowAllows(flow: XpFlow, state: SketchFlowState): readonly string[] | undefined {
  if (state.over) return []
  return flow.phases[state.phase]?.allow
}

/** The authored line for the strip, when the phase wrote one. */
export function flowSays(flow: XpFlow, state: SketchFlowState): string | undefined {
  if (state.over) return undefined
  return flow.phases[state.phase]?.says
}

/**
 * The state as it travels, and back. `left` rather than `endsAt`, because
 * two browsers do not share a clock - the same lesson `presence.ts` stamps
 * samples on arrival for.
 */
export function packFlow(state: SketchFlowState, now: number): {
  p: string
  r: number
  l: number | null
  o: boolean
  v: number
} {
  return {
    p: state.phase,
    r: state.round,
    l: state.endsAt === null ? null : Math.max(0, state.endsAt - now),
    o: state.over,
    v: state.seq,
  }
}

export function readPackedFlow(raw: unknown, now: number): SketchFlowState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const packed = raw as Record<string, unknown>
  if (typeof packed.p !== 'string' || packed.p.length > 64) return null
  if (typeof packed.r !== 'number' || !Number.isFinite(packed.r)) return null
  if (typeof packed.v !== 'number' || !Number.isFinite(packed.v)) return null
  const left = packed.l
  if (left !== null && (typeof left !== 'number' || !Number.isFinite(left))) return null
  return {
    phase: packed.p,
    round: packed.r,
    endsAt: left === null ? null : now + left,
    over: packed.o === true,
    seq: packed.v,
  }
}
