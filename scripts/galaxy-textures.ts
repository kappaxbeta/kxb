/**
 * The plates every galaxy in the cosmos pack is drawn with.
 *
 * Derived from one checked-in source - `public/xo/cosmos/galaxy.png`, the
 * galaxy out of "Money makes the WORLD go round" with its black background cut
 * to alpha - so the two below can be re-derived when that one is replaced, and
 * so a change to the ink weight is a diff in this file rather than a new binary.
 *
 * ---------------------------------------------------------------------------
 * Why there are three and not one tinted at runtime
 * ---------------------------------------------------------------------------
 * "Adjustable colour" in a world means a control somebody turns, and a room has
 * nowhere to put one: a `BlueprintSpec` carries a model, a scale and a body, and
 * a colour on it would be a field every other model in the catalogue ignores.
 * What a room *can* do is offer more models, so a colour is a variant - and a
 * variant is only cheap if the pixels are shared, which is why the models point to
 * these by URI instead of each carrying 380K of its own.
 *
 * Tinting needs its own plate, though. Multiplying a green over a blue-white
 * galaxy gives a grey-green one, because the blue is still in there; the mono
 * plate takes the colour out first so a tint lands where it was aimed. The
 * natural plate keeps its own colours and is never tinted.
 */

import sharp from 'sharp'

export interface Plate {
  width: number
  height: number
  /** RGBA8, row-major from the top. */
  data: Buffer
}

export async function readPlate(file: string): Promise<Plate> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data }
}

export async function writePlate(plate: Plate, file: string): Promise<void> {
  await sharp(plate.data, { raw: { width: plate.width, height: plate.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(file)
}

/**
 * The source plate with its black background cut to alpha.
 *
 * ---------------------------------------------------------------------------
 * Why the colour is divided back out
 * ---------------------------------------------------------------------------
 * The plate is a galaxy *composited on black*, so every pixel is already its
 * own colour multiplied by how much galaxy is there - which is exactly what an
 * alpha channel is going to mean once one exists. Writing the luminance into
 * the alpha and leaving the colour alone therefore applies the fade twice, and
 * the visible result is a dark ring wherever the arms trail off: the colour is
 * dimming towards black at the same rate the alpha is dimming towards nothing.
 *
 * Dividing by the alpha undoes the compositing and leaves the colour the arm
 * actually is, so the fade lives in one channel instead of two. `k` is that
 * division, and the clamp is what stops a pixel that was almost invisible
 * turning into a hot speck when its two-of-255 gets scaled by a hundred.
 */
export function cutBlack(source: Plate): Plate {
  const data = Buffer.alloc(source.data.length)
  for (let i = 0; i < data.length; i += 4) {
    const r = source.data[i], g = source.data[i + 1], b = source.data[i + 2]
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    // A floor, so the compression noise in the true black does not become a
    // grey film over the whole square, and a slight lift so the faint outer
    // haze - which is most of what makes it read as a galaxy - survives.
    const a = Math.min(255, Math.max(0, Math.round((lum <= 6 ? 0 : lum) * 1.25)))
    const k = a > 0 ? 255 / a : 0

    data[i] = Math.min(255, Math.round(r * k))
    data[i + 1] = Math.min(255, Math.round(g * k))
    data[i + 2] = Math.min(255, Math.round(b * k))
    data[i + 3] = a
  }
  return { ...source, data }
}

/**
 * The galaxy as pixel art: one flat colour per block, clouds rather than dust.
 *
 * ---------------------------------------------------------------------------
 * Why the block is averaged and the alpha is not
 * ---------------------------------------------------------------------------
 * Averaging the colour over a block is what makes a pixel a pixel - every
 * texel in it agrees, so the eye reads a tile rather than a smudge. Doing the
 * same to the alpha would give every tile a *slightly* different transparency,
 * and a grid of 96 barely-different alphas is not pixel art, it is a photo with
 * big pixels: the shape would still fade smoothly and the whole point would be
 * lost.
 *
 * So the alpha is decided rather than averaged - a block is in or it is out,
 * on the block's own mean - and that is what produces the stepped, blocky
 * silhouette the style lives on. `soft` keeps one band of half-lit tiles at the
 * edge, because a cloud with a single hard border reads as a sprite of a
 * galaxy rather than as a cloud.
 */
export function pixelate(source: Plate, options: { block?: number; soft?: boolean } = {}): Plate {
  const { width, height } = source
  const block = options.block ?? 16
  const soft = options.soft ?? true
  const src = source.data
  const out = Buffer.alloc(src.length)

  for (let by = 0; by < height; by += block) {
    for (let bx = 0; bx < width; bx += block) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let y = by; y < Math.min(by + block, height); y += 1) {
        for (let x = bx; x < Math.min(bx + block, width); x += 1) {
          const i = (y * width + x) * 4
          // Weighted by the pixel's own alpha, so a tile that is mostly empty
          // takes its colour from the part of it that is *there* rather than
          // being dragged towards whatever the transparent pixels happen to be.
          const w = src[i + 3] / 255
          r += src[i] * w
          g += src[i + 1] * w
          b += src[i + 2] * w
          a += src[i + 3]
          n += 1
        }
      }
      const weight = a / 255 || 1
      const mean = a / n

      /*
        Stepped, not thresholded.

        Two states made the whole disc one opaque lump - every block in the
        middle of a galaxy clears any single threshold, so the arms, the dust
        lanes and the core all became the same tile. Four steps keep the thing
        that makes it read as a galaxy, which is that some parts of it are
        thinner than others, while still being few enough to look chosen.
      */
      const alpha = !soft
        ? mean > 90 ? 255 : 0
        : mean > 150 ? 255
        : mean > 80 ? 200
        : mean > 34 ? 130
        : mean > 12 ? 70
        : 0

      for (let y = by; y < Math.min(by + block, height); y += 1) {
        for (let x = bx; x < Math.min(bx + block, width); x += 1) {
          const i = (y * width + x) * 4
          out[i] = Math.min(255, Math.round(r / weight))
          out[i + 1] = Math.min(255, Math.round(g / weight))
          out[i + 2] = Math.min(255, Math.round(b / weight))
          out[i + 3] = alpha
        }
      }
    }
  }

  return { width, height, data: out }
}

/**
 * The same galaxy with the colour taken out and the alpha left alone.
 *
 * Rec.709 rather than an average, for the reason the alpha cut used it: the
 * arms are blue and the core is warm, and an average would bring those to the
 * same grey and flatten the one bit of structure a tint needs to keep.
 */
export function monochrome(source: Plate): Plate {
  const data = Buffer.from(source.data)
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    // Held *below* white rather than lifted towards it, which is the opposite
    // of what this said first and the reason the first four tints came out as
    // four slightly different whites. A tint multiplies, so the plate is the
    // headroom: at luminance 1 every tint lands on 1,1,1 no matter what colour
    // it names, and the filmic curve the scene renders through desaturates the
    // top end further. Pulling the plate down to 0.8 gives the colour somewhere
    // to be.
    const value = Math.min(255, Math.round(lum * 0.8))
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }
  return { ...source, data }
}

/**
 * A separable box blur over RGBA, alpha untouched.
 *
 * Two passes of a running sum rather than a kernel per pixel, so the cost does
 * not grow with the radius. Only the colour is blurred: the alpha is the shape,
 * and softening it here would undo the silhouette the ink pass is about to look
 * for.
 */
function blur(src: Buffer, width: number, height: number, radius: number): Buffer {
  const pass = (input: Buffer, horizontal: boolean): Buffer => {
    const out = Buffer.from(input)
    const outer = horizontal ? height : width
    const inner = horizontal ? width : height
    const step = horizontal ? 4 : width * 4

    for (let o = 0; o < outer; o += 1) {
      const base = horizontal ? o * width * 4 : o * 4
      for (let c = 0; c < 3; c += 1) {
        let sum = 0
        let n = 0
        // Seed the window, then slide it: one add and one subtract per pixel.
        for (let i = 0; i <= Math.min(radius, inner - 1); i += 1) {
          sum += input[base + i * step + c]
          n += 1
        }
        for (let i = 0; i < inner; i += 1) {
          out[base + i * step + c] = Math.round(sum / n)
          const drop = i - radius
          const add = i + radius + 1
          if (drop >= 0) { sum -= input[base + drop * step + c]; n -= 1 }
          if (add < inner) { sum += input[base + add * step + c]; n += 1 }
        }
      }
    }
    return out
  }
  return pass(pass(src, true), false)
}

/**
 * The comic plate: flat bands with ink around them.
 *
 * ---------------------------------------------------------------------------
 * The banding is on the alpha, and that is the whole trick
 * ---------------------------------------------------------------------------
 * The obvious thing - posterise the brightness, the way every cel-shade filter
 * does - produces nothing at all on this plate, and it took measuring it to see
 * why. `cutBlack` moved the galaxy's structure *into the alpha*: it divided the
 * colour back out, so what is left in RGB is a nearly uniform pale blue at
 * luminance 0.85 almost everywhere, and how much galaxy is at a pixel is the
 * alpha. Banding the luminance therefore sorts 95% of the image into one band,
 * draws no contour anywhere, and hands back the picture it was given. Which is
 * exactly what it did: 146 distinct colours out of a five-band posterise, and
 * not one inked pixel.
 *
 * So the bands are alpha bands. An arm becomes a region of one flat opacity,
 * the gap beside it becomes another, and the boundary between them is a closed
 * curve worth drawing a line along - which is what cel art is. The colour is
 * posterised too, but gently and second: it is carrying hue here, not form.
 *
 * The blur still comes first, and for the reason it always did - a contour
 * traced over unblurred noise is a scatter of crossings rather than a line.
 */
export function comic(source: Plate, options: { bands?: number; ink?: number } = {}): Plate {
  const { width, height } = source
  const bands = options.bands ?? 5
  const inkAlpha = options.ink ?? 0.8
  const src = source.data
  const out = Buffer.alloc(src.length)

  const smooth = blur(src, width, height, 3)

  /** Which alpha band a pixel is in. Zero means "not the galaxy". */
  const level = new Uint8Array(width * height)

  for (let p = 0; p < width * height; p += 1) {
    // The *blurred* alpha, so the band edges are smooth curves. Blurring alpha
    // is right here and wrong in `pixelate`, which needs the hard silhouette.
    const a = smooth[p * 4 + 3] / 255
    // Curved rather than linear: the plate spends most of its area at low
    // alpha - the haze is enormous and the core is small - so even bands would
    // put four of the five boundaries inside the faint outskirts and none
    // through the arms. The square root spreads them over what is actually
    // there.
    level[p] = Math.min(bands, Math.round(Math.sqrt(a) * bands))
  }

  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4
    const band = level[p]

    if (band === 0) {
      out[i + 3] = 0
      continue
    }

    // Flat opacity per band: this is what turns a gradient into shapes.
    out[i + 3] = Math.round((band / bands) * 255)

    // Colour, saturated and lightly stepped. Six steps per channel is enough to
    // stop it reading as a photograph and few enough to read as paint.
    const punch = 1.5
    const grey = (smooth[i] + smooth[i + 1] + smooth[i + 2]) / 3
    for (let c = 0; c < 3; c += 1) {
      const saturated = grey + (smooth[i + c] - grey) * punch
      const stepped = Math.round(Math.max(0, Math.min(255, saturated)) / 42) * 42
      out[i + c] = Math.max(0, Math.min(255, stepped))
    }
  }

  // --- the ink -------------------------------------------------------------
  for (let p = 0; p < width * height; p += 1) {
    const x = p % width
    const y = Math.floor(p / width)
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue

    const here = level[p]
    if (here === 0) continue

    // A boundary is where the band changes. Every one of them gets a line,
    // including the outermost - which is the galaxy's own silhouette, and the
    // single thing that most makes it read as drawn rather than photographed.
    let inked = false
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (level[p + dy * width + dx] !== here) inked = true
    }
    if (!inked) continue

    const i = p * 4
    // A very dark blue rather than black: the plate is drawn emissive, and a
    // true black line on an emissive surface renders as a hole in it.
    out[i] = Math.round(out[i] * (1 - inkAlpha) + 10 * inkAlpha)
    out[i + 1] = Math.round(out[i + 1] * (1 - inkAlpha) + 12 * inkAlpha)
    out[i + 2] = Math.round(out[i + 2] * (1 - inkAlpha) + 38 * inkAlpha)
    // The line is opaque even where the band it bounds is faint, or the
    // outermost outline - the most important one - fades out entirely.
    out[i + 3] = Math.max(out[i + 3], 205)
  }

  return { width, height, data: out }
}
