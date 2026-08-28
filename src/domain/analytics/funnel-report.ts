import type { Client } from '@/es/store'
import { type Funnel, FUNNELS } from './events'

/**
 * Reading a funnel.
 *
 * The counting is in SQL - see the `funnel_report` migration - and what is left
 * here is the two derived numbers a reader actually looks at: the share that
 * survived each step, and the share that fell out of it. Both are computed
 * against the step above rather than against the top, because "which step is
 * leaking" is the question a funnel is opened to answer, and a column of
 * percentages of the original hides it behind the compounding.
 */

export interface FunnelStepResult {
  label: string
  /** Visitor-days who reached this step *and* every step above it. */
  visitors: number
  /** Share of the step above that got here. Null on the first step. */
  survived: number | null
  /** Share of the whole funnel that got this far. Null when nobody entered. */
  ofTotal: number | null
}

export interface FunnelResult {
  funnel: Funnel
  steps: FunnelStepResult[]
  /**
   * The step with the worst survival rate, or null.
   *
   * The first step never qualifies - it has nothing above it to leak from - and
   * neither does a funnel nobody entered.
   */
  worstStep: number | null
}

export async function readFunnel(
  supabase: Client,
  funnel: Funnel,
  days = 30,
): Promise<FunnelResult> {
  const { data, error } = await supabase.rpc('funnel_report_admin', {
    steps: funnel.steps.map((step) => step.names),
    days,
  })
  if (error) throw new Error(`Failed to read funnel: ${error.message}`)

  const rows = (data as unknown as { step: number; visitors: number }[] | null) ?? []
  const counts = funnel.steps.map(
    (_, index) => rows.find((row) => row.step === index)?.visitors ?? 0,
  )
  const entered = counts[0] ?? 0

  const steps: FunnelStepResult[] = funnel.steps.map((step, index) => {
    const previous = index === 0 ? null : (counts[index - 1] ?? 0)
    return {
      label: step.label,
      visitors: counts[index] ?? 0,
      // Null rather than 0 when the step above is empty: "nobody survived" and
      // "nobody arrived to survive" are different facts and only one of them is
      // about this step.
      survived: previous === null || previous === 0 ? null : (counts[index] ?? 0) / previous,
      ofTotal: entered === 0 ? null : (counts[index] ?? 0) / entered,
    }
  })

  let worstStep: number | null = null
  let worstRate = Infinity
  steps.forEach((step, index) => {
    if (index === 0 || step.survived === null) return
    if (step.survived < worstRate) {
      worstRate = step.survived
      worstStep = index
    }
  })

  return { funnel, steps, worstStep }
}

export function readFunnels(supabase: Client, days = 30): Promise<FunnelResult[]> {
  return Promise.all(FUNNELS.map((funnel) => readFunnel(supabase, funnel, days)))
}

/** `62%`, or an em dash where there is nothing to divide. */
export function formatShare(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}
