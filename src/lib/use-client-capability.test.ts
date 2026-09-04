import { afterEach, describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useClientCapability } from '@/lib/use-client-capability'
import { canRecord as studioCanRecord } from '@/app/ovaloffice/studio/record'
import { canRecord as movieCanRecord } from '@/app/xp/_editor/movie/export'

/**
 * The bug this hook exists to fix: a capability question answered during
 * render is answered by the server, and the server is never the machine that
 * will do the recording.
 *
 * `renderToStaticMarkup` rather than mounting anything - it runs the real
 * component function through real React, in the same "no browser behind this"
 * position an actual SSR pass is in, without needing jsdom to get there. What
 * happens *after* hydration - `useSyncExternalStore` re-checking the snapshot
 * and correcting the render - is React's own machinery and is not exercised
 * here, the same call `stuck-store.test.ts` makes about not exercising
 * `useStuck`: testing React's plumbing would test React.
 */

function Probe({ check }: { check: () => boolean }) {
  return createElement('span', null, useClientCapability(check) ? 'yes' : 'no')
}

describe('the answer a render with no browser gets', () => {
  test('is false even when the live check would say yes', () => {
    // A `check` that answers `true` unconditionally stands in for a browser
    // that can record - and the render still comes back `false`, because the
    // question is never actually put to `check` on this pass. That is the
    // whole fix: the server snapshot wins the first render regardless of what
    // the environment can really do, so nothing frozen from this render can
    // ever read as "yes" by accident.
    const html = renderToStaticMarkup(createElement(Probe, { check: () => true }))
    expect(html).toBe('<span>no</span>')
  })

  test('is false when the live check agrees', () => {
    const html = renderToStaticMarkup(createElement(Probe, { check: () => false }))
    expect(html).toBe('<span>no</span>')
  })
})

describe('the check a mounted client is handed', () => {
  type Global = { MediaRecorder?: unknown }
  const original = (globalThis as Global).MediaRecorder

  afterEach(() => {
    if (original === undefined) delete (globalThis as Global).MediaRecorder
    else (globalThis as Global).MediaRecorder = original
  })

  /**
   * This is the half `renderToStaticMarkup` cannot reach: once mounted,
   * `useSyncExternalStore` calls `check` again for real, and what it gets back
   * has to depend on the actual machine rather than being cached from the
   * render above. So the pin is on `check` itself - `canRecord`, both copies,
   * the exact function each call site hands the hook untouched - answering
   * honestly for whichever environment it runs in, `MediaRecorder` present or
   * not. `record.test.ts` already covers the "no MediaRecorder" half for the
   * studio's copy in this same bun environment; what was never covered, and
   * is the actual shape of this bug, is the other side of that toggle.
   */
  test('both copies of canRecord are unable to record with no MediaRecorder', () => {
    delete (globalThis as Global).MediaRecorder
    expect(studioCanRecord()).toBe(false)
    expect(movieCanRecord()).toBe(false)
  })

  test('both copies flip to able the moment MediaRecorder exists', () => {
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true
      }
    }
    ;(globalThis as Global).MediaRecorder = FakeMediaRecorder

    expect(studioCanRecord()).toBe(true)
    expect(movieCanRecord()).toBe(true)
  })
})
