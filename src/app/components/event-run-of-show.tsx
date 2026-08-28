'use client'

import Image from 'next/image'
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { BlockDrift } from '@/app/components/block-drift'
import { type EventsDict, eventsDict } from '@/app/i18n/events'
import { fill } from '@/app/i18n/landing'
import type { Locale } from '@/app/i18n/locales'
import { sendEventEnquiry } from '@/domain/contact/actions'
import { EMPTY_EVENT_DRAFT, EVENT_IDLE, EVENT_TYPES } from '@/domain/contact/message'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The three cues on the sheet that belong to the organiser.
 *
 * A sibling of `<ContactForm>` rather than a mode of it. They share a table and
 * a server action shape, and almost nothing else that matters to the person
 * filling one in: this one asks three questions that form does not, does not
 * ask for a subject, and is answered with a price rather than a fix.
 *
 * ---------------------------------------------------------------------------
 * Why a run of show rather than a stepped form
 * ---------------------------------------------------------------------------
 * The page this sits in is a cue sheet for the whole event - eight cues, from
 * the enquiry to the room still standing the week after. Three of them are the
 * organiser's and five are ours, and that split is the argument the page makes:
 * you answer three questions, we do the rest. A progress bar says "you are 40%
 * through a form"; a cue sheet with an owner column says who is holding the
 * next thing, which is the actual question somebody about to spend a few
 * hundred euro is asking.
 *
 * So this component owns cues 01-03 and nothing else. Cues 04-08 are static
 * content on the page, deliberately outside the bundle: they are read, never
 * filled, and a visitor whose JavaScript never arrives should still get the
 * whole show.
 *
 * ---------------------------------------------------------------------------
 * Why the wizard is only a way of *looking* at one form
 * ---------------------------------------------------------------------------
 * Still a single plain `<form action={...}>` with every field in it, for the
 * reason the flat version was: it submits before React has hydrated, and an
 * enquiry worth a few hundred euro should not be lost to a slow bundle. So the
 * cues are not three forms and not three routes. They are one form whose
 * fieldsets take turns being visible, and the taking of turns is the only part
 * that needs JavaScript.
 *
 * `hydrated` is therefore false until the bundle lands, and in that state every
 * fieldset renders while the sheet chrome does not - which is exactly the form
 * that shipped before this one. A visitor whose bundle never arrives gets a long
 * form that works; a visitor whose bundle does arrive gets it folded into three
 * moves on the next frame.
 *
 * ---------------------------------------------------------------------------
 * Why each cue is validated on the way out
 * ---------------------------------------------------------------------------
 * Not politeness. A `required` field that is both invalid and hidden makes the
 * browser refuse the submit outright - it tries to focus the thing it wants
 * fixed, cannot, and reports "an invalid form control is not focusable" to the
 * console instead of to the person. Nothing submits and nothing explains why.
 *
 * Running `reportValidity()` on the current cue before advancing is what makes
 * that state unreachable: you cannot arrive at the last cue with an invalid
 * field behind you, so by the time the submit button exists, every hidden field
 * is already valid and the browser never needs to focus one. It is the same
 * check the browser would run itself, so the two can never disagree.
 */

const FIELD =
  'w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm outline-none transition focus:border-accent'

const LABEL = 'block text-xs font-medium text-ink-muted'

/**
 * The three moves, and what each is for.
 *
 * The order is the flat form's order and it is not arbitrary: the event comes
 * before the person, because somebody who has clicked "plan an event" is
 * holding a date rather than an introduction. The first thing asked is three
 * short answers that fit on one screen with the button, which is the cheapest
 * opening move a booking form can offer, and an enquiry abandoned after it is
 * still the most legible thing we could have been told.
 *
 * `fields` is what the cue owns. It drives two things that must never drift
 * apart: which fieldset is checked before you may leave it, and which cue the
 * sheet jumps back to when the server rejects a particular field.
 */
const CUES = [
  { id: 'event', fields: ['eventType', 'eventWhen', 'eventSize'] },
  { id: 'brief', fields: ['message'] },
  { id: 'you', fields: ['username', 'email', 'phone'] },
] as const

/**
 * The room, at each stage of being built.
 *
 * Five frames of one room from one camera, shot off the same three.js the
 * lounge runs - see the venue block in `app/world/shots/shot-studio.tsx`, and
 * `scripts/shoot-scenes.ts` for the shutter. Not a live canvas: a marketing
 * page that spins up WebGL costs every visitor a renderer to look at a picture,
 * and the picture is the part that was doing the work.
 *
 * The stages are cumulative, so cross-fading between two of them looks like
 * something being added to a room rather than like two rooms swapping places.
 */
const STAGES = [
  { scene: 'venue-1-plot', key: 'plot' },
  { scene: 'venue-2-floor', key: 'floor' },
  { scene: 'venue-3-fitout', key: 'fitout' },
  { scene: 'venue-4-branded', key: 'branded' },
  { scene: 'venue-5-doors', key: 'doors' },
] as const

/**
 * The blocks drifting around the plate, in the corners the render leaves empty.
 *
 * Well inside the edges. The plate clips - it has to, the neon floor behind it
 * is a gradient that must stop at the rounded corner - so a block placed at 6%
 * is a block sliced in half by an invisible line, which reads as a bug rather
 * than as a room continuing past the frame.
 */
const PLATE_DECO = [
  { model: 'gift', x: 14, y: 22, scale: 0.34, hue: 320 },
  { model: 'computer', x: 86, y: 70, scale: 0.32, hue: 200 },
  { model: 'glass', x: 84, y: 24, scale: 0.22, hue: 285 },
]

export function EventRunOfShow({
  defaults,
  path = '/events',
  locale = 'en',
}: {
  defaults?: { username?: string | null; email?: string | null }
  path?: string
  locale?: Locale
}) {
  const refusal = useRefusal()
  // Looked up rather than passed as an object: this is a client component, and
  // a whole dictionary crossing the server/client boundary as a prop is
  // serialised into the page's flight data on every render. The locale is one
  // string, and the dictionaries are already in the bundle.
  const dict = eventsDict(locale)
  const [state, action, pending] = useActionState(sendEventEnquiry, EVENT_IDLE)

  /**
   * Whether this has hydrated, which is what decides flat form or cue sheet.
   *
   * `useSyncExternalStore` rather than an effect that sets state on mount. The
   * effect version renders twice on every visit and is exactly what React 19's
   * `set-state-in-effect` rule is pointing at; this one is a store that returns
   * `false` on the server and `true` in the browser, so the markup is right on
   * the first client render and there is no cascade. Same trick, and the same
   * three arguments, as `party-store`.
   *
   * The subscribe callback is a no-op on purpose: the answer changes exactly
   * once, at hydration, and React re-renders for that on its own.
   */
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const [cue, setCue] = useState(0)
  const panels = useRef<(HTMLDivElement | null)[]>([])

  // See ContactForm: React clears an uncontrolled form to its defaultValue when
  // the action returns, so the rejected draft has to be the defaultValue or the
  // longest answer on the page is the one that disappears.
  const rejected = state.status === 'error' ? state.values : EMPTY_EVENT_DRAFT
  const value = (field: keyof typeof EMPTY_EVENT_DRAFT, fallback?: string | null) =>
    rejected[field] || fallback || ''

  /**
   * The answers, mirrored out of the fields as they are typed.
   *
   * The inputs stay uncontrolled - `defaultValue`, exactly as above, because
   * that is what makes the pre-hydration submit and the rejected-draft restore
   * work - and this is a copy kept alongside for the two things that have to
   * *read* the answers: the plate that builds the room, and the line a played
   * cue collapses into. Neither may become the source of truth for the field,
   * so nothing here is ever written back into one.
   */
  const [draft, setDraft] = useState(() => ({
    eventType: value('eventType'),
    eventWhen: value('eventWhen'),
    eventSize: value('eventSize'),
    message: value('message'),
    username: value('username', defaults?.username),
    email: value('email', defaults?.email),
  }))

  /**
   * A field the server rejected is a field the person cannot see if it is two
   * cues back, so the sheet walks to it.
   *
   * Adjusted during render against the last action result we acted on, rather
   * than in an effect. React documents this shape for "reset some state when a
   * prop changes", and it is the right one here for the same reason it is there:
   * the walk is a *consequence* of a new result arriving, not a side effect of
   * having rendered, and doing it in an effect paints the wrong cue for a frame
   * before correcting it.
   *
   * Keyed on the field name rather than on a cue index, so the action never has
   * to know the wizard exists.
   */
  const [handled, setHandled] = useState(state)
  if (handled !== state) {
    setHandled(state)
    if (state.status === 'error' && state.field) {
      const owner = CUES.findIndex((c) => (c.fields as readonly string[]).includes(state.field!))
      if (owner >= 0) setCue(owner)
    }
  }

  /**
   * How far the room has got, from what has actually been answered.
   *
   * Deliberately not the cue index. The plate is a picture of the room, not of
   * the form, and those two come apart the moment somebody walks back to cue 01
   * to change the date - the room does not un-build itself because they did.
   * Every step here is earned by an answer that exists.
   */
  const built =
    (draft.username.trim() ? 1 : 0) +
    (draft.message.trim() ? 1 : 0) +
    (draft.eventWhen.trim() && draft.eventSize.trim() ? 1 : 0) +
    (draft.eventType ? 1 : 0)

  /**
   * Before the first answer, the plate builds the room by itself.
   *
   * The page's claim is that we build the room and they send a link, and the
   * plate is where that claim is made - but on arrival there is nothing to
   * build it from, so it would sit on an empty plot being a picture of nothing
   * until somebody guessed that answering changes it. Running the sequence once
   * a second demonstrates the mechanism to a visitor who has typed nothing,
   * which is every visitor for the first few seconds.
   *
   * It stops for good at the first answer. A loop that kept playing underneath
   * somebody's own answers would be an advert running over their work, and
   * worse, it would stop the plate meaning what it says.
   *
   * Above the `sent` return with every other hook, not beside the code that
   * uses it: a hook after a conditional return is a hook that is called on some
   * renders and not others, which is the one thing React will not have.
   */
  const [demo, setDemo] = useState(0)
  const started = built > 0

  useEffect(() => {
    if (started) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tick = setInterval(() => setDemo((d) => (d + 1) % STAGES.length), 1150)
    return () => clearInterval(tick)
  }, [started])

  if (state.status === 'sent') {
    return (
      <div className="cue-sent">
        <p className="cue-sent-tag">{dict.sent.tag}</p>
        <p className="cue-sent-line">{dict.sent.line}</p>
        <p className="cue-sent-body">{dict.sent.body}</p>
        <Image
          src="/xo/scenes/venue-5-doors.webp"
          alt={dict.sent.alt}
          width={1400}
          height={1000}
          className="cue-sent-shot"
        />
      </div>
    )
  }

  const invalid = (field: string) => state.status === 'error' && state.field === field

  const wizard = hydrated
  const last = CUES.length - 1
  const shown = (i: number) => !wizard || cue === i

  /** Leave a cue only once the browser is happy with everything on it. */
  function advance(to: number) {
    if (to > cue) {
      const panel = panels.current[cue]
      const fields = panel?.querySelectorAll<HTMLInputElement>('input, select, textarea')
      for (const field of fields ?? []) {
        if (!field.reportValidity()) return
      }
    }
    setCue(to)
    panels.current[to]?.querySelector<HTMLElement>('input, select, textarea')?.focus()
  }

  /** What a played cue collapses into: the answers, not the questions. */
  function logged(i: number): string | null {
    if (i === 0) {
      const parts = [draft.eventType, draft.eventWhen, draft.eventSize].filter(Boolean)
      return parts.length ? parts.join(' · ') : null
    }
    if (i === 1) {
      const line = draft.message.trim().replace(/\s+/g, ' ')
      if (!line) return null
      return line.length > 58 ? `${line.slice(0, 58)}…` : line
    }
    return draft.email || draft.username || null
  }

  const showing = started ? built : demo
  const stage = STAGES[showing]

  return (
    <form action={action} className="cue-form">
      <input type="hidden" name="path" value={path} />

      {/* The honeypot, exactly as in ContactForm - hidden from sight, from
          screen readers and from the keyboard. See sendEventEnquiry. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="cue-split">
        <ol className="cuelist cuelist-yours">
          {CUES.map((c, i) => {
            const status = !wizard ? 'flat' : i === cue ? 'open' : i < cue ? 'played' : 'standby'
            const summary = status === 'played' ? logged(i) : null

            return (
              <li key={c.id} className="cue" data-owner="you" data-status={status}>
                {/*
                  The cue head is a control only where it is honest to be one.

                  Only cues already played are reachable, which is the truthful
                  version: cue 03 is not a place you may go, it is a place you
                  arrive. Rendering every head as a live tab you can press and
                  bounce off would say the opposite twice a visit. A standby head
                  is therefore plain markup with no control in it at all, rather
                  than a disabled button nobody can explain.
                */}
                {status === 'played' ? (
                  <button type="button" className="cue-head" onClick={() => advance(i)}>
                    <span className="cue-no">{String(i + 1).padStart(2, '0')}</span>
                    <span className="cue-label">{dict.cues[c.id].label}</span>
                    <span className="cue-owner">{dict.owner.yours}</span>
                    {summary && <span className="cue-logged">{summary}</span>}
                  </button>
                ) : (
                  <p className="cue-head" aria-current={status === 'open' ? 'step' : undefined}>
                    <span className="cue-no">{String(i + 1).padStart(2, '0')}</span>
                    <span className="cue-label">{dict.cues[c.id].label}</span>
                    <span className="cue-owner">{dict.owner.yours}</span>
                  </p>
                )}

                {/*
                  `hidden` rather than unmounting, because the fields have to
                  stay in the form for the pre-hydration submit to carry them -
                  see the note at the top. The grid-rows transition in the CSS
                  animates the open, and `hidden` cuts it dead on the cues that
                  are not current, which is right: a closed cue should be closed
                  on the first frame, not seen closing.
                */}
                <div className="cue-body" hidden={!shown(i)}>
                  <div className="cue-body-inner">
                    {wizard && <p className="cue-hint">{dict.cues[c.id].hint}</p>}

                    <div
                      ref={(el) => {
                        panels.current[i] = el
                      }}
                      className="cue-fields"
                    >
                      {i === 0 && (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <label htmlFor="event-type" className={LABEL}>
                              {dict.fields.typeLabel}
                            </label>
                            <select
                              id="event-type"
                              name="eventType"
                              required
                              defaultValue={value('eventType')}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, eventType: e.target.value }))
                              }
                              aria-invalid={invalid('eventType') || undefined}
                              className={FIELD}
                            >
                              <option value="">{dict.fields.typePlaceholder}</option>
                              {/* The value stays the English key the server
                                  validates and stores; only the label is
                                  translated. See `eventTypes` in the dict. */}
                              {EVENT_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {dict.eventTypes[type]}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="event-when" className={LABEL}>
                              {dict.fields.whenLabel}
                            </label>
                            {/* Text, not a date picker. "Second week of May" is
                                a real answer at enquiry time and a date input
                                cannot hold it - see the column comment in the
                                migration. */}
                            <input
                              id="event-when"
                              name="eventWhen"
                              required
                              maxLength={120}
                              defaultValue={value('eventWhen')}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, eventWhen: e.target.value }))
                              }
                              aria-invalid={invalid('eventWhen') || undefined}
                              placeholder={dict.fields.whenPlaceholder}
                              className={FIELD}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="event-size" className={LABEL}>
                              {dict.fields.sizeLabel}
                            </label>
                            <input
                              id="event-size"
                              name="eventSize"
                              required
                              maxLength={60}
                              defaultValue={value('eventSize')}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, eventSize: e.target.value }))
                              }
                              aria-invalid={invalid('eventSize') || undefined}
                              placeholder={dict.fields.sizePlaceholder}
                              className={FIELD}
                            />
                          </div>
                        </div>
                      )}

                      {/* The brief. On its own cue because it is the one answer
                          that wants a blank screen and no neighbours: a textarea
                          sitting under five inputs gets three words in it. */}
                      {i === 1 && (
                        <div className="space-y-1.5">
                          <label htmlFor="event-message" className={LABEL}>
                            {dict.fields.briefLabel}
                          </label>
                          <textarea
                            id="event-message"
                            name="message"
                            required
                            rows={wizard ? 8 : 6}
                            maxLength={4000}
                            defaultValue={value('message')}
                            onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
                            aria-invalid={invalid('message') || undefined}
                            placeholder={dict.fields.briefPlaceholder}
                            className={`${FIELD} resize-y`}
                          />
                        </div>
                      )}

                      {/* Who to answer. Last, because it is the part every other
                          form opens with and the part nobody came here to type. */}
                      {i === 2 && (
                        <div className="space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label htmlFor="event-username" className={LABEL}>
                                {dict.fields.nameLabel}
                              </label>
                              <input
                                id="event-username"
                                name="username"
                                required
                                maxLength={80}
                                autoComplete="name"
                                defaultValue={value('username', defaults?.username)}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, username: e.target.value }))
                                }
                                aria-invalid={invalid('username') || undefined}
                                placeholder={dict.fields.namePlaceholder}
                                className={FIELD}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label htmlFor="event-email" className={LABEL}>
                                {dict.fields.emailLabel}
                              </label>
                              <input
                                id="event-email"
                                name="email"
                                type="email"
                                required
                                maxLength={200}
                                autoComplete="email"
                                defaultValue={value('email', defaults?.email)}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, email: e.target.value }))
                                }
                                aria-invalid={invalid('email') || undefined}
                                placeholder={dict.fields.emailPlaceholder}
                                className={FIELD}
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="event-phone" className={LABEL}>
                              {dict.fields.phoneLabel}{' '}
                              <span className="text-ink-muted/70">{dict.fields.phoneOptional}</span>
                            </label>
                            <input
                              id="event-phone"
                              name="phone"
                              type="tel"
                              maxLength={40}
                              autoComplete="tel"
                              defaultValue={value('phone')}
                              aria-invalid={invalid('phone') || undefined}
                              placeholder={dict.fields.phonePlaceholder}
                              className={FIELD}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        {/*
          The plate: the room as it stands, given what has been said so far.

          It reads as decoration and is not. The things an event actually buys
          are all claims about a room, so the room is drawn - from real renders
          of the real product - and it gains a layer every time an answer lands.
          Somebody who has picked "community night" and typed "120" has been
          shown a floor, tables and a banner going up, which is the whole offer
          stated without a sentence of marketing in it.

          Outside the cue list rather than inside cue 01, because it belongs to
          all three: the walls get their name in cue 03, and a plate that lived
          in the first cue would go away exactly when it started being theirs.
        */}
        {wizard && (
          <aside className="cue-plate">
            <div className="cue-plate-stage">
              <span className="neon-horizon" />
              <span className="neon-floor" />
              <BlockDrift blocks={PLATE_DECO} shapes={[]} priority={false} />
              {/*
                Every stage is in the DOM and all but one are transparent, which
                is what makes the change a cross-fade rather than a swap: the
                next picture is already decoded when it is asked to appear, so
                the room gains a layer instead of blinking through white. Five
                frames of one 1400px render is a cost worth paying once.
              */}
              {STAGES.map((s, i) => (
                <Image
                  key={s.scene}
                  src={`/xo/scenes/${s.scene}.webp`}
                  alt={
                    i === showing
                      ? fill(dict.plate.shotAlt, { caption: dict.stages[s.key].toLowerCase() })
                      : ''
                  }
                  aria-hidden={i === showing ? undefined : true}
                  width={1400}
                  height={1000}
                  priority={i === 0}
                  className="cue-plate-shot"
                  data-shown={i === showing ? 'yes' : 'no'}
                  sizes="(max-width: 1023px) 92vw, 34vw"
                />
              ))}
            </div>

            {/*
              The readout, and it only ever says things that are true.

              A row appears when the answer behind it does, and never before.
              The temptation here was a meter filling to 100%, which would be a
              picture of the form's completeness rather than the room's - and
              the room is the thing being sold.
            */}
            <p className="cue-plate-caption" aria-live="polite">
              {dict.stages[stage.key]}
            </p>
            {/* Said once, and only while nobody has answered anything. A plate
                that is building a room on its own is a nice thing to watch and
                a confusing thing to be shown, unless it says whose room it is
                about to become. */}
            {!started && (
              <p className="cue-plate-note">{dict.plate.note}</p>
            )}
            {/*
              The readout is their answers, so it does not exist until there
              are any. While the demo loop is running the caption above already
              says what the picture shows, and a "Floor - not laid yet" row
              under a caption reading "Floor laid" is the page contradicting
              itself in two lines.
            */}
            <dl className="cue-readout" hidden={!started}>
              <div>
                <dt>{dict.plate.floor}</dt>
                {/* The stored value is English; the readout is the person's
                    own answer read back, so it shows the translated label. */}
                <dd>
                  {draft.eventType
                    ? (
                        dict.eventTypes[draft.eventType as keyof typeof dict.eventTypes] ??
                        draft.eventType
                      ).toLowerCase()
                    : '—'}
                </dd>
              </div>
              {draft.eventWhen.trim() && (
                <div>
                  <dt>{dict.plate.doors}</dt>
                  <dd>{draft.eventWhen}</dd>
                </div>
              )}
              {draft.eventSize.trim() && (
                <div>
                  <dt>{dict.plate.sized}</dt>
                  <dd>{draft.eventSize}</dd>
                </div>
              )}
              {draft.message.trim() && (
                <div>
                  <dt>{dict.plate.order}</dt>
                  <dd>
                    {fill(dict.plate.words, {
                      n: draft.message.trim().split(/\s+/).length,
                    })}
                  </dd>
                </div>
              )}
              {draft.username.trim() && (
                <div>
                  <dt>{dict.plate.walls}</dt>
                  <dd>{draft.username.trim()}</dd>
                </div>
              )}
            </dl>
          </aside>
        )}
      </div>

      {state.status === 'error' && (
        <p role="alert" className="cue-error">
          {refusal(state.error)}
        </p>
      )}

      {/*
        The send line, and it is the seam the whole page is built around.

        Everything above it is the organiser's; everything below it on the page
        is ours. So the submit sits exactly on that boundary rather than at the
        bottom of a form, and pressing it is visibly the moment the work changes
        hands - which is the one thing a booking form has to make feel small.

        The submit exists only on the last cue. A wizard that carries a live
        "send" on every screen is a wizard that will be submitted from cue one
        by somebody who reads buttons before labels, and the enquiry that
        arrives has a date on it and no idea what the event is.
      */}
      <div className="cue-send">
        <p className="cue-send-note">
          {wizard && cue < last
            ? fill(dict.send.progress, { n: cue + 1, total: CUES.length })
            : dict.send.lastNote}
        </p>

        <div className="cue-send-controls">
          {wizard && cue > 0 && (
            <button type="button" onClick={() => advance(cue - 1)} className="cue-back">
              {dict.send.back}
            </button>
          )}

          {wizard && cue < last ? (
            <button type="button" onClick={() => advance(cue + 1)} className="cue-next">
              {dict.send.next}
            </button>
          ) : (
            <button type="submit" disabled={pending} className="summon-cta cue-submit">
              {pending ? dict.send.sending : dict.send.submit}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
