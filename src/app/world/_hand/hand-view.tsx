'use client'

import { Canvas } from '@react-three/fiber'

import type { Pose } from '@/app/world/_hand/fingers'
import { NeonHand } from '@/app/world/_hand/neon-hand'
import type { Drift } from '@/app/world/_hand/sight'

/**
 * A hand, in a box, with a canvas of its own.
 *
 * Its own canvas rather than a corner of the room's, and that is worth the
 * second context. The hand has to be exactly as readable in the chart, on the
 * practice page and in a settings preview as it is in a lounge - and all three
 * of those are pages with no world running. Hanging it off the room's canvas
 * would mean the only place you could ever look at your own hand is the one
 * place there is already something else to look at.
 *
 * It also keeps the camera honest. The hand is framed here, once, from slightly
 * off to one side - straight on, a folded finger hides behind its own knuckle
 * and half the alphabet looks the same.
 */

export function HandView({
  pose,
  settle,
  drift,
  roaming,
  className,
}: {
  pose: Pose
  settle?: () => number
  /** Where a watched hand is being held. See `sight.ts`; usually nothing. */
  drift?: () => Drift | null
  /**
   * Stand back, because the hand is going to move.
   *
   * A hand that only ever hangs in one place is framed as tightly as it can be,
   * which is the right framing for a chart row and for the corner of a HUD. One
   * following a camera needs somewhere to go, and a hand that walks out of its
   * own canvas at the edges of the picture is worse than a smaller hand.
   *
   * Done by pushing the hand away from the camera rather than by moving the
   * camera, because `<Canvas camera>` is read when the canvas is made: changing
   * it afterwards is a prop nothing applies, and a keyed canvas that remounted
   * on a switch would drop a WebGL context every time.
   *
   * The sideways and downward part of it is a *measurement*, not a guess. The
   * camera stands off to one side so a folded finger does not hide behind its
   * own knuckle, which means the middle of the picture is not where the origin
   * is; these two numbers put the resting hand back in the middle of the box,
   * and were read off a screenshot rather than derived.
   */
  roaming?: boolean
  className?: string
}) {
  /*
    The size goes on a wrapper, not on the canvas.

    `<Canvas>` writes `width: 100%; height: 100%` as an inline style on its own
    element, and an inline style beats a class - so a Tailwind `h-52` handed
    straight to it is silently ignored, and the canvas takes the height of
    whatever it is standing in instead. In a flex column that is the height of
    the *other* children, which is how a square hand ends up in a letterbox.
  */
  return (
    <div className={className}>
      <Canvas
        /* Transparent: everything this is drawn on top of - a room, a card, a
           row in a chart - is a better backdrop than a grey box. */
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0.9, 0.35, 3.95], fov: 30 }}
        /* No lights, no shadows, no tone mapping. Every material here is its
           own light source - see `neon-hand.tsx`. */
        flat
        dpr={[1, 2]}
      >
        <group
          position={roaming ? [-0.38, -0.79, -2.9] : [0, -0.42, 0]}
          rotation={[0.06, -0.28, 0]}
        >
          <NeonHand pose={pose} settle={settle} drift={drift} />
        </group>
      </Canvas>
    </div>
  )
}
