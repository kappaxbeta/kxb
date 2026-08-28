import type { Client } from '@/es/store'
import { EXPERIMENTS, type Experiment } from './experiment'

/**
 * Reading the A/B report, and turning it into something a page can print.
 *
 * The counting is all in SQL - see the `experiment_report` migration - because
 * the alternative is pulling every tagged row into node to group it, on the one
 * table that grows fastest. What is left here is arithmetic and honesty: rates,
 * and the sample-size caveat that decides whether any of them mean anything.
 */

/** What the SQL hands back, per arm. */
interface ArmTotals {
  views: number
  visitors: number
  events: Record<string, { count: number; visitors: number }>
}

type ReportShape = Record<string, Record<string, ArmTotals>>

export interface ArmResult {
  id: string
  label: string
  views: number
  /**
   * Distinct visitors *per day*, summed.
   *
   * Not "people". The visitor hash rotates at midnight, so somebody who came
   * on two days counts twice, and no query can tell that they were one person.
   * Named plainly here so no caller can mistake it - see the migration.
   */
  visitorDays: number
  /** How many of this arm's views went on to fire the goal event. */
  conversions: number
  /** conversions / views, or null when the arm has no views to divide by. */
  rate: number | null
  events: { name: string; count: number }[]
}

export interface ExperimentResult {
  experiment: Experiment
  arms: ArmResult[]
  /** The arm with the best rate, or null when nothing is separable yet. */
  leader: string | null
  /**
   * Whether the numbers are worth reading at all.
   *
   * Deliberately crude - a fixed floor per arm rather than a significance test.
   * A proper test on two proportions is not hard, but printing a p-value next
   * to forty visits invites exactly the reading it is meant to prevent: the
   * honest answer at this traffic is "not yet", and a floor says that without
   * dressing it up as statistics.
   */
  enough: boolean
}

/** Views per arm below which the report refuses to name a winner. */
export const MINIMUM_VIEWS_PER_ARM = 200

/**
 * The event that counts as success.
 *
 * One per experiment would be more flexible and is not worth it yet: every
 * experiment currently running is a landing-page art test, and the thing all of
 * them are trying to move is whether somebody clicked through to the arcade.
 * When a second kind of experiment arrives, this becomes a field on
 * `Experiment` rather than a constant.
 */
export const GOAL_EVENT = 'cta_click'

export async function readExperiments(
  supabase: Client,
  days = 30,
): Promise<ExperimentResult[]> {
  const { data, error } = await supabase.rpc('experiment_report_admin', { days })
  if (error) throw new Error(`Failed to read experiments: ${error.message}`)

  const report = (data as unknown as ReportShape | null) ?? {}

  return EXPERIMENTS.map((experiment) => {
    const raw = report[experiment.id] ?? {}

    const arms: ArmResult[] = experiment.arms.map((arm) => {
      const totals = raw[arm.id]
      const views = totals?.views ?? 0
      const conversions = totals?.events?.[GOAL_EVENT]?.count ?? 0

      return {
        id: arm.id,
        label: arm.label,
        views,
        visitorDays: totals?.visitors ?? 0,
        conversions,
        // Null rather than 0 for an arm nobody has seen: a rate of zero reads
        // as "nobody clicked", and "nobody arrived" is a different fact.
        rate: views > 0 ? conversions / views : null,
        events: Object.entries(totals?.events ?? {})
          .map(([name, value]) => ({ name, count: value.count }))
          .sort((a, b) => b.count - a.count),
      }
    })

    const enough = arms.every((arm) => arm.views >= MINIMUM_VIEWS_PER_ARM)
    const best = [...arms].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))[0]

    return {
      experiment,
      arms,
      // No leader until every arm has cleared the floor. Naming one earlier is
      // how a fortnight of noise becomes a decision somebody ships.
      leader: enough && best && best.rate !== null ? best.id : null,
      enough,
    }
  })
}

/** `12.4%`, or an em dash when there is nothing to divide. */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`
}
