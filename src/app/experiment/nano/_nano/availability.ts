/**
 * Asking the browser, rather than trusting a table in a blog post.
 *
 * Every box on this page wants the same two facts about an API - is the global
 * even there, and if so what does it say about itself - so both come from here.
 * The two are kept apart in the result on purpose: `missing` and `unavailable`
 * read the same to a user and mean opposite things to whoever has to fix it.
 * Missing is a flag or an old Chrome. Unavailable is a Chrome that has the API
 * and has decided this machine cannot run the model.
 */

import { type NanoName, PROBE_PAIR } from '@/app/experiment/nano/_nano/apis'
import type { NanoAvailability } from '@/app/experiment/nano/_nano/types'

/** The four the browser answers, plus the two only we can be in. */
export type NanoState = NanoAvailability | 'missing' | 'error'

export type NanoReading = { state: NanoState; detail?: string }

/**
 * One API, one answer.
 *
 * Everything is wrapped, because `availability()` is a real call into a real
 * subsystem: it rejects on a machine with no room for the model, and it throws
 * outright on `Translator` if the pair is left off. A page that let either
 * escape would show nothing at all for the six that were fine.
 */
export async function readAvailability(name: NanoName): Promise<NanoReading> {
  const api = window[name]
  if (!api) return { state: 'missing' }
  try {
    const state =
      name === 'Translator'
        ? await window.Translator!.availability(PROBE_PAIR)
        : await (api as { availability(): Promise<NanoAvailability> }).availability()
    return { state }
  } catch (error) {
    return { state: 'error', detail: error instanceof Error ? error.message : String(error) }
  }
}

/** All seven, at once - they are independent and each one is a round trip. */
export async function readAll(names: NanoName[]): Promise<Record<string, NanoReading>> {
  const readings = await Promise.all(names.map(async (name) => [name, await readAvailability(name)] as const))
  return Object.fromEntries(readings)
}

/** How each answer should read on the page, in the project's own colours. */
export function toneFor(state: NanoState): string {
  if (state === 'available') return 'text-[var(--color-emerald-400,#34d399)]'
  if (state === 'downloadable' || state === 'downloading') return 'text-[var(--color-amber-400,#fbbf24)]'
  return 'text-[var(--color-ink-muted)]'
}
