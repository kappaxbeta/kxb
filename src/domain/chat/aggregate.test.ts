import { describe, expect, test } from 'bun:test'

/** A room id, for the messages that name one. */
const ROOM = '11111111-2222-3333-4444-555555555555'
import {
  chatDecider,
  decide,
  initialChatMessageState,
} from '@/domain/chat/aggregate'
import { type ChatEvent, roomOf } from '@/domain/chat/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

function given(...events: ChatEvent[]) {
  return fold(chatDecider, events)
}

const ADA = '11111111-1111-4111-8111-111111111111'

const posted: ChatEvent = {
  type: 'MessagePosted',
  data: { body: 'anybody up for football', authorName: 'ada' },
}

describe('chat evolve', () => {
  test('a message carries the name its author had at the time', () => {
    expect(given(posted)).toEqual({
      status: 'said',
      body: 'anybody up for football',
      authorName: 'ada',
    })
  })

  test('an event from a newer deploy is ignored rather than fatal', () => {
    const unknown = { type: 'MessageTranslated', data: {} } as unknown as ChatEvent
    expect(given(posted, unknown).status).toBe('said')
  })

  /**
   * A takedown is not on this stream and must never be folded off it - see the
   * note on ChatEvent. If somebody later adds a `MessageHidden` event here, this
   * is the test that should make them explain why the platform's verdict is
   * being written somewhere the moderated space can append to.
   */
  test('a message that was taken down still reads as said', () => {
    const takedown = { type: 'MessageHidden', data: {} } as unknown as ChatEvent
    expect(given(posted, takedown).status).toBe('said')
  })
})

describe('chat decide', () => {
  test('says it once', () => {
    expect(
      decide(initialChatMessageState, {
        type: 'PostMessage',
        actorId: ADA,
        body: 'hello',
        authorName: 'ada',
      }),
    ).toEqual([
      { type: 'MessagePosted', data: { body: 'hello', authorName: 'ada' } },
    ])
  })

  /**
   * The migration in one test.
   *
   * A message said in the lounge writes an event with no `roomId` at all, which
   * is what makes every event in the log from before rooms had conversations
   * indistinguishable from one written now - and so what makes the whole change
   * backfill-free. `toEqual` is exact about absent keys, which is the property
   * being asserted.
   */
  test('a message in the lounge names no room', () => {
    const [event] = decide(initialChatMessageState, {
      type: 'PostMessage',
      actorId: ADA,
      body: 'hello',
      authorName: 'ada',
    })
    expect(event!.data).toEqual({ body: 'hello', authorName: 'ada' })
    expect('roomId' in event!.data).toBe(false)
  })

  test('a message in a room names it', () => {
    const [event] = decide(initialChatMessageState, {
      type: 'PostMessage',
      actorId: ADA,
      body: 'hello',
      authorName: 'ada',
      roomId: ROOM,
    })
    expect(event!.data).toEqual({ body: 'hello', authorName: 'ada', roomId: ROOM })
  })

  test('roomOf reads the lounge out of an event that names no room', () => {
    expect(roomOf({})).toBeNull()
    expect(roomOf({ roomId: ROOM })).toBe(ROOM)
  })

  /**
   * The reason the stream id is minted by the action and the reason this throws
   * are the same reason: a second PostMessage on a stream that already holds one
   * is a collision, and overwriting a sentence somebody else said is the outcome
   * worth refusing outright rather than resolving.
   */
  test('refuses to write over a message that is already there', () => {
    expect(() =>
      decide(given(posted), {
        type: 'PostMessage',
        actorId: ADA,
        body: 'something else entirely',
        authorName: 'mallory',
      }),
    ).toThrow(DomainError)
  })
})
