'use client'

import { useFrame } from '@react-three/fiber'
import { Suspense, useRef, useState } from 'react'
import * as THREE from 'three'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { KICK_LUNGE_DURATION, kickLunge } from '@/app/world/lounge/_sim/combat'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import { ChatBubble } from '@/app/world/_canvas/chat-bubble'
import { EmoteBubble } from '@/app/world/_canvas/emote-bubble'
import type { PlateTone } from '@/app/world/_canvas/nameplate'
import { PartyGlow, usePartyColour } from '@/app/world/_canvas/party-glow'
import { AvatarPlaceholder } from '@/app/world/_canvas/rainbow'
import { TeamRing } from '@/app/world/_canvas/team-ring'
import { FaceCircle } from '@/app/world/_canvas/face-circle'
import { useLocalFace } from '@/app/world/_stores/face-store'
import type { AvatarClip } from '@/domain/lounge/avatars'

/**
 * The avatar gets its own scratch, rather than borrowing the controller's.
 *
 * Both run inside useFrame and neither holds a value across frames, so sharing
 * would work today - and would break silently the first time somebody reordered
 * the components or read the vector after an await. Two vectors is cheaper than
 * that bug.
 */
const AVATAR_FORWARD = new THREE.Vector3()

/**
 * Which way the animals face in model space.
 *
 * The pack faces +Z, so turning to look along a direction is a plain
 * atan2(x, z) with no half-turn correction. Verified by eye rather than from the
 * glTF - nothing in the file records which end is the front.
 */
const AVATAR_FACING_OFFSET = 0

/** Displacement per second above which the walk and run clips take over. */
const WALK_SPEED = 0.6
const RUN_SPEED = 16

/**
 * You, as seen from behind.
 *
 * The gait is read from the player's actual displacement rather than from the
 * key state, which means it needs no plumbing into the controller and works
 * identically for a thumbstick, a keyboard, or anything added later. If you
 * moved, you are walking - that is the whole rule.
 *
 * Clip changes go through React state, but only on a change, following the same
 * discipline as <Targeting>: setting state every frame would re-render the scene
 * sixty times a second.
 */
export function SelfAvatar({
  model,
  tone,
  visible,
  dancing,
  party,
  partyHost,
}: {
  model: string
  /** Our own side, in a match that has them. */
  tone?: PlateTone
  visible: boolean
  dancing: boolean
  /** Our own id while the lights are on, null otherwise. It picks the hue. */
  party: string | null
  /** Whether we are the one who started it, and so cycle rather than sit still. */
  partyHost: boolean
}) {
  const { playerRef, headingRef, kickLungeRef, selfEmoteRef, selfSaidRef } = useSceneRefs()

  const group = useRef<THREE.Group>(null)
  const previous = useRef(new THREE.Vector3())
  const [clip, setClip] = useState<AvatarClip>('idle')

  // Held whether or not there is a party on: it is one Color and a sine, and a
  // hook cannot be called conditionally. What `party` decides is who reads it.
  const partyColour = usePartyColour(party ?? 'you', partyHost)

  /** Our own picture, when the switch in the HUD is on. See `face-store`. */
  const selfFace = useLocalFace()

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return

    const player = playerRef.current

    // Gait first, so it keeps updating while the body is hidden - stepping into
    // first person and back out should not catch the avatar mid-pose.
    const speed = player.distanceTo(previous.current) / Math.max(delta, 0.0001)
    previous.current.copy(player)

    const next: AvatarClip = dancing
      ? 'dance'
      : speed > RUN_SPEED
        ? 'run'
        : speed > WALK_SPEED
          ? 'walk'
          : 'idle'
    if (next !== clip) setClip(next)

    // The lunge clock, ticked here for the same reason the gait is: a kick
    // thrown in first person should be over by the time you turn around, not
    // waiting to play the moment a body appears. Clamped at the end so it
    // cannot count up forever.
    kickLungeRef.current = Math.min(kickLungeRef.current + delta, KICK_LUNGE_DURATION)

    if (!visible) return

    // Standing where the player is, feet on the surface the eye is above.
    node.position.set(player.x, player.y - EYE_HEIGHT, player.z)

    /**
     * Turned by the horizontal part of the *player's* heading.
     *
     * From `headingRef` and not from the camera, which is the whole of the
     * mirror bug: with the camera round the front looking back, its direction is
     * the opposite of the way you are facing, so the body turned to keep its
     * back to the lens and the mirror showed the back of your head.
     *
     * Horizontal only. The full vector would tip the body forward whenever you
     * glanced at your feet, and an animal lying face-down in the floor is not
     * what looking down means - `headingRef` is already flattened, and this
     * repeats it so the invariant is enforced where it is relied on.
     */
    AVATAR_FORWARD.copy(headingRef.current)
    AVATAR_FORWARD.y = 0
    // Looking straight up or down leaves nothing to normalise; keep the last
    // heading rather than snapping to an arbitrary one.
    if (AVATAR_FORWARD.lengthSq() < 1e-6) return
    AVATAR_FORWARD.normalize()

    node.rotation.y =
      Math.atan2(AVATAR_FORWARD.x, AVATAR_FORWARD.z) + AVATAR_FACING_OFFSET

    /**
     * And the kick's shove forward, applied to the drawn body only.
     *
     * Along the heading we are facing *now* rather than the one the kick was
     * aimed along, so a lunge and a turn do not tear the body away from its own
     * feet. Over a quarter of a second the difference is nothing you could spot,
     * and the alternative is an animal sliding sideways.
     */
    const push = kickLunge(kickLungeRef.current)
    if (push > 0) {
      node.position.x += AVATAR_FORWARD.x * push
      node.position.z += AVATAR_FORWARD.z * push
    }
  })

  return (
    <group ref={group} visible={visible}>
      {/* A body-shaped ghost rather than nothing, so third person and the
          mirror have something standing where you are from the first frame -
          an empty mirror reads as a broken camera, not as a pending download. */}
      <Suspense fallback={<AvatarPlaceholder />}>
        <AvatarModel model={model} clip={clip} ignoreRay rim={party ? partyColour : null} />
      </Suspense>

      {/* Inside the visibility gate with the body, because it is drawn at our
          own feet: in first person there is no body for it to belong to, and
          the roster in the HUD is where you look to be told your own side. */}
      {tone && <TeamRing tone={tone} />}

      {/* Outside it would be better - a light does not need a body to shine -
          but the group carries the whole gate, and a first-person player is
          standing inside their own light either way: the one thing a point
          light at your own chest cannot illuminate is the room in front of you.
          So it goes out with the body, and third person is where you see it. */}
      {party && <PartyGlow colour={partyColour} />}

      {/*
        Your own camera, over your own body.
        Inside the visibility gate with everything else here, which makes third
        person and the mirror the two places you can see it - and makes the
        mirror the check somebody actually performs: press R, and either your
        own face is looking back at you or the camera never started. Without it
        the only way to know whether the switch worked is to ask somebody else
        in the room.
      */}
      {selfFace && <FaceCircle stream={selfFace} />}

      {/* Inside the visibility gate on purpose. In first person there is no
          body to hang a face over, and a bubble floating in front of your own
          camera reads as a bug rather than as feedback. */}
      <EmoteBubble state={selfEmoteRef} />
      {/* Same gate, same reason. Your own words are in the panel in front of
          you either way; this is only so third person shows you what everybody
          else is seeing over your head. */}
      <ChatBubble state={selfSaidRef} />
    </group>
  )
}
