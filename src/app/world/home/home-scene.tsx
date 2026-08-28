'use client'

import { PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRouter } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { HomeHud } from '@/app/world/home/home-hud'
import { HomePropModel, TinyModel } from '@/app/world/home/tiny-model'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import {
  EYE_HEIGHT,
  PLAYER_RADIUS,
  step as stepPhysics,
} from '@/app/world/lounge/_sim/physics'
import {
  actionsAnchor,
  emoteAnchor,
  Joystick,
  type LookDelta,
  type MoveInput,
  stickAnchor,
  TapButton,
  useIsTouch,
  useLookDrag,
  useMediaQuery,
} from '@/app/world/lounge/_hud/touch-controls'
import { useHand } from '@/lib/controls/use-hand'
import {
  fovFor,
  MAX_DELTA,
  placeCamera,
  probeTile,
  SPRINT_PACE,
  standingOn,
  turnCamera,
  UP,
  type View,
  WALK_PACE,
  walkAxes,
} from '@/app/world/_sim/rig'
import { useDeskControls } from '@/app/world/_hooks/desk-controls'
import { useHomesteadSync } from '@/app/world/_hooks/homestead-sync'
import { EmoteBubble } from '@/app/world/_canvas/emote-bubble'
import { EmotePicker } from '@/app/world/_hud/emote-picker'
import { CreaturePicker } from '@/app/world/_hud/creature-picker'
import { DoorPanel, DoorScreen } from '@/app/world/_canvas/room-door'
import { angleDelta } from '@/app/world/_presence/presence-core'
import { PresenceSender, RemotePeeps } from '@/app/world/_presence/room-peers'
import { Roamers, useRoamable } from '@/app/world/_canvas/roamers'
import { type Drift, drift } from '@/app/world/_sim/autopilot'
import { DriftToggle } from '@/app/world/_hud/drift-toggle'
import { enterScene } from '@/app/world/_stores/here-store'
import { type Room, useRoom } from '@/app/world/_presence/room-presence'
import { useRoomChime } from '@/app/world/_presence/roster-chime'
import { useAudioGate } from '@/app/components/audio/use-audio'
import { play } from '@/lib/audio/engine'
import type { AgentView } from '@/domain/agents/queries'
import { SCENE_MASK, SKY } from '@/app/world/sky'
import type { HomesteadView } from '@/domain/homestead/queries'
import {
  isSolid as propIsSolid,
  homeProp,
  propsFor,
  SHELLS,
  type Theme,
} from '@/domain/home/catalog'
import {
  canExtend,
  canMove,
  canPlace,
  canShrink,
  comfort,
  coveredTiles,
  deserialize,
  targetOfUse,
  extend,
  extensionCost,
  extensionTheme,
  type HomeState,
  initialState,
  moveProp,
  occupancy,
  type Placed,
  place as placeProp,
  propAt,
  freeSpotNear,
  remove,
  type RestSpot,
  restSpotAt,
  roomAt,
  serialize,
  shrink,
  shrinkRefund,
  standUp,
  sitOn,
} from '@/domain/home/game'
import {
  blockedEdges,
  blockedTiles,
  edgeKey,
  exitAt,
  type Plan,
  reachable,
  wallsFor,
} from '@/domain/home/plan'
import {
  cellToTileAxis,
  parseTile,
  TILE,
  tileKey,
  tileToWorld,
  worldToTile,
  type TileKey,
} from '@/domain/world/grid'
import { type DecoratablePlace, hrefFor } from '@/domain/world/places'
import { createRoamer, type Roamable, seedFrom } from '@/domain/world/autonomy'
import { comfortKey, STARTING_COINS } from '@/domain/world/save'
import { readShared, watchShared, writeShared } from '@/app/world/_stores/shared-save'
import { homeDict } from '@/app/i18n/home'
import type { PlaceId } from '@/domain/world/places'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * The house, and the garden it stands in.
 *
 * One component for both, because they are the same game: a floor plan you walk
 * around and put furniture in. The garden differs in its floor model, its
 * catalogue and the fact that its walls are hedges, and every one of those
 * differences is data - see `domain/home/plan`. A second copy of this file with
 * "grass" written in it would have been the same code with a worse future.
 *
 * The split the café established holds here too: `domain/home` owns every rule
 * and this file owns none of them. What lives here is what genuinely needs a
 * camera and a clock.
 */

/** Scratch vectors. Allocated once; the frame loop must not make garbage. */
const FORWARD = new THREE.Vector3()
const RIGHT = new THREE.Vector3()
const WALK_DIR = new THREE.Vector3()
const BODY_DIR = new THREE.Vector3()


/**
 * Camera rigs.
 *
 * Decorate mode's height is above wall height, which is what lets it skip the
 * wall check and look down into the rooms over the top of them. Both booms are
 * steep enough to climb a four-unit wall before they reach one - a house square
 * is 2 units and a room is three of them across, so a shallow boom is always
 * inside a wall and the camera spends the whole game jammed against your back.
 */
const VIEWS: Record<Mode, View> = {
  look: { distance: 4.5, height: 5.5 },
  decorate: { distance: 8, height: 13, overhead: true },
}

export type Mode = 'look' | 'decorate'

/**
 * Collision heights.
 *
 * The player cannot tell these apart - their head is at 1.7 and both numbers
 * clear it - but the *camera* can, and it is the reason decorate mode can lift
 * itself over the walls for a plan view while walking around stays boxed in.
 */
const WALL_HEIGHT = 4
const FURNITURE_HEIGHT = 2

function saveKey(place: DecoratablePlace): string {
  return `home.save.${place}.v1`
}

/**
 * Lay the workspace's recorded room over a freshly built one.
 *
 * The plan - which squares exist and which room each belongs to - still comes
 * from code, because it is the same for every workspace and storing forty
 * identical rows per tenant to say "the house is house-shaped" would be
 * bookkeeping for its own sake. What the log carries is the *difference*: the
 * ground that was bought and the furniture that was placed.
 *
 * Note the furniture is replaced wholesale rather than merged. A workspace that
 * has sold the bed it started with must not have it reappear because the
 * opening plan still mentions one.
 */
function applyHomestead(base: HomeState, view: HomesteadView): HomeState {
  const rooms = new Map(base.rooms)
  for (const tile of view.ground) {
    if (rooms.has(tile)) continue
    // Bought ground joins the room it touches, exactly as it did when it was
    // bought - the same rule the click used, re-applied to the same map.
    const theme = extensionTheme({ ...base, rooms }, tile)
    rooms.set(tile, theme ?? 'living')
  }

  const props = new Map<TileKey, Placed>()
  for (const entry of view.props) {
    props.set(entry.tile, { propId: entry.propId, rotY: entry.rotY })
  }

  return { ...base, rooms, props, coins: view.coins }
}

/**
 * Which of the three doorway phrases an exit gets.
 *
 * Keyed on where it *goes*, which the plan already records, rather than on the
 * English sentence it used to carry. The three destinations and the three
 * phrases have always been the same three things.
 */
const EXIT_WORD: Record<PlaceId, 'outside' | 'inside' | 'cafe'> = {
  outdoor: 'outside',
  home: 'inside',
  cafe: 'cafe',
  // No door leads to the lounge from a homestead - it is the commons, reached
  // from the rail - so this arm is unreachable. It exists because `Exit.to` is
  // a `PlaceId`, and a map that cannot be indexed is worse than a spare row.
  lounge: 'outside',
}

export function HomeGame({
  place,
  /** The workspace this house belongs to. Every house is inside one. */
  slug,
  /** The room as the log has it. */
  initial,
  /** Which animal you are, read from your profile on the server. */
  avatar,
  /** Who you are on the room channel. */
  presence,
  /**
   * Whose house this is.
   *
   * Equal to `presence.userId` when it is your own, which is the case the whole
   * door apparatus collapses to nothing for. Anyone else and you are a visitor,
   * and `initial.door` decides whether you get in.
   */
  owner,
  /**
   * The creatures living in this room - the owner's, not the visitor's.
   *
   * Empty when the flag is off, so there is no branch here: the scene mounts
   * `<Roamers>` unconditionally and an empty roster draws nothing.
   */
  agents: initialAgents,
  /**
   * Who takes you through a doorway, when it is not the router.
   *
   * ---------------------------------------------------------------------------
   * Absent is the world, present is a cartridge
   * ---------------------------------------------------------------------------
   * On `/t/<slug>/home` each place is its own page with its own save, and
   * walking out of the front door is a navigation - which is what the default
   * below still does. The house *cartridge* is one game holding both rooms, so
   * the same doorway is a view change inside a canvas that is already mounted:
   * a route push there would leave the room, the match and the frame it is
   * being played in.
   *
   * `to` is the other half and cannot be inferred from `go`. The garden has a
   * gap in its hedge that leads to the café, and the café is a *different*
   * cartridge - so that exit has to stop being a hole in the shell rather than
   * merely stop being pressable. See `reachable`.
   */
  travel,
}: {
  place: DecoratablePlace
  avatar: string
  slug: string
  initial: HomesteadView
  presence: { tenantId: string; userId: string; name: string }
  owner: { userId: string; name: string }
  agents: AgentView[]
  travel?: { to: readonly PlaceId[]; go: (to: PlaceId) => void }
}) {
  // Named for what it is rather than `room`, which in this file already means
  // "which room of the house is under the cursor".
  useAudioGate()

  // There is a world on screen, which is what the radio gates on. See the same
  // line in cafe-scene.tsx.
  useEffect(() => enterScene(), [])

  const presenceRoom = useRoom({
    tenantId: presence.tenantId,
    place,
    ownerId: owner.userId,
    door: initial.door,
    userId: presence.userId,
    name: presence.name,
    avatar,
  })

  // The house and the garden both, since both are rooms somebody can be let
  // into while your back is turned to the door.
  useRoomChime(presenceRoom.peers)

  const [pickerOpen, setPickerOpen] = useState(false)

  /**
   * The roster, held here rather than in the panel that edits it.
   *
   * `<Roamers>` draws from this, so an adoption has to reach the canvas and not
   * just the list - which is why `<CreaturePicker>` hands the whole array back
   * up rather than owning it. Seeded from the server and thereafter local: these
   * actions do not revalidate a path, so nothing else is going to update it.
   */
  const [agents, setAgents] = useState(initialAgents)

  /**
   * Whether the body is running itself.
   *
   * Held here rather than in the frame loop so the toggle can render its own
   * state, and reset by nothing: walking cancels it inside the loop, which
   * calls back up to here.
   */
  const [drifting, setDrifting] = useState(false)

  /**
   * Visiting is read-only.
   *
   * Not a policy decision so much as an accurate reflection of one already
   * made: the homestead stream id is derived from the *session's* user, so a
   * server action fired in somebody else's house would quietly redecorate your
   * own. Hiding the tools is what stops that being a surprise - see
   * `homesteadStreamId`.
   */
  const visiting = presence.userId !== owner.userId
  /**
   * The room as the log has it.
   *
   * Seeded synchronously from the server's copy rather than in an effect: the
   * page already fetched it, so there is nothing to wait for and no flash of an
   * empty house before the furniture arrives.
   */
  const [game, setGame] = useState<HomeState>(() => {
    const base = initialState(place)
    return applyHomestead(
      travel ? { ...base, plan: reachable(base.plan, travel.to) } : base,
      initial,
    )
  })

  /**
   * Writes go nowhere while visiting.
   *
   * `useHomesteadSync` no-ops without a slug, which is exactly the behaviour a
   * visitor needs - and passing `undefined` here is a much stronger guarantee
   * than remembering to disable every button, because there is no code path
   * left that could fire a command at all.
   */
  const sync = useHomesteadSync(
    visiting ? undefined : slug,
    place === 'outdoor' ? 'outdoor' : 'home',
  )
  /**
   * The same state, readable from the frame loop.
   *
   * Collision and the focus probe run sixty times a second and must not close
   * over a stale render. Mirrored in an effect rather than assigned during one,
   * so that React's rules are not being bent to save a line.
   */
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  }, [game])

  const [chosenMode, setMode] = useState<Mode>('look')

  /**
   * A visitor is always just looking.
   *
   * Derived rather than guarded at each of the three places that can set it -
   * the Tab key, the HUD toggle, the touch button - because one of those is
   * exactly the sort of thing to be added later without remembering this.
   *
   * The writes were already going nowhere (`useHomesteadSync` gets no slug
   * while visiting), which is precisely what made this worth closing: the
   * tools *appeared* to work, the room changed under your hands, and the
   * changes evaporated on reload with no explanation.
   */
  const mode: Mode = visiting ? 'look' : chosenMode
  const [locked, setLocked] = useState(false)
  /** The player has clicked in once, whether or not pointer lock was granted. */
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [focus, setFocus] = useState<TileKey | null>(null)
  const [standing, setStanding] = useState<TileKey | null>(null)
  const [chosen, setChosen] = useState<string>(() => propsFor('bedroom')[0].id)
  const [rotation, setRotation] = useState(0)
  const [moving, setMoving] = useState<TileKey | null>(null)

  const router = useRouter()
  const isTouch = useIsTouch()
  /* Which way round the touch rig goes. See ./_hud/touch-controls' anchors. */
  const { hand } = useHand()
  const compact = useMediaQuery('(max-width: 640px)')

  const plan = game.plan
  const exit = useMemo(() => exitAt(plan, standing), [plan, standing])

  /**
   * The room under the cursor, which is what the palette is filtered by.
   *
   * Bare ground has no room, so it borrows the one it would *join* if you bought
   * it - see `extensionTheme`. Without that step it fell through to the default,
   * and aiming one square off the end of the bedroom announced that you were
   * extending the living room and offered you a sofa to put there.
   */
  const room: Theme = useMemo(
    () =>
      (focus && (roomAt(game, focus) ?? extensionTheme(game, focus))) || 'living',
    [game, focus],
  )

  /**
   * What would actually be placed, which is not always what was last clicked.
   *
   * Walking from the bedroom into the bathroom with a bed selected has to
   * resolve to *something* the bathroom accepts, or the cursor is red everywhere
   * with no explanation - the refusal would be about the room, and the player is
   * looking at the square. Derived here rather than corrected in an effect,
   * because a value that can be computed from what is already known has no
   * business being a second copy that has to be kept in step.
   */
  const options = useMemo(() => propsFor(room), [room])
  const selected = options.some((entry) => entry.id === chosen)
    ? chosen
    : options[0].id

  // Refs for the handlers registered once, which outlive any single render.
  const modeRef = useRef(mode)
  const focusRef = useRef<TileKey | null>(null)
  const movingRef = useRef<TileKey | null>(null)
  const rotationRef = useRef(rotation)
  const selectedRef = useRef(selected)
  const exitRef = useRef(exit)
  const restingRef = useRef(game.resting)
  useEffect(() => {
    restingRef.current = game.resting
  }, [game.resting])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    movingRef.current = moving
  }, [moving])
  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])
  useEffect(() => {
    exitRef.current = exit
  }, [exit])

  const moveRef = useRef<MoveInput>({
    forward: 0,
    strafe: 0,
    vertical: 0,
    sprint: false,
  })
  const lookRef = useRef<LookDelta>({ dx: 0, dy: 0 })
  const lookDrag = useLookDrag(lookRef, isTouch)

  const onStick = useCallback((strafe: number, forward: number) => {
    moveRef.current.strafe = strafe
    moveRef.current.forward = forward
  }, [])

  // --- persistence ----------------------------------------------------------

  /**
   * Whether the state below came from a save, or is still the shipped house.
   *
   * Writing is gated on this, and it has to be *state* rather than a ref. A ref
   * set inside the load effect is already true by the time the save effect runs
   * in the same commit - but `game` in that effect's closure is still the fresh
   * house holding the opening float, so it published 120 coins straight over an
   * afternoon's takings. One render later it published the right number again,
   * which is why it looked intermittent: leave for the café inside that window,
   * or have the café open in another tab, and the money was simply gone.
   *
   * As state, the flag and the state it is guarding come from the same render,
   * so a stale write is not possible rather than merely unlikely.
   */
  const [loaded, setLoaded] = useState(false)

  /**
   * Load the furniture from this place's own save, and the money from the purse
   * the café shares.
   *
   * The purse wins outright when it exists - see `domain/world/save`. That is
   * what makes a lunch service spendable on a sofa, and it is why nothing in
   * `SavedHome` mentions coins.
   */
  useEffect(() => {
    /**
     * A workspace's house is already loaded, and must not be overwritten.
     *
     * Falling through to the browser save here would replace a room three
     * colleagues furnished with whatever this laptop happened to have cached
     * from the single-player prototype - and then the save effect below would
     * write that back over the purse.
     */
    if (slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true)
      return
    }

    let restored = initialState(place)
    try {
      const saved = window.localStorage.getItem(saveKey(place))
      if (saved) restored = deserialize(place, JSON.parse(saved))
    } catch {
      // A save from an older shape is not worth crashing over - the house just
      // starts furnished as it shipped.
    }
    /**
     * The one place a save may legitimately land after the first render.
     *
     * It cannot move into the `useState` initialiser: this component is
     * server-rendered, `localStorage` does not exist there, and a client that
     * initialised from a save would hydrate a different balance than the server
     * printed. Reading an external system on mount and setting state once is
     * precisely what the rule's own escape hatch is for.
     */
    setGame({ ...restored, coins: readShared('coins') ?? STARTING_COINS })
    setLoaded(true)
  }, [place, slug])

  /**
   * Follow the purse while the café is open in another tab.
   *
   * Without this you could spend the same coins twice: earn in one tab, spend
   * here, switch back, and the café is still showing the pre-spend balance.
   */
  useEffect(() => {
    // The workspace's purse lives in Postgres, not in this browser. Following
    // the local one would let a single-player session's coins leak into it.
    if (slug) return
    return watchShared('coins', (coins) => {
      setGame((current) => (current.coins === coins ? current : { ...current, coins }))
    })
  }, [slug])

  /**
   * Write back whenever anything actually changed.
   *
   * An effect rather than the café's four-second interval, because nothing here
   * ticks: the state only moves when you buy, sell or drag something, so
   * "changed" and "worth saving" are the same event.
   */
  useEffect(() => {
    if (!loaded) return
    // Nothing to write: the log is the save, and `sync` already sent it.
    if (slug) return

    try {
      window.localStorage.setItem(
        saveKey(place),
        JSON.stringify(serialize(game)),
      )
    } catch {
      // Private browsing. Play on.
    }
    writeShared('coins', game.coins)
    // Its own slot, not a shared one: the garden and the house are decorated
    // separately and the café adds them up.
    writeShared(comfortKey(place), comfort(game))
  }, [game, place, loaded, slug])

  // --- actions --------------------------------------------------------------

  /**
   * Left click while decorating: extend the house, drop what is in hand, or buy
   * something new.
   *
   * Aiming past the edge of the floor is unambiguous - there is nothing there to
   * furnish - so the same click that buys a sofa buys the square to put it on.
   * A separate "extend" mode would have been a mode to forget you were in.
   */
  const doPlace = useCallback(() => {
    const key = focusRef.current
    if (!key) return

    /**
     * Which of the three things this click is has to be decided *before* the
     * optimistic update, not inside it.
     *
     * `setGame`'s updater sees the state, but it may run twice under Strict
     * Mode and it runs after this function has returned - so firing the server
     * action from in there would send some placements twice and read
     * `movingRef` after it had already been cleared. Deciding here, from the
     * ref that mirrors the same state, keeps the local change and the recorded
     * change describing one event.
     */
    const current = gameRef.current
    const carrying = movingRef.current
    const rotY = rotationRef.current
    const propId = selectedRef.current

    if (!current.rooms.has(key)) {
      // `.ok`, not truthiness - these return a Verdict carrying the refusal in
      // words, and every object is truthy. Without it the guard passes on a
      // refusal and fires a server call the decider is certain to reject.
      if (canExtend(current, key).ok) {
        sync.buy([key])
        play('build')
      }
      setGame((state) => extend(state, key))
    } else if (carrying) {
      if (canMove(current, carrying, key, rotY).ok) sync.move(carrying, key, rotY)
      setGame((state) => moveProp(state, carrying, key, rotY))
    } else {
      // Off the same verdict the server call is gated on, so the knock and the
      // write always agree about whether anything happened.
      if (canPlace(current, key, propId, rotY).ok) {
        sync.place(key, propId, rotY)
        play('build')
      }
      setGame((state) => placeProp(state, key, propId, rotY))
    }

    if (movingRef.current) setMoving(null)
  }, [sync])

  /** Pick up whatever is under the cursor, or put down the thing in hand. */
  const doPickUp = useCallback(() => {
    if (movingRef.current) {
      setMoving(null)
      return
    }
    const key = focusRef.current
    if (!key) return
    const found = propAt(gameRef.current, key)
    if (!found) return

    // Held by its anchor, not by the square that was clicked, so that dropping
    // a sofa put down by its far end does not shunt it a square along.
    setMoving(found.anchor)
    setRotation(found.placed.rotY)
  }, [])

  const doSell = useCallback(() => {
    // Right-click cancels a move rather than selling something else.
    if (movingRef.current) {
      setMoving(null)
      return
    }
    const key = focusRef.current
    if (!key) return

    // Sold by its anchor, so selling a sofa by its far end refunds the sofa
    // rather than silently doing nothing on a square the log has no prop for.
    const found = propAt(gameRef.current, key)
    if (found) {
      sync.remove(found.anchor)
      setGame((current) => remove(current, key))
      return
    }

    /**
     * Nothing on it, so the square itself is what is for sale.
     *
     * The same verb rather than a second key: "sell what is under the cursor"
     * is one idea, and clearing a square and then shrinking the room is the
     * order you would do it in anyway. `canShrink` is what refuses the ones
     * that would cut the house in half - see the connectivity check there.
     */
    if (canShrink(gameRef.current, key).ok) {
      sync.sell([key])
      setGame((current) => shrink(current, key))
    }
  }, [sync])

  const doRotate = useCallback(() => {
    setRotation((current) => (current + Math.PI / 2) % (Math.PI * 2))
  }, [])

  /**
   * Take the way out you are standing on.
   *
   * A route change rather than anything clever: each place is its own page with
   * its own save, and the only thing they share is the purse.
   */
  const doTravel = useCallback(() => {
    const found = exitRef.current
    if (!found) return
    // Handed over whole when something else owns the journey - the house
    // cartridge holds both rooms and swaps the view. See `travel`.
    if (travel) {
      travel.go(found.to)
      return
    }
    // Slug-aware, or walking out of a workspace's front door drops you into
    // your own single-player garden with somebody else's furniture in it.
    router.push(hrefFor(found.to, slug))
  }, [router, slug, travel])

  /** Sit on, or get out of, whatever the crosshair is on. */
  const doUse = useCallback(() => {
    setGame((current) => sitOn(current, focusRef.current))
  }, [])

  /** Called from the frame loop the moment you try to walk while seated. */
  const doStandUp = useCallback(() => {
    setGame(standUp)
  }, [])

  /**
   * E does the one obvious thing for wherever you are.
   *
   * Getting up comes first, before the doorway: a chair standing on the
   * threshold would otherwise leave E travelling instead of standing you up,
   * and being unable to get out of the furniture is the worst thing this screen
   * can do to you. Walking off through the front door while still technically
   * seated on the doormat is not a thing anybody has to be protected from.
   */
  const doAct = useCallback(() => {
    if (restingRef.current) doStandUp()
    else if (exitRef.current) doTravel()
    else doUse()
  }, [doStandUp, doTravel, doUse])

  const cyclePalette = useCallback(
    (direction: number) => {
      // Stepped from what is *shown*, not from what was last clicked, so the
      // first press after changing rooms moves one along rather than jumping
      // back to a bed you can no longer place.
      const at = options.findIndex((entry) => entry.id === selectedRef.current)
      const next = (at + direction + options.length) % options.length
      setChosen(options[next].id)
    },
    [options],
  )

  // --- keyboard -------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'Tab':
          // The browser would otherwise move focus to the address bar, and the
          // canvas would silently stop hearing WASD.
          event.preventDefault()
          setMode((current) => (current === 'look' ? 'decorate' : 'look'))
          break
        case 'KeyE':
        case 'Space':
          if (modeRef.current === 'look') doAct()
          break
        case 'KeyZ':
          // Toggling rather than opening, so the same key gets you back out.
          setPickerOpen((current) => !current)
          break
        case 'Escape':
          // Whatever else Escape is doing - releasing the pointer lock, usually
          // - it should never leave somebody sitting in a bath they cannot get
          // out of.
          doStandUp()
          break
        case 'KeyR':
          if (modeRef.current === 'decorate') doRotate()
          break
        case 'KeyG':
          if (modeRef.current === 'decorate') doPickUp()
          break
        case 'KeyX':
          if (modeRef.current === 'decorate') doSell()
          break
        case 'BracketLeft':
          if (modeRef.current === 'decorate') cyclePalette(-1)
          break
        case 'BracketRight':
          if (modeRef.current === 'decorate') cyclePalette(1)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doAct, doStandUp, doRotate, doPickUp, doSell, cyclePalette])

  /** Why the cursor is red, in words, for whichever action is armed. */
  const verdict = useMemo(() => {
    if (mode !== 'decorate' || !focus) return null
    if (!game.rooms.has(focus)) return canExtend(game, focus)
    if (moving) return canMove(game, moving, focus, rotation)
    return canPlace(game, focus, selected, rotation)
  }, [mode, focus, moving, game, selected, rotation])

  /** The reader's own words, for the two labels this file prints. */
  const words = homeDict(useLocale())

  /**
   * What E would do right now, for the prompt above the crosshair.
   *
   * `targetOfUse` rather than `describeUse`, so the sentence is worded here: the
   * domain answers *which thing*, and the German catalogue is what turns a
   * bath into "Baden". See the note on `targetOfUse`.
   */
  const useLabel = useMemo(() => {
    if (mode !== 'look') return null
    const target = targetOfUse(game, focus)
    if (!target) return null
    if (target.kind === 'up') return words.getUp
    return words.items[target.id]?.use ?? target.label
  }, [mode, game, focus, words])

  /**
   * Whether the square under the cursor is ground you could sell back.
   *
   * `null` for anything that is not bought ground at all - bare field, or a
   * piece of the house the plan came with - so the HUD can stay silent rather
   * than explaining why every square in the bedroom is unsellable. When it is
   * bought ground the verdict comes along even if it is a refusal, because
   * "that would cut off part of the house" is the one refusal nobody guesses.
   */
  const groundSale = useMemo(() => {
    if (mode !== 'decorate' || !focus) return null
    if (!game.rooms.has(focus) || game.plan.rooms.has(focus)) return null

    const verdict = canShrink(game, focus)
    return {
      ok: verdict.ok,
      why: verdict.ok ? null : verdict.why,
      refund: shrinkRefund(game),
    }
  }, [mode, focus, game])

  return (
    <div
      // Sized to the viewport minus the shell's own padding rather than to the
      // whole of it: the workspace rail leaves this room a fixed frame, and a
      // full `100dvh` inside a padded one scrolls the page by exactly that
      // padding every time you look down.
      className="relative h-viewport-inset w-full touch-none overflow-hidden"
      {...(isTouch ? lookDrag : {})}
    >
      {/*
        The world, feathered out at the edges instead of ending on a rectangle.

        Same treatment as the lounge, and for the same reason: the canvas below
        clears to transparent, so what shows through the fade is the page's own
        sky rather than a wall this room painted for itself.
      */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[3rem]"
        style={{ maskImage: SCENE_MASK, WebkitMaskImage: SCENE_MASK }}
      >
        <Canvas shadows="percentage" camera={{ fov: 58, near: 0.1, far: 400 }}>
          <Suspense fallback={null}>
            <Scene
              game={game}
              gameRef={gameRef}
              plan={plan}
              mode={mode}
              selected={selected}
              rotation={rotation}
              focus={focus}
              moving={moving}
              isTouch={isTouch}
              moveRef={moveRef}
              lookRef={lookRef}
              onReady={() => setReady(true)}
              avatar={avatar}
              agents={agents}
              seed={seedFrom(presence.userId)}
              drifting={drifting}
              onDrift={setDrifting}
              room={presenceRoom}
              onFocus={(key) => {
                focusRef.current = key
                setFocus(key)
              }}
              onStanding={setStanding}
              onStart={() => setStarted(true)}
              onLockChange={setLocked}
              onAct={doAct}
              onStandUp={doStandUp}
              onPlace={doPlace}
              onSell={doSell}
              onWheel={cyclePalette}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* And the last of the fade, in the sky's own colour, so there is no
          border left to find. */}
      <div className="pointer-events-none absolute inset-0 rounded-[3rem] shadow-[inset_0_0_140px_60px_#0a0616]" />

      <HomeHud
        state={game}
        here={place}
        mode={mode}
        room={room}
        locked={locked}
        started={started}
        ready={ready}
        exit={exit ?? null}
        verdict={verdict}
        useLabel={useLabel}
        extendCost={focus && !game.rooms.has(focus) ? extensionCost(game) : null}
        groundSale={groundSale}
        focus={focus}
        selected={selected}
        moving={moving}
        isTouch={isTouch}
        compact={compact}
        onSelect={setChosen}
        onRotate={doRotate}
        onSell={doSell}
        onMove={doPickUp}
        onMode={setMode}
        onAct={doAct}
      />

      {/* The travel bar used to sit here - see the note in the café. */}

      <EmotePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={presenceRoom.emote}
        className={emoteAnchor(hand)}
      />

      {/* Only in your own house: the roster is keyed on the session's user, so
          adopting while visiting would put the animal in your own kitchen
          rather than the one you are standing in. A button that did that is
          worse than no button. Sits a button's width left of the emotes. */}
      {/* Your own body, so this one shows in somebody else's house too. */}
      <DriftToggle
        on={drifting}
        onChange={setDrifting}
        className="bottom-4 right-[4.25rem]"
      />

      {!visiting && (
        <CreaturePicker
          slug={slug}
          place={place}
          agents={agents}
          onChange={setAgents}
          className="bottom-4 right-[8.5rem]"
        />
      )}

      {/* Only the owner has a door to set, and only they can answer it. Draws
          nothing here - it publishes to the rail, beside the roster. */}
      <DoorPanel room={presenceRoom} slug={slug} door={initial.door} />

      {/* Last, so it covers everything above when you are not welcome yet. */}
      <DoorScreen room={presenceRoom} ownerName={owner.name} place={place} slug={slug} />

      {isTouch && started && (
        <>
          <Joystick onChange={onStick} className={`pointer-events-auto ${stickAnchor(hand)}`} />
          <TouchActions
            mode={mode}
            label={
              mode === 'decorate'
                ? words.controls.place
                : exit
                  ? words.exits[EXIT_WORD[exit.to]]
                  : (useLabel ?? words.controls.use)
            }
            disabled={mode === 'look' && !exit && !useLabel}
            onAct={mode === 'decorate' ? doPlace : doAct}
            onRotate={doRotate}
            onSell={doSell}
          />
        </>
      )}
    </div>
  )
}

// --- the scene --------------------------------------------------------------

interface SceneProps {
  game: HomeState
  gameRef: React.RefObject<HomeState>
  plan: Plan
  avatar: string
  agents: AgentView[]
  /** Your own body's seed, when you let go of the controls. See `drift`. */
  seed: number
  drifting: boolean
  onDrift: (drifting: boolean) => void
  room: Room
  mode: Mode
  selected: string
  rotation: number
  focus: TileKey | null
  moving: TileKey | null
  isTouch: boolean
  moveRef: React.RefObject<MoveInput>
  lookRef: React.RefObject<LookDelta>
  onReady: () => void
  onFocus: (key: TileKey | null) => void
  onStanding: (key: TileKey | null) => void
  onStart: () => void
  onLockChange: (locked: boolean) => void
  onAct: () => void
  onStandUp: () => void
  onPlace: () => void
  onSell: () => void
  onWheel: (direction: number) => void
}

function Scene(props: SceneProps) {
  const {
    game,
    plan,
    mode,
    selected,
    rotation,
    focus,
    moving,
    avatar,
    agents,
    seed,
    drifting,
    onDrift,
    room,
    onReady,
  } = props

  const playerRef = useRef(
    new THREE.Vector3(plan.spawn.x, EYE_HEIGHT, plan.spawn.z),
  )

  /** Where the body is, when it is not standing on its own two feet. */
  const rest = useMemo(
    () => (game.resting ? restSpotAt(game, game.resting) : null),
    [game],
  )

  /**
   * The room as something with a mind of its own can see it.
   *
   * One object, rebuilt whenever the floor or the furniture changes, because
   * that identity is what tells each creature to throw away its cached route -
   * see `createRoamer`. Sorted, because a perch is drawn by index and a `Set`'s
   * insertion order would make two tabs disagree about which square is which.
   *
   * `solidTest` is the scene's own collision, reused rather than reimplemented:
   * a creature that walked through the wardrobe because it consulted a second,
   * subtly different idea of what is solid is exactly the drift worth avoiding.
   */
  const floor = useMemo(
    () => ({ tiles: [...game.rooms.keys()].sort(), solid: solidTest(game) }),
    [game],
  )
  const roamRoom = useRoamable(floor.tiles, floor.solid)

  /**
   * Where a drifting body is facing, written by the frame loop and read by the
   * body a few lines later.
   *
   * A ref rather than state because it changes every frame, and `null` rather
   * than a flag because "not drifting" and "drifting, facing north" are
   * genuinely different - the body falls back to following the camera in the
   * first case and must not in the second.
   */
  const driftRef = useRef<Drift | null>(null)

  // Reaching this effect at all means the models resolved, because the Suspense
  // boundary above would otherwise still be showing its fallback.
  useEffect(() => {
    onReady()
  }, [onReady])

  const outdoors = plan.id === 'outdoor'

  return (
    <>
      {/*
        No `<color attach="background">`: an opaque clear colour is a wall, and
        the whole point is that the page's sky runs behind these rooms. The
        garden used to paint its own daylight blue over it, which is exactly the
        seam this removes - it is the same night out there as everywhere else in
        the app now.
      */}
      <fog attach="fog" args={[SKY, outdoors ? 34 : 26, outdoors ? 110 : 95]} />
      {/* Cooled to match the sky they now stand in. The ground term is the one
          that changes with the door: grass under the garden, floorboards in. */}
      <hemisphereLight
        args={outdoors ? ['#c9d8ff', '#2d3f2a', 1.05] : ['#f0e2ff', '#2a1b4d', 1.1]}
      />
      <directionalLight
        position={[12, 22, 8]}
        intensity={outdoors ? 1.7 : 1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <AdaptiveFov />
      <Shell plan={plan} rooms={game.rooms} />
      <Landmarks plan={plan} />
      <Furniture state={game} hide={moving} />
      <Resident
        playerRef={playerRef}
        rest={rest}
        avatar={avatar}
        room={room}
        driftRef={driftRef}
      />

      <RemotePeeps room={room} />
      <PresenceSender room={room} playerRef={playerRef} />
      <Roamers agents={agents} room={roamRoom} />

      {mode === 'decorate' ? (
        <BuildPreview
          state={game}
          focus={focus}
          selected={selected}
          rotation={rotation}
          moving={moving}
        />
      ) : (
        <ExitMarkers plan={plan} />
      )}

      <Controls
        {...props}
        playerRef={playerRef}
        rest={rest}
        roamRoom={roamRoom}
        driftRef={driftRef}
      />
    </>
  )
}

function AdaptiveFov() {
  const size = useThree((state) => state.size)

  /**
   * Declared rather than assigned. Setting `camera.fov` directly works, but it
   * is a scene-graph mutation during a React commit and the r3f lint rule
   * rightly rejects it.
   */
  return (
    <PerspectiveCamera
      makeDefault
      fov={fovFor(size.width, size.height)}
      near={0.1}
      far={400}
    />
  )
}

/**
 * Floor and walls, both derived from the plan.
 *
 * Nothing here is stored. A square knows which room it is; the wallpaper, the
 * skirting and the doorways all fall out of that - see `wallsFor`.
 */
function Shell({
  plan,
  rooms,
}: {
  plan: Plan
  rooms: Map<TileKey, Theme>
}) {
  const floors = useMemo(() => [...rooms], [rooms])
  const walls = useMemo(() => wallsFor(plan, rooms), [plan, rooms])

  return (
    <group>
      {floors.map(([key, theme]) => {
        const world = tileToWorld(parseTile(key))
        const shell = SHELLS[theme]
        return (
          <group key={key} position={[world.x, shell.floorY ?? 0, world.z]}>
            <Suspense fallback={null}>
              <TinyModel model={shell.floor} />
            </Suspense>
          </group>
        )
      })}

      {walls.map((wall, index) => (
        <group
          key={index}
          position={[wall.x, 0, wall.z]}
          rotation={[0, wall.rotY, 0]}
        >
          <Suspense fallback={null}>
            <TinyModel model={wall.model} />
          </Suspense>
        </group>
      ))}
    </group>
  )
}

/** The house, seen from its own garden. Not for sale. */
function Landmarks({ plan }: { plan: Plan }) {
  return (
    <group>
      {plan.landmarks.map((landmark, index) => (
        <group
          key={index}
          position={[landmark.x * TILE, 0, landmark.z * TILE]}
          rotation={[0, landmark.rotY ?? 0, 0]}
        >
          <Suspense fallback={null}>
            <TinyModel model={landmark.model} />
          </Suspense>
        </group>
      ))}
    </group>
  )
}

function Furniture({ state, hide }: { state: HomeState; hide: TileKey | null }) {
  return (
    <group>
      {[...state.props].map(([key, placed]) => {
        // The thing in your hands is drawn by the preview instead, under the
        // cursor. Drawing it in both places is how you lose track of which one
        // is real.
        if (key === hide) return null
        const def = homeProp(placed.propId)
        if (!def) return null
        const world = tileToWorld(parseTile(key))

        return (
          <group
            key={key}
            position={[world.x, 0, world.z]}
            rotation={[0, placed.rotY, 0]}
          >
            <Suspense fallback={null}>
              <HomePropModel def={def} />
            </Suspense>
          </group>
        )
      })}
    </group>
  )
}

/**
 * You. A peep, seen from behind - or lying in a bath, as the case may be.
 *
 * There is no sitting clip in the peeps pack and no lying one either: it has
 * idle, walk, run and dance. So a pose is geometry rather than animation - the
 * body is raised onto the seat and, for a bed or a bath, tipped a quarter turn
 * onto its back. It reads correctly for the same reason the café's seated
 * customers do, which is that the furniture is underneath you.
 */
function Resident({
  playerRef,
  rest,
  avatar,
  room,
  driftRef,
}: {
  playerRef: React.RefObject<THREE.Vector3>
  rest: RestSpot | null
  avatar: string
  room: Room
  /** Non-null only while the autopilot has the controls. */
  driftRef: React.RefObject<Drift | null>
}) {
  const group = useRef<THREE.Group>(null)
  const previous = useRef(new THREE.Vector3())
  const [walking, setWalking] = useState(false)
  const { camera } = useThree()

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return

    if (rest) {
      node.position.set(rest.x, rest.y, rest.z)
      // Facing the way the furniture faces, not the way the camera does: a peep
      // that swivelled on the sofa every time you looked around would read as
      // possessed rather than seated.
      node.rotation.set(0, rest.rotY, 0)
      return
    }

    const player = playerRef.current
    node.position.set(player.x, player.y - EYE_HEIGHT, player.z)

    /**
     * Which way the body points, and who decides.
     *
     * Normally the camera: the peeps pack faces +Z in model space, so it is a
     * plain `atan2(x, z)` with no half-turn correction - the same convention the
     * lounge and the café both rely on.
     *
     * While the autopilot has the controls it is the schedule instead, because
     * a body that swivelled to follow the camera while walking off somewhere
     * unrelated reads as sleepwalking rather than as pottering. Eased for the
     * reason `Roamer` eases: position out of the schedule is continuous but the
     * heading is redrawn per beat, and snapping through a half turn looks like a
     * glitch.
     */
    const steering = driftRef.current
    if (steering) {
      node.rotation.x = steering.lean
      node.rotation.y +=
        angleDelta(node.rotation.y, steering.yaw) * (1 - Math.exp(-6 * delta))
    } else {
      node.rotation.x = 0
      camera.getWorldDirection(BODY_DIR)
      BODY_DIR.y = 0
      if (BODY_DIR.lengthSq() > 1e-6) {
        BODY_DIR.normalize()
        node.rotation.set(0, Math.atan2(BODY_DIR.x, BODY_DIR.z), 0)
      }
    }

    /**
     * The gait, from how far the body actually moved.
     *
     * Left below the branch on purpose: it is the one part that is the same
     * either way, and it is what makes an eased autopilot catch-up play the walk
     * clip without the autopilot having to say so.
     */
    const travelled = previous.current.distanceTo(player)
    previous.current.copy(player)
    setWalking(travelled / Math.max(delta, 1e-4) > 0.6)
  })

  return (
    <group ref={group}>
      {/* The tip onto the back is inside the group, so the yaw above still aims
          the whole body along the bed rather than spinning it in mid-air. */}
      <group rotation={[rest?.pose === 'lie' ? -Math.PI / 2 : 0, 0, 0]}>
        <Suspense fallback={null}>
          <AvatarModel
            model={avatar}
            clip={rest ? 'idle' : walking ? 'walk' : 'idle'}
            ignoreRay
          />
        </Suspense>
      </group>

      {/* Outside the tip-onto-the-back, so your own face stays upright and
          readable when you are lying in the bath. */}
      <EmoteBubble state={room.selfEmote} />
    </group>
  )
}

/**
 * A glow on every square that leads somewhere.
 *
 * Without it the front door is a gap in a wall that looks exactly like the gap
 * between two rooms, and the only way to discover the garden is to walk into
 * every hole in the house.
 */
function ExitMarkers({ plan }: { plan: Plan }) {
  return (
    <group>
      {plan.exits.map((exit, index) => {
        const world = tileToWorld(exit.tile)
        return (
          <mesh
            key={index}
            position={[world.x, 0.03, world.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[TILE * 0.42, 32]} />
            <meshBasicMaterial
              color="#ffd479"
              transparent
              opacity={0.35}
              toneMapped={false}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/** A ghost square of floor over ground the house could grow onto. */
function ExtendPreview({
  state,
  focus,
}: {
  state: HomeState
  focus: TileKey | null
}) {
  if (!focus) return null

  const ok = canExtend(state, focus).ok
  const theme = extensionTheme(state, focus)
  const world = tileToWorld(parseTile(focus))
  const shell = theme ? SHELLS[theme] : undefined

  return (
    <group position={[world.x, 0, world.z]}>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TILE * 0.94, TILE * 0.94]} />
        <meshBasicMaterial
          color={ok ? '#6ee7a0' : '#e0573e'}
          transparent
          opacity={0.3}
          toneMapped={false}
        />
      </mesh>

      {ok && shell && (
        <Suspense fallback={null}>
          <group position={[0, (shell.floorY ?? 0) + 0.05, 0]}>
            <TinyModel model={shell.floor} ghost />
          </group>
        </Suspense>
      )}
    </group>
  )
}

/**
 * The decorate cursor.
 *
 * Green means the click will work. It covers every square the prop would fill,
 * so a two-square sofa turns half red the moment one end of it would be through
 * a wall - which is the only warning you get before spending.
 */
function BuildPreview({
  state,
  focus,
  selected,
  rotation,
  moving,
}: {
  state: HomeState
  focus: TileKey | null
  selected: string
  rotation: number
  moving: TileKey | null
}) {
  if (!focus) return null

  /**
   * Aiming past the edge of the house is a floor purchase, not a furniture one,
   * so the ghost is a square of floor rather than a sofa hanging in the air.
   */
  if (!state.rooms.has(focus)) {
    return <ExtendPreview state={state} focus={focus} />
  }

  /** While something is in hand the preview shows *that*, not the palette's. */
  const held = moving ? state.props.get(moving) : undefined
  const def = homeProp(held?.propId ?? selected)
  if (!def) return null

  const ok = held
    ? canMove(state, moving!, focus, rotation).ok
    : canPlace(state, focus, selected, rotation).ok

  const world = tileToWorld(parseTile(focus))
  const covered = coveredTiles(parseTile(focus), def, rotation)

  return (
    <group>
      {covered.map((tile) => {
        const square = tileToWorld(tile)
        return (
          <mesh
            key={tileKey(tile.x, tile.z)}
            position={[square.x, 0.04, square.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[TILE * 0.94, TILE * 0.94]} />
            <meshBasicMaterial
              color={ok ? '#6ee7a0' : '#e0573e'}
              transparent
              opacity={0.28}
              toneMapped={false}
            />
          </mesh>
        )
      })}

      {ok && (
        <group position={[world.x, 0, world.z]} rotation={[0, rotation, 0]}>
          <Suspense fallback={null}>
            <HomePropModel def={def} ghost />
          </Suspense>
        </group>
      )}
    </group>
  )
}

/**
 * What a phone needs, which is more than the café's single button.
 *
 * Movement has to be a stick and the primary action has to be a button, because
 * a tap on the canvas is already the start of a look drag and telling a tap from
 * a drag makes both feel unreliable. Decorating adds two more that have no
 * keyboard to fall back on - turning a sofa and selling it - so on touch they
 * are thumb-sized and next to the action rather than buried in the sheet.
 */
function TouchActions({
  mode,
  label,
  disabled,
  onAct,
  onRotate,
  onSell,
}: {
  mode: Mode
  label: string
  disabled: boolean
  onAct: () => void
  onRotate: () => void
  onSell: () => void
}) {
  /* Read here rather than passed down from <HomeGame>: this is a preference,
     not scene state, and threading it through a prop would mean every component
     between the two knowing about somebody's thumbs. */
  const { hand } = useHand()

  return (
    <div className={`pointer-events-none ${actionsAnchor(hand)}`}>
      {mode === 'decorate' && (
        <div className="pointer-events-auto flex gap-3">
          <TapButton label="Sell" tone="red" onPress={onSell} />
          <TapButton label="Turn" tone="cyan" onPress={onRotate} />
        </div>
      )}

      {/* The primary action, which is why it is the large one. Its label is the
          verb rather than a fixed word - "Enter", "Sit", "Place" - so the button
          says what this particular tap will do. */}
      <TapButton
        label={label}
        tone="amber"
        large
        disabled={disabled}
        onPress={onAct}
        className="pointer-events-auto"
      />
    </div>
  )
}

// --- input and the frame loop ----------------------------------------------

function Controls({
  gameRef,
  mode,
  playerRef,
  isTouch,
  moveRef,
  lookRef,
  onFocus,
  onStanding,
  onLockChange,
  onAct,
  onStandUp,
  onPlace,
  onSell,
  onStart,
  onWheel,
  rest,
  seed,
  drifting,
  onDrift,
  roamRoom,
  driftRef,
}: SceneProps & {
  playerRef: React.RefObject<THREE.Vector3>
  rest: RestSpot | null
  roamRoom: Roamable
  driftRef: React.RefObject<Drift | null>
}) {
  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const velocityY = useRef(0)
  const grounded = useRef(true)

  const lastFocus = useRef<TileKey | null>(null)
  const lastStanding = useRef<TileKey | null>(null)

  /**
   * Your own schedule, seeded from your user id.
   *
   * Built once and left running whether or not the autopilot is on, because it
   * holds no state to leave running - it is a cache in front of a function of
   * the clock. Switching the toggle does not start anything; it just starts
   * listening.
   */
  const roamer = useMemo(() => createRoamer(seed, roamRoom), [seed, roamRoom])

  /**
   * Where you were standing when you sat down, and whether you still are.
   *
   * Getting up has to move you off the furniture. A sofa is solid and you are
   * sitting in the middle of it, so standing up in place leaves you inside a
   * solid square - and the controller then refuses every direction, because
   * every direction is still inside it. Putting you back where you came from is
   * both the fix and the natural thing: you stood there a moment ago, so it is
   * somewhere you are allowed to be.
   */
  const satFrom = useRef<{ x: number; z: number } | null>(null)
  const wasResting = useRef(false)
  /** The last thing sat on, so the fallback knows what to stand next to. */
  const lastResting = useRef<TileKey | null>(null)

  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  /**
   * Mouse, keyboard and the pointer lock - shared with the cafe. See
   * ./../desk-controls, which is also where the opening pitch is decided.
   */
  useDeskControls({
    camera,
    gl,
    keys,
    euler,
    isTouch,
    editing: mode === 'decorate',
    onStart,
    onLockChange,
    onPlace,
    onInteract: onAct,
    onRemove: onSell,
    onCycle: onWheel,
  })

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_DELTA)
    const state = gameRef.current
    const player = playerRef.current
    // Built once and handed to the walk and the camera alike: the house cannot
    // change between two lines of the same frame.
    const solid = solidTest(state)
    const walls = blockedEdges(state.plan, state.rooms)

    turnCamera({ camera, euler: euler.current, keys: keys.current, look: lookRef.current, dt })

    // --- walking ------------------------------------------------------------
    const { forward, strafe, sprint, evenly, walking } = walkAxes(keys.current, moveRef.current)

    /**
     * Sitting is a place, not a state you have to remember to leave.
     *
     * Reaching for the movement keys is unambiguously "get up", so it is - no
     * separate key, and no chance of being stuck in a bath because the prompt
     * scrolled off. The body stays where the furniture put it until then, and
     * the camera orbits that spot rather than the feet.
     */
    if (rest && !wasResting.current) {
      satFrom.current = { x: player.x, z: player.z }
    }

    if (rest) {
      player.set(rest.x, rest.y + EYE_HEIGHT, rest.z)
      if (walking) onStandUp()
    } else if (wasResting.current) {
      const back =
        satFrom.current ??
        (lastResting.current ? freeSpotNear(state, lastResting.current) : null)
      if (back) player.set(back.x, EYE_HEIGHT, back.z)
      satFrom.current = null
    }

    wasResting.current = rest !== null
    if (state.resting) lastResting.current = state.resting

    camera.getWorldDirection(FORWARD)
    WALK_DIR.copy(FORWARD)
    WALK_DIR.y = 0

    /**
     * Letting go of the controls, and taking them back.
     *
     * Reaching for the movement keys cancels it, exactly as it cancels sitting
     * on the sofa a few lines above - the same rule, because it is the same
     * question: you have just expressed an intention, so the thing doing it for
     * you should stop. Looking around deliberately does *not* cancel, since
     * watching your own body potter about is most of the point.
     */
    if (drifting && walking) onDrift(false)

    const adrift = drifting && !walking && !rest && roamRoom.tiles.length > 0

    if (adrift) {
      // Written before the camera is placed, so the boom follows the body down
      // when it sits rather than a frame late.
      driftRef.current ??= { yaw: 0, lean: 0 }
      drift(roamer, roamRoom, player, dt, driftRef.current)
    } else {
      driftRef.current = null
    }

    if (!adrift && !rest && walking && WALK_DIR.lengthSq() > 1e-6) {
      WALK_DIR.normalize()
      RIGHT.crossVectors(WALK_DIR, UP).normalize()

      const fromX = player.x
      const fromZ = player.z
      const pace = (sprint ? SPRINT_PACE : WALK_PACE) * dt
      const result = stepPhysics({
        position: player,
        velocityY: velocityY.current,
        // `evenly` is what keeps a diagonal at walking pace - see above.
        moveX: pace * evenly * (WALK_DIR.x * forward + RIGHT.x * strafe),
        moveZ: pace * evenly * (WALK_DIR.z * forward + RIGHT.z * strafe),
        jump: false,
        grounded: grounded.current,
        delta: dt,
        isSolid: solid,
      })

      // The voxel controller cannot see an interior wall - it sits on the seam
      // between two cells rather than inside one - so the crossing is undone
      // here, one axis at a time, exactly as the controller resolves its own.
      const stopped = stopAtWalls(
        walls,
        fromX,
        fromZ,
        result.position.x,
        result.position.z,
      )

      player.set(stopped.x, result.position.y, stopped.z)
      velocityY.current = result.velocityY
      grounded.current = result.grounded
    }

    // --- what am I pointing at, and what am I standing on --------------------
    const aimed = probeTile(camera, player, modeRef.current === 'decorate')
    if (aimed !== lastFocus.current) {
      lastFocus.current = aimed
      onFocus(aimed)
    }

    const under = standingOn(player)
    if (under !== lastStanding.current) {
      lastStanding.current = under
      onStanding(under)
    }

    placeCamera(camera, player, VIEWS[modeRef.current], solid)
  })

  return null
}

/**
 * Collision, in the unit-cell terms the borrowed character controller wants.
 *
 * Anything that is not part of the plan is solid, which is what makes the
 * perimeter behave like a wall without walls being objects. Solid furniture
 * fills its whole square - a wardrobe is 2 units wide and so is the square, so
 * there is nothing to be gained by being cleverer.
 *
 * The occupancy map is built once per call rather than once per cell, and this
 * is called once per frame rather than once per query, because the camera rig
 * marches its boom in fifty steps and each of those is a lookup. Rebuilding the
 * map fifty times a frame to answer fifty questions about the same unchanged
 * house is the kind of waste that only shows up on somebody else's laptop.
 */
/**
 * Stop a step at any interior wall it would have crossed.
 *
 * The borrowed character controller is a voxel one: it asks whether a unit cell
 * is filled. A square covers cells `2t-1` and `2t`, so the wall between two
 * squares falls on the seam and there is no cell to mark. The café never noticed
 * because all of its walls face the outside, where "not floor" already means
 * solid - but a house is mostly interior walls, and without this you walk from
 * the bedroom into the bathroom straight through the tiling.
 *
 * Resolved one axis at a time, matching what the controller does with its own
 * collisions, which is what makes sliding along a wall work instead of sticking
 * to it. The body is stopped a radius short of the plane so it never ends the
 * frame standing inside the plaster.
 */
function stopAtWalls(
  walls: Set<string>,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): { x: number; z: number } {
  if (walls.size === 0) return { x: toX, z: toZ }

  const from = worldToTile(fromX, fromZ)
  let x = toX
  let z = toZ

  const crossedX = worldToTile(toX, fromZ).x
  if (crossedX !== from.x) {
    const going = Math.sign(crossedX - from.x)
    // Named from the square being left, so both sides agree on the string.
    const edge = edgeKey(from, going > 0 ? 'east' : 'west')
    if (walls.has(edge)) {
      const plane = (from.x + going * 0.5) * TILE
      x = plane - going * (PLAYER_RADIUS + 0.01)
    }
  }

  const after = worldToTile(x, fromZ)
  const crossedZ = worldToTile(x, toZ).z
  if (crossedZ !== after.z) {
    const going = Math.sign(crossedZ - after.z)
    const edge = edgeKey(after, going > 0 ? 'south' : 'north')
    if (walls.has(edge)) {
      const plane = (after.z + going * 0.5) * TILE
      z = plane - going * (PLAYER_RADIUS + 0.01)
    }
  }

  return { x, z }
}

function solidTest(state: HomeState) {
  const filled = occupancy(state)
  const blocked = blockedTiles(state.plan)

  return (x: number, y: number, z: number): boolean => {
    if (y < 0) return false
    const key = tileKey(cellToTileAxis(x), cellToTileAxis(z))
    if (!state.rooms.has(key)) return y < WALL_HEIGHT

    // The house itself, seen from its own garden, is as solid as the hedge.
    if (blocked.has(key)) return y < WALL_HEIGHT

    const anchor = filled.get(key)
    const def = anchor && homeProp(state.props.get(anchor)!.propId)
    return def ? propIsSolid(def) && y < FURNITURE_HEIGHT : false
  }
}
