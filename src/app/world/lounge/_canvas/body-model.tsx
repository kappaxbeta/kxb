'use client'

import type * as THREE from 'three'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { SkinModel } from '@/app/world/lounge/_canvas/skin-model'
import { type AvatarClip, isSkinLook } from '@/domain/lounge/avatars'

/**
 * Whichever half of you is standing here.
 *
 * One `look` string carries both answers and the slash tells them apart: a
 * bare name is an animal from the roster, a qualified `pack/name` is a bought
 * skin. The same discriminator the XP engine uses in `bodiesFor`, for the same
 * reason - one field on the wire, one column in the row, and no third state
 * that can disagree with itself.
 *
 * Every caller that used to draw `AvatarModel` draws this instead, so the two
 * bodies stay interchangeable at every site rather than at the ones somebody
 * remembered to update.
 */
export function BodyModel(props: {
  look: string
  clip?: AvatarClip
  /**
   * A clip the space made, built and handed down ready to play.
   *
   * An `AnimationClip` rather than a name, because resolving a name means
   * knowing which clips this space has - and that is the *scene's* knowledge,
   * loaded with the world. A body should be handed what to play, not sent
   * looking for it.
   *
   * Wins over `clip` when present: somebody sitting in a chair is not also
   * walking, and the gait it would otherwise blend with is computed from a
   * speed that is zero while they are pinned to a seat.
   */
  pose?: THREE.AnimationClip | null
  fade?: number
  ignoreRay?: boolean
  rim?: THREE.Color | null
}) {
  const { look, ...rest } = props
  return isSkinLook(look) ? (
    <SkinModel model={look} {...rest} />
  ) : (
    <AvatarModel model={look} {...rest} />
  )
}
