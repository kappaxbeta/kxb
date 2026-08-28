import 'server-only'
import { createHash } from 'node:crypto'
import { sanitizeImage } from '@/lib/image-sanitize'
import {
  CAPS,
  checkContainer,
  checkPath,
  DOCUMENT_PATH,
  jsonDepthOf,
  sniffXpType,
  typeForExtension,
  VISION_PATH,
  type XpType,
} from '@/lib/xp-formats'

/**
 * What happens between "drop" and "stored".
 *
 * `docs/xp/backend.md` §5 is the pipeline and this is it, in the order that
 * document gives: the name, then the type from the bytes, then the rebuild
 * where a rebuild is possible, then the structure. The byte-level half lives in
 * `src/lib/xp-formats.ts`, which is pure so the editor can run the same checks
 * before uploading anything.
 *
 * ---------------------------------------------------------------------------
 * Nothing here trusts the caller, and that includes our own editor
 * ---------------------------------------------------------------------------
 * The editor refuses a bad file at the moment somebody drags it in, which is
 * where a person can do something about it. This is the copy that matters,
 * because the editor is a client and a client is a program somebody else can
 * write. Two implementations of one rule is drift, which is why the rule itself
 * is in one pure module and both callers use it.
 *
 * ---------------------------------------------------------------------------
 * The order is not arbitrary
 * ---------------------------------------------------------------------------
 * Cheapest and most certain first. A name is refused before a byte is read; a
 * signature before a decode; a decode before a structural walk. The expensive
 * check is the image rebuild, and by the time anything reaches it the file has
 * already proved it is the size and shape it claims.
 */

export type XpIntakeRejection =
  /** The name, before anything was opened. */
  | { at: 'path'; reason: string }
  /** The bytes are not a kind we take, or not the kind the name promised. */
  | { at: 'type'; reason: string }
  /** Over a cap. */
  | { at: 'size'; reason: string }
  /** It is that kind of file, and it is malformed or carries something extra. */
  | { at: 'structure'; reason: string }

export type XpIntakeResult =
  | {
      ok: true
      path: string
      type: XpType
      /** What to store. Not always what arrived — an image is rebuilt. */
      bytes: Buffer
      /** Content address of `bytes`, so the manifest and the key agree. */
      sha: string
    }
  | { ok: false; path: string; problem: XpIntakeRejection }

/**
 * The `scan_status` an accepted file is written with.
 *
 * `clean`, always, and the migration comment on `uploads.scan_status` already
 * argued why the column exists anyway: every check in this file is inline, so a
 * failure returns a rejection instead of inserting a row, and there is nothing
 * here that can produce `pending`.
 *
 * It is exported rather than inlined at the call site so that the day a scanner
 * runs off the request, the change is this constant and a queue rather than a
 * hunt through the writers. The serving route already filters on `clean`, which
 * is what makes that a change and not a migration.
 */
export const SCAN_STATUS_ON_ACCEPT = 'clean' as const

/** The two named files a folder may carry, and what each must contain. */
const NAMED: Record<string, XpType['kind']> = {
  [DOCUMENT_PATH]: 'document',
  [VISION_PATH]: 'prose',
}

const reject = (path: string, problem: XpIntakeRejection): XpIntakeResult => ({
  ok: false,
  path,
  problem,
})

/**
 * Take one file, or say why not.
 *
 * `declaredMime` is deliberately absent from the signature. There is no
 * parameter for what the browser said the file was, because there is no point
 * in the pipeline at which that would be consulted — `sniffXpType` reads the
 * bytes, and a caller who could pass a mime would eventually find a branch that
 * believed it.
 */
export async function intakeFile(path: string, input: Buffer): Promise<XpIntakeResult> {
  // --- the name ------------------------------------------------------------
  const named = checkPath(path)
  if (!named.ok) return reject(path, { at: 'path', reason: named.reason })

  const expected = typeForExtension(named.ext)
  if (!expected) {
    return reject(path, {
      at: 'type',
      reason: `We do not take .${named.ext} files. See what a folder may hold.`,
    })
  }

  if (input.length === 0) {
    return reject(path, { at: 'size', reason: 'The file is empty' })
  }

  // --- the two named files -------------------------------------------------
  //
  // Checked before the signature table, because they are JSON with no magic
  // bytes and because the kind they carry is decided by *where they are* rather
  // than by what is in them: `vision.json` is prose and `data/holes.json` is
  // data, and both are `application/json`.
  const namedKind = NAMED[path]
  if (namedKind !== undefined && expected.ext !== 'json') {
    return reject(path, {
      at: 'type',
      reason: `${path} has to be a .json file`,
    })
  }

  const kind = namedKind ?? expected.kind
  const cap = CAPS.bytes[kind]
  if (input.length > cap) {
    return reject(path, {
      at: 'size',
      reason: `${describeSize(input.length)} is over the ${describeSize(cap)} limit for ${kind}`,
    })
  }

  // --- JSON: parse it, rather than sniffing it -----------------------------
  if (expected.ext === 'json') {
    let parsed: unknown
    try {
      parsed = JSON.parse(input.toString('utf8'))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'it does not parse'
      return reject(path, { at: 'structure', reason: `Not valid JSON — ${detail}` })
    }

    const depth = jsonDepthOf(parsed)
    if (depth > CAPS.jsonDepth) {
      return reject(path, {
        at: 'structure',
        reason: `Nested ${depth} deep, and the limit is ${CAPS.jsonDepth}`,
      })
    }

    // Stored as it arrived. Re-serialising would be tidier and would also mean
    // the bytes in the bucket are not the bytes the author wrote, which breaks
    // the one property Export depends on: a folder that comes back out the way
    // it went in.
    return accept(path, { ...expected, kind }, input)
  }

  // --- the type, from the bytes --------------------------------------------
  const sniffed = sniffXpType(input)
  if (!sniffed) {
    return reject(path, {
      at: 'type',
      reason: 'We could not tell what kind of file this is from its contents',
    })
  }

  /**
   * A mismatch is a rejection rather than a correction.
   *
   * Storing it under what it turned out to be would be quietly helpful in the
   * accident case and quietly wrong in the other one: a file named `.png` whose
   * bytes are an `.mp4` is either a mistake worth telling somebody about or an
   * attempt worth refusing, and nothing here can tell which. Renaming it for
   * them means the level references `rock.png` and the bucket holds `rock.mp4`.
   */
  if (sniffed.ext !== expected.ext) {
    return reject(path, {
      at: 'type',
      reason: `Named .${named.ext}, but the contents are a ${sniffed.mime}. Rename it, or export it again.`,
    })
  }

  // The cap is re-checked against the sniffed kind because the extension and
  // the contents have only just been proved to agree — a `.png` holding a video
  // was measured against the image cap above.
  if (input.length > CAPS.bytes[sniffed.kind]) {
    return reject(path, {
      at: 'size',
      reason: `${describeSize(input.length)} is over the ${describeSize(CAPS.bytes[sniffed.kind])} limit for ${sniffed.kind}`,
    })
  }

  // --- images: rebuilt, not walked -----------------------------------------
  if (sniffed.kind === 'image') {
    /**
     * The strongest check in the pipeline, and it is not ours.
     *
     * `sanitizeImage` decodes to pixels and re-encodes, which destroys an
     * appended payload whether or not a signature exists for it — the argument
     * is in that file's header and it applies here unchanged. Walking a PNG's
     * chunks as well would be a weaker check wearing the costume of a second
     * one.
     */
    const rebuilt = await sanitizeImage(input, { mime: sniffed.mime, ext: sniffed.ext })
    if (!rebuilt.ok) {
      return reject(path, {
        at: rebuilt.reason === 'too-large' || rebuilt.reason === 'too-many-pixels' ? 'size' : 'structure',
        reason: describeImageFailure(rebuilt.reason),
      })
    }
    return accept(path, sniffed, rebuilt.bytes)
  }

  // --- everything else: walked ---------------------------------------------
  const structure = checkContainer(input, sniffed)
  if (!structure.ok) {
    return reject(path, { at: 'structure', reason: structure.reason })
  }

  return accept(path, sniffed, input)
}

/**
 * A whole folder, with the caps that are about the folder rather than a file.
 *
 * Every file is run regardless of whether an earlier one failed, because a
 * folder with six problems in it should report six problems — the same
 * reasoning `parseXp` gives for collecting rather than throwing on the first.
 * Somebody fixing one thing at a time and re-uploading a hundred megabytes to
 * find the next is the experience this avoids.
 */
export interface XpFolderIntake {
  accepted: Extract<XpIntakeResult, { ok: true }>[]
  rejected: Extract<XpIntakeResult, { ok: false }>[]
  /** Folder-level problems, which belong to no single file. */
  problems: string[]
  totalBytes: number
}

export async function intakeFolder(
  files: { path: string; bytes: Buffer }[],
): Promise<XpFolderIntake> {
  const problems: string[] = []

  if (files.length > CAPS.files) {
    problems.push(`${files.length} files, and the limit is ${CAPS.files}`)
  }

  const seen = new Set<string>()
  for (const file of files) {
    if (seen.has(file.path)) problems.push(`${file.path} appears more than once`)
    seen.add(file.path)
  }

  if (!seen.has(DOCUMENT_PATH)) {
    problems.push(`A folder needs a ${DOCUMENT_PATH}`)
  }

  const previews = files.filter((file) => file.path.startsWith('preview/'))
  if (previews.length > CAPS.previews) {
    problems.push(`${previews.length} preview pictures, and the store shows ${CAPS.previews}`)
  }

  const results = await Promise.all(files.map((file) => intakeFile(file.path, file.bytes)))

  const accepted = results.filter((r): r is Extract<XpIntakeResult, { ok: true }> => r.ok)
  const rejected = results.filter((r): r is Extract<XpIntakeResult, { ok: false }> => !r.ok)

  /**
   * Summed over what would be *stored*, not over what arrived.
   *
   * An image can leave the rebuild smaller than it went in, and charging
   * somebody for bytes we discarded is the kind of thing that is noticed once
   * and never trusted again. Deduplication happens later, against what the
   * tenant already holds, so this is the upper bound rather than the bill.
   */
  const totalBytes = accepted.reduce((sum, file) => sum + file.bytes.length, 0)
  if (totalBytes > CAPS.folderBytes) {
    problems.push(
      `${describeSize(totalBytes)} in total, and the limit is ${describeSize(CAPS.folderBytes)}`,
    )
  }

  return { accepted, rejected, problems, totalBytes }
}

function accept(path: string, type: XpType, bytes: Buffer): XpIntakeResult {
  return {
    ok: true,
    path,
    type,
    bytes,
    // Hex, so it cannot contain a slash or a dot-dot on its way into an object
    // key. Same digest and same reasoning as `checksumOf` in `src/lib/uploads.ts`.
    sha: createHash('sha256').update(bytes).digest('hex'),
  }
}

/** Bytes, in the units the person who chose the file was thinking in. */
function describeSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`
  return `${bytes} bytes`
}

/**
 * Written for whoever dropped the file, not for whoever wrote the decoder.
 *
 * "unreadable" is true and useless. Each of these says what to do next, which
 * is the difference between a message somebody acts on and one they send us a
 * screenshot of.
 */
function describeImageFailure(reason: 'unreadable' | 'too-many-pixels' | 'too-large'): string {
  switch (reason) {
    case 'too-many-pixels':
      return 'That image is too many pixels to open. Scale it down and try again.'
    case 'too-large':
      return 'That image is still over the limit after being re-encoded. Scale it down.'
    default:
      return 'That image could not be opened. It may be truncated or not really an image.'
  }
}
