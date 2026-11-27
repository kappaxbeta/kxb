import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'

import { isLegTrack, LEGS, splitForFeet, UPPER } from './feet'

const turn = (node: string) =>
  new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])
const move = (node: string) =>
  new THREE.VectorKeyframeTrack(`${node}.position`, [0, 1], [0, 0, 0, 0, 1, 0])

const names = (clip: THREE.AnimationClip) => clip.tracks.map((track) => track.name)

describe('isLegTrack', () => {
  test('knows the dummy legs by their loaded names', () => {
    for (const node of ['upperlegl', 'lowerlegr', 'footl', 'toesr']) {
      expect(isLegTrack(`${node}.quaternion`)).toBe(true)
    }
  })

  test('knows a peep leg, hyphens and all', () => {
    expect(isLegTrack('leg-front-left.quaternion')).toBe(true)
    expect(isLegTrack('leg-back-right.position')).toBe(true)
  })

  test('the hips, arms and body are not legs', () => {
    for (const node of ['hips', 'spine', 'upperarml', 'handr', 'body', 'tail', 'root']) {
      expect(isLegTrack(`${node}.quaternion`)).toBe(false)
    }
  })

  test('a name three.js cannot read drives nothing', () => {
    expect(isLegTrack('')).toBe(false)
  })
})

describe('splitForFeet', () => {
  const walk = new THREE.AnimationClip('Walking_A', 1, [
    move('hips'),
    turn('hips'),
    turn('upperlegl'),
    turn('lowerlegl'),
    turn('footl'),
    turn('upperarml'),
  ])
  const run = new THREE.AnimationClip('Running_A', 0.8, [turn('upperlegr'), turn('spine')])
  const dance = new THREE.AnimationClip('Cheering', 2, [
    move('hips'),
    turn('upperarml'),
    turn('upperarmr'),
    turn('head'),
    turn('upperlegl'),
  ])

  test('each gait keeps only its legs, under a name of its own', () => {
    const [legs] = splitForFeet([walk], undefined)
    expect(legs.name).toBe(`Walking_A${LEGS}`)
    expect(legs.duration).toBe(1)
    expect(names(legs)).toEqual([
      'upperlegl.quaternion',
      'lowerlegl.quaternion',
      'footl.quaternion',
    ])
  })

  test('the dance keeps everything but its legs, hips included', () => {
    const parts = splitForFeet([walk, run], dance)
    const upper = parts[2]
    expect(upper.name).toBe(`Cheering${UPPER}`)
    expect(names(upper)).toEqual([
      'hips.position',
      'upperarml.quaternion',
      'upperarmr.quaternion',
      'head.quaternion',
    ])
  })

  test('the two halves never drive the same bone', () => {
    const [legs, , upper] = splitForFeet([walk, run], dance)
    const overlap = names(legs).filter((name) => names(upper).includes(name))
    expect(overlap).toEqual([])
  })

  test('no dance, no upper half', () => {
    expect(splitForFeet([walk, run], undefined)).toHaveLength(2)
  })

  test('the originals are untouched', () => {
    splitForFeet([walk], dance)
    expect(walk.tracks).toHaveLength(6)
    expect(dance.tracks).toHaveLength(5)
  })
})
