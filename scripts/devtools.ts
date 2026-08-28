/**
 * A very small DevTools client, and the browser it talks to.
 *
 * Extracted from `shoot-scenes.ts` when the render worker needed the same
 * thing. There is no third-party dependency here on purpose: puppeteer brings a
 * Chromium download and an API surface a hundred times the size of what either
 * caller uses, which is "open a tab, wait for a value, read a value back".
 *
 * Everything about *why* it is driven over the protocol rather than just opened
 * with a query string is in the header of `shoot-scenes.ts`, and it still
 * applies double here: a worker that finishes with no file and no reason is not
 * something anybody can fix at four in the morning.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'

/**
 * A DevTools command result.
 *
 * Deliberately opaque: every caller knows the shape its own command answers
 * with, and says so at the call site. Nothing here can know it for them.
 */
type CdpResult = Record<string, unknown>

/** As much of `Runtime.evaluate`'s answer as this reads. */
interface EvaluateResult {
  result: { value: unknown }
  exceptionDetails?: { text?: string; exception?: { description?: string } }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class Devtools {
  private socket: WebSocket
  private next = 1
  private pending = new Map<
    number,
    { resolve: (value: CdpResult) => void; reject: (error: Error) => void }
  >()

  private constructor(socket: WebSocket, onMessage?: (line: string) => void) {
    this.socket = socket
    const say = onMessage ?? ((line: string) => console.error(line))

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))

      // Anything the page complains about is printed. A shot that fails usually
      // fails because the page threw, and the exception is the whole answer.
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails
        say(`  page error: ${details.exception?.description ?? details.text}`)
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        const args = message.params.args
          .map((a: { value?: unknown; description?: string }) => a.value ?? a.description)
          .join(' ')
        say(`  console.error: ${args}`)
      }

      const slot = this.pending.get(message.id)
      if (!slot) return
      this.pending.delete(message.id)
      if (message.error) slot.reject(new Error(message.error.message))
      else slot.resolve(message.result)
    })

    // A socket that closes with commands in flight would otherwise leave every
    // one of them pending forever, which is a worker that stops without saying
    // anything - the exact failure this file's header complains about.
    socket.addEventListener('close', () => {
      for (const slot of this.pending.values()) {
        slot.reject(new Error('the browser closed the connection'))
      }
      this.pending.clear()
    })
  }

  static async connect(url: string, onMessage?: (line: string) => void): Promise<Devtools> {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error(`cannot reach ${url}`)), {
        once: true,
      })
    })
    return new Devtools(socket, onMessage)
  }

  send<T extends CdpResult = CdpResult>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = this.next++
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise<CdpResult>((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    ) as Promise<T>
  }

  /**
   * Evaluates an expression in the page and hands back its value.
   *
   * `T` is what the caller expects the expression to evaluate to; it is a
   * promise about the page, not a fact about it, so callers stating it are
   * claiming something this cannot check.
   */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<CdpResult & EvaluateResult>('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'page threw')
    }
    return result.result.value as T
  }

  close() {
    this.socket.close()
  }
}

/** Polls until the expression is true in the page, or gives up. */
export async function waitFor(
  page: Devtools,
  expression: string,
  what: string,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.evaluate(expression)) return
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${what}`)
}

export interface Browser {
  /** `http://127.0.0.1:<port>`, for the `/json` endpoints. */
  endpoint: string
  process: ChildProcess
  close: () => void
}

/**
 * Headless Chrome, with software WebGL.
 *
 * SwiftShader is the whole reason this works on a server: headless has no GPU,
 * and without it WebGL context creation fails and every render comes back
 * empty rather than failing loudly. It is slow - a scene is seconds, not
 * milliseconds - and pixel-wise indistinguishable, which is the correct trade
 * for something whose output is a still.
 *
 * `--no-sandbox` is opt-in through the environment rather than always on. In a
 * container running as root, Chrome's sandbox cannot start and the flag is
 * mandatory; on a developer's machine it is a downgrade for no reason, and a
 * flag that is always on is one nobody notices has stopped being necessary.
 */
export async function launchChrome({
  executable,
  port,
  profile,
  size = '1000,800',
}: {
  executable: string
  port: number
  profile: string
  size?: string
}): Promise<Browser> {
  rmSync(profile, { recursive: true, force: true })

  const process_ = spawn(
    executable,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      `--window-size=${size}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const endpoint = `http://127.0.0.1:${port}`

  // The debugging port takes a moment to answer.
  let up: unknown = null
  for (let attempt = 0; attempt < 40 && !up; attempt++) {
    await sleep(250)
    up = await fetch(`${endpoint}/json/version`)
      .then((r) => r.json())
      .catch(() => null)
  }
  if (!up) {
    process_.kill()
    throw new Error('Chrome never opened its debugging port')
  }

  return {
    endpoint,
    process: process_,
    close: () => {
      process_.kill()
      rmSync(profile, { recursive: true, force: true })
    },
  }
}

/** Opens a tab on `url` and connects to it. The caller closes both. */
export async function openTab(
  browser: Browser,
  url: string,
  onMessage?: (line: string) => void,
): Promise<{ page: Devtools; close: () => Promise<void> }> {
  const target = await fetch(
    `${browser.endpoint}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
  ).then((r) => r.json())

  const page = await Devtools.connect(target.webSocketDebuggerUrl, onMessage)
  await page.send('Runtime.enable')
  await page.send('Page.enable')

  return {
    page,
    close: async () => {
      page.close()
      await fetch(`${browser.endpoint}/json/close/${target.id}`).catch(() => {})
    },
  }
}
