import type { BakedClip } from '@/domain/animator/clip'
import {
  CLIP_STREAM_TYPE,
  type ClipEvent,
  MAX_CLIP_NAME,
  MAX_CLIP_SAMPLES,
} from '@/domain/thingiverse/clip-events'
import type { Asker } from '@/domain/thingiverse/commands'
import type { BlueprintVisibility } from '@/domain/thingiverse/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * Commands against one clip.
 *
 * Deliberately the same shape as the blueprint decider next door - make,
 * rename, reshape, share, hand over, retire, with `Asker` carrying who is
 * asking - and that repetition is the choice rather than an oversight. The two
 * nouns have the same *lifecycle* and nothing else in common: one is a model
 * with physics on it and the other is a list of quaternions. An abstraction
 * over the pair would be an abstraction over the word "mine", and it would have
 * to be unpicked the first time one of them grew a rule the other does not
 * have.
 */
export type ClipCommand =
  | {
      type: 'DrawClip'
      by: Asker
      name: string
      skeleton: string
      clip: BakedClip
      doc: unknown
      visibility: BlueprintVisibility
    }
  | { type: 'RenameClip'; by: Asker; name: string }
  | { type: 'ReshapeClip'; by: Asker; clip: BakedClip; doc: unknown }
  | { type: 'SetClipVisibility'; by: Asker; visibility: BlueprintVisibility }
  | { type: 'HandOverClip'; by: Asker; ownerId: string }
  | { type: 'RetireClip'; by: Asker }

export interface ClipState {
  status: 'none' | 'made' | 'retired'
  name: string
  skeleton: string
  ownerId: string
  visibility: BlueprintVisibility
  /** How many samples it holds, for the no-op check on a re-save. */
  samples: number
  duration: number
}

export const initialClipState: ClipState = {
  status: 'none',
  name: '',
  skeleton: '',
  ownerId: '',
  visibility: 'private',
  samples: 0,
  duration: 0,
}

export function evolve(state: ClipState, event: ClipEvent): ClipState {
  switch (event.type) {
    case 'ClipDrawn':
      return {
        ...state,
        status: 'made',
        name: event.data.name,
        skeleton: event.data.skeleton,
        ownerId: event.data.ownerId,
        visibility: event.data.visibility,
        samples: event.data.clip.times.length,
        duration: event.data.clip.duration,
      }

    case 'ClipRenamed':
      return { ...state, name: event.data.name }

    case 'ClipReshaped':
      return {
        ...state,
        samples: event.data.clip.times.length,
        duration: event.data.clip.duration,
      }

    case 'ClipVisibilitySet':
      return { ...state, visibility: event.data.visibility }

    case 'ClipHandedOver':
      return { ...state, ownerId: event.data.ownerId }

    case 'ClipRetired':
      return { ...state, status: 'retired' }

    default:
      return state
  }
}

export function decide(state: ClipState, command: ClipCommand): ClipEvent[] {
  switch (command.type) {
    case 'DrawClip': {
      if (state.status !== 'none') {
        throw new DomainError('That clip already exists', 'clip_exists')
      }
      assertName(command.name)
      assertClip(command.clip)

      return [
        {
          type: 'ClipDrawn',
          data: {
            name: command.name.trim(),
            skeleton: command.skeleton,
            clip: command.clip,
            doc: command.doc,
            ownerId: command.by.actorId,
            visibility: command.visibility,
          },
        },
      ]
    }

    case 'RenameClip': {
      assertMine(state, command.by)
      assertName(command.name)

      const name = command.name.trim()
      if (state.name === name) return []

      return [{ type: 'ClipRenamed', data: { name } }]
    }

    case 'ReshapeClip': {
      assertMine(state, command.by)
      assertClip(command.clip)

      /*
       * No no-op check, unlike every other reshape in this domain.
       *
       * The obvious one - "same number of samples, same duration" - is wrong:
       * moving a hand without adding a key changes every quaternion and neither
       * number, so it would silently refuse to save the commonest edit there
       * is. Comparing the samples themselves means stringifying up to a few
       * hundred kilobytes on every save, to avoid writing an event somebody
       * asked for by pressing Save. Writing it is cheaper and never wrong.
       */
      return [{ type: 'ClipReshaped', data: { clip: command.clip, doc: command.doc } }]
    }

    case 'SetClipVisibility': {
      assertMine(state, command.by)
      if (state.visibility === command.visibility) return []

      return [{ type: 'ClipVisibilitySet', data: { visibility: command.visibility } }]
    }

    case 'HandOverClip': {
      assertMine(state, command.by)
      if (state.ownerId === command.ownerId) return []

      return [
        {
          type: 'ClipHandedOver',
          data: { ownerId: command.ownerId, formerOwnerId: state.ownerId },
        },
      ]
    }

    case 'RetireClip': {
      if (state.status === 'none') throw notFound()
      if (state.status === 'retired') return []
      assertMine(state, command.by)

      return [{ type: 'ClipRetired', data: {} }]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function notFound(): DomainError {
  return new DomainError('That clip is not on the shelf', 'clip_not_found')
}

function assertMine(state: ClipState, by: Asker): void {
  if (state.status === 'none') throw notFound()
  if (state.status === 'retired') {
    throw new DomainError('That clip was retired', 'clip_retired')
  }
  if (state.ownerId !== by.actorId && !by.admin) {
    throw new DomainError('That clip belongs to somebody else', 'clip_not_yours')
  }
}

function assertName(name: string): void {
  const trimmed = name.trim()
  if (trimmed === '') throw new DomainError('A clip needs a name', 'clip_no_name')
  if (trimmed.length > MAX_CLIP_NAME) {
    throw new DomainError(
      `A name must be under ${MAX_CLIP_NAME} characters`,
      'clip_name_long',
    )
  }
}

/**
 * What makes a baked clip playable.
 *
 * Four things, and each one is a way a clip can arrive broken from a browser
 * rather than a way somebody can make a bad animation:
 *
 *   - it has samples, and not more than a minute of them;
 *   - every bone track is the right length - `times.length * 4` numbers, since
 *     a quaternion is four. A track one number short binds and then plays
 *     garbage from the first frame that reads past its end;
 *   - the root track is `times.length * 3`, for the same reason;
 *   - the duration is a real, positive number, because a mixer divides by it.
 */
function assertClip(clip: BakedClip): void {
  const frames = clip.times.length

  if (frames === 0) throw new DomainError('That clip has no frames', 'clip_empty')
  if (frames > MAX_CLIP_SAMPLES) {
    throw new DomainError(
      `A clip may hold ${MAX_CLIP_SAMPLES} frames - about a minute`,
      'clip_too_long',
    )
  }
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new DomainError('That clip has no length', 'clip_no_duration')
  }
  if (clip.root.length !== frames * 3) {
    throw new DomainError('That clip is malformed', 'clip_malformed')
  }
  for (const track of Object.values(clip.bones)) {
    if (track.length !== frames * 4) {
      throw new DomainError('That clip is malformed', 'clip_malformed')
    }
  }
}

export const clipDecider: Decider<ClipState, ClipCommand, ClipEvent> = {
  streamType: CLIP_STREAM_TYPE,
  initialState: initialClipState,
  evolve,
  decide,
}
