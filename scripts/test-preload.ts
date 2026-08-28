import { plugin } from 'bun'

/**
 * Makes `import 'server-only'` a no-op, for `bun test` only.
 *
 * That package exists to throw when a module is pulled into a client bundle,
 * which is a guard worth having - and it also means the server-side modules
 * most worth testing cannot be imported by a test at all. Next resolves it
 * through the `react-server` export condition, which points at an empty file;
 * running the whole suite under that condition would be the tidy fix, but it
 * also changes how React itself resolves and breaks unrelated tests. So the
 * stub is scoped to this one specifier instead.
 *
 * Wired up in bunfig.toml, which only `bun test` reads. Nothing here reaches a
 * build: the marker still throws for real in dev and in production, which is
 * the only place it was ever doing work.
 */
plugin({
  name: 'server-only stub',
  setup(build) {
    build.module('server-only', () => ({ contents: 'export {}', loader: 'js' }))
  },
})
