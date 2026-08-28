/**
 * Which questions this wizard asks, in what order, and when it will let you
 * past one.
 *
 * Split out of `summon-wizard.tsx`, which is 1,019 lines of code under 1,300 of
 * markup and prose. The navigation was four scattered expressions in the middle
 * of it - the step list, the current step, whether Next is live, and how far
 * anybody has got - and being scattered is what made it unanswerable. "Can you
 * leave the config step without picking a level?" was a question you settled by
 * reading JSX.
 *
 * ---------------------------------------------------------------------------
 * Two paths, and a first step that sometimes is not there
 * ---------------------------------------------------------------------------
 * A match is either an **xo** one - a mode and a clock on a piece of ground -
 * or an **xp**, which is a level that already is the mode and the clock. They
 * ask different questions, so they are two lists rather than one list with
 * branches in it.
 *
 * When a space has no XP to offer there is no fork, so the whole `kind` step
 * disappears and the wizard opens on `mode` exactly as it did before any of
 * this existed. Deciding that here rather than at each call site is what keeps
 * the list honest: the strip, the step counter and the Back button all read
 * this one answer, and a step hidden in three places and shown in a fourth is
 * how a wizard ends up counting to five and stopping at four.
 */

export type Kind = 'xo' | 'xp'

export const STEPS_BY_KIND = {
  xo: ['kind', 'mode', 'arena', 'rules', 'fighters'],
  xp: ['kind', 'xp', 'config', 'fighters'],
} as const satisfies Record<Kind, readonly string[]>

export type Step = (typeof STEPS_BY_KIND)[Kind][number]

/**
 * The questions this run of the wizard will ask.
 *
 * `canFork` is false when the space has nothing to offer on the xp side, and
 * then the answer is always the xo list with its first step removed - not the
 * list for whichever `kind` happens to be held, because there is no longer a
 * way to have chosen one.
 */
export function stepsFor(kind: Kind, canFork: boolean): readonly Step[] {
  if (!canFork) return STEPS_BY_KIND.xo.filter((step) => step !== 'kind')
  return STEPS_BY_KIND[kind]
}

/**
 * The step at this position, and never `undefined`.
 *
 * An index past the end is not a state the wizard should be able to reach, but
 * it is one a stale `at` can produce for a frame when the list shortens under
 * it - so it falls back to the first step rather than rendering nothing. The
 * final `'mode'` is unreachable while both lists are non-empty and is there so
 * the type is a `Step` rather than a `Step | undefined` every caller re-checks.
 */
export function stepAt(steps: readonly Step[], at: number): Step {
  return steps[at] ?? steps[0] ?? 'mode'
}

/**
 * Whether Next is live on this step.
 *
 * Only two steps have a required answer. `rules` is where the xo path asks for
 * a name; `config` is where the xp path does, and it also cannot be left
 * without a level chosen - picking none and pressing on would summon a match
 * with nothing to play.
 *
 * Everything else is either a choice with a default already in it or a screen
 * with nothing to fill in, so it is passable by pressing Next, which is what
 * makes the defaults worth having.
 */
export function canLeave(step: Step, { named, chosen }: { named: boolean; chosen: boolean }): boolean {
  if (step === 'rules') return named
  if (step === 'config') return named && chosen
  return true
}

/**
 * How far the wizard has been, which is not the same as where it is.
 *
 * Tracked rather than derived, because stepping back to change the mode must
 * not shut the steps in front of you: somebody who reached the last screen and
 * went back two to fix the clock should be able to jump straight forward again
 * rather than pressing Next three times.
 */
export function furthest(reached: number, next: number): number {
  return Math.max(reached, next)
}
