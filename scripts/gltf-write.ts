/**
 * A very small glTF writer: JSON with a buffer stapled to it.
 *
 * Shared by the two scripts that *author* models rather than read them -
 * `build-galaxy.ts` and `build-fireworks.ts` - and by nothing else. It moved
 * out of the galaxy the day the fireworks wanted the same four hundred lines
 * of alignment arithmetic, which is the moment a piece of machinery stops
 * being part of the feature that first needed it.
 *
 * ---------------------------------------------------------------------------
 * Why this and not `GLTFExporter`
 * ---------------------------------------------------------------------------
 * three.js ships an exporter and it is the obvious tool. It also wants a DOM -
 * `Blob`, `FileReader`, an `ImageBitmap` to get a texture in - so using it in a
 * build script means either a headless browser or a set of shims standing in
 * for four browser APIs, both of which are more moving parts than the format
 * itself has. What is genuinely fiddly here is four-byte alignment and the
 * min/max every accessor owes, and both live below rather than in the shapes.
 */

export const FLOAT = 5126
export const USHORT = 5123
export const ARRAY_BUFFER = 34962
export const ELEMENT_ARRAY_BUFFER = 34963

export interface Mesh {
  positions: number[]
  normals: number[]
  uvs?: number[]
  indices: number[]
}

export class Gltf {
  readonly json: Record<string, unknown> = {}
  private readonly blobs: Buffer[] = []
  private length = 0

  readonly bufferViews: Record<string, unknown>[] = []
  readonly accessors: Record<string, unknown>[] = []

  /**
   * Appends bytes and returns the bufferView that covers them.
   *
   * Every view starts on a four-byte boundary. The spec only requires it of
   * views an accessor reads, but a padded image view costs three bytes and
   * removes the one class of bug in this file that would produce a valid-looking
   * GLB that renders as garbage on some loaders and fine on others.
   */
  private view(bytes: Buffer, target?: number): number {
    const pad = (4 - (this.length % 4)) % 4
    if (pad > 0) {
      this.blobs.push(Buffer.alloc(pad))
      this.length += pad
    }
    const index = this.bufferViews.length
    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.length,
      byteLength: bytes.length,
      ...(target === undefined ? {} : { target }),
    })
    this.blobs.push(bytes)
    this.length += bytes.length
    return index
  }

  /** Raw bytes with no accessor over them - which is only ever an image. */
  bytes(bytes: Buffer): number {
    return this.view(bytes)
  }

  /**
   * A float accessor of `size` components.
   *
   * `min`/`max` are written for every one of them rather than only for POSITION
   * where the spec demands it: they are three lines here and they are what lets
   * a loader compute a bounding box without walking the buffer, which is how
   * `measure` in the lounge sizes a carry box.
   */
  floats(values: number[], size: number, target?: number): number {
    const bytes = Buffer.alloc(values.length * 4)
    values.forEach((value, i) => bytes.writeFloatLE(value, i * 4))

    const min = Array.from({ length: size }, () => Infinity)
    const max = Array.from({ length: size }, () => -Infinity)
    for (let i = 0; i < values.length; i += 1) {
      const lane = i % size
      min[lane] = Math.min(min[lane], values[i])
      max[lane] = Math.max(max[lane], values[i])
    }

    const index = this.accessors.length
    this.accessors.push({
      bufferView: this.view(bytes, target),
      componentType: FLOAT,
      count: values.length / size,
      type: ['SCALAR', 'VEC2', 'VEC3', 'VEC4'][size - 1],
      min,
      max,
    })
    return index
  }

  /** An unsigned-short index accessor. Every mesh here is far under 65k verts. */
  indices(values: number[]): number {
    const bytes = Buffer.alloc(values.length * 2)
    values.forEach((value, i) => bytes.writeUInt16LE(value, i * 2))
    const index = this.accessors.length
    this.accessors.push({
      bufferView: this.view(bytes, ELEMENT_ARRAY_BUFFER),
      componentType: USHORT,
      count: values.length,
      type: 'SCALAR',
      min: [Math.min(...values)],
      max: [Math.max(...values)],
    })
    return index
  }

  /** The whole thing, as the two chunks a GLB is. */
  pack(): Buffer {
    const bin = Buffer.concat(this.blobs)
    const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)])

    this.json.buffers = [{ byteLength: binPadded.length }]
    this.json.bufferViews = this.bufferViews
    this.json.accessors = this.accessors

    const raw = Buffer.from(JSON.stringify(this.json), 'utf8')
    // JSON is padded with spaces rather than zeros - a NUL inside the chunk is
    // legal but trips validators that hand the chunk straight to a parser.
    const jsonPadded = Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4, 0x20)])

    const header = Buffer.alloc(12)
    header.write('glTF', 0, 'ascii')
    header.writeUInt32LE(2, 4)
    header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8)

    const jsonHeader = Buffer.alloc(8)
    jsonHeader.writeUInt32LE(jsonPadded.length, 0)
    jsonHeader.writeUInt32LE(0x4e4f534a, 4)

    const binHeader = Buffer.alloc(8)
    binHeader.writeUInt32LE(binPadded.length, 0)
    binHeader.writeUInt32LE(0x004e4942, 4)

    return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded])
  }
}
