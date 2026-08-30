/**
 * The one question the pane cannot answer: does the hand tool move the view?
 *
 * `OrbitControls` never exists here - no canvas size, no R3F root - so the only
 * evidence available is the mapping itself. See the note in ./camera-drag.
 */
import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { dragButtons, dragTouches } from '@/app/xp/_editor/stage/camera-drag'
import type { Tool } from '@/app/xp/_editor/stage/stage'

const BUILDING: Tool[] = ['place', 'draw', 'erase', 'line', 'rect', 'room']

describe('the hand drags the world', () => {
  test('left-drag pans with the hand', () => {
    expect(dragButtons('hand').LEFT).toBe(THREE.MOUSE.PAN)
  })

  /**
   * The bug, as an assertion. The hand and Select behaving identically on the
   * left button is exactly what "I picked up the hand and nothing changed"
   * means, and it is what this file exists to stop coming back.
   */
  test('and that is different from what Select does', () => {
    expect(dragButtons('hand').LEFT).not.toBe(dragButtons('select').LEFT)
  })
})

describe('every other tool still turns the camera', () => {
  test('select orbits', () => {
    expect(dragButtons('select').LEFT).toBe(THREE.MOUSE.ROTATE)
  })

  /**
   * The building tools must keep `ROTATE` on the left specifically because the
   * plane swallows the event when the pointer is over it - the controls only
   * ever see a left-drag out over the sky. Giving them `PAN` would change what
   * that gesture does for somebody who is mid-level and not thinking about it.
   */
  test('and so does everything that builds', () => {
    for (const tool of BUILDING) {
      expect(dragButtons(tool).LEFT).toBe(THREE.MOUSE.ROTATE)
    }
  })
})

describe('the buttons that do not depend on the tool', () => {
  test('right always pans, so the way somebody already knows keeps working', () => {
    for (const tool of ['select', 'hand', ...BUILDING] as Tool[]) {
      expect(dragButtons(tool).RIGHT).toBe(THREE.MOUSE.PAN)
    }
  })

  test('middle always dollies', () => {
    for (const tool of ['select', 'hand', ...BUILDING] as Tool[]) {
      expect(dragButtons(tool).MIDDLE).toBe(THREE.MOUSE.DOLLY)
    }
  })

  /**
   * Pan and rotate must actually be different values, or every test above
   * passes against a mapping that does nothing. `THREE.MOUSE` is an enum from
   * another package and this is the one thing here that depends on it.
   */
  test('and pan is not rotate', () => {
    expect(THREE.MOUSE.PAN).not.toBe(THREE.MOUSE.ROTATE)
  })
})

describe('the same decision for fingers', () => {
  test('one finger pans with the hand', () => {
    expect(dragTouches('hand').ONE).toBe(THREE.TOUCH.PAN)
  })

  /**
   * The mobile shape of the same bug: the hand and Select doing the same thing
   * on the primary gesture is a phone whose camera circles a point it cannot
   * leave, because one finger is the only gesture a thumb has.
   */
  test('and that is different from what Select does', () => {
    expect(dragTouches('hand').ONE).not.toBe(dragTouches('select').ONE)
  })

  test('every other tool still turns the camera', () => {
    for (const tool of ['select', ...BUILDING] as Tool[]) {
      expect(dragTouches(tool).ONE).toBe(THREE.TOUCH.ROTATE)
    }
  })

  test('two fingers always pinch and pan, so no tool strands the view', () => {
    for (const tool of ['select', 'hand', ...BUILDING] as Tool[]) {
      expect(dragTouches(tool).TWO).toBe(THREE.TOUCH.DOLLY_PAN)
    }
  })

  test('and touch pan is not touch rotate', () => {
    expect(THREE.TOUCH.PAN).not.toBe(THREE.TOUCH.ROTATE)
  })
})
