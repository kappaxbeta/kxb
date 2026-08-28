'use client'

import { useState, useTransition } from 'react'
import { createGuestLink } from '@/domain/guests/actions'

/**
 * Create a guest link and copy it, in one click.
 *
 * The compressed form of the rail's panel, for places where the full thing does
 * not belong - chiefly inside a match, where the person wanting to pull a
 * friend in is mid-game and has no attention to spend on a settings page.
 *
 * One click rather than two is the entire point, and it is why the action hands
 * the URL back instead of the caller re-reading the list. It also means the
 * link is minted *and* on the clipboard before the button has finished
 * animating, so the next thing the owner does is paste.
 *
 * Always an open link. A single-use link is a considered choice and this is the
 * opposite of a considered moment; anybody who wants the stricter kind can make
 * one in the rail, where the checkbox lives.
 */
export function GuestInviteButton({
  slug,
  destination,
  className,
}: {
  slug: string
  /**
   * The room to drop them in, or omitted for the lounge.
   *
   * Worth passing wherever this button appears inside something in progress. It
   * is called from a match, and the whole meaning of pressing it there is "come
   * and play *this*" - a link that lands them in the lounge instead makes the
   * inviter explain over voice chat where to click next.
   */
  destination?: string
  /** Supplied by the caller so this sits inside whatever HUD it lands in. */
  className?: string
}) {
  const [pending, start] = useTransition()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [url, setUrl] = useState<string | null>(null)

  const invite = () => {
    setState('idle')
    start(async () => {
      const result = await createGuestLink(slug, {
        maxUses: null,
        destination: destination ?? null,
      })
      if (!result.ok) {
        setState('failed')
        return
      }

      try {
        await navigator.clipboard.writeText(result.url)
        setState('copied')
        setTimeout(() => setState('idle'), 2000)
      } catch {
        // The link exists and is perfectly good - only the clipboard refused,
        // which it does over plain http. Showing the URL is the difference
        // between a working link the owner can select, and a link that was
        // created and then silently lost.
        setUrl(result.url)
        setState('failed')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={invite}
        title="Create a guest link and copy it"
        className={className}
      >
        {state === 'copied' ? 'Link copied' : pending ? 'Making…' : 'Invite guest'}
      </button>

      {state === 'failed' && (
        <p role="alert" className="mt-1 break-all text-[10px] text-red-300">
          {url ?? 'Could not create a link.'}
        </p>
      )}
    </>
  )
}
