/// <reference types="react/canary" />

/**
 * The types for React's canary channel, which is the one the App Router runs
 * on. `<ViewTransition>` lives there, and `@types/react` keeps those
 * declarations in a separate file that nothing loads by default.
 *
 * A triple-slash reference rather than the `import {} from 'react/canary'` the
 * React docs also offer: that module does not exist at runtime, and while
 * TypeScript understands it as types-only, the bundler does not - it resolves
 * an empty-braces import as a side-effect import and fails with "Can't resolve
 * 'react/canary'". A reference in a declaration file is erased before anything
 * downstream ever sees it.
 *
 * Next to `next-env.d.ts` for the same reason that file is here: it is ambient
 * type setup for the whole project rather than anything any one module owns.
 */
