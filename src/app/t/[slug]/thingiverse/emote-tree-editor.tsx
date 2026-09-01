'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attempt } from '@/app/components/connection'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import { setEmoteTree } from '@/domain/thingiverse/actions'
import {
  type EmoteNode,
  type EmoteTree,
  freshNode,
  MAX_NODE_LABEL,
  MAX_TREE_CHILDREN,
  MAX_TREE_DEPTH,
  reach,
  treeProblems,
  walk,
} from '@/domain/thingiverse/emote-tree'
import type { ClipView } from '@/domain/thingiverse/queries'

/**
 * The menu, and the branches you arrange it into.
 *
 * ---------------------------------------------------------------------------
 * An outline, not a canvas
 * ---------------------------------------------------------------------------
 * "Tree builder" invites a diagram - boxes joined by curves, dragged about -
 * and that is the wrong drawing for this tree twice over. It is at most three
 * deep and twelve wide, so there is no topology to discover; and what somebody
 * is actually authoring is a *sequence of presses*, which reads down a page and
 * not across a canvas. An indented outline is the shape of the thing it makes.
 *
 * The keys are why. `D` then `R` is the whole interface in a world, so the
 * editor prints exactly that beside every row - see `Path` - and arranging the
 * menu is watching those strings change as you move rows about.
 *
 * ---------------------------------------------------------------------------
 * One Save for the whole menu
 * ---------------------------------------------------------------------------
 * Because the log takes it whole, and for the reason it does: dragging a clip
 * from one branch to another is one decision touching two places. Every edit
 * here is local until Save, `treeProblems` runs on every keystroke, and the
 * button stays down while anything is wrong - the same shape the bench and the
 * shelf's row editor take.
 */
export function EmoteTreeEditor({
  slug,
  tree: saved,
  clips,
  t,
}: {
  slug: string
  tree: EmoteTree
  /** What a leaf may play. Only for the picker; a name is never checked. */
  clips: ClipView[]
  t: WorkspaceDict['thingiverse']['emotes']
}) {
  const router = useRouter()
  const [tree, setTree] = useState<EmoteTree>(saved)
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  const problems = treeProblems(tree)
  const rows = walk(tree).length

  /**
   * A new id, minted here because the editor is the only thing that adds rows.
   *
   * `crypto.randomUUID` rather than a counter over the existing rows: a counter
   * repeats the moment somebody deletes row 3 and adds another, and two rows
   * with one id is the one thing `treeProblems` refuses outright - it would
   * make the editor edit the wrong row.
   */
  const mint = () => crypto.randomUUID()

  /**
   * Rewrite one row, wherever it is.
   *
   * Recursive rather than a path of indices, because a path is invalidated by
   * every insert and delete above it and the caller would have to keep one per
   * row. An id survives all of that, which is what it is for.
   */
  const edit = (id: string, change: (node: EmoteNode) => EmoteNode | null) => {
    const walkOver = (nodes: readonly EmoteNode[]): EmoteNode[] =>
      nodes.flatMap((node) => {
        if (node.id === id) {
          const next = change(node)
          return next ? [next] : []
        }
        return [{ ...node, children: walkOver(node.children) }]
      })
    setTree((current) => ({ roots: walkOver(current.roots) }))
  }

  const save = () =>
    start(async () => {
      setNote(null)
      const result = await attempt(() => setEmoteTree(slug, tree))
      if (!result.ok) {
        setNote(result.error ?? 'Refused')
        return
      }
      setNote(t.saved)
      router.refresh()
    })

  return (
    <div className="space-y-4">
      <p className="max-w-[62ch] text-xs leading-relaxed text-ink-muted">{t.intro}</p>

      {tree.roots.length === 0 ? (
        <p className="rounded-xl border border-line/60 bg-surface px-4 py-6 text-sm text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {tree.roots.map((node) => (
            <Row
              key={node.id}
              node={node}
              depth={1}
              path={[]}
              clips={clips}
              t={t}
              onEdit={edit}
              onAdd={(parentId) =>
                edit(parentId, (one) => ({
                  ...one,
                  children: [...one.children, freshNode(mint())],
                }))
              }
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {tree.roots.length < MAX_TREE_CHILDREN && (
          <button
            type="button"
            onClick={() =>
              setTree((current) => ({ roots: [...current.roots, freshNode(mint())] }))
            }
            className="rounded-lg border border-line/60 px-3 py-1.5 text-xs text-ink transition hover:bg-surface-raised"
          >
            {t.addBranch}
          </button>
        )}

        <button
          type="button"
          disabled={pending || problems.length > 0}
          onClick={save}
          className="rounded-lg border border-emerald-400/50 px-4 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-40"
        >
          {pending ? t.saving : t.save}
        </button>

        <span className="font-mono text-[10px] tabular-nums text-ink-muted">
          {fill(t.rows, { n: String(rows) })}
        </span>
        {note && <span className="text-[11px] text-ink-muted">{note}</span>}
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1 text-[11px] text-red-400">
          {/* Deduplicated: one unnamed row and one bound-twice key are two
              problems, but four unnamed rows are one thing to fix. */}
          {[...new Set(problems)].map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <Try tree={tree} t={t} />
    </div>
  )
}

/**
 * One row of the outline, and its children under it.
 *
 * Indented by depth rather than nested in bordered boxes: three levels of box
 * inside box is three borders around the thing you are reading, and the
 * indentation already says everything the boxes would.
 */
function Row({
  node,
  depth,
  path,
  clips,
  t,
  onEdit,
  onAdd,
}: {
  node: EmoteNode
  depth: number
  /** The keys that reach this row's parent, for printing the whole press. */
  path: string[]
  clips: ClipView[]
  t: WorkspaceDict['thingiverse']['emotes']
  onEdit: (id: string, change: (node: EmoteNode) => EmoteNode | null) => void
  onAdd: (parentId: string) => void
}) {
  const here = [...path, node.key ?? '·']

  return (
    <li style={{ marginInlineStart: depth > 1 ? '1.25rem' : 0 }}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/60 bg-surface p-2">
        {/*
          The key first, because it is the interface.

          One character, upper cased on the way in so `q` and `Q` are one key -
          the same rule a blueprint's `UseInput` follows, and for the same
          reason: a row bound to both would have a second binding that never
          fires.
        */}
        <input
          value={node.key ?? ''}
          maxLength={1}
          onChange={(event) =>
            onEdit(node.id, (one) => ({
              ...one,
              key: event.target.value ? event.target.value.toUpperCase() : undefined,
            }))
          }
          aria-label={t.key}
          placeholder={t.key}
          className="w-9 shrink-0 rounded-lg border border-accent-2/40 bg-surface px-1 py-1 text-center text-xs uppercase text-accent-2 outline-none focus:border-accent-2"
        />

        <input
          value={node.label}
          maxLength={MAX_NODE_LABEL}
          onChange={(event) => onEdit(node.id, (one) => ({ ...one, label: event.target.value }))}
          aria-label={t.label}
          placeholder={t.label}
          className="min-w-0 flex-1 rounded-lg border border-line/60 bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-muted"
        />

        {/*
          What it plays, as a picker over the clips this space has.

          A picker rather than a text field even though the domain never checks
          the name: what is offered is what exists, and typing a clip name from
          memory is how you get a row that opens and does nothing. The blank
          option is a branch that only opens - which is most rows.
        */}
        <select
          value={node.clip ?? ''}
          onChange={(event) =>
            onEdit(node.id, (one) => ({ ...one, clip: event.target.value || null }))
          }
          aria-label={t.plays}
          className="min-w-0 max-w-[10rem] flex-1 rounded-lg border border-line/60 bg-surface px-2 py-1 text-xs text-ink"
        >
          <option value="">{t.opensOnly}</option>
          {clips.map((clip) => (
            <option key={clip.id} value={clip.name}>
              {clip.name}
            </option>
          ))}
        </select>

        <Path keys={here} />

        {depth < MAX_TREE_DEPTH && node.children.length < MAX_TREE_CHILDREN && (
          <button
            type="button"
            onClick={() => onAdd(node.id)}
            className="rounded-lg border border-line/60 px-2 py-1 text-[11px] text-ink-muted transition hover:border-accent/50 hover:text-ink"
          >
            {t.addInside}
          </button>
        )}

        <button
          type="button"
          onClick={() => onEdit(node.id, () => null)}
          aria-label={fill(t.removeRow, { label: node.label || t.label })}
          className="rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/10"
        >
          {t.remove}
        </button>
      </div>

      {node.children.length > 0 && (
        <ul className="mt-1.5 space-y-1.5">
          {node.children.map((child) => (
            <Row
              key={child.id}
              node={child}
              depth={depth + 1}
              path={here}
              clips={clips}
              t={t}
              onEdit={onEdit}
              onAdd={onAdd}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The presses that reach this row.
 *
 * The one thing on the row that is not an input, and the reason the outline is
 * an outline: what somebody is authoring is a sequence of keys, and seeing
 * `D R` appear beside a row as they bind it is the whole feedback loop. A dot
 * stands for a level nobody has bound yet - which says "this row is
 * unreachable" far more directly than a validation message would.
 */
function Path({ keys }: { keys: string[] }) {
  return (
    <span className="shrink-0 rounded-md bg-surface-raised px-1.5 py-1 font-mono text-[10px] tracking-[0.2em] text-ink-muted">
      {keys.join('')}
    </span>
  )
}

/**
 * Type the keys and see where they land.
 *
 * Worth its own control because the menu's whole promise is muscle memory, and
 * the only way to know a menu has it is to try the presses. It runs `reach` -
 * the same function a world runs - rather than a second walk written here, so
 * what this says and what a room does cannot come apart.
 */
function Try({
  tree,
  t,
}: {
  tree: EmoteTree
  t: WorkspaceDict['thingiverse']['emotes']
}) {
  const [keys, setKeys] = useState('')
  const found = keys ? reach(tree, [...keys]) : null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line/40 bg-surface/50 p-2.5">
      <span className="text-[10px] uppercase tracking-[0.16em] text-ink-muted">{t.tryIt}</span>
      <input
        value={keys}
        maxLength={MAX_TREE_DEPTH}
        onChange={(event) => setKeys(event.target.value.toUpperCase())}
        aria-label={t.tryIt}
        placeholder="DR"
        className="w-20 rounded-lg border border-line/60 bg-surface px-2 py-1 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink"
      />
      <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
        {keys === ''
          ? t.tryHint
          : found === null
            ? t.reachesNothing
            : found.clip
              ? fill(t.reachesClip, { label: found.label, clip: found.clip })
              : fill(t.reachesBranch, { label: found.label })}
      </span>
    </div>
  )
}
