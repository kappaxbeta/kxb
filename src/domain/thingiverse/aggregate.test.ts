import { describe, expect, test } from 'bun:test'
import { freshSpec } from '@/domain/thingiverse/blueprint'
import {
  blueprintDecider,
  decide,
  initialBlueprintState,
} from '@/domain/thingiverse/aggregate'
import type { Asker } from '@/domain/thingiverse/commands'
import type { BlueprintEvent } from '@/domain/thingiverse/events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

const model = 'bedroom/soccer_ball'
const ada = 'a0000000-0000-4000-8000-000000000001'
const sam = 'a0000000-0000-4000-8000-000000000002'

const owner: Asker = { actorId: ada, admin: false }
const stranger: Asker = { actorId: sam, admin: false }
const admin: Asker = { actorId: sam, admin: true }

const drawn: BlueprintEvent = {
  type: 'BlueprintDrawn',
  data: { name: 'Ball', spec: freshSpec(model), ownerId: ada, visibility: 'private' },
}

function given(...events: BlueprintEvent[]) {
  return fold(blueprintDecider, events)
}

describe('drawing', () => {
  test('records the name, the spec and who it belongs to', () => {
    expect(
      decide(initialBlueprintState, {
        type: 'DrawBlueprint',
        by: owner,
        name: '  Ball  ',
        spec: freshSpec(model),
        visibility: 'private',
      }),
    ).toEqual([
      {
        type: 'BlueprintDrawn',
        data: { name: 'Ball', spec: freshSpec(model), ownerId: ada, visibility: 'private' },
      },
    ])
  })

  test('refuses a spec the catalogue does not recognise', () => {
    expect(() =>
      decide(initialBlueprintState, {
        type: 'DrawBlueprint',
        by: owner,
        name: 'Ball',
        spec: freshSpec('nope/nothing'),
        visibility: 'private',
      }),
    ).toThrow(DomainError)
  })

  test('refuses a name of nothing but spaces', () => {
    expect(() =>
      decide(initialBlueprintState, {
        type: 'DrawBlueprint',
        by: owner,
        name: '   ',
        spec: freshSpec(model),
        visibility: 'private',
      }),
    ).toThrow(DomainError)
  })

  test('refuses to draw the same blueprint twice', () => {
    expect(() =>
      decide(given(drawn), {
        type: 'DrawBlueprint',
        by: owner,
        name: 'Ball',
        spec: freshSpec(model),
        visibility: 'private',
      }),
    ).toThrow(DomainError)
  })
})

describe('whose it is', () => {
  test('somebody else cannot reshape it', () => {
    expect(() =>
      decide(given(drawn), {
        type: 'ReshapeBlueprint',
        by: stranger,
        spec: { ...freshSpec(model), blocking: false },
      }),
    ).toThrow(DomainError)
  })

  test('an admin can, because somebody has to tidy up after a member who left', () => {
    expect(
      decide(given(drawn), {
        type: 'ReshapeBlueprint',
        by: admin,
        spec: { ...freshSpec(model), blocking: false },
      }),
    ).toHaveLength(1)
  })

  test('handing it over moves the permission with it', () => {
    const handed = given(drawn, {
      type: 'BlueprintHandedOver',
      data: { ownerId: sam, formerOwnerId: ada },
    })

    expect(handed.ownerId).toBe(sam)
    expect(() =>
      decide(handed, { type: 'RenameBlueprint', by: owner, name: 'Mine again' }),
    ).toThrow(DomainError)
  })

  test('handing it to whoever already has it records nothing', () => {
    expect(decide(given(drawn), { type: 'HandOverBlueprint', by: owner, ownerId: ada })).toEqual(
      [],
    )
  })
})

describe('changing it', () => {
  test('saving a panel nobody touched records nothing', () => {
    expect(
      decide(given(drawn), { type: 'ReshapeBlueprint', by: owner, spec: freshSpec(model) }),
    ).toEqual([])
  })

  test('renaming it to what it is called records nothing', () => {
    expect(decide(given(drawn), { type: 'RenameBlueprint', by: owner, name: 'Ball' })).toEqual(
      [],
    )
  })

  test('publishing is one event with a value, so the state is one read', () => {
    const published = given(drawn, {
      type: 'BlueprintVisibilitySet',
      data: { visibility: 'public' },
    })

    expect(published.visibility).toBe('public')
    expect(
      decide(published, {
        type: 'SetBlueprintVisibility',
        by: owner,
        visibility: 'public',
      }),
    ).toEqual([])
  })
})

describe('retiring', () => {
  test('is soft, and one way', () => {
    const retired = given(drawn, { type: 'BlueprintRetired', data: {} })

    expect(retired.status).toBe('retired')
    expect(decide(retired, { type: 'RetireBlueprint', by: owner })).toEqual([])
    expect(() =>
      decide(retired, { type: 'RenameBlueprint', by: owner, name: 'Back' }),
    ).toThrow(DomainError)
  })

  test('a blueprint nobody drew cannot be retired', () => {
    expect(() =>
      decide(initialBlueprintState, { type: 'RetireBlueprint', by: owner }),
    ).toThrow(DomainError)
  })
})
