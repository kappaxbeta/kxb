import { z } from 'zod'
import {
  ROOM_CAP_MAX,
  ROOM_CAP_MIN,
  ROOM_GROUP_MAX,
  ROOM_NAME_MAX,
  type RoomMode,
  type RoomVisibility,
} from '@/domain/rooms/events'
import { ROOM_ICONS, ROOM_TINTS } from '@/domain/rooms/look'

/**
 * Commands against one room.
 *
 * Same division of labour as the battlefield commands next door, and for the
 * same reason: this decider can only answer questions about *this stream*, so
 * "does this room exist, is it still open, is this change a no-op" happen here,
 * and "are you an admin of the space that owns it" happens in the action, which
 * is the only side that can ask the roster.
 */

export const roomNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the room a name')
  .max(ROOM_NAME_MAX, `Name cannot exceed ${ROOM_NAME_MAX} characters`)

export const roomVisibilitySchema = z.enum(['open', 'private'])

export const createRoomSchema = z.object({
  name: roomNameSchema,
  visibility: roomVisibilitySchema.default('open'),
})

export const setRoomVisibilitySchema = z.object({
  roomId: z.uuid(),
  visibility: roomVisibilitySchema,
})

export const roomModeSchema = z.enum(['creative', 'battle'])

export const setRoomModeSchema = z.object({
  roomId: z.uuid(),
  mode: roomModeSchema,
})

/**
 * A level reference, in the shape the read model's check constraint accepts.
 *
 * The same expression `createXpRoom` tests by hand and the same one
 * 20261015000000_rooms_xp.sql enforces. Written once here now that two commands
 * carry one.
 */
export const xpRefSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'That is not a level')

export const setRoomXpSchema = z.object({
  roomId: z.uuid(),
  xpRef: xpRefSchema,
  /** The new level's own ceiling, when it declares one a room can be capped at. */
  cap: z.number().int().min(ROOM_CAP_MIN).max(ROOM_CAP_MAX).optional(),
})

export const renameRoomSchema = z.object({
  roomId: z.uuid(),
  name: roomNameSchema,
})

export const roomIdSchema = z.object({ roomId: z.uuid() })

/**
 * `null` is a real value here, not a missing one - it means "let the event
 * decide" - so it is nullable rather than optional. An optional field would
 * make "clear the cap" and "leave the cap alone" the same request.
 */
export const setRoomCapSchema = z.object({
  roomId: z.uuid(),
  cap: z.number().int().min(ROOM_CAP_MIN).max(ROOM_CAP_MAX).nullable(),
})

export const setRoomGuestBuildSchema = z.object({
  roomId: z.uuid(),
  allowed: z.boolean(),
})

export const setRoomPinnedSchema = z.object({
  roomId: z.uuid(),
  pinned: z.boolean(),
})

/**
 * A group caption, or nothing.
 *
 * `nullable` rather than `optional` for the reason the cap schema gives one
 * line up: null is a real value here - "take it out of its group" - and an
 * optional field would make that indistinguishable from "leave it where it is".
 *
 * An empty string is null rather than an error. It is what the field says when
 * somebody clears it, and refusing that would mean the only way out of a group
 * is a separate button beside the field somebody has just emptied.
 */
export const roomGroupSchema = z
  .string()
  .trim()
  .max(ROOM_GROUP_MAX, `A group name cannot exceed ${ROOM_GROUP_MAX} characters`)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()

export const setRoomGroupSchema = z.object({
  roomId: z.uuid(),
  group: roomGroupSchema,
})

/**
 * An icon and a colour, each out of its own fixed list, or nothing.
 *
 * `z.enum` over the vocabulary rather than a free string, which is the whole
 * defence: there is no check constraint on either column - see the migration
 * for why - so this schema is the only thing between the picker and a row
 * holding a name nothing can draw.
 *
 * Nullable rather than optional, for the third time in this file and the same
 * reason: null is "take the icon off", and an optional field would make that
 * the same request as "leave it alone".
 */
export const setRoomIconSchema = z.object({
  roomId: z.uuid(),
  icon: z.enum(ROOM_ICONS).nullable(),
})

export const setRoomTintSchema = z.object({
  roomId: z.uuid(),
  tint: z.enum(ROOM_TINTS).nullable(),
})

export type CreateRoom = {
  type: 'CreateRoom'
  actorId: string
  name: string
  visibility: RoomVisibility
  /** The level this room is. Absent opens an ordinary lounge room. */
  xpRef?: string
  /**
   * Heads at once, when the room is opened knowing the number.
   *
   * Only a level supplies one today: a board game for four is for four, and the
   * door should say so from the first moment rather than after somebody sets it.
   * Absent leaves the room uncapped, which is every ordinary room.
   */
  cap?: number
}
export type RenameRoom = { type: 'RenameRoom'; actorId: string; name: string }
/**
 * Put another game in the slot.
 *
 * `cap` is the new level's `players.max`, carried for the same reason
 * `CreateRoom` carries one: the door's number comes from the level, so a room
 * that swaps a game for four into a slot that held a game for eight has to stop
 * admitting the fifth. Absent when the new level declares nothing a room can be
 * capped at, and the room keeps the cap it had.
 */
export type SetRoomXp = {
  type: 'SetRoomXp'
  actorId: string
  xpRef: string
  cap?: number
}
export type SetRoomVisibility = {
  type: 'SetRoomVisibility'
  actorId: string
  visibility: RoomVisibility
}
export type SetRoomMode = {
  type: 'SetRoomMode'
  actorId: string
  mode: RoomMode
}
export type SetRoomCap = {
  type: 'SetRoomCap'
  actorId: string
  cap: number | null
}
export type SetRoomGuestBuild = {
  type: 'SetRoomGuestBuild'
  actorId: string
  allowed: boolean
}
export type SetRoomPinned = {
  type: 'SetRoomPinned'
  actorId: string
  pinned: boolean
}
export type SetRoomGroup = {
  type: 'SetRoomGroup'
  actorId: string
  group: string | null
}
export type SetRoomIcon = {
  type: 'SetRoomIcon'
  actorId: string
  icon: string | null
}
export type SetRoomTint = {
  type: 'SetRoomTint'
  actorId: string
  tint: string | null
}
export type CloseRoom = { type: 'CloseRoom'; actorId: string }

/**
 * Deal, or open the table again.
 *
 * `now` is stamped in the action from the server's clock, exactly as
 * `CallFullTime` does in the battle decider and for the same reason.
 */
export type StartRound = { type: 'StartRound'; actorId: string; now: string }
export type ReopenRound = { type: 'ReopenRound'; actorId: string }

export type RoomCommand =
  | StartRound
  | ReopenRound
  | CreateRoom
  | RenameRoom
  | SetRoomXp
  | SetRoomVisibility
  | SetRoomMode
  | SetRoomCap
  | SetRoomGuestBuild
  | SetRoomPinned
  | SetRoomGroup
  | SetRoomIcon
  | SetRoomTint
  | CloseRoom
