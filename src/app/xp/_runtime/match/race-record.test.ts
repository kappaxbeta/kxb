import { describe, expect, test } from 'bun:test'
import { raceRecord } from '@/app/xp/_runtime/match/race-record'
import { formatRunTime, type Run } from '@/app/xp/_runtime/match/race'

const finished = (over: Partial<Run> = {}): Run => ({
  phase: 'finished',
  time: 12.404,
  best: 12.404,
  finishes: 1,
  ...over,
})

describe('what a finished run is worth writing down', () => {
  test('the time, to the hundredth that was on the screen', () => {
    const record = raceRecord(finished())
    expect(record).toEqual({ type: 'finished', data: { seconds: 12.4, best: true } })
  })

  test('the recorded number and the shown number agree', () => {
    /**
     * The point of the rounding, asserted rather than described: a stored result
     * that disagrees with what the player was shown is the shape of every
     * argument a leaderboard has had. Two people who both saw 12.40 tied.
     */
    for (const time of [12.404, 12.3961, 0.014, 61.005, 119.999, 3599.996]) {
      const record = raceRecord(finished({ time, best: time }))
      expect(formatRunTime(record!.data.seconds)).toBe(formatRunTime(time))
    }
  })

  test('a run slower than the best is not a best', () => {
    expect(raceRecord(finished({ time: 15, best: 12.4 }))?.data.best).toBe(false)
  })

  test('the first finish is a best, because there was nothing to beat', () => {
    expect(raceRecord(finished({ time: 15, best: 15 }))?.data.best).toBe(true)
  })

  test('a run still under way is not recorded', () => {
    expect(raceRecord(finished({ phase: 'running' }))).toBeNull()
    expect(raceRecord(finished({ phase: 'waiting' }))).toBeNull()
  })

  test('a run of no length is not a result', () => {
    // A course whose start and finish frames overlap would otherwise write a
    // zero every time anybody walked through, filling that player's ceiling
    // with nothing and costing them the history they did have.
    expect(raceRecord(finished({ time: 0, best: 0 }))).toBeNull()
    expect(raceRecord(finished({ time: 0.001, best: 0.001 }))).toBeNull()
    expect(raceRecord(finished({ time: Number.NaN, best: null }))).toBeNull()
  })
})
