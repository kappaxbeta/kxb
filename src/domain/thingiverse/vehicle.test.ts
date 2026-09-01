import { describe, expect, test } from 'bun:test'
import { blueprintProblems, freshSpec, freshUse } from '@/domain/thingiverse/blueprint'
import {
  drivable,
  freshVehicle,
  freshWheel,
  isSteeringNode,
  isWheelNode,
  MAX_WHEELS,
  vehicleProblems,
} from '@/domain/thingiverse/vehicle'

const kart = 'xp:cars/hatchback-sports'
const wheel = 'xp:cars/wheel-racing'

describe('what makes a thing drivable', () => {
  test('a vehicle block alone is not enough - the driver needs a seat', () => {
    const spec = { ...freshSpec(kart), vehicle: freshVehicle() }
    expect(drivable(spec)).toBe(false)
    expect(vehicleProblems(spec.vehicle, spec.use)).toContain(
      'a vehicle needs a seat to drive it from',
    )
  })

  test('a vehicle with a seat is drivable', () => {
    const spec = { ...freshSpec(kart), vehicle: freshVehicle(), use: freshUse() }
    expect(drivable(spec)).toBe(true)
    expect(vehicleProblems(spec.vehicle, spec.use)).toEqual([])
  })

  test('furniture stays furniture: no vehicle key, not drivable', () => {
    expect(drivable(freshSpec(kart))).toBe(false)
  })
})

describe('what a vehicle block may say', () => {
  test('the fresh vehicle is inside its own bounds', () => {
    const spec = { ...freshSpec(kart), vehicle: freshVehicle(), use: freshUse() }
    expect(blueprintProblems(spec)).toEqual([])
  })

  test('speed and turn are bounded', () => {
    const use = freshUse()
    expect(vehicleProblems({ ...freshVehicle(), speed: 0 }, use)).not.toEqual([])
    expect(vehicleProblems({ ...freshVehicle(), speed: 100 }, use)).not.toEqual([])
    expect(vehicleProblems({ ...freshVehicle(), turn: 0 }, use)).not.toEqual([])
    expect(vehicleProblems({ ...freshVehicle(), turn: 9 }, use)).not.toEqual([])
  })

  test('a wheel must be a model we ship, and near the thing', () => {
    const use = freshUse()
    const bad = { ...freshVehicle(), wheels: [freshWheel('nope/nothing')] }
    expect(vehicleProblems(bad, use)).toContain('nope/nothing is not a model we ship')

    const far = {
      ...freshVehicle(),
      wheels: [{ ...freshWheel(wheel), at: { x: 99, y: 0, z: 0 } }],
    }
    expect(vehicleProblems(far, use).join(' ')).toContain('within')
  })

  test('there is a wheel count nobody reaches by building a car', () => {
    const many = {
      ...freshVehicle(),
      wheels: Array.from({ length: MAX_WHEELS + 1 }, () => freshWheel(wheel)),
    }
    expect(vehicleProblems(many, freshUse()).join(' ')).toContain(`${MAX_WHEELS}`)
  })

  test('vehicle problems surface through the whole-spec check', () => {
    const spec = {
      ...freshSpec(kart),
      vehicle: { ...freshVehicle(), speed: 0 },
      use: freshUse(),
    }
    expect(blueprintProblems(spec).join(' ')).toContain('top speed')
  })
})

describe('the wheels a model brought with it', () => {
  test('the packs’ own spellings are all wheels', () => {
    for (const name of [
      'wheel-front-left',
      'wheel-back-right',
      'car_sedan_wheel_rear_left',
      'wheel-left',
      'Wheel',
    ]) {
      expect(isWheelNode(name)).toBe(true)
    }
  })

  test('a wheelbarrow is not a wheel, and neither is a body', () => {
    expect(isWheelNode('wheelbarrow')).toBe(false)
    expect(isWheelNode('body')).toBe(false)
    expect(isWheelNode('character')).toBe(false)
  })

  test('front wheels steer, back wheels do not', () => {
    expect(isSteeringNode('wheel-front-left')).toBe(true)
    expect(isSteeringNode('car_taxi_wheel_front_right')).toBe(true)
    expect(isSteeringNode('wheel-back-left')).toBe(false)
    expect(isSteeringNode('front')).toBe(false)
  })
})
