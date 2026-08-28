'use client'

import { useState } from 'react'
import { NumberInput } from '@/app/xp/_editor/number-field'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict, type XpEditorDict } from '@/app/i18n/xp-editor'
import {
  DATA_NAME,
  DATA_SCOPES,
  describeScope,
  MAX_DATA_FIELDS,
  storeKeyOf,
  type DataScope,
  type XpData,
  type XpField,
} from '@kxb/xp'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * What this level keeps, and who sees it.
 *
 * docs/xp/backlog.md §7c. The block is `data` and the argument for its shape is
 * in `packages/xp/src/data.ts`; this is the screen an author declares one on.
 *
 * ---------------------------------------------------------------------------
 * The scope is the whole panel, and it is said in sentences
 * ---------------------------------------------------------------------------
 * Everything else here is a name and a number. The one decision that cannot be
 * taken back once people have played is **who may read this**, and the words
 * `player`, `space` and `shared` are ours rather than an author's — so the
 * picker shows a sentence about people beside each one, and the row underneath
 * says what the choice means for that field in particular.
 *
 * The same three sentences appear on the space's own settings card, on purpose:
 * an owner looking at what their games have stored and an author deciding what
 * to store should recognise each other's words.
 *
 * ---------------------------------------------------------------------------
 * Rules are not edited here, and the panel says where they are
 * ---------------------------------------------------------------------------
 * A field is a *declaration*; what changes it is a rule, in Behaviour, with
 * `target: world`. Putting a "when this happens, add one" control here would be
 * a second rules editor that only knows about one kind of rule — and the parser
 * already ties the two together, because a rule naming a field this block never
 * declared is a document that will not save.
 *
 * So the panel's last job is to say that out loud rather than to grow.
 */

export interface DataPanelProps {
  data: XpData
  /** Write one field, whether it is new or being edited. */
  onWrite: (name: string, field: XpField) => void
  onRename: (from: string, to: string) => void
  onRemove: (name: string) => void
}

export function DataPanel({ data, onWrite, onRename, onRemove }: DataPanelProps) {
  const t = xpEditorDict(useLocale()).data
  const names = Object.keys(data)
  const full = names.length >= MAX_DATA_FIELDS

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PanelLabel className="mb-1.5">{t.heading}</PanelLabel>
        <Hint>{t.blurbLead} <span className="text-neutral-400">{t.world}</span> {t.blurbTail}</Hint>
      </div>

      {names.length === 0 ? (
        <Hint>{t.noneYet}</Hint>
      ) : (
        <ul className="flex flex-col gap-2">
          {names.map((name) => (
            <Field
              key={name}
              name={name}
              field={data[name]!}
              taken={names}
              onWrite={(field) => onWrite(name, field)}
              onRename={(to) => onRename(name, to)}
              onRemove={() => onRemove(name)}
            />
          ))}
        </ul>
      )}

      <Add data={data} disabled={full} onAdd={onWrite} />

      {full && (
        <p className="font-mono text-[10px] leading-relaxed text-amber-300/70">
          {fill(t.full, { n: MAX_DATA_FIELDS })}
        </p>
      )}
    </div>
  )
}

/**
 * One declared field.
 *
 * The name is an input rather than a label, because renaming is the edit an
 * author makes most and a delete-and-recreate loses the scope and the default
 * with it. It commits on blur rather than on every keystroke: a rename is a
 * document-wide change, and doing one per character would put `c`, `co`, `coi`
 * in the undo history and break every rule naming the field three times on the
 * way to a name that works.
 */
function Field({
  name,
  field,
  taken,
  onWrite,
  onRename,
  onRemove,
}: {
  name: string
  field: XpField
  taken: readonly string[]
  onWrite: (field: XpField) => void
  onRename: (to: string) => void
  onRemove: () => void
}) {
  const t = xpEditorDict(useLocale()).data
  const [draft, setDraft] = useState(name)
  const [armed, setArmed] = useState(false)

  /**
   * Why the name a rule uses is shown as well as the one being typed.
   *
   * `player:coins` is the key this field is stored under, and it is the string
   * somebody will see in the space's settings card and in a database row. An
   * author who has to reconcile "coins" with "player:coins" later is one who
   * met the second one for the first time in a support conversation.
   */
  const key = storeKeyOf(name, field)
  const problem = nameProblem(draft, name, taken, t)

  return (
    <li className="rounded border border-neutral-800 p-2">
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft === name) return
            if (problem) {
              // Snapped back rather than left sitting there red: the rename did
              // not happen, and a field showing a name the document does not
              // have is a panel disagreeing with the file it is editing.
              setDraft(name)
              return
            }
            onRename(draft)
          }}
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => (armed ? onRemove() : setArmed(true))}
          onBlur={() => setArmed(false)}
          title={armed ? t.pressAgainToRemove : t.removeThisField}
          className={`shrink-0 text-[10px] underline-offset-4 hover:underline ${
            armed ? 'text-red-400' : 'text-neutral-600 hover:text-red-400'
          }`}
        >
          {armed ? 'sure?' : '×'}
        </button>
      </div>

      {problem && draft !== name && (
        <p className="mt-1.5 font-mono text-[10px] leading-tight text-amber-300/70">{problem}</p>
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="shrink-0 font-mono text-[10px] text-neutral-600">{t.seenBy}</span>
        <select
          value={field.scope}
          onChange={(event) => onWrite({ ...field, scope: event.target.value as DataScope })}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[11px] text-neutral-200 focus:border-neutral-600 focus:outline-none"
        >
          {DATA_SCOPES.map((scope) => (
            <option key={scope} value={scope}>
              {describeScope(scope)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="shrink-0 font-mono text-[10px] text-neutral-600">{t.startsAt}</span>
        <NumberInput
          value={field.value}
          commit={(next) => onWrite({ ...field, value: next })}
          className="w-20 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 text-right font-mono text-[11px] tabular-nums text-neutral-200 focus:border-neutral-600 focus:outline-none"
        />
        <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-700">{key}</span>
      </div>
    </li>
  )
}

/** A new field, named before it exists so the panel never holds a nameless one. */
function Add({
  data,
  disabled,
  onAdd,
}: {
  data: XpData
  disabled: boolean
  onAdd: (name: string, field: XpField) => void
}) {
  const t = xpEditorDict(useLocale()).data
  const [draft, setDraft] = useState('')
  const problem = draft === '' ? null : nameProblem(draft, null, Object.keys(data), t)

  function add() {
    if (draft === '' || problem) return
    /**
     * `player` and zero, which is the field somebody is most often adding.
     *
     * A picker before the field exists would be three decisions to make one
     * thing; the scope is one click away afterwards and is the *safe* default -
     * private, and widened deliberately. Defaulting to `space` would mean a
     * field somebody meant to keep private was readable by everyone in the
     * seconds before they noticed.
     */
    onAdd(draft, { scope: 'player', value: 0 })
    setDraft('')
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
          placeholder={t.newName}
          spellCheck={false}
          disabled={disabled}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-1 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || draft === '' || problem !== null}
          className="shrink-0 rounded border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-40"
        >
          {t.add}
        </button>
      </div>
      {problem && (
        <p className="mt-1.5 font-mono text-[10px] leading-tight text-amber-300/70">{problem}</p>
      )}
    </div>
  )
}

/**
 * What is wrong with a name, in the words an author would use.
 *
 * Exported for its test: it is the only decision in this file, and every branch
 * of it is a sentence somebody reads at the moment they are stuck.
 *
 * `DATA_NAME` is the parser's own alphabet rather than a copy — a panel that
 * accepted a name the format refuses is a panel that lets somebody build for
 * ten minutes and find out at Save.
 */
export function nameProblem(
  draft: string,
  current: string | null,
  taken: readonly string[],
  t: XpEditorDict['data'],
): string | null {
  if (draft === current) return null
  if (taken.includes(draft)) return fill(t.alreadyAField, { name: draft })
  if (!DATA_NAME.test(draft)) return t.nameRules
  return null
}
