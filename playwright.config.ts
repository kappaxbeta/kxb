/**
 * End-to-end, local only.
 *
 * Deliberately not wired into `.github/workflows/checks.yml`. These specs need a
 * Supabase, a dev server and three Chromiums, and a CI job that needs all three
 * goes red for reasons that are never the code - which costs more than the
 * coverage buys, in a repo whose one check has to stay trustworthy.
 *
 * No `webServer` either, and that is the same argument at a smaller scale: this
 * project's dev server is shared with a local Supabase and is often already
 * running, and a config that starts a second one is how a warm page becomes an
 * eighty-second one. Start it yourself, then run these.
 *
 *     bun run dev            # in another terminal
 *     bun run xp:e2e
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  /**
   * `.e2e.ts`, not `.spec.ts`.
   *
   * `bun test` globs `*.spec.ts` as well as `*.test.ts`, so a Playwright spec in
   * this repo is picked up by the unit runner, which imports `@playwright/test`
   * outside a Playwright process and fails. Two runners, two suffixes, and
   * neither has to know about the other.
   */
  testMatch: /.*\.e2e\.ts$/,
  /**
   * One at a time, and no retries.
   *
   * Each spec opens three real browsers against one dev server and one database.
   * Running two files at once is six Chromiums and two rooms on one machine, and
   * the first thing that gives way is the page load - which fails looking like a
   * broken app. A retry would hide exactly the flake worth knowing about.
   */
  workers: 1,
  fullyParallel: false,
  retries: 0,
  /**
   * Five minutes a test, and it is the machine rather than the app.
   *
   * Three cold page loads and a presence handshake do not fit in the default
   * 30s, and this laptop has run ten `next dev` processes at once - which took
   * one run to seven minutes and made every assertion in it look like a defect.
   * The specs poll, so a healthy run never spends this.
   */
  timeout: 300_000,
  expect: { timeout: 60_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
})
