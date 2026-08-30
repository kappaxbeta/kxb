/**
 * The backoffice, as a list of sections that can be granted one at a time.
 *
 * One place names every tab, and three things read it: the sidebar, which hides
 * what you cannot see; the roles page, which offers a level per section; and
 * `requireBackofficeSection`, which guards each page and action. Keeping them on
 * one registry is what stops a section existing in the nav that the role system
 * has never heard of - a page you can open but not grant, or grant but not open.
 *
 * The `key` is the URL slug under `/ovaloffice`, so a section and its route are
 * the same word. It is what lands in `backoffice_grants.section` and in the
 * audit log, so renaming one is a data migration, not a rename - don't.
 *
 * `superadminOnly` marks a section no grant can reach: managing who else gets in
 * is the superadmin's alone, and offering "grant somebody the admins section"
 * would be handing out the power to hand out power. Everything else is fair to
 * delegate, billing and flags included - a superadmin decides who they trust
 * with each.
 */
export interface BackofficeSection {
  key: string
  label: string
  path: string
  /** Which sidebar cluster it sits in, for the roles page's grouping. */
  group: 'Management' | 'Operations' | 'System'
  /** True for sections only a superadmin may ever see. Not grantable. */
  superadminOnly?: boolean
}

export const BACKOFFICE_SECTIONS: readonly BackofficeSection[] = [
  // Management
  { key: 'access', label: 'Access & applications', path: '/ovaloffice/access', group: 'Management' },
  { key: 'worlds', label: 'Worlds', path: '/ovaloffice/worlds', group: 'Management' },
  { key: 'xp', label: 'XP review', path: '/ovaloffice/xp', group: 'Management' },
  // Two sections about levels, and the split is who made them. `xp` is a queue
  // of somebody else's work waiting on a verdict; this one is our own shelf -
  // the documents in `public/xp/xps/`, what is listed, and what is being served
  // in place of what shipped. Granting one does not grant the other, which is
  // the right shape: reviewing submissions and editing what we publish are
  // different jobs and different amounts of trust.
  { key: 'xps', label: 'Our XPs', path: '/ovaloffice/xps', group: 'Management' },
  { key: 'studio', label: 'Studio', path: '/ovaloffice/studio', group: 'Management' },
  { key: 'scenes', label: 'Scenes', path: '/ovaloffice/scenes', group: 'Management' },
  { key: 'renders', label: 'Renders', path: '/ovaloffice/renders', group: 'Management' },
  { key: 'pictures', label: 'Pictures', path: '/ovaloffice/pictures', group: 'Management' },
  { key: 'builder', label: 'World builder', path: '/ovaloffice/builder', group: 'Management' },
  { key: 'animator', label: 'Animator', path: '/ovaloffice/animator', group: 'Management' },
  // Operations
  { key: 'contact', label: 'Contact messages', path: '/ovaloffice/contact', group: 'Operations' },
  { key: 'promos', label: 'Codes', path: '/ovaloffice/promos', group: 'Operations' },
  // Beside the codes, because half the job is minting another kind: the shelf
  // of character skins, their words and prices, and the vouchers that buy them.
  { key: 'skins', label: 'Skins', path: '/ovaloffice/skins', group: 'Operations' },
  { key: 'experiments', label: 'Experiments', path: '/ovaloffice/experiments', group: 'Operations' },
  { key: 'reports', label: 'Reports', path: '/ovaloffice/reports', group: 'Operations' },
  { key: 'events', label: 'Events', path: '/ovaloffice/events', group: 'Operations' },
  { key: 'news', label: 'News', path: '/ovaloffice/news', group: 'Operations' },
  // System
  { key: 'analytics', label: 'Analytics', path: '/ovaloffice/analytics', group: 'System' },
  { key: 'errors', label: 'Errors', path: '/ovaloffice/errors', group: 'System' },
  { key: 'health', label: 'Health', path: '/ovaloffice/health', group: 'System' },
  { key: 'performance', label: 'Performance', path: '/ovaloffice/performance', group: 'System' },
  { key: 'feature-flags', label: 'Feature flags', path: '/ovaloffice/feature-flags', group: 'System' },
  { key: 'pricing', label: 'Pricing', path: '/ovaloffice/pricing', group: 'System' },
  { key: 'audit', label: 'Audit log', path: '/ovaloffice/audit', group: 'System' },
  { key: 'admins', label: 'People & roles', path: '/ovaloffice/admins', group: 'System', superadminOnly: true },
]

const BY_KEY = new Map(BACKOFFICE_SECTIONS.map((section) => [section.key, section]))

export function backofficeSection(key: string): BackofficeSection | undefined {
  return BY_KEY.get(key)
}

/** The label for a section key, falling back to the key itself for a grant to
 *  a section that has since been removed - which the roles page shows so it can
 *  be cleared. */
export function sectionLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key
}

/** The sections a person may actually be granted - everything a superadmin can
 *  delegate, which is all of them except the ones only a superadmin may see. */
export const GRANTABLE_SECTIONS: readonly BackofficeSection[] = BACKOFFICE_SECTIONS.filter(
  (section) => !section.superadminOnly,
)

export type BackofficeLevel = 'view' | 'write'
