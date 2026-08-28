'use client'

import { HomesteadWorld } from '@/app/xp/_runtime/games/homestead'

/**
 * Peepz My Dream Restaurant - the café, and the door it starts you at.
 *
 * ---------------------------------------------------------------------------
 * Why this game is not a package, when boxing and Mau-Mau are
 * ---------------------------------------------------------------------------
 * `@kxb/boxing` and `@kxb/maumau` are packages because they are self-contained:
 * their rules, their wire format and their art are theirs, they depend on
 * `@kxb/xp` and on nothing of ours, and either would run on somebody else's
 * host tomorrow.
 *
 * The café is the opposite kind of game and the difference is not one of
 * effort. It is **a room of a space**: its money is an aggregate in this app's
 * event log, its customers are served by this app's server actions, the people
 * standing in it are on this space's presence channel, and the body you walk
 * around in is the peep from your profile. A package that depended only on
 * `@kxb/xp` would have to reimplement every one of those, and what came out
 * would be a different game that happened to look like this one.
 *
 * So what a cartridge buys here is not portability - it is the *shelf*. The
 * café is now a thing you can keep in your space's XP list, put in a room and
 * walk into, exactly like a level somebody built. See `public/xp/xps/dream-restaurant.xp.json`.
 *
 * ---------------------------------------------------------------------------
 * It takes no props at all, and that is the honest shape
 * ---------------------------------------------------------------------------
 * `FrameProps` is the same six fields for every game and this game reads none
 * of them. A component that took them and ignored them would read as one that
 * forgot; a signature with nothing in it is a question already answered, and it
 * is still a `ComponentType<FrameProps>` as far as the registry is concerned.
 * What it declines, and why:
 *
 * - `host` and `topic` go unused. The café's multiplayer is *who is standing in
 *   my café*, which is a fact about whose café it is rather than about which
 *   room the cartridge was opened in - so it runs on the same `useRoom` channel
 *   the world route used, and two people who open this cartridge each open
 *   their own café with their own roster. Joining the frame's topic instead
 *   would put them in a room together and still show them different kitchens.
 * - `assets` goes unused. This game's art is the model packs already served
 *   from `public/tinyXO` and `public/xo/restaunt` and named by `propUrl`; there
 *   is no `public/cafe/` for the convention to point at, because nothing was
 *   built for this game alone.
 * - `started` and `match` go unused. There is no lobby and no clock: a café is
 *   open until you leave it. The document declares no `match` capability, so
 *   nothing can schedule one - see the battle refusal in `createBattle`.
 *
 * ---------------------------------------------------------------------------
 * Four lines, because the world behind it is shared
 * ---------------------------------------------------------------------------
 * The café and the house are two cartridges standing on one plot of land - walk
 * out of the café's door and you are in the garden, and the garden's other gate
 * is the house. `HomesteadWorld` is that world, and all this file decides is
 * which of its doors you come in by. The reasoning is there rather than
 * duplicated here.
 */
export function DreamRestaurantFrame() {
  return <HomesteadWorld start="cafe" />
}
