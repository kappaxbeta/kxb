/**
 * `Up to {n} members` with the cap filled in. One placeholder, no library.
 *
 * Its own module rather than a second export from `landing`, now that the app
 * behind the login uses it too: importing it from there would pull the entire
 * landing dictionary - both languages of every word on the front page - into
 * the bundle of a rail that wanted to say "3 more". `landing` re-exports it so
 * the marketing components keep their one import path.
 *
 * A missing key leaves its own placeholder in place rather than printing
 * `undefined`. That is the failure that shows up in a screenshot and gets
 * fixed, instead of the one that reads as a sentence.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match))
}
