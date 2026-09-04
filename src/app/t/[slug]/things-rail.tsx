'use client'

import { useState, useSyncExternalStore } from 'react'
import { CoinPrice } from '@/app/components/coin-price'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { Band } from '@/app/t/[slug]/rail-bits'
import { useHere } from '@/app/world/_stores/here-store'
import {
  thingiverseActions,
  useThingiverse,
} from '@/app/world/_stores/thing-store'
import {
  MAX_THING_SCALE,
  MIN_THING_SCALE,
  priceOfThing,
  shouts,
} from '@/domain/thingiverse/blueprint'
import { thumbnailFor } from '@/domain/thingiverse/models'
import type { BlueprintView, ThingView } from '@/domain/thingiverse/queries'
import { MAX_WIRES, type ThingTuning } from '@/domain/thingiverse/thing-events'

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

/** The same button, once it is the one that is on. See `Wiring`. */
const BUTTON_ON =
  'rounded-lg border border-accent/60 bg-accent/15 px-2 py-1 text-[11px] text-ink transition disabled:opacity-40'

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

export function ThingsRail({ slug }: { slug: string }) {
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
          The purse is not drawn here any more. It is at the top of the rail,
          above every panel, and `rail-tabs.tsx` carries the argument: a coin
          used to buy exactly two things and now pays for battles, doors,
          quotas and submissions, so it stopped being a Thingiverse number.

          Not left as a second copy either. A balance drawn in two places is a
          balance somebody checks twice and eventually finds disagreeing with
          itself, because the two reads happen at different moments.
        */}

        <ClipsBand slug={slug} clips={state.clips} t={t} />

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
              <ThingControls
                thing={selected}
                /*
                  Everything else standing in this room, so a wire has something
                  to point at. Filtered here rather than inside, because the
                  controls are about one thing and the list of what it could
                  reach is a fact about the room.
                */
                others={state.things.filter((one) => one.id !== selected.id)}
                t={t}
                busy={state.busy}
              />
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
 * What this body can do, in the rail.
 *
 * ---------------------------------------------------------------------------
 * A list here rather than a link to the page that lists them
 * ---------------------------------------------------------------------------
 * It was a link to the clips door on `/browse`, and that was the wrong verb.
 * The page is where a clip is *made* and looked at on a mirror; this is where
 * somebody standing in a room wants to *do* one, and sending them to another
 * route to find out what a wave looks like takes the body they wanted to wave
 * with off the screen.
 *
 * So: the names the scene published, and pressing one plays it. Local and
 * unannounced, exactly as `/clip` is - everybody else sees it because presence
 * is already broadcasting where every limb is. See `playClip`.
 *
 * ---------------------------------------------------------------------------
 * Favourites first, then the search
 * ---------------------------------------------------------------------------
 * A body carries the pack's four *plus* everything this space has ever
 * animated, which on a space that uses the animator is dozens - and the two or
 * three anybody actually does are the same two or three every day. So the
 * starred ones are at the top at full size, and the rest are behind a word.
 *
 * The stars are this browser's, in `localStorage`, and that is the right home
 * for them rather than a table: it is a shortcut on a menu, not a fact about
 * the space, and a round trip per star would be a write per fidget. Per space,
 * because which clips exist is per space - a favourite naming a clip another
 * space never made is a row that would never draw, and keying by slug means it
 * never has to be cleaned up.
 */
function ClipsBand({
  slug,
  clips,
  t,
}: {
  slug: string
  clips: readonly string[]
  t: ReturnType<typeof railDict>['tabs']['thingiverse']
}) {
  const [query, setQuery] = useState('')

  /*
    The same shape the rail's folds use, and for the same reason: `localStorage`
    does not exist on the server, so anything that reads it during a render has
    to have a server answer as well. `useSyncExternalStore` is the hook that
    asks for both - empty on the server, the saved list in the browser - and
    the cache behind `starsFor` is what makes the snapshot stable, which is the
    part a plain read would get wrong and spin on.
  */
  const stars = useSyncExternalStore(subscribeToStars, () => starsFor(slug), () => NO_STARS)

  const actions = thingiverseActions()

  const wanted = query.trim().toLowerCase()
  /*
    The starred ones in the order they exist rather than the order they were
    starred, so the row does not reshuffle itself when somebody unstars one and
    puts it back.
  */
  const favourites = clips.filter((clip) => stars.includes(clip))
  const rest = clips.filter(
    (clip) => !stars.includes(clip) && (wanted === '' || clip.toLowerCase().includes(wanted)),
  )

  if (clips.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {t.clips}
      </p>

      {favourites.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {favourites.map((clip) => (
            <Clip
              key={clip}
              clip={clip}
              starred
              label={t.favourite}
              onPlay={() => actions?.playClip(clip)}
              onStar={() => toggleStar(slug, clip)}
            />
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.clipSearch}
        className="w-full rounded-lg border border-line/60 bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-muted"
      />

      {rest.length === 0 && wanted !== '' ? (
        <p className="px-1 text-[11px] text-ink-muted">{fill(t.noClip, { q: query.trim() })}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {rest.map((clip) => (
            <Clip
              key={clip}
              clip={clip}
              starred={false}
              label={t.favourite}
              onPlay={() => actions?.playClip(clip)}
              onStar={() => toggleStar(slug, clip)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The starred clips, as a store rather than a piece of state.
 *
 * Module-level and shared, so the two rails that can both be on screen at once
 * - the drawer's copy and the right-hand panel's - agree the moment either one
 * is pressed. A `useState` in the component would have starred a clip in one
 * and left the other showing the old row until something else re-rendered it.
 *
 * Per space, because which clips exist is per space: a favourite naming a clip
 * another space never made is a row that would never draw, and keying by slug
 * means it never has to be cleaned up.
 */
const starKey = (slug: string) => `xo.clips.favourites.${slug}`

const NO_STARS: readonly string[] = []

let starCache: { slug: string; stars: readonly string[] } | null = null
const starListeners = new Set<() => void>()

function subscribeToStars(onChange: () => void): () => void {
  starListeners.add(onChange)
  return () => {
    starListeners.delete(onChange)
  }
}

function starsFor(slug: string): readonly string[] {
  if (starCache?.slug === slug) return starCache.stars

  let stars: readonly string[] = NO_STARS
  try {
    const raw = window.localStorage.getItem(starKey(slug))
    const names: unknown = raw ? JSON.parse(raw) : null
    // Filtered rather than cast: this is a string somebody else's code wrote,
    // and a number in the list would reach `includes` and quietly match
    // nothing rather than announcing itself.
    if (Array.isArray(names)) stars = names.filter((one): one is string => typeof one === 'string')
  } catch {
    // Storage denied, or a value somebody else wrote. Nothing is starred, and
    // the band is the plain list it is on a first visit. See `storage-denied`.
  }

  starCache = { slug, stars }
  return stars
}

function toggleStar(slug: string, clip: string): void {
  const stars = starsFor(slug)
  const next = stars.includes(clip)
    ? stars.filter((one) => one !== clip)
    : [...stars, clip]

  // The cache first, so the re-render this announces reads the new value even
  // when the write below throws - the star then holds for the session and is
  // forgotten on reload, which is the right half of the feature to keep.
  starCache = { slug, stars: next }
  try {
    window.localStorage.setItem(starKey(slug), JSON.stringify(next))
  } catch {
    // Kept for this visit even when it cannot be written down.
  }

  for (const listener of starListeners) listener()
}

/**
 * One clip, and the star that keeps it at the top.
 *
 * Two buttons rather than one with a modifier, because the whole point of the
 * row is that it is one press away from playing: a star you have to shift-click
 * is a star nobody finds, and a chip that sometimes plays and sometimes
 * bookmarks is a chip you press carefully.
 */
function Clip({
  clip,
  starred,
  label,
  onPlay,
  onStar,
}: {
  clip: string
  starred: boolean
  /** What the star does, for the people who cannot see that it is a star. */
  label: string
  onPlay: () => void
  onStar: () => void
}) {
  return (
    <span className="flex items-center overflow-hidden rounded-lg border border-line/60 transition hover:border-accent/60">
      <button
        type="button"
        onClick={onPlay}
        className="px-2 py-1 text-[11px] capitalize text-ink-muted transition hover:bg-surface-raised hover:text-ink"
      >
        {clip}
      </button>
      <button
        type="button"
        onClick={onStar}
        aria-pressed={starred}
        aria-label={label}
        title={label}
        className={`px-1.5 py-1 text-[10px] transition hover:bg-surface-raised ${
          starred ? 'text-accent' : 'text-ink-muted/50 hover:text-ink'
        }`}
      >
        ★
      </button>
    </span>
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
          {/*
            What it costs, on the button that spends it.

            Beside the word rather than in the row, because the price is a
            property of *pressing this* and not of the thing sitting on a shelf.
            Somebody scanning the shelf is choosing what to summon; the moment
            the number matters is the moment their finger is on the control.

            Nothing at all when it is free. A `0` on every row is noise that
            makes the one row with a real price harder to spot, and "free" is
            what a blueprint with no price means.
          */}
          <CoinPrice coins={priceOfThing(entry.spec)} />
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
  others,
  t,
  busy,
}: {
  thing: ThingView
  /** The rest of the room, for the wires. See `ThingTuning.wires`. */
  others: readonly ThingView[]
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

      {/*
        The wiring, for the things that have something to say.

        Two controls and both are about *this* one: how far its shouts carry,
        and which things they go to instead of the room. Drawn only when the
        blueprint ever shouts a word - see `shouts` - because a reach on a bench
        is a control about nothing.
      */}
      {spec && shouts(spec) && <Wiring thing={thing} others={others} t={t} busy={busy} />}

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

/**
 * Who hears this one, and how far away.
 *
 * ---------------------------------------------------------------------------
 * Why the reach is a short list rather than a number field
 * ---------------------------------------------------------------------------
 * Because the question is "does the room hear this or does the corridor", and
 * nobody has an opinion about 7 against 8. Four rungs and "the whole room" put
 * the decision in one press, in a fourteen-rem column, with no keyboard - which
 * is the same reason the size controls next to it are two buttons rather than a
 * slider.
 *
 * ---------------------------------------------------------------------------
 * And why a wire is a checkbox per thing rather than a click in the world
 * ---------------------------------------------------------------------------
 * Pointing at the door you mean *is* the better gesture and it is not this
 * panel's to offer: the rail is beside the canvas, not over it, and there is no
 * crosshair here to aim with - the same constraint that made moving a thing six
 * arrows instead of a drag. What this can do honestly is list what is in the
 * room and let somebody tick two of them, and selecting a row up above lights
 * the thing in the world, so the list is checkable by looking.
 */
function Wiring({
  thing,
  others,
  t,
  busy,
}: {
  thing: ThingView
  others: readonly ThingView[]
  t: ReturnType<typeof railDict>['tabs']['thingiverse']
  busy: boolean
}) {
  const actions = thingiverseActions()
  const wires = thing.tuning.wires ?? []

  const setTuning = (patch: Partial<ThingTuning>) =>
    actions?.tune(thing.id, { ...thing.tuning, ...patch })

  return (
    <div className="space-y-1.5 rounded-lg border border-line/60 p-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-ink-muted">
          {t.shouts}
        </span>
        <button
          type="button"
          disabled={busy}
          aria-pressed={thing.tuning.reach === undefined}
          onClick={() => setTuning({ reach: undefined })}
          className={thing.tuning.reach === undefined ? BUTTON_ON : BUTTON}
        >
          {t.wholeRoom}
        </button>
        {REACHES.map((cells) => (
          <button
            key={cells}
            type="button"
            disabled={busy}
            aria-pressed={thing.tuning.reach === cells}
            onClick={() => setTuning({ reach: cells })}
            className={thing.tuning.reach === cells ? BUTTON_ON : BUTTON}
          >
            {fill(t.cells, { n: String(cells) })}
          </button>
        ))}
      </div>

      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{t.wiredTo}</p>
      {others.length === 0 ? (
        <p className="text-[11px] text-ink-muted">{t.nothingToWire}</p>
      ) : (
        <>
          <ul className="max-h-32 space-y-0.5 overflow-y-auto">
            {others.map((one) => (
              <li key={one.id}>
                <Switch
                  label={one.blueprint?.name ?? '—'}
                  on={wires.includes(one.id)}
                  busy={busy}
                  onChange={(next) =>
                    setTuning({
                      // Rebuilt rather than spliced, and capped where the
                      // command is capped: a list that grew past `MAX_WIRES`
                      // here would be refused on the way in, after the switch
                      // had already drawn itself as on.
                      wires: next
                        ? [...wires, one.id].slice(0, MAX_WIRES)
                        : wires.filter((id) => id !== one.id),
                    })
                  }
                />
              </li>
            ))}
          </ul>
          <p className="text-[10px] leading-relaxed text-ink-muted">{t.wiresHint}</p>
        </>
      )}
    </div>
  )
}

/** The rungs the reach control offers, in cells. See `Wiring`. */
const REACHES = [3, 6, 12, 24] as const

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
