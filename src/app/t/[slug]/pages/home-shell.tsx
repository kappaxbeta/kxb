'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { PageSidebar } from '@/app/t/[slug]/pages/page-sidebar'
import type { PageView } from '@/domain/pages/queries'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'

export function HomeShell({
  slug,
  pages,
  archived,
  activePageId,
  children,
}: {
  slug: string
  pages: PageView[]
  archived: boolean
  activePageId?: string | null
  children: React.ReactNode
}) {
  const t = workspaceDict(useLocale()).pages
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()
  const [lastPathname, setLastPathname] = useState(pathname)

  // Auto-close sidebar on mobile when navigating pages
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsCollapsed(true)
    }
  }

  return (
    // The 140px it used to subtract was the old header plus the page padding.
    // The header is a rail down the side now, so only the padding is left.
    <div className="relative flex h-viewport-inset border border-line rounded-xl bg-surface shadow-sm overflow-hidden">
      {/* Mobile backdrop */}
      {!isCollapsed && (
        <div
          onClick={() => setIsCollapsed(true)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* Sidebar container with smooth collapse animation */}
      <div
        className={`transition-all duration-300 ease-in-out z-40 shrink-0 h-full absolute md:relative inset-y-0 left-0 bg-surface shadow-2xl md:shadow-none overflow-hidden ${
          isCollapsed
            ? 'w-64 -translate-x-full md:translate-x-0 md:-ml-64 opacity-0'
            : 'w-64 translate-x-0 opacity-100 md:ml-0'
        }`}
      >
        <PageSidebar
          slug={slug}
          pages={pages}
          activePageId={activePageId}
          archived={archived}
          onCollapse={() => setIsCollapsed(true)}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-surface relative h-full">
        {/* Page Header */}
        <header className="h-12 border-b border-line flex items-center px-4 shrink-0 gap-3 bg-surface-raised/30">
          {isCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="flex items-center justify-center p-1.5 rounded-md hover:bg-surface-raised transition text-ink-muted hover:text-ink"
              title={t.expand}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          )}
          {/* A breadcrumb or something could go here, for now it's empty space or just the button */}
        </header>

        <div className="flex-1 overflow-y-auto relative">
          {children}
        </div>
      </main>
    </div>
  )
}
