'use client'

import { useParty } from '@/app/world/_stores/party-store'

/**
 * The hairline across the top of a workspace, which knows about the party.
 *
 * The rail was already there and already the app's neon - it is the same edge
 * the summon wizard is trimmed with. All this adds is that it comes alive when
 * somebody turns the lights on downstairs: the gradient sweeps and cycles
 * through the wheel instead of sitting still.
 *
 * Worth doing because the party otherwise only exists inside the canvas. A
 * member reading a page or working through the task list has no idea the room
 * has turned pink, and the whole point of a party is that it is happening in
 * the space rather than in a scene - one line of moving colour at the top of
 * every page is how the rest of the app gets told.
 *
 * A client component of its own so the layout above it can stay a server
 * component: the layout renders one element instead of subscribing to a store,
 * and nothing else about it changes.
 */
export function PartyRail() {
  const { on } = useParty()

  return <div className={`summon-rail2 h-0.5 w-full ${on ? 'party-rail' : ''}`} />
}
