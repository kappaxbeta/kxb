import { afterEach, describe, expect, test } from 'bun:test'
import type { XpDocument } from '@kxb/xp'
import { saveFolder } from '@/app/t/[slug]/studio/xp/[xpId]/save-folder'

/**
 * The handshake, against a server that answers.
 *
 * The interesting behaviour is not any single request — it is the sequence:
 * ask, be told what is missing, upload exactly that, ask again. A test that
 * stubbed one call would prove the easy half, so these stub the whole
 * conversation and assert on what was said in what order.
 */

const DOCUMENT = { format: 'xp/1', id: 'x', name: 'X' } as unknown as XpDocument

type Call = { url: string; method: string; path?: string; body?: unknown }

function server(replies: (call: Call, index: number) => unknown) {
  const calls: Call[] = []
  const original = globalThis.fetch

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? 'GET',
      path: (init?.headers as Record<string, string> | undefined)?.['x-xp-path'],
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    }
    calls.push(call)

    const reply = replies(call, calls.length - 1) as { status?: number; json?: unknown }
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      json: async () => reply.json ?? {},
    } as Response
  }) as unknown as typeof fetch

  return { calls, restore: () => void (globalThis.fetch = original) }
}

let active: { restore: () => void } | null = null
afterEach(() => {
  active?.restore()
  active = null
})

describe('the save handshake', () => {
  test('one round trip when the server already holds everything', async () => {
    // The overwhelmingly common save: only the document changed, and its bytes
    // are already there because nothing else moved.
    const stub = server(() => ({ json: { saved: true, version: 7 } }))
    active = stub

    const result = await saveFolder('xp-1', DOCUMENT, 6)

    expect(result).toEqual({ ok: true, version: 7 })
    expect(stub.calls).toHaveLength(1)
    expect(stub.calls[0].url).toBe('/api/xp/xp-1/save')
  })

  test('uploads exactly what it was asked for, then saves again', async () => {
    let sha = ''
    const stub = server((call, index) => {
      if (index === 0) {
        // Whatever hash the client computed — the point is that the second
        // request carries the same one, not that we know its value.
        sha = Object.values(
          (call.body as { manifest: Record<string, { sha: string }> }).manifest,
        )[0].sha
        return { json: { saved: false, missing: [sha] } }
      }
      if (index === 1) return { json: { sha } }
      return { json: { saved: true, version: 1 } }
    })
    active = stub

    const result = await saveFolder('xp-1', DOCUMENT, 6)

    expect(result).toEqual({ ok: true, version: 1 })
    expect(stub.calls.map((call) => call.url)).toEqual([
      '/api/xp/xp-1/save',
      '/api/xp/xp-1/files',
      '/api/xp/xp-1/save',
    ])
    // The upload names the file it is, in a header, so the body is exactly the
    // bytes that were hashed.
    expect(stub.calls[1].path).toBe('document.xp.json')
    expect(stub.calls[1].method).toBe('POST')
  })

  test('the hash sent is the hash of the bytes uploaded', async () => {
    let sha = ''
    let uploaded: Uint8Array | null = null

    const stub = server((call, index) => {
      if (index === 0) {
        sha = Object.values(
          (call.body as { manifest: Record<string, { sha: string }> }).manifest,
        )[0].sha
        return { json: { saved: false, missing: [sha] } }
      }
      if (index === 1) {
        uploaded = call.body as Uint8Array
        return { json: {} }
      }
      return { json: { saved: true, version: 1 } }
    })
    active = stub

    await saveFolder('xp-1', DOCUMENT, 6)

    // Recomputed here rather than trusted: a manifest naming a hash that was
    // never uploaded is a save that asks forever for a file it already sent.
    const digest = await crypto.subtle.digest('SHA-256', uploaded as unknown as ArrayBuffer)
    const actual = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    expect(actual).toBe(sha)
  })

  test('a refusal is reported with the server is own words', async () => {
    const stub = server(() => ({
      status: 409,
      json: { error: 'Somebody else has this project open.' },
    }))
    active = stub

    expect(await saveFolder('xp-1', DOCUMENT, 6)).toEqual({
      ok: false,
      error: 'Somebody else has this project open.',
    })
  })

  test('a document the server refuses stops the sequence', async () => {
    const stub = server(() => ({ status: 422, json: { error: 'That document has problems' } }))
    active = stub

    const result = await saveFolder('xp-1', DOCUMENT, 6)

    expect(result.ok).toBe(false)
    // No upload was attempted: there is nothing to store for a document that
    // will not be accepted.
    expect(stub.calls).toHaveLength(1)
  })

  test('and with the fields it named, because that is the part you can act on', async () => {
    /**
     * The bug: a 422 arrived as "That document has problems" and nothing else,
     * so the only way to learn *which* problem was to open the network tab and
     * read the body the server had already written. Somebody did exactly that.
     */
    active = server(() => ({
      status: 422,
      json: {
        error: 'That document has problems',
        problems: [
          { at: 'rules.roles[1]', message: 'not a name' },
          { at: 'world.marks[0].at', message: 'not a cell' },
        ],
      },
    }))

    expect(await saveFolder('xp-1', DOCUMENT, 6)).toEqual({
      ok: false,
      error:
        'That document has problems — rules.roles[1]: not a name · world.marks[0].at: not a cell',
    })
  })

  test('a long list is cut, and says how much it cut', async () => {
    active = server(() => ({
      status: 422,
      json: {
        error: 'That document has problems',
        problems: Array.from({ length: 6 }, (_, at) => ({ at: `blueprints.b${at}`, message: 'no' })),
      },
    }))

    const result = await saveFolder('xp-1', DOCUMENT, 6)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(
      'That document has problems — blueprints.b0: no · blueprints.b1: no · blueprints.b2: no (and 3 more)',
    )
  })

  test('a refusal with no list is the sentence on its own', async () => {
    // The 409 above and every other refusal: nothing to append, and no dangling
    // dash where a list would have been.
    active = server(() => ({ status: 423, json: { error: 'This project is read only.' } }))

    expect(await saveFolder('xp-1', DOCUMENT, 6)).toEqual({
      ok: false,
      error: 'This project is read only.',
    })
  })

  test('a network failure says the work is still here', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    active = { restore: () => void (globalThis.fetch = original) }

    const result = await saveFolder('xp-1', DOCUMENT, 6)

    expect(result.ok).toBe(false)
    // The localStorage draft is what makes this survivable, and Save only
    // clears it on success — so the message can promise this truthfully.
    if (!result.ok) expect(result.error).toContain('still here')
  })

  test('it does not loop when the server keeps asking for the same file', async () => {
    // A retry that cannot converge is a spinner nobody can escape, so the
    // second unsatisfied answer is reported rather than followed.
    const stub = server((call, index) =>
      index === 1 ? { json: {} } : { json: { saved: false, missing: ['deadbeef'] } },
    )
    active = stub

    const result = await saveFolder('xp-1', DOCUMENT, 6)

    expect(result.ok).toBe(false)
    expect(stub.calls.length).toBeLessThanOrEqual(3)
  })

  test('every request in the handshake carries the base version', async () => {
    // The number is what lets the server tell "somebody saved while I was in
    // flight" from "this edit was made on a version that has since moved" - and
    // the second request has to carry it too, because a handshake that only
    // declared its base on the first call would let the retry through unchecked.
    let sha = ''
    const stub = server((call, index) => {
      if (index === 0) {
        sha = Object.values(
          (call.body as { manifest: Record<string, { sha: string }> }).manifest,
        )[0].sha
        return { json: { saved: false, missing: [sha] } }
      }
      if (index === 1) return { json: { sha } }
      return { json: { saved: true, version: 7 } }
    })
    active = stub

    await saveFolder('xp-1', DOCUMENT, 6)

    const saves = stub.calls.filter((call) => call.url.endsWith('/save'))
    expect(saves).toHaveLength(2)
    for (const save of saves) expect((save.body as { base: number }).base).toBe(6)
  })
})
