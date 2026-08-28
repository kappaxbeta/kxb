/**
 * The axis lock, as arithmetic.
 *
 * Everything a drag does goes through one target point — the hips translate to
 * it, the solver reaches for it — so the whole of the lock is what this
 * function returns. It is the only part of the feature that can be wrong
 * silently: a plane facing the wrong way looks broken, and a projection off by
 * an axis looks like the handle drifting.
 */
import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { alongAxis } from '@/app/xp/_editor/animator/stage'

const from = new THREE.Vector3(1, 2, 3)
const moved = new THREE.Vector3(5, 7, 11)

describe('a locked drag only moves along its axis', () => {
  test('x keeps y and z where the drag began', () => {
    const out = alongAxis(moved, from, 'x')
    expect(out.x).toBeCloseTo(5, 6)
    expect(out.y).toBeCloseTo(2, 6)
    expect(out.z).toBeCloseTo(3, 6)
  })

  test('y keeps x and z', () => {
    const out = alongAxis(moved, from, 'y')
    expect(out.x).toBeCloseTo(1, 6)
    expect(out.y).toBeCloseTo(7, 6)
    expect(out.z).toBeCloseTo(3, 6)
  })

  test('z keeps x and y', () => {
    const out = alongAxis(moved, from, 'z')
    expect(out.x).toBeCloseTo(1, 6)
    expect(out.y).toBeCloseTo(2, 6)
    expect(out.z).toBeCloseTo(11, 6)
  })

  /** A drag that has not moved asks for exactly where it started. */
  test('no movement is no movement', () => {
    const out = alongAxis(from, from, 'y')
    expect(out.distanceTo(from)).toBeCloseTo(0, 6)
  })

  /** Backwards along the axis is still along the axis. */
  test('it travels both ways', () => {
    const out = alongAxis(new THREE.Vector3(-4, 9, 9), from, 'x')
    expect(out.x).toBeCloseTo(-4, 6)
    expect(out.y).toBeCloseTo(2, 6)
  })

  /** Neither input is written to — both are live vectors the caller reuses. */
  test('it does not touch what it was given', () => {
    const point = moved.clone()
    const origin = from.clone()
    alongAxis(point, origin, 'z')
    expect(point.equals(moved)).toBe(true)
    expect(origin.equals(from)).toBe(true)
  })
})
