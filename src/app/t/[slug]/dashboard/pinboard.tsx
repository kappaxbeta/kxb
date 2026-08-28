'use client'

import Image from 'next/image'
import { useOptimistic, useRef, useState, useTransition } from 'react'
import { NewsBanner, NewsList } from '@/app/t/[slug]/dashboard/news'
import { PictureCard } from '@/app/t/[slug]/dashboard/picture-card'
import { SceneCard } from '@/app/t/[slug]/dashboard/scene-card'
import { EmoteGrid } from '@/app/world/_hud/emote-grid'
import {
  type ActionResult,
  deletePost,
  editPost,
  pinPost,
  publishPost,
  toggleReaction,
} from '@/domain/board/actions'
import type { BoardPostView } from '@/domain/board/queries'
import { avatarShotUrl, DEFAULT_AVATAR } from '@/domain/lounge/avatars'
import type { NewsItem } from '@/domain/news/queries'
import { type EmoteId, emoteTileStyle } from '@/domain/world/emotes'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The pinboard.
 *
 * ---------------------------------------------------------------------------
 * A wire, not a wall
 * ---------------------------------------------------------------------------
 * This used to be a masonry of cards - CSS columns, so uneven notices could
 * close their gaps. That solved a real problem and created two worse ones. A
 * column fills top to bottom before the next one starts, so the second-newest
 * notice was at the top of column two and the reading order nobody could learn;
 * and three cards across meant the words in them were forty characters wide,
 * which is a measure for a caption and not for the paragraph an admin actually
 * writes.
 *
 * So it is one ruled column now - see `.wire` in globals.css for the grammar,
 * and the note there for why it is the cue sheet's cousin rather than the cue
 * sheet. What that costs is the closed-up gaps; what it buys is that a board
 * reads the way the thing it represents works. Newest first, down a line, each
 * notice on the face of whoever wrote it.
 *
 * ---------------------------------------------------------------------------
 * What is optimistic and what is not
 * ---------------------------------------------------------------------------
 * Reactions are and notices are not, which is the same split the task list and
 * the members panel make. A face is a cheap, frequent, almost never refused
 * click, and waiting out load-append-project-revalidate before it appears makes
 * the board feel broken. Putting a notice up is rare and occasionally refused -
 * by role, by billing - so showing it before the server agrees would be showing
 * a lie often enough to matter.
 *
 * Optimism works here *because* these actions revalidate. The scene HUDs
 * deliberately do not, which is why they roll their own state instead; see the
 * note in src/domain/board/actions.ts.
 */

/** The size a reaction tile is drawn at in a chip. */
const CHIP_TILE = 18

type Mutation = { postId: string; emote: EmoteId; me: string }

/**
 * Flip one face on one notice.
 *
 * The optimistic layer mirrors what the decider will do rather than guessing:
 * present means remove, absent means add. React drops this layer as soon as the
 * revalidated posts arrive, so a rejected toggle simply snaps back.
 */
function applyToggle(posts: BoardPostView[], mutation: Mutation): BoardPostView[] {
  return posts.map((post) => {
    if (post.id !== mutation.postId) return post

    const existing = post.reactions.find((r) => r.emote === mutation.emote)

    if (!existing) {
      return {
        ...post,
        reactions: [...post.reactions, { emote: mutation.emote, by: [mutation.me], mine: true }],
      }
    }

    if (existing.mine) {
      const by = existing.by.filter((name) => name !== mutation.me)
      return {
        ...post,
        reactions:
          by.length === 0
            ? post.reactions.filter((r) => r.emote !== mutation.emote)
            : post.reactions.map((r) =>
                r.emote === mutation.emote ? { ...r, by, mine: false } : r,
              ),
      }
    }

    return {
      ...post,
      reactions: post.reactions.map((r) =>
        r.emote === mutation.emote ? { ...r, by: [...r.by, mutation.me], mine: true } : r,
      ),
    }
  })
}

export function Pinboard({
  slug,
  posts,
  me,
  myAvatar,
  canPost,
  canReact,
  news = [],
}: {
  slug: string
  posts: BoardPostView[]
  /** The viewer's own handle, for the optimistic layer and the tooltips. */
  me: string
  /** The viewer's animal, so the composer is drawn on the wire like a notice. */
  myAvatar: string
  canPost: boolean
  canReact: boolean
  /**
   * What the platform has to say, newest first.
   *
   * Rendered twice - once as the banner above, once as the tab beside - from
   * one list, because they are the same rows and the difference between them
   * is only whether this browser has waved the top one away.
   */
  news?: NewsItem[]
}) {
  const refusal = useRefusal()
  const t = workspaceDict(useLocale()).board
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'board' | 'news'>('board')
  const [, startTransition] = useTransition()
  const [optimisticPosts, toggle] = useOptimistic<BoardPostView[], Mutation>(
    posts,
    applyToggle,
  )

  function react(postId: string, emote: EmoteId) {
    if (!canReact) return
    setError(null)
    startTransition(async () => {
      toggle({ postId, emote, me })
      const result = await toggleReaction(slug, postId, emote)
      if (!result.ok) setError(refusal(result.error))
    })
  }

  function run(action: () => Promise<ActionResult<unknown>>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(refusal(result.error))
    })
  }

  return (
    <section className="flex flex-col gap-5">
      <NewsBanner news={news} />

      {/*
        Two tabs rather than two pages.
        The board is what people come for and it stays the landing tab; news is
        a place to go back to, not a thing to be interrupted by - the banner
        above already did the interrupting, once, and this is where it goes
        when it is waved away.
      */}
      <header className="flex items-center gap-1 border-b border-line/50">
        <Tab active={tab === 'board'} onClick={() => setTab('board')}>
          {t.heading}
        </Tab>
        <Tab active={tab === 'news'} onClick={() => setTab('news')}>
          {t.newsTab}
          {news.length > 0 && (
            <span className="ml-1.5 text-[0.65rem] tabular-nums text-ink-muted">
              {news.length}
            </span>
          )}
        </Tab>
      </header>

      {tab === 'news' ? (
        <NewsList news={news} />
      ) : (
        <>
          {canPost && (
            <Composer slug={slug} avatar={myAvatar} onError={setError} />
          )}

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          {optimisticPosts.length === 0 ? (
            <EmptyBoard canPost={canPost} />
          ) : (
            <ul className="wire">
              {optimisticPosts.map((post) => (
                <Notice
                  key={post.id}
                  slug={slug}
                  post={post}
                  canPost={canPost}
                  canReact={canReact}
                  onReact={(emote) => react(post.id, emote)}
                  onPin={() => run(() => pinPost(slug, post.id, !post.pinned))}
                  onDelete={() => run(() => deletePost(slug, post.id))}
                  onEdit={(body) => run(() => editPost(slug, post.id, body))}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      // The underline sits on the tab rather than under the row, so the border
      // the header already draws is the track it runs in - one line, not two.
      className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-medium tracking-[0.18em] uppercase transition ${
        active
          ? 'border-accent text-ink'
          : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A board with nothing on it.
 *
 * For a reader, a plate on the wire with the invitation beside it, rather than
 * a dashed rectangle in the middle of the page. The difference is what the two
 * say: a dashed box says something is missing, and an empty first plate says
 * this is where the first one goes - which is also exactly what the board will
 * look like once there is one notice on it.
 *
 * For somebody who can post, no plate at all. The composer directly above is
 * already standing on the wire with their own animal on it, and a second empty
 * plate under it would draw two beginnings for one board.
 */
function EmptyBoard({ canPost }: { canPost: boolean }) {
  const t = workspaceDict(useLocale()).board

  if (canPost) {
    return (
      <p className="pl-[3.9rem] text-sm text-ink-muted max-[480px]:pl-[3.05rem]">
        {t.emptyCanPost}
      </p>
    )
  }

  return (
    <div className="wire-first">
      <span aria-hidden className="wire-first-plate">
        <span className="size-1.5 rounded-full bg-current" />
      </span>
      <p className="text-sm text-ink-muted">{t.empty}</p>
    </div>
  )
}

/**
 * The composer: words, and nothing else.
 *
 * It used to carry a picker listing every scene the space had ever saved, and
 * that was the wrong end of the act. You attach a scene while you are looking
 * at it - in the studio, having just made it - not by writing a notice first
 * and then recognising a name in a row of thumbnails. Pinning moved into the
 * studios' save panels, which are also the only surfaces that know which scene
 * or picture "this one" means.
 *
 * Drawn on the wire, on the writer's own animal, so the thing being written
 * lines up with the things already written. A composer in a box above the
 * board would be a different object that happens to produce notices; this one
 * is a notice being written.
 */
function Composer({
  slug,
  avatar,
  onError,
}: {
  slug: string
  avatar: string
  onError: (message: string | null) => void
}) {
  const refusal = useRefusal()
  const t = workspaceDict(useLocale()).board
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="wire-first">
      <span className="wire-plate">
        <Image
          src={avatarShotUrl(avatar || DEFAULT_AVATAR)}
          alt=""
          fill
          sizes="44px"
          className="object-contain"
        />
      </span>

      <form
        ref={formRef}
        action={(formData) => {
          const body = String(formData.get('body') ?? '').trim()
          if (!body) return
          const pinned = formData.get('pinned') === 'on'

          // Cleared before the round trip: the composer is the one place where
          // waiting is most visible, and a rejected notice puts its text back in
          // the error rather than in the box.
          formRef.current?.reset()
          onError(null)
          startTransition(async () => {
            const result = await publishPost(slug, body, pinned)
            if (!result.ok) onError(`${refusal(result.error)} — "${body.slice(0, 60)}"`)
          })
        }}
        className="rounded-2xl border border-line/50 bg-surface-raised/25 p-3 transition focus-within:border-accent/50"
      >
        <textarea
          name="body"
          rows={2}
          maxLength={2000}
          placeholder={t.compose}
          className="w-full resize-y bg-transparent p-1 text-sm leading-relaxed outline-none placeholder:text-ink-muted/70"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" name="pinned" className="accent-current" />
            {t.keepAtTop}
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:brightness-110 disabled:opacity-60"
          >
            {isPending ? t.posting : t.post}
          </button>
        </div>
      </form>
    </div>
  )
}

function Notice({
  slug,
  post,
  canPost,
  canReact,
  onReact,
  onPin,
  onDelete,
  onEdit,
}: {
  slug: string
  post: BoardPostView
  canPost: boolean
  canReact: boolean
  onReact: (emote: EmoteId) => void
  onPin: () => void
  onDelete: () => void
  onEdit: (body: string) => void
}) {
  const t = workspaceDict(useLocale()).board
  const [editing, setEditing] = useState(false)
  const author = post.author?.name ?? t.someone

  return (
    <li className="wire-note" data-pinned={post.pinned || undefined}>
      {/* The plate is the author, so it carries their name for a screen reader
          rather than being decoration beside a name they already read. */}
      <span className="wire-plate">
        <Image
          src={avatarShotUrl(post.author?.avatar ?? DEFAULT_AVATAR)}
          alt=""
          fill
          sizes="44px"
          className="object-contain"
        />
      </span>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="wire-by">{author}</p>
          <p className="wire-meta">
            {post.pinned && <span className="wire-pinned">{t.pinned}</span>}
            <PostedAt at={post.createdAt} />
            {post.edited && <span>{t.edited}</span>}
          </p>
        </div>

        {/*
          Two authorities, two sets of buttons.
          An admin runs the board; anybody who pinned something from a studio
          can still take their own notice back down. Pinning to the top is not
          in the second set - what leads the board is the space's call, not the
          poster's - which is why it is checked separately here and again in
          the action.
        */}
        {(canPost || post.mine) && (
          <div className="wire-tools">
            {canPost && (
              <button type="button" onClick={onPin} className="transition hover:text-ink">
                {post.pinned ? t.unpin : t.pin}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing((was) => !was)}
              className="transition hover:text-ink"
            >
              {editing ? t.cancel : t.edit}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="transition hover:text-red-500"
            >
              {t.remove}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <form
          action={(formData) => {
            const body = String(formData.get('body') ?? '').trim()
            setEditing(false)
            if (body && body !== post.body) onEdit(body)
          }}
          className="mt-2 flex flex-col gap-2"
        >
          <textarea
            name="body"
            rows={3}
            maxLength={2000}
            defaultValue={post.body}
            className="w-full max-w-[62ch] resize-y rounded-xl border border-line/60 bg-transparent p-3 text-sm leading-relaxed outline-none transition focus-visible:border-accent"
          />
          <button
            type="submit"
            className="self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:brightness-110"
          >
            {t.save}
          </button>
        </form>
      ) : (
        // Nothing at all when there are no words: a notice posted from a studio
        // is allowed to be just the thing it is showing, and an empty paragraph
        // would leave a band of dead space above the card it came for.
        post.body.length > 0 && <p className="wire-body">{post.body}</p>
      )}

      {/* Under the words, because the notice is what somebody wrote and this is
          what they are showing you. A card that led with the picture would bury
          the sentence explaining it. */}
      {post.scene && <SceneCard slug={slug} scene={post.scene} />}
      {post.image && <PictureCard src={post.image} by={author} />}

      <ReactionStrip post={post} canReact={canReact} onReact={onReact} />
    </li>
  )
}

function ReactionStrip({
  post,
  canReact,
  onReact,
}: {
  post: BoardPostView
  canReact: boolean
  onReact: (emote: EmoteId) => void
}) {
  const t = workspaceDict(useLocale()).board
  const [picking, setPicking] = useState(false)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {post.reactions.map((reaction) => (
        <button
          key={reaction.emote}
          type="button"
          disabled={!canReact}
          onClick={() => onReact(reaction.emote)}
          aria-pressed={reaction.mine}
          // Who is on this face, as handles. The list is already resolved
          // server-side so this is never a row of UUIDs.
          title={reaction.by.join(', ')}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors disabled:cursor-default ${
            reaction.mine
              ? 'border-accent text-accent'
              : 'border-line text-ink-muted hover:text-ink'
          }`}
        >
          <span
            aria-hidden
            className="block"
            style={{ ...emoteTileStyle(reaction.emote, CHIP_TILE), imageRendering: 'pixelated' }}
          />
          {reaction.by.length}
        </button>
      ))}

      {canReact && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPicking((was) => !was)}
            aria-expanded={picking}
            aria-label={t.addEmote}
            className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted transition-colors hover:border-accent/60 hover:text-ink"
          >
            +
          </button>

          {picking && (
            <>
              {/* A plain click-catcher, which the HUD picker cannot use because
                  the thing behind it is a 3D scene that wants its own pointer
                  events. Behind a dashboard there is nothing to protect. */}
              <button
                type="button"
                aria-label={t.closeEmotes}
                onClick={() => setPicking(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute bottom-full left-0 z-20 mb-2 max-h-[46vh] w-[min(92vw,29rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface-raised p-2 shadow-2xl backdrop-blur">
                <EmoteGrid
                  onPick={(id) => {
                    setPicking(false)
                    onReact(id)
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The timestamp, rendered by the client.
 *
 * `toLocaleString` on the server would format in the server's locale and time
 * zone and then mismatch on hydration. `suppressHydrationWarning` is the
 * sanctioned way to say "this text is expected to differ" rather than a way to
 * hide a real mismatch.
 *
 * Named parts rather than the bare default, which on an English locale is
 * "8/8/2026, 5:12:10 PM" - a four-digit year on something written this week and
 * seconds nobody has ever needed on a noticeboard. The full instant is still in
 * `dateTime` for anything reading the markup, and in the title on hover.
 */
const STAMP: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

function PostedAt({ at }: { at: string }) {
  const when = new Date(at)
  return (
    <time dateTime={at} title={when.toLocaleString()} suppressHydrationWarning>
      {when.toLocaleString(undefined, STAMP)}
    </time>
  )
}
