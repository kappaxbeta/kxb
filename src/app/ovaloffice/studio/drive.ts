'use client'

import { useEffect, useRef } from 'react'
import { type Intent, STILL_INTENT } from '@/domain/studio/puppet'

/**
 * The keyboard, as an intent.
 *
 * All this module does is watch what is held down and turn it into the same
 * `Intent` a thumb on the on-screen stick produces. Everything about what that
 * intent *means* - pace, camera-relative axes, where the animal ends up - is in
 * `@/domain/studio/puppet`, where it can be tested without a browser.
 */

/** The keys that mean something while driving, by what they do. */
export const DRIVE_KEYS = {
  forward: ['w', 'arrowup'],
  back: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  run: ['shift'],
} as const

/**
 * What is held down, right now.
 *
 * A ref rather than state, because this is read inside the frame loop sixty
 * times a second and a `setState` per keystroke would re-render the editor -
 * several hundred inputs deep - to move an animal one step.
 *
 * Cleared whenever driving stops, so a key held while the take ends does not
 * stay held forever: the `keyup` lands on a listener that is no longer there,
 * and the animal would walk off on its own the next time anybody took control.
 */
export function useKeys(active: boolean): React.RefObject<Set<string>> {
  const keys = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Copied out here rather than reached through the ref in the cleanup: the
    // set the listeners were attached for is the one that has to be emptied,
    // and by teardown `keys.current` could in principle be a different one.
    const held = keys.current
    if (!active) {
      held.clear()
      return
    }

    const down = (event: KeyboardEvent) => {
      // Anything typed into a field is typing, not driving. Without this, the
      // line box at the bottom of the viewport walks the animal across the
      // grass while somebody writes their dialogue in it.
      if (isTyping(event.target)) return
      held.add(event.key.toLowerCase())
      if (DRIVEN.has(event.key.toLowerCase())) event.preventDefault()
    }
    const up = (event: KeyboardEvent) => held.delete(event.key.toLowerCase())
    // A tab switch eats the keyup, and the animal would keep walking in the
    // background until somebody came back and pressed the key again.
    const blur = () => held.clear()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      held.clear()
    }
  }, [active])

  return keys
}

export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable
}

/** Everything the driver swallows, so the page does not scroll under a take. */
const DRIVEN = new Set<string>([
  ...DRIVE_KEYS.forward,
  ...DRIVE_KEYS.back,
  ...DRIVE_KEYS.left,
  ...DRIVE_KEYS.right,
  ' ',
])

/** What is held down, as something the puppet understands. */
export function intentFromKeys(keys: ReadonlySet<string>): Intent {
  const held = (names: readonly string[]) => names.some((name) => keys.has(name))

  let forward = 0
  let strafe = 0
  if (held(DRIVE_KEYS.forward)) forward += 1
  if (held(DRIVE_KEYS.back)) forward -= 1
  if (held(DRIVE_KEYS.right)) strafe += 1
  if (held(DRIVE_KEYS.left)) strafe -= 1

  if (forward === 0 && strafe === 0) return STILL_INTENT
  return { forward, strafe, run: held(DRIVE_KEYS.run) }
}
