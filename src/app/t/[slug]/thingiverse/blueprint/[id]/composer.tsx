'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import { type BoxHandle, Stage } from '@/app/t/[slug]/thingiverse/blueprint/[id]/stage'
import { BodyStage } from '@/app/world/_canvas/body-stage'
import {
  freshHold,
  HANDS,
  MAX_HOLD_OFFSET,
  MAX_HOLD_SCALE,
  MIN_HOLD_SCALE,
  type HoldSpec,
} from '@/domain/thingiverse/hold'
import {
  freshCrusher,
  freshLift,
  MAX_MOVE,
  MAX_MOVE_SECONDS,
  MAX_MOVE_WAIT,
  MIN_MOVE_SECONDS,
  type MotionSpec,
} from '@/domain/thingiverse/motion'
import { Rig } from '@/app/world/shots/pieces'
import { AVATAR_CLIPS } from '@/domain/lounge/avatars'
import { findParts, renameBlueprint, reshapeBlueprint } from '@/domain/thingiverse/actions'
import {
  type BlueprintPart,
  type BlueprintSpec,
  blueprintProblems,
  freshPart,
  freshUse,
  MAX_BLUEPRINT_NAME,
  MAX_COLLIDER_SIZE,
  MAX_PART_OFFSET,
  MIN_COLLIDER_SIZE,
  MAX_PARTS,
  MAX_SEATS,
  MAX_SOCKET_NAME,
  MAX_SOCKETS_PER_PART,
  MAX_THING_SCALE,
  MIN_THING_SCALE,
  type Socket,
  socketsOf,
} from '@/domain/thingiverse/blueprint'
import { type ModelHit, modelLabel, thumbnailFor } from '@/domain/thingiverse/models'
import {
  CHANGE_WHENS,
  type Change,
  freshRespawn,
  freshStates,
  MAX_CHANGE_SECONDS,
  MAX_CHANGES_PER_STATE,
  MAX_SIGNAL_NAME,
  MAX_STATE_NAME,
  MAX_STATES,
  MIN_CHANGE_SECONDS,
  type States,
  type ThingState,
} from '@/domain/thingiverse/states'
import {
  type FightSpec,
  freshHealth,
  freshShot,
  freshWeapon,
  HURTS,
  MAX_THING_HEALTH,
  MIN_THING_HEALTH,
  WEAPON_LIMITS,
} from '@/domain/thingiverse/fight'
import {
  type CraftSpec,
  freshCraft,
  MAX_ITEM_NAME,
  MAX_PRICE,
  MAX_RECIPE_ITEMS,
  MAX_RECIPE_SECONDS,
  MAX_RECIPES,
  MAX_SLOTS,
  type RecipeSpec,
  type SlotSpec,
} from '@/domain/thingiverse/craft'
import {
  freshVehicle,
  freshWheel,
  MAX_WHEEL_OFFSET,
  MAX_WHEEL_SCALE,
  MAX_WHEELS,
  MIN_WHEEL_SCALE,
  VEHICLE_LIMITS,
  type WheelSpec,
} from '@/domain/thingiverse/vehicle'
import type { BlueprintView, ClipView } from '@/domain/thingiverse/queries'
import { CoinPrice } from '@/app/components/coin-price'
import { toClip } from '@/app/world/_canvas/baked-clip'
import * as THREE from 'three'
import { DEFAULT_LIGHT } from '@/domain/studio/scene'
import { MAX_COLLIDER_BOXES, type PlacementBox } from '@kxb/xp/blueprints'

/**
 * The bench a thing is built on.
 *
 * ---------------------------------------------------------------------------
 * The shape is the studio's, and that is a decision rather than a copy
 * ---------------------------------------------------------------------------
 * A viewport that keeps the screen, a column of controls beside it that
 * scrolls, and one row of verbs under the viewport. `/ovaloffice/studio` and
 * the pose animator are both this, and they are both this because a spatial
 * editor has exactly one thing that must never move: the thing you are looking
 * at. Controls that push the viewport around while you are placing a lamp make
 * you re-find the lamp after every edit.
 *
 * What is *not* borrowed is the studio's palette. It was built on the shadcn
 * tokens that came with the backoffice - `border-border`, `bg-primary`,
 * `text-muted-foreground` - and this is a member-facing surface, where the
 * house tokens are the system. Same composition, this product's colours.
 *
 * ---------------------------------------------------------------------------
 * One selection, and it drives both halves
 * ---------------------------------------------------------------------------
 * `-1` is the root, a number is a part, `null` is nothing. The stage fades
 * everything that is not selected and the aside opens that piece's controls -
 * one value, two views, so a piece clicked in the viewport is the piece whose
 * numbers are on screen and there is no third state where they disagree.
 *
 * Deliberately not a `Set`: multi-select would need a transform applied to
 * several pieces at once, which is a gizmo, and there is no gizmo here yet.
 * Offering the selection without the operation is offering a mode that does
 * nothing.
 */
export function Composer({
  slug,
  blueprint,
  vehiclePrice = 0,
  body,
  clips,
  t,
}: {
  slug: string
  blueprint: BlueprintView
  /**
   * What making this a vehicle costs, in coins.
   *
   * Every plan holds zero vehicles, so unless an operator has comped this space
   * on `vehicle_limit` the box always costs something once the economy is on -
   * which is exactly why the number has to be beside it rather than discovered
   * by a purse that emptied. `reshapeBlueprint` charges the same figure, from
   * the same `nextPrice`, and only on the save that first adds the block.
   *
   * Defaulted, because a blueprint that already is one has nothing to buy.
   */
  vehiclePrice?: number
  /**
   * The body the grip preview draws, which is *this* reader's own.
   *
   * Their own rather than a stock mannequin, because the question the preview
   * answers is "does this sit right in a hand", and a hand is a fact about a
   * body: an XP rig has one and a peep has four legs and no arms. Somebody
   * posing a grip on the body they walk around in is somebody posing it on the
   * body they will see it on.
   */
  body: { avatar: string; skin: string | null }
  /**
   * What this space has animated, for the seat pickers and the preview.
   *
   * The space's own only; the body's four are added below. A picker rather than
   * a text field is the whole point - a clip name that finds nothing leaves the
   * body in its last pose, which looks exactly like the field not working, and
   * the only way to type one correctly is to have the list. The samples come
   * with it so the body in the first seat can be seen doing what was chosen.
   */
  clips: readonly ClipView[]
  t: WorkspaceDict['thingiverse']
}) {
  const router = useRouter()
  const c = t.composer

  const [name, setName] = useState(blueprint.name)
  const [spec, setSpec] = useState<BlueprintSpec>(blueprint.spec)
  const [selected, setSelected] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  /**
   * What the viewport is drawing besides the models.
   *
   * On by default and switchable, because the two marker sets answer different
   * questions and get in each other's way: eight seats and six sockets on one
   * kart is a cloud of rings, and the person placing the driver's seat wants to
   * see the driver's seat.
   */
  const [showSockets, setShowSockets] = useState(true)
  const [showSeats, setShowSeats] = useState(true)

  /**
   * The clip the Machine panel asked the viewport to play, and what it found.
   *
   * State rather than a prop threaded only to `Machine`, because it is the
   * *viewport* that plays it - see `Stage`'s `playClip` - and the panel that
   * asked is three components away from the canvas that can answer. `clipFound`
   * starts true so a thing with no machine at all never shows a false refusal.
   */
  const [previewClip, setPreviewClip] = useState<string | null>(null)
  const [clipFound, setClipFound] = useState(true)

  /** Standing the reader's own body up in the vehicle's first seat. See `Vehicle`. */
  const [previewDriver, setPreviewDriver] = useState(false)

  /**
   * Blocking it out: which box has the handles, and which handles they are.
   *
   * A mode rather than a panel that is always on. The boxes are drawn over the
   * model and one of them is nearly always as big as the thing, so a viewport
   * that showed them while somebody was placing a lamp would be a viewport with
   * a translucent crate in front of the lamp. Off unless you are blocking out,
   * and on the moment you draw the first box - which is the one time nobody has
   * to be told to turn it on.
   */
  const [showCollide, setShowCollide] = useState(false)
  const [pickedBox, setPickedBox] = useState<number | null>(null)
  const [boxHandle, setBoxHandle] = useState<BoxHandle>('move')

  /**
   * How big the thing measures, straight off the models. See `Stage.onMeasured`.
   *
   * Null until the first piece has drawn itself, which is a frame or two after
   * the glTFs land - and null is why "start from the measurement" is disabled
   * rather than absent while that is true: a button that appears late reads as
   * a button that was not there a moment ago.
   */
  const [measured, setMeasured] = useState<PlacementBox | null>(null)

  /**
   * Every clip a body here can be asked to play.
   *
   * The pack's own four plus whatever the space animated, deduped and in that
   * order - the same list the lounge builds for `/clip` and the emote menu, and
   * deduped for the same reason: a space may animate one called `dance`, and
   * when it does the space's is the one that plays. One name, one answer.
   */
  const bodyClips = useMemo(
    () => [...new Set([...Object.values(AVATAR_CLIPS), ...clips.map((one) => one.name)])],
    [clips],
  )

  /**
   * A clip name, built into something the preview body can play.
   *
   * Cached, because `toClip` allocates a `Float32Array` per bone track and the
   * viewport asks for the same seat's clip on every render of the panel beside
   * it. Null for a name this space has not animated, which includes all four of
   * the pack's own - those are played by name instead. See `BodyModel.pose`.
   */
  /**
   * A ref rather than state, and read only from inside the callback below -
   * which is where a cache belongs: it is not something anything renders from,
   * and the compiler is right that a value built during render must not be
   * quietly written to afterwards.
   */
  const poseCache = useRef<{
    from: unknown
    made: Map<string, THREE.AnimationClip | null>
  }>({ from: null, made: new Map() })
  const poseNamed = useCallback(
    (name: string) => {
      // Emptied when the clip list is a different one, so a name that used to
      // miss is looked up again rather than answered from a cache built before
      // the space animated it.
      const cache = poseCache.current
      if (cache.from !== clips) {
        cache.from = clips
        cache.made.clear()
      }

      const held = cache.made.get(name)
      if (held !== undefined) return held

      const found = clips.find((one) => one.name === name)
      const made = found ? toClip(found.clip) : null
      cache.made.set(name, made)
      return made
    },
    [clips],
  )

  const parts: readonly BlueprintPart[] = spec.parts ?? []
  const problems = [
    ...blueprintProblems(spec),
    ...(name.trim() === '' ? [t.nameNeeded] : []),
    ...(name.length > MAX_BLUEPRINT_NAME
      ? [fill(t.nameTooLong, { n: String(MAX_BLUEPRINT_NAME) })]
      : []),
  ]

  const change = (patch: Partial<BlueprintSpec>) =>
    setSpec((current) => ({ ...current, ...patch }))

  const changePart = (index: number, patch: Partial<BlueprintPart>) =>
    change({ parts: parts.map((one, at) => (at === index ? { ...one, ...patch } : one)) })

  /**
   * Every socket on the thing, by name, for the panels that point at one.
   *
   * Flattened here rather than in each of them, because three now ask the same
   * question - a seat sits on one, a muzzle fires from one, and a place to put
   * something is one - and `socketsOf` is the single answer that already
   * applies each piece's own transform.
   */
  const allSockets: readonly string[] = socketsOf(spec)
    .map((one) => one.name)
    .filter(Boolean)

  /** The sockets on whichever piece is selected, and the setter for them. */
  const socketsHere: readonly Socket[] =
    selected === null ? [] : selected === -1 ? (spec.sockets ?? []) : parts[selected].sockets

  const setSockets = (next: readonly Socket[]) => {
    if (selected === null) return
    if (selected === -1) change({ sockets: next })
    else changePart(selected, { sockets: next })
  }

  const save = () =>
    start(async () => {
      setNote(null)

      // The name first and only when it changed, exactly as the shelf's row
      // does: two commands against one stream, and the second is refused for
      // nothing if the first is sent every time somebody presses Save.
      if (name.trim() !== blueprint.name) {
        const renamed = await attempt(() => renameBlueprint(slug, { id: blueprint.id, name }))
        if (!renamed.ok) {
          setNote(renamed.error ?? 'Refused')
          return
        }
      }

      const result = await attempt(() => reshapeBlueprint(slug, { id: blueprint.id, spec }))
      if (!result.ok) {
        setNote(result.error ?? 'Refused')
        return
      }

      setNote(t.saved)
      router.refresh()
    })

  return (
    /*
      `page-bare` is not decoration: globals.css keys three rules off it that
      take the roster panel away and let this column have the window. See the
      block there - none of the three elements it moves are in this subtree.
    */
    <div className="page-bare flex h-viewport-inset min-h-0 w-full flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-pixel text-xl uppercase leading-none text-ink">{c.heading}</h1>
        <Link
          href={`/t/${slug}/browse`}
          className="text-xs text-ink-muted underline decoration-line hover:text-ink"
        >
          {c.backToShelf}
        </Link>
        <p className="basis-full text-xs text-ink-muted sm:basis-auto">{c.intro}</p>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/*
          The viewport, and the verbs directly under it.

          Under rather than over: a toolbar floating on the canvas costs the
          part of the frame a thing is most often standing in, and these are all
          things you press between looks rather than while looking.
        */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-2xl border border-line/60 bg-sky">
            <Canvas
              shadows="percentage"
              dpr={[1, 2]}
              camera={{ position: [2.6, 2, 3.2], fov: 40, near: 0.05, far: 100 }}
              // Clicking past every piece is how you let go of a selection, and
              // it is the gesture people already expect from every editor: the
              // background is "nothing", so clicking it selects nothing.
              onPointerMissed={() => setSelected(null)}
            >
              <OrbitControls
                makeDefault
                target={[0, 0.5, 0]}
                enableDamping={false}
                // Not below the floor: a composer looking up through the ground
                // at the underside of a bench is a view nobody asked for and is
                // the one place the light does not reach.
                maxPolarAngle={Math.PI / 1.9}
                minDistance={0.8}
                maxDistance={18}
                zoomToCursor
              />
              <Rig light={DEFAULT_LIGHT} radius={6} />
              <Ground />
              <Stage
                spec={spec}
                selected={selected}
                onPick={setSelected}
                showSockets={showSockets}
                showSeats={showSeats}
                collide={
                  showCollide
                    ? {
                        boxes: spec.collider ?? [],
                        picked: pickedBox,
                        handle: boxHandle,
                        onPick: setPickedBox,
                        onChange: (index, box) =>
                          change({
                            collider: (spec.collider ?? []).map((one, at) =>
                              at === index ? box : one,
                            ),
                          }),
                      }
                    : null
                }
                onMeasured={setMeasured}
                poseFor={poseNamed}
                playClip={previewClip}
                onClipStatus={setClipFound}
                driver={previewDriver ? body : null}
              />
            </Canvas>

            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-lg bg-sky/80 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted backdrop-blur">
                {selected === null
                  ? c.nothingPicked
                  : selected === -1
                    ? modelLabel(spec.model)
                    : modelLabel(parts[selected].model)}
              </span>
              <div className="pointer-events-auto flex gap-1.5">
                <Toggle on={showSockets} onChange={setShowSockets} label={c.showSockets} />
                <Toggle on={showSeats} onChange={setShowSeats} label={c.showSeats} />
                <Toggle on={showCollide} onChange={setShowCollide} label={c.showCollide} />
                {/*
                  Which handles, and only while one box is being held.

                  Beside the mode switch rather than in the panel, because it is
                  a question about the *viewport* - the answer changes what the
                  handles under your pointer do, and a control for that three
                  hundred pixels away in a scrolling column is a control nobody
                  finds while dragging.
                */}
                {showCollide && pickedBox !== null && (
                  <>
                    <Toggle
                      on={boxHandle === 'move'}
                      onChange={() => setBoxHandle('move')}
                      label={c.boxMoved}
                    />
                    <Toggle
                      on={boxHandle === 'size'}
                      onChange={() => setBoxHandle('size')}
                      label={c.boxSized}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <input
              value={name}
              maxLength={MAX_BLUEPRINT_NAME}
              onChange={(event) => setName(event.target.value)}
              aria-label={t.name}
              className="w-48 rounded-lg border border-line/60 bg-surface px-3 py-2 text-sm text-ink"
            />
            <button
              type="button"
              disabled={pending || problems.length > 0}
              onClick={save}
              className="rounded-lg border border-emerald-400/50 px-4 py-2 text-xs text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-40"
            >
              {pending ? c.saving : t.save}
            </button>
            {note && <span className="text-[11px] text-ink-muted">{note}</span>}
            {problems.length > 0 && (
              <span className="text-[11px] text-red-400">
                {fill(c.problems, { n: String(problems.length) })}
              </span>
            )}
          </div>
        </div>

        {/*
          The controls.

          One scroller, so the viewport beside it never moves. Sections rather
          than cards: these are parts of one document being edited, not a set of
          peers to choose between, and boxing each one would put four borders
          between the pieces list and the seats that sit on those pieces.
        */}
        <aside className="min-h-0 overflow-y-auto overscroll-contain pr-1 lg:pb-4">
          <div className="space-y-6">
            <Pieces
              spec={spec}
              parts={parts}
              selected={selected}
              onPick={setSelected}
              onChange={changePart}
              onRemove={(index) => {
                change({ parts: parts.filter((_, at) => at !== index) })
                setSelected(null)
              }}
              onRoot={(patch) => change(patch)}
              c={c}
            />

            {parts.length < MAX_PARTS && (
              <AddPiece
                slug={slug}
                c={c}
                heading={c.addPiece}
                onAdd={(model) => {
                  change({ parts: [...parts, freshPart(model)] })
                  setSelected(parts.length)
                }}
              />
            )}

            {/*
              Changing what a piece *is*.

              The gap this closes is one the hub opened: "Start a blueprint"
              creates a plain cube, on the argument that `BlueprintSpec.model`
              is required and something has to stand in the viewport - and the
              whole of that argument rests on the bench offering to swap it
              first. It did not. A blueprint you cannot get the placeholder out
              of is a placeholder somebody ships.

              It swaps the *model* and keeps everything else - where the piece
              sits, which way it faces, its size and its sockets - because that
              is what somebody trying a different crate means. Removing and
              re-adding would lose all four and the socket names that a seat or
              a grip is pointing at.
            */}
            {selected !== null && (
              <AddPiece
                slug={slug}
                c={c}
                heading={fill(c.swapFor, {
                  where:
                    selected === -1 ? modelLabel(spec.model) : modelLabel(parts[selected].model),
                })}
                onAdd={(model) => {
                  if (selected === -1) change({ model })
                  else changePart(selected, { model })
                }}
              />
            )}

            {selected !== null && (
              <Sockets
                sockets={socketsHere}
                onChange={setSockets}
                where={selected === -1 ? modelLabel(spec.model) : modelLabel(parts[selected].model)}
                c={c}
              />
            )}

            {/*
              What you bump into, directly under what the thing is made of: the
              boxes are drawn against the pieces above and are meaningless
              without them, and every question this panel answers - can I walk
              through the arch, can I get under the table - is a question about
              the models in the list it follows.
            */}
            <Blocking
              spec={spec}
              measured={measured}
              picked={pickedBox}
              onPick={(index) => {
                setPickedBox(index)
                if (index !== null) setShowCollide(true)
              }}
              onChange={change}
              c={c}
            />

            <Seats spec={spec} clips={bodyClips} onChange={change} c={c} t={t} />

            {/*
              How it sits in a hand, directly under how a body sits *on* it.

              The two are the same question asked from either end - where the
              body and the thing meet - and putting them together is what makes
              a bench and a bat read as two answers rather than two features.
            */}
            <Grip spec={spec} body={body} onChange={change} c={c} />

            {/*
              And where it goes on its own, under the two panels about where a
              body meets it: a lift is furniture that will not stay still, and
              the question it raises - can I stand on that - is the one the
              seats above just answered for a bench.
            */}
            <Moving spec={spec} onChange={change} c={c} />

            <Vehicle
              slug={slug}
              spec={spec}
              price={vehiclePrice}
              onChange={change}
              c={c}
              previewDriver={previewDriver}
              onPreviewDriver={setPreviewDriver}
            />

            {/*
              The three that make a thing more than furniture: what it can be,
              what it can take, and what can be put on it. Below the vehicle
              rather than above it because they are the least common - a shelf
              is mostly benches - and a panel somebody scrolls past is cheaper
              than one they scroll through.
            */}
            <Machine
              spec={spec}
              onChange={change}
              c={c}
              previewing={previewClip}
              clipFound={clipFound}
              onPreview={setPreviewClip}
            />

            <Fighting slug={slug} spec={spec} onChange={change} c={c} />

            <Crafting spec={spec} sockets={allSockets} onChange={change} c={c} />

            {problems.length > 0 && (
              <ul className="space-y-1 text-[11px] text-red-400">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

/**
 * The floor, so a piece lifted off it looks lifted.
 *
 * A grid rather than a solid plane: the numbers in the panel are in cells, and
 * a floor ruled in cells is the only thing in the viewport that makes "x: 2"
 * checkable by eye. Unlit and thin, because it is a ruler and not scenery.
 */
function Ground() {
  return (
    <gridHelper
      args={[16, 16, '#f0abfc', '#3b3357']}
      position={[0, 0, 0]}
      // The lines would otherwise fight the models resting exactly on zero and
      // flicker as the camera moves.
      renderOrder={-1}
    />
  )
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`rounded-lg border px-2 py-1 text-[10px] uppercase tracking-[0.14em] backdrop-blur transition ${
        on
          ? 'border-accent/60 bg-accent/20 text-ink'
          : 'border-line/60 bg-sky/80 text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * The pieces, root first.
 *
 * The root is a row in the same list rather than a panel of its own, because it
 * is the same kind of thing to the person composing - a model, somewhere, at
 * some size - and the two differences (it cannot be moved, it cannot be
 * removed) are visible as the absence of those controls rather than needing a
 * heading to explain them. It sits at the origin because that is what "the
 * root" means; everything else is measured from it.
 */
function Pieces({
  spec,
  parts,
  selected,
  onPick,
  onChange,
  onRemove,
  onRoot,
  c,
}: {
  spec: BlueprintSpec
  parts: readonly BlueprintPart[]
  selected: number | null
  onPick: (index: number | null) => void
  onChange: (index: number, patch: Partial<BlueprintPart>) => void
  onRemove: (index: number) => void
  onRoot: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
}) {
  return (
    <section className="space-y-2">
      <Heading>{fill(c.pieces, { n: String(parts.length + 1) })}</Heading>

      <ul className="space-y-1.5">
        <li>
          <Row
            model={spec.model}
            note={c.theRoot}
            on={selected === -1}
            onPick={() => onPick(selected === -1 ? null : -1)}
          >
            <Number
              label={c.size}
              value={spec.scale}
              step={0.1}
              min={MIN_THING_SCALE}
              max={MAX_THING_SCALE}
              onChange={(scale) => onRoot({ scale })}
            />
          </Row>
        </li>

        {parts.map((part, index) => (
          <li key={index}>
            <Row
              model={part.model}
              note={`${part.at.x}, ${part.at.y}, ${part.at.z}`}
              on={selected === index}
              onPick={() => onPick(selected === index ? null : index)}
            >
              <Nudge
                at={part.at}
                turn={part.turn}
                scale={part.scale}
                c={c}
                onMove={(at) => onChange(index, { at })}
                onTurn={(turn) => onChange(index, { turn })}
                onScale={(scale) => onChange(index, { scale })}
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="w-full rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/10"
              >
                {c.removePiece}
              </button>
            </Row>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One piece: always its picture and its name, and its numbers only while it is
 * the one selected.
 *
 * Rather than every row carrying six fields, which is what a twelve-piece stall
 * would make of this column - eighty-four inputs, of which six are the ones
 * anybody is looking at. The row is the handle; the selection is the edit.
 */
function Row({
  model,
  note,
  on,
  onPick,
  children,
}: {
  model: string
  note: string
  on: boolean
  onPick: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`rounded-xl border transition ${
        on ? 'border-accent/50 bg-accent/10' : 'border-line/60 bg-surface'
      }`}
    >
      <button
        type="button"
        aria-expanded={on}
        onClick={onPick}
        className="flex w-full items-center gap-2 p-2 text-left"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailFor(model)}
          alt=""
          loading="lazy"
          className="size-9 shrink-0 rounded bg-surface-raised object-contain"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-ink">{modelLabel(model)}</span>
          <span className="block truncate font-mono text-[10px] text-ink-muted">{note}</span>
        </span>
      </button>
      {on && <div className="space-y-1.5 border-t border-line/50 p-2">{children}</div>}
    </div>
  )
}

/**
 * Adding a piece.
 *
 * The search runs on the server (`findParts`) rather than against an imported
 * catalogue, because importing it would ship 5,770 entries to every browser
 * that opens this. The results are a grid of pictures: which crate you want is
 * a question about what it looks like, and its id answers that for nobody.
 */
function AddPiece({
  slug,
  onAdd,
  c,
  /**
   * What the section calls itself, and what pressing a tile does.
   *
   * The same picker serves both jobs it has - putting a new piece on, and
   * changing the model of the one you have selected - because the *act* is
   * identical: type a word, look at pictures, press one. Two copies would be
   * two search boxes that drift apart the first time either gets a filter.
   */
  heading,
}: {
  slug: string
  onAdd: (model: string) => void
  c: WorkspaceDict['thingiverse']['composer']
  heading: string
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ModelHit[] | null>(null)
  const [looking, start] = useTransition()

  const look = () =>
    start(async () => {
      const found = await findParts(slug, query)
      setHits(found)
    })

  return (
    <section className="space-y-2">
      <Heading>{heading}</Heading>

      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            look()
          }}
          placeholder={c.searchPieces}
          aria-label={c.searchPieces}
          className="min-w-0 flex-1 rounded-lg border border-line/60 bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-muted"
        />
        <button
          type="button"
          onClick={look}
          disabled={looking}
          className="shrink-0 rounded-lg border border-line/60 px-2.5 py-1.5 text-xs text-ink transition hover:bg-surface-raised disabled:opacity-40"
        >
          {looking ? c.looking : c.look}
        </button>
      </div>

      {hits !== null &&
        (hits.length === 0 ? (
          <p className="text-[11px] text-ink-muted">{fill(c.noPieces, { q: query.trim() })}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => onAdd(hit.id)}
                  title={hit.id}
                  className="w-full rounded-lg border border-line/60 bg-surface p-1 transition hover:border-accent/50 hover:bg-surface-raised"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailFor(hit.id)}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full rounded bg-surface-raised object-contain"
                  />
                  <span className="mt-1 block truncate text-[10px] text-ink-muted">
                    {hit.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}

/**
 * The sockets on the selected piece.
 *
 * Named here and pointed at from elsewhere - a seat says which socket it sits
 * on, and a held item will say which one it is gripped by. The name is the
 * whole interface, which is why it is the first field and why a blank one is
 * marked rather than silently dropped.
 */
function Sockets({
  sockets,
  onChange,
  where,
  c,
}: {
  sockets: readonly Socket[]
  onChange: (next: readonly Socket[]) => void
  where: string
  c: WorkspaceDict['thingiverse']['composer']
}) {
  const set = (index: number, patch: Partial<Socket>) =>
    onChange(sockets.map((one, at) => (at === index ? { ...one, ...patch } : one)))

  return (
    <section className="space-y-2">
      <Heading>{fill(c.socketsOn, { where })}</Heading>
      <p className="text-[11px] leading-relaxed text-ink-muted">{c.socketsHint}</p>

      {sockets.map((socket, index) => (
        <div key={index} className="space-y-1.5 rounded-xl border border-line/60 bg-surface p-2">
          <div className="flex gap-1.5">
            <input
              value={socket.name}
              maxLength={MAX_SOCKET_NAME}
              onChange={(event) => set(index, { name: event.target.value })}
              placeholder={c.socketName}
              aria-label={c.socketName}
              className="min-w-0 flex-1 rounded-lg border border-line/60 bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-muted"
            />
            <button
              type="button"
              onClick={() => onChange(sockets.filter((_, at) => at !== index))}
              className="shrink-0 rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/10"
            >
              {c.remove}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <Number
                key={axis}
                label={axis.toUpperCase()}
                value={socket.at[axis]}
                step={0.1}
                min={-MAX_PART_OFFSET}
                max={MAX_PART_OFFSET}
                onChange={(value) => set(index, { at: { ...socket.at, [axis]: value } })}
              />
            ))}
            <Number
              label={c.turn}
              value={socket.turn}
              step={1}
              min={0}
              max={3}
              onChange={(turn) => set(index, { turn })}
            />
          </div>
        </div>
      ))}

      {sockets.length < MAX_SOCKETS_PER_PART && (
        <button
          type="button"
          onClick={() =>
            onChange([...sockets, { name: '', at: { x: 0, y: 0, z: 0 }, turn: 0 }])
          }
          className="w-full rounded-lg border border-line/60 px-2 py-1.5 text-xs text-ink transition hover:bg-surface-raised"
        >
          {c.addSocket}
        </button>
      )}
    </section>
  )
}

/**
 * What you bump into.
 *
 * ---------------------------------------------------------------------------
 * Why this panel exists at all, when a switch already answered the question
 * ---------------------------------------------------------------------------
 * `blocking` says whether a thing stops you and the room works out *where* by
 * measuring the model - which is right for a crate and wrong for a surprising
 * amount of furniture, always in the same direction. The measurement is a box
 * around everything drawn, so an arch is solid across its opening, a table is
 * solid from the floor to its top, and a parasol is a pole that blocks whatever
 * its canopy hangs over. See `BlueprintSpec.collider`.
 *
 * None of those can be fixed by measuring better, because the measurement is
 * answering the only question it can. What is needed is somebody who can *see*
 * the thing saying "here, and here, and not in between" - so this is a list of
 * boxes, drawn in the viewport, dragged with a handle, and typed as numbers
 * when a handle is not precise enough.
 *
 * ---------------------------------------------------------------------------
 * Two ways in, because there are two kinds of thing
 * ---------------------------------------------------------------------------
 * "Start from the model" fills a box with what the room would have measured
 * anyway, which is the right first move for anything that is *mostly* right: an
 * arch is its own bounds minus the doorway, so you take the measurement, shrink
 * it to one leg, and add a second. "Add a box" starts at one cell at the
 * origin, which is the right first move for a thing whose measurement is
 * nowhere near - a lamppost, where the answer is a pole and nothing else.
 */
function Blocking({
  spec,
  measured,
  picked,
  onPick,
  onChange,
  c,
}: {
  spec: BlueprintSpec
  /** What the viewport measured, or null while the models are still landing. */
  measured: PlacementBox | null
  picked: number | null
  onPick: (index: number | null) => void
  onChange: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
}) {
  const boxes: readonly PlacementBox[] = spec.collider ?? []

  const setBox = (index: number, patch: Partial<PlacementBox>) =>
    onChange({
      collider: boxes.map((one, at) => (at === index ? { ...one, ...patch } : one)),
    })

  const add = (box: PlacementBox) => {
    onChange({ collider: [...boxes, box] })
    onPick(boxes.length)
  }

  return (
    <section className="space-y-2">
      <Heading>{c.collide}</Heading>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={spec.blocking}
          onChange={(event) => onChange({ blocking: event.target.checked })}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block text-xs font-medium text-ink">{c.blocks}</span>
          <span className="block text-[11px] leading-relaxed text-ink-muted">{c.blocksHint}</span>
        </span>
      </label>

      {/*
        The boxes are only offered on something solid. A thing you walk through
        is walked through whatever anybody drew on it - see `colliderOf`, where
        the switch wins - so offering the drawing here would be offering a
        control that does nothing until another one is changed.
      */}
      {spec.blocking && (
        <>
          <p className="text-[11px] leading-relaxed text-ink-muted">{c.collideHint}</p>

          {boxes.map((box, index) => (
            <div
              key={index}
              className={`space-y-1.5 rounded-xl border bg-surface p-2 ${
                picked === index ? 'border-accent/70' : 'border-line/60'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {/*
                  Picking a box here is what puts the handles on it in the
                  viewport, so the two halves of this panel are one selection -
                  the same rule the pieces list and the stage already keep.
                */}
                <button
                  type="button"
                  onClick={() => onPick(picked === index ? null : index)}
                  aria-pressed={picked === index}
                  className="min-w-0 flex-1 rounded-lg border border-line/60 px-2 py-1 text-left text-xs text-ink transition hover:bg-surface-raised"
                >
                  {fill(c.pickBox, { n: String(index + 1) })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ collider: boxes.filter((_, at) => at !== index) })
                    onPick(null)
                  }}
                  className="shrink-0 rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/10"
                >
                  {c.remove}
                </button>
              </div>

              {/*
                Six numbers: a corner and a size, in that order, because that is
                what the format stores and what the catalogue prints. Halving it
                into a middle for the sake of the form would be a second
                convention for one idea. See `PlacementBox`.
              */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <Number
                    key={axis}
                    label={axis.toUpperCase()}
                    value={box[axis] ?? 0}
                    step={0.1}
                    min={-MAX_PART_OFFSET}
                    max={MAX_PART_OFFSET}
                    onChange={(value) => setBox(index, { [axis]: value })}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['w', 'W'],
                    ['h', 'H'],
                    ['d', 'D'],
                  ] as const
                ).map(([axis, label]) => (
                  <Number
                    key={axis}
                    label={label}
                    value={box[axis]}
                    step={0.1}
                    min={MIN_COLLIDER_SIZE}
                    max={MAX_COLLIDER_SIZE}
                    onChange={(value) => setBox(index, { [axis]: value })}
                  />
                ))}
              </div>
            </div>
          ))}

          {measured && (
            <p className="text-[11px] text-ink-muted">
              {fill(c.measuredAs, {
                w: measured.w.toFixed(2),
                h: measured.h.toFixed(2),
                d: measured.d.toFixed(2),
              })}
            </p>
          )}

          {boxes.length < MAX_COLLIDER_BOXES && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => add({ x: -0.5, y: 0, z: -0.5, w: 1, h: 1, d: 1 })}
                className="flex-1 rounded-lg border border-line/60 px-2 py-1.5 text-xs text-ink transition hover:bg-surface-raised"
              >
                {c.addBox}
              </button>
              <button
                type="button"
                disabled={!measured}
                onClick={() => measured && add(measured)}
                className="flex-1 rounded-lg border border-line/60 px-2 py-1.5 text-xs text-ink transition hover:bg-surface-raised disabled:opacity-40"
              >
                {c.fitBox}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Where the bodies stand.
 *
 * The same list the shelf's row editor holds, with one field more: a socket to
 * sit on. Here rather than only there because this is the surface that can
 * *show* you the answer - a seat is three numbers, and three numbers are only
 * checkable against a picture of the bench they are supposed to be on.
 */
function Seats({
  spec,
  clips,
  onChange,
  c,
  t,
}: {
  spec: BlueprintSpec
  /** Every clip a body can play here. See `bodyClips`. */
  clips: readonly string[]
  onChange: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
  t: WorkspaceDict['thingiverse']
}) {
  const use = spec.use
  const named = socketsOf(spec).map((one) => one.name).filter(Boolean)

  return (
    <section className="space-y-2">
      <Heading>{t.seats}</Heading>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={use !== null}
          onChange={(event) => onChange({ use: event.target.checked ? freshUse() : null })}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block text-xs font-medium text-ink">{t.use}</span>
          <span className="block text-[11px] leading-relaxed text-ink-muted">{t.useHint}</span>
        </span>
      </label>

      {/*
        The three moments, in the order they happen.

        Here as well as on the shelf's row editor, and as pickers rather than
        text fields - which is the difference that matters. A clip name that
        names nothing leaves the body in whatever pose it was in, so a typo is
        invisible until somebody sits down and does not sit down. The list is
        what this space has actually animated plus the body's own four; if
        `sit` is not in it, the answer is the clip studio, not a better guess.
      */}
      {use && (
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ['enter', t.enterClip],
              ['loop', t.loopClip],
              ['leave', t.leaveClip],
            ] as const
          ).map(([field, label]) => (
            <ClipPick
              key={field}
              label={label}
              value={use[field]}
              clips={clips}
              none={c.noClip}
              // Blank goes back to null rather than to an empty string: null is
              // "no clip" and is the only spelling of it.
              onChange={(clip) => onChange({ use: { ...use, [field]: clip } })}
            />
          ))}
        </div>
      )}

      {use &&
        use.seats.map((seat, index) => (
          <div key={index} className="space-y-1.5 rounded-xl border border-line/60 bg-surface p-2">
            <div className="flex items-center gap-1.5">
              {/*
                A picker rather than a text field, because a socket that does
                not exist puts somebody in the middle of the bench - a failure
                that is visible but silent, and one a list of the names actually
                on this thing makes impossible to reach by typo.
              */}
              <select
                value={seat.socket ?? ''}
                onChange={(event) =>
                  onChange({
                    use: {
                      ...use,
                      seats: use.seats.map((one, at) =>
                        at === index
                          ? { ...one, socket: event.target.value || undefined }
                          : one,
                      ),
                    },
                  })
                }
                aria-label={c.onSocket}
                className="min-w-0 flex-1 rounded-lg border border-line/60 bg-surface px-2 py-1 text-xs text-ink"
              >
                <option value="">{c.looseSeat}</option>
                {named.map((one) => (
                  <option key={one} value={one}>
                    {one}
                  </option>
                ))}
              </select>
              {use.seats.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      use: { ...use, seats: use.seats.filter((_, at) => at !== index) },
                    })
                  }
                  className="shrink-0 rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/10"
                >
                  {c.remove}
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <Number
                  key={axis}
                  label={axis.toUpperCase()}
                  value={seat[axis]}
                  step={0.1}
                  min={-MAX_PART_OFFSET}
                  max={MAX_PART_OFFSET}
                  onChange={(value) =>
                    onChange({
                      use: {
                        ...use,
                        seats: use.seats.map((one, at) =>
                          at === index ? { ...one, [axis]: value } : one,
                        ),
                      },
                    })
                  }
                />
              ))}
            </div>

            {/*
              And what the body does while it is in *this* one.

              Inherit is the first option and the common answer - a bench seats
              three people the same way. The seats that differ are the ones
              worth the field: a kart's driver holds a wheel, its passenger
              holds on. See `seatClip`.
            */}
            <ClipPick
              label={c.seatClip}
              value={seat.clip ?? null}
              clips={clips}
              none={c.inheritClip}
              onChange={(clip) =>
                onChange({
                  use: {
                    ...use,
                    seats: use.seats.map((one, at) =>
                      at === index ? { ...one, clip: clip ?? undefined } : one,
                    ),
                  },
                })
              }
            />
          </div>
        ))}

      {use && use.seats.length < MAX_SEATS && (
        <button
          type="button"
          onClick={() =>
            onChange({ use: { ...use, seats: [...use.seats, { x: 0, y: 0, z: 0 }] } })
          }
          className="w-full rounded-lg border border-line/60 px-2 py-1.5 text-xs text-ink transition hover:bg-surface-raised"
        >
          {t.addSeat}
        </button>
      )}
    </section>
  )
}

/**
 * Making it drive.
 *
 * The vehicle block, drawn under the seats it depends on: the driver sits in
 * the *first* seat, which is a rule the section states rather than a field it
 * offers - a field would let somebody author a kart with no driver, and every
 * surface asking "who is driving" would have to be told. Ticking the box also
 * stands a `use` block up when there is none, because a vehicle with no seat
 * is the one cross-block mistake `vehicleProblems` refuses.
 *
 * The wheels are joints: a model out of the packs, hung at three numbers, with
 * the one fact a plain piece does not have - whether it turns with the
 * steering. Models that ship with wheels of their own need none of this; the
 * room finds those by name and spins them anyway (see `isWheelNode`).
 */
function Vehicle({
  slug,
  spec,
  onChange,
  c,
  price,
  previewDriver,
  onPreviewDriver,
}: {
  slug: string
  spec: BlueprintSpec
  onChange: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
  /** What ticking the box costs. See `Composer`. */
  price: number
  /** Whether the viewport is standing a body up in the first seat. */
  previewDriver: boolean
  onPreviewDriver: (on: boolean) => void
}) {
  const vehicle = spec.vehicle
  const wheels: readonly WheelSpec[] = vehicle?.wheels ?? []
  const hasSeat = (spec.use?.seats.length ?? 0) > 0

  const changeWheel = (index: number, patch: Partial<WheelSpec>) => {
    if (!vehicle) return
    onChange({
      vehicle: {
        ...vehicle,
        wheels: wheels.map((one, at) => (at === index ? { ...one, ...patch } : one)),
      },
    })
  }

  return (
    <section className="space-y-2">
      <Heading>{c.vehicle}</Heading>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={Boolean(vehicle)}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? { vehicle: freshVehicle(), use: spec.use ?? freshUse() }
                : { vehicle: undefined },
            )
          }
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block text-xs font-medium text-ink">
            {c.vehicleLabel}
            {/*
              Only while it is not one yet. The charge lands on the save that
              first adds the block - `reshapeBlueprint` compares against the
              stored spec - so a car already on the shelf has nothing left to
              buy, and a price beside a box that is already ticked would be a
              number nobody is taking. Unticking is free and is not refunded:
              the slot belongs to the space, so ticking again costs nothing.
            */}
            {!vehicle && <CoinPrice coins={price} />}
          </span>
          <span className="block text-[11px] leading-relaxed text-ink-muted">
            {c.vehicleHint}
          </span>
        </span>
      </label>

      {vehicle && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <Number
              label={c.topSpeed}
              value={vehicle.speed}
              step={0.5}
              min={VEHICLE_LIMITS.speed.min}
              max={VEHICLE_LIMITS.speed.max}
              onChange={(speed) => onChange({ vehicle: { ...vehicle, speed } })}
            />
            <Number
              label={c.turnRate}
              value={vehicle.turn}
              step={0.1}
              min={VEHICLE_LIMITS.turn.min}
              max={VEHICLE_LIMITS.turn.max}
              onChange={(turn) => onChange({ vehicle: { ...vehicle, turn } })}
            />
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={Boolean(vehicle.hideDriver)}
              onChange={(event) =>
                onChange({
                  vehicle: {
                    ...vehicle,
                    // True, or absent - not false. Absent is what every vehicle
                    // drawn before the switch existed says, and one spelling of
                    // "no" keeps the stored specs comparable.
                    hideDriver: event.target.checked || undefined,
                  },
                })
              }
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              <span className="block text-xs font-medium text-ink">{c.hideDriver}</span>
              <span className="block text-[11px] leading-relaxed text-ink-muted">
                {c.hideDriverHint}
              </span>
            </span>
          </label>

          {hasSeat && (
            <Toggle
              on={previewDriver}
              onChange={onPreviewDriver}
              label={c.previewDriver}
            />
          )}

          {wheels.map((wheel, index) => (
            <div
              key={index}
              className="space-y-1.5 rounded-xl border border-line/60 bg-surface p-2"
            >
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailFor(wheel.model)}
                  alt=""
                  loading="lazy"
                  className="size-7 shrink-0 rounded bg-surface-raised object-contain"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-ink">
                  {modelLabel(wheel.model)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      vehicle: {
                        ...vehicle,
                        wheels: wheels.filter((_, at) => at !== index),
                      },
                    })
                  }
                  className="shrink-0 rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/10"
                >
                  {c.remove}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <Number
                    key={axis}
                    label={axis.toUpperCase()}
                    value={wheel.at[axis]}
                    step={0.1}
                    min={-MAX_WHEEL_OFFSET}
                    max={MAX_WHEEL_OFFSET}
                    onChange={(value) =>
                      changeWheel(index, { at: { ...wheel.at, [axis]: value } })
                    }
                  />
                ))}
                <Number
                  label={c.size}
                  value={wheel.scale}
                  step={0.1}
                  min={MIN_WHEEL_SCALE}
                  max={MAX_WHEEL_SCALE}
                  onChange={(scale) => changeWheel(index, { scale })}
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={wheel.steers}
                  onChange={(event) => changeWheel(index, { steers: event.target.checked })}
                  className="size-3.5 accent-accent"
                />
                {c.steers}
              </label>
            </div>
          ))}

          {wheels.length < MAX_WHEELS && (
            <AddPiece
              slug={slug}
              c={c}
              heading={c.addWheel}
              onAdd={(model) =>
                onChange({ vehicle: { ...vehicle, wheels: [...wheels, freshWheel(model)] } })
              }
            />
          )}
        </>
      )}
    </section>
  )
}

/**
 * How far one drag-step moves a piece.
 *
 * Three, because the job has three scales: a whole cell to lay a piece out, a
 * tenth to seat a lamp on a table, and a half for everything between. A
 * continuous slider would be the flexible answer and the wrong one - what
 * somebody wants here is a *repeatable* amount, so that four presses is exactly
 * two cells and not approximately.
 */
const STEPS = [1, 0.5, 0.1] as const

/** Pixels of drag per step. Wrist-sized: a cell is a flick, not a journey. */
const STEP_PX = 26

/**
 * Move, turn and size the selected piece.
 *
 * ---------------------------------------------------------------------------
 * The same control the room already has
 * ---------------------------------------------------------------------------
 * Deliberately the vocabulary of the panel that appears while you are *holding*
 * a thing in the world - a ruled pad you drag, a pair of keys for up and down,
 * and turn and size as buttons rather than fields. Somebody who has placed a
 * bench in a room has used it, and finding the same three controls at the bench
 * means the two surfaces are one skill.
 *
 * Not shared as code: that panel lives over a canvas, takes pointer events away
 * from a world that also wants them, and is sized for a thumb over a game. This
 * one lives in a 22rem column beside a viewport. What is worth sharing is the
 * idea, and the idea is written down in both places.
 *
 * ---------------------------------------------------------------------------
 * A pad, not a stick
 * ---------------------------------------------------------------------------
 * It does not spring back and it has no centre, because neither would mean
 * anything: the piece is where you left it, not where a knob is resting. What
 * moves it is the *distance* dragged, so a slow drag and a fling are worth the
 * same per pixel and a fling is not quietly worth less.
 *
 * The rules drawn on it are the point rather than decoration. A blank square
 * gives a hand nothing to measure against; ruled, a drag reads as a number of
 * steps - and it is the same grid the viewport's floor is drawn in, two inches
 * to the left.
 */
/**
 * Where it goes when somebody picks it up.
 *
 * ---------------------------------------------------------------------------
 * A body, because three numbers cannot be judged on their own
 * ---------------------------------------------------------------------------
 * `0.08, 0.1` is not a grip anybody can picture. The panel that shipped for
 * seats gets away with numbers because a seat is a place on a *thing* the
 * viewport is already drawing; a grip is a place on a body that is not in the
 * scene at all. So this panel brings the body: the reader's own, holding the
 * thing, turnable, so that "is the pistol through the wrist" is a question you
 * answer by looking rather than by summoning one and walking to a mirror.
 *
 * ---------------------------------------------------------------------------
 * Degrees on the screen, radians in the file
 * ---------------------------------------------------------------------------
 * The stored value is radians, because that is what a renderer takes and what
 * every other angle in this app is stored as. Nobody thinks in radians. The
 * controls are whole degrees and the conversion happens on the way in and out,
 * which costs a rounding nobody can see and saves everybody who ever opens this
 * panel from doing arithmetic about pi.
 */
function Grip({
  spec,
  body,
  onChange,
  c,
}: {
  spec: BlueprintSpec
  body: { avatar: string; skin: string | null }
  onChange: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
}) {
  const hold = spec.hold

  const change = (patch: Partial<HoldSpec>) => {
    if (!hold) return
    onChange({ hold: { ...hold, ...patch } })
  }

  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI)
  const radians = (deg: number) => +((deg * Math.PI) / 180).toFixed(4)

  return (
    <section className="space-y-2">
      <Heading>{c.grip}</Heading>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={hold !== undefined}
          onChange={(event) =>
            onChange({ hold: event.target.checked ? freshHold() : undefined })
          }
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block text-xs font-medium text-ink">{c.gripOn}</span>
          <span className="block text-[11px] leading-relaxed text-ink-muted">{c.gripHint}</span>
        </span>
      </label>

      {hold && (
        <div className="space-y-2 rounded-xl border border-line/60 bg-surface p-2">
          {/*
            The preview, above the controls rather than beside them: this column
            is fourteen rem wide, and a body drawn in half of it is a body you
            cannot see a wrist in.
          */}
          <div className="h-52 w-full">
            <BodyStage
              skin={body.skin}
              avatar={body.avatar}
              clip="idle"
              holding={{ model: spec.model, hold, scale: spec.scale }}
              fallback={null}
            />
          </div>

          <div className="flex gap-1">
            {HANDS.map((hand) => (
              <button
                key={hand}
                type="button"
                aria-pressed={hold.hand === hand}
                onClick={() => change({ hand })}
                className={`min-w-0 flex-1 rounded-md px-1 py-1 text-[11px] transition ${
                  hold.hand === hand
                    ? 'bg-accent/25 text-ink'
                    : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                }`}
              >
                {hand === 'right' ? c.rightHand : c.leftHand}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <Number
                key={`at-${axis}`}
                label={`${c.gripAt} ${axis.toUpperCase()}`}
                value={hold.at[axis]}
                min={-MAX_HOLD_OFFSET}
                max={MAX_HOLD_OFFSET}
                step={0.02}
                onChange={(value) => change({ at: { ...hold.at, [axis]: value } })}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <Number
                key={`turn-${axis}`}
                label={`${c.gripTurn} ${axis.toUpperCase()}`}
                value={degrees(hold.turn[axis])}
                min={-360}
                max={360}
                step={5}
                onChange={(value) =>
                  change({ turn: { ...hold.turn, [axis]: radians(value) } })
                }
              />
            ))}
          </div>

          <Number
            label={c.gripScale}
            value={hold.scale}
            min={MIN_HOLD_SCALE}
            max={MAX_HOLD_SCALE}
            step={0.05}
            onChange={(scale) => change({ scale })}
          />
        </div>
      )}
    </section>
  )
}

/**
 * Where it goes on its own.
 *
 * ---------------------------------------------------------------------------
 * Two buttons before six fields
 * ---------------------------------------------------------------------------
 * A lift and a crusher are the two things anybody opens this panel to make, and
 * they differ in every number: one eases up four cells over three seconds and
 * waits for somebody to step on, the other drops three in a fifth of a second
 * and grinds back up. Six empty fields is a panel where both are equally far
 * away and equally easy to get subtly wrong - a crusher that eases is a trap
 * you can stroll out of.
 *
 * So the two are one press each, and everything under them is the ordinary
 * nudging. The same shape the vehicle door takes: make the thing that works,
 * then change it.
 */
function Moving({
  spec,
  onChange,
  c,
}: {
  spec: BlueprintSpec
  onChange: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
}) {
  const motion = spec.motion

  const change = (patch: Partial<MotionSpec>) => {
    if (!motion) return
    onChange({ motion: { ...motion, ...patch } })
  }

  return (
    <section className="space-y-2">
      <Heading>{c.moves}</Heading>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={motion !== undefined}
          onChange={(event) =>
            onChange({ motion: event.target.checked ? freshLift() : undefined })
          }
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block text-xs font-medium text-ink">{c.movesOn}</span>
          <span className="block text-[11px] leading-relaxed text-ink-muted">{c.movesHint}</span>
        </span>
      </label>

      {motion && (
        <div className="space-y-2 rounded-xl border border-line/60 bg-surface p-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onChange({ motion: freshLift() })}
              className="min-w-0 flex-1 rounded-md px-1 py-1 text-[11px] text-ink-muted transition hover:bg-surface-raised hover:text-ink"
            >
              {c.aLift}
            </button>
            <button
              type="button"
              onClick={() => onChange({ motion: freshCrusher() })}
              className="min-w-0 flex-1 rounded-md px-1 py-1 text-[11px] text-ink-muted transition hover:bg-surface-raised hover:text-ink"
            >
              {c.aCrusher}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <Number
                key={`by-${axis}`}
                label={`${c.movesBy} ${axis.toUpperCase()}`}
                value={motion.by[axis]}
                min={-MAX_MOVE}
                max={MAX_MOVE}
                step={0.5}
                onChange={(value) => change({ by: { ...motion.by, [axis]: value } })}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1">
            <Number
              label={c.movesOut}
              value={motion.out}
              min={MIN_MOVE_SECONDS}
              max={MAX_MOVE_SECONDS}
              step={0.1}
              onChange={(out) => change({ out })}
            />
            <Number
              label={c.movesBack}
              value={motion.back}
              min={MIN_MOVE_SECONDS}
              max={MAX_MOVE_SECONDS}
              step={0.1}
              onChange={(back) => change({ back })}
            />
            <Number
              label={c.waitsThere}
              value={motion.waitOut ?? 0}
              min={0}
              max={MAX_MOVE_WAIT}
              step={0.1}
              onChange={(waitOut) => change({ waitOut })}
            />
            <Number
              label={c.waitsHome}
              value={motion.waitHome ?? 0}
              min={0}
              max={MAX_MOVE_WAIT}
              step={0.1}
              onChange={(waitHome) => change({ waitHome })}
            />
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <input
              type="checkbox"
              checked={motion.ease ?? false}
              onChange={(event) => change({ ease: event.target.checked })}
              className="size-3.5 accent-accent"
            />
            {c.eases}
          </label>
        </div>
      )}
    </section>
  )
}

function Nudge({
  at,
  turn,
  scale,
  c,
  onMove,
  onTurn,
  onScale,
}: {
  at: { x: number; y: number; z: number }
  turn: number
  scale: number
  c: WorkspaceDict['thingiverse']['composer']
  onMove: (at: { x: number; y: number; z: number }) => void
  onTurn: (turn: number) => void
  onScale: (scale: number) => void
}) {
  const [step, setStep] = useState<number>(STEPS[1])

  /**
   * Rounded to the step on every write.
   *
   * Floating point is why: a tenth added twelve times is 1.2000000000000002, and
   * that number goes into the log, into a `jsonb` column and onto this panel,
   * where it is a coordinate nobody typed and nobody can tidy. Rounding to the
   * step keeps every value one somebody could have meant.
   */
  const shove = (dx: number, dy: number, dz: number) => {
    const round = (value: number) => Math.round(value / 0.05) * 0.05
    const clamp = (value: number) =>
      Math.max(-MAX_PART_OFFSET, Math.min(MAX_PART_OFFSET, round(value)))
    onMove({ x: clamp(at.x + dx), y: clamp(at.y + dy), z: clamp(at.z + dz) })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Pad step={step} onShove={(right, forward) => shove(right, 0, -forward)} label={c.move} />

        <div className="flex flex-col gap-1">
          <Key label="+" hint={c.up} onClick={() => shove(0, step, 0)} />
          <Key label="−" hint={c.down} onClick={() => shove(0, -step, 0)} />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {/*
            The step, as three keys rather than a field.

            Which one is lit is the whole state, and it is read at a glance from
            the other side of the panel while a hand is on the pad.
          */}
          <div className="flex gap-1">
            {STEPS.map((one) => (
              <button
                key={one}
                type="button"
                aria-pressed={step === one}
                onClick={() => setStep(one)}
                className={`min-w-0 flex-1 rounded-md px-1 py-0.5 font-mono text-[10px] tabular-nums transition ${
                  step === one
                    ? 'bg-accent/25 text-ink'
                    : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                }`}
              >
                {one}
              </button>
            ))}
          </div>
          {/*
            Where it actually is, read-only.

            The pad says how far you moved it and this says where that landed -
            two different questions, and the second is the one you check against
            the other piece you are lining it up with.
          */}
          <p className="font-mono text-[10px] leading-relaxed tabular-nums text-ink-muted">
            {at.x.toFixed(2)}, {at.y.toFixed(2)}, {at.z.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">{c.turn}</span>
        {/*
          One button, because there are only four rotations and pressing it four
          times comes home. A pair of arrows would be two controls for a cycle
          that is never more than three presses away in either direction.
        */}
        <Key label="⟳" hint={c.turn} onClick={() => onTurn((turn + 1) % 4)} />

        <span className="ml-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          {c.size}
        </span>
        <Key
          label="−"
          hint={c.smaller}
          onClick={() => onScale(Math.max(MIN_THING_SCALE, round2(scale / 1.25)))}
        />
        <Key
          label="+"
          hint={c.bigger}
          onClick={() => onScale(Math.min(MAX_THING_SCALE, round2(scale * 1.25)))}
        />
        <span className="font-mono text-[10px] tabular-nums text-ink-muted">
          {scale.toFixed(2)}×
        </span>
      </div>
    </div>
  )
}

/** Two decimals, so a chain of ×1.25 does not grow a tail of digits. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** One key on the pad's edge. Square, so a row of them is a keypad. */
function Key({
  label,
  hint,
  onClick,
}: {
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hint}
      title={hint}
      className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent-2/40 text-sm text-accent-2 transition hover:border-accent-2 hover:bg-accent-2/10"
    >
      {label}
    </button>
  )
}

/**
 * The ruled surface. See `Nudge` for why it is a pad rather than a stick.
 */
function Pad({
  step,
  onShove,
  label,
}: {
  step: number
  onShove: (right: number, forward: number) => void
  label: string
}) {
  const held = useRef<number | null>(null)
  const from = useRef({ x: 0, y: 0 })
  /** Travel not yet spent on a step, so a slow drag still adds up to one. */
  const owed = useRef({ x: 0, y: 0 })
  const [live, setLive] = useState(false)

  const move = (x: number, y: number) => {
    owed.current.x += x - from.current.x
    owed.current.y += y - from.current.y
    from.current = { x, y }

    // Spent a whole step at a time, in a loop, so a fast drag that crosses three
    // steps between two pointer events moves three.
    while (Math.abs(owed.current.x) >= STEP_PX) {
      const way = Math.sign(owed.current.x)
      owed.current.x -= way * STEP_PX
      onShove(way * step, 0)
    }
    while (Math.abs(owed.current.y) >= STEP_PX) {
      const way = Math.sign(owed.current.y)
      owed.current.y -= way * STEP_PX
      // Screen down is positive; away from you is up the pad.
      onShove(0, -way * step)
    }
  }

  const release = () => {
    held.current = null
    owed.current = { x: 0, y: 0 }
    setLive(false)
  }

  return (
    <div
      role="application"
      aria-label={label}
      onPointerDown={(event) => {
        if (held.current !== null) return
        held.current = event.pointerId
        from.current = { x: event.clientX, y: event.clientY }
        owed.current = { x: 0, y: 0 }
        setLive(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (held.current !== event.pointerId) return
        move(event.clientX, event.clientY)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className={`size-[4.5rem] shrink-0 touch-none rounded-lg border transition ${
        live ? 'border-accent-2 bg-accent-2/10' : 'border-accent-2/40'
      }`}
      style={{
        // The same rules the world's floor is drawn in, at pad scale. A gradient
        // rather than an SVG because it is two lines repeated and needs no
        // request.
        backgroundImage:
          'linear-gradient(to right, oklch(0.85 0.15 195 / 0.22) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.85 0.15 195 / 0.22) 1px, transparent 1px)',
        backgroundSize: `${STEP_PX / 2}px ${STEP_PX / 2}px`,
      }}
    />
  )
}

/**
 * A clip, chosen from what a body here can actually play.
 *
 * A `<select>` and not a text field, and that is the whole feature: a clip name
 * is looked up on the model at the moment it plays, a name that finds nothing
 * plays nothing, and *nothing* looks exactly like a working field on a body
 * that has not moved yet. There is no error to show, so the only fix is to
 * make the wrong answer unreachable.
 *
 * A name the space has since deleted is kept as an option of its own rather
 * than silently becoming "none": the blueprint still says it, the log still has
 * it, and a picker that quietly rewrote what was saved would lose the setting
 * the first time somebody opened the panel to look at something else.
 */
function ClipPick({
  label,
  value,
  clips,
  none,
  onChange,
}: {
  label: string
  value: string | null
  clips: readonly string[]
  /** What the empty option says: "no clip" here, "inherit" on a seat. */
  none: string
  onChange: (clip: string | null) => void
}) {
  const options = value && !clips.includes(value) ? [value, ...clips] : clips

  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="min-w-0 rounded-lg border border-line/60 bg-surface px-2 py-1 text-xs text-ink"
      >
        <option value="">{none}</option>
        {options.map((clip) => (
          <option key={clip} value={clip}>
            {clip}
          </option>
        ))}
      </select>
    </label>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
      {children}
    </h2>
  )
}

/**
 * A labelled number.
 *
 * The label sits inside the field's own border rather than above it, which is
 * what lets three of these fit across a 22rem column without the row becoming
 * two lines of text and one line of boxes. `tabular-nums` because they are read
 * as a coordinate, in a column, and proportional digits make 1.1 and 8.8 look
 * like different lengths of number.
 */
function Number({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  step: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-1 rounded-lg border border-line/60 bg-surface px-1.5 py-1 focus-within:border-accent/70">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-ink-muted">
        {label}
      </span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const next = globalThis.Number(event.target.value)
          // A field being cleared reads as NaN, which would put `NaN` in the
          // log and draw the piece nowhere. Held at the last good value until
          // something parseable is typed - the alternative, snapping to zero,
          // moves the piece while somebody is mid-edit.
          if (globalThis.Number.isFinite(next)) onChange(next)
        }}
        className="w-full min-w-0 bg-transparent text-xs tabular-nums text-ink outline-none"
      />
    </label>
  )
}


/**
 * What a thing can be, and what makes it something else.
 *
 * ---------------------------------------------------------------------------
 * Cards rather than a graph
 * ---------------------------------------------------------------------------
 * The obvious drawing of a state machine is boxes and arrows, and it is the
 * wrong one here for a reason that has nothing to do with effort: a graph is
 * only easier to read than a list once there are enough nodes for the *shape*
 * to carry information, and this one is capped at eight. Below that a graph is
 * a list with a layout problem - it needs positions nobody wants to author, it
 * needs them stored, and it needs somebody to tidy it after every edit.
 *
 * So: a card per state, and inside each one the ways out of it, in the order
 * they are considered. That order is a rule (`step` takes the first match), and
 * a list is the only drawing where the order is visible without being explained.
 */
function Machine({
  spec,
  onChange,
  c,
  previewing,
  clipFound,
  onPreview,
}: {
  spec: BlueprintSpec
  onChange: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
  /** The clip name the viewport is currently playing, or null. */
  previewing: string | null
  /** Whether `previewing` is a track the viewport's model actually has. */
  clipFound: boolean
  onPreview: (clip: string | null) => void
}) {
  const machine = spec.states
  const states: readonly ThingState[] = machine?.states ?? []

  const setMachine = (next: States) => onChange({ states: next })

  const changeState = (index: number, patch: Partial<ThingState>) => {
    if (!machine) return
    setMachine({
      ...machine,
      states: states.map((one, at) => (at === index ? { ...one, ...patch } : one)),
    })
  }

  const changeChange = (state: number, index: number, patch: Partial<Change>) => {
    const here = states[state]
    if (!here) return
    changeState(state, {
      changes: here.changes.map((one, at) => (at === index ? { ...one, ...patch } : one)),
    })
  }

  /**
   * Renaming a state, carrying every reference to it along.
   *
   * Not a plain field write, because a name is what every `to` and the `start`
   * point at - and renaming `whole` to `intact` with the references left behind
   * is a machine where nothing happens, which is exactly the failure
   * `statesProblems` refuses to let anybody save. Fixing it up here means the
   * refusal never fires for the one edit that would otherwise always trip it.
   */
  const rename = (index: number, name: string) => {
    if (!machine) return
    const was = states[index]?.name
    if (was === undefined) return
    setMachine({
      start: machine.start === was ? name : machine.start,
      states: states.map((one, at) => ({
        ...(at === index ? { ...one, name } : one),
        changes: one.changes.map((change) =>
          change.to === was ? { ...change, to: name } : change,
        ),
      })),
    })
  }

  return (
    <section className="space-y-2">
      <Heading>{c.machine.heading}</Heading>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={Boolean(machine)}
          onChange={(event) => onChange({ states: event.target.checked ? freshStates() : undefined })}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block text-xs font-medium text-ink">{c.machine.label}</span>
          <span className="block text-[11px] leading-relaxed text-ink-muted">
            {c.machine.hint}
          </span>
        </span>
      </label>

      {machine && (
        <>
          {/*
            The starter, offered beside the empty machine rather than instead of
            it. Four fields somebody would otherwise get subtly wrong in a way
            that looks like nothing happening - see `freshRespawn`.
          */}
          <div className="flex items-center gap-2 text-[11px] text-ink-muted">
            <span>{c.machine.preset}</span>
            <button
              type="button"
              onClick={() => setMachine(freshRespawn())}
              className="rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
            >
              {c.machine.presetRespawn}
            </button>
          </div>

          {states.map((state, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-line/60 bg-surface/60 p-2">
              <div className="flex items-center gap-1.5">
                <label className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-line/60 bg-surface px-1.5 py-1 focus-within:border-accent/70">
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                    {c.machine.name}
                  </span>
                  <input
                    value={state.name}
                    maxLength={MAX_STATE_NAME}
                    onChange={(event) => rename(index, event.target.value)}
                    className="w-full min-w-0 bg-transparent text-xs text-ink outline-none"
                  />
                </label>
                <Toggle
                  on={machine.start === state.name}
                  onChange={() => setMachine({ ...machine, start: state.name })}
                  label={c.machine.starts}
                />
                {states.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setMachine({ ...machine, states: states.filter((_, at) => at !== index) })
                    }
                    className="shrink-0 rounded-lg border border-line/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
                  >
                    {c.remove}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Toggle
                  on={state.hidden === true}
                  onChange={(on) => changeState(index, { hidden: on || undefined })}
                  label={c.machine.hidden}
                />
                <Toggle
                  on={state.restore === true}
                  onChange={(on) => changeState(index, { restore: on || undefined })}
                  label={c.machine.healsUp}
                />
                <Toggle
                  // Absent means "whatever the blueprint says", which is the
                  // common case and is why this is three-valued in the type and
                  // two-valued here: turning it on states an override, turning
                  // it off clears one.
                  on={state.blocking === false}
                  onChange={(on) => changeState(index, { blocking: on ? false : undefined })}
                  label={`${c.machine.solid}: ${c.machine.nothing}`}
                />
              </div>

              {state.hidden && (
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  {c.machine.hiddenHint}
                </p>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex items-center gap-1 rounded-lg border border-line/60 bg-surface px-1.5 py-1 focus-within:border-accent/70">
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                    {c.machine.plays}
                  </span>
                  <input
                    value={state.clip ?? ''}
                    placeholder={c.machine.sameAsThing}
                    maxLength={MAX_CLIP_NAME_HERE}
                    onChange={(event) =>
                      changeState(index, {
                        // Blank is "the blueprint's", which is absence. The only
                        // way to say "play nothing" is the switch beside it -
                        // two meanings, two controls, rather than one field with
                        // a magic empty string.
                        clip: event.target.value.trim() === '' ? undefined : event.target.value,
                      })
                    }
                    className="w-full min-w-0 bg-transparent text-xs text-ink outline-none"
                  />
                </label>
                <Toggle
                  on={state.clip === null}
                  onChange={(on) => changeState(index, { clip: on ? null : undefined })}
                  label={`${c.machine.plays}: ${c.machine.nothing}`}
                />
              </div>

              {/*
                Playing the name on the model itself, rather than trusting the
                spelling. Only offered for a name actually typed here - blank
                means "the blueprint's own", and a state that inherits has
                nothing of its own to test.
              */}
              {typeof state.clip === 'string' && state.clip.length > 0 && (
                <div className="flex items-center gap-2">
                  <Toggle
                    on={previewing === state.clip}
                    onChange={(on) => onPreview(on ? (state.clip as string) : null)}
                    label={previewing === state.clip ? c.machine.stopPreview : c.machine.preview}
                  />
                  {previewing === state.clip && !clipFound && (
                    <span className="text-[11px] text-red-400">{c.machine.notOnModel}</span>
                  )}
                </div>
              )}

              <label className="flex items-center gap-1 rounded-lg border border-line/60 bg-surface px-1.5 py-1 focus-within:border-accent/70">
                <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  {c.machine.shouts}
                </span>
                <input
                  value={state.emit ?? ''}
                  maxLength={MAX_SIGNAL_NAME}
                  onChange={(event) =>
                    changeState(index, { emit: event.target.value.trim() || undefined })
                  }
                  className="w-full min-w-0 bg-transparent text-xs text-ink outline-none"
                />
              </label>

              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  {c.machine.changes}
                </p>
                {state.changes.map((change, at) => (
                  <div key={at} className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={change.when}
                      onChange={(event) =>
                        changeChange(index, at, {
                          when: event.target.value as Change['when'],
                        })
                      }
                      className="rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs text-ink outline-none"
                    >
                      {CHANGE_WHENS.map((when) => (
                        <option key={when} value={when}>
                          {c.machine.when[when]}
                        </option>
                      ))}
                    </select>

                    {change.when === 'after' && (
                      <div className="w-24">
                        <Number
                          label={c.machine.seconds}
                          value={change.seconds ?? 1}
                          step={0.5}
                          min={MIN_CHANGE_SECONDS}
                          max={MAX_CHANGE_SECONDS}
                          onChange={(seconds) => changeChange(index, at, { seconds })}
                        />
                      </div>
                    )}

                    {change.when === 'signal' && (
                      <input
                        value={change.value ?? ''}
                        maxLength={MAX_SIGNAL_NAME}
                        onChange={(event) =>
                          changeChange(index, at, { value: event.target.value })
                        }
                        className="w-24 rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs text-ink outline-none"
                      />
                    )}

                    <span className="text-[11px] text-ink-muted">{c.machine.goesTo}</span>
                    <select
                      value={change.to}
                      onChange={(event) => changeChange(index, at, { to: event.target.value })}
                      className="rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs text-ink outline-none"
                    >
                      {states.map((one) => (
                        <option key={one.name} value={one.name}>
                          {one.name}
                        </option>
                      ))}
                    </select>

                    {change.when === 'after' && (
                      <Toggle
                        on={change.fill === true}
                        onChange={(on) => changeChange(index, at, { fill: on || undefined })}
                        label={c.machine.showBar}
                      />
                    )}
                    <Toggle
                      on={change.once === true}
                      onChange={(on) => changeChange(index, at, { once: on || undefined })}
                      label={c.machine.onlyOnce}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        changeState(index, {
                          changes: state.changes.filter((_, other) => other !== at),
                        })
                      }
                      className="rounded-lg border border-line/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
                    >
                      {c.remove}
                    </button>
                  </div>
                ))}

                {state.changes.length < MAX_CHANGES_PER_STATE && (
                  <button
                    type="button"
                    onClick={() =>
                      changeState(index, {
                        changes: [
                          ...state.changes,
                          // Pointed at itself rather than at nothing, so a change
                          // that has only just been added is already valid -
                          // `statesProblems` refuses a `to` that names no state,
                          // and a fresh row that fails the check is a red panel
                          // for something nobody has typed into yet.
                          { when: 'touch', to: state.name },
                        ],
                      })
                    }
                    className="rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
                  >
                    {c.machine.addChange}
                  </button>
                )}
              </div>
            </div>
          ))}

          {states.length < MAX_STATES && (
            <button
              type="button"
              onClick={() =>
                setMachine({
                  ...machine,
                  states: [...states, { name: freeName(states), changes: [] }],
                })
              }
              className="rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
            >
              {c.machine.addState}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * A name no state has yet.
 *
 * Numbered rather than blank, because a blank name is the one thing
 * `statesProblems` refuses outright - so a fresh card would open with the whole
 * panel already marked red. Somebody types over it in the same motion they
 * would have used to fill in an empty field.
 */
function freeName(states: readonly ThingState[]): string {
  for (let n = 1; n <= MAX_STATES + 1; n++) {
    const name = `state ${n}`
    if (!states.some((one) => one.name === name)) return name
  }
  return `state ${states.length + 1}`
}

/** The clip-name bound, restated so this file does not grow another import. */
const MAX_CLIP_NAME_HERE = 64

/**
 * What it can take, and what it can dish out.
 *
 * Two switches rather than one, because the three interesting objects use
 * different halves: a crate is health alone, a spike trap is a weapon alone and
 * cannot be broken, and a turret is both. See `FightSpec`.
 */
function Fighting({
  slug,
  spec,
  onChange,
  c,
}: {
  slug: string
  spec: BlueprintSpec
  onChange: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
}) {
  const fight = spec.fight
  const set = (next: FightSpec | undefined) => onChange({ fight: next })

  /** Dropping the block entirely once neither half is on, rather than `{}`. */
  const trim = (next: FightSpec) => set(next.health || next.weapon ? next : undefined)

  return (
    <section className="space-y-2">
      <Heading>{c.fight.heading}</Heading>
      <p className="text-[11px] leading-relaxed text-ink-muted">{c.fight.hint}</p>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(fight?.health)}
          onChange={(event) =>
            trim({ ...fight, health: event.target.checked ? freshHealth() : undefined })
          }
          className="size-4 accent-accent"
        />
        <span className="text-xs font-medium text-ink">{c.fight.health}</span>
      </label>

      {fight?.health && (
        <div className="space-y-1.5 rounded-lg border border-line/60 bg-surface/60 p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Number
              label={c.fight.max}
              value={fight.health.max}
              step={10}
              min={MIN_THING_HEALTH}
              max={MAX_THING_HEALTH}
              onChange={(max) => set({ ...fight, health: { ...fight.health!, max } })}
            />
            <Toggle
              on={fight.health.bar !== false}
              onChange={(on) =>
                set({ ...fight, health: { ...fight.health!, bar: on ? undefined : false } })
              }
              label={c.fight.showBar}
            />
          </div>

          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            {c.fight.hurtBy}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {HURTS.map((hurt) => (
              <Toggle
                key={hurt}
                on={fight.health!.hurtBy.includes(hurt)}
                onChange={(on) =>
                  set({
                    ...fight,
                    health: {
                      ...fight.health!,
                      hurtBy: on
                        ? [...fight.health!.hurtBy, hurt]
                        : fight.health!.hurtBy.filter((one) => one !== hurt),
                    },
                  })
                }
                label={c.fight.hurt[hurt]}
              />
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(fight?.weapon)}
          onChange={(event) =>
            trim({ ...fight, weapon: event.target.checked ? freshWeapon() : undefined })
          }
          className="size-4 accent-accent"
        />
        <span className="text-xs font-medium text-ink">{c.fight.weapon}</span>
      </label>

      {fight?.weapon && (
        <div className="space-y-1.5 rounded-lg border border-line/60 bg-surface/60 p-2">
          <div className="grid grid-cols-3 gap-1.5">
            <Number
              label={c.fight.damage}
              value={fight.weapon.damage}
              step={5}
              min={WEAPON_LIMITS.damage.min}
              max={WEAPON_LIMITS.damage.max}
              onChange={(damage) => set({ ...fight, weapon: { ...fight.weapon!, damage } })}
            />
            <Number
              label={c.fight.reach}
              value={fight.weapon.reach}
              step={0.5}
              min={WEAPON_LIMITS.reach.min}
              max={WEAPON_LIMITS.reach.max}
              onChange={(reach) => set({ ...fight, weapon: { ...fight.weapon!, reach } })}
            />
            <Number
              label={c.fight.every}
              value={fight.weapon.every}
              step={0.1}
              min={WEAPON_LIMITS.every.min}
              max={WEAPON_LIMITS.every.max}
              onChange={(every) => set({ ...fight, weapon: { ...fight.weapon!, every } })}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
              {c.fight.aimsAt}
            </span>
            <select
              value={fight.weapon.at}
              onChange={(event) =>
                set({
                  ...fight,
                  weapon: { ...fight.weapon!, at: event.target.value as 'people' | 'things' | 'all' },
                })
              }
              className="rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs text-ink outline-none"
            >
              {(['people', 'things', 'all'] as const).map((at) => (
                <option key={at} value={at}>
                  {c.fight.at[at]}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={Boolean(fight.weapon.shot)}
              onChange={(event) =>
                set({
                  ...fight,
                  weapon: {
                    ...fight.weapon!,
                    shot: event.target.checked ? freshShot(spec.model) : undefined,
                  },
                })
              }
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              <span className="block text-xs font-medium text-ink">{c.fight.fires}</span>
              <span className="block text-[11px] leading-relaxed text-ink-muted">
                {c.fight.firesHint}
              </span>
            </span>
          </label>

          {fight.weapon.shot && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <Number
                  label={c.fight.speed}
                  value={fight.weapon.shot.speed}
                  step={2}
                  min={WEAPON_LIMITS.speed.min}
                  max={WEAPON_LIMITS.speed.max}
                  onChange={(speed) =>
                    set({
                      ...fight,
                      weapon: { ...fight.weapon!, shot: { ...fight.weapon!.shot!, speed } },
                    })
                  }
                />
                <Number
                  label={c.size}
                  value={fight.weapon.shot.scale}
                  step={0.1}
                  min={MIN_THING_SCALE}
                  max={MAX_THING_SCALE}
                  onChange={(scale) =>
                    set({
                      ...fight,
                      weapon: { ...fight.weapon!, shot: { ...fight.weapon!.shot!, scale } },
                    })
                  }
                />
              </div>

              {/*
                What flies is picked the same way every other model on this page
                is, so somebody who has learned the piece browser has learned
                this too.
              */}
              <AddPiece
                slug={slug}
                c={c}
                heading={fill(c.swapFor, { where: modelLabel(fight.weapon.shot.model) })}
                onAdd={(model) =>
                  set({
                    ...fight,
                    weapon: { ...fight.weapon!, shot: { ...fight.weapon!.shot!, model } },
                  })
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Places to put something, and what those things make together.
 *
 * The socket a place sits on is a *picker* rather than a typed name, which is
 * the one place this panel departs from the seats above it. The difference is
 * that a seat with a missing socket is visible - somebody is sitting in the
 * middle of the bench - and a place with a missing socket is not: the item sits
 * at the origin, which for a table is inside the table. A list of the sockets
 * that exist is what stops that being a typo nobody can see.
 */
function Crafting({
  spec,
  sockets,
  onChange,
  c,
}: {
  spec: BlueprintSpec
  sockets: readonly string[]
  onChange: (patch: Partial<BlueprintSpec>) => void
  c: WorkspaceDict['thingiverse']['composer']
}) {
  const craft = spec.craft
  const slots: readonly SlotSpec[] = craft?.slots ?? []
  const recipes: readonly RecipeSpec[] = craft?.recipes ?? []

  const set = (next: CraftSpec) => onChange({ craft: next })

  const changeSlot = (index: number, patch: Partial<SlotSpec>) => {
    if (!craft) return
    set({ ...craft, slots: slots.map((one, at) => (at === index ? { ...one, ...patch } : one)) })
  }

  const changeRecipe = (index: number, patch: Partial<RecipeSpec>) => {
    if (!craft) return
    set({
      ...craft,
      recipes: recipes.map((one, at) => (at === index ? { ...one, ...patch } : one)),
    })
  }

  /** A comma-separated field, which is how a list of words is typed. */
  const words = (value: string) =>
    value
      .split(',')
      .map((one) => one.trim())
      .filter(Boolean)

  return (
    <section className="space-y-2">
      <Heading>{c.craft.heading}</Heading>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={Boolean(craft)}
          onChange={(event) =>
            onChange({
              craft: event.target.checked ? freshCraft(sockets[0] ?? 'top') : undefined,
            })
          }
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block text-xs font-medium text-ink">{c.craft.label}</span>
          <span className="block text-[11px] leading-relaxed text-ink-muted">{c.craft.hint}</span>
        </span>
      </label>

      {/*
        What summoning one costs, outside the `craft` switch on purpose: a bench
        with a price is an ordinary thing somebody sells, and nothing about it
        needs a place to put something. Tying the two together would make every
        shop item a table.
      */}
      <div className="grid grid-cols-2 items-center gap-1.5">
        <Number
          label={c.craft.toSummon}
          value={spec.price ?? 0}
          step={1}
          min={0}
          max={MAX_PRICE}
          onChange={(price) => onChange({ price: price > 0 ? Math.round(price) : undefined })}
        />
        <span className="text-[11px] leading-relaxed text-ink-muted">
          {spec.price ? c.craft.priceHint : c.craft.free}
        </span>
      </div>

      {craft && (
        <>
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">{c.craft.slots}</p>
          {slots.map((slot, index) => (
            <div
              key={index}
              className="space-y-1.5 rounded-lg border border-line/60 bg-surface/60 p-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  {c.craft.onSocket}
                </span>
                <select
                  value={slot.socket}
                  onChange={(event) => changeSlot(index, { socket: event.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs text-ink outline-none"
                >
                  {/* The one it already names is listed even when nothing on
                      the thing carries it, so swapping a piece out does not
                      silently repoint the slot at somebody else's socket. */}
                  {[...new Set([slot.socket, ...sockets])].filter(Boolean).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => set({ ...craft, slots: slots.filter((_, at) => at !== index) })}
                  className="rounded-lg border border-line/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
                >
                  {c.remove}
                </button>
              </div>

              <Words
                label={c.craft.takes}
                placeholder={c.craft.anything}
                value={slot.takes.join(', ')}
                max={MAX_ITEM_NAME * MAX_RECIPE_ITEMS}
                onChange={(value) => changeSlot(index, { takes: words(value) })}
              />
              <div className="grid grid-cols-3 gap-1.5">
                <Words
                  label={c.craft.alreadyHolds}
                  placeholder={c.craft.nothingHeld}
                  value={slot.gives ?? ''}
                  max={MAX_ITEM_NAME}
                  onChange={(value) => changeSlot(index, { gives: value.trim() || undefined })}
                />
                <Words
                  label={c.craft.shouts}
                  placeholder=""
                  value={slot.emit ?? ''}
                  max={MAX_SIGNAL_NAME}
                  onChange={(value) => changeSlot(index, { emit: value.trim() || undefined })}
                />
                {/*
                  What taking from here costs. Zero is free and is stored as
                  absence, so a counter nobody charged for reads the same as one
                  drawn before prices existed.
                */}
                <Number
                  label={c.craft.price}
                  value={slot.price ?? 0}
                  step={1}
                  min={0}
                  max={MAX_PRICE}
                  onChange={(price) =>
                    changeSlot(index, { price: price > 0 ? Math.round(price) : undefined })
                  }
                />
              </div>
            </div>
          ))}

          {slots.length < MAX_SLOTS && (
            <button
              type="button"
              onClick={() =>
                set({ ...craft, slots: [...slots, { socket: sockets[0] ?? 'top', takes: [] }] })
              }
              className="rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
            >
              {c.craft.addSlot}
            </button>
          )}

          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            {c.craft.recipes}
          </p>
          {recipes.map((recipe, index) => (
            <div
              key={index}
              className="space-y-1.5 rounded-lg border border-line/60 bg-surface/60 p-2"
            >
              <Words
                label={c.craft.needs}
                placeholder=""
                value={recipe.needs.join(', ')}
                max={MAX_ITEM_NAME * MAX_RECIPE_ITEMS}
                onChange={(value) => changeRecipe(index, { needs: words(value) })}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <Words
                  label={c.craft.makes}
                  placeholder=""
                  value={recipe.makes}
                  max={MAX_ITEM_NAME}
                  onChange={(makes) => changeRecipe(index, { makes })}
                />
                <Number
                  label={c.craft.seconds}
                  value={recipe.seconds ?? 0}
                  step={0.5}
                  min={0}
                  max={MAX_RECIPE_SECONDS}
                  onChange={(seconds) => changeRecipe(index, { seconds: seconds || undefined })}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Words
                  label={c.craft.shouts}
                  placeholder=""
                  value={recipe.emit ?? ''}
                  max={MAX_SIGNAL_NAME}
                  onChange={(value) => changeRecipe(index, { emit: value.trim() || undefined })}
                />
                <button
                  type="button"
                  onClick={() =>
                    set({ ...craft, recipes: recipes.filter((_, at) => at !== index) })
                  }
                  className="shrink-0 rounded-lg border border-line/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
                >
                  {c.remove}
                </button>
              </div>
            </div>
          ))}

          {recipes.length < MAX_RECIPES && (
            <button
              type="button"
              onClick={() =>
                set({ ...craft, recipes: [...recipes, { needs: [], makes: '' }] })
              }
              className="rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
            >
              {c.craft.addRecipe}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * A labelled word, or a comma-separated list of them.
 *
 * `Number`'s shape for text, rather than a second layout: the two sit in the
 * same grids beside each other, and a label that was above the field in one and
 * inside it in the other would make every row of this panel two heights.
 */
function Words({
  label,
  value,
  placeholder,
  max,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  max: number
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-1 rounded-lg border border-line/60 bg-surface px-1.5 py-1 focus-within:border-accent/70">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-ink-muted">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 bg-transparent text-xs text-ink outline-none"
      />
    </label>
  )
}
