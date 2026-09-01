import { describe, expect, test } from 'bun:test'

import { THING_DEEDS } from '@/domain/thingiverse/blueprint'
import {
  CUE_STEP,
  FIRED_DEEDS,
  HELD_DEEDS,
  MAX_TIMELINE_CUES,
  freshTimeline,
  onBeat,
  playing,
  timelineProblems,
  WHOLE,
  type Cue,
  type Timeline,
} from '@/domain/thingiverse/timeline'

function run(cues: Cue[], extra: Partial<Timeline> = {}): Timeline {
  return { ...freshTimeline(), cues, ...extra }
}

describe('what a thing is doing at a moment', () => {
  test('a held deed runs from its cue onwards', () => {
    const timeline = run([{ at: 0.5, deed: 'spin' }])

    expect(playing(timeline, 0, 0.4).holds.get(WHOLE)).toBeUndefined()
    expect(playing(timeline, 0.4, 0.6).holds.get(WHOLE)).toBe('spin')
    expect(playing(timeline, 1.4, 1.6).holds.get(WHOLE)).toBe('spin')
  })

  test('and stops where it is told to', () => {
    const timeline = run([
      { at: 0, deed: 'bob' },
      { at: 1, deed: 'still' },
    ])

    expect(playing(timeline, 0, 0.5).holds.get(WHOLE)).toBe('bob')
    expect(playing(timeline, 1, 1.5).holds.get(WHOLE)).toBeUndefined()
  })

  test('each piece keeps its own answer', () => {
    const timeline = run([
      { at: 0, deed: 'spin' },
      { at: 0, part: 1, deed: 'bob' },
    ])

    const now = playing(timeline, 0, 0.1)
    expect(now.holds.get(WHOLE)).toBe('spin')
    expect(now.holds.get(1)).toBe('bob')
  })

  test('a run that has ended is done, and a loop never is', () => {
    const once = run([], { loop: false, length: 1 })
    expect(playing(once, 0, 0.5).done).toBe(false)
    expect(playing(once, 0.9, 1.2).done).toBe(true)
    expect(playing(run([], { length: 1 }), 0.9, 9).done).toBe(false)
  })
})

describe('the moments a run crosses', () => {
  test('a one-shot fires once, on the frame that passes it', () => {
    const timeline = run([{ at: 1, deed: 'play', value: 'open' }], { loop: false })

    expect(playing(timeline, 0.8, 0.9).fires).toHaveLength(0)
    expect(playing(timeline, 0.9, 1.1).fires).toHaveLength(1)
    expect(playing(timeline, 1.1, 1.3).fires).toHaveLength(0)
  })

  test('and once a lap, over the seam', () => {
    const timeline = run([{ at: 0.1, deed: 'vanish' }], { length: 1 })

    // 0.95 -> 1.05 is the seam: the cue is behind the wrap, not ahead of it.
    expect(playing(timeline, 0.95, 1.05).fires).toHaveLength(0)
    expect(playing(timeline, 1.05, 1.15).fires).toHaveLength(1)
  })

  test('a seam that steps over the cue still fires it', () => {
    const timeline = run([{ at: 0.05, deed: 'play' }], { length: 1 })
    expect(playing(timeline, 0.98, 1.08).fires).toHaveLength(1)
  })

  test('a long look away replays at most one lap', () => {
    const timeline = run([{ at: 0.2, deed: 'play' }], { length: 0.5 })
    expect(playing(timeline, 0, 30).fires.length).toBeLessThanOrEqual(2)
  })

  test('held deeds are not moments', () => {
    const timeline = run([{ at: 0.5, deed: 'spin' }])
    expect(playing(timeline, 0.4, 0.6).fires).toHaveLength(0)
  })

  test('a clock that has not moved crosses nothing', () => {
    const timeline = run([{ at: 0.5, deed: 'play' }])
    expect(playing(timeline, 0.6, 0.6).fires).toHaveLength(0)
  })
})

describe('what a timeline may say', () => {
  test('a fresh one is fine', () => {
    expect(timelineProblems(freshTimeline())).toEqual([])
  })

  test('a run has to be a length somebody can watch', () => {
    expect(timelineProblems(run([], { length: 0 }))).not.toEqual([])
    expect(timelineProblems(run([], { length: 600 }))).not.toEqual([])
  })

  test('a cue sits inside its run', () => {
    expect(timelineProblems(run([{ at: 9, deed: 'spin' }], { length: 2 }))).toEqual([
      'A cue sits inside the run.',
    ])
  })

  test('a cue cannot point at a piece that is not there', () => {
    expect(timelineProblems(run([{ at: 0, part: 2, deed: 'spin' }]), 1)).toEqual([
      'A cue points at a piece this thing does not have.',
    ])
    expect(timelineProblems(run([{ at: 0, part: 0, deed: 'spin' }]), 1)).toEqual([])
  })

  test('and there is a limit to how many there are', () => {
    const many = Array.from({ length: MAX_TIMELINE_CUES + 1 }, (): Cue => ({
      at: 0,
      deed: 'spin',
    }))
    expect(timelineProblems(run(many))).not.toEqual([])
  })
})

describe('the grid a cue sits on', () => {
  test('a time snaps to the step, inside the run', () => {
    expect(onBeat(0.33, 2)).toBe(0.35)
    expect(onBeat(-1, 2)).toBe(0)
    expect(onBeat(9, 2)).toBe(2)
  })

  test('and lands on a number that compares equal to itself', () => {
    expect(onBeat(CUE_STEP * 6, 2)).toBe(0.3)
  })
})

describe('the two halves of a cue', () => {
  test('cover every deed a room has, and overlap in nothing', () => {
    expect([...HELD_DEEDS, ...FIRED_DEEDS].sort()).toEqual([...THING_DEEDS].sort())
  })
})
