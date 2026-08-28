'use client'

import { Canvas, useFrame, useStore } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type * as THREE from 'three'
import { SceneStage } from '@/app/ovaloffice/studio/scene-stage'
import { Backdrop } from '@/app/world/shots/pieces'
import type { StudioScene } from '@/domain/studio/scene'
import { sceneAt, type ShotSpec } from '@/domain/studio/shot'

/**
 * A saved scene, playing.
 *
 * The studio's editor without any of the editing: no orbit control, no
 * timeline, no recorder - just the clock and the camera the shot already
 * describes. It is the same `sceneAt(shot, t)` the studio draws and the same
 * pieces, because a scene that looked one way in the studio and another on a
 * board would make the studio a preview of nothing.
 *
 * ---------------------------------------------------------------------------
 * Why this component is the expensive one, and is therefore mounted late
 * ---------------------------------------------------------------------------
 * Everything else about a pinned scene is cheap: a card is a JPEG that came
 * down with the row. This is a WebGL context, a glTF per animal and a frame
 * loop, and a board with ten of them mounted is ten of each. So nothing renders
 * it until somebody presses play - see `SceneCard`, which holds the poster
 * until then and is the reason the poster exists at all.
 *
 * ---------------------------------------------------------------------------
 * Why it loops, when the studio deliberately does not
 * ---------------------------------------------------------------------------
 * The studio stops on the last frame, because the end of a shot is a moment you
 * need to be able to park on and judge. Nobody is judging anything here. A
 * scene on a board is a thing you glance at, and one that stops dead on its
 * final frame reads as broken - so this wraps, and the pause button is how you
 * stop it.
 */
export function ScenePlayer({
  shot,
  playing = true,
  className,
}: {
  shot: ShotSpec
  playing?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 2]}
        shadows="percentage"
        // No `preserveDrawingBuffer`: nothing here reads the buffer back, and
        // keeping it costs memory on every canvas on the board. The studio
        // needs it because it exports; a player never does.
        gl={{ alpha: false, antialias: true }}
        camera={{
          position: shot.camera[0].position,
          fov: shot.camera[0].fov,
          near: 0.1,
          far: 400,
        }}
      >
        {shot.background.image === null && (
          <color attach="background" args={[shot.background.colour]} />
        )}
        <Backdrop image={shot.background.image} aspect={shot.width / shot.height} />
        <Reel shot={shot} playing={playing} />
      </Canvas>
    </div>
  )
}

/** The clock, and the scene it implies. Inside the canvas, so time re-renders only this. */
function Reel({ shot, playing }: { shot: ShotSpec; playing: boolean }) {
  const [time, setTime] = useState(0)
  const now = useRef(0)

  useFrame((_, delta) => {
    if (!playing) return
    // Wrapped rather than clamped - see the note above about why this loops and
    // the studio does not. The modulo also means a tab that was backgrounded
    // for a minute resumes somewhere sensible instead of at the end.
    now.current = (now.current + delta) % Math.max(shot.duration, 0.1)
    setTime(now.current)
  })

  const scene = sceneAt(shot, time)

  return (
    <>
      <Lens framing={scene.camera} />
      <SceneStage scene={scene} onReady={noop} />
    </>
  )
}

function noop(): void {}

/**
 * The shot's framing, on the real camera.
 *
 * The same imperative poke the studio's own `Lens` makes, and unconditional
 * here because there is no author to hand the camera to - a player has no free
 * look, so the shot's camera is the only camera there is.
 */
function Lens({ framing }: { framing: StudioScene['camera'] }) {
  const store = useStore()
  const [x, y, z] = framing.position
  const [tx, ty, tz] = framing.target
  const { fov } = framing

  useEffect(() => {
    const camera = store.getState().camera as THREE.PerspectiveCamera
    camera.position.set(x, y, z)
    camera.lookAt(tx, ty, tz)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }, [store, x, y, z, tx, ty, tz, fov])

  return null
}
