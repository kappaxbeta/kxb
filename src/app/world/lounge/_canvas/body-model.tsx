'use client'

import type { RefObject } from 'react'
import type * as THREE from 'three'
import type { GlitchUniforms } from '@/app/world/_canvas/body-shader'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { SkinModel } from '@/app/world/lounge/_canvas/skin-model'
import { type AvatarClip, type Gait, isSkinLook } from '@/domain/lounge/avatars'

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
   * What the legs do while `clip` is the dance - walking or running.
   *
   * Absent for a dance on the spot, and ignored for any other clip: it is the
   * one case where a body does two things at once, and it is cut at the waist
   * by `splitForFeet` rather than blended, so the arms keep cheering at full
   * strength while the feet keep up.
   */
  feet?: Gait
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
  /** A bad connection drawn on the body, or null. See `wear` in ../_canvas/body-shader. */
  glitch?: RefObject<GlitchUniforms> | null
}) {
  const { look, ...rest } = props
  return isSkinLook(look) ? (
    <SkinModel model={look} {...rest} />
  ) : (
    <AvatarModel model={look} {...rest} />
  )
}
