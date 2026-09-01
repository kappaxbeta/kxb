'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { KeepContext, useSurface } from '@/app/world/_canvas/keep-context'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { SkinModel } from '@/app/world/lounge/_canvas/skin-model'
import type { AvatarClip } from '@/domain/lounge/avatars'

/**
 * A body, alive, outside a room.
 *
 * ---------------------------------------------------------------------------
 * Why this exists when a still already did the job
 * ---------------------------------------------------------------------------
 * Every body in this product ships a pre-rendered picture, and pages have used
 * them on the argument that a WebGL context is expensive and a picture is not.
 * That argument is sound about *cost* and silent about the thing being sold: a
 * peep is a walk, a run and a dance, and a still is the one frame that shows
 * none of them. Somebody choosing a body is choosing how it moves.
 *
 * So the still is not thrown away - it is the fallback, which is the shape that
 * settles the old objection rather than arguing with it. The picture is on
 * screen in the first frame, with no request and no context, and the canvas
 * replaces it when the glTF has landed. A page that never gets that far shows
 * exactly what it showed before.
 *
 * ---------------------------------------------------------------------------
 * One canvas, and it holds the two bodies apart
 * ---------------------------------------------------------------------------
 * An account has a peep and, if it bought one, an XP body, and the two are
 * drawn by two components that disagree about how to clone, where clips come
 * from and what a clip is called - see `SkinModel`, which says so at length.
 * This picks between them and shares everything else: one context, one camera,
 * one light rig, one set of clip names.
 *
 * The clip names are the lounge's four. `SkinModel` translates them into the
 * rig's own vocabulary, so a caller offering "dance" gets a dance from either
 * body without knowing which one it is looking at.
 */
export function BodyStage({
  /** A skin id (`adventurers/Knight`) draws the XP body; null draws the peep. */
  skin,
  /** The animal, drawn when there is no skin. */
  avatar,
  clip,
  /** The still, shown until the model lands and if it never does. */
  fallback,
}: {
  skin: string | null
  avatar: string
  clip: AvatarClip
  fallback: React.ReactNode
}) {
  const surface = useSurface()

  return (
    <div className="relative size-full overflow-hidden rounded-2xl bg-surface-raised">
      {/*
        The picture underneath, always.

        Not a `<Suspense fallback>` alone: that covers the wait for the glTF and
        not the case that matters more here, which is a machine or a browser
        that will not give this page a context at all. A canvas drawn over it
        hides it the moment there is something better to show.
      */}
      <div className="absolute inset-0">{fallback}</div>

      <Canvas
        key={surface.key}
        className="relative"
        /* No shadows and no tone mapping to argue about: this is a body on a
           plain ground, and every gramme of it is spent on the body. */
        camera={{ position: [0, 1.1, 2.6], fov: 35, near: 0.1, far: 20 }}
        dpr={[1, 2]}
      >
        <KeepContext onChange={surface.watch} />

        {/* Enough light to read a silhouette by, from in front and above, with
            a cool fill so the unlit side is not black. */}
        <ambientLight intensity={1.1} />
        <directionalLight position={[2, 4, 3]} intensity={1.8} />
        <directionalLight position={[-3, 1, -2]} intensity={0.5} color="#a5b4fc" />

        {/*
          Turn it, but do not walk away from it.

          No pan and no zoom: this is a portrait, and the one thing anybody
          wants from it is to see the other side. A preview somebody can lose
          the subject in is a preview with a reset button in its future.
        */}
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          target={[0, 0.75, 0]}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.9}
        />

        <Suspense fallback={null}>
          <group position={[0, -0.2, 0]}>
            {skin ? (
              <SkinModel model={skin} clip={clip} />
            ) : (
              <AvatarModel model={avatar} clip={clip} />
            )}
          </group>
        </Suspense>
      </Canvas>
    </div>
  )
}
