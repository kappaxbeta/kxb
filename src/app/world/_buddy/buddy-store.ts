'use client'

import { useSyncExternalStore } from 'react'
import { nothingSaid, type SaidState, showSaid } from '@/app/world/_presence/presence-core'
import {
  askDevice,
  closeBrain,
  deviceAvailability,
  fetchBrain,
  warmBrain,
} from '@/app/world/_buddy/device-brain'
import { BUDDY_MAX_INPUT, type BuddyId, type BuddyTurn, DEFAULT_BUDDY } from '@/domain/buddy/persona'

/**
 * Which buddy is out, what has been said, and what is over his head.
 *
 * A module store rather than state in the scene, because the two halves of the
 * companion live on opposite sides of the canvas: the body is inside `<Canvas>`
 * and the chat box is HTML on top of it, and React context does not cross that
 * line in react-three-fiber. Both read this; only the functions below write it.
 *
 * Local to this tab, on purpose. Telly is a body only you have - nobody else in
 * the room sees him yet - so there is nothing to put on the wire and nothing to
 * persist. Leaving the room sends him home.
 */

export interface BuddyState {
  out: boolean
  /** Which one. Kept while he is home, so the pen's "ai" calls back the last. */
  who: BuddyId
  turns: BuddyTurn[]
  /** Waiting for an answer. The box says so, and refuses a second question. */
  thinking: boolean
  /** Why the last question got no answer, if it did not. */
  trouble: 'asleep' | 'busy' | 'fuzzy' | 'signin' | null
  /**
   * The answer so far, while the device model streams it. Null otherwise.
   * See ./device-brain.
   */
  partial: string | null
  /**
   * The browser has a model it could download, and nothing else could answer.
   * The chat box offers the download as a button - it must be a click.
   */
  canFetch: boolean
  /** Download progress, 0-1, while the model is coming. */
  fetching: number | null
}

let state: BuddyState = {
  out: false,
  who: DEFAULT_BUDDY,
  turns: [],
  thinking: false,
  trouble: null,
  partial: null,
  canFetch: false,
  fetching: null,
}
const listeners = new Set<() => void>()

/**
 * The bubble over his head.
 *
 * Mutated, never replaced: `<ChatBubble>` watches the object itself and
 * promotes the text to state on its own clock, so this is the one piece of the
 * store that is not a snapshot. Same contract as every peer's `said`.
 */
export const buddySaid: { current: SaidState } = { current: nothingSaid() }

function set(next: Partial<BuddyState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBuddy(): BuddyState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}

/**
 * The pen's `ai`: call him if he is home, send him home if he is out.
 *
 * No greeting here - the words are the chat box's, which has the reader's
 * language, and it says hello the moment he arrives. See `BuddyChat`.
 */
export function toggleBuddy(who: BuddyId = state.who) {
  if (state.out && state.who === who) {
    sendBuddyHome()
    return
  }
  callBuddy(who)
}

/**
 * Bring this one out - swapping places with the other if he is out.
 *
 * A swap starts a new conversation: the log was a talk with somebody else, and
 * the device session was opened in his voice.
 */
export function callBuddy(who: BuddyId = state.who) {
  if (state.out && state.who === who) return
  if (state.out) {
    closeBrain()
    set({ out: false, partial: null, thinking: false })
  }
  const fresh = who !== state.who
  set({ out: true, who, trouble: null, ...(fresh ? { turns: [] } : {}) })
  // Open the device model's session now, so the first answer is not the slow one.
  void warmBrain(who)
}

/** Put a line over his head that is not an answer - a hello, say. */
export function buddySays(text: string) {
  showSaid(buddySaid.current, text)
}

export function sendBuddyHome() {
  if (!state.out) return
  closeBrain()
  set({ out: false, thinking: false, partial: null })
}

/**
 * Fetch the browser's model, from the chat box's button. Gigabytes, once,
 * kept by the browser for every site - which is why it is a button that says
 * so and never something that happens by itself.
 */
export async function fetchBuddyBrain(name?: string) {
  set({ fetching: 0, trouble: null })
  const ok = await fetchBrain(state.who, (share) => set({ fetching: share }), name)
  set({ fetching: null, canFetch: !ok, trouble: ok ? null : 'fuzzy' })
}

/**
 * Say something to him, and put his answer over his head.
 *
 * The question appears in the log at once - waiting for the network before
 * showing what you typed is the laggy feeling this app avoids everywhere - and
 * is taken back out if nothing comes of it, so a retry does not ask twice.
 */
export async function talkToBuddy(text: string, name?: string) {
  const said = text.trim().slice(0, BUDDY_MAX_INPUT)
  if (!said || state.thinking) return

  const asked: BuddyTurn = { role: 'user', text: said }
  const turns = [...state.turns, asked]
  set({ turns, thinking: true, trouble: null })

  const answered = (answer: string) => {
    const text = answer.trim() || '…'
    set({ turns: [...state.turns, { role: 'buddy', text }], thinking: false, partial: null })
    if (state.out) showSaid(buddySaid.current, text)
  }

  // This browser's own model first: free, and nothing leaves the machine.
  const who = state.who
  const local = await askDevice(who, state.turns.slice(0, -1), said, (soFar) => set({ partial: soFar }), name)
  if (local !== null) {
    answered(local)
    return
  }

  try {
    const response = await fetch('/api/buddy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ turns, name, buddy: who }),
    })

    if (!response.ok) {
      const trouble =
        response.status === 503
          ? 'asleep'
          : response.status === 429
            ? 'busy'
            : response.status === 401
              ? 'signin'
              : 'fuzzy'
      // Nobody to answer - unless this browser could fetch a model of its own.
      const device = trouble === 'asleep' ? await deviceAvailability() : 'none'
      set({
        turns: state.turns.filter((turn) => turn !== asked),
        thinking: false,
        partial: null,
        trouble,
        canFetch: device === 'downloadable' || device === 'downloading',
      })
      return
    }

    const { reply } = (await response.json()) as { reply?: string }
    answered(reply ?? '')
  } catch {
    set({ turns: state.turns.filter((turn) => turn !== asked), thinking: false, partial: null, trouble: 'fuzzy' })
  }
}
