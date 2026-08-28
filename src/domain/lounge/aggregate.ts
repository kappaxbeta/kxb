import type { LoungeCommand } from '@/domain/lounge/commands'
import {
  type BlockPlacement,
  blockKey,
  CHUNK_SIZE,
  chunkOf,
  LOUNGE_CHUNK_STREAM_TYPE,
  type LoungeEvent,
  WORLD_HEIGHT,
} from '@/domain/lounge/events'
import { DomainError } from '@/es/errors'
import type { Decider } from '@/es/types'

/**
 * One chunk's worth of blocks.
 *
 * The state is a flat map from "x,y,z" to model id. Nothing else - no mesh, no
 * geometry, no colour. Those belong to the renderer, and putting them here
 * would mean a texture change required rewriting history.
 */
export interface ChunkState {
  blocks: Readonly<Record<string, string>>
}

export const initialChunkState: ChunkState = { blocks: {} }

export function evolve(state: ChunkState, event: LoungeEvent): ChunkState {
  switch (event.type) {
    case 'BlocksPlaced': {
      const blocks = { ...state.blocks }
      for (const block of event.data.blocks) {
        blocks[blockKey(block.x, block.y, block.z)] = block.model
      }
      return { blocks }
    }

    case 'BlocksRemoved': {
      const blocks = { ...state.blocks }
      for (const position of event.data.positions) {
        delete blocks[blockKey(position.x, position.y, position.z)]
      }
      return { blocks }
    }

    case 'ChunkCleared':
      return { blocks: {} }

    default:
      return state
  }
}

/**
 * Decide what actually changed.
 *
 * The filtering here is what keeps the log from drowning. A creative-mode
 * player drags across a surface and re-sends the same block many times as the
 * cursor moves; placing a block that is already that model is not an event, it
 * is a no-op. Same for removing air. By the time a command reaches the log it
 * describes a real difference or it describes nothing.
 */
export function decide(state: ChunkState, command: LoungeCommand): LoungeEvent[] {
  switch (command.type) {
    case 'PlaceBlocks': {
      // Deduplicate by cell *before* comparing against state, last write wins.
      //
      // A batch arrives from a client that buffered edits for a few hundred
      // milliseconds, and a player dragging across a surface re-sends the same
      // cell as the cursor wobbles. Filtering only against state lets every one
      // of those through, because they all differ from what is currently there
      // - so the event ends up asserting two different things happened to one
      // cell at one instant, which is not a fact about the world.
      //
      // It is also unprojectable: a single upsert carrying two rows with the
      // same primary key fails with "ON CONFLICT DO UPDATE command cannot
      // affect row a second time".
      const latest = new Map<string, BlockPlacement>()
      for (const block of command.blocks) {
        assertInChunk(block, command.cx, command.cz)
        latest.set(blockKey(block.x, block.y, block.z), block)
      }

      const blocks = [...latest.values()].filter(
        (block) => state.blocks[blockKey(block.x, block.y, block.z)] !== block.model,
      )

      if (blocks.length === 0) return []
      return [
        {
          type: 'BlocksPlaced',
          data: { worldId: command.worldId, cx: command.cx, cz: command.cz, blocks },
        },
      ]
    }

    case 'RemoveBlocks': {
      // Same dedupe, same reason. Deleting twice is harmless where placing
      // twice is not, but an event that lists a cell twice is still claiming
      // something that did not happen.
      const seen = new Set<string>()
      const positions = command.positions.filter((position) => {
        assertInChunk(position, command.cx, command.cz)
        const key = blockKey(position.x, position.y, position.z)
        if (seen.has(key)) return false
        seen.add(key)
        return state.blocks[key] !== undefined
      })

      if (positions.length === 0) return []
      return [
        {
          type: 'BlocksRemoved',
          data: { worldId: command.worldId, cx: command.cx, cz: command.cz, positions },
        },
      ]
    }

    case 'ClearChunk': {
      if (Object.keys(state.blocks).length === 0) return []
      return [
        {
          type: 'ChunkCleared',
          data: { worldId: command.worldId, cx: command.cx, cz: command.cz },
        },
      ]
    }

    default: {
      const exhaustive: never = command
      throw new DomainError(`Unknown command: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * A chunk stream may only ever contain its own blocks.
 *
 * Without this a client could address any coordinate through any chunk, and the
 * world would develop blocks that live in one chunk's history but another
 * chunk's space - invisible until someone loads the region and finds a
 * contradiction that no replay can resolve.
 */
function assertInChunk(
  position: { x: number; y: number; z: number },
  cx: number,
  cz: number,
): void {
  if (
    !Number.isInteger(position.x) ||
    !Number.isInteger(position.y) ||
    !Number.isInteger(position.z)
  ) {
    throw new DomainError('Block coordinates must be integers', 'block_not_integer')
  }

  if (position.y < 0 || position.y >= WORLD_HEIGHT) {
    throw new DomainError(
      `Blocks must be between y=0 and y=${WORLD_HEIGHT - 1}`,
      'block_out_of_bounds',
    )
  }

  const actual = chunkOf(position.x, position.z)
  if (actual.cx !== cx || actual.cz !== cz) {
    throw new DomainError(
      `Block (${position.x}, ${position.z}) does not belong to chunk (${cx}, ${cz})`,
      'block_wrong_chunk',
    )
  }
}

/** Upper bound on a chunk's contents, for sanity checks and tests. */
export const MAX_BLOCKS_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT

export const loungeDecider: Decider<ChunkState, LoungeCommand, LoungeEvent> = {
  streamType: LOUNGE_CHUNK_STREAM_TYPE,
  initialState: initialChunkState,
  evolve,
  decide,
}

export type { BlockPlacement }
