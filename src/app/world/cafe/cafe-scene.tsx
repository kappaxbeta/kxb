'use client'

import { PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { BodyModel } from '@/app/world/lounge/_canvas/body-model'
import { EYE_HEIGHT, step as stepPhysics } from '@/app/world/lounge/_sim/physics'
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
import { CafeHud } from '@/app/world/cafe/cafe-hud'
import { useHomesteadSync } from '@/app/world/_hooks/homestead-sync'
import type { AgentView } from '@/domain/agents/queries'
import { SCENE_MASK, SKY } from '@/app/world/sky'
import type { HomesteadView } from '@/domain/homestead/queries'
import {
  SPRINT_PACE,
  standingOn,
  turnCamera,
  WALK_PACE,
  walkAxes,
} from '@/app/world/_sim/rig'
import { useDeskControls } from '@/app/world/_hooks/desk-controls'
import { EmoteBubble } from '@/app/world/_canvas/emote-bubble'
import { EmotePicker } from '@/app/world/_hud/emote-picker'
import { CreaturePicker } from '@/app/world/_hud/creature-picker'
import { DoorPanel, DoorScreen } from '@/app/world/_canvas/room-door'
import { PresenceSender, RemotePeeps } from '@/app/world/_presence/room-peers'
import { Roamers, useRoamable } from '@/app/world/_canvas/roamers'
import { type Drift, drift } from '@/app/world/_sim/autopilot'
import { createBarista } from '@/app/world/cafe/barista-driver'
import { DriftToggle } from '@/app/world/_hud/drift-toggle'
import { angleDelta } from '@/app/world/_presence/presence-core'
import { createRoamer, type Roamable, seedFrom } from '@/domain/world/autonomy'
import { enterScene } from '@/app/world/_stores/here-store'
import { type Room, useRoom } from '@/app/world/_presence/room-presence'
import { useRoomChime } from '@/app/world/_presence/roster-chime'
import { useAudioGate } from '@/app/components/audio/use-audio'
import { play } from '@/lib/audio/engine'
import { ItemModel, Model, PropModel } from '@/app/world/cafe/prop-model'
import {
  FLOOR_MODEL,
  isSolid as propIsSolid,
  isTopper,
  prop,
  PROPS,
  WALL_MODELS,
} from '@kxb/dream-restaurant/catalog'
import {
  buyTile,
  canBuyTile,
  canMove,
  canPlace,
  type CafeState,
  deserialize,
  expansionFor,
  describeInteraction,
  initialState,
  interact,
  moveProp,
  PATIENCE,
  place,
  type Placed as PlacedProp,
  propAt,
  remove,
  serialize,
  setOpen,
  surfaceAt,
  tick,
  type Customer,
} from '@kxb/dream-restaurant/game'
import { wallsFor } from '@kxb/dream-restaurant/grid'
import {
  cellToTileAxis,
  parseTile,
  TILE,
  tileKey,
  tileToWorld,
  worldToTile,
  type TileKey,
} from '@kxb/peepz-world/grid'
import { recipe } from '@kxb/dream-restaurant/recipes'
import type { PlaceId } from '@kxb/peepz-world/places'
import { cafeDict, interactionWords } from '@/app/i18n/cafe'
import { useLocale } from '@/app/i18n/locale-context'
import {
  readShared,
  totalComfort,
  watchShared,
  writeShared,
} from '@/app/world/_stores/shared-save'

/**
 * A café you run yourself: cook the orders, then spend the takings on the room.
 *
 * The split that makes this work is that `domain/cafe` owns every rule and this
 * file owns none of them. What lives here is the stuff that genuinely needs a
 * camera and a clock - where the chef is standing, which square they are looking
 * at, and how to draw two hundred models without the frame rate falling over.
 */

/** Scratch vectors. Allocated once; the frame loop must not make garbage. */
const FORWARD = new THREE.Vector3()
const RIGHT = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const WALK_DIR = new THREE.Vector3()
/** The third-person boom, from the chef out to the camera. */
const BOOM = new THREE.Vector3()
/**
 * The chef's heading. Its own scratch rather than borrowing `WALK_DIR`, which is
 * mid-flight inside the movement code when this runs.
 */
const CHEF_DIR = new THREE.Vector3()
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const RAY = new THREE.Raycaster()
const HIT = new THREE.Vector3()
const SCREEN_CENTRE = new THREE.Vector2(0, 0)


/** A tab left in the background returns one enormous frame. Do not simulate it. */
const MAX_DELTA = 1 / 20

/**
 * How far in front of the chef the interaction probe lands.
 *
 * Squares are 2 units, so 1.6 reaches the next one along whether the chef is
 * standing in the middle of their own square or pressed right up against the
 * counter - which is where they will be, since walking into it is how you stop.
 */
const REACH = 2.5

/**
 * Camera rig, per mode.
 *
 * Build mode's height is deliberately above `WALL_HEIGHT`, which is what lets it
 * skip collision entirely and look down into the room over the top of the walls.
 *
 * Both booms are steep enough to climb over a four-unit wall before they reach
 * one. That is not a style choice: a café square is 2 units and the room is five
 * of them across, so a shallow boom is always inside a wall and the camera
 * spends the whole game jammed against the chef's back. Roughly fifty degrees is
 * what a small room can actually give you.
 */
const VIEWS = {
  serve: { distance: 4.5, height: 5.5 },
  build: { distance: 7, height: 10 },
} as const

/**
 * How far the chef can look up and down.
 *
 * Tighter than the usual full ninety degrees, because the camera hangs off the
 * look direction: staring at the ceiling would swing the boom under the floor
 * and put the view inside the ground. Down is given more room than up, since
 * everything you interact with is at counter height.
 */

/** The camera never drops below this, whatever the boom maths says. */
const CAMERA_MIN_Y = 0.7

/** Vertical field of view in landscape, and the ceiling applied in portrait. */
const BASE_FOV = 58
const MAX_FOV = 82

/** How finely the camera boom is marched when looking for a wall. */
const CAMERA_STEP = 0.2

const SAVE_KEY = 'cafe.save.v1'

/**
 * Lay the workspace's recorded café over a freshly opened one.
 *
 * The starting room's *shape* still comes from `initialState` - it is the same
 * for every workspace - while the log carries the difference: the floor that
 * was bought and the furniture that stands on it. Furniture is replaced
 * wholesale rather than merged, so a café that sold its opening crate does not
 * find it back tomorrow.
 */
function applyHomestead(base: CafeState, view: HomesteadView): CafeState {
  const props = new Map<TileKey, PlacedProp>()
  for (const entry of view.props) {
    props.set(entry.tile, {
      propId: entry.propId,
      rotY: entry.rotY,
      topper: entry.topper,
    })
  }

  return {
    ...base,
    coins: view.coins,
    served: view.served,
    tiles: new Set([...base.tiles, ...view.ground]),
    props,
  }
}

export function CafeGame({
  /** The workspace this café belongs to. Every café is inside one. */
  slug,
  /** The room as the log has it. */
  initial,
  /**
   * Which animal is behind the counter, read from your profile on the server.
   *
   * The customer roster is unaffected, so you can still end up serving somebody
   * who looks exactly like you. That is funnier than filtering it out.
   */
  avatar,
  /** Who you are on the room channel. */
  presence,
  /** Whose café this is. Equal to `presence.userId` when it is your own. */
  owner,
  /**
   * The creatures living in the café - the owner's, not the visitor's.
   *
   * Empty when the flag is off, so there is no branch here: the scene mounts
   * `<Roamers>` unconditionally and an empty roster draws nothing.
   */
  agents: initialAgents,
  /**
   * Where the front door goes, and who takes you there.
   *
   * ---------------------------------------------------------------------------
   * Required, since there is nowhere to navigate to any more
   * ---------------------------------------------------------------------------
   * `/t/<slug>/cafe` used to be a page and the doorway a navigation to the
   * garden next door. The route is gone: the café, the house and the garden are
   * one cartridge world entered from a shelf, and the doorway swaps which part
   * of it is drawn without leaving the canvas.
   *
   * A `to` this door is not in means the door offers no journey - which is a
   * state worth keeping, because it stays a door either way: it is the one the
   * customers come through, and it is drawn from the café's own grid rather
   * than from this list.
   */
  travel,
}: {
  avatar: string
  slug: string
  initial: HomesteadView
  presence: { tenantId: string; userId: string; name: string }
  owner: { userId: string; name: string }
  agents: AgentView[]
  travel: { to: readonly PlaceId[]; go: (to: PlaceId) => void }
}) {
  useAudioGate()

  // There is a world on screen, which is what the radio gates on. Separate from
  // `useRoom` publishing the roster below: that waits on the door, and music
  // playing for somebody still knocking is the lesser of the two wrongs.
  useEffect(() => enterScene(), [])

  const room = useRoom({
    tenantId: presence.tenantId,
    place: 'cafe',
    ownerId: owner.userId,
    door: initial.door,
    userId: presence.userId,
    name: presence.name,
    avatar,
  })

  // Somebody coming through the door of a café you are working in is worth
  // hearing: the counter faces away from it, and a customer you did not notice
  // is the one you keep waiting.
  useRoomChime(room.peers)

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
   * Whether the body is running itself. Cancelled from inside the frame loop
   * when you reach for the movement keys, which is why it lives up here.
   */
  const [drifting, setDrifting] = useState(false)

  /**
   * What the autonomous chef currently believes it is doing.
   *
   * Surfaced because this scene cannot be watched any other way - a headless
   * test has no bodies and the preview pane has no `requestAnimationFrame`, so
   * the frame loop never runs there. Putting the intention on screen turns "it
   * gets stuck" into "it says Build the Burger and stands still", which is the
   * difference between guessing at a bug and knowing where it is.
   */
  const [doing, setDoing] = useState<string | null>(null)

  /**
   * Visiting is read-only, and in the café that means the till too.
   *
   * The stream id is derived from the session's own user, so serving a customer
   * in somebody else's café would put the coins in *your* purse. Not a rule
   * worth enforcing twice: `useHomesteadSync` gets no slug below, so there is no
   * code path left that can fire the command at all.
   */
  const visiting = presence.userId !== owner.userId
  /**
   * The simulation lives in a ref, not in React state.
   *
   * It advances sixty times a second, and re-rendering a component tree that
   * often to move an animal two centimetres is how this becomes a slideshow.
   * React gets a snapshot a few times a second for the HUD; the scene reads the
   * ref directly and moves objects imperatively.
   */
  const [snapshot, setSnapshot] = useState<CafeState>(() =>
    applyHomestead(initialState(), initial),
  )
  const gameRef = useRef<CafeState>(snapshot)

  const sync = useHomesteadSync(visiting ? undefined : slug, 'cafe')

  const [mode, setMode] = useState<'serve' | 'build'>('serve')
  const [locked, setLocked] = useState(false)
  /**
   * The player has clicked in once.
   *
   * Separate from `locked` because pointer lock is not guaranteed - some
   * browsers refuse it, and an automated one never grants it. Gating the opening
   * card on the lock meant a refusal left the card up forever, covering the
   * kitchen with a message telling you to click the kitchen.
   */
  const [started, setStarted] = useState(false)
  /**
   * Set once the scene is past its Suspense boundary, i.e. the room's models
   * have actually arrived. Until then the canvas is black and telling somebody
   * to click it just buys them a pointer lock on nothing.
   */
  const [ready, setReady] = useState(false)
  const [focus, setFocus] = useState<TileKey | null>(null)
  /**
   * The square underfoot, which is a different question from the one the
   * crosshair answers.
   *
   * The way out belongs to the doorway you are *on*, not the one you happen to
   * be facing - otherwise turning round on the threshold would cancel the trip.
   */
  const [standing, setStanding] = useState<TileKey | null>(null)
  const [selected, setSelected] = useState<string>(PROPS[0].id)
  const [rotation, setRotation] = useState(0)

  /**
   * The square a prop has been picked up from, while it is being carried.
   *
   * Moving is two clicks rather than a drag: pointer lock means there is no
   * cursor to drag *with*, and picking up then dropping is the same gesture the
   * rest of the game already uses for food.
   */
  const [moving, setMoving] = useState<TileKey | null>(null)
  const movingRef = useRef<TileKey | null>(null)
  useEffect(() => {
    movingRef.current = moving
  }, [moving])

  /**
   * The mode, readable from a listener that was registered once.
   *
   * Mirrored in an effect rather than assigned during render: the keyboard
   * handlers below outlive any single render, and re-subscribing them on every
   * mode change would drop keys held across the switch.
   */
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const focusRef = useRef<TileKey | null>(null)

  /**
   * Touch input, in the same refs the frame loop already reads.
   *
   * A phone has no WASD and no pointer lock, so the thumbstick and the look drag
   * write into refs that are summed with the keyboard rather than switched
   * between - a tablet with a keyboard attached can use either without a mode to
   * get wrong. Same approach the lounge takes, and the same components.
   */
  const isTouch = useIsTouch()
  /* Which way round the touch rig goes. See ./_hud/touch-controls' anchors. */
  const { hand } = useHand()

  /**
   * Layout is a question about the screen, not the pointer.
   *
   * Splitting these matters: a phone needs both the sheet layout and the
   * thumbstick, but a narrow desktop window needs only the first, and a tablet
   * with a keyboard wants the controls without necessarily wanting the cramped
   * layout. Asking one question and using the answer for both is how the sidebar
   * ends up eating a 390px screen.
   */
  const compact = useMediaQuery('(max-width: 640px)')

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

  const publish = useCallback(() => {
    setSnapshot({ ...gameRef.current })
  }, [])


  /**
   * Standing in the café's own doorway is the way back to the garden.
   *
   * Unless nothing is on the other side: a cartridge holds the café alone, and
   * a prompt offering a journey that will not happen is worse than no prompt.
   */
  const atDoor =
    travel.to.includes('outdoor') &&
    standing === tileKey(snapshot.door.tile.x, snapshot.door.tile.z)
  const atDoorRef = useRef(atDoor)
  useEffect(() => {
    atDoorRef.current = atDoor
  }, [atDoor])

  const doLeave = useCallback(() => {
    // `atDoor` is already false when the garden is not somewhere this world can
    // reach, so this is only ever called by a door that leads somewhere.
    travel.go('outdoor')
  }, [travel])

  const handleStart = useCallback(() => setStarted(true), [])

  // --- persistence ----------------------------------------------------------

  /**
   * The room comes from the café's own save; the money comes from the purse the
   * house shares.
   *
   * The purse wins outright when it exists - see `domain/world/save` - because
   * otherwise an evening spent buying a sofa would be undone by the café
   * reloading yesterday's balance over the top of it.
   */
  /**
   * Whether the balance below has been reconciled with the shared purse.
   *
   * Guards the publish effect, and has to be state rather than a ref for the
   * reason the house's does: a ref set here is already true when the sibling
   * effect runs in the same commit, but that effect's `snapshot` is still the
   * opening float - so the café published 120 coins over the top of whatever the
   * house had left in the purse before correcting itself a render later.
   */
  const [reconciled, setReconciled] = useState(false)

  useEffect(() => {
    /**
     * A workspace's café arrived with the page and must not be overwritten.
     *
     * Falling through would paste this browser's single-player kitchen over the
     * shared one, and the save effect below would then write that back.
     */
    if (slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReconciled(true)
      return
    }

    try {
      const saved = window.localStorage.getItem(SAVE_KEY)
      if (saved) gameRef.current = deserialize(JSON.parse(saved))
    } catch {
      // A save from an older shape is not worth crashing over - the café just
      // starts again. There is nothing here a player would mourn.
    }

    gameRef.current = {
      ...gameRef.current,
      coins: readShared('coins') ?? gameRef.current.coins,
      homeComfort: totalComfort(),
    }
    setSnapshot({ ...gameRef.current })
    setReconciled(true)
  }, [slug])

  useEffect(() => {
    // The log is the save. `sync` has already sent every change.
    if (slug) return
    const id = window.setInterval(() => {
      try {
        window.localStorage.setItem(
          SAVE_KEY,
          JSON.stringify(serialize(gameRef.current)),
        )
      } catch {}
    }, 4000)
    return () => window.clearInterval(id)
  }, [slug])

  /**
   * Publish the takings the moment they change, not on the room's timer.
   *
   * The room can afford to be saved every four seconds - the worst case is that
   * a counter you just bought is where you left it. The *purse* cannot, because
   * the way you leave the café is by walking out of the door, and any interval
   * at all means the last few sales are still sitting in memory when the house
   * asks what the balance is. Coins only move on a sale, so this fires about as
   * often as a customer pays.
   */
  useEffect(() => {
    if (!reconciled || slug) return
    writeShared('coins', snapshot.coins)
  }, [snapshot.coins, reconciled, slug])

  /**
   * Follow the purse while the house is open in another tab.
   *
   * Without this you could spend the same coins twice - buy a bath in one tab,
   * switch back to the café, and the old balance is still sitting there waiting
   * to be spent again.
   */
  useEffect(() => {
    // The workspace's purse lives in Postgres, not in this browser.
    if (slug) return
    return watchShared('coins', (coins) => {
      gameRef.current = { ...gameRef.current, coins }
      setSnapshot({ ...gameRef.current })
    })
  }, [slug])

  // --- actions --------------------------------------------------------------

  /**
   * Press E on a square.
   *
   * Takes the square rather than always reading the crosshair, because the
   * barista aims with its feet and not with the camera - it walks up to a
   * counter and works it while the player is free to look wherever they like.
   * Omitted means "whatever I am looking at", which is what a keypress means.
   */
  const doInteract = useCallback((at?: TileKey) => {
    const before = gameRef.current
    /**
     * `typeof`, not `??`, and that is not paranoia.
     *
     * This is also wired straight to a touch button's `onClick`, which hands
     * its first argument a React event - and an event is not `undefined`, so
     * `at ?? focus` would happily pass it to `interact` as a square. Nothing
     * would throw: `propAt` would find no prop for it and the tap would just
     * silently do nothing, on touch only, which is about the worst way for this
     * to fail.
     */
    const target = typeof at === 'string' ? at : focusRef.current
    gameRef.current = interact(before, target)
    const after = gameRef.current

    /**
     * A customer paid.
     *
     * Derived by diffing rather than by the simulation reporting it, because
     * `serve` is reached from deep inside `interact` and threading a receipt
     * back out would mean a return type every other interaction ignores. The
     * dish has to be read from *before* - the act of serving clears the order,
     * so by `after` there is nothing left to name.
     */
    if (slug && after.served > before.served) {
      const paid = before.customers.find(
        (customer) =>
          customer.order !== null &&
          after.customers.find((entry) => entry.id === customer.id)?.state ===
            'eating',
      )
      if (paid?.order) sync.serve(paid.order, after.coins - before.coins)
    }

    publish()
  }, [publish, slug, sync])

  /** Left click in build mode: drop what you are carrying, or buy something new. */
  const doPlace = useCallback(() => {
    const key = focusRef.current
    if (!key) return

    const before = gameRef.current
    const carrying = movingRef.current

    if (carrying) {
      if (canMove(before, carrying, key)) sync.move(carrying, key, rotation)
      gameRef.current = moveProp(before, carrying, key, rotation)
      setMoving(null)
    } else {
      // The knock only when something was actually bought and set down.
      // `place` is forgiving about a square it cannot use, and a click that
      // changed nothing should sound like nothing.
      if (canPlace(before, key, selected)) {
        sync.place(key, selected, rotation)
        play('build')
      }
      gameRef.current = place(before, key, selected, rotation)
    }
    publish()
  }, [publish, selected, rotation, sync])

  /** Pick the focused prop up, or put down the one already in hand. */
  const doPickUp = useCallback(() => {
    if (movingRef.current) {
      setMoving(null)
      return
    }
    const key = focusRef.current
    if (!key || !gameRef.current.props.has(key)) return
    if (!canMove(gameRef.current, key, key)) return
    setMoving(key)
  }, [])

  const doRemove = useCallback(() => {
    // Right-click cancels a move rather than selling something else.
    if (movingRef.current) {
      setMoving(null)
      return
    }
    const key = focusRef.current
    if (!key) return
    if (gameRef.current.props.has(key)) sync.remove(key)
    gameRef.current = remove(gameRef.current, key)
    publish()
  }, [publish, sync])

  const doToggleOpen = useCallback(() => {
    gameRef.current = setOpen(gameRef.current, !gameRef.current.open)
    publish()
  }, [publish])

  const doBuyTile = useCallback(() => {
    const key = focusRef.current
    if (!key) return

    // The whole strip, because that is what one click buys - see `expansionFor`.
    // Sending only the aimed square would record a purchase the room does not
    // match, and the next reload would take the rest of the strip away again.
    const before = gameRef.current
    if (canBuyTile(before, key)) {
      sync.buy(expansionFor(before, key))
      play('build')
    }
    gameRef.current = buyTile(before, key)
    publish()
  }, [publish, sync])

  const cyclePalette = useCallback((direction: number) => {
    setSelected((current) => {
      const at = PROPS.findIndex((entry) => entry.id === current)
      const next = (at + direction + PROPS.length) % PROPS.length
      return PROPS[next].id
    })
  }, [])

  // --- keyboard -------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'Tab':
          // The browser would otherwise move focus to the address bar, and the
          // canvas would silently stop hearing WASD.
          event.preventDefault()
          setMode((current) => (current === 'serve' ? 'build' : 'serve'))
          break
        case 'KeyE':
          if (modeRef.current !== 'serve') break
          // The doorway has nothing to cook on, so there is no interaction for
          // E to shadow - standing in it means you are leaving.
          if (atDoorRef.current) doLeave()
          else doInteract()
          break
        case 'KeyR':
          if (modeRef.current === 'build') {
            setRotation((current) => (current + Math.PI / 2) % (Math.PI * 2))
          }
          break
        case 'KeyZ':
          // Toggling rather than opening, so the same key gets you back out.
          setPickerOpen((current) => !current)
          break
        case 'KeyO':
          doToggleOpen()
          break
        case 'KeyG':
          if (modeRef.current === 'build') doPickUp()
          break
        case 'KeyX':
          if (modeRef.current === 'build') doRemove()
          break
        case 'KeyT':
          if (modeRef.current === 'build') doBuyTile()
          break
        case 'BracketLeft':
          if (modeRef.current === 'build') cyclePalette(-1)
          break
        case 'BracketRight':
          if (modeRef.current === 'build') cyclePalette(1)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doInteract, doRemove, doBuyTile, doPickUp, doToggleOpen, cyclePalette, doLeave])

  /**
   * What E would do, worded here rather than in the rules.
   *
   * `describeInteraction` answers with the act; `interactionWords` turns it
   * into a sentence in the reader's language, using the same catalogue the
   * build sheet and the menu draw from. See the note on `Interaction`.
   */
  const words = cafeDict(useLocale())
  const prompt = useMemo(() => {
    const act = describeInteraction(snapshot, focus)
    return act ? interactionWords(words, act) : null
  }, [snapshot, focus, words])

  return (
    <div
      // Sized to the viewport minus the shell's own padding rather than to the
      // whole of it: the workspace rail leaves this room a fixed frame, and a
      // full `100dvh` inside a padded one scrolls the page by exactly that
      // padding every time you look down.
      className="relative h-viewport-inset w-full touch-none overflow-hidden"
      // Drag anywhere that is not a control to look around. The HUD panels are
      // pointer-events-none, so drags started over them land here too.
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
        <Canvas
          shadows="percentage"
          camera={{ fov: BASE_FOV, near: 0.1, far: 300, position: [0, 8, 12] }}
        >
          <Suspense fallback={null}>
            <Scene
              gameRef={gameRef}
              snapshot={snapshot}
              avatar={avatar}
              agents={agents}
              seed={seedFrom(presence.userId)}
              drifting={drifting}
              onDrift={setDrifting}
              onDoing={setDoing}
              room={room}
              mode={mode}
              selected={selected}
              rotation={rotation}
              focus={focus}
              moving={moving}
              isTouch={isTouch}
              moveRef={moveRef}
              lookRef={lookRef}
              onReady={() => setReady(true)}
              onFocus={(key) => {
                focusRef.current = key
                setFocus(key)
              }}
              onStanding={setStanding}
              onPublish={publish}
              onStart={handleStart}
              onLockChange={setLocked}
              /**
                * An explicit square means the barista is working, and working is
                * never leaving: without the `undefined` check, an autonomous chef
                * whose chore happened to sit by the door would walk the player out
                * of their own café.
                */
              onInteract={(at) =>
                at === undefined && atDoorRef.current ? doLeave() : doInteract(at)
              }
              onPlace={doPlace}
              onRemove={doRemove}
              onWheel={cyclePalette}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* And the last of the fade, in the sky's own colour, so there is no
          border left to find. */}
      <div className="pointer-events-none absolute inset-0 rounded-[3rem] shadow-[inset_0_0_140px_60px_#0a0616]" />

      <CafeHud
        state={snapshot}
        mode={mode}
        locked={locked}
        started={started}
        ready={ready}
        prompt={atDoor ? words.prompts.headToGarden : prompt}
        focus={focus}
        selected={selected}
        moving={moving}
        onSelect={setSelected}
        onRotate={() =>
          setRotation((current) => (current + Math.PI / 2) % (Math.PI * 2))
        }
        onSell={doRemove}
        onMove={doPickUp}
        onBuyTile={doBuyTile}
        onToggleOpen={doToggleOpen}
        onMode={setMode}
        isTouch={isTouch}
        compact={compact}
      />

      {/* The travel bar used to sit here. The workspace rail owns the way
          between the places now - and the way to somebody else's - so the café
          keeps the corner it was hiding that bar in whenever build mode wanted
          the same space. */}

      <EmotePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={room.emote}
        className={emoteAnchor(hand)}
      />

      {/* Your own body, so this one shows in somebody else's café too. */}
      <DriftToggle
        on={drifting}
        onChange={setDrifting}
        className="bottom-4 right-[4.25rem]"
      />

      {drifting && doing && (
        <div className="pointer-events-none absolute bottom-[4.5rem] right-4 z-30 rounded-lg border border-white/10 bg-black/70 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur">
          {doing}
        </div>
      )}

      {/* Only in your own café - see the note in the house. */}
      {!visiting && (
        <CreaturePicker
          slug={slug}
          place="cafe"
          agents={agents}
          onChange={setAgents}
          className="bottom-4 right-[8.5rem]"
        />
      )}

      {/* Draws nothing: it publishes the door to the rail, beside the roster. */}
      <DoorPanel room={room} slug={slug} door={initial.door} />

      {isTouch && started && (
        <TouchRig
          mode={mode}
          onStick={onStick}
          onAct={mode === 'build' ? doPlace : doInteract}
        />
      )}

      {/* Last, so it covers everything above when you are not welcome yet. */}
      <DoorScreen room={room} ownerName={owner.name} place="cafe" />
    </div>
  )
}

/**
 * The on-screen controls a phone needs.
 *
 * Only two, deliberately. Movement has to be a stick, and the primary action has
 * to be a button because a tap on the canvas is already the start of a look
 * drag - trying to tell a tap from a drag would make both feel unreliable.
 * Everything else (build, sell, move, rotate, floor, open/closed) is already a
 * real button in the HUD, so it works on touch without anything extra.
 */
function TouchRig({
  mode,
  onStick,
  onAct,
}: {
  mode: 'serve' | 'build'
  onStick: (strafe: number, forward: number) => void
  onAct: () => void
}) {
  /* Read here rather than passed down from <CafeGame>: this is a preference,
     not scene state, and threading it through a prop would mean every component
     between the two knowing about somebody's thumbs. */
  const { hand } = useHand()
  const words = cafeDict(useLocale())

  return (
    <>
      <Joystick onChange={onStick} className={`pointer-events-auto ${stickAnchor(hand)}`} />

      <div className={actionsAnchor(hand)}>
        <TapButton
          label={mode === 'build' ? words.controls.place : words.controls.use}
          tone="amber"
          large
          onPress={onAct}
          className="pointer-events-auto"
        />
      </div>
    </>
  )
}

// --- the scene --------------------------------------------------------------

interface SceneProps {
  gameRef: React.RefObject<CafeState>
  snapshot: CafeState
  avatar: string
  agents: AgentView[]
  /** Your own body's seed, when you let go of the controls. See `drift`. */
  seed: number
  drifting: boolean
  onDrift: (drifting: boolean) => void
  onDoing: (label: string | null) => void
  room: Room
  mode: 'serve' | 'build'
  selected: string
  rotation: number
  focus: TileKey | null
  moving: TileKey | null
  /** No pointer lock, and the thumbstick is live. */
  isTouch: boolean
  moveRef: React.RefObject<MoveInput>
  lookRef: React.RefObject<LookDelta>
  onReady: () => void
  onFocus: (key: TileKey | null) => void
  onStanding: (key: TileKey | null) => void
  onPublish: () => void
  onStart: () => void
  onLockChange: (locked: boolean) => void
  onInteract: (at?: TileKey) => void
  onPlace: () => void
  onRemove: () => void
  onWheel: (direction: number) => void
}

function Scene(props: SceneProps) {
  const {
    gameRef,
    snapshot,
    mode,
    selected,
    rotation,
    focus,
    moving,
    avatar,
    agents,
    room,
    onReady,
  } = props

  /** The chef's eye. The camera is derived from it, never the other way round. */
  const playerRef = useRef(new THREE.Vector3(4, EYE_HEIGHT, 4))

  /**
   * The café as something with a mind of its own can see it.
   *
   * One object, rebuilt whenever the floor or the furniture changes, because
   * that identity is what tells each creature to throw away its cached route -
   * see `createRoamer`. Sorted, because a perch is drawn by index and a `Set`'s
   * insertion order would make two tabs disagree about which square is which.
   *
   * `solidTest` is the scene's own collision, reused rather than reimplemented:
   * a creature that walked through the counter because it consulted a second,
   * subtly different idea of what is solid is exactly the drift worth avoiding.
   */
  const floor = useMemo(
    () => ({ tiles: [...snapshot.tiles].sort(), solid: solidTest(snapshot) }),
    [snapshot],
  )
  const roamRoom = useRoamable(floor.tiles, floor.solid)

  /**
   * Where a drifting body is facing, written by the frame loop and read by the
   * chef a few lines later. `null` means nothing is steering, which is a
   * different thing from "steering, facing north".
   */
  const driftRef = useRef<Drift | null>(null)
  // Reaching this effect at all means the room's models resolved, because the
  // Suspense boundary above would otherwise still be showing its fallback.
  useEffect(() => {
    onReady()
  }, [onReady])

  return (
    <>
      {/*
        No `<color attach="background">`: an opaque clear colour is a wall, and
        the whole point is that the page's sky runs behind this room. The fog
        below is what carries the far end of it into that sky - see `SKY`.
      */}
      <fog attach="fog" args={[SKY, 26, 95]} />
      {/* Cooled to match. A warm white key over a night sky lit the café like
          a film set standing in the dark. */}
      <hemisphereLight args={['#e9ddff', '#2a1b4d', 1.05]} />
      <directionalLight
        position={[12, 18, 8]}
        intensity={1.55}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />

      <AdaptiveFov />
      <Room state={snapshot} />
      <Placed state={snapshot} />
      <StationItems state={snapshot} />
      <Customers gameRef={gameRef} snapshot={snapshot} />
      <Chef
        playerRef={playerRef}
        state={snapshot}
        avatar={avatar}
        room={room}
        driftRef={driftRef}
      />

      <RemotePeeps room={room} />
      <PresenceSender room={room} playerRef={playerRef} />
      <Roamers agents={agents} room={roamRoom} />

      {mode === 'build' && (
        <BuildPreview
          state={snapshot}
          focus={focus}
          selected={selected}
          rotation={rotation}
          moving={moving}
        />
      )}
      {mode === 'serve' && <FocusRing state={snapshot} focus={focus} />}

      <Controls
        {...props}
        playerRef={playerRef}
        roamRoom={roamRoom}
        driftRef={driftRef}
      />
    </>
  )
}

/**
 * Widen the lens on a tall screen.
 *
 * three.js' `fov` is the *vertical* angle, so a portrait phone at the desktop's
 * 58 degrees sees about 29 degrees horizontally - you end up peering at the café
 * through a letterbox and cannot see the counter you are standing at. Scaling
 * the vertical angle by how tall the viewport is restores a usable width.
 *
 * Capped, because past about 82 degrees the wide-angle distortion at the edges
 * is worse than the narrowness it fixes. Landscape is left exactly as it was.
 */
function AdaptiveFov() {
  const size = useThree((state) => state.size)

  /**
   * Declared rather than assigned.
   *
   * Setting `camera.fov` directly works, but it is a scene-graph mutation during
   * a React commit and the r3f lint rule rightly rejects it. Declaring the
   * camera lets the projection matrix be React's problem, which is the same
   * reason `position` is driven through three's own mutators elsewhere.
   */
  const aspect = size.width / Math.max(size.height, 1)
  const fov = Math.min(
    BASE_FOV * Math.min(Math.max(1 / aspect, 1), 1.6),
    MAX_FOV,
  )

  return <PerspectiveCamera makeDefault fov={fov} near={0.1} far={300} />
}

/**
 * Floor and walls, both derived from the tile set.
 *
 * Nothing here is stored in the save - buy a square and the shell rebuilds
 * itself around it, which is what makes extending the room one click instead of
 * a floor purchase plus a wall-repair chore.
 */
function Room({ state }: { state: CafeState }) {
  const tiles = useMemo(() => [...state.tiles].map(parseTile), [state.tiles])
  const walls = useMemo(
    () => wallsFor(state.tiles, state.door),
    [state.tiles, state.door],
  )

  return (
    <group>
      {tiles.map((tile) => {
        const world = tileToWorld(tile)
        return (
          <group
            key={tileKey(tile.x, tile.z)}
            position={[world.x, 0, world.z]}
          >
            <Model model={FLOOR_MODEL} />
          </group>
        )
      })}

      {walls.map((wall, index) => (
        <group
          key={index}
          position={[wall.x, 0, wall.z]}
          rotation={[0, wall.rotY, 0]}
        >
          {/**
           * One model per kind, and no per-piece nudging.
           *
           * Every piece in this set is centred on its own origin and includes
           * its own doorway and corner geometry, so the segment's position is
           * the model's position. That is the whole reason for the swap: the
           * corners now interlock because the pack drew them interlocking.
           */}
          <Model model={WALL_MODELS[wall.kind]} />
        </group>
      ))}
    </group>
  )
}

function Placed({ state }: { state: CafeState }) {
  return (
    <group>
      {[...state.props].map(([key, placed]) => {
        const def = prop(placed.propId)
        if (!def) return null
        const world = tileToWorld(parseTile(key))
        const topper = placed.topper ? prop(placed.topper.propId) : undefined

        return (
          <group key={key} position={[world.x, 0, world.z]}>
            <group rotation={[0, placed.rotY, 0]}>
              <Suspense fallback={null}>
                <PropModel def={def} />
              </Suspense>
            </group>

            {/**
             * Whatever is standing on the worktop.
             *
             * Its own group rather than a child of the one above, so it keeps
             * its own rotation - turning a counter should not spin the ketchup
             * on it to match. The height comes from the *base* prop, because
             * that is whose surface is being stood on.
             */}
            {topper && (
              <group
                position={[0, def.surfaceY ?? 1, 0]}
                rotation={[0, placed.topper!.rotY, 0]}
              >
                <Suspense fallback={null}>
                  <PropModel def={topper} />
                </Suspense>
              </group>
            )}
          </group>
        )
      })}
    </group>
  )
}

/**
 * Whatever is sitting on a worktop right now.
 *
 * Food is modelled at real scale against a 2-unit square, which is small. It is
 * drawn at full size on a surface - shrinking it there would make a counter look
 * like a doll's house - and only scaled down when the chef is carrying it.
 */
function StationItems({ state }: { state: CafeState }) {
  const entries = useMemo(() => [...state.stations], [state.stations])

  return (
    <group>
      {entries.map(([key, station]) => {
        const def = propAt(state, key)
        if (!def || station.items.length === 0) return null
        const world = tileToWorld(parseTile(key))
        const surface = def.surfaceY ?? 1

        return (
          <group key={key} position={[world.x, surface, world.z]}>
            {station.items.map((item, index) => {
              let positionCorrectionX = 0
              if(item.startsWith('patty')) {
                positionCorrectionX = -0.25
              }
              return (
              <Suspense key={`${item}-${index}`} fallback={null}>
                <group
                  position={[
                    // Fan several ingredients out so a loaded oven does not look
                    // like one item - you need to see what is still missing.
                    (index - (station.items.length - 1) / 2) * 0.5 ,
                    0 ,
                    0 + positionCorrectionX,
                  ]}
                >
                  <ItemModel item={item} />
                </group>
              </Suspense>)
            }
            )}
          </group>
        )
      })}
    </group>
  )
}

/**
 * Diners.
 *
 * Their existence comes from the React snapshot, which changes every few
 * seconds; their *positions* come from the simulation ref every frame. Driving
 * position from the snapshot instead would make them walk at twelve frames a
 * second while everything else ran at sixty.
 */
function Customers({
  gameRef,
  snapshot,
}: {
  gameRef: React.RefObject<CafeState>
  snapshot: CafeState
}) {
  const groups = useRef(new Map<number, THREE.Group>())

  useFrame(() => {
    for (const customer of gameRef.current.customers) {
      const group = groups.current.get(customer.id)
      if (!group) continue
      group.position.set(customer.x, seatHeight(gameRef.current, customer), customer.z)
      // Shortest-arc turn, so an animal spinning from +pi to -pi does not
      // pirouette on the spot.
      const delta = THREE.MathUtils.euclideanModulo(
        customer.rotY - group.rotation.y + Math.PI,
        Math.PI * 2,
      ) - Math.PI
      group.rotation.y += delta * 0.2
    }
  })

  return (
    <group>
      {snapshot.customers.map((customer) => (
        <group
          key={customer.id}
          ref={(node) => {
            if (node) groups.current.set(customer.id, node)
            else groups.current.delete(customer.id)
          }}
          position={[customer.x, 0, customer.z]}
        >
          <Suspense fallback={null}>
            <AvatarModel
              model={customer.avatar}
              clip={customer.state === 'arriving' || customer.state === 'leaving' ? 'walk' : 'idle'}
            />
          </Suspense>
          <OrderBubble customer={customer} />
        </group>
      ))}
    </group>
  )
}

/**
 * Sitting down.
 *
 * There is no sitting animation in the peeps pack, so a seated customer is
 * simply raised to chair height and left in their idle loop. It reads correctly
 * because the chair is under them; the alternative was an animal standing
 * inside the furniture.
 */
function seatHeight(state: CafeState, customer: Customer): number {
  if (customer.state !== 'seated' && customer.state !== 'eating') return 0
  if (!customer.seat) return 0
  const def = propAt(state, customer.seat)
  return def?.model === 'chair_stool' ? 0.5 : 0.62
}

/** What a customer is waiting for, and how patient they still are about it. */
function OrderBubble({ customer }: { customer: Customer }) {
  const dish = customer.order ? recipe(customer.order) : undefined
  if (!dish || customer.state !== 'seated') return null

  return (
    <group position={[0, 2.5, 0]}>
      <Suspense fallback={null}>
        <group scale={0.9}>
          <ItemModel item={dish.id} />
        </group>
      </Suspense>
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.1 * (customer.patience / PATIENCE), 0.12]} />
        <meshBasicMaterial
          color={customer.patience > 15 ? '#5ad07a' : '#e0573e'}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/** You. A peep, seen from behind, holding whatever you picked up. */
function Chef({
  playerRef,
  state,
  avatar,
  room,
  driftRef,
}: {
  playerRef: React.RefObject<THREE.Vector3>
  state: CafeState
  avatar: string
  room: Room
  /** Non-null only while the autopilot has the controls. */
  driftRef: React.RefObject<Drift | null>
}) {
  const group = useRef<THREE.Group>(null)
  const previous = useRef(new THREE.Vector3())
  const [moving, setMoving] = useState(false)
  const { camera } = useThree()

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return

    const player = playerRef.current
    node.position.set(player.x, player.y - EYE_HEIGHT, player.z)

    /**
     * Which way the chef points, and who decides.
     *
     * Normally the camera: the peeps pack faces +Z in model space, so this is a
     * plain `atan2(x, z)` with no half-turn correction - the same convention the
     * lounge relies on. Without it the chef walks around permanently facing the
     * camera, which reads as moonwalking in every direction but one.
     *
     * While the autopilot has the controls it is the schedule instead, eased,
     * because the heading is redrawn per beat and snapping through a half turn
     * looks like a glitch rather than like looking round.
     */
    const steering = driftRef.current
    if (steering) {
      node.rotation.x = steering.lean
      node.rotation.y +=
        angleDelta(node.rotation.y, steering.yaw) * (1 - Math.exp(-6 * delta))
    } else {
      node.rotation.x = 0
      camera.getWorldDirection(CHEF_DIR)
      CHEF_DIR.y = 0
      if (CHEF_DIR.lengthSq() > 1e-6) {
        CHEF_DIR.normalize()
        node.rotation.y = Math.atan2(CHEF_DIR.x, CHEF_DIR.z)
      }
    }

    // The gait, from how far the body actually moved - the same either way,
    // which is what makes an eased autopilot catch-up play the walk clip
    // without the autopilot having to say so.
    const travelled = previous.current.distanceTo(player)
    previous.current.copy(player)
    setMoving(travelled / Math.max(delta, 1e-4) > 0.6)
  })

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {/* The player, who may be wearing a bought skin rather than an animal -
            the customers below are always animals and keep AvatarModel. */}
        <BodyModel look={avatar} clip={moving ? 'walk' : 'idle'} ignoreRay />
      </Suspense>
      {state.carried && (
        <Suspense fallback={null}>
          {/* Held out in front at chest height, scaled down so a pizza does not
              eclipse the animal carrying it. */}
          <group position={[0, 1.15, 0.55]} scale={0.8}>
            <ItemModel item={state.carried} />
          </group>
        </Suspense>
      )}

      <EmoteBubble state={room.selfEmote} />
    </group>
  )
}

/** A soft marker under the square the chef is about to act on. */
function FocusRing({
  state,
  focus,
}: {
  state: CafeState
  focus: TileKey | null
}) {
  if (!focus || !state.tiles.has(focus)) return null
  const world = tileToWorld(parseTile(focus))

  return (
    <mesh position={[world.x, 0.02, world.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.72, 0.86, 32]} />
      <meshBasicMaterial color="#ffd479" transparent opacity={0.85} toneMapped={false} />
    </mesh>
  )
}

/**
 * Build mode's preview.
 *
 * Three different things can be true of the targeted square - buildable, for
 * sale as new floor, or neither - and the colour is the only feedback the player
 * gets before spending. Green means the click will work.
 */
function BuildPreview({
  state,
  focus,
  selected,
  rotation,
  moving,
}: {
  state: CafeState
  focus: TileKey | null
  selected: string
  rotation: number
  moving: TileKey | null
}) {
  if (!focus) return null

  const world = tileToWorld(parseTile(focus))
  const inRoom = state.tiles.has(focus)
  const purchasable = canBuyTile(state, focus)

  /**
   * The whole strip of floor this purchase would lay.
   *
   * Previewing only the targeted square was the visible half of the same bug the
   * price label had: floor is bought a line at a time, so a one-square ghost
   * shows you neither what you are getting nor why it costs what it does.
   */
  const strip = expansionFor(state, focus)

  // Aiming at bare ground is a floor purchase, not a furniture one, so the whole
  // strip takes over the preview.
  if (strip.length > 0) {
    return <StripPreview strip={strip} affordable={purchasable} />
  }

  /**
   * While a prop is in hand the preview shows *that* prop, not the palette's.
   * Showing the palette selection during a move is the kind of small lie that
   * makes a player put a fridge where they meant to put the table back.
   */
  const held = moving ? propAt(state, moving) : undefined
  const def = held ?? prop(selected)
  const buildable = held
    ? canMove(state, moving!, focus)
    : def
      ? canPlace(state, focus, selected)
      : false

  /**
   * How high the ghost floats.
   *
   * A decoration bought onto an occupied square is going on that square's
   * worktop, so previewing it on the floor would show it standing inside the
   * counter it is about to sit on - and the player would have no way to tell
   * that from a refusal until after they had paid.
   */
  const standingOnSurface = !held && def && isTopper(def) && state.props.has(focus)
  const ghostY = standingOnSurface ? (surfaceAt(state, focus) ?? 0) : 0

  return (
    <group position={[world.x, 0, world.z]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TILE * 0.94, TILE * 0.94]} />
        <meshBasicMaterial
          color={buildable ? '#6ee7a0' : '#e0573e'}
          transparent
          opacity={0.28}
          toneMapped={false}
        />
      </mesh>

      {inRoom && buildable && def && (
        <group position={[0, ghostY, 0]} rotation={[0, rotation, 0]}>
          <Suspense fallback={null}>
            <PropModel def={def} ghost />
          </Suspense>
        </group>
      )}
    </group>
  )
}

/** Ghost floor over every square a purchase would lay, priced or not. */
function StripPreview({
  strip,
  affordable,
}: {
  strip: TileKey[]
  affordable: boolean
}) {
  return (
    <group>
      {strip.map((key) => {
        const world = tileToWorld(parseTile(key))
        return (
          <group key={key} position={[world.x, 0, world.z]}>
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[TILE * 0.92, TILE * 0.92]} />
              <meshBasicMaterial
                color={affordable ? '#6ee7a0' : '#e0573e'}
                transparent
                opacity={0.3}
                toneMapped={false}
              />
            </mesh>
            {affordable && (
              <Suspense fallback={null}>
                <group position={[0, 0.04, 0]}>
                  <Model model={FLOOR_MODEL} ghost />
                </group>
              </Suspense>
            )}
          </group>
        )
      })}
    </group>
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
  onPublish,
  onLockChange,
  onInteract,
  onPlace,
  onRemove,
  onStart,
  onWheel,
  seed,
  drifting,
  onDrift,
  onDoing,
  roamRoom,
  driftRef,
}: SceneProps & {
  playerRef: React.RefObject<THREE.Vector3>
  roamRoom: Roamable
  driftRef: React.RefObject<Drift | null>
}) {
  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const velocityY = useRef(0)
  const grounded = useRef(true)

  /**
   * Your own schedule, seeded from your user id.
   *
   * Built once and left alone whether or not the autopilot is on, because it
   * holds no state to leave running - it is a cache in front of a function of
   * the clock. The toggle does not start it; it starts listening to it.
   */
  const roamer = useMemo(() => createRoamer(seed, roamRoom), [seed, roamRoom])

  /**
   * The chef's working brain, as opposed to its wandering one.
   *
   * Holds the errand in hand and the path to it, which is why it is built once
   * rather than per frame - a planner that forgot what it was doing every frame
   * would re-derive the same answer sixty times a second and still stutter at
   * every corner.
   */
  const barista = useMemo(() => createBarista(), [])

  /** Last thing reported to the HUD, so it is only told when it changes. */
  const lastDoing = useRef<string | null>(null)

  /** Accumulators, so the HUD and the focus probe are not recomputed per frame. */
  const sincePublish = useRef(0)
  const lastFocus = useRef<TileKey | null>(null)
  const lastStanding = useRef<TileKey | null>(null)

  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  /**
   * Mouse, keyboard and the pointer lock - shared with the house. See
   * ./../desk-controls, which is also where the opening pitch is decided.
   */
  useDeskControls({
    camera,
    gl,
    keys,
    euler,
    isTouch,
    editing: mode === 'build',
    onStart,
    onLockChange,
    onPlace,
    onInteract,
    onRemove,
    onCycle: onWheel,
  })

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_DELTA)
    const state = gameRef.current
    const player = playerRef.current

    turnCamera({ camera, euler: euler.current, keys: keys.current, look: lookRef.current, dt })

    // --- walking ------------------------------------------------------------
    const { forward, strafe, sprint, evenly, walking } = walkAxes(keys.current, moveRef.current)

    camera.getWorldDirection(FORWARD)
    WALK_DIR.copy(FORWARD)
    WALK_DIR.y = 0

    /**
     * Letting go of the controls, and taking them back.
     *
     * Reaching for the movement keys cancels it - you have just expressed an
     * intention, so the thing doing it for you stops. Looking around does not,
     * since watching your own chef potter about is most of the point.
     */
    if (drifting && walking) onDrift(false)

    const adrift = drifting && !walking && roamRoom.tiles.length > 0

    if (adrift) {
      // Written before the camera is placed, so the boom follows the body down
      // when it sits rather than a frame late.
      driftRef.current ??= { yaw: 0, lean: 0 }

      /**
       * Work if there is work, wander if there is not.
       *
       * The barista answers false when the café has nothing to do - no orders,
       * nothing cooking, no plates - and the wandering schedule takes over. That
       * fall-through is the whole relationship between the two: an autonomous
       * chef is one that runs the kitchen when it is busy and potters about when
       * it is not, rather than two separate modes to choose between.
       */
      const working = barista.step(state, player, dt, driftRef.current, onInteract)
      if (!working) drift(roamer, roamRoom, player, dt, driftRef.current)

      // Only on change: this runs every frame and setting React state sixty
      // times a second to the same string would re-render the whole HUD.
      const label = working ? barista.label : null
      if (label !== lastDoing.current) {
        lastDoing.current = label
        onDoing(label)
      }
    } else {
      driftRef.current = null
      if (lastDoing.current !== null) {
        lastDoing.current = null
        onDoing(null)
      }
    }

    if (!adrift && WALK_DIR.lengthSq() > 1e-6 && walking) {
      WALK_DIR.normalize()
      RIGHT.crossVectors(WALK_DIR, UP).normalize()

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
        isSolid: solidTest(state),
      })

      player.set(result.position.x, result.position.y, result.position.z)
      velocityY.current = result.velocityY
      grounded.current = result.grounded
    }

    // --- the simulation -----------------------------------------------------
    /**
     * Read the ref again rather than reusing `state` from the top of the frame.
     *
     * `state` is a snapshot taken before the autopilot ran, and the autopilot
     * interacts *inside* this loop - it calls `onInteract`, which writes the
     * result to `gameRef.current`. Ticking the stale snapshot puts that value
     * straight back, so every single thing the barista did was overwritten in
     * the same frame it did it: it would walk to a crate, take a bun, and have
     * the bun silently removed from its hands a few lines later.
     *
     * The player never hit this because a keypress is handled between frames,
     * so the next frame's snapshot already includes it. Only an actor that
     * moves during the loop can be undone by it.
     */
    gameRef.current = tick(gameRef.current, dt)

    // --- what am I looking at ----------------------------------------------
    const key = probe(camera, player, modeRef.current)
    if (key !== lastFocus.current) {
      lastFocus.current = key
      onFocus(key)
    }

    const under = standingOn(player)
    if (under !== lastStanding.current) {
      lastStanding.current = under
      onStanding(under)
    }

    // --- hand React a snapshot, occasionally --------------------------------
    sincePublish.current += dt
    if (sincePublish.current > 0.1) {
      sincePublish.current = 0
      onPublish()
    }

    // --- camera rig ---------------------------------------------------------
    placeCamera(camera, player, modeRef.current, gameRef.current)
  })

  return null
}

/**
 * Put the camera behind the chef without putting it through a wall.
 *
 * A café is a small box with four-unit walls around it, so the naive
 * "player minus forward times distance" rig spends most of its time standing
 * outside in the dark looking at the back of the building. This marches out
 * along the boom and stops short of anything solid, which is the standard
 * third-person answer and the only one that survives a five-by-four room.
 *
 * Build mode opts out on purpose: its camera is *above* wall height, so there is
 * nothing to collide with and pulling it in would defeat the plan view that
 * makes decorating possible.
 */
function placeCamera(
  camera: THREE.Camera,
  player: THREE.Vector3,
  mode: 'serve' | 'build',
  state: CafeState,
) {
  const view = VIEWS[mode]
  camera.getWorldDirection(FORWARD)

  /**
   * The boom follows the yaw only, never the pitch.
   *
   * Hanging it off the full look vector couples where the camera *is* to where
   * it is *pointing*, so glancing down drags the camera up and back and the
   * whole room lurches. Flattening it means looking around aims the camera and
   * nothing else - the rig stays a fixed distance behind and above the chef.
   */
  WALK_DIR.copy(FORWARD)
  WALK_DIR.y = 0
  if (WALK_DIR.lengthSq() < 1e-6) return
  WALK_DIR.normalize()

  BOOM.copy(WALK_DIR).multiplyScalar(-view.distance).addScaledVector(UP, view.height)
  const reach = BOOM.length()
  BOOM.normalize()

  let distance = reach

  if (mode === 'serve') {
    const solid = solidTest(state)
    for (let along = CAMERA_STEP; along <= reach; along += CAMERA_STEP) {
      const x = player.x + BOOM.x * along
      const y = player.y + BOOM.y * along
      const z = player.z + BOOM.z * along
      if (solid(Math.floor(x), Math.floor(y), Math.floor(z))) {
        // Back off one step, then a little more, so the near plane does not
        // clip into the surface we just stopped against.
        distance = Math.max(0, along - CAMERA_STEP * 1.5)
        break
      }
    }
  }

  camera.position.copy(player).addScaledVector(BOOM, distance)
  camera.position.y = Math.max(camera.position.y, CAMERA_MIN_Y)
}

/**
 * Which square the player means.
 *
 * Two different questions, so two different answers. On the floor you mean "the
 * thing I am standing in front of", which a probe a step ahead of the chef gets
 * right even when they are jammed against it. In build mode you mean "the square
 * under the crosshair", which is a ray onto the ground - you are placing
 * furniture across the room, not bumping into it.
 */
function probe(
  camera: THREE.Camera,
  player: THREE.Vector3,
  mode: 'serve' | 'build',
): TileKey | null {
  if (mode === 'build') {
    RAY.setFromCamera(SCREEN_CENTRE, camera)
    if (!RAY.ray.intersectPlane(GROUND, HIT)) return null
    if (HIT.distanceTo(player) > 40) return null
    const tile = worldToTile(HIT.x, HIT.z)
    return tileKey(tile.x, tile.z)
  }

  camera.getWorldDirection(FORWARD)
  WALK_DIR.copy(FORWARD)
  WALK_DIR.y = 0
  if (WALK_DIR.lengthSq() < 1e-6) return null
  WALK_DIR.normalize()

  const tile = worldToTile(
    player.x + WALK_DIR.x * REACH,
    player.z + WALK_DIR.z * REACH,
  )
  return tileKey(tile.x, tile.z)
}

/**
 * Collision, in the unit-cell terms the borrowed character controller wants.
 *
 * Anything that is not floor is solid, which is what makes the perimeter behave
 * like a wall without walls being objects. Solid furniture fills its whole
 * square - a counter is 2 units wide and so is the square, so there is nothing
 * to be gained by being cleverer.
 *
 * The two heights are why this is not simply "solid or not". The chef cannot
 * tell the difference - their head is at 1.7 and both numbers are above it - but
 * the *camera* can, and it is the reason build mode can lift itself over the
 * walls for a plan view while service mode stays boxed in by them.
 */
const WALL_HEIGHT = 4
const FURNITURE_HEIGHT = 2

function solidTest(state: CafeState) {
  return (x: number, y: number, z: number): boolean => {
    if (y < 0) return false
    const key = tileKey(cellToTileAxis(x), cellToTileAxis(z))
    if (!state.tiles.has(key)) return y < WALL_HEIGHT
    const def = propAt(state, key)
    return def ? propIsSolid(def) && y < FURNITURE_HEIGHT : false
  }
}
