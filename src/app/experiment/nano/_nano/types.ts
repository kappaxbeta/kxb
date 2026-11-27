/**
 * What Chrome claims to put on `window`, written down.
 *
 * None of this is in `lib.dom` yet, and it is not one API but seven with a
 * shared shape: a static `availability()` that answers a word, and a static
 * `create()` that hands back an object you talk to and then `destroy()`. So the
 * shape is declared once here and the seven names point at it, rather than each
 * box that uses one carrying its own `as any`.
 *
 * They are declared as *optional properties of `Window`*, deliberately. The
 * obvious `declare const LanguageModel` is a trap: on a browser without it,
 * merely writing `typeof LanguageModel` throws `ReferenceError` before any
 * check you wrote can run. `window.LanguageModel` is just `undefined`, which is
 * the thing every box here actually wants to ask about.
 */

/** The four words `availability()` answers, in the order things improve. */
export type NanoAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

/** A language pair, which is the only thing `Translator` will be asked without. */
export type NanoPair = { sourceLanguage: string; targetLanguage: string }

export type NanoCreateOptions = {
  signal?: AbortSignal
  /**
   * Called once with an `EventTarget` that fires `downloadprogress` with a
   * `loaded` between 0 and 1. The first `create()` on a cold profile fetches a
   * multi-gigabyte model; without this the page just appears to hang.
   */
  monitor?: (monitor: EventTarget) => void
  initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  /**
   * The language the answers will be in. Chrome warns on every session that
   * does not say, and refuses (`NotSupportedError`) one that names a language
   * the model was not tuned for - English, Spanish and Japanese, as of 140.
   */
  expectedOutputs?: { type: 'text'; languages: string[] }[]
}

/** What `LanguageModel.create()` gives back. */
export type NanoSession = {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>
  /** Yields **deltas**, not the answer so far. Concatenate, never assign. */
  promptStreaming(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>
  destroy(): void
  readonly inputQuota?: number
  readonly inputUsage?: number
}

export type NanoDetection = { detectedLanguage: string; confidence: number }

export type NanoDetector = {
  detect(input: string): Promise<NanoDetection[]>
  destroy(): void
}

export type NanoTranslator = {
  translate(input: string): Promise<string>
  destroy(): void
}

declare global {
  interface Window {
    LanguageModel?: {
      availability(): Promise<NanoAvailability>
      create(options?: NanoCreateOptions): Promise<NanoSession>
    }
    Summarizer?: {
      availability(): Promise<NanoAvailability>
      create(options?: NanoCreateOptions): Promise<unknown>
    }
    Writer?: { availability(): Promise<NanoAvailability> }
    Rewriter?: { availability(): Promise<NanoAvailability> }
    Proofreader?: { availability(): Promise<NanoAvailability> }
    LanguageDetector?: {
      availability(): Promise<NanoAvailability>
      create(options?: NanoCreateOptions): Promise<NanoDetector>
    }
    Translator?: {
      /** The one that will not answer bare - it needs to know which pair. */
      availability(pair: NanoPair): Promise<NanoAvailability>
      create(options: NanoPair & NanoCreateOptions): Promise<NanoTranslator>
    }
  }
}
