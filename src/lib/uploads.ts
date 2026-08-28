import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { join, resolve, sep } from 'node:path'

/**
 * Shared rules for stored files.
 *
 * Kept out of the route handlers because the upload route and the serving route
 * must agree exactly on what is allowed. When they drift, the gap is a file
 * that can be written but not read - or worse, written as one type and served
 * as another.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Image types we accept, identified by magic bytes.
 *
 * SVG is deliberately absent. It is XML, it may contain `<script>`, and serving
 * it from our own origin with `image/svg+xml` would let anyone who can upload
 * run JavaScript on kxb.team with the victim's session. That is stored XSS, and
 * "it is only an image" is exactly the assumption that makes it work. Support
 * it only behind a separate origin or a sandbox CSP.
 */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    test: (b) => b.length > 6 && b.subarray(0, 6).toString('ascii').startsWith('GIF8'),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
]

export interface SniffedType {
  mime: string
  ext: string
}

/**
 * Identify a file from its contents.
 *
 * Never from `file.type`, which is whatever the browser was told by the
 * operating system - or whatever an attacker typed into a multipart header.
 * Renaming `payload.html` to `photo.png` defeats an extension check; it does
 * not defeat this.
 */
export function sniffImageType(buffer: Buffer): SniffedType | null {
  for (const signature of SIGNATURES) {
    if (signature.test(buffer)) return { mime: signature.mime, ext: signature.ext }
  }
  return null
}

/**
 * The private Storage bucket the bytes live in.
 *
 * Created by `supabase/migrations/20260901000000_uploads_storage.sql`, which is
 * also where the reasoning for it being private with no `storage.objects`
 * policies is written down. Reached only with the service-role client, and only
 * from `/api/upload` and `/api/uploads/[slug]`.
 */
export const UPLOAD_BUCKET = 'uploads'

/**
 * The object key for a file, content-addressed per workspace.
 *
 * Same shape the disk layout used, deliberately - the backfill script copies
 * existing files under their existing paths, so every `uploads` row that
 * predates Storage keeps resolving without a data migration.
 *
 * The checksum is a hex digest and the extension comes from our own signature
 * table, so neither can contain a slash or a dot-dot. The tenant id is a uuid
 * from the session. Nothing here is caller-controlled; `isSafeStorageKey`
 * checks the result anyway, on the read side, where it matters.
 */
export function storageKeyFor(tenantId: string, checksum: string, ext: string): string {
  return `${tenantId}/${checksum}.${ext}`
}

/**
 * Prove a stored key addresses one object inside one workspace's prefix.
 *
 * The Storage API takes a key, not a filesystem path, so `../` is not a path
 * traversal here in the `/etc/passwd` sense. It is something narrower and just
 * as bad: `a/../b/x.png` normalises into *another tenant's* prefix. This is the
 * guard that keeps a future bug elsewhere from turning into a cross-workspace
 * read, and it is the direct replacement for the containment half of the old
 * `resolveStoredPath`.
 */
export function isSafeStorageKey(key: string): boolean {
  if (key.length === 0 || key.length > 200) return false
  // Leading or repeated slashes address a different key than they read like.
  if (key.startsWith('/') || key.includes('//')) return false
  if (key.includes('\\') || key.includes('\0')) return false

  const segments = key.split('/')
  // Exactly `<tenant>/<file>`. Anything deeper is not a shape this app mints.
  if (segments.length !== 2) return false
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * Where files used to live: a host directory bind-mounted in compose.yaml.
 *
 * Still read, on two paths only. `scripts/uploads-to-storage.ts` walks it to
 * copy the bytes into the bucket, and the serving route falls back to it for
 * rows that have not been copied yet. Both are transitional - see the note in
 * `/api/uploads/[slug]`.
 */
export function uploadRoot(): string {
  return process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
}

/**
 * The public identifier for a file.
 *
 * 96 bits of randomness, base64url so it is URL-safe without escaping. Not
 * derived from the tenant, page or contents: a slug that encodes anything is a
 * slug that leaks it, and content-derived names additionally let someone
 * confirm they hold the same file as you by guessing its hash.
 */
export function newUploadSlug(): string {
  return randomBytes(12).toString('base64url')
}

/** Content address, so identical bytes are stored once per workspace. */
export function checksumOf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Resolve a stored path against the legacy disk root and prove it stays inside.
 *
 * `storage_path` comes from our own database rather than from a request, so
 * this is defence in depth - but it is the check that turns a future bug
 * elsewhere into a 400 instead of `/etc/passwd`.
 *
 * Legacy, in the same sense as `uploadRoot`: the backfill script and the
 * serving route's fallback are the only callers left. New writes never touch a
 * disk. It outlives the fallback by one release only because reading a path out
 * of the database and handing it to `readFile` still deserves this check.
 */
export function resolveStoredPath(storagePath: string): string | null {
  const root = resolve(uploadRoot())
  const full = resolve(join(root, storagePath))

  if (full !== root && !full.startsWith(root + sep)) return null
  return full
}
