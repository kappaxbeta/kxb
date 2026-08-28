import 'server-only'
import sharp from 'sharp'
import { MAX_UPLOAD_BYTES, sniffImageType, type SniffedType } from '@/lib/uploads'

/**
 * Rebuild an uploaded image from its pixels, and store that instead.
 *
 * This is the closest thing to a virus scan that is worth having on a pipeline
 * which only ever accepts four image formats, and it is stronger than one.
 *
 * `sniffImageType` already proves the file *starts* like a PNG. It says nothing
 * about the rest of it. A JPEG with a ZIP archive, a Windows executable or a
 * `<script>` tag appended after the image data is a perfectly valid JPEG - a
 * polyglot - and it passes every check the upload route made before this one.
 * An antivirus catches that only if somebody has already written a signature
 * for the payload. Decoding the file to raw pixels and re-encoding it destroys
 * the payload whether a signature exists or not, because nothing that is not a
 * pixel survives the round trip. Same for EXIF, colour-profile blobs and every
 * other place bytes can hide in a container format.
 *
 * Three things come along for free:
 *
 *   - GPS coordinates in EXIF stop being stored and re-served. Phones put them
 *     there, people do not know, and the serving route hands the file back
 *     byte-for-byte today.
 *   - A pixel cap, which the route did not have. `MAX_UPLOAD_BYTES` bounds the
 *     bytes on the wire; it does not bound what they decode to. A 200KB PNG can
 *     be 40000x40000, and the thing that falls over is the browser of whoever
 *     opens the page it was pasted into.
 *   - The stored bytes come from one encoder with one set of options, so what
 *     is served is a normal file rather than whatever the uploader's tool
 *     produced.
 *
 * What it does not do: protect against a bug in the decoder itself. libwebp
 * CVE-2023-4863 was reachable by handing libvips a malicious WebP, which is
 * exactly what this function does. That risk is not new - the browser would
 * have decoded the same file - but it does now also exist server-side, so sharp
 * is a dependency that has to be kept current rather than pinned and forgotten.
 */

/**
 * The decoded-pixel ceiling, counted across every frame of an animation.
 *
 * 50MP is a 8660x5773 still - larger than any camera anyone is pasting into a
 * document, and about 200MB of raw RGBA while it is being re-encoded. The two
 * app replicas share 3.7GB on the Hetzner box with no swap, so this number is
 * really a memory budget wearing a resolution costume.
 */
export const MAX_IMAGE_PIXELS = 50_000_000

/**
 * Quality to re-encode the lossy formats at, and what to fall back to.
 *
 * 90 rather than sharp's default of 80, because this is a second encode of
 * something already encoded once and the loss compounds - at 80 a photo that
 * has been through a phone, a chat app and this pipeline starts to show it.
 *
 * The lower steps exist because a re-encode can come out *larger* than what was
 * uploaded, and at these sizes that is not hypothetical: a heavily-compressed
 * 40MP photo arrives at 9MB and leaves at 12MB, over the cap. Rejecting it
 * would tell somebody their 9MB file is bigger than 10MB, which is a bug report
 * waiting to happen. Stepping the quality down keeps the image and costs one
 * more encode on the rare path that needs it.
 */
const QUALITY_STEPS = [90, 80, 70]

export type SanitizedImage =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: 'unreadable' | 'too-many-pixels' | 'too-large' }

/**
 * A fresh decode for each attempt.
 *
 * `animated: true` on every input, including the still ones. Without it libvips
 * reads page one and throws the rest away, so every animated GIF and WebP in
 * the product would silently become a single frame - a regression nobody
 * reports as a bug, because the file still works. It is inert on a PNG or a
 * JPEG, which have no pages to keep.
 *
 * `limitInputPixels` is enforced during the decode rather than checked against
 * the header first, deliberately: reading the header is itself a decode, and a
 * header can claim one size while the pixel data unpacks to another.
 */
function decode(buffer: Buffer) {
  return sharp(buffer, {
    animated: true,
    limitInputPixels: MAX_IMAGE_PIXELS,
    /**
     * `error`, not sharp's default of `warning`.
     *
     * The default rejects anything libvips grumbles about, and real photos out
     * of real phones grumble - a stray trailing byte, a non-standard marker.
     * Refusing those would be a support ticket a week for no security gain,
     * because the re-encode has already neutralised whatever was in there.
     * Truncated and structurally broken files still fail.
     */
    failOn: 'error',
  })
}

/**
 * Decode and re-encode, in the same format the bytes were sniffed as.
 *
 * The format cannot change here. `storageKeyFor` puts the extension in the
 * object key, the bucket's `allowed_mime_types` lists exactly these four, and
 * the serving route sends the recorded mime as `Content-Type`. Converting
 * everything to WebP would be smaller and would break all three.
 */
export async function sanitizeImage(
  buffer: Buffer,
  sniffed: SniffedType,
): Promise<SanitizedImage> {
  let out: Buffer | null = null

  for (const quality of QUALITY_STEPS) {
    try {
      switch (sniffed.ext) {
        case 'png':
          // Lossless, so quality is not a question and there is nothing to step
          // down to. Compression stays at libvips' default effort - level 9 can
          // add seconds on a large image, and this runs inside the request.
          out = await decode(buffer).png().toBuffer()
          break
        case 'jpg':
          /**
           * libjpeg-turbo, not mozjpeg.
           *
           * mozjpeg was the obvious choice and measuring it settled the
           * argument: on a 9.5MB 12MP photo it took 3607ms against libjpeg's
           * 110ms, for an output 12% smaller. Thirty-three times the latency,
           * on a two-core box running two replicas, to save a megabyte of
           * object storage. That is the wrong trade, and it is the difference
           * between this check running inline and having to be queued.
           */
          out = await decode(buffer).jpeg({ quality }).toBuffer()
          break
        case 'gif':
          out = await decode(buffer).gif().toBuffer()
          break
        case 'webp':
          out = await decode(buffer).webp({ quality }).toBuffer()
          break
        default:
          return { ok: false, reason: 'unreadable' }
      }
    } catch (error) {
      // The pixel limit and a corrupt file both arrive here as an exception,
      // and they are different answers for the caller: one is "your image is
      // too big", the other is "this is not an image".
      const message = error instanceof Error ? error.message : ''
      if (message.includes('pixel limit')) return { ok: false, reason: 'too-many-pixels' }
      return { ok: false, reason: 'unreadable' }
    }

    // Caught here rather than at Storage, whose own 10MB limit would reject it
    // with a message about an object key.
    if (out.length <= MAX_UPLOAD_BYTES) break

    // Nothing to retry for the lossless formats - the same input re-encodes to
    // the same bytes however many times it is asked.
    if (sniffed.ext === 'png' || sniffed.ext === 'gif') break
  }

  if (!out || out.length > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'too-large' }
  }

  /**
   * The encoder was told which format to write, so this should be impossible.
   * It is also the one invariant the rest of the system trusts without
   * rechecking - the mime recorded on the row is served as `Content-Type` - so
   * it is worth one memcmp to know the bytes going into the bucket still say
   * what the row says they do.
   */
  const confirmed = sniffImageType(out)
  if (!confirmed || confirmed.mime !== sniffed.mime) {
    return { ok: false, reason: 'unreadable' }
  }

  return { ok: true, bytes: out }
}
