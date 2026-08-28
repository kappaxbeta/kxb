/**
 * A route as something to read.
 *
 * `/t/:slug/battle/tournaments` is precise and nobody scans a column of it.
 * The slug placeholder carries no information once you know every route has
 * one, so it goes, and what is left is the trail through the product.
 *
 * Its own module rather than part of `profiles.ts`, which is `server-only` -
 * this is a pure string rule with nothing server-side about it, and keeping it
 * separate is what makes it testable without a database or a request. The
 * templates it consumes come from `path_template()` in the migration; the two
 * are a pair, and a new route shape wants a rule in both.
 */
export function sectionLabel(section: string | null): string {
  if (!section) return 'Nowhere yet'

  const trail = section
    .replace(/^\/(t|v)\/:slug/, '')
    .split('/')
    .filter((part) => part && part !== ':slug')
    .map((part) => (part === ':id' ? '#' : part))

  // A workspace root folds away to nothing, and "" is not a label.
  if (trail.length === 0) return section.startsWith('/t/') || section.startsWith('/v/') ? 'Workspace' : 'Home'
  return trail.join(' › ')
}
