import { describe, expect, test } from 'bun:test'
import {
  MAX_SUMMON_MATCHES,
  nameForModel,
  resolveSummon,
  type Summonable,
} from '@/domain/thingiverse/summon'

const mine: Summonable = {
  id: 'a1',
  name: 'Ball',
  model: 'bedroom/soccer_ball',
  mine: true,
}
const theirs: Summonable = {
  id: 'a2',
  name: 'Ball',
  model: 'cafe/dough_ball',
  mine: false,
}

describe('what /thingiverse ball means', () => {
  test('nothing, when nothing was typed - that is a request to open the shelf', () => {
    expect(resolveSummon('   ', [mine])).toEqual([])
  })

  test('the shelf comes before the packs', () => {
    const matches = resolveSummon('ball', [theirs])

    expect(matches[0]).toMatchObject({ kind: 'blueprint', id: 'a2' })
    expect(matches.some((match) => match.kind === 'model')).toBe(true)
  })

  test('yours comes before the space s', () => {
    const matches = resolveSummon('ball', [theirs, mine])

    expect(matches[0]).toMatchObject({ id: 'a1' })
    expect(matches[1]).toMatchObject({ id: 'a2' })
  })

  test('a model already on the shelf is not offered twice', () => {
    const matches = resolveSummon('soccer ball', [mine])

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ kind: 'blueprint' })
  })

  test('finds a model in the packs when the shelf has nothing', () => {
    expect(resolveSummon('soccer ball', [])).toEqual([
      { kind: 'model', model: 'bedroom/soccer_ball', name: 'Soccer ball' },
    ])
  })

  test('every term has to match, in any order', () => {
    const one = resolveSummon('round table', [])
    const other = resolveSummon('table round', [])

    expect(one.length).toBeGreaterThan(0)
    expect(one).toEqual(other)
  })

  test('says nothing rather than guessing when nothing matches', () => {
    expect(resolveSummon('xyzzy', [mine])).toEqual([])
  })

  test('stops offering once it is a browse rather than a guess', () => {
    expect(resolveSummon('a', []).length).toBeLessThanOrEqual(MAX_SUMMON_MATCHES)
  })
})

describe('naming a blueprint cut straight from a model', () => {
  test('is the model s own label, not what somebody typed', () => {
    expect(nameForModel('bedroom/soccer_ball')).toBe('Soccer ball')
    expect(nameForModel('park/fountain')).toBe('Fountain')
  })
})
