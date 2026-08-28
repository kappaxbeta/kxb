'use client'

import { useSyncExternalStore } from 'react'
import { launch, type Launch } from '@/lib/telegram/webapp'

/**
 * "Am I inside Telegram?", asked the way React wants it asked.
 *
 * ---------------------------------------------------------------------------
 * Why this is not an effect
 * ---------------------------------------------------------------------------
 * The obvious shape is `useState(false)` plus an effect that reads the URL and
 * sets it. It works, and it is wrong twice.
 *
 * It is wrong to the linter, which is enforcing something real: `setState` in
 * an effect body is a second render pass every time, and this one runs on every
 * page in the app. And it is wrong in the same way for the reason the rule
 * exists — this is not state that React owns and mutates. It is a fact about
 * the browser that was already true before the component existed and will not
 * change while it lives. That is an *external store*, and React has a hook for
 * reading one without either lying to the server or hydrating twice.
 *
 * `getServerSnapshot` returns the pending value, which is the honest server
 * answer: the launch is in a URL fragment, and a fragment never reaches the
 * server. So the first paint agrees with the markup, and the truth arrives
 * immediately after without a mismatch.
 *
 * ---------------------------------------------------------------------------
 * Why "not yet known" is a distinct answer
 * ---------------------------------------------------------------------------
 * `ready` exists because "there is no launch" and "I have not looked yet" are
 * both `null`, and one caller genuinely cannot treat them alike. `/tg` sends
 * somebody to the home page when a Mini App was opened with no start
 * parameter — and if it could not tell the two apart, its effect would fire on
 * the pending render and bounce every visitor off the route before the launch
 * had been read.
 *
 * Everywhere else the distinction collapses harmlessly: a toolbar tweak or a
 * share button that is absent for one frame is absent for one frame.
 *
 * ---------------------------------------------------------------------------
 * Why the answer is cached at module scope
 * ---------------------------------------------------------------------------
 * `getSnapshot` must return a referentially stable value or React re-renders
 * forever looking for a fixed point — and `launch()` parses a fresh object
 * every call.
 *
 * It is also correct on its own terms. A Mini App launch happens once per tab;
 * there is no event that would change the answer, which is why `subscribe` has
 * nothing to subscribe to. And `launch()` writes to `sessionStorage` on its way
 * past, so calling it once rather than on every render keeps that side effect
 * out of the render path.
 *
 * Module scope is safe here *because* `getServerSnapshot` exists: React never
 * calls `getSnapshot` while rendering on the server, so this never becomes
 * state shared between two people's requests.
 */

export interface LaunchState {
  /** Whether the URL has been read yet. False on the server and on first paint. */
  ready: boolean
  /** The launch, or null in an ordinary browser. Always null until `ready`. */
  launch: Launch | null
}

const PENDING: LaunchState = { ready: false, launch: null }

let resolved: LaunchState | null = null

function onClient(): LaunchState {
  resolved ??= { ready: true, launch: launch() }
  return resolved
}

/** Nothing to subscribe to: a launch does not change mid-tab. */
const never = () => () => {}

/** The server has no fragment, so it has nothing to say. */
const onServer = () => PENDING

/** The launch and whether it has been looked for yet. */
export function useLaunchState(): LaunchState {
  return useSyncExternalStore(never, onClient, onServer)
}

/** The Mini App launch for this tab, or null in an ordinary browser. */
export function useLaunch(): Launch | null {
  return useLaunchState().launch
}

/** Whether this tab is a Mini App. False on the server and on first paint. */
export function useInsideTelegram(): boolean {
  return useLaunch() !== null
}
