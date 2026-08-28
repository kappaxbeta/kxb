'use client'

import { useState } from 'react'
import { blueprintUsers, isBlueprintName, partsOf, placesOf } from '@kxb/xp/edit'
import { skeletonOf, thumbnailUrl } from '@kxb/xp/packs'
import { DEFAULT_SKELETON, findModel, packModels } from '@kxb/xp/catalogue'
import { BODY_DEFAULTS, BODY_FIELDS, BODY_LIMITS, DEFAULT_LIGHT, MAX_LIGHTS, MAX_LIGHT_INTENSITY, MAX_LIGHT_RANGE, tagsInUse, type Blueprint, type BodySpec, type Part, type XpDocument } from '@kxb/xp'
import { NumberInput } from '@/app/xp/_editor/number-field'
import {
  MAX_MOTION_STEPS,
  MAX_MOTIONS,
  MOTION_KINDS,
  MOTION_NAME,
  motionLength,
  type Motion,
  type MotionKind,
  type MotionStep,
} from '@kxb/xp/motions'
import { Picker } from '@/app/xp/_editor/panels/picker'
import { clipsFor } from '@/app/xp/_runtime/body/motion'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * The kinds of thing a level contains.
 *
 * The Models panel next lists what we *ship* - eighty-six pieces of art
 * that are the same in every document. This lists what this document has
 * *decided*: a crate is a Box_A that breaks, a turret is a Box_A that shoots, and
 * the difference between them is not in the art. Which is why a blueprint cannot
 * be a tile in the model picker, however much the two panels look alike.
 *
 * ---------------------------------------------------------------------------
 * A row is also a thing you can drag
 * ---------------------------------------------------------------------------
 * The same gesture the model picker has, meaning the other thing: dragging a
 * model lays down a *placement* - bulk scenery, rasterised into cells and then
 * forgotten - and dragging a blueprint makes an *entity*, which has a name, has
 * properties, and can have something happen to it.
 *
 * That the two gestures look identical and produce different kinds of thing is
 * the one genuinely confusing part of this editor, and it is confusing because
 * the underlying split is real (see the note at the top of `blueprints.ts`).
 * The mitigation was that the drop is *named*: an entity arrives as `crate_1`
 * rather than as another anonymous wall, so what happened is legible in the
 * Scene tree a second later.
 *
 * **That mitigation was measured against somebody and found insufficient**, and
 * the report was not "the drop surprised me" - it was *"I don't see how to build
 * a composition from more models together"*, which is this same split seen from
 * the other end. Composition exists: `parts`, below, with parents and sockets.
 * Nothing said so at the place the question gets asked.
 *
 * So both panels now carry one line saying what a drag out of them makes, and
 * the Models panel carries the signpost - because "how do I combine two models"
 * is a question somebody has while looking at models, not while looking at a
 * list of blueprints they have not made yet. Naming and affordance, in the two
 * panels; the split underneath is unchanged and correct.
 */

/** What a dragged row carries. Ours, so nothing else offers to take it. */
export const BLUEPRINT_DRAG = 'application/x-xp-blueprint'

export interface BlueprintsPanelProps {
  document: XpDocument
  /** Which blueprint is open, held above so it survives the panel being dragged. */
  open: string | null
  onOpen: (name: string | null) => void
  onAdd: (name: string) => void
  /** A ready-made kind of thing, rule and all. See `STARTERS`. */
  onAddStarter: (id: StarterId) => void
  /**
   * `body: null` **removes** the physics block, which is the one key here that
   * is not simply "set this". Absent means "leave it alone" for every field in
   * a patch, and a body has a state in between - `{}` is a document that says
   * *this falls* - so "no body" cannot be spelled as an empty object. Passed
   * straight through to `setBlueprint`, which uses the same convention.
   */
  onChange: (
    name: string,
    patch: Partial<Omit<Blueprint, 'script' | 'triggers' | 'body'>> & {
      body?: BodySpec | null
    },
  ) => void
  /**
   * Which script this kind of thing runs, or `null` to take it off.
   *
   * Not part of `onChange`, and the type above says why: `script` is the one
   * field of a blueprint the edit layer does not let a patch touch, because
   * `setBlueprintScript` is what checks the name is a script the document
   * actually has. Same call the Scripts panel makes from the other end.
   */
  onScriptAttach: (blueprint: string, script: string | null) => void
  onRename: (from: string, to: string) => void
  onDelete: (name: string) => void
  onPartAdd: (blueprint: string) => void
  onPartChange: (blueprint: string, index: number, patch: Partial<Part>) => void
  onPartRemove: (blueprint: string, index: number) => void
}

export function BlueprintsPanel({
  document,
  open,
  onOpen,
  onAdd,
  onAddStarter,
  onChange,
  onScriptAttach,
  onRename,
  onDelete,
  onPartAdd,
  onPartChange,
  onPartRemove,
}: BlueprintsPanelProps) {
  const t = xpEditorDict(useLocale()).blueprints
  const legend = xpEditorDict(useLocale()).legend
  const names = Object.keys(document.blueprints)
  // Guarded rather than trusted: the open name is held above this panel, so a
  // blueprint deleted or renamed underneath it would otherwise be a crash on
  // the next render.
  const current = open !== null && open in document.blueprints ? open : null
  const blueprint = current ? document.blueprints[current] : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      {/* The counterpart of the Models panel's line, in the same words: what a
          drag out of *this* panel makes. */}
      <Hint className="px-1 leading-tight">
        {legend.blueprintLead}{' '}
        <span className="text-neutral-400">{legend.aThing}</span> {legend.blueprintTail}
      </Hint>
      <Names
        names={names}
        current={current}
        document={document}
        onOpen={onOpen}
        onAdd={onAdd}
        onAddStarter={onAddStarter}
      />

      {current === null || !blueprint ? (
        <Hint className="px-1">{t.blurb}</Hint>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <Model name={current} blueprint={blueprint} onChange={onChange} />
          <Parts
            name={current}
            blueprint={blueprint}
            onAdd={onPartAdd}
            onChange={onPartChange}
            onRemove={onPartRemove}
          />
          <Visible name={current} blueprint={blueprint} onChange={onChange} />
          <Skeleton name={current} blueprint={blueprint} onChange={onChange} />
          <Pose name={current} blueprint={blueprint} document={document} onChange={onChange} />
          <Spin name={current} blueprint={blueprint} onChange={onChange} />
          <Motions name={current} blueprint={blueprint} onChange={onChange} />
          <Lamp name={current} blueprint={blueprint} onChange={onChange} />
          <Collider name={current} blueprint={blueprint} onChange={onChange} />
          <Physics name={current} blueprint={blueprint} onChange={onChange} />
          <Tags name={current} blueprint={blueprint} document={document} onChange={onChange} />
          <Props name={current} blueprint={blueprint} onChange={onChange} />
          <Script
            name={current}
            blueprint={blueprint}
            document={document}
            onAttach={onScriptAttach}
          />
          <Actions
            name={current}
            taken={names}
            users={blueprintUsers(document, current)}
            onRename={(to) => {
              onRename(current, to)
              onOpen(to)
            }}
            onDelete={() => {
              onDelete(current)
              onOpen(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Ready-made kinds of thing, rule and all.
 *
 * A save point was unreachable from this editor and had been the whole time.
 * Every piece of one existed - the `checkpoint` verb, the number that arrives
 * already counted, the field to change it, the runtime that sends you back
 * there - and the only way to make one was to add a blueprint, open the rules
 * panel, add a rule, change its event, change its verb, and know that the verb
 * is called `checkpoint`. Six steps and one piece of vocabulary, to reach a
 * thing every platform game has.
 *
 * So the panel offers it made. A starter is not a template and not a preset: it
 * is one press that writes exactly what somebody would have written, into the
 * same document, through the same edit layer - so it undoes in one step and
 * there is nothing here the panel could not have produced by hand.
 *
 * **What belongs in this list** is a thing that is *vocabulary*, not
 * arrangement: a save point is a rule you have to know the name of, where a
 * crate is a model you can see in the picker. The moment one of these needs a
 * second rule or a choice made in advance, it has stopped being a starter and
 * become a template, which is `/xp/new`'s job.
 */
export type StarterId = 'checkpoint' | 'player' | 'enemy' | 'peep'

/**
 * The four ready-made blueprints.
 *
 * Ids and documents. The button's own words are `xpEditorDict.blueprints
 * .starters[id]` - the same split the mode picker makes, and for the same
 * reason: this table is what gets *written into a document*, and `name` is part
 * of that. A German editor still writes `checkpoint`, because a rule naming it
 * has to keep working when the file is opened anywhere else.
 */
export const STARTERS: {
  id: StarterId
  /** The name it takes, unless the level already has one - see `onAddStarter`. */
  name: string
  blueprint: Partial<Blueprint>
  /**
   * Whether the document should also *arrive* as this, via `player.blueprint`.
   *
   * The one starter that is not only a blueprint. Reported as not being able to
   * put a script on the player: a script goes on a blueprint, the player had no
   * blueprint unless somebody went to the Properties panel and picked one, and
   * "the player" was therefore the one thing in a level that could not be given
   * behaviour. Making the body *is* the missing step, so the button does it.
   */
  body?: true
}[] = [
  {
    id: 'checkpoint',
    name: 'checkpoint',
    blueprint: {
      // A flag on a pole, which is what a save point has looked like since
      // somebody first put one in a platform game.
      model: 'platformer-blue/flag_A_blue',
      /**
       * Walk into it, and it is the *walker* who is sent back here - `other`,
       * not `self`. A `checkpoint self` would be the pad remembering itself,
       * which is the mistake this being pre-written exists to prevent.
       */
      triggers: [{ on: 'enter', do: [{ op: 'checkpoint', target: 'other' }] }],
      /**
       * Walked *through*, not into. A save point you bump against is a save
       * point you have to aim at, and `triggerBox` gives an entity with no
       * collider a half-metre reach anyway - so the rule still fires, and the
       * flag does not become a bollard in the middle of a course.
       *
       * What is deliberately *not* set here is `props.order`: `addEntity`
       * numbers each pad as it is placed, and a number on the blueprint would
       * make every one of them the first.
       */
      collider: 'none',
    },
  },
  {
    id: 'player',
    name: 'player',
    body: true,
    blueprint: {
      /**
       * The rigged dummy, because a body that cannot be animated is a body no
       * script can make do anything - `runAnimation` is most of what somebody
       * attaches a script to a player *for*.
       */
      model: DEFAULT_SKELETON,
      /**
       * No box, and this is the one field here that is load-bearing rather than
       * a sensible default. The player is stopped by the character controller,
       * which is a capsule the collision grid knows nothing about; a body with a
       * collider collides with itself, which reads as being unable to move at
       * all. `BUILT_IN_BODY` has said `none` since it existed, for the same
       * reason, and a body somebody made by hand should not be worse than the
       * one they get for free.
       */
      collider: 'none',
      tags: ['player'],
      /**
       * Health, because the alternative is worse than none.
       *
       * A missing property reads as zero everywhere in this engine, so a body
       * with no `hp` is not "unkillable" - it is a body every rule about health
       * reads as already dead. 100 is what the levels we ship use.
       */
      props: { hp: 100 },
    },
  },
  {
    id: 'peep',
    name: 'peep',
    body: true,
    blueprint: {
      /**
       * A fox, and the second skeleton an XP can be.
       *
       * Its own starter rather than a switch on the player's, because what it
       * changes is not one field. A peep's clips live inside its own file and
       * are called `idle` and `walk`; the dummy's come from a shared pack and
       * are called `Idle_A` and `Walking_A`. Its parts are `body`, `tail`,
       * `wing-left`; the dummy's are `spine`, `chest`, `upperarml`. So a player
       * blueprint whose model somebody swapped to a fox by hand would be a body
       * whose every animation name is now wrong, silently - and a button is a
       * better place to hand somebody a coherent set than a picker is.
       *
       * `peepz/fox` and not a picker over the twenty-four: the parts and clips
       * are identical across the pack, so this is the animal you get and the
       * model field is where you change your mind about which one.
       */
      model: 'peepz/fox',
      /**
       * No box, for the player starter's reason word for word: the player is
       * stopped by the character controller's capsule, and a body with a
       * collider collides with itself.
       */
      collider: 'none',
      tags: ['player'],
      props: { hp: 100 },
    },
  },
  {
    id: 'enemy',
    name: 'enemy',
    blueprint: {
      model: DEFAULT_SKELETON,
      // A box, unlike the player's: this one is a thing in the world, so it has
      // to be something a shot lands on and something you cannot walk through.
      collider: 'auto',
      tags: ['enemy'],
      props: { hp: 30 },
      /**
       * Dying, written on the event that actually fires.
       *
       * `damaged` and not a `died` - there is no such trigger, because what
       * running out of health *means* is the document's business (a crate breaks,
       * a target scores, an ammo box has no health at all). So the check is a
       * condition on the same event, and the order inside `do` is the point: the
       * point is credited to whoever fired **before** the body is despawned,
       * because a despawned entity is not there to have shot anybody.
       */
      triggers: [
        {
          on: 'damaged',
          when: { prop: 'hp', is: '<=', value: 0 },
          do: [
            { op: 'score', amount: 1 },
            { op: 'sound', sound: 'hit' },
            { op: 'despawn', target: 'self' },
          ],
        },
      ],
    },
  },
]

function Names({
  names,
  current,
  document,
  onOpen,
  onAdd,
  onAddStarter,
}: {
  names: string[]
  current: string | null
  document: XpDocument
  onOpen: (name: string | null) => void
  onAdd: (name: string) => void
  onAddStarter: (id: StarterId) => void
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const ok = isBlueprintName(draft) && !names.includes(draft)

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <PanelLabel>{t.heading} {names.length}</PanelLabel>
        <button
          type="button"
          onClick={() => {
            setAdding((was) => !was)
            setDraft('')
          }}
          className="text-[10px] text-neutral-500 underline-offset-4 hover:text-violet-300 hover:underline"
        >
          {adding ? t.cancel : t.new}
        </button>
      </div>

      {/*
        Under New rather than beside it: New is the general case and this is a
        shortcut, and a row of shortcuts above the thing they are shortcuts for
        would read as the main way to make a blueprint.
      */}
      <ul className="mb-1.5 flex flex-wrap gap-1.5 px-1">
        {STARTERS.map((starter) => (
          <li key={starter.id}>
            <button
              type="button"
              onClick={() => onAddStarter(starter.id)}
              title={t.starters[starter.id].blurb}
              className="rounded border border-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 transition-colors hover:border-violet-500/60 hover:text-violet-200"
            >
              {t.starters[starter.id].label}
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!ok) return
            onAdd(draft)
            // Opened straight away: a blueprint arrives as a floor tile with
            // nothing on it, so the next thing anybody does is say what it is.
            onOpen(draft)
            setAdding(false)
            setDraft('')
          }}
          className="mb-1.5 flex gap-1.5 px-1"
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.newName}
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!ok}
            className="rounded border border-neutral-800 px-2 py-1 text-[11px] text-neutral-300 disabled:text-neutral-700 enabled:hover:border-violet-500 enabled:hover:text-violet-200"
          >
            {t.add}
          </button>
        </form>
      ) : null}

      {/* Said while it is being typed rather than on save: the name goes into a
          `spawn` verb and comes back out of an error message, which is why the
          alphabet is narrower than JSON's. */}
      {adding && draft.length > 0 && !ok ? (
        <p className="mb-1.5 px-1 font-mono text-[10px] text-amber-400/80">
          {names.includes(draft) ? t.alreadyABlueprint : t.nameRules}
        </p>
      ) : null}

      {names.length === 0 ? (
        <p className="px-1 font-mono text-[10px] text-neutral-600">
          {t.noneYet}
        </p>
      ) : (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
          {names.map((name) => {
            const blueprint = document.blueprints[name]
            /**
             * Every room's, not the root's.
             *
             * A document holds more than one place, so counting `entities`
             * alone made a blueprint used only in the cellar read as `none` -
             * which is the label that invites deleting it, and deleting it
             * empties the cellar. `blueprintUsers` beside this has swept every
             * place since the seam existed; this line had not caught up, and
             * the two-rooms template is where they visibly disagreed: its own
             * way back reported itself unused.
             */
            const instances = placesOf(document).reduce(
              (n, place) => n + place.entities.filter((e) => e.blueprint === name).length,
              0,
            )
            return (
              <li key={name}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(BLUEPRINT_DRAG, name)
                    event.dataTransfer.effectAllowed = 'copy'
                    // Picking one up opens it, for the reason the picker
                    // selects a model on drag: a drag that ends outside the
                    // viewport does nothing, and the payload may arrive sealed,
                    // so what is open is the fallback for what was carried.
                    onOpen(name)
                  }}
                  onClick={() => onOpen(current === name ? null : name)}
                  title={`${name} — ${blueprint.model} · drag into the level`}
                  className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
                    current === name
                      ? 'bg-violet-500/15 text-violet-200'
                      : 'text-neutral-400 hover:bg-neutral-900'
                  }`}
                >
                  <span className="h-6 w-6 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a
                        checked-in thumbnail, already the size it is drawn at. */}
                    <img
                      src={thumbnailUrl(blueprint.model)}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <span className="truncate font-mono">{name}</span>
                  {/* How many of them are in the level. Not a count of anything
                      abstract: a blueprint with none is a kind of thing nobody
                      has put down yet, which is the most likely reason a rule
                      written against it never fires. */}
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-600">
                    {instances === 0 ? 'none' : instances}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * Which model it is drawn as, through the same picker the brush uses.
 *
 * Reused rather than rebuilt: it is already a search over eighty-six checked-in
 * thumbnails, and a second, worse chooser for the same eighty-six models would
 * be two lists to keep in step.
 */
function Model({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  return (
    <section>
      <PanelLabel className="mb-1.5 px-1">{t.model}</PanelLabel>
      <Picker value={blueprint.model} onChange={(model) => onChange(name, { model })} />
    </section>
  )
}

/**
 * What it blocks.
 *
 * `none` gets a sentence because it is the option people do not think to want
 * and the one that fixes the most annoying bug in a level: an ammo box you have
 * to walk *around* to collect is an ammo box nobody collects.
 */
/**
 * Whether the thing is drawn at play — the switch that makes an empty node.
 *
 * Above the collider on purpose, because turning it off changes what the
 * collider *means*: `auto` is "as big as what you draw", so on something
 * invisible it resolves to nothing at all. Somebody who wants an invisible wall
 * has to say a box, and reading the two controls in this order is how they find
 * that out rather than by walking through their own trigger volume.
 *
 * The model stays chosen and stays visible in the editor. It is the icon you
 * grab the node by, which is why this is a switch here rather than an empty
 * value in the model picker.
 */
function Visible({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const drawn = blueprint.draw !== false

  return (
    <section>
      <div className="flex items-center justify-between gap-2 px-1">
        <PanelLabel>{t.seenAtPlay}</PanelLabel>
        <button
          type="button"
          role="switch"
          aria-checked={drawn}
          onClick={() => onChange(name, { draw: !drawn })}
          className={`rounded border px-2 py-1 text-[11px] transition-colors ${
            drawn
              ? 'border-violet-500 bg-violet-500/15 text-violet-200'
              : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
          }`}
        >
          {drawn ? t.drawn : t.aPlaceOnly}
        </button>
      </div>
      {!drawn ? (
        <Hint className="mt-1 px-1 leading-tight">
          {t.neverDrawnLead}
          still moveable, still something a rule can find. `auto` collision is
          nothing here; say a box if it should block.
        </Hint>
      ) : null}
    </section>
  )
}

/**
 * Which skeleton this body is, and which of that skeleton's models.
 *
 * ---------------------------------------------------------------------------
 * Why the model picker was not already this
 * ---------------------------------------------------------------------------
 * Reported as *"you didn't add an option to choose between peepz and
 * xp-avatar"*, and the picker above genuinely does not answer it. It offers
 * four thousand models across thirty-eight packs, and finding the one rigged
 * fox in it means knowing the pack is called `peepz` and that a fox is a body
 * rather than a prop. Two named buttons is the whole of the fix.
 *
 * ---------------------------------------------------------------------------
 * A switch here has to clear two fields, and that is the load-bearing part
 * ---------------------------------------------------------------------------
 * The two rigs share not one clip name and not one part name. So a body whose
 * model is swapped by hand keeps a `pose` naming a clip the new skeleton does
 * not have - which plays nothing, silently - and an `animator` pointing at a
 * graph written for the old one, which the parser now refuses outright. That
 * second one would leave the editor holding a document it cannot save, which is
 * the one thing this editor promises not to do.
 *
 * So the switch clears both, by handing the empty string `setBlueprint` already
 * treats as "no such field". It is the reason this is a control rather than
 * advice to use the model picker.
 */
function Skeleton({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const rig = skeletonOf(blueprint.model)
  if (rig === null) return null

  /** Every peep, so the one on screen can be swapped without the picker. */
  const animals = packModels('peepz')

  const wear = (model: string) => {
    if (model === blueprint.model) return
    // Cleared only when the rig actually changes. Swapping a fox for a bear
    // keeps the pose, because a fox and a bear have the same eight clips.
    const changing = skeletonOf(model) !== rig
    onChange(name, { model, ...(changing ? { pose: '', animator: '' } : {}) })
  }

  return (
    <section>
      <PanelLabel className="mb-1.5 px-1">{t.skeleton}</PanelLabel>

      <div className="flex gap-1 px-1">
        <button
          type="button"
          onClick={() => wear(DEFAULT_SKELETON)}
          className={`flex-1 rounded border px-2 py-1 font-mono text-[11px] transition ${
            rig === 'dummy'
              ? 'border-violet-500 bg-violet-500/15 text-neutral-200'
              : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
          }`}
        >
          avatar
        </button>
        <button
          type="button"
          // The fox, for the `+ peep` starter's reason: four legs and a tail is
          // the most parts any one animal has short of the parrot, and it is
          // what everything else in this repo reaches for when it needs a peep.
          onClick={() => wear('peepz/fox')}
          className={`flex-1 rounded border px-2 py-1 font-mono text-[11px] transition ${
            rig === 'peepz'
              ? 'border-violet-500 bg-violet-500/15 text-neutral-200'
              : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
          }`}
        >
          peep
        </button>
      </div>

      {/*
        Which animal, for the rig that has more than one.

        Not a second skeleton switch and it does not clear anything: the parts
        and the clips are identical across all twenty-four, so this changes what
        you are looking at and nothing about what the body can do.
      */}
      {rig === 'peepz' ? (
        <select
          value={blueprint.model}
          onChange={(event) => wear(event.target.value)}
          className="mt-1.5 w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
        >
          {animals.map((animal) => (
            <option key={animal.id} value={animal.id}>
              {animal.label}
            </option>
          ))}
        </select>
      ) : null}

      <Hint className="mt-1 px-1 leading-tight">
        {rig === 'peepz'
          ? 'Eight clips, inside its own file: static, idle, walk, run, eat, dance and two gestures.'
          : 'The clip pack, and a hand that can hold something. Switching clears the pose and the animator — the other rig knows none of those names.'}
      </Hint>
    </section>
  )
}

/**
 * The animation this thing holds when it is standing still.
 *
 * Only a *rigged* body has anything to play a clip on, so this is offered on
 * one and hidden on a crate — a picker on a barrel is a control that cannot do
 * anything, and the way somebody finds that out is by trying it and concluding
 * the editor is broken. `dummy/` is the skeleton pack; a second one would join
 * it here rather than anywhere else.
 *
 * **The list is what the runtime loads**, not what the pack contains. The pack
 * ships 139 clips across eight files and `skinned.tsx` downloads three of them,
 * because each file is a download in front of a player. A name from a file
 * nobody fetches plays nothing and leaves the body in its last pose — which is
 * a failure with no error and no log, so the only honest fix is to not offer
 * it. `clips.generated.ts` is that list, and a test reads the glTFs to keep it
 * true.
 *
 * The format takes any well-formed name, deliberately: a host that loaded all
 * eight files would make those documents correct, and the parser has no way to
 * know which host it is running in. Which is exactly why the narrowing belongs
 * here.
 */
function Pose({
  name,
  blueprint,
  document,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  document: XpDocument
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  /**
   * Anything with bones, which is now everything that can hold a pose.
   *
   * This was `startsWith('dummy/')`, then briefly narrowed to *the blueprint the
   * player arrives as* - because at that point an entity had no way to animate
   * and a picker on one was a control that did nothing. `LiveEntities` draws a
   * rigged entity with a skeleton now, so the honest gate is back to being about
   * the model, and it asks `isRigged` rather than testing the string: one pack
   * holds skeletons today and a second is planned, and a string test is right
   * until the day it silently is not.
   */
  const rig = skeletonOf(blueprint.model)
  if (rig === null) return null

  /**
   * This rig's clips, not the dummy's.
   *
   * The two vocabularies do not overlap by a single name - `Idle_A` against
   * `idle` - so offering `CLIPS` on a fox is a picker whose every option is a
   * body that keeps its last pose. Which is the exact failure the note above
   * says this control exists to prevent, arriving from the other direction the
   * day there was a second skeleton.
   */
  /**
   * The pack's clips, and the ones this level authored itself.
   *
   * The level's first, because a clip somebody made for *this* body is the one
   * they came here looking for - and the pack's 139 are a haystack to put it in.
   * Only the ones for this rig: a dummy clip on a fox binds nothing.
   */
  const own = Object.entries(document.clips ?? {})
    .filter(([, one]) => one.rig === rig)
    .map(([name]) => name)
  const clips = [...own, ...clipsFor(rig)]

  return (
    <section>
      <PanelLabel className="mb-1.5 px-1">{t.pose}</PanelLabel>
      <select
        value={blueprint.pose ?? ''}
        onChange={(event) => onChange(name, { pose: event.target.value })}
        className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
      >
        <option value="">{t.howeverItStands}</option>
        {clips.map((clip) => (
          <option key={clip} value={clip}>
            {clip}
          </option>
        ))}
      </select>
      <Hint className="mt-1 px-1 leading-tight">{t.poseBlurb}</Hint>
    </section>
  )
}

/**
 * Which node of this thing's own model a live prop turns, and about which axis.
 *
 * Gated on the model actually having more than one drawable node - the
 * `nodes` list `scripts/xp-catalogue.ts` measured at build time, the same
 * source `Collider`'s `mask` reads. A model with one node has nothing to pick
 * between: its whole-entity rotation already does the job, and a picker with
 * one option in it is a control that cannot do anything, same reason `Pose`
 * stays hidden off a skeleton-less model.
 *
 * There is no speed field here on purpose - see `spin`'s own note in
 * `./blueprints`. This panel only says *which* node and *what drives it*; the
 * rate is a fact about the script or rule doing the driving.
 */
function Spin({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const nodes = findModel(blueprint.model)?.nodes
  if (!nodes || nodes.length < 2) return null

  const spin = blueprint.spin

  return (
    <section>
      <label className="mb-1.5 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
        <input
          type="checkbox"
          checked={spin !== undefined}
          onChange={(event) =>
            onChange(name, {
              spin: event.target.checked ? { node: nodes[0], axis: 'y', prop: 'angle' } : undefined,
            })
          }
        />
        {t.spin}
      </label>

      {spin ? (
        <div className="space-y-1.5">
          <select
            value={spin.node}
            onChange={(event) => onChange(name, { spin: { ...spin, node: event.target.value } })}
            className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
          >
            {nodes.map((node) => (
              <option key={node} value={node}>
                {node}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <select
              value={spin.axis}
              onChange={(event) =>
                onChange(name, { spin: { ...spin, axis: event.target.value as 'x' | 'y' | 'z' } })
              }
              className="rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
            >
              <option value="x">x</option>
              <option value="y">y</option>
              <option value="z">z</option>
            </select>
            <input
              type="text"
              value={spin.prop}
              onChange={(event) => onChange(name, { spin: { ...spin, prop: event.target.value } })}
              placeholder="angle"
              className="w-full min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
            />
          </div>
          <Hint className="px-1 leading-tight">
            {t.spinPropBlurbLead}{' '}
            <span className="text-neutral-400">{`self.set('${spin.prop}', v)`}</span> {t.or}{' '}
            <span className="text-neutral-400">{`self.add('${spin.prop}', v)`}</span>
            {t.spinPropBlurbTail}
          </Hint>
        </div>
      ) : null}
    </section>
  )
}

/**
 * The named things this kind of thing can be told to do to its own parts.
 *
 * ---------------------------------------------------------------------------
 * Why this is a whole panel where `Spin` is a checkbox
 * ---------------------------------------------------------------------------
 * `Spin` above is a *wiring* control: it says which node a property turns, and
 * then somebody has to write the thing that turns it. That is one node, one
 * axis, and a script. This is the other half - a name, a sequence, and a `play`
 * verb that starts it - so a door, a lift and a spinning coin are the same three
 * fields with different numbers in them and nothing written in JavaScript.
 *
 * Both stay. A `spin` is right when the angle is *derived* from something the
 * level already tracks - a dial that reads a score, a wheel that turns with
 * speed - and a motion is right when it is a thing that happens, with a
 * beginning and an end.
 *
 * ---------------------------------------------------------------------------
 * Gated on the model having nodes to turn, like `Spin`
 * ---------------------------------------------------------------------------
 * A model with one drawable node has nothing to pick between: turning it is what
 * the entity's own rotation already does. A panel offering a node picker with
 * one entry in it is a control that cannot do anything, which is the same reason
 * `Spin` and `Pose` both stay hidden where they would be useless.
 */
function Motions({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const nodes = findModel(blueprint.model)?.nodes
  if (!nodes || nodes.length < 2) return null

  const motions = blueprint.motions ?? {}
  const names = Object.keys(motions)

  /**
   * What a new step points at: the second node, not the first.
   *
   * `nodes[0]` is the model's own root in every multi-node model we ship -
   * `["Locker", "Locker_Door"]`, `["Gun_Pistol", "Gun_Pistol_Magazine"]` - and
   * turning the root turns the whole thing, which is what the entity's own
   * `rotation` already does. So the default that *shows you what a motion is*
   * is the first node that is a moving part.
   */
  const moving = nodes[1] ?? nodes[0]

  /** One motion replaced, or removed when handed null. */
  const write = (motion: string, next: Motion | null) => {
    const rest = { ...motions }
    if (next === null) delete rest[motion]
    else rest[motion] = next
    onChange(name, { motions: rest })
  }

  const add = () => {
    const clean = draft.trim()
    if (!MOTION_NAME.test(clean) || clean in motions || names.length >= MAX_MOTIONS) return
    /**
     * A working step rather than an empty one.
     *
     * A new motion with no steps does not parse - a motion is its steps - so
     * offering one would be an editor that writes a file it cannot reopen. A
     * one-second turn of the first node is the smallest thing that both parses
     * and does something you can see.
     */
    write(clean, { steps: [{ kind: 'turn', node: moving, axis: 'y', amount: 90, seconds: 1 }] })
    setDraft('')
    setAdding(false)
  }

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <PanelLabel>{t.motions} {names.length}</PanelLabel>
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          disabled={names.length >= MAX_MOTIONS}
          className="font-mono text-[10px] text-violet-300 hover:text-violet-200 disabled:text-neutral-700"
        >
          {adding ? 'cancel' : 'New'}
        </button>
      </div>

      {adding ? (
        <div className="mb-1.5 flex gap-1 px-1">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
              if (event.key === 'Escape') setAdding(false)
            }}
            placeholder={t.open}
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={!MOTION_NAME.test(draft.trim()) || draft.trim() in motions}
            className="shrink-0 rounded border border-neutral-800 px-2 font-mono text-[11px] text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
          >
            {t.addMotion}
          </button>
        </div>
      ) : null}

      {names.length === 0 ? (
        <Hint className="px-1">
          {t.motionsBlurbLead}{' '}
          <span className="text-neutral-400">play</span>.
        </Hint>
      ) : (
        <div className="space-y-2 px-1">
          {names.map((motion) => (
            <MotionRow
              key={motion}
              motion={motion}
              value={motions[motion]!}
              nodes={nodes}
              moving={moving}
              onWrite={(next) => write(motion, next)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** One motion: whether it loops, and the steps in order. */
function MotionRow({
  motion,
  value,
  nodes,
  moving,
  onWrite,
}: {
  motion: string
  value: Motion
  nodes: readonly string[]
  /** What a fresh step points at. See its note in `Motions`. */
  moving: string
  onWrite: (next: Motion | null) => void
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const steps = value.steps

  const patch = (index: number, step: Partial<MotionStep>) => {
    const next = steps.map((one, at) => (at === index ? { ...one, ...step } : one))
    onWrite({ ...value, steps: next })
  }

  /**
   * The whole step, for the two changes that *remove* a field.
   *
   * A merge cannot delete a key - `{...one, ...rest}` keeps `one`'s `node` when
   * `rest` has dropped it - so choosing "wait", or a kind with no `times`,
   * silently left the old field behind and the parser refused the save. Two
   * shapes of edit, two functions, rather than one that is wrong half the time.
   */
  const replace = (index: number, step: MotionStep) => {
    onWrite({ ...value, steps: steps.map((one, at) => (at === index ? step : one)) })
  }

  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 p-1.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-300">
          {motion}
        </span>
        <label className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-neutral-500">
          <input
            type="checkbox"
            checked={value.loop === true}
            onChange={(event) =>
              onWrite(
                event.target.checked
                  ? { ...value, loop: true }
                  : // Absence rather than `false`: the parser drops a `loop:
                    // false` on the way in, so writing one would leave the panel
                    // holding a document a save-and-reopen does not produce.
                    { steps: value.steps },
              )
            }
          />
          loop
        </label>
        <button
          type="button"
          onClick={() => onWrite(null)}
          aria-label={`Remove ${motion}`}
          className="shrink-0 px-1 font-mono text-[11px] text-neutral-600 hover:text-rose-400"
        >
          ×
        </button>
      </div>

      <div className="space-y-1">
        {/*
          Two rows per step, not one.

          Six controls across a 260-pixel panel put the *node* picker - the one
          field that holds a long name and the one you are actually choosing -
          down to nothing: a caret with no text beside it. So the two that need
          width go on the top line and the three numbers go underneath, which is
          also the order somebody says it in: "turn the door, about y, ninety
          degrees, over a second".
        */}
        {steps.map((step, index) => (
          <div key={index} className="space-y-1 rounded border border-neutral-800/60 p-1">
            <div className="flex items-center gap-1">
            <select
              value={step.kind}
              onChange={(event) => {
                const kind = event.target.value as MotionKind
                // `times` means nothing on a spin or a turn and the parser
                // refuses it there, so it comes off with the change rather than
                // being left to break the save.
                const rest = { ...step }
                delete rest.times
                replace(index, {
                  ...rest,
                  kind,
                  ...(kind === 'swing' || kind === 'shake' ? { times: step.times ?? 1 } : {}),
                })
              }}
              className="w-16 shrink-0 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[10px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
            >
              {MOTION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>

            <select
              // An empty value is a pause - a step with no node. The one place
              // in this panel where "nothing" is a choice rather than a gap.
              value={step.node ?? ''}
              onChange={(event) => {
                const node = event.target.value
                const rest = { ...step }
                delete rest.node
                replace(index, node ? { ...rest, node } : rest)
              }}
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[10px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
            >
              <option value="">{t.waitStep}</option>
              {nodes.map((node) => (
                <option key={node} value={node}>
                  {node}
                </option>
              ))}
            </select>

            </div>

            <div className="flex items-center gap-1">
            <select
              value={step.axis}
              onChange={(event) => patch(index, { axis: event.target.value as 'x' | 'y' | 'z' })}
              className="shrink-0 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[10px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
            >
              <option value="x">x</option>
              <option value="y">y</option>
              <option value="z">z</option>
            </select>

            <NumberInput
              value={step.amount}
              commit={(amount) => patch(index, { amount })}
              step={15}
              title={step.kind === 'spin' ? t.degreesASecond : t.degrees}
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[10px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
            />

            <NumberInput
              value={step.seconds}
              // Refused rather than clamped, because the parser refuses it too:
              // a step of no length is a step nobody can see.
              commit={(seconds) => {
                if (seconds > 0) patch(index, { seconds })
              }}
              step={0.1}
              min={0.1}
              title="seconds"
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[10px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
            />

            <button
              type="button"
              onClick={() => onWrite({ ...value, steps: steps.filter((_, at) => at !== index) })}
              // A motion is its steps, so the last one cannot go - removing it
              // would write a document that does not parse. Removing the whole
              // motion is the × above.
              disabled={steps.length <= 1}
              aria-label={t.removeStep}
              className="ml-auto shrink-0 px-0.5 font-mono text-[11px] text-neutral-600 hover:text-rose-400 disabled:opacity-20"
            >
              ×
            </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          onWrite({
            ...value,
            steps: [...steps, { kind: 'turn', node: moving, axis: 'y', amount: 0, seconds: 1 }],
          })
        }
        disabled={steps.length >= MAX_MOTION_STEPS}
        className="mt-1 font-mono text-[10px] text-violet-300 hover:text-violet-200 disabled:text-neutral-700"
      >
        {t.addStep}
      </button>

      <Hint className="mt-1 leading-tight">
        {motionLength(value).toFixed(1)}s{value.loop ? ', looping' : ''} ·{' '}
        <span className="text-neutral-400">turn</span> {t.stepBlurbSpin}{' '}
        <span className="text-neutral-400">spin</span> {t.stepBlurbSwing}{' '}
        <span className="text-neutral-400">swing</span> {t.stepBlurbAnd}{' '}
        <span className="text-neutral-400">shake</span> {t.stepBlurbShake}
      </Hint>
    </div>
  )
}

/**
 * Whether this kind of thing glows, and how.
 *
 * A switch and three numbers, because that is the shape of the block: absent is
 * the overwhelmingly common no, and the useful first move is *on* — the
 * defaults are a working white lamp, so a torch lights the moment it is turned
 * on and is adjusted afterwards.
 *
 * The colour is a native picker over the same number the document stores. A hex
 * field would have been closer to the file and further from the person: nobody
 * chooses a warm orange by typing `0xff8800`, and the one thing an author does
 * with a lamp's colour is look at it.
 */
function Lamp({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const light = blueprint.light

  return (
    <section>
      <label className="mb-1.5 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
        <input
          type="checkbox"
          checked={light !== undefined}
          onChange={(event) =>
            // The format's own default rather than one written here, so the
            // editor's "on" and a hand-written `"light": {}` are the same lamp.
            onChange(name, { light: event.target.checked ? DEFAULT_LIGHT : undefined })
          }
        />
        {t.light}
      </label>

      {light ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={`#${light.colour.toString(16).padStart(6, '0')}`}
              onChange={(event) =>
                onChange(name, { light: { ...light, colour: Number.parseInt(event.target.value.slice(1), 16) } })
              }
              className="h-7 w-10 shrink-0 cursor-pointer rounded border border-neutral-800 bg-neutral-900/60"
            />
            <LampNumber
              label={t.bright}
              value={light.intensity}
              max={MAX_LIGHT_INTENSITY}
              onChange={(intensity) => onChange(name, { light: { ...light, intensity } })}
            />
            <LampNumber
              label={t.reach}
              value={light.range}
              max={MAX_LIGHT_RANGE}
              onChange={(range) => onChange(name, { light: { ...light, range } })}
            />
          </div>
          <Hint className="px-1 leading-tight">
            {t.lightBlurbLead} <span className="text-neutral-400">self.intensity</span>,{' '}
            <span className="text-neutral-400">self.range</span>,{' '}
            <span className="text-neutral-400">self.colour</span>{t.lightBlurbMid}{' '}
            {MAX_LIGHTS} {t.lightBlurbTail}
          </Hint>
        </div>
      ) : null}
    </section>
  )
}

/** One bounded number, with its own label. The two lamps share the shape. */
function LampNumber({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1 font-mono text-[10px] text-neutral-600">
      {label}
      <NumberInput
        min={0}
        max={max}
        step={1}
        value={value}
        // Clamped here rather than refused, because the field is a spinner
        // somebody holds down: reaching the top and stopping is what a bound
        // should feel like, and `setBlueprint` would otherwise drop the edit
        // and leave the number they can see disagreeing with the document.
        commit={(next) => onChange(Math.min(max, Math.max(0, next)))}
        className="w-full min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
      />
    </label>
  )
}

/**
 * Whether this thing moves on its own, and how.
 *
 * Under the collider on purpose, because the two are read together and are
 * constantly mistaken for each other: `collider` is *does this stop other
 * things*, and this is *does this get stopped*. A level wants all four
 * combinations, and the pair reads as a pair when they are next to each other.
 *
 * The switch writes `{}` rather than a filled-in block, because `{}` is a
 * meaningful document - it means "this falls", with every default - and writing
 * six numbers nobody typed would make a blueprint that only asked to fall
 * round-trip as one that specified everything. The fields below show the
 * default as a placeholder and only write what somebody actually sets, which is
 * what keeps a saved file readable.
 */
function Physics({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const body = blueprint.body

  return (
    <section>
      <label className="mb-1.5 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
        <input
          type="checkbox"
          checked={body !== undefined}
          // `null` removes it - see `setBlueprint`. `undefined` in a patch means
          // "leave it alone", so it could not turn the switch off.
          onChange={(event) => onChange(name, { body: event.target.checked ? {} : null })}
        />
        {t.physics}
      </label>

      {body ? (
        <div className="space-y-1.5">
          <div className="flex gap-1.5 px-1">
            {(['gravity', 'bounce', 'mass'] as const).map((field) => (
              <BodyNumber
                key={field}
                field={field}
                value={body[field]}
                onChange={(next) => onChange(name, { body: { ...body, [field]: next } })}
              />
            ))}
          </div>
          <div className="flex gap-1.5 px-1">
            {(['friction', 'drag', 'roll'] as const).map((field) => (
              <BodyNumber
                key={field}
                field={field}
                value={body[field]}
                onChange={(next) => onChange(name, { body: { ...body, [field]: next } })}
              />
            ))}
          </div>
          <Hint className="px-1 leading-tight">
            {t.physicsOn}{' '}
            <span className="text-neutral-400">hit</span> when it meets the level.
            Friction is how fast a roll dies; mass divides every push. A script
            can read and steer it —{' '}
            <span className="text-neutral-400">self.push(x, y, z)</span>,{' '}
            <span className="text-neutral-400">self.speed</span>,{' '}
            <span className="text-neutral-400">self.dx</span>.
          </Hint>
        </div>
      ) : (
        <Hint className="px-1 leading-tight">{t.physicsOff}</Hint>
      )}
    </section>
  )
}

/**
 * One physics field, bounded by the format's own table.
 *
 * The placeholder is the default rather than the value, which is the whole
 * reason this is not `LampNumber`: a lamp has every field filled in, and a body
 * has *whichever ones somebody meant*. Showing 1 in an empty `mass` box would
 * make an author think they had set it, and clearing it back to nothing would
 * then be impossible to tell from a mass of 1.
 *
 * Clearing the box removes the field, which is how you get the default back.
 */
function BodyNumber({
  field,
  value,
  onChange,
}: {
  field: (typeof BODY_FIELDS)[number]
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  const { min, max } = BODY_LIMITS[field]

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="font-mono text-[10px] text-neutral-600">{field}</span>
      <NumberInput
        min={min}
        max={max}
        step={0.05}
        value={value ?? BODY_DEFAULTS[field]}
        // Clamped rather than refused, like the collider spinners: the field is
        // a spinner somebody holds down, and reaching the top and stopping is
        // what a bound should feel like. `setBlueprint` refuses anything
        // outside the same table, so an unclamped edit would silently vanish.
        commit={(next) => onChange(Math.min(max, Math.max(min, next)))}
        className="w-full min-w-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
      />
    </label>
  )
}

function Collider({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const kind =
    blueprint.collider === 'auto' || blueprint.collider === 'none' ? blueprint.collider : 'box'
  const box = typeof blueprint.collider === 'object' ? blueprint.collider : { w: 1, h: 1, d: 1 }

  return (
    <section>
      <PanelLabel className="mb-1.5 px-1">{t.collidesAs}</PanelLabel>
      <div className="flex gap-1.5 px-1">
        {(['auto', 'none', 'box'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() =>
              onChange(name, { collider: option === 'box' ? { ...box } : option })
            }
            className={`flex-1 rounded border px-2 py-1 text-[11px] transition-colors ${
              kind === option
                ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {kind === 'box' ? (
        <div className="mt-1.5 flex gap-1.5 px-1">
          {(['w', 'h', 'd'] as const).map((side) => (
            <label key={side} className="flex-1">
              <span className="font-mono text-[10px] text-neutral-600">{side}</span>
              <NumberInput
                step={0.1}
                min={0.1}
                value={box[side]}
                // Refused rather than clamped: the edit layer will not take a
                // zero side either, so silently turning one into 0.1 would be
                // the panel disagreeing with the document about what was typed.
                commit={(value) => {
                  if (value <= 0) return
                  onChange(name, { collider: { ...box, [side]: value } })
                }}
                className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
              />
            </label>
          ))}
        </div>
      ) : (
        <Hint className="mt-1 px-1 leading-tight">
          {kind === 'auto' ? t.boxMeasured : t.walkStraightThrough}
        </Hint>
      )}
    </section>
  )
}

/**
 * Labels a rule can match on, picked rather than remembered.
 *
 * ---------------------------------------------------------------------------
 * Why one text field was not enough
 * ---------------------------------------------------------------------------
 * It was one, on the argument that the engine never reads a tag - only the rules
 * in the document do - so this is a place to write words rather than a
 * controlled vocabulary that wants a widget. The first half of that is still
 * true and the conclusion was wrong, for a reason that has nothing to do with
 * control: **two places have to agree on the spelling, and neither of them says
 * what the other typed.**
 *
 * A rule matching `pickups` against a blueprint tagged `pickup` is not an error
 * anywhere. It matches nothing, forever, silently. The way to find out that the
 * shipped presets say `pickup` was to open a template and read it.
 *
 * So the words this level already uses are offered, and so are the six the
 * presets and starters use - see `SUGGESTED_TAGS`, which is emphatic about not
 * being an enum. Typing a new one is still there, because the moment it is not,
 * every new kind of thing an XP wants to describe is a change to this editor.
 *
 * Chips rather than a comma-separated string, because that is what a set of
 * short words is: `breakable, pickup,` was a field where a stray comma made an
 * empty tag and a backspace could take half of one.
 */
function Tags({
  name,
  blueprint,
  document,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  document: XpDocument
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const [draft, setDraft] = useState('')

  /** What there is to pick, minus what this blueprint already has. */
  const offered = tagsInUse(document.blueprints).filter((tag) => !blueprint.tags.includes(tag))

  const add = (tag: string) => {
    const clean = tag.trim()
    // The parser refuses a zero-length tag, and a duplicate would be a second
    // chip that does nothing - `withTag` is an `includes`.
    if (clean.length === 0 || blueprint.tags.includes(clean)) return
    onChange(name, { tags: [...blueprint.tags, clean] })
    setDraft('')
  }

  return (
    <section>
      <PanelLabel className="mb-1.5 px-1">{t.tags}</PanelLabel>

      <div className="space-y-1.5 px-1">
        {blueprint.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {blueprint.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900/60 py-0.5 pl-1.5 pr-1 font-mono text-[10px] text-neutral-300"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() =>
                    onChange(name, { tags: blueprint.tags.filter((one) => one !== tag) })
                  }
                  className="text-neutral-600 hover:text-rose-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {offered.length > 0 && (
          <select
            // Never holds a selection: picking is an *action* here, not a state.
            // A select that kept showing the last tag added would read as though
            // this blueprint had one tag, which is exactly what the chips above
            // are for saying.
            value=""
            onChange={(event) => add(event.target.value)}
            className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
          >
            <option value="">{t.addATag}</option>
            {offered.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              // The form around this would otherwise save the level, and the
              // muscle memory for "I have finished typing this word" is Enter.
              event.preventDefault()
              add(draft)
            }}
            placeholder={t.orANew}
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => add(draft)}
            disabled={draft.trim().length === 0}
            className="shrink-0 rounded border border-neutral-800 px-2 font-mono text-[11px] text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
          >
            {t.addTag}
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * Which script this kind of thing runs.
 *
 * ---------------------------------------------------------------------------
 * The same attachment, from the end somebody is standing at
 * ---------------------------------------------------------------------------
 * The Scripts panel has had this since scripts existed - a row of chips under
 * the source saying which blueprints run it - and that is the right control for
 * *"I have written a turret script, what runs it"*. It is the wrong one for the
 * question people actually arrive with, which is *"I am looking at the enemy,
 * how do I give it behaviour"*: answering that meant knowing scripts have their
 * own panel, opening it, and finding the blueprint in a list of chips.
 *
 * Reported as not having the option at all, which was fair. So the attachment is
 * offered from both ends and is one fact underneath - both call
 * `setBlueprintScript`, and a change on either side is on screen in the other.
 *
 * A picker rather than a "new script" button. Writing the script is the Scripts
 * panel's job and doing it in two places is two editors of one string; what this
 * needs to say is only *which*, and it says so plainly when there is nothing to
 * pick from yet.
 */
function Script({
  name,
  blueprint,
  document,
  onAttach,
}: {
  name: string
  blueprint: Blueprint
  document: XpDocument
  onAttach: BlueprintsPanelProps['onScriptAttach']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const scripts = Object.keys(document.scripts ?? {})

  return (
    <section>
      <PanelLabel className="mb-1.5 px-1">{t.script}</PanelLabel>

      {scripts.length === 0 ? (
        <Hint className="px-1">{t.noScriptsYet}</Hint>
      ) : (
        <>
          <select
            value={blueprint.script ?? ''}
            onChange={(event) => onAttach(name, event.target.value || null)}
            className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
          >
            <option value="">{t.noScript}</option>
            {scripts.map((script) => (
              <option key={script} value={script}>
                {script}
              </option>
            ))}
          </select>
          <Hint className="mt-1 px-1">{t.scriptBlurb}</Hint>
        </>
      )}
    </section>
  )
}

/** Starting values for whatever this kind of thing tracks. Numbers only. */
function Props({
  name,
  blueprint,
  onChange,
}: {
  name: string
  blueprint: Blueprint
  onChange: BlueprintsPanelProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const [adding, setAdding] = useState('')
  const entries = Object.entries(blueprint.props)

  return (
    <section>
      <PanelLabel className="mb-1.5 px-1">{t.properties}</PanelLabel>

      <div className="space-y-1 px-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-24 shrink-0 truncate font-mono text-[11px] text-neutral-400">
              {key}
            </span>
            <NumberInput
              value={value}
              commit={(next) => onChange(name, { props: { ...blueprint.props, [key]: next } })}
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const rest = { ...blueprint.props }
                delete rest[key]
                onChange(name, { props: rest })
              }}
              title={`Remove ${key}`}
              className="shrink-0 px-1 font-mono text-[11px] text-neutral-600 hover:text-rose-400"
            >
              ×
            </button>
          </div>
        ))}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            const key = adding.trim()
            if (key.length === 0 || key in blueprint.props) return
            // Zero rather than blank: every verb that touches a property does
            // arithmetic on it, so a property with no number is a property the
            // first `damage` turns into NaN.
            onChange(name, { props: { ...blueprint.props, [key]: 0 } })
            setAdding('')
          }}
          className="flex gap-1.5 pt-0.5"
        >
          <input
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            placeholder="hp"
            className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding.trim().length === 0 || adding.trim() in blueprint.props}
            className="rounded border border-neutral-800 px-2 py-1 text-[11px] text-neutral-300 disabled:text-neutral-700 enabled:hover:border-violet-500 enabled:hover:text-violet-200"
          >
            {t.addProperty}
          </button>
        </form>
      </div>
    </section>
  )
}

/**
 * Rename, and delete - with the reason delete is refused, when it is.
 *
 * The list of users is the whole point of this block. `removeBlueprint` will not
 * take away a kind of thing while anything still is one, and a disabled button
 * with no explanation is the worst version of that rule: the person is left to
 * guess which of four different kinds of reference is in the way.
 */
function Actions({
  name,
  taken,
  users,
  onRename,
  onDelete,
}: {
  name: string
  taken: string[]
  users: string[]
  onRename: (to: string) => void
  onDelete: () => void
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const [draft, setDraft] = useState(name)
  const ok = isBlueprintName(draft) && (draft === name || !taken.includes(draft))

  return (
    <section className="border-t border-neutral-900 pt-3">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!ok || draft === name) return
          onRename(draft)
        }}
        className="flex gap-1.5 px-1"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!ok || draft === name}
          className="rounded border border-neutral-800 px-2 py-1 text-[11px] text-neutral-300 disabled:text-neutral-700 enabled:hover:border-violet-500 enabled:hover:text-violet-200"
        >
          {t.rename}
        </button>
      </form>

      <div className="mt-2 px-1">
        <button
          type="button"
          onClick={onDelete}
          disabled={users.length > 0}
          className="rounded border border-neutral-800 px-2 py-1 text-[11px] text-neutral-400 disabled:cursor-not-allowed disabled:text-neutral-700 enabled:hover:border-rose-500/60 enabled:hover:text-rose-300"
        >
          {t.delete}
        </button>
        {users.length > 0 ? (
          <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-amber-400/80">
            {users.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

/**
 * The other models this thing is made of.
 *
 * A turret is a base and a barrel, and until this panel existed the only way to
 * say so was to hand-write the JSON. The list is deliberately flat even though
 * the parts form a tree: the depth here is two or three, and a disclosure
 * triangle for one child is more chrome than information - the same argument
 * the Scene tree makes about entities. What says a part hangs from another is
 * the `hangs from` row, which is also where you change it.
 */
function Parts({
  name,
  blueprint,
  onAdd,
  onChange,
  onRemove,
}: {
  name: string
  blueprint: Blueprint
  onAdd: (blueprint: string) => void
  onChange: (blueprint: string, index: number, patch: Partial<Part>) => void
  onRemove: (blueprint: string, index: number) => void
}) {
  const t = xpEditorDict(useLocale()).blueprints
  const parts = partsOf(blueprint)
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <PanelLabel>{t.parts} {parts.length}</PanelLabel>
        <button
          type="button"
          onClick={() => {
            onAdd(name)
            setOpen(parts.length)
          }}
          className="text-[10px] text-neutral-500 underline-offset-4 hover:text-violet-300 hover:underline"
        >
          Add
        </button>
      </div>

      {parts.length === 0 ? (
        <Hint className="px-1 leading-tight">
          {t.oneModel} <span className="text-neutral-400">{t.addAnother}</span>{' '}
          {t.partsBlurb}
        </Hint>
      ) : (
        <ul className="space-y-1 px-1">
          {parts.map((part, index) => (
            <li key={index} className="rounded border border-neutral-900">
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setOpen(open === index ? null : index)}
                  className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left text-[11px] text-neutral-300"
                >
                  <span className="truncate font-mono">
                    {part.name ?? part.model.slice(part.model.indexOf('/') + 1)}
                  </span>
                  {part.parent ? (
                    <span className="shrink-0 font-mono text-[10px] text-neutral-600">
                      on {part.parent}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRemove(name, index)
                    setOpen(null)
                  }}
                  title={t.removePart}
                  className="shrink-0 px-1 font-mono text-[11px] text-neutral-600 hover:text-rose-400"
                >
                  ×
                </button>
              </div>

              {open === index ? (
                <div className="space-y-2 border-t border-neutral-900 p-1.5">
                  <label className="block">
                    <span className="font-mono text-[10px] text-neutral-600">name</span>
                    <input
                      value={part.name ?? ''}
                      placeholder={t.unnamed}
                      onChange={(event) => onChange(name, index, { name: event.target.value })}
                      className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
                    />
                  </label>

                  {/*
                    Only parts that have a name can be hung from, which is the
                    honest list rather than every part: `parent` is a name, so
                    an unnamed part is not addressable and offering it would be
                    offering a choice that cannot be saved.
                  */}
                  <label className="block">
                    <span className="font-mono text-[10px] text-neutral-600">{t.hangsFrom}</span>
                    <select
                      value={part.parent ?? ''}
                      onChange={(event) => onChange(name, index, { parent: event.target.value })}
                      className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
                    >
                      <option value="">{t.theBlueprintItself}</option>
                      {parts
                        .filter((other, i) => i !== index && other.name)
                        .map((other) => (
                          <option key={other.name} value={other.name}>
                            {other.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  {part.parent ? (
                    <label className="block">
                      <span className="font-mono text-[10px] text-neutral-600">{t.atSocket}</span>
                      <input
                        value={part.socket ?? ''}
                        placeholder={t.itsOrigin}
                        onChange={(event) => onChange(name, index, { socket: event.target.value })}
                        className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
                      />
                    </label>
                  ) : null}

                  <div className="grid grid-cols-3 gap-1.5">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <label key={axis} className="block">
                        <span className="font-mono text-[10px] text-neutral-600">{axis}</span>
                        <NumberInput
                          step={0.1}
                          value={part[axis]}
                          commit={(value) => onChange(name, index, { [axis]: value })}
                          className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block">
                      <span className="font-mono text-[10px] text-neutral-600">{t.turn}</span>
                      <NumberInput
                        step={15}
                        value={part.rotation}
                        commit={(value) => onChange(name, index, { rotation: value })}
                        className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="font-mono text-[10px] text-neutral-600">{t.scale}</span>
                      <NumberInput
                        step={0.1}
                        min={0.1}
                        value={part.scale}
                        commit={(value) => {
                          if (value <= 0) return
                          onChange(name, index, { scale: value })
                        }}
                        className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div>
                    <p className="mb-1 font-mono text-[10px] text-neutral-600">{t.partModel}</p>
                    <Picker
                      value={part.model}
                      onChange={(model) => onChange(name, index, { model })}
                    />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
