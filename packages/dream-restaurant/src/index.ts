/**
 * Peepz My Dream Restaurant: the lunch service, and the shop that pays for it.
 *
 * ---------------------------------------------------------------------------
 * Rules, and no renderer
 * ---------------------------------------------------------------------------
 * Customers, patience, a clock, a menu, and a barista who can run the whole
 * thing on her own - all of it as plain functions over a state. Nothing here
 * imports React, three.js, Supabase or this app, which is what lets a lunch
 * rush be simulated in a test in a millisecond instead of in a canvas in real
 * time. `./rules/barista` is the proof: an autonomous cook, tested by running
 * her for a hundred simulated seconds.
 *
 * ---------------------------------------------------------------------------
 * Why this is a second package and not a folder of Peepz World
 * ---------------------------------------------------------------------------
 * Because they are two games. They share a plot of land and a purse - one
 * `homestead` stream, so an afternoon behind the counter is a sofa - and they
 * share nothing else: this one has customers, a menu and an end to the day, and
 * the other has a floor plan and a catalogue. Folding them together would put a
 * recipe table next to a wallpaper table with nothing to say to each other.
 *
 * What it does borrow is the ground: `@kxb/peepz-world/grid` is two units a
 * square because both model packs are authored that way, and a second copy of
 * that number is a second copy that can drift.
 */

export * from './rules/catalog'
export * from './rules/grid'
export * from './rules/recipes'
export * from './rules/game'
export * from './rules/barista'
