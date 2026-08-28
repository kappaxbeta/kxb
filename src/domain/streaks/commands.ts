import { z } from 'zod'

/**
 * The one command: record that this member was here on this day.
 *
 * The schema validates *shape* - that `day` is a `YYYY-MM-DD` string. Whether
 * the day is new, continues yesterday's run, or breaks it is state, and lives
 * in the decider.
 */

export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A day must be written YYYY-MM-DD')

export const recordVisitSchema = z.object({ day: daySchema })

export type RecordVisit = { type: 'RecordVisit'; day: string }

export type StreakCommand = RecordVisit
