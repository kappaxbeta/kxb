import { CAPS, checkPath, DOCUMENT_PATH } from '@/lib/xp-formats'

/**
 * A folder, as path to content hash.
 *
 * The whole of docs/xp/backend.md §1.3 in one type. It is what makes a save a
 * diff — the editor sends this, the server answers with the hashes it does not
 * hold, and an unchanged 16MB model is never uploaded twice.
 *
 * Pure, and separate from `xp-intake.ts`, because both the editor and the two
 * routes validate one and only the routes may touch a bucket.
 */

export interface ManifestEntry {
  sha: string
  bytes: number
  mime: string
}

export type XpManifest = Record<string, ManifestEntry>

const SHA = /^[0-9a-f]{64}$/

export type ManifestVerdict =
  | { ok: true; manifest: XpManifest; shas: string[]; bytes: number; files: number }
  | { ok: false; problems: string[] }

/**
 * Is this a manifest we would accept, before a single byte is looked at?
 *
 * Every problem is collected rather than thrown on the first, for the reason
 * `parseXp` gives and this one inherits: a folder with six problems in it
 * should report six problems, because fixing one at a time and re-uploading is
 * the experience this avoids.
 *
 * What it deliberately does **not** check is whether the hashes are real. A
 * manifest is a claim; `heldShas` and the upload route are what turn a claim
 * into bytes, and nothing here can tell a genuine sha256 from a plausible one.
 */
export function checkManifest(input: unknown): ManifestVerdict {
  const problems: string[] = []

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, problems: ['The manifest is not an object'] }
  }

  const entries = Object.entries(input as Record<string, unknown>)

  if (entries.length > CAPS.files) {
    problems.push(`${entries.length} files, and the limit is ${CAPS.files}`)
  }

  const manifest: XpManifest = {}
  let bytes = 0

  for (const [path, value] of entries) {
    const named = checkPath(path)
    if (!named.ok) {
      problems.push(`${path}: ${named.reason}`)
      continue
    }

    if (value === null || typeof value !== 'object') {
      problems.push(`${path}: not a manifest entry`)
      continue
    }

    const entry = value as Record<string, unknown>

    if (typeof entry.sha !== 'string' || !SHA.test(entry.sha)) {
      // Checked with a regex rather than trusted, because this string becomes
      // part of an object key. Hex cannot contain a slash or a dot-dot, which
      // is the property `storageKeyFor` relies on in `src/lib/uploads.ts`.
      problems.push(`${path}: not a content hash`)
      continue
    }

    if (typeof entry.bytes !== 'number' || !Number.isInteger(entry.bytes) || entry.bytes <= 0) {
      problems.push(`${path}: a file has to have a size`)
      continue
    }

    if (typeof entry.mime !== 'string' || entry.mime.length === 0) {
      problems.push(`${path}: no type`)
      continue
    }

    manifest[path] = { sha: entry.sha, bytes: entry.bytes, mime: entry.mime }
    bytes += entry.bytes
  }

  if (!(DOCUMENT_PATH in manifest)) {
    problems.push(`A folder needs a ${DOCUMENT_PATH}`)
  }

  const previews = Object.keys(manifest).filter((path) => path.startsWith('preview/'))
  if (previews.length > CAPS.previews) {
    problems.push(`${previews.length} preview pictures, and the store shows ${CAPS.previews}`)
  }

  if (bytes > CAPS.folderBytes) {
    problems.push(
      `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB in total, and the limit is ${CAPS.folderBytes / (1024 * 1024)} MB`,
    )
  }

  if (problems.length > 0) return { ok: false, problems }

  return {
    ok: true,
    manifest,
    // Deduped: the same picture used twice in one folder is one object and one
    // upload, which is the same property that makes it one object across
    // versions.
    shas: [...new Set(Object.values(manifest).map((entry) => entry.sha))],
    bytes,
    files: Object.keys(manifest).length,
  }
}

/**
 * Which picture is the front one.
 *
 * docs/xp/backend.md §4: `preview/` is ordered by filename and the first is the
 * cover, with `meta.cover` overriding by path. Order is the default so the
 * common case needs no interface at all — drop three pictures in and the first
 * is the front — and the override exists so the common case never becomes a
 * trap when somebody adds a better shot later.
 */
export function coverFor(manifest: XpManifest, declared?: string): string | undefined {
  if (declared && declared in manifest) return declared

  return Object.keys(manifest)
    .filter((path) => path.startsWith('preview/'))
    .sort()[0]
}
