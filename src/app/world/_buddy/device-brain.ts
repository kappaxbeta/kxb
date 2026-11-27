'use client'

import { type BuddyId, buddySystem, type BuddyTurn } from '@/domain/buddy/persona'

/**
 * Telly thinking on this device: Chrome's built-in model (the Prompt API,
 * `window.LanguageModel`), with no key, no server and no bill.
 *
 * Preferred over `/api/buddy` whenever the browser has it ready, because it is
 * free for everybody and nothing anybody says to a pink monster leaves their
 * machine. It is Chrome on a desktop only - Safari, Firefox and every iPad
 * answer `undefined` - which is why it is a first choice and not the only one.
 *
 * What `/experiment/nano` measured, and what shaped this file (see that bench
 * and `chrome-builtin-ai-bench` in the notes):
 *
 * - **Opening a session is slow** - 16-23s cold, ~4s warm - and answering on
 *   an open one is fast. So a session is opened the moment Telly is called,
 *   before anybody has typed, and kept until he goes home.
 * - **A model that still has to download needs a real click**, and a download
 *   refused once wedges the API until reload. So nothing here ever starts a
 *   download on its own: `fetchBrain` exists for a button that says what it
 *   costs, and everything else only uses a model that is already `available`.
 * - **`promptStreaming` yields deltas**, not the answer so far.
 *
 * The types are the ones `/experiment/nano/_nano/types.ts` puts on `Window`,
 * read off it rather than imported, so this does not reach into the bench.
 */

type Model = NonNullable<Window['LanguageModel']>
type Session = Awaited<ReturnType<Model['create']>>
export type DeviceAvailability = Awaited<ReturnType<Model['availability']>> | 'none'

/** The open session, or the promise of one. One at a time, for whoever is out. */
let session: Promise<Session> | null = null

/** What this browser can do. `none` is no Prompt API at all. */
export async function deviceAvailability(): Promise<DeviceAvailability> {
  const model = typeof window === 'undefined' ? undefined : window.LanguageModel
  if (!model) return 'none'
  try {
    return await model.availability()
  } catch {
    // A wedged API rejects with a bare `undefined`. It is not coming back
    // before a reload, so it is as good as absent.
    return 'none'
  }
}

/** The first lines of a session: who he is, and anything already said. */
function opening(who: BuddyId, history: readonly BuddyTurn[], name?: string) {
  const walking = name?.trim() ? `\nYou are walking with ${name.trim().slice(0, 40)}.` : ''
  return [
    { role: 'system' as const, content: buddySystem(who) + walking },
    ...history.map((turn) => ({
      role: turn.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: turn.text,
    })),
  ]
}

function open(
  who: BuddyId,
  history: readonly BuddyTurn[],
  name?: string,
  onProgress?: (share: number) => void,
) {
  const model = window.LanguageModel
  if (!model) return null
  const opened = model.create({
    initialPrompts: opening(who, history, name),
    monitor: onProgress
      ? (monitor) =>
          monitor.addEventListener('downloadprogress', (event) => {
            onProgress((event as Event & { loaded?: number }).loaded ?? 0)
          })
      : undefined,
  })
  // A session that failed to open must not be handed to the next question.
  opened.catch(() => {
    if (session === opened) session = null
  })
  session = opened
  return opened
}

/**
 * Open a session now, if the model is already here, so the first answer does
 * not pay the cold start. Called when Telly arrives. Never downloads.
 */
export async function warmBrain(who: BuddyId, name?: string): Promise<void> {
  if (session) return
  if ((await deviceAvailability()) !== 'available') return
  if (!session) open(who, [], name)
}

/**
 * An answer from the device, or null when the device cannot give one - no
 * model, a model not yet downloaded, or a session that broke. Null means "ask
 * somebody else", never "he had nothing to say".
 */
export async function askDevice(
  who: BuddyId,
  history: readonly BuddyTurn[],
  text: string,
  onDelta: (soFar: string) => void,
  name?: string,
): Promise<string | null> {
  if (!session && (await deviceAvailability()) !== 'available') return null

  try {
    const live = await (session ?? open(who, history, name))
    if (!live) return null

    let answer = ''
    for await (const delta of live.promptStreaming(text)) {
      answer += delta
      onDelta(answer)
    }
    return answer.trim()
  } catch {
    closeBrain()
    return null
  }
}

/**
 * Download the model. Only ever from a button press - see the note at the top.
 * True once it is here and a session is open.
 */
export async function fetchBrain(
  who: BuddyId,
  onProgress: (share: number) => void,
  name?: string,
): Promise<boolean> {
  try {
    const opened = open(who, [], name, onProgress)
    if (!opened) return false
    await opened
    return true
  } catch {
    return false
  }
}

/**
 * He went home, or the other one came. A session is a held resource, and it
 * was opened with one buddy's voice - give it back.
 */
export function closeBrain() {
  const was = session
  session = null
  void was?.then((live) => live.destroy()).catch(() => {})
}
