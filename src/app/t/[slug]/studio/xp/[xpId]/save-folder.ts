import type { XpDocument } from '@kxb/xp'

/**
 * The save handshake, from the browser.
 *
 * docs/xp/backend.md §9. Send the manifest, be told which hashes the server
 * does not hold, upload exactly those, send the manifest again.
 *
 * ---------------------------------------------------------------------------
 * Today the folder is one file, and that is not a shortcut
 * ---------------------------------------------------------------------------
 * A project's assets arrive with `xp/2` (B0) — the `assets` block, `@name`
 * resolution, a `preview/` folder. Until a document can *refer* to a file there
 * is nothing to put in the folder beside `document.xp.json`, so the manifest
 * has one entry and the second round trip almost never happens.
 *
 * The handshake is written in full anyway, because the shape is the point: when
 * B0 lands, this function gains files in its manifest and nothing else changes.
 * A version that posted the document directly would have to be replaced rather
 * than extended, and the endpoint it posted to would have to keep working for
 * both.
 */

export type SaveOutcome = { ok: true; version: number } | { ok: false; error: string }

const DOCUMENT = 'document.xp.json'

/**
 * sha256, hex, in the browser.
 *
 * `crypto.subtle` needs a secure context, which localhost and https both are.
 * The digest has to match what the server computes over the same bytes, which
 * is why the bytes are encoded once here and reused for the upload rather than
 * being re-serialised — `JSON.stringify` twice is two chances to differ by a
 * space, and the hash would then name something that was never uploaded.
 */
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function saveFolder(
  xpId: string,
  document: XpDocument,
  /**
   * The version this edit was made on top of.
   *
   * Sent so the server can refuse a save from a stale base rather than
   * appending it as the newest truth. Without it the endpoint computes the next
   * version from its *own* current row, which answers "did somebody save while
   * this request was in flight" and not "is this edit based on what is there
   * now" — and the second question is the one a `localStorage` draft asks,
   * because a draft can sit in a closed laptop for a day while somebody else
   * saves twice.
   */
  base: number,
): Promise<SaveOutcome> {
  const bytes = new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`)
  const sha = await sha256(bytes)

  const manifest = {
    [DOCUMENT]: { sha, bytes: bytes.length, mime: 'application/json' },
  }

  const first = await post(xpId, document, manifest, base)
  if (!first.ok) return first
  if (first.saved) return { ok: true, version: first.version }

  // The server does not hold something. Upload exactly what it named — never
  // the whole folder — which is what makes a save on a large project cheap.
  for (const missing of first.missing) {
    const entry = Object.entries(manifest).find(([, value]) => value.sha === missing)
    if (!entry) {
      // The server asked for a hash we did not send. Nothing good comes of
      // guessing which file it meant.
      return { ok: false, error: 'The server asked for a file this save does not have' }
    }

    const uploaded = await upload(xpId, entry[0], entry[0] === DOCUMENT ? bytes : bytes)
    if (!uploaded.ok) return uploaded
  }

  const second = await post(xpId, document, manifest, base)
  if (!second.ok) return second
  if (!second.saved) {
    // Everything was uploaded and the server still wants something. Reporting
    // it is better than looping: a retry that cannot converge is a spinner
    // nobody can escape.
    return { ok: false, error: 'The save did not complete. Try again in a moment.' }
  }
  return { ok: true, version: second.version }
}

type PostResult =
  | { ok: true; saved: true; version: number }
  | { ok: true; saved: false; missing: string[] }
  | { ok: false; error: string }

async function post(
  xpId: string,
  document: XpDocument,
  manifest: Record<string, { sha: string; bytes: number; mime: string }>,
  base: number,
): Promise<PostResult> {
  let response: Response
  try {
    response = await fetch(`/api/xp/${xpId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document, manifest, base }),
    })
  } catch {
    // Offline, or the tab is being closed. The `localStorage` draft is what
    // makes this survivable, and it is still there because Save only clears it
    // on success.
    return { ok: false, error: 'Could not reach the server. Your work is still here.' }
  }

  const body = await readJson(response)

  if (!response.ok) {
    const said =
      typeof body?.error === 'string'
        ? body.error
        : `The server refused the save (${response.status}).`
    return { ok: false, error: `${said}${listProblems(body?.problems)}` }
  }

  if (body?.saved === true) return { ok: true, saved: true, version: Number(body.version) }
  return { ok: true, saved: false, missing: Array.isArray(body?.missing) ? body.missing : [] }
}

async function upload(
  xpId: string,
  path: string,
  bytes: Uint8Array,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let response: Response
  try {
    response = await fetch(`/api/xp/${xpId}/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        // The path travels in a header rather than the body, so the body is
        // exactly the file's bytes. A multipart wrapper would mean the server
        // hashing something other than what it stores.
        'x-xp-path': path,
      },
      body: bytes as unknown as BodyInit,
    })
  } catch {
    return { ok: false, error: 'Could not upload. Your work is still here.' }
  }

  if (response.ok) return { ok: true }

  const body = await readJson(response)
  return {
    ok: false,
    error: typeof body?.error === 'string' ? body.error : `Upload failed (${response.status}).`,
  }
}

/**
 * The refusal's own list of what is wrong with the document, as a sentence.
 *
 * The save route answers a 422 with `error` *and* `problems` - one problem per
 * field, each with the path it was found at - and this used to keep the first
 * and drop the second. What reached the person was "That document has
 * problems", which names no field, suggests no fix, and sends them to the
 * network tab to read the body the server had already written for them. That is
 * the whole failure: the answer existed and was thrown away between the wire
 * and the screen.
 *
 * Three, then a count. A document that fails validation usually fails it in one
 * place; the six-typo case is real but rare, and six paths in a chip beside the
 * Save button is a wall rather than a message. The number keeps the rest from
 * being a secret.
 */
function listProblems(problems: unknown): string {
  if (!Array.isArray(problems)) return ''
  const lines = problems
    .map((problem: unknown) => {
      if (typeof problem === 'string') return problem
      if (problem === null || typeof problem !== 'object') return null
      const { at, message } = problem as { at?: unknown; message?: unknown }
      if (typeof message !== 'string') return null
      return typeof at === 'string' && at.length > 0 ? `${at}: ${message}` : message
    })
    .filter((line): line is string => line !== null)

  if (lines.length === 0) return ''
  const shown = lines.slice(0, 3).join(' · ')
  return lines.length > 3 ? ` — ${shown} (and ${lines.length - 3} more)` : ` — ${shown}`
}

/** A response that is not JSON is a proxy error page, not a message for a person. */
async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
