import { useMemo } from 'react'
import {
  addPhase,
  addPhaseVerb,
  addStep,
  applyFlowStarter,
  setCapabilities,
  type EditState,
  removeFlow,
  removePhase,
  removePhaseVerb,
  removeStep,
  setFlowStart,
  setFlowWins,
  setPhaseAllow,
  setPhaseSays,
  setPhaseWho,
  setFlowRounds,
  setPhaseVerb,
  startFlow,
  type FlowTarget,
} from '@kxb/xp/edit'
import type { Capability, Condition, FlowStarterId, FlowStep, Verb } from '@kxb/xp'

/**
 * Everything you can do to a document's flow, as one thing.
 *
 * Thirteen `useCallback`s in `editor.tsx` before this, each five lines long and
 * every one of them the same five: take the arguments, hand them and the
 * document to a function in `@kxb/xp/edit`, write the result. They were also
 * listed three more times — in the `EditorApi` object, in that object's
 * dependency array, and in the dock's prop type — so adding a fourteenth meant
 * editing four places and the compiler only caught two of them.
 *
 * **One `useMemo` rather than thirteen `useCallback`s**, because they all had
 * exactly the same dependencies: `[state, write]`. Thirteen memo slots keyed on
 * one pair of values is thirteen ways to say a single thing, and the moment
 * either changes all thirteen were being rebuilt anyway.
 *
 * Nothing here decides anything — every function is `@kxb/xp/edit`'s, which is
 * where the rules about what a flow may be actually live and where they are
 * tested. This is the wiring, and the reason it is worth naming is that wiring
 * is exactly what grows quietly.
 */
export interface FlowEdits {
  onPhaseSays: (phase: string, says: string) => void
  onPhaseAllow: (phase: string, allow: readonly string[] | undefined) => void
  /** Whose phase it is: 'turn', or null for everybody. */
  onPhaseWho: (phase: string, who: 'turn' | null) => void
  onPhaseAdd: (name: string) => void
  onPhaseRemove: (name: string) => void
  onStepAdd: (from: string, step: FlowStep) => void
  onStepRemove: (from: string, at: number) => void
  onFlowStart: (phase: string) => void
  /** A phase's `does` is the same `Verb[]` a rule's `do` is, hence the three. */
  onPhaseVerbAdd: (phase: string) => void
  onPhaseVerbChange: (phase: string, at: number, verb: Verb) => void
  onPhaseVerbRemove: (phase: string, at: number) => void
  /** A place becoming a run, and back — see `startFlow` for why both. */
  onStartFlow: (name: string) => void
  onRemoveFlow: () => void
  /** A whole round from one of the shapes a game usually has. See `applyFlowStarter`. */
  onStarter: (id: FlowStarterId) => void
  /** What the product may do with the level - a room, a match, a ball game, a race. */
  onCapabilities: (capabilities: readonly Capability[]) => void
  onWins: (wins: Condition | null) => void
  /** How many times the round is played, or null for once. */
  onRounds: (rounds: number | null) => void
}

export function useFlowEdits(
  state: EditState,
  write: (next: EditState | null) => void,
  /**
   * Which of the level's rounds every one of these edits is aimed at.
   *
   * A level can keep a round per mode (`flows`, `@kxb/xp/format`), and this is
   * the one place that has to know: `FlowEdits` above is unchanged, so the dock
   * and the panel go on calling `onPhaseSays(phase, says)` without an opinion
   * about which flow they are editing. That is the whole point of it being one
   * `useMemo` - the wiring grew a dimension and the eighteen call sites did not
   * have to.
   *
   * Absent is the level's own `flow`, which is what every level with one round
   * has and what the panel opens on.
   */
  where?: FlowTarget,
): FlowEdits {
  return useMemo(
    () => ({
      onPhaseSays: (phase, says) => write(setPhaseSays(state, phase, says, where)),
      onPhaseAllow: (phase, allow) => write(setPhaseAllow(state, phase, allow, where)),
      onPhaseWho: (phase, who) => write(setPhaseWho(state, phase, who, where)),
      onPhaseAdd: (name) => write(addPhase(state, name, where)),
      onPhaseRemove: (name) => write(removePhase(state, name, where)),
      onStepAdd: (from, step) => write(addStep(state, from, step, where)),
      onStepRemove: (from, at) => write(removeStep(state, from, at, where)),
      onFlowStart: (phase) => write(setFlowStart(state, phase, where)),
      onPhaseVerbAdd: (phase) => write(addPhaseVerb(state, phase, undefined, where)),
      onPhaseVerbChange: (phase, at, verb) => write(setPhaseVerb(state, phase, at, verb, where)),
      onPhaseVerbRemove: (phase, at) => write(removePhaseVerb(state, phase, at, where)),
      onStartFlow: (name) => write(startFlow(state, name, where)),
      onRemoveFlow: () => write(removeFlow(state, where)),
      onStarter: (id) => write(applyFlowStarter(state, id, where)),
      onCapabilities: (capabilities) => write(setCapabilities(state, capabilities)),
      onWins: (wins) => write(setFlowWins(state, wins, where)),
      onRounds: (rounds) => write(setFlowRounds(state, rounds, where)),
    }),
    [state, write, where],
  )
}
