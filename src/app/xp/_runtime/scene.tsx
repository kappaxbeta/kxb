'use client'

import { Canvas } from '@react-three/fiber'
import { Framed, isFramed } from '@/app/xp/_runtime/framed'
import { Sketch, isSketch } from '@/app/xp/_runtime/sketch'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Placements } from '@/app/xp/_runtime/world/instances'
import { sideOf } from '@/app/xp/_runtime/match/teams'
import { Aiming } from '@/app/xp/_runtime/body/aiming'
import { Marks } from '@/app/xp/_runtime/world/marks'
import { Cutscene } from '@/app/xp/_runtime/cutscene'
import { TICKER_LINES } from '@/app/xp/_runtime/hud/ticker'
import { Hud, scriptState } from '@/app/xp/_runtime/hud/hud'
import { bodyOf, Running } from '@/app/xp/_runtime/simulation'
import { scriptEngine } from '@/app/xp/_hosts/scripting'
import { realtimeArbiter, realtimeNetwork } from '@/app/xp/_hosts/realtime'
import type { Match } from '@/app/xp/_runtime/match/match'
import { ControlsPanel } from '@/app/xp/_runtime/hud/controls-panel'
import { xpControls } from '@/app/xp/_runtime/input/controls'
import { planLoad, worthAnnouncing } from '@/app/xp/_runtime/loading'
import { TouchControls, useIsTouch, type Touch } from '@/app/xp/_runtime/hud/touch-controls'
import { HandGate } from '@/app/xp/_runtime/hud/hand-gate'
import { useHand } from '@/lib/controls/use-hand'
import { EmotePicker } from '@/app/xp/_runtime/hud/emote-picker'
import { ChatPanel } from '@/app/xp/_runtime/hud/chat-panel'
import { realtimeChat } from '@/app/xp/_hosts/chat'
import type { EmoteId } from '@/app/xp/_runtime/body/emotes'
import { enterVr, headsetAvailable } from '@/app/xp/_runtime/input/vr'
import { adopt, claimFor, greeting, type SceneClaim } from '@/app/xp/_hosts/room-scene'
import { controlLines, hudLines } from '@/app/xp/_runtime/input/vr-hud'
import { VrPanel } from '@/app/xp/_runtime/hud/vr-panel'
import type { Run } from '@/app/xp/_runtime/match/race'
import type { Standing } from '@/app/xp/_runtime/match/standings'
import { lensSettings } from '@/app/xp/_runtime/camera'
import type { OpenVote } from '@/app/xp/_runtime/match/vote'
import {
  cameraFor,
  cameraOf,
  dataOf,
  describeProblems,
  enterOf,
  parseXp,
  PROGRESS_KEY,
  readProgress,
  resumes,
  allowedIn,
  releasedKeys,
  rulesOf,
  seenAs,
  storeKeyOf,
  talkOf,
  type XpDocument,
  type XpProgress,
  flowFor,
  modeOf,
  type Mode,
} from '@kxb/xp'
import { bodiesFor, buildSolids, EYE_HEIGHT, type Aim } from '@kxb/xp/engine'
import { keyLabel } from '@/app/xp/_runtime/input/controls'
import type { Cooling } from '@/app/xp/_runtime/hud/cooling'
import { askedFor, standingIn } from '@/app/xp/_runtime/standing'
import { useRoomLink } from '@/app/xp/_runtime/net/room-link'
import { clearStuck, publishStuck } from '@/lib/stuck-store'
import { unsupported, type HostCapability } from '@kxb/xp/host'
import { xpStore } from '@/app/xp/_hosts/store'
import { RACE_STREAM, raceRecord } from '@/app/xp/_runtime/match/race-record'
import {
  adoptable,
  changed,
  openingValues,
  persisted,
  plannedReads,
  shareable,
  readBack,
  WRITE_EVERY_SECONDS,
} from '@/app/xp/_runtime/level-data'
import { seedFrom, type Scripts } from '@kxb/xp/script'
import { xpDict } from '@/app/i18n/xp'
import { useLocale } from '@/app/i18n/locale-context'
import { fill } from '@/app/i18n/fill'
import { translator } from '@kxb/xp/words'

/**
 * An XP, running.
 *
 * The whole of M1: a document goes in, a world you can walk around comes out.
 * Everything it needs is in the document and in the pure modules the document
 * points at - there is no branch anywhere in here on *which* XP is loaded,
 * which is the property that makes this a runtime rather than a level viewer.
 *
 * ---------------------------------------------------------------------------
 * Why the solids are built here and not in the player
 * ---------------------------------------------------------------------------
 * Rasterising a world costs a pass over every placement, and the controller
 * asks its question sixty times a second. Built once per document with a memo,
 * the answer is a hash lookup; built in the component that queries it, it would
 * be rebuilt on every re-render of a HUD.
 */

/**
 * The page's own sky, as the hex three.js can parse.
 *
 * DESIGN.md's `sky` token, oklch(0.08 0.04 285), which is exactly what
 * `globals.css` paints `html` with. That is the whole point of the constant: it
 * is not "a nice dark colour for the scene", it is *the colour of the page
 * behind the scene*, and it has to stay in step with the stylesheet or the far
 * edge of the world stops matching what is around it. The lounge keeps the same
 * pairing for the same reason and says so at `_canvas/lounge-sky.tsx`.
 */
const SKY = '#02000b'

/**
 * Exported because the editor's log prints it: a panel that quietly stops
 * keeping lines is a panel somebody trusts about the wrong stretch of a run.
 */
export const LOG_LINES = 200

/**
 * The place the round being played asks to be played in, if it asks for one.
 *
 * The host's `mode` when it has an opinion, and otherwise the document's own -
 * one line, in one function, because it is read twice: once to decide where a
 * session opens, and once when the round changes underneath it. Two spellings
 * of "which round is this" is how the two answers would drift apart.
 */
function roundScene(
  xp: Parameters<typeof rulesOf>[0] & Parameters<typeof flowFor>[0],
  mode: Mode | undefined,
): string | undefined {
  return flowFor(xp, mode ?? modeOf(rulesOf(xp)))?.scene
}

/**
 * One XP, played - whichever kind it turns out to be.
 *
 * ---------------------------------------------------------------------------
 * Why the branch is a wrapper and not an early return
 * ---------------------------------------------------------------------------
 * A cartridge has no world, no camera and no bodies, so none of the several
 * hundred lines below apply to one. The obvious shape - check at the top of
 * `XpLevelScene` and return - is the one React forbids: everything after it is
 * hooks, and a component that runs a different number of them on different
 * renders is a component that breaks the moment a document changes underneath
 * it, which is exactly what the editor does.
 *
 * So the decision is made *before* any hook exists, by a component whose whole
 * body is one `if`. It also means a battle room playing a cartridge never
 * constructs a physics step, a camera or a roster it is going to throw away.
 *
 * ---------------------------------------------------------------------------
 * Every caller got this for free
 * ---------------------------------------------------------------------------
 * The workbench at `/xp/<id>`, the editor's preview and the battle room all
 * mount `XpScene`, and not one of them changed. That is the whole argument for
 * a cartridge being an XP rather than a route of its own: the store already
 * lists these, the wizard already picks them, and the room already opens them.
 */
export function XpScene(props: Parameters<typeof XpLevelScene>[0]) {
  if (isFramed(props.xp)) {
    return (
      <Framed
        xp={props.xp}
        {...(props.room ? { room: props.room } : {})}
        {...(props.me ? { me: props.me } : {})}
        {...(props.match ? { match: props.match } : {})}
      />
    )
  }
  // The other kind of cartridge: code the document carries, run in a
  // container. Same bargain as `Framed` - every caller gets it for free.
  if (isSketch(props.xp)) {
    return (
      <Sketch
        xp={props.xp}
        {...(props.room ? { room: props.room } : {})}
        {...(props.me ? { me: props.me } : {})}
        {...(props.touch !== undefined ? { touch: props.touch } : {})}
        {...(props.match ? { match: props.match } : {})}
        {...(props.startedAt !== undefined ? { startedAt: props.startedAt } : {})}
      />
    )
  }
  return <XpLevelScene {...props} />
}

/**
 * A level, drawn.
 *
 * Not the entry point - `XpScene` above is, and it decides whether this runs at
 * all. Everything in here assumes a document with a world in it.
 */
function XpLevelScene({
  // Renamed on the way in: this is the *starting* document now, not the one
  // being played. See the state below.
  xp: fromServer,
  room,
  avatar,
  mode,
  openIn,
  startedAt,
  me,
  team,
  xpId,
  conversation,
  touch: forceTouch,
  onLog,
  onRoster,
  party,
  onParty,
}: {
  xp: XpDocument
  /**
   * The topic everybody in this instance shares, when there is one.
   *
   * Absent is the normal case and costs nothing: no channel is opened, no packet
   * is sent, and the level is one person alone in it. See ./together for what
   * changes when it is present, and `src/lib/xp-rooms.ts` for what has to be
   * true before it can be.
   */
  room?: string
  /** The animal this player wears, off their profile. See `bodiesFor`. */
  avatar?: string | null
  /** When the match was started, so the whistle is a kick off. See ./simulation. */
  /**
   * Which mode is being played, when the host knows better than the document.
   *
   * Forwarded rather than decided here: the battle room is the one thing that
   * knows a battle is happening, and `flowFor` in ./simulation is the one place
   * that turns it into which flow runs.
   */
  mode?: Mode
  /**
   * What the host decided about this match, for a framed document.
   *
   * Forwarded rather than read here, for the same reason `mode` is: the battle
   * room is the one thing that knows a wizard set a time limit, and this is a
   * scene that draws whatever it is given.
   */
  match?: { timeLimit: number | null; scoreLimit: number | null }
  /**
   * Which room to open in, when whoever mounted this has asked for one.
   *
   * Absent is the normal case and the document decides - the round's scene if
   * it names one, `enter` otherwise. The editor's preview is what this exists
   * for: Try means "try *this* room", and see `askedFor` in ./standing for why
   * the caller wins and what a name this document does not hold does instead.
   *
   * Read once, when a session starts. A door is what moves somebody afterwards,
   * and a prop that kept pulling them back to where they pressed Try would be a
   * level you cannot walk out of.
   */
  openIn?: string
  startedAt?: string | null
  /**
   * The saved project this document came from, when it came from one.
   *
   * The document's own `id` is the author's name for it and is the same string
   * in every copy; this is the row. Absent for a builtin under
   * `public/xp/xps/` and for the editor's preview, and both of those are right:
   * a file has nothing to store against, and a level being *tried* should not
   * write to the world it is a draft of.
   */
  xpId?: string
  me?: { id: string; name: string }
  /**
   * The lights, and whose switch it was.
   *
   * On, every co-player in the match stands in their own colour - the lounge's
   * party glow, owned over here in ./glow because `src/app/xp/**` may not import
   * the lounge. Absent is off, which is every level until somebody says.
   *
   * A prop rather than a store, which is the one difference from how the lounge
   * carries it, and the reason is the mount: the lounge is one scene with a rail
   * beside it, where a level is mounted by the catalogue, a room, a battle and
   * the editor's preview. Whoever mounts it is the only one that knows whether
   * there is a party on - the battle lobby does, and says so the same way it
   * already says which side somebody is on.
   */
  party?: { on: boolean; host?: string }
  /**
   * The room saying the lights changed, and who threw the switch.
   *
   * The other half of `party`, so the switch and the room stay one fact: a peer
   * turning them on arrives here, and whoever owns the state above sets it. A
   * scene that kept its own copy would be a room where two people disagree
   * about whether the lights are on.
   */
  onParty?: (on: boolean, from: string) => void
  /**
   * The side a host has already put this player on.
   *
   * Passed through rather than derived here, because a host that has chosen is
   * the one authority on it - the battle lobby picks sides before anybody loads
   * the document. Absent means the level decides for itself, which is what
   * `sideOf` is for. See `_runtime/teams.ts`.
   */
  team?: string
  /**
   * Which conversation this level belongs to, when it belongs to one.
   *
   * docs/xp/backlog.md §7b's first open question, and the entry names the cost
   * honestly: **the scene did not know the space it was in.** It takes a
   * document, a topic and a player, and none of those is a space — so a message
   * sent in a level had nowhere to be a message *in* the space.
   *
   * ---------------------------------------------------------------------------
   * One prop rather than three
   * ---------------------------------------------------------------------------
   * `slug`, `tenantId` and `roomId` arrive together or not at all: the slug is
   * for the server action, the tenant id is for the topic, and any two of the
   * three without the third describe nothing. Grouping them is also what makes
   * absence mean something clean — no object is a level with no conversation,
   * which is the operator route, the editor's preview, and a space whose chat is
   * switched off.
   *
   * ---------------------------------------------------------------------------
   * Which conversation, decided by the caller
   * ---------------------------------------------------------------------------
   * §7b's second open question, and it is a *choice* rather than a lookup: a
   * level standing in a room has that room's id, and a level played as a battle
   * has no `rooms` row at all. The answer taken here is that a battle belongs to
   * **the space's own conversation** (`roomId: null`) rather than to nothing:
   *
   * - The alternative is a match where nobody can say anything, which is the
   *   one place in this product where people most want to.
   * - The whole argument for chat being the host's rather than the engine's is
   *   that *a message in a level is a message in the space* rather than a second
   *   inbox nobody reads. A per-battle conversation with no row behind it, no
   *   rail, and no scrollback after the match ends would be exactly that second
   *   inbox — and would be one that is deleted when the match empties.
   * - It costs nothing to reverse. `rooms.xp_ref` gaining a match one day is a
   *   different id passed here, and nothing downstream changes.
   *
   * It is the *caller's* answer for the same reason `realtimeChat` takes the id
   * rather than deriving one: it is a question the page can answer and the level
   * cannot.
   */
  conversation?: {
    /** The space, for the server action. */
    slug: string
    /** The space's id, for the broadcast topic. */
    tenantId: string
    /** The room's conversation, or null/absent for the space's own. */
    roomId?: string | null
  }
  /**
   * Everything the level has said this run, whenever it changes.
   *
   * For the editor, and absent everywhere else. In play the ticker over the
   * scene is the whole of it - a transcript in front of somebody playing is
   * chrome nobody asked for - and while *building* it is the difference between
   * "my rule did nothing" and being able to look at what did happen.
   *
   * The array rather than each line: the state is already the transcript (see
   * `said`), and handing over one line at a time would have the caller rebuild
   * a list this component is already holding.
   */
  onLog?: (lines: readonly { id: number; text: string }[]) => void
  /**
   * Everybody the socket can see in here, by account id, whenever it changes.
   *
   * Absent everywhere the level is the whole of what is on the screen, which is
   * the operator route and the editor's preview. Set by a *host* that has a
   * roster of its own to compare it against - the match room, which knows who
   * the match is between and cannot otherwise know who turned up. See
   * `whoIsAway` beside it.
   *
   * The same list the scene already resolves seats from, handed on rather than
   * subscribed to twice: two subscriptions to one channel is two answers to
   * "who is here" that can disagree, which is the failure `onRoster` on
   * ./simulation exists to avoid one level down.
   */
  onRoster?: (ids: readonly string[]) => void
  /**
   * Force the touch layout on, regardless of the real pointer.
   *
   * Absent is every real page: the device decides, through `useIsTouch`. Set
   * is the editor's per-device preview, which runs on a mouse and still wants
   * to show what a thumb would see.
   *
   * Only ever set *true*. `false` would read as "no touch here" and win over a
   * device that plainly has one - see the note at the call site: a preview
   * opened on a phone in the desktop frame drew no controls at all.
   */
  touch?: boolean
}) {
  /**
   * First, because half the callbacks below word something.
   *
   * A trouble - a save that did not land, a checkpoint that would not read - is
   * written in the reader's language at the moment it happens, and the earliest
   * of those is declared four hundred lines above where this used to sit. The
   * compiler is right to refuse that: a value read before it is declared cannot
   * update when it changes.
   */
  const locale = useLocale()

  /**
   * The document, which is now something that can *change*.
   *
   * It arrived as a prop from the server page and stayed one, which was right
   * until `load` existed: a door into another level is a new document, and
   * everything derived below - the solids, the scripts, the camera, the spawn -
   * has to follow it. Seeded from the prop rather than replacing it, so a page
   * that navigates normally still starts where the server said.
   *
   * Keyed re-mounting was the alternative and is worse here: it would throw away
   * the socket and the room with it, so walking through a door would look to
   * everybody else like you left and came back.
   */
  const [xp, setXp] = useState(fromServer)

  /**
   * Follow the server again if it hands over a different level.
   *
   * Without this, a client-side navigation between two XP routes reuses this
   * component and keeps showing the old document.
   *
   * Adjusted *during render* rather than in an effect, which is React's own
   * answer for state that has to follow a prop - and which lint enforces here,
   * because the effect version sets state after a paint and so renders the old
   * level for a frame before replacing it. Setting during render re-runs this
   * component before anything is shown and never reaches the children.
   *
   * Compared by id rather than by identity: the prop is a fresh object on every
   * render of the parent, and depending on identity would throw away a level
   * somebody had walked into.
   */
  const [seededFrom, setSeededFrom] = useState(fromServer.id)
  /**
   * Which room of the document somebody is standing in.
   *
   * A document holds more than one place now (docs/xp/scenes.md §1.1) and this
   * is which of them is on screen. It starts where the caller asked, or where
   * the round says, or at `enter`; it moves when a `load` names a scene; and it
   * is reset by the line below whenever the *document* changes - a door out of
   * the level arrives in the new one's front room, not in whatever the old
   * one's back room happened to be called, and not in a room the *previous*
   * document's caller named.
   */
  const [where, setWhere] = useState(
    () => askedFor(fromServer, openIn) ?? roundScene(fromServer, mode) ?? enterOf(fromServer),
  )

  /**
   * And the round this session plays can name a place of its own.
   *
   * A level with a foyer and an arena wants its battle in the arena and its
   * lobby round in the foyer, and the *round* is the thing that knows which -
   * one arena hosting three rulesets is the normal case, so the run names the
   * scene rather than the other way round.
   *
   * Applied as an arrival rather than as a door: `setWhere` is what walking
   * through one does, and this is the same move made because the round said so.
   * Absent moves nobody, which is every flow written before the field and every
   * level with one place in it.
   *
   * Keyed on the round rather than run once, so a session that changes which
   * one it is playing - a battle opening on a lobby - goes where the new one
   * says. The parser has already refused a scene this document does not have,
   * so there is nothing to fall back to.
   *
   * Two halves, and neither is an effect - for the reason `seededFrom` gives
   * above, which lint enforces here too. The round a session *starts* on is
   * folded into `where`'s own initial value, so the arena is the first thing
   * drawn rather than the second; a round that changes afterwards is caught by
   * the comparison below, during render, before the children see the old room.
   */
  const [round, setRound] = useState({ xp: fromServer, mode })
  if (round.xp !== xp || round.mode !== mode) {
    setRound({ xp, mode })
    /*
     * `where` is compared but deliberately not *tracked*: this is about the
     * round changing, and re-running because somebody walked out of the arena
     * would drag them straight back into it.
     */
    const wanted = roundScene(xp, mode)
    if (wanted && wanted !== where) setWhere(wanted)
  }
  if (seededFrom !== fromServer.id) {
    setSeededFrom(fromServer.id)
    setXp(fromServer)
    setWhere(enterOf(fromServer))
  }

  /**
   * The document as it is from where you are standing.
   *
   * Everything below reads this rather than `xp`, and the difference is exactly
   * one room: the world, the spawn and the marks are the scene's. `xp` is kept
   * whole because it is what a *door* is resolved against - the scenes table,
   * the id - and because throwing the other rooms away would mean re-fetching
   * the file to walk back into the lobby.
   */
  const here = useMemo(() => standingIn(xp, where), [xp, where])

  const solids = useMemo(() => buildSolids(here.world), [here.world])

  /**
   * The debug readout: where you are standing, and which way you are pointing.
   *
   * `facing` arrived with the deathmatch. A coordinate on its own says where
   * somebody is and nothing about where they are looking, which is the only
   * question that matters when a shot is a ray out of the eye - and it is why
   * landing a hit on purpose in a two-browser probe was luck rather than aim.
   */
  const [readout, setReadout] = useState<
    { x: number; y: number; z: number; facing: number } | null
  >(null)
  const [scripts, setScripts] = useState<Scripts | null>(null)
  /**
   * What went wrong, on the screen rather than in a console.
   *
   * The lounge has been bitten by this twice - a race result silently lost, a
   * mode error rendered inside a panel that closes at kickoff
   * (docs/xp/creator.md §9). A script that threw is exactly that class of thing:
   * the level keeps running, one entity quietly stops, and without this the only
   * evidence is that the game is boring.
   */
  const [broken, setBroken] = useState<string[]>([])

  /**
   * What just happened, in words, for the person playing.
   *
   * A level talks through effects - a coin scores, a rule emits, a script logs -
   * and until now every one of them went into an array the host dropped on the
   * floor. Running through a pickup and seeing nothing at all is
   * indistinguishable from running through a pickup that is broken, which is
   * the same failure the script panel exists to prevent, one layer down.
   */
  const [said, setSaid] = useState<{ id: number; text: string }[]>([])

  /**
   * How many times somebody has asked to be put back at the start.
   *
   * A counter rather than a flag, because pressing it twice from the same corner
   * has to work twice - see `unstickAt` in ./simulation, where the same argument
   * is made about `round` and `reviveAt`. Held here rather than in the frame
   * loop because the button is on the HUD, which is outside the canvas.
   */
  /** Seconds left on a phase that leaves on a clock - the kick off count. */
  const [countdown, setCountdown] = useState<number | null>(null)
  /**
   * Which round the run is in - one until a flow that goes round says
   * otherwise. Paired with the document's own `rounds` where it is drawn, so
   * the HUD asks a number against a total rather than reporting a bare one.
   */
  const [flowRound, setFlowRound] = useState(1)

  const [unstickAt, setUnstickAt] = useState(0)

  /**
   * And how many times somebody has asked for the *ball* back.
   *
   * A second counter rather than a flag on the first, because they are two
   * different requests: being built into a corner is about you, and a ball
   * kicked somewhere nobody can reach strands everybody while you are perfectly
   * fine. The lounge learned this and keeps the same pair.
   */
  const [ballBackAt, setBallBackAt] = useState(0)

  /**
   * Whether this level has anything that can get stuck in the first place.
   *
   * Any blueprint with a `body` - so the offer appears for a football, a
   * playground and a level of loose crates, and never for one made entirely of
   * walls. Static rather than watched: the lounge polls whether its ball has
   * actually stalled, and that is right there because the lounge has exactly
   * one ball whose state it owns. A document can have twenty bodies and no
   * opinion about which of them is *the* one, so the honest offer is "this
   * level has things that move, here is the way out" - available before
   * somebody needs it rather than a quarter of a second after.
   */
  const hasBodies = useMemo(
    () => Object.values(xp.blueprints).some((blueprint) => blueprint.body !== undefined),
    [xp.blueprints],
  )

  const putBallBack = useCallback(() => {
    setBallBackAt((n) => n + 1)
  }, [])

  const putMeBack = useCallback(() => {
    setUnstickAt((n) => n + 1)
  }, [])

  /**
   * The ways out, offered to the room's rail rather than only to the HUD.
   *
   * The argument is `stuck-store`'s and it is worth repeating because it is the
   * whole reason this is not a key binding: the mouse is captured while you are
   * playing, so any in-world button has to be reached by letting go of the
   * pointer first - and letting go is exactly what anybody does the moment the
   * game stops responding. The rail is what is under the cursor when they do.
   *
   * Keyed by the room, or by the level when there is no room, so a scene on its
   * way out cannot take the buttons away from the one arriving.
   */
  const stuckKey = room ?? `xp:${xp.id}`
  useEffect(() => {
    publishStuck(stuckKey, putMeBack, hasBodies ? putBallBack : null)
    return () => clearStuck(stuckKey)
  }, [stuckKey, putMeBack, putBallBack, hasBodies])

  /**
   * The whole transcript, for anything that wants to read back.
   *
   * The HUD deliberately shows the last few and fades them - it is a ticker, and
   * the interesting line is the one that just arrived. That is right in play and
   * wrong while building: an author whose rule fired once twenty seconds ago has
   * nothing left to look at, which is the same "did that do anything?" the
   * script panel exists to answer one layer down.
   *
   * So the *state* keeps the run and the ticker slices it, rather than two
   * arrays that can disagree about what happened.
   */
  useEffect(() => {
    onLog?.(said)
  }, [said, onLog])

  /** The player's own health and ammunition, when the document gives them any. */
  const [vitals, setVitals] = useState<{ hp?: number; ammo?: number }>({})

  /** How many other people are in the room, for the HUD. */
  const [peers, setPeers] = useState(0)

  /**
   * The cut being played over the level, and which run of it.
   *
   * Two fields rather than one, and the counter is the load-bearing half: a
   * level that plays the same cut twice must start it from the beginning both
   * times, and `<Cutscene>` keeps its playhead in a ref. Keying the component
   * on the run is what React's own remount is for, so the player needs no code
   * of its own to reset.
   */
  const [watching, setWatching] = useState<{ sequence: string; run: number } | null>(null)

  /**
   * The cut it names, or nothing.
   *
   * Resolved here rather than stored, because a document can change under an
   * open level - the editor's preview re-parses on every keystroke - and a cut
   * held in state would outlive being deleted. Nothing to show is the same
   * answer as nothing playing, which is what makes that safe.
   */
  const watchedCut = watching ? here.sequences?.[watching.sequence] : undefined

  /**
   * What the arbiter has said about shots at other people.
   *
   * Here rather than inside the simulation because it is drawn by the HUD, and
   * the HUD is this component's. See ./simulation for why a claim is pending
   * before it is a kill.
   */
  /** Everybody's kills, when there is an arbiter keeping them. */
  const [standings, setStandings] = useState<readonly Standing[]>([])

  /** The vote the room is having, or null. */
  const [vote, setVote] = useState<OpenVote | null>(null)

  /** Whose turn it is, or null in a level that is not taking any. */
  const [turn, setTurn] = useState<string | null>(null)
  /** Chair to whoever is in it, so the turn can be named by colour. */
  const [seats, setSeats] = useState<Record<string, string>>({})
  /** The last die, as an event with a counter, so a second four is a second throw. */
  const [rolled, setRolled] = useState<{ seat: string | null; face: number; at: number } | null>(
    null,
  )

  /** What this player was dealt, which nobody else is told. */
  const [secret, setSecret] = useState<string | null>(null)

  const [kills, setKills] = useState<{ mine: number; pending: number; refused: string | null }>({
    mine: 0,
    pending: 0,
    refused: null,
  })

  /**
   * The clock, when this level is one that can be raced.
   *
   * Null rather than `NO_RUN` for a level that is not, because those are two
   * different facts and the HUD renders them differently: a course you have not
   * started yet has a clock waiting for you, and a room has no clock at all.
   */
  const [run, setRun] = useState<Run | null>(null)

  /**
   * The score and the whistle, when the document is playing a mode.
   *
   * Null for `freestyle`, which is most documents and every one written before
   * the rules block existed. A world to be in is not a match with the scoring
   * turned down, and a zero in the corner of a room would say it was.
   */
  const [match, setMatch] = useState<Match | null>(null)

  /** Whole seconds until the player is back, when the document asks for a wait. */
  const [downFor, setDownFor] = useState<number | null>(null)

  /**
   * The body this client will be drawn as, in the words a renderer understands.
   *
   * `bodyOf` is the same answer the local body is drawn from, so what the room
   * sees of somebody and what they see of themselves cannot come apart - which
   * is the disagreement the note on `skin` below is about. A string, so the
   * network memo can depend on it without rebuilding a socket per render.
   */
  const skin = useMemo(
    () => (me ? bodyOf(xp, bodiesFor(xp, avatar, me.id), avatar, me.id).model : null),
    [xp, avatar, me],
  )

  /**
   * The transport, made once.
   *
   * In a memo rather than inline because building it opens a Supabase client,
   * and a new client per render is a new WebSocket per render.
   */
  const network = useMemo(
    () =>
      room && me
        ? realtimeNetwork({
            ...me,
            /**
             * And what this person is drawn as, which the roster carries and
             * nothing has ever filled in.
             *
             * `XpPlayer.skin` is read by the presence track a few lines into
             * `realtimeNetwork` and by every client reading the roster - so
             * without it here, everybody in the room was drawn with whatever
             * body the *reader* happened to be. Two people, one animal.
             *
             * Whenever there is one, rather than only for a level that says
             * `wears: profile`. That condition was the right instinct and the
             * wrong place for it: a document naming one body for everybody is a
             * decision about *bodies*, and it is already made where bodies are
             * chosen - `bodiesFor` resolves the level's own against the person's
             * and hands back the winner. Asking the question a second time here,
             * against a field this file happens to be able to read, is how the
             * two come to disagree - and when they did, the answer that lost was
             * always the person's.
             *
             * **The resolved model, not the profile's word for it.** `avatar` is
             * `penguin`, which is what a profile stores and what nothing can
             * draw: a peer feeds this straight to `modelUrl`, and that wants a
             * pack behind the name. Without one it answers the empty string, the
             * co-player's glTF fetch lands on the page's own HTML, and the whole
             * canvas goes down with *"Could not load : Unexpected token '<'"* -
             * so the room did not merely draw one animal, the first person to
             * arrive with a skin took everybody else's scene out. Found with two
             * browsers, where the second player's presence killed the first's.
             */
            ...(skin ? { skin } : {}),
          })
        : null,
    [room, me, skin],
  )

  /**
   * Who decides the things neither client may.
   *
   * Beside the network rather than folded into it because they answer different
   * questions - one is "tell everybody where I am", the other is "did that
   * count" - and because an instance is a *topic*: alone there is no room, so
   * there is nobody to be the authority of and this is null. See
   * docs/xp/server-authority.md §4.1.
   */
  const arbiter = useMemo(
    () => (room && me ? realtimeArbiter(room, xpId) : null),
    [room, me, xpId],
  )

  /**
   * Whether anybody in here may say anything, and in which of the two ways.
   *
   * Read through `talkOf` rather than off the document, because absent means
   * *on* for both and a reader testing the field would be a second copy of that
   * default. See `@kxb/xp`'s `./talk` for why absent is on.
   */
  const talk = useMemo(() => talkOf(xp), [xp])

  /**
   * The space's own conversation, when this level is standing in one.
   *
   * Three conditions and all of them are real:
   *
   * - **a conversation to belong to**, which the caller supplies or does not;
   * - **somebody to be**, because a line has an author and `postChatMessage`
   *   refuses an unsigned one anyway;
   * - **a document that allows it**. This is the only one the *level* decides,
   *   and it can only ever take away — a document saying `chat: true` in a space
   *   with chat switched off still gets nothing, because the switch it would be
   *   overruling is not the level's to overrule.
   *
   * Note what is *not* a condition: `room`. Emotes need one — a face with
   * nobody to see it is a face over your own head — and chat does not, because
   * the people it reaches are not necessarily in the level at all. Somebody
   * alone in a room can still say something to the space, and that asymmetry is
   * the clearest single statement of why chat is the host's and the emote is the
   * engine's.
   */
  /*
   * Keyed on the four strings rather than on the objects holding them, and this
   * is not tidiness. `conversation` and `me` are fresh objects on every render
   * of the parent page, so a memo depending on them rebuilds the host every
   * render - and the panel's subscription effect would then re-bind a handler
   * onto a channel that has already subscribed, which is the failure
   * `realtimeNetwork` has a paragraph about. The values are what identify a
   * conversation; the wrappers are not.
   */
  const slug = conversation?.slug
  const tenantId = conversation?.tenantId
  const conversationRoom = conversation?.roomId ?? null
  const myId = me?.id
  const chat = useMemo(
    () =>
      slug && tenantId && myId && talk.chat
        ? realtimeChat({ slug, tenantId, roomId: conversationRoom, me: myId })
        : null,
    [slug, tenantId, conversationRoom, myId, talk.chat],
  )

  /**
   * Somewhere to save, when there is a project to save against.
   *
   * `xpStore` answers null for anything that is not a saved project, so a
   * builtin document and the editor's preview both get no store without this
   * screen having to know which it is looking at. See ../_hosts/store.
   */
  const store = useMemo(() => xpStore(xpId), [xpId])

  /**
   * Where this player left off, once the store has answered.
   *
   * `undefined` while it is being asked and `null` when there is nothing to
   * resume, because the two are not the same: the body has to arrive somewhere,
   * and arriving at the spawn *because the answer had not come back yet* is the
   * bug this distinction exists to prevent. `Running` is not mounted until this
   * is settled.
   *
   * A race and a match never ask - `resumes` reads that off the document, so a
   * course with a start and a finish begins at the start for everybody, and two
   * sides of a match begin together rather than wherever each of them stopped.
   */
  const [found, setFound] = useState<XpProgress | null | undefined>(undefined)

  /**
   * What the host could not do, for the person it happened to.
   *
   * Beside `broken` rather than in it: that list is scripts the level's author
   * wrote and can fix, and these are ours failing to keep a promise the level
   * made. §7.8 asks for both to be visible in play and for neither to be said
   * only through `log`, which the author reads and the player never sees.
   */
  const [troubles, setTroubles] = useState<string[]>([])

  /**
   * Whether there is anything to ask, decided during the render rather than in
   * the effect below.
   *
   * The effect used to answer this by writing `null` synchronously, which is a
   * state update React can see coming and this repo's lint refuses outright. It
   * is also the wrong shape: "this level does not resume" is a fact about the
   * document and the host, both of which are in hand here.
   */
  const wanted = store !== null && resumes(rulesOf(xp), xp.capabilities)
  const resumeAt = wanted ? found : null

  useEffect(() => {
    if (!wanted || !store) return

    let live = true
    void store
      .get(PROGRESS_KEY)
      .then((value) => {
        if (live) setFound(readProgress(value))
      })
      .catch((reason: unknown) => {
        /**
         * A store that will not answer starts you at the spawn, and says so.
         *
         * Not a refusal: the level is playable, and refusing to open it because
         * a save could not be read would be losing an afternoon's play to a bad
         * minute of network. But it is not silent either - somebody who has
         * been here before is about to be somewhere they did not expect.
         */
        if (!live) return
        setTroubles((seen) => [...seen, xpDict(locale).scene.troubles.checkpointUnread])
        setFound(null)
      })

    return () => {
      live = false
    }
  }, [store, wanted, locale])

  /**
   * A checkpoint, kept past this session.
   *
   * Written straight through rather than batched: a save point exists to be
   * there after something goes wrong, and the thing most likely to go wrong is
   * the tab closing.
   */
  /**
   * What this level keeps, while it is being played.
   *
   * docs/xp/backlog.md §7c. Built from the declared defaults on every document
   * that has a block, **whether or not anything can persist it**: a builtin
   * under `public/xp/xps/` has no row to store against and its rules should
   * still work, counting up a number that is gone tomorrow. A level that cannot
   * work that way says `needs: persistence` and is refused at the door.
   *
   * A ref rather than state, like everything else the frame loop touches: rules
   * write into it sixty times a second and nothing on screen re-renders because
   * a coin moved.
   */
  /**
   * What a press would act on, and the level's own numbers.
   *
   * State rather than refs, unlike everything else the frame loop touches,
   * because both are *reported on change* by ./simulation rather than every
   * frame - a die roll and a cursor moving from one field to the next are a
   * handful of updates a turn, not sixty a second.
   */
  /**
   * Everybody in the room, reported up by ./simulation.
   *
   * The scene cannot derive a side without it, and `assign: 'order'` is exactly
   * the case where that matters: the camera stands where *your* seat is, and the
   * seat is not knowable until the room has arrived. Without this the whole
   * per-seat feature was dead in a real session and alive in every unit test,
   * which is what the end-to-end spec was written to catch and did.
   */
  const [roster, setRoster] = useState<readonly string[]>([])

  /**
   * Kept here *and* passed on, in that order.
   *
   * The scene needs the room to place a seat; the host above needs it to work
   * out who has stopped being in it. One callback for both, because a second
   * `onRoster` threaded past this one would be the same list arriving twice by
   * two routes - which is how two parts of a screen come to disagree about who
   * is present.
   */
  const keepRoster = useCallback(
    (ids: readonly string[]) => {
      setRoster(ids)
      onRoster?.(ids)
    },
    [onRoster],
  )

  const [phase, setPhase] = useState<string | null>(null)
  /**
   * The actions this player can take right now, with the key that performs each.
   *
   * From `allowedIn` and the document's own bindings, which is the same pair the
   * dispatch consults - so a button exists exactly when the key it names would
   * do something, and a phase that takes a key away takes its button with it in
   * the same frame.
   *
   * The role's half of `allowedFor` is deliberately not applied: a dealt role is
   * a secret, and narrowing the *visible* controls by one would tell everybody
   * watching your screen what you were dealt. A level with a deck refuses the
   * press instead.
   */
  const canDo = useMemo(() => {
    const inPhase = phase && here.flow ? here.flow.phases[phase] : undefined
    /**
     * A `who: 'turn'` phase takes its buttons with it when it is somebody
     * else's go. Unlike the role half above, this hides nothing secret -
     * whose turn it is is on the scoreboard - and the buttons coming back
     * when the turn does is exactly the "your go" signal a table wants.
     * While nobody holds the turn the gate stays open, same as the dispatch.
     */
    const waiting =
      inPhase?.who === 'turn' &&
      turn !== null &&
      !standings.some((row) => row.mine && row.id === turn)
    if (waiting) return []
    const bound = here.player?.keys ?? []
    const allowed = new Set(allowedIn(inPhase, bound.map((one) => one.does)))
    const seen = new Set<string>()
    return bound.flatMap((binding) => {
      const does = binding.does?.trim()
      if (!does || seen.has(does) || !allowed.has(does)) return []
      seen.add(does)
      return [{ does, label: keyLabel(binding.key), code: binding.key }]
    })
  }, [here, phase, turn, standings])

  /** Whether the document's own `flow.wins` has held. See `Hud`'s `won`. */
  const [won, setWon] = useState(false)
  const [aim, setAim] = useState<Aim | null>(null)
  const [tally, setTally] = useState<readonly { label: string; value: number }[]>([])

  const fields = useMemo(() => dataOf(xp), [xp])
  const live = useRef<Map<string, number>>(openingValues(fields))
  /** The last value written to the store, per field. See `changed`. */
  const written = useRef<Map<string, number>>(new Map())

  /**
   * Rebuilt when the document changes, because a door into another level is a
   * different model — and carrying `coins` into a level that never declared it
   * would be a field a rule cannot name and the store has nowhere to put.
   */
  useEffect(() => {
    live.current = openingValues(fields)
    written.current = new Map()
  }, [fields])

  /**
   * Read back what this player already had, once, at open.
   *
   * Every declared field rather than lazily on first use: a lazy read puts a
   * round trip inside a frame, and the first `coins >= 10` of a session would
   * answer against a default that had not been filled in yet.
   *
   * A field that fails to read keeps its default and says so once — the same
   * treatment the checkpoint gets, and for the same reason: the level is
   * playable, and refusing to open it because a number could not be fetched
   * loses an afternoon to a bad minute of network.
   */
  useEffect(() => {
    if (!store) return

    let alive = true
    for (const { name, key } of plannedReads(fields)) {
      void store
        .get(key)
        .then((stored) => {
          if (!alive) return
          const value = readBack(stored, live.current.get(name) ?? 0)
          live.current.set(name, value)
          written.current.set(name, value)
        })
        .catch(() => {
          if (!alive) return
          setTroubles((seen) => [...seen, `could not read "${name}" — it starts where the level says`])
        })
    }

    return () => {
      alive = false
    }
  }, [store, fields])

  /**
   * Write back what moved, no more often than the level can be read.
   *
   * An interval rather than a write per change, because a rule may add to a
   * field every frame — a score that ticks while you stand on something — and
   * that is sixty round trips a second per field. §3.3 is last-write-wins per
   * row, so coalescing lands the same value; what the wait costs is only how
   * much is lost if the tab dies mid-second, which is what the flush below is
   * for.
   */
  useEffect(() => {
    if (!store) return

    const flush = () => {
      // `changed` says what moved; `persisted` says what there is anywhere to
      // put. A `run` field is neither read nor written - see `persists` - so a
      // match's own counters never reach the store and never come back stale.
      for (const name of persisted(changed(live.current, written.current), fields)) {
        const field = fields[name]
        if (!field) continue
        const value = live.current.get(name)!
        // Latched only after the write lands, like the checkpoint: a `get` after
        // a failed `put` should read what is stored, not what somebody hoped.
        void store
          .put(storeKeyOf(name, field), value)
          .then(() => written.current.set(name, value))
          .catch((reason: unknown) => {
            const words = xpDict(locale).scene.troubles
            setTroubles((seen) => [
              ...seen,
              // Matched on the host's own refusal, which is a protocol string
              // rather than something anybody reads - see ./_hosts.
              String(reason).includes('needs an account')
                ? words.dataNeedsAccount
                : fill(words.dataLost, { name }),
            ])
          })
      }
    }

    /**
     * And the other half: what everybody else changed.
     *
     * `space` says "the space, together - anybody here can change it", and until
     * this the promise was half kept. A client wrote its own changes and read
     * nobody else's after the single read at open, so every client was
     * authoritative about a value they all shared and the last one to flush won
     * an argument nobody knew was happening. At a table it was plainer than
     * that: only the player who rolled could see the die.
     *
     * Beside the write and on the same cadence, because they are one mechanism
     * - a store that is written on a timer and read once is not shared state,
     * it is a backup.
     *
     * **A local change always wins over what is stored.** `adoptable` is the
     * whole guard: a field whose live value has moved since it was last written
     * is this client's own unflushed change, and adopting the row over it would
     * undo somebody's roll a second after they made it.
     */
    const pull = async () => {
      for (const { name, key } of shareable(fields)) {
        if (!adoptable(name, live.current, written.current)) continue
        const stored = await store.get(key).catch(() => undefined)
        if (stored === undefined) continue
        const value = readBack(stored, live.current.get(name) ?? fields[name].value)
        // Checked again after the await: a roll can land while the row is in
        // flight, and the answer to the older question must not overwrite it.
        if (!adoptable(name, live.current, written.current)) continue
        live.current.set(name, value)
        written.current.set(name, value)
      }
    }

    const pulling = setInterval(() => void pull(), WRITE_EVERY_SECONDS * 1000)
    const timer = setInterval(flush, WRITE_EVERY_SECONDS * 1000)
    // The tab closing is how most sessions end, and `pagehide` is the one that
    // fires on a phone — the same choice `local.ts` and `PlaySession` make.
    window.addEventListener('pagehide', flush)

    return () => {
      clearInterval(timer)
      clearInterval(pulling)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [store, fields, locale])

  /**
   * A finished run, kept past this session.
   *
   * The first caller of `append` (`20261030000000_xp_streams.sql`), and it sits
   * here rather than in ./simulation for two reasons: this is where the store
   * is, and `onRun` already reports a finish on the exact frame it happened with
   * the exact time `stepRun` computed. The throttle above it costs a stale
   * readout mid-run and costs the recorded number nothing.
   *
   * Nothing is shown as recorded, because nothing here is shown at all — the
   * time on the HUD is the client's own clock and is true whether or not the
   * write lands. That is the honest version of §9's rule rather than a way
   * around it: there is no pending state to be wrong about.
   */
  const recorded = useRef(0)
  const keepRun = useCallback(
    (next: Run) => {
      setRun(next)

      // A counter rather than a phase check, for the reason `Run.finishes` is
      // one: two runs with an identical time are two results.
      if (next.finishes <= recorded.current) return
      recorded.current = next.finishes

      // `append` is optional on the port, and absent is the ordinary case — a
      // builtin document has no row to hang a stream on.
      const record = store?.append ? raceRecord(next) : null
      if (!record || !store?.append) return

      void store.append(RACE_STREAM, record.type, record.data).catch((reason: unknown) => {
        /**
         * The same corner the checkpoint uses, and the same argument.
         *
         * §7.8: a result the level said it would keep and then did not is the
         * confidence this feature trades in, quietly spent. The ceiling is the
         * one refusal an author can act on, so it is passed through in the
         * database's own words rather than flattened into "not recorded".
         */
        const words = xpDict(locale).scene.troubles
        setTroubles((seen) => [
          ...seen,
          String(reason).includes('needs an account')
            ? words.finishNeedsAccount
            : String(reason).includes('as much as it may')
              ? // The database's own sentence, passed through. It is the one
                // refusal an author can act on, and it is not ours to reword.
                String(reason)
              : words.finishLost,
        ])
      })
    },
    // `locale` because the trouble these write is worded in it. It is a
    // two-letter string off the shell that changes on a reload, so naming it
    // costs a re-created callback nobody will ever observe.
    [store, locale],
  )

  const keepProgress = useCallback(
    (progress: { at: XpProgress['at']; order?: number }) => {
      if (!store) return
      void store.put(PROGRESS_KEY, progress).catch((reason: unknown) => {
        /**
         * Said to the player, in the corner they are already looking at.
         *
         * §7.8: the author gets `log` and the player gets nothing, so a
         * checkpoint announced in play and then not stored is exactly the
         * confidence this feature trades in, quietly spent. Not on the script
         * failure list beside it — this is the host failing to do what the
         * level asked, and an author sent to read their scripts about somebody
         * else's network is an author looking in the wrong place.
         */
        const words = xpDict(locale).scene.troubles
        setTroubles((seen) => [
          ...seen,
          String(reason).includes('needs an account')
            ? words.progressNeedsAccount
            : words.progressLost,
        ])
      })
    },
    // `locale` because the trouble these write is worded in it. It is a
    // two-letter string off the shell that changes on a reload, so naming it
    // costs a re-created callback nobody will ever observe.
    [store, locale],
  )

  /**
   * First person, or a camera behind the body.
   *
   * A view rather than a mode - nothing about the level or the controller
   * changes - so it is one key and no ceremony. `V`, because `C` is crouch
   * everywhere and this will want it.
   *
   * **Third by default**, at the user's request, and the reason it is the right
   * default now and was not before: there is a body to see. The dummy is
   * skinned and its legs move at the speed it does, so a chase camera shows a
   * character rather than a T-posed prop sliding around. It also makes the
   * thing this creator is mostly used to build - a platformer - playable,
   * because judging a jump onto a ledge from inside your own head is guessing
   * at where your feet are.
   */
  /**
   * Third person by default, and first when the level hands you a gun -
   * unless the document says otherwise.
   *
   * Not a preference and not a coin toss: a weapon is aimed down a crosshair,
   * and the crosshair is in the middle of the screen because that is where the
   * shot goes. In third person the camera sits four metres behind the body, so
   * the thing you are aiming with is off to one side of the thing you are
   * aiming at - which is playable, and is not what anybody who has played a
   * shooter expects to have to do.
   *
   * That guess held until a melee weapon existed. A bat is not aimed down
   * anything, so the crosshair argument does not apply, and first person hides
   * exactly the thing worth seeing - the swing landing on somebody. `capture`
   * is the document that first needed to say "arm me, but open in third" -
   * which `player.view` is for. Absent still falls back to the guess above, so
   * every document written before this field existed opens exactly as it did.
   *
   * `V` still switches at any time, in any document - this only changes where
   * a level *opens*.
   */
  const [view, setView] = useState<'first' | 'third'>(
    xp.player.view ?? (xp.player.weapon ? 'first' : 'third'),
  )
  /**
   * What the keys are, on `H`.
   *
   * `H` because that is where the lounge put it, and somebody who has played one
   * world of this product should not have to learn a second answer. The panel
   * itself is generated from `player.keys` in ./controls, so it cannot promise
   * an action this document did not bind.
   */
  const [showControls, setShowControls] = useState(false)
  /**
   * The faces, on `Z`.
   *
   * `Z` for the reason `H` is `H` and `G` is dance: it is where the lounge
   * already put it, and somebody who has played one world of this product
   * should not have to learn a second answer to the same question.
   *
   * **In `RESERVED_KEYS` now**, along with `V`, `H`, `B` and chat's `Enter`.
   * That list used to hold only what a *body* does — movement, jump, dance — so
   * a document could bind `KeyZ` and shadow this, and both handlers would fire
   * on the one press. The format now refuses all five under a second sentence
   * (`whyReserved`), because the reason they are taken is different: a body key
   * is never coming back, and a chrome key is a panel the player can open.
   */
  const [showEmotes, setShowEmotes] = useState(false)
  /**
   * The chat box, on `Enter`.
   *
   * Enter rather than a letter, because it is where every game with a chat box
   * in it has put one, and because it is the key already under the finger of
   * somebody about to send. The panel itself draws whether or not this is true —
   * lines arriving while you play are the whole feature — and what this opens is
   * only the box. See ./chat-panel for why a box you have to open is the right
   * shape here and the wrong one for the rail.
   */
  const [showChat, setShowChat] = useState(false)
  /**
   * The last face picked, with a counter so the same one twice is two events.
   *
   * The same shape `announce` uses for a door, and for the same reason: an
   * emote is something that *happened*, and a bare id would make throwing the
   * same face twice a value that did not change.
   */
  const [emote, setEmote] = useState<{ id: EmoteId; at: number } | null>(null)
  const pullFace = useCallback((id: EmoteId) => {
    setEmote((previous) => ({ id, at: (previous?.at ?? 0) + 1 }))
  }, [])

  /**
   * Whether the chat box exists to be opened.
   *
   * A boolean in the key effect's dependencies rather than a ref read during
   * render, which lint refuses outright and is right to. It costs a rebind of
   * one `window` listener on the rare render where this flips - the host is
   * memoised on four strings - and buys a handler that cannot be looking at a
   * stale answer.
   */
  const canChat = chat !== null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /**
       * Not while somebody is typing somewhere else.
       *
       * The chat box stops its own keystrokes (see ./chat-panel), so this is
       * about every *other* field on the page - the match room's chrome, the
       * editor around a preview. A level whose `V` toggled the camera while
       * somebody renamed a battle would be a level blamed for it.
       */
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement)
      ) {
        return
      }

      /**
       * Enter opens the box, and only ever opens it.
       *
       * Closing is Escape's, and the box's own Enter sends. A toggle here would
       * mean the press that sends a message also re-opens the box behind it,
       * because the send closes and this would immediately undo that.
       */
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        if (!canChat) return
        event.preventDefault()
        // Same courtesy the picker gets: a text field is unusable while the
        // pointer is locked to the canvas, so opening gives the pointer back.
        if (document.pointerLockElement) document.exitPointerLock()
        setShowChat(true)
        return
      }
      if (event.code === 'KeyV') {
        setView((current) => (current === 'first' ? 'third' : 'first'))
        return
      }
      if (event.code === 'KeyZ') {
        setShowEmotes((current) => {
          /*
           * The same courtesy the lounge's picker extends: a grid you have to
           * click is unusable while the pointer is locked to the canvas, so
           * opening it gives the pointer back. Closing it does not re-lock -
           * clicking the level does, which is the one instruction the HUD
           * already gives.
           */
          if (!current && document.pointerLockElement) document.exitPointerLock()
          return !current
        })
        return
      }
      /**
       * Toggled, not opened.
       *
       * `H` while it is up must close it, or the only way out is Esc - which on
       * a locked pointer is also how you leave the level, so somebody looking up
       * the keys would find themselves back on the page they came from.
       */
      if (event.code === 'KeyH') setShowControls((current) => !current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canChat])


  /**
   * Walking through a door into another level.
   *
   * The whole swap is here rather than spread between the effect and the
   * fetch, for the reason `load` itself gives: the entity world is the thing
   * being discarded, so a half-applied level change is a state nobody can
   * observe and everybody has to reason about.
   *
   * **The trust decision is not made here.** `planLoad` asks `resolveScene`,
   * which owns it - see the note on that function. This file only acts on the
   * answer, so there is exactly one place that decides whether a door needs
   * permission.
   */
  const [loadingXp, setLoadingXp] = useState(false)
  /**
   * A door to somebody else's level, waiting to be allowed.
   *
   * Held rather than fetched, because that is the entire point of asking: the
   * request must not leave until the answer is yes. Fetching and then asking
   * would have told a stranger's server where somebody is standing before
   * anybody agreed to it.
   */
  const [asking, setAsking] = useState<{ target: string; url: string } | null>(null)

  const say = useCallback(
    (text: string) => setSaid((previous) => [...previous, { id: Date.now(), text }].slice(-LOG_LINES)),
    [],
  )

  const openDoor = useCallback(
    async (target: string, url: string) => {
      setLoadingXp(true)
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`the level did not answer (${response.status})`)
        const parsed = parseXp(await response.json())
        if (!parsed.ok) {
          /**
           * Refused rather than half-loaded. A document that does not parse is
           * one this runtime has no rules for, and dropping into it would be a
           * level that is subtly wrong rather than one that did not open.
           */
          throw new Error(`that level will not parse: ${describeProblems(parsed.problems)}`)
        }
        setXp(parsed.document)
        /**
         * And into its front room, which is the first thing `enter` has ever
         * done.
         *
         * Two bugs in one line if it is left out, and the second is the nastier.
         * A document whose `enter` names a scene would open on the root's world
         * regardless - the field was parsed and read by nobody. And walking
         * from a back room in one level into another level would keep the *old*
         * room's name: the world on screen would fall back to the new
         * document's root while the topic still said `/cellar`, so two people
         * who came through the same door could end up on two topics, both
         * looking at the same place.
         */
        setWhere(enterOf(parsed.document))
      } catch (problem) {
        /**
         * On the screen, not in a console.
         *
         * A door that does nothing is indistinguishable from a door somebody
         * built wrong, and this runtime has been bitten twice by errors that
         * only reached a console - see the note on `broken` above.
         */
        setBroken([`could not open ${target}: ${problem instanceof Error ? problem.message : String(problem)}`])
      } finally {
        setLoadingXp(false)
      }
    },
    [],
  )

  /**
   * Which level the room is on, as far as this client knows.
   *
   * The room's claim rather than this client's history: it moves when we walk
   * through a door *and* when we adopt somebody else's, so the counter on it is
   * "how many doors this room has been through" rather than "how many I have".
   * That is what makes two claims comparable at all - see ../_hosts/room-scene.
   */
  const [claim, setClaim] = useState<SceneClaim | null>(null)

  /**
   * A door this client went through, waiting to be told to the room.
   *
   * Separate from `claim` above, and it has to be: `claim` also moves when we
   * *adopt* somebody else's door, and announcing that would send their claim
   * back to them. In a room of five that is an echo that grows with the size of
   * the room, which is the failure the `tell` parameter below already exists to
   * prevent at the other end.
   */
  const [announce, setAnnounce] = useState<SceneClaim | undefined>(undefined)

  /**
   * Opening a door, whether it was ours or somebody else's.
   *
   * `tell` is the whole difference between the two, and it is a parameter
   * rather than two functions because everything else has to be identical: a
   * door somebody else went through is planned, prompted and fetched by exactly
   * the same rules as one this client opened. What must not happen is a client
   * announcing a door it only heard about, which is an echo that grows with the
   * size of the room.
   */
  const openNamed = useCallback(
    (name: string, names: 'either' | 'scene', tell: boolean) => {
      const plan = planLoad({
        name,
        names,
        scenes: xp.scenes,
        currentId: xp.id,
        standing: where,
        busy: loadingXp || asking !== null,
      })
      /**
       * Decided before the switch, not after it.
       *
       * A door that turned out to be closed, or one back into the level we are
       * already in, is not something the room needs to hear about - a client
       * that announced every attempt would move everybody else through doors
       * that did nothing here. Read up front because the switch below returns
       * from most of its branches, which leaves nothing to ask afterwards.
       */
      const worthTelling = tell && worthAnnouncing(plan)
      if (worthTelling) {
        /**
         * Counted from the *room's* claim, not from our own last announcement.
         *
         * Two clients that each counted their own doors would both reach 1 on
         * their first, and a room where every claim is 1 has no ordering at all
         * - the tie-break would decide every door rather than only the
         * simultaneous ones.
         */
        const next = claimFor(claim, name)
        setClaim(next)
        setAnnounce(next)
      }
      switch (plan.kind) {
        case 'closed':
          // Said out loud: an author may name a scene before writing it, so this
          // is a door that does not open yet rather than a fault - but a door
          // that does nothing and says nothing is one nobody can debug.
          say(`${name} does not go anywhere yet`)
          return
        case 'here':
        case 'busy':
          return
        case 'ask':
          setAsking({ target: plan.target, url: plan.url })
          return
        case 'scene':
          /**
           * A room in the document already open: nothing is fetched, nothing is
           * asked, and the world on screen is swapped for another one this
           * machine already has.
           *
           * It is still an announcement, and that is the point of putting it
           * through the same function as a door out. The scene is in the topic
           * (`sceneTopic`), so a client that changed room without saying so has
           * left the topic everybody else is on - and the room is two rooms
           * with nothing on either screen to say why.
           */
          setWhere(plan.name)
          return
        case 'go':
          void openDoor(plan.target, plan.url)
      }
    },
    [xp.scenes, xp.id, where, loadingXp, asking, openDoor, say],
  )

  /** The verb fired here, so the room is told. */
  const onLoad = useCallback(
    (name: string, names: 'either' | 'scene') => openNamed(name, names, true),
    [openNamed],
  )
  /**
   * Somebody else's door. Followed on the same rules, and not repeated.
   *
   * The payload is checked here rather than at the socket, because whether to
   * *act* on it is the same question as which of two claims wins - and both
   * answers come out of one call. `changed` is what stops a greeting from
   * somebody who just joined turning into a reload of the level we are already
   * standing in, which in a busy room would be a loading screen every time
   * anybody arrived.
   */
  const onSwap = useCallback(
    (payload: unknown) => {
      const result = adopt(claim, payload)
      if (!result || !result.changed) return
      setClaim(result.claim)
      /**
       * `either`, and it is the only value a claim can be followed with.
       *
       * A claim carries the name and not which kind of door produced it, so
       * this cannot say `scene` - and it must not, because the same broadcast
       * carries doors *out* of the document, which have to be fetched. Every
       * client resolves the name against its own copy of the same document, so
       * one that resolved to a room here resolves to a room there too, which is
       * what makes the weaker answer the right one rather than merely a
       * tolerable one.
       */
      openNamed(result.claim.scene, 'either', false)
    },
    [claim, openNamed],
  )

  /**
   * The room, which is not the room of the level you are standing in.
   *
   * Doors go here rather than through `Together`, and the reason is the
   * *greeting* rather than the send: somebody who joins arrives in `enter`,
   * which once the room has moved is the one topic nobody is on - so a repair
   * sent on the scene's topic would never reach the person who needs it. See
   * ./room-link, which is where the whole argument for two topics is written.
   */
  useRoomLink({
    network,
    ...(room ? { room } : {}),
    ...(me ? { me } : {}),
    ...(announce ? { announce } : {}),
    greet: greeting(claim),
    onSwap,
  })

  /**
   * The sandbox, loaded once the wasm arrives.
   *
   * Asynchronous, and the level does not wait for it: an XP with no scripts
   * should not stall on an interpreter it will never call, and one with scripts
   * is better off walkable for a beat than black. `open` is synchronous once the
   * module is here, which is why the async half is the app's problem and not the
   * engine's.
   */
  useEffect(() => {
    let live = true
    let opened: Scripts | null = null

    /**
     * A load that never finishes has to say so.
     *
     * Reported as *"the scripts stay in a loading state and they don't run"*,
     * and the readout was telling the literal truth: `scripts` is null until
     * the wasm arrives, and "loading" is what null means. What it could not say
     * is the difference between *slow* and *never* - and never is a real
     * outcome, because the interpreter is a chunk fetched over a network that
     * can stall without rejecting.
     *
     * So the wait has an end - three minutes, and it was ten seconds until a
     * level on dev said "the interpreter did not load" over a network where
     * nothing had failed at all. Every request on that page came back 200; the
     * interpreter's chunk was simply queued behind three hundred picker
     * thumbnails and a handful of prefetches, each taking four seconds. Ten
     * seconds was a verdict on the connection, delivered as a verdict on the
     * engine.
     *
     * A load that genuinely fails *rejects*, and the `catch` below has always
     * reported that with the reason attached. So this timer only ever fires for
     * slow - which is why it can afford to be this patient, and why being
     * impatient was worse than useless: it was wrong every time it spoke.
     * Three minutes is past the end of any load that is still coming and well
     * inside the time somebody would spend wondering why the turret is still.
     *
     * What it produces is the same `broken` list a script that will not compile
     * produces, which is the one place on the HUD an author is already looking.
     *
     * This is the lesson from the two the lounge learned - a race result
     * silently lost, a mode error drawn inside a panel that closes at kickoff -
     * applied to the state *before* the error: silence and success must not
     * look the same.
     */
    const slow = setTimeout(() => {
      if (!live || opened) return
      setBroken((was) =>
        was.length > 0
          ? was
          : [
              xpDict(locale).scene.troubles.interpreter,
            ],
      )
    }, 180_000)

    scriptEngine()
      .then((engine) => {
        if (!live) return
        /**
         * The room's topic is the seed, because it is the one string every
         * client in this instance already has and agrees about - so `world.roll`
         * gives everybody the same dice without a round trip to agree on a
         * number. Alone, there is no room, and the engine falls back to the
         * document's own id: a level played solo rolls the same game twice,
         * which is what a screenshot and a bug report both want.
         */
        const result = engine.open(here, {
          ...(room ? { seed: seedFrom(room) } : {}),
          /**
           * Which language `t` answers in, inside this level's scripts.
           *
           * The *reader's*, not the room's, and that asymmetry is deliberate -
           * see `@kxb/xp/words`. The seed above has to be the same number on
           * every client or they roll different dice; this has to be different
           * on every client or two people in one room read the same language.
           */
          locale,
        })
        if (!result.ok) {
          setBroken(result.problems.map((problem) => `${problem.at}: ${problem.message}`))
          return
        }
        opened = result.scripts
        clearTimeout(slow)
        // A late arrival takes the warning back with it: "it did not load" is
        // a statement about now, and leaving it up next to a running level is
        // the same silent disagreement in the other direction.
        // Matched against the sentence itself rather than a prefix of the
        // English: the warning is written in the reader's language, so
        // `startsWith('scripts: the interpreter')` stopped taking it back the
        // day this file learned German.
        setBroken((was) => was.filter((line) => line !== xpDict(locale).scene.troubles.interpreter))
        setScripts(result.scripts)
      })
      .catch((reason: unknown) => {
        if (live) setBroken([`scripts could not load: ${String(reason)}`])
      })

    return () => {
      live = false
      clearTimeout(slow)
      opened?.close()
      setScripts(null)
    }
    /*
     * `locale` reopens the interpreter, which is right rather than wasteful: it
     * is what `t` answers in, it is fixed for the life of a context, and it
     * changes on a reload. A level whose scripts kept answering in the language
     * the tab was opened in would be the quieter wrong.
     */
  }, [here, room, locale])

  /**
   * Where the bottom of the world is, and what it means.
   *
   * Two different things through one number, and the document chooses:
   *
   * - **`world.ground` on** - solid ground at `floorY`, everywhere. The thing
   *   every other engine gives you for nothing: somewhere to stand while the
   *   level is still half built. The controller's floor clamp *is* a solid
   *   plane, so this is the same code path rather than a second kind of surface.
   * - **off** - forty cells down, as a catch. An author leaves a hole in a floor
   *   long before they mean to, and the difference between falling through it
   *   onto something you can walk back from and falling forever is the
   *   difference between a bug you can see and a bug you reload to escape.
   *
   * Off is the default, and it is the honest one for a level made of pieces: a
   * floor you laid is a floor you can see, and an invisible one under the whole
   * world hides the hole you left.
   */
  const catchFloor = here.world.ground ? here.world.floorY : here.world.floorY - 40

  /**
   * What the world is painted on, and the fog that meets it.
   *
   * Absent is transparent - the canvas is not cleared and the page shows
   * through, which is what the lounge does. The fog is *always* drawn and always
   * in the same colour as whatever is behind it, because that is the pairing
   * that makes distance dissolve rather than end: fog in a different colour from
   * the background draws a visible ring where the far plane is, and a level with
   * no fog at all ends on a hard edge in mid-air.
   */
  const background = here.world.background
  const haze = background ?? SKY

  /**
   * Where the world is watched from.
   *
   * Read once here rather than in the three places that want it, and passed
   * down, because it decides the *kind* of camera the Canvas builds - and that
   * is not something a component underneath can change afterwards. See
   * `_runtime/camera.ts`: the block is an input mode that happens to also move
   * the camera.
   */
  /**
   * Which side this player is on, up here as well as in ./simulation.
   *
   * It was only down there, where it decides which spawn mark you arrive at.
   * The camera needs the same answer and cannot ask for it later: `shot.kind`
   * decides which camera the Canvas *builds*, so it is read before anything
   * inside the Canvas exists.
   *
   * Two calls rather than one passed down, and that is safe for the reason
   * ./teams is built the way it is: `sideOf` is a pure function of the marks,
   * the id and the rules, so two callers holding the same three things cannot
   * disagree. A prop would be the same value arriving a render later.
   */
  const side = useMemo(
    () =>
      sideOf(
        xp.world.marks,
        { ...(me ? { id: me.id } : {}), ...(team ? { given: team } : {}), roster },
        rulesOf(xp),
      ),
    [xp, me, team, roster],
  )

  /**
   * Where the world is watched from - and, at a table, from *your own chair*.
   *
   * `cameraFor` is the whole of that: a `fixed` camera carrying `seats` stands
   * where your side's seat is and is otherwise the document's own shot. A level
   * with no seats, or a player on no side, gets exactly what it got before.
   */
  const shot = cameraFor(cameraOf(xp), side)

  /**
   * How wide the lens is and how far it sees.
   *
   * Read here beside `shot` and for the same reason: R3F builds the camera once
   * from these, so they are not something a component underneath can change
   * afterwards. A document that changes them gets a remount, which the editor
   * already does when it reloads a parsed document.
   */
  const lens = lensSettings(shot)

  /**
   * The controls a thumb can reach, when the device has one.
   *
   * The ref is owned here because it spans the two halves: written by the
   * controls, which are ordinary DOM outside the Canvas, and read by the
   * controller, which is inside it. A ref is what lets a thumb move dozens of
   * times a second without re-rendering a tree full of instanced meshes.
   */
  const isTouch = useIsTouch(forceTouch)
  /**
   * Which thumb steers, and whether anybody has said.
   *
   * `hand` is what the corners here are mirrored on; `chosen` is what puts the
   * question in front of somebody who has never been asked. The store is shared
   * with the lounge, so the answer given in either place is the answer in both -
   * see the note at the top of ./hand-gate for why that is the one piece of this
   * the copy rule does not ask for a copy of.
   */
  const { hand, chosen } = useHand()
  /**
   * A handle on the controls' own buffer, filled when they mount.
   *
   * Null until then, which the controller handles by simply having no thumb -
   * the same state a desktop is in forever.
   */
  const touch = useRef<Touch | null>(null)
  /**
   * Which of the level's actions have a rule for letting go of them.
   *
   * Read here rather than inside the controls so the two devices ask the same
   * question of the same document - the keyboard's buffer in ./simulation is
   * built from this too. See `pressBuffer`'s `latching` for what a wrong answer
   * costs, which on a phone is a button that works on every second tap.
   */
  const letsGo = useMemo(() => releasedKeys(xp), [xp])

  /**
   * The renderer, kept so the headset button can hand it a session.
   *
   * three has WebXR built into `WebGLRenderer` - `gl.xr` - so entering VR needs
   * no extra package. What it does need is the renderer itself, which only
   * exists inside the Canvas, so it is caught on creation rather than reached
   * for from outside.
   */
  const gl = useRef<{ xr: { enabled: boolean; setSession(session: unknown): Promise<void> } } | null>(
    null,
  )

  /**
   * Whether a headset is attached, asked once.
   *
   * The button does not exist until the answer is yes - which is the whole of
   * what was asked for, and the right shape: an "Enter VR" that is always
   * visible and fails on a laptop is worse than one that is simply not there.
   */
  const [headset, setHeadset] = useState(false)
  useEffect(() => {
    let live = true
    void headsetAvailable().then((yes) => {
      if (live) setHeadset(yes)
    })
    return () => {
      live = false
    }
  }, [])
  const holdTouch = useCallback((buffer: Touch) => {
    touch.current = buffer
  }, [])

  /**
   * A handle on the dash's own wait, filled when the simulation mounts.
   *
   * The same shape as `touch` above and pointing the other way: that one is
   * written outside the Canvas and read inside it, and this one is written inside
   * and read out here by two buttons - the chip on the HUD and the circle under a
   * thumb. Neither the scene nor either button ever writes it, which is the whole
   * of ./cooling's argument: a ring that decided for itself when the wait was
   * over would sooner or later say ready over a press the frame loop refuses.
   */
  const cooling = useRef<Cooling | null>(null)
  const holdCooling = useCallback((buffer: Cooling) => {
    cooling.current = buffer
  }, [])

  /**
   * What this screen can actually offer, against what the document asked for.
   *
   * `backend.needs` refuses and `backend.wants` degrades - the split
   * `@kxb/xp/host` has described since it was written, and the reason a level
   * with an optional leaderboard still opens on a host that has no database.
   *
   * Computed from what is in hand rather than from a host object, because this
   * screen composes ports one at a time: `me` is the identity, `room` is the
   * channel and the arbiter's instance both, and there is no persistence here
   * at all yet - `xpStore` is wired into `realtimeHost`, which nothing mounts.
   * Saying so honestly is the point: a document that needs a store is refused
   * here rather than opening and losing what it writes.
   *
   * Nothing declares `backend` today, so this refuses nothing today. That is
   * the right time to add it - the alternative is discovering the check is
   * missing from the first level that needed it.
   */
  const offered: HostCapability[] = [
    ...(me ? (['identity'] as const) : []),
    ...(room ? (['network', 'arbiter'] as const) : []),
    ...(store ? (['persistence'] as const) : []),
  ]
  const missing = unsupported(xp.backend?.needs, offered)

  if (missing.length > 0) {
    return <Unplayable name={translator(xp.words, locale)(xp.name)} missing={missing} />
  }

  return (
    /* `playing` stops a drag across the level painting the HUD blue - see
       globals.css. On the scene rather than the page, so whatever is around it
       keeps its own selectable text: in a match that is the rail, and in the
       editor it is every panel this preview sits beside. */
    <div className="playing relative h-full w-full">
      {/*
        The lounge's own framing, copied rather than imported (AGENTS.md).

        Rounded and clipped rather than a full-bleed rectangle, because a level
        here is a thing *on* a page rather than a window cut into one - and a
        near-black rectangle inside a near-black page is a rectangle whose edges
        you can see and cannot explain. `overflow-hidden` is what makes the
        corners actually cut the canvas rather than just the div.
      */}
      <div className="absolute inset-0 touch-none overflow-hidden rounded-[3rem]">
        <Canvas
          shadows="percentage"
          dpr={[1, 2]}
          /**
           * Orthographic for a side-on level, and that is why the camera block
           * cannot be changed while a document is open: R3F builds the camera
           * once from this flag, and swapping a perspective camera for an
           * orthographic one is a different object rather than a different
           * setting. A document that changes its camera gets a remount, which
           * the editor already does when it reloads a parsed document.
           *
           * `fov` is ignored by an orthographic camera and `zoom` is ignored by
           * a perspective one; both are set anyway so neither branch has to
           * think about which it is. The zoom is corrected to the canvas height
           * every frame in ./player - it cannot be right here, because the
           * canvas has no size until it is laid out.
           */
          orthographic={shot.kind === 'side'}
          camera={{
            position: [here.spawn.x, here.spawn.y + EYE_HEIGHT, here.spawn.z],
            /*
             * The lens, from the document rather than from two literals here.
             *
             * Both were constants and both are things a level has an opinion
             * about: a corridor wants a narrower lens than an arena, and a far
             * plane shorter than the level draws the fog running out in mid-air.
             * Absent is what they always were - see `lensSettings`.
             *
             * The near plane is still ours. It is a property of the *projection*
             * rather than of the shot - an orthographic frustum starts behind
             * the camera, a perspective one cannot start at zero - and a
             * document setting it would be a document able to make its own level
             * invisible.
             */
            fov: lens.fov,
            near: shot.kind === 'side' ? -lens.far : 0.05,
            far: lens.far,
          }}
          /**
           * `alpha` explicitly, because without it the transparency the
           * background comment above promises never happens.
           *
           * A `WebGLRenderer` with no alpha buffer clears to opaque black, so
           * leaving `scene.background` unset produced a black rectangle rather
           * than the page showing through - the level looked like a window cut
           * into the site instead of a thing sitting on it, which is the exact
           * outcome the rounded framing beside this is here to avoid.
           */
          gl={{ antialias: true, alpha: true }}
          /**
           * The renderer, caught on creation so the headset button can reach it.
           *
           * three has WebXR inside `WebGLRenderer`, so entering a session needs
           * no extra package - but the renderer only exists inside the Canvas,
           * and the button that starts a session is DOM outside it. This is the
           * seam between the two.
           *
           * `xr.enabled` up front costs nothing on a machine that never enters
           * VR, and means entering is one call rather than reconfiguring a
           * renderer that is already drawing frames.
           */
          onCreated={(state) => {
            const renderer = state.gl as unknown as {
              xr: { enabled: boolean; setSession(session: unknown): Promise<void> }
            }
            renderer.xr.enabled = true
            gl.current = renderer
          }}
        >
          {/*
            Only painted when the document asks for a sky of its own. Without one
            the canvas is left transparent and what shows through is the page - the
            same starfield the rest of the site sits in - rather than a flat
            rectangle that has to be masked to stop it looking like a window.
          */}
          {background ? <color attach="background" args={[background]} /> : null}
          <fog attach="fog" args={[haze, 40, 120]} />

          {/* Enough to read the prototype kit's flat shading: a sun for shape, a
              fill so the shadowed sides are not black, and a warm bounce so a
              grey room does not read as a grey screen. */}
          <hemisphereLight args={['#cfd6ff', '#2a2233', 1.1]} />
          <directionalLight
            position={[18, 30, 12]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
          />
          <pointLight position={[-10, 8, -10]} intensity={40} color="#f0abfc" distance={45} />

          <Suspense fallback={null}>
            <Placements placements={here.world.placements} />
          </Suspense>

          {/* Outside the Suspense boundary: marks are lines and a plane, with no
              model to load, so making them wait on the level's geometry would
              hide the one thing that tells an author their goal is in the wrong
              place. */}
          <Marks marks={here.world.marks} />

          {/* Beside the marks and outside the Suspense boundary for the same
              reason: two rings and no model to load, and the one thing that
              tells a player what their next press is about should not wait on
              the level's geometry. */}
          <Aiming at={aim?.at ?? null} to={aim?.to ?? null} />

          {/*
            Nothing is placed until the store has answered.

            `undefined` is "still asking" and `null` is "nothing to resume", and
            mounting on the first is how somebody who has played before arrives
            at the spawn for a frame and then somewhere else. A level with no
            store settles synchronously on the first effect, so this costs a
            frame in the case that has something to say and nothing in the case
            that does not.
          */}
          {/*
            A cut, over the top.

            Inside the same Canvas rather than a second one: a `<Canvas>` is a
            WebGL context, browsers give you about sixteen, and a film needs the
            camera this one already has.

            Everything below is left mounted while it plays. The simulation does
            not stop - see the note in ./cutscene about why one client cannot
            pause a room - so what the player sees is the film and what the level
            does is carry on.
          */}
          {watchedCut ? (
            <Cutscene
              key={watching!.run}
              document={here}
              sequence={watchedCut}
              onEnd={() => setWatching(null)}
            />
          ) : null}

          {resumeAt === undefined ? null : (
          <Running
            xp={here}
            /*
              A film takes the camera, so the controls have to let go of the
              body. ./cutscene has described this as what the host does since it
              was written and nothing was doing it.
            */
            filming={!!watchedCut}
            {...(resumeAt ? { resumeAt: resumeAt.at } : {})}
            {...(store ? { onProgress: keepProgress } : {})}
            scripts={scripts}
            solids={solids}
            catchFloor={catchFloor}
            view={view}
            {...(network && room && me ? { network, room, scene: where, me } : {})}
            {...(arbiter ? { arbiter } : {})}
            {...(team ? { team } : {})}
            {...(party ? { party } : {})}
            {...(onParty ? { onParty } : {})}
            onPeers={setPeers}
            onMove={(position, _grounded, facing) =>
              setReadout({ x: position.x, y: position.y, z: position.z, facing })
            }
            onBroken={setBroken}
            {...(avatar ? { avatar } : {})}
            {...(mode ? { mode } : {})}
            {...(startedAt !== undefined ? { startedAt } : {})}
            unstickAt={unstickAt}
            ballBackAt={ballBackAt}
            onSay={setSaid}
            onVitals={setVitals}
            onKills={setKills}
            onStandings={setStandings}
            onVote={setVote}
            onTurn={setTurn}
            onSeats={setSeats}
            onRolled={setRolled}
            onSecret={setSecret}
            onAim={setAim}
            onTally={setTally}
            onPhase={setPhase}
            onCountdown={setCountdown}
            onRound={setFlowRound}
            onWon={setWon}
            onRoster={keepRoster}
            camera={shot}
            {...(isTouch ? { touch } : {})}
            onCooling={holdCooling}
            /**
             * What the level keeps, for the rules that read and write it.
             *
             * The ref itself rather than its contents, like `playerAt` and
             * `teleports` beside it: the map is mutated inside the frame loop
             * and passing a value would be a re-render of the scene every time
             * a coin moved.
             */
            /**
             * A rule asked for a cut. Mounted beside the level rather than
             * instead of it - see `./cutscene` for why a film is drawn over a
             * game that carries on existing.
             *
             * The run counter is bumped rather than the name compared, so a
             * trigger that plays the same cut twice plays it twice.
             */
            onMovie={(sequence) =>
              setWatching((was) => ({ sequence, run: (was?.run ?? 0) + 1 }))
            }
            data={live}
            onRun={keepRun}
            onMatch={setMatch}
          onDown={setDownFor}
          onLoad={onLoad}
          {...(emote ? { emote } : {})}
          />
          )}

          {/*
            The same HUD, for the eyes that cannot see the page.
            
            Inside the Canvas because in an immersive session the DOM is not
            drawn at all - the page is still there and nobody wearing the headset
            can see a pixel of it, so the score, the clock and the "you are down
            for 3" countdown all vanish exactly when they matter most. It draws
            nothing at all until a session is actually presenting; see
            ./vr-panel.
          */}
          <VrPanel
            lines={hudLines({
              vitals,
              match,
              run,
              downFor,
              said,
              tally,
              phase,
              ...(side ? { seat: side } : {}),
              // Resolved to a colour here, where the seats map is, rather than
              // handed an account id no headset could make sense of.
              ...(turn
                ? {
                    turn: {
                      seat: Object.keys(seats).find((name) => seats[name] === turn) ?? null,
                      mine: standings.some((row) => row.mine && row.id === turn),
                    },
                  }
                : {}),
              ...(rolled ? { rolled } : {}),
            })}
            controls={controlLines(xp.player.keys ?? [])}
          />
        </Canvas>
      </div>

      {/*
        A vignette that feathers the world out to nothing at the edges instead of
        ending on a hard rectangle. The lounge's, at its own numbers, and in the
        page's colour so the fade lands on the page rather than on a grey.

        In CSS rather than a post-processing pass, because that would mean
        another renderer dependency for an effect that is, in the end, a
        soft-edged oval. Above the canvas and below the HUD, and taking no
        pointer events - the biggest thing on this screen is a 3D scene that
        wants every click it can get.
      */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[3rem]"
        style={{ boxShadow: `inset 0 0 140px 60px ${SKY}` }}
      />

      {/*
        The touch layout, over the canvas and under nothing.

        Rendered only on a coarse pointer, so a laptop never gets a thumbstick -
        and only inside the framed container, so the stick sits over the world
        rather than over the page's own margin.
      */}
      {isTouch ? (
        <TouchControls
          onReady={holdTouch}
          canLook={shot.kind !== 'side'}
          {...(xp.player.keys ? { keys: xp.player.keys } : {})}
          latching={letsGo}
          cooling={cooling}
          /*
            A trigger, for a document that put a gun in the player's hand.

            Read from the same field the viewmodel draws the weapon from, so the
            button exists exactly when the thing it fires does. Without it the
            shooter was unplayable on a phone rather than merely awkward: firing
            is a `mousedown` under pointer lock, and neither of those exists on
            glass.
          */
          armed={xp.player.weapon !== undefined}
        />
      ) : null}

      {/*
        Which thumb, asked once and only of the people it is a question for.

        Both conditions matter. `isTouch` because a mouse has no handedness this
        can help with, and `!chosen` because the whole point is that it is a
        first-run question - a card that came back every session would be worse
        than no card at all.

        Inside the framed container with the rest of the HUD rather than over
        the page, so it lands on the world it is describing. Above the touch
        controls in the stacking order (z-40 against their bare stacking) so
        nobody answers it by accident with the thumb that was reaching for the
        stick, and above the level's own chrome for the same reason.

        The lounge asks this on its entry gate instead - see <ControlsPanel> in
        `@/app/world/hud`. A level has no gate to hang it on, which is the whole
        reason this component exists.
      */}
      {isTouch && !chosen ? <HandGate /> : null}

      {/*
        The faces, and the button that opens them.

        **Only in a room.** An emote is something you do *at* somebody, and a
        level with nobody else in it has no audience — so a picker there would
        be a button whose whole effect is a face over your own head, which is
        the definition of a control that promises something it cannot deliver.
        `room` is the same condition `Together` mounts on, deliberately: one
        answer to "is anybody else here".

        Where it sits differs from the lounge and the divergence is the point.
        The lounge puts emotes in the bottom-right corner and stacks its actions
        above them; here that corner is the jump button's, because in a lounge
        the main thing your right thumb does is pull a face and in a game it is
        jump. So this goes above the level's own action column on a phone, and
        keeps the corner on a desktop where there is no column at all.

        **And only when the document allows them.** `talk.emotes` is absent in
        every level written before the block existed, and absent means yes — so
        this is one condition on a picker that already had one, exactly as §7b
        predicted it would be. The runtime has a single place that decides
        whether the button exists, and this is it.
      */}
      {room && talk.emotes ? (
        <EmotePicker
          open={showEmotes}
          onOpenChange={setShowEmotes}
          onPick={pullFace}
          /*
            Above the action rail on a phone, and therefore on the rail's own
            side - which is the dominant thumb's, and moves with it. Written out
            as whole strings because Tailwind reads the source for class names
            it has never run; an interpolated corner would ship a stylesheet
            missing the mirrored rule. The desktop corner does not move: there
            is no rail there to stay clear of.
          */
          className={
            isTouch
              ? hand === 'right'
                ? 'bottom-[19rem] right-8'
                : 'bottom-[19rem] left-8'
              : 'bottom-4 right-4'
          }
        />
      ) : null}

      {/*
        And the words, in the other corner.

        Bottom left, above the HUD's own "click to look · H for controls" line
        and on the opposite side from the faces - which is where the level's
        ticker is not, so the two things being said over this world are never
        arguing for the same pixels.

        `standings` is the roster: it is the same list the scoreboard is drawn
        from, so a name in a chat line and a name on the board cannot disagree.
      */}
      {chat && me ? (
        <ChatPanel
          chat={chat}
          me={me.id}
          roster={standings}
          open={showChat}
          onOpenChange={setShowChat}
          {...(isTouch ? { touch: true, hand } : {})}
        />
      ) : null}

      {/*
        A door to somebody else's level, asked about before anything is fetched.

        The address is shown in full and not prettified: the whole question is
        *whose* level this is, and a host somebody cannot read is a host they
        cannot judge. It is the one piece of this panel that must not be
        summarised.
      */}
      {asking ? (
        <div
          className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: 'oklch(0.08 0.04 285 / 0.55)' }}
        >
          <div
            role="dialog"
            aria-modal
            aria-label={xpDict(locale).scene.door.label}
            className="hud-panel hud-panel-enter w-full max-w-md px-5 py-6 sm:px-8"
          >
            <h2 className="font-pixel mb-3 text-center text-lg uppercase tracking-[0.12em] text-[var(--color-accent)]">
              {xpDict(locale).scene.door.heading}
            </h2>
            <p className="mb-2 text-center text-xs leading-relaxed text-[var(--color-ink-muted)]">
              {xpDict(locale).scene.door.body}
            </p>
            <p className="mb-5 break-all text-center font-mono text-[11px] text-[var(--color-ink)]">
              {asking.url}
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                className="rounded-full border border-white/25 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/80 transition hover:bg-white/15"
                onClick={() => setAsking(null)}
              >
                {xpDict(locale).scene.door.stay}
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)]/20 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition hover:bg-[var(--color-accent)]/35"
                onClick={() => {
                  const door = asking
                  setAsking(null)
                  void openDoor(door.target, door.url)
                }}
              >
                {xpDict(locale).scene.door.openIt}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ControlsPanel
        open={showControls}
        rows={xpControls({
          keys: xp.player?.keys ?? [],
          isTouch,
          view,
          armed: xp.player?.weapon !== undefined,
          // Only while there is a room, a standing player, and no vote already
          // running - once one is open the numbers are the control, and `B`
          // would be refused.
          canCallVote: !vote && standings.some((row) => row.mine && !row.out),
          // The same condition the picker mounts on, read from the same place:
          // a row for a button that is not on the screen is worse than no row.
          canEmote: room !== undefined && talk.emotes,
          // And the same again for chat, which has a different condition - see
          // the memo that builds the host: a level with nobody else in it can
          // still talk to the space.
          canChat: chat !== null,
          words: xpDict(locale).controls,
        })}
        onClose={() => setShowControls(false)}
        isTouch={isTouch}
      />

      <Hud
        onControls={() => setShowControls(true)}
        /**
         * The room, not the file. The line under the level's name counts what
         * is *in front of you* - placements, entities, solid cells - and two of
         * those three already came from the scene, so handing it the whole
         * document made the third disagree with the other two. The name and the
         * blueprint list it also reads are the game's and are the same either
         * way.
         */
        xp={here}
        cells={solids.count}
        entities={here.entities.length}
        readout={readout}
        broken={broken}
        troubles={troubles}
        // The last few, fading. See `said` - the state is the transcript and
        // this is the ticker's window onto it.
        said={said.slice(-TICKER_LINES)}
        vitals={vitals}
        peers={peers}
        kills={kills}
        standings={standings}
        vote={vote}
        turn={turn}
        seats={seats}
        rolled={rolled}
        tally={tally}
        phase={phase}
        {...(countdown !== null ? { countdown } : {})}
        {...(here.flow?.rounds
          /*
            Only for a run that has more than one round. `rounds` is the
            document's and the count is the runtime's, and this is where the
            two meet - a level with no rounds draws no line rather than
            drawing "1 / 1", which is a fact about the format, not news.
          */
          ? { round: { at: flowRound, of: here.flow.rounds } }
          : {})}
        {...(phase && here.flow?.phases[phase]?.says
          ? { says: here.flow.phases[phase].says }
          : {})}
        live={canDo}
        cooling={cooling}
        {...(side ? { seat: side } : {})}
        secret={secret}
        // What that role does to how you are seen, worked out here rather than
        // sent: it is a fact about *your own* secret, so the client holding it
        // is the one place that can answer it without asking anybody.
        seen={seenAs(rulesOf(here), secret)}
        won={won}
        run={run}
        match={match}
        downFor={downFor}
        {...(headset
          ? {
              onEnterVr: () => {
                void enterVr(gl.current).then((problem) => {
                  // Onto the same panel a broken script goes to. Entering VR is
                  // something somebody did on purpose, and a refusal that only
                  // reached a console would look like a button that does nothing.
                  if (problem) setBroken([`could not enter VR: ${problem}`])
                })
              },
            }
          : {})}
        onUnstick={() => setUnstickAt((was) => was + 1)}
        scripts={scriptState(xp, scripts, broken, xpDict(locale).hud.scripts)}
      />
    </div>
  )
}

/**
 * A level this screen cannot run, said before it starts rather than during.
 *
 * A whole screen rather than a line on the HUD, and for the same reason the
 * editor's `TakenOver` is one: a 3D scene that has loaded looks exactly like a
 * working one until the thing it needed turns out to be missing, and finding
 * out then is finding out after the play. `backend.needs` means *do not open
 * this here*; anything softer belongs in `backend.wants`.
 *
 * It names the capability rather than apologising in general terms, because the
 * person most likely to see this is the author, and "this level needs somewhere
 * to save" is a sentence they can act on.
 */
function Unplayable({
  name,
  missing,
}: {
  /** Already through the level's own table - see the call site. */
  name: string
  missing: HostCapability[]
}) {
  const t = xpDict(useLocale()).scene
  return (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-neutral-950/60 p-8">
      <div className="max-w-md">
        <h2 className="font-pixel text-lg uppercase leading-tight">{t.unplayable.heading}</h2>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          <span className="text-ink">{name}</span>{' '}
          {fill(t.unplayable.asksFor, {
            missing: missing.map((capability) => t.meanings[capability]).join(', '),
          })}
        </p>
        {/*
          The field name is code and sits inside the sentence, so the sentence
          is two halves rather than one string with a slot: German puts the
          possessive after the noun and English before it.
        */}
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {t.unplayable.declaredIn}{' '}
          <code className="font-mono text-xs">backend.needs</code>{' '}
          {t.unplayable.declaredTail}
        </p>
      </div>
    </div>
  )
}

