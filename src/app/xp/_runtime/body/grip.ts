import * as THREE from 'three'

/**
 * Which way a hand bone points, measured against the body it belongs to.
 *
 * A weapon hangs off a bone, and a bone's axes are whoever rigged it's
 * business: `handslot.r` in `Dummy.glb` has its +z pointing at the sky in the
 * rest pose, so a gun authored with its barrel along its own +z arrives aimed
 * upwards. Dividing the bone's rest orientation out is what makes an unturned
 * gun point where the body is facing - the frame an author can reason about,
 * where `yaw: 45` is forty-five degrees off where you are looking.
 *
 * ---------------------------------------------------------------------------
 * Against the body, and never against the world
 * ---------------------------------------------------------------------------
 * The obvious way to measure it is `bone.getWorldQuaternion()`, and that is the
 * bug this function exists to not have: by the time it runs, the clone is
 * already mounted under a group that is turned to face wherever the player is
 * looking, so the world orientation carries the body's *facing* in it. Dividing
 * that out welds the gun to a compass direction - it keeps pointing north while
 * the body turns underneath it, which is exactly what "the weapon position was
 * stuck" looks like from the outside.
 *
 * So the chain is walked from the bone up to the body's own root and no
 * further. That answers "where does this hand point *on this body*", which is
 * the same answer at every heading, on every frame, and in a test with no
 * renderer at all.
 *
 * Local quaternions rather than matrices: a rig scales bones, and a world
 * matrix decomposed back into a rotation after a non-uniform scale is not the
 * rotation that went in.
 *
 * Read once, before the mixer has touched the clone, so it is the bind pose
 * rather than whatever frame of whatever clip happened to be playing. The
 * animation still swings the weapon afterwards - this is a fixed transform *on*
 * the bone, and the bone is the thing that moves.
 */
export function gripFrame(bone: THREE.Object3D, root: THREE.Object3D): THREE.Quaternion {
  const rest = new THREE.Quaternion()
  /**
   * Premultiplied, walking up. Composing down the chain is `parent * child`, so
   * starting at the bone and putting each ancestor in front of what is already
   * there builds the same product from the other end.
   *
   * The guard is a bone that is not under this root at all - a rig that changed
   * shape, or a lookup that found somebody else's hand. Better a gun in the
   * body's own frame than a walk to the top of the scene, which is the bug
   * above wearing a different hat.
   */
  for (let node: THREE.Object3D | null = bone; node && node !== root; node = node.parent) {
    rest.premultiply(node.quaternion)
  }
  return rest.invert()
}
