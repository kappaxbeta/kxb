'use client'

import { useSyncExternalStore } from 'react'

/**
 * A yes/no question about the browser, answered honestly for the render that
 * has to happen before there is one.
 *
 * `canRecord()` - both copies, `@/app/ovaloffice/studio/record` and
 * `@/app/xp/_editor/movie/export` - reads `typeof MediaRecorder`, which is
 * `undefined` in Node. Calling it inline during render, or once through
 * `useMemo`, answers the question with the server: SSR gets `false` because
 * there is no `MediaRecorder` there, and hydration's first client render asks
 * again before the browser has had a chance to matter, using the exact same
 * render pass React is matching against the server's HTML - so it gets `false`
 * too, and nothing after that ever asks a second time. The button that reads
 * it is disabled forever, on every browser, whether or not it could record.
 *
 * The honest shape is "assume not, then correct once we are on the machine
 * that knows" - which is a *mount-time* correction, not a render-time one.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, for the same
 * reason `useIsTouch` picked it
 * (`@/app/xp/_runtime/hud/touch-controls.tsx`): the mismatch between the
 * server's snapshot and the real one is resolved synchronously against the
 * hydration commit, before the browser paints, rather than in a later effect
 * that paints the wrong answer first and only fixes it a frame afterward. A
 * capability that flips from "cannot record" to "can" one frame after the
 * button was already shown disabled is a worse bug report than the one this
 * file fixes - so the disabled label a caller shows for that first frame is
 * never actually painted; there is nothing to special-case for it.
 *
 * The "subscribe" here is a store that never changes - a codec that exists
 * this session does not stop existing mid-session - so it is a no-op that
 * never calls back. What this buys over a bare `useState(false)` is only the
 * guaranteed one-shot correction at hydration, not a live subscription; if the
 * question ever needed to be re-asked later (a permission that can be revoked,
 * say), this would need a real store behind it instead.
 *
 * Generic rather than named after recording, so the one duplicate-avoiding
 * question - "was this already answered on the client?" - is answered once
 * and imported by both `canRecord`s without merging the modules they belong
 * to. It lives in `src/lib` rather than beside either: `src/app/xp/**` may not
 * import `@/app/ovaloffice/*` (docs/xp-creator.md §1.2, enforced in
 * `eslint.config.mjs`), so a hook the movie editor needs cannot live in the
 * studio's folder, and putting it in the editor's instead would make the
 * product depend on the prototype - the same shape `stuck-store.ts` and
 * `use-camera-mode.ts` already solved by living here.
 */
function noSubscribe(): () => void {
  return () => {}
}

export function useClientCapability(check: () => boolean): boolean {
  return useSyncExternalStore(noSubscribe, check, () => false)
}
