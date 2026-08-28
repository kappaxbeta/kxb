'use client'

import { useMemo, useState } from 'react'
import {
  canonicalLocale,
  isLocaleCode,
  MAX_LOCALES,
  MAX_PHRASE_KEY,
  MAX_PHRASE_TEXT,
  phrasesIn,
  type XpDocument,
} from '@kxb/xp'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * What this level says, in other languages.
 *
 * The block is `words` and the argument for its shape is in
 * `packages/xp/src/words.ts`; this is the screen an author fills it in on.
 *
 * ---------------------------------------------------------------------------
 * The English is the key, so there is nothing to "set up"
 * ---------------------------------------------------------------------------
 * A level says what it says, and that sentence *is* the lookup. There is no
 * step where somebody invents `gate.locked.message`, no state where a level is
 * half-keyed, and nothing to do before adding a language is worth doing. The
 * left column of this panel is not editable here for exactly that reason: it is
 * the level's own text, and it is changed where it is written — the title bar,
 * the Document panel, the script.
 *
 * ---------------------------------------------------------------------------
 * A language at the top, a table under it
 * ---------------------------------------------------------------------------
 * The chips add, remove and *pick* a language; the table is every key down the
 * left with that language's answer beside it. See the note on `picked` in
 * `WordsPanel` for the two earlier shapes and why this is the third.
 *
 * ---------------------------------------------------------------------------
 * The list is a suggestion and never a broom
 * ---------------------------------------------------------------------------
 * `phrasesIn` finds the title, the description and every `t('…')` a regex can
 * see in the scripts. It cannot see a key a script builds — `t('door ' + n)` —
 * so the rows it offers are joined by whatever the block already holds, and
 * nothing here ever proposes to delete a row it did not recognise. The one
 * phrase an author had to work hardest to find is exactly the one a tidy-up
 * would throw away.
 *
 * ---------------------------------------------------------------------------
 * A blank box is how a row is removed
 * ---------------------------------------------------------------------------
 * There is no delete button per phrase, because there is nothing to delete: an
 * empty translation *is* no translation, and the level falls back to its own
 * words. `setPhrase` takes the row out, then the language when its last row
 * goes, then the block when its last language does — so a document only ever
 * carries what somebody actually said.
 */
export function WordsPanel({
  document,
  onPhrase,
  onLanguageRemove,
}: {
  document: XpDocument
  onPhrase: (locale: string, key: string, text: string) => void
  onLanguageRemove: (locale: string) => void
}) {
  const t = xpEditorDict(useLocale()).words
  const saved = Object.keys(document.words ?? {})
  const found = useMemo(() => phrasesIn(document), [document])

  /**
   * A language added but not yet typed into.
   *
   * Adding one writes nothing. The first version seeded the new language with
   * the title translated to itself - `"The Gate": "The Gate"` - so that "add"
   * produced a document change, and what that produced was a row that looks
   * translated and is not. A language with no rows is not a thing to store; it
   * is a column to be typing into, which is a fact about this panel.
   */
  const [held, setHeld] = useState<readonly string[]>([])
  const languages = [...saved, ...held.filter((code) => !saved.includes(code))]

  /**
   * Which language the table is filling in.
   *
   * ---------------------------------------------------------------------------
   * One column at a time, again - and why that is not the first version back
   * ---------------------------------------------------------------------------
   * The first version switched the whole panel per language and was reported
   * as "the codes are up here and the values are down there". The second
   * stacked every language under every sentence, which is right for two
   * languages and five phrases and a wall for four and forty. What was asked
   * for this time is a *table*: the key down the left, one language's answer
   * beside it, the language chosen at the top - so a translator works down one
   * column the way a spreadsheet is filled, and switches columns with a click.
   * The difference from the first version is that the keys stay put: switching
   * the language changes what is in the right-hand boxes and nothing else.
   *
   * The first saved language, or the first held one, or nothing - and corrected
   * when the one it names is removed.
   */
  const [picked, setPicked] = useState<string | null>(null)
  const language = picked && languages.includes(picked) ? picked : (languages[0] ?? null)

  /**
   * Keys added by hand, before any language has a line for them.
   *
   * `phrasesIn` finds what the level already says; this is for what it is
   * *going* to say - a key an author wants to write the script against
   * afterwards, or one the scraper cannot see because a script builds it. Held
   * here until a translation is typed, because a key with no line in any
   * language is not a thing the document can store; and joined with whatever
   * the block already holds, so a key that was typed into and later emptied
   * stays on screen until the panel is closed rather than vanishing mid-edit.
   */
  const [added, setAdded] = useState<readonly string[]>([])
  const stored = useMemo(
    () => Object.values(document.words ?? {}).flatMap((table) => Object.keys(table)),
    [document.words],
  )
  const phrases = useMemo(() => {
    const seen = new Set<string>()
    const all: string[] = []
    for (const key of [...found, ...stored, ...added]) {
      if (seen.has(key)) continue
      seen.add(key)
      all.push(key)
    }
    return all
  }, [found, stored, added])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PanelLabel className="mb-1.5">{t.heading}</PanelLabel>
        <Hint>{t.blurb}</Hint>
      </div>

      <div>
        <PanelLabel className="mb-1.5">{t.language}</PanelLabel>
        <Languages
          languages={languages}
          picked={language}
          filled={(code) =>
            phrases.filter((key) => (document.words?.[code]?.[key] ?? '').length > 0).length
          }
          total={phrases.length}
          onPick={setPicked}
          onAdd={(code) => {
            setHeld((was) => [...was, code])
            setPicked(code)
          }}
          onRemove={(code) => {
            // A language nobody has typed into is only ever on screen, so taking
            // it away is closing a column rather than an edit to undo.
            if (saved.includes(code)) onLanguageRemove(code)
            setHeld((was) => was.filter((one) => one !== code))
          }}
        />
      </div>

      <div>
        <PanelLabel className="mb-1.5">{t.keys}</PanelLabel>
        <AddKey
          taken={phrases}
          onAdd={(key) => setAdded((was) => [...was, key])}
        />
        <Hint className="mt-1.5">{t.keysHint}</Hint>
      </div>

      {language === null ? (
        <Hint>{t.noLanguages}</Hint>
      ) : phrases.length === 0 ? (
        <Hint>
          {t.nothingToTranslateLead}{' '}
          <span className="text-neutral-400">t(&apos;…&apos;)</span>.
        </Hint>
      ) : (
        <Table
          language={language}
          phrases={phrases}
          words={document.words}
          onWrite={(key, text) => onPhrase(language, key, text)}
        />
      )}
    </div>
  )
}

/**
 * A key, typed in by hand.
 *
 * The English sentence the level will print - not an identifier. `t('…')` in a
 * script takes the sentence, so what goes in here is what a player would read
 * if no language had a line for it. Refused when it is already a row, so the
 * table cannot hold one sentence twice.
 */
function AddKey({
  taken,
  onAdd,
}: {
  taken: readonly string[]
  onAdd: (key: string) => void
}) {
  const t = xpEditorDict(useLocale()).words
  const [draft, setDraft] = useState('')
  const wanted = draft.trim()
  const addable = wanted.length > 0 && wanted.length <= MAX_PHRASE_KEY && !taken.includes(wanted)
  const add = () => {
    onAdd(wanted)
    setDraft('')
  }
  return (
    <div className="flex gap-1">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t.keyPlaceholder}
        maxLength={MAX_PHRASE_KEY}
        aria-label={t.keyLabel}
        className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 font-mono text-[11px] text-neutral-200 outline-none placeholder:text-neutral-700 focus:border-neutral-600"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && addable) {
            event.preventDefault()
            add()
          }
          event.stopPropagation()
        }}
      />
      <button
        type="button"
        disabled={!addable}
        onClick={add}
        className="shrink-0 rounded border border-neutral-800 px-2 font-mono text-[10px] text-neutral-400 transition-colors enabled:hover:border-neutral-600 enabled:hover:text-neutral-200 disabled:opacity-40"
      >
        {t.addKey}
      </button>
    </div>
  )
}

/**
 * The keys down the left, one language's answers down the right.
 *
 * A grid rather than a `<table>`, because a translation is usually longer
 * than its key and both must wrap; the key column is capped so a long sentence
 * does not push every box off the edge of a sixth-wide panel.
 */
function Table({
  language,
  phrases,
  words,
  onWrite,
}: {
  language: string
  phrases: readonly string[]
  words: XpDocument['words']
  onWrite: (key: string, text: string) => void
}) {
  const t = xpEditorDict(useLocale()).words
  return (
    <div className="overflow-hidden rounded-md border border-neutral-800">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border-b border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
        <span>{t.keyColumn}</span>
        <span className="uppercase">{language}</span>
      </div>
      <ul>
        {phrases.map((phrase) => (
          <li
            key={phrase}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-2 border-b border-neutral-900 px-2 py-1 last:border-b-0"
          >
            <p
              className="break-words font-mono text-[10px] leading-relaxed text-neutral-400"
              title={phrase}
            >
              {phrase}
            </p>
            <Line
              key={`${language}:${phrase}`}
              code={language}
              phrase={phrase}
              text={words?.[language]?.[phrase] ?? ''}
              onWrite={(text) => onWrite(phrase, text)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The languages this level has, and the box that adds one.
 *
 * A code rather than a picker of language names, and that is the same decision
 * `./words` makes in the format: the list of languages this product renders in
 * is not the list a level may be written in, and an author who wants Welsh
 * should not have to wait for us.
 *
 * No chip is "selected" any more — every language is on screen at once, so
 * these are a list of what exists rather than a switch between them.
 */
function Languages({
  languages,
  picked,
  filled,
  total,
  onPick,
  onAdd,
  onRemove,
}: {
  languages: readonly string[]
  /** The one the table is filling in. */
  picked: string | null
  /** How many of the keys this language has a line for, for the chip. */
  filled: (code: string) => number
  total: number
  onPick: (code: string) => void
  onAdd: (code: string) => void
  onRemove: (code: string) => void
}) {
  const t = xpEditorDict(useLocale()).words
  const [draft, setDraft] = useState('')
  // `pt-BR`, not `pt-br`. The lookup is an exact match against what a browser
  // reports, so the shape of the code is load-bearing - see `canonicalLocale`.
  const wanted = canonicalLocale(draft)
  const addable =
    isLocaleCode(wanted) && !languages.includes(wanted) && languages.length < MAX_LOCALES

  const add = () => {
    onAdd(wanted)
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {languages.map((code) => {
        const on = code === picked
        return (
          <span
            key={code}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${
              on
                ? 'border-violet-500/50 bg-violet-500/15 text-violet-100'
                : 'border-neutral-800 text-neutral-400'
            }`}
          >
            {/* The chip picks the column; its cross closes it. */}
            <button
              type="button"
              onClick={() => onPick(code)}
              aria-pressed={on}
              className="flex items-center gap-1 uppercase"
            >
              {code}
              <span className={`tabular-nums normal-case ${on ? 'text-violet-300/80' : 'text-neutral-600'}`}>
                {filled(code)}/{total}
              </span>
            </button>
            {/* No confirmation. It is one undo away, and a dialog for a thing
                that is one press to put back is a dialog nobody reads. */}
            <button
              type="button"
              onClick={() => onRemove(code)}
              title={fill(t.removeLanguage, { code })}
              className="text-neutral-600 transition-colors hover:text-amber-300"
            >
              ✕
            </button>
          </span>
        )
      })}

      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t.codePlaceholder}
        maxLength={12}
        aria-label={t.codeLabel}
        className="w-16 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200 outline-none focus:border-neutral-600"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && addable) {
            event.preventDefault()
            add()
          }
          // The viewport binds single letters, and a language code is letters.
          event.stopPropagation()
        }}
      />
      <button
        type="button"
        disabled={!addable}
        onClick={add}
        className="rounded border border-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400 transition-colors enabled:hover:border-neutral-600 enabled:hover:text-neutral-200 disabled:opacity-40"
      >
        {t.add}
      </button>
    </div>
  )
}

/**
 * One language's answer to one sentence.
 *
 * Committed on blur rather than per keystroke, like the Data panel's names: a
 * translation typed a character at a time would be twenty undo steps and twenty
 * saves for one line.
 */
function Line({
  code,
  phrase,
  text,
  onWrite,
}: {
  code: string
  phrase: string
  text: string
  onWrite: (text: string) => void
}) {
  const t = xpEditorDict(useLocale()).words
  const [draft, setDraft] = useState(text)
  const [editing, setEditing] = useState(false)

  // What the document says wins whenever this is not being typed into, so undo
  // lands in the box rather than leaving a stale draft sitting in it.
  const value = editing ? draft : text

  return (
    <label className="flex min-w-0 items-center">
      <input
        value={value}
        maxLength={MAX_PHRASE_TEXT}
        placeholder={phrase}
        aria-label={`${code}: ${fill(t.inThisLanguage, { phrase })}`}
        className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 font-mono text-[11px] text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-neutral-600"
        onChange={(event) => {
          setEditing(true)
          setDraft(event.target.value)
        }}
        onBlur={() => {
          setEditing(false)
          if (draft !== text) onWrite(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setEditing(false)
            setDraft(text)
            event.currentTarget.blur()
          }
          event.stopPropagation()
        }}
      />
    </label>
  )
}
