'use client'

import { DEFAULT_REACH } from '@kxb/xp/engine'
import {
  COMPARISONS,
  dataOf,
  isDataRef,
  refField,
  MAIN_SCENE,
  MATERIALS,
  MAX_REACH,
  rulesOf,
  TRIGGER_EVENTS,
  type Blueprint,
  type Comparison,
  type DataRef,
  type Trigger,
  type TriggerEvent,
  type Verb,
  type VerbTarget,
  type XpDocument,
} from '@kxb/xp'
import { SOUND_NAMES, isSound } from '@kxb/xp/sounds'
import { NumberInput } from '@/app/xp/_editor/number-field'
import { CLIPS } from '@/app/xp/_runtime/clips.generated'
import { BODY_PARTS } from '@/app/xp/_runtime/body/layers'
import type { TriggerPatch } from '@kxb/xp/edit'
import { useState } from 'react'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * The parts a clip can be aimed at, in the order somebody reads a body.
 *
 * From `BODY_PARTS` rather than written out, so the panel cannot offer a name
 * the host does not resolve - and sorted here rather than there, because the
 * order is a fact about reading a row of buttons and not about the rig.
 */
const BODY_PART_NAMES = ['head', 'torso', 'arms', 'arm.l', 'arm.r', 'legs', 'leg.l', 'leg.r'].filter(
  (part) => part in BODY_PARTS,
)

/**
 * Rules, as rows.
 *
 * The gap this closes was the biggest one left in the editor: every other part
 * of a document had a control and this had a text editor somewhere else - you
 * could draw a room, place a crate and name it, and then had to hand-write JSON
 * to make the crate do anything. A level whose *behaviour* is only editable by
 * typing is a level nobody but its author can change.
 *
 * ---------------------------------------------------------------------------
 * This is a form, not a language
 * ---------------------------------------------------------------------------
 * That is the whole reason it can exist at this size. The vocabulary is closed
 * and typed (`@kxb/xp` § verbs): a fixed set of events, a fixed set of
 * comparisons, a fixed set of verbs, and a condition that is one property
 * against one number. So every control here is a `select` over a constant, and
 * there is nothing anybody can write that fails at runtime - no parser, no
 * scope, no evaluation order, no story about what happens when an expression
 * throws.
 *
 * Counted rather than described, this comment used to say "four events, six
 * comparisons, eight verbs" - and by the time anybody read it there were
 * thirteen verbs, five of which this panel did not offer. A number in a comment
 * beside a list is a number that goes wrong silently; `OPS` below is the list,
 * and it is the thing to keep in step with the engine.
 *
 * The escape hatch for a rule that genuinely needs to *compute* is a script, one
 * panel over. Keeping the two apart is what keeps this a form.
 *
 * ---------------------------------------------------------------------------
 * Every edit goes through the pure layer
 * ---------------------------------------------------------------------------
 * Nothing here writes to the document. `setTrigger` and its siblings refuse an
 * empty `do` and a `spawn` naming a blueprint nobody wrote, because both are
 * documents the parser sends back - and the editor's one hard property is that
 * what it produces still opens (docs/xp/manual.md §9). A refusal arrives as
 * "nothing happened", which is why the two things that can be refused are not
 * offered: the last verb has no remove button, and the blueprint picker only
 * lists blueprints that exist.
 */

export interface RulesProps {
  document: XpDocument
  /** Which blueprint's rules are open. Held above the panel so a drag keeps it. */
  open: string | null
  onOpen: (blueprint: string | null) => void
  onAdd: (blueprint: string) => void
  onChange: (blueprint: string, index: number, patch: TriggerPatch) => void
  onRemove: (blueprint: string, index: number) => void
  onVerbAdd: (blueprint: string, trigger: number) => void
  onVerbChange: (blueprint: string, trigger: number, index: number, verb: Verb) => void
  onVerbRemove: (blueprint: string, trigger: number, index: number) => void
}

export function BehaviourPanel({
  document,
  open,
  onOpen,
  onAdd,
  onChange,
  onRemove,
  onVerbAdd,
  onVerbChange,
  onVerbRemove,
}: RulesProps) {
  const t = xpEditorDict(useLocale()).behaviour
  const names = Object.keys(document.blueprints)
  const blueprint = open && document.blueprints[open] ? open : null
  const chosen: Blueprint | null = blueprint ? document.blueprints[blueprint] : null

  if (names.length === 0) {
    return (
      <Hint>{t.noBlueprintsYet}</Hint>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <PanelLabel className="mb-1.5">{t.heading} {names.length}</PanelLabel>
        <ul className="max-h-40 overflow-y-auto pr-1">
          {names.map((name) => {
            const rules = document.blueprints[name].triggers.length
            const on = blueprint === name
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onOpen(on ? null : name)}
                  className={`flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
                    on ? 'bg-violet-500/15 text-violet-200' : 'text-neutral-400 hover:bg-neutral-900'
                  }`}
                >
                  <span className="truncate">{name}</span>
                  {/*
                    The count follows the row rather than staying grey: on the
                    open row the background is a violet tint, and neutral-600
                    against it is dimmer than it is against the panel - the one
                    row you are looking at would have the least readable count.
                  */}
                  <span
                    className={`ml-auto shrink-0 font-mono text-[10px] tabular-nums ${
                      on ? 'text-violet-300/80' : 'text-neutral-600'
                    }`}
                  >
                    {/* The count, because "which of these actually does
                        something" is the question somebody opens this to
                        answer. */}
                    {rules === 0
                      ? '—'
                      : fill(rules === 1 ? t.ruleOne : t.ruleMany, { n: rules })}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {blueprint && chosen ? (
        <section>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <PanelLabel className="min-w-0 truncate">{blueprint}</PanelLabel>
            <button
              type="button"
              onClick={() => onAdd(blueprint)}
              className="shrink-0 text-[10px] text-neutral-500 underline-offset-4 hover:text-violet-300 hover:underline"
            >
              {t.addRule}
            </button>
          </div>

          {chosen.triggers.length === 0 ? (
            <Hint>{t.noRules}</Hint>
          ) : (
            <ul className="flex flex-col gap-2">
              {chosen.triggers.map((trigger, index) => (
                <li key={index}>
                  <Rule
                    document={document}
                    trigger={trigger}
                    onChange={(patch) => onChange(blueprint, index, patch)}
                    onRemove={() => onRemove(blueprint, index)}
                    onVerbAdd={() => onVerbAdd(blueprint, index)}
                    onVerbChange={(verb, at) => onVerbChange(blueprint, index, at, verb)}
                    onVerbRemove={(at) => onVerbRemove(blueprint, index, at)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <Hint>{t.pickABlueprint}</Hint>
      )}
    </div>
  )
}

/** One rule: when it fires, what it asks first, and what it then does. */
function Rule({
  document,
  trigger,
  onChange,
  onRemove,
  onVerbAdd,
  onVerbChange,
  onVerbRemove,
}: {
  document: XpDocument
  trigger: Trigger
  onChange: (patch: TriggerPatch) => void
  onRemove: () => void
  onVerbAdd: () => void
  onVerbChange: (verb: Verb, index: number) => void
  onVerbRemove: (index: number) => void
}) {
  const t = xpEditorDict(useLocale()).behaviour
  /**
   * Whether this level has a key a rule could listen for.
   *
   * `player.keys` is where a document says which keys it has, and `setTrigger`
   * fills the first one in when somebody picks `pressed`. With none there is
   * nothing to fill in and the choice is refused - so the picker says why
   * rather than snapping back in silence, which is how the bug was reported.
   */
  const bindable = (document.player.keys?.length ?? 0) > 0

  /**
   * What this level keeps, for the condition's subject picker below.
   *
   * The verb rows read the same list for their own picker. Both from the
   * document rather than passed down, because a rule row's whole job is to
   * offer the things the document names.
   */
  const fields = Object.keys(dataOf(document))

  return (
    <div className="rounded border border-neutral-800 p-2">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 font-mono text-[10px] text-neutral-600">{t.on}</span>
        {/*
          `pressed` needs a key to listen for, and a level with no bindings has
          none. Labelled rather than hidden - the engine has the event whatever
          this document declares, and a picker that quietly dropped it would be
          the panel lying about what a rule can be. `setTrigger` refuses the
          same case, so this is the sentence that refusal never had.
        */}
        <Choose
          value={trigger.on}
          options={TRIGGER_EVENTS.map(
            (event) =>
              [
                event,
                event === 'pressed' && !bindable ? t.bindAKeyFirst : event,
              ] as const,
          )}
          onChange={(event) => onChange({ on: event as TriggerEvent })}
        />
        <button
          type="button"
          onClick={onRemove}
          title={t.deleteRule}
          className="ml-auto shrink-0 text-[10px] text-neutral-600 underline-offset-4 hover:text-red-400 hover:underline"
        >
          ×
        </button>
      </div>

      {/*
        `finished` is a real event and belongs in this picker for every
        document - it is the engine's vocabulary, and filtering it out for one
        document's mode would be the panel lying about what the engine can do.
        What it must not do is let somebody write a rule that can never fire and
        say nothing: a freestyle level has no end, so nothing ever ends it.

        Said only once the event is actually chosen, because a warning attached
        to an option nobody picked is noise on every rule in the level.

        `rulesOf` rather than `document.rules?.preset`: absent parses as
        freestyle, and a document that never declared a mode is the most likely
        one to hit this.
      */}
      {trigger.on === 'finished' && rulesOf(document).preset === 'freestyle' ? (
        <p className="mt-1.5 font-mono text-[10px] leading-tight text-amber-300/70">
          {t.neverFires}
        </p>
      ) : null}

      {/*
        Which binding a press listens for, and how near you have to be.

        Both only exist on `pressed`, and the picker is the level's own binding
        names rather than free text: a rule listening for a name nothing binds
        is a rule that never fires, and the editor is where that is cheapest to
        prevent. With nothing bound there is nothing to pick, so the row says
        where bindings come from instead of offering an empty list — this rule
        cannot be written at all until the document has a key.

        The reach is a checkbox and a number, like the condition below and for
        the same reason: the common case is a hatch you are standing in front
        of, and a field only appears once somebody wants one.
      */}
      {trigger.on === 'pressed' ? <Pressed document={document} trigger={trigger} onChange={onChange} /> : null}

      {/*
        The condition, which is one property against one number and nothing
        else. A checkbox rather than a "no condition" entry in a picker: the
        common case is a rule with none, and the field only exists once
        somebody has said they want one.
      */}
      <label className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-neutral-600">
        <input
          type="checkbox"
          checked={trigger.when !== undefined}
          onChange={(event) =>
            onChange({ when: event.target.checked ? { prop: 'hp', is: '<=', value: 0 } : null })
          }
          className="accent-violet-500"
        />
        {t.when}
      </label>

      {trigger.when ? (
        <div className="mt-1 flex items-center gap-1.5">
          {/*
            Whose number this is about, which the panel could not say until now.

            `of` has been in the format since capture the flag needed it — "the
            thing that just walked in is carrying the flag" is a rule on the
            base, about somebody else — and this row only ever edited the rule's
            own entity. So a condition about `other` was hand-written JSON or it
            did not exist, which is the same gap the `data` block would have
            arrived into.

            Three options rather than two plus a special case: the level is a
            subject in exactly the way the two entities are, and `world` here is
            the read half of `target: world` below.
          */}
          <Choose
            value={trigger.when.of ?? 'self'}
            options={[
              ['self', 'self'],
              ['other', 'other'],
              ['world', fields.length > 0 ? 'world' : t.addAFieldFirst],
            ]}
            onChange={(next) => {
              if (next === 'world') {
                // The same fill-in the target picker does, for the same reason:
                // a condition about `hp` on the level is a field nobody
                // declared, and one click should not produce a document that
                // will not save.
                if (fields.length === 0) return
                const prop = fields.includes(trigger.when!.prop) ? trigger.when!.prop : fields[0]!
                onChange({ when: { ...trigger.when!, of: 'world', prop } })
                return
              }
              onChange({
                when: {
                  ...trigger.when!,
                  // `self` is the absence of the field, not a value for it — a
                  // condition that never asked about anybody else round-trips
                  // as the three fields it always was.
                  ...(next === 'other' ? { of: 'other' as const } : { of: undefined }),
                },
              })
            }}
          />
          {trigger.when.of === 'world' ? (
            <Choose
              value={trigger.when.prop}
              options={fields.map((name) => [name, name] as const)}
              onChange={(prop) => onChange({ when: { ...trigger.when!, prop } })}
            />
          ) : (
          <input
            value={trigger.when.prop}
            placeholder="hp"
            onChange={(event) =>
              onChange({ when: { ...trigger.when!, prop: event.target.value } })
            }
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          )}
          <Choose
            value={trigger.when.is}
            options={COMPARISONS.map((is) => [is, is] as const)}
            onChange={(is) => onChange({ when: { ...trigger.when!, is: is as Comparison } })}
            narrow
          />
          <CompareTo
            value={trigger.when.value}
            fields={fields}
            onChange={(value) => onChange({ when: { ...trigger.when!, value } })}
          />
        </div>
      ) : null}

      <p className="mb-1 mt-2 font-mono text-[10px] text-neutral-600">{t.do}</p>
      <ul className="flex flex-col gap-1">
        {trigger.do.map((verb, index) => (
          <li key={index}>
            <VerbRow
              document={document}
              verb={verb}
              onChange={(next) => onVerbChange(next, index)}
              // The last one has no remove, because removing it is refused: a
              // rule with nothing to do is one the parser sends back, and a
              // button that does nothing is worse than one that is not there.
              onRemove={trigger.do.length > 1 ? () => onVerbRemove(index) : undefined}
            />
          </li>
        ))}
      </ul>

      {/*
        Said under the rows rather than in a tooltip, because the question it
        answers — "a destination, meaning what?" — is asked while looking at the
        field and a `title` only appears if you already suspected there was
        something to read.
      */}
      {trigger.do.some((verb) => verb.op === 'teleport') ? (
        <Hint className="mt-1">
          {t.destinationLead}{' '}
          <span className="text-neutral-400">{t.destinationName}</span>{' '}
          {t.destinationMid}{' '}
          <span className="text-neutral-400">{t.destinationFinish}</span>{' '}
          {t.destinationTail}
        </Hint>
      ) : null}

      <button
        type="button"
        onClick={onVerbAdd}
        className="mt-1 text-[10px] text-neutral-600 underline-offset-4 hover:text-violet-300 hover:underline"
      >
        {t.addVerb}
      </button>
    </div>
  )
}

/**
 * The two fields only a press has: which binding, and how near.
 *
 * Its own component because a `pressed` rule is the one event whose row is not
 * just an event and a condition, and folding two more branches into `Rule` is
 * how that function stops being readable.
 *
 * The reach is measured from the player to *this* entity as a sphere, and the
 * copy says so in cells rather than in metres, because cells are the unit
 * everything else in this editor is placed in.
 */
function Pressed({
  document,
  trigger,
  onChange,
}: {
  document: XpDocument
  trigger: Trigger
  onChange: (patch: TriggerPatch) => void
}) {
  const t = xpEditorDict(useLocale()).behaviour
  const bound = (document.player?.keys ?? [])
    .map((row) => row.does)
    .filter((does) => does.length > 0)

  if (bound.length === 0) {
    return (
      <p className="mt-1.5 font-mono text-[10px] leading-tight text-amber-300/70">
        {t.nothingBound}
      </p>
    )
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 font-mono text-[10px] text-neutral-600">{t.key}</span>
        <Choose
          value={trigger.key ?? ''}
          /*
            An unbound name is kept in the list rather than silently swapped for
            the first real one: the document may have been hand-written, and a
            picker that quietly rebinds a rule the moment somebody opens the
            panel is worse than one that shows what the file actually says.
          */
          options={[
            ...(trigger.key && !bound.includes(trigger.key)
              ? [[trigger.key, `${trigger.key} (not bound)`] as const]
              : []),
            ...bound.map((does) => [does, does] as const),
          ]}
          onChange={(does) => onChange({ key: does })}
        />
      </div>

      <label className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-600">
        <input
          type="checkbox"
          checked={trigger.within !== undefined}
          onChange={(event) => onChange({ within: event.target.checked ? 2 : null })}
          className="accent-violet-500"
        />
        {t.within}
        {trigger.within !== undefined ? (
          <>
            <Amount
              value={trigger.within}
              step={0.5}
              onChange={(value) => onChange({ within: value })}
            />
            {t.cells}
          </>
        ) : (
          <span className="text-neutral-700">{t.anyDistance}</span>
        )}
      </label>
    </div>
  )
}

/**
 * Everything in the level a `teleport` can be aimed at.
 *
 * Offered rather than enforced - the field is free text with these as
 * suggestions. An author may name the exit before placing it, and a picker that
 * only listed what exists would make the panel dictate the order of the work.
 * See `verbIsSane` in `packages/xp/src/edit.ts`.
 *
 * **One function, two callers**, which is why it is not inline in either: the
 * verb row and the destination picker both ask this question, and a list that
 * grew in one of them would be a level where the same address is a suggestion
 * in one place and a typo in the other.
 *
 * ---------------------------------------------------------------------------
 * The marks were missing, and they had been addressable for a while
 * ---------------------------------------------------------------------------
 * `markByName` answers a destination in two steps: a mark carrying that *name*,
 * and failing that a *kind* that appears exactly once - so `to: "finish"` is an
 * address in a course with one finish and an ambiguity in one with two. This
 * list offered neither, and the line under the row said marks "cannot be
 * pointed at yet", which stopped being true when `Mark.name` shipped. A panel
 * that is a version behind the engine is worse than one that says nothing: it
 * is somebody deciding not to try.
 *
 * The unique kinds are offered only while they are still unique, because
 * suggesting `finish` in a level with two of them is suggesting a destination
 * that resolves to nothing.
 *
 * A `teleport` resolves entities first and marks second; an entity and a mark
 * sharing one name is refused by the parser, so this can concatenate without
 * having to say which is which.
 */
/**
 * Every motion any blueprint in this level owns, by name.
 *
 * **Any**, not the one the rule is attached to, and that matches what the parser
 * will accept. A rule fires with a `self` and an `other` and `target` may name
 * either, so which blueprint ends up playing this is not knowable here - a
 * pressure plate opening the door beside it is the ordinary case, and offering
 * only the plate's own motions would offer nothing.
 *
 * Deduplicated, because two blueprints are allowed to call their motions the
 * same thing and a list showing `open` twice is a list you cannot choose from.
 */
/**
 * The clips this level carries itself, in the order they were saved.
 *
 * Unlike `motionNames` this does not sort: the animator writes a library in the
 * order somebody arranged it, and a walk followed by a run followed by an idle
 * is an order that means something to whoever made it.
 */
function levelClips(document: XpDocument): string[] {
  return Object.keys(document.clips ?? {})
}

/**
 * The cuts this level holds, by id.
 *
 * Unsorted, like `levelClips` and unlike `motionNames`: a document's cuts are
 * written in the order somebody made them, and an opening followed by an
 * ending is an order that means something to whoever made it.
 */
function cutNames(document: XpDocument): string[] {
  return Object.keys(document.sequences ?? {})
}

/**
 * What to call a cut in the picker: its name if it has one, else its id.
 *
 * The id is what the verb stores and the name is what somebody typed, so a
 * picker showing only ids would make an author match `cut-2` against a list
 * where they had named everything - and one showing only names would be blank
 * for every cut nobody bothered to name.
 */
function labelOfCut(document: XpDocument, id: string): string {
  const name = document.sequences?.[id]?.name
  return name && name.length > 0 ? name : id
}

function motionNames(document: XpDocument): string[] {
  const names = new Set<string>()
  for (const blueprint of Object.values(document.blueprints)) {
    for (const motion of Object.keys(blueprint.motions ?? {})) names.add(motion)
  }
  return [...names].sort()
}

function destinations(document: XpDocument): string[] {
  const marks = document.world.marks
  return [
    ...document.entities.flatMap((entity) => (entity.name ? [entity.name] : [])),
    ...marks.flatMap((mark) => (mark.name ? [mark.name] : [])),
    ...[...new Set(marks.map((mark) => mark.kind))].filter(
      (kind) => marks.filter((mark) => mark.kind === kind).length === 1,
    ),
  ]
}

/**
 * Every room of this level a door could open onto.
 *
 * `main` first and always, because the root *is* a scene and is the one that is
 * never in the `scenes` table - the parser refuses to let it be, so a list built
 * from the table alone would be missing the front room, which is where a door
 * most often goes back to.
 *
 * Doors *out* of the document are filtered away, because they are the other
 * half of the same table and the other half of this picker: a string in
 * `scenes` is somebody else's level, and offering one here would produce
 * `load scene:` naming a thing that is not a place - a door the runtime
 * answers with "does not go anywhere yet".
 *
 * One function, two callers, for the reason `destinations` gives: the picker
 * and the default a new verb arrives as both ask this, and a list that grew in
 * one of them would be a room that is offered in one place and unknown in the
 * other.
 */
function rooms(document: XpDocument): string[] {
  return [
    MAIN_SCENE,
    ...Object.entries(document.scenes ?? {}).flatMap(([name, target]) =>
      typeof target === 'string' ? [] : [name],
    ),
  ]
}

/**
 * Every side this level names, for a `sit`.
 *
 * Read off the spawn marks, which is where a side is *declared*: `red` and
 * `blue` are kinds of mark, and any other name is a spawn's `team`. A seat at
 * a side no mark knows is a seat the parser refuses, so the list is what may
 * be typed - offered as suggestions rather than a closed select, because the
 * marks are often placed after the rule, and a form that refuses a side you
 * are about to add would be dictating the order.
 */
function teams(document: XpDocument): string[] {
  const found = new Set<string>()
  for (const mark of document.world.marks) {
    if (mark.kind === 'red' || mark.kind === 'blue') found.add(mark.kind)
    if (mark.team) found.add(mark.team)
  }
  return [...found]
}

/** Whether a verb acts on itself or on whoever set it off. */
const TARGETED = new Set([
  'damage',
  'heal',
  'setProp',
  'addProp',
  'despawn',
  'deactivate',
  'activate',
  'carry',
  'drop',
  'unhand',
  'disarm',
  'arm',
  'stun',
  'dash',
  'swing',
  'teleport',
  'checkpoint',
  'advance',
  'material',
])

/**
 * Every op, in the order the manual lists them.
 *
 * This list is the whole vocabulary as far as an author is concerned: a verb
 * the engine understands and this does not is a feature that exists only for
 * whoever is willing to hand-edit the JSON. Five of them were in exactly that
 * state - `deactivate`, `activate`, `carry`, `drop` and `teleport` all shipped
 * with tests and none of them could be reached from the panel.
 */
const OPS = [
  'damage',
  'heal',
  'setProp',
  'addProp',
  'despawn',
  'deactivate',
  'activate',
  'carry',
  'drop',
  // Next to `drop`, because the two are the pair somebody is choosing between:
  // put *this* down, or let go of everything you are holding.
  'unhand',
  // And after them the two that are about the gun rather than about what you
  // picked up, in the order somebody meets them: it goes away, then it is back.
  'disarm',
  'arm',
  'stun',
  // Beside `stun` because they are the pair: one takes the controller away for
  // a moment and the other borrows it, and an author reaching for either is
  // asking the same question about how a body stops being in their own hands.
  'dash',
  // And beside those, because it is the third thing the host does that this
  // world cannot: a swing lands on people, and people are not entities here.
  'swing',
  'teleport',
  'checkpoint',
  'load',
  'spawn',
  'score',
  'emit',
  // Last, beside `emit`, because the two are the same kind of thing: neither
  // touches the world, both are a level saying something to whoever is playing.
  'sound',
  // And beside those two for the same reason: an animation changes nothing
  // about the game, only what somebody watching it sees.
  'animate',
  /**
   * And the largest thing of that kind: a cut, played over the top.
   *
   * Beside `animate` rather than beside `load`, which is where it first went
   * and where it did not belong. A `load` changes the room and takes everybody
   * with it; a cut is a *film* drawn over a level that carries on existing,
   * which puts it with the two verbs that change what somebody sees and
   * nothing else.
   */
  'movie',
  /**
   * The other kind of moving, and it was reachable from nowhere.
   *
   * Reported as *"you can't from the rules run a motion - you can run animation
   * but not motion"*, which was exactly right and is precisely the failure this
   * list's own note is about: `play` and `rest` shipped with a format, a parser,
   * an engine and tests, and could be reached only by hand-editing the JSON.
   *
   * Next to `animate` because that is the choice being made - a clip on a
   * skeleton, or the model's own nodes turning - and nearly everything in a
   * level is the second kind of thing.
   */
  'play',
  'rest',
  /**
   * The table: the seven verbs a turn-based game is written in, and every one
   * of them was in exactly the state the note above describes - shipped with a
   * parser, an engine and tests, reachable only by hand-editing the JSON. The
   * board game in `public/xp/xps/` was the proof: it could not have been made
   * in this panel, and the whole vocabulary of "whose go is it" was invisible
   * to anybody who opened the panel to find out.
   *
   * In the order a turn meets them. A die is rolled, a piece advances by what
   * it showed, the turn is passed; somebody sits down at a side to begin with;
   * a meeting is called when there is something to vote on; a raid is the one
   * verb that reaches into somebody else's save. `material` is last because it
   * is the odd one out - a look rather than a move - and sits beside `rest` for
   * the reason `animate` does: it changes what somebody sees and nothing else.
   */
  'roll',
  'advance',
  'pass',
  'sit',
  'meet',
  'raid',
  'material',
] as const

/**
 * What a condition is compared against: a number, or one the level is keeping.
 *
 * ---------------------------------------------------------------------------
 * A control, because a field with no control is a field nobody can reach
 * ---------------------------------------------------------------------------
 * `value: '@world.wanted'` parses, the engine reads it, and without this it
 * would be settable only by hand-editing JSON - which is the exact state the
 * flow panel was just in, and the reason this panel exists at all.
 *
 * The two forms are one field with a switch rather than two fields, because
 * they are one slot: a comparison has *one* right-hand side, and drawing two
 * inputs would ask which of them wins.
 *
 * The switch is disabled when the level declares no data. A dropdown over an
 * empty list is a control that produces a condition the parser refuses, which is
 * the same trade the `of: 'world'` option above already makes.
 */
function CompareTo({
  value,
  fields,
  onChange,
}: {
  value: number | DataRef
  fields: readonly string[]
  onChange: (value: number | DataRef) => void
}) {
  const t = xpEditorDict(useLocale()).behaviour
  if (isDataRef(value)) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <select
          value={refField(value)}
          onChange={(event) => onChange(`@world.${event.target.value}`)}
          className="min-w-0 flex-1 rounded border border-violet-900/70 bg-neutral-900/60 px-1 py-1 font-mono text-[11px] text-violet-200"
        >
          {fields.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange(0)}
          title={t.compareToNumber}
          className="shrink-0 text-[10px] text-neutral-600 hover:text-neutral-300"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Amount value={value} onChange={onChange} />
      <button
        type="button"
        disabled={fields.length === 0}
        onClick={() => onChange(`@world.${fields[0]}`)}
        title={
          fields.length === 0
            ? t.noDataToCompare
            : t.compareToSomethingKept
        }
        className="shrink-0 text-[11px] text-neutral-600 hover:text-violet-300 disabled:opacity-30"
      >
        @
      </button>
    </div>
  )
}

/**
 * One verb, with the fields that op actually has.
 *
 * The tag decides the form, which is the readable half of a tagged union: there
 * is no `{ op: 'despawn', amount: 10 }` to render, so there is no row with a
 * field on it that means nothing. Changing the op builds a *new* verb rather
 * than patching the old one, carrying the target across where both have one -
 * because "damage self" and "despawn self" are the same intention.
 */
export function VerbRow({
  document,
  verb,
  onChange,
  onRemove,
}: {
  document: XpDocument
  verb: Verb
  onChange: (verb: Verb) => void
  onRemove?: () => void
}) {
  const t = xpEditorDict(useLocale()).behaviour
  const target: VerbTarget = 'target' in verb ? verb.target : 'self'
  const blueprints = Object.keys(document.blueprints)
  const named = destinations(document)
  /**
   * What this level has declared it keeps — the Data panel's block.
   *
   * Read here rather than passed in, like `blueprints` and the destinations
   * beside it: a verb row already takes the whole document because half of what
   * it offers is a list of things the document names, and this is one more.
   */
  const fields = Object.keys(dataOf(document))

  const become = (op: (typeof OPS)[number]) => {
    switch (op) {
      case 'damage':
      case 'heal':
        return { op, amount: 'amount' in verb ? verb.amount : 10, target }
      case 'setProp':
      case 'addProp':
        return {
          op,
          key: 'key' in verb ? verb.key : 'hp',
          value: 'value' in verb ? verb.value : 1,
          target,
        }
      case 'despawn':
      case 'activate':
      case 'drop':
      case 'unhand':
      case 'disarm':
      case 'arm':
        return { op, target }
      case 'stun':
        // A second, which is what being hit costs you in the capture template
        // and about the shortest pause a person reads as one. Required, unlike
        // a `deactivate`'s, so there is no empty state to default from.
        return { op, target, seconds: 'seconds' in verb && verb.seconds ? verb.seconds : 1 }
      case 'dash':
        // Four cells, which is a hop over a gap rather than a flight across the
        // level - far enough to feel like a move and short enough that a level
        // built around walking still is.
        return { op, target, cells: 'cells' in verb && verb.cells ? verb.cells : 4 }
      case 'swing':
        // No reach, because absent is a meaning here rather than a gap: an arm
        // of the usual length. An author who wants a pike types one.
        return { op, target }
      case 'checkpoint':
        // `other` for the same reason teleport takes it: a save point is for
        // whoever walked onto it, and a pad that saves *itself* is nothing.
        return { op, target: 'target' in verb ? verb.target : 'other' }
      case 'deactivate':
        // No `seconds` by default, because absent is a meaning rather than a
        // gap: off until something turns it back on. An author who wants a
        // timer types one, and the box below says what leaving it empty does.
        return { op, target }
      case 'carry':
        // No socket either - the engine never looks one up by meaning, so the
        // useful default is "wherever the carrier's origin is" rather than a
        // guess at a name this particular body might not have.
        return { op, target }
      case 'teleport':
        return {
          op,
          /**
           * `other` unless the verb it replaced already said otherwise.
           *
           * The general fallback is `self`, and for a teleport that is a pad
           * that teleports *itself* - which does nothing anybody wants and is a
           * confusing thing to meet as the first state. What a teleport is for
           * is whoever walked onto it, and on an `enter` trigger that is
           * `other`. An op swapped from one that had a target still carries it
           * across, because "damage other" and "teleport other" are the same
           * intention, which is the rule the rest of this switch follows.
           */
          target: 'target' in verb ? verb.target : 'other',
          // The first *named* entity, since a destination is addressed by name
          // and an unnamed one cannot be one. Empty when nothing is named yet,
          // which `verbIsSane` refuses - the field shows as needing filling in
          // rather than saving a pad that silently goes nowhere.
          to: named[0] ?? '',
        }
      case 'spawn':
        // The first blueprint rather than an empty name: `setVerb` refuses a
        // spawn naming nothing, so an empty default would be a picker whose
        // first state cannot be saved.
        return { op, blueprint: blueprints[0] ?? '', dx: 0, dy: 0, dz: 0 }
      case 'load':
        /**
         * A room here, and `main` if this level has only the one.
         *
         * The opposite default from the one this had, and the reason it changed
         * is that a room *can* be guessed and another level's id cannot. The old
         * comment is still right about the id: there is none this could pick
         * that would be more likely right than wrong, so it stayed empty and
         * `verbIsSane` showed the row as unfinished. A room is different -
         * the panel holds the list, so the first entry is a real door on the
         * frame it appears, and the front room is where a level with one place
         * has to go anyway.
         *
         * The commoner door, too. A level's own rooms are what `load` is mostly
         * for now; leaving somebody else's document is the rarer trip.
         */
        return { op, scene: rooms(document)[0] ?? MAIN_SCENE }
      case 'score':
        return { op, amount: 'amount' in verb ? verb.amount : 1 }
      case 'emit':
        return { op, event: 'event' in verb ? verb.event : 'something' }
      // The first of the pack's names rather than blank. Unlike `load`'s empty
      // id there *is* a right-ish default here: the list is closed and every
      // member of it makes a noise, so a rule dropped in is one you can hear
      // before you have chosen anything.
      case 'sound':
        return { op, sound: 'sound' in verb && isSound(verb.sound) ? verb.sound : SOUND_NAMES[0]! }
      // The first clip in the pack rather than blank: `verbIsSane` refuses an
      // empty name, so an empty default would be a picker whose first state
      // cannot be saved - the same argument `sound` makes one line up.
      case 'animate':
        return { op, target, clip: 'clip' in verb ? verb.clip : CLIPS[0]! }
      /**
       * The first cut this level has, or nothing.
       *
       * The same argument `play` makes, landing on the same answer: the parser
       * refuses a cut this file does not declare, so an invented default would
       * be a picker whose first state cannot be saved. A level with no cuts
       * gets an empty string, which is refused and *shown* as refused - the
       * honest answer to "play what" when there is nothing to play is not a
       * name.
       */
      case 'movie':
        return {
          op,
          sequence: 'sequence' in verb ? verb.sequence : (cutNames(document)[0] ?? ''),
        }
      /**
       * The first motion any blueprint in this level has.
       *
       * `verbIsSane` refuses a name nothing owns, so an empty default would be a
       * picker whose first state cannot be saved - the same argument `sound` and
       * `animate` both make. A level with no motions yet gets an empty string,
       * which is refused and shown as refused, because the honest answer to
       * "play what" when nothing exists is not to invent a name.
       */
      case 'play':
        return { op, target, motion: 'motion' in verb ? verb.motion : (motionNames(document)[0] ?? '') }
      case 'rest':
        return { op, target }
      /**
       * Into the first field the level keeps, six sides. A die with no field
       * to land in is refused by `verbIsSane`, so a level declaring no data
       * gets an empty key and the row shows as unfinished - which is the honest
       * answer, and the Data panel is one click away.
       */
      case 'roll':
        return { op, key: fields[0] ?? '', sides: 6 }
      /**
       * By the first field, along `track` - the same name the shipped board
       * game uses for its marks and for the property on the piece. The first
       * field is almost always the die, because a level that rolls is a level
       * that declared one.
       */
      case 'advance':
        return { op, target, by: fields[0] ?? '', along: 'track' }
      case 'pass':
      case 'raid':
        return { op }
      case 'sit':
        return { op, team: teams(document)[0] ?? 'red' }
      // No length, which is the arbiter's own default - the same shape as
      // `deactivate` with no seconds.
      case 'meet':
        return { op }
      case 'material':
        return { op, target, material: 'material' in verb ? verb.material : MATERIALS[1]! }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Choose
        value={verb.op}
        options={OPS.map((op) => [op, op] as const)}
        onChange={(op) => onChange(become(op as (typeof OPS)[number]) as Verb)}
      />

      {verb.op === 'damage' || verb.op === 'heal' || verb.op === 'score' ? (
        <Amount value={verb.amount} onChange={(amount) => onChange({ ...verb, amount })} />
      ) : null}

      {/*
        The other end of a range, and the checkbox that decides there is one.

        A second number that is always shown would say every damage is a range,
        which is wrong for nearly all of them - so the field appears only once
        somebody asks for it, and asking is one click. Unticking removes `upTo`
        rather than setting it equal to `amount`: the parser treats a range of
        one as the plain number anyway, and a document that carries a field
        meaning nothing is a document whose diff says something changed when
        nothing did.

        `score` is deliberately not offered one. A range is about a *hit* - a
        swing that lands differently each time - and a scoreboard that awards
        somewhere between one and three points for the same thing is a game
        nobody can read.
      */}
      {verb.op === 'damage' || verb.op === 'heal' ? (
        <>
          <label className="flex items-center gap-1 font-mono text-[10px] text-neutral-600">
            <input
              type="checkbox"
              checked={verb.upTo !== undefined}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? // Rounded, because a range is whole numbers at both ends
                      // and `parseXp` refuses one that is not - a tick that
                      // produced an unsaveable document would be a control that
                      // breaks the thing it is editing.
                      { ...verb, amount: Math.round(verb.amount), upTo: Math.round(verb.amount) + 10 }
                    : { ...verb, upTo: undefined },
                )
              }
              className="size-3 accent-neutral-400"
            />
            {t.upTo}
          </label>
          {verb.upTo === undefined ? null : (
            <Amount
              value={verb.upTo}
              onChange={(upTo) => onChange({ ...verb, upTo: Math.round(upTo) })}
            />
          )}
        </>
      ) : null}

      {verb.op === 'play' ? (
        motionNames(document).length === 0 ? (
          <span className="font-mono text-[10px] text-neutral-600">
            {t.noMotions}
          </span>
        ) : (
          <Choose
            value={verb.motion}
            options={motionNames(document).map((motion) => [motion, motion] as const)}
            onChange={(motion) => onChange({ ...verb, motion })}
          />
        )
      ) : null}

      {verb.op === 'movie' ? (
        cutNames(document).length === 0 ? (
          <span className="font-mono text-[10px] text-neutral-600">{t.noCuts}</span>
        ) : (
          <Choose
            value={verb.sequence}
            options={cutNames(document).map((id) => [id, labelOfCut(document, id)] as const)}
            onChange={(sequence) => onChange({ ...verb, sequence })}
          />
        )
      ) : null}

      {verb.op === 'animate' ? (
        <>
          <Choose
            value={verb.clip}
            /**
             * The level's own clips first, then the pack's.
             *
             * A clip somebody authored in the animator for this level is the one
             * they came looking for, and the pack's 139 are a haystack to put it
             * in. Both rigs' are offered, unlike the Pose picker's: a rule fires
             * with a `self` and an `other` and may animate either, so which body
             * ends up playing this is not knowable here.
             */
            options={levelClips(document).concat(CLIPS).map((clip) => [clip, clip] as const)}
            onChange={(clip) => onChange({ ...verb, clip })}
          />
          <label className="flex items-center gap-1 font-mono text-[10px] text-neutral-600">
            <input
              type="checkbox"
              checked={verb.loop === true}
              onChange={(event) => onChange({ ...verb, loop: event.target.checked })}
              className="size-3 accent-neutral-400"
            />
            loop
          </label>
          {/*
            The parts, as a row of toggles rather than a text field.

            A name that is not a part of the rig is dropped silently by the host
            - the same contract every other name here has - so the one thing a
            panel can do that a text field cannot is make the wrong name
            impossible to type. Nothing ticked is the whole body, which is what
            the label says: `parts` absent means the clip *replaces* what the
            body was doing, and any part ticked makes it a layer over the top.
          */}
          <div className="flex flex-wrap items-center gap-1">
            {BODY_PART_NAMES.map((part) => {
              const on = verb.parts?.includes(part) === true
              return (
                <button
                  key={part}
                  type="button"
                  onClick={() => {
                    const parts = (verb.parts ?? []).filter((one) => one !== part)
                    if (!on) parts.push(part)
                    onChange(parts.length > 0 ? { ...verb, parts } : { ...verb, parts: undefined })
                  }}
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                    on
                      ? 'bg-violet-500/25 text-violet-100'
                      : 'bg-neutral-900 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {part}
                </button>
              )
            })}
            {verb.parts === undefined ? (
              <span className="font-mono text-[10px] text-neutral-600">{t.wholeBody}</span>
            ) : null}
          </div>
        </>
      ) : null}

      {verb.op === 'setProp' || verb.op === 'addProp' ? (
        <>
          {/*
            A declared field is picked, and an entity's own property is typed.

            The difference is that one of them has a list and the other cannot:
            `world` names the `data` block, which is a closed set the author
            wrote in the Data panel, and a rule naming a field that block does
            not declare is a document `parseXp` refuses. Free text there would
            let somebody type `coin`, save, and be told about it afterwards -
            where the panel could simply not have offered the wrong name.

            An entity's props have no such list: they are whatever a blueprint
            declares plus whatever a rule has written, so the input stays.
          */}
          {target === 'world' ? (
            <Choose
              value={verb.key}
              options={fields.map((name) => [name, name] as const)}
              onChange={(key) => onChange({ ...verb, key })}
            />
          ) : (
            <input
              value={verb.key}
              placeholder="key"
              onChange={(event) => onChange({ ...verb, key: event.target.value })}
              className="w-16 min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
            />
          )}
          <Amount value={verb.value} onChange={(value) => onChange({ ...verb, value })} />
        </>
      ) : null}

      {verb.op === 'emit' ? (
        <input
          value={verb.event}
          placeholder={t.event}
          onChange={(event) => onChange({ ...verb, event: event.target.value })}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
      ) : null}

      {verb.op === 'sound' ? (
        <Choose
          value={verb.sound}
          options={SOUND_NAMES.map((name) => [name, name] as const)}
          onChange={(sound) => onChange({ ...verb, sound })}
        />
      ) : null}

      {verb.op === 'spawn' ? (
        <>
          <Choose
            value={verb.blueprint}
            options={blueprints.map((name) => [name, name] as const)}
            onChange={(blueprint) => onChange({ ...verb, blueprint })}
          />
          {(['dx', 'dy', 'dz'] as const).map((axis) => (
            <Amount
              key={axis}
              value={verb[axis]}
              step={0.5}
              onChange={(value) => onChange({ ...verb, [axis]: value })}
            />
          ))}
        </>
      ) : null}

      {verb.op === 'roll' ? (
        <>
          <Choose
            value={verb.key}
            options={
              fields.length === 0
                ? [['', t.addAFieldFirst] as const]
                : fields.map((name) => [name, name] as const)
            }
            onChange={(key) => onChange({ ...verb, key })}
          />
          <span className="font-mono text-[10px] text-neutral-600">{t.sides}</span>
          <Amount
            value={verb.sides}
            onChange={(sides) =>
              // Two to a hundred is the parser's range; a one-sided die is a
              // number, not a roll, and a thousand-sided one is a random number
              // generator wearing a costume.
              onChange({ ...verb, sides: Math.max(2, Math.min(100, Math.round(sides) || 6)) })
            }
          />
        </>
      ) : null}

      {verb.op === 'advance' ? (
        <>
          <span className="font-mono text-[10px] text-neutral-600">{t.by}</span>
          <Choose
            value={verb.by}
            options={
              fields.length === 0
                ? [['', t.addAFieldFirst] as const]
                : fields.map((name) => [name, name] as const)
            }
            onChange={(by) => onChange({ ...verb, by })}
          />
          <span className="font-mono text-[10px] text-neutral-600">{t.along}</span>
          <input
            value={verb.along}
            placeholder="track"
            title={t.alongTitle}
            onChange={(event) => onChange({ ...verb, along: event.target.value })}
            onKeyDown={(event) => event.stopPropagation()}
            className="w-20 min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <input
            value={verb.bump ?? ''}
            placeholder={t.bump}
            title={t.bumpTitle}
            onChange={(event) => {
              const bump = event.target.value.trim()
              onChange(bump.length === 0 ? { ...verb, bump: undefined } : { ...verb, bump })
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className="w-20 min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
        </>
      ) : null}

      {verb.op === 'sit' ? (
        <>
          <input
            value={verb.team}
            list="behaviour-teams"
            placeholder={t.aSide}
            title={t.aSideTitle}
            onChange={(event) => onChange({ ...verb, team: event.target.value })}
            onKeyDown={(event) => event.stopPropagation()}
            className="w-24 min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <datalist id="behaviour-teams">
            {teams(document).map((team) => (
              <option key={team} value={team} />
            ))}
          </datalist>
        </>
      ) : null}

      {verb.op === 'meet' ? (
        <input
          value={verb.seconds ?? ''}
          inputMode="decimal"
          placeholder={t.tablesOwn}
          title={t.tablesOwnTitle}
          onChange={(event) => {
            const seconds = Number(event.target.value)
            onChange(
              event.target.value.trim() === '' || !Number.isFinite(seconds) || seconds <= 0
                ? { op: 'meet' }
                : { op: 'meet', seconds },
            )
          }}
          onKeyDown={(event) => event.stopPropagation()}
          className="w-20 min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
      ) : null}

      {verb.op === 'pass' || verb.op === 'raid' ? (
        <span className="font-mono text-[10px] text-neutral-600">
          {verb.op === 'pass' ? t.passNote : t.raidNote}
        </span>
      ) : null}

      {verb.op === 'material' ? (
        <Choose
          value={verb.material}
          options={MATERIALS.map((name) => [name, name] as const)}
          onChange={(material) =>
            onChange({ ...verb, material: material as (typeof MATERIALS)[number] })
          }
        />
      ) : null}

      {verb.op === 'deactivate' ? (
        <input
          value={verb.seconds ?? ''}
          inputMode="decimal"
          placeholder={t.untilTold}
          title={t.untilToldTitle}
          onChange={(event) => {
            const seconds = Number(event.target.value)
            // Empty and unparseable both clear it rather than becoming zero: a
            // thing that returns in no time never went away, and the field's
            // own placeholder promises that empty means something else.
            onChange(
              event.target.value.trim() === '' || !Number.isFinite(seconds) || seconds <= 0
                ? { op: 'deactivate', target }
                : { op: 'deactivate', target, seconds },
            )
          }}
          className="w-20 min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
      ) : null}

      {verb.op === 'stun' ? (
        <Amount
          value={verb.seconds}
          step={0.5}
          onChange={(seconds) =>
            // Clamped rather than refused: the field is a number box, and a
            // stun of zero is a row `verbIsSane` would silently drop on save.
            onChange({ ...verb, seconds: seconds > 0 ? seconds : 0.5 })
          }
        />
      ) : null}

      {verb.op === 'dash' ? (
        <Amount
          value={verb.cells}
          step={1}
          onChange={(cells) =>
            // Zero clamped away rather than refused, as `stun` does it - but to
            // *four* and not to the nearest side, because a number box stepping
            // through zero would otherwise flip the direction of the dash on
            // its way past.
            onChange({ ...verb, cells: cells === 0 ? 4 : cells })
          }
        />
      ) : null}

      {verb.op === 'swing' ? (
        <Amount
          value={verb.reach ?? DEFAULT_REACH}
          step={0.5}
          onChange={(reach) =>
            // Clamped like a stun's seconds rather than refused, and to the
            // usual arm rather than to a sliver: a swing of no reach is a row
            // `verbIsSane` would drop on save, and a swing of two centimetres
            // is one that looks saved and never lands.
            onChange({ ...verb, reach: reach > 0 ? Math.min(reach, MAX_REACH) : DEFAULT_REACH })
          }
        />
      ) : null}

      {verb.op === 'carry' ? (
        <input
          value={verb.socket ?? ''}
          placeholder={t.socket}
          title={t.socketTitle}
          onChange={(event) => {
            const socket = event.target.value.trim()
            onChange(socket === '' ? { op: 'carry', target } : { op: 'carry', target, socket })
          }}
          className="w-20 min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
      ) : null}

      {verb.op === 'load' ? (
        <Door document={document} verb={verb} onChange={onChange} />
      ) : null}

      {verb.op === 'teleport' ? (
        <Destination document={document} to={verb.to} onChange={(to) => onChange({ ...verb, to })} />
      ) : null}

      {TARGETED.has(verb.op) ? (
        <Choose
          value={target}
          options={[
            ['self', 'self'],
            ['other', 'other'],
            /*
              The level itself, and only for the two verbs that can do anything
              to it. `parseXp` refuses `damage target: 'world'` - there is
              nothing to damage - so offering it everywhere would be the picker
              proposing documents that will not save.

              With no fields declared it is shown and labelled rather than
              hidden, exactly as `pressed` is with no bindings: the vocabulary
              has the target whatever this document declares, and a picker that
              quietly dropped it would leave somebody looking for a feature the
              manual says exists.
            */
            ...(verb.op === 'setProp' || verb.op === 'addProp'
              ? ([[
                  'world',
                  fields.length > 0 ? 'world' : t.addAFieldFirst,
                ]] as const)
              : []),
          ]}
          onChange={(next) => {
            /**
             * Switching to `world` brings a key that exists with it.
             *
             * The same move `setTrigger` makes when somebody picks `pressed`
             * and it fills in the first binding. Without it, a rule that said
             * `setProp hp` on itself would become `setProp hp` on the level -
             * a field nobody declared, and a document that will not save,
             * produced by one click on a picker.
             */
            if (next === 'world') {
              if (fields.length === 0) return
              const key = 'key' in verb && fields.includes(verb.key) ? verb.key : fields[0]!
              onChange({ ...verb, target: 'world', key } as Verb)
              return
            }
            onChange({ ...verb, target: next as VerbTarget } as Verb)
          }}
        />
      ) : null}

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          title={t.removeVerb}
          className="ml-auto shrink-0 px-1 text-[10px] text-neutral-600 underline-offset-4 hover:text-red-400 hover:underline"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

/**
 * Where a teleport sends somebody, and what a destination even is.
 *
 * Reported as *"teleport has no option to point to a destination — is it a
 * spawn point, a checkpoint, or a model?"*, in front of a field that was a bare
 * text input eighty pixels wide showing the letter `B`. It **did** carry the
 * names as a `datalist`, which is the browser affordance nobody can see: no
 * arrow, no list until you type, and nothing at all saying what kind of thing
 * belongs in it.
 *
 * The answer, now said in the panel rather than in a `title` attribute: a
 * destination is **a named entity**. Usually an empty node — a blueprint with
 * `draw: false`, which is what the format grew them for — but anything you have
 * named works, and that includes a checkpoint pad, since a pad is an entity.
 *
 * What is *not* a destination is a **mark**: `spawn`, `start`, `finish` and the
 * team rings are not entities and have no names, so nothing can point at one.
 * That is a real gap rather than a rule, it is in the backlog, and until it
 * closes the answer for "send them back to the start" is an empty node placed
 * at the spawn.
 *
 * ---------------------------------------------------------------------------
 * A list, and a way out of it
 * ---------------------------------------------------------------------------
 * The old comment argued for free text over a select: an author may point a pad
 * at an exit they have not placed yet, and a picker listing only what exists
 * would make the panel dictate the order of the work. That is right and is kept
 * — as the last option rather than as the whole control. The list is what
 * somebody wants nine times out of ten; the escape hatch is one click away and
 * says what it is.
 */
function Destination({
  document,
  to,
  onChange,
}: {
  document: XpDocument
  to: string
  onChange: (to: string) => void
}) {
  const t = xpEditorDict(useLocale()).behaviour
  const named = destinations(document)
  const known = named.includes(to)
  // Typed rather than picked: an empty destination is the state a new verb
  // arrives in when nothing is named yet, and it should show the field rather
  // than a list of nothing.
  const [typing, setTyping] = useState(!known)

  if (typing || named.length === 0) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <input
          value={to}
          autoFocus={named.length > 0}
          placeholder={t.nameItWillHave}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
        {named.length > 0 ? (
          <button
            type="button"
            onClick={() => setTyping(false)}
            title={t.pickExisting}
            className="shrink-0 px-1 font-mono text-[10px] text-neutral-600 hover:text-violet-300"
          >
            {t.list}
          </button>
        ) : null}
      </span>
    )
  }

  return (
    <Choose
      value={to}
      options={[...named.map((name) => [name, name] as const), ['', t.aNameNotPlaced]]}
      onChange={(next) => {
        if (next === '') setTyping(true)
        else onChange(next)
      }}
    />
  )
}

/**
 * A door, and which of the two kinds of destination it has.
 *
 * `load` is one verb with two destinations - a room in this document, or
 * another document altogether - and the picker exists because the file cannot
 * tell them apart on its own: a scene name and an XP id are the same alphabet,
 * so `cellar` is a room here or somebody else's level and only the author
 * knows. S0's note on the `scenes` table said this in advance: one table, two
 * kinds of value, *and the editor is where that difference has to show*.
 *
 * The name is carried across when the kind changes, because "the cellar, and I
 * meant the room" is a correction rather than a new door - the same reason
 * changing a verb's op keeps its target.
 *
 * Rooms are offered as a list and an id is typed, which is not an inconsistency:
 * every room this document has is a fact the panel holds, and every level it
 * could link to is not. `main` is in the list and is named for what it is,
 * because the front room is the one place a door most often goes back to and it
 * is the one name that is never in the `scenes` table.
 */
function Door({
  document,
  verb,
  onChange,
}: {
  document: XpDocument
  verb: Extract<Verb, { op: 'load' }>
  onChange: (verb: Verb) => void
}) {
  const t = xpEditorDict(useLocale()).behaviour
  const here = 'scene' in verb
  const named = rooms(document)

  return (
    <>
      <Choose
        value={here ? 'scene' : 'xp'}
        options={[
          ['scene', t.aRoomHere],
          ['xp', t.anotherXp],
        ]}
        onChange={(next) => {
          const name = here ? verb.scene : verb.xp
          onChange(next === 'scene' ? { op: 'load', scene: name } : { op: 'load', xp: name })
        }}
      />
      {here && named.includes(verb.scene) ? (
        <Choose
          value={verb.scene}
          options={named.map(
            (name) => [name, name === MAIN_SCENE ? t.theFrontRoom : name] as const,
          )}
          onChange={(scene) => onChange({ ...verb, scene })}
        />
      ) : (
        <input
          value={here ? verb.scene : verb.xp}
          placeholder={here ? t.aRoomInThisLevel : t.anotherXp}
          title={
            here
              ? t.whichRoomTitle
              : t.whichXpTitle
          }
          onChange={(event) =>
            onChange(
              here
                ? { ...verb, scene: event.target.value }
                : { op: 'load', xp: event.target.value },
            )
          }
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
      )}
    </>
  )
}

/** A closed list. Native, for the same reason the inspector's is. */
function Choose({
  value,
  options,
  onChange,
  narrow,
}: {
  value: string
  options: readonly (readonly [string, string])[]
  onChange: (value: string) => void
  narrow?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none ${
        narrow ? 'w-12' : ''
      }`}
    >
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  )
}

/**
 * A number a verb takes.
 *
 * Narrow on purpose: every number in this vocabulary is an amount, a value or an
 * offset, and none of them is more than three digits. A field wide enough for
 * more would push the target picker onto its own line.
 */
function Amount({
  value,
  step = 1,
  onChange,
}: {
  value: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <NumberInput
      step={step}
      value={value}
      commit={onChange}
      className="w-14 min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] tabular-nums text-neutral-200 focus:border-neutral-600 focus:outline-none"
    />
  )
}
