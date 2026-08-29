import type { Guide } from './guide'
import type { Text } from './text'

/**
 * Running kxb yourself - the starter guide.
 *
 * The one document in the handbook that is about this project rather than
 * about the law: the community edition of kxb is a public repository, and this
 * is the path from `git clone` to a world of your own. It lives in the package
 * with the rest of the handbook because it is the same kind of thing - a
 * checked, dated walkthrough - and because the pages that render it are bound
 * for that same public repository.
 *
 * What this deliberately does not do: describe our production deployment. The
 * community repo ships no Caddyfile and no deploy scripts on purpose; this
 * guide ends where your own hosting decisions begin.
 */
export const STARTER: Text<Guide> = {
  en: {
    title: 'Run kxb yourself',
    standfirst:
      'The community edition is a public repository: a browser-based multiplayer world with an event-sourced backend you can stand up on your own machine in an evening.',
    checked: '2026-08-30',
    sections: [
      {
        kind: 'prose',
        id: 'what',
        heading: 'What you are getting',
        body: [
          'kxb is a browser-based virtual arcade: a chill 3D lounge, mini-games, a level editor, and spaces you invite people into with a link. The community edition is the same application we run, minus our infrastructure, our brand details and our paid-product campaigns - built from the private tree by a sync tool, so it stays current rather than drifting into a fork.',
          'The stack: Next.js on Bun, Supabase (Postgres + realtime + auth) as the backend, an event-sourced core - the event log is the source of truth and read models are projections - and Three.js for the worlds. No game server: multiplayer runs over realtime channels with client arbiters.',
          'The art is CC0 but heavy, so the repository does not carry it: kits by Kenney, Kay Lousberg and others are fetched per docs/assets.md, which credits every author properly.',
        ],
      },
      {
        kind: 'steps',
        id: 'steps',
        heading: 'From clone to lounge',
        steps: [
          {
            title: 'Install the toolchain',
            body: [
              'Bun (the runtime and package manager), Docker (for local Supabase), and the Supabase CLI. macOS or Linux; Windows works via WSL.',
            ],
          },
          {
            title: 'Clone and install',
            where: 'github.com/kappaxbeta/kxb',
            body: ['git clone, then `bun install` at the root. The workspace packages resolve locally.'],
          },
          {
            title: 'Fetch the art',
            where: 'docs/assets.md in the repository',
            body: [
              'The document lists each CC0 pack, where its author hosts it, and where it unpacks to. A few generated packs rebuild locally with the listed `bun run` scripts.',
            ],
            watch: 'Skipping this leaves you a world of placeholder dummies. The doc exists so the artists get their credit and their download counts.',
          },
          {
            title: 'Start the backend and the app',
            body: [
              '`supabase start` brings up local Postgres, auth and realtime in Docker; `supabase db reset` applies every migration. Then `bun run dev` - the app expects the local stack and finds it on the standard ports.',
            ],
          },
          {
            title: 'Make yourself the first admin',
            body: [
              'Sign up in the app, then insert your email into `backoffice_admins` against your own database - the migration explains the one-line SQL. The repository ships no seeded admin because it does not know who you are; everyone after you is added through the backoffice itself.',
            ],
          },
          {
            title: 'Before you put it online',
            body: [
              'Replace the placeholder imprint details in the legal shell - the fields are marked and the comments say why shipping someone else’s name is worse than shipping none. Then the chapters of this handbook take over: the legal shell your site needs, and what to check before you promote it.',
            ],
          },
        ],
      },
      {
        kind: 'watch',
        id: 'watch',
        heading: 'The traps',
        items: [
          'Running against the art-less tree and concluding the renderer is broken.',
          'Deploying with the placeholder imprint still in place.',
          'Expecting our deploy scripts - the community repo ends at your hosting choices on purpose.',
          'Editing generated files that a `bun run` script owns; the script wins the next sync.',
        ],
      },
      {
        kind: 'sources',
        id: 'sources',
        heading: 'Where to go from here',
        sources: [
          { label: 'The repository', href: 'https://github.com/kappaxbeta/kxb', note: 'Code, README, and the docs folder.' },
          { label: 'docs/assets.md', href: 'https://github.com/kappaxbeta/kxb/blob/main/docs/assets.md', note: 'Every art pack, credited and linked.' },
          { label: 'The XP editor guide', href: '/create/xp/docs', note: 'How games are made once the world is running.' },
        ],
      },
    ],
  },
}

/** The URL segment the starter guide lives under. */
export const STARTER_SLUG = 'start-kxb'
