/**
 * The vector and quaternion arithmetic retargeting needs, and nothing else.
 *
 * Hand-written rather than three.js's, for the reason `@/domain/animator/clip`
 * gives for its own `slerp`: this is the half of the capture page that has to
 * be testable without a renderer, a DOM or a camera. A `bun test` that had to
 * import three to check where an elbow ended up would be a test nobody runs.
 *
 * Everything here is plain arrays in the same order the document uses -
 * `[x, y, z]` and `[x, y, z, w]` - so a value computed here can be written
 * straight into a `Pose` without a conversion step that could get the order
 * wrong.
 */
import type { Quat, Vec3 } from '@/domain/animator/clip'

export const ZERO: Vec3 = [0, 0, 0]
export const IDENTITY: Quat = [0, 0, 0, 1]
/** The axis every bone in this pack points down. See `@/domain/animator/rig`. */
export const BONE_AXIS: Vec3 = [0, 1, 0]

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

export function mid(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

/**
 * A unit vector, or `null` if there was no direction to be had.
 *
 * Null rather than a fallback axis on purpose: a zero-length vector here means
 * two landmarks landed on top of each other, and the honest response is to
 * leave that bone at rest for a frame rather than to point it somewhere
 * arbitrary and have a limb snap.
 */
export function unit(a: Vec3): Vec3 | null {
  const len = length(a)
  if (len < 1e-6) return null
  return [a[0] / len, a[1] / len, a[2] / len]
}

export function mulQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** The inverse of a *unit* quaternion, which is every quaternion here. */
export function conjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q
  const [x, y, z] = v
  // t = 2 * (q.xyz x v), v' = v + qw * t + q.xyz x t. The standard expansion;
  // it is a third of the work of building a matrix for one vector.
  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)
  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ]
}

export function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3])
  if (len < 1e-9) return [...IDENTITY]
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len]
}

/**
 * The shortest rotation taking one unit vector onto another.
 *
 * The half-way-vector construction rather than axis-and-angle, because it
 * needs no trigonometry and stays well conditioned right up to the one case it
 * cannot answer: exactly opposite vectors, where every axis perpendicular to
 * them is an equally correct 180-degree turn. There we pick one, deliberately
 * and visibly, rather than dividing by a zero and producing NaNs that spread
 * silently through the rest of the skeleton.
 */
export function betweenVectors(from: Vec3, to: Vec3): Quat {
  const cos = dot(from, to)
  if (cos < -0.999999) {
    // Any perpendicular will do. Cross with whichever axis `from` is least
    // aligned to, so the cross product is never itself degenerate.
    const axis = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : ([0, 1, 0] as Vec3)
    const perpendicular = unit(cross(from, axis as Vec3)) ?? [0, 0, 1]
    return [perpendicular[0], perpendicular[1], perpendicular[2], 0]
  }
  const axis = cross(from, to)
  return normalizeQuat([axis[0], axis[1], axis[2], 1 + cos])
}

/**
 * An orthonormal frame as a rotation, from two rough directions.
 *
 * `up` wins where the two disagree, which is the right precedence for a body:
 * the line up the spine is measured between two reliable midpoints, while the
 * line across the shoulders is the one that foreshortens to nothing the moment
 * somebody turns sideways to the camera. Building the frame the other way
 * round makes a person in profile wobble about their own axis.
 *
 * Returns `null` when the two directions are parallel and there is no frame to
 * build - again, better as "leave this bone alone" than as a guess.
 */
export function frameFrom(across: Vec3, up: Vec3): Quat | null {
  const y = unit(up)
  const a = unit(across)
  if (!y || !a) return null
  const z = unit(cross(a, y))
  if (!z) return null
  const x = cross(y, z)
  return fromBasis(x, y, z)
}

/**
 * A rotation from three orthonormal columns, `[x y z]`.
 *
 * Shepperd's method: build the quaternion from whichever of the four diagonal
 * cases has the largest divisor, so the square root is never taken of
 * something near zero. The naive single-case version loses all its precision
 * on exactly the rotations a turning body spends its time in.
 */
export function fromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const [m00, m10, m20] = x
  const [m01, m11, m21] = y
  const [m02, m12, m22] = z
  const trace = m00 + m11 + m22

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    return normalizeQuat([(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4])
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    return normalizeQuat([s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s])
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    return normalizeQuat([(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s])
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2
  return normalizeQuat([(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s])
}

/** How far apart two rotations are, in degrees. What a tolerance is measured in. */
export function angleBetween(a: Quat, b: Quat): number {
  const cos = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  return (2 * Math.acos(Math.min(1, cos)) * 180) / Math.PI
}
