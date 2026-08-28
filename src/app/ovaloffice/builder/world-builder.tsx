'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useStore, useThree } from '@react-three/fiber'
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eraser,
  Link2,
  Orbit,
  Redo2,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BuilderPanel } from '@/app/ovaloffice/builder/builder-panel'
import { BuildStage } from '@/app/ovaloffice/builder/build-stage'
import { ModelPicker } from '@/app/ovaloffice/builder/model-picker'
import { type OpenedWorld, PublishPanel } from '@/app/ovaloffice/builder/publish-panel'
import {
  loadAutosave,
  saveAutosave,
} from '@/app/ovaloffice/builder/saves'
import {
  capturePng,
  capturePoster,
  type CaptureParts,
  download,
} from '@/app/ovaloffice/studio/capture'
import { DEFAULT_MODEL } from '@/domain/builder/catalogue'
import {
  type Cell,
  cellsForCapped,
  DRAGGED,
  MAX_CELLS_PER_STROKE,
  type Tool,
} from '@/domain/builder/draw'
import { stampText, type TextOptions } from '@/domain/builder/glyphs'
import { MAX_SHARE_LENGTH, shareUrl } from '@/domain/builder/share'
import {
  type BuilderWorld,
  columnTop,
  DEFAULT_MARK,
  DEFAULT_WORLD,
  erase,
  MAX_LEVEL,
  MAX_PLACEMENTS,
  MIN_LEVEL,
  place,
  type WorldMark,
} from '@/domain/builder/world'
import type { Vec3 } from '@/domain/studio/scene'
import type { WorldScope } from '@/domain/worlds/actions'

/**
 * The world builder.
 *
 * The scene studio's job is one photograph and it is a panel of sliders. This
 * one's job is a *place* - somewhere to walk a customer through before they
 * have signed anything, and somewhere to shoot an advert - so it is a tool you
 * draw in, out of everything we ship rather than the 58 blocks the lounge
 * allows.
 *
 * ---------------------------------------------------------------------------
 * Who gets the left button
 * ---------------------------------------------------------------------------
 * Drawing is the gesture you make ten thousand times and orbiting is the one
 * you make between strokes, so the left button belongs to the tools and the
 * camera gets the right one. That is what every voxel editor does and it is
 * right - on a mouse.
 *
 * It is not right on a trackpad, where a right-button *drag* is somewhere
 * between awkward and impossible, and the first thing that happened when
 * somebody sat down with this was that they could not turn the world round at
 * all. So there is a look mode: hold space, or press the button in the toolbar,
 * and the left button is the camera's until you let go.
 *
 * Held rather than toggled by default, because the thing you want is almost
 * always "turn this a bit and carry on" - and a mode you have to leave is a
 * mode you forget you are in, which here means clicking on the world and
 * watching nothing happen. The toolbar button latches it for the times you do
 * want both hands free.
 *
 * `zoomToCursor` is the other half of making this work without a middle button:
 * the wheel then moves the view towards whatever you are pointing at, which is
 * most of what people reach for panning to do.
 */

/** What a stroke needs to know beyond its cells. */
interface Brush {
  model: string
  rotation: number
  scale: number
}

/** How many steps back you can take. Fifty is more than anybody uses and costs nothing. */
const HISTORY = 50

export function WorldBuilder({
  scope,
  opened = null,
  openedWorld = null,
}: {
  /** Which surface this editor is on. Decides where a publish is filed. */
  scope: WorldScope
  /** The catalogue row being edited, when the page was opened on one. */
  opened?: OpenedWorld | null
  /** That row's document. Seeds the editor in place of the autosave. */
  openedWorld?: BuilderWorld | null
}) {
  const [world, setWorld] = useState<BuilderWorld>(openedWorld ?? DEFAULT_WORLD)
  const [past, setPast] = useState<BuilderWorld[]>([])
  const [future, setFuture] = useState<BuilderWorld[]>([])

  const [tool, setTool] = useState<Tool>('brush')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [level, setLevel] = useState(0)
  /**
   * Whether a block lands on top of what is under the pointer.
   *
   * On by default, and the reason is that the alternative was the first thing
   * everybody complained about: with a fixed drawing plane, building anything
   * with a second storey means going back to the panel between every course -
   * draw a wall, type 1, draw the same wall, type 2 - and the number you are
   * typing is information the world already has. What you *meant* was "another
   * one on top of that", which is what this is.
   *
   * The level does not go away, it changes job: it becomes the floor nothing
   * lands below, which is what makes a flat plaza still drawable in one pass
   * over uneven ground, and digging still possible by lowering it.
   */
  const [stacking, setStacking] = useState(true)
  const [height, setHeight] = useState(1)
  /**
   * Whether each shape is drawn solid, remembered per tool.
   *
   * One flag for all four was the first version and it was wrong in both
   * directions at once: a rectangle is a floor, so you want it solid, and a box
   * is a *room*, so you want its walls and not a solid cube of two thousand
   * blocks. Sharing one boolean meant every switch between them was also a
   * setting to change, and the setting was a checkbox further down the panel
   * that most people never found - so a rectangle came out as an outline and
   * looked like the tool was broken.
   *
   * Per tool, so the defaults can be right for each: the flat shapes start
   * filled, the volumes start hollow, and whatever you last chose for a tool is
   * what it has the next time you pick it up.
   */
  const [filledByTool, setFilledByTool] = useState<Partial<Record<Tool, boolean>>>({
    rect: true,
    circle: true,
    box: false,
    cylinder: false,
  })
  const filled = filledByTool[tool] ?? false
  const setFilled = useCallback(
    (value: boolean) => setFilledByTool((current) => ({ ...current, [tool]: value })),
    [tool],
  )
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)
  const [text, setText] = useState('KXB')
  const [textOptions, setTextOptions] = useState<TextOptions>({
    plane: 'wall',
    tracking: 1,
    depth: 1,
    scale: 1,
  })

  const [picking, setPicking] = useState(false)
  const [ready, setReady] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  /**
   * The camera has the left button.
   *
   * Two ways in, one flag: `heldLook` is space being down, `latchedLook` is the
   * toolbar button. Kept apart rather than as one boolean because releasing
   * space must not turn off a mode somebody deliberately latched.
   */
  const [heldLook, setHeldLook] = useState(false)
  const [latchedLook, setLatchedLook] = useState(false)
  const looking = heldLook || latchedLook

  /** The cell under the pointer, and where a drag began. */
  const [hover, setHover] = useState<Cell | null>(null)
  const [from, setFrom] = useState<Cell | null>(null)

  /**
   * Whether shift is down over the world, and whether the stroke in flight is
   * rubbing out.
   *
   * Shift is the eraser every voxel editor has: whatever tool you are holding,
   * holding shift makes it take blocks away instead of laying them down. Which
   * matters most for the tools that are not the brush - rubbing out a wall you
   * mis-dragged used to mean switching to the eraser, dragging the same
   * rectangle, and switching back, and the two switches are where you lose the
   * model you had selected.
   *
   * Two pieces of state rather than one because they answer different
   * questions. `shiftHeld` is for the preview - the ghost should turn red the
   * moment you press shift, before you have clicked anything. `rubbing` is
   * latched at pointer-down and read for the rest of the stroke, so letting go
   * of shift halfway through a drag cannot turn a deletion into a wall built
   * out of whatever was in the brush.
   */
  const [shiftHeld, setShiftHeld] = useState(false)
  const rubbing = useRef(false)

  /**
   * Whether the pointer is down, as a ref rather than as state.
   *
   * Read inside the pointer-move handler, which fires sixty times a second -
   * and a state read there would need the handler in a dependency array, which
   * would rebuild it sixty times a second along with every listener attached
   * to it.
   */
  const painting = useRef(false)
  /** The last cell the brush painted, so a fast drag joins up rather than dotting. */
  const lastPainted = useRef<Cell | null>(null)

  const gpu = useRef<CaptureParts | null>(null)

  /**
   * Which way the view is being asked to move. See `Panner`.
   *
   * Here rather than inside the panner because the on-screen pad writes to it
   * too, and the pad lives out here on the picture.
   */
  const panning = useRef(new Set<string>())

  const brush: Brush = useMemo(() => ({ model, rotation, scale }), [model, rotation, scale])

  /**
   * Every change to the world goes through here, so undo is not something each
   * caller has to remember.
   *
   * The past holds whole documents rather than diffs. A world is a few hundred
   * kilobytes at its largest and fifty of them is a rounding error next to the
   * geometry already on the GPU - and a diff-based stack would mean every tool
   * describing its own inverse, which is exactly the code that is wrong the day
   * somebody adds the tenth tool.
   */
  const commit = useCallback((next: (current: BuilderWorld) => BuilderWorld) => {
    setWorld((current) => {
      const updated = next(current)
      if (updated === current) return current
      setPast((stack) => [...stack, current].slice(-HISTORY))
      // Any new edit abandons the redo branch. Keeping it would mean redo
      // replaying work that was done to a world that no longer exists.
      setFuture([])
      return updated
    })
  }, [])

  const undo = useCallback(() => {
    setPast((stack) => {
      if (stack.length === 0) return stack
      const previous = stack[stack.length - 1]
      setWorld((current) => {
        setFuture((forward) => [current, ...forward].slice(0, HISTORY))
        return previous
      })
      return stack.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((stack) => {
      if (stack.length === 0) return stack
      const [next, ...rest] = stack
      setWorld((current) => {
        setPast((backward) => [...backward, current].slice(-HISTORY))
        return next
      })
      return rest
    })
  }, [])

  // ---------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------

  /**
   * The cell a pointer position actually means.
   *
   * The stage reports where the pointer crossed the drawing plane, which is a
   * cell at `level`. With stacking on, the answer is instead "on top of
   * whatever is standing in that column" - or the block itself when the gesture
   * is a rub-out, because the thing you want to remove is the block you can
   * see, not the empty air above it.
   *
   * Bounded below by `level` in both directions, which is what keeps the level
   * useful: a plaza drawn at 0 stays flat across ground that has a ditch in it.
   */
  const resolve = useCallback(
    (cell: Cell, rubbing: boolean): Cell => {
      if (!stacking) return cell
      const top = columnTop(world.placements, cell.x, cell.z)
      if (top === null) return cell
      const y = rubbing ? top : top + 1
      return { ...cell, y: Math.min(MAX_LEVEL, Math.max(cell.y, y)) }
    },
    [stacking, world.placements],
  )

  /**
   * The columns this stroke has already decided about.
   *
   * Without it, stacking eats itself: the pointer sitting still over one column
   * resolves to "on top of what is there", places a block, and the next mouse
   * event - of which there are dozens a second - finds a column one taller and
   * puts another one on it. A brush held over a cell for a moment would grow a
   * tower to the ceiling.
   *
   * So a column decides its level once per stroke and keeps it. Dragging across
   * new columns still follows the ground, which is the behaviour that made
   * stacking worth having.
   */
  const strokeColumns = useRef(new Map<string, number>())

  const resolveInStroke = useCallback(
    (plane: Cell, rubbingNow: boolean): Cell => {
      const key = `${plane.x},${plane.z}`
      if (painting.current) {
        const decided = strokeColumns.current.get(key)
        if (decided !== undefined) return { ...plane, y: decided }
      }
      const cell = resolve(plane, rubbingNow)
      if (painting.current) strokeColumns.current.set(key, cell.y)
      return cell
    },
    [resolve],
  )

  /** Lay a stroke's cells down, or rub them out. */
  const apply = useCallback(
    (cells: Cell[], rubbing: boolean) => {
      if (cells.length === 0) return
      commit((current) => ({
        ...current,
        placements: rubbing
          ? erase(current.placements, cells)
          : place(current.placements, cells, brush),
      }))
    },
    [brush, commit],
  )

  /**
   * The cells the in-flight drag would fill.
   *
   * Recomputed on every pointer move, which is why the tools are pure functions
   * over two cells rather than something that mutates as it goes: a preview and
   * a commit are then the same call, and a preview that disagrees with what
   * lands is not expressible.
   */
  const ghost = useMemo(() => {
    if (!hover) return []

    if (tool === 'text') {
      return stampText(text, hover, textOptions).slice(0, MAX_CELLS_PER_STROKE)
    }

    // A dragged tool previews from where the drag began; before it begins, and
    // for the click-only tools, it previews under the pointer.
    const start = from && DRAGGED.has(tool) ? from : hover
    return cellsForCapped(tool, start, hover, { height, filled }).cells
  }, [tool, from, hover, height, filled, text, textOptions])

  const onPointerDown = useCallback(
    (plane: Cell, shift: boolean) => {
      painting.current = true
      // Latched here and nowhere else: this is the instant the gesture commits
      // to being a build or a rub-out.
      rubbing.current = shift || tool === 'erase'
      strokeColumns.current.clear()
      const cell = resolveInStroke(plane, rubbing.current)

      if (tool === 'text') {
        apply(
          stampText(text, cell, textOptions).slice(0, MAX_CELLS_PER_STROKE),
          rubbing.current,
        )
        painting.current = false
        return
      }

      if (DRAGGED.has(tool)) {
        setFrom(cell)
        return
      }

      // The brush paints as it goes rather than on release, because a brush
      // that only lands when you let go is a brush you cannot draw a line with.
      const { cells } = cellsForCapped(tool, cell, cell, { height, filled })
      apply(cells, rubbing.current)
      lastPainted.current = cell
    },
    [tool, text, textOptions, height, filled, apply, resolveInStroke],
  )

  const onPoint = useCallback(
    (plane: Cell, shift: boolean) => {
      // Resolved before it is stored, so the readout, the ghost and what lands
      // are all the same cell. A preview that disagrees with the click is the
      // one bug an editor cannot explain away.
      const cell = resolveInStroke(
        plane,
        painting.current ? rubbing.current : shift || tool === 'erase',
      )
      setHover(cell)
      setShiftHeld(shift)
      if (!painting.current || DRAGGED.has(tool) || tool === 'text') return

      // Joined to the last painted cell rather than dotted at this one: a fast
      // drag reports a handful of widely spaced positions, and painting only
      // those leaves a dotted line.
      const start = lastPainted.current ?? cell
      const { cells } = cellsForCapped('line', start, cell, {})
      apply(
        cells.flatMap((step) => cellsForCapped('brush', step, step, { height }).cells),
        rubbing.current,
      )
      lastPainted.current = cell
    },
    [tool, height, apply, resolveInStroke],
  )

  const onPointerUp = useCallback((shift: boolean) => {
    painting.current = false
    lastPainted.current = null
    strokeColumns.current.clear()
    setShiftHeld(shift)

    if (!from || !hover || !DRAGGED.has(tool)) {
      setFrom(null)
      return
    }

    const { cells, clipped } = cellsForCapped(tool, from, hover, { height, filled })
    apply(cells, rubbing.current)
    if (clipped) setNote(`that stroke was capped at ${MAX_CELLS_PER_STROKE} cells`)
    setFrom(null)
  }, [from, hover, tool, height, filled, apply])

  /**
   * Which level the pointer plane sits on, nudged by what is under the pointer.
   *
   * Clicking on top of a wall should put the next block on the wall, not inside
   * it - the behaviour every voxel editor has and the one thing people notice
   * immediately when it is missing. Offered as a button rather than done
   * automatically, because a plane that moves by itself is a plane you cannot
   * draw a flat floor on.
   */
  const climb = useCallback(() => {
    if (!hover) return
    const top = columnTop(world.placements, hover.x, hover.z)
    setLevel(top === null ? 0 : Math.min(MAX_LEVEL, top + 1))
  }, [hover, world.placements])

  /**
   * The door goes where the pointer is.
   *
   * Through `commit`, so it is undoable like a stroke - marking the spawn in
   * the wrong place is exactly as easy a mistake as drawing a wall in the wrong
   * place, and should cost exactly as much to take back.
   */
  const spawnHere = useCallback(() => {
    if (!hover) return
    commit((current) => ({ ...current, spawn: { x: hover.x, z: hover.z } }))
  }, [hover, commit])

  /**
   * Stand a goal or a race mark where the pointer is.
   *
   * The one thing in this editor that is not made of cells, and it earns the
   * exception: a `finish` mark is what turns a course into a race the game can
   * actually end (see `WorldMark`), and there is no arrangement of blocks that
   * does that.
   *
   * Replaces rather than stacks when one of the same kind is already standing
   * within a couple of cells - two finish lines on top of each other is a world
   * nobody meant to build, and undo is right there for the times you did.
   */
  const markHere = useCallback(
    (kind: WorldMark['kind']) => {
      if (!hover) return
      commit((current) => ({
        ...current,
        marks: [
          ...current.marks.filter(
            (mark) =>
              mark.kind !== kind ||
              Math.abs(mark.x - hover.x) > 2 ||
              Math.abs(mark.z - hover.z) > 2,
          ),
          { kind, x: hover.x, y: hover.y, z: hover.z, ...DEFAULT_MARK },
        ].slice(-12),
      }))
    },
    [hover, commit],
  )

  const clearMarks = useCallback(() => {
    commit((current) => (current.marks.length === 0 ? current : { ...current, marks: [] }))
  }, [commit])

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Never steal a keystroke meant for a field. The panel is full of them.
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      const meta = event.metaKey || event.ctrlKey

      // Pressing shift turns the ghost red before you have clicked anything,
      // which is the whole point of a preview: you should be able to see that
      // the next click takes blocks away rather than find out afterwards.
      if (event.shiftKey) setShiftHeld(true)

      /**
       * Space hands the left button to the camera while it is down.
       *
       * `preventDefault` because space scrolls the page, and `event.repeat` is
       * ignored because holding a key fires this thirty times a second and each
       * one would be a state update that re-renders the whole editor.
       */
      if (event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) setHeldLook(true)
        return
      }

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }

      const shortcuts: Record<string, Tool> = {
        b: 'brush',
        l: 'line',
        w: 'wall',
        r: 'rect',
        x: 'box',
        c: 'circle',
        y: 'cylinder',
        t: 'text',
        e: 'erase',
      }

      const picked = shortcuts[event.key.toLowerCase()]
      if (picked && !meta) {
        setTool(picked)
        return
      }

      /**
       * The two numbers, on the two pairs of bracket-ish keys.
       *
       * Deliberately not letters. Every letter that reads as "up" is already a
       * tool - and a shortcut that is a tool letter plus a modifier is one
       * missed modifier away from switching tools mid-build, which is the
       * mistake you only notice after drawing the next twenty blocks.
       */
      if (event.key === ',') setLevel((current) => Math.max(MIN_LEVEL, current - 1))
      if (event.key === '.') setLevel((current) => Math.min(MAX_LEVEL, current + 1))
      if (event.key === '[') setHeight((current) => Math.max(1, current - 1))
      if (event.key === ']') setHeight((current) => Math.min(MAX_LEVEL, current + 1))
      // Reads the current tool's own setting rather than taking an updater,
      // because `filled` is per tool now - see `filledByTool`.
      if (event.key === 'f') setFilled(!filled)
      if (event.key === 'g') climb()
      // Not a tool letter, and next to the other two switches. `s` is free
      // because the tools took b, l, w, r, x, c, y, t and e.
      if (event.key === 's') setStacking((current) => !current)
      if (event.key === 'Escape') setFrom(null)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setHeldLook(false)
      if (!event.shiftKey) setShiftHeld(false)
    }

    /**
     * Losing the window drops the key.
     *
     * Space down, alt-tab away, come back: the keyup happened somewhere else,
     * so without this the editor is stuck in look mode with nothing on screen
     * explaining why the tools have stopped working.
     */
    const onBlur = () => {
      setHeldLook(false)
      setShiftHeld(false)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [undo, redo, climb, filled, setFilled])

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------

  /**
   * Whatever the last session was building, back on screen.
   *
   * An effect rather than a lazy `useState` initialiser, and the reason is
   * server rendering: the initialiser runs on the server too, where there is no
   * `localStorage`, so it would return the default world and the first client
   * render would disagree with the HTML it is hydrating.
   *
   * The slot list next door is a `useSyncExternalStore` for exactly this
   * problem, and this is not, because the world is not a store - it is editable
   * state that happens to be seeded from one. Reaching for a store here would
   * mean every stroke writing through localStorage to get back on screen.
   *
   * Guarded by a ref rather than by the empty dependency array alone, because
   * in development the effect runs twice and the second run would push the
   * restored world onto the undo stack as though it were an edit.
   */
  const restored = useRef(false)
  useEffect(() => {
    // A world opened from the catalogue is already the document on screen, and
    // the autosave is somebody's *other* work. Restoring over it would be the
    // editor throwing away what you asked it to open.
    if (openedWorld) return
    if (restored.current) return
    restored.current = true
    const saved = loadAutosave()
    if (!saved || saved.placements.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorld(saved)
    setNote(`picked up “${saved.name}” where you left it — ${saved.placements.length} placed`)
  }, [openedWorld])

  /**
   * Autosave, debounced.
   *
   * The one unforgivable bug a builder can have is losing an afternoon to a
   * refresh. Debounced because a drag is a few hundred state updates and
   * serialising twenty thousand placements on each one would be the thing that
   * makes the editor stutter.
   */
  useEffect(() => {
    // Not while editing a catalogue world. That one's home is its row, and
    // writing it through the autosave as well would mean the next plain visit
    // to the builder opens with somebody's published world in it and no sign of
    // where it came from.
    if (opened) return
    const timer = setTimeout(() => saveAutosave(world), 600)
    return () => clearTimeout(timer)
  }, [world, opened])

  // ---------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------

  const exportPng = useCallback(() => {
    const parts = gpu.current
    if (!parts) return
    download(capturePng(parts, world.width, world.height), `${world.name || 'world'}.png`)
    setNote(`saved ${world.name || 'world'}.png — ${world.width}×${world.height}`)
  }, [world])

  const copyShareLink = useCallback(async () => {
    const url = shareUrl(world, window.location.origin)
    if (url.length > MAX_SHARE_LENGTH) {
      setNote(
        `too big for a link (${url.length} characters, ${MAX_SHARE_LENGTH} is the limit) — save the file and send that instead`,
      )
      return
    }
    await navigator.clipboard.writeText(url)
    setNote(`view link copied — ${url.length} characters`)
  }, [world])

  const onCamera = useCallback((position: Vec3, target: Vec3) => {
    // Straight to the world without touching the undo stack: orbiting is not an
    // edit, and putting it in the history would mean undo spends its first
    // twenty presses moving the camera back.
    setWorld((current) => ({ ...current, camera: { ...current.camera, position, target } }))
  }, [])

  const full = world.placements.length >= MAX_PLACEMENTS

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-3">
        <div
          className={`checker relative overflow-hidden rounded-2xl border transition-colors ${
            looking ? 'cursor-grab border-accent' : 'cursor-crosshair border-border'
          }`}
          // `touchAction: none` so a one-finger stroke draws instead of
          // scrolling the page out from under it. The canvas sets this on
          // itself; the wrapper needs it too, or the gesture is claimed before
          // it ever reaches the canvas.
          style={{ aspectRatio: `${world.width} / ${world.height}`, touchAction: 'none' }}
          // The orbit control claims the right button; without this the browser
          // menu opens on top of the camera drag.
          onContextMenu={(event) => event.preventDefault()}
        >
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            // Transparent and readable back afterwards. Both are the export.
            gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
            camera={{
              position: DEFAULT_WORLD.camera.position,
              fov: DEFAULT_WORLD.camera.fov,
              near: 0.1,
              far: 600,
            }}
            onPointerMissed={() => setFrom(null)}
          >
            <Bridge partsRef={gpu} onReady={() => setReady(true)} />
            <Lens fov={world.camera.fov} />
            <OrbitControls
              makeDefault
              target={DEFAULT_WORLD.camera.target}
              enableDamping={false}
              maxPolarAngle={Math.PI / 2.02}
              // The wheel moves towards what you are pointing at, which is most
              // of what panning is for and needs no button at all.
              zoomToCursor
              // Left is the tools' unless look mode has taken it. Right always
              // orbits, for anybody on an actual mouse. See the note at the top.
              mouseButtons={{
                LEFT: looking ? THREE.MOUSE.ROTATE : undefined,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE,
              }}
              /**
               * On a touchscreen there are no buttons to divide up, so the
               * division is by how many fingers.
               *
               * One finger draws, which is the gesture you make constantly and
               * the only one that can be aimed. Two fingers pinch to zoom and
               * drag to pan, which is what two fingers do everywhere else on a
               * phone. Turning the world is the one thing left over, and it
               * goes where it goes on a trackpad: behind the Look button in the
               * corner of the viewport, which then gives one finger to the
               * camera.
               *
               * The default here would have been one finger rotating - which,
               * with the tools also on one finger, means every stroke is also a
               * camera swing.
               */
              touches={{
                ONE: looking ? THREE.TOUCH.ROTATE : undefined,
                TWO: THREE.TOUCH.DOLLY_PAN,
              }}
            />
            <Panner held={panning} onCamera={onCamera} />
            <CameraReporter onCamera={onCamera} />
            <BuildStage
              world={world}
              level={level}
              ghost={looking ? [] : ghost}
              erasing={tool === 'erase' || shiftHeld}
              drawing={!looking}
              onPoint={onPoint}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
            />
          </Canvas>

          {/* Where the pointer is, over the picture rather than beside it -
              it is the number you check while aiming, not afterwards. */}
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-black/50 px-2 py-1 font-mono text-[11px] text-white/80 tabular-nums">
            {looking
              ? 'looking around'
              : hover
                ? `${hover.x}, ${level}, ${hover.z}`
                : `level ${level}`}
            {!looking && ghost.length > 0 && ` · ${ghost.length} cells`}
            {!looking && shiftHeld && tool !== 'erase' && (
              <span className="text-red-300"> · rubbing out</span>
            )}
          </div>

          {/*
            The way to the camera, on the picture.

            In the corner of the viewport rather than in the panel because it is
            about the viewport, and because somebody who cannot turn the world
            round is looking at the world, not at a column of steppers.
          */}
          {/*
            The keys a touchscreen does not have, as buttons on the picture.

            Look mode and the eraser are the two modifiers the editor cannot do
            without - one is how you turn the world with a single finger free
            for drawing, the other is how you take a block back. On a desktop
            they are space and shift; on a phone there is no third hand, so
            they are here. Shown to everybody rather than behind a breakpoint,
            because a latched mode wants somewhere visible to be turned off.
          */}
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setTool(tool === 'erase' ? 'brush' : 'erase')}
              aria-pressed={tool === 'erase'}
              title="Rub blocks out. On a keyboard, hold shift with any tool."
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                tool === 'erase'
                  ? 'bg-red-500 text-white'
                  : 'bg-black/50 text-white/80 hover:bg-black/70'
              }`}
            >
              <Eraser className="size-3.5" aria-hidden />
              {tool === 'erase' ? 'Rubbing out' : 'Erase'}
              <span className="opacity-60">shift</span>
            </button>

            <button
              type="button"
              onClick={() => setLatchedLook((current) => !current)}
              aria-pressed={latchedLook}
              title="Give the left button — or the first finger — to the camera. Hold space to do it for a moment."
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                looking
                  ? 'bg-accent text-white'
                  : 'bg-black/50 text-white/80 hover:bg-black/70'
              }`}
            >
              <Orbit className="size-3.5" aria-hidden />
              {looking ? 'Looking — tap to draw' : 'Look around'}
              <span className="opacity-60">space</span>
            </button>
          </div>

          {/*
            The arrow keys, for the screens that have none.

            Panning is the one verb the touch gestures do not cover well: two
            fingers pinch and drag, which works, but it fights the one-finger
            stroke for the same surface and cannot be done while the other hand
            is holding the phone. A pad you hold with a thumb can.

            It writes into the same set of held directions the keys do, so a
            press behaves exactly like a key: it moves smoothly from the moment
            it goes down, it stops the moment it comes up, and two at once go
            diagonally. `setPointerCapture` is what makes the release reliable -
            without it, a thumb that slides off the button never sends the
            pointerup and the view flies away.

            Hidden on a desktop, where the keys are the better control and this
            would be furniture over the picture.
          */}
          <div className="absolute bottom-2 right-2 grid grid-cols-3 grid-rows-2 gap-1 xl:hidden">
            {(
              [
                ['ArrowUp', 'Move away', 'col-start-2 row-start-1', ChevronUp],
                ['ArrowLeft', 'Move left', 'col-start-1 row-start-2', ChevronLeft],
                ['ArrowDown', 'Move towards', 'col-start-2 row-start-2', ChevronDown],
                ['ArrowRight', 'Move right', 'col-start-3 row-start-2', ChevronRight],
              ] as const
            ).map(([key, label, place, Icon]) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                className={`${place} grid size-10 place-items-center rounded-lg bg-black/50 text-white/80 transition active:bg-accent active:text-white`}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  panning.current.add(key)
                }}
                onPointerUp={() => panning.current.delete(key)}
                onPointerCancel={() => panning.current.delete(key)}
                // A pointer that leaves without the capture releasing - which a
                // stylus can do - would otherwise leave the view drifting.
                onPointerLeave={() => panning.current.delete(key)}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={exportPng}
            disabled={!ready}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white transition disabled:opacity-40"
          >
            <Camera className="size-4" aria-hidden />
            {ready ? 'Export PNG' : 'Loading models…'}
          </button>
          <button
            type="button"
            onClick={copyShareLink}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 transition hover:bg-secondary"
          >
            <Link2 className="size-4" aria-hidden />
            Copy view link
          </button>
          {/* Icon-only, and next to each other: the pair is used constantly and
              by muscle memory, so the two words were costing more width than
              they were buying. */}
          <button
            type="button"
            onClick={undo}
            disabled={past.length === 0}
            aria-label="Undo"
            title="Undo (⌘Z)"
            className="grid size-9 place-items-center rounded-lg border border-border transition hover:bg-secondary disabled:opacity-40"
          >
            <Undo2 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            className="grid size-9 place-items-center rounded-lg border border-border transition hover:bg-secondary disabled:opacity-40"
          >
            <Redo2 className="size-4" aria-hidden />
          </button>
          <span className="text-xs text-muted-foreground">
            left draws · shift rubs out · arrows move · hold space to look · wheel zooms ·
            one finger draws, two pinch and pan
          </span>
          {note && <span className="text-xs text-muted-foreground">{note}</span>}
          {full && (
            <span className="text-xs text-amber-500">
              world is full — the oldest placements are being dropped
            </span>
          )}
        </div>
      </div>

      <aside className="xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto xl:pr-1">
        {/*
          First in the panel, not last.

          It started at the bottom, under six sections of tools, and the result
          was somebody building a world and concluding the only way to keep it
          was "Save file" - which is a `.json` on their disk, not a world
          anybody else can find. Publishing is what this editor is *for* now;
          burying it under the light sliders made the catalogue look unbuilt.
        */}
        <div className="mb-5 border-b border-border pb-5">
          <PublishPanel
            world={world}
            scope={scope}
            opened={opened}
            /*
             * 16:9 regardless of the export size the panel is set to. The
             * export is an artefact somebody chose the shape of; this is a
             * card in a grid, and a grid of mixed aspect ratios is a grid that
             * cannot line anything up.
             */
            shoot={() => (gpu.current ? capturePoster(gpu.current, 16 / 9) : null)}
            onNote={setNote}
          />
        </div>

        <BuilderPanel
          world={world}
          onWorld={commit}
          tool={tool}
          onTool={setTool}
          model={model}
          onPickModel={() => setPicking(true)}
          blocksOnly={scope.kind === 'space'}
          level={level}
          onLevel={setLevel}
          onClimb={climb}
          onSpawnHere={spawnHere}
          onMark={markHere}
          onClearMarks={clearMarks}
          stacking={stacking}
          onStacking={setStacking}
          height={height}
          onHeight={setHeight}
          filled={filled}
          onFilled={setFilled}
          rotation={rotation}
          onRotation={setRotation}
          scale={scale}
          onScale={setScale}
          text={text}
          onText={setText}
          textOptions={textOptions}
          onTextOptions={setTextOptions}
          onNote={setNote}
        />

      </aside>

      {picking && (
        <ModelPicker
          selected={model}
          onSelect={setModel}
          onClose={() => setPicking(false)}
          /*
           * A space picks from the blocks its world can actually keep; the
           * backoffice picks from everything we ship. See `blocksOnly`.
           */
          blocksOnly={scope.kind === 'space'}
        />
      )}
    </div>
  )
}

/** Hands the renderer, scene and camera out to the export button. */
function Bridge({
  partsRef,
  onReady,
}: {
  partsRef: React.RefObject<CaptureParts | null>
  onReady: () => void
}) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera

  useEffect(() => {
    partsRef.current = { gl, scene, camera }
    onReady()
  }, [partsRef, gl, scene, camera, onReady])

  return null
}

/**
 * Field of view, applied to the live camera.
 *
 * The one camera property the panel owns rather than the orbit control: zoom
 * moves the camera along its own axis, which changes where you are, and a lens
 * change is a different picture from the same place.
 */
function Lens({ fov }: { fov: number }) {
  const store = useStore()
  useEffect(() => {
    const camera = store.getState().camera as THREE.PerspectiveCamera
    camera.fov = fov
    camera.updateProjectionMatrix()
  }, [store, fov])
  return null
}

/** As much of the orbit control as the reporter and the panner touch. */
type Orbit = {
  target: THREE.Vector3
  update: () => void
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/**
 * Walking the view across the world, on the arrow keys.
 *
 * Orbiting turns the world about a point and zooming moves towards one, and
 * neither of them *goes* anywhere - so on a big build the far corner is
 * somewhere you cannot get to: you can look at it from across the map and you
 * can zoom in on it, but the moment you turn the camera it swings back around
 * the middle. Panning is the missing verb, and until now the only way to do it
 * was a middle-button drag, which most trackpads do not have.
 *
 * Arrow keys rather than WASD, because every letter within reach is already a
 * tool - see the note on the shortcuts above, which is the same argument.
 *
 * ---------------------------------------------------------------------------
 * Why the keys are held rather than pressed
 * ---------------------------------------------------------------------------
 * The obvious version moves the camera a step inside the `keydown` handler, and
 * it is *wrong in a way you can feel*: holding a key gives you one step, then a
 * pause of about half a second, then a stutter of repeats at whatever rate the
 * operating system chose. That is the text-editing key repeat, and it is tuned
 * for inserting characters, not for moving through space - so the world lurches
 * rather than travels.
 *
 * So the keys only record *what is held*, and the movement happens on the
 * render loop, scaled by the frame's own delta. That gives a constant speed in
 * cells per second, identical on a 60Hz and a 144Hz screen, starting the
 * instant the key goes down and stopping the instant it comes up. Two keys at
 * once move diagonally, which the press-per-step version could not do at all.
 *
 * The three.js control does have its own key handling, and it is deliberately
 * not used: it listens on the window and does not care what has focus, so an
 * arrow key pressed while typing in the name field would pan the world instead
 * of moving the caret - and it is a per-press pan, which is the thing this
 * whole note is about.
 */
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** Cells per second at a walk. Crosses the default ground plane in about a second and a half. */
const PAN_SPEED = 18

function Panner({
  held,
  onCamera,
}: {
  /**
   * Which directions are being asked for, as a ref.
   *
   * Owned by the editor rather than by this component, because there are two
   * things that can hold one: the arrow keys, and the pad on the canvas for
   * everybody whose screen has no arrow keys. Both write the same four strings
   * into the same set, so the movement code below never learns there is more
   * than one way to ask - and holding a button behaves exactly like holding a
   * key, including two at once for a diagonal.
   *
   * A ref because it is read every frame; state here would re-render the whole
   * editor on each press and rebuild the frame callback with it.
   */
  held: React.RefObject<Set<string>>
  onCamera: (position: Vec3, target: Vec3) => void
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as Orbit | null
  /** Whether the camera has moved since it was last written into the document. */
  const moved = useRef(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (!ARROWS.has(event.key)) return
      // Arrows scroll the page, and the panel beside the canvas is tall enough
      // to scroll.
      event.preventDefault()
      held.current.add(event.key)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      held.current.delete(event.key)
    }

    /**
     * Losing the window drops every key.
     *
     * Same orphaned-keyup problem the look mode has, and worse here: a key that
     * stays "held" while the tab is in the background is a camera that is still
     * flying when you come back to it.
     */
    const onBlur = () => held.current.clear()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [held])

  useFrame((_, delta) => {
    if (!controls) return

    const keys = held.current

    if (keys.size === 0) {
      // Nothing held any more, and something moved: this is the moment the pan
      // came to rest, so the document learns where the camera ended up. Once,
      // rather than on every frame of the movement - the same rule
      // `CameraReporter` follows for a drag, and for the same reason.
      if (moved.current) {
        moved.current = false
        const round = (value: number) => Math.round(value * 10) / 10
        onCamera(
          [round(camera.position.x), round(camera.position.y), round(camera.position.z)],
          [round(controls.target.x), round(controls.target.y), round(controls.target.z)],
        )
      }
      return
    }

    // Flattened onto the ground plane, so looking down at the world does not
    // make "forward" mean "towards the floor" - what moves is where you are
    // standing over the map, not where the lens is pointing.
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    // Looking straight down leaves nothing to normalise; north is as good an
    // answer as any and beats a vector of NaNs.
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    forward.normalize()

    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()

    const move = new THREE.Vector3()
    if (keys.has('ArrowUp')) move.add(forward)
    if (keys.has('ArrowDown')) move.sub(forward)
    if (keys.has('ArrowRight')) move.add(right)
    if (keys.has('ArrowLeft')) move.sub(right)
    if (move.lengthSq() < 1e-6) return

    // Normalised before scaling, so holding two arrows travels diagonally at
    // the same speed rather than 40% faster.
    move.normalize().multiplyScalar(PAN_SPEED * delta)

    // Both ends move together, which is what makes this a pan rather than an
    // orbit: the distance and angle to what you are looking at are unchanged,
    // the whole view has simply slid sideways.
    camera.position.add(move)
    controls.target.add(move)
    controls.update()
    moved.current = true
  })

  return null
}

/**
 * Where the camera came to rest, back into the document.
 *
 * One-way on purpose. The orbit control owns the camera once it is mounted, so
 * the document follows it rather than the other way round - a two-way binding
 * here is the classic fight where every reported position triggers a re-render
 * that snaps the camera back to where it just was.
 */
function CameraReporter({ onCamera }: { onCamera: (position: Vec3, target: Vec3) => void }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as Orbit | null

  useEffect(() => {
    if (!controls) return
    const round = (value: number) => Math.round(value * 10) / 10
    const report = () => {
      onCamera(
        [round(camera.position.x), round(camera.position.y), round(camera.position.z)],
        [round(controls.target.x), round(controls.target.y), round(controls.target.z)],
      )
    }
    // `end` rather than `change`: the document only needs where the camera came
    // to rest, and updating mid-drag would re-render the world under the mouse.
    controls.addEventListener('end', report)
    return () => controls.removeEventListener('end', report)
  }, [controls, camera, onCamera])

  return null
}
