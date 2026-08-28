import { describe, expect, test } from 'bun:test'
import { decide, initialRadioState, radioDecider } from '@/domain/radio/aggregate'
import { playTrackSchema, trackUrlSchema } from '@/domain/radio/commands'
import type { RadioEvent } from '@/domain/radio/events'
import { PROVIDER_LIST, PROVIDERS } from '@/domain/radio/providers'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

function given(...events: RadioEvent[]) {
  return fold(radioDecider, events)
}

const ADA = '11111111-1111-4111-8111-111111111111'
const TRACK = 'https://soundcloud.com/artist/one'
const OTHER = 'https://soundcloud.com/artist/two'

const started: RadioEvent = {
  type: 'TrackStarted',
  data: { trackUrl: TRACK, title: 'One' },
}

describe('radio evolve', () => {
  test('starting a track puts it on', () => {
    expect(given(started)).toEqual({ trackUrl: TRACK, title: 'One', playing: true, scope: 'space', place: null })
  })

  /**
   * The distinction the whole resume feature rests on: "stopped" keeps the
   * track, "never started" has none. If these two ever collapse into one state,
   * pressing stop becomes indistinguishable from an empty radio and the only
   * way back is to paste the link again.
   */
  test('stopping keeps the track, so it is not the same as an empty radio', () => {
    expect(given(started, { type: 'TrackStopped', data: {} })).toEqual({
      trackUrl: TRACK,
      title: 'One',
      playing: false,
      scope: 'space',
      place: null,
    })
    expect(initialRadioState.trackUrl).toBeNull()
  })

  test('resuming picks the same track back up', () => {
    const state = given(
      started,
      { type: 'TrackStopped', data: {} },
      { type: 'TrackResumed', data: {} },
    )
    expect(state).toEqual({ trackUrl: TRACK, title: 'One', playing: true, scope: 'space', place: null })
  })

  test('a later track replaces the one before it', () => {
    const state = given(started, {
      type: 'TrackStarted',
      data: { trackUrl: OTHER, title: null },
    })
    expect(state).toEqual({ trackUrl: OTHER, title: null, playing: true, scope: 'space', place: null })
  })

  test('an event from a newer deploy is ignored rather than fatal', () => {
    const unknown = { type: 'TrackSkipped', data: {} } as unknown as RadioEvent
    expect(given(started, unknown).playing).toBe(true)
  })
})

describe('radio decide', () => {
  test('any admin can put something on over what is already playing', () => {
    const events = decide(given(started), {
      type: 'PlayTrack',
      actorId: ADA,
      trackUrl: OTHER,
      title: 'Two',
      scope: 'space',
      place: null,
    })
    expect(events).toEqual([
      { type: 'TrackStarted', data: { trackUrl: OTHER, title: 'Two', scope: 'space', place: null } },
    ])
  })

  test('re-playing the track already on is a no-op, so a double click does not restart it', () => {
    expect(
      decide(given(started), { type: 'PlayTrack', actorId: ADA, trackUrl: TRACK, title: 'One', scope: 'space', place: null }),
    ).toEqual([])
  })

  /**
   * The other half of that rule, and the one it would be easy to break while
   * "fixing" the first: pressing play on the track sitting in the box while the
   * radio is off is somebody meaning to start it.
   */
  test('playing the stopped track again starts it rather than doing nothing', () => {
    const state = given(started, { type: 'TrackStopped', data: {} })
    expect(
      decide(state, { type: 'PlayTrack', actorId: ADA, trackUrl: TRACK, title: 'One', scope: 'space', place: null }),
    ).toEqual([{ type: 'TrackStarted', data: { trackUrl: TRACK, title: 'One', scope: 'space', place: null } }])
  })

  test('two admins reaching for stop at once is not an error for the second', () => {
    const state = given(started, { type: 'TrackStopped', data: {} })
    expect(decide(state, { type: 'StopTrack', actorId: ADA })).toEqual([])
  })

  test('resuming an empty radio is refused rather than silently ignored', () => {
    expect(() => decide(initialRadioState, { type: 'ResumeTrack', actorId: ADA })).toThrow(
      DomainError,
    )
  })

  test('resuming something already playing is a no-op', () => {
    expect(decide(given(started), { type: 'ResumeTrack', actorId: ADA })).toEqual([])
  })
})

describe('how far a track reaches', () => {
  const play = (scope: 'space' | 'room', place: string | null) =>
    ({ type: 'PlayTrack', actorId: ADA, trackUrl: TRACK, title: 'One', scope, place }) as const

  test('a track put on in a room records the room', () => {
    expect(decide(initialRadioState, play('room', 'lounge'))).toEqual([
      {
        type: 'TrackStarted',
        data: { trackUrl: TRACK, title: 'One', scope: 'room', place: 'lounge' },
      },
    ])
  })

  /**
   * A place sent alongside a space-wide scope is not an error - it is the
   * client mentioning where its user happens to be standing, which does not
   * apply. Dropped rather than refused, so the row cannot end up carrying a
   * room that nothing consults.
   */
  test('a room is not recorded for a track that plays everywhere', () => {
    const events = decide(initialRadioState, play('space', 'lounge'))
    expect(events[0]?.data).toEqual({ trackUrl: TRACK, title: 'One', scope: 'space', place: null })
  })

  test('narrowing to nowhere is refused rather than played to an empty room', () => {
    expect(() => decide(initialRadioState, play('room', null))).toThrow(DomainError)
  })

  /**
   * The rule that makes the checkbox work. Moving a track between reaches is
   * the same URL twice, so a no-op keyed on the URL alone would swallow it and
   * read as a broken control.
   */
  test('the same track at a different reach is a real change, not a double click', () => {
    const inRoom = given({
      type: 'TrackStarted',
      data: { trackUrl: TRACK, title: 'One', scope: 'room', place: 'lounge' },
    })
    expect(decide(inRoom, play('space', null))).toHaveLength(1)
    expect(decide(inRoom, play('room', 'cafe'))).toHaveLength(1)
    // ...but genuinely identical really is a no-op.
    expect(decide(inRoom, play('room', 'lounge'))).toEqual([])
  })

  /**
   * Every event written before the reach existed meant the whole space. If this
   * ever folds to `room`, old history replays as a radio confined to a room
   * that was never chosen - silence nobody can explain.
   */
  test('history from before the reach existed still means everywhere', () => {
    const old: RadioEvent = { type: 'TrackStarted', data: { trackUrl: TRACK, title: 'One' } }
    expect(given(old).scope).toBe('space')
    expect(given(old).place).toBeNull()
  })
})

/**
 * The URL check is the security boundary of this feature, not input tidying -
 * the value it passes ends up in an iframe `src` for everybody in the space at
 * once. These are the cases that a regex over the raw string gets wrong.
 */
describe('track links', () => {
  test('a plain SoundCloud link is accepted', () => {
    expect(trackUrlSchema.parse(TRACK)).toBe(TRACK)
  })

  test('a host that merely contains soundcloud.com is refused', () => {
    expect(trackUrlSchema.safeParse('https://soundcloud.com.evil.test/a/b').success).toBe(false)
  })

  test('soundcloud.com in a query string does not make it a SoundCloud link', () => {
    expect(trackUrlSchema.safeParse('https://evil.test/?u=soundcloud.com').success).toBe(false)
  })

  test('a javascript: URL is refused', () => {
    expect(trackUrlSchema.safeParse('javascript:alert(1)').success).toBe(false)
  })

  test('plain http is refused even on the right host', () => {
    expect(trackUrlSchema.safeParse('http://soundcloud.com/artist/one').success).toBe(false)
  })

  test('the front page is not a track', () => {
    expect(trackUrlSchema.safeParse('https://soundcloud.com/').success).toBe(false)
  })

  /**
   * The case that produced the bug report. SoundCloud's widget *accepts* a
   * profile URL and plays that artist's queue, so nothing downstream refuses
   * it - it half-works, unsynchronised, under whatever title happens to be
   * first. This is the only place it can be caught.
   */
  test('an artist profile is refused, because it names a queue and not a song', () => {
    const result = trackUrlSchema.safeParse('https://soundcloud.com/wydrob/')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('profile')
    }
  })

  test('...while the track on that profile is fine', () => {
    expect(trackUrlSchema.parse('https://soundcloud.com/wydrob/ily')).toBe(
      'https://soundcloud.com/wydrob/ily',
    )
  })

  test('a playlist is a legitimate thing to put on', () => {
    expect(trackUrlSchema.parse('https://soundcloud.com/wydrob/sets/night')).toBe(
      'https://soundcloud.com/wydrob/sets/night',
    )
  })
})

describe('the other services', () => {
  test('Mixcloud, Audiomack and hearthis links are accepted', () => {
    expect(trackUrlSchema.parse('https://www.mixcloud.com/dj/some-show/')).toBe(
      'https://www.mixcloud.com/dj/some-show/',
    )
    expect(trackUrlSchema.parse('https://audiomack.com/artist/song/track')).toBe(
      'https://audiomack.com/artist/song/track',
    )
    expect(trackUrlSchema.parse('https://hearthis.at/artist/track/')).toBe(
      'https://hearthis.at/artist/track/',
    )
  })

  test('their profile pages are refused too', () => {
    expect(trackUrlSchema.safeParse('https://www.mixcloud.com/dj/').success).toBe(false)
    expect(trackUrlSchema.safeParse('https://hearthis.at/artist/').success).toBe(false)
  })

  test('an unsupported service is named in the refusal rather than just rejected', () => {
    const result = trackUrlSchema.safeParse('https://open.spotify.com/track/abc')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('SoundCloud')
    }
  })

  /**
   * The capability split the help panel is built on. If a future change makes
   * one of these steerable, this test is the reminder that the copy promising
   * "starts at the beginning" has to change with it.
   */
  test('only the two services with a seek API claim to be in step', () => {
    expect(PROVIDERS.soundcloud.synced).toBe(true)
    expect(PROVIDERS.mixcloud.synced).toBe(true)
    expect(PROVIDERS.audiomack.synced).toBe(false)
    expect(PROVIDERS.hearthis.synced).toBe(false)
  })

  test('every embed URL stays on its own service’s host', () => {
    for (const provider of PROVIDER_LIST) {
      const embed = new URL(provider.embedUrl(`https://${provider.hosts[0]}/artist/track`))
      expect(embed.protocol).toBe('https:')
      expect(embed.hostname.endsWith(provider.id === 'hearthis' ? 'hearthis.at' : provider.id + '.com')).toBe(true)
    }
  })

  test('the mobile host and the share shortener are both real links people paste', () => {
    expect(trackUrlSchema.parse('https://m.soundcloud.com/artist/one')).toBe(
      'https://m.soundcloud.com/artist/one',
    )
    expect(trackUrlSchema.parse('https://on.soundcloud.com/aBcDeF')).toBe(
      'https://on.soundcloud.com/aBcDeF',
    )
  })

  /**
   * Share links carry a `si=` parameter identifying whoever copied them. The
   * row this lands in is readable by every member of the space, so the tracking
   * parameter is dropped rather than stored.
   */
  test('share tracking parameters are stripped', () => {
    expect(trackUrlSchema.parse(`${TRACK}?si=abc123&utm_source=clipboard#t=30`)).toBe(TRACK)
  })

  test('a title that is not a string degrades to unnamed rather than failing the command', () => {
    const parsed = playTrackSchema.parse({ trackUrl: TRACK, title: 42 })
    expect(parsed).toEqual({ trackUrl: TRACK, title: null })
  })

  test('an over-long title is refused rather than written into the rail', () => {
    const parsed = playTrackSchema.parse({ trackUrl: TRACK, title: 'x'.repeat(5000) })
    expect(parsed.title).toBeNull()
  })
})
