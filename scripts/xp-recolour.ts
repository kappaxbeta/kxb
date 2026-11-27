#!/usr/bin/env bun
/**
 * Bakes an alternate texture into a copy of a `.glb`, so a colourway is a model.
 *
 *     bun run xp:recolour public/xp/packs/spacenina/CombatMech.glb \
 *       ~/Downloads/…/textures/combatmech_texture_alt.png \
 *       public/xp/packs/spacenina/CombatMech_Olive.glb
 *
 * ---------------------------------------------------------------------------
 * Why a colourway has to be a second file
 * ---------------------------------------------------------------------------
 * Several of the character kits ship two textures for one mesh - the mech comes
 * white-and-green and olive-and-orange, same UVs, same rig, same everything
 * else - and the obvious implementation is to load one model and swap
 * `material.map` at draw time. It is the wrong one here, and the reason is not
 * about rendering at all:
 *
 * **A look is one string.** `spacenina/CombatMech` is what a profile stores,
 * what the presence channel carries, what an XP document names and what a
 * `skin_ownership` row points at. A colour that lives only in the renderer is a
 * colour that cannot travel down any of those - so the moment somebody else has
 * to see which one you picked, the swap needs a second field on every one of
 * them, or the id has to carry it. The id carrying it is the smaller change,
 * and it is already how the platformer kit says `barrier_1x1x1_blue`.
 *
 * So a colourway is a model id, a model id is a file, and this is the file.
 *
 * ---------------------------------------------------------------------------
 * Rebuilding the binary chunk rather than patching it
 * ---------------------------------------------------------------------------
 * The two PNGs are not the same length, so the image cannot be swapped in
 * place: every bufferView after it would be pointing a few kilobytes off, and
 * the failure that produces is a mesh of garbage triangles rather than an
 * error. Appending the new image at the end and leaving the old bytes in the
 * file would avoid the arithmetic and ship 80KB nobody draws.
 *
 * So the chunk is rebuilt: every bufferView is copied out, in offset order,
 * with the named image's bytes substituted, and the offsets are recomputed as
 * they are written. Four-byte alignment is kept throughout because glTF
 * accessors require it - a vertex buffer starting at an odd byte is the other
 * way to get garbage triangles.
 *
 * Nothing else is touched. Same nodes, same skin, same joints, same material
 * with the same UVs pointing at the same texture slot - which is what makes the
 * copy play every clip the original does.
 */

import { readFileSync, writeFileSync } from 'node:fs'

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

/** Round up to the next multiple of four, which is what glTF aligns on. */
function pad4(n: number): number {
  return (n + 3) & ~3
}

interface Glb {
  json: Record<string, unknown>
  bin: Uint8Array
}

/** Split a `.glb` into its JSON and its binary chunk. */
function readGlb(file: string): Glb {
  const bytes = new Uint8Array(readFileSync(file))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error(`${file}: not a glb`)

  let json: Record<string, unknown> | null = null
  let bin: Uint8Array | null = null
  let at = 12
  while (at < bytes.byteLength) {
    const length = view.getUint32(at, true)
    const kind = view.getUint32(at + 4, true)
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (kind === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(body))
    if (kind === BIN_CHUNK) bin = body
    at += 8 + pad4(length)
  }
  if (!json || !bin) throw new Error(`${file}: expected a JSON chunk and a BIN chunk`)
  return { json, bin }
}

/** Put the two chunks back together, padded as the spec requires. */
function writeGlb(file: string, glb: Glb): void {
  // JSON pads with spaces and BIN with zeroes: a parser reads the JSON as text,
  // and trailing NULs are not whitespace.
  const jsonBytes = new TextEncoder().encode(JSON.stringify(glb.json))
  const jsonLength = pad4(jsonBytes.byteLength)
  const binLength = pad4(glb.bin.byteLength)

  const total = 12 + 8 + jsonLength + 8 + binLength
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)

  view.setUint32(12, jsonLength, true)
  view.setUint32(16, JSON_CHUNK, true)
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength)
  out.set(jsonBytes, 20)

  const binAt = 20 + jsonLength
  view.setUint32(binAt, binLength, true)
  view.setUint32(binAt + 4, BIN_CHUNK, true)
  out.set(glb.bin, binAt + 8)

  writeFileSync(file, out)
}

interface BufferView {
  buffer: number
  byteOffset?: number
  byteLength: number
  byteStride?: number
  target?: number
}

/**
 * Replace one embedded image's bytes and rebuild every offset around it.
 *
 * Which image: the only one, when there is only one. A kit that ever ships a
 * character with two would need naming rather than guessing, and the throw is
 * the note to whoever meets that day.
 */
function recolour(glb: Glb, png: Uint8Array): Glb {
  const images = (glb.json.images ?? []) as { bufferView?: number; mimeType?: string }[]
  if (images.length !== 1) throw new Error(`expected one embedded image, found ${images.length}`)
  const target = images[0]!.bufferView
  if (target === undefined) throw new Error('the image is a URI rather than embedded')

  const views = (glb.json.bufferViews ?? []) as BufferView[]
  // Offset order, not declaration order: the two agree in every file we ship
  // and nothing in the spec says they must, and copying in the wrong order
  // would interleave the buffers rather than fail.
  const order = views.map((_, index) => index).sort((a, b) => (views[a]!.byteOffset ?? 0) - (views[b]!.byteOffset ?? 0))

  const pieces: Uint8Array[] = []
  let at = 0
  for (const index of order) {
    const view = views[index]!
    const from = view.byteOffset ?? 0
    const bytes = index === target ? png : glb.bin.subarray(from, from + view.byteLength)
    // Pad the *previous* piece up to alignment rather than the next one down,
    // so the first bufferView still starts at zero.
    const start = pad4(at)
    if (start > at) pieces.push(new Uint8Array(start - at))
    pieces.push(bytes)
    view.byteOffset = start
    view.byteLength = bytes.byteLength
    at = start + bytes.byteLength
  }

  const bin = new Uint8Array(at)
  let write = 0
  for (const piece of pieces) {
    bin.set(piece, write)
    write += piece.byteLength
  }

  const buffers = (glb.json.buffers ?? []) as { byteLength: number }[]
  if (buffers.length !== 1) throw new Error(`expected one buffer, found ${buffers.length}`)
  buffers[0]!.byteLength = bin.byteLength

  return { json: glb.json, bin }
}

const [source, texture, out] = process.argv.slice(2)
if (!source || !texture || !out) {
  console.error('usage: bun run xp:recolour <source.glb> <texture.png> <out.glb>')
  process.exit(1)
}

const before = readGlb(source)
const after = recolour(before, new Uint8Array(readFileSync(texture)))
writeGlb(out, after)
console.log(`  ${out}  (${(after.bin.byteLength / 1024) | 0}KB of buffer)`)
