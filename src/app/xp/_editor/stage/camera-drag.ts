import * as THREE from 'three'
import type { Tool } from '@/app/xp/_editor/stage/stage'

/**
 * What each mouse button does to the camera, given the tool in hand.
 *
 * Split out of ./stage for the reason `./drop-point` is: a drag cannot be
 * watched here. The Browser pane never gives the canvas a size, so R3F never
 * creates its root and `OrbitControls` never exists - which makes "does the
 * hand tool pan" a question only a function can answer.
 *
 * ---------------------------------------------------------------------------
 * The hand tool was half built
 * ---------------------------------------------------------------------------
 * It arrived as a tool that *suppresses* things: no stroke, no pick, so you
 * cannot build by accident. That is half of what a hand is, and not the half
 * anybody picks it up for. Left-drag went on orbiting exactly as it does under
 * Select, so choosing the hand and dragging did the same thing as not choosing
 * it - and it was reported, reasonably, as the viewport not moving at all.
 *
 * Panning did exist. It was on the right button alone, which is a context menu
 * in every other program and is not something anybody discovers by trying
 * things. So the gesture was there and the way to find it was not.
 */
export interface DragButtons {
  LEFT: THREE.MOUSE
  MIDDLE: THREE.MOUSE
  RIGHT: THREE.MOUSE
}

export function dragButtons(tool: Tool): DragButtons {
  return {
    // A hand drags the world in every program that has one. Everything else
    // turns around it, which is what a level is mostly looked at by doing.
    LEFT: tool === 'hand' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    // Unchanged in every tool, including the hand: somebody who already found
    // this should not have it taken away for being early.
    RIGHT: THREE.MOUSE.PAN,
  }
}
