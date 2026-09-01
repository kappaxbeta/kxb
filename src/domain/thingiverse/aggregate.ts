import {
  blueprintProblems,
  type BlueprintSpec,
  freshSpec,
  MAX_BLUEPRINT_NAME,
} from '@/domain/thingiverse/blueprint'
import type { Asker, BlueprintCommand } from '@/domain/thingiverse/commands'
import {
  BLUEPRINT_STREAM_TYPE,
  type BlueprintEvent,
  type BlueprintVisibility,
} from '@/domain/thingiverse/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

export interface BlueprintState {
  status: 'none' | 'drawn' | 'retired'
  name: string
  spec: BlueprintSpec
  ownerId: string
  visibility: BlueprintVisibility
}

export const initialBlueprintState: BlueprintState = {
  status: 'none',
  name: '',
  // A spec that names no model, which `blueprintProblems` would refuse and
  // nothing can be summoned from. The state is never read in this condition -
  // every command but the first refuses on `status` first - and a plausible
  // default here would be a spec that looks real in a debugger.
  spec: freshSpec(''),
  ownerId: '',
  visibility: 'private',
}

export function evolve(state: BlueprintState, event: BlueprintEvent): BlueprintState {
  switch (event.type) {
    case 'BlueprintDrawn':
      return {
        ...state,
        status: 'drawn',
        name: event.data.name,
        spec: event.data.spec,
        ownerId: event.data.ownerId,
        visibility: event.data.visibility,
      }

    case 'BlueprintRenamed':
      return { ...state, name: event.data.name }

    case 'BlueprintReshaped':
      return { ...state, spec: event.data.spec }

    case 'BlueprintVisibilitySet':
      return { ...state, visibility: event.data.visibility }

    case 'BlueprintHandedOver':
      return { ...state, ownerId: event.data.ownerId }

    case 'BlueprintRetired':
      return { ...state, status: 'retired' }

    default:
      return state
  }
}

/**
 * Decide what happens to one blueprint.
 *
 * Two rules run before any of the branches, and both are here rather than in
 * the action for the reason `Asker` gives: they are about state only the
 * aggregate holds.
 *
 *   * **It has to exist**, and not be retired. A retired blueprint is not
 *     editable back to life - `RetireBlueprint` is deliberately one-way, so a
 *     name somebody has finished with cannot come back holding a different
 *     thing while a room somewhere still points at it.
 *   * **It has to be yours**, or you have to run the space. Ownership is the
 *     whole of the sharing model: publishing, handing over and retiring are all
 *     the owner's to do, and an admin can do them too because somebody has to
 *     be able to tidy up after a member who left.
 */
export function decide(
  state: BlueprintState,
  command: BlueprintCommand,
): BlueprintEvent[] {
  switch (command.type) {
    case 'DrawBlueprint': {
      if (state.status !== 'none') {
        throw new DomainError('That blueprint already exists', 'blueprint_exists')
      }
      assertName(command.name)
      assertSpec(command.spec)

      return [
        {
          type: 'BlueprintDrawn',
          data: {
            name: command.name.trim(),
            spec: command.spec,
            ownerId: command.by.actorId,
            visibility: command.visibility,
          },
        },
      ]
    }

    case 'RenameBlueprint': {
      assertMine(state, command.by)
      assertName(command.name)

      const name = command.name.trim()
      if (state.name === name) return []

      return [{ type: 'BlueprintRenamed', data: { name } }]
    }

    case 'ReshapeBlueprint': {
      assertMine(state, command.by)
      assertSpec(command.spec)

      // Saving a panel nobody touched is not a change. Without this, opening
      // the editor and closing it would append an event to the log.
      if (sameSpec(state.spec, command.spec)) return []

      return [{ type: 'BlueprintReshaped', data: { spec: command.spec } }]
    }

    case 'SetBlueprintVisibility': {
      assertMine(state, command.by)
      if (state.visibility === command.visibility) return []

      return [
        { type: 'BlueprintVisibilitySet', data: { visibility: command.visibility } },
      ]
    }

    case 'HandOverBlueprint': {
      assertMine(state, command.by)

      if (state.ownerId === command.ownerId) return []

      return [
        {
          type: 'BlueprintHandedOver',
          data: { ownerId: command.ownerId, formerOwnerId: state.ownerId },
        },
      ]
    }

    case 'RetireBlueprint': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'retired') return []
      assertMine(state, command.by)

      return [{ type: 'BlueprintRetired', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function notFound(): DomainError {
  return new DomainError('That blueprint is not on the shelf', 'blueprint_not_found')
}

function assertMine(state: BlueprintState, by: Asker): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'retired') {
    throw new DomainError('That blueprint was retired', 'blueprint_retired')
  }
  if (state.ownerId !== by.actorId && !by.admin) {
    throw new DomainError('That blueprint belongs to somebody else', 'blueprint_not_yours')
  }
}

function assertName(name: string): void {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new DomainError('A blueprint needs a name', 'blueprint_no_name')
  }
  if (trimmed.length > MAX_BLUEPRINT_NAME) {
    throw new DomainError(
      `A name must be under ${MAX_BLUEPRINT_NAME} characters`,
      'blueprint_name_long',
    )
  }
}

/**
 * The spec is checked here as well as by the schema, and that is not belt and
 * braces - it is the aggregate refusing to take anybody's word for it. The
 * schema guards the browser's request; this guards the *log*, which is where a
 * bad model id would be permanent. Every other writer of this decider (a test,
 * a backfill, a future importer) goes through this and not through zod.
 */
function assertSpec(spec: BlueprintSpec): void {
  const problems = blueprintProblems(spec)
  if (problems.length > 0) {
    throw new DomainError(problems.join('; '), 'blueprint_bad_spec')
  }
}

/**
 * Whether two specs say the same thing.
 *
 * `JSON.stringify` of both, which is exact only because a spec's shape is
 * closed and its key order is not somebody's to choose: every spec in the
 * system is built by `freshSpec` or arrives through `specSchema`, and zod hands
 * back keys in the order the schema declares them. A spec assembled by hand in
 * a different order would compare unequal and cost one redundant event, which
 * is the failure this is allowed to have.
 */
function sameSpec(a: BlueprintSpec, b: BlueprintSpec): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const blueprintDecider: Decider<
  BlueprintState,
  BlueprintCommand,
  BlueprintEvent
> = {
  streamType: BLUEPRINT_STREAM_TYPE,
  initialState: initialBlueprintState,
  evolve,
  decide,
}
