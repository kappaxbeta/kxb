'use client'

import { useState } from 'react'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { Band } from '@/app/t/[slug]/rail-bits'
import { useHere } from '@/app/world/_stores/here-store'
import {
  thingiverseActions,
  useThingiverse,
} from '@/app/world/_stores/thing-store'
import { MAX_THING_SCALE, MIN_THING_SCALE } from '@/domain/thingiverse/blueprint'
import { thumbnailFor } from '@/domain/thingiverse/models'
import type { BlueprintView, ThingView } from '@/domain/thingiverse/queries'

/**
 * The thingiverse, in the rail.
 *
 * Three bands, and the order is the order somebody uses them in: what is
 * *yours*, what the space has *shared*, and what is standing in the room you
 * are in. The first two are a shelf you summon off; the third is furniture you
 * select and change.
 *
 * ---------------------------------------------------------------------------
 * Why this reads a store rather than taking props
 * ---------------------------------------------------------------------------
 * The shelf and the room's contents are loaded by the *page* - a server
 * component under /t/[slug] - and this tab is rendered by the *layout*, which
 * is a segment above and does not know which world is on screen. Threading them
 * up would mean fetching a shelf on every workspace page whether or not a world
 * is running, and fetching it again per room.
 *
 * So the scene owns the state and publishes it, exactly as the front door and
 * the roster already do, and this is a second view of one list rather than a
 * second copy. See `thing-store`. The consequence worth knowing: with no world
 * on screen there is nothing to publish, and this band says so instead of
 * showing an empty shelf that cannot be summoned from anyway.
 */

const BUTTON =
  'rounded-lg border border-line/60 px-2 py-1 text-[11px] transition hover:bg-surface-raised disabled:opacity-40'

/**
 * One cell, six ways.
 *
 * Typed rather than `as const`, so every entry is the same partial shape: with
 * a const assertion each arrow gets its own literal type and `delta.y` on the
 * left arrow is a compile error rather than the "nothing, so zero" this is
 * written to mean.
 */
const MOVES: readonly [string, { x?: number; y?: number; z?: number }][] = [
  ['←', { x: -1 }],
  ['→', { x: 1 }],
  ['↑', { y: 1 }],
  ['↓', { y: -1 }],
  ['⤒', { z: -1 }],
  ['⤓', { z: 1 }],
]

export function ThingsRail() {
  const t = railDict(useLocale()).tabs.thingiverse
  const state = useThingiverse()
  const here = useHere()

  /**
   * Which bands are open.
   *
   * Yours open, the rest shut. A shelf of two hundred blueprints under a room
   * of forty things is a scroll rather than a panel, and the band somebody came
   * for is nearly always their own - the shared shelf is browsed, and what is
   * standing in the room is usually reached by clicking the thing itself.
   */
  const [open, setOpen] = useState<Record<string, boolean>>({ yours: true })
  const [query, setQuery] = useState('')

  if (!state) {
    return (
      <div className="px-1">
        <Band>{t.heading}</Band>
        <p className="px-1 text-xs text-ink-muted">{t.away}</p>
      </div>
    )
  }

  const actions = thingiverseActions()
  const mine = state.shelf.filter((entry) => entry.mine)
  const shared = state.shelf.filter((entry) => !entry.mine)
  const selected = state.things.find((thing) => thing.id === state.selectedId) ?? null

  const summonable = (entry: BlueprintView) =>
    query.trim() === '' ||
    `${entry.name} ${entry.spec.model}`.toLowerCase().includes(query.trim().toLowerCase())

  const yours = mine.filter(summonable)
  const theirs = shared.filter(summonable)

  /**
   * The room's band is open whenever something in the room is selected.
   *
   * Derived rather than set, and that is the whole reason it works: a thing is
   * most often selected by *clicking it in the world*, which happens in the
   * scene and arrives here as a new `selectedId` on the store. With the band
   * shut - which is its default - the click had no visible answer anywhere on
   * screen: the selection was real, the controls existed, and both were behind
   * a `+` nobody had a reason to press.
   *
   * An effect that opened the band on a changing `selectedId` would do the same
   * job one render later and then have to decide what to do when somebody shuts
   * it again with the thing still selected. Reading it out of the state that
   * caused it has neither problem, and "there is a thing selected, so the band
   * showing it is open" is a sentence with no timing in it.
   */
  const hereOpen = (open.here ?? false) || selected !== null

  return (
    <div className="px-1">
      <Band>{t.heading}</Band>
      <div className="space-y-3 px-1">
        {/*
          The search box doubles as the summon line.

          Typing here filters the shelf; pressing Enter asks the same question
          `/thingiverse` asks, which reaches the packs as well - so a word that
          matches nothing on the shelf still finds a fountain. One box for both
          because they are one question asked twice: "where is the fountain".
        */}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            // Only the summoning half is refused. Typing filters the shelf,
            // which is reading, and the box was `disabled` outright - so
            // anybody who could not build could not *find* anything either, in
            // a panel whose whole job away from creative mode is telling them
            // what is here.
            if (state.canBuild) actions?.ask(query)
          }}
          placeholder={t.search}
          className="w-full rounded-lg border border-line/60 bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-muted"
        />

        {/*
          Open the shelf over the room itself.

          The same thing a bare `/xo` in the chat does - `ask('')` is defined as
          "not a search, a request to look" - so this is a button for a command
          people otherwise have to know about. Worth having as a button because
          the panel it opens is *over the canvas*, at tile size, where the
          pictures are big enough to choose from; this rail is fourteen rem of
          names.

          Only while something can be built, and that is not the usual
          hide-it-from-guests rule: `ask` itself refuses without `canBuild` and
          sets an error, so a button drawn here in battle mode would be a button
          whose only effect is a complaint. The line above already explains
          which mode you are in.
        */}
        {state.canBuild && (
          <button
            type="button"
            onClick={() => actions?.ask('')}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1.5 text-[11px] text-ink transition hover:border-accent/70 hover:bg-accent/20"
          >
            <span>{t.openInWorld}</span>
            <span aria-hidden className="font-mono text-[10px] text-ink-muted">/xo</span>
          </button>
        )}

        {/*
          What happens to the next thing you summon.

          Above the shelf rather than beside each row, because it is a decision
          about what you are *about* to do - somebody spending an afternoon
          getting balls out to kick about says so once. A thing already standing
          has its own switch, on its own controls, further down.
        */}
        {state.canBuild && (
          <label className="flex items-center gap-1.5 px-1 text-[11px] text-ink-muted">
            <input
              type="checkbox"
              checked={state.keepDefault}
              onChange={(event) => actions?.chooseKeep(event.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            {t.keepDefault}
          </label>
        )}

        <Section
          id="yours"
          label={fill(t.yours, { n: String(mine.length) })}
          open={open.yours ?? false}
          onToggle={setOpen}
        >
          {mine.length === 0 ? (
            <p className="px-1 py-1 text-[11px] text-ink-muted">{t.hint}</p>
          ) : yours.length === 0 ? (
            /*
              Typed a word that matches nothing on this shelf.

              Said rather than left blank, and it is not a nicety: the band's own
              label still counts the *whole* shelf, so a filter that hid every
              row read as "Yours (12)" over an empty box - which looks like a
              panel that failed to draw rather than a search that found nothing.
            */
            <p className="px-1 py-1 text-[11px] text-ink-muted">
              {fill(t.noMatch, { q: query.trim() })}
            </p>
          ) : (
            yours.map((entry) => (
              <ShelfRow
                key={entry.id}
                entry={entry}
                t={t}
                busy={state.busy}
                canBuild={state.canBuild}
                here={here.people}
              />
            ))
          )}
        </Section>

        <Section
          id="shared"
          label={fill(t.shared, { n: String(shared.length) })}
          open={open.shared ?? false}
          onToggle={setOpen}
        >
          {shared.length === 0 ? (
            <p className="px-1 py-1 text-[11px] text-ink-muted">{t.noneOnShelf}</p>
          ) : theirs.length === 0 ? (
            <p className="px-1 py-1 text-[11px] text-ink-muted">
              {fill(t.noMatch, { q: query.trim() })}
            </p>
          ) : (
            theirs.map((entry) => (
              <ShelfRow
                key={entry.id}
                entry={entry}
                t={t}
                busy={state.busy}
                canBuild={state.canBuild}
                here={[]}
              />
            ))
          )}
        </Section>

        <Section
          id="here"
          label={fill(t.here, { n: String(state.things.length) })}
          open={hereOpen}
          onToggle={setOpen}
        >
          {state.things.length === 0 ? (
            <p className="px-1 py-1 text-[11px] text-ink-muted">{t.noneHere}</p>
          ) : (
            state.things.map((thing) => (
              <button
                key={thing.id}
                type="button"
                onClick={() =>
                  actions?.select(state.selectedId === thing.id ? null : thing.id)
                }
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                  state.selectedId === thing.id
                    ? 'bg-accent/20 text-ink'
                    : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                }`}
              >
                <Thumb model={thing.blueprint?.spec.model} />
                <span className="min-w-0 flex-1 truncate">{thing.blueprint?.name ?? '—'}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                  {thing.x},{thing.y},{thing.z}
                </span>
              </button>
            ))
          )}

          {/*
            The selected thing's controls - or, out of creative mode, the reason
            there are none.

            The `else` is the part that was missing, and it was reported as
            "i cant open the ball": in battle mode `canBuild` is false, so
            clicking a row selected the thing, lit it, and drew nothing
            underneath. Nothing on screen connected the two facts, because the
            switch that fixes it is a chip over the canvas on the other side of
            the page and this panel never mentioned it.

            A sentence rather than a set of disabled buttons. Six greyed arrows
            and three dead switches say "this is broken"; one line says which
            mode you are in and what the other one gives you.
          */}
          {selected &&
            (state.canBuild ? (
              <ThingControls thing={selected} t={t} busy={state.busy} />
            ) : (
              <p className="mt-2 rounded-lg border border-line/60 px-2 py-1.5 text-[11px] leading-relaxed text-ink-muted">
                {t.needCreative}
              </p>
            ))}
        </Section>

        {state.busy && <p className="text-[11px] text-ink-muted">{t.working}</p>}
        {state.error && (
          <p role="alert" className="text-[11px] text-red-400">
            {state.error}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The picture on a row.
 *
 * Worth the twenty-two pixels, because of what the rows are: a shelf of things
 * somebody made, all named by `nameForModel` and so all named after the model -
 * "Soccer ball", "Beach ball", "Bowling ball". A column of those is a column
 * you read one word at a time. The thumbnails are already in the repo, already
 * cached by the page that browses them, and are the one thing here that answers
 * "which one is that" at a glance.
 *
 * No `alt`: the name is right beside it in the same row, and a second copy of
 * it is a screen reader saying everything twice.
 */
function Thumb({ model }: { model: string | undefined }) {
  if (!model) return null

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={thumbnailFor(model)}
      alt=""
      loading="lazy"
      className="size-5 shrink-0 rounded bg-surface-raised object-contain"
    />
  )
}

/** One collapsible band. Open state lives in the tab, so only one thing owns it. */
function Section({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: string
  label: string
  open: boolean
  onToggle: (update: (current: Record<string, boolean>) => Record<string, boolean>) => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle((current) => ({ ...current, [id]: !current[id] }))}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
      >
        <span>{label}</span>
        <span className="font-mono">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  )
}

/**
 * One blueprint on the shelf.
 *
 * Summon is the whole row's job and everything else is behind the ⋯, because
 * the reason anybody opens this band is to put something in the room - and a
 * row carrying five buttons makes you read five to press the one.
 */
function ShelfRow({
  entry,
  t,
  busy,
  canBuild,
  here,
}: {
  entry: BlueprintView
  t: ReturnType<typeof railDict>['tabs']['thingiverse']
  busy: boolean
  canBuild: boolean
  /** Who is standing in the room, for handing it to one of them. */
  here: { userId: string; name: string }[]
}) {
  const [more, setMore] = useState(false)
  const actions = thingiverseActions()

  return (
    <div className="rounded-lg px-1 py-1">
      <div className="flex items-center justify-between gap-2">
        <Thumb model={entry.spec.model} />
        <span className="min-w-0 flex-1 truncate text-xs text-ink">{entry.name}</span>
        <button
          type="button"
          disabled={busy || !canBuild}
          onClick={() =>
            actions?.summon({
              kind: 'blueprint',
              id: entry.id,
              name: entry.name,
              model: entry.spec.model,
              mine: entry.mine,
            })
          }
          className={BUTTON}
        >
          {t.summon}
        </button>
        {entry.mine && (
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((open) => !open)}
            className="px-1 text-xs text-ink-muted hover:text-ink"
          >
            ⋯
          </button>
        )}
      </div>

      {more && entry.mine && (
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              actions?.share(entry.id, entry.visibility === 'public' ? 'private' : 'public')
            }
            className={BUTTON}
          >
            {entry.visibility === 'public' ? t.unshare : t.share}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              // `prompt` rather than an inline field, and it is a deliberate
              // cheapness: renaming is rare, the rail is 14rem wide, and a form
              // that appears inside a scrolling band pushes every row below it.
              const name = window.prompt(t.rename, entry.name)
              if (name && name.trim() !== entry.name) actions?.rename(entry.id, name.trim())
            }}
            className={BUTTON}
          >
            {t.rename}
          </button>
          {/*
            Handing it over, to somebody standing in the room with you.

            The people here rather than every member of the space, and that is
            the feature rather than a shortcut: you hand a thing to somebody who
            is *there*, the same way you would pass them a tool. A member who is
            not in the room can be handed one when they turn up.
          */}
          {here.map((person) => (
            <button
              key={person.userId}
              type="button"
              disabled={busy}
              onClick={() => actions?.hand(entry.id, person.userId)}
              className={BUTTON}
            >
              {fill(t.handTo, { name: person.name })}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => actions?.retire(entry.id)}
            className="rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            {t.retire}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The controls for the one thing you have selected.
 *
 * Nudges rather than a drag, for the reason the image panel gives - and for one
 * more here: the rail is not over the world. There is no crosshair to aim with
 * from a panel on the left, so "move it" has to be six buttons that each mean
 * one cell.
 *
 * The two switches are the properties the whole feature was asked for: does
 * this one block the way, and does this one fall. They are *this thing's*
 * answer, not its kind's - see `ThingTuning`.
 */
function ThingControls({
  thing,
  t,
  busy,
}: {
  thing: ThingView
  t: ReturnType<typeof railDict>['tabs']['thingiverse']
  busy: boolean
}) {
  const actions = thingiverseActions()
  const spec = thing.blueprint?.spec
  const blocks = thing.tuning.blocking ?? spec?.blocking ?? true
  const falls = (thing.tuning.body ?? spec?.body ?? null) !== null

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line/60 p-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-ink-muted">
          {t.move}
        </span>
        {MOVES.map(([label, delta]) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            onClick={() =>
              actions?.move(thing.id, {
                x: thing.x + (delta.x ?? 0),
                y: Math.max(0, thing.y + (delta.y ?? 0)),
                z: thing.z + (delta.z ?? 0),
              })
            }
            className={BUTTON}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button type="button" disabled={busy} onClick={() => actions?.turn(thing.id)} className={BUTTON}>
          {t.turn}
        </button>
        <button
          type="button"
          disabled={busy || thing.scale >= MAX_THING_SCALE}
          onClick={() => actions?.resize(thing.id, thing.scale * 1.25)}
          className={BUTTON}
        >
          {t.bigger}
        </button>
        <button
          type="button"
          disabled={busy || thing.scale <= MIN_THING_SCALE}
          onClick={() => actions?.resize(thing.id, thing.scale / 1.25)}
          className={BUTTON}
        >
          {t.smaller}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Switch
          label={t.blocks}
          on={blocks}
          busy={busy}
          onChange={(next) => actions?.tune(thing.id, { ...thing.tuning, blocking: next })}
        />
        <Switch
          /*
            Whether this one is still here tomorrow.

            Beside the two physical switches because it is read in the same
            breath - "what is this thing like" - and separate in the log,
            because it is not physics. See `ThingKeepSet`.
          */
          label={t.keep}
          on={thing.keep}
          busy={busy}
          onChange={(next) => actions?.setKeep(thing.id, next)}
        />
        <Switch
          label={t.falls}
          on={falls}
          busy={busy}
          onChange={(next) =>
            // `{}` is not "no body" - it is a crate, which falls and stops. Null
            // is scenery. Both spellings are reachable and they mean different
            // things; see `BlueprintSpec.body`.
            actions?.tune(thing.id, { ...thing.tuning, body: next ? {} : null })
          }
        />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => actions?.dismiss(thing.id)}
        className="rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
      >
        {t.dismiss}
      </button>
    </div>
  )
}

function Switch({
  label,
  on,
  busy,
  onChange,
}: {
  label: string
  on: boolean
  busy: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-accent"
      />
      {label}
    </label>
  )
}
