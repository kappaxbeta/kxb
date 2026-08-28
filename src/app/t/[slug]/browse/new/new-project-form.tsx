'use client'

import { useActionState, useDeferredValue, useId, useState } from 'react'
import { FINISHES, type Finish } from '@kxb/xp'
import type { ShelfItem } from '@/app/components/cartridge/cartridge'
import { CartridgeShelf } from '@/app/components/cartridge/shelf'
import { createXp } from '@/domain/xps/actions'
import { XP_NAME_MAX } from '@/domain/xps/events'
import { browseDict } from '@/app/i18n/browse'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'

/** A template, as the picker needs it. The document is built server-side. */
export interface TemplateChoice {
  id: string
  name: string
  blurb: string
}

/**
 * The choice that is not a starter: an empty room.
 *
 * Its id is the empty string, which is what the action reads as "nothing to
 * copy from". The words come from the dictionary at render time - see `EMPTY`
 * in the component - so this holds only the id.
 */
const EMPTY_ID = ''

/**
 * Twelve hues, evenly spaced - the same set the editor's Mode panel offers.
 *
 * Even rather than perceptual: what matters is that twelve are distinguishable
 * from each other at swatch size, and a wheel divided by twelve manages that
 * where a hand-picked set drifts every time somebody adds one.
 */
const SWATCHES = Array.from({ length: 12 }, (_, index) => index * 30)

/**
 * The one form.
 *
 * `useActionState` rather than a bare `<form action>` because the action can
 * refuse for four reasons a person can act on — the wrong tier, a space that
 * cannot be written to, a name that is empty, a name that is too long — and a
 * server action that returns a reason and has nowhere to put it is a button
 * that appears to do nothing.
 *
 * On success the action redirects, so the only thing this ever renders is a
 * refusal. That asymmetry is why there is no success state here.
 *
 * ---------------------------------------------------------------------------
 * Radios, and a default that is already chosen
 * ---------------------------------------------------------------------------
 * Native `<input type="radio">` rather than buttons holding React state: the
 * choice is one of a fixed few, it has to arrive in the `FormData` this action
 * already reads, and arrow keys moving between them is behaviour nobody has to
 * write. The label is the card, so the whole card is the hit area.
 *
 * Empty is checked on arrival, which means the picker can be ignored entirely
 * and the screen behaves exactly as it did when a name was the only question.
 * An unchecked group would make the fastest path — type a name, press the
 * button — end in a refusal about a question the person did not ask for.
 *
 * ---------------------------------------------------------------------------
 * A cartridge you can see before the level exists
 * ---------------------------------------------------------------------------
 * The shell and its colour are the two questions this screen can answer that
 * the editor cannot answer as well, because this is the only moment somebody is
 * thinking about the *object* rather than the level inside it. So they are
 * asked here, and the answer is drawn rather than described: the name goes on
 * the plate as it is typed, and the finish and the colour are the thing in
 * front of you rather than nine words and twelve squares.
 *
 * The choice has nowhere to live until the editor writes a first version -
 * `createXp` mints a project before there is a document - so it rides on
 * `XpCreated` beside `template` and is stamped onto the starter document by
 * the editor's own render. See `startedFrom`.
 *
 * `useDeferredValue` on the name rather than a timer. Every keystroke repaints
 * a canvas texture and uploads it to the GPU, which is far too much work for
 * the keypress it is attached to - and deferring is exactly the tool for
 * "render this, but not at the expense of the input". A debounce would also
 * work and would need a number nobody can defend.
 */
export function NewProjectForm({
  slug,
  templates,
}: {
  slug: string
  templates: TemplateChoice[]
}) {
  const refusal = useRefusal()
  const t = browseDict(useLocale()).create
  /** The empty choice, worded here so both languages read the same shape. */
  const EMPTY: TemplateChoice = {
    id: EMPTY_ID,
    name: t.emptyRoom,
    blurb: t.emptyRoomBlurb,
  }
  /*
    Two pieces of state and two hidden inputs.

    Radios would have been the shape to match the template picker, and are the
    wrong one here: the preview needs the values *in React* to draw with, so
    holding them in state and posting them as hidden fields is one source of
    truth rather than a controlled radio group shadowing itself.

    `null` is a real value in both - it is `auto`, which means the shelf
    decides - and it posts as an empty string, which `createXp` reads as the
    absence of a choice.
  */
  const [finish, setFinish] = useState<Finish | null>(null)
  const [hue, setHue] = useState<number | null>(null)
  const [name, setName] = useState('')

  /** What the cartridge is called. Behind the input on purpose - see above. */
  const shown = useDeferredValue(name)

  const preview: ShelfItem = {
    // A stable reference so `hueFor` gives the same colour for the whole visit
    // while `auto` is selected. Anything derived from the name would change
    // colour as somebody typed, which reads as a fault rather than a feature.
    ref: 'new-project',
    name: shown.trim() || t.namePlaceholder,
    // Nothing has been photographed yet, and the empty well is exactly what a
    // level with no shot looks like everywhere else.
    cover: null,
    ...(finish ? { finish } : {}),
    ...(hue === null ? {} : { hue }),
  }

  const [state, action, pending] = useActionState(
    async (_previous: { ok: true } | { ok: false; error: string } | null, formData: FormData) =>
      createXp(slug, formData),
    null,
  )
  const blurbs = useId()

  return (
    <form action={action} className="mt-8">
      <label htmlFor="name" className="block text-sm font-medium">
        {t.name}
      </label>
      <input
        id="name"
        name="name"
        required
        maxLength={XP_NAME_MAX}
        autoFocus
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t.namePlaceholder}
        className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-ink-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <p className="mt-2 text-xs text-ink-muted">
        {t.nameNote}
      </p>

      <fieldset className="mt-8">
        <legend className="text-sm font-medium">{t.startAs}</legend>
        <p className="mt-1 text-xs text-ink-muted">
          {t.startAsNote}
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[EMPTY, ...templates].map((choice, index) => (
            <label
              key={choice.id || 'empty'}
              className="group flex cursor-pointer flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-3 transition hover:border-ink-muted has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/30"
            >
              <span className="flex items-center gap-2">
                {/*
                  Named and described explicitly rather than by the label around
                  it. A screen reader was reading these out as "room", "race",
                  "match" — the `value`, because a visually hidden input wrapped
                  in two spans does not reliably take its name from the text
                  beside it. The blurb is the description rather than part of the
                  name, so the list can be moved through without hearing two
                  sentences per option.
                */}
                <input
                  type="radio"
                  name="template"
                  value={choice.id}
                  defaultChecked={index === 0}
                  aria-label={choice.name}
                  aria-describedby={`${blurbs}-${choice.id || 'empty'}`}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border border-line transition group-has-[:checked]:border-accent group-has-[:checked]:bg-accent"
                />
                <span className="text-sm">{choice.name}</span>
              </span>
              <span
                id={`${blurbs}-${choice.id || 'empty'}`}
                className="pl-5 text-xs leading-relaxed text-ink-muted"
              >
                {choice.blurb}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="text-sm font-medium">{t.look}</legend>
        <p className="mt-1 text-xs text-ink-muted">{t.lookNote}</p>

        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* The cartridge, at the size one is drawn on a shelf. One across,
              because a preview of a single thing is not a shelf - see the
              `columns` override's own note. */}
          <div className="w-40 shrink-0">
            <CartridgeShelf
              items={[preview]}
              columns={1}
              onOpen={() => {}}
              label={preview.name}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {FINISHES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFinish(finish === option ? null : option)}
                  aria-pressed={finish === option}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                    finish === option
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line text-ink-muted hover:border-accent/60'
                  }`}
                >
                  {t.finishes[option]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHue(null)}
                aria-pressed={hue === null}
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                  hue === null
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-muted hover:border-accent/60'
                }`}
              >
                {t.colourAuto}
              </button>

              {SWATCHES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setHue(hue === option ? null : option)}
                  aria-pressed={hue === option}
                  aria-label={`${t.look}: ${option}`}
                  // Drawn in the colour it sets, at the saturation and lightness
                  // a plastic shell is tinted with, so the swatch is the thing
                  // rather than a legend for it.
                  style={{ backgroundColor: `hsl(${option} 55% 45%)` }}
                  className={`size-6 rounded border transition-transform ${
                    hue === option
                      ? 'scale-110 border-accent'
                      : 'border-line hover:scale-105 hover:border-ink-muted'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Posted rather than controlled inputs, so the action reads them out
            of the same `FormData` it already reads the name and template from.
            Empty is `auto` in both. */}
        <input type="hidden" name="finish" value={finish ?? ''} />
        <input type="hidden" name="hue" value={hue === null ? '' : String(hue)} />
      </fieldset>

      {state && !state.ok && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-ink"
        >
          {refusal(state.error)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? t.creating : t.create}
      </button>
    </form>
  )
}
