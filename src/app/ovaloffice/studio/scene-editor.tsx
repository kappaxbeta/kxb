'use client'

import { ImageDown, Link2, Loader2, Lock, Move3d, Pin, Sparkles, Undo2 } from 'lucide-react'

import { OrbitControls } from '@react-three/drei'
import { Canvas, useStore, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import type * as THREE from 'three'
import {
  type ImportableWorld,
  SceneControls,
} from '@/app/ovaloffice/studio/scene-controls'
import { SceneStage } from '@/app/ovaloffice/studio/scene-stage'
import {
  DEFAULT_SCENE,
  encodeScene,
  parseScene,
  type StudioScene,
  type Vec3,
} from '@/domain/studio/scene'
import { park, parked } from '@/app/ovaloffice/studio/draft'
import { studioHref } from '@/app/ovaloffice/studio/where'
import { encodeShot, shotFromScene } from '@/domain/studio/shot'
import { publishPost } from '@/domain/board/actions'
import { saveDecoPicture } from '@/domain/pictures/actions'

/**
 * The scene studio.
 *
 * Arrange peeps, blocks, goals and light in a live viewport, then export the
 * frame as a PNG with a transparent background - which is the format the
 * landing page's use-case band wants, because a cut-out standing on the page
 * reads as a place and a rectangle of sky reads as a screenshot.
 *
 * ---------------------------------------------------------------------------
 * Why the export is a download and not a file on the server
 * ---------------------------------------------------------------------------
 * There is already a route that writes a shot into `public/xo/scenes` - it is
 * how `scripts/shoot-scenes.ts` bakes the fixed set - and it is deliberately
 * dev-only: a running production server must not be able to write into its own
 * static directory, and in a container there is no repo to write into anyway.
 * The backoffice is a production surface. So the canvas hands the bytes to the
 * browser and the browser saves them, which works identically in both places
 * and needs no route at all.
 */

/** The three.js objects the export needs, reached out of the canvas. */
interface Parts {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
}

/**
 * The space this editor is open inside, when it is open inside one.
 *
 * Absent in the backoffice, which has no board to pin to. Present here rather
 * than derived from the URL because whether somebody may post is two questions
 * about roles and billing that only the page has the context to answer - see
 * the same pair on the motion studio's `SavePanel`, which this deliberately
 * mirrors so the two studios hand things to the board the same way.
 */
export interface EditorSpace {
  slug: string
  canPin: boolean
  canPinTop: boolean
}

/**
 * Where this editor parks the seconds it has not written to the URL yet.
 *
 * Its own key, separate from the motion studio's: the two documents are not
 * the same shape, and a still opened in the tab a shot was closed in must not
 * be offered the shot back. See ./draft.ts.
 */
const DRAFT_KEY = 'studio:scene'

export function SceneEditor({
  initial,
  worlds = [],
  deco = false,
  space,
}: {
  initial: StudioScene
  /** Worlds that can be pulled in as a set. Empty is simply no picker. */
  worlds?: ImportableWorld[]
  /**
   * Whether to offer keeping the frame as a deco picture.
   *
   * Only the backoffice passes this. The action behind it is admin-only and
   * writes into the repo, so a space's copy of this editor has nothing to gain
   * from a button that would refuse everyone who pressed it.
   */
  deco?: boolean
  space?: EditorSpace
}) {
  const [scene, setScene] = useState(initial)

  /** The document as the address bar last had it. See ./draft.ts. */
  const written = useRef(encodeScene(initial))

  const [ready, setReady] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [name, setName] = useState('scene')
  const [savingDeco, startDeco] = useTransition()

  /**
   * The three.js objects, reached out of the canvas.
   *
   * A ref rather than state because nothing renders from them: they exist so
   * the export button, which lives outside the `<Canvas>`, can draw one frame
   * at a size the viewport is not.
   */
  const gpu = useRef<Parts | null>(null)

  /**
   * The link, rewritten as the scene changes.
   *
   * `history.replaceState` rather than `router.replace`, and no entry pushed:
   * this fires on every slider tick, and either a navigation or a history entry
   * per tick would make the back button useless and re-run the server component
   * a hundred times on the way. Nothing on the page reads the URL after mount,
   * so writing it directly is the whole job.
   *
   * Debounced for the same reason - dragging a slider is a few hundred state
   * updates, and each one would otherwise re-encode and re-write the address
   * bar.
   */
  useEffect(() => {
    park(DRAFT_KEY, written.current, scene)

    const timer = setTimeout(() => {
      const next = encodeScene(scene)
      window.history.replaceState(null, '', `?s=${next}`)
      written.current = next
      park(DRAFT_KEY, next, scene)
    }, 300)
    return () => clearTimeout(timer)
  }, [scene])

  /**
   * Whatever this page load is a continuation of.
   *
   * On mount rather than in `useState`, because this component is
   * server-rendered and `sessionStorage` is not there - see the same note in
   * the motion studio, and ./draft.ts for what a draft is and is not.
   */
  useEffect(() => {
    const draft = parked(DRAFT_KEY, written.current)
    if (draft !== null) setScene(parseScene(draft))
  }, [])

  /** Fired by the stage once every model and texture has arrived. */
  const onReady = useCallback(() => setReady(true), [])

  /**
   * Where the camera ended up, back into the document.
   *
   * One-way on purpose. The orbit control owns the camera once it is mounted,
   * so the document follows it rather than the other way round - a two-way
   * binding here is the classic fight where every reported position triggers a
   * re-render that snaps the camera back to where it just was.
   */
  /**
   * Whether an orbit is allowed to rewrite the framing.
   *
   * A still has no camera keys to be locked to - the framing *is* the picture -
   * so the lock means the other useful thing: look around without composing.
   * Every drag used to overwrite the shot you had, which made "let me just see
   * what is behind that wall" a destructive act on a framing somebody had spent
   * ten minutes on.
   *
   * Unlocking puts the camera back where the document says, rather than
   * adopting wherever the looking ended up: the whole promise of the lock is
   * that the composition survives it, and a lock that quietly kept your last
   * drag would be the bug it exists to prevent. Orbiting unlocked is still how
   * you compose.
   */
  const [locked, setLocked] = useState(false)

  /**
   * A press of "Back to framing", carrying the framing to go back to.
   *
   * The framing travels *with* the request rather than being read inside the
   * effect that applies it, and that is the whole reason this is a state object
   * and not a boolean: an effect that depended on `scene.camera` would re-run on
   * every reported orbit and snap the camera back mid-drag, which is precisely
   * the fight the note on `onCamera` above describes.
   */
  const [restore, setRestore] = useState<{ at: number; position: Vec3; target: Vec3 } | null>(
    null,
  )

  const onCamera = useCallback(
    (position: Vec3, target: Vec3) => {
      if (locked) return
      setScene((current) => ({ ...current, camera: { ...current.camera, position, target } }))
    },
    [locked],
  )

  /**
   * One frame, at the delivered size, as a PNG.
   *
   * The viewport is whatever size the panel left it, and the export is whatever
   * the output fields say - so the renderer is resized, drawn, read back and
   * put straight again. `updateStyle: false` keeps the canvas element's CSS
   * size untouched through all of it, so the picture on screen does not jump
   * while the shutter fires.
   *
   * `preserveDrawingBuffer` on the canvas below is the other half: without it
   * the colour buffer may be discarded after a draw, and `toDataURL` reads back
   * a transparent rectangle on most drivers.
   */
  const renderPng = (): string | null => {
    const parts = gpu.current
    if (!parts) return null
    const { gl, scene: three, camera } = parts

    const previousSize = { x: gl.domElement.width, y: gl.domElement.height }
    const previousRatio = gl.getPixelRatio()
    const previousAspect = camera.aspect

    // Pixel ratio 1, because the size asked for is the size delivered: at the
    // screen's ratio a 1600px export would come back 3200px wide on a retina
    // display, which is a surprise nobody wants in a filename that says 1600.
    gl.setPixelRatio(1)
    gl.setSize(scene.width, scene.height, false)
    camera.aspect = scene.width / scene.height
    camera.updateProjectionMatrix()
    gl.render(three, camera)

    const dataUrl = gl.domElement.toDataURL('image/png')

    gl.setPixelRatio(previousRatio)
    gl.setSize(previousSize.x / previousRatio, previousSize.y / previousRatio, false)
    camera.aspect = previousAspect
    camera.updateProjectionMatrix()
    gl.render(three, camera)

    return dataUrl
  }

  const exportPng = () => {
    const dataUrl = renderPng()
    if (!dataUrl) return

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${name || 'scene'}.png`
    link.click()

    setNote(`saved ${name || 'scene'}.png — ${scene.width}×${scene.height}`)
  }

  /**
   * The same frame, into `public/xo/scenes` instead of into Downloads.
   *
   * The export above is an artefact somebody takes away; this one is an asset
   * the product keeps - it is what a news banner points at, and what the
   * pictures page lists. Same pixels either way, which is why it draws through
   * `renderPng` rather than a second capture path.
   *
   * It writes into the repo, so it only works in development. The action says
   * so in plain words rather than half-succeeding; see the note there for why
   * a container filesystem is the wrong place for this.
   */
  const keepAsDeco = () => {
    const dataUrl = renderPng()
    if (!dataUrl) return

    setNote(null)
    startDeco(async () => {
      const result = await saveDecoPicture({ name: name || 'scene', dataUrl })
      setNote(result.ok ? `kept as ${result.path}` : result.error)
    })
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setNote('link copied')
  }

  return (
    // Two columns from `md` - see the note in the motion editor about tablets in
    // landscape getting the phone's stacked layout.
    <div className="grid gap-4 pb-24 md:grid-cols-[minmax(0,1fr)_18rem] md:pb-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-3">
        {/*
         * The viewport carries the export's aspect ratio, not the panel's.
         *
         * Otherwise the framing you compose is not the framing you get: a wide
         * box on screen and a square output means everything at the left and
         * right edges falls outside the PNG, and you only find out by opening
         * the file.
         */}
        {/*
          Stuck to the top on a narrow screen, and only there.

          The same treatment the motion editor gives its viewport, arrived at for
          the same reason and overdue here: a phone stacks the picture, the file
          row and the whole prop panel into one column, so every edit below the
          fold is made blind - you move an actor, then scroll up to find out
          where it went. Pinned, the picture is the one thing always on screen.

          Capped at 45dvh, expressed as a *width*. `aspect-ratio` with a
          `max-height` does not shrink the width to keep the ratio - it keeps the
          width and breaks the ratio, which would compose the still at a framing
          it will never be exported at. A tall 1080x1920 poster is the case that
          proves it.

          From `md` it goes back to `relative`: the panel is beside the picture
          there and there is nothing to pin.
        */}
        <div
          className="checker sticky top-0 z-20 mx-auto w-full max-w-[var(--still-cap)] overflow-hidden rounded-2xl border border-border md:relative md:max-w-none"
          style={
            {
              aspectRatio: `${scene.width} / ${scene.height}`,
              '--still-cap': `calc(45dvh * ${scene.width / scene.height})`,
            } as React.CSSProperties
          }
        >
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            // Transparent, and readable back afterwards. Both are the export.
            gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
            camera={{
              position: initial.camera.position,
              fov: initial.camera.fov,
              near: 0.1,
              far: 400,
            }}
          >
            <Bridge partsRef={gpu} />
            <Lens fov={scene.camera.fov} />
            {/* `makeDefault` is what puts the control into the R3F state, which
                is how `<CameraReporter>` below finds it. Damping off so the
                camera stops where the drag stopped - with it on, the position
                reported at `end` is not the one you are looking at. */}
            <OrbitControls makeDefault target={initial.camera.target} enableDamping={false} />
            <CameraReporter onCamera={onCamera} />
            <Reframe request={restore} />
            <SceneStage scene={scene} onReady={onReady} />
          </Canvas>

          {/*
            The camera's controls, on the camera - the same argument, the same
            corner and the same treatment as the shot editor's pair, so the two
            studios are one tool rather than two.

            A still has no camera keys to follow, so the lock means the other
            thing it can mean here: look around without composing. Everything
            else in this editor is a knob that changes the picture; this is the
            one control that promises not to.
          */}
          <div className="pointer-events-none absolute right-3 bottom-4 flex gap-1.5">
            <button
              type="button"
              onClick={() => setLocked((on) => !on)}
              title={
                locked
                  ? 'Framing locked — drag to look around without changing the shot.'
                  : 'Orbiting composes the shot. Click to protect this framing.'
              }
              className={`pointer-events-auto flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs backdrop-blur-sm transition ${
                locked
                  ? 'border-accent bg-black/60 text-white'
                  : 'border-white/20 bg-black/50 text-white/80 hover:border-white/50 hover:text-white'
              }`}
            >
              {locked ? (
                <Lock className="size-4" aria-hidden />
              ) : (
                <Move3d className="size-4" aria-hidden />
              )}
              {/* The same words as the shot editor's, so the control is one
                  idea across the two studios. */}
              <span className="hidden sm:inline">{locked ? 'Camera lock' : 'Free look'}</span>
            </button>

            {/* Only while locked, because unlocked there is nothing to go back
                to: wherever you are looking is the framing. */}
            {locked && (
              <button
                type="button"
                onClick={() =>
                  setRestore({
                    at: performance.now(),
                    position: scene.camera.position,
                    target: scene.camera.target,
                  })
                }
                title="Put the camera back where the composition says"
                className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-sky-300/50 bg-black/50 px-2 py-1.5 text-xs text-white backdrop-blur-sm transition hover:border-sky-300"
              >
                <Undo2 className="size-4" aria-hidden />
                <span className="hidden sm:inline">Back to framing</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="File name"
            className="w-40 rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
          {/* `text-white` used to be here as well as `text-primary-foreground`,
              and the later class wins - which on a near-white `--primary` is a
              white label on a white pill. Two colour classes on one element is
              a thing to notice rather than to merge. */}
          <button
            type="button"
            onClick={exportPng}
            disabled={!ready}
            title={ready ? 'Download this frame as a transparent PNG' : 'Waiting for the models to arrive'}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-40"
          >
            {ready ? (
              <ImageDown className="size-4" aria-hidden />
            ) : (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            )}
            {ready ? 'Export PNG' : 'Loading models…'}
          </button>
          {deco && (
            <button
              type="button"
              onClick={keepAsDeco}
              disabled={!ready || savingDeco}
              title="Write this frame into public/xo/scenes — development only"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary disabled:opacity-40"
            >
              {savingDeco ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              Keep as deco
            </button>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary"
          >
            <Link2 className="size-4" aria-hidden />
            Copy link
          </button>
          {/* The way into the motion studio: this arrangement, with a clock.
              A plain link rather than a button because it is a navigation to
              the other document, and the lift is pure - see `shotFromScene`. */}
          <a
            href={studioHref('video', space?.slug, encodeShot(shotFromScene(scene)))}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary"
          >
            Animate this
          </a>
          {/* The way into the hero studio. Nothing is carried across: a hero
              composes around an exported *picture*, not around a live scene, so
              the honest flow is export the PNG here, then point the hero's
              source field at it. */}
          <a
            href={studioHref('hero', space?.slug)}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary"
          >
            Hero studio
          </a>
          <button
            type="button"
            onClick={() => setScene(DEFAULT_SCENE)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            Reset
          </button>
          {note && <span className="text-sm text-muted-foreground">{note}</span>}
        </div>

        {/*
          Pinning, from here rather than from the board.
          The same argument the motion studio's save panel makes: you attach a
          thing while you are looking at it, having just made it, not by writing
          a notice first and then recognising a name in a row of thumbnails.
          Below the file row rather than in it, because the row is what you do
          with the file and this is what you do with the picture.
        */}
        {space?.canPin && ready && (
          <PinPicture space={space} render={renderPng} name={name} />
        )}
      </div>

      <aside className="min-w-0 md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:self-start md:overflow-y-auto md:pr-1">
        <SceneControls scene={scene} onChange={setScene} worlds={worlds} />
      </aside>
    </div>
  )
}

/**
 * A data URL, as bytes.
 *
 * Hand-decoded rather than `await fetch(dataUrl).then(r => r.blob())`, which is
 * the shorter way to write this and a request the page's `connect-src` has no
 * reason to allow. `canvas.toBlob` is the other obvious answer and is wrong
 * here for a subtler reason: it is asynchronous, and `renderPng` resizes the
 * renderer, draws, reads and puts it straight again in one synchronous run - so
 * by the time a `toBlob` callback fired, the buffer it read would be the one at
 * the *viewport's* size rather than the export's.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/png'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime })
}

/**
 * Put this frame on the space's board.
 *
 * Two steps behind one button, deliberately - unlike the motion studio, where
 * pinning needs a saved row first and says so. There is nothing to save here: a
 * picture is not a document the board fetches later, it is the pixels
 * themselves, so the notice cannot exist until the file does. Making somebody
 * press "upload" and then "pin" would be two clicks for one act with no
 * decision in between.
 *
 * The caption is optional, for the reason `publishPostSchema` grew a refine:
 * from a studio the thing being posted is the picture, and demanding a sentence
 * to go with it is a toll on the common case.
 */
function PinPicture({
  space,
  render,
  name,
}: {
  space: EditorSpace
  /** The export path, so the pinned picture is the same pixels the file is. */
  render: () => string | null
  name: string
}) {
  const [caption, setCaption] = useState('')
  const [top, setTop] = useState(false)
  const [done, setDone] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const pin = () => {
    setProblem(null)

    const dataUrl = render()
    if (!dataUrl) {
      setProblem('The picture would not export — try again in a moment.')
      return
    }

    start(async () => {
      const form = new FormData()
      form.append(
        'file',
        new File([dataUrlToBlob(dataUrl)], `${name || 'picture'}.png`, {
          type: 'image/png',
        }),
      )
      form.append('slug', space.slug)

      const response = await fetch('/api/upload', { method: 'POST', body: form })
      if (!response.ok) {
        // The route answers with a sentence worth showing - too large, wrong
        // type, a workspace that may not write - so it is shown rather than
        // replaced with a generic failure.
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        setProblem(body?.error ?? 'That picture could not be stored.')
        return
      }

      const uploaded = (await response.json()) as { slug?: string }
      if (!uploaded.slug) {
        setProblem('That picture could not be stored.')
        return
      }

      const result = await publishPost(space.slug, caption.trim(), top, null, uploaded.slug)
      if (!result.ok) {
        setProblem(result.error)
        return
      }

      // The caption clears and nothing else does: pinning a second frame of the
      // same arrangement is a thing people do deliberately, and it should not
      // come back with the old words already in the box.
      setCaption('')
      setDone(true)
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-secondary/40 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">Pin it to the board</p>

      <textarea
        value={caption}
        rows={2}
        maxLength={2000}
        placeholder="Say something about it — or don't."
        onChange={(event) => {
          setCaption(event.target.value)
          setDone(false)
        }}
        className="resize-y rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
      />

      {space.canPinTop && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={top}
            onChange={(event) => setTop(event.target.checked)}
            className="accent-accent"
          />
          Keep it at the top
        </label>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={pin}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Pin className="size-3.5" aria-hidden />
          )}
          {pending ? 'Pinning…' : done ? 'Pin it again' : 'Pin it'}
        </button>

        {done && (
          <a
            href={`/t/${space.slug}`}
            className="text-xs text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
          >
            on the board
          </a>
        )}
      </div>

      {problem && <p className="text-xs text-amber-400">{problem}</p>}
    </div>
  )
}

/** Hands the renderer, scene and camera out to the export button. */
function Bridge({ partsRef }: { partsRef: React.RefObject<Parts | null> }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera

  useEffect(() => {
    partsRef.current = { gl, scene, camera }
  }, [partsRef, gl, scene, camera])

  return null
}

/**
 * Field of view, applied to the live camera.
 *
 * The one camera property the panel owns rather than the orbit control: zoom
 * moves the camera along its own axis, which changes where you are, and a lens
 * change is a different picture from the same place.
 *
 * The camera is reached through the store rather than through `useThree(s =>
 * s.camera)` because it is being mutated, and mutating something a hook handed
 * back is what the compiler's immutability rule is for. Pulling it out of the
 * store inside the effect says the true thing: this is an imperative poke at a
 * live three.js object, not a React value.
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

/**
 * Puts the camera back on the composed framing, when asked.
 *
 * Reached through the store and mutated, for the reason written on `<Lens>`
 * above: this is an imperative poke at a live three.js object.
 *
 * The request carries the framing with it, so this effect's dependencies change
 * only when somebody presses the button. Depending on `scene.camera` instead
 * would re-run it on every orbit the control reports, and the camera would snap
 * home under the drag that moved it.
 *
 * The orbit control has to be told as well as the camera: it holds the pivot,
 * and a camera moved behind its back is one the very next drag swings straight
 * back to where it was.
 */
function Reframe({ request }: { request: { at: number; position: Vec3; target: Vec3 } | null }) {
  const store = useStore()

  useEffect(() => {
    if (!request) return
    const state = store.getState()
    const camera = state.camera
    const controls = state.controls as { target: THREE.Vector3; update: () => void } | null

    camera.position.set(...request.position)
    controls?.target.set(...request.target)
    controls?.update()
    camera.lookAt(...request.target)
  }, [store, request])

  return null
}

/**
 * Where the camera is, reported back to the document.
 *
 * Polled off the controls' own change event rather than sampled every frame:
 * orbiting fires a hundred of these a second and each one is a React state
 * update that re-renders the whole panel. Rounded to a tenth of a unit, which
 * is finer than anybody can aim by dragging, and keeps the encoded link short
 * enough to paste.
 */
/**
 * As much of the orbit control as the reporter touches.
 *
 * R3F types `state.controls` as the base `EventDispatcher`, whose event map is
 * empty - so `addEventListener('end', …)` does not type-check against it even
 * though that is the event the control fires. Stating the two members used here
 * is more honest than widening the whole control to `any`.
 */
type Orbit = {
  target: THREE.Vector3
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

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
    // to rest, and updating mid-drag would re-render the scene under the mouse.
    controls.addEventListener('end', report)
    return () => controls.removeEventListener('end', report)
  }, [controls, camera, onCamera])

  return null
}
