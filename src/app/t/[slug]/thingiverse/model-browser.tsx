'use client'

import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import {
  drawingOf,
  type ModelHit,
  modelLabel,
  modelUrlFor,
  thumbnailFor,
} from '@/domain/thingiverse/models'

/**
 * The catalogue, with the thing you pointed at standing in a viewport.
 *
 * ---------------------------------------------------------------------------
 * What a tile is for, now that it does not make anything
 * ---------------------------------------------------------------------------
 * It used to make a blueprint of itself, which was the wrong verb for a
 * catalogue - see the note in `hub.tsx`. Taking that away left a grid of
 * pictures with no behaviour at all, and a picture is a poor answer to the
 * question somebody is actually asking here: *what is this*. A 192px thumbnail
 * is one angle, at one moment, with no scale beside it and no idea whether the
 * thing moves.
 *
 * So a tile selects, and the selection stands on a podium above the grid at
 * whatever size the pack says it is, turnable, playing whatever it came with.
 * That is the whole of what a reference has to do.
 *
 * ---------------------------------------------------------------------------
 * One canvas, not one per tile
 * ---------------------------------------------------------------------------
 * A hundred and twenty live previews is a hundred and twenty WebGL contexts,
 * which browsers cap somewhere around sixteen and then start silently dropping
 * the oldest. The thumbnails stay thumbnails - they are what the grid is for -
 * and there is exactly one context on the page, above them, holding whatever
 * the grid last pointed at.
 */
export function ModelBrowser({
  hits,
  packOf,
  cut,
  t,
}: {
  hits: ModelHit[]
  /** A pack id to its label, resolved on the server. See the panel. */
  packOf: Record<string, string>
  /** The models this space has already made a blueprint of. */
  cut: string[]
  t: WorkspaceDict['thingiverse']['browser']
}) {
  const [picked, setPicked] = useState<string | null>(null)

  // A set rather than an `Array.includes` per tile: the shelf is a few hundred
  // and the grid is a hundred and twenty, and a linear scan inside a map is the
  // shape that turns this page quadratic the day somebody has a big shelf.
  const already = useMemo(() => new Set(cut), [cut])

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <Preview model={picked} t={t} />

        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => setPicked(picked === hit.id ? null : hit.id)}
                aria-pressed={picked === hit.id}
                title={hit.id}
                className={`relative flex w-full flex-col items-center rounded-xl border p-1.5 transition ${
                  picked === hit.id
                    ? 'border-accent bg-accent/15'
                    : 'border-line/60 bg-surface hover:border-accent/50 hover:bg-surface-raised'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailFor(hit.id)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full rounded-lg bg-surface-raised/60 object-contain"
                />
                <span className="mt-1 w-full truncate text-center text-[0.7rem] text-ink">
                  {hit.label}
                </span>
                <span className="w-full truncate text-center text-[0.62rem] text-ink-muted">
                  {packOf[hit.packId] ?? hit.packId}
                </span>
                {/*
                  Already on the shelf, marked the way the skin shop marks one
                  you own - a cyan tick in the corner. Cyan because it is a
                  finished state rather than something to press, which is the
                  whole of what the two neons say.
                */}
                {already.has(hit.id) && (
                  <span
                    aria-label={t.onTheShelf}
                    className="absolute right-1.5 top-1.5 text-[0.7rem] text-accent-2"
                  >
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * The podium.
 *
 * Sticky on a wide screen, because the grid under it is a hundred and twenty
 * rows long and the whole value of the preview is that it is still on screen
 * while you scroll past the next forty crates.
 */
function Preview({
  model,
  t,
}: {
  model: string | null
  t: WorkspaceDict['thingiverse']['browser']
}) {
  const [clip, setClip] = useState<string | null>(null)

  /**
   * The clip list is reported *up* from inside the canvas.
   *
   * Which animations a glTF carries is not knowable until it has loaded, and it
   * loads inside a `<Suspense>` under the `<Canvas>` - so the picker outside
   * cannot ask. It is handed the names when they arrive, and holds null until
   * then, which is also the state a model with no animations stays in forever.
   */
  const [clips, setClips] = useState<string[]>([])

  return (
    <div className="lg:sticky lg:top-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-line/60 bg-sky">
        {model === null ? (
          /*
            Nothing picked.

            A sentence rather than an empty box or a spinning placeholder: the
            viewport is otherwise indistinguishable from one that failed to
            load, and the instruction is one line long.
          */
          <p className="grid h-full place-items-center px-6 text-center text-xs leading-relaxed text-ink-muted">
            {t.nothingPicked}
          </p>
        ) : (
          <Canvas
            // Keyed on the model: a mixer caches its bindings under the root it
            // was handed, so swapping the model under a live canvas leaves the
            // new one standing stone still. The same fact the shop's podium
            // states about a re-dressed body.
            key={model}
            camera={{ position: [2.2, 1.6, 2.6], fov: 40, near: 0.05, far: 100 }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={1.1} />
            <directionalLight position={[3, 6, 4]} intensity={2.2} />
            <pointLight position={[-2, 0.5, 2]} intensity={8} color="#ff4fa3" />
            <pointLight position={[2, 1, 2]} intensity={7} color="#4fd8ff" />
            <OrbitControls
              makeDefault
              enableDamping={false}
              enablePan={false}
              maxPolarAngle={Math.PI / 1.9}
              minDistance={0.6}
              maxDistance={14}
            />
            <gridHelper args={[8, 8, '#f0abfc', '#3b3357']} />
            <Suspense fallback={null}>
              <Shown model={model} clip={clip} onClips={setClips} />
            </Suspense>
          </Canvas>
        )}
      </div>

      {model !== null && (
        <div className="mt-2 space-y-1.5">
          <p className="truncate text-sm text-ink">{modelLabel(model)}</p>
          <p className="truncate font-mono text-[10px] text-ink-muted">{model}</p>

          {/*
            The clips it carries, if any.

            Most of the catalogue carries none - these are props - so this row
            is absent rather than empty for the majority. Saying "no animations"
            under every crate would be a page mostly made of that sentence.
          */}
          {clips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                {fill(t.plays, { n: String(clips.length) })}
              </span>
              <button
                type="button"
                aria-pressed={clip === null}
                onClick={() => setClip(null)}
                className={CHIP(clip === null)}
              >
                {t.still}
              </button>
              {clips.map((one) => (
                <button
                  key={one}
                  type="button"
                  aria-pressed={clip === one}
                  onClick={() => setClip(one)}
                  className={CHIP(clip === one)}
                >
                  {one}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CHIP = (on: boolean) =>
  `rounded-full border px-2 py-0.5 text-[10px] transition ${
    on
      ? 'border-accent/60 bg-accent/20 text-ink'
      : 'border-line/60 text-ink-muted hover:bg-surface-raised hover:text-ink'
  }`

/**
 * The model itself, at the size its pack means.
 *
 * `drawingOf` rather than a fixed scale, so what stands here is the size the
 * thing will be when it is summoned - which is the one fact a thumbnail cannot
 * carry and the reason somebody opens a preview at all. A model neither
 * registry knows draws at 1 and unlifted, which is the same forgiving failure
 * the renderer takes.
 */
function Shown({
  model,
  clip,
  onClips,
}: {
  model: string
  clip: string | null
  onClips: (names: string[]) => void
}) {
  const { scene, animations } = useGLTF(modelUrlFor(model))
  const group = useRef<THREE.Group>(null)

  // Cloned, because `useGLTF` caches by URL and hands back the same graph: two
  // previews of one model in a session would otherwise fight over one object.
  const object = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, group)

  const names = useMemo(() => animations.map((one) => one.name), [animations])

  useEffect(() => {
    onClips(names)
  }, [names, onClips])

  useEffect(() => {
    if (!clip) return
    const action = actions[clip]
    if (!action) return
    action.reset().fadeIn(0.2).play()
    return () => {
      action.fadeOut(0.2)
    }
  }, [actions, clip])

  const drawn = drawingOf(model)

  return (
    <group ref={group} position={[0, drawn?.lift ?? 0, 0]} scale={drawn?.scale ?? 1}>
      <primitive object={object} />
    </group>
  )
}
