import { describe, expect, test } from 'bun:test'
import { linkTrouble } from '@/app/world/_presence/link-health'
import { newMotionBuffer, record } from '@/app/world/_presence/peer-motion'
import { KEEPALIVE_MS } from '@/app/world/_presence/presence-core'

const pose = { x: 0, y: 0, z: 0, yaw: 0 }

describe('linkTrouble', () => {
  test('nobody heard from is no trouble at all', () => {
    expect(linkTrouble(newMotionBuffer(), 10_000)).toBe(0)
  })

  test('a steady sender reads as zero', () => {
    const buffer = newMotionBuffer()
    let now = 0
    for (let i = 0; i < 40; i++) {
      record(buffer, pose, now, now)
      now += 125
    }
    expect(linkTrouble(buffer, now)).toBe(0)
  })

  test('arrivals all over the place climb toward one', () => {
    const buffer = newMotionBuffer()
    let now = 0
    // Alternating gaps of 30ms and 400ms: a link that bunches packets.
    for (let i = 0; i < 60; i++) {
      record(buffer, pose, now, now)
      now += i % 2 === 0 ? 30 : 400
    }
    expect(linkTrouble(buffer, now)).toBeGreaterThan(0.5)
  })

  test('a still body inside the keepalive is not trouble', () => {
    const buffer = newMotionBuffer()
    record(buffer, pose, 0, 0)
    expect(linkTrouble(buffer, KEEPALIVE_MS)).toBe(0)
  })

  test('silence past the keepalive ramps up to one', () => {
    const buffer = newMotionBuffer()
    record(buffer, pose, 0, 0)
    const some = linkTrouble(buffer, KEEPALIVE_MS * 1.8)
    expect(some).toBeGreaterThan(0)
    expect(some).toBeLessThan(1)
    expect(linkTrouble(buffer, KEEPALIVE_MS * 3)).toBe(1)
  })
})
