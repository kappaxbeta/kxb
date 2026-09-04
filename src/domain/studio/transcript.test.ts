import { describe, expect, test } from 'bun:test'
import { hush } from '@/domain/studio/scene'
import { DEFAULT_ACTOR, DEFAULT_SHOT, parseShot, sceneAt, type ShotSpec } from '@/domain/studio/shot'
import { beats, castNames, timecode, transcribe, transcriptFile } from '@/domain/studio/transcript'

/**
 * The transcript is the one export a test can actually look at - everything
 * else the studio produces is pixels - so this is where the shape of a shot's
 * words is pinned down.
 */

const shot: ShotSpec = {
  ...DEFAULT_SHOT,
  duration: 10,
  cast: [
    {
      ...DEFAULT_ACTOR,
      name: '',
      avatar: 'fox',
      actions: [
        { kind: 'move', t: 0, duration: 2.4, x: 3.04, z: -2 },
        { kind: 'talk', t: 2.5, duration: 2, text: 'Are you sure this is the way?' },
      ],
    },
    {
      ...DEFAULT_ACTOR,
      name: '',
      avatar: 'penguin',
      actions: [
        { kind: 'jump', t: 1, duration: 0.6, air: false },
        { kind: 'talk', t: 5, duration: 1.4, text: 'No.' },
      ],
    },
    {
      ...DEFAULT_ACTOR,
      name: '',
      avatar: 'penguin',
      actions: [{ kind: 'emote', t: 6, duration: 3, emote: 27 }],
    },
  ],
}

describe('who a line belongs to', () => {
  test('falls back to the animal when the row has no name', () => {
    expect(castNames(shot)[0]).toBe('fox')
  })

  test('numbers every member of a colliding pair, not just the second', () => {
    expect(castNames(shot).slice(1)).toEqual(['penguin 1', 'penguin 2'])
  })

  test('leaves a name alone when nothing collides with it', () => {
    const named = { ...shot, cast: [{ ...shot.cast[0], name: 'Scout' }, shot.cast[1]] }
    expect(castNames(named)).toEqual(['Scout', 'penguin'])
  })
})

describe('the timeline', () => {
  test('reads as a column of the same width', () => {
    expect(timecode(0)).toBe('0:00.0')
    expect(timecode(3.45)).toBe('0:03.4')
    expect(timecode(61.9)).toBe('1:01.9')
  })

  test('never prints a negative', () => {
    expect(timecode(-2)).toBe('0:00.0')
  })

  test('puts the whole cast in one order, not one order per actor', () => {
    expect(beats(shot, 'script').map((beat) => beat.at)).toEqual([0, 1, 2.5, 5, 6])
  })
})

describe('dialogue only', () => {
  const text = transcribe(shot, 'dialogue', 'Two on a hill')

  test('carries who said what', () => {
    expect(text).toContain('FOX')
    expect(text).toContain('Are you sure this is the way?')
    expect(text).toContain('PENGUIN 1')
    expect(text).toContain('No.')
  })

  test('leaves every verb out', () => {
    expect(text).not.toContain('moves to')
    expect(text).not.toContain('jumps')
    expect(text).not.toContain('emote')
  })

  test('counts the speakers rather than the cast', () => {
    expect(text).toContain('2 lines')
    expect(text).toContain('2 speakers')
  })

  test('says so when nobody speaks', () => {
    expect(transcribe({ ...shot, cast: [] }, 'dialogue')).toContain('Nobody says anything')
  })
})

describe('dialogue with the actions in', () => {
  const text = transcribe(shot, 'script', 'Two on a hill')

  test('keeps the lines', () => {
    expect(text).toContain('Are you sure this is the way?')
  })

  test('turns a verb into a sentence with its coordinates rounded', () => {
    expect(text).toContain('FOX moves to 3.0, -2.0')
  })

  test('gives a length only to the beats whose length the author chose', () => {
    expect(text).toContain('(2.4s)')
    // A jump lasts as long as the arc lasts, so printing it would be printing a
    // constant.
    expect(text).toMatch(/PENGUIN 1 jumps$/m)
  })

  test('prints an emote by its id, because tiles have no names', () => {
    expect(text).toContain('PENGUIN 2 shows emote 27')
  })

  test('runs in time order across the whole cast', () => {
    const lines = text.split('\n').filter((line) => /^\d:\d\d\.\d/.test(line))
    expect(lines.map((line) => line.slice(0, 6))).toEqual([
      '0:00.0',
      '0:01.0',
      '0:02.5',
      '0:05.0',
      '0:06.0',
    ])
  })
})

describe('the file it lands in', () => {
  test('says which of the two readings it is', () => {
    expect(transcriptFile('hilltop', 'dialogue')).toBe('hilltop-dialogue.txt')
    expect(transcriptFile('hilltop', 'script')).toBe('hilltop-script.txt')
  })

  test('has a name even when the field is empty', () => {
    expect(transcriptFile('', 'script')).toBe('shot-script.txt')
  })
})

describe('taking the bubbles out of the picture', () => {
  test('drops the words and keeps everything else', () => {
    const drawn = sceneAt(shot, 3)
    expect(drawn.peeps[0].say).toBe('Are you sure this is the way?')

    const quiet = hush(drawn)
    expect(quiet.peeps[0].say).toBeNull()
    expect(quiet.peeps.map((peep) => peep.x)).toEqual(drawn.peeps.map((peep) => peep.x))
  })

  test('is what the flag on the shot does, so every renderer agrees', () => {
    expect(sceneAt({ ...shot, bubbles: false }, 3).peeps[0].say).toBeNull()
  })

  test('does not take the line out of the document it was written in', () => {
    const quiet = { ...shot, bubbles: false }
    expect(transcribe(quiet, 'dialogue')).toContain('Are you sure this is the way?')
  })

  test('is on unless a link plainly says otherwise', () => {
    expect(parseShot({}).bubbles).toBe(true)
    expect(parseShot({ bubbles: false }).bubbles).toBe(false)
  })
})
