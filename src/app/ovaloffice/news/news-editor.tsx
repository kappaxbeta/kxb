'use client'

import { Check, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { deleteNews, saveNews } from '@/domain/news/actions'
import type { NewsLink } from '@/domain/news/links'
import type { NewsAudience, NewsItem } from '@/domain/news/queries'
import type { Picture } from '@/domain/pictures/catalogue'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * Writing what every space reads.
 *
 * One form, two modes - a new announcement or an existing one - because they
 * differ by an id and nothing else, and two forms would be two places to keep
 * the picture picker in step.
 *
 * Everything here is deliberately plain state and a server action. There is no
 * optimistic layer: an announcement lands in every space in the product, it is
 * written a handful of times a month, and showing it as saved before the server
 * agrees would be showing a lie about the one thing that matters here.
 */
export function NewsEditor({
  news,
  audiences,
  pictures,
}: {
  news: NewsItem[]
  audiences: NewsAudience[]
  pictures: Picture[]
}) {
  /** Which row the form is editing, or null for a new one. */
  const [editing, setEditing] = useState<NewsItem | null>(null)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <NewsForm
        // Remounted per row, so every field resets to what that row says
        // instead of being merged into whatever was half-typed before.
        key={editing?.id ?? 'new'}
        item={editing}
        audiences={audiences}
        pictures={pictures}
        onDone={() => setEditing(null)}
      />

      <NewsRows news={news} editingId={editing?.id ?? null} onEdit={setEditing} />
    </div>
  )
}

function NewsForm({
  item,
  audiences,
  pictures,
  onDone,
}: {
  item: NewsItem | null
  audiences: NewsAudience[]
  pictures: Picture[]
  onDone: () => void
}) {
  const [headline, setHeadline] = useState(item?.headline ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [image, setImage] = useState<string | null>(item?.image ?? null)
  const [links, setLinks] = useState<NewsLink[]>(item?.links ?? [])
  const [tenantId, setTenantId] = useState<string | null>(item?.tenantId ?? null)
  const [published, setPublished] = useState(item?.published ?? false)
  const [note, setNote] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  const save = () => {
    setNote(null)
    setFailed(false)
    start(async () => {
      const result = await saveNews({
        id: item?.id ?? null,
        news: {
          headline,
          body,
          image,
          // Blank rows are dropped rather than refused: an empty pair is
          // somebody who added a link slot and changed their mind, not an
          // error worth stopping a save for.
          links: links.filter((link) => link.label.trim() && link.href.trim()),
          tenantId,
          published,
        },
      })

      if (!result.ok) {
        setFailed(true)
        setNote(result.error)
        return
      }
      setNote(item ? 'saved' : 'saved as a new announcement')
      if (!item) {
        setHeadline('')
        setBody('')
        setImage(null)
        setLinks([])
        setPublished(false)
      }
      onDone()
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">
          {item ? 'Edit announcement' : 'New announcement'}
        </h3>
        {item && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            New instead
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Headline
        <input
          value={headline}
          maxLength={80}
          placeholder="The studio can pin scenes now"
          onChange={(event) => setHeadline(event.target.value)}
          className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        The drifting bit
        <textarea
          value={body}
          rows={3}
          maxLength={400}
          placeholder="Optional. Two sentences, then link to the rest."
          onChange={(event) => setBody(event.target.value)}
          className="resize-y rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
        />
        <span className="self-end font-mono text-[10px] text-muted-foreground">
          {body.length}/400
        </span>
      </label>

      <PicturePicker pictures={pictures} chosen={image} onChoose={setImage} />

      <LinkFields links={links} onChange={setLinks} />

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Who sees it
        <select
          value={tenantId ?? ''}
          onChange={(event) => setTenantId(event.target.value || null)}
          className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
        >
          <option value="">Every space</option>
          {audiences.map((space) => (
            <option key={space.tenantId} value={space.tenantId}>
              {space.name} (/{space.slug})
            </option>
          ))}
        </select>
      </label>

      {/*
        Publishing is a checkbox rather than a second button, so the state a row
        is in is visible while it is being written rather than implied by which
        button was pressed. Unticking it is the closest thing to a recall.
      */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={published}
          onChange={(event) => setPublished(event.target.checked)}
          className="accent-accent"
        />
        Published — visible in {tenantId ? 'that space' : 'every space'}
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || headline.trim().length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}
          {item ? 'Save over it' : 'Save'}
        </button>
        {note && (
          <p className={`text-xs ${failed ? 'text-amber-400' : 'text-muted-foreground'}`}>{note}</p>
        )}
      </div>
    </div>
  )
}

/**
 * The picture, chosen from what is already in the repo.
 *
 * A grid rather than a select, because these are pictures and nobody knows
 * `venue-4-branded.webp` by name. Clicking the chosen one again clears it,
 * which is the only way back to an announcement with no picture.
 */
function PicturePicker({
  pictures,
  chosen,
  onChoose,
}: {
  pictures: Picture[]
  chosen: string | null
  onChoose: (path: string | null) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span>Picture</span>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className="rounded-lg border border-border px-2 py-1 transition hover:bg-secondary hover:text-foreground"
        >
          {open ? 'Close' : chosen ? 'Change' : `Pick from ${pictures.length}`}
        </button>
      </div>

      {chosen && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={chosen} alt="" className="size-14 rounded object-cover" />
          <code className="min-w-0 flex-1 truncate font-mono text-[10px]">{chosen}</code>
          <button
            type="button"
            onClick={() => onChoose(null)}
            aria-label="Remove picture"
            className="rounded p-1 transition hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      {open && (
        <ul className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-6">
          {pictures.map((picture) => (
            <li key={picture.path}>
              <button
                type="button"
                onClick={() => {
                  onChoose(picture.path === chosen ? null : picture.path)
                  setOpen(false)
                }}
                title={picture.path}
                className={`block w-full overflow-hidden rounded border transition ${
                  picture.path === chosen
                    ? 'border-accent'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={picture.path} alt={picture.name} className="aspect-square object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Up to four places to go. See `newsSchema` for why four. */
function LinkFields({
  links,
  onChange,
}: {
  links: NewsLink[]
  onChange: (links: NewsLink[]) => void
}) {
  const set = (index: number, patch: Partial<NewsLink>) =>
    onChange(links.map((link, at) => (at === index ? { ...link, ...patch } : link)))

  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <span>Links</span>

      {links.map((link, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            value={link.label}
            maxLength={40}
            placeholder="Label"
            onChange={(event) => set(index, { label: event.target.value })}
            className="w-28 shrink-0 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
          />
          <input
            value={link.href}
            maxLength={500}
            placeholder="/t/space/studio or https://…"
            onChange={(event) => set(index, { href: event.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 font-mono text-xs text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(links.filter((_, at) => at !== index))}
            aria-label="Remove link"
            className="rounded p-1.5 transition hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}

      {links.length < 4 && (
        <button
          type="button"
          onClick={() => onChange([...links, { label: '', href: '' }])}
          className="flex items-center gap-1 self-start rounded-lg border border-border px-2 py-1 transition hover:bg-secondary hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
          Add a link
        </button>
      )}
    </div>
  )
}

/** What has been written so far, drafts included. */
function NewsRows({
  news,
  editingId,
  onEdit,
}: {
  news: NewsItem[]
  editingId: string | null
  onEdit: (item: NewsItem) => void
}) {
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)

  // Headline and body are the announcement's own words - what an operator
  // reads to find the row they wrote.
  const view = useTableView(news, (item) => `${item.headline} ${item.body ?? ''}`)

  if (news.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Nothing announced yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {problem && <p className="text-xs text-amber-400">{problem}</p>}

      <TableToolbar view={view} placeholder="Search announcements…" unit="announcements" />

      {view.pageRows.map((item) => (
        <div
          key={item.id}
          className={`flex gap-3 rounded-xl border p-3 transition ${
            item.id === editingId ? 'border-accent bg-accent/5' : 'border-border bg-card'
          }`}
        >
          {item.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate text-sm">{item.headline}</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {item.published ? 'live' : 'draft'} · {item.tenantId ? 'one space' : 'every space'}
            </p>
            <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="transition hover:text-foreground"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setProblem(null)
                  start(async () => {
                    const result = await deleteNews(item.id)
                    if (!result.ok) setProblem(result.error)
                  })
                }}
                className="flex items-center gap-1 transition hover:text-red-400"
              >
                <Trash2 className="size-3" aria-hidden />
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}

      <Pager view={view} />
    </div>
  )
}
