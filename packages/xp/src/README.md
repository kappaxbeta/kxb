# `@kxb/xp`

An XP document, the engine that runs one, and the interfaces a host has to
satisfy to put it on a screen. No React, no three.js, no Supabase, no `window` —
`eslint.config.mjs` enforces all four, because the point of the package is that
one engine runs against this app's Supabase, against two tabs on a laptop, and
one day against a backend nobody here has seen.

## The rooms

Named for **what a thing is**, not for what the folder holds.

| | |
|---|---|
| **`document/`** | What an XP *is*, on disk and in an editor: the parser, the edit operations, repair for older files, the data a level declares, its rounds and rules, blueprints, templates, presets, words, and the clips and motions a body carries. |
| **`world/`** | The simulation. What falls, rolls, gets shoved and cannot walk through walls; where a straight line first meets something; what a swing lands on; where the world is watched from. |
| **`rules/`** | When a rule runs and what it may do — triggers, verbs, and the sandbox a level's own scripts run in. |
| **`net/`** | Everything that exists only because there is more than one client: where everybody else is, who integrates the things that move, the host interface, shared state with an owner, ids that sort, and random two clients agree about. |
| **`assets/`** | What a level draws from — the model catalogue, the packs, the sounds. |
| **`scenarios/`** | Whole levels and behaviours asserted end to end, rather than one module at a time. These have no source file of their own; they are the tests that would catch a change no unit test would. |

`index.ts` stays at the root because it is the package's own front door.

## The doors are in `package.json`

`exports` is the public API and **is now enforced**: `moduleResolution: bundler`
reads it, and there is deliberately no `paths` alias in the root `tsconfig.json`
that would bypass it. An import of anything not listed there fails to resolve, in
TypeScript, in `bun test` and in Turbopack alike.

That means moving a file between the rooms above is free — the map is repointed
and nothing outside notices — while *exposing* one is a decision somebody makes
by adding a line. See the long comment in `eslint.config.mjs` for how this was
untrue for a while and how it failed.

## Two things a compiler will not catch

- **`scripts/xp-catalogue.ts` writes `assets/catalogue.generated.ts` by path**,
  and `scripts/xp-pack.ts` reads it the same way. Moving that file means editing
  those scripts; there is no import to fail.
- **Tests reach `public/` and `docs/` with `import.meta.dir` and a count of
  `..`.** A file that changes depth changes that count, and the failure is an
  `ENOENT` at run time that a typecheck sees nothing wrong with.
