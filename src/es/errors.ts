/**
 * The two failure modes worth distinguishing when a command is executed.
 */

/**
 * The command was rejected by the domain - renaming a deleted task, an empty
 * title, and so on. Retrying will not help; the user needs to change something.
 */
export class DomainError extends Error {
  readonly code: string

  constructor(message: string, code = 'domain_error') {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

/**
 * Someone else wrote to this stream between our read and our write, so the
 * decision was made against stale state. Retrying *does* help: reload the
 * stream and decide again.
 */
export class ConcurrencyError extends Error {
  readonly streamId: string
  readonly expectedVersion: number

  constructor(streamId: string, expectedVersion: number, message?: string) {
    super(
      message ??
        `Concurrent write to stream ${streamId} (expected version ${expectedVersion})`,
    )
    this.name = 'ConcurrencyError'
    this.streamId = streamId
    this.expectedVersion = expectedVersion
  }
}

/**
 * Postgres error codes that mean "you lost the race".
 *
 * 40001 is raised explicitly by append_events() when the version check fails.
 * 23505 is the unique violation on (stream_id, version) - the real guarantee,
 * which fires when two writers pass the version check simultaneously.
 */
const CONCURRENCY_CODES = new Set(['40001', '23505'])

export function isConcurrencyCode(code: string | undefined | null): boolean {
  return code != null && CONCURRENCY_CODES.has(code)
}
