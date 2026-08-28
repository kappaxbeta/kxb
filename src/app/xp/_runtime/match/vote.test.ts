import { describe, expect, test } from 'bun:test'
import { SKIP, voteView } from '@/app/xp/_runtime/match/vote'
import type { Standing } from '@/app/xp/_runtime/match/standings'

/**
 * The vote, as a screen.
 *
 * Checked without a room, like everything else here - and this one earns it
 * twice over, because a panel that shows the wrong count is a panel that
 * changes how somebody votes. Nothing below decides anything; whether a count
 * is a majority is the server's, deliberately, and there is no second copy of
 * that rule to disagree with it.
 */

const standing = (id: string, name: string, over: Partial<Standing> = {}): Standing => ({
  id,
  name,
  kills: 0,
  mine: false,
  here: true,
  out: false,
  ...over,
})

const ROOM: Standing[] = [
  standing('ana', 'Ana'),
  standing('bo', 'Bo', { mine: true }),
  standing('cass', 'Cass'),
]

const AT = Date.parse('2026-08-11T12:00:00.000Z')
const CLOSES = '2026-08-11T12:00:30.000Z'

describe('no vote', () => {
  test('nothing open is null rather than an empty panel', () => {
    expect(voteView({ vote: null, standings: ROOM, me: 'bo', now: AT })).toBeNull()
    expect(voteView({ vote: undefined, standings: ROOM, me: 'bo', now: AT })).toBeNull()
  })
})

describe('who you can pick', () => {
  test('everybody still in, plus nobody', () => {
    const view = voteView({
      vote: { closes: CLOSES, cast: {} },
      standings: ROOM,
      me: 'bo',
      now: AT,
    })!
    expect(view.options.map((option) => option.id)).toEqual(['ana', 'bo', 'cass', SKIP])
  })

  /**
   * Yourself included. It is legal in every game of this kind and occasionally
   * correct, and a list quietly missing one player reads as that player being
   * safe.
   */
  test('yourself among them', () => {
    const view = voteView({ vote: { closes: CLOSES, cast: {} }, standings: ROOM, me: 'bo', now: AT })!
    expect(view.options.some((option) => option.id === 'bo')).toBe(true)
  })

  /**
   * Somebody already out is not an option: the server refuses a vote for them,
   * and an option that is always refused is a trap rather than a choice.
   */
  test('not somebody who is already out', () => {
    const view = voteView({
      vote: { closes: CLOSES, cast: {} },
      standings: [...ROOM, standing('zed', 'Zed', { out: true })],
      me: 'bo',
      now: AT,
    })!
    expect(view.options.map((option) => option.id)).not.toContain('zed')
  })
})

describe('how it is going', () => {
  test('counts are what has been cast', () => {
    const view = voteView({
      vote: { closes: CLOSES, cast: { ana: 'cass', bo: 'cass', cass: SKIP } },
      standings: ROOM,
      me: 'bo',
      now: AT,
    })!
    const votes = Object.fromEntries(view.options.map((option) => [option.id, option.votes]))
    expect(votes).toEqual({ ana: 0, bo: 0, cass: 2, [SKIP]: 1 })
  })

  test('ours is marked, and it is the one we cast', () => {
    const view = voteView({
      vote: { closes: CLOSES, cast: { bo: 'ana' } },
      standings: ROOM,
      me: 'bo',
      now: AT,
    })!
    expect(view.ours).toBe('ana')
    expect(view.options.filter((option) => option.ours).map((option) => option.id)).toEqual(['ana'])
  })

  test('having voted for nobody is still having voted', () => {
    const view = voteView({
      vote: { closes: CLOSES, cast: { bo: SKIP } },
      standings: ROOM,
      me: 'bo',
      now: AT,
    })!
    expect(view.ours).toBe(SKIP)
  })

  test('not having voted is null rather than skip', () => {
    // Two different things: "I choose nobody" and "I have not chosen". A panel
    // that drew them the same way would tell somebody they had voted.
    const view = voteView({ vote: { closes: CLOSES, cast: {} }, standings: ROOM, me: 'bo', now: AT })!
    expect(view.ours).toBeNull()
  })
})

describe('the clock', () => {
  test('whole seconds, rounded up', () => {
    expect(voteView({ vote: { closes: CLOSES, cast: {} }, standings: ROOM, me: 'bo', now: AT })!.left).toBe(30)
    expect(
      voteView({ vote: { closes: CLOSES, cast: {} }, standings: ROOM, me: 'bo', now: AT + 29_500 })!.left,
    ).toBe(1)
  })

  test('past the deadline is zero, not a negative number', () => {
    expect(
      voteView({ vote: { closes: CLOSES, cast: {} }, standings: ROOM, me: 'bo', now: AT + 60_000 })!.left,
    ).toBe(0)
  })

  test('a deadline nobody can parse counts down to nothing rather than to NaN', () => {
    const view = voteView({ vote: { closes: 'soon', cast: {} }, standings: ROOM, me: 'bo', now: AT })!
    expect(view.left).toBe(0)
  })
})

describe('who may cast one', () => {
  test('somebody still in may', () => {
    const view = voteView({ vote: { closes: CLOSES, cast: {} }, standings: ROOM, me: 'bo', now: AT })!
    expect(view.may).toBe(true)
  })

  /**
   * And the panel is still built for them. Watching the room decide is most of
   * what being out is; hiding it would make elimination feel like a
   * disconnection.
   */
  test('somebody out may not, and still gets the panel', () => {
    const view = voteView({
      // Ana voting for herself, which is legal and is the only vote in a room
      // of one standing player and one spectator.
      vote: { closes: CLOSES, cast: { ana: 'ana' } },
      standings: [standing('ana', 'Ana'), standing('bo', 'Bo', { mine: true, out: true })],
      me: 'bo',
      now: AT,
    })!
    expect(view.may).toBe(false)
    expect(view.options.find((option) => option.id === 'ana')?.votes).toBe(1)
  })

  test('a spectator who was never in the match may not', () => {
    const view = voteView({ vote: { closes: CLOSES, cast: {} }, standings: ROOM, me: undefined, now: AT })!
    expect(view.may).toBe(false)
    expect(view.ours).toBeNull()
  })
})
