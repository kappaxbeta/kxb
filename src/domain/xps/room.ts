import type { HostCapability } from '@kxb/xp/host'

/**
 * What a room in a space can offer a level we ship.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 * ---------------------------------------------------------------------------
 * Reported as *"I can't play Steal a Plant"*, on a room that had been opened
 * for it, and the answer is not about that room. `steal-a-plant` declares
 * `backend.needs: [identity, persistence]`; a builtin is a file with a slug
 * rather than a row with an id; `xpStore` answers null for anything that is not
 * a saved project, because `xp_store.xp_id` is a foreign key into
 * `xps_read_model` and a file has nothing to key against. So **no screen in this
 * app can supply persistence to a builtin**, and that level was refused at the
 * door everywhere, every time, by construction.
 *
 * It said so only after somebody opened it. This is the same fact, said on the
 * shelf: a level whose needs are not in this list is one to remix before you
 * can play it, and remixing is what gives it the row it has been asking for.
 *
 * ---------------------------------------------------------------------------
 * The same three the runtime composes, and deliberately not a fourth
 * ---------------------------------------------------------------------------
 * `scene.tsx` builds its `offered` from what it has in hand - `me` is identity,
 * `room` is the channel and the arbiter both - and this is that list written
 * down. It is not a guess about what a room *could* have: `chat` is missing
 * here because it is missing there, and a shelf that promised it would be
 * disagreeing with the door people walk through a second later.
 *
 * ---------------------------------------------------------------------------
 * Its own module, because a client component reads it
 * ---------------------------------------------------------------------------
 * This started in `./playable`, beside `listBuiltinXps`, which is where it
 * belongs by subject and is exactly the wrong place by build graph: that module
 * is `server-only` and reads the filesystem, so a `'use client'` shelf importing
 * this **constant** out of it dragged `node:fs/promises` into the browser bundle
 * and failed the production build.
 *
 * Worth knowing because nothing caught it locally: `tsc` erases a `type` import
 * and keeps a value one, so a file that typechecks clean can still poison a
 * client graph. A shared constant between a server module and a client one
 * needs a home with no server dependencies, and this is it.
 */
export const OFFERED_IN_A_ROOM: readonly HostCapability[] = ['identity', 'network', 'arbiter']
