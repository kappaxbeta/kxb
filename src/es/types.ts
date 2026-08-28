/**
 * Core event-sourcing vocabulary, deliberately free of any domain or storage
 * concern. Everything in this folder works for any aggregate.
 */

/**
 * Anything that survives a round trip through the `jsonb` column.
 *
 * Event payloads are constrained to this so a `Date` or a class instance is a
 * compile error rather than a silently mangled value in the log - which, since
 * events are immutable, would be permanent.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[]

/**
 * A fact that happened. Named in the past tense, immutable once written.
 */
export interface DomainEvent<TType extends string = string, TData = unknown> {
  type: TType
  data: TData
}

/**
 * Bookkeeping attached to an event at write time. Not domain data - it exists
 * to answer "who caused this, and what request was it part of".
 */
export interface EventMetadata {
  /** Groups every event produced by one logical user action. */
  correlationId?: string
  /** The command (or event) that directly caused this one. */
  causationId?: string
  /** The user on whose behalf the command ran. */
  actorId?: string
  [key: string]: JsonValue | undefined
}

/**
 * An event as it exists in the log: the domain event plus its position.
 */
export type StoredEvent<TEvent extends DomainEvent = DomainEvent> = TEvent & {
  /** Store-wide monotonic position. Projections use this as their cursor. */
  globalSeq: number
  /** The tenant this event belongs to. Every read is scoped by it. */
  tenantId: string
  streamId: string
  streamType: string
  /** Position within this stream, starting at 1. */
  version: number
  /**
   * The user who appended this event, or null when the system did - a Stripe
   * webhook has no signed-in user. Not who *owns* the data; the tenant does.
   */
  actorId: string | null
  createdAt: string
  metadata: EventMetadata
}

/**
 * An event about to be written - it has no position yet.
 */
export interface EventToAppend<TEvent extends DomainEvent = DomainEvent> {
  type: TEvent['type']
  data: TEvent extends DomainEvent<string, infer TData> ? TData : unknown
  metadata?: EventMetadata
}

/**
 * The functional core of an aggregate, with no I/O in sight.
 *
 * `evolve` folds history into state; `decide` turns a command plus that state
 * into new events. Both are pure, which is what makes the domain trivially
 * unit-testable - see src/domain/tasks/aggregate.test.ts.
 */
export interface Decider<TState, TCommand, TEvent extends DomainEvent> {
  /** Identifies the kind of stream these events belong to, e.g. `"task"`. */
  readonly streamType: string
  /** State of a stream that has no events yet. */
  readonly initialState: TState
  /** Apply one event to state. Must be total and side-effect free. */
  evolve(state: TState, event: TEvent): TState
  /**
   * Decide what happened. Returns the events to append, or `[]` for a
   * legitimate no-op. Throws `DomainError` when the command is invalid.
   */
  decide(state: TState, command: TCommand): TEvent[]
}

/** Replay a stream into current state. */
export function fold<TState, TCommand, TEvent extends DomainEvent>(
  decider: Decider<TState, TCommand, TEvent>,
  events: readonly TEvent[],
): TState {
  return events.reduce<TState>(
    (state, event) => decider.evolve(state, event),
    decider.initialState,
  )
}
