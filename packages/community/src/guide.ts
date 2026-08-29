/**
 * What a handbook document is made of.
 *
 * ---------------------------------------------------------------------------
 * A closed vocabulary of section shapes, and why it is not just "markdown"
 * ---------------------------------------------------------------------------
 * The obvious way to hold a guide is a string of markdown. It was rejected for
 * the same reason `marketing-shell.tsx` gave up on having one `Band` component:
 * a page where every section is the same shape makes no claim about any of
 * them, and a reader scrolling a wall of headings cannot tell which two are the
 * ones they came for.
 *
 * Here the difference is sharper still, because the sections are doing
 * genuinely different jobs. A list of offices you must visit is a *procedure*
 * and its order is the information. A list of words the forms use is a
 * *glossary* and its order is alphabetical at best. A list of fees is a table
 * with numbers in it that a reader will want to add up. Flattened into prose
 * they all become paragraphs, and the reader does the sorting that the author
 * already knew the answer to.
 *
 * So a section says what kind of thing it is, and the page draws each kind
 * differently. The vocabulary is deliberately small and deliberately closed:
 * adding a shape is a decision about the whole handbook, and a `kind` the
 * renderer has not been taught is a compile error rather than a blank space.
 *
 * ---------------------------------------------------------------------------
 * Nothing in here is a component
 * ---------------------------------------------------------------------------
 * There is no JSX in this package and no `href` to anywhere inside the app.
 * The handbook is content, the app is one renderer of it, and the point of the
 * separation is that the day this moves to its own repository nothing has to
 * be untangled - the app keeps importing `@kxb/community` and the folder moves.
 */

/**
 * One numbered move in a procedure: go here, fill in this, come away with that.
 *
 * `fields` is the part that is easy to leave out and is most of the value.
 * "Fill in the Fragebogen zur steuerlichen Erfassung" is not help; the form is
 * eight pages and the two questions that decide how somebody is taxed for the
 * next five years are buried in the middle of it. So a step may name the
 * individual boxes and say what each one means.
 */
export interface Step {
  /** Short imperative: what this step is. */
  title: string
  /** Where it happens - an office, a website, a notary. Omitted when it is nowhere in particular. */
  where?: string
  /** What it costs, in words, so a reader can total the page. Omitted when it is free. */
  cost?: string
  /** How long it takes, or how long until the answer arrives. */
  takes?: string
  /** The prose. One string per paragraph. */
  body: string[]
  /** Individual boxes on a form, and what each one actually means. */
  fields?: { label: string; means: string }[]
  /** The single thing a reader should not get wrong here. */
  watch?: string
}

/** A word the paperwork uses, and what it means. */
export interface Term {
  term: string
  means: string
}

/** A number a reader will want to add up. */
export interface Cost {
  what: string
  amount: string
  note?: string
}

/** Somewhere to go that is not this site. */
export interface Source {
  label: string
  href: string
  note?: string
}

/**
 * A choice the reader has to make, with the case for each side.
 *
 * Sole trader or limited company; small-business rule or not. These are the
 * questions people get wrong, and they get them wrong because every guide
 * presents them as a step rather than as a decision with consequences.
 */
export interface Choice {
  question: string
  options: { name: string; when: string; costs?: string; catch?: string }[]
}

export type Section =
  | { kind: 'prose'; id: string; heading: string; body: string[] }
  | { kind: 'steps'; id: string; heading: string; intro?: string[]; steps: Step[] }
  | { kind: 'choice'; id: string; heading: string; intro?: string[]; choices: Choice[] }
  | { kind: 'terms'; id: string; heading: string; intro?: string[]; terms: Term[] }
  | { kind: 'costs'; id: string; heading: string; intro?: string[]; costs: Cost[] }
  | { kind: 'watch'; id: string; heading: string; items: string[] }
  | { kind: 'sources'; id: string; heading: string; sources: Source[] }

/** Every `kind`, so a renderer can be checked against the list rather than guessed at. */
export type SectionKind = Section['kind']

/**
 * A whole document: a country guide, or a chapter that is true everywhere.
 *
 * `checked` is a date rather than a version number, and it is required. Every
 * fact in here has a shelf life - Germany moved the small-business thresholds
 * in 2025 and renamed the law behind the imprint in 2024 - and a guide that
 * does not say when it was last read against the source is worse than no guide,
 * because it is confidently out of date. The page prints it.
 */
export interface Guide {
  title: string
  /** One sentence under the title: who this is for and what they get. */
  standfirst: string
  /** ISO date the prose was last checked against its sources. */
  checked: string
  sections: Section[]
}
