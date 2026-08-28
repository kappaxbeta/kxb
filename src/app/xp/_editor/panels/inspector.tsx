'use client'

import { useRef, useState } from 'react'
import { NumberInput } from '@/app/xp/_editor/number-field'
import { ENTITY_STEP, savesProgress, type Pivot } from '@kxb/xp/edit'
import { GRAVITY, JUMP_SPEED, jumpHeightOf, SPRINT_PACE, WALK_PACE } from '@kxb/xp/engine'
import type { PlacementPatch, Selected, Transform } from '@/app/xp/_editor/stage/stage'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { MAX_KEY_COOLDOWN, MAX_PLAYER_KEYS, MAX_SIGN_TEXT_LENGTH, RESERVED_KEYS, type EntitySpec, type Mark, type Placement, type PlacementCollider, type PlayerKey, type PlayerRole, type XpDocument,
  type PlayerLook,
} from '@kxb/xp'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * What is in the level, and what the selected thing is.
 *
 * Two panels that are really one idea: a list you pick from and a form that
 * edits what you picked. They are together because they share the selection and
 * because splitting them would mean scrolling between the name of a thing and
 * its position.
 *
 * ---------------------------------------------------------------------------
 * Entities individually, placements by the kind
 * ---------------------------------------------------------------------------
 * This used to list entities only, and the argument for it was sound as far as
 * it went: a level is a few thousand placements and a few dozen entities, a
 * tree holding both is a tree you cannot find anything in, and there is nothing
 * to *say* about one wall that the grid does not already show.
 *
 * What it got wrong is that it answered "should every placement be a row" when
 * the question was "should the panel called Scene account for the scene". It
 * did not: a room of sixty-four pieces showed five things, and the honest
 * reading of that is that the other sixty-four are missing.
 *
 * So placements are here, folded by model - `Primitive_Wall × 24` is one row,
 * and twenty-four rows would have been the thing worth refusing. That is a
 * count you can check against what you think you built, which is the actual use
 * for this list, and it stays a dozen rows in a level of thousands because a
 * level uses a dozen models.
 */

/**
 * Everything either half of the old panel needs, in one place.
 *
 * The two components below each take a slice of it rather than a bespoke type,
 * because they are two views of one selection and a field that drifted between
 * them would be a field the Scene panel and the Properties panel disagree
 * about.
 */
export interface InspectorProps {
  document: XpDocument
  selected: Selected
  onSelect: (selected: Selected) => void
  /**
   * Turn a placement into a blueprint and an entity of it, in its place.
   *
   * The placement is consumed - see `blueprintFrom`. A button that only added
   * the blueprint would leave an entity inside the scenery it was made from.
   */
  onBlueprintFrom: (index: number) => void
  onChange: (index: number, patch: Partial<EntitySpec>) => void
  onPlacement: (index: number, patch: PlacementPatch) => void
  onRemove: (index: number) => void
  onRemovePlacement: (index: number) => void
  onAddMark: (kind: Mark['kind']) => void
  onMark: (index: number, patch: Partial<Mark>) => void
  onRemoveMark: (index: number) => void
  onPlayer: (patch: {
    blueprint?: string | null
    avatarSocket?: string | null
    weapon?: PlayerRole['weapon'] | null
    keys?: readonly PlayerKey[] | null
    /** What everybody wears when this level names no body. See `XpPlayer.wears`. */
    wears?: PlayerLook | null
    /** The movement numbers. `null` puts a field back to the built-in feel. */
    jump?: number | null
    speed?: number | null
    sprint?: number | null
    gravity?: number | null
    acceleration?: number | null
    drag?: number | null
  }) => void
  /** Where a person arrives when no mark says otherwise. */
  onSpawn: (patch: Partial<{ x: number; y: number; z: number; facing: number }>) => void
  pivot: Pivot
  onPivot: (pivot: Pivot) => void
}

export function Inspector({
  document,
  selected,
  onSelect,
  onAddMark,
  onPlayer,
  onBlueprintFrom,
  onRemove,
  onRemovePlacement,
  onRemoveMark,
}: Pick<
  InspectorProps,
  | 'document'
  | 'selected'
  | 'onSelect'
  | 'onAddMark'
  | 'onPlayer'
  | 'onBlueprintFrom'
  | 'onRemove'
  | 'onRemovePlacement'
  | 'onRemoveMark'
>) {
  const t = xpEditorDict(useLocale()).inspector
  return (
    <>
      <section>
        <PanelLabel className="mb-1.5">{t.things} {document.entities.length}</PanelLabel>

        {document.entities.length === 0 ? (
          <Hint>{t.thingsEmpty}</Hint>
        ) : (
          <ul className="max-h-44 overflow-y-auto pr-1">
            {document.entities.map((candidate, index) => {
              const chosen = selected?.kind === 'entity' && selected.index === index
              return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect(
                      selected?.kind === 'entity' && selected.index === index
                        ? null
                        : { kind: 'entity', index },
                    )
                  }
                  className={`flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
                    chosen ? 'bg-violet-500/15 text-violet-200' : 'text-neutral-400 hover:bg-neutral-900'
                  }`}
                  // Nesting by indent rather than by a collapsible tree: the
                  // depth here is two or three, and a disclosure triangle for
                  // one child is more chrome than information.
                  style={{ paddingLeft: candidate.parent ? 18 : 6 }}
                >
                  <span className="truncate">{candidate.name ?? candidate.blueprint}</span>
                  {/*
                    The muted half of a row is lifted when the row is selected.

                    `neutral-600` reads as "quieter than the name" on the panel's
                    own near-black and as *washed out* on the violet a selected
                    row is tinted with - so the one row somebody is looking at is
                    the one whose second half is hardest to read. Same fix as the
                    script panel's suggestion list, same reason.
                  */}
                  {candidate.name ? (
                    <span
                      className={`truncate font-mono text-[10px] ${
                        chosen ? 'text-violet-300/70' : 'text-neutral-600'
                      }`}
                    >
                      {candidate.blueprint}
                    </span>
                  ) : null}
                  {candidate.socket ? (
                    <span
                      className={`ml-auto shrink-0 font-mono text-[10px] ${
                        chosen ? 'text-violet-300/70' : 'text-neutral-600'
                      }`}
                    >
                      ⤷ {candidate.socket}
                    </span>
                  ) : null}
                </button>
                {/*
                  Under the selected row, like `Built`'s make-blueprint: a
                  screen with no Delete key needs a way to take a thing out of
                  the level, and the quiet link in the Properties panel is a
                  tab away from the list somebody is holding the thing in.
                  One press, because the press Undo already answers for.
                */}
                {chosen && onRemove ? (
                  <RowDelete onPress={() => onRemove(index)} />
                ) : null}
              </li>
              )
            })}
          </ul>
        )}
      </section>

      <Built
        document={document}
        selected={selected}
        onSelect={onSelect}
        onBlueprintFrom={onBlueprintFrom}
        onRemovePlacement={onRemovePlacement}
      />

      <MarkList
        document={document}
        selected={selected}
        onSelect={onSelect}
        onAdd={onAddMark}
        onRemove={onRemoveMark}
      />

      {/*
        Who a person arrives as: a fact about the document rather than about
        whatever happens to be selected, so it stays with the lists.

        The heading is a button, because the player is selectable now and a
        list you navigate by should be able to reach everything the viewport
        can. Same toggle-off-when-open behaviour as an entity row.
      */}
      <PlayerRow
        document={document}
        onChange={onPlayer}
        selected={selected?.kind === 'player'}
        onSelect={() => onSelect(selected?.kind === 'player' ? null : { kind: 'player' })}
      />

    </>
  )
}

/**
 * Take the selected row's thing out of the level, from the row itself.
 *
 * The lists had no way to delete anything without a keyboard: the Delete key
 * is the fast path and the Properties panel's link is a tab switch away, and
 * on a phone the first does not exist and the second loses the list. So the
 * selected row grows the action, exactly where make-blueprint already sits -
 * on the one row you are looking at, never on the thirty you are scanning.
 * No are-you-sure: the Delete key never asked either, and Undo is the answer
 * both give.
 */
function RowDelete({ onPress, indent }: { onPress: () => void; indent?: boolean }) {
  const t = xpEditorDict(useLocale()).inspector
  return (
    <div className={`pb-1 pr-1.5 ${indent ? 'pl-6' : 'pl-1.5'}`}>
      <button
        type="button"
        onClick={onPress}
        className="w-full rounded border border-neutral-800 px-1.5 py-1 text-left font-mono text-[10px] text-neutral-400 transition-colors hover:border-red-500/60 hover:text-red-300"
      >
        {t.delete}
      </button>
    </div>
  )
}

/**
 * The architecture, counted by kind.
 *
 * Deliberately not clickable. A row here stands for twenty-four walls, and a
 * click would have to mean "select all of them", which is an operation the edit
 * layer does not have and which nobody asked for - a row that looks
 * interactive and is not is worse than one that plainly is not.
 *
 * Sorted by count rather than by name, because the question this answers is
 * "what is this level mostly made of", and the answer is at the top.
 */
function Built({
  document,
  selected,
  onSelect,
  onBlueprintFrom,
  onRemovePlacement,
}: {
  document: XpDocument
  selected: Selected
  onSelect: (selected: Selected) => void
  /**
   * Turn the selected piece into a kind of thing, in its place.
   *
   * Optional so the panel renders in a test without one, and absent means the
   * row simply has no button - not a disabled one, which would be a promise
   * with nothing behind it.
   */
  onBlueprintFrom?: (index: number) => void
  /** Take the selected piece out. Optional for the same reason as above. */
  onRemovePlacement?: (index: number) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  /**
   * Which models are open.
   *
   * Folded by default and unfolded one at a time. A level is a few thousand
   * placements and a dozen models, so the folded view is the one somebody can
   * read - "what is this made of" - and the unfolded one is for reaching the
   * particular wall that is in the wrong place.
   */
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  const byModel = new Map<string, number[]>()
  document.world.placements.forEach((placement, index) => {
    const group = byModel.get(placement.model)
    if (group) group.push(index)
    else byModel.set(placement.model, [index])
  })
  const rows = [...byModel].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  )

  /**
   * The model of whatever is selected, unfolded even if nobody unfolded it.
   *
   * Clicking a wall in the viewport has to show that wall in the tree, and a
   * selection hidden inside a folded group is a tree that disagrees with the
   * thing it is a tree of.
   */
  const showing =
    selected?.kind === 'placement'
      ? document.world.placements[selected.index]?.model
      : undefined

  return (
    <section>
      <PanelLabel className="mb-1.5">
        {t.built} {document.world.placements.length}
        {rows.length > 0 ? (
          <span className="ml-1.5 normal-case tracking-normal text-neutral-600">
            {rows.length} {rows.length === 1 ? t.modelOne : t.modelMany}
          </span>
        ) : null}
      </PanelLabel>

      {rows.length === 0 ? (
        <Hint>{t.builtEmpty}</Hint>
      ) : (
        <ul className="max-h-48 overflow-y-auto pr-1">
          {rows.map(([model, indexes]) => {
            const unfolded = open.has(model) || showing === model
            return (
              <li key={model}>
                <button
                  type="button"
                  onClick={() =>
                    setOpen((was) => {
                      const next = new Set(was)
                      if (next.has(model)) next.delete(model)
                      else next.add(model)
                      return next
                    })
                  }
                  className="flex w-full items-baseline gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] text-neutral-400 hover:bg-neutral-900"
                >
                  {/* On the panel's smallest step rather than a nudge below
                      it: 9px was a guess at "smaller than the row", and the
                      ramp already has a word for that. */}
                  <span className="shrink-0 font-mono text-[10px] text-neutral-600">
                    {unfolded ? '▾' : '▸'}
                  </span>
                  {/* The pack prefix dropped: every model in this list is from
                      the same pack as its neighbours, so `proto/` twelve times
                      is twelve times the same word and none of the
                      distinguishing part. */}
                  <span className="truncate">{model.slice(model.indexOf('/') + 1)}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-neutral-600">
                    {indexes.length}
                  </span>
                </button>

                {unfolded ? (
                  <ul>
                    {indexes.map((index) => {
                      const at = document.world.placements[index]
                      const on = selected?.kind === 'placement' && selected.index === index
                      return (
                        <li key={index}>
                          <button
                            type="button"
                            onClick={() =>
                              onSelect(on ? null : { kind: 'placement', index })
                            }
                            className={`flex w-full items-baseline gap-1.5 rounded py-0.5 pl-6 pr-1.5 text-left font-mono text-[10px] transition-colors ${
                              on
                                ? 'bg-violet-500/15 text-violet-200'
                                : 'text-neutral-500 hover:bg-neutral-900'
                            }`}
                          >
                            {/* The cell, because that is the only thing that
                                distinguishes one wall from the next one. */}
                            <span className="tabular-nums">
                              {at.x} {at.y} {at.z}
                            </span>
                            {at.rotation ? (
                              <span
                                className={`ml-auto shrink-0 ${
                                  on ? 'text-violet-300/70' : 'text-neutral-600'
                                }`}
                              >
                                {at.rotation}°
                              </span>
                            ) : null}
                          </button>

                          {/*
                            Only on the one that is selected, and under it.

                            A button on every row would be a hundred buttons in
                            a list somebody is scanning for a cell. This is a
                            thing you do to the piece you are looking at, so it
                            appears where you are looking - the same rule the
                            mark forms follow.
                          */}
                          {on && onBlueprintFrom ? (
                            <div className="pb-1 pl-6 pr-1.5">
                              <button
                                type="button"
                                onClick={() => onBlueprintFrom(index)}
                                title={t.makeBlueprintTitle}
                                className="w-full rounded border border-neutral-800 px-1.5 py-1 text-left font-mono text-[10px] text-neutral-400 transition-colors hover:border-violet-500/60 hover:text-violet-200"
                              >
                                {t.makeBlueprint}
                              </button>
                            </div>
                          ) : null}
                          {on && onRemovePlacement ? (
                            <RowDelete indent onPress={() => onRemovePlacement(index)} />
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {/* The number that decides how heavy a level is, which is not the one
          above it: the renderer draws one call per mesh per distinct model, so
          four thousand walls of one kind are cheaper than forty of a hundred
          kinds (docs/xp/manual.md §3). */}
      {rows.length > 12 ? (
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-amber-400/70">
          {rows.length} {t.distinctModels}
        </p>
      ) : null}
    </section>
  )
}

/**
 * The facts about the level, as rows.
 *
 * A mark is the one part of a document the *product* reads rather than the
 * player: `capabilityProblems` decides from these whether this XP can be a match
 * or a football game, so a level can be perfect and still refuse to load because
 * it claims something its marks do not back up. An editor that could place walls
 * and not marks was an editor that could build a pitch nobody can schedule a
 * game on.
 *
 * The five kinds are buttons rather than a picker plus an Add: the whole
 * vocabulary is five words and it is closed, so a row of them says what a level
 * can *have* at the same time as adding one.
 */
function MarkList({
  document,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: {
  document: XpDocument
  selected: Selected
  onSelect: (selected: Selected) => void
  onAdd: (kind: Mark['kind']) => void
  /** Take the selected mark away. Optional so the panel renders in a test. */
  onRemove?: (index: number) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  const marks = document.world.marks

  return (
    <section>
      <PanelLabel className="mb-1.5">{t.marks} {marks.length}</PanelLabel>

      {marks.length === 0 ? (
        <Hint className="mb-1.5">{t.marksEmpty}</Hint>
      ) : (
        <ul className="mb-1.5 max-h-40 overflow-y-auto pr-1">
          {marks.map((mark, index) => {
            const on = selected?.kind === 'mark' && selected.index === index
            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => onSelect(on ? null : { kind: 'mark', index })}
                  className={`flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
                    on ? 'bg-violet-500/15 text-violet-200' : 'text-neutral-400 hover:bg-neutral-900'
                  }`}
                >
                  {/* The kind's own colour, the same one it is drawn in - so a
                      row and the thing in the level are recognisably the same
                      object rather than two lists to reconcile. */}
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: MARK_COLOURS[mark.kind] }}
                  />
                  <span className="truncate">{mark.kind}</span>
                  {mark.team ? (
                    <span
                      className={`truncate font-mono text-[10px] ${
                        on ? 'text-violet-300/70' : 'text-neutral-600'
                      }`}
                    >
                      {mark.team}
                    </span>
                  ) : null}
                  <span
                    className={`ml-auto shrink-0 font-mono text-[10px] tabular-nums ${
                      on ? 'text-violet-300/70' : 'text-neutral-600'
                    }`}
                  >
                    {mark.x} {mark.y} {mark.z}
                  </span>
                </button>
                {/* The touch path out. See RowDelete. */}
                {on && onRemove ? <RowDelete onPress={() => onRemove(index)} /> : null}
              </li>
            )
          })}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-1">
        {MARK_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onAdd(kind)}
            title={fill(t.putMark, { kind })}
            className="rounded border border-neutral-800 px-1.5 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
          >
            + {kind}
          </button>
        ))}
      </div>
      <Hint className="mt-1">{t.landsUnderPointer}</Hint>
    </section>
  )
}

/** The vocabulary, in the order somebody reaches for it. */
const MARK_KINDS: readonly Mark['kind'][] = ['spawn', 'red', 'blue', 'start', 'finish', 'point']

/** The same colours ./_runtime/marks draws them in, so a row matches the level. */
const MARK_COLOURS: Record<Mark['kind'], string> = {
  red: '#f0abfc',
  blue: '#67e8f9',
  start: '#a3e635',
  finish: '#fbbf24',
  spawn: '#ffffff',
  // Dimmer than the rest on purpose: a board is *made* of these, and forty
  // fields lit like a spawn point would be a level that looks like a warning.
  point: '#94a3b8',
}

/**
 * The selected mark.
 *
 * Whole cells, and the fields step by one, because that is what the format
 * stores and what `setMark` rounds to - a field that accepted 2.4 and showed 2
 * would be a field arguing with the person using it.
 *
 * The size fields are absent for a spawn, because the format ignores them there:
 * a spawn is a place to stand and a width for one is a question with no answer.
 */
function MarkForm({
  index,
  mark,
  onChange,
  onRemove,
}: {
  index: number
  mark: Mark
  onChange: (index: number, patch: Partial<Mark>) => void
  onRemove: (index: number) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <PanelLabel className="min-w-0 truncate">{mark.kind} {t.mark}</PanelLabel>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="shrink-0 text-[10px] text-neutral-500 underline-offset-4 hover:text-red-400 hover:underline"
        >
          {t.delete}
        </button>
      </div>

      <Field label={t.kind}>
        <Select
          value={mark.kind}
          options={MARK_KINDS.map((kind) => [kind, kind])}
          onChange={(kind) => onChange(index, { kind: kind as Mark['kind'] })}
        />
      </Field>

      {/*
        The same gears everything else on this panel has — half a cell to an
        arrow, a tenth with Shift — rather than the whole cells these three had.
        A mark was rounded to an integer when it was written, so a typed 0.5
        came back as a 1 and a spawn could not stand on a step or a half-height
        ledge. `setMark` snaps to a tenth now, and the field has to offer what
        the edit will keep or the panel is the thing that lies.
      */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberField
            key={axis}
            label={axis}
            value={mark[axis]}
            onChange={(value) => onChange(index, { [axis]: value })}
          />
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <NumberField
          label={t.facing}
          value={mark.facing}
          step={15}
          onChange={(value) => onChange(index, { facing: value })}
        />
        {mark.kind === 'spawn' ? null : (
          <>
            <NumberField
              label={t.width}
              value={mark.width}
              step={1}
              onChange={(value) => onChange(index, { width: value })}
            />
            <NumberField
              label={t.height}
              value={mark.height}
              step={1}
              onChange={(value) => onChange(index, { height: value })}
            />
          </>
        )}
      </div>

      <div className="mt-2">
        <Field label={t.team}>
          <input
            value={mark.team ?? ''}
            placeholder={t.nobodys}
            onChange={(event) => onChange(index, { team: event.target.value })}
            className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
        </Field>
      </div>

      <Hint className="mt-1.5">{mark.kind === 'spawn' ? t.spawnBlurb : t.goalBlurb}</Hint>
    </section>
  )
}

/**
 * Who a person arrives as.
 *
 * The one entity a document does *not* place, which is exactly why it needs a
 * row: everything else in the level can be clicked, and this can only be found
 * by knowing the field is there. Absent means the built-in dummy, which is the
 * common case and deliberately not something a document has to declare.
 */
/**
 * The keys this level binds, beyond the ones every body already has.
 *
 * Five rows, because five is the format's limit and the reason is physical:
 * these become on-screen buttons on a phone, and a dozen is a control pad
 * nobody can reach the middle of.
 *
 * **`does` is free text with suggestions, not a picker.** Every action emits
 * its own name and the level's rules decide what it means, so `grab` and "open
 * the hatch" are the same mechanism - a closed list here would be the panel
 * pretending the engine has a vocabulary it does not have. The familiar names
 * are offered because most people want one of them, which is a picker being
 * helpful rather than a rule.
 *
 * The key is captured by pressing it rather than typed. A `KeyboardEvent.code`
 * is not a thing anybody knows by heart - "it is `Digit1`, not `1`, and
 * `BracketLeft`, not `[`" is a sentence no author should have to be told.
 */
/**
 * ---------------------------------------------------------------------------
 * A half-written row lives here, not in the document
 * ---------------------------------------------------------------------------
 * Reported as *"the add keys button doesn't work"*, and it could not have: it
 * wrote `{ key: '', does: '' }` straight into the document, `keysAreSane`
 * refuses a binding with no key and no name, `setPlayerRole` returned null, and
 * the panel drew the same thing it had before. A button whose entire effect is
 * refused one function call later.
 *
 * The refusal is right and stays. A binding is only a binding once it has both
 * halves — half of one in a saved document is a button that does nothing in a
 * level somebody is playing. What was wrong is *where the half-written state
 * lived*: a row being filled in is a fact about the panel, so it is held here
 * and written through the moment it is complete.
 *
 * The same fix quietly repairs editing, which had the same shape: clearing the
 * name of a bound key was refused too, so the field appeared frozen with the
 * old value in it. Now it empties, the row says what it is missing, and the
 * document keeps the last complete version until the row is complete again.
 */
function Keys({
  document,
  onChange,
}: {
  document: XpDocument
  onChange: (patch: { keys?: readonly PlayerKey[] | null }) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  const saved = document.player.keys ?? []
  const [rows, setRows] = useState<PlayerKey[]>([...saved])

  /**
   * Follow the document when it changes underneath — an undo, a level loaded,
   * the other panel that can write this.
   *
   * Compared by value rather than by identity, and adjusted during render
   * rather than in an effect, which is React's own answer for state that has to
   * follow a prop. The comparison is over at most five short pairs.
   */
  const [seen, setSeen] = useState(() => JSON.stringify(saved))
  const now = JSON.stringify(saved)
  if (seen !== now) {
    setSeen(now)
    setRows([...saved])
  }

  const complete = (row: PlayerKey) => row.key.length > 0 && row.does.trim().length > 0

  const write = (next: PlayerKey[]) => {
    setRows(next)
    // Only the finished ones reach the document. An unfinished row is not a
    // deletion either — it is simply not a binding yet.
    const done = next.filter(complete)
    onChange({ keys: done.length > 0 ? done : null })
  }

  const keys = rows

  return (
    <section className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <PanelLabel>{t.keys} {keys.length}/{MAX_PLAYER_KEYS}</PanelLabel>
        {keys.length < MAX_PLAYER_KEYS ? (
          <button
            type="button"
            onClick={() => write([...keys, { key: '', does: '' }])}
            className="shrink-0 text-[10px] text-neutral-500 underline-offset-4 hover:text-violet-300 hover:underline"
          >
            {t.addKey}
          </button>
        ) : null}
      </div>

      {keys.length === 0 ? (
        <Hint className="mt-1">{t.keysBlurb}</Hint>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {keys.map((bound, index) => (
            <li key={index} className="flex items-center gap-1">
              <button
                type="button"
                title={t.pressAKeyToBind}
                onKeyDown={(event) => {
                  event.preventDefault()
                  // Reserved keys are refused by the edit layer, so writing one
                  // would arrive as "nothing happened". Caught here instead, so
                  // the row can say which key and why.
                  if (RESERVED_KEYS.includes(event.code)) return
                  const next = keys.map((k, i) => (i === index ? { ...k, key: event.code } : k))
                  write(next)
                }}
                className={`w-28 shrink-0 rounded border px-1.5 py-1 text-left font-mono text-[11px] ${
                  bound.key
                    ? 'border-neutral-800 text-neutral-200'
                    : 'border-violet-500/60 text-violet-300'
                }`}
              >
                {bound.key || t.pressAKey}
              </button>
              <input
                value={bound.does}
                list="xp-action-names"
                placeholder={t.whatItDoes}
                onChange={(event) =>
                  write(keys.map((k, i) => (i === index ? { ...k, does: event.target.value } : k)))
                }
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
              />
              {/*
                The wait, in seconds, and blank for none.
                
                A number beside the name rather than a panel of its own, because
                it is a fact about *this* binding: three seconds on a dash and
                nothing on a kick is two rows of the same table. Blank rather
                than zero is what "no cooldown" looks like - the field is absent
                from the document, so a level with no waits in it keeps the shape
                it has always had, and a written zero is refused by the parser
                as somebody meaning something the field cannot say.
              */}
              <input
                value={bound.cooldown ?? ''}
                inputMode="decimal"
                placeholder={t.wait}
                title={fill(t.waitTitle, { n: MAX_KEY_COOLDOWN })}
                onChange={(event) => {
                  const typed = event.target.value.trim()
                  const seconds = Number(typed)
                  const wait =
                    typed.length === 0 || !Number.isFinite(seconds) || seconds <= 0
                      ? undefined
                      : Math.min(seconds, MAX_KEY_COOLDOWN)
                  write(
                    keys.map((k, i) => {
                      if (i !== index) return k
                      // Rebuilt without the field rather than set to undefined,
                      // so a binding with no wait round-trips as the two fields
                      // it has always been.
                      const bare: PlayerKey = { key: k.key, does: k.does }
                      return wait === undefined ? bare : { ...bare, cooldown: wait }
                    }),
                  )
                }}
                className="w-12 shrink-0 rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => write(keys.filter((_, i) => i !== index))}
                title={t.unbind}
                className="shrink-0 px-1 text-[10px] text-neutral-600 hover:text-red-400"
              >
                ×
              </button>
              {/*
                Said on the row rather than as a refusal after the fact: a row
                with one half filled in is not saved, and silence about that is
                what "the button does not work" felt like.
              */}
              {!complete(bound) ? (
                <span className="shrink-0 font-mono text-[10px] text-amber-400/80">
                  {bound.key ? t.nameIt : t.pressAKey}
                </span>
              ) : null}
            </li>
          ))}
          <datalist id="xp-action-names">
            {['grab', 'use', 'attack', 'shoot'].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </ul>
      )}
    </section>
  )
}

/**
 * The player, as the thing you clicked.
 *
 * Everything else in the viewport opens its own numbers when you click it; the
 * body standing at the spawn opened nothing, and its fields were filed under a
 * different tab - so "where does the player start" was a question you could
 * only answer if you already knew where the answer lived.
 *
 * Two things in one panel because they are two halves of one question. *Where*
 * a person arrives is the document's own `spawn`, and *who* they arrive as is
 * `player`, which is the same set of rows the Scene panel shows - the same
 * component, not a second copy, so a field added there appears here.
 *
 * The spawn shown here is the **fallback**: a level with spawn marks arrives at
 * one of those, and clicking the body in a level that has them selects the mark
 * instead. Said in the line under the fields rather than left to be discovered,
 * because a number that is quietly ignored is the worst kind of field.
 */
function PlayerForm({
  document,
  onSpawn,
  onPlayer,
}: {
  document: XpDocument
  onSpawn: (patch: Partial<{ x: number; y: number; z: number; facing: number }>) => void
  onPlayer: InspectorProps['onPlayer']
}) {
  const t = xpEditorDict(useLocale()).inspector
  const marks = document.world.marks.filter((mark) => mark.kind === 'spawn').length

  return (
    <section>
      <PanelLabel className="mb-1.5">Player</PanelLabel>

      <div className="grid grid-cols-3 gap-1.5">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberField
            key={axis}
            label={axis}
            value={document.spawn[axis]}
            onChange={(value) => onSpawn({ [axis]: value })}
          />
        ))}
      </div>

      <Pad
        x={document.spawn.x}
        y={document.spawn.y}
        z={document.spawn.z}
        onChange={(patch) => onSpawn(patch)}
      />

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <NumberField
          label={t.facing}
          value={document.spawn.facing}
          step={15}
          onChange={(value) => onSpawn({ facing: value })}
        />
      </div>

      <Hint className="mt-1.5">
        {marks === 0 ? t.playerSpawnBlurb : fill(t.playerMarksBlurb, { marks })}
      </Hint>

      <div className="mt-3 border-t border-neutral-900 pt-2">
        <PlayerRow document={document} onChange={onPlayer} />
      </div>
    </section>
  )
}

function PlayerRow({
  document,
  onChange,
  selected,
  onSelect,
}: {
  document: XpDocument
  onChange: InspectorProps['onPlayer']
  /** Whether the player is what the Properties panel is pointed at. */
  selected?: boolean
  /** Absent inside the Properties panel, where the player is already what is open. */
  onSelect?: () => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  const names = Object.keys(document.blueprints)
  const body = document.player.blueprint ? document.blueprints[document.player.blueprint] : null
  const sockets = body ? Object.keys(body.sockets) : []

  return (
    <section>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className={`mb-1.5 block w-full rounded px-1.5 py-1 text-left font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
            selected
              ? 'bg-violet-500/15 text-violet-200'
              : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
          }`}
        >
          {t.player}
        </button>
      ) : (
        <PanelLabel className="mb-1.5">{t.player}</PanelLabel>
      )}

      <Field label={t.body}>
        <Select
          value={document.player.blueprint ?? ''}
          options={[
            ['', t.builtInDummy],
            ...names.map((name) => [name, name] as const),
          ]}
          onChange={(name) => onChange({ blueprint: name || null })}
        />
      </Field>

      {names.length === 0 ? (
        <Hint className="mt-1">{t.noBlueprints}</Hint>
      ) : null}

      {/*
        What everybody is, on top of whatever body the level names.

        Shown whether or not a blueprint is chosen, because the two answer
        different questions: a blueprint is a model *and* its rules, and this
        only ever swaps the model. Peepz Park names a `peep` so that a key is a
        dash, and which animal is doing the dashing is nobody's business but the
        person doing it.
      */}
      <>
          <Field label={t.everybodyIs}>
            <Select
              value={document.player.wears ?? 'dummy'}
              options={[
                [
                  'dummy',
                  document.player.blueprint ? t.theBodyAbove : t.builtInDummy,
                ],
                ['profile', t.looks.profile],
                ['random', t.looks.random],
              ]}
              onChange={(look) =>
                onChange({ wears: look === 'dummy' ? null : (look as PlayerLook) })
              }
            />
          </Field>
          <Hint className="mt-1">
            {document.player.wears === 'profile'
              ? t.wearsProfile
              : document.player.wears === 'random'
                ? t.wearsRandom
                : document.player.blueprint
                  ? t.wearsBody
                  : t.wearsDummy}
          </Hint>
      </>

      <Movement document={document} onChange={onChange} />

      <Keys document={document} onChange={onChange} />

      {/* Only once there is a body with sockets on it. A picker offering
          nothing is a control that looks broken, and the built-in dummy has no
          sockets to name - the parser refuses one, and so does the edit layer. */}
      {/*
        **Holding is not gated on sockets, and that was the bug.**

        All three of these used to appear together or not at all, behind
        `sockets.length > 0` — so with the built-in dummy, or any body whose
        blueprint declares no sockets, there was no way to give the player a
        weapon at all. Reported as "you can't set this in the editor", and it
        was true.

        A weapon does not need a socket. `skinned.tsx` finds the **hand bone by
        name** on a rigged body and parents the gun to it, and `setPlayerRole`
        only checks a socket when one is given. So `holding` asks for a
        blueprint and nothing else; the socket below is the refinement, not the
        prerequisite.

        `avatar at` is different and stays gated: it hangs a *rider* off a named
        socket, and a body with none has nowhere to put one.
      */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Field label={t.holding}>
          <Select
            value={document.player.weapon?.blueprint ?? ''}
            options={[['', t.nothing], ...names.map((name) => [name, name] as const)]}
            onChange={(name) =>
              onChange({
                weapon: name
                  ? {
                      blueprint: name,
                      // Kept if it was chosen, and otherwise not invented: a
                      // socket the body does not have is refused, and a rigged
                      // body finds its own hand without one.
                      ...(document.player.weapon?.socket
                        ? { socket: document.player.weapon.socket }
                        : {}),
                    }
                  : null,
              })
            }
          />
        </Field>

        {sockets.length > 0 ? (
          <Field label={t.avatarAt}>
            <Select
              value={document.player.avatarSocket ?? ''}
              options={[['', 'nowhere'], ...sockets.map((name) => [name, name] as const)]}
              onChange={(socket) => onChange({ avatarSocket: socket || null })}
            />
          </Field>
        ) : null}
      </div>

      {document.player.weapon && sockets.length > 0 ? (
        <div className="mt-2">
          <Field label={t.inHand}>
            <Select
              value={document.player.weapon.socket ?? ''}
              options={[
                ['', t.theHandItFinds],
                ...sockets.map((name) => [name, name] as const),
              ]}
              onChange={(socket) =>
                onChange({
                  weapon: {
                    blueprint: document.player.weapon!.blueprint,
                    ...(socket ? { socket } : {}),
                  },
                })
              }
            />
          </Field>
        </div>
      ) : null}

      {document.player.weapon ? (
        <Grip weapon={document.player.weapon} onChange={onChange} />
      ) : null}

      <Hint className="mt-1">
        {document.player.weapon
          ? t.weaponBlurb
          : t.notTheAvatar}
      </Hint>
    </section>
  )
}

/**
 * How the level moves underfoot - the six numbers, each with a built-in.
 *
 * Every field shows the engine's own value when the document is silent, and
 * writing that value back (or anything at or below zero, for the two that mean
 * "instant") stores *absence* rather than the number - so a level that was
 * merely looked at round-trips untouched, which is the same bargain `wears`
 * makes with `dummy`.
 *
 * `jump` is in cells cleared, not in speed, for the reason the format gives:
 * an author checks their course by counting blocks. The blurb under the grid
 * carries the format's own warning - a changed number wants its course driven,
 * not measured.
 */
function Movement({
  document,
  onChange,
}: {
  document: XpDocument
  onChange: InspectorProps['onPlayer']
}) {
  const t = xpEditorDict(useLocale()).inspector
  const built = {
    speed: WALK_PACE,
    sprint: SPRINT_PACE,
    jump: Math.round(jumpHeightOf(JUMP_SPEED) * 100) / 100,
    gravity: GRAVITY,
    // "Instant", drawn as a zero - the one number the parser refuses, which is
    // exactly why committing it clears the field instead.
    acceleration: 0,
    drag: 0,
  } as const

  const fields = [
    ['speed', t.moveSpeed, 1],
    ['sprint', t.moveSprint, 1],
    ['jump', t.moveJump, 0.5],
    ['gravity', t.moveGravity, 1],
    ['acceleration', t.moveAcceleration, 5],
    ['drag', t.moveDrag, 5],
  ] as const

  return (
    <div className="mt-2">
      <PanelLabel className="mb-1.5">{t.movement}</PanelLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {fields.map(([field, label, step]) => (
          <NumberField
            key={field}
            label={label}
            step={step}
            value={document.player[field] ?? built[field]}
            onChange={(value) =>
              onChange({ [field]: value <= 0 || value === built[field] ? null : value })
            }
          />
        ))}
      </div>
      <Hint className="mt-1">{t.movementBlurb}</Hint>
    </div>
  )
}

/**
 * The selected piece of architecture.
 *
 * Whole cells, which is what a placement is: the fields step by one and typing
 * 2.4 lands on 2, because the format's lattice is the reason a wall is exactly
 * four cells wide and half a wall is not a thing that can exist. An entity's
 * form a few lines up steps by a tenth for the opposite reason.
 */
function PlacementForm({
  index,
  piece,
  onChange,
  onRemove,
}: {
  index: number
  piece: Placement
  onChange: (index: number, patch: PlacementPatch) => void
  onRemove: (index: number) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <PanelLabel className="min-w-0 truncate">
          {piece.model.slice(piece.model.indexOf('/') + 1)}
        </PanelLabel>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="shrink-0 text-[10px] text-neutral-500 underline-offset-4 hover:text-red-400 hover:underline"
        >
          {t.delete}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberField
            key={axis}
            label={axis}
            value={piece[axis]}
            onChange={(value) => onChange(index, { [axis]: value })}
          />
        ))}
      </div>

      <Pad
        x={piece.x}
        y={piece.y}
        z={piece.z}
        onChange={(patch) => onChange(index, patch)}
      />

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <NumberField
          label={t.turn}
          value={piece.rotation}
          step={90}
          onChange={(value) => onChange(index, { rotation: value })}
        />
        <NumberField
          label={t.scale}
          value={piece.scale}
          step={ENTITY_STEP}
          onChange={(value) => onChange(index, { scale: value })}
        />
      </div>

      <Shape of={piece} onChange={(patch) => onChange(index, patch)} />

      <Collider of={piece.collider} onChange={(patch) => onChange(index, patch)} />

      <Hint className="mt-1.5">{t.architecture}</Hint>
    </section>
  )
}

/**
 * What the piece collides as.
 *
 * ---------------------------------------------------------------------------
 * Two settings here, and the third is not a setting
 * ---------------------------------------------------------------------------
 * **Measured** and **walk through** are the two anybody picks, and they are the
 * two the grid can be told about without any numbers: the first is what the
 * voxeliser found and the second is nothing at all. A drawn collider is the
 * third state and it is a *list of boxes*, which is a JSON field and not a
 * control - a panel that could edit it would be a box editor with a gizmo per
 * box, and that is section 5 of the creator doc rather than this afternoon.
 *
 * So the list is shown and not edited. That is the important half: an author
 * who opens a document somebody hand-wrote sees "drawn · 2 boxes" and knows why
 * the arch behaves the way it does, rather than seeing "measured" and being
 * lied to by their own inspector. Switching away from it is offered, because a
 * setting you cannot leave is a trap; switching *to* it is not, because there
 * would be nothing to put in the boxes.
 */
function Collider({
  of,
  onChange,
}: {
  of: PlacementCollider | undefined
  onChange: (patch: PlacementPatch) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  const drawn = Array.isArray(of)

  return (
    <div className="mt-1.5">
      <Field label={t.collidesAs}>
        <Select
          value={drawn ? 'drawn' : of === 'none' ? 'none' : 'auto'}
          options={
            drawn
              ? ([
                  ['drawn', `drawn · ${of.length} ${of.length === 1 ? 'box' : 'boxes'}`],
                  ['auto', t.measuredShape],
                  ['none', t.walkThrough],
                ] as const)
              : ([
                  ['auto', t.measuredShape],
                  ['none', t.walkThrough],
                ] as const)
          }
          onChange={(value) => {
            if (value === 'drawn') return
            onChange({ collider: value === 'none' ? 'none' : undefined })
          }}
        />
      </Field>

      <Hint className="mt-1">
        {drawn ? (
          t.drawnBlurb
        ) : (
          <>
            {t.measuredBlurb}{' '}
            <span className="text-neutral-400">{t.walkThrough}</span>{' '}
            {t.colliderLead} <code>collider</code> {t.colliderTail}
          </>
        )}
      </Hint>
    </div>
  )
}

/**
 * The two other angles, and the size along each axis.
 *
 * One component for a placement and an entity, because they are the same five
 * fields meaning the same thing - and because a ramp is a placement while a
 * plank you can break is an entity, so offering it on one of them would leave
 * half the feature unreachable.
 *
 * **Typed, not dragged, and deliberately so for this pass.** The gizmo's rotate
 * handle stays yaw. A three-ring trackball is a fortnight of work and a control
 * most people fight; five fields that work today beat a gizmo that is coming,
 * which is the same argument the weapon's grip block makes a few hundred lines
 * up and settled the same way. The way to *look* at the result is already here:
 * press Try.
 *
 * Fifteen degrees a press, because a tilt is a wedge somebody is eyeballing
 * rather than a number they know, and one degree at a time is forty presses to
 * find that out. A tenth on the multipliers, the step everything else uses.
 *
 * Absent reads as level and unstretched, and the edit layer deletes anything
 * put back to its default rather than writing it - so a piece somebody tilted
 * and untilted is the piece it was, byte for byte, when the file is saved.
 */
function Shape({
  of,
  onChange,
}: {
  of: { pitch?: number; roll?: number; stretch?: { x?: number; y?: number; z?: number } }
  onChange: (patch: Transform) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  const stretch = of.stretch ?? {}

  return (
    <>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <NumberField
          label={t.pitch}
          value={of.pitch ?? 0}
          step={15}
          onChange={(value) => onChange({ pitch: value })}
        />
        <NumberField
          label={t.roll}
          value={of.roll ?? 0}
          step={15}
          onChange={(value) => onChange({ roll: value })}
        />
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberField
            key={axis}
            label={`× ${axis}`}
            value={stretch[axis] ?? 1}
            step={ENTITY_STEP}
            onChange={(value) => onChange({ stretch: { ...stretch, [axis]: value } })}
          />
        ))}
      </div>

      <Hint className="mt-1">
        {t.tiltBlurbLead} <span className="text-neutral-400">{t.itsOwn}</span>{' '}
        {t.tiltBlurbTail}
      </Hint>
    </>
  )
}

/**
 * A closed list, as a native `select`.
 *
 * Native rather than a styled listbox for the reason the whole editor is built
 * on other people's widgets: keyboard, typeahead, scrolling, the mobile picker
 * and the "it opens upwards near the bottom of the screen" behaviour are a
 * fortnight of work that has been done correctly already, and none of it is what
 * this project is about.
 */
/**
 * Where the weapon sits in the hand.
 *
 * The controls for the grip the format grew after "the weapon is holding
 * wrong" — a pistol through the body's chest, because until then the model's
 * own origin decided everything and nothing could correct it.
 *
 * Numbers rather than a gizmo, *for now*, and that is a staging decision rather
 * than a preference: a gun in a hand is adjusted by looking at it, so the right
 * control is a body drawn holding the thing with a marker on the bone. That is
 * a 3D panel and this is six fields — and six fields that work today beat a
 * panel that is coming, because without them the field is unreachable and the
 * only way to fix a badly-authored weapon is to hand-edit JSON.
 *
 * **The way to look at it is already here**: press Try, and the body is drawn
 * holding it at whatever these say.
 *
 * The steps are chosen from what the numbers mean. A twentieth of a cell moves
 * a gun by about a finger's width; fifteen degrees is the turn somebody
 * actually wants, because a hand is not aligned to an axis and one degree at a
 * time is forty presses to find that out.
 */
function Grip({
  weapon,
  onChange,
}: {
  weapon: NonNullable<PlayerRole['weapon']>
  onChange: (patch: { weapon?: PlayerRole['weapon'] | null }) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  const set = (patch: Partial<NonNullable<PlayerRole['weapon']>>) =>
    onChange({ weapon: { ...weapon, ...patch } })

  const moved =
    weapon.x !== undefined ||
    weapon.y !== undefined ||
    weapon.z !== undefined ||
    weapon.pitch !== undefined ||
    weapon.yaw !== undefined ||
    weapon.roll !== undefined ||
    weapon.scale !== undefined

  return (
    <section className="mt-3 border-t border-neutral-900 pt-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <PanelLabel>{t.inTheHand}</PanelLabel>
        {moved ? (
          <button
            type="button"
            // Back to the model's own origin, which is what every weapon did
            // before this block existed.
            onClick={() =>
              onChange({
                weapon: {
                  blueprint: weapon.blueprint,
                  ...(weapon.socket ? { socket: weapon.socket } : {}),
                },
              })
            }
            className="text-[10px] text-neutral-500 underline-offset-4 hover:text-violet-300 hover:underline"
          >
            {t.reset}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberField
            key={axis}
            label={axis}
            step={0.05}
            value={weapon[axis] ?? 0}
            onChange={(value) => set({ [axis]: value })}
          />
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {(['pitch', 'yaw', 'roll'] as const).map((axis) => (
          <NumberField
            key={axis}
            label={axis}
            step={15}
            value={weapon[axis] ?? 0}
            onChange={(value) => set({ [axis]: value })}
          />
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <NumberField
          label={t.size}
          step={0.1}
          value={weapon.scale ?? 1}
          onChange={(value) => set({ scale: value })}
        />
      </div>

      <Hint className="mt-1">
        {t.handHintLead} <span className="text-neutral-400">Try</span>{' '}
        {t.handHintTail}
      </Hint>
    </section>
  )
}

/**
 * What this entity hangs from, and where on it.
 *
 * The gap this closes was reported as *"I still don't see how to hang children
 * onto nodes in the Scene tab"*, and the report was right: `EntitySpec.parent`
 * and `.socket` have been in the format since composition existed, the Scene
 * tree has always drawn children indented, and **nothing in the editor could
 * set them.** A closed cabinet with a door on it was a document you had to
 * hand-write. The blueprint's own Parts panel had this control; the level's
 * entities did not.
 *
 * Two rules the lists encode rather than explain:
 *
 * **Only named entities can be parents**, because `parent` is a name. An
 * unnamed one is not addressable, so offering it would be offering a choice
 * that cannot be saved - the same rule the Parts panel states for parts.
 * Anything unnamed is left out of the list rather than shown greyed, and the
 * empty case says why.
 *
 * **A socket comes from the parent's blueprint**, so the list is that
 * blueprint's sockets and nothing else. A door hung at `hinge` moves when the
 * cabinet moves and turns where the cabinet says, which is the whole point of
 * choosing a socket over the parent's origin.
 *
 * The edit layer refuses a loop and a parent that does not resolve; this only
 * has to avoid *offering* them. `setEntity` returning null is the backstop for
 * a list that went stale under an open panel - a parent renamed in another
 * panel while this one was showing the old name.
 */
/**
 * The number a save point carries, when the thing selected is one.
 *
 * Shown by what the blueprint *does* - `savesProgress`, the same question the
 * numbering asks - rather than by what it is called, so a `flag` that takes a
 * save point gets the field and a blueprint called `checkpoint` that does not
 * take one is spared it. Asking the question twice, once here and once in
 * `addEntity`, is how a panel and a document come to disagree about what a save
 * point is.
 *
 * It exists because the number is a *default*, and a default nobody can
 * override is a constant with extra steps. A course that doubles back, or a
 * pad added late in the middle of a run, is exactly the level where the count
 * the editor guessed is the wrong one.
 *
 * Whole and at least one: the engine compares orders with `>`, so a fractional
 * one is a number nobody can read off a level, and a zero is a pad that can
 * never be taken - it has to beat the nothing you start with.
 */
function SavePoint({
  document,
  index,
  entity,
  onChange,
}: {
  document: XpDocument
  index: number
  entity: EntitySpec
  onChange: InspectorProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).inspector
  const blueprint = document.blueprints[entity.blueprint]
  if (!blueprint || !savesProgress(blueprint)) return null

  const order = entity.props.order ?? 1

  return (
    <section className="mt-3 border-t border-neutral-900 pt-2">
      <PanelLabel className="mb-1.5">{t.savePoint}</PanelLabel>
      <NumberField
        label={t.order}
        value={order}
        step={1}
        fine={1}
        onChange={(value) =>
          onChange(index, {
            props: { ...entity.props, order: Math.max(1, Math.round(value)) },
          })
        }
      />
      <Hint className="mt-1">{t.savePointBlurb}</Hint>
    </section>
  )
}

/**
 * What a sign says, and how it looks.
 *
 * Shown by the tag rather than by name - `sign`, the same one the `sign`
 * preset writes - which is the same reasoning `SavePoint` gives for reading
 * `savesProgress` instead of a blueprint's name: a level that tags a repurposed
 * wall segment `sign` gets the field too, and a blueprint called `sign` that
 * somebody untagged does not.
 */
function Sign({
  document,
  index,
  entity,
  onChange,
}: {
  document: XpDocument
  index: number
  entity: EntitySpec
  onChange: InspectorProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).inspector
  const blueprint = document.blueprints[entity.blueprint]
  if (!blueprint?.tags.includes('sign')) return null

  return (
    <section className="mt-3 border-t border-neutral-900 pt-2">
      <PanelLabel className="mb-1.5">Sign</PanelLabel>
      <textarea
        value={entity.text ?? ''}
        placeholder={t.whatItSays}
        maxLength={MAX_SIGN_TEXT_LENGTH}
        rows={3}
        onChange={(event) => onChange(index, { text: event.target.value || undefined })}
        className="w-full resize-none rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          type="color"
          title={t.textColour}
          value={`#${(entity.colour ?? 0xffffff).toString(16).padStart(6, '0')}`}
          onChange={(event) =>
            onChange(index, { colour: Number.parseInt(event.target.value.slice(1), 16) })
          }
          className="h-7 w-10 shrink-0 cursor-pointer rounded border border-neutral-800 bg-neutral-900/60"
        />
        <label className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-500">
          <input
            type="checkbox"
            checked={entity.background !== undefined}
            onChange={(event) =>
              onChange(index, { background: event.target.checked ? 0x000000 : undefined })
            }
          />
          {t.plate}
        </label>
        {entity.background !== undefined ? (
          <input
            type="color"
            title={t.plateColour}
            value={`#${entity.background.toString(16).padStart(6, '0')}`}
            onChange={(event) =>
              onChange(index, { background: Number.parseInt(event.target.value.slice(1), 16) })
            }
            className="h-7 w-10 shrink-0 cursor-pointer rounded border border-neutral-800 bg-neutral-900/60"
          />
        ) : null}
      </div>
    </section>
  )
}

function Hangs({
  document,
  index,
  entity,
  onChange,
}: {
  document: XpDocument
  index: number
  entity: EntitySpec
  onChange: InspectorProps['onChange']
}) {
  const t = xpEditorDict(useLocale()).inspector
  const parents = document.entities
    .map((other, i) => ({ other, i }))
    .filter(({ other, i }) => i !== index && !!other.name)
    .map(({ other }) => other.name!)

  const parent = entity.parent ? document.entities.find((o) => o.name === entity.parent) : null
  const blueprint = parent ? document.blueprints[parent.blueprint] : null
  const sockets = blueprint ? Object.keys(blueprint.sockets ?? {}) : []

  return (
    <section className="mt-3 border-t border-neutral-900 pt-2">
      <PanelLabel className="mb-1.5">{t.hangsFrom}</PanelLabel>

      {parents.length === 0 && !entity.parent ? (
        <Hint>{t.nothingToHangFrom}</Hint>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <Select
            value={entity.parent ?? ''}
            options={[
              ['', t.nothingTheLevel],
              ...parents.map((name) => [name, name] as const),
            ]}
            onChange={(name) => onChange(index, { parent: name || undefined })}
          />
          {entity.parent && sockets.length > 0 ? (
            <Select
              value={entity.socket ?? ''}
              options={[
                ['', t.itsOrigin],
                ...sockets.map((name) => [name, name] as const),
              ]}
              onChange={(socket) => onChange(index, { socket: socket || undefined })}
            />
          ) : (
            <Hint className="self-center leading-tight">{entity.parent ? t.noSockets : ''}</Hint>
          )}
        </div>
      )}

      {entity.parent ? (
        <Hint className="mt-1">
          {t.hangsBlurbLead} <span className="text-neutral-400">{t.relativeToIt}</span>{' '}
          {t.hangsBlurbTail}
        </Hint>
      ) : null}
    </section>
  )
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly (readonly [string, string])[]
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
    >
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block font-mono text-[10px] text-neutral-600">{label}</span>
      {children}
    </label>
  )
}

/**
 * A number you can type or nudge.
 *
 * Named `NumberField` rather than `Number` because a component called `Number`
 * shadows the global one, and `Number.parseFloat` two lines down then resolves
 * to a React component. It compiled to something meaningless and the type
 * checker was the only thing that noticed.
 *
 * `step` defaults to the entity grid, so the arrows move by a tenth and typing
 * anything is snapped by the edit layer anyway - the input does not have to be
 * the thing that enforces it, and an input that fights what you type is worse
 * than one that accepts it and settles.
 */
function NumberField({
  label,
  value,
  step = PLACE_STEP,
  fine,
  onChange,
}: {
  label: string
  value: number
  step?: number
  /** What an arrow key moves with Shift held. A fifth of the step by default. */
  fine?: number
  onChange: (value: number) => void
}) {
  const small = fine ?? step / 5

  return (
    <label className="block">
      <span className="mb-0.5 block font-mono text-[10px] text-neutral-600">{label}</span>
      <NumberInput
        step={step}
        value={value}
        // Rounded for *display* only. A field that reads `2.9000000000000004`
        // after three arrow presses is a field somebody stops trusting, and the
        // document keeps whatever the arrows actually put in it.
        format={(shown) => String(Math.round(shown * 100) / 100)}
        commit={onChange}
        /**
         * Shift means finer, which the browser will not do on its own.
         *
         * A number input steps by its `step` on an arrow key and has no second
         * gear - the platform's only modifier here is the *opposite* one, where
         * some browsers make PageUp jump ten steps. So the keys are handled
         * rather than configured: half a cell to place something, a tenth to
         * settle it against a wall, and the two are the same key.
         *
         * Rounded on the way out because 0.1 added to 0.30000000000000004 is
         * what a float does, and a field that reads `2.9000000000000004` after
         * three presses is a field somebody stops trusting.
         */
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          const by = (event.shiftKey ? small : step) * (event.key === 'ArrowUp' ? 1 : -1)
          onChange(Math.round((value + by) * 1000) / 1000)
        }}
        className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
      />
    </label>
  )
}

/**
 * How far one press moves something, and how far Shift moves it.
 *
 * Half a cell, because that is the unit a level is actually built in: the
 * platformer floors are half a cell thick, a wall is four across, and a whole
 * cell was too coarse for everything except the first pass. A tenth with Shift
 * is the settling gear - lining a crate up against a wall - and it is the same
 * tenth `ENTITY_STEP` and the snap chooser already use, so the three agree.
 *
 * This replaced a per-form guess: placements stepped by 1 because they were
 * once on a lattice, entities by a tenth, and the two forms felt like different
 * programs. The lattice went years ago — `parseXp` takes a fractional placement
 * and says so in its own test — so the whole cell was a rule outliving its
 * reason.
 */
const PLACE_STEP = 0.5

/**
 * Two numbers, dragged instead of typed.
 *
 * Asked for as "a touch controller for x and y", and it is the right instinct:
 * a position is a *place*, and typing two numbers to move something eight
 * inches to the left is the editor asking somebody to do arithmetic about a
 * thing they are looking at.
 *
 * **The square drives x and z — the ground — and height gets a bar of its own.**
 * Dragging on a square reads as a top-down view of the floor, which is exactly
 * what x/z is; folding y into the same square would mean up was "further away"
 * on one axis and "higher" on another, which teaches nothing.
 *
 * That argument used to end "height keeps its own field, one arrow key at a
 * time", and the field was not enough: a thing on a shelf is *found* by dragging
 * it up and looking, not by guessing a number and pressing an arrow twenty
 * times. What it ruled out was one control meaning two things, and a separate
 * bar, drawn vertically, beside the square is not that - its orientation says
 * what it does before anybody drags it.
 *
 * Pointer events rather than mouse events, so a pen and a finger work without a
 * second path — the pad is small and a trackpad drag is the common case, but
 * this panel is the one part of the editor somebody might reach on a tablet.
 * `setPointerCapture` is what keeps a drag alive when the pointer leaves the
 * square, which is most drags.
 */
function Pad({
  x,
  y,
  z,
  onChange,
}: {
  x: number
  /** Height, dragged on the bar beside the square. */
  y: number
  z: number
  onChange: (patch: { x?: number; y?: number; z?: number }) => void
}) {
  const t = xpEditorDict(useLocale()).inspector
  const from = useRef<{ x: number; z: number; px: number; py: number } | null>(null)
  const rising = useRef<{ y: number; py: number } | null>(null)

  return (
    <div className="mt-1.5">
      <div className="flex gap-1.5">
      <div
        role="presentation"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          from.current = { x, z, px: event.clientX, py: event.clientY }
        }}
        onPointerMove={(event) => {
          const start = from.current
          if (!start) return
          /**
           * Cells per pixel, and Shift is the same finer gear the fields have.
           *
           * A fortieth of a cell a pixel means the pad's own width is about
           * three cells of travel, which is the distance somebody actually
           * drags something - and a drag that crosses the level in one flick is
           * a control you have to undo rather than use.
           */
          const rate = (event.shiftKey ? 0.005 : 0.025) * 1
          onChange({
            x: Math.round((start.x + (event.clientX - start.px) * rate) * 1000) / 1000,
            z: Math.round((start.z + (event.clientY - start.py) * rate) * 1000) / 1000,
          })
        }}
        onPointerUp={() => {
          from.current = null
        }}
        onPointerCancel={() => {
          from.current = null
        }}
        title={t.dragHint}
        className="relative h-16 min-w-0 flex-1 cursor-move touch-none overflow-hidden rounded border border-neutral-800 bg-neutral-950/60 hover:border-neutral-600"
      >
        {/*
          The two axes, as elements rather than as a background gradient.

          The gradient version wanted its colours written out as `rgb()` inside
          a style object, which is two literals outside the palette for
          decoration nobody asked for. Two hairlines in the panel's own colours
          say the same thing - here is the middle, and these are the two
          directions this drags - and they are the palette rather than a guess
          at it.
        */}
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-violet-500/25" />
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-violet-500/25" />
      </div>

      {/*
        Height, on a bar.

        Narrow and tall rather than square, because the shape is the label: a
        control you can only drag one way is one nobody has to be told which way
        to drag. Up is higher, which is the only mapping a vertical control can
        honestly have - and is the opposite sign from the square's vertical
        axis, where down is *further away*. That inversion is exactly why these
        are two controls and not one.
      */}
      <div
        role="presentation"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          rising.current = { y, py: event.clientY }
        }}
        onPointerMove={(event) => {
          const start = rising.current
          if (!start) return
          // The same two gears the square and the fields use, so the whole panel
          // has one idea of what Shift means.
          const rate = event.shiftKey ? 0.005 : 0.025
          onChange({
            // Negated: pointer y grows downwards and height does not.
            y: Math.round((start.y - (event.clientY - start.py) * rate) * 1000) / 1000,
          })
        }}
        onPointerUp={() => {
          rising.current = null
        }}
        onPointerCancel={() => {
          rising.current = null
        }}
        title={t.dragHeightHint}
        className="relative h-16 w-7 shrink-0 cursor-ns-resize touch-none overflow-hidden rounded border border-neutral-800 bg-neutral-950/60 hover:border-neutral-600"
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-violet-500/25" />
        {/* Which way is up, said once rather than in the tooltip only. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0.5 text-center font-mono text-[8px] leading-none text-neutral-700"
        >
          y
        </span>
      </div>
      </div>

      {/* Under both, because it is about the pair. */}
      <Hint className="mt-0.5 leading-tight">{t.dragFooter}</Hint>
    </div>
  )
}

/**
 * What the selected thing is, as fields.
 *
 * Split out of `Inspector`, which was doing two jobs in one scroll: the lists
 * you *navigate* by, and the fields of whatever you landed on. That is fine
 * while a level has six things in it and miserable once it has sixty - the form
 * you came to edit sits below four lists, so every selection is a scroll, and
 * the lists move under you as the document grows.
 *
 * Two panels means both can be on screen at once, which is what somebody
 * nudging a crate into place actually wants: the tree on the left to pick with,
 * the numbers to the side to type into.
 *
 * It renders nothing at all with no selection rather than an empty frame of
 * labels. A form for nothing is a form somebody tries to type into.
 */
export function Properties({
  document,
  selected,
  onChange,
  onPlacement,
  onRemove,
  onRemovePlacement,
  onMark,
  onRemoveMark,
  onPlayer,
  onSpawn,
  pivot,
  onPivot,
}: Omit<InspectorProps, 'onSelect' | 'onAddMark' | 'onBlueprintFrom'>) {
  const t = xpEditorDict(useLocale()).inspector
  const entity =
    selected?.kind === 'entity' ? (document.entities[selected.index] ?? null) : null
  const piece =
    selected?.kind === 'placement'
      ? (document.world.placements[selected.index] ?? null)
      : null
  const mark =
    selected?.kind === 'mark' ? (document.world.marks[selected.index] ?? null) : null

  const player = selected?.kind === 'player'
  /**
   * Which row of whichever list, for the three that are in one.
   *
   * Read once rather than off `selected` at every field: the player has no
   * index, and narrowing a union by "the entity lookup came back non-null" is
   * something a reader can see and the compiler cannot.
   */
  const index = selected && selected.kind !== 'player' ? selected.index : -1

  if (!selected || (!entity && !piece && !mark && !player)) {
    return (
      <Hint>{t.nothingSelected}</Hint>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {player ? <PlayerForm document={document} onSpawn={onSpawn} onPlayer={onPlayer} /> : null}

      {mark && selected ? (
        <MarkForm index={index} mark={mark} onChange={onMark} onRemove={onRemoveMark} />
      ) : null}

      {piece && selected ? (
        <PlacementForm
          index={index}
          piece={piece}
          onChange={onPlacement}
          onRemove={onRemovePlacement}
        />
      ) : null}

      {entity && selected ? (
        <section>
          <div className="mb-1.5 flex items-baseline justify-between">
            <PanelLabel>{t.heading}</PanelLabel>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="text-[10px] text-neutral-500 underline-offset-4 hover:text-red-400 hover:underline"
            >
              {t.delete}
            </button>
          </div>

          <Field label={t.name}>
            <input
              value={entity.name ?? ''}
              placeholder={t.unnamed}
              onChange={(event) =>
                onChange(index, { name: event.target.value.trim() || undefined })
              }
              className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
            />
          </Field>

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <NumberField
                key={axis}
                label={axis}
                value={entity[axis]}
                onChange={(value) => onChange(index, { [axis]: value })}
              />
            ))}
          </div>

          <Pad
            x={entity.x}
            y={entity.y}
            z={entity.z}
            onChange={(patch) => onChange(index, patch)}
          />

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <NumberField
              label={t.turn}
              value={entity.rotation}
              step={15}
              onChange={(value) => onChange(index, { rotation: value })}
            />
            <NumberField
              label={t.scale}
              value={entity.scale}
              onChange={(value) => onChange(index, { scale: value })}
            />
          </div>

          <Shape of={entity} onChange={(patch) => onChange(index, patch)} />

          <SavePoint document={document} index={index} entity={entity} onChange={onChange} />

          <Sign document={document} index={index} entity={entity} onChange={onChange} />

          <Hangs
            document={document}
            index={index}
            entity={entity}
            onChange={onChange}
          />
        </section>
      ) : null}
      <section>
        <PanelLabel className="mb-1.5">{t.turnAround}</PanelLabel>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ['centre', t.pivots.centre],
              ['origin', t.pivots.origin],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onPivot(id)}
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                pivot === id
                  ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Hint className="mt-1">
          {pivot === 'centre'
            ? t.spinsWhereItStands
            : t.spinsAboutOrigin}
        </Hint>
      </section>
    </div>
  )
}
