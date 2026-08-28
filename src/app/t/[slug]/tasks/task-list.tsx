'use client'

import { useOptimistic, useRef, useState, useTransition } from 'react'
import {
  type ActionResult,
  createTask,
  deleteTask,
  rebuildReadModel,
  renameTask,
  setTaskCompletion,
} from '@/domain/tasks/actions'
import type { TaskView } from '@/domain/tasks/queries'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * A command round trip is load-stream -> append -> project -> revalidate, which
 * is several round trips to Postgres. Waiting for that before touching the DOM
 * makes every click feel broken, so the list renders the *intended* result
 * immediately and reconciles when the server responds.
 *
 * React discards the optimistic layer automatically once the transition settles
 * and fresh props arrive - there is no manual rollback. If the command was
 * rejected, the revalidated data simply doesn't include the change, and the row
 * snaps back with the error shown above the list.
 *
 * One thing optimism cannot paper over in a shared workspace: another member's
 * changes do not push. The list is fresh as of this render, and stale the
 * moment a teammate types. Real-time would mean subscribing to the log
 * (Supabase Realtime on `events`) and re-running the projection on arrival -
 * the same Projection object, driven by a different trigger.
 */

type OptimisticTask = TaskView & { pending?: boolean }

type Mutation =
  | { kind: 'add'; tempId: string; title: string }
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'toggle'; id: string; completed: boolean }
  | { kind: 'delete'; id: string }

function applyMutation(tasks: OptimisticTask[], mutation: Mutation): OptimisticTask[] {
  switch (mutation.kind) {
    case 'add': {
      const now = new Date().toISOString()
      return [
        {
          id: mutation.tempId,
          title: mutation.title,
          completed: false,
          createdBy: '',
          createdAt: now,
          updatedAt: now,
          version: 1,
          pending: true,
        },
        ...tasks,
      ]
    }
    case 'rename':
      return tasks.map((task) =>
        task.id === mutation.id ? { ...task, title: mutation.title, pending: true } : task,
      )
    case 'toggle':
      return tasks.map((task) =>
        task.id === mutation.id
          ? { ...task, completed: mutation.completed, pending: true }
          : task,
      )
    case 'delete':
      return tasks.filter((task) => task.id !== mutation.id)
  }
}

export function TaskList({
  slug,
  tasks,
  archived,
  nameByUserId,
}: {
  slug: string
  tasks: TaskView[]
  archived: boolean
  nameByUserId: Record<string, string>
}) {
  const refusal = useRefusal()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [optimisticTasks, mutate] = useOptimistic<OptimisticTask[], Mutation>(
    tasks,
    applyMutation,
  )
  const t = workspaceDict(useLocale()).tasks
  const formRef = useRef<HTMLFormElement>(null)

  /**
   * Apply the optimistic change, then run the real command.
   *
   * Both must happen inside the same transition, otherwise React drops the
   * optimistic state the moment the first await yields.
   */
  function run(mutation: Mutation | null, action: () => Promise<ActionResult>) {
    setError(null)
    startTransition(async () => {
      if (mutation) mutate(mutation)
      const result = await action()
      if (!result.ok) setError(refusal(result.error))
    })
  }

  // `<form action>` is already a transition, so mutate() is safe here.
  async function handleCreate(formData: FormData) {
    const title = String(formData.get('title') ?? '').trim()
    if (!title) return

    formRef.current?.reset()
    setError(null)
    mutate({ kind: 'add', tempId: crypto.randomUUID(), title })

    const result = await createTask(slug, title)
    if (!result.ok) setError(refusal(result.error))
  }

  return (
    <section>
      {archived ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-muted">
          {t.archived}
        </p>
      ) : (
        <form ref={formRef} action={handleCreate} className="flex gap-2">
          <input
            name="title"
            placeholder={t.placeholder}
            required
            maxLength={200}
            autoComplete="off"
            className="flex-1 rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            {t.add}
          </button>
        </form>
      )}

      <div className="mt-2 flex min-h-5 items-center gap-2">
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        {!error && isPending && (
          <p className="text-xs text-ink-muted">{t.syncing}</p>
        )}
      </div>

      <ul className="mt-4 space-y-1.5">
        {optimisticTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            author={task.createdBy ? nameByUserId[task.createdBy] : undefined}
            disabled={archived}
            onToggle={(completed) =>
              run({ kind: 'toggle', id: task.id, completed }, () =>
                setTaskCompletion(slug, task.id, completed),
              )
            }
            onRename={(title) =>
              run({ kind: 'rename', id: task.id, title }, () =>
                renameTask(slug, task.id, title),
              )
            }
            onDelete={() =>
              run({ kind: 'delete', id: task.id }, () => deleteTask(slug, task.id))
            }
          />
        ))}
      </ul>

      {optimisticTasks.length === 0 && (
        <p className="mt-6 text-sm text-ink-muted">
          {t.empty}
        </p>
      )}
    </section>
  )
}

function TaskRow({
  task,
  author,
  disabled,
  onToggle,
  onRename,
  onDelete,
}: {
  task: OptimisticTask
  author?: string
  disabled: boolean
  onToggle: (completed: boolean) => void
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const t = workspaceDict(useLocale()).tasks
  const [editing, setEditing] = useState(false)

  function submitRename(formData: FormData) {
    const title = String(formData.get('title') ?? '').trim()
    setEditing(false)
    if (title && title !== task.title) onRename(title)
  }

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5 transition-opacity ${
        task.pending ? 'opacity-60' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={task.completed}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="size-4 accent-[var(--color-accent)]"
        aria-label={fill(task.completed ? t.markIncomplete : t.markComplete, {
          title: task.title,
        })}
      />

      {editing ? (
        <form action={submitRename} className="flex flex-1 gap-2">
          <input
            name="title"
            defaultValue={task.title}
            /* biome-ignore lint/a11y/noAutofocus: focusing the field the user just chose to edit */
            autoFocus
            maxLength={200}
            className="flex-1 rounded border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="text-sm text-accent hover:underline">
            {t.save}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-ink-muted hover:underline"
          >
            {t.cancel}
          </button>
        </form>
      ) : (
        <>
          <span
            className={`flex-1 text-sm ${task.completed ? 'text-ink-muted line-through' : ''}`}
          >
            {task.title}
          </span>
          {author && (
            <span
              title={fill(t.addedBy, { name: author })}
              className="hidden text-xs text-ink-muted sm:inline"
            >
              {author}
            </span>
          )}
          <span
            title={t.versionTitle}
            className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-muted"
          >
            v{task.version}
          </span>
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm text-ink-muted hover:text-ink"
              >
                {t.edit}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="text-sm text-ink-muted hover:text-red-500"
              >
                {t.delete}
              </button>
            </>
          )}
        </>
      )}
    </li>
  )
}
