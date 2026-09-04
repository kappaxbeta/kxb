'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { attempt } from '@/app/components/connection'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import { ReportControl } from '@/app/t/[slug]/thingiverse/report-control'
import { AVATAR_CLIPS } from '@/domain/lounge/avatars'
import { thumbnailFor } from '@/domain/thingiverse/models'
import {
  renameBlueprint,
  reshapeBlueprint,
  retireBlueprint,
  setBlueprintVisibility,
} from '@/domain/thingiverse/actions'
import {
  BODY_LIMITS,
  type BlueprintSpec,
  blueprintProblems,
  freshUse,
  MAX_BLUEPRINT_ACTIONS,
  MAX_BLUEPRINT_NAME,
  MAX_SEAT_OFFSET,
  MAX_SEATS,
  MAX_THING_SCALE,
  MAX_USE_INPUTS,
  MIN_THING_SCALE,
  needsValue,
  type ThingAction,
  THING_DEEDS,
  THING_WHENS,
  type UseSpec,
} from '@/domain/thingiverse/blueprint'
import type { BlueprintView } from '@/domain/thingiverse/queries'

/**
 * The shelf, with an editor in every row.
 *
 * ---------------------------------------------------------------------------
 * Why the whole spec is saved at once
 * ---------------------------------------------------------------------------
 * Nine fields and one Save, rather than a field that writes as you leave it.
 * The log agrees: `BlueprintReshaped` carries the entire spec, because turning
 * `body` on and `blocking` off at the same moment is one decision - "make this
 * a ball" - not two facts. Saving per field would put half a decision in the
 * log and, worse, would let somebody leave a thing in a state they never meant
 * to make.
 *
 * The name is the exception here as it is there: it has its own event, so it
 * gets its own save. Renaming something is not editing it.
 *
 * `blueprintProblems` runs *as you type* and the same function runs in the
 * decider. That is the point of it returning a list of sentences instead of
 * throwing at the first one: a panel with three bad numbers in it should mark
 * three, and a form that made you discover them one round trip at a time is the
 * thing this shape exists to avoid.
 */
export function Shelf({
  slug,
  shelf,
  clips = [],
  t,
  /**
   * Whether to draw its own heading.
   *
   * False inside the hub, which already writes the open door's name in a row
   * with the button that makes a new one - two headings a line apart, one of
   * them "Blueprints" and the other "The shelf", is the page saying the same
   * thing twice in two vocabularies.
   */
  headed = true,
}: {
  slug: string
  shelf: BlueprintView[]
  /**
   * What this space has animated, by name, for the seat clips.
   *
   * Defaulted to none rather than required, because two of the three surfaces
   * that draw a shelf have no reason to load them - and a row whose clip picker
   * offers only the body's own four is a row that still works. See `ClipPick`
   * in the composer, which makes the same argument at length about why this is
   * a list rather than a text field.
   */
  clips?: readonly string[]
  t: WorkspaceDict['thingiverse']
  headed?: boolean
}) {
  const mine = shelf.filter((entry) => entry.mine)
  const shared = shelf.filter((entry) => !entry.mine)

  return (
    <section className="space-y-4">
      {headed && (
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {t.shelfTab}
        </h2>
      )}

      {shelf.length === 0 && <p className="text-sm text-ink-muted">{t.emptyShelf}</p>}

      {mine.length > 0 && (
        <ul className="space-y-3">
          {mine.map((entry) => (
            <li key={entry.id}>
              <Row slug={slug} entry={entry} clips={clips} t={t} />
            </li>
          ))}
        </ul>
      )}

      {/*
        The space's, read-only.

        Shown rather than hidden, and not editable: what somebody else made is
        worth knowing about - it is what you can summon without making your own
        - and the decider would refuse an edit anyway. A form whose Save is
        always refused is a worse way of saying "not yours" than not drawing one.
      */}
      {shared.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase tracking-[0.14em] text-ink-muted">{t.shared}</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shared.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line/60 bg-surface p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailFor(entry.spec.model)}
                  alt=""
                  loading="lazy"
                  className="size-10 rounded bg-surface-raised object-contain"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{entry.name}</span>
                {/*
                  Only on somebody else's. Your own is a thing you can simply
                  retire, and a report button on it would be a way of asking a
                  moderator to do something you can do yourself.
                */}
                <ReportControl
                  slug={slug}
                  kind={entry.spec.vehicle ? 'vehicle' : 'blueprint'}
                  targetId={entry.id}
                  title={entry.name}
                  labels={t}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Row({
  slug,
  entry,
  clips,
  t,
}: {
  slug: string
  entry: BlueprintView
  clips: readonly string[]
  t: WorkspaceDict['thingiverse']
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(entry.name)
  const [spec, setSpec] = useState<BlueprintSpec>(entry.spec)
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  /*
   * The spec's problems, and the name's.
   *
   * The name is not part of the spec and so is not in `blueprintProblems` - it
   * has its own event and its own Save for exactly that reason. But it has a
   * bound, and without this line the only thing that knew was the decider: you
   * typed a fiftieth character, pressed a Save that looked ready, and got a
   * refusal back from the server for a rule the form could have told you about
   * while you were still typing. Everything else in this panel marks itself as
   * you go.
   */
  const problems = [
    ...blueprintProblems(spec),
    ...(name.trim() === '' ? [t.nameNeeded] : []),
    ...(name.length > MAX_BLUEPRINT_NAME ? [fill(t.nameTooLong, { n: String(MAX_BLUEPRINT_NAME) })] : []),
  ]
  const falls = spec.body !== null

  const change = (patch: Partial<BlueprintSpec>) => setSpec((current) => ({ ...current, ...patch }))

  const save = () =>
    start(async () => {
      setNote(null)

      // The name first, and only when it changed: two commands against one
      // stream, and the second would be refused for nothing if the first were
      // sent every time somebody pressed Save without touching the field.
      if (name.trim() !== entry.name) {
        const renamed = await attempt(() => renameBlueprint(slug, { id: entry.id, name }))
        if (!renamed.ok) {
          setNote(renamed.error ?? 'Refused')
          return
        }
      }

      const result = await attempt(() => reshapeBlueprint(slug, { id: entry.id, spec }))
      if (!result.ok) {
        setNote(result.error ?? 'Refused')
        return
      }

      setNote(t.saved)
      router.refresh()
    })

  return (
    <div className="rounded-xl border border-line/60 bg-surface p-3">
      {/*
        Wrapping, because five things do not fit across a phone.

        Thumbnail, name, badge, bench and the fold add up to 340px at their
        narrowest against 343px of column - which held on a 375px phone by three
        pixels and did not on anything narrower. The name takes a `basis` wide
        enough to be a name rather than an ellipsis, and the three controls move
        down as one group rather than breaking up between two lines.
      */}
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailFor(spec.model)}
          alt=""
          loading="lazy"
          className="size-12 rounded-lg bg-surface-raised object-contain"
        />
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate text-sm font-medium text-ink">{entry.name}</p>
          <p className="truncate font-mono text-[10px] text-ink-muted">{spec.model}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-line/60 px-2 py-0.5 text-[10px] text-ink-muted">
            {entry.visibility === 'public' ? t.shared : t.mine}
          </span>
          {/*
            The bench, and the panel, side by side.

            Two doors onto one blueprint, and they are not redundant: this row's
            panel is nine fields you set while scanning a list - how bouncy, what
            it is called, does it block - and the bench is a viewport you orbit to
            decide where the lamp goes. Somebody making a ball never needs the
            bench; somebody building a market stall cannot use anything else.

            The link first, because it is the one that goes somewhere, and a
            control that navigates should not be tucked behind the one that
            expands in place.
          */}
          <Link
            href={`/t/${slug}/thingiverse/blueprint/${entry.id}`}
            className="rounded-lg border border-line/60 px-2 py-1 text-xs text-ink-muted transition hover:border-accent/50 hover:text-ink"
          >
            {t.composer.heading}
          </Link>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            className="rounded-lg border border-line/60 px-2 py-1 text-xs text-ink transition hover:bg-surface-raised"
          >
            {open ? '−' : '+'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-4 border-t border-line/60 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.name}>
              <input
                value={name}
                maxLength={MAX_BLUEPRINT_NAME}
                onChange={(event) => setName(event.target.value)}
                className={INPUT}
              />
            </Field>

            <Field label={t.size}>
              <input
                type="number"
                step="0.1"
                min={MIN_THING_SCALE}
                max={MAX_THING_SCALE}
                value={spec.scale}
                onChange={(event) => change({ scale: Number(event.target.value) })}
                className={INPUT}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Check
              label={t.blocks}
              hint={t.blocksHint}
              on={spec.blocking}
              onChange={(on) => change({ blocking: on })}
            />
            <Check
              label={t.falls}
              hint={t.fallsHint}
              on={falls}
              /*
                Null and `{}` are different states and both are reachable here on
                purpose - see `BlueprintSpec.body`. Null is a fountain, which
                stands forever; `{}` is a crate, which falls and stops. Reading
                the empty object as "no body" would make every dropped thing
                hover.
              */
              onChange={(on) => change({ body: on ? {} : null })}
            />
          </div>

          {falls && (
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['gravity', t.gravity],
                  ['bounce', t.bounce],
                  ['mass', t.mass],
                ] as const
              ).map(([field, label]) => (
                <Field key={field} label={label}>
                  <input
                    type="number"
                    step="0.1"
                    min={BODY_LIMITS[field].min}
                    max={BODY_LIMITS[field].max}
                    value={spec.body?.[field] ?? ''}
                    onChange={(event) =>
                      change({
                        body: {
                          ...spec.body,
                          // Blank goes back to absent rather than to zero: a
                          // field left empty means "whatever the simulation's
                          // default is", and zero gravity is a decision.
                          [field]:
                            event.target.value === '' ? undefined : Number(event.target.value),
                        },
                      })
                    }
                    className={INPUT}
                  />
                </Field>
              ))}
            </div>
          )}

          <Field label={t.clip} hint={t.clipHint}>
            <input
              value={spec.clip ?? ''}
              onChange={(event) => change({ clip: event.target.value.trim() || null })}
              className={INPUT}
            />
          </Field>

          <Field label={t.tags} hint={t.tagsHint}>
            <input
              value={spec.tags.join(', ')}
              onChange={(event) =>
                change({
                  tags: event.target.value
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
              className={INPUT}
            />
          </Field>

          {/*
            Getting into it.

            A whole section behind one checkbox, because a thing you can sit in
            is a different *kind* of thing from a crate and the six fields only
            mean anything together. Null and a filled-in block are the two
            states; there is no half-usable thing.
          */}
          <fieldset className="space-y-3 rounded-lg border border-line/60 p-3">
            <legend className="px-1">
              <Check
                label={t.use}
                hint={t.useHint}
                on={spec.use !== null}
                onChange={(on) => change({ use: on ? freshUse() : null })}
              />
            </legend>

            {spec.use && (
              <UseFields
                use={spec.use}
                clips={clips}
                t={t}
                onChange={(next) => change({ use: next })}
              />
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-ink">{t.actions}</legend>
            <p className="text-[11px] text-ink-muted">{t.actionsHint}</p>

            {spec.actions.map((action, index) => (
              <ActionRow
                key={index}
                action={action}
                t={t}
                onChange={(next) =>
                  change({
                    actions: spec.actions.map((one, at) => (at === index ? next : one)),
                  })
                }
                onRemove={() =>
                  change({ actions: spec.actions.filter((_, at) => at !== index) })
                }
              />
            ))}

            {spec.actions.length < MAX_BLUEPRINT_ACTIONS && (
              <button
                type="button"
                onClick={() =>
                  change({
                    actions: [...spec.actions, { when: 'touch', deed: 'spin' } as ThingAction],
                  })
                }
                className={BUTTON}
              >
                {t.addAction}
              </button>
            )}
          </fieldset>

          {problems.length > 0 && (
            <ul className="space-y-1 text-[11px] text-red-400">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending || problems.length > 0}
              onClick={save}
              className="rounded-lg border border-emerald-400/50 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-40"
            >
              {t.save}
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await attempt(() =>
                    setBlueprintVisibility(slug, {
                      id: entry.id,
                      visibility: entry.visibility === 'public' ? 'private' : 'public',
                    }),
                  )
                  router.refresh()
                })
              }
              className={BUTTON}
            >
              {entry.visibility === 'public' ? t.unshare : t.share}
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await attempt(() => retireBlueprint(slug, entry.id))
                  router.refresh()
                })
              }
              className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              {t.retire}
            </button>

            {note && <span className="text-[11px] text-ink-muted">{note}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The `use` block's fields.
 *
 * Its own component rather than another twenty lines in `Row`, because it is
 * the only part of the editor that is *conditional* - and a form that grows six
 * fields in the middle of itself is much easier to read when the growth is one
 * element rather than six guards.
 */
function UseFields({
  use,
  clips,
  t,
  onChange,
}: {
  use: UseSpec
  clips: readonly string[]
  t: WorkspaceDict['thingiverse']
  onChange: (next: UseSpec) => void
}) {
  const set = (patch: Partial<UseSpec>) => onChange({ ...use, ...patch })

  /**
   * Every clip a body here can play: the pack's own four, plus this space's.
   *
   * Deduped and in that order, exactly as the lounge builds it for `/clip` -
   * a space that animates one called `dance` has one name with one answer.
   */
  const bodyClips = [...new Set([...Object.values(AVATAR_CLIPS), ...clips])]

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ['enter', t.enterClip],
            ['loop', t.loopClip],
            ['leave', t.leaveClip],
          ] as const
        ).map(([field, label]) => (
          <Field key={field} label={label}>
            {/*
              A list, not a text box. A clip name is looked up on the body when
              it plays, and a name that finds nothing plays nothing - which on a
              body that has not moved yet is indistinguishable from the field
              working. There is no error to show, so the wrong answer has to be
              unreachable instead. A name the space has since deleted stays in
              the list as its own option rather than quietly becoming "none".

              Blank goes back to null rather than to an empty string: null is
              "no clip" and is the only spelling of it, which is what stops a
              round trip growing a field nobody wrote.
            */}
            <select
              value={use[field] ?? ''}
              onChange={(event) => set({ [field]: event.target.value || null })}
              className={INPUT}
            >
              <option value="">{t.noClip}</option>
              {(use[field] && !bodyClips.includes(use[field]!)
                ? [use[field]!, ...bodyClips]
                : bodyClips
              ).map((clip) => (
                <option key={clip} value={clip}>
                  {clip}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>

      {/*
        The seats.

        A list because most things that can be got into hold more than one
        person - a bench seats three, a car seats four - and one seat with
        "somebody is in it" would make every one of them a queue. Which seat
        somebody gets is decided in the world, not here: the nearest free one
        to where they were standing. See `freeSeat`.
      */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink">{t.seats}</p>
        <p className="text-[11px] text-ink-muted">{t.seatHint}</p>

        {use.seats.map((seat, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <input
                key={axis}
                type="number"
                step="0.1"
                min={-MAX_SEAT_OFFSET}
                max={MAX_SEAT_OFFSET}
                aria-label={`${index + 1} ${axis}`}
                value={seat[axis]}
                onChange={(event) =>
                  set({
                    seats: use.seats.map((one, at) =>
                      at === index ? { ...one, [axis]: Number(event.target.value) } : one,
                    ),
                  })
                }
                className={`${INPUT} w-20`}
              />
            ))}
            {/*
              The last seat has no Remove: a thing you can get into and then
              stand nowhere is a state with no sensible drawing, and the way to
              say "you cannot get into this" is the checkbox above.
            */}
            {use.seats.length > 1 && (
              <button
                type="button"
                onClick={() => set({ seats: use.seats.filter((_, at) => at !== index) })}
                className={BUTTON}
              >
                {t.remove}
              </button>
            )}
          </div>
        ))}

        {use.seats.length < MAX_SEATS && (
          <button
            type="button"
            onClick={() => set({ seats: [...use.seats, { x: 0, y: 0, z: 0 }] })}
            className={BUTTON}
          >
            {t.addSeat}
          </button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink">{t.inputs}</p>
        <p className="text-[11px] text-ink-muted">{t.inputsHint}</p>

        {use.inputs.map((input, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={t.key}
              value={input.key}
              maxLength={1}
              onChange={(event) =>
                set({
                  inputs: use.inputs.map((one, at) =>
                    // Upper cased on the way in, so `q` and `Q` are the same
                    // key - a thing bound to both would have a second binding
                    // that never fires.
                    at === index ? { ...one, key: event.target.value.toUpperCase() } : one,
                  ),
                })
              }
              className={`${INPUT} w-12 text-center uppercase`}
            />
            <input
              aria-label={t.clip}
              value={input.clip}
              onChange={(event) =>
                set({
                  inputs: use.inputs.map((one, at) =>
                    at === index ? { ...one, clip: event.target.value } : one,
                  ),
                })
              }
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => set({ inputs: use.inputs.filter((_, at) => at !== index) })}
              className={BUTTON}
            >
              {t.remove}
            </button>
          </div>
        ))}

        {use.inputs.length < MAX_USE_INPUTS && (
          <button
            type="button"
            onClick={() => set({ inputs: [...use.inputs, { key: '', clip: '' }] })}
            className={BUTTON}
          >
            {t.addInput}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * One thing it does, as a sentence.
 *
 * Two dropdowns and a box, read left to right: *when somebody walks into it*,
 * *play a clip*, `wave`. The words come out of the dictionary rather than the
 * union, so the sentence reads as a sentence in every language rather than as
 * `touch → play`.
 */
function ActionRow({
  action,
  t,
  onChange,
  onRemove,
}: {
  action: ThingAction
  t: WorkspaceDict['thingiverse']
  onChange: (next: ThingAction) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={action.when}
        onChange={(event) => onChange({ ...action, when: event.target.value as ThingAction['when'] })}
        className={INPUT}
      >
        {THING_WHENS.map((when) => (
          <option key={when} value={when}>
            {t.when[when] ?? when}
          </option>
        ))}
      </select>

      <select
        value={action.deed}
        onChange={(event) => onChange({ ...action, deed: event.target.value as ThingAction['deed'] })}
        className={INPUT}
      >
        {THING_DEEDS.map((deed) => (
          <option key={deed} value={deed}>
            {t.deed[deed] ?? deed}
          </option>
        ))}
      </select>

      {needsValue(action.deed) && (
        <input
          value={action.value ?? ''}
          onChange={(event) => onChange({ ...action, value: event.target.value })}
          className={INPUT}
        />
      )}

      <button type="button" onClick={onRemove} className={BUTTON}>
        {t.remove}
      </button>
    </div>
  )
}

/**
 * `w-full`, because the label above it is a block and the box was not.
 *
 * An input's default width is a font-relative twenty characters, which happens
 * to fit beside its own label on a two-column desktop grid and does not on a
 * phone: the pair sat on one line and the box was squeezed to the few pixels the
 * word left it. Nine fields wide enough to type a number into is the whole point
 * of the panel. See `Field`.
 */
const INPUT =
  'w-full rounded-lg border border-line/60 bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-muted'

const BUTTON =
  'rounded-lg border border-line/60 px-2 py-1 text-xs text-ink transition hover:bg-surface-raised disabled:opacity-40'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      {/*
        A block, so `space-y-1` has something to space.

        The wrapper always said `space-y-1` and it never did anything: the
        selector is `> * + *` and both children were inline, so the label and the
        box shared a line with no gap between them and the panel read as a form
        somebody had forgotten to lay out.
      */}
      <span className="block text-xs font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
    </label>
  )
}

function Check({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  hint: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span>
        <span className="block text-xs font-medium text-ink">{label}</span>
        <span className="block text-[11px] text-ink-muted">{hint}</span>
      </span>
    </label>
  )
}
