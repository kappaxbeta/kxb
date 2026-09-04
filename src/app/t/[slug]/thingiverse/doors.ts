/**
 * The six doors of the thingiverse, as a list.
 *
 * ---------------------------------------------------------------------------
 * Why this is not in `hub.tsx`, where the doors are drawn
 * ---------------------------------------------------------------------------
 * It was, and it threw at the first render: `hub.tsx` is `'use client'`, and a
 * server component importing a *value* out of a client module does not get the
 * value. It gets a client reference - a proxy the bundler hands the runtime so
 * it can name the component in the payload - so `DOORS.find` on the page was
 * `undefined is not a function` rather than a check on an array.
 *
 * The type was always fine, and that is the trap: `import type` is erased
 * before the bundler sees it, so `DoorId` crossed the boundary for months and
 * looked like proof the list could too.
 *
 * So the list lives in a plain module both sides may import, and the hub
 * re-exports the type for the files that already read it from there.
 */
export const DOORS = ['blueprints', 'sets', 'vehicles', 'clips', 'emotes', 'models'] as const

/**
 * A value as well as a type, because the page has to check a word out of the
 * address bar against them - see the `door` search param on the browse page.
 * A union alone can only be asserted at, which is how `?door=clpis` becomes an
 * empty section with a heading of `undefined`.
 */
export type DoorId = (typeof DOORS)[number]
