'use client'

import { useSyncExternalStore } from 'react'
import type { ChatLine } from '@/app/t/[slug]/chat-panel'

/**
 * The rail's chat, reachable from the emote picker.
 *
 * The mirror image of `door-store`: there, the scene publishes something the
 * rail draws; here, the rail publishes something the scene draws from. The
 * conversation itself lives in `<ChatDock>`, mounted once in the sidebar so it
 * outlives any one scene - but the emote picker is a HUD element floating over
 * the canvas, several components away, and is the fastest way to say something
 * on a phone where opening the drawer is two taps instead of one. Threading the
 * channel itself down to the picker would mean a second subscriber to the
 * chat topic, which `said-store` already explains cannot happen. So the dock
 * publishes its `say` function and whether it may be used; the picker calls it
 * and never touches the channel.
 */

export interface ChatStatus {
  /** Null when the viewer may post. A sentence explaining why not, otherwise. */
  blockedReason: string | null
}

export interface ChatActions {
  say: (body: string) => void
}

/**
 * The conversation itself, for whoever is drawing it.
 *
 * Added when the panel moved to the right-hand rail. The dock has to stay a
 * single mounted component - one Realtime subscriber, per `said-store` - but
 * the rail it draws in is now two rails: the right one from `xl` up, and the
 * left drawer below that, because there is no right rail on a phone. Rendering
 * `<ChatDock>` in both would be two subscribers and is exactly what is not
 * allowed.
 *
 * So the dock stopped drawing anything. It owns the channel, the list and the
 * sending, and publishes all three here; `<ChatRail>` is a reader and there may
 * be as many of those as there are places to put one. The same shape `People`
 * already uses to appear in both rails, for the same reason.
 */
export interface ChatFeed {
  slug: string
  /** Whose messages are "yours", for the panel's own styling. */
  selfId: string
  lines: ChatLine[]
  blockedReason: string | null
  /**
   * The rooms with a conversation in them, and which one is on screen.
   *
   * The lounge is not in this list - it is the null option, and the rail draws
   * it first as its own row. Modelling it as a room here would mean either a
   * fake id or a special case in every consumer.
   */
  rooms: { roomId: string; name: string }[]
  /** Null is the lounge. */
  roomId: string | null
  /** A room's scrollback is on its way; the panel is deliberately empty. */
  loading: boolean
  /** Switch conversation without moving. See `goToRoom` in the dock. */
  onRoom: (roomId: string | null) => void
  /**
   * Stop hearing somebody, from one of their lines.
   *
   * Published beside `onRoom` because it belongs to the same owner: the dock
   * holds the list, so the dock is the only thing that can take somebody out of
   * it. A panel that wrote the row itself would leave its own copy of the
   * conversation still showing them.
   */
  onBlock: (userId: string) => void
}

let actions: ChatActions | null = null
let current: ChatStatus | null = null
let feed: ChatFeed | null = null

/**
 * Two sets, not one, and the split is deliberate.
 *
 * A status subscriber is the emote picker floating over a 3D canvas, and it
 * cares about one thing: whether there is a chat to fire text into. A feed
 * subscriber is a panel drawing the messages. Waking the first group every time
 * somebody types would re-render a HUD over a running scene for a change it
 * cannot see.
 */
const listeners = new Set<() => void>()
const feedListeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

function announceFeed() {
  for (const listener of feedListeners) listener()
}

/**
 * Report the dock mounted somewhere on the page.
 *
 * Called every render, the same as `publishDoor` - the equality check below is
 * what keeps a quiet chat from re-rendering every picker on the page sixty
 * times a second.
 */
export function publishChat(status: ChatStatus, next: ChatActions): void {
  actions = next

  if (current && current.blockedReason === status.blockedReason) return
  current = status
  announce()
}

/**
 * Report the conversation as it currently stands.
 *
 * Called whenever a line arrives or changes, so unlike `publishChat` there is
 * no equality check to skip the announce - a new list is the whole event.
 * `<ChatDock>` already replaces the array rather than mutating it, which is
 * what lets `useSyncExternalStore` compare by identity and do the right thing.
 */
export function publishChatFeed(next: ChatFeed): void {
  feed = next
  announceFeed()
}

/** Stop reporting, on unmount. There is exactly one dock, so no slug to guard on. */
export function clearChat(): void {
  if (!current && !actions && !feed) return
  current = null
  actions = null
  feed = null
  announce()
  announceFeed()
}

export function chatActions(): ChatActions | null {
  return actions
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function subscribeFeed(listener: () => void): () => void {
  feedListeners.add(listener)
  return () => {
    feedListeners.delete(listener)
  }
}

function chatNow(): ChatStatus | null {
  return current
}

function feedNow(): ChatFeed | null {
  return feed
}

function serverSnapshot(): null {
  return null
}

/** Whether there is a chat to fire text into right now, and why not if not. */
export function useChatStatus(): ChatStatus | null {
  return useSyncExternalStore(subscribe, chatNow, serverSnapshot)
}

/**
 * The conversation, for a panel that wants to draw it.
 *
 * Null on the server and on the first client render - the dock publishes in an
 * effect, so there is one frame where a reader knows nothing. `<ChatRail>`
 * renders nothing for it rather than an empty chat, which is the honest
 * difference between "no messages" and "not asked yet".
 */
export function useChatFeed(): ChatFeed | null {
  return useSyncExternalStore(subscribeFeed, feedNow, serverSnapshot)
}
