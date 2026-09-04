/**
 * The avatar roster.
 *
 * An allow-list, for the same reason the block palette is one: the chosen id
 * ends up in the event log forever, so the action validates against this before
 * writing. Otherwise a crafted request could put an arbitrary string in
 * immutable history, and the renderer would later try to fetch
 * `/xo/peeps/animal-<whatever>.glb`.
 *
 * Ids match the filenames in public/xo/peeps/, minus the `animal-` prefix.
 * Renaming a file means renaming it here *and* leaving the old id resolvable,
 * because members who chose it are already recorded under the old name.
 */

export const AVATAR_PATH = '/xo/peeps'

export const AVATARS = [
  'beaver',
  'bee',
  'bunny',
  'cat',
  'caterpillar',
  'chick',
  'cow',
  'crab',
  'deer',
  'dog',
  'elephant',
  'fish',
  'fox',
  'giraffe',
  'hog',
  'koala',
  'lion',
  'monkey',
  'panda',
  'parrot',
  'penguin',
  'pig',
  'polar',
  'tiger',
] as const

export type Avatar = (typeof AVATARS)[number]

const AVATAR_SET: ReadonlySet<string> = new Set(AVATARS)

export function isKnownAvatar(avatar: string): boolean {
  return AVATAR_SET.has(avatar)
}

/**
 * The shape of a bought skin's id: one pack, one slash, one name.
 *
 * What somebody wears in the lounge is now one of two things, and this is the
 * whole of the difference between them - `fox` is an animal off the roster
 * above, `adventurers/Knight` is a skin out of the games' catalogue. The slash
 * is the discriminator the XP engine already uses for the same question, so
 * the two halves of the product agree about what a look is.
 *
 * A *shape* test rather than a membership one, deliberately. The roster above
 * is this module's to know; the skin catalogue is the shop's, and a lounge
 * that imported it would load the games' model table to draw an animal. An id
 * that passes this and names nothing degrades in the renderer exactly as a
 * retired animal always has.
 *
 * The character class is what keeps an id inside its own directory - the same
 * refusal `splitModel` makes - so a look can never address a file above the
 * pack it claims to come from.
 */
export function isSkinLook(look: string): boolean {
  return /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(look)
}

/**
 * The plain dummy: the body a player is before they are anybody.
 *
 * A qualified catalogue id like any skin, so every seam already handles it -
 * `isSkinLook` says yes, `BodyModel` draws it down the skinned path, and the
 * presence channel carries it as it carries a Knight. What makes it worth a
 * name is that it is not bought and therefore is not on the shelf: it is what
 * an account with no skin already wears in the games, and what somebody with
 * no account at all stands in here.
 *
 * Client-safe on purpose. `GUEST_LOOK` in domain/skins/queries.ts is this
 * constant under the server's name for it.
 */
export const DUMMY_LOOK = 'dummy/Dummy'

/**
 * Is this a look anything can draw - either roster animal or skin?
 *
 * The presence channel's guard. It used to be `isKnownAvatar`, which answered
 * "no" for every skin and quietly replaced it with the default penguin, so a
 * dressed player arrived in everybody else's lounge as somebody else entirely.
 */
export function isKnownLook(look: string): boolean {
  return isKnownAvatar(look) || isSkinLook(look)
}

/**
 * The 3D model, for the renderer.
 *
 * A `.glb`, and therefore only ever an argument to `useGLTF`. It is not an
 * image and cannot be one: handing this to `next/image` renders nothing at all,
 * which is precisely what the guest door did until it was noticed on kxb.team.
 * Reach for `avatarShotUrl` anywhere a picture is wanted.
 */
export function avatarUrl(avatar: string): string {
  return `${AVATAR_PATH}/animal-${avatar}.glb`
}

/** Where the pre-rendered stills live. */
export const AVATAR_SHOT_PATH = '/xo/shots'

/**
 * The angles every animal was shot from.
 *
 * Named rather than free text so a typo is a type error instead of a missing
 * image - the whole failure being fixed here was a path nothing could resolve
 * and nothing complained about.
 */
export type AvatarAngle = 'front' | 'back' | 'side' | 'low' | 'three'

/**
 * The avatar as a picture.
 *
 * These are stills of the same GLBs the lounge loads, rendered ahead of time
 * into `public/xo/shots`, so a thumbnail cannot advertise an animal the product
 * does not have. Any surface outside the 3D scenes wants this one: a form, a
 * roster, a card. Drawing a real model there would mean a WebGL canvas per
 * thumbnail, which for a 36px grid of twenty-four is absurd.
 */
export function avatarShotUrl(avatar: string, angle: AvatarAngle = 'front'): string {
  return `${AVATAR_SHOT_PATH}/${avatar}-${angle}.webp`
}

/**
 * Who you are until you choose otherwise.
 *
 * Everyone starting as the same animal is the point: it makes picking one feel
 * like a thing worth doing, and it is the joke the whole roster is built around.
 */
export const DEFAULT_AVATAR: Avatar = 'penguin'

/**
 * Animation clips, present in every model in the pack under these exact names.
 *
 * Verified against the glTF animation channels rather than assumed - the pack is
 * uniform, which is what makes it safe to drive any avatar from one state
 * machine. `static` is the T-pose-ish rest clip and is deliberately unused.
 */
export const AVATAR_CLIPS = {
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  dance: 'dance',
} as const

export type AvatarClip = (typeof AVATAR_CLIPS)[keyof typeof AVATAR_CLIPS]

/**
 * A clip name off a blueprint, as one of the four this rig has.
 *
 * Null for anything else, including null itself. A blueprint's vocabulary is
 * deliberately open - see `UseSpec` - and this is the one place it meets a
 * closed one, so the narrowing happens here rather than at the boundary where a
 * name is written down.
 *
 * In the domain rather than beside the scene that first needed it, because two
 * renderers now ask: the lounge draws your own body from what you pressed E on,
 * and it draws everybody else's from the same name arriving over presence. Two
 * copies of this would be a body that sat down on its owner's screen and stood
 * up on everybody else's.
 */
export function asAvatarClip(name: string | null): AvatarClip | null {
  if (!name) return null
  return (Object.values(AVATAR_CLIPS) as readonly string[]).includes(name)
    ? (name as AvatarClip)
    : null
}

/**
 * How tall the animals are, in world units - which are also blocks.
 *
 * Measured by walking the glTF node tree and applying each node's translation to
 * its mesh accessor bounds. Doing it from the accessors alone gives the wrong
 * answer: a leg mesh runs to y = -0.3 in its own space and its node lifts it back
 * by +0.3, so the raw minimum looks like the model is buried when in fact
 * **every animal in the pack stands exactly on y = 0**. No foot offset is needed;
 * draw one at floor level and it is standing on the floor.
 *
 * The spread is only useful for framing a camera - the crab is 1.43 and the
 * bunny's ears reach 2.01, against an eye height of 1.7. That is the right range
 * for the world to read as person-sized, so nothing here is scaled.
 */
export const AVATAR_MIN_HEIGHT = 1.43
export const AVATAR_MAX_HEIGHT = 2.01
