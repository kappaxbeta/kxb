'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  createPage,
  deletePage,
  updatePageStructure,
} from '@/domain/pages/actions'
import type { PageView } from '@/domain/pages/queries'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'

export interface TreeNode {
  page: PageView
  children: TreeNode[]
}

function buildTree(pages: PageView[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const page of pages) {
    map.set(page.id, { page, children: [] })
  }

  for (const page of pages) {
    const node = map.get(page.id)!
    if (page.parentId && map.has(page.parentId)) {
      map.get(page.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

export function PageSidebar({
  slug,
  pages,
  activePageId,
  archived,
  onCollapse,
}: {
  slug: string
  pages: PageView[]
  activePageId?: string | null
  archived: boolean
  onCollapse?: () => void
}) {
  const refusal = useRefusal()
  const t = workspaceDict(useLocale()).pages
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const tree = buildTree(pages)

  function toggleExpand(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleCreatePage(parentId: string | null = null) {
    setError(null)
    startTransition(async () => {
      // Find max position among siblings
      const siblings = pages.filter((p) => p.parentId === parentId)
      const maxPos = siblings.reduce((max, p) => Math.max(max, p.position), 0)
      const newPos = maxPos + 1.0

      const res = await createPage(slug, parentId, t.untitled, newPos)
      if (res.ok) {
        if (parentId) {
          setExpandedIds((prev) => ({ ...prev, [parentId]: true }))
        }
        router.push(`/t/${slug}/pages/${res.data.id}`)
      } else {
        setError(refusal(res.error))
      }
    })
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!confirm(t.confirmDelete)) {
      return
    }

    setError(null)
    startTransition(async () => {
      const res = await deletePage(slug, id)
      if (!res.ok) {
        setError(refusal(res.error))
      } else if (activePageId === id) {
        router.push(`/t/${slug}/pages`)
      }
    })
  }

  function handleMove(page: PageView, direction: 'up' | 'down', e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const siblings = pages
      .filter((p) => p.parentId === page.parentId)
      .sort((a, b) => a.position - b.position)

    const index = siblings.findIndex((p) => p.id === page.id)
    if (index < 0) return

    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= siblings.length) return

    const sibling = siblings[targetIdx]!
    const newPos = sibling.position + (direction === 'up' ? -0.5 : 0.5)

    setError(null)
    startTransition(async () => {
      const res = await updatePageStructure(slug, page.id, page.parentId, page.title, newPos)
      if (!res.ok) setError(refusal(res.error))
    })
  }

  return (
    <aside className="flex flex-col h-full border-r border-line bg-surface-raised/40 p-4 min-w-[260px] w-64 max-w-xs shrink-0 select-none rounded-l-xl">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-line gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="p-1 rounded hover:bg-surface text-ink-muted hover:text-ink text-xs transition"
              title={t.collapse}
            >
              ◀
            </button>
          )}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted truncate">
            {t.sidebar}
          </h2>
        </div>

        {!archived && (
          <button
            type="button"
            onClick={() => handleCreatePage(null)}
            disabled={isPending}
            className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50 shrink-0"
            title={t.newTopLevel}
          >
            <span>+</span> {t.page}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded bg-red-500/10 p-2 text-xs text-red-500">
          {error}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto space-y-0.5">
        {tree.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink-muted">
            <p>{t.empty}</p>
            {!archived && (
              <button
                type="button"
                onClick={() => handleCreatePage(null)}
                className="mt-2 text-accent hover:underline font-medium"
              >
                {t.createFirst}
              </button>
            )}
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.page.id}
              slug={slug}
              node={node}
              level={0}
              activePageId={activePageId}
              expandedIds={expandedIds}
              archived={archived}
              onToggleExpand={toggleExpand}
              onCreateSubpage={handleCreatePage}
              onDeletePage={handleDelete}
              onMovePage={handleMove}
            />
          ))
        )}
      </nav>
    </aside>
  )
}

function TreeItem({
  slug,
  node,
  level,
  activePageId,
  expandedIds,
  archived,
  onToggleExpand,
  onCreateSubpage,
  onDeletePage,
  onMovePage,
}: {
  slug: string
  node: TreeNode
  level: number
  activePageId?: string | null
  expandedIds: Record<string, boolean>
  archived: boolean
  onToggleExpand: (id: string, e: React.MouseEvent) => void
  onCreateSubpage: (parentId: string) => void
  onDeletePage: (id: string, e: React.MouseEvent) => void
  onMovePage: (page: PageView, direction: 'up' | 'down', e: React.MouseEvent) => void
}) {
  const t = workspaceDict(useLocale()).pages
  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds[node.page.id] ?? true
  const isActive = activePageId === node.page.id

  return (
    <div className="group/item">
      <Link
        href={`/t/${slug}/pages/${node.page.id}`}
        style={{ paddingLeft: `${level * 14 + 8}px` }}
        className={`flex items-center justify-between group rounded-md py-1.5 pr-2 text-xs font-medium transition ${
          isActive
            ? 'bg-accent/15 text-accent font-semibold'
            : 'text-ink hover:bg-surface-raised'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => onToggleExpand(node.page.id, e)}
              className="size-4 shrink-0 flex items-center justify-center rounded hover:bg-line text-ink-muted"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="size-4 shrink-0 text-center text-ink-muted/50">📄</span>
          )}
          <span className="truncate">{node.page.title || t.untitled}</span>
        </div>

        {!archived && (
          <div className="opacity-0 group-hover/item:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
            <button
              type="button"
              onClick={(e) => onMovePage(node.page, 'up', e)}
              title={t.moveUp}
              className="px-1 text-ink-muted hover:text-ink"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={(e) => onMovePage(node.page, 'down', e)}
              title={t.moveDown}
              className="px-1 text-ink-muted hover:text-ink"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCreateSubpage(node.page.id)
              }}
              title={t.addSubpage}
              className="px-1 text-accent font-bold hover:opacity-80"
            >
              +
            </button>
            <button
              type="button"
              onClick={(e) => onDeletePage(node.page.id, e)}
              title={t.deletePage}
              className="px-1 text-red-500 hover:opacity-80"
            >
              ✕
            </button>
          </div>
        )}
      </Link>

      {hasChildren && isExpanded && (
        <div className="space-y-0.5">
          {node.children.map((childNode) => (
            <TreeItem
              key={childNode.page.id}
              slug={slug}
              node={childNode}
              level={level + 1}
              activePageId={activePageId}
              expandedIds={expandedIds}
              archived={archived}
              onToggleExpand={onToggleExpand}
              onCreateSubpage={onCreateSubpage}
              onDeletePage={onDeletePage}
              onMovePage={onMovePage}
            />
          ))}
        </div>
      )}
    </div>
  )
}
