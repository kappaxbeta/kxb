'use client'

import {
  memoryHost,
  type XpChat,
  type XpHost,
  type XpIdentity,
  type XpLine,
  type XpNetwork,
  type XpPersistence,
  type XpPlayer,
  type XpSocket,
} from '@kxb/xp/host'

/**
 * A host made of two browser tabs.
 *
 * The second real implementation of `XpHost`, and the one that makes `Try out`
 * work: open the same XP twice and the two tabs are two players. No server, no
 * account, no network - a `BroadcastChannel`, which browsers give you for free
 * and which reaches every tab on the same origin.
 *
 * ---------------------------------------------------------------------------
 * Why this lives in the app and not in the package
 * ---------------------------------------------------------------------------
 * `BroadcastChannel`, `localStorage` and `crypto` are browser globals, and
 * `packages/xp` is forbidden from touching any of them - by lint, deliberately,
 * because an engine that reaches for a global is an engine that only runs where
 * that global exists. The package declares what it needs; hosts supply it. This
 * is a host.
 *
 * ---------------------------------------------------------------------------
 * What it is honest about
 * ---------------------------------------------------------------------------
 * A `BroadcastChannel` is same-origin and same-machine. Two tabs, yes; two
 * laptops, no. That is exactly the right scope for trying a level out, and it
 * is the reason this is not "the offline mode" - it is the *local* mode, and
 * the difference matters the first time somebody expects their friend to see
 * it.
 *
 * It is also lossless and ordered, which a real transport is not. A rule that
 * only works because a message arrived instantly will pass here and fail on a
 * network - so this proves the rules and two browsers on two machines prove the
 * netcode.
 */

/** One channel per instance, so two XPs open at once do not hear each other. */
const topicName = (topic: string) => `xp:${topic}`

/**
 * Who you are, remembered between reloads.
 *
 * A name and an id in `localStorage`. The id has to survive a refresh or a
 * reload reads as somebody new joining and the old you never leaving - which on
 * a scoreboard is a ghost with your coins.
 */
const IDENTITY_KEY = 'xp:identity'

function readIdentity(): XpPlayer {
  try {
    const stored = window.localStorage.getItem(IDENTITY_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as XpPlayer
      if (typeof parsed?.id === 'string' && typeof parsed?.name === 'string') return parsed
    }
  } catch {
    // A private window, a quota, a half-written value. None of them are worth
    // failing over: a fresh identity is a working session with a new name.
  }

  const player: XpPlayer = {
    id: crypto.randomUUID(),
    // Something a person can tell apart on a scoreboard, without asking them to
    // type anything before they can play.
    name: `Player ${Math.floor(Math.random() * 900 + 100)}`,
  }
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(player))
  } catch {
    // Nothing to do. The session still works; it just will not be the same
    // person after a reload.
  }
  return player
}

/** What one tab shouts to the others. */
interface Wire {
  type: string
  from: string
  payload: unknown
  /** Present on the two roster messages, so a joiner learns who is already here. */
  player?: XpPlayer
}

const HELLO = '__hello'
const HERE = '__here'
const BYE = '__bye'

function localNetwork(self: XpPlayer): XpNetwork {
  return {
    /**
     * The same eight the lounge settled on, even though a `BroadcastChannel`
     * could carry far more.
     *
     * Deliberate: a rule tuned against a transport that is faster than the real
     * one is a rule that breaks when it meets the real one. Trying a level out
     * should feel like playing it.
     */
    sendHz: 8,
    maxPlayers: 8,

    async join(topic: string): Promise<XpSocket> {
      const channel = new BroadcastChannel(topicName(topic))
      const handlers = new Map<string, Set<(payload: unknown, from: string) => void>>()
      const rosterListeners = new Set<(peers: XpPlayer[]) => void>()
      const others = new Map<string, XpPlayer>()

      const announce = () => {
        const peers = [...others.values()]
        for (const listener of rosterListeners) listener(peers)
      }

      channel.onmessage = (event: MessageEvent<Wire>) => {
        const message = event.data
        if (!message || typeof message.type !== 'string') return
        if (message.from === self.id) return

        switch (message.type) {
          case HELLO:
            // Somebody arrived. Tell them we are here, so a joiner learns the
            // roster without a server to ask - otherwise the second tab sees
            // the first and the first never sees the second.
            if (message.player) others.set(message.from, message.player)
            channel.postMessage({ type: HERE, from: self.id, payload: null, player: self } as Wire)
            announce()
            return
          case HERE:
            if (message.player) others.set(message.from, message.player)
            announce()
            return
          case BYE:
            others.delete(message.from)
            announce()
            return
          default: {
            for (const handler of handlers.get(message.type) ?? []) {
              handler(message.payload, message.from)
            }
          }
        }
      }

      channel.postMessage({ type: HELLO, from: self.id, payload: null, player: self } as Wire)

      /**
       * Say goodbye when the tab goes.
       *
       * `pagehide` rather than `beforeunload`: the latter does not fire
       * reliably on mobile or when a tab is discarded, and a player who never
       * said goodbye is a name that stays on the scoreboard forever.
       */
      const farewell = () => channel.postMessage({ type: BYE, from: self.id, payload: null } as Wire)
      window.addEventListener('pagehide', farewell)

      return {
        send(type, payload) {
          channel.postMessage({ type, from: self.id, payload } as Wire)
        },
        on(type, handler) {
          const set = handlers.get(type) ?? new Set()
          set.add(handler)
          handlers.set(type, set)
          return () => set.delete(handler)
        },
        peers: () => [...others.values()],
        onPeers(handler) {
          rosterListeners.add(handler)
          return () => rosterListeners.delete(handler)
        },
        leave() {
          farewell()
          window.removeEventListener('pagehide', farewell)
          channel.close()
          handlers.clear()
          rosterListeners.clear()
        },
      }
    },
  }
}

/**
 * Storage that survives a reload but not a different machine.
 *
 * `localStorage` rather than IndexedDB: what goes in here is a best time and a
 * handful of scores, and IndexedDB's asynchronous, versioned, upgrade-event
 * shape is a great deal of ceremony for a number. It moves the day something
 * stores anything large.
 */
/**
 * Talking, between two tabs, kept nowhere.
 *
 * docs/xp/backlog.md §7b names this case exactly: *trying a level out should
 * cost nothing and tell nobody*. A chat here that reached the space's own
 * conversation would mean a level test posting in the space, which is the one
 * outcome that would make people stop pressing Try out.
 *
 * So: its own `BroadcastChannel`, no history, and no `recent` — that method
 * being absent is how a panel can tell *"this host keeps none"* from *"nobody
 * has spoken"*, which is a distinction the empty list cannot carry.
 *
 * A channel of its own rather than the network's topic, because chat is not
 * scoped to a room here: two tabs trying the same level are two people in the
 * same conversation whether or not either has joined a topic yet, and a
 * `Try out` with no room is the common case.
 */
function localChat(self: XpPlayer, started: number): XpChat {
  const channel = new BroadcastChannel(`${topicName('chat')}`)
  const listeners = new Set<(line: XpLine) => void>()

  channel.onmessage = (event: MessageEvent<XpLine>) => {
    const line = event.data
    // Shape-checked because a `BroadcastChannel` is same-origin and anything on
    // this origin can post to it - the same treatment the network's messages
    // get a few lines above.
    if (typeof line?.by !== 'string' || typeof line?.text !== 'string') return
    for (const listener of listeners) listener(line)
  }

  return {
    async say(text: string) {
      const line: XpLine = { by: self.id, text, at: (performance.now() - started) / 1000 }
      channel.postMessage(line)
      // Heard by this tab too. `BroadcastChannel` deliberately does not echo to
      // the sender, and a chat where you cannot see your own message is one
      // people type into twice.
      for (const listener of listeners) listener(line)
    },
    on(handler) {
      listeners.add(handler)
      return () => void listeners.delete(handler)
    },
  }
}

function localPersistence(): XpPersistence {
  const key = (name: string) => `xp:store:${name}`

  return {
    async get(name) {
      try {
        const raw = window.localStorage.getItem(key(name))
        return raw === null ? undefined : JSON.parse(raw)
      } catch {
        return undefined
      }
    },
    async put(name, value) {
      try {
        window.localStorage.setItem(key(name), JSON.stringify(value))
      } catch {
        // Out of quota or a private window. Losing a local best is not worth
        // taking the match down for.
      }
    },
    async append(stream, type, data) {
      try {
        const raw = window.localStorage.getItem(key(stream))
        const existing = raw === null ? [] : (JSON.parse(raw) as unknown[])
        existing.push({ type, data })
        window.localStorage.setItem(key(stream), JSON.stringify(existing))
      } catch {
        // Same.
      }
    },
  }
}

/**
 * The host for a browser with nothing behind it.
 *
 * Falls back to the memory host when there is no `window` - a server render, a
 * test, a script - so a caller does not have to guess where it is running.
 */
export function localHost(): XpHost {
  if (typeof window === 'undefined') {
    return memoryHost({ player: { id: 'local', name: 'Local' } })
  }

  const self = readIdentity()

  const identity: XpIdentity = {
    current: async () => self,
    guest: async (name) => {
      const player = { ...self, name }
      try {
        window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(player))
      } catch {
        // See above.
      }
      return player
    },
  }

  const started = performance.now()

  return {
    identity,
    network: localNetwork(self),
    persistence: localPersistence(),
    chat: localChat(self, started),
    /**
     * Seconds since this tab loaded, from `performance.now()` rather than
     * `Date.now()`.
     *
     * Monotonic by specification: it does not move when the system clock is
     * corrected, which `Date.now()` does. A match timer that jumps because NTP
     * adjusted is a match timer nobody trusts again.
     */
    now: () => (performance.now() - started) / 1000,
  }
}
