'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { attempt } from '@/app/components/connection'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import { CoinPrice } from '@/app/components/coin-price'
import { drawBlueprint } from '@/domain/thingiverse/actions'
import { type BlueprintSpec, freshSpec, freshUse } from '@/domain/thingiverse/blueprint'
import type { DoorId } from '@/app/t/[slug]/thingiverse/doors'
import { freshVehicle } from '@/domain/thingiverse/vehicle'

/**
 * Re-exported, not declared: the list itself lives in a plain module, because a
 * server component cannot import a value out of this one. See `doors.ts`.
 */
export type { DoorId }

/**
 * The thingiverse, as a place you arrive at.
 *
 * ---------------------------------------------------------------------------
 * Three doors down the left, and why they are not tabs
 * ---------------------------------------------------------------------------
 * The three things a space makes here are a *blueprint*, a *clip* and - behind
 * the third - the raw catalogue everything is cut from. They were a tab strip
 * and a long scroll, which read as three views of one list. They are not: the
 * first two each open an editor and the third opens a reference, and the verbs
 * are different enough that the control should say them out loud.
 *
 * Down the left rather than across the top because two of the three carry a
 * second control - "and make a new one" - and a tab with a button inside it is
 * a tab people press the wrong half of. A tall door has room to say what is
 * behind it, how much of it there is, and what pressing it makes.
 *
 * ---------------------------------------------------------------------------
 * A blueprint is not made out of a model tile
 * ---------------------------------------------------------------------------
 * It was: every one of the 5,770 tiles in the packs carried "make a blueprint
 * of this", which made the catalogue a factory and meant the shelf filled up
 * with things named after whatever was clicked. It also quietly decided that a
 * blueprint is one model, which stopped being true the moment the bench could
 * bolt twelve together.
 *
 * So the catalogue is a *reference* now - look at what we ship - and a
 * blueprint starts empty, from the door, and picks up its models at the bench.
 * That is the same order you would build the thing in.
 */
export function Hub({
  slug,
  counts,
  panels,
  initial,
  prices = { blueprint: 0, vehicle: 0, clip: 0 },
  t,
}: {
  slug: string
  counts: Record<DoorId, number>
  /** Rendered on the server, one per door. Only the open one is mounted. */
  panels: Record<DoorId, ReactNode>
  /**
   * Which door to start on, for somebody who was sent here.
   *
   * The initial value only - pressing another door afterwards is state in here,
   * and the address bar is left alone. A link that had to stay in step with the
   * open door would make every press a navigation, and this page is a rig and a
   * mirror that would reload with each one.
   *
   * Undefined is the ordinary arrival, which opens on the shelf.
   */
  initial?: DoorId
  /**
   * What one more of each costs this space, in coins. Zero is free, and zero
   * is what a space with the economy off gets for both.
   *
   * Worked out on the server by `nextPrice`, which is also what `drawBlueprint`
   * and `saveClip` charge from - so the number on the button and the number out
   * of the purse are one answer. Defaulted, because most of this component's
   * callers have no reason to know an economy exists.
   */
  prices?: { blueprint: number; vehicle: number; clip: number }
  t: WorkspaceDict['thingiverse']
}) {
  const h = t.hub
  const [open, setOpen] = useState<DoorId>(initial ?? 'blueprints')

  return (
    <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
      {/*
        Two across on a phone, three from `sm`, a column from `lg`.

        It was one flex row for all five, and on a phone that row was 496px wide
        inside a 343px column - so the page itself scrolled sideways, the last
        door sat off the right edge, and every label read "Blue…". Two failures,
        one visible: `truncate` sets `white-space: nowrap`, whose *min-content*
        is the whole word, and a `nav` is a grid item with `min-width: auto`, so
        the strip's minimum became the sum of five untruncatable labels and
        dragged the whole column out with it. `min-w-0` here is what stops a
        door ever widening the page again; the columns are what make the labels
        readable rather than merely contained.

        Two rather than three, because three is 109px a cell and "Blaupausen"
        does not fit in one - a strip that is only honest in English is the
        thing the truncation was hiding.
      */}
      <nav
        aria-label={h.doorsLabel}
        className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col"
      >
        <Door
          on={open === 'blueprints'}
          onClick={() => setOpen('blueprints')}
          label={h.blueprints}
          note={h.blueprintsNote}
          count={counts.blueprints}
        />
        {/*
          Vehicles, directly under the blueprints they are a kind of.

          A vehicle *is* a blueprint - the same row on the same shelf, with a
          `vehicle` block on its spec - so this door is a filter rather than a
          second shelf, and every control on a row keeps working inside it. It
          gets its own anyway, for the reason Clips does: what you do with a car
          is different enough that finding it among ninety benches is the wrong
          way to spend the trip.

          The two doors *partition* rather than overlap: Blueprints excludes
          anything carrying a vehicle block, so a kart lives behind exactly one
          of them and the counts add up to the shelf. The other reading - both
          doors listing it, on the grounds that a filter hiding a thing from the
          list of all the things is the filter lying - was written here first and
          is wrong about how the counts are read. Two doors whose numbers total
          more than the shelf holds make somebody go looking for the difference,
          and the answer is a duplicate rather than a missing row.
        */}
        {/*
          The sets, directly under the shelf they land on.

          Second rather than last, because it is the answer to the question the
          first door raises on a space that has never used any of this: the
          shelf is empty, the bench asks for a model, and "here are four
          kitchens" is a better second step than the catalogue. The count is how
          many sets there are rather than how many things they hold - a door's
          number is what is behind it, and what is behind this one is four
          cards.
        */}
        <Door
          on={open === 'sets'}
          onClick={() => setOpen('sets')}
          label={h.sets}
          note={h.setsNote}
          count={counts.sets}
        />
        <Door
          on={open === 'vehicles'}
          onClick={() => setOpen('vehicles')}
          label={h.vehicles}
          note={h.vehiclesNote}
          count={counts.vehicles}
        />
        <Door
          on={open === 'clips'}
          onClick={() => setOpen('clips')}
          label={h.clips}
          note={h.clipsNote}
          count={counts.clips}
        />
        {/*
          The menu, between the clips it is made of and the catalogue it is not.

          Ordered by what depends on what: a clip exists on its own, a menu is
          an arrangement *of* clips, and the models are the raw material under
          both. Somebody who has just keyed a wave finds the place to file it
          directly underneath.
        */}
        <Door
          on={open === 'emotes'}
          onClick={() => setOpen('emotes')}
          label={h.emotes}
          note={h.emotesNote}
          count={counts.emotes}
        />
        <Door
          on={open === 'models'}
          onClick={() => setOpen('models')}
          label={h.models}
          note={h.modelsNote}
          count={counts.models}
        />
      </nav>

      <section className="min-w-0 space-y-4">
        {/*
          The door's name and the verb that makes one, on one line.

          The panel used to draw its own heading and the button floated above
          it, so the page said "Blueprints" in the door, "The shelf" a line
          later, and put the control between them - one thing named twice in two
          vocabularies with a button wedged in the gap. The heading belongs to
          whoever knows which door is open, which is here.

          One verb per door, and only where making is a thing: you do not make a
          model, and a third button reading "new model" beside two that work
          would be the surface's one lie. See `Making`.
        */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/40 pb-3">
          <h2 className="font-pixel text-lg uppercase leading-none text-ink">
            {h[open]}
          </h2>
          <Making door={open} slug={slug} prices={prices} t={t} />
        </div>
        {panels[open]}
      </section>
    </div>
  )
}

/**
 * One door.
 *
 * The count is on it because "how much is in here" is most of what decides
 * whether to open one, and because an empty shelf that says so is a shelf
 * somebody knows to fill rather than one they think is broken.
 */
function Door({
  on,
  onClick,
  label,
  note,
  count,
}: {
  on: boolean
  onClick: () => void
  label: string
  note: string
  count: number
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition ${
        on
          ? 'border-accent/60 bg-accent/10 text-ink'
          : 'border-line/60 text-ink-muted hover:border-accent/40 hover:bg-surface-raised hover:text-ink'
      }`}
    >
      <span className="flex items-baseline justify-between gap-2">
        {/*
          Wrapping on a phone and clipped on the rail.

          `truncate` is the right answer in a 13rem column, where a door is one
          line by design; in a two-column grid it is the wrong one, because the
          cells are equal height anyway and a second line costs nothing that an
          ellipsis does not cost more.
        */}
        <span className="min-w-0 text-sm font-medium lg:truncate">{label}</span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-muted">{count}</span>
      </span>
      {/* Hidden below the rail, where a door is a grid cell two or three across
          and the line underneath would wrap each of them to four lines. */}
      <span className="mt-0.5 hidden text-[11px] leading-snug text-ink-muted lg:block">{note}</span>
    </button>
  )
}

/**
 * What the open door lets you make.
 *
 * A blueprint is made *here* and finished at the bench, so this is the one
 * control that has to exist before there is anything to edit. A clip is made in
 * the pose editor, which is a different page with a rig in it, so that one is a
 * link rather than a button - there is nothing to create until somebody has
 * posed something.
 */
function Making({
  door,
  prices,
  slug,
  t,
}: {
  door: DoorId
  slug: string
  prices: { blueprint: number; vehicle: number; clip: number }
  t: WorkspaceDict['thingiverse']
}) {
  const h = t.hub

  if (door === 'clips') {
    return (
      <Link
        href={`/t/${slug}/thingiverse/clips`}
        className="inline-flex rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-ink transition hover:border-accent/70"
      >
        {h.newClip}
        {/* What saving one will cost, on the control that starts the work
            rather than at the end of it. `saveClip` charges the same number -
            see `nextPrice` - and a price somebody meets after posing a
            character for ten minutes is a price they meet too late. */}
        <CoinPrice coins={prices.clip} />
      </Link>
    )
  }

  if (door === 'models') {
    return <p className="text-xs leading-relaxed text-ink-muted">{h.modelsHint}</p>
  }

  /*
    A set makes nothing from here: the button that adds one is on the card,
    because there are four of them and a single verb at the top of the panel
    could only mean the first.
  */
  if (door === 'sets') return null

  /*
    The menu makes nothing. It is one document that is always there - a space
    with no menu has an empty menu, not an absent one - so there is no "new" to
    press, and its own Save lives with the outline it saves.
  */
  if (door === 'emotes') return null

  const vehicle = door === 'vehicles'
  return (
    <NewBlueprint
      slug={slug}
      price={vehicle ? prices.vehicle : prices.blueprint}
      t={t}
      vehicle={vehicle}
    />
  )
}

/**
 * Start one.
 *
 * ---------------------------------------------------------------------------
 * Why it is created here rather than at the bench
 * ---------------------------------------------------------------------------
 * The bench edits a blueprint by id: it loads one, and every control on it
 * sends a command against that stream. A "draft" mode with no id would be a
 * second, parallel set of behaviours for every control on the page - save
 * becomes create, the socket panel has nothing to attach to, and the address
 * bar holds a thing that does not exist.
 *
 * So the door creates it and the bench opens it. What it is created *as* is the
 * decision worth writing down: a plain cube from the block pack, because
 * `BlueprintSpec.model` is required and something has to stand in the viewport
 * for the bench to be a bench. The first thing the bench offers is swapping it,
 * and a cube is the one model in the catalogue nobody will mistake for a
 * finished choice.
 */
function NewBlueprint({
  slug,
  price,
  t,
  /**
   * Whether to start a car rather than a bare thing.
   *
   * One button with a flag rather than two components, because the two do the
   * same three steps - write a spec, take the id, go to the bench - and differ
   * only in what they write.
   */
  vehicle,
}: {
  slug: string
  /** What pressing this costs. Zero draws nothing - see `CoinPrice`. */
  price: number
  t: WorkspaceDict['thingiverse']
  vehicle?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const spec = vehicle ? exampleCar() : freshSpec(BLANK)
            /*
              Named for what it is about to become, not for the placeholder.

              `nameForModel(BLANK)` would call it "Block" - and a shelf filling
              up with things named after whatever model happened to be under
              them is the exact failure that took the make-a-blueprint button
              off the catalogue. The bench opens with the name field in reach,
              so the only job this name has is to be obviously provisional.
            */
            const result = await attempt(() =>
              drawBlueprint(slug, {
                name: vehicle ? t.hub.exampleCarName : t.hub.untitled,
                spec,
              }),
            )
            if (!result.ok) {
              setError(result.error ?? 'Refused')
              return
            }
            router.push(`/t/${slug}/thingiverse/blueprint/${result.id}`)
          })
        }
        className="summon-cta cta-pixel rounded-full px-5 py-2.5 text-sm transition disabled:cursor-not-allowed"
      >
        {pending ? t.hub.starting : vehicle ? t.hub.newVehicle : t.hub.newBlueprint}
        {/*
          On the button that spends it, and never while it is spending: a price
          beside "Starting…" is a number somebody is reading after the decision
          is made. A vehicle is deliberately *not* priced separately here - it
          is a blueprint with a `vehicle` block, drawn by the same action and
          counted against the same allowance, and `EXTRA_PRICES.vehicles` is
          charged where a blueprint actually becomes one.
        */}
        {!pending && <CoinPrice coins={price} />}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * What a blueprint stands as before anybody has chosen anything.
 *
 * ---------------------------------------------------------------------------
 * It was `proto/block`, and that model does not exist
 * ---------------------------------------------------------------------------
 * Reported as "create blueprint from empty dont work", and the failure was two
 * steps removed from where it looked. The blueprint was written fine; the bench
 * then opened onto `/xo/proto/block.gltf`, which 404s, so `useGLTF` threw
 * inside the canvas and the whole editor came up dead.
 *
 * `knownModel` said yes, and it was not lying about what it checks: it asks
 * whether the *pack* is one we ship and builds a path from the name, so any
 * `proto/<anything>` passes. Nothing in the domain reads the disk - deliberately
 * (see the note on `knownModel`) - so a name that is spelled right for a file
 * that was never there is exactly the gap it cannot close.
 *
 * A crate, then, and picked by checking that both the glTF and the thumbnail
 * actually serve. Not a bench or a chair, which would read as a decision
 * somebody made; a crate is the most obviously provisional object in the
 * catalogue, and the bench opens with "use a different model" one panel away.
 */
const BLANK = 'bb10/crate'

/**
 * A car that actually drives, as the thing the button makes.
 *
 * ---------------------------------------------------------------------------
 * Why the "new vehicle" button makes a *worked example* rather than a stub
 * ---------------------------------------------------------------------------
 * A vehicle is the one blueprint with a shape you cannot guess at. `drivable()`
 * wants the block *and* a `use` with at least one seat, because seat zero is
 * the wheel - so an empty vehicle spec is a car nobody can get into, and the
 * refusal for that arrives from the server after somebody has spent ten minutes
 * placing wheels. Every other door here makes something that is immediately the
 * least surprising version of itself; this makes one too, and for a vehicle the
 * least surprising version is one you can drive.
 *
 * ---------------------------------------------------------------------------
 * A cars-pack body, with no wheels in the block
 * ---------------------------------------------------------------------------
 * Which looks like the block is unfinished and is the opposite. The catalogue's
 * own vehicles ship their wheels *in the glTF*, as nodes named `wheel-*`, and
 * the renderer finds and spins those without being told - front ones steering.
 * `wheels` exists for the other case: a body with none of its own, or a crate
 * somebody is turning into a soapbox. Bolting four on here would put a second
 * set of wheels through the first.
 *
 * `hideDriver` because this one has a roof, and a peep drawn at the wheel of a
 * hatchback stands through it.
 */
function exampleCar(): BlueprintSpec {
  return {
    ...freshSpec(CAR),
    // Scenery rather than a falling body: a car that is dropped on its roof at
    // the moment it is summoned is not a car anybody wants to find.
    body: null,
    vehicle: { ...freshVehicle(), hideDriver: true },
    // One seat, at the origin, which is the wheel. `drivable()` refuses without
    // it, and the bench is where it gets nudged onto the actual seat.
    use: freshUse(),
  }
}

/** The body the example is built on. Ships its own wheels - see `exampleCar`. */
const CAR = 'xp:cars/hatchback-sports'
