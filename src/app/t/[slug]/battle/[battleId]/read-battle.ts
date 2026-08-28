'use client'

import type { BattleView } from '@/domain/battle/queries'

/**
 * The match as it stands, asked for from a room that is standing in it.
 *
 * The same call the rooms have always made, one layer down: it was a Server
 * Action and is a `fetch` of `GET /api/t/[slug]/battle/[battleId]` now. The
 * route handler carries the reason - the short version is that a polled Server
 * Action re-renders the page it is polled from, which for these two files is a
 * live WebGL scene being rebuilt every five seconds mid-match.
 *
 * Null for anything that did not work, which is what the action already did for
 * a battle that is not there. Both rooms read it as "keep what you have": a
 * poll that fails on a bad five seconds must not blank a scoreboard, and it
 * must not reach an error boundary either - that would replace the match with
 * the reconnecting card while the match is still going on.
 */
export async function readBattle(
  slug: string,
  battleId: string,
): Promise<BattleView | null> {
  try {
    const response = await fetch(
      `/api/t/${encodeURIComponent(slug)}/battle/${encodeURIComponent(battleId)}`,
    )
    if (!response.ok) return null
    return (await response.json()) as BattleView | null
  } catch {
    return null
  }
}
