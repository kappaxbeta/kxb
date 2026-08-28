'use client'

import { useTexture } from '@react-three/drei'
import { Suspense } from 'react'
import * as THREE from 'three'
import { useRainbowScenery } from '@/app/world/_canvas/rainbow'
import type { LoungeImageView } from '@/domain/lounge/image-queries'

/**
 * Images standing in the world.
 *
 * Each one is a plane on the same 1-unit lattice as the blocks: anchored at its
 * cell, `width` cells across, `height` cells tall, turned in quarter steps about
 * Y. Snapping to the grid is what makes them feel part of the world rather than
 * stuck on top of it - and it is why the aggregate refuses fractional cells
 * rather than rounding them, so what you see is what was recorded.
 *
 * Rendered double-sided on purpose. A poster you can walk behind and find
 * invisible reads as a bug, and the alternative - forcing people to work out
 * which way "north" is before placing - is worse.
 */

/** Where a plane sits, given its anchor cell, size and facing. */
export function imageTransform(image: LoungeImageView) {
  const angle = (image.facing * Math.PI) / 2

  // The anchor is the cell's corner; the plane is centred, so it shifts half a
  // width along its own rotated axis and half a height upward.
  const halfWidth = image.width / 2
  const offsetX = Math.cos(angle) * halfWidth
  const offsetZ = -Math.sin(angle) * halfWidth

  return {
    position: [
      image.x + 0.5 + offsetX - Math.cos(angle) * 0.5,
      image.y + image.height / 2,
      image.z + 0.5 + offsetZ + Math.sin(angle) * 0.5,
    ] as [number, number, number],
    rotation: [0, angle, 0] as [number, number, number],
  }
}

function ImagePlane({
  image,
  selected,
  onSelect,
}: {
  image: LoungeImageView
  selected: boolean
  onSelect: (id: string) => void
}) {
  // The serving route resolves the slug with the viewer's session, so an image
  // from another workspace simply 404s rather than leaking.
  const texture = useTexture(`/api/uploads/${image.uploadSlug}`)
  const { position, rotation } = imageTransform(image)
  const skin = useRainbowScenery()

  return (
    <group position={position} rotation={rotation}>
      {/*
        A frame rather than a repaint, which is the one place rainbow mode does
        not simply replace a surface: a picture turned to glass is a picture
        nobody can see any more, and the reason somebody hung it is that it has
        something on it. So the poster stays exactly as it is and gets a slab of
        rainbow behind it, standing a little proud on every side.

        A slab and not a plane, because the whole look is a Fresnel edge - a
        flat sheet facing the room has no edge to catch and would render as a
        dull tint.
      */}
      {skin && (
        <mesh
          position={[0, 0, -0.04]}
          material={skin}
          userData={{ ignoreRay: true }}
        >
          <boxGeometry args={[image.width + 0.24, image.height + 0.24, 0.07]} />
        </mesh>
      )}

      <mesh
        userData={{ imageId: image.id }}
        // Selection works with the cursor free, not under pointer lock - which
        // is the only time a browser delivers a click at a real position. Press
        // Escape to release the mouse, then click a picture.
        onPointerDown={(event) => {
          if (document.pointerLockElement) return
          event.stopPropagation()
          onSelect(image.id)
        }}
      >
        <planeGeometry args={[image.width, image.height]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {selected && (
        // Outline slightly in front of the plane, or z-fighting makes the
        // selection flicker as the camera moves.
        <lineSegments position={[0, 0, 0.01]} userData={{ ignoreRay: true }}>
          <edgesGeometry
            args={[new THREE.PlaneGeometry(image.width + 0.06, image.height + 0.06)]}
          />
          <lineBasicMaterial color="#7c3aed" />
        </lineSegments>
      )}
    </group>
  )
}

export function LoungeImages({
  images,
  selectedId,
  onSelect,
}: {
  images: LoungeImageView[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <>
      {images.map((image) => (
        // Suspense per image, not around the set: one slow or missing texture
        // should not hold back every other picture in the world.
        <Suspense key={image.id} fallback={null}>
          <ImagePlane
            image={image}
            selected={image.id === selectedId}
            onSelect={onSelect}
          />
        </Suspense>
      ))}
    </>
  )
}
