/**
 * A/B experiments: what is being tested, and which arm somebody got.
 *
 * Pure, and importable from a Client Component - the same split `campaign.ts`
 * makes, for the same reason. The server picks an arm while rendering, the
 * beacon has to send the arm it actually rendered, and the backoffice has to
 * name the arms in a report. All three need this vocabulary, and only one of
 * them is on the server.
 *
 * ---------------------------------------------------------------------------
 * A registry, not free text
 * ---------------------------------------------------------------------------
 * The arms are a fixed list for the same reason `WORLD_TAGS` is: a value that
 * arrives from a query string and ends up grouped in a report has to be one of
 * a known set, or the report grows a long tail of typos and probes that looks
 * like data. An unknown arm is not "a new arm", it is somebody trying their
 * luck, and it is dropped rather than trimmed into something plausible.
 *
 * ---------------------------------------------------------------------------
 * Stored as `experiment:arm`
 * ---------------------------------------------------------------------------
 * One column, namespaced, the same trick `?src=` plays with `referrer_host`. A
 * bare `dusk` in a column is a value nobody can attribute six months later, and
 * a colon occurs in neither half of a slug.
 */

export interface Experiment {
  id: string
  /** What is being tested, for the report's own heading. */
  question: string
  /** The arms, first one first. The first is the control. */
  arms: { id: string; label: string }[]
}

/**
 * Everything currently under test.
 *
 * Deliberately short. Two experiments running on one page at once means every
 * number in both reports is a mixture of four things, and nobody has the
 * traffic to read that. Finish one, delete it from here, start the next.
 */
export const EXPERIMENTS: Experiment[] = [
  {
    id: 'look',
    question: 'Which art direction gets more people through to the demo?',
    arms: [
      { id: 'bento', label: 'Bento — neon cards on the starfield' },
      { id: 'dusk', label: 'Dusk — pastel washes and a block heap' },
    ],
  },
]

export function experimentById(id: string): Experiment | undefined {
  return EXPERIMENTS.find((experiment) => experiment.id === id)
}

/** The stored form: `experiment:arm`, or null if either half is unknown. */
export function variantKey(experimentId: string, armId: string): string | null {
  const experiment = experimentById(experimentId)
  if (!experiment) return null
  if (!experiment.arms.some((arm) => arm.id === armId)) return null
  return `${experimentId}:${armId}`
}

/** The two halves back out, or null if the value is not one we issued. */
export function parseVariant(value: string | null | undefined): {
  experimentId: string
  armId: string
} | null {
  if (!value) return null
  const [experimentId, armId, ...rest] = value.split(':')
  if (!experimentId || !armId || rest.length > 0) return null
  return variantKey(experimentId, armId) ? { experimentId, armId } : null
}

/**
 * Which arm this visit gets.
 *
 * ---------------------------------------------------------------------------
 * Per visit, not per visitor, and that is a real limitation
 * ---------------------------------------------------------------------------
 * There is no cookie here and there is not going to be one: the banner promises
 * essential cookies only, and an experiment bucket is not essential. The other
 * way to keep somebody in one arm would be the daily visitor hash, and that is
 * computed in the beacon endpoint from headers this render never sees.
 *
 * So the arm is drawn per request. For comparing *rates* between arms that is
 * sound - each visit is an independent sample, and the two arms get the same
 * traffic mix - but it means a person who comes back may be shown the other
 * one, and it means the two arms cannot be compared on anything per-person.
 * Read the report as "of the visits that saw A, what share clicked", never as
 * "how many people preferred A".
 *
 * `override` is what makes the arms openable by hand - `?look=dusk` - so the
 * pair can be reviewed without reloading until chance obliges. An overridden
 * visit is still recorded under the arm it was shown, which is fine at the
 * volumes involved and honest either way: it *was* shown.
 */
export function assignArm(
  experiment: Experiment,
  override: string | null | undefined,
  /** Injected so the choice is testable. Defaults to a fair draw. */
  draw: () => number = Math.random,
): string {
  const wanted = experiment.arms.find((arm) => arm.id === override)
  if (wanted) return wanted.id

  const index = Math.min(experiment.arms.length - 1, Math.floor(draw() * experiment.arms.length))
  return experiment.arms[index]?.id ?? experiment.arms[0].id
}
