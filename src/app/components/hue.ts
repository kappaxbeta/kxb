/**
 * A stable hue per id, spread around the wheel.
 *
 * 137 is roughly the golden angle in degrees, so consecutive ids land far apart
 * and the whole set stays spread however many there are - the same reason a
 * phyllotaxis does not stack its leaves. Anything simpler (a hash mod 360)
 * clusters, and clustering is the one thing this has to avoid.
 *
 * Shared rather than copied because two surfaces now colour the same levels:
 * the store's cards and the cartridges on a shelf. A level that is teal on one
 * page and orange on the next is a level somebody has to read the name of
 * twice.
 */
export function hueFor(id: string): number {
  let sum = 0
  for (let index = 0; index < id.length; index += 1) sum += id.charCodeAt(index)
  return (sum * 137) % 360
}
