import { describe, expect, test } from 'bun:test'
import { decide, evolve, initialRoomState, type RoomState } from '@/domain/rooms/aggregate'
import type { RoomEvent } from '@/domain/rooms/events'
import { DomainError } from '@/es/errors'

const ACTOR = '11111111-1111-4111-8111-111111111111'

/** Fold a history down to the state it produces, the way the store does. */
function stateAfter(events: RoomEvent[]): RoomState {
  return events.reduce(evolve, initialRoomState)
}

const opened: RoomEvent[] = [
  {
    type: 'RoomCreated',
    data: { name: 'The workshop', createdBy: ACTOR, visibility: 'open' },
  },
]

describe('opening a room', () => {
  test('a fresh stream becomes an open room with a name', () => {
    const events = decide(initialRoomState, {
      type: 'CreateRoom',
      actorId: ACTOR,
      name: 'The workshop',
      visibility: 'open',
    })

    expect(events).toEqual([
      {
        type: 'RoomCreated',
        data: { name: 'The workshop', createdBy: ACTOR, visibility: 'open' },
      },
    ])
    expect(stateAfter(events).status).toBe('open')
  })

  /**
   * The id is minted fresh by the action, so a second CreateRoom on the same
   * stream is a uuid collision rather than somebody retrying - and quietly
   * accepting it would rename a room full of people's work.
   */
  test('is refused on a stream that already has a room', () => {
    expect(() =>
      decide(stateAfter(opened), {
        type: 'CreateRoom',
        actorId: ACTOR,
        name: 'Another',
        visibility: 'open',
      }),
    ).toThrow(DomainError)
  })
})

describe('renaming', () => {
  test('records the new name', () => {
    const events = decide(stateAfter(opened), {
      type: 'RenameRoom',
      actorId: ACTOR,
      name: 'The quiet room',
    })

    expect(events).toEqual([{ type: 'RoomRenamed', data: { name: 'The quiet room' } }])
  })

  /** Nothing happened, so nothing goes in the log. */
  test('renaming to the name it already has appends nothing', () => {
    expect(
      decide(stateAfter(opened), {
        type: 'RenameRoom',
        actorId: ACTOR,
        name: 'The workshop',
      }),
    ).toEqual([])
  })

  test('a room that was never opened is not found', () => {
    expect(() =>
      decide(initialRoomState, { type: 'RenameRoom', actorId: ACTOR, name: 'Anything' }),
    ).toThrow(DomainError)
  })

  test('a closed room refuses to be renamed', () => {
    const closed = stateAfter([...opened, { type: 'RoomClosed', data: {} }])
    expect(() =>
      decide(closed, { type: 'RenameRoom', actorId: ACTOR, name: 'Anything' }),
    ).toThrow(DomainError)
  })
})

describe('closing', () => {
  test('closes an open room', () => {
    const events = decide(stateAfter(opened), { type: 'CloseRoom', actorId: ACTOR })
    expect(events).toEqual([{ type: 'RoomClosed', data: {} }])
    expect(stateAfter([...opened, ...events]).status).toBe('closed')
  })

  /**
   * Idempotent rather than an error: the caller wanted it shut, and it is shut.
   * A second click on a button whose page has not caught up should not produce
   * an error message about something that is already true.
   */
  test('closing a closed room appends nothing and does not throw', () => {
    const closed = stateAfter([...opened, { type: 'RoomClosed', data: {} }])
    expect(decide(closed, { type: 'CloseRoom', actorId: ACTOR })).toEqual([])
  })

  test('a room that was never opened is not found', () => {
    expect(() => decide(initialRoomState, { type: 'CloseRoom', actorId: ACTOR })).toThrow(
      DomainError,
    )
  })
})

describe('who the room is listed to', () => {
  test('a room opened unlisted stays unlisted', () => {
    const events = decide(initialRoomState, {
      type: 'CreateRoom',
      actorId: ACTOR,
      name: 'Quiet corner',
      visibility: 'private',
    })

    expect(stateAfter(events).visibility).toBe('private')
  })

  test('can be hidden after the fact', () => {
    const events = decide(stateAfter(opened), {
      type: 'SetRoomVisibility',
      actorId: ACTOR,
      visibility: 'private',
    })

    expect(events).toEqual([
      { type: 'RoomVisibilitySet', data: { visibility: 'private' } },
    ])
  })

  /** Already what it is, so nothing happened and nothing is logged. */
  test('setting it to what it already is appends nothing', () => {
    expect(
      decide(stateAfter(opened), {
        type: 'SetRoomVisibility',
        actorId: ACTOR,
        visibility: 'open',
      }),
    ).toEqual([])
  })

  /**
   * Every room opened before rooms had a visibility was listed to the whole
   * space, so an event with no visibility on it has to keep reading that way -
   * hiding people's rooms on deploy would look like they had been deleted.
   */
  test('an event written before visibility existed reads as listed', () => {
    const legacy = stateAfter([
      // Deliberately missing the field, as the old writer produced it.
      { type: 'RoomCreated', data: { name: 'Old', createdBy: ACTOR } } as RoomEvent,
    ])

    expect(legacy.visibility).toBe('open')
  })
})

describe('what the room is for', () => {
  /**
   * The default that makes this a no-op for the rooms already standing: the
   * page rendered them creative with no switch at all, so any other answer
   * would deploy as "somebody turned fighting on in every room overnight".
   */
  test('a room opens creative', () => {
    expect(stateAfter(opened).mode).toBe('creative')
  })

  test('can be switched to battle', () => {
    const events = decide(stateAfter(opened), {
      type: 'SetRoomMode',
      actorId: ACTOR,
      mode: 'battle',
    })

    expect(events).toEqual([{ type: 'RoomModeSet', data: { mode: 'battle' } }])
    expect(stateAfter([...opened, ...events]).mode).toBe('battle')
  })

  /**
   * The switch is a toggle inside a live scene, so this is the no-op rule that
   * matters most here: a double-click must not put two events in the log
   * saying the same thing.
   */
  test('setting it to what it already is appends nothing', () => {
    expect(
      decide(stateAfter(opened), { type: 'SetRoomMode', actorId: ACTOR, mode: 'creative' }),
    ).toEqual([])
  })

  test('and back again', () => {
    const battling = stateAfter([
      ...opened,
      { type: 'RoomModeSet', data: { mode: 'battle' } },
    ])

    expect(decide(battling, { type: 'SetRoomMode', actorId: ACTOR, mode: 'creative' })).toEqual(
      [{ type: 'RoomModeSet', data: { mode: 'creative' } }],
    )
  })

  /** A room nobody can walk into is not a room whose mode means anything. */
  test('is refused on a closed room', () => {
    const closed = stateAfter([...opened, { type: 'RoomClosed', data: {} }])

    expect(() =>
      decide(closed, { type: 'SetRoomMode', actorId: ACTOR, mode: 'battle' }),
    ).toThrow(DomainError)
  })
})

describe('the name a room answers to', () => {
  /**
   * The read model is rebuilt by replaying, so the last rename has to win no
   * matter how many came before it.
   */
  test('is whatever it was last renamed to', () => {
    const state = stateAfter([
      ...opened,
      { type: 'RoomRenamed', data: { name: 'Second' } },
      { type: 'RoomRenamed', data: { name: 'Third' } },
    ])

    expect(state.name).toBe('Third')
    // And it still remembers who opened it - that survives every rename.
    expect(state.createdBy).toBe(ACTOR)
  })
})

describe('how many fit in a room', () => {
  /**
   * `null` is the answer for every room standing today, and it has to survive
   * being read back rather than becoming a number - it is what defers to the
   * event's own `room_cap`.
   */
  test('a room starts with no opinion of its own', () => {
    expect(stateAfter(opened).cap).toBeNull()
  })

  test('a cap is remembered, and the last one wins', () => {
    const state = stateAfter([
      ...opened,
      { type: 'RoomCapSet', data: { cap: 20 } },
      { type: 'RoomCapSet', data: { cap: 6 } },
    ])

    expect(state.cap).toBe(6)
  })

  test('setting the cap it already has is not an event', () => {
    const state = stateAfter([...opened, { type: 'RoomCapSet', data: { cap: 12 } }])

    expect(decide(state, { type: 'SetRoomCap', actorId: ACTOR, cap: 12 })).toEqual([])
  })

  /**
   * Clearing is a real change, not a no-op, and this is the test that would
   * catch it being modelled as an optional field: `null` and "absent" would
   * then be the same request, and a room could never be handed back to the
   * event once it had a number.
   */
  test('clearing a cap is a change', () => {
    const state = stateAfter([...opened, { type: 'RoomCapSet', data: { cap: 12 } }])

    expect(decide(state, { type: 'SetRoomCap', actorId: ACTOR, cap: null })).toEqual([
      { type: 'RoomCapSet', data: { cap: null } },
    ])
  })

  test('a closed room takes no more settings', () => {
    const closed = stateAfter([...opened, { type: 'RoomClosed', data: {} }])

    expect(() =>
      decide(closed, { type: 'SetRoomCap', actorId: ACTOR, cap: 10 }),
    ).toThrow(DomainError)
  })
})

describe('whether guests may build in a room', () => {
  /**
   * Open by default, because this switch only ever *narrows* the event's
   * answer - the space-wide `build` capability is checked first in
   * `event_guest_may_build()`. A room defaulting to closed would mean every
   * room an event pre-created had to be switched on by hand before anybody
   * could put a block down.
   */
  test('a room allows building until somebody says otherwise', () => {
    expect(stateAfter(opened).guestBuild).toBe(true)
  })

  test('turning it off is remembered', () => {
    const events = decide(stateAfter(opened), {
      type: 'SetRoomGuestBuild',
      actorId: ACTOR,
      allowed: false,
    })

    expect(events).toEqual([{ type: 'RoomGuestBuildSet', data: { allowed: false } }])
    expect(stateAfter([...opened, ...events]).guestBuild).toBe(false)
  })

  test('setting it to what it already is is not an event', () => {
    expect(
      decide(stateAfter(opened), {
        type: 'SetRoomGuestBuild',
        actorId: ACTOR,
        allowed: true,
      }),
    ).toEqual([])
  })
})

/**
 * How a room sits in the Places list: the space's pin, and its group.
 *
 * Both are decisions somebody made on behalf of everybody, which is why they
 * are here rather than in `room_marks` - a member's own pin is not in the log
 * at all. See the notes on `RoomPinSet` and `RoomGroupSet`.
 */
describe('where a room sits in the list', () => {
  test('a room opens unpinned and ungrouped', () => {
    expect(stateAfter(opened).pinned).toBe(false)
    expect(stateAfter(opened).group).toBeNull()
  })

  test('pinning is remembered', () => {
    const events = decide(stateAfter(opened), {
      type: 'SetRoomPinned',
      actorId: ACTOR,
      pinned: true,
    })

    expect(events).toEqual([{ type: 'RoomPinSet', data: { pinned: true } }])
    expect(stateAfter([...opened, ...events]).pinned).toBe(true)
  })

  /**
   * The read model orders the pinned band by *when* the pin landed, so a second
   * event saying nothing new would visibly move the room to the back of it.
   * That is the failure this idempotence is protecting against, rather than a
   * tidy log for its own sake.
   */
  test('pinning a pinned room is not a second event', () => {
    const pinned = [...opened, { type: 'RoomPinSet' as const, data: { pinned: true } }]

    expect(
      decide(stateAfter(pinned), { type: 'SetRoomPinned', actorId: ACTOR, pinned: true }),
    ).toEqual([])
  })

  test('a caption is remembered, and the last one wins', () => {
    const first = decide(stateAfter(opened), {
      type: 'SetRoomGroup',
      actorId: ACTOR,
      group: 'Design',
    })
    const second = decide(stateAfter([...opened, ...first]), {
      type: 'SetRoomGroup',
      actorId: ACTOR,
      group: 'Product',
    })

    expect(stateAfter([...opened, ...first, ...second]).group).toBe('Product')
  })

  test('taking a room out of its group is a change', () => {
    const grouped = [
      ...opened,
      { type: 'RoomGroupSet' as const, data: { group: 'Design' } },
    ]

    expect(
      decide(stateAfter(grouped), { type: 'SetRoomGroup', actorId: ACTOR, group: null }),
    ).toEqual([{ type: 'RoomGroupSet', data: { group: null } }])
  })

  test('a closed room takes neither', () => {
    const closed = stateAfter([...opened, { type: 'RoomClosed', data: {} }])

    expect(() =>
      decide(closed, { type: 'SetRoomPinned', actorId: ACTOR, pinned: true }),
    ).toThrow()
    expect(() =>
      decide(closed, { type: 'SetRoomGroup', actorId: ACTOR, group: 'Design' }),
    ).toThrow()
  })
})

/**
 * The face a room wears: a glyph, and the colour it is drawn in.
 *
 * Two settings and two events, which is the shape every setting in this
 * aggregate has - they are picked in one panel, and that is a fact about a
 * panel. Recolouring a room must not append an event claiming its icon was set
 * to what it already was.
 */
describe('what a room looks like', () => {
  test('a room opens with neither', () => {
    expect(stateAfter(opened).icon).toBeNull()
    expect(stateAfter(opened).tint).toBeNull()
  })

  test('an icon and a colour are two changes', () => {
    const icon = decide(stateAfter(opened), {
      type: 'SetRoomIcon',
      actorId: ACTOR,
      icon: 'ball',
    })
    const tint = decide(stateAfter([...opened, ...icon]), {
      type: 'SetRoomTint',
      actorId: ACTOR,
      tint: 'lime',
    })

    expect(icon).toEqual([{ type: 'RoomIconSet', data: { icon: 'ball' } }])
    expect(tint).toEqual([{ type: 'RoomTintSet', data: { tint: 'lime' } }])

    const state = stateAfter([...opened, ...icon, ...tint])
    expect(state.icon).toBe('ball')
    expect(state.tint).toBe('lime')
  })

  /**
   * The commonest thing anybody does with a grid of twenty-five buttons is
   * click the one that is already chosen.
   */
  test('picking the icon it already wears is not an event', () => {
    const worn = [...opened, { type: 'RoomIconSet' as const, data: { icon: 'ball' } }]

    expect(
      decide(stateAfter(worn), { type: 'SetRoomIcon', actorId: ACTOR, icon: 'ball' }),
    ).toEqual([])
  })

  test('taking the colour off again is a change', () => {
    const worn = [...opened, { type: 'RoomTintSet' as const, data: { tint: 'lime' } }]

    expect(
      decide(stateAfter(worn), { type: 'SetRoomTint', actorId: ACTOR, tint: null }),
    ).toEqual([{ type: 'RoomTintSet', data: { tint: null } }])
  })
})

/**
 * A round, in a room that is a level.
 *
 * A board game is not a lounge: people gather, somebody deals, and the table is
 * closed until the hand is over. These are the rules that make that safe to
 * press - both directions are idempotent, and a lounge room has no round.
 */
describe('a round', () => {
  const LEVEL: RoomEvent = {
    type: 'RoomCreated',
    data: { name: 'Cliffside', createdBy: ACTOR, visibility: 'open', xpRef: 'sidestep' },
  }
  const OTHER = '22222222-2222-4222-8222-222222222222'
  const NOW = '2026-08-11T12:00:00.000Z'

  test('dealing closes the door', () => {
    expect(
      decide(stateAfter([LEVEL]), { type: 'StartRound', actorId: OTHER, now: NOW }),
    ).toEqual([{ type: 'RoundStarted', data: { at: NOW, by: OTHER } }])
  })

  /**
   * Two people pressing Start within a second of each other is the ordinary
   * case at a table, and the second deserves the thing they wanted rather than
   * a red line about who was faster.
   */
  test('dealing twice is not an error', () => {
    const dealt = stateAfter([LEVEL, { type: 'RoundStarted', data: { at: NOW, by: ACTOR } }])
    expect(decide(dealt, { type: 'StartRound', actorId: OTHER, now: NOW })).toEqual([])
  })

  test('anybody may reopen, not only whoever dealt', () => {
    const dealt = stateAfter([LEVEL, { type: 'RoundStarted', data: { at: NOW, by: ACTOR } }])
    expect(decide(dealt, { type: 'ReopenRound', actorId: OTHER })).toEqual([
      { type: 'RoundReopened', data: { by: OTHER } },
    ])
  })

  test('reopening a room nobody dealt in does nothing', () => {
    expect(decide(stateAfter([LEVEL]), { type: 'ReopenRound', actorId: OTHER })).toEqual([])
  })

  /**
   * A lounge room has nothing a round would mean, and a Start on one would shut
   * the door for a reason nobody in it could name.
   */
  test('an ordinary room has no round to start', () => {
    const lounge = stateAfter([
      {
        type: 'RoomCreated',
        data: { name: 'Hall', createdBy: ACTOR, visibility: 'open' },
      },
    ])
    expect(() =>
      decide(lounge, { type: 'StartRound', actorId: OTHER, now: NOW }),
    ).toThrow(DomainError)
  })

  test('a round leaves the room when it is reopened', () => {
    const state = stateAfter([
      LEVEL,
      { type: 'RoundStarted', data: { at: NOW, by: ACTOR } },
      { type: 'RoundReopened', data: { by: OTHER } },
    ])
    expect(state.roundStartedAt).toBeNull()
  })
})

describe('another game in the slot', () => {
  const LEVEL: RoomEvent = {
    type: 'RoomCreated',
    data: { name: 'Cliffside', createdBy: ACTOR, visibility: 'open', xpRef: 'sidestep' },
  }
  const OTHER = '22222222-2222-4222-8222-222222222222'
  const NOW = '2026-08-11T12:00:00.000Z'

  test('a level room can be pointed at another level', () => {
    const events = decide(stateAfter([LEVEL]), {
      type: 'SetRoomXp',
      actorId: ACTOR,
      xpRef: 'trench',
    })

    expect(events).toEqual([{ type: 'RoomXpSet', data: { xpRef: 'trench' } }])
    expect(stateAfter([LEVEL, ...events]).xpRef).toBe('trench')
  })

  /**
   * The half of `RoomCreated`'s rule that still stands: a room full of blocks
   * that became a level would strand the blocks, and there is no event that
   * clears the reference, so the swap can only ever be level to level.
   */
  test('an ordinary room cannot be turned into a level', () => {
    expect(() =>
      decide(stateAfter(opened), { type: 'SetRoomXp', actorId: ACTOR, xpRef: 'trench' }),
    ).toThrow(DomainError)
  })

  test('swapping in the level it already plays is not an event', () => {
    expect(
      decide(stateAfter([LEVEL]), { type: 'SetRoomXp', actorId: ACTOR, xpRef: 'sidestep' }),
    ).toEqual([])
  })

  /**
   * The door is shut on a hand that is no longer being dealt the moment the
   * level changes, so the swap ends the round. Without this, changing the game
   * would leave a room nobody could get into, waiting out a game nobody is
   * playing.
   */
  test('a round in play ends when the game changes', () => {
    const dealt = stateAfter([LEVEL, { type: 'RoundStarted', data: { at: NOW, by: ACTOR } }])

    expect(decide(dealt, { type: 'SetRoomXp', actorId: OTHER, xpRef: 'trench' })).toEqual([
      { type: 'RoundReopened', data: { by: OTHER } },
      { type: 'RoomXpSet', data: { xpRef: 'trench' } },
    ])
  })

  /** A no-op swap is a no-op, including the reopen it would otherwise smuggle in. */
  test('the round survives a swap that changes nothing', () => {
    const dealt = stateAfter([LEVEL, { type: 'RoundStarted', data: { at: NOW, by: ACTOR } }])

    expect(decide(dealt, { type: 'SetRoomXp', actorId: OTHER, xpRef: 'sidestep' })).toEqual([])
  })

  /**
   * The door's number comes from the level - see `CreateRoom` - so a slot that
   * held a game for eight and now holds one for four has to stop admitting the
   * fifth. Through `RoomCapSet` rather than a field, so a room capped by a swap
   * and one capped by hand are the same room.
   */
  test('the cap follows the level in', () => {
    const wide = stateAfter([LEVEL, { type: 'RoomCapSet', data: { cap: 8 } }])

    expect(
      decide(wide, { type: 'SetRoomXp', actorId: ACTOR, xpRef: 'trench', cap: 4 }),
    ).toEqual([
      { type: 'RoomXpSet', data: { xpRef: 'trench' } },
      { type: 'RoomCapSet', data: { cap: 4 } },
    ])
  })

  test('a cap the room already has is not set again', () => {
    const wide = stateAfter([LEVEL, { type: 'RoomCapSet', data: { cap: 4 } }])

    expect(
      decide(wide, { type: 'SetRoomXp', actorId: ACTOR, xpRef: 'trench', cap: 4 }),
    ).toEqual([{ type: 'RoomXpSet', data: { xpRef: 'trench' } }])
  })

  test('a closed room plays nothing new', () => {
    const closed = stateAfter([LEVEL, { type: 'RoomClosed', data: {} }])

    expect(() =>
      decide(closed, { type: 'SetRoomXp', actorId: ACTOR, xpRef: 'trench' }),
    ).toThrow(DomainError)
  })
})
