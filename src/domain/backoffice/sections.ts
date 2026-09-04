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
  // A third queue of somebody else's work, next to `xp` and for the same
  // reason: a member submits, an operator reads it, and nothing goes out
  // unread. Separately grantable because reviewing a level and reading an
  // episode of prose are different jobs - see `docs/product/channels.md` §5.
  { key: 'channels', label: 'Channel review', path: '/ovaloffice/channels', group: 'Management' },
  { key: 'studio', label: 'Studio', path: '/ovaloffice/studio', group: 'Management' },
  // Beside the studio, and the difference is who the picture is for. The studio
  // makes a film of a space for the people in it; this one makes the twelve
  // panels that go to App Store Connect, which is the same art pointed at a
  // stranger. Separately grantable because writing the store listing and
  // rendering a scene are different jobs.
  { key: 'banners', label: 'Store banners', path: '/ovaloffice/banners', group: 'Management' },
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
  // The prize draw: its dates, its prizes, and the code that makes entering
  // free. Beside Codes and Skins because it is made of both - the page is
  // mostly a check that one particular promo code still keeps a promise made in
  // a legal document, which is not a question the promos list can ask.
  { key: 'gewinnspiel', label: 'Gewinnspiel', path: '/ovaloffice/gewinnspiel', group: 'Operations' },
  { key: 'experiments', label: 'Experiments', path: '/ovaloffice/experiments', group: 'Operations' },
  { key: 'reports', label: 'Reports', path: '/ovaloffice/reports', group: 'Operations' },
  // Where the coins came from, and who is not on a best list.
  //
  // Operations rather than System, though it is mostly a set of numbers, because
  // the job it exists for is a judgement about a person: "is this space printing
  // money" and "should this player be on that ranking" are moderation questions
  // that happen to be answered with figures. It sits beside Reports for the same
  // reason - both are somebody deciding what to do about somebody else.
  //
  // Read is the whole of it for most people. Write is the shadow-ban, and the
  // separation matters: seeing where an economy's money comes from should be
  // cheap to grant, and quietly editing a ranking should not be.
  { key: 'money', label: 'Money', path: '/ovaloffice/money', group: 'Operations' },
  { key: 'events', label: 'Events', path: '/ovaloffice/events', group: 'Operations' },
  { key: 'news', label: 'News', path: '/ovaloffice/news', group: 'Operations' },
  // Beside News and the channel, and the third thing in that cluster that is
  // the platform speaking rather than a space. The difference from the other
  // two is the direction: those decide what goes out, this holds the addresses
  // of people who asked to receive it - which makes it the one section here
  // that is mostly a consent log, and is why it shows the wording each person
  // ticked rather than just a list of emails.
  { key: 'newsletter', label: 'Newsletter', path: '/ovaloffice/newsletter', group: 'Operations' },
  // Beside News, because it is the other thing the platform says in its own
  // voice rather than a space's. The difference is what the switch does: News
  // writes the words and publishes them together, this one only decides which
  // already-written chapter is showing - the prose arrives through a pull
  // request, because a book wants the review a banner does not.
  { key: 'xo-universe', label: 'XO Universe', path: '/ovaloffice/xo-universe', group: 'Operations' },
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
