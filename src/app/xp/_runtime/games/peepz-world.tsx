'use client'

import { HomesteadWorld } from '@/app/xp/_runtime/games/homestead'

/**
 * Peepz World - the house, the garden, and the way to the café.
 *
 * ---------------------------------------------------------------------------
 * The garden is a view of this game, not a game of its own
 * ---------------------------------------------------------------------------
 * On the old world routes the house and the garden were two pages, each with
 * its own URL, and stepping out of the front door was a navigation. That was
 * always a fiction the router imposed rather than a fact about the world - it
 * is one plot of land, one purse, one plan drawn by the same code with hedges
 * instead of walls, and `HomeGame` has taken a `place` prop since long before
 * any of this.
 *
 * A cartridge has no address bar to spend that fiction on, so the doorway is a
 * doorway: it swaps which part of the world is being drawn and nothing leaves
 * the canvas. The gap in the hedge at the bottom of the garden is the same -
 * the café is a *different cartridge* and the same *world*, so walking down the
 * garden puts you behind the counter without a mount, a socket or a session
 * changing. See `HomesteadWorld`, which is where all of that lives.
 *
 * ---------------------------------------------------------------------------
 * The same purse as the café, and not by arrangement here
 * ---------------------------------------------------------------------------
 * Both cartridges open through `useHomesteadPlace`, which opens the member's
 * `homestead` stream - one purse for the café, the house and the garden, per
 * member per space. Earning happens in one room and spending happens in
 * another, which is the pair working as designed rather than two games sharing
 * a number.
 *
 * It takes no props for the same reason `./dream-restaurant.tsx` takes none, and that file
 * has the list: a game whose multiplayer is the space's own presence channel
 * joins no topic, and a game that is open until you leave has no lobby.
 */
export function PeepzWorldFrame() {
  return <HomesteadWorld start="home" />
}
