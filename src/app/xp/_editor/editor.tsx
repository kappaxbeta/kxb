'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STARTERS, type StarterId } from '@/app/xp/_editor/panels/blueprints'
import {
  type Dragged,
  type GizmoMode,
  type Selected,
  type Snap,
  type Tool,
  type PlacementPatch,
  type Transform,
} from '@/app/xp/_editor/stage/stage'
import { Dock, EditorProvider, TOOL_WINDOWS, toggleWindow } from '@/app/xp/_editor/shell/dock'
import { PackScopeProvider, type PackScope } from '@/app/xp/_editor/panels/pack-scope'
import { IconRail, StatusBar } from '@/app/xp/_editor/shell/rail'
import { MobileShell, useNarrow } from '@/app/xp/_editor/shell/mobile'
import { EditableTitle } from '@/app/xp/_editor/shell/title'
import { WindowChrome } from '@/app/xp/_editor/shell/window'
import { XP_NAME_MAX } from '@/domain/xps/events'
import { ToolBar } from '@/app/xp/_editor/shell/toolbar'
import { LOG_LINES, XpScene } from '@/app/xp/_runtime/scene'
import type { DockviewApi } from 'dockview-react'
import {
  addBlueprint,
  addBody,
  addEntity,
  addPart,
  addMark,
  addPack,
  addPlacement,
  addScript,
  addTrigger,
  addVerb,
  canRedo,
  canUndo,
  editing,
  eraseStroke,
  nextEntityName,
  redo,
  describeDocument,
  colourDocument,
  finishDocument,
  removeBlueprint,
  removeEntity,
  removePart,
  removeMark,
  removePack,
  removePlacement,
  removeLanguage,
  removeScript,
  removeTrigger,
  removeVerb,
  renameBlueprint,
  renameDocument,
  renameScript,
  rotateEntity,
  savesProgress,
  setBlueprint as writeBlueprint,
  setBlueprintScript,
  setClips,
  setEntity,
  setMark,
  setPart,
  setPlacement,
  setPlayerRole,
  setSpawn,
  blueprintFrom,
  setCamera,
  setDataField,
  setRules,
  setPhrase,
  setTalk,
  setTrigger,
  setVerb,
  setWorld,
  // Renamed on the way in: `setScript` is also the name of the state setter for
  // which script the panel has open, and one of the two would have been a bug
  // that compiled.
  setScript as writeScript,
  removeDataField,
  renameDataField,
  packUse,
  stroke,
  undo,
  type Cell,
  type EditState,
  type Pivot,
  type FlowTarget,
  type PlaceTarget,
  placeIn,
  addScene,
  addDoor,
  renameScene,
  removeScene,
  addMovie,
  importPlace,
  removeMovie,
  addSequence,
  renameSequence,
  removeSequence,
  // Renamed on the way in: `setMovie` is also the name of the state setter for
  // which movie is open, and one of the two would have been a bug that
  // compiled - the same collision `setScript` already has above.
  setMovie as setMovieBlock,
  putEntityKey,
  putEntityKeys,
  setKeyEase,
  dropEntityKey,
  dropFraming,
  clearEntityKeys,
  addCamera,
  removeCamera,
  renameCamera,
  putFraming,
  setCameraEase,
  putCut,
  dropCut,
  putAction,
  setAction,
  dropAction,
  bakeAction,
  liftKeys,
  addActor,
  duplicateEntity,
  addNode,
  setParent,
  moveActorAt,
  moveActorsAt,
  moveFraming,
  addTake,
  setTake,
  copyTake,
  dropTake,
  moveTake,
} from '@kxb/xp/edit'
import { useFlowEdits } from '@/app/xp/_editor/flow-edits'
import type { XpClip } from '@kxb/xp/clips'
import type { Ease } from '@kxb/xp/movie'
import {
  MAIN_SCENE,
  parseXp,
  WORLD_HEIGHT,
  WORLD_RADIUS,
  type EntitySpec,
  type Mark,
  type Placement,
  type PlayerKey,
  type PlayerLook,
  type PlayerRole,
  type Part,
  type Trigger,
  type Verb,
  type XpDocument,
  type XpField,
} from '@kxb/xp'
import type { XpAction } from '@kxb/xp/movie'
import { DEFAULT_MODEL } from '@kxb/xp/catalogue'
import { PACK_ORDER } from '@kxb/xp/packs'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { Hint } from '@/app/xp/_editor/chrome'
import { MovieMode } from '@/app/xp/_editor/movie/mode'
import { Composer } from '@/app/xp/_editor/movie/composer'

/**
 * The creator, as a screen.
 *
 * Everything that decides *what happens* is in `@kxb/xp/edit` and has tests;
 * this is the half that turns a pointer into an intent and a document into a
 * screen. The split exists because a canvas in the Browser pane never gets a
 * frame, so this half can only be checked by looking at it - and the half that
 * cannot be looked at is the half that is proved.
 *
 * ---------------------------------------------------------------------------
 * A file, and a draft
 * ---------------------------------------------------------------------------
 * An XP is a `.xp.json` (docs/xp/creator.md §3.1) and this edits one in memory.
 * Two things follow, and the second is the one that matters:
 *
 * - **Save downloads a file.** No table, no server round trip, no permission
 *   story. You put it in `public/xp/xps/` yourself, which is also how you decide
 *   it is finished.
 * - **The draft autosaves to `localStorage` on every edit.** Losing an
 *   afternoon's building to a refresh is the one unforgivable bug a builder can
 *   have, and it is unforgivable precisely because the work is not anywhere
 *   else yet.
 */

const DRAFT_KEY = (id: string) => `xp:draft:${id}`

export interface EditorProps {
  id: string
  /** What is on disk. The draft, if there is one, is layered over it. */
  document: XpDocument
  /**
   * Where Save goes, when it goes anywhere but this computer.
   *
   * Absent on the operator route, which has no database behind it — there
   * Save writes a `.xp.json` to your downloads and always did. Present on a
   * space's editor, where Save writes the project and Export is the download.
   *
   * A prop rather than two editors, because everything else about editing a
   * level is identical and a second copy would drift within a week. It returns
   * a reason rather than throwing, because every refusal it can produce is one
   * a person can act on — somebody else has it open, the space cannot be
   * written to, the document does not parse.
   */
  onSave?: (
    document: XpDocument,
  ) => Promise<{ ok: true; version?: number } | { ok: false; error: string }>
  /**
   * What the project this document belongs to is called, when it belongs to one.
   *
   * The title bar prefers it over `document.name`, and the two are different
   * names: the project's is what the library, the store and everybody else in
   * the space calls it, and the document's is what travels inside the file. A
   * level made from a starter and never renamed carries whatever the starter
   * said, which is how the bar came to read "untitled" over a project somebody
   * had given a perfectly good name at the moment they made it.
   *
   * Absent on the operator route, where a `.xp.json` on disk is the whole thing
   * there is and the document's own name is the only one.
   */
  name?: string
  /**
   * Rename the project — the space's copy of the name, not the document's.
   *
   * Present only where there is a project to rename. The editor keeps the two
   * in step by writing the document's name as well when this succeeds, so an
   * export and a remix carry what the library says rather than what the starter
   * did. That edit is an ordinary undoable one, saved with the next Save.
   *
   * It returns the name that was actually taken, because a space numbers a name
   * already in use rather than refusing it.
   */
  onRename?: (name: string) => Promise<{ ok: true; name: string } | { ok: false; error: string }>
  /**
   * Where the window's red light goes.
   *
   * Absent on the operator route, which opened a file rather than a project and
   * has nowhere to go back to. See `WindowChrome`.
   */
  backHref?: string
  /**
   * How to open the workspace's own menu, on a phone.
   *
   * The editor is mounted inside a workspace whose navigation is a drawer on
   * a phone, and the drawer's handle used to float over the editor's rail.
   * The title bar draws a menu button instead when it is told how - see
   * `WindowChrome.menu`. Absent on the operator route, which has no workspace
   * around it.
   */
  onMenu?: () => void
  /**
   * Which version of the project this page loaded, when there is one.
   *
   * Only so a draft can be compared against it - see `restore`. Absent on the
   * operator route, which edits a file and has no versions to be stale against.
   */
  version?: number
}

/**
 * The draft this browser has for an XP, if any.
 *
 * Read in the state initialiser rather than in an effect, which is only safe
 * because this component never renders on the server - see the note on the
 * dynamic import in ./client. Reading `localStorage` during a server render is
 * a crash; reading it in an effect and calling `setState` is a second render
 * with different content, which React now refuses outright.
 *
 * ---------------------------------------------------------------------------
 * The draft goes through the parser, like anything else from outside
 * ---------------------------------------------------------------------------
 * The first version checked that it was an object with placements in it and
 * trusted the rest, on the grounds that it is our own draft. That is wrong for
 * a reason that showed up the same afternoon: a draft written *before* the
 * format grew a field does not have it, so a document saved yesterday is
 * missing `player`, `marks` or `blueprints` today - and every reader downstream
 * assumes a parsed document, so the first one to touch the missing field
 * throws.
 *
 * "Our own draft" is not a trust boundary. It is untrusted input that happens
 * to have come from us, and the right treatment is the one every other document
 * gets. A draft that no longer parses is dropped rather than repaired: the file
 * on disk is the thing it was a draft *of*, and silently loading it is better
 * than silently loading half of something else.
 */
function restore(id: string, loadedAt?: number): XpDocument | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY(id))
    if (!raw) return null

    const offered = draftToRestore(JSON.parse(raw) as unknown, loadedAt)
    if (offered === null) return null
    const parsed = parseXp(offered)
    return parsed.ok ? parsed.document : null
  } catch {
    // A private window, a quota, a half-written value. A fresh document is a
    // working session; a crash on load is not.
    return null
  }
}

/**
 * A draft, and which saved version it was built on top of.
 *
 * `null` means "never saved from this browser" - a draft of work that has not
 * landed anywhere yet, which is exactly what a draft is for and which no
 * version comparison can rule stale.
 */
export type Draft = { savedAs: number | null; document: unknown }

/**
 * Which document a held draft offers, or `null` for one to ignore.
 *
 * Split out of `restore` and exported because it is the whole decision, and the
 * rest of `restore` is `localStorage` and a `try`. This is the part worth having
 * tests for and the part that could not have them while it sat inside a function
 * that reaches for `window`.
 *
 * ---------------------------------------------------------------------------
 * When a draft is too old to use
 * ---------------------------------------------------------------------------
 * The case is the one ../api/xp/[xpId]/save already names in its own note about
 * `base`: a laptop closed on v5, a colleague saves v6 and v7, and the laptop
 * reopens. Layering that draft would put v5's content on screen over v7, and the
 * next save would write it back as v8 - silently, with nothing to see. The
 * server refuses that save, so keeping the draft only ever bought a confusing
 * screen and a refusal at the end of it.
 *
 * Only *older*, and only when both numbers are known. A draft stamped with the
 * version now on disk is this session's own work, which is the entire reason
 * Save writes one.
 */
export function draftToRestore(held: unknown, loadedAt?: number): unknown | null {
  const wrapped = stamped(held)

  // An unstamped draft was written before this format, and it is somebody's
  // afternoon. It gets the old treatment - restored on trust - because the
  // alternative is throwing work away to enforce a guard that did not exist
  // when the work was done.
  if (!wrapped) return held

  if (loadedAt !== undefined && wrapped.savedAs !== null && wrapped.savedAs < loadedAt) return null
  return wrapped.document
}

/** The wrapper, or `null` for a bare document written by an older build. */
function stamped(held: unknown): Draft | null {
  if (held === null || typeof held !== 'object') return null
  const maybe = held as { savedAs?: unknown; document?: unknown }
  if (!('document' in maybe) || typeof maybe.document !== 'object' || maybe.document === null) {
    return null
  }
  const savedAs = typeof maybe.savedAs === 'number' ? maybe.savedAs : null
  return { savedAs, document: maybe.document }
}

/**
 * The document as it is from the room you are standing in.
 *
 * The editor's `standingIn` - see ../_runtime/standing, which is the same
 * projection made for the same reason, and `placeIn` in the package, which is
 * the half that knows the root and a scene keep their world in different
 * places. A whole document rather than the three lists, because everything
 * downstream of this - the stage, the Inspector, the Properties panel - takes a
 * document and was written when a document had one place in it. All of it is
 * still right; what it needs is to be handed the *room* rather than the file.
 *
 * The rest is shared and stays: blueprints, scripts, the player, the rules, the
 * flow and the words all belong to the game rather than to the room it is being
 * played in, and a panel that edits one of those is given `state.document`.
 *
 * Never the thing that gets saved. `write` puts `state` back and `state` is
 * always the whole file - a projection reaching the disk would write one room's
 * world where the root's used to be and the root's would be gone. That is the
 * same trap the parser refuses to walk into; see the note on top of
 * ../_runtime/standing.
 */
function roomOf(document: XpDocument, standing: PlaceTarget): XpDocument {
  const place = placeIn(document, standing)
  return place ? { ...document, ...place } : document
}

export function Editor({
  id,
  document: onDisk,
  onSave,
  onRename,
  backHref,
  onMenu,
  name,
  version,
}: EditorProps) {
  const t = xpEditorDict(useLocale()).shell
  /**
   * A phone, or not.
   *
   * Decided once here rather than inside the dock, because it is not a
   * smaller dock that is wanted - see ./shell/mobile. The rail and the dock
   * are one arrangement and the column is another, and this is the one place
   * that chooses between them.
   */
  const narrow = useNarrow()
  // The tab a rail toggle opens says the same as the tooltip that opened it.
  const windowTitles = xpEditorDict(useLocale()).chrome.windows
  const restored = useState(() => restore(id, version))[0]
  /**
   * The saved version this session's work sits on top of, stamped into the draft.
   *
   * A ref because it is read by the autosave on every edit and written by a save
   * - state would put a render between the two for a number nothing draws.
   */
  const savedAs = useRef<number | null>(version ?? null)
  const [state, setState] = useState<EditState>(() => editing(restored ?? onDisk))
  /**
   * Select, not place.
   *
   * Opening a level and having the first click *build* something is the wrong
   * default: the first thing anybody does with a level they already have is
   * look at it and click on something to find out what it is. Place is one key
   * away, and an accidental select is free where an accidental wall is an undo
   * you have to notice you need.
   */
  const [tool, setTool] = useState<Tool>('select')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [rotation, setRotation] = useState(0)
  const [level, setLevel] = useState(0)
  const [selected, setSelected] = useState<Selected>(null)
  /**
   * What was cut or copied, waiting to be pasted.
   *
   * The editor's own clipboard rather than the system one. The system clipboard
   * is a string, needs permission, and is shared with every other window - so
   * copying a wall would compete with whatever somebody had copied from their
   * notes, and pasting would have to guess whether an arbitrary string was ours.
   * A level's pieces only ever move within a level, so a variable is the honest
   * size of this.
   */
  const [clipboard, setClipboard] = useState<
    | { kind: 'entity'; spec: EntitySpec }
    | { kind: 'placement'; spec: Placement }
    | { kind: 'mark'; spec: Mark }
    | null
  >(null)
  /**
   * Trying the level, without leaving the editor or committing to a session.
   *
   * The runtime is the *same* component the play route mounts, given the
   * document being edited - not a second, simplified viewer. A preview that is
   * not the real runtime is a preview that agrees with the editor and disagrees
   * with the game, which is the one thing it must never do.
   *
   * Solo, and no `room`: `XpScene` opens no channel without one, so trying a
   * level costs nothing and tells nobody. Multiplayer preview stays refused for
   * the reason `docs/xp/backend.md` gives - trying an XP with other people is
   * loading it into a place or a battle, both of which already have people, an
   * invite and an ending.
   */
  const [previewing, setPreviewing] = useState(false)
  /**
   * The movie or the cut that has taken over the screen, or nothing.
   *
   * Beside `previewing` because it is the same kind of thing - a full-screen
   * mode over the same draft, ended by Escape - and deliberately not folded
   * into it: Try runs the level and these do not, so a single "what is on top"
   * value would be one whose branches share no code at all.
   *
   * A discriminated value rather than two booleans, because the two things it
   * can open are different documents - a shot is one place over time, a cut is
   * shots in order - and a pair of flags has a fourth state that means nothing.
   */
  const [movie, setMovie] = useState<
    { kind: 'shot'; where: PlaceTarget } | { kind: 'cut'; id: string } | null
  >(null)
  /**
   * The cell the pointer was last over, as a ref.
   *
   * The stage writes it on every pointer move, which is why it cannot be state:
   * a re-render of the whole editor at that rate would cost more than the scene
   * does. Nothing reads it continuously - it is what "put a spawn here" means,
   * and a button only needs the answer at the moment it is pressed.
   */
  const hover = useRef<Cell | null>(null)
  const onHover = useCallback((cell: Cell) => {
    hover.current = cell
  }, [])
  const [gizmo, setGizmo] = useState<GizmoMode>('translate')
  const [pivot, setPivot] = useState<Pivot>('centre')
  /**
   * How far a gizmo handle moves between stops.
   *
   * A tenth by default, which is what it always was and what the number fields
   * beside it step by. The list is in ./stage next to the handle that reads it.
   */
  const [snap, setSnap] = useState<Snap>(0.1)

  /**
   * Which of the level's rooms the editor is pointed at.
   *
   * Here rather than on `EditState`, and that is the same argument `flowTarget`
   * makes below: `EditState` is the document plus the undo stacks, so putting
   * this there would put it *on the undo stack* - pressing undo would walk you
   * into another room and every panel would be showing something nobody asked
   * to see. Where you are standing is a fact about the screen, so it lives with
   * the other screen facts here.
   *
   * `undefined` is the level's own world - the scene the format calls `main` -
   * which is what a level with one place has and what the editor opens on.
   */
  const [openRoom, setOpenRoom] = useState<PlaceTarget>(undefined)

  /**
   * Where you are actually standing, and the document seen from there.
   *
   * Derived rather than kept in step, because the room can go out from under
   * you and there are three ways it does: removing it, undoing the edit that
   * added it, and reloading a draft written in a session that had it. All three
   * arrive as `openRoom` naming something `placeIn` cannot find, and the answer
   * to every one of them is the same - you are back in the level's own world.
   * An effect would do this a paint later, which is a paint of an empty room.
   *
   * Undo and redo therefore walk you in and out of a room they created, which
   * is the behaviour you would ask for: undoing "add the cellar" should not
   * leave the editor pointed at a cellar that no longer exists.
   */
  const standing: PlaceTarget = placeIn(state.document, openRoom) ? openRoom : undefined
  const here = useMemo(() => roomOf(state.document, standing), [state.document, standing])

  /**
   * Walking into a room, which also drops whatever was selected.
   *
   * A selection is an index into *a room's* list - `{ kind: 'placement', index:
   * 3 }` is the fourth thing in here - so carrying one through a doorway would
   * point it at the fourth thing in the next room, which is a different object
   * and possibly no object at all. Nothing selected is the honest state of
   * having just arrived somewhere.
   */
  const onOpenRoom = useCallback((where: PlaceTarget) => {
    setOpenRoom(where)
    setSelected(null)
  }, [])

  /**
   * Which blueprint the Rules and Blueprints panels have open.
   *
   * Above the panels because dockview tears a panel's component down and
   * rebuilds it when it is dragged to another group, and a list that closed
   * itself every time somebody rearranged the window would be its own small
   * misery. Up here rather than beside the script state because `onDropModel`
   * reads it: a blueprint drag whose payload arrived sealed falls back to
   * whichever one is open, and picking a row up opens it.
   */
  const [blueprint, setBlueprint] = useState<string | null>(null)

  /**
   * The dock's own handle, and which tool windows are on screen.
   *
   * Held here rather than inside the dock because the rail lives outside it -
   * the rail is what makes a docked layout safe to rearrange, and it cannot do
   * that from inside the thing being rearranged.
   *
   * `open` is React state fed by dockview's own event rather than derived on
   * render: the dock is the authority on what exists, and asking it during
   * render would be reading a mutable object mid-update.
   */
  const [dock, setDock] = useState<DockviewApi | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  const onDockApi = useCallback((api: DockviewApi) => {
    setDock(api)
    const sync = () => setOpen(new Set(api.panels.map((panel) => panel.id)))
    sync()
    api.onDidLayoutChange(sync)
  }, [])
  const [draft, setDraft] = useState<'clean' | 'saved' | 'restored'>(
    restored ? 'restored' : 'clean',
  )

  /**
   * What Save says right now.
   *
   * Four states rather than a spinner, because the interesting one is the
   * fourth: a refusal has to stay on screen until it is read. `saved` fades on
   * the next edit rather than on a timer — the thing that makes it stale is
   * changing something, not three seconds passing.
   */
  const [saving, setSaving] = useState<
    { at: 'idle' } | { at: 'saving' } | { at: 'saved' } | { at: 'refused'; why: string }
  >({ at: 'idle' })

  const write = useCallback(
    (next: EditState | null) => {
      if (!next) return
      setState(next)
      /**
       * An edit is what makes "saved" stale, so the badge is cleared here
       * rather than on a timer or in an effect keyed on the document. The edit
       * is the event; a render is not.
       */
      setSaving((current) => (current.at === 'idle' ? current : { at: 'idle' }))
      try {
        window.localStorage.setItem(
          DRAFT_KEY(id),
          JSON.stringify({ savedAs: savedAs.current, document: next.document } satisfies Draft),
        )
        setDraft('saved')
      } catch {
        // Out of quota. The edit still happened; only the safety net is gone.
      }
    },
    [id],
  )

  /**
   * A stroke, and what happens after one.
   *
   * **Place hands you back to Select, holding the piece it just put down.** The
   * gesture is "put one of these there", and the next thing anybody does is
   * nudge it, turn it or look at what it is - none of which the Place tool can
   * do, and all of which need a selection somebody would otherwise have to make
   * by clicking the thing they are already looking at.
   *
   * Only Place, and that is the whole point of it being a separate tool from
   * Draw: Draw is a brush, and a brush that stopped being a brush after one
   * stroke would be unusable for the thing it exists for.
   */
  const onStroke = useCallback(
    (cells: Cell[]) => {
      const next = stroke(state, cells, { model, rotation }, standing)
      write(next)
      if (!next || tool !== 'place') return
      setTool('select')
      setSelected({
        kind: 'placement',
        index: roomOf(next.document, standing).world.placements.length - 1,
      })
    },
    [standing, state, model, rotation, tool, write],
  )
  const onErase = useCallback(
    (cells: Cell[]) => write(eraseStroke(state, cells, standing)),
    [standing, state, write],
  )

  /**
   * One entry point for every way an entity changes - the gizmo, the number
   * fields, the name box.
   *
   * Rotation goes through `rotateEntity` so the pivot applies wherever the turn
   * came from. A gizmo that spins about the centre and a number field that
   * spins about the origin would be two tools disagreeing about the same
   * property, which is the kind of thing nobody reports and everybody works
   * around.
   */
  const onEntity = useCallback(
    (index: number, patch: Partial<EntitySpec>) => {
      if (patch.rotation !== undefined && Object.keys(patch).length === 1) {
        write(rotateEntity(state, index, patch.rotation, pivot, standing))
        return
      }
      write(setEntity(state, index, patch, standing))
    },
    [standing, state, pivot, write],
  )

  const onRemove = useCallback(
    (index: number) => {
      write(removeEntity(state, index, standing))
      setSelected(null)
    },
    [standing, state, write],
  )

  /**
   * Moving and deleting one piece of architecture.
   *
   * By index rather than by cell, which is what a *selection* is: two pieces may
   * share an anchor, and addressing by cell would take whichever came first
   * rather than the one somebody is looking at.
   */
  const onPlacement = useCallback(
    (index: number, patch: PlacementPatch) => write(setPlacement(state, index, patch, standing)),
    [standing, state, write],
  )

  const onRemovePlacement = useCallback(
    (index: number) => {
      write(removePlacement(state, index, standing))
      setSelected(null)
    },
    [standing, state, write],
  )

  /**
   * Marks: the facts about a level rather than the things in it.
   *
   * A new one lands under the pointer rather than at the origin, which is worth
   * the ref it takes: every mark added at 0,0 is a mark somebody then has to
   * find and drag, and four of them at 0,0 is a pile. Falling back to the
   * working level's origin covers the case where the pointer has never been over
   * the viewport - a person who opened the Scene panel first.
   */
  const onAddMark = useCallback(
    (kind: Mark['kind']) => {
      const at = hover.current ?? { x: 0, y: level, z: 0 }
      const made = addMark(state, { kind, x: at.x, y: at.y, z: at.z }, standing)
      write(made)
      if (made) {
        setSelected({ kind: 'mark', index: roomOf(made.document, standing).world.marks.length - 1 })
      }
    },
    [standing, level, state, write],
  )

  /**
   * Turn a placed piece into a kind of thing, and select what came out.
   *
   * The selection move is the point of returning the name: an author presses
   * this because they want to give the thing behaviour, and the panel that does
   * that is the Blueprints one. Landing them on it is the difference between a
   * button that converts and a button that converts and then leaves you looking
   * for what it made.
   */
  const onBlueprintFrom = useCallback(
    (index: number) => {
      const made = blueprintFrom(state, index, standing)
      if (!made) return
      write(made.state)
      setSelected(null)
      setBlueprint(made.name)
    },
    [standing, state, write],
  )

  const onMark = useCallback(
    (index: number, patch: Partial<Mark>) => write(setMark(state, index, patch, standing)),
    [standing, state, write],
  )

  const onRemoveMark = useCallback(
    (index: number) => {
      write(removeMark(state, index, standing))
      setSelected(null)
    },
    [standing, state, write],
  )

  /**
   * A model dragged out of the picker and let go.
   *
   * `addPlacement` and not `place`: the brush answers "put this here, replacing
   * whatever was", and a drop is the other thing - you are adding a piece next
   * to what is already there, and a paste that removed its neighbour would be a
   * paste that loses work.
   *
   * `at` is null when the drop landed somewhere with no world position of its
   * own - the Scene panel - and then it falls back to where the pointer last
   * was in the viewport, which is the same answer a new mark gets and for the
   * same reason: the origin is where four of them end up in a pile.
   *
   * Selected afterwards, because the next thing anybody does with a piece they
   * just dropped is move it a little.
   */
  const onDropModel = useCallback(
    (dropped: Dragged | null, at: { x: number; y: number; z: number } | null) => {
      /**
       * Somewhere in the world, or somewhere sensible instead.
       *
       * A ray that leaves the camera nearly parallel to the ground meets the
       * working plane hundreds of cells away - past the edge of what the format
       * allows - and `addPlacement` refuses that, correctly. What is *not*
       * correct is what refusing looked like from the outside: a drag, a drop,
       * and nothing. So a point the world cannot hold is treated as no point at
       * all, and the drop falls back the same way the Scene panel's does.
       */
      const where =
        at &&
        Math.abs(at.x) < WORLD_RADIUS &&
        Math.abs(at.z) < WORLD_RADIUS &&
        at.y >= 0 &&
        at.y < WORLD_HEIGHT
          ? at
          : (hover.current ?? { x: 0, y: level, z: 0 })
      /**
       * A blueprint makes an entity, and it arrives with a name.
       *
       * The name is the difference that matters. A placement is bulk scenery and
       * naming four hundred crates would be worse than naming none - but an
       * entity exists precisely so that a rule or a script can address it, and an
       * unnamed one is a thing nothing can talk about. `nextEntityName` is what
       * the drop is *for*, as much as the position is.
       *
       * `blueprint` is the fallback for a sealed payload, for the same reason
       * `model` is on the other branch: picking a row up opens it.
       */
      if (dropped?.kind === 'blueprint') {
        const which = dropped.id ?? blueprint
        if (!which || !(which in state.document.blueprints)) return
        const next = addEntity(
          state,
          {
            blueprint: which,
            name: nextEntityName(state.document, which, standing),
            x: where.x,
            y: where.y,
            z: where.z,
            rotation,
            scale: 1,
            props: {},
          },
          standing,
        )
        write(next)
        if (next) {
          setSelected({ kind: 'entity', index: roomOf(next.document, standing).entities.length - 1 })
        }
        return
      }

      const next = addPlacement(
        state,
        {
          // What the drag carried, or what the picker is holding - which is the
          // same thing, because picking a tile up selects it. See the note in
          // ./stage on why the payload cannot be relied on.
          model: dropped?.id ?? model,
          x: where.x,
          y: where.y,
          z: where.z,
          rotation,
          scale: 1,
        },
        standing,
      )
      write(next)
      if (next) {
        setSelected({
          kind: 'placement',
          index: roomOf(next.document, standing).world.placements.length - 1,
        })
      }
    },
    [standing, blueprint, level, model, rotation, state, write],
  )

  /** Solid ground everywhere at `floorY`, or a catch plane forty cells down. */
  const onGround = useCallback(
    (ground: boolean) => write(setWorld(state, { ground }, standing)),
    [standing, state, write],
  )

  /**
   * The packs this document is built out of, for the picker.
   *
   * Through `write` like every other edit, so adding a pack is one undo step
   * and lands in the same autosaved draft - a panel that quietly changed the
   * document outside the history would be a panel whose changes ctrl-Z cannot
   * reach.
   *
   * `declared` is put back into `PACK_ORDER` rather than left in the order the
   * document happens to list them, because the picker draws its groups in this
   * order and a level should not have its panel rearranged by the order its
   * author happened to reach for things.
   */
  const packScope = useMemo<PackScope>(() => {
    const declared = new Set(state.document.packs.map((pack) => pack.id))
    return {
      declared: PACK_ORDER.filter((id) => declared.has(id)),
      add: (packId: string) => write(addPack(state, packId)),
      remove: (packId: string) => write(removePack(state, packId)),
      use: (packId: string) => packUse(state.document, packId),
    }
  }, [state, write])

  /**
   * Falling past the bottom puts you back at the spawn.
   *
   * The third answer to what is under the world, and the one a platformer needs.
   * Through `setWorld` like the others, so the parser's refusal of `restart`
   * with `ground` on is enforced on the way in rather than discovered on load.
   */
  const onRestart = useCallback(
    (restart: boolean) => write(setWorld(state, { restart }, standing)),
    [standing, state, write],
  )

  /**
   * A fall that kills, which is the other answer to the same question.
   *
   * `setWorld` clears whichever of the two was on, so this is one call rather
   * than a pair the caller has to keep consistent - and the parser refuses a
   * document carrying both, so a pair kept inconsistent is a level that will
   * not reopen.
   */
  const onFatal = useCallback(
    (fatal: boolean) => write(setWorld(state, { fatal }, standing)),
    [standing, state, write],
  )

  /**
   * The mode, through the same pure layer as everything else.
   *
   * `setRules` refuses a preset the world cannot back up, so a panel that
   * offered one would be a panel whose click does nothing - which is why the
   * picker greys those out with the reason instead of finding out here.
   */
  /**
   * Where the world is watched from.
   *
   * `setCamera` refuses a block the parser would reject - a fixed camera with
   * no position, a `span` on a follow camera - and returns null for a no-op, so
   * `write` swallowing null is what keeps clicking the kind you are already on
   * from pushing an undo step that undoes nothing.
   */
  const onCamera = useCallback(
    (patch: Parameters<typeof setCamera>[1]) => write(setCamera(state, patch)),
    [state, write],
  )

  const onRules = useCallback(
    (patch: Parameters<typeof setRules>[1]) => write(setRules(state, patch)),
    [state, write],
  )

  /**
   * Whether the people in this level may say anything.
   *
   * `setTalk` returns null when nothing changed, like `setCamera`, and takes
   * the block away entirely when both switches are back on - so the file only
   * carries one while something is actually off.
   */
  const onTalk = useCallback(
    (patch: Parameters<typeof setTalk>[1]) => write(setTalk(state, patch)),
    [state, write],
  )

  /**
   * What the level is, in a sentence.
   *
   * An empty string removes the field rather than writing one, which is what
   * `describeDocument` is for - see the round-trip rule it states.
   */
  const onBlurb = useCallback(
    (blurb: string) => write(describeDocument(state, blurb)),
    [state, write],
  )

  /**
   * What this level's cartridge is made of, on a shelf.
   *
   * `null` for "say nothing", which is what pressing the current one does -
   * see `finishDocument` and the round-trip rule it shares with the blurb.
   */
  const onFinish = useCallback(
    (finish: Parameters<typeof finishDocument>[1]) => write(finishDocument(state, finish)),
    [state, write],
  )

  /**
   * The shell's colour, as a hue.
   *
   * `null` hands the choice back to the shelf rather than freezing whatever it
   * happened to derive - see `colourDocument`.
   */
  const onColour = useCallback(
    (hue: Parameters<typeof colourDocument>[1]) => write(colourDocument(state, hue)),
    [state, write],
  )

  /**
   * One phrase in one language, and a whole language at a time.
   *
   * Two functions rather than one with a null, because they are different undo
   * steps: taking a language out is one press and has to be one step back, and
   * a loop of `onPhrase` would make it as many steps as there were sentences.
   */
  const onPhrase = useCallback(
    (locale: string, key: string, text: string) => write(setPhrase(state, locale, key, text)),
    [state, write],
  )

  const onLanguageRemove = useCallback(
    (locale: string) => write(removeLanguage(state, locale)),
    [state, write],
  )

  /**
   * The sky, where an empty field means transparent rather than black.
   *
   * The empty string goes straight through: `setWorld` reads it as absence, so
   * clearing the box removes the field and the page shows through again. A
   * panel that translated empty into a colour would make transparent
   * unreachable once anything had been typed.
   */
  const onBackground = useCallback(
    (background: string) => write(setWorld(state, { background }, standing)),
    [standing, state, write],
  )

  /** Who a person arrives as, and what they arrive holding. */
  const onPlayer = useCallback(
    (patch: {
      blueprint?: string | null
      avatarSocket?: string | null
      weapon?: PlayerRole['weapon'] | null
      keys?: readonly PlayerKey[] | null
      /** What everybody wears when this level names no body. See `XpPlayer.wears`. */
      wears?: PlayerLook | null
    }) => write(setPlayerRole(state, patch)),
    [state, write],
  )

  /**
   * Where a person arrives when no mark says otherwise.
   *
   * The document's own `spawn`, which had no way in at all: marks had a panel
   * and a gizmo, and this had a field in a file. It goes through the same pure
   * layer as everything else, so moving the spawn is one undo step and a level
   * whose spawn is off the edge of the world is refused rather than saved.
   */
  const onSpawn = useCallback(
    (patch: Partial<{ x: number; y: number; z: number; facing: number }>) =>
      write(setSpawn(state, patch, standing)),
    [standing, state, write],
  )

  /**
   * Rules, through the same pure layer as everything else.
   *
   * Which means undo works on them, the draft autosaves them, and the property
   * that an edited document still parses covers them: `setTrigger` refuses an
   * empty `do` and a `spawn` naming a blueprint nobody wrote, because both are
   * documents the parser would send back.
   */
  const onTriggerAdd = useCallback(
    (blueprint: string, trigger?: Trigger) => write(addTrigger(state, blueprint, trigger)),
    [state, write],
  )

  const onTriggerChange = useCallback(
    (blueprint: string, index: number, patch: Parameters<typeof setTrigger>[3]) =>
      write(setTrigger(state, blueprint, index, patch)),
    [state, write],
  )

  const onTriggerRemove = useCallback(
    (blueprint: string, index: number) => write(removeTrigger(state, blueprint, index)),
    [state, write],
  )

  const onVerbAdd = useCallback(
    (blueprint: string, trigger: number, verb?: Verb) =>
      write(addVerb(state, blueprint, trigger, verb)),
    [state, write],
  )

  const onVerbChange = useCallback(
    (blueprint: string, trigger: number, index: number, verb: Verb) =>
      write(setVerb(state, blueprint, trigger, index, verb)),
    [state, write],
  )

  const onVerbRemove = useCallback(
    (blueprint: string, trigger: number, index: number) =>
      write(removeVerb(state, blueprint, trigger, index)),
    [state, write],
  )

  /**
   * The keys anybody expects, and nothing surprising.
   *
   * Bound on `window` rather than on the canvas because the canvas is not
   * focusable and a person who just clicked the rail still means undo when they
   * press it.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /**
       * Not while somebody is typing.
       *
       * The textarea is the reason this grew: a script is written in one, and
       * `Backspace` in a script has to delete a character rather than the
       * entity that happened to be selected. The input check was here already
       * and a textarea is not an input, which is the kind of gap that only
       * shows up once there is something to type into.
       */
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return
      }

      /**
       * Nor while the preview is up.
       *
       * The same reason as the textarea, and a worse failure: `W` walks forward
       * in the runtime and raises the editor's build level here, so a person
       * trying the level would come back to a different floor selected and a
       * rotation they never asked for. `Escape` is the one key that still means
       * something, and it means stop.
       */
      if (previewing) {
        if (event.key === 'Escape') setPreviewing(false)
        return
      }
      /**
       * And the movie mode owns the keyboard while it is up, for the same
       * reason: `W` raises the build level here, and coming back from a shot to
       * a floor you never chose reads as the editor having lost your place.
       * Escape is handled inside that component, next to what it closes.
       */
      if (movie) return
      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        setState((current) => (event.shiftKey ? redo(current) : undo(current)))
        return
      }

      /** What is selected, as something that can be put back. */
      const held = () => {
        if (!selected) return null
        if (selected.kind === 'entity') {
          const spec = here.entities[selected.index]
          return spec ? ({ kind: 'entity', spec } as const) : null
        }
        if (selected.kind === 'mark') {
          const spec = here.world.marks[selected.index]
          return spec ? ({ kind: 'mark', spec } as const) : null
        }
        // The player is not in a list and is not copyable: there is one of
        // them, so a paste would have nowhere to go and a cut would take the
        // one thing every level has.
        if (selected.kind === 'player') return null
        const spec = here.world.placements[selected.index]
        return spec ? ({ kind: 'placement', spec } as const) : null
      }

      /** Take the selection away, whichever of the three lists it is in. */
      const drop = (what: NonNullable<Selected>) => {
        if (what.kind === 'entity') onRemove(what.index)
        else if (what.kind === 'mark') onRemoveMark(what.index)
        // Deleting the player is not a thing a level can do - every document
        // has one, and Backspace on it should do nothing rather than pick
        // something else to throw away.
        else if (what.kind === 'placement') onRemovePlacement(what.index)
      }

      // Copy, cut, paste. Cut is a copy and a delete, in that order, so a cut
      // that somehow failed to copy still has not thrown the thing away.
      if (meta && (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'x')) {
        const taken = held()
        if (!taken) return
        event.preventDefault()
        setClipboard(taken)
        if (event.key.toLowerCase() === 'x') drop(selected!)
        return
      }

      if (meta && event.key.toLowerCase() === 'v') {
        if (!clipboard) return
        event.preventDefault()
        /**
         * One cell along, rather than exactly on top.
         *
         * A paste that lands inside the thing it was copied from looks like a
         * paste that did nothing, and the way to find out otherwise is to drag
         * the top one off - which is a puzzle, not an editor. Stepping means a
         * run of pastes walks across the floor, which is also the most likely
         * thing somebody wanted.
         */
        if (clipboard.kind === 'placement') {
          const spec = { ...clipboard.spec, x: clipboard.spec.x + 1, z: clipboard.spec.z + 1 }
          write(addPlacement(state, spec, standing))
          setClipboard({ kind: 'placement', spec })
          setSelected({ kind: 'placement', index: here.world.placements.length })
        } else if (clipboard.kind === 'mark') {
          const spec = { ...clipboard.spec, x: clipboard.spec.x + 1, z: clipboard.spec.z + 1 }
          write(addMark(state, spec, standing))
          setClipboard({ kind: 'mark', spec })
          setSelected({ kind: 'mark', index: here.world.marks.length })
        } else {
          const spec = { ...clipboard.spec, x: clipboard.spec.x + 1, z: clipboard.spec.z + 1 }
          // A name is unique, so a copy cannot keep one - two entities
          // answering to `door` makes `getEntityByName` a coin toss.
          delete spec.name
          /**
           * A save point's number is unique too, for a harder reason.
           *
           * Taking one requires beating the highest reached, and an equal
           * number does not beat it - so a pad pasted with the number it was
           * copied from is a pad that can never be taken. Dropping it here
           * hands the copy back to `addEntity`, which numbers it on from the
           * highest placed, exactly as if it had been dragged in.
           */
          const blueprint = state.document.blueprints[spec.blueprint]
          if (blueprint && savesProgress(blueprint) && 'order' in spec.props) {
            const { order: _dropped, ...rest } = spec.props
            spec.props = rest
          }
          write(addEntity(state, spec, standing))
          setClipboard({ kind: 'entity', spec })
          setSelected({ kind: 'entity', index: here.entities.length })
        }
        return
      }

      /** Take the selection away. */
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selected) return
        event.preventDefault()
        drop(selected)
        return
      }
      switch (event.key.toLowerCase()) {
        case 'r':
          setRotation((current) => (current + 90) % 360)
          break
        case 'b':
          setTool((current) => (current === 'draw' ? 'place' : 'draw'))
          break
        case 'g':
          setGizmo('translate')
          break
        case 't':
          setGizmo('rotate')
          break
        case 'y':
          setGizmo('scale')
          break
        case 'escape':
          setSelected(null)
          break
        case 'e':
          setTool((current) => (current === 'erase' ? 'place' : 'erase'))
          break
        case 'q':
          setLevel((current) => Math.max(0, current - 1))
          break
        case 'w':
          setLevel((current) => current + 1)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Rebound whenever the selection or the removers change. Every other key
    // here uses a functional setter and needs nothing; delete needs to know
    // what is selected *now*, and a stale closure would delete whatever was
    // selected when the level loaded.
    //
    // `here` and `standing` for the same reason one door along: copy reads the
    // room's lists and paste writes into the room, so a closure held over from
    // the last room would copy out of one place and paste into another.
  }, [
    previewing,
    selected,
    clipboard,
    state,
    here,
    standing,
    write,
    onRemove,
    onRemoveMark,
    onRemovePlacement,
  ])

  /**
   * The download, which is what Save means with no host behind it.
   *
   * Still reachable when there *is* one — it is Export there, and it is the
   * same bytes either way.
   */
  const download = useCallback(() => {
    const blob = new Blob([JSON.stringify(state.document, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${id}.xp.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [id, state.document])

  const save = useCallback(async () => {
    if (!onSave) {
      download()
      return
    }

    setSaving({ at: 'saving' })
    const result = await onSave(state.document)
    if (!result.ok) {
      setSaving({ at: 'refused', why: result.error })
      return
    }

    setSaving({ at: 'saved' })
    /**
     * Save writes both places: the project, and the draft beside it.
     *
     * It used to *delete* the draft here, for a reason that was sound and a
     * conclusion that was not. The reason: a draft left lying about gets layered
     * over whatever the next open loads, so a stale one silently replaces newer
     * work. The conclusion - throw it away - traded that for a worse window,
     * because between the save landing and the next edit there was no local copy
     * at all. Anything that made the *next* load fail took the work with it.
     *
     * Stamping it with the version that just landed answers the original worry
     * directly: `restore` drops a draft older than what the page loaded, so a
     * stale one cannot be layered over anything. Nothing has to be deleted to
     * make it safe, and the local copy is never a gap.
     */
    if (result.version !== undefined) savedAs.current = result.version
    try {
      window.localStorage.setItem(
        DRAFT_KEY(id),
        JSON.stringify({ savedAs: savedAs.current, document: state.document } satisfies Draft),
      )
    } catch {
      // A private window, or no room. The save landed, which is the part that
      // matters - this is the belt beside the braces.
    }
    setDraft('clean')
  }, [download, id, onSave, state.document])

  /**
   * The name, in both of the places it is written.
   *
   * The project's is the one on screen and the one that has to land — so it
   * goes first and its answer is what everything else follows, including the
   * numbering a space applies when the name is already taken. The document's is
   * written after, as an ordinary edit, because it travels in the file rather
   * than in the database and there is nothing to gain from writing it if the
   * project refused.
   *
   * Held here rather than read back off the prop: the server component above
   * only re-renders on a navigation, and a title bar that keeps showing the old
   * name until you leave the page is a rename that looks like it failed.
   */
  const [project, setProject] = useState(name ?? null)

  const rename = useCallback(
    async (wanted: string) => {
      if (!onRename) {
        setState((current) => renameDocument(current, wanted) ?? current)
        return { ok: true as const, name: wanted }
      }

      const result = await onRename(wanted)
      if (!result.ok) return result

      setProject(result.name)
      setState((current) => renameDocument(current, result.name) ?? current)
      return result
    },
    [onRename],
  )

  const discard = useCallback(() => {
    try {
      window.localStorage.removeItem(DRAFT_KEY(id))
    } catch {
      // Nothing to do; the reset below is the part that matters.
    }
    setState(editing(onDisk))
    setDraft('clean')
  }, [id, onDisk])

  const counts = useMemo(
    () => ({
      placements: here.world.placements.length,
      entities: here.entities.length,
    }),
    [here],
  )

  /** What the breadcrumb ends with: the selected thing, or the working height. */
  const selectedName = (() => {
    if (!selected) return null
    if (selected.kind === 'entity') {
      const entity = here.entities[selected.index]
      return entity?.name ?? entity?.blueprint ?? null
    }
    if (selected.kind === 'mark') {
      const mark = here.world.marks[selected.index]
      return mark ? `${mark.kind} mark` : null
    }
    if (selected.kind === 'player') return 'player'
    // The model without its pack, which is what the picker shows and what
    // somebody would recognise: `proto/Primitive_Wall` reads as noise in a
    // breadcrumb and `Primitive_Wall` reads as the thing they clicked.
    const piece = here.world.placements[selected.index]
    return piece ? piece.model.slice(piece.model.indexOf('/') + 1) : null
  })()

  /**
   * Which script the panel has open.
   *
   * Here rather than inside the panel because dockview tears a panel's
   * component down and rebuilds it when it is dragged to another group, and a
   * script that closed itself every time somebody rearranged the window would
   * be its own small misery.
   */
  const [script, setScript] = useState<string | null>(null)


  /**
   * Editing scripts, through the same pure layer everything else goes through.
   *
   * Which means undo works on them, the draft autosaves them, and the rule that
   * an edited document still parses covers them too - `removeScript` detaches
   * whatever was running it, because a blueprint naming a script that no longer
   * exists is a document the parser refuses.
   */
  /**
   * What this level keeps — declared, renamed, undeclared.
   *
   * docs/xp/backlog.md §7c. Three one-liners over ./data's pure block edits,
   * exactly like the script four below them: the decision about what a document
   * with a field in it looks like belongs to the format, and this is the part
   * that knows there is an undo stack.
   */
  const onDataWrite = useCallback(
    (name: string, field: XpField) => write(setDataField(state, name, field)),
    [state, write],
  )

  /**
   * Which of the level's rounds the flow panel is editing.
   *
   * Here rather than on `EditState`, and that is the same argument `FlowTarget`
   * makes in the package: `EditState` is the document plus the undo stacks, so
   * putting this there would put it *on the undo stack* - pressing undo would
   * move you to a different round and the panel would be showing something
   * nobody asked to see. Which flow you are looking at is a fact about the
   * screen, so it lives with the other screen facts here.
   *
   * `undefined` is the level's own `flow`, which is what a level with one round
   * has and what the panel opens on.
   */
  const [flowTarget, setFlowTarget] = useState<FlowTarget>(undefined)

  /** Everything you can do to a flow. See ./flow-edits for why it is one hook. */
  const flow = useFlowEdits(state, write, flowTarget)

  /**
   * The places this document holds. See ../panels/scenes for the list.
   *
   * Three callbacks rather than a hook of their own: unlike the flow edits
   * these have no shared parameter to bind and no eighteenth sibling waiting,
   * so a `useScenesEdits` would be ceremony around three lines.
   */
  const onSceneAdd = useCallback(
    (name: string) => write(addScene(state, name)),
    [state, write],
  )
  /**
   * Renaming the room you are standing in leaves you standing in it.
   *
   * `standing` is a key, so a rename would otherwise turn it into a key that
   * names nothing and the derivation above would put you back in `main` - which
   * reads as the editor throwing you out of a room for giving it a better name.
   * Only on a rename that actually happened: a refused one leaves the document
   * alone, and following it would point at a room that was never made.
   */
  const onSceneRename = useCallback(
    (from: string, to: string) => {
      const next = renameScene(state, from, to)
      write(next)
      if (next && openRoom === from) setOpenRoom(to)
    },
    [openRoom, state, write],
  )
  const onSceneRemove = useCallback(
    (name: string) => write(removeScene(state, name)),
    [state, write],
  )

  /**
   * The movie half: which places are shots, and the cuts made out of them.
   *
   * ---------------------------------------------------------------------------
   * Opening one is a mode, and it is held here rather than routed
   * ---------------------------------------------------------------------------
   * `movie` is the same shape `previewing` is and for the same reasons: the
   * draft lives in this component's state and in `localStorage`, so a route
   * change would either lose it or have to serialise it, and neither is worth
   * paying for a screen that Escape closes.
   *
   * It is a *discriminated* piece of state rather than two booleans because the
   * two things it can open are different documents - a shot is one place over
   * time, a cut is shots in order - and a pair of flags has a fourth state
   * (both open) that means nothing.
   */
  const onMovieNew = useCallback(() => {
    const made = addMovie(state)
    if (!made) return
    write(made.state)
    // Straight into it, because an empty stage in a list is not something to
    // admire - the next thing anybody does is put a body on it, and that is a
    // gesture this panel does not have.
    setMovie({ kind: 'shot', where: made.name })
  }, [state, write])
  const onMovieImport = useCallback(
    (into: PlaceTarget, from: string) => write(importPlace(state, into, from)),
    [state, write],
  )
  const onMovieStop = useCallback(
    (where: PlaceTarget) => write(removeMovie(state, where)),
    [state, write],
  )
  const onMovieOpen = useCallback((where: PlaceTarget) => setMovie({ kind: 'shot', where }), [])
  const onCutAdd = useCallback(() => {
    const made = addSequence(state)
    if (!made) return
    write(made.state)
    // Straight into the composer, because a cut with nothing in it is not
    // something to admire in a list - the next thing anybody does with one is
    // put a shot in it, and that is not a gesture this panel has.
    setMovie({ kind: 'cut', id: made.id })
  }, [state, write])
  const onCutRename = useCallback(
    (id: string, name: string) => write(renameSequence(state, id, name)),
    [state, write],
  )
  const onCutRemove = useCallback(
    (id: string) => write(removeSequence(state, id)),
    [state, write],
  )
  const onCompose = useCallback((id: string) => setMovie({ kind: 'cut', id }), [])

  /**
   * Every writer the movie panels need, bound to the place being shot.
   *
   * Bound here rather than passed as `state` and `write` for the reason the
   * flow edits are a hook: the movie mode should not have to know that an edit
   * is a function from a state to a state, or which room it is aimed at. It
   * knows about shots.
   */
  const movieWhere = movie?.kind === 'shot' ? movie.where : undefined
  const movieEdits = useMemo(
    () => ({
      onSetMovie: (patch: Parameters<typeof setMovieBlock>[1]) =>
        write(setMovieBlock(state, patch, movieWhere)),
      onKey: (entity: string, property: string, value: number, at: number) =>
        write(
          putEntityKey(
            state,
            entity,
            property,
            // `smooth` rather than `linear`, because the thing an author is
            // describing when they key two positions is a move rather than a
            // ramp, and a shot made of straight lines reads as a robot arm.
            { t: at, value, ease: 'smooth' },
            movieWhere,
          ),
        ),
      onKeys: (entity: string, values: Readonly<Record<string, number>>, at: number) =>
        write(putEntityKeys(state, entity, values, at, movieWhere)),
      onKeyEase: (entity: string, property: string, index: number, ease: Ease) =>
        write(setKeyEase(state, entity, property, index, ease, movieWhere)),
      onDropKey: (entity: string, property: string, index: number) =>
        write(dropEntityKey(state, entity, property, index, movieWhere)),
      onClearKeys: (entity: string) => write(clearEntityKeys(state, entity, movieWhere)),
      onAddCamera: (framing: Parameters<typeof addCamera>[1]) => {
        const made = addCamera(state, framing, movieWhere)
        if (made) write(made.state)
      },
      onRemoveCamera: (name: string) => write(removeCamera(state, name, movieWhere)),
      onDropFraming: (camera: string, index: number) =>
        write(dropFraming(state, camera, index, movieWhere)),
      onRenameCamera: (from: string, to: string) =>
        write(renameCamera(state, from, to, movieWhere)),
      onFraming: (camera: string, framing: Parameters<typeof putFraming>[2]) =>
        write(putFraming(state, camera, framing, movieWhere)),
      onCameraEase: (camera: string, ease: boolean) =>
        write(setCameraEase(state, camera, ease, movieWhere)),
      onCut: (at: number, camera: string) => write(putCut(state, { t: at, camera }, movieWhere)),
      onDropCut: (index: number) => write(dropCut(state, index, movieWhere)),
      onCue: (entity: string, clip: string, loop: boolean, at: number) =>
        write(
          putAction(
            state,
            { kind: 'play', t: at, duration: 1.5, entity, clip, loop },
            movieWhere,
          ),
        ),
      onSay: (entity: string, text: string, seconds: number, at: number) =>
        write(
          putAction(state, { kind: 'say', t: at, duration: seconds, entity, text }, movieWhere),
        ),
      onAction: (action: XpAction) => write(putAction(state, action, movieWhere)),
      onDropAction: (index: number) => write(dropAction(state, index, movieWhere)),
      onSetAction: (index: number, patch: Partial<XpAction>) =>
        write(setAction(state, index, patch, movieWhere)),
      onBake: (index: number) => write(bakeAction(state, index, movieWhere)),
      onLift: (entity: string) => write(liftKeys(state, entity, movieWhere)),
      /**
       * Written out rather than reusing `onClips`, which is declared below.
       *
       * A `const` referenced above its declaration is a **temporal dead zone**
       * error, and this one took the whole editor down with a 500 rather than
       * failing quietly - `movieEdits` is a `useMemo` that runs on the first
       * render, so the crash is at mount. Moving the declaration would work and
       * would leave the same trap set for the next thing added here; two lines
       * that depend on nothing but `state` and `write` cannot spring it.
       */
      onClips: (clips: Readonly<Record<string, XpClip>>) => write(setClips(state, clips)),
      /**
       * A pose saved and put on the body, in **one** edit.
       *
       * Two calls - `onClips` then `onCue` - is what this was, and it silently
       * lost the clip: both derive their next document from the same `state`,
       * which is this render's, so the second overwrote the first. Nothing
       * threw; the pose simply was not in the file afterwards, and the only
       * way to notice was to look.
       *
       * Chaining is the fix, and it is also one undo step rather than two,
       * which is what "turn a bone" should cost.
       */
      onPose: (entity: string, clips: Readonly<Record<string, XpClip>>, clip: string, at: number) => {
        const saved = setClips(state, clips)
        if (!saved) return

        /*
         * Any earlier cue of this same clip, wherever it was put.
         *
         * A pose clip's start *moves*: key a pose before the first one and the
         * whole thing rebases to zero and begins earlier - see `rebased`. A cue
         * left at the old time plays the animation from the wrong moment, and
         * a second cue beside it plays it twice. Walked backwards so that
         * dropping one does not shift the index of the next.
         */
        const timeline = placeIn(saved.document, movieWhere)?.timeline
        let next = saved
        for (let i = (timeline?.actions.length ?? 0) - 1; i >= 0; i -= 1) {
          const one = timeline!.actions[i]!
          if (
            one.entity === entity &&
            one.kind === 'play' &&
            one.clip === clip &&
            Math.abs(one.t - at) > 0.001
          ) {
            next = dropAction(next, i, movieWhere) ?? next
          }
        }

        // As long as the clip itself, so the whole animation plays rather than
        // the first two seconds of it. A single-sample pose has no length and
        // is held for a readable moment instead.
        const length = clips[clip]?.duration ?? 0
        const cued = putAction(
          next,
          {
            kind: 'play',
            t: at,
            duration: length > 0 ? length : 2,
            entity,
            clip,
            loop: false,
          },
          movieWhere,
        )
        write(cued ?? next)
      },
      onAddActor: (model: string, at: { x: number; y: number; z: number }) => {
        const made = addActor(state, model, at, movieWhere)
        if (made) write(made.state)
      },
      onRemoveActor: (entity: string) => {
        const place = placeIn(state.document, movieWhere)
        const index = place?.entities.findIndex((one) => one.name === entity) ?? -1
        // `removeEntity` takes the children with it, which is what a person
        // means by deleting a group - see its own note.
        if (index >= 0) write(removeEntity(state, index, movieWhere))
      },
      onDuplicateActor: (entity: string) => {
        // By name, for the reason `onSetActor` gives just below: the panel never
        // holds an index, and an index is a fact about the array's order.
        const place = placeIn(state.document, movieWhere)
        const index = place?.entities.findIndex((one) => one.name === entity) ?? -1
        if (index < 0) return
        const made = duplicateEntity(state, index, movieWhere)
        if (made) write(made.state)
      },
      onSetActor: (entity: string, patch: Partial<EntitySpec>) => {
        /*
         * By name, because that is what the movie panel has - it never sees an
         * index, and it should not: an index is a fact about the array's order,
         * which the editor is free to change under it.
         */
        const place = placeIn(state.document, movieWhere)
        const index = place?.entities.findIndex((one) => one.name === entity) ?? -1
        if (index >= 0) write(setEntity(state, index, patch, movieWhere))
      },
      onAddEmpty: (at: { x: number; y: number; z: number }) => {
        const made = addNode(state, at, movieWhere)
        if (made) write(made.state)
      },
      onParent: (entity: string, parent: string | null) =>
        write(setParent(state, entity, parent, movieWhere)),
      onMoveActor: (entity: string, at: number, to: { x: number; y: number; z: number }) =>
        write(moveActorAt(state, entity, at, to, movieWhere)),
      onMoveActors: (
        entities: readonly string[],
        at: number,
        by: { x: number; y: number; z: number },
      ) => write(moveActorsAt(state, entities, at, by, movieWhere)),
      onMoveFraming: (
        camera: string,
        index: number,
        what: 'position' | 'target',
        to: { x: number; y: number; z: number },
      ) => write(moveFraming(state, camera, index, to, what, movieWhere)),
    }),
    [movieWhere, state, write],
  )

  /** And the composer's, which are about the cut rather than about a place. */
  const composing = movie?.kind === 'cut' ? movie.id : null
  const composerEdits = useMemo(
    () => ({
      onAddTake: (scene: string, atIndex?: number) =>
        composing ? write(addTake(state, composing, scene, atIndex)) : undefined,
      onSetTake: (index: number, patch: { from?: number; to?: number; speed?: number }) =>
        composing ? write(setTake(state, composing, index, patch)) : undefined,
      onCopyTake: (index: number) => (composing ? write(copyTake(state, composing, index)) : undefined),
      onDropTake: (index: number) => (composing ? write(dropTake(state, composing, index)) : undefined),
      onMoveTake: (from: number, to: number) =>
        composing ? write(moveTake(state, composing, from, to)) : undefined,
    }),
    [composing, state, write],
  )

  /**
   * A way into another room, put down in this one.
   *
   * Lands under the pointer rather than at the origin, the same as a new mark
   * and for the same reason: four doors at 0,0 is a pile somebody has to drag
   * apart, and the origin is where they all end up. Falling back to the working
   * level's origin covers the author who opened the Places list first and has
   * never had the pointer over the viewport.
   *
   * Selected afterwards and its blueprint opened, because a door is a thing
   * with a rule on it and the next thing anybody does is look at where it goes.
   */
  const onDoor = useCallback(
    (to: string) => {
      const at = hover.current ?? { x: 0, y: level, z: 0 }
      const made = addDoor(state, to, at, standing)
      if (!made) return
      write(made.state)
      setSelected({
        kind: 'entity',
        index: roomOf(made.state.document, standing).entities.length - 1,
      })
      setBlueprint(made.name)
    },
    [standing, level, state, write],
  )

  const onDataRename = useCallback(
    (from: string, to: string) => write(renameDataField(state, from, to)),
    [state, write],
  )

  const onDataRemove = useCallback(
    (name: string) => write(removeDataField(state, name)),
    [state, write],
  )

  const onScriptAdd = useCallback(
    (name: string) => write(addScript(state, name)),
    [state, write],
  )

  const onScriptWrite = useCallback(
    (name: string, source: string) => write(writeScript(state, name, source)),
    [state, write],
  )

  const onScriptRename = useCallback(
    (from: string, to: string) => write(renameScript(state, from, to)),
    [state, write],
  )

  const onScriptRemove = useCallback(
    (name: string) => write(removeScript(state, name)),
    [state, write],
  )

  const onScriptAttach = useCallback(
    (blueprint: string, name: string | null) => write(setBlueprintScript(state, blueprint, name)),
    [state, write],
  )

  /**
   * The animator's library, into the document.
   *
   * Through the edit layer like everything else here, which is what makes it
   * undoable and what puts it in the autosaved draft - a clip somebody spent an
   * afternoon on that survived only until the tab closed would be the worst kind
   * of "saved".
   */
  const onClips = useCallback(
    (clips: Readonly<Record<string, XpClip>>) => write(setClips(state, clips)),
    [state, write],
  )

  /**
   * The kinds of thing a level contains, through the same pure layer.
   *
   * Which means undo works on them and the draft autosaves them - and, the one
   * that is not obvious, that a rename cannot leave a dangling reference: the
   * edit layer walks the entities, the player and every `spawn` verb, because a
   * blueprint name that no longer resolves is a document the parser refuses.
   */
  const onBlueprintAdd = useCallback(
    (name: string) => write(addBlueprint(state, name)),
    [state, write],
  )

  /**
   * A ready-made kind of thing, in one press and one undo step.
   *
   * The whole blueprint - model, collider and rule - goes into `addBlueprint`'s
   * partial rather than being built up with `addTrigger` afterwards, because
   * two calls are two entries on the undo stack for something somebody did
   * once. It is still the ordinary edit layer, so a starter cannot write a
   * document the panel could not have written by hand.
   *
   * The name is suffixed rather than refused when it is taken. A second save
   * point in a level is a *third* thing somebody wants and not a mistake to be
   * told about - a course can have two kinds of pad - and `addBlueprint`
   * refuses a name that exists, so the alternative is a button that silently
   * does nothing on the second press.
   */
  const onStarterAdd = useCallback(
    (id: StarterId) => {
      const starter = STARTERS.find((entry) => entry.id === id)
      if (!starter) return
      let name = starter.name
      for (let n = 2; name in state.document.blueprints; n++) name = `${starter.name}-${n}`
      /**
       * A body is added *as* the body, in the same step.
       *
       * `addBody` is `addBlueprint` and `setPlayerRole` under one commit - see
       * its own note. The whole reason the player starter exists is that a
       * blueprint nothing arrives as is not the player, so making one and
       * leaving the document to be told separately would be the same dead end
       * with a shortcut in front of it.
       */
      const next = starter.body
        ? addBody(state, name, starter.blueprint)
        : addBlueprint(state, name, starter.blueprint)
      if (!next) return
      write(next)
      // Opened, so the next thing anybody does - place it, or change what it
      // looks like - is in front of them rather than one list away.
      setBlueprint(name)
    },
    [state, write],
  )

  const onBlueprintChange = useCallback(
    (name: string, patch: Parameters<typeof writeBlueprint>[2]) =>
      write(writeBlueprint(state, name, patch)),
    [state, write],
  )

  const onBlueprintRename = useCallback(
    (from: string, to: string) => write(renameBlueprint(state, from, to)),
    [state, write],
  )

  const onBlueprintRemove = useCallback(
    (name: string) => write(removeBlueprint(state, name)),
    [state, write],
  )

  /**
   * The models a blueprint is made of, through the same pure layer.
   *
   * Which means undo covers them and the draft autosaves them - and, the one
   * worth stating, that a part cannot be hung in a loop: `setPart` refuses it
   * here rather than leaving it to `partTransforms`' depth guard, which stops
   * but returns a *number*, and a number is something you argue with rather
   * than notice.
   */
  const onPartAdd = useCallback(
    (blueprint: string) => write(addPart(state, blueprint)),
    [state, write],
  )

  const onPartChange = useCallback(
    (blueprint: string, index: number, patch: Partial<Part>) =>
      write(setPart(state, blueprint, index, patch)),
    [state, write],
  )

  const onPartRemove = useCallback(
    (blueprint: string, index: number) => write(removePart(state, blueprint, index)),
    [state, write],
  )

  const api = useMemo(
    () => ({
      state,
      tool,
      setTool,
      model,
      setModel,
      rotation,
      setRotation,
      level,
      setLevel,
      selected,
      setSelected,
      gizmo,
      setGizmo,
      snap,
      setSnap,
      pivot,
      setPivot,
      onStroke,
      onErase,
      onEntity,
      onPlacement,
      onRemove,
      onRemovePlacement,
      onAddMark,
      onBlueprintFrom,
      onMark,
      onRemoveMark,
      onGround,
      onRestart,
      onFatal,
      onBackground,
      onColour,
      onFinish,
      onRules,
      onCamera,
      onTalk,
      onRenameDocument: rename,
      onBlurb,
      onPhrase,
      onLanguageRemove,
      onPlayer,
      onSpawn,
      onTriggerAdd,
      onTriggerChange,
      onTriggerRemove,
      onVerbAdd,
      onVerbChange,
      onVerbRemove,
      onHover,
      onDropModel,
      blueprint,
      setBlueprint,
      script,
      setScript,
      onDataWrite,
      ...flow,
      flowTarget,
      setFlowTarget,
      here,
      standing,
      onOpenRoom,
      onDoor,
      onSceneAdd,
      onSceneRename,
      onSceneRemove,
      onMovieNew,
      onMovieStop,
      onMovieImport,
      onMovieOpen,
      onCutAdd,
      onCutRename,
      onCutRemove,
      onCompose,
      onDataRename,
      onDataRemove,
      onScriptAdd,
      onScriptWrite,
      onScriptRename,
      onScriptRemove,
      onScriptAttach,
      onClips,
      onBlueprintAdd,
      onStarterAdd,
      onBlueprintChange,
      onBlueprintRename,
      onBlueprintRemove,
      onPartAdd,
      onPartChange,
      onPartRemove,
      /**
       * Clicking a thing in the viewport selects it.
       *
       * The id an instanced pick reports is the entity's index in the document,
       * which is what `selected` already means - the translation from a buffer
       * slot back to an entity happens in the instancer, where the two lists are
       * built in one pass and cannot drift.
       */
      onPick: setSelected,
    }),
    [
      state,
      tool,
      model,
      rotation,
      level,
      selected,
      gizmo,
      snap,
      pivot,
      onStroke,
      onErase,
      onEntity,
      onPlacement,
      onRemove,
      onRemovePlacement,
      onAddMark,
      onBlueprintFrom,
      onMark,
      onRemoveMark,
      onGround,
      onRestart,
      onFatal,
      onBackground,
      onColour,
      onFinish,
      onRules,
      onCamera,
      onTalk,
      rename,
      onBlurb,
      onPhrase,
      onLanguageRemove,
      onPlayer,
      onSpawn,
      onTriggerAdd,
      onTriggerChange,
      onTriggerRemove,
      onVerbAdd,
      onVerbChange,
      onVerbRemove,
      onHover,
      onDropModel,
      blueprint,
      script,
      onDataWrite,
      flow,
      here,
      standing,
      onOpenRoom,
      onDoor,
      onMovieNew,
      onMovieStop,
      onMovieImport,
      onMovieOpen,
      onCutAdd,
      onCutRename,
      onCutRemove,
      onCompose,
      onDataRename,
      onDataRemove,
      onScriptAdd,
      onScriptWrite,
      onScriptRename,
      onScriptRemove,
      onScriptAttach,
      onClips,
      onBlueprintAdd,
      onStarterAdd,
      onBlueprintChange,
      onBlueprintRename,
      onBlueprintRemove,
      onPartAdd,
      onPartChange,
      onPartRemove,
    ],
  )

  const railActions = [
    {
      id: 'try',
      label: t.tryIt,
      icon: 'play' as const,
      onSelect: () => setPreviewing(true),
      disabled: previewing || movie !== null,
    },
  ]

  return (
    <WindowChrome
      {...(backHref ? { back: { href: backHref, label: t.leave } } : {})}
      {...(onMenu ? { menu: { onOpen: onMenu, label: t.menu } } : {})}
      title={
        <EditableTitle
          name={project ?? state.document.name}
          onRename={rename}
          max={XP_NAME_MAX}
        />
      }
      subtitle={`${counts.placements} ${t.placements} · ${counts.entities} ${t.entities}`}
      toolbar={<ToolBar tool={tool} onTool={setTool} />}
      actions={
        <>
          <Chip onClick={() => setState(undo(state))} label={t.undo} disabled={!canUndo(state)} />
          <Chip onClick={() => setState(redo(state))} label={t.redo} disabled={!canRedo(state)} />
          <Chip
            onClick={save}
            label={saving.at === 'saving' ? t.saving : t.save}
            disabled={saving.at === 'saving'}
            primary
          />
          {onSave ? <Chip onClick={download} label={t.export} /> : null}
          {saving.at === 'saved' ? (
            <span className="font-mono text-[10px] text-neutral-500">saved</span>
          ) : null}
          {/*
            A refusal is the whole message, not the first forty characters of it.

            It was a `max-w-64 truncate` span at ten pixels, in a row of chips -
            so "Somebody else has this project open. It frees up on its own if
            they have gone." arrived as "Somebody else has this pro…" and read as
            decoration. Every refusal this can produce is one a person can act on,
            and the acting starts with reading it, so it wraps and it is allowed
            to be as tall as it needs.
          */}
          {saving.at === 'refused' ? (
            <span
              role="alert"
              className="max-w-80 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 font-mono text-[10px] leading-relaxed text-amber-300"
            >
              {saving.why}
            </span>
          ) : null}
          {draft !== 'clean' ? (
            <button
              type="button"
              onClick={discard}
              title={t.goBackToDisk}
              className="font-mono text-[10px] text-neutral-600 underline-offset-4 hover:text-neutral-300 hover:underline"
            >
              draft
            </button>
          ) : null}
        </>
      }
    >
      <div className="relative flex h-full min-h-0 flex-col">
        {previewing ? (
          <Preview
            document={state.document}
            /* Try means try *this* room. See `askedFor` in ../_runtime/standing. */
            openIn={standing ?? MAIN_SCENE}
            onStop={() => setPreviewing(false)}
          />
        ) : null}
        {/*
          The movie, over everything, the way Try is.

          Mounted beside Try rather than instead of it, and the two cannot both
          be up: the rail's Try button is disabled while a movie is open for the
          same reason it is disabled while a preview is running.
        */}
        {movie?.kind === 'shot' ? (
          <MovieMode
            document={state.document}
            where={movie.where}
            onClose={() => setMovie(null)}
            /**
             * Out to the animator, on the rig the selected body wears.
             *
             * Closing and opening in one act, because they are one act: a mode
             * that closed and left somebody looking at the level wondering
             * where the animator went is worse than not offering the button.
             *
             * The rig is not passed on - the animator holds its own, and a
             * panel that reached in to set it would be reaching past a
             * component boundary for a preference the author can change in one
             * click. What the button promises is "here is where you make one",
             * and that is what it does.
             */
            onAnimate={() => {
              setMovie(null)
              if (dock) toggleWindow(dock, 'animator', windowTitles.animator)
            }}
            edits={movieEdits}
          />
        ) : null}
        {/*
          And the composer, which is the same overlay over a different document:
          a cut is shots in order rather than one place over time.

          Closes itself when the cut it is showing is gone - which happens when
          another lane deletes it, or when undo reaches back past the press that
          made it. A composer left open over nothing is a screen with no way out
          but Escape, and the person looking at it does not know that.
        */}
        {movie?.kind === 'cut' && state.document.sequences?.[movie.id] ? (
          <Composer
            document={state.document}
            id={movie.id}
            sequence={state.document.sequences[movie.id]!}
            onClose={() => setMovie(null)}
            edits={composerEdits}
          />
        ) : null}
        <div className="flex min-h-0 flex-1">
          {/*
           * Try lives in the rail's second zone rather than beside Save, and
           * that is the zone's whole point: it is not a panel toggle and not
           * a document action. It goes somewhere. Beside Save it read as one
           * of the things that writes, which is the one thing it does not do.
           * The phone strip draws the same list at its end.
           */}
          {narrow ? (
            <div className="min-w-0 flex-1">
              <EditorProvider api={api}>
                <PackScopeProvider value={packScope}>
                  <MobileShell windows={TOOL_WINDOWS} actions={railActions} />
                </PackScopeProvider>
              </EditorProvider>
            </div>
          ) : (
            <>
              <IconRail
                windows={TOOL_WINDOWS}
                open={open}
                onToggle={(panel) => {
                  if (dock) toggleWindow(dock, panel, windowTitles[panel])
                }}
                actions={railActions}
              />
              <div className="min-w-0 flex-1">
                <EditorProvider api={api}>
                  <PackScopeProvider value={packScope}>
                    <Dock id={id} onApi={onDockApi} />
                  </PackScopeProvider>
                </EditorProvider>
              </div>
            </>
          )}
        </div>

        <StatusBar
          crumbs={['xp', id, selectedName ?? `y = ${level}`]}
          right={
            <>
              {/* The toolbar's word for it, not the id: `rect` is drawn as Fill
                  up there, and a readout that disagrees with the control it
                  reports is one the eye stops trusting. */}
              <span>{t.toolNames[tool] ?? tool}</span>
              <span>
                {counts.placements} {t.placements}
              </span>
              <span>
                {counts.entities} {t.entities}
              </span>
              <span className={draft === 'clean' ? undefined : 'text-amber-500/80'}>
                {draft === 'clean' ? t.onDisk : t.draft}
              </span>
            </>
          }
        />
      </div>
    </WindowChrome>
  )
}

/**
 * The level, played, over the top of the editor that made it.
 *
 * Over rather than beside: two live WebGL contexts is a cost worth paying once
 * (the dock stays mounted, so a layout somebody spent thirty seconds arranging
 * survives a try-out) and not worth paying continuously - a preview panel
 * tabbed next to the viewport would run the whole runtime, physics and all,
 * every second somebody was building rather than playing.
 *
 * The document is a **snapshot**, taken when the button is pressed. `XpScene`
 * re-seeds only when the document *id* changes, so a live prop would already
 * have been ignored; taking the copy explicitly says which of the two that is,
 * and means an edit that somehow arrives mid-run cannot half-apply.
 *
 * There is no save, no session and no room: this is the one screen in the
 * project where looking at the thing costs nothing at all.
 */
function Preview({
  document,
  openIn,
  onStop,
}: {
  document: XpDocument
  /**
   * The room to start in, which is the one being edited.
   *
   * A name rather than a `PlaceTarget`, because absent has to mean "the
   * document decides" here and the editor's `undefined` means the opposite -
   * the level's own world, which `MAIN_SCENE` names. A level whose `enter` is a
   * back room would otherwise open there when somebody pressed Try standing in
   * the front one.
   */
  openIn: string
  onStop: () => void
}) {
  const t = xpEditorDict(useLocale()).shell
  // Frozen on mount. A `useState` initialiser rather than a `useRef`, because a
  // ref would have to be written during render to say the same thing.
  const [snapshot] = useState(document)

  /**
   * Which shape of screen this is being tried on.
   *
   * docs/xp/editor.md §1.4's cheap half: not three devices side by side - that
   * is the transport work §6 is gated behind - just the *frame*, so a level
   * built at a desk can be looked at the way most people will actually meet
   * it. `touch` on `XpScene` is the other half: a phone has no keyboard, and a
   * preview that left the mouse controls on would be answering a question
   * nobody asked.
   */
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop')

  /**
   * Everything the level has said this run, and whether it is being looked at.
   *
   * The ticker over the scene shows the last few and fades them, which is right
   * while playing and useless while building: a rule that fired twenty seconds
   * ago has nothing left to look at, and "did that do anything?" is the question
   * an author asks most.
   *
   * Collected whether or not the panel is open, so opening it shows what already
   * happened rather than starting from the moment somebody wondered.
   */
  const [log, setLog] = useState<readonly { id: number; text: string }[]>([])
  const [logging, setLogging] = useState(false)

  /**
   * ---------------------------------------------------------------------------
   * One noise in development, and what it is not
   * ---------------------------------------------------------------------------
   * Opening this in `next dev` logs `Cannot read properties of null (reading
   * 'addEventListener')` from inside R3F's `Canvas`. It connects its events to
   * the div it is inside from an `async` block in a layout effect, and Strict
   * Mode's simulated remount detaches that ref between the two - so the promise
   * resolves against a `null` container. Nothing in the tree can catch it: it is
   * a throw inside somebody else's promise.
   *
   * **It does not happen with Strict Mode off**, which is every build, and it
   * costs nothing when it does: all of this runtime's input is bound to
   * `window` rather than to R3F's event layer, so the connection it failed to
   * make is one nothing here uses. Measured both ways by driving the editor in a
   * real browser rather than reasoned about - the play route does not trip it,
   * and this does, and the difference is only when the canvas mounts.
   *
   * Deferring the mount by a frame was tried and does not help, which is the
   * useful half of knowing this: the window is inside React's own remount, not
   * inside layout.
   */

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-neutral-950">
      <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-300">
          {t.tryingIt}
        </span>
        <span className="truncate font-mono text-[10px] text-neutral-500">
          {snapshot.name} {t.asItStands}
        </span>
        {/*
          And which room, when it is not the level's own.

          Silent for `main`, which is every level with one place in it and every
          author who has not gone anywhere - a chip that said "starting in main"
          on every preview would be a chip nobody reads by the second day.
        */}
        {openIn === MAIN_SCENE ? null : (
          <span className="shrink-0 rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
            {fill(t.tryingRoom, { room: openIn })}
          </span>
        )}
        {/*
          The two frames, as a pair of chips rather than a select: there are
          two of them and both fit, and a menu to change something you are
          looking at is a click and a read where a chip is a click.
        */}
        <span className="ml-auto flex items-center gap-1">
          {(['desktop', 'phone'] as const).map((which) => (
            <button
              key={which}
              type="button"
              onClick={() => setDevice(which)}
              aria-pressed={device === which}
              className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
                device === which
                  ? 'bg-violet-500/15 text-violet-300'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {which}
            </button>
          ))}
        </span>

        {/*
          The count on the button, so it is worth opening rather than a drawer
          somebody has to check. A level saying nothing at all is the answer to
          "did my rule fire" without opening anything.
        */}
        <button
          type="button"
          onClick={() => setLogging((was) => !was)}
          aria-pressed={logging}
          className={`ml-auto rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
            logging
              ? 'bg-violet-500/15 text-violet-300'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Log {log.length > 0 ? `· ${log.length}` : ''}
        </button>

        <button
          type="button"
          onClick={onStop}
          className="rounded border border-neutral-800 px-2 py-0.5 font-mono text-[10px] text-neutral-300 transition-colors hover:border-neutral-600"
        >
          {t.stop}
        </button>
      </div>
      {/*
        The phone frame is a *letterbox*, not a second runtime.

        The scene fills whatever box it is given, so narrowing the box is the
        whole of it - the camera's aspect, the HUD's wrapping and the touch
        layout's placement all follow from the size, which is why this answers
        the question at all. Keyed on the device so switching remounts: the
        canvas takes its drawing buffer from the container it mounted into, and
        R3F resizes it without re-deriving what the runtime built from it.
      */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          data-frame={device}
          /*
            The ratio is an inline style rather than `aspect-[9/19.5]`, and
            that is not a preference: Tailwind reads the slash in an arbitrary
            value as the start of a modifier, so the decimal half is dropped
            and the class produces nothing at all. Measured, not guessed - the
            frame stayed the desktop's 918×567 with the utility on it.
          */
          style={device === 'phone' ? { aspectRatio: '9 / 19.5' } : undefined}
          className={
            device === 'phone'
              ? 'h-full w-auto max-w-full overflow-hidden rounded-2xl border border-neutral-800'
              : 'h-full w-full'
          }
        >
          <XpScene
            key={device}
            xp={snapshot}
            openIn={openIn}
            /*
              Forced *on* for the phone frame, and otherwise left to the device.

              `undefined` and `false` are not the same answer, and the
              difference is the whole of this: `false` says "there is no touch
              here, whatever the pointer reports", which was exactly wrong on
              the one machine that most wanted a thumbstick - an author trying
              their level *from* a phone. The frame defaults to desktop, so
              every preview opened on glass forced the mouse layout on and drew
              no controls at all, on a device with no keyboard to fall back to.

              Absent hands the question back to `useIsTouch`, which asks the
              real pointer. So the chip still does what it says on a desktop -
              phone shows what a thumb would see - and on a phone it can only
              ever confirm what the device already is.
            */
            touch={device === 'phone' ? true : undefined}
            onLog={setLog}
          />
        </div>
      </div>

      {/*
        The transcript, under the level rather than over it.
        Over would be the ticker again, and the ticker is already there - what
        this adds is the part the ticker deliberately throws away.
      */}
      {logging ? (
        <div className="flex h-40 shrink-0 flex-col border-t border-neutral-800 bg-neutral-950">
          <div className="flex items-baseline justify-between border-b border-neutral-900 px-3 py-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              {t.log} · {log.length}
            </span>
            {/* Said out loud, because a log that silently stops keeping things
                is a log somebody trusts about the wrong period. */}
            {log.length >= LOG_LINES ? (
              <span className="font-mono text-[10px] text-neutral-600">
                {fill(t.oldestDropped, { n: LOG_LINES })}
              </span>
            ) : null}
          </div>

          {log.length === 0 ? (
            <Hint className="px-3 py-2">
              Nothing said yet. A pickup collected, a script&rsquo;s `log`, a
              rule that refused — they all land here.
            </Hint>
          ) : (
            /*
              Newest last and scrolled to the bottom, which is the order a
              transcript reads in. Newest *first* was the other option and it is
              wrong for the question this answers: "what happened, and then
              what" is a sequence, and reading a sequence backwards to work out
              what set something off is the thing the ticker already makes you
              do.
            */
            <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
              {log.map((line, index) => (
                <li
                  key={line.id}
                  className="flex gap-2 font-mono text-[10px] leading-relaxed text-neutral-400"
                >
                  <span className="shrink-0 tabular-nums text-neutral-700">{index + 1}</span>
                  <span className="min-w-0 break-words">{line.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** A title-bar button. Small, quiet, and the only chrome that does anything. */
function Chip({
  onClick,
  label,
  disabled,
  primary,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  /**
   * The one chip that writes.
   *
   * Save sat in a row of four identical hairline buttons, and which of them
   * was the one that mattered was a thing you read rather than saw. A filled
   * chip in the editor's own accent is the same rule the product's buttons
   * follow - if it is lit, it is the thing to press - and there is exactly one
   * of them per bar.
   */
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed ${
        primary
          ? 'border border-violet-500/50 bg-violet-500/20 text-violet-100 hover:border-violet-400/70 hover:bg-violet-500/30 disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-700'
          : 'border border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:bg-white/[0.03] disabled:text-neutral-700 disabled:hover:border-neutral-800 disabled:hover:bg-transparent'
      }`}
    >
      {label}
    </button>
  )
}
