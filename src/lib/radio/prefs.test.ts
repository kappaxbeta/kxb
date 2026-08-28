import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_RADIO_PREFS,
  mayPlay,
  parseRadioPrefs,
  shouldAsk,
} from '@/lib/radio/prefs'

const TRACK = 'https://soundcloud.com/artist/one'
const OTHER = 'https://soundcloud.com/artist/two'

describe('radio consent', () => {
  test('nobody hears anything until they have said yes', () => {
    expect(mayPlay(DEFAULT_RADIO_PREFS)).toBe(false)
    expect(mayPlay({ consent: 'off', declined: null })).toBe(false)
    expect(mayPlay({ consent: 'on', declined: null })).toBe(true)
  })

  test('the prompt only appears when there is something to play', () => {
    expect(shouldAsk(DEFAULT_RADIO_PREFS, null)).toBe(false)
    expect(shouldAsk(DEFAULT_RADIO_PREFS, TRACK)).toBe(true)
  })

  test('somebody who has already answered is not asked again', () => {
    expect(shouldAsk({ consent: 'on', declined: null }, TRACK)).toBe(false)
    expect(shouldAsk({ consent: 'off', declined: null }, TRACK)).toBe(false)
  })

  /**
   * The pair that makes "not now" mean this song rather than this evening. Get
   * the first wrong and the prompt reappears immediately for the thing just
   * declined; get the second wrong and one refusal silently opts somebody out
   * of everything that follows.
   */
  test('a declined track does not ask again', () => {
    expect(shouldAsk({ consent: 'ask', declined: TRACK }, TRACK)).toBe(false)
  })

  test('but the next track does', () => {
    expect(shouldAsk({ consent: 'ask', declined: TRACK }, OTHER)).toBe(true)
  })
})

describe('parseRadioPrefs', () => {
  /**
   * The direction that matters: anything unrecognisable has to land on `ask`.
   * A corrupt key must never be the thing that decides somebody consented to
   * audio.
   */
  test('rubbish in storage means ask, never yes', () => {
    expect(parseRadioPrefs(null).consent).toBe('ask')
    expect(parseRadioPrefs('on').consent).toBe('ask')
    expect(parseRadioPrefs({ consent: 'yes' }).consent).toBe('ask')
    expect(parseRadioPrefs({ consent: true }).consent).toBe('ask')
  })

  test('a real answer survives the round trip', () => {
    expect(parseRadioPrefs({ consent: 'on', declined: null })).toEqual({
      consent: 'on',
      declined: null,
    })
    expect(parseRadioPrefs({ consent: 'ask', declined: TRACK }).declined).toBe(TRACK)
  })

  test('a non-string declined value is dropped rather than kept', () => {
    expect(parseRadioPrefs({ consent: 'ask', declined: 42 }).declined).toBeNull()
  })
})
