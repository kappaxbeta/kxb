import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".shoot-profile",

    /**
     * Vendored runtimes are served, not written here. p5.min.js is one
     * minified line, which reads as several thousand lint errors about code
     * nobody in this repo authored or can fix - upgrading p5 is copying a
     * new file in, and the lint that matters ran on p5's own repo.
     */
    "public/xp/vendor/**",

    /**
     * Every Next.js build directory this repo has or will have.
     *
     * One glob, and it is the third time this lesson has been paid for.
     *
     * There has to be somewhere to build that is not `.next`, because `.next`
     * belongs to the dev server: building into it while `next dev` is running
     * pulls the chunks out from under the open tab. So the family grew - the
     * screenshot runner's `.next-shots`, the verification build's
     * `.next-verify`, and one per parallel session besides. All of it is
     * generated output rather than source.
     *
     * The list named `.next`, the `.next-shots` glob and `.next-verify` one at
     * a time, and it failed the same way twice: a `.next-shots3` appeared and
     * the deploy could not get past its own lint step, with 900 errors in
     * compiled chunks nobody wrote. The note left behind said *enumerating the
     * ones that exist today is the mistake* - and then enumerated the family one
     * level up anyway. It came back a third time as `.next-interndoc` and
     * `.next-store`:
     * 2.9 GB of dev build linted, 3,565 errors in code nobody authored, and
     * `bun run lint` exiting 1 whatever the source actually says. Which is
     * worse than a broken deploy step, because a check that always fails is one
     * everybody learns to ignore.
     *
     * So the pattern is the whole family. `next-env.d.ts` above is the only
     * `next`-ish thing at the root that is not generated output, and it has no
     * leading dot, so it is not caught by this.
     */
    ".next*/**",

    /**
     * Vendored shadcn/ui, which is generated rather than written.
     *
     * `shadcn add` copies these in verbatim and overwrites them on the next
     * run, so a hand-patch here is not a fix - it is a change that silently
     * reverts the next time somebody adds a component. Two of them trip
     * `react-hooks/set-state-in-effect` as shipped (carousel.tsx, and the
     * use-mobile hook its sidebar depends on), which was enough to fail the
     * deploy on code nobody in this repo authored.
     *
     * Our own components are not in here - the rail is src/app/t/[slug]/,
     * the scenes are src/app/world/ - so this exempts exactly the generated
     * surface and nothing we are responsible for.
     */
    "src/components/ui/**",
    "src/hooks/use-mobile.ts",

    /*
     * The phone apps used to be excluded here.
     *
     * They were `packages/native` and `packages/shell`, React Native bundles
     * with their own dependencies, installs and tsconfigs, and this config is
     * `eslint-config-next`: it would have linted them against rules about a
     * framework they do not use, with plugins their `node_modules` do not
     * have, and could not resolve one of their imports. They live in
     * repositories of their own now - kxbxo and kxbshell - and lint and
     * typecheck themselves there, which is what the exclusion was standing in
     * for all along.
     */

    /**
     * Agent skills, which are installed rather than authored.
     *
     * `.claude/skills/` is populated by installing skills, so its scripts are
     * somebody else's code on the same footing as `src/components/ui/**` - a
     * fix here is overwritten by the next install. They were costing real time
     * too: linting them is pure work with no possible payoff, and `bunx eslint`
     * with no arguments walks the whole tree.
     */
    ".claude/**",
    ".impeccable/**"
  ]),

  /**
   * `.cjs` means CommonJS, and CommonJS is how `require` is spelled.
   *
   * `@typescript-eslint/no-require-imports` is right about application code and
   * wrong here: `scripts/babel-plugin-source-attr.cjs` is loaded by Babel, which
   * `require()`s its plugins, so the file has to be CJS and a CJS file has no
   * other way to reach `node:path`. The extension is the declaration - anything
   * ending in `.cjs` has opted out of ESM on purpose.
   *
   * Scoped to the extension rather than to `scripts/**`, because the shell and
   * bun scripts in there are ordinary modules and should keep the rule.
   */
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  /**
   * A function nobody can read, caught while it is still small enough to fix.
   *
   * ---------------------------------------------------------------------------
   * Why the function and not the file
   * ---------------------------------------------------------------------------
   * The obvious version of this rule is `max-lines`, and it is wrong in both
   * directions at once. `src/app/xp/_editor/inspector.tsx` is 2,019 lines
   * holding twenty-two components, none over two hundred, and it is completely
   * readable - a file cap would break it into twenty-two files, twenty-two
   * import blocks and not one clearer line. `src/app/xp/_runtime/simulation.tsx`
   * is 5,235 lines holding *one function*, with about a hundred and twenty ref
   * and state declarations sharing a scope, and a file cap does not touch what
   * is wrong with it.
   *
   * Same size, nothing in common. The fault was never length; it is a dozen
   * unrelated concerns in one scope, so nothing inside can be read, tested or
   * changed on its own. That is what this measures.
   *
   * ---------------------------------------------------------------------------
   * `skipComments`, because two thirds of the worst offender is prose
   * ---------------------------------------------------------------------------
   * `simulation.tsx` is 62% comment. `packages/xp/src/document/flow.ts` is 71%, and is
   * one of the clearest files in the repo. Counting explanation as bulk would
   * make this rule an argument against the house style in docs/README.md -
   * explain *why*, for the person who will disagree - and the first thing
   * anybody would do to silence it is delete the paragraph that says why.
   *
   * A rule that pays people to delete their reasoning is worse than no rule.
   * So comments and blank lines are free, and what is counted is code.
   *
   * ---------------------------------------------------------------------------
   * `warn`, and 800, and why that is not a cop-out
   * ---------------------------------------------------------------------------
   * Six functions are over it today, and every one is already named in
   * docs/architecture/large-files.md:
   *
   *     Running      1687      LoungeScene  1307      SummonWizard  934
   *     Animator      872      Editor        839      BattleRoom    836
   *
   * That is a to-do list, not a flood - which is the whole difference between
   * this and the `.next*` lesson three comment blocks below. A check that
   * reports nine hundred things nobody can act on is one everybody learns to
   * ignore; six is a list somebody can finish.
   *
   * `warn` rather than `error` for the same reason: these six are known, the
   * work on them is under way, and a deploy that cannot ship until they are
   * done is a deploy nobody can ship. Warnings are already tolerated here - the
   * tree carries a few dozen - and this is not a gate, it is a tripwire for the
   * *seventh*.
   *
   * **It is meant to ratchet.** Three of the six are within a hundred lines of
   * the limit because they have just been worked on. As they come down, lower
   * the number; the point is that the next `Running` gets caught at 801 rather
   * than at five thousand, by which time nobody can tell what it was supposed
   * to do.
   */
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "packages/**/*.ts", "packages/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "max-lines-per-function": ["warn", {
        max: 800,
        skipComments: true,
        skipBlankLines: true,
        // A `describe` block is a list of cases, not a scope anybody has to
        // hold in their head, and neither is an IIFE wrapping a module.
        IIFEs: false,
      }],
    },
  },

  /**
   * `src/domain/` is where the rules live, and rules do not render or persist.
   *
   * Two things had drifted in there before this existed, and neither was
   * noticeable by reading:
   *
   *  - `domain/world/save.ts` reached for `window.localStorage`, so the module
   *    that owns what a shared number *means* could only run in a browser. The
   *    storage half is now `app/world/shared-save.ts`.
   *  - `domain/lounge/templates.tsx` was a table of SVG components, so a Server
   *    Action calling `findTemplate` to lay some blocks pulled React in with
   *    it. The drawings are now `app/world/lounge/template-marks.tsx`.
   *
   * Both are the same mistake - a detail of *how* something is shown or stored
   * ending up next to *what is true* - and both compiled perfectly happily.
   * Hence rules rather than a convention.
   *
   * This is deliberately not a pure/server split. Plenty in here is server-only
   * (`actions.ts`, `queries.ts`) and that is fine; the line being drawn is
   * against the browser and the view layer, which nothing in the domain needs
   * either way.
   */
  {
    files: ["src/domain/**/*.ts", "src/domain/**/*.tsx"],
    rules: {
      "no-restricted-globals": ["error",
        { name: "window", message: "src/domain is not browser code - keep DOM and storage access in src/app." },
        { name: "document", message: "src/domain is not browser code - keep DOM and storage access in src/app." },
        { name: "localStorage", message: "src/domain is not browser code - keep DOM and storage access in src/app." },
        { name: "sessionStorage", message: "src/domain is not browser code - keep DOM and storage access in src/app." },
      ],
      "no-restricted-imports": ["error", {
        paths: [
          { name: "react", message: "src/domain holds rules, not components. Put the view in src/app." },
          { name: "react-dom", message: "src/domain holds rules, not components. Put the view in src/app." },
        ],
        patterns: [
          {
            group: ["@/app/*", "@/components/*"],
            message: "The domain must not import the app. Invert the dependency: pass the value in, or move the shared piece into src/domain.",
          },
        ],
      }],
    },
  },

  /**
   * `src/app/xp/` is a *host* for the engine, and hosts do not reach past it.
   *
   * The engine itself moved out to `packages/xp` (`@kxb/xp`), where the
   * boundary is the package's `exports` map rather than a rule - which is the
   * stronger guard, because it is enforced by resolution and cannot be silenced
   * with a comment. What is left for lint is the other direction: this app's XP
   * routes must not start borrowing the lounge's components.
   *
   * **That sentence was untrue for a while, and the way it failed is worth
   * knowing.** `tsconfig.json` carried a `"@kxb/xp/*": ["./packages/xp/src/*.ts"]`
   * path alias, which resolves every file in the package directly and never
   * consults `exports` at all. Fifteen doors were declared and forty-five were
   * open, and nothing anywhere said so - a deep import into the engine's guts
   * would simply have worked.
   *
   * The alias is gone. `moduleResolution: bundler` reads the `exports` map, and
   * the workspace symlink is enough to find the package, so TypeScript, `bun
   * test` and Turbopack all now refuse an undeclared path. **Do not put that
   * alias back.** If something in the engine is needed, give it a door in
   * `packages/xp/package.json` - which is a decision somebody makes, and the
   * whole point of there being a map.
   *
   * The reason is the one in docs/xp-creator.md §1.2. The lounge is live and
   * this is a prototype; a shared component means the prototype either drags the
   * product around or gets stuck behind it. Copy it in, note where it came from,
   * and own it - the two are allowed to look different.
   */
  {
    files: ["src/app/xp/**/*.ts", "src/app/xp/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: [
              "@/app/world/*",
              "@/app/ovaloffice/*",
              "@/app/components/*",
              "@/domain/builder/*",
              "@/domain/lounge/*",
              "@/domain/studio/*",
              "@/domain/world/*",
              "@/domain/worlds/*",
              "@/domain/animator/*",
            ],
            message: "The XP creator owns its own renderer (docs/xp-creator.md §1.3). Copy the component into src/app/xp/ with a note saying where it came from - the lounge's scene and this one are allowed to look different.",
          },
        ],
      }],
    },
  },

  /**
   * ...except in `games/`, which is the one folder whose job is to marry the
   * two.
   *
   * ---------------------------------------------------------------------------
   * The same narrowing the engine rule above already went through
   * ---------------------------------------------------------------------------
   * That one used to say `packages/**` and now says `packages/xp/**`, and its
   * note explains why: the ban was written when there was one thing in there,
   * and it stopped being the same ban the day a *game* lived beside the engine.
   * This is that story a second time. The rule above was written when
   * everything under `src/app/xp/` was the level renderer, and a renderer built
   * out of the lounge's components is exactly the coupling it prevents.
   *
   * `frame` changed what is under there. A framed XP is a document that names
   * **a game the host already has** - see `packages/xp/src/document/frame.ts` -
   * and `_runtime/games/` is where the host says which games those are. For
   * boxing and Mau-Mau the answer is a package. For the café and the house the
   * answer is *this app*: their money is an aggregate in our event log, their
   * customers are served by our server actions, and the peep you walk around in
   * is the one from your profile. Copying those in - which is what the message
   * above tells you to do - would fork a live product surface in two and leave
   * both halves half-maintained.
   *
   * So the ban stands everywhere it was aimed, and three doors are open here:
   * the two scenes an adapter mounts, and the place vocabulary they share. Not
   * `@/app/world/*`, which would let a level renderer creep back in through a
   * folder nobody is watching - the exceptions are named, so adding a fourth is
   * somebody's decision rather than a side effect.
   */
  {
    files: ["src/app/xp/_runtime/games/**/*.ts", "src/app/xp/_runtime/games/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: [
              "@/app/world/*",
              "@/app/ovaloffice/*",
              "@/app/components/*",
              "@/domain/builder/*",
              "@/domain/lounge/*",
              "@/domain/studio/*",
              "@/domain/world/*",
              "@/domain/worlds/*",
              "@/domain/animator/*",
              /*
                The café and the house, as framed games - opened one folder at
                a time, because these are gitignore patterns and gitignore will
                not re-include a file whose parent directory is excluded. So
                each pair lets the folder back in, bans its contents again, and
                names the one file that may be imported out of it.
              */
              "!@/app/world/cafe",
              "@/app/world/cafe/*",
              "!@/app/world/cafe/cafe-scene",
              "!@/app/world/home",
              "@/app/world/home/*",
              "!@/app/world/home/home-scene",
              // Which places there are, which both of them are about.
              "!@/domain/world/places",
            ],
            message: "The XP creator owns its own renderer (docs/xp-creator.md §1.3). A game adapter may mount one of this app's own worlds - the café and the house - and nothing else from the world layer.",
          },
        ],
      }],
    },
  },

  /**
   * The homestead's two packages are *all* rules and no renderer.
   *
   * ---------------------------------------------------------------------------
   * One block rather than two lists, because the bans have to add up
   * ---------------------------------------------------------------------------
   * `@kxb/peepz-world` and `@kxb/dream-restaurant` came out of
   * `src/domain/home` and `src/domain/cafe`, where every rule below was a
   * *folder convention*: `src/domain` has banned React and the browser since
   * long before any of this. Moving the files must not lose that, so the
   * convention moves with them and becomes a check.
   *
   * They are written here in full rather than by adding two globs to boxing's
   * blocks, and the reason is a trap worth naming: `no-restricted-imports` is
   * *replaced* by a later matching block rather than merged with it. Adding
   * these packages to the rules-only block below would have silently dropped
   * the no-importing-the-app ban from the block above - which is exactly what
   * it did, and the guard file that proved it imported `@supabase/supabase-js`
   * without a murmur.
   *
   * ---------------------------------------------------------------------------
   * No renderer, and that is the difference from boxing
   * ---------------------------------------------------------------------------
   * Boxing has `src/play/` and is allowed React and three there, because it
   * drew its own pixels from the first day and shipping them is what makes
   * "lift the folder out" true.
   *
   * A café is drawn with *this app's* presence channel, its peeps, its emotes
   * and its audio - all of which the lounge draws with too. A package that
   * shipped a copy would be a fork of a live surface, maintained twice. So the
   * scene stayed in `src/app/world/`, the rules came here, and the seam between
   * them is the one the old folders already described: the domain owns every
   * rule and the scene owns none of them.
   */
  {
    files: [
      "packages/peepz-world/**/*.ts",
      "packages/dream-restaurant/**/*.ts",
      // The handbook is prose as data - even less of a browser program than the
      // rules packages are, and bound for its own repository, so the same fence.
      "packages/community/**/*.ts",
    ],
    rules: {
      "no-restricted-globals": ["error",
        { name: "window", message: "The rules are not browser code - the scene that draws them is." },
        { name: "document", message: "The rules are not browser code - the scene that draws them is." },
        { name: "localStorage", message: "The rules keep nothing. What survives a reload is an event in the app's log." },
        { name: "sessionStorage", message: "The rules keep nothing. What survives a reload is an event in the app's log." },
      ],
      "no-restricted-imports": ["error", {
        paths: [
          { name: "react", message: "These packages hold no components. Drawing belongs in src/app/world." },
          { name: "react-dom", message: "These packages hold no components. Drawing belongs in src/app/world." },
          { name: "three", message: "The rules are renderer-agnostic - they return numbers and the scene draws them." },
          { name: "@supabase/supabase-js", message: "The purse is an aggregate in the app's event log. A rule is handed a state, never a database." },
        ],
        patterns: [
          {
            group: ["@/*"],
            message: "A game package must not import the app. Anything it needs is passed in - see the state a rules function is handed.",
          },
        ],
      }],
    },
  },

  /**
   * `packages/xp` is a game engine, and it does not know this app exists.
   *
   * It has no `@/` alias - it is outside `src/` - so the app is already out of
   * reach by construction. What this rule adds is the part resolution cannot
   * catch: a transport, an SDK or a browser global sneaking in. The engine talks
   * to the outside world only through the interfaces in `@kxb/xp/host`, which is
   * what lets one engine run against our Supabase, against two tabs on a laptop,
   * and one day against a backend we have never seen (docs/xp-creator.md §11).
   *
   * React is out for the same reason it is out of `src/domain`: this holds
   * rules, not components. The renderer is the host's job.
   *
   * ---------------------------------------------------------------------------
   * Scoped to `packages/xp`, and it used to say `packages/**`
   * ---------------------------------------------------------------------------
   * Which was the same thing right up until there were two packages. `@kxb/xp`
   * is an *engine* and everything above is true of it. `@kxb/boxing` is a
   * *game* built on that engine, and a game that cannot ship its own renderer
   * is a game that is only half in its package - the half you can lift out, with
   * the half that draws it left behind in somebody's app.
   *
   * So the boxing rule below keeps the two bans that are about *coupling* - no
   * reaching into this app, no talking to Supabase - and drops the two that are
   * about *layering*, because for a game the renderer is not somebody else's
   * job. What preserves the property that made the engine testable is that the
   * game's own rules stay pure: see the second block.
   */
  {
    files: ["packages/xp/**/*.ts", "packages/xp/**/*.tsx"],
    rules: {
      "no-restricted-globals": ["error",
        { name: "window", message: "The engine is not browser code. Take what you need through @kxb/xp/host." },
        { name: "document", message: "The engine is not browser code. Take what you need through @kxb/xp/host." },
        { name: "localStorage", message: "The engine has no storage of its own - that is XpPersistence in @kxb/xp/host." },
        { name: "sessionStorage", message: "The engine has no storage of its own - that is XpPersistence in @kxb/xp/host." },
      ],
      "no-restricted-imports": ["error", {
        paths: [
          { name: "react", message: "The engine holds rules, not components. The renderer is the host's job." },
          { name: "react-dom", message: "The engine holds rules, not components. The renderer is the host's job." },
          { name: "three", message: "The engine is renderer-agnostic on purpose - it returns numbers and the host draws them." },
          { name: "@supabase/supabase-js", message: "The engine talks to a backend through XpHost in @kxb/xp/host, never to one directly. That port is what lets an XP run on somebody else's infrastructure." },
        ],
        patterns: [
          {
            group: ["@/*"],
            message: "packages/xp must not import the app. Anything it needs is either passed in or belongs in the package.",
          },
        ],
      }],
    },
  },

  /**
   * `packages/boxing` is a game, and a game brings its own pixels.
   *
   * It may use React and three - `src/play/` is its renderer and shipping it is
   * the point - and it still may not reach into this app or into a backend. The
   * ports in `@kxb/xp/host` are how it gets an identity, a transport and a
   * clock, and `./src/play/game.tsx` takes the two things the app has to supply
   * as props. That is what keeps "lift the folder out" a true sentence.
   */
  {
    files: [
      "packages/boxing/**/*.ts",
      "packages/boxing/**/*.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "@supabase/supabase-js", message: "The game talks to a backend through XpHost, never to one directly." },
        ],
        patterns: [
          {
            group: ["@/*"],
            message: "A game package must not import the app. Anything it needs is passed in - see the props on <BoxingGame>, or the state a rules function is handed.",
          },
        ],
      }],
    },
  },

  /**
   * ...and the game's *rules* stay as pure as the engine's.
   *
   * This is the block that keeps the previous one honest. `src/rules`, `src/net`
   * and `src/art` are numbers in and numbers out - which is why a whole
   * three-round match runs inside `bun test` in a millisecond, and why the frame
   * data can be trusted at all. The Browser pane this was built in never fires
   * `requestAnimationFrame`, so a running fight cannot be watched; asking a
   * function is the only way to know anything.
   *
   * One import of `three` in `rules/contact.ts` and that property is gone, and
   * it goes quietly - the tests keep passing until the day one needs a canvas.
   */
  {
    files: [
      "packages/boxing/src/rules/**/*.ts",
      "packages/boxing/src/net/**/*.ts",
      "packages/boxing/src/art/**/*.ts",
    ],
    rules: {
      "no-restricted-globals": ["error",
        { name: "window", message: "The rules are not browser code. Take what you need through @kxb/xp/host." },
        { name: "document", message: "The rules are not browser code. Take what you need through @kxb/xp/host." },
        { name: "localStorage", message: "The rules have no storage of their own - that is XpPersistence." },
        { name: "sessionStorage", message: "The rules have no storage of their own - that is XpPersistence." },
      ],
      "no-restricted-imports": ["error", {
        paths: [
          { name: "react", message: "The rules hold no components. Drawing belongs in src/play." },
          { name: "react-dom", message: "The rules hold no components. Drawing belongs in src/play." },
          { name: "three", message: "The rules are renderer-agnostic - they return numbers and src/play draws them." },
          /*
            And the two the block above bans, restated.

            Not belt and braces: `no-restricted-imports` is *replaced* by a
            later matching block rather than merged with it, so every path
            listed there was silently off for these three folders - the
            strictest part of the package, with the loosest import rule on it.
            Found by a guard file that imported `@supabase/supabase-js` into
            `packages/peepz-world` and was waved through.
          */
          { name: "@supabase/supabase-js", message: "The game talks to a backend through XpHost, never to one directly." },
        ],
        patterns: [
          {
            group: ["@/*"],
            message: "packages/boxing must not import the app. Anything it needs is passed in - see the props on <BoxingGame>.",
          },
        ],
      }],
    },
  },

]);

export default eslintConfig;
