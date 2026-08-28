import { describe, expect, test } from 'bun:test'
import {
  CHATTER_GAP_MS,
  CHATTER_HELLO_MS,
  CHATTER_STAGGER_MS,
  speak,
  startChatter,
} from '@/domain/world/chatter'

const SCRIPT = {
  greeting: 'Welcome! Cool you made it',
  lines: ['one', 'two'],
}

/** Walk the schedule forward, collecting everything that was actually said. */
function run(times: number[], company = true) {
  let chatter = startChatter()
  const said: { at: number; text: string }[] = []

  for (const now of times) {
    const result = speak(chatter, { company, now, ...SCRIPT })
    chatter = result.chatter
    if (result.text) said.push({ at: now, text: result.text })
  }

  return { said, chatter }
}

describe('speak', () => {
  test('says nothing to an empty room, however long it waits', () => {
    const { said } = run([0, 5_000, 60_000, 600_000], false)
    expect(said).toEqual([])
  })

  test('greets once company arrives, after the hello delay', () => {
    const { said } = run([0, CHATTER_HELLO_MS - 1, CHATTER_HELLO_MS])
    expect(said.map((line) => line.text)).toEqual([SCRIPT.greeting])
    expect(said[0]?.at).toBe(CHATTER_HELLO_MS)
  })

  test('never greets twice, however long somebody stands there', () => {
    const { said } = run([0, CHATTER_HELLO_MS, 60_000, 120_000, 600_000])
    expect(said.filter((line) => line.text === SCRIPT.greeting).length).toBe(1)
  })

  test('cycles the idle lines rather than repeating one', () => {
    const at = [0, CHATTER_HELLO_MS]
    for (let step = 1; step <= 4; step++) {
      at.push(CHATTER_HELLO_MS + step * CHATTER_GAP_MS)
    }

    const { said } = run(at)
    expect(said.map((line) => line.text)).toEqual([
      SCRIPT.greeting,
      'one',
      'two',
      'one',
      'two',
    ])
  })

  test('holds its tongue inside the gap', () => {
    const { said } = run([
      0,
      CHATTER_HELLO_MS,
      CHATTER_HELLO_MS + CHATTER_GAP_MS - 1,
    ])
    expect(said.length).toBe(1)
  })

  /**
   * The one that motivated pulling this out of the frame loop: an appointment
   * made while somebody was standing here must not fire the instant the next
   * person walks up, or the second visitor is talked at immediately.
   */
  test('goes quiet when left alone and waits again on the next arrival', () => {
    let chatter = startChatter()

    for (const now of [0, CHATTER_HELLO_MS]) {
      chatter = speak(chatter, { company: true, now, ...SCRIPT }).chatter
    }

    // Nobody about for a while - long enough that the next line was due.
    chatter = speak(chatter, { company: false, now: 20_000, ...SCRIPT }).chatter
    expect(chatter.hadCompany).toBe(false)

    // Somebody walks back in. The line that was due does not fire on the frame
    // they arrive.
    const arrival = speak(chatter, { company: true, now: 100_000, ...SCRIPT })
    expect(arrival.text).toBeNull()

    const later = speak(arrival.chatter, {
      company: true,
      now: 100_000 + CHATTER_GAP_MS,
      ...SCRIPT,
    })
    expect(later.text).toBe('one')
  })

  test('does not greet a second visitor who has already been greeted', () => {
    let chatter = startChatter()
    for (const now of [0, CHATTER_HELLO_MS]) {
      chatter = speak(chatter, { company: true, now, ...SCRIPT }).chatter
    }

    chatter = speak(chatter, { company: false, now: 20_000, ...SCRIPT }).chatter

    const said: string[] = []
    for (const now of [100_000, 100_000 + CHATTER_GAP_MS]) {
      const result = speak(chatter, { company: true, now, ...SCRIPT })
      chatter = result.chatter
      if (result.text) said.push(result.text)
    }

    expect(said).not.toContain(SCRIPT.greeting)
  })

  test('two bodies do not greet on the same frame', () => {
    const first = speak(startChatter(0), { company: true, now: 0, ...SCRIPT }).chatter
    const second = speak(startChatter(1), { company: true, now: 0, ...SCRIPT }).chatter

    expect(second.nextAt - first.nextAt).toBe(CHATTER_STAGGER_MS)
  })

  test('a body with nothing to say after hello simply stops', () => {
    let chatter = startChatter()
    const said: string[] = []

    for (const now of [0, CHATTER_HELLO_MS, 60_000, 120_000]) {
      const result = speak(chatter, {
        company: true,
        now,
        greeting: SCRIPT.greeting,
        lines: [],
      })
      chatter = result.chatter
      if (result.text) said.push(result.text)
    }

    expect(said).toEqual([SCRIPT.greeting])
  })
})
