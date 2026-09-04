# Changelog

This repository is published in releases rather than commit by commit: the work
happens upstream and arrives here as a sync, so a list of ninety commit
subjects would describe a history this tree does not have. Each entry below is
one of those syncs, and says what actually changed *here*.

Dates are the day the sync landed. Versions follow the root `package.json`.

## 0.3.0 — 2026-09-04

The economy, and the things it pays for. Ninety-two upstream commits, four
hundred-odd files.

### The coin economy

There is now one kind of play money — a coin — and `src/domain/bank` is the
whole of it: a purse per person, an account per space, and the ledger between
them. It is event-sourced like everything else, so a balance is a fold rather
than a column, and every movement carries a reason (`reasons.ts`) that the
backoffice can read back.

- **A purse you keep when you leave.** The purse belongs to the person, not to
  the space, and survives leaving one.
- **Money reads both ways.** People pay spaces, and spaces pay people —
  match payouts, and an operator putting coins back by hand.
- **Prices climb.** `next.ts` and `prices.ts` price the *n*th of a thing rather
  than the thing, so the first few of anything are free and the plan's ceiling
  is a soft one you can spend past. Blueprints, clips and vehicles are metered
  this way.
- **Vouchers**, for somebody who arrives with nothing.
- `/ovaloffice/money` — who holds what, what moved, and the controls to correct
  it.

Off by default. It is behind a feature flag, because a product that starts
charging for what used to be free without anybody deciding so is a bug.
`docs/product/economy.md` is the long argument for the design; `docs/operations/economy.md`
is what an operator turns on and looks at.

### The thingiverse grows a physics

The blueprint editor was a way to build a static prop. It now builds things
that *do* something:

- **Parts and sockets.** A blueprint has a root model and optional parts, each
  hung on a named socket rather than an index, so re-ordering a list cannot
  silently rearrange a machine.
- **Machines** — states, a fight block and a craft block. One elected client
  drives every machine in a room, the same way one client owns the ball.
- **Things you hold.** Grips, weapons that fire or swing, and a push that
  throws you.
- **Driver-owned motion** — lifts and crushers, whose phase travels on the wire
  while the footprint follows by the cell.
- Four starter sets, so there is something to take apart on the first day.

### Accounts, safety and moderation

- **Closing an account** leaves a tombstone rather than a hole. The row is
  scrubbed, identities are unlinked and the account is banned; the events it
  wrote stay, because deleting them tears holes in everybody else's history.
- **Blocking somebody** is enforced in the chat policy — in the database, not
  only in the client that draws the list.
- **Content reports** land in one polymorphic table, and upholding a report
  hides the content rather than deleting it.

### Around the edges

- **Newsletter signup** with real consent — a double opt-in with tokens, an
  unsubscribe that works without signing in, and a backoffice section that
  shows the wording somebody actually agreed to.
- **A contest the backoffice runs.** Dates come out of
  `src/app/gewinnspiel/dates.ts` rather than being formatted per language in
  the template, and the whole thing switches off from
  `/ovaloffice/gewinnspiel`.
- **Promo codes** can hand over more than a month: bucks, bearer vouchers and
  coins, all granted inside the redemption's transaction.
- **Webcam capture into the animator** (`src/domain/mocap`) — MediaPipe pose
  landmarks retargeted onto the rig. It gives you angles, not travel: the feed
  cannot see where you walked. The runtime and models are vendored by
  `bun run mocap:vendor` and are not committed.
- **Store banners** are configuration plus a template — 72 panels described in
  `src/domain/banners/panels.ts` and painted by `/ovaloffice/banners`. The PNGs
  are generated, not committed.
- **A p5.js sketch cartridge** for XP (`packages/xp/src/sketch`) — a third kind
  of document, whose source lives in the document and runs in an opaque-origin
  iframe.
- **Link previews** — `src/app/og` is the shared card art, drawn by the three
  `opengraph-image` routes (the front page, its German copy, and a guest door).

### Housekeeping

- The phone apps left, upstream. They were never in this tree, but
  `eslint.config.mjs` and `tsconfig.check.json` carried notes about the
  exclusions they had needed; those notes now say where the apps went instead
  of describing a shape neither config has any more.
- `tools/test-core.sh` excludes two more suites. Both want art this repository
  does not ship — one reads model files that are not here, and one reads the
  stand-in dummy rig and measures a pose the modelled legs would have struck.
  See `docs/assets.md`.
- `@mediapipe/tasks-vision` is a new dependency, for the capture page above.
- The three product pages at `/play`, `/create` and `/share` no longer mark a
  tab in the header. The nav they lit up is gone; they are still real pages and
  still wear the shell.

### Known gaps

Two features are in the upstream tree and deliberately not here, because they
are woven into a section this repository does not carry:

- **Shows and episodes** (`src/domain/channels`) and the project-shaped rewrite
  of `/t/[slug]/pages` that sits on top of it. The pages feature here is the
  one that was already here; it works, and it simply did not receive this
  rewrite.
- A handful of tables exist in `supabase/migrations` for both, and
  `src/lib/supabase/database.types.ts` names them. They are inert in a tree
  with no code behind them, and shipping them keeps the generated types honest
  about the schema a `db:reset` produces.

## 0.2.0 and earlier

Not written down at the time. `git log` is the record: the syncs are the
commits titled "sync from upstream `<sha>`", and each one names the upstream
commit it was cut from.
