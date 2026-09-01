'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  MAX_PLAYER_KEYS,
  MAX_SKETCH_FILES,
  SKETCH_PATH,
  describeProblems,
  parseXp,
  type Capability,
  type XpDocument,
} from '@kxb/xp'
import type { HostCapability } from '@kxb/xp/host'
import { SketchStage } from '@/app/xp/_sketch/stage'
import { accept, completionsFor, type Completion } from '@/app/xp/_sketch/editor/complete'
import { PAINT, tokenise } from '@/app/xp/_sketch/editor/highlight'

/**
 * The project view: a sketch's files, its code, its config, and the thing
 * itself running beside them.
 *
 * ---------------------------------------------------------------------------
 * Not the 3D editor, and not a smaller copy of it
 * ---------------------------------------------------------------------------
 * `_editor/` is a stage you point a camera at; a sketch has no stage to
 * point one at, only source. So the shape here is a project view - the file
 * list is the structure, the code pane is the work, the config column is
 * everything about the cartridge that is not code, and the preview is the
 * container from `../stage` running the document exactly as a room would,
 * solo. One component, because unlike the 3D editor there is no dock to
 * arrange: three columns is the whole layout.
 *
 * The code pane is the scripts panel's technique, owned: a palette painted
 * behind a transparent textarea (see `./highlight.ts` for why it is a copy).
 * CodeMirror and Monaco stay rejected for the same reasons `scripts.tsx`
 * rejected them.
 *
 * ---------------------------------------------------------------------------
 * Save and run are different verbs
 * ---------------------------------------------------------------------------
 * Run rebuilds the preview from what is typed, immediately, locally - it
 * cannot lose anything, so it asks nothing. Save goes through `parseXp`
 * first and refuses with the parser's own words, because an editor that
 * saves an invalid document is an editor that breaks the play page later,
 * with less context. With no `onSave` (the operator route, which opened a
 * file), Save downloads instead - the same split `_editor` makes.
 *
 * The draft rides `localStorage` under `xp:sketch-draft:<id>`, read once in
 * a state initialiser - which is why this file must be mounted with
 * `ssr: false` (see `./client.tsx`).
 */

export interface SketchEditorProps {
  id: string
  document: XpDocument
  name?: string
  version?: number
  onSave?: (
    document: XpDocument,
  ) => Promise<{ ok: true; version?: number } | { ok: false; error: string }>
  onRename?: (
    name: string,
  ) => Promise<{ ok: true; name: string } | { ok: false; error: string }>
  backHref?: string
}

const draftKey = (id: string) => `xp:sketch-draft:${id}`

interface Draft {
  document: XpDocument
  version?: number
}

/** The draft, if there is one this session should trust. */
function readDraft(id: string, version?: number): XpDocument | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id))
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    // A draft from before somebody else saved is their work about to be
    // quietly reverted - the same rule the 3D editor's draft keeps.
    if (version !== undefined && draft.version !== undefined && draft.version !== version) {
      return null
    }
    const parsed = parseXp(draft.document)
    return parsed.ok && parsed.document.sketch ? parsed.document : null
  } catch {
    return null
  }
}

type Saving =
  | { at: 'idle' }
  | { at: 'busy' }
  | { at: 'saved' }
  | { at: 'refused'; why: string }

interface LogLine {
  id: number
  level: 'log' | 'warn' | 'error'
  line: string
}

/** The two capabilities the SDK can actually honour today. The other three
 * (persistence, arbiter, chat) have no surface in `window.xp` yet, and a
 * checkbox for a promise nothing keeps would be the worst kind of setting. */
/**
 * What the product may do with this sketch, as two checkboxes.
 *
 * `capabilities` is a claim the parser normally checks against the world -
 * a level saying `match` with one spawn is refused before anybody plays it.
 * A sketch has no world to check, so the claim is taken on trust (see
 * `document/sketch.ts`), which is exactly why it belongs in front of the
 * author rather than buried: these two words are what decides whether the
 * space's shelf offers *keep it as a room* and what the battle wizard makes
 * of it. A sketch that declares neither is playable only from its own link,
 * which is a fine thing to want and a terrible thing to discover.
 */
const OFFERED_CAPABILITIES: readonly { capability: Capability; label: string; note: string }[] = [
  {
    capability: 'freeplay',
    label: 'can stand as a room',
    note: 'A place people walk into and leave. Without this the shelf offers no room button.',
  },
  {
    capability: 'match',
    label: 'can be scheduled as a match',
    note: 'The battle wizard offers it, with a time and score limit your sketch reads from xp.match.',
  },
]

const OFFERED_NEEDS: readonly { need: HostCapability; label: string }[] = [
  { need: 'identity', label: 'needs you signed in' },
  { need: 'network', label: 'plays over the wire' },
]

export function SketchEditor({
  id,
  document: onDisk,
  name: givenName,
  version,
  onSave,
  onRename,
  backHref,
}: SketchEditorProps) {
  const [doc, setDoc] = useState<XpDocument>(() => readDraft(id, version) ?? onDisk)
  const [fromDraft, setFromDraft] = useState<boolean>(() => readDraft(id, version) !== null)
  const sketch = doc.sketch!
  const paths = Object.keys(sketch.files)

  const [file, setFile] = useState<string>(sketch.entry)
  const source = sketch.files[file] ?? ''

  const [saving, setSaving] = useState<Saving>({ at: 'idle' })
  const [logs, setLogs] = useState<LogLine[]>([])
  const logId = useRef(0)

  /** What the preview runs: a snapshot, advanced by the Run button - so a
   * half-typed line does not throw sixty times a second while it is typed. */
  const [preview, setPreview] = useState<{ doc: XpDocument; run: number }>({
    doc: onDisk,
    run: 0,
  })

  // --- the draft, half a second behind the keys -----------------------------
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keepDraft = useCallback(
    (next: XpDocument) => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
      draftTimer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(
            draftKey(id),
            JSON.stringify({ document: next, ...(version !== undefined ? { version } : {}) }),
          )
        } catch {
          // Storage full or denied: the editor still works, the net is gone.
        }
      }, 500)
    },
    [id, version],
  )
  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
    },
    [],
  )

  const patch = useCallback(
    (change: (from: XpDocument) => XpDocument) => {
      setDoc((from) => {
        const next = change(from)
        keepDraft(next)
        return next
      })
      setSaving({ at: 'idle' })
    },
    [keepDraft],
  )

  // --- file verbs -----------------------------------------------------------
  const write = (path: string, text: string) =>
    patch((from) => ({
      ...from,
      sketch: { ...from.sketch!, files: { ...from.sketch!.files, [path]: text } },
    }))

  const [newName, setNewName] = useState('')
  const [fileTrouble, setFileTrouble] = useState<string | null>(null)

  const addFile = () => {
    const path = newName.trim()
    if (!SKETCH_PATH.test(path)) {
      setFileTrouble('lower-case, folders with /, ends in .js, .frag, .vert or .glsl')
      return
    }
    if (paths.includes(path)) {
      setFileTrouble('already there')
      return
    }
    if (paths.length >= MAX_SKETCH_FILES) {
      setFileTrouble(`${MAX_SKETCH_FILES} files is the limit`)
      return
    }
    setFileTrouble(null)
    setNewName('')
    patch((from) => ({
      ...from,
      sketch: { ...from.sketch!, files: { ...from.sketch!.files, [path]: '' } },
    }))
    setFile(path)
  }

  const deleteFile = (path: string) => {
    if (path === sketch.entry) return // the entry is the project; rename it instead
    patch((from) => {
      const files = { ...from.sketch!.files }
      delete files[path]
      return { ...from, sketch: { ...from.sketch!, files } }
    })
    if (file === path) setFile(sketch.entry)
  }

  const makeEntry = (path: string) =>
    patch((from) => ({ ...from, sketch: { ...from.sketch!, entry: path } }))

  // --- config verbs ---------------------------------------------------------
  const setKeys = (keys: { key: string; does: string; cooldown?: number }[]) =>
    patch((from) => ({
      ...from,
      player: { ...from.player, ...(keys.length > 0 ? { keys } : { keys: undefined }) },
    }))

  const toggleCapability = (capability: Capability) =>
    patch((from) => {
      const has = from.capabilities.includes(capability)
      return {
        ...from,
        capabilities: has
          ? from.capabilities.filter((one) => one !== capability)
          : [...from.capabilities, capability],
      }
    })

  const toggleNeed = (need: HostCapability) =>
    patch((from) => {
      const has = from.backend?.needs?.includes(need) ?? false
      const needs = has
        ? (from.backend?.needs ?? []).filter((one) => one !== need)
        : [...(from.backend?.needs ?? []), need]
      return {
        ...from,
        ...(needs.length > 0 ? { backend: { ...from.backend, needs } } : { backend: undefined }),
      }
    })

  // --- run, save, export ----------------------------------------------------
  const onLog = useCallback((level: 'log' | 'warn' | 'error', line: string) => {
    setLogs((from) => {
      const next = [...from, { id: (logId.current += 1), level, line }]
      // The same ceiling the scene's own log keeps; a panel that grows
      // forever is a tab that dies during a long session.
      return next.length > 200 ? next.slice(next.length - 200) : next
    })
  }, [])

  const run = () => {
    setLogs([])
    setPreview((from) => ({ doc, run: from.run + 1 }))
  }

  /** The document as the parser sees it - through JSON, so nothing a state
   * update left behind (an `undefined` field) survives into the check. */
  const checked = () => parseXp(JSON.parse(JSON.stringify(doc)))

  const download = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${doc.id}.xp.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const save = async () => {
    const parsed = checked()
    if (!parsed.ok) {
      setSaving({ at: 'refused', why: describeProblems(parsed.problems) })
      return
    }
    if (!onSave) {
      download()
      return
    }
    setSaving({ at: 'busy' })
    const result = await onSave(parsed.document)
    if (!result.ok) {
      setSaving({ at: 'refused', why: result.error })
      return
    }
    setSaving({ at: 'saved' })
    setFromDraft(false)
    try {
      window.localStorage.removeItem(draftKey(id))
    } catch {
      /* the draft outliving a save is a nuisance, not a failure */
    }
  }

  const discardDraft = () => {
    try {
      window.localStorage.removeItem(draftKey(id))
    } catch {
      /* same */
    }
    setDoc(onDisk)
    setFromDraft(false)
    setFile(onDisk.sketch!.entry)
  }

  const lines = useMemo(() => source.split('\n').length, [source])

  /**
   * Which pane a phone is looking at. On a desktop all three columns stand
   * side by side and this is ignored; below `lg` the screen is one pane's
   * worth of space, so it holds exactly one - hidden with CSS rather than
   * unmounted, so switching away from the preview does not restart the
   * sketch and switching away from the code does not drop the caret.
   */
  const [view, setView] = useState<'files' | 'code' | 'play'>('code')

  /** Preview the phone's overlay - the stick and the buttons - on a mouse. */
  const [showTouch, setShowTouch] = useState(false)

  return (
    /*
      `h-viewport-inset`, not `h-dvh`: the workspace mounts this inside a page
      with its own padding and chrome, and a full-viewport editor in there is
      exactly one banner too tall - the page scrolls under every drag. The
      class subtracts what the page took (and marks the page as holding a
      full-height frame, which drops its side gutters). On the operator route
      nothing is subtracted and it is the viewport.
    */
    <div className="sketch-project dark flex h-viewport-inset w-full flex-col bg-neutral-950 text-neutral-100">
      {/* ---- the bar ------------------------------------------------------ */}
      <header className="flex items-center gap-3 border-b border-neutral-900 px-4 py-2">
        {backHref && (
          <Link
            href={backHref}
            className="font-mono text-[11px] uppercase tracking-[0.15em] text-neutral-500 hover:text-neutral-300"
          >
            ← back
          </Link>
        )}
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          p5 · project
        </p>
        <NameField
          name={givenName ?? doc.name}
          onRename={onRename}
          onLocal={(next) => patch((from) => ({ ...from, name: next }))}
        />
        <div className="ml-auto flex items-center gap-3">
          {fromDraft && (
            <button
              type="button"
              onClick={discardDraft}
              className="font-mono text-[10px] uppercase tracking-wide text-amber-400/80 hover:text-amber-300"
              title="This is an unsaved draft from this browser. Click to drop it and reopen what is saved."
            >
              draft · discard
            </button>
          )}
          {saving.at === 'saved' && (
            <span className="font-mono text-[10px] text-neutral-500">saved</span>
          )}
          <button
            type="button"
            onClick={run}
            className="rounded border border-neutral-700 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-neutral-200 hover:border-neutral-500"
          >
            run
          </button>
          {onSave && (
            <button
              type="button"
              onClick={download}
              className="font-mono text-[10px] uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
            >
              export
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving.at === 'busy'}
            className="rounded bg-neutral-100 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-neutral-950 hover:bg-white disabled:opacity-60"
          >
            {saving.at === 'busy' ? 'saving…' : onSave ? 'save' : 'download'}
          </button>
        </div>
      </header>

      {saving.at === 'refused' && (
        <div className="border-b border-red-900/40 bg-red-950/30 px-4 py-2">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-red-300">
            {saving.why}
          </pre>
        </div>
      )}

      {/* ---- one pane on a phone, three columns on a desktop -------------- */}
      <nav className="flex gap-1 border-b border-neutral-900 px-2 py-1 lg:hidden">
        {(['files', 'code', 'play'] as const).map((one) => (
          <button
            key={one}
            type="button"
            onClick={() => setView(one)}
            className={`rounded px-3 py-1 font-mono text-[11px] uppercase tracking-wide ${
              view === one
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {one}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[220px_minmax(0,1fr)_minmax(300px,38%)]">
        {/* files + config */}
        <aside
          className={`${view === 'files' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 lg:flex lg:flex-none lg:border-r lg:border-neutral-900`}
        >
          <section>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
              files
            </p>
            <ul className="space-y-0.5">
              {paths.map((path) => (
                <li key={path} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFile(path)}
                    className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left font-mono text-[11px] ${
                      path === file
                        ? 'bg-neutral-800 text-neutral-100'
                        : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                    }`}
                  >
                    {path}
                    {path === sketch.entry && (
                      <span className="ml-1.5 text-[10px] uppercase text-sky-400/80">entry</span>
                    )}
                  </button>
                  {path !== sketch.entry && (
                    <>
                      <button
                        type="button"
                        onClick={() => makeEntry(path)}
                        title="Make this the entry - the file that runs last, after its helpers."
                        className="hidden shrink-0 font-mono text-[10px] uppercase text-neutral-600 hover:text-sky-400 group-hover:block"
                      >
                        entry
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFile(path)}
                        title="Delete this file."
                        className="hidden shrink-0 font-mono text-[10px] text-neutral-600 hover:text-rose-400 group-hover:block"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-1">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addFile()
                }}
                placeholder="lib/helper.js"
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={addFile}
                className="shrink-0 rounded border border-neutral-800 px-2 font-mono text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
              >
                +
              </button>
            </div>
            {fileTrouble && (
              <p className="mt-1 font-mono text-[10px] text-amber-400/80">{fileTrouble}</p>
            )}
          </section>

          <ConfigPanel
            doc={doc}
            onKeys={setKeys}
            onNeed={toggleNeed}
            onCapability={toggleCapability}
            onBlurb={(blurb) => patch((from) => ({ ...from, ...(blurb ? { blurb } : { blurb: undefined }) }))}
            onStick={(stick) =>
              patch((from) => ({
                ...from,
                sketch: { ...from.sketch!, ...(stick ? { stick: true } : { stick: undefined }) },
              }))
            }
          />
        </aside>

        {/* the code */}
        <div className={`${view === 'code' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 lg:flex`}>
          <CodePane
            source={source}
            lines={lines}
            onWrite={(text) => write(file, text)}
            projectText={Object.values(sketch.files).join('\n')}
          />
        </div>

        {/* the sketch, running */}
        <section
          className={`${view === 'play' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col lg:flex lg:border-l lg:border-neutral-900`}
        >
          <div className="relative min-h-0 flex-1">
            <SketchStage
              key={preview.run}
              xp={preview.doc}
              me={null}
              onLog={onLog}
              {...(showTouch ? { touch: true } : {})}
            />
          </div>
          <div className="flex h-40 min-h-0 flex-col border-t border-neutral-900">
            <div className="flex items-center justify-between px-3 py-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
                console
              </p>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase text-neutral-600">
                  <input
                    type="checkbox"
                    checked={showTouch}
                    onChange={(event) => setShowTouch(event.target.checked)}
                    className="accent-neutral-400"
                  />
                  touch controls
                </label>
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className="font-mono text-[10px] uppercase text-neutral-600 hover:text-neutral-400"
                >
                  clear
                </button>
              </div>
            </div>
            <Console logs={logs} />
          </div>
        </section>
      </div>
    </div>
  )
}

/** The name, edited in place. With `onRename` the answer is the server's;
 * without one (the operator route) it is the document's own field. */
function NameField({
  name,
  onRename,
  onLocal,
}: {
  name: string
  onRename?: SketchEditorProps['onRename']
  onLocal: (name: string) => void
}) {
  const [held, setHeld] = useState(name)
  const [refused, setRefused] = useState<string | null>(null)

  const commit = async () => {
    const wanted = held.trim()
    if (wanted.length === 0 || wanted === name) {
      setHeld(name)
      return
    }
    if (!onRename) {
      onLocal(wanted)
      return
    }
    const result = await onRename(wanted)
    if (!result.ok) {
      setRefused(result.error)
      setHeld(name)
      return
    }
    setRefused(null)
    setHeld(result.name)
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        value={held}
        onChange={(event) => setHeld(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="min-w-0 max-w-56 rounded border border-transparent bg-transparent px-2 py-0.5 text-sm text-neutral-100 hover:border-neutral-800 focus:border-neutral-600 focus:outline-none"
      />
      {refused && <span className="font-mono text-[10px] text-rose-400">{refused}</span>}
    </div>
  )
}

/** Everything about the cartridge that is not code. */
function ConfigPanel({
  doc,
  onKeys,
  onNeed,
  onCapability,
  onBlurb,
  onStick,
}: {
  doc: XpDocument
  onKeys: (keys: { key: string; does: string; cooldown?: number }[]) => void
  onNeed: (need: HostCapability) => void
  onCapability: (capability: Capability) => void
  onBlurb: (blurb: string) => void
  onStick: (stick: boolean) => void
}) {
  const keys = doc.player.keys ?? []

  return (
    <section className="space-y-4">
      <div>
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          blurb
        </p>
        <textarea
          defaultValue={doc.blurb ?? ''}
          onBlur={(event) => onBlurb(event.target.value.trim())}
          rows={2}
          placeholder="One line for the shelf."
          className="w-full resize-none rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] leading-relaxed text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
        />
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          keys · become buttons on a phone
        </p>
        <ul className="space-y-1">
          {keys.map((one, index) => (
            <li key={index} className="flex items-center gap-1">
              <input
                value={one.key}
                readOnly
                onKeyDown={(event) => {
                  /**
                   * Captured, not typed. A code is `Space`, `KeyE`, `Digit1`
                   * - and somebody typing the word "space" has written a key
                   * the parser refuses, discovered only at save. Pressing
                   * the key they mean cannot be spelled wrong. Tab still
                   * moves focus, Escape still leaves.
                   */
                  if (event.key === 'Tab' || event.key === 'Escape') return
                  event.preventDefault()
                  onKeys(keys.map((k, i) => (i === index ? { ...k, key: event.code } : k)))
                }}
                placeholder="press a key"
                title="Press the key you mean - its code (KeyE, Space, ArrowUp) is recorded."
                className="w-24 cursor-pointer rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
              />
              <input
                value={one.does}
                onChange={(event) =>
                  onKeys(keys.map((k, i) => (i === index ? { ...k, does: event.target.value } : k)))
                }
                placeholder="boost"
                title="The name it emits - what xp.pressed() and xp.on('press') hear."
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onKeys(keys.filter((_, i) => i !== index))}
                className="shrink-0 font-mono text-[10px] text-neutral-600 hover:text-rose-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {keys.length < MAX_PLAYER_KEYS && (
          <button
            type="button"
            onClick={() => onKeys([...keys, { key: '', does: '' }])}
            className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
          >
            + key
          </button>
        )}
        <label className="mt-2 flex cursor-pointer items-center gap-2 py-0.5 font-mono text-[11px] text-neutral-300">
          <input
            type="checkbox"
            checked={doc.sketch?.stick ?? false}
            onChange={(event) => onStick(event.target.checked)}
            className="accent-neutral-300"
          />
          thumbstick on phones
        </label>
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-neutral-600">
          The stick, the arrows and WASD all land in xp.input.
        </p>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          where it can be played
        </p>
        {OFFERED_CAPABILITIES.map(({ capability, label, note }) => (
          <label
            key={capability}
            className="flex cursor-pointer items-start gap-2 py-1 font-mono text-[11px] text-neutral-300"
            title={note}
          >
            <input
              type="checkbox"
              checked={doc.capabilities.includes(capability)}
              onChange={() => onCapability(capability)}
              className="mt-0.5 accent-neutral-300"
            />
            <span>
              {label}
              <span className="mt-0.5 block text-[10px] leading-relaxed text-neutral-600">
                {note}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          backend
        </p>
        {OFFERED_NEEDS.map(({ need, label }) => (
          <label
            key={need}
            className="flex cursor-pointer items-center gap-2 py-0.5 font-mono text-[11px] text-neutral-300"
          >
            <input
              type="checkbox"
              checked={doc.backend?.needs?.includes(need) ?? false}
              onChange={() => onNeed(need)}
              className="accent-neutral-300"
            />
            {label}
          </label>
        ))}
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-neutral-600">
          Neither checked means it also runs alone. The wire still joins in a
          room either way.
        </p>
      </div>

      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          engine
        </p>
        <p className="font-mono text-[11px] text-neutral-400">
          p5 · entry runs last · <span className="text-neutral-500">window.xp is the wrapper</span>
        </p>
      </div>
    </section>
  )
}

/** The scripts panel's stacked pre/textarea, owned. Every rule that decides
 * where a glyph lands is repeated on both layers - see the original's note. */
/**
 * The stacked pre/textarea, owned - with two departures from the scripts
 * panel it was copied from, both earned in use.
 *
 * **Nothing wraps.** The original wraps long lines, and the two layers can
 * wrap *differently* - at which point everything below the first difference
 * slips, and the caret you see is a line above the text your keys edit.
 * That is not a small bug: somebody deleted the middle of a working
 * function three screens below where they were typing. `whitespace-pre` on
 * both layers plus `wrap="off"` makes the layouts trivially identical, and
 * as a bonus the gutter's numbers stop drifting on long lines. Long lines
 * scroll sideways, like every code editor.
 *
 * **One scroller, around all three layers.** Not wrapping was only half of
 * it: the box the textarea is stretched over must also be the *size of the
 * file*, in both directions. It was neither - a flex row stretched it to
 * the pane's height and shrank it to the pane's width - so the textarea sat
 * smaller than its own text and scrolled inside itself, invisibly, the
 * moment the caret left the visible part. The paint behind it did not move
 * with it, and from then on a click landed five lines below the line you
 * pointed at. `h-max min-h-full w-max min-w-full shrink-0` on the box is
 * the whole fix, and the invariant it buys is worth stating plainly:
 * neither layer ever scrolls; the pane around them does.
 *
 * **Completions**, from `./complete.ts` - the closed vocabulary (SDK, p5,
 * the project's own words), offered under the box rather than at the caret,
 * for the reason the scripts panel gives: a caret-anchored popup needs a
 * text-measuring mirror, and that mirror is the first three hundred lines
 * of the code editor this pane refuses to become. Tab takes the first one;
 * no other key is the menu's to take (see the keydown).
 */
function CodePane({
  source,
  lines,
  onWrite,
  projectText,
}: {
  source: string
  lines: number
  onWrite: (text: string) => void
  projectText: string
}) {
  const box = useRef<HTMLTextAreaElement | null>(null)
  const [menu, setMenu] = useState<Completion[] | null>(null)

  const offer = (element: HTMLTextAreaElement) => {
    if (element.selectionStart !== element.selectionEnd) {
      setMenu(null)
      return
    }
    const found = completionsFor(element.value, element.selectionStart, projectText)
    setMenu(found.length > 0 ? found : null)
  }

  const take = (pick: Completion) => {
    const element = box.current
    if (!element) return
    const next = accept(element.value, element.selectionStart, pick.text)
    onWrite(next.source)
    setMenu(null)
    // After React writes the value back, not before - a caret set into the
    // old text lands wherever the diff pushed it.
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(next.caret, next.caret)
    })
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {/* `code-stack`: on a touch screen the 16px input floor in `globals.css`
          would otherwise raise the caret's text and leave the paint at 11px.
          The class hands the floor to both layers at once - see the rule. */}
      <div className="code-stack flex min-h-0 w-full min-w-0 flex-1 overflow-auto border-y border-transparent bg-neutral-950/60 focus-within:border-neutral-700">
        <pre
          aria-hidden
          className="h-max min-h-full shrink-0 border-r border-neutral-900 bg-neutral-950 px-1.5 py-2 text-right font-mono text-[11px] leading-[1.45] text-neutral-700"
        >
          {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
        </pre>
        {/*
          As big as the code, never smaller than the pane - in *both*
          directions, and the height is the half that was missing.

          The textarea is `inset-0` on this box, so this box's size is the
          textarea's size. `w-max min-w-full` gave it the width of the
          longest line. Its height, though, was whatever the flex row
          stretched it to - the pane's visible height - while the painted
          `pre` inside it stood as tall as the file. A file taller than the
          pane therefore left the textarea short of its own content, and a
          textarea shorter than its content *scrolls*, silently, with
          `overflow-hidden`: arrow down past the last visible line and it
          slid its text up 84px while the paint behind it stayed put. From
          then on the caret was five lines from the glyph under it, and a
          click on the line you meant edited the line five below - the slip
          this pane was supposed to have stopped.

          `h-max min-h-full` makes the box the file's own height, and
          `shrink-0` is the width's half of the same story: this box is a
          flex item, so `w-max` was only its *base* size and the row shrank
          it back to the pane - which left the textarea narrower than a long
          line and scrolling sideways inside itself, the same slip turned
          ninety degrees. Now the box is the file's own size in both
          directions, the textarea's content always fits, and the one thing
          that scrolls is the pane around all three layers - which is what
          keeps them together.
        */}
        <div className="relative h-max min-h-full w-max min-w-full shrink-0">
          <pre
            aria-hidden
            className="whitespace-pre px-3 py-2 font-mono text-[11px] leading-[1.45] text-neutral-200"
          >
            {tokenise(source).map((token, index) => (
              <span key={index} className={PAINT[token.kind]}>
                {token.text}
              </span>
            ))}
            {'\n'}
          </pre>
          <textarea
            ref={box}
            value={source}
            spellCheck={false}
            wrap="off"
            onChange={(event) => {
              onWrite(event.target.value)
              offer(event.currentTarget)
            }}
            onClick={() => setMenu(null)}
            onBlur={() => setMenu(null)}
            onKeyDown={(event) => {
              if (!menu) return
              /**
               * Tab accepts. Nothing else is taken.
               *
               * The menu used to hold Enter and both vertical arrows as
               * well, and it opens on its own after two characters - so a
               * person who typed `ci` and pressed down twice to leave the
               * line went nowhere, and kept typing into the line they
               * believed they had left. Enter, which is a newline
               * everywhere in the world, wrote `circle`. A strip thirty
               * pixels tall at the foot of the pane is not something you
               * look at while typing, and it should not be able to take a
               * key you were aiming at the text.
               *
               * So every key that moves a caret moves the caret, and closes
               * the menu on its way through - the offer was about a caret
               * that has now gone. What is lost is picking the third word
               * with the keyboard; it is one click away in the strip, and
               * the first word is the one Tab was always going to take.
               */
              if (event.key === 'Escape') {
                event.preventDefault()
                setMenu(null)
              } else if (event.key === 'Tab') {
                event.preventDefault()
                take(menu[0])
              } else if (event.key.startsWith('Arrow') || event.key === 'Enter'
                || event.key === 'Home' || event.key === 'End'
                || event.key === 'PageUp' || event.key === 'PageDown') {
                setMenu(null)
              }
            }}
            className="code-sheet absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre bg-transparent px-3 py-2 font-mono text-[11px] leading-[1.45] text-transparent caret-neutral-100 selection:bg-violet-500/30 focus:outline-none"
          />
        </div>
      </div>
      {/* Under the box, always the same height - a strip that appears and
          disappears is a pane that jumps while you type. */}
      <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-t border-neutral-900 px-2">
        {menu?.map((pick, index) => (
          <button
            key={pick.text}
            type="button"
            /* onMouseDown, not onClick: the textarea's blur closes the menu
               before a click would land. */
            onMouseDown={(event) => {
              event.preventDefault()
              take(pick)
            }}
            /* The first is the one Tab takes, so the first is the one drawn
               as chosen - the strip says what the key will do. */
            className={`rounded px-2 py-0.5 font-mono text-[11px] ${
              index === 0
                ? 'bg-neutral-800 text-neutral-100'
                : pick.given
                  ? 'text-sky-300/80 hover:bg-neutral-900'
                  : 'text-neutral-400 hover:bg-neutral-900'
            }`}
          >
            {pick.text}
          </button>
        ))}
        {menu && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-700">
            tab · or click one
          </span>
        )}
      </div>
    </div>
  )
}

function Console({ logs }: { logs: LogLine[] }) {
  const pane = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    // Pinned to the newest line, which is the one being debugged.
    pane.current?.scrollTo({ top: pane.current.scrollHeight })
  }, [logs])

  return (
    <div ref={pane} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
      {logs.length === 0 ? (
        <p className="font-mono text-[10px] text-neutral-700">
          console.log from the sketch lands here.
        </p>
      ) : (
        logs.map((one) => (
          <p
            key={one.id}
            className={`whitespace-pre-wrap font-mono text-[11px] leading-relaxed ${
              one.level === 'error'
                ? 'text-rose-300'
                : one.level === 'warn'
                  ? 'text-amber-300/90'
                  : 'text-neutral-300'
            }`}
          >
            {one.line}
          </p>
        ))
      )}
    </div>
  )
}
