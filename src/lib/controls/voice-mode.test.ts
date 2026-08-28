import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_VOICE_MODE,
  micIsLive,
  parseVoiceMode,
  PUSH_TO_TALK_KEY,
  type VoiceMode,
} from '@/lib/controls/voice-mode'

describe('parseVoiceMode', () => {
  test('takes the two words it knows', () => {
    expect(parseVoiceMode('push')).toBe('push')
    expect(parseVoiceMode('open')).toBe('open')
  })

  test('anything else is unset rather than a guess', () => {
    for (const junk of [null, undefined, '', 'PUSH', 'ptt', 1, {}]) {
      expect(parseVoiceMode(junk)).toBeNull()
    }
  })
})

describe('the default', () => {
  test('is push to talk, because the two failures are not symmetric', () => {
    // Wanting open mic and getting push-to-talk is an annoyance. Wanting
    // push-to-talk and getting open mic is a room broadcast to strangers.
    expect(DEFAULT_VOICE_MODE).toBe('push')
  })

  test('does not collide with a key the lounge already spends', () => {
    const taken = [
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft',
      'KeyE', 'KeyR', 'KeyG', 'KeyH', 'KeyV', 'KeyO', 'KeyL', 'KeyF', 'KeyQ',
    ]
    expect(taken).not.toContain(PUSH_TO_TALK_KEY)
  })
})

describe('micIsLive', () => {
  const modes: VoiceMode[] = ['push', 'open']

  test('the switch being off is the end of it, in either mode', () => {
    for (const mode of modes) {
      expect(micIsLive({ mode, enabled: false, pushing: false })).toBe(false)
      // Holding the key with the mic switched off must not open anything.
      expect(micIsLive({ mode, enabled: false, pushing: true })).toBe(false)
    }
  })

  test('open mic is live as soon as it is switched on', () => {
    expect(micIsLive({ mode: 'open', enabled: true, pushing: false })).toBe(true)
  })

  test('push to talk is silent until the key is held', () => {
    expect(micIsLive({ mode: 'push', enabled: true, pushing: false })).toBe(false)
    expect(micIsLive({ mode: 'push', enabled: true, pushing: true })).toBe(true)
  })

  test('a stuck key cannot outlive the switch', () => {
    // The window-blur handler releases the key, but the switch is the backstop:
    // whatever `pushing` claims, off is off.
    expect(micIsLive({ mode: 'push', enabled: false, pushing: true })).toBe(false)
  })
})
