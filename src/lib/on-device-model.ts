'use client'

/**
 * Chrome's built-in model (the Prompt API, `window.LanguageModel`), for a page
 * that wants a piece of writing out of it.
 *
 * ---------------------------------------------------------------------------
 * Machinery, apart from what uses it
 * ---------------------------------------------------------------------------
 * The season writer is the first caller; Telly's `device-brain.ts` predates
 * this and keeps one long session open for a conversation, which is a
 * different shape - a chat wants one warm session, a writer wants a fresh one
 * per piece so an episode is not written in the voice of the last one and the
 * context window starts empty each time. What both share is below: asking
 * what the browser has, and never starting a download on its own.
 *
 * What `/experiment/nano` measured, and what shaped this file (see
 * `chrome-builtin-ai-bench` in the notes):
 *
 * - **A model that still has to download needs a real click**, and a download
 *   refused once wedges the API until reload. So `fetchModel` exists for a
 *   button that says what it costs, and `write` only ever uses a model that is
 *   already here.
 * - **Opening a session is slow** - ~4s warm, far longer cold - which is fine
 *   for a whole episode and would not be for a keystroke.
 * - **`promptStreaming` yields deltas**, not the answer so far.
 * - **A wedged API rejects with a bare `undefined`**, not an `Error`.
 *
 * Desktop Chrome only. Safari, Firefox and every phone answer `none`, and a
 * page that uses this must still work for them without it.
 */

type Model = NonNullable<Window['LanguageModel']>
type Session = Awaited<ReturnType<Model['create']>>

/** What this browser can do. `none` is no Prompt API at all. */
export type ModelState = Awaited<ReturnType<Model['availability']>> | 'none'

/** English out. The tuned languages are few - see `expectedOutputs` in the bench's types. */
const OUTPUTS = [{ type: 'text' as const, languages: ['en'] }]

export async function modelState(): Promise<ModelState> {
  const model = typeof window === 'undefined' ? undefined : window.LanguageModel
  if (!model) return 'none'
  try {
    return await model.availability()
  } catch {
    // Wedged: not coming back before a reload, so as good as absent.
    return 'none'
  }
}

function progress(onProgress?: (share: number) => void) {
  if (!onProgress) return undefined
  return (monitor: EventTarget) =>
    monitor.addEventListener('downloadprogress', (event) => {
      onProgress((event as Event & { loaded?: number }).loaded ?? 0)
    })
}

/**
 * Download the model. Only ever from a button press - see the note at the top.
 * True once it is here.
 */
export async function fetchModel(onProgress: (share: number) => void): Promise<boolean> {
  const model = window.LanguageModel
  if (!model) return false
  try {
    const session = await model.create({ expectedOutputs: OUTPUTS, monitor: progress(onProgress) })
    session.destroy()
    return true
  } catch {
    return false
  }
}

/**
 * One piece of writing: a fresh session told who it is, asked once, put away.
 *
 * `onText` gets the answer *so far* on every delta, which is what a page that
 * draws it wants. Resolves to the whole answer; rejects when there is no model
 * here, when the session broke, or with an `AbortError` when `signal` fired -
 * a caller that offers a stop button should tell those apart.
 */
export async function write(
  system: string,
  prompt: string,
  { signal, onText }: { signal?: AbortSignal; onText?: (soFar: string) => void } = {},
): Promise<string> {
  const model = window.LanguageModel
  if (!model || (await modelState()) !== 'available') {
    throw new Error('The on-device model is not here')
  }

  let session: Session | null = null
  try {
    session = await model.create({
      signal,
      expectedOutputs: OUTPUTS,
      initialPrompts: [{ role: 'system', content: system }],
    })
    let answer = ''
    for await (const delta of session.promptStreaming(prompt, { signal })) {
      answer += delta
      onText?.(answer)
    }
    return answer.trim()
  } catch (error) {
    throw error instanceof Error || error instanceof DOMException
      ? error
      : new Error('The on-device model stopped answering')
  } finally {
    session?.destroy()
  }
}

/** Whether a rejection from `write` was the caller's own stop button. */
export function wasStopped(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
