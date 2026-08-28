'use client'

import { useState } from 'react'
import {
  MAX_SAYS,
  CAPABILITIES,
  capabilityProblems,
  COMPARISONS,
  FLOW_STARTERS,
  flowProblems,
  presetNeeds,
  rulesOf,
  persists,
  MAX_ROUNDS,
  MAX_STEPS,
  RESERVED_GOES,
  ROUND_AGAIN,
  RUN_OVER,
  type Capability,
  type Comparison,
  type Condition,
  type FlowStarterId,
  type FlowStep,
  type Verb,
  type XpDocument,
  type XpFlow,
} from '@kxb/xp'
import { MODES } from '@kxb/xp'
import type { FlowTarget } from '@kxb/xp/edit'
import { FlowGraph } from '@/app/xp/_editor/panels/flow-graph'
import { VerbRow } from '@/app/xp/_editor/panels/behaviour'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'

/**
 * The round this level plays, drawn.
 *
 * docs/xp/xp-flow.md. The block is `flow` and the argument for its shape is in
 * `packages/xp/src/flow.ts`; this is the screen you can *see* one on - which
 * until now was nowhere. A flow is a state machine written as nested JSON, and
 * the one thing nested JSON cannot show is the shape of the machine.
 *
 * ---------------------------------------------------------------------------
 * Everything a phase is, and nothing left in the JSON
 * ---------------------------------------------------------------------------
 * It arrived in three pieces and it is worth saying which, because each one was
 * a different kind of argument. **`allow` and the start** are a list and a
 * choice, so they were a form from the beginning. **The arrows** are a graph and
 * waited for one - a destination dropdown per step would have drawn a state
 * machine worse than the JSON does. **`does`** waited on neither and was the
 * gap that made the other two hollow: you could add a phase, wire it up, narrow
 * the keys, and the one thing a phase is *for* was a grey row reading
 * `emit · teleport`. A flow was authorable right up to the point where it does
 * anything.
 *
 * It is the rules panel's own verb rows, not a second verb editor - `does` *is*
 * a `Verb[]`, the same one a rule's `do` is, so there is one form for it. See
 * `Does`.
 *
 * ---------------------------------------------------------------------------
 * The three warnings are the point
 * ---------------------------------------------------------------------------
 * `flowProblems` refuses two of them at parse time, so a document that got here
 * cannot have them - they are drawn anyway, because the panel is also what you
 * look at *while* making the mistake, and a refusal that arrives on save is a
 * refusal you have already spent ten minutes earning.
 *
 * The third is the one the parser cannot make: **a phase whose only way out is
 * an `on` for an event no rule in this document emits.** Nothing is wrong with
 * the flow in isolation; it is wrong about its neighbours, and it fails the way
 * this codebase's worst bugs fail - correct-looking and permanently inert. It
 * is exactly the shape of a rule matching `pickups` against a blueprint tagged
 * `pickup`, and it cost this project a deadlocked turn once already.
 */

export function FlowPanel({
  document,
  onAllow,
  onSays,
  onWho,
  onStart,
  onAddPhase,
  onRemovePhase,
  onAddStep,
  onRemoveStep,
  onVerbAdd,
  onVerbChange,
  onVerbRemove,
  onStartFlow,
  onRemoveFlow,
  onStarter,
  onCapabilities,
  onWins,
  onRounds,
  target,
  onTarget,
}: {
  document: XpDocument
  onAllow: (phase: string, allow: readonly string[] | undefined) => void
  onSays: (phase: string, says: string) => void
  /** Whose phase it is: 'turn', or null for everybody. */
  onWho: (phase: string, who: 'turn' | null) => void
  onStart: (phase: string) => void
  onAddPhase: (name: string) => void
  onRemovePhase: (name: string) => void
  onAddStep: (from: string, step: FlowStep) => void
  onRemoveStep: (from: string, at: number) => void
  onVerbAdd: (phase: string) => void
  onVerbChange: (phase: string, at: number, verb: Verb) => void
  onVerbRemove: (phase: string, at: number) => void
  /** Turn a place into a run, and back again. See `startFlow` in @kxb/xp/edit. */
  onStartFlow: (name: string) => void
  onRemoveFlow: () => void
  /** A whole round from one of the shapes a game usually has. */
  onStarter: (id: FlowStarterId) => void
  /** What the product may do with the level. See `PlayedAs`. */
  onCapabilities: (capabilities: readonly Capability[]) => void
  /** When the run is over. Null takes the field away. */
  onWins: (wins: Condition | null) => void
  /** How many times the round is played. Null is once. See `setFlowRounds`. */
  onRounds: (rounds: number | null) => void
  /**
   * Which of the level's rounds this panel is editing, and how to change it.
   *
   * A level can keep one per mode (`flows`), and every handler above is already
   * pointed at whichever this is - `useFlowEdits` binds the target once, so the
   * eighteen of them stayed the shape they were. All this panel does is say
   * which, and draw the picker.
   *
   * `undefined` is the level's own `flow`, which is what the panel opens on and
   * what every level with a single round has.
   */
  target: FlowTarget
  onTarget: (target: FlowTarget) => void
}) {
  const t = xpEditorDict(useLocale()).flow
  const flow = target === undefined ? document.flow : document.flows?.[target]
  const [selected, setSelected] = useState<string | null>(null)
  /** Both ends of an arrow somebody has drawn, waiting for its reason. */
  const [drawn, setDrawn] = useState<{ from: string; to: string } | null>(null)
  const [naming, setNaming] = useState('')

  if (!flow) {
    return (
      <div className="p-3 font-mono text-[11px] leading-relaxed text-neutral-500">
        {/*
          The first question, asked as a choice rather than as a paragraph.

          This used to open with "this level describes no round" and a sentence
          about what a flow is, and the only control was a box asking for the
          name of a phase - which is the right control for somebody who already
          knows what a phase is and nothing at all for somebody who knows they
          want a board game. The shapes are what a person has actually played;
          the phases are what those shapes are made of, and reading down a card
          from its name to its stages is how the second is learned from the
          first. See FLOW_STARTERS.
        */}
        <WhichRound document={document} target={target} onTarget={onTarget} />
        <PlayedAs document={document} onChange={onCapabilities} />
        <Shapes document={document} onStarter={onStarter} target={target} />
        <p className="mb-2 mt-5 text-neutral-500">{t.orBlank}</p>
        {/*
          The button that was not here, and its absence made every other control
          in this panel unreachable: `addPhase` refuses a document with no flow,
          so a level could only grow one by hand-editing the JSON — which is the
          thing this panel exists to stop being necessary.

          Named on the way in rather than made as `phase 1` and renamed after,
          because a phase's name is what every arrow and every warning in the
          graph says, and the first one is the one a whole flow is read from.
        */}
        <div className="flex gap-1">
          <input
            value={naming}
            onChange={(event) => setNaming(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              // The form around this would otherwise save the level.
              event.preventDefault()
              if (naming.trim()) onStartFlow(naming.trim())
              setNaming('')
            }}
            placeholder={t.theOpeningPhase}
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="button"
            disabled={naming.trim().length === 0}
            onClick={() => {
              onStartFlow(naming.trim())
              setNaming('')
            }}
            className="shrink-0 rounded border border-neutral-800 px-2 text-[11px] text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
          >
            {t.startAFlow}
          </button>
        </div>
      </div>
    )
  }

  const problems = flowProblems(flow)
  const emitted = emittedBy(document)
  const bound = (document.player.keys ?? []).map((binding) => binding.does)

  return (
    <div className="space-y-3 p-3 font-mono text-[11px]">
      <WhichRound document={document} target={target} onTarget={onTarget} />
      <PlayedAs document={document} onChange={onCapabilities} />
      <Rounds flow={flow} onRounds={onRounds} />
      <FlowGraph
        flow={flow}
        selected={selected}
        onSelect={setSelected}
        onConnect={(from, to) => setDrawn({ from, to })}
      />

      {drawn ? (
        <Reason
          // Keyed on the phase it starts from, so opening the form on a second
          // phase resets the fields rather than carrying the first one's answer
          // across - a `when` typed for `roll` is not an answer about `move`.
          key={drawn.from}
          from={drawn.from}
          to={drawn.to}
          phases={Object.keys(flow.phases)}
          /*
            The two destinations that are not phases. `@next-round` only where
            there is a round count to move - `addStep` refuses it otherwise, and
            offering a choice the layer below rejects is a dropdown that
            silently does nothing.
          */
          ends={flow.rounds ? RESERVED_GOES : [RUN_OVER]}
          fields={Object.keys(document.data ?? {})}
          emitted={[...emitted]}
          onCancel={() => setDrawn(null)}
          onAdd={(step) => {
            onAddStep(drawn.from, step)
            setDrawn(null)
          }}
        />
      ) : null}

      <div className="flex gap-1">
        <input
          value={naming}
          onChange={(event) => setNaming(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            // The form around this would otherwise save the level.
            event.preventDefault()
            if (naming.trim()) onAddPhase(naming.trim())
            setNaming('')
          }}
          placeholder={t.aNewPhase}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
        <button
          type="button"
          disabled={naming.trim().length === 0}
          onClick={() => {
            onAddPhase(naming.trim())
            setNaming('')
          }}
          className="shrink-0 rounded border border-neutral-800 px-2 text-[11px] text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
        >
          {t.add}
        </button>
      </div>

      {problems.length > 0 ? (
        <ul className="space-y-1 rounded border border-rose-900/60 bg-rose-950/30 p-2 text-rose-300">
          {problems.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {Object.entries(flow.phases).map(([name, phase]) => (
        <Phase
          key={name}
          document={document}
          name={name}
          phase={phase}
          start={name === flow.start}
          flow={flow}
          emitted={emitted}
          bound={bound}
          onAllow={onAllow}
          onSays={onSays}
          onWho={onWho}
          onStart={onStart}
          onRemove={onRemovePhase}
          onRemoveStep={onRemoveStep}
          onDrawArrow={() =>
            // Itself as the guess, and it is the honest one: "a six sends you
            // round again" is the arrow a table wants most, and every other
            // destination is one pick away in the dropdown.
            setDrawn({ from: name, to: name })
          }
          onVerbAdd={onVerbAdd}
          onVerbChange={onVerbChange}
          onVerbRemove={onVerbRemove}
          selected={selected === name}
          onSelect={() => setSelected(name)}
        />
      ))}

      {/*
        When the run is over, which is the field that makes a flow a game.

        Under the phases rather than beside the start, because it is a fact about
        the whole run rather than about any one of them - and reading down the
        panel now says the same thing the block does: it opens here, these are
        the states, and this is when it stops.
      */}
      <Wins
        wins={flow.wins}
        /**
         * Only the fields that do *not* outlive the run.
         *
         * The same rule `behaviour.tsx` follows about `of: 'world'` and for the
         * same reason: one click should not produce a document that will not
         * save. A `wins` counting a `space` field is refused by the parser
         * (`winsProblems`) because the second game would be won before anybody
         * moved, so offering one here would be offering the mistake.
         */
        fields={Object.entries(document.data ?? {})
          .filter(([, field]) => !persists(field))
          .map(([name]) => name)}
        onChange={onWins}
      />

      <p className="pt-1 text-[10px] leading-relaxed text-neutral-600">
        {t.dragBetweenLead} <span className="text-neutral-500">does</span>{' '}
        {t.dragBetweenTail}
      </p>

      {/*
        The way back out, at the bottom where a destructive thing belongs.

        It has to exist: without it, starting a flow is a one-way switch, and a
        one-way switch is one somebody presses to see what it does and then has
        to hand-edit JSON to undo. A flow is a *run*, and a level deciding it is
        a place after all is an ordinary edit rather than a mistake.
      */}
      <details className="group rounded border border-neutral-800/80">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-600 hover:text-neutral-300">
          {t.startOver}
        </summary>
        <div className="border-t border-neutral-800/80 p-2">
          <p className="mb-2 text-[10px] leading-relaxed text-amber-300/70">{t.startOverNote}</p>
          <Shapes document={document} onStarter={onStarter} target={target} />
        </div>
      </details>

      <RemoveFlow label={t.noRoundAtAll} sure={t.noRoundSure} onRemove={onRemoveFlow} />
    </div>
  )
}

/**
 * The whole block, gone - armed like the data panel's ×.
 *
 * One click used to do it, styled quieter than everything around it, which is
 * the exact wrong weight for the one control in the panel that throws away
 * every phase at once. Undo covers the slip, but only for somebody who knows
 * it happened: a flow vanishing reads as the panel resetting, not as an edit.
 * The second press is the data panel's answer, and disarming on blur is what
 * keeps the armed word from lying around.
 */
function RemoveFlow({
  label,
  sure,
  onRemove,
}: {
  label: string
  sure: string
  onRemove: () => void
}) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      type="button"
      onClick={() => (armed ? onRemove() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={`text-[10px] uppercase tracking-[0.18em] ${
        armed ? 'text-rose-400' : 'text-neutral-700 hover:text-rose-400'
      }`}
    >
      {armed ? sure : label}
    </button>
  )
}

/**
 * How many times the round is played, as a number and a way back to once.
 *
 * ---------------------------------------------------------------------------
 * The warning is half the control
 * ---------------------------------------------------------------------------
 * `rounds` and a step to the seam are a pair - the parser refuses either
 * alone - and the count is the half somebody types first. So a flow that has
 * gained a number and not yet an arrow says so *here*, next to what to do
 * about it, rather than in the red list at the top after a save has been
 * refused. Same argument the panel's other three warnings make.
 */
function Rounds({ flow, onRounds }: { flow: XpFlow; onRounds: (rounds: number | null) => void }) {
  const t = xpEditorDict(useLocale()).flow
  const rounds = flow.rounds
  const seam = Object.values(flow.phases).some((phase) =>
    (phase.next ?? []).some((step) => step.go === ROUND_AGAIN),
  )
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{t.rounds}</p>
        <input
          type="number"
          min={2}
          max={MAX_ROUNDS}
          value={rounds ?? ''}
          placeholder="1"
          aria-label={t.rounds}
          onChange={(event) => {
            const typed = Number(event.target.value)
            onRounds(Number.isInteger(typed) && typed >= 2 ? typed : null)
          }}
          className="w-14 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 text-right tabular-nums text-neutral-200 focus:border-neutral-600 focus:outline-none"
        />
        {rounds === undefined ? (
          <span className="text-[10px] text-neutral-600">{t.roundsOnce}</span>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-neutral-600">{t.roundsHint}</p>
      {rounds !== undefined && !seam ? (
        <p className="mt-1 text-[10px] leading-relaxed text-amber-400/80">{t.roundsNeedsSeam}</p>
      ) : null}
    </div>
  )
}

/**
 * Where this level may be played: as a room, as a match, as a ball game, as a
 * race. The document's `capabilities`, as four switches.
 *
 * ---------------------------------------------------------------------------
 * The first question, before the shape of the round
 * ---------------------------------------------------------------------------
 * Before "what happens in it" comes "what is it for" - and this is the one
 * block the editor could read and never write. A level made from the match
 * template offered "keep as a room" to every space for ever; the board game
 * is a table for four and had no way to say it was not a place to wander.
 * Every level can be kept standing as a room by default, which is what
 * `freeplay` means, and this is where a level opts out of that - *battles
 * only* - or in to the two the lobby needs a pitch or a track for.
 *
 * A claim the world cannot back is shown with the reason and cannot be
 * ticked, rather than ticked and refused at the save. The one the Mode preset
 * leans on cannot be unticked while the preset stands, and says which preset.
 * At least one stays ticked, because a level with no claim at all is read
 * back as freeplay, which would be the switch saying one thing and the
 * document another.
 *
 * The reason is the Mode panel's word for the same missing marks, not the
 * parser's: `capabilityProblems` answers in English, and this panel is two
 * languages. What decides is still the parser - the dictionary only says it.
 */
function PlayedAs({
  document,
  onChange,
}: {
  document: XpDocument
  onChange: (capabilities: readonly Capability[]) => void
}) {
  const dict = xpEditorDict(useLocale())
  const t = dict.flow
  const held = document.capabilities
  const preset = rulesOf(document).preset
  const leanedOn = presetNeeds(preset)
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">{t.playedAs}</p>
      <p className="mb-2 leading-relaxed text-neutral-500">{t.playedAsLead}</p>
      <ul className="space-y-1">
        {CAPABILITIES.map((capability) => {
          const on = held.includes(capability)
          const problems = capabilityProblems(capability, document.world)
          const last = on && held.length === 1
          const pinned = on && leanedOn === capability
          const blocked = (!on && problems.length > 0) || last || pinned
          const words = t.capabilities[capability]
          return (
            <li key={capability}>
              <label
                className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${
                  on
                    ? 'border-violet-500/30 bg-violet-500/[0.06]'
                    : 'border-neutral-800 bg-neutral-900/30'
                } ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={blocked}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...held, capability]
                        : held.filter((one) => one !== capability),
                    )
                  }
                  className="mt-0.5 size-3 shrink-0 accent-violet-500 disabled:opacity-40"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-neutral-200">{words.name}</span>
                  <span className="block text-[10px] leading-relaxed text-neutral-500">
                    {words.blurb}
                  </span>
                  {!on && problems.length > 0 ? (
                    <span className="block text-[10px] leading-relaxed text-amber-400/80">
                      {missingFor(capability, dict.mode)}
                    </span>
                  ) : null}
                  {pinned ? (
                    <span className="block text-[10px] leading-relaxed text-neutral-600">
                      {fill(t.presetLeansOn, { preset })}
                    </span>
                  ) : null}
                  {last ? (
                    <span className="block text-[10px] leading-relaxed text-neutral-600">
                      {t.atLeastOne}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The Mode panel's word for a capability's missing marks - see `whyNot` there,
 * which answers the same question for a preset. Both funnel through
 * `presetNeeds`/`capabilityProblems`, so the two panels cannot name different
 * marks for the same gap.
 */
function missingFor(capability: Capability, t: ReturnType<typeof xpEditorDict>['mode']): string {
  switch (capability) {
    case 'football':
      return t.needsGoals
    case 'competition':
      return t.needsStartFinish
    case 'match':
      return t.needsSpawns
    default:
      return t.needsSomething
  }
}

/**
 * The shapes a round usually has, as cards.
 *
 * One column, because this panel is a sixth of the window wide and two cards
 * across would be two columns of wrapped blurb. Each card reads top to bottom
 * the way a person learns the idea: the game they know, the stages it turns
 * out to be made of, and a sentence on what it is for. The stages are drawn
 * as the phase names the starter will actually write, so the card and the
 * graph that replaces it say the same words.
 *
 * `live` is marked as the current state when the level has no flow, and the
 * flow's own `start` is no guide to which of the others it came from - a
 * starter is a beginning, not an identity, and the level stops being "the
 * match shape" the moment somebody renames a phase. So only the one card that
 * can be known is marked.
 */
/**
 * Which of the level's rounds is on screen.
 *
 * A level keeps one round by default and may keep one per mode - a foyer's and
 * a battle's are different games played in the same document (`flows`). This is
 * the only control that says which one every other control in the panel is
 * pointed at, so it sits at the very top rather than beside the phases: it
 * changes what the whole panel *means*, and a picker for that below the thing
 * it re-labels is a picker people change by accident.
 *
 * Drawn only when the level has more than one round, or is being given one.
 * A document with a single flow is the common case and a row of four buttons
 * over it would be four buttons asking a question nobody has yet.
 *
 * A mode with no round of its own is still offered, greyed rather than hidden,
 * and choosing it is how you start one - the same shape the panel already uses
 * for a level with no flow at all. Hiding them would make "give the battle its
 * own round" a thing you can only discover by already knowing it exists.
 */
function WhichRound({
  document,
  target,
  onTarget,
}: {
  document: XpDocument
  target: FlowTarget
  onTarget: (target: FlowTarget) => void
}) {
  const t = xpEditorDict(useLocale()).flow
  const has = (where: FlowTarget) =>
    (where === undefined ? document.flow : document.flows?.[where]) !== undefined

  // Nothing to choose between until a second round exists or somebody is on one.
  if (!MODES.some((mode) => has(mode)) && target === undefined) return null

  return (
    <div className="mb-3">
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
        {t.whichRound}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[undefined, ...MODES].map((where) => (
          <button
            key={where ?? 'any'}
            type="button"
            onClick={() => onTarget(where)}
            title={where === undefined ? t.roundAnyBlurb : t.roundModeBlurb}
            className={`rounded border px-2 py-1 text-[11px] transition-colors ${
              target === where
                ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                : has(where)
                  ? 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  : 'border-neutral-900 text-neutral-600 hover:border-neutral-700'
            }`}
          >
            {where === undefined ? t.roundAny : t.modes[where]}
            {/* A dot for a mode that has a round of its own, so the row says
                which of them are actually written without being read. */}
            {where !== undefined && has(where) ? (
              <span aria-hidden className="ml-1 text-violet-400">
                ·
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <p className="mt-1 leading-relaxed text-neutral-500">
        {target === undefined ? t.roundAnyBlurb : t.roundModeBlurb}
      </p>
    </div>
  )
}

function Shapes({
  document,
  onStarter,
  target,
}: {
  document: XpDocument
  onStarter: (id: FlowStarterId) => void
  /** Which round the shapes replace. See `FlowPanel`'s `target`. */
  target: FlowTarget
}) {
  const t = xpEditorDict(useLocale()).flow
  const hasFlow =
    (target === undefined ? document.flow : document.flows?.[target]) !== undefined
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">{t.shapes}</p>
      <p className="mb-3 leading-relaxed text-neutral-500">{t.shapesLead}</p>
      <ul className="space-y-1.5">
        {FLOW_STARTERS.map((starter) => {
          const words = t.starters[starter.id]
          const current = starter.id === 'live' && !hasFlow
          return (
            <li
              key={starter.id}
              className={`rounded-md border p-2 ${
                current
                  ? 'border-violet-500/40 bg-violet-500/[0.06]'
                  : 'border-neutral-800 bg-neutral-900/30'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-neutral-200">{words?.name ?? starter.name}</span>
                {current ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-violet-300/80">
                    {t.current}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStarter(starter.id)}
                    className="shrink-0 rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 transition-colors hover:border-violet-500/60 hover:text-violet-200"
                  >
                    {t.use}
                  </button>
                )}
              </div>
              {starter.stages.length > 0 ? (
                <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-neutral-400">
                  {starter.stages.map((stage, index) => (
                    <span key={stage} className="flex items-center gap-1">
                      {index > 0 ? <span className="text-neutral-700">→</span> : null}
                      <span className="rounded bg-neutral-800/80 px-1 py-px">{stage}</span>
                    </span>
                  ))}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                {words?.blurb ?? starter.blurb}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Phase({
  document,
  name,
  phase,
  start,
  flow,
  emitted,
  bound,
  onAllow,
  onSays,
  onWho,
  onStart,
  onRemove,
  onRemoveStep,
  onDrawArrow,
  onVerbAdd,
  onVerbChange,
  onVerbRemove,
  selected,
  onSelect,
}: {
  document: XpDocument
  name: string
  phase: XpFlow['phases'][string]
  start: boolean
  flow: XpFlow
  emitted: ReadonlySet<string>
  bound: readonly string[]
  onAllow: (phase: string, allow: readonly string[] | undefined) => void
  onSays: (phase: string, says: string) => void
  onWho: (phase: string, who: 'turn' | null) => void
  onStart: (phase: string) => void
  onRemove: (name: string) => void
  onRemoveStep: (from: string, at: number) => void
  /** Open the reason form for a new arrow out of this phase. */
  onDrawArrow: () => void
  onVerbAdd: (phase: string) => void
  onVerbChange: (phase: string, at: number, verb: Verb) => void
  onVerbRemove: (phase: string, at: number) => void
  selected: boolean
  onSelect: () => void
}) {
  const t = xpEditorDict(useLocale()).flow
  const steps = phase.next ?? []
  /**
   * Reachable, worked out here rather than trusted.
   *
   * The start always is; everything else needs an arrow pointing at it. Same
   * walk `flowProblems` does, and drawn per phase rather than as one sentence at
   * the top because the useful place to say "nothing reaches this" is on the
   * thing nothing reaches.
   */
  const reached =
    start ||
    Object.values(flow.phases).some((other) => (other.next ?? []).some((step) => step.go === name))

  /** An arrow waiting on a word nothing in the document ever says. */
  const dead = steps.filter((step) => step.on !== undefined && !emitted.has(step.on))

  return (
    <section
      onClick={onSelect}
      className={`rounded border bg-neutral-900/40 ${selected ? 'border-violet-800' : 'border-neutral-800'}`}
    >
      <header className="flex items-baseline gap-2 border-b border-neutral-800 px-2 py-1.5">
        <span className="text-neutral-200">{name}</span>
        {start ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-violet-300">{t.start}</span>
        ) : (
          <button
            type="button"
            onClick={() => onStart(name)}
            className="text-[10px] uppercase tracking-[0.18em] text-neutral-600 hover:text-violet-200"
          >
            {t.makeStart}
          </button>
        )}
        {!reached ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-rose-400">{t.unreachable}</span>
        ) : null}
        {steps.length === 0 ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-amber-400">
            {t.noWayOut}
          </span>
        ) : null}
        {/* The start is refused rather than reassigned, so there is nothing to
            offer here - see `removePhase`. */}
        {start ? null : (
          <button
            type="button"
            onClick={() => onRemove(name)}
            className="ml-auto text-[10px] uppercase tracking-[0.18em] text-neutral-700 hover:text-rose-400"
          >
            {t.remove}
          </button>
        )}
      </header>

      {/*
        `does` full width and `allow` in the label column, which is not an
        inconsistency: a verb row is a *form* - three controls and a remove -
        and this panel is a narrow one, so squeezing it into the space left by a
        twelve-character label makes every select unreadable. `allow` really is
        a value beside a label.
      */}
      <div className="px-2 py-1.5 text-neutral-400">
        {/*
          What the phase says, first, because it is the only part of a flow a
          *player* ever reads - and therefore the part most likely to be wrong.
          An author who has to open the JSON to fix a sentence leaves the
          sentence wrong.
        */}
        <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-neutral-600">{t.says}</p>
        <textarea
          value={phase.says ?? ''}
          rows={2}
          maxLength={MAX_SAYS}
          placeholder={t.whatAPlayerCanDo}
          onChange={(event) => onSays(name, event.target.value)}
          className="mb-2 w-full resize-none rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 text-[11px] leading-snug text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
        <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-neutral-600">{t.does}</p>
        <Does
          document={document}
          name={name}
          phase={phase}
          onVerbAdd={onVerbAdd}
          onVerbChange={onVerbChange}
          onVerbRemove={onVerbRemove}
        />
        <dl className="mt-2">
          <Row label={t.allow}>
            <Allow name={name} phase={phase} bound={bound} onAllow={onAllow} />
          </Row>
          {/*
            Whose phase it is. One checkbox and not a picker, because the
            vocabulary is one word: a phase belongs to the player who is up,
            or to everybody. Under `allow` because it is the same question one
            step further - allow says which keys are live, this says for whom.
          */}
          <Row label={t.who}>
            <label className="flex items-center gap-1.5 text-neutral-300">
              <input
                type="checkbox"
                checked={phase.who === 'turn'}
                onChange={(event) => onWho(name, event.target.checked ? 'turn' : null)}
                className="accent-violet-500"
              />
              {t.whoTurn}
            </label>
            {phase.who === 'turn' ? (
              <p className="mt-1 text-[10px] leading-relaxed text-neutral-600">{t.whoNote}</p>
            ) : null}
          </Row>
        </dl>
      </div>

      <ul className="space-y-1 border-t border-neutral-800 px-2 py-1.5">
        {steps.length === 0 ? (
          <li className="text-neutral-500">
            {t.nothingLeaves}
          </li>
        ) : null}
        {steps.map((step, at) => (
          <li key={at} className="flex items-baseline gap-2">
            <span className="text-neutral-600">→</span>
            {/* A destination that is not a phase reads as what it does rather
                than as its `@` spelling: the word is the document's, the
                sentence is the reader's. */}
            <span
              className={
                RESERVED_GOES.includes(step.go) ? 'text-violet-300/80' : 'text-neutral-300'
              }
            >
              {step.go === ROUND_AGAIN
                ? t.goNextRound
                : step.go === RUN_OVER
                  ? t.goEnd
                  : step.go}
            </span>
            <span className={`flex-1 ${dead.includes(step) ? 'text-rose-400' : 'text-neutral-500'}`}>
              {step.on !== undefined
                ? `on "${step.on}"${dead.includes(step) ? ' — nothing emits this' : ''}`
                : step.after !== undefined
                  ? `after ${step.after}s`
                  : step.when
                    ? `when ${step.when.of === 'world' ? '' : `${step.when.of ?? 'self'}.`}${step.when.prop} ${step.when.is} ${step.when.value}`
                    : 'always'}
            </span>
            <button
              type="button"
              onClick={() => onRemoveStep(name, at)}
              aria-label={`Remove the arrow to ${step.go}`}
              className="text-neutral-700 hover:text-rose-400"
            >
              ×
            </button>
          </li>
        ))}
        {/*
          The way out that is not a drag.

          The graph is the right thing to *read* a flow from and the wrong thing
          to be the only way to write one: dragging a five-pixel handle onto a
          box is a gesture with no keyboard, no discoverability and one chance to
          land. So the arrow can also be started from the phase it leaves, and
          the form it opens is the same one - a destination dropdown and the
          reason, which is all a step ever was.
        */}
        <li>
          <button
            type="button"
            onClick={onDrawArrow}
            disabled={steps.length >= MAX_STEPS}
            className="text-[10px] text-neutral-600 underline-offset-4 hover:text-violet-200 hover:underline disabled:opacity-30"
          >
            {steps.length >= MAX_STEPS ? `${MAX_STEPS} is the most a phase may have` : '+ arrow'}
          </button>
        </li>
      </ul>
    </section>
  )
}

/**
 * What a phase does on being entered, as the verb rows the rules panel draws.
 *
 * ---------------------------------------------------------------------------
 * The same rows, deliberately, and not a second verb editor
 * ---------------------------------------------------------------------------
 * A phase's `does` **is** a `Verb[]` - the same one a rule's `do` is, by the
 * design of the block rather than by coincidence - so drawing it with a second
 * set of controls would be two forms that have to be kept in step over a
 * vocabulary that grows. `VerbRow` is exported from ./behaviour for exactly
 * this, and what it offers here is what it offers there: the ops the engine
 * has, with the fields each one actually carries.
 *
 * ---------------------------------------------------------------------------
 * The last verb *may* go, unlike a rule's
 * ---------------------------------------------------------------------------
 * A rule with nothing to do is refused by the parser, so its last row has no
 * remove button. A phase with nothing to do is the ordinary case - a phase that
 * only waits is most of a turn - so every row here has one, and removing the
 * last drops the field rather than leaving `"does": []` in the document.
 */
function Does({
  document,
  name,
  phase,
  onVerbAdd,
  onVerbChange,
  onVerbRemove,
}: {
  document: XpDocument
  name: string
  phase: XpFlow['phases'][string]
  onVerbAdd: (phase: string) => void
  onVerbChange: (phase: string, at: number, verb: Verb) => void
  onVerbRemove: (phase: string, at: number) => void
}) {
  const t = xpEditorDict(useLocale()).flow
  const does = phase.does ?? []

  return (
    <div className="space-y-1">
      {does.length === 0 ? (
        <p className="text-neutral-600">{t.nothingOnEntering}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {does.map((verb, at) => (
          <li key={at}>
            <VerbRow
              document={document}
              verb={verb}
              onChange={(next) => onVerbChange(name, at, next)}
              onRemove={() => onVerbRemove(name, at)}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onVerbAdd(name)}
        className="text-[10px] text-neutral-600 underline-offset-4 hover:text-violet-200 hover:underline"
      >
        {t.addVerb}
      </button>
    </div>
  )
}

/**
 * When this run is won, as the condition row the rest of the editor draws.
 *
 * ---------------------------------------------------------------------------
 * `of: 'world'` and nothing else, unlike a rule's condition
 * ---------------------------------------------------------------------------
 * A trigger's `when` may ask about `self` or `other` because a rule is *on*
 * something and something set it off. A flow is on nothing and nobody set it
 * off, so the only subject it can honestly have is the level - which is why
 * this draws a field picker rather than the three-way subject choice next door.
 * Offering `self` here would be offering a question about the player's own
 * properties dressed up as a question about the game.
 *
 * Absent is a run with no ending of its own, and going back to it is a button
 * rather than an empty field: clearing a text box to mean "never ends" is the
 * kind of state nobody discovers.
 */
function Wins({
  wins,
  fields,
  onChange,
}: {
  wins: Condition | undefined
  fields: readonly string[]
  onChange: (wins: Condition | null) => void
}) {
  const t = xpEditorDict(useLocale()).flow
  if (!wins) {
    return (
      <div className="rounded border border-neutral-800 px-2 py-1.5">
        <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-neutral-600">{t.wins}</p>
        <p className="mb-1.5 text-neutral-500">
          Nothing ends this run. A turn that goes round forever is a real thing to want; a
          game is not one of them.
        </p>
        <button
          type="button"
          disabled={fields.length === 0}
          onClick={() => onChange({ of: 'world', prop: fields[0]!, is: '>=', value: 1 })}
          title={
            fields.length === 0
              ? t.anEndingCounts
              : undefined
          }
          className="text-[10px] uppercase tracking-[0.14em] text-neutral-600 hover:text-violet-200 disabled:opacity-30"
        >
          {fields.length === 0 ? t.nothingStartsOver : t.sayWhenItIsWon}
        </button>
        {/*
          Said rather than left to be deduced from a disabled button. "This level
          counts nothing yet" would be a lie about a board game with four
          counters in it — they are all kept in the space, which is exactly the
          thing an ending cannot read.
        */}
        {fields.length === 0 ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-600">
            {t.endingNeedsRunLead}{' '}
            <span className="text-neutral-400">run</span>.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded border border-violet-900/60 bg-violet-950/20 px-2 py-1.5">
      <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-neutral-600">{t.wins}</p>
      <div className="flex items-center gap-1">
        <select
          value={wins.prop}
          onChange={(event) => onChange({ ...wins, prop: event.target.value })}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 text-[11px] text-neutral-200"
        >
          {fields.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={wins.is}
          onChange={(event) => onChange({ ...wins, is: event.target.value as Comparison })}
          className="shrink-0 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 text-[11px] text-neutral-200"
        >
          {COMPARISONS.map((is) => (
            <option key={is} value={is}>
              {is}
            </option>
          ))}
        </select>
        <input
          value={String(wins.value)}
          inputMode="numeric"
          onChange={(event) => {
            const typed = Number(event.target.value)
            if (Number.isFinite(typed)) onChange({ ...wins, value: typed })
          }}
          className="w-14 shrink-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 text-[11px] text-neutral-200"
        />
      </div>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="mt-1 text-[10px] uppercase tracking-[0.14em] text-neutral-600 hover:text-rose-400"
      >
        {t.neverEnds}
      </button>
    </div>
  )
}

/**
 * Which keys are live here, as one checkbox per binding plus a way back.
 *
 * The three states are not two: **absent** is every binding this level has and
 * whatever it gains later, **a list** is those, and **empty** is nobody acts.
 * A row of checkboxes can only say the middle two, so "everything" is its own
 * control - and unticking the last box lands on empty rather than falling back
 * to everything, because a phase that says *watch, do not touch* is the one
 * anybody is deliberately building.
 */
function Allow({
  name,
  phase,
  bound,
  onAllow,
}: {
  name: string
  phase: XpFlow['phases'][string]
  bound: readonly string[]
  onAllow: (phase: string, allow: readonly string[] | undefined) => void
}) {
  const t = xpEditorDict(useLocale()).flow
  const all = phase.allow === undefined
  const live = new Set(phase.allow ?? bound)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {bound.length === 0 ? <span className="text-neutral-600">{t.noKeys}</span> : null}
        {bound.map((does) => (
          <label
            key={does}
            className={`flex items-center gap-1 ${all ? 'text-neutral-600' : 'text-neutral-300'}`}
          >
            <input
              type="checkbox"
              checked={live.has(does)}
              disabled={all}
              onChange={(event) => {
                const next = new Set(phase.allow ?? [])
                if (event.target.checked) next.add(does)
                else next.delete(does)
                onAllow(name, bound.filter((one) => next.has(one)))
              }}
              className="accent-violet-500"
            />
            {does}
          </label>
        ))}
      </div>
      <div className="flex gap-3 text-[10px] uppercase tracking-[0.14em]">
        <button
          type="button"
          onClick={() => onAllow(name, undefined)}
          className={all ? 'text-violet-300' : 'text-neutral-600 hover:text-neutral-300'}
        >
          {t.everything}
        </button>
        <button
          type="button"
          onClick={() => onAllow(name, [])}
          className={
            phase.allow?.length === 0 ? 'text-amber-400' : 'text-neutral-600 hover:text-neutral-300'
          }
        >
          {t.nothing}
        </button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 text-[10px] uppercase tracking-[0.14em] text-neutral-600">
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

/**
 * Every word this document's rules can say.
 *
 * Walked rather than assumed, because the check it feeds is about two halves of
 * one document agreeing: an arrow waits on an event, and only a rule can send
 * one. A `flow` block is refusable on its own and this is the part that is not.
 */
function emittedBy(document: XpDocument): ReadonlySet<string> {
  const said = new Set<string>()
  for (const blueprint of Object.values(document.blueprints)) {
    for (const trigger of blueprint.triggers ?? []) {
      for (const verb of trigger.do) if (verb.op === 'emit') said.add(verb.event)
    }
  }
  /*
   * A phase's own verbs count too: one phase can hand the round to the next by
   * saying something, which is the shape a `does` of `emit` is for.
   *
   * Every round the level has, not just the one on screen. What this answers is
   * "is anything in this document capable of saying that word", and a step in
   * the battle's round listening for something the lobby's round emits is a
   * level talking to itself across its own rounds - odd, and not wrong, and
   * certainly not something to be told is a typo.
   */
  for (const round of [document.flow, ...Object.values(document.flows ?? {})]) {
    for (const phase of Object.values(round?.phases ?? {})) {
      for (const verb of phase.does ?? []) if (verb.op === 'emit') said.add(verb.event)
    }
  }
  return said
}

/**
 * Why an arrow somebody just drew is taken.
 *
 * It lands *with* the arrow rather than after it, because a step with no
 * `when`, `on` or `after` is refused by `flowProblems` - so drawing the line
 * first and asking later would hold a document that cannot save for as long as
 * somebody took to answer.
 *
 * `on` first and selected by default, because it is the transition a
 * round-based flow actually uses and the only one that costs nothing: `emitted`
 * is already a trigger event, so a rule that finishes a turn says so and the
 * flow hears it. `after` is last and says what it costs - it is the only field
 * in the whole block that needs a clock everybody agrees on.
 */
function Reason({
  from,
  to,
  phases,
  ends,
  fields,
  emitted,
  onAdd,
  onCancel,
}: {
  from: string
  /** Where the drag landed, or the first sensible guess when a button opened this. */
  to: string
  /** Every phase, so the destination is correctable without redrawing the line. */
  phases: readonly string[]
  /** The destinations that are not phases - see `RESERVED_GOES`. */
  ends: readonly string[]
  fields: readonly string[]
  /**
   * Every event a rule in this document emits, offered under the `on` box.
   *
   * A datalist rather than a select, because the event an arrow waits for may
   * be one nobody has written the rule for yet - the flow is often drawn
   * first. But the ones that *do* exist are exactly the names worth not
   * mistyping: "nothing emits this" is the warning this panel exists to draw,
   * and a list of what does is the cheapest way not to earn it.
   */
  emitted: readonly string[]
  onAdd: (step: FlowStep) => void
  onCancel: () => void
}) {
  const t = xpEditorDict(useLocale()).flow
  const [kind, setKind] = useState<'on' | 'when' | 'after'>('on')
  /**
   * The comparison, which was `>=` with no control over it.
   *
   * "The turn passes when the die is 0" is `==`; "go again on a six" is `==`
   * too; "the first side to four" is `>=`. One operator hard-coded made the
   * form able to say one of the three, and the other two were hand-edited
   * JSON - the state this panel exists to end. It is the same `COMPARISONS`
   * the rules panel offers, so the two forms cannot disagree about what a
   * condition may say.
   */
  const [is, setIs] = useState<Comparison>('>=')
  /**
   * The destination, editable rather than fixed.
   *
   * It was a fixed label, which made the drag the *only* way to say where an
   * arrow goes - and a drag is a gesture with no keyboard, no discoverability
   * and one chance to land on a 132-pixel box. So the graph still draws the
   * shape and still starts one, and this is where the answer actually is: a
   * dropdown, pre-filled with wherever the line was dropped.
   */
  const [go, setGo] = useState(to)
  const [event, setEvent] = useState('')
  const [prop, setProp] = useState(fields[0] ?? '')
  const [value, setValue] = useState('1')
  const [seconds, setSeconds] = useState('10')

  const ready =
    kind === 'on' ? event.trim().length > 0 : kind === 'when' ? prop.length > 0 : Number(seconds) > 0

  return (
    <div className="space-y-2 rounded border border-violet-900/60 bg-violet-950/20 p-2">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-neutral-300">{from}</span>
        <span className="text-neutral-600">→</span>
        <select
          value={go}
          onChange={(one) => setGo(one.target.value)}
          aria-label={t.whereThisArrowGoes}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 text-[11px] text-neutral-200"
        >
          {phases.map((one) => (
            <option key={one} value={one}>
              {one}
            </option>
          ))}
          {/* Under a rule, because these are a different kind of answer: a
              phase is somewhere the run *is*, and these two are what happens
              to the run itself. */}
          {ends.length > 0 ? (
            <optgroup label={t.endsGroup}>
              {ends.map((one) => (
                <option key={one} value={one}>
                  {one === ROUND_AGAIN ? t.goNextRound : t.goEnd}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>

      <div className="flex gap-2 text-[10px] uppercase tracking-[0.14em]">
        {(['on', 'when', 'after'] as const).map((one) => (
          <button
            key={one}
            type="button"
            onClick={() => setKind(one)}
            className={kind === one ? 'text-violet-300' : 'text-neutral-600 hover:text-neutral-300'}
          >
            {one}
          </button>
        ))}
      </div>

      {kind === 'on' ? (
        <>
          <input
            value={event}
            onChange={(one) => setEvent(one.target.value)}
            placeholder={t.anEventARuleEmits}
            list={`flow-emits-${from}`}
            className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <datalist id={`flow-emits-${from}`}>
            {emitted.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>
      ) : kind === 'when' ? (
        <div className="flex gap-1">
          <select
            value={prop}
            onChange={(one) => setProp(one.target.value)}
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 text-[11px] text-neutral-200"
          >
            {fields.length === 0 ? <option value="">{t.noData}</option> : null}
            {fields.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </select>
          <select
            value={is}
            onChange={(one) => setIs(one.target.value as Comparison)}
            aria-label="comparison"
            className="shrink-0 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[11px] text-neutral-300"
          >
            {COMPARISONS.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </select>
          <input
            value={value}
            onChange={(one) => setValue(one.target.value)}
            className="w-14 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-[11px] text-neutral-200"
          />
        </div>
      ) : (
        <div className="space-y-1">
          <input
            value={seconds}
            onChange={(one) => setSeconds(one.target.value)}
            className="w-20 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-[11px] text-neutral-200"
          />
          <p className="text-[10px] leading-relaxed text-amber-500/80">
            {t.clockNote}
          </p>
        </div>
      )}

      <div className="flex gap-2 text-[10px] uppercase tracking-[0.14em]">
        <button
          type="button"
          disabled={!ready || go.length === 0}
          onClick={() =>
            onAdd(
              kind === 'on'
                ? { on: event.trim(), go }
                : kind === 'when'
                  ? { when: { of: 'world', prop, is, value: Number(value) || 0 }, go }
                  : { after: Number(seconds), go },
            )
          }
          className="text-violet-300 disabled:opacity-30"
        >
          {t.add}
        </button>
        <button type="button" onClick={onCancel} className="text-neutral-600 hover:text-neutral-300">
          {t.cancel}
        </button>
      </div>
    </div>
  )
}
