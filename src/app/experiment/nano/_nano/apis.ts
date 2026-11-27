/**
 * The seven, and which of them needs to be switched on by hand.
 *
 * This is a list rather than seven paragraphs on a page because the answer to
 * "can I use this?" changes per machine and per Chrome build, and the only
 * honest version of the answer is one the browser gives while you are looking
 * at it. What cannot be measured is the *remedy* - the flag to turn on when the
 * answer is bad - so that is the part written down here.
 *
 * `flag: null` means the API shipped and needs nothing; if it is still missing
 * on such a row, Chrome is too old, and no flag will help.
 */

import type { NanoPair } from '@/app/experiment/nano/_nano/types'

export type NanoName =
  | 'LanguageModel'
  | 'Summarizer'
  | 'Writer'
  | 'Rewriter'
  | 'Translator'
  | 'LanguageDetector'
  | 'Proofreader'

export type NanoApi = {
  name: NanoName
  /** The `chrome://flags` entry that turns it on, or null if it just ships. */
  flag: string | null
  what: string
}

export const NANO_APIS: NanoApi[] = [
  { name: 'LanguageModel', flag: null, what: 'A chat turn. The general one, and the slow one.' },
  { name: 'Summarizer', flag: null, what: 'Long text in, a few lines out.' },
  { name: 'LanguageDetector', flag: null, what: 'Which language is this?' },
  { name: 'Translator', flag: null, what: 'One language to another, offline.' },
  { name: 'Writer', flag: '#writer-api-for-gemini-nano', what: 'A first draft from a brief.' },
  { name: 'Rewriter', flag: '#rewriter-api-for-gemini-nano', what: 'The same thing, said differently.' },
  { name: 'Proofreader', flag: '#proofreader-api-for-gemini-nano', what: 'Spelling and grammar, in place.' },
]

/**
 * What `Translator` is asked about when nobody has picked a pair yet.
 *
 * It is the one API whose `availability()` throws rather than answers when
 * called bare, so the table has to have *some* pair in hand. English to German
 * is the pair this project would reach for first.
 */
export const PROBE_PAIR: NanoPair = { sourceLanguage: 'en', targetLanguage: 'de' }

/** The flag that lets a machine Chrome considers too weak download the model. */
export const BYPASS_FLAG = '#optimization-guide-on-device-model'
