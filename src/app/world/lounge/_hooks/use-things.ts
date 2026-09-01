'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { attempt } from '@/app/components/connection'
import type { WorldDict } from '@/app/i18n/world'
import { chooseLoans, useKeepDefault } from '@/app/world/_stores/loan-store'
import { useThingWire } from '@/app/world/lounge/_hooks/use-thing-wire'
import {
  clearThingiverse,
  onClip,
  onThingiverse,
  onVehicle,
  publishThingiverse,
} from '@/app/world/_stores/thing-store'
import {
  dismissThing,
  moveThing,
  renameBlueprint,
  retireBlueprint,
  reshapeBlueprint,
  scaleThing,
  setBlueprintVisibility,
  setThingKeep,
  summonModel,
  summonThing,
  handOverBlueprint,
  tuneThing,
  turnThing,
} from '@/domain/thingiverse/actions'
import { freshSpec, MAX_THING_SCALE, MIN_THING_SCALE } from '@/domain/thingiverse/blueprint'
import { toGrid } from '@/domain/thingiverse/thing-commands'
import type { BlueprintView, ThingView } from '@/domain/thingiverse/queries'
import { resolveSummon, type SummonMatch, nameForModel } from '@/domain/thingiverse/summon'
import { drivable } from '@/domain/thingiverse/vehicle'
import type { ThingTuning } from '@/domain/thingiverse/thing-events'

/**
 * The thingiverse, as the running world sees it.
 *
 * Its own hook for the reason the images have one: it is its own aggregate with
 * its own lifecycle, and none of the state below is read by anything else in
 * `lounge-scene.tsx`. What it adds over `useLoungeImages` is the *preview* -
 * summoning is the one operation here that happens before anything is written
 * down, and the whole design of it is in `pending` below.
 *
 * ---------------------------------------------------------------------------
 * Optimistic, with the revert
 * ---------------------------------------------------------------------------
 * Same rule the images follow, and for the same reason: a thing being moved is
 * rare and individually visible - somebody moved *that crate*, and it moved -
 * so a refused command has to put it back rather than leave the screen
 * disagreeing with the log.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately missing: other people
 * ---------------------------------------------------------------------------
 * Nothing here is broadcast. A thing summoned in a room appears for everybody
 * else on their next load, exactly as an image hung on a wall does and for the
 * same reason - the channel in this scene carries positions sixty times a
 * second, and furniture is not that kind of fact. If it turns out to want live
 * updates, the seam is the same one the blocks use, not a change here.
 */
export function useThings({
  slug,
  worldId,
  userId,
  tenantId,
  initial,
  initialShelf,
  readOnly,
  canBuild,
  spot,
  pose,
  clips,
  dict,
  refusal,
}: {
  slug: string
  /** The world these stand in. Null is the lounge, as everywhere else here. */
  worldId: string | null
  /** Whose loans to take away on the way out. See `LOANS`. */
  userId: string
  /**
   * The space, for the topic everybody in this room is listening on.
   *
   * Null in a scene with no presence - the demo, a still - which is also a
   * scene with nobody to tell.
   */
  tenantId: string | null
  initial: ThingView[]
  initialShelf: BlueprintView[]
  readOnly: boolean
  /** Whether this person may summon at all. Read-only worlds show, never edit. */
  canBuild: boolean
  /**
   * Somewhere to put a thing the moment it is picked up.
   *
   * A few cells in front of whoever picked it up, standing on whatever is
   * there - the scene works it out, because where somebody is and which way
   * they face are refs that change every frame and have no business being
   * state in here.
   *
   * It replaces the crosshair, which is what this used to follow. Two reasons
   * it had to: the camera now frames the thing being placed, so a thing that
   * followed the crosshair would chase a camera that was chasing it; and until
   * somebody looked at a surface there was no cell at all, so the panel opened
   * saying "look where it should stand" with Place greyed out.
   */
  spot: () => { x: number; y: number; z: number } | null
  /**
   * Where the body - or the vehicle under it - is right now, as a cell and a
   * quarter turn.
   *
   * A callback for the same reason `spot` is: position and heading are refs
   * the scene holds and that change every frame. Two readers want it and both
   * are about vehicles: `/vehicle kart` summons the kart facing the way you
   * face, and getting out writes the vehicle down where it actually stopped.
   */
  pose: () => { x: number; y: number; z: number; facing: number } | null
  /**
   * Every clip this body can actually play, for `/clip wink`.
   *
   * Passed in rather than worked out here, because "what can this body do" is
   * two answers from two places the scene already holds: the pack's own four,
   * and whatever the space animated for itself. A name that is not in this list
   * plays nothing at all - the renderer looks it up and shrugs - which is why
   * the command checks it rather than forwarding a word and hoping.
   */
  clips: readonly string[]
  dict: WorldDict
  refusal: (text: string) => string
}) {
  const [things, setThings] = useState<ThingView[]>(initial)
  const [shelf, setShelf] = useState<BlueprintView[]>(initialShelf)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * What is being carried, before it is put down.
   *
   * `/thingiverse ball` does not summon a ball. It hands you one: a translucent
   * model standing wherever you are looking, which you turn and resize and then
   * place - or walk away from. That is the difference between a command and a
   * *tool*, and it is the whole reason this state exists rather than the chat
   * line writing an event directly.
   *
   * Where it lands is deliberately *not* settled here. Until somebody moves it
   * themselves it follows the crosshair, and where the crosshair is - and what
   * is under it, and which way its owner is facing - are all facts the scene
   * holds in refs that change every frame. A hook that owned them would
   * re-render the world for every step anybody took.
   *
   * So the scene works out the cell and hands it to `place`. `at` below is the
   * exception and the reason it exists: once a thumb has moved the thing, where
   * it stands is a decision rather than a consequence, and a decision is state.
   *
   * `matches` rather than one match, because a typed word is a guess: "ball"
   * reaches a blueprint and eleven models, and the panel lets you step through
   * them while holding the preview. See `resolveSummon`.
   */
  /**
   * Whether the shelf is open over the room.
   *
   * Its own flag rather than a third state of `pending`, because the two are
   * different moments: browsing is deciding *what*, and a pending preview is
   * deciding *where*. Picking a tile ends the first and begins the second,
   * which is why `summon` below closes this.
   */
  const [browsing, setBrowsing] = useState(false)

  /**
   * What was just stood up, for the few seconds it is worth saying so.
   *
   * `/xo bench` places a bench and closes the panel, and until now that was the
   * whole of the feedback: something appeared, somewhere in front of you,
   * possibly off to one side because the spot search stepped around a wall. If
   * you happened to be looking elsewhere, nothing had visibly happened at all.
   *
   * So the world says the name for a moment - and says how to move it, which is
   * the one thing somebody wants to know next and the only place the gesture is
   * taught. It clears itself; there is nothing to dismiss.
   */
  const [announced, setAnnounced] = useState<string | null>(null)

  /**
   * How far one push moves a carried thing, in cells.
   *
   * Here rather than in the panel that draws the chips, because two things
   * spend it now: the pad you drag and the keys you hold. A step that meant
   * half a cell on the pad and something else on the keyboard would be two
   * controls that disagree about the same word.
   *
   * Half a cell to start - the size that matters most of the time - with a
   * tenth for the last nudge, when it is nearly right and you are looking at
   * the gap.
   */
  const [step, setStep] = useState(0.5)

  /**
   * Whether the next thing you summon stays.
   *
   * A preference of this browser's rather than a fact about the world, so it
   * comes out of `loan-store` - which reads storage the one way that is safe on
   * both sides of hydration. See the note there.
   */
  const keepDefault = useKeepDefault()

  const [pending, setPending] = useState<{
    matches: SummonMatch[]
    index: number
    facing: number
    scale: number
    /**
     * Where it will land, once somebody has moved it themselves.
     *
     * Null while it is still following the crosshair, which is how every carry
     * starts: you look at a spot and the thing is there. The first nudge on the
     * pad fixes it in place and this holds it from then on - because a thing
     * you have positioned by thumb should not jump the moment your head moves.
     */
    at?: { x: number; y: number; z: number } | null
    /**
     * The thing being carried, when this is a thing that already exists.
     *
     * Absent while summoning something new. Present after E in creative mode
     * picks one up, and it is what turns "put it down" from a summon into a
     * move - see `carry`.
     */
    movingId?: string
  } | null>(null)

  const selected = useMemo(
    () => things.find((thing) => thing.id === selectedId) ?? null,
    [things, selectedId],
  )

  /**
   * The thing you are *in*, and the one you could get into.
   *
   * Two ids rather than one, because they answer different questions and both
   * are on screen at once: `nearId` is what the prompt is about ("E to sit"),
   * and `usingId` is what your body is doing. Between pressing E and the enter
   * clip finishing they are the same thing, and after you walk away from a
   * bench you are still on, only the second is.
   *
   * `nearId` is written from inside the Canvas - see <Usables> - because "which
   * of these is nearest" is a question about the player's position this frame,
   * and the player's position is a ref that never re-renders anything.
   */
  const [usingId, setUsingId] = useState<string | null>(null)
  const [nearId, setNearId] = useState<string | null>(null)
  /**
   * Which seat, when the thing has more than one.
   *
   * Decided by the scene at the moment you press E - the nearest free one to
   * where you were standing, judged by looking at whose body is where (see
   * `freeSeat`) - and held here because it is part of *being in* the thing,
   * beside which thing it is.
   */
  const [usingSeat, setUsingSeat] = useState(0)

  /**
   * Whether being in `usingId` means *driving* it.
   *
   * Its own flag rather than "seat zero of something with a vehicle block",
   * because the two can come apart: the driver's seat of a parked kart is a
   * perfectly good place to just sit, and a passenger is in a vehicle without
   * driving anything. What the flag changes lives in the scene - the walk
   * becomes `stepDrive`, and the kart is drawn under the body rather than at
   * its cell.
   */
  const [atWheel, setAtWheel] = useState(false)

  /**
   * What you are in, mirrored for the two places a thing is taken away from
   * under you: the channel hearing `gone`, and your own dismiss. Both need to
   * know whether the row going was the one you were sitting in - or driving -
   * without being re-subscribed every time you sit down. Declared above the
   * channel effect that reads it, which is also what the lint rule insists on.
   */
  const usingRef = useRef<string | null>(null)
  useEffect(() => {
    usingRef.current = usingId
  })

  /**
   * The clip the body is playing because of a thing, or null for its own gait.
   *
   * A name rather than a boolean, and unchecked here: which clips a body has is
   * the *body's* business, and this scene has two kinds of body in it (an
   * animal with four clips, an XP rig with rather more). The renderer plays it
   * if it recognises it and stands still if it does not, which is what a chair
   * with a missing clip should look like.
   */
  const [bodyClip, setBodyClip] = useState<string | null>(null)

  const using = useMemo(
    () => things.find((thing) => thing.id === usingId) ?? null,
    [things, usingId],
  )
  const near = useMemo(
    () => things.find((thing) => thing.id === nearId) ?? null,
    [things, nearId],
  )

  const patch = useCallback((id: string, changes: Partial<ThingView>) => {
    setThings((current) =>
      current.map((thing) => (thing.id === id ? { ...thing, ...changes } : thing)),
    )
  }, [])

  /**
   * Telling everybody else.
   *
   * ---------------------------------------------------------------------------
   * Why a channel of its own
   * ---------------------------------------------------------------------------
   * The room already has one - presence - and it carries positions sixty times
   * a second for everybody in it. Furniture is not that kind of fact: it moves
   * when somebody drags it and then not again for an hour. Putting the two on
   * one topic would mean every packet of movement is delivered to a handler
   * that only ever wanted to hear about crates, and every crate arrives on a
   * socket tuned for a flood.
   *
   * So this takes the shape the chat already uses: its own topic, per room,
   * opened where the state lives. `private: true` for the same reason chat's
   * is - the topic is a space's, and Realtime's own authorization is what keeps
   * it that way.
   *
   * ---------------------------------------------------------------------------
   * One message, two shapes
   * ---------------------------------------------------------------------------
   * A row, or an id that has gone. Not one message per verb - there is no
   * `moved`, no `resized`, no `retuned` - because every one of them ends in the
   * same place: *this is what that thing is now*. A receiver that upserts a row
   * cannot get out of step with a sender who sent three of them, and one that
   * applied a diff could.
   *
   * The row carries its blueprint, which is what makes a model somebody else
   * summoned - out of a pack this browser has never drawn from, under a
   * blueprint that did not exist a second ago - appear without a page load.
   */
  const channelRef = useRef<RealtimeChannel | null>(null)

  /**
   * The half of this channel that carries what things are *doing*.
   *
   * Its own hook, because everything in this file is a row, a command or a
   * piece of React state, and everything in that one is a mailbox drained by a
   * frame loop in the Canvas. They share a socket and nothing else.
   */
  const wire = useThingWire()

  useEffect(() => {
    if (!tenantId) return

    const supabase = createClient()
    const channel = supabase.channel(
      worldId ? `things:${tenantId}:${worldId}` : `things:${tenantId}`,
      { config: { private: true } },
    )
    channelRef.current = channel

    // The live half - who is here, what everything is doing, and what people
    // claim they have done to it. See `useThingWire`.
    wire.attach(channel)

    channel
      .on('broadcast', { event: 'thing' }, ({ payload }) => {
        const message = payload as ThingMessage
        // The socket does not echo to the sender, but a second tab of the same
        // person is a different socket and would - and it has already applied
        // this optimistically.
        if (!message || message.u === userId) return

        if (message.gone) {
          const id = message.gone
          setThings((current) => current.filter((thing) => thing.id !== id))
          setSelectedId((current) => (current === id ? null : current))
          // If what you were in stops existing, you are no longer in it -
          // otherwise the seat pin, or worse the wheel, points at nothing and
          // you are left steering a vehicle nobody else can see.
          if (usingRef.current === id) {
            setUsingId(null)
            setAtWheel(false)
            setBodyClip(null)
          }
          return
        }

        const row = message.t
        if (!row) return

        setThings((current) => {
          const at = current.findIndex((thing) => thing.id === row.id)
          if (at === -1) return [...current, row]
          // Replaced rather than merged: the sender's row *is* the answer, and
          // a merge would let a field this client never heard about survive.
          return current.map((thing) => (thing.id === row.id ? row : thing))
        })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') wire.arrive(channel)
      })

    return () => {
      channelRef.current = null
      wire.leave()
      void supabase.removeChannel(channel)
    }
  }, [tenantId, worldId, userId, wire])

  /**
   * Say what a thing is now, or that it is gone.
   *
   * Called *after* the server has agreed, not beside the optimistic change:
   * everybody else should see what happened, and a refusal is something only
   * the person who tried it needs to know about. One round trip late is
   * imperceptible for furniture and is the difference between "somebody moved
   * the crate" and "somebody moved the crate and then it moved back".
   */
  const tell = useCallback((message: ThingMessage) => {
    channelRef.current?.send({ type: 'broadcast', event: 'thing', payload: message })
  }, [])

  /**
   * Run a command, putting the thing back if it is refused.
   *
   * Reads `things` through a ref rather than through the closure, so the
   * callback identity does not change on every edit - the rail reads these out
   * of a module-level store at click time, and a new function object per render
   * would republish the store sixty times a second for a still room.
   */
  const thingsRef = useRef(things)
  const shelfRef = useRef(shelf)

  /**
   * The two lists, mirrored into refs after each render.
   *
   * In an effect rather than assigned during render, which is the same fact
   * said two ways: a ref written while rendering is a ref React is allowed to
   * throw away, and the linter says so. Everything that reads these reads them
   * from a click or a key, which is after the effect either way.
   */
  useEffect(() => {
    thingsRef.current = things
    shelfRef.current = shelf
  })


  /**
   * The one timer, held in a ref.
   *
   * Every clip that plays once - the enter, the leave, an extra on a key - ends
   * by putting the body back to whatever it was doing, and only one of them can
   * be in flight: pressing Q twice quickly should play the wave twice, not
   * leave two timers racing to decide what the body is doing afterwards. So the
   * timer is replaced rather than added to, and cleared on unmount, which is
   * what stops a `setState` firing into a scene that has been navigated away
   * from.
   */
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)

  const after = useCallback((clip: string | null) => {
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => setBodyClip(clip), ENTER_MS)
  }, [])

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current)
    },
    [],
  )


  const run = useCallback(
    async (
      id: string,
      changes: Partial<ThingView>,
      action: () => Promise<{ ok: boolean; error?: string }>,
    ) => {
      const before = thingsRef.current.find((thing) => thing.id === id)
      if (!before) return

      setError(null)
      setBusy(true)
      patch(id, changes)

      const result = await attempt(action)
      if (!result.ok) {
        patch(id, before)
        setError(refusal(result.error ?? dict.things.refused))
      } else {
        // One place for move, turn, resize, retune and keep: they all come
        // through here, and what everybody else needs is the row afterwards.
        const now = thingsRef.current.find((thing) => thing.id === id)
        if (now) tell({ u: userId, t: now })
      }
      setBusy(false)
    },
    [patch, dict, refusal, tell, userId],
  )

  /**
   * Put one into the world, wherever it is going.
   *
   * The one place a thing comes into existence, shared by the two ways of
   * asking for one: typing `/xo bench`, which stands it up in front of you, and
   * dropping a tile out of the shelf. Both end here with a cell, a turn and a
   * size, and neither has anything else to decide.
   *
   * The optimistic row is built before the round trip and corrected after it,
   * which for a raw model means inventing a blueprint locally that the server is
   * about to mint an id for. That is the one place this hook makes something up,
   * and it is bounded: the invented blueprint is exactly what `summonModel` will
   * draw - `freshSpec` of the same model, under the same name - so the
   * correction changes an id and nothing anybody can see.
   */
  const put = useCallback(
    async (
      match: SummonMatch,
      cell: { x: number; y: number; z: number },
      facing: number,
      size: number,
      /**
       * Whether it outlives you. The browser's own preference normally;
       * `/vehicle` passes false, because a kart you called for is a loan by
       * construction - see `ThingSummoned.keep`.
       */
      keep = keepDefault,
    ): Promise<ThingView | null> => {
      const carried = { facing, scale: size }
    const local = `local:${Date.now()}`
    const blueprint: BlueprintView =
      match.kind === 'blueprint'
        ? (shelfRef.current.find((entry) => entry.id === match.id) ?? {
            id: match.id,
            name: match.name,
            spec: freshSpec(match.model),
            ownerId: '',
            visibility: 'private',
            mine: match.mine,
          })
        : {
            id: local,
            name: nameForModel(match.model),
            spec: freshSpec(match.model),
            ownerId: '',
            visibility: 'private',
            mine: true,
          }

    const row: ThingView = {
      id: local,
      blueprintId: blueprint.id,
      x: cell.x,
      y: cell.y,
      z: cell.z,
      facing: carried.facing,
      scale: carried.scale,
      tuning: {},
      placedBy: userId,
      keep,
      blueprint,
    }

    setPending(null)
    setError(null)
    setBusy(true)
    setThings((current) => [...current, row])

    const summoning =
      match.kind === 'blueprint'
        ? summonThing(slug, {
            blueprintId: match.id,
            worldId: worldId ?? undefined,
            x: cell.x,
            y: cell.y,
            z: cell.z,
            facing: carried.facing,
            scale: carried.scale,
            keep,
          }).then((result) => (result.ok ? { ...result, blueprintId: match.id } : result))
        : summonModel(slug, {
            model: match.model,
            worldId: worldId ?? undefined,
            x: cell.x,
            y: cell.y,
            z: cell.z,
            facing: carried.facing,
            scale: carried.scale,
            keep,
          })

    const result = await attempt(() => summoning)
    setBusy(false)

    if (!result.ok) {
      setThings((current) => current.filter((thing) => thing.id !== local))
      setError(refusal(result.error ?? dict.things.refused))
      return null
    }

    const settled = { ...blueprint, id: result.blueprintId }
    const placed: ThingView = {
      ...row,
      id: result.id,
      blueprintId: result.blueprintId,
      blueprint: settled,
    }
    setThings((current) =>
      current.map((thing) => (thing.id === local ? placed : thing)),
    )

    // Everybody else, now that it has an id of its own. The row carries its
    // blueprint, which is what lets a model cut from a pack this browser has
    // never drawn from appear in somebody else's room without a page load.
    tell({ u: userId, t: placed })
    // A model summoned from the packs is a blueprint the space did not have a
    // moment ago. Putting it on the shelf here is what makes the rail agree
    // with the room without a page load.
    if (match.kind === 'model') setShelf((current) => [...current, settled])

    return placed
    },
    [slug, worldId, userId, keepDefault, dict, refusal, tell],
  )

  /**
   * Answer a typed word.
   *
   * An empty result is said out loud rather than silently ignored: somebody who
   * typed `/thingiverse fountian` needs to know it was the spelling, not the
   * feature. An empty *query* opens the preview holding nothing, which the
   * panel reads as "show me the shelf".
   */
  const ask = useCallback(
    (query: string) => {
      if (!canBuild) {
        setError(refusal(dict.things.readOnly))
        return
      }

      /**
       * `/xo` on its own is not a search, it is a request to *look*.
       *
       * `resolveSummon` already answers an empty query with an empty list -
       * deliberately, so nobody gets everything - and what somebody who typed
       * the bare command wants is the shelf. So it opens the browser over the
       * room instead of handing them a ghost of nothing.
       */
      if (query.trim() === '') {
        setError(null)
        setBrowsing(true)
        return
      }

      const matches = resolveSummon(
        query,
        shelfRef.current.map((entry) => ({
          id: entry.id,
          name: entry.name,
          model: entry.spec.model,
          mine: entry.mine,
        })),
      )

      if (matches.length === 0) {
        setError(refusal(dict.things.nothingCalledThat))
        return
      }

      setError(null)
      setPending({ matches, index: 0, facing: 0, scale: 1, at: spot() })
    },
    [canBuild, dict, refusal, spot],
  )

  /**
   * Stand one up, in front of whoever asked for it.
   *
   * `/xo bench` used to hand you a bench: a ghost you carried, turned, resized
   * and then put down. That is three decisions before anything exists, and two
   * of them are ones nobody has an opinion about until they can see the thing -
   * so the bench is placed *now*, somewhere it fits, and E is how you pick it up
   * if it is in the wrong place.
   *
   * Which is the same gesture as moving anything else that is already standing
   * there, so there is one way to move a thing rather than two.
   *
   * `spot()` is what makes it safe to do without asking: it finds a free cell
   * near the person rather than dropping a bench into the wall they happen to
   * be facing - see `spotFor`.
   */
  const summon = useCallback(
    (match: SummonMatch) => {
      if (!canBuild) {
        setError(refusal(dict.things.readOnly))
        return
      }

      const cell = spot()
      if (!cell) {
        setError(refusal(dict.things.noRoom))
        return
      }

      setError(null)
      setBrowsing(false)
      setAnnounced(match.name)
      void put(match, cell, 0, 1)
    },
    [canBuild, dict, refusal, spot, put],
  )

  const cancel = useCallback(() => setPending(null), [])

  /**
   * Selecting one, as a stable function.
   *
   * `setSelectedId` would do, and is deliberately not what goes into the
   * published actions: the bag is rebuilt every render inside an effect with no
   * dependency list, and a setter sitting in there is what the exhaustive-deps
   * rule reads as "an update that could chain forever". Wrapping it says the
   * same thing to React and a quieter thing to the linter.
   */
  const select = useCallback((id: string | null) => setSelectedId(id), [])

  const nudge = useCallback(
    (change: {
      facing?: number
      scale?: number
      index?: number
      /** Where it now stands. Fixes it, so it stops following the crosshair. */
      at?: { x: number; y: number; z: number }
    }) => {
      setPending((current) => {
        if (!current) return current
        const scale = change.scale ?? current.scale
        return {
          ...current,
          facing: ((change.facing ?? current.facing) % 4 + 4) % 4,
          scale: Math.min(MAX_THING_SCALE, Math.max(MIN_THING_SCALE, round(scale))),
          index: wrap(change.index ?? current.index, current.matches.length),
          at: change.at ?? current.at,
        }
      })
    },
    [],
  )

  /**
   * Put it down.
   *
   * The optimistic row is built before the round trip and corrected after it,
   * which for a raw model means inventing a blueprint locally that the server
   * is about to mint an id for. That is the one place this hook makes something
   * up, and it is bounded: the invented blueprint is exactly what
   * `summonModel` will draw - `freshSpec` of the same model, under the same
   * name - so the correction changes an id and nothing anybody can see.
   */
  const place = useCallback(async (cell: { x: number; y: number; z: number } | null) => {
    const carried = pending
    if (!carried || !cell) return

    /**
     * Putting down something that was already here.
     *
     * Three commands rather than one, and only the ones that changed: a thing
     * carried across the room and put down the same way round has moved and
     * nothing else, and sending a turn and a resize that the decider would
     * answer with "no events" is three round trips to record one fact.
     */
    if (carried.movingId) {
      const id = carried.movingId
      const before = thingsRef.current.find((one) => one.id === id)
      setPending(null)
      if (!before) return

      void run(id, cell, () =>
        moveThing(slug, { id, worldId: worldId ?? undefined, ...cell }),
      )
      if (before.facing !== carried.facing) {
        void run(id, { facing: carried.facing }, () =>
          turnThing(slug, { id, worldId: worldId ?? undefined, facing: carried.facing }),
        )
      }
      if (before.scale !== carried.scale) {
        void run(id, { scale: carried.scale }, () =>
          scaleThing(slug, { id, worldId: worldId ?? undefined, scale: carried.scale }),
        )
      }
      return
    }

    /**
     * Placing something that does not exist yet - a typed word's preview.
     *
     * `/xo bench` from a tile stands the bench up directly and never comes
     * through here, but `ask` still answers a *typed* word with the stepping
     * preview, because a word is a guess: "ball" reaches a blueprint and
     * eleven models, and which one was meant is a decision only the person
     * holding the ghost can make. This branch is what its Place button does.
     *
     * It went missing in the summon-stands-it-up rework: the guard above
     * gained `!carried.movingId`, this half was extracted into `put` for the
     * tile path, and the preview's own button was left returning early -
     * "nothing appears", with nothing even refused. `put` is exactly the
     * extracted code, so the whole branch is the call.
     */
    const match = carried.matches[carried.index]
    if (!match) return

    setAnnounced(match.name)
    await put(match, cell, carried.facing, carried.scale)
  }, [pending, slug, worldId, run, put])

  /**
   * Play one, from the menu.
   *
   * Goes back to whatever being here looks like afterwards - the thing's loop
   * when you are in one, and your own gait when you are not. One-shot by
   * construction, exactly like the keyed inputs: a second looping animation
   * would be a body with two idle states and no way to tell which it is in.
   */
  const playClip = useCallback(
    (clip: string) => {
      setBodyClip(clip)
      const loop = thingsRef.current.find((one) => one.id === usingId)?.blueprint?.spec.use
        ?.loop
      after(loop ?? null)
    },
    [after, usingId],
  )

  /**
   * And stops saying it.
   *
   * On a timer rather than on the next action, because the next action might be
   * nothing at all: somebody who summons a bench and then stands looking at it
   * should not be left with a caption over their world forever.
   */
  useEffect(() => {
    if (!announced) return
    const timer = setTimeout(() => setAnnounced(null), ANNOUNCE_MS)
    return () => clearTimeout(timer)
  }, [announced])

  /** Hear `/thingiverse ball` from the chat box. See `callThingiverse`. */
  useEffect(() => onThingiverse(ask), [ask])

  /**
   * And `/clip`, which is either a request or a question.
   *
   * `/clip wave` is somebody who knows what they want; `/clip` and `/clip wink`
   * are both somebody asking what there is, and both get the menu - the second
   * one because a body that cannot wink is exactly the case where the list is
   * the useful answer.
   *
   * Matched without case, because nobody types Wave.
   */
  const [clipMenu, setClipMenu] = useState(false)
  const clipsRef = useRef(clips)
  useEffect(() => {
    clipsRef.current = clips
  })

  useEffect(
    () =>
      onClip((name) => {
        const wanted = name.trim().toLowerCase()
        const known = wanted
          ? clipsRef.current.find((clip) => clip.toLowerCase() === wanted)
          : undefined

        if (known) playClip(known)
        else setClipMenu(true)
      }),
    // Re-subscribing as `playClip` changes is free here, unlike the key
    // handlers: this is one set, and nothing about it depends on the order
    // listeners were added in.
    [clipsRef, playClip],
  )

  /**
   * Get in it.
   *
   * Nothing is written down: sitting on a bench is not a fact about the world,
   * it is a fact about you for as long as you are there. Which is also why
   * leaving is not a command and why nobody else's client is told - the same
   * line the emotes draw, and the same one presence already carries for free by
   * broadcasting where your body is.
   *
   * The enter clip plays once and then the loop takes over, on a timer rather
   * than on the mixer's own finished event: the mixer lives inside the Canvas
   * and this hook is outside it, and threading a callback out through three
   * components to save a `setTimeout` would be a seam earned by nothing. The
   * cost of being wrong is a clip that changes a beat early or late.
   */
  const enter = useCallback(
    (id: string, seat = 0) => {
      const thing = thingsRef.current.find((one) => one.id === id)
      const spec = thing?.blueprint?.spec
      if (!thing || !spec?.use) return

      setUsingId(id)
      setUsingSeat(seat)
      setBodyClip(spec.use.enter ?? spec.use.loop)

      if (spec.use.enter) after(spec.use.loop)
    },
    [after],
  )

  const leave = useCallback(() => {
    const thing = thingsRef.current.find((one) => one.id === usingId)
    const spec = thing?.blueprint?.spec

    /**
     * Getting out of something you were driving writes it down where it
     * stopped. This is the one moment a drive touches the log: the whole
     * journey travelled over presence, as your body always does, and the
     * parking spot is the only fact about it that outlives the drive - the
     * same shape a kicked ball has, rolling live and settling into an event.
     */
    if (atWheel && thing) {
      const parked = pose()
      if (parked) {
        void run(thing.id, { x: parked.x, y: parked.y, z: parked.z }, () =>
          moveThing(slug, {
            id: thing.id,
            worldId: worldId ?? undefined,
            x: parked.x,
            y: parked.y,
            z: parked.z,
          }),
        )
        if (parked.facing !== thing.facing) {
          void run(thing.id, { facing: parked.facing }, () =>
            turnThing(slug, {
              id: thing.id,
              worldId: worldId ?? undefined,
              facing: parked.facing,
            }),
          )
        }
      }
    }

    setAtWheel(false)
    setUsingId(null)
    setBodyClip(spec?.use?.leave ?? null)
    if (spec?.use?.leave) after(null)
  }, [after, atWheel, pose, run, slug, usingId, worldId])

  /**
   * Get behind the wheel.
   *
   * The row is handed in rather than looked up, because the caller that needs
   * that is the one that just summoned it: `thingsRef` mirrors state in an
   * effect, and immediately after `put` resolves the ref has not caught up
   * with the row it added. The E-key path holds the row anyway.
   *
   * The driver's seat is the first one - a rule, not a field; see `drivable`.
   */
  const driveIn = useCallback(
    (thing: ThingView) => {
      const spec = thing.blueprint?.spec
      if (!spec || !drivable(spec)) return

      setUsingId(thing.id)
      setUsingSeat(0)
      setAtWheel(true)
      setBodyClip(spec.use?.enter ?? spec.use?.loop ?? null)
      if (spec.use?.enter) after(spec.use?.loop ?? null)
    },
    [after],
  )

  /**
   * A key pressed while you are in something.
   *
   * Returns whether it was one of the thing's own, so the caller knows whether
   * to let the key through to everything else that is listening. A `Q` that
   * plays a wave *and* opens the emote picker is the failure this prevents.
   */
  const press = useCallback(
    (key: string): boolean => {
      const spec = thingsRef.current.find((one) => one.id === usingId)?.blueprint?.spec
      const input = spec?.use?.inputs.find(
        (one) => one.key.toUpperCase() === key.toUpperCase(),
      )
      if (!input) return false

      setBodyClip(input.clip)
      // Back to whatever being in it looks like. The extras are one-shots by
      // construction: a second animation that also loops would be a thing with
      // two idle states and no way to tell which one you are in.
      after(spec?.use?.loop ?? null)
      return true
    },
    [after, usingId],
  )

  /**
   * Pick it up, in creative mode.
   *
   * The same preview the summon flow uses, carrying a thing that already
   * exists - `movingId` is the whole difference, and it changes one thing at
   * the other end: putting it down is a `MoveThing` rather than a `SummonThing`.
   *
   * Modelled this way rather than as a separate "drag" mode because it *is* the
   * same act: a ghost under the crosshair that turns and resizes and lands on a
   * cell. Two implementations of that would be two sets of bugs about where the
   * ghost is.
   */
  const carry = useCallback(
    (id: string) => {
      const thing = thingsRef.current.find((one) => one.id === id)
      const spec = thing?.blueprint
      if (!thing || !spec) return

      setError(null)
      setPending({
        matches: [
          {
            kind: 'blueprint',
            id: spec.id,
            name: spec.name,
            model: spec.spec.model,
            mine: spec.mine,
          },
        ],
        index: 0,
        facing: thing.facing,
        scale: thing.scale,
        // Picked up from where it stands rather than from the crosshair: a
        // crate you lift should not leap to the far wall because that is what
        // you happened to be looking at when you pressed E.
        at: { x: thing.x, y: thing.y, z: thing.z },
        movingId: id,
      })
    },
    [],
  )

  const move = useCallback(
    (id: string, cell: { x: number; y: number; z: number }) => {
      /*
        Rounded here, once, for everybody who moves a thing.

        The command refuses a position off the tenth-of-a-cell grid, which is
        right for one somebody typed and wrong for one that was measured - a
        kicked ball stops at 1.2493 and there is nothing the person who kicked
        it could do about being told so. Every caller that measures would
        otherwise have to remember; this is the door they all go through.
      */
      const on = { x: toGrid(cell.x), y: toGrid(cell.y), z: toGrid(cell.z) }
      void run(id, on, () => moveThing(slug, { id, worldId: worldId ?? undefined, ...on }))
    },
    [run, slug, worldId],
  )

  const turn = useCallback(
    (id: string) => {
      const now = thingsRef.current.find((thing) => thing.id === id)
      if (!now) return
      const facing = (now.facing + 1) % 4
      void run(id, { facing }, () =>
        turnThing(slug, { id, worldId: worldId ?? undefined, facing }),
      )
    },
    [run, slug, worldId],
  )

  const resize = useCallback(
    (id: string, scale: number) => {
      const bounded = Math.min(MAX_THING_SCALE, Math.max(MIN_THING_SCALE, round(scale)))
      void run(id, { scale: bounded }, () =>
        scaleThing(slug, { id, worldId: worldId ?? undefined, scale: bounded }),
      )
    },
    [run, slug, worldId],
  )

  const tune = useCallback(
    (id: string, tuning: ThingTuning) => {
      void run(id, { tuning }, () =>
        tuneThing(slug, { id, worldId: worldId ?? undefined, tuning }),
      )
    },
    [run, slug, worldId],
  )

  const setKeep = useCallback(
    (id: string, keep: boolean) => {
      void run(id, { keep }, () =>
        setThingKeep(slug, { id, worldId: worldId ?? undefined, keep }),
      )
    },
    [run, slug, worldId],
  )

  const dismiss = useCallback(
    (id: string) => {
      const before = thingsRef.current.find((thing) => thing.id === id)
      if (!before) return

      setSelectedId((current) => (current === id ? null : current))
      setThings((current) => current.filter((thing) => thing.id !== id))
      // Dismissing the thing you are in is reachable from the rail, and the
      // same rule applies as when somebody else does it over the channel.
      if (usingRef.current === id) {
        setUsingId(null)
        setAtWheel(false)
        setBodyClip(null)
      }
      setBusy(true)

      void attempt(() => dismissThing(slug, { id, worldId: worldId ?? undefined })).then(
        (result) => {
          setBusy(false)
          if (result.ok) {
            tell({ u: userId, gone: id })
            return
          }
          // Put it back where it stood. A thing that vanished and stayed
          // vanished after a refusal is a thing somebody will summon again.
          setThings((current) => [...current, before])
          setError(refusal(result.error ?? dict.things.refused))
        },
      )
    },
    [slug, worldId, userId, dict, refusal, tell],
  )

  /**
   * `/vehicle kart`, and the bare `/vehicle` that puts it away again.
   *
   * One sentence does the whole of it: resolve the word against the shelf's
   * drivable blueprints, stand the winner up in front of you facing the way
   * you face, and get in. The other direction is symmetric - bare `/vehicle`
   * gets you out and takes the vehicle with it, because a vehicle you called
   * for with a word is a loan, not furniture (see `put`'s `keep`).
   *
   * Only blueprints answer, never raw catalogue models: driving needs a
   * vehicle block and a seat, and a model has neither until somebody has been
   * to the bench. The refusal says so rather than summoning a car-shaped
   * statue - a vehicle that will not go is a worse answer than a sentence.
   */
  useEffect(
    () =>
      onVehicle((query) => {
        if (!canBuild) {
          setError(refusal(dict.things.readOnly))
          return
        }

        const wanted = query.trim()

        if (wanted === '') {
          // The one you are in first; failing that, the last one you called
          // for that is still standing about. `/vehicle` twice is a round trip.
          const held = atWheel ? usingId : null
          const parked = [...thingsRef.current]
            .reverse()
            .find(
              (thing) =>
                thing.placedBy === userId &&
                !thing.keep &&
                thing.blueprint &&
                drivable(thing.blueprint.spec),
            )
          const going = held ?? parked?.id ?? null

          if (!going) {
            setError(refusal(dict.things.noVehicleOut))
            return
          }

          if (held) {
            setAtWheel(false)
            setUsingId(null)
            setBodyClip(null)
          }
          dismiss(going)
          return
        }

        const drivables = shelfRef.current
          .filter((entry) => drivable(entry.spec))
          .map((entry) => ({
            id: entry.id,
            name: entry.name,
            model: entry.spec.model,
            mine: entry.mine,
          }))

        const match = resolveSummon(wanted, drivables).find(
          (one) => one.kind === 'blueprint',
        )
        if (!match) {
          setError(refusal(dict.things.noVehicleCalledThat))
          return
        }

        const cell = spot()
        if (!cell) {
          setError(refusal(dict.things.noRoom))
          return
        }

        // Facing the way you face, so pulling away is forward rather than a
        // three-point turn out of a wall.
        const facing = pose()?.facing ?? 0

        setError(null)
        void put(match, cell, facing, 1, false).then((placed) => {
          if (placed) driveIn(placed)
        })
      }),
    [atWheel, canBuild, dict, dismiss, driveIn, pose, put, refusal, spot, userId, usingId],
  )

  /**
   * The blueprint commands.
   *
   * Here rather than in the rail because the shelf is this hook's state: the
   * rail is a view of it, and a rail that wrote to the server and then told the
   * scene would be two owners of one list. Each patches optimistically and
   * reverts, exactly as the thing commands do.
   */
  const patchBlueprint = useCallback(
    (id: string, changes: Partial<BlueprintView>) => {
      setShelf((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
      )
      // Anything standing in the room carries a copy of the blueprint so it can
      // be drawn without a second lookup. It has to move with the shelf, or the
      // rail would rename something the room keeps calling by its old name.
      setThings((current) =>
        current.map((thing) =>
          thing.blueprintId === id && thing.blueprint
            ? { ...thing, blueprint: { ...thing.blueprint, ...changes } }
            : thing,
        ),
      )
    },
    [],
  )

  const runBlueprint = useCallback(
    async (
      id: string,
      changes: Partial<BlueprintView>,
      action: () => Promise<{ ok: boolean; error?: string }>,
    ) => {
      const before = shelfRef.current.find((entry) => entry.id === id)
      if (!before) return

      setError(null)
      setBusy(true)
      patchBlueprint(id, changes)

      const result = await attempt(action)
      if (!result.ok) {
        patchBlueprint(id, before)
        setError(refusal(result.error ?? dict.things.refused))
      }
      setBusy(false)
    },
    [patchBlueprint, dict, refusal],
  )

  /**
   * Whether this kind of thing falls.
   *
   * On the *blueprint*, so it is the answer for every one of them - which is
   * what makes it the right thing to reach from the chip: the chip is about
   * what you are placing, not about one that is already down. A single thing
   * that should differ from its kind has its own switch in the rail.
   */
  const setFalls = useCallback(
    (id: string, falls: boolean) => {
      const before = shelfRef.current.find((entry) => entry.id === id)
      if (!before) return

      const spec = { ...before.spec, body: falls ? (before.spec.body ?? {}) : null }
      void runBlueprint(id, { spec }, () => reshapeBlueprint(slug, { id, spec }))
    },
    [runBlueprint, slug],
  )

  /**
   * Whether this kind of thing stops you, or is something to kick.
   *
   * The pair with `setFalls`, and they are a pair on purpose: a thing that
   * falls and does not block is a ball - see `knockable` - so the two switches
   * beside each other in the panel are how somebody turns a summoned football
   * into one you can actually play with. Neither of them alone does it, which
   * is why they are drawn together rather than a room apart.
   */
  const setSolid = useCallback(
    (id: string, solid: boolean) => {
      const before = shelfRef.current.find((entry) => entry.id === id)
      if (!before) return

      const spec = { ...before.spec, blocking: solid }
      void runBlueprint(id, { spec }, () => reshapeBlueprint(slug, { id, spec }))
    },
    [runBlueprint, slug],
  )

  const share = useCallback(
    (id: string, visibility: 'private' | 'public') => {
      void runBlueprint(id, { visibility }, () =>
        setBlueprintVisibility(slug, { id, visibility }),
      )
    },
    [runBlueprint, slug],
  )

  const hand = useCallback(
    (id: string, ownerId: string) => {
      void runBlueprint(id, { ownerId, mine: false }, () =>
        handOverBlueprint(slug, { id, ownerId }),
      )
    },
    [runBlueprint, slug],
  )

  const rename = useCallback(
    (id: string, name: string) => {
      void runBlueprint(id, { name }, () => renameBlueprint(slug, { id, name }))
    },
    [runBlueprint, slug],
  )

  /**
   * Take it off the shelf.
   *
   * The shelf loses it and the room does not, which is the read model's own
   * behaviour rather than a shortcut here - see the note on `BlueprintRetired`
   * about why retiring does not go round the rooms collecting furniture.
   */
  const retire = useCallback(
    (id: string) => {
      const before = shelfRef.current
      setShelf((current) => current.filter((entry) => entry.id !== id))
      setBusy(true)

      void attempt(() => retireBlueprint(slug, id)).then((result) => {
        setBusy(false)
        if (result.ok) return
        setShelf(before)
        setError(refusal(result.error ?? dict.things.refused))
      })
    },
    [slug, dict, refusal],
  )

  /**
   * Publish the lot for the rail, which lives three route segments up.
   *
   * On every render, with the equality check inside `publishThingiverse` doing
   * the work of keeping a still room quiet. The actions object is rebuilt each
   * time and deliberately not memoised as a whole: it is read at click time, not
   * compared, which is the reason it is kept out of the snapshot.
   */
  useEffect(() => {
    publishThingiverse(
      {
        slug,
        worldId,
        shelf,
        things,
        selectedId,
        canBuild: canBuild && !readOnly,
        keepDefault,
        busy,
        error,
      },
      {
        summon,
        ask,
        carry,
        select,
        move,
        turn,
        resize,
        tune,
        setKeep,
        chooseKeep: chooseLoans,
        dismiss,
        share,
        setFalls,
        hand,
        rename,
        retire,
      },
    )
  })

  useEffect(() => () => clearThingiverse(slug, worldId), [slug, worldId])

  /**
   * Take your loans with you.
   *
   * Everything you summoned as *not* furniture goes when you leave the world -
   * the ball you got out, the chair you pulled over. Fired from the cleanup, so
   * it runs on walking into another room as well as on closing the tab, and
   * fire-and-forget because there is nothing to wait for and nowhere left to
   * show a refusal.
   *
   * Best-effort, and deliberately so: a tab that is killed never gets here, and
   * a request that fails leaves a chair somebody else can take away. That is
   * why the flag is on the *row* - see `ThingSummoned.keep` - so a thing that
   * outlived this sweep is still a thing anything else can recognise as a loan.
   */
  useEffect(
    () => () => {
      for (const thing of thingsRef.current) {
        if (thing.keep || thing.placedBy !== userId) continue
        void dismissThing(slug, { id: thing.id, worldId: worldId ?? undefined })
        // Told before the socket goes: this effect is declared above the
        // channel's, so React runs its cleanup first and the channel is still
        // subscribed. Anybody who misses it sees the loan gone on their next
        // load anyway - the row says it was one.
        tell({ u: userId, gone: thing.id })
      }
    },
    [slug, worldId, userId],
  )

  return {
    things,
    shelf,
    selected,
    selectedId,
    setSelectedId,
    browsing,
    setBrowsing,
    announced,
    step,
    setStep,
    pending,
    carrying: pending ? (pending.matches[pending.index] ?? null) : null,
    using,
    usingSeat,
    atWheel,
    driveIn,
    near,
    bodyClip,
    clipMenu,
    setClipMenu,
    playClip,
    setNearId,
    enter,
    leave,
    press,
    carry,
    busy,
    error,
    setError,
    ask,
    summon,
    cancel,
    nudge,
    place,
    move,
    turn,
    resize,
    tune,
    setFalls,
    setSolid,
    dismiss,
    /**
     * The live half: who this tab is, what the driver last said, what has been
     * claimed since, and the two ways to speak.
     *
     * Handed over as one object rather than seven more keys on a return value
     * that already has forty, and handed to the *Canvas* rather than used here:
     * every one of these is read inside a frame loop. See
     * `@/app/world/lounge/_sim/thing-life`.
     */
    live: wire,
  }
}

/**
 * How long an enter, a leave or an extra clip is given before the body goes back
 * to what it was doing.
 *
 * One number rather than the clip's own length, because the clip's length is
 * known only to the mixer inside the Canvas and these three moments are all
 * short by design. Six hundred milliseconds is about a sit-down; a clip shorter
 * than that holds its last frame for the remainder, which reads as a pause, and
 * a longer one is cut off, which reads as a snap. Both are survivable and
 * neither is worth a callback threaded out of the render loop.
 */
const ENTER_MS = 600

/**
 * How long the world says what you just put down.
 *
 * Long enough to read a name and the words "E to move" without hurrying, short
 * enough that it is gone before it becomes part of the furniture. Four seconds
 * is about two readings.
 */
const ANNOUNCE_MS = 4000

/**
 * What travels between the people in a room.
 *
 * Short keys, because this is a wire format and the room's other packets are
 * written the same way - `u` for who sent it, `t` for the thing, `gone` for an
 * id that is not there any more.
 *
 * A whole row rather than a diff. See the note on the channel: every verb ends
 * in the same sentence, which is *this is what that thing is now*, and a
 * receiver that upserts cannot fall out of step with a sender who sent three.
 */
interface ThingMessage {
  u: string
  t?: ThingView
  gone?: string
}

/** Two decimals. A scale nobody typed should not arrive as 1.0000000000000002. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Step through the matches, wrapping at both ends. An empty list stays at 0. */
function wrap(index: number, length: number): number {
  if (length === 0) return 0
  return ((index % length) + length) % length
}
