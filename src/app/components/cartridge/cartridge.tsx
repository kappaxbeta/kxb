'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  animates,
  type CartridgeFinish,
  DEFAULT_FINISH,
  plateMaterial,
  shellMaterial,
} from '@/app/components/cartridge/finishes'
import { makeNameplate, type Nameplate, PLATE_HEIGHT } from '@/app/components/cartridge/nameplate'
import { CART, LABEL, LABEL_ASPECT, useCartridgeParts } from '@/app/components/cartridge/model'
import {
  NEON_LIT,
  neonEdges,
  neonMaterial,
  neonRest,
} from '@/app/components/cartridge/neon'
import { RIM_SCALE, rimMaterial } from '@/app/components/cartridge/rim'
import { hueFor } from '@/app/components/hue'

/**
 * One level, as a thing you could hold.
 *
 * ---------------------------------------------------------------------------
 * What a cartridge is for
 * ---------------------------------------------------------------------------
 * `docs/xp/...` calls a space a console and an XP a cartridge, and until now
 * that was a word in a paragraph. A grid of bordered rectangles is a *list of
 * records*; it says these are rows in a table somebody may act on. A shelf of
 * cartridges says something different and truer about what an XP is: an object
 * that belongs to somebody, that goes in and comes out, and that has a front
 * you can recognise from across the room without reading it.
 *
 * ---------------------------------------------------------------------------
 * The three pieces
 * ---------------------------------------------------------------------------
 * - the **shell**, moulded plastic in a hue derived from the reference
 * - the **cover**, the level's own picture, sunk into the sticker recess
 * - the **plate**, the name under it, painted in the product's pixel face
 *
 * The name is a child of the cartridge rather than a sibling, so it tips with
 * it. A label that stayed flat while the thing it labels turned would read as
 * two objects that happen to be near each other.
 *
 * ---------------------------------------------------------------------------
 * It leans toward the pointer, and so do its neighbours
 * ---------------------------------------------------------------------------
 * Not a hover state. `pull` falls off with distance, so moving across a shelf
 * bends a small crowd of cartridges rather than switching one on and the last
 * one off - which is the difference between a shelf that is alive and a grid of
 * buttons that light up. The one actually under the pointer gets the lift on
 * top of the lean, because that is the one a click would open.
 */

export interface ShelfItem {
  /** Whatever the surface keys a level by - a store id, a playable reference. */
  ref: string
  name: string
  /** The level's own picture, or null for one nobody has photographed. */
  cover: string | null
  /**
   * Held back, for a level this surface can show and not immediately use.
   *
   * Visual only, and deliberately so: a store level nobody has taken in cannot
   * be *played* here, but it can be taken in - and the panel that opens on a
   * click is where both of those are said. A cartridge that refused the click
   * would hide the one control that is free and unlimited on every tier.
   */
  dimmed?: boolean
  /**
   * What the shell is made of. The level's own choice, or plastic.
   *
   * On the item rather than on the shelf, because it is a fact about the level
   * and not about the surface showing it - the same cartridge is the same
   * material in the store, in the wizard and on a space's own workbench.
   */
  finish?: CartridgeFinish
  /**
   * The shell's colour, when the level named one.
   *
   * Absent is not "no colour": the hue is derived from `ref` instead, spread
   * around the wheel so neighbours differ. See `hueFor`, and the document field
   * in `@kxb/xp`'s `./finish` for why declaring one is the exception.
   */
  hue?: number
  /**
   * A sentence about the level, for the list beside the canvas.
   *
   * Only the store passes one, and the reason is that page specifically: it is
   * the shop window, read by people with no account, and its words *are* the
   * product. A canvas has no text in it, so the blurb has to be in the document
   * somewhere or the page stops saying anything to a screen reader or a
   * crawler. Everywhere else the surrounding page already carries the prose and
   * a name is enough to identify a row by.
   */
  description?: string
}

/** Where the pointer is on the shelf plane, shared by every cartridge on it. */
export interface ShelfPointer {
  x: number
  y: number
  /** False when the pointer has left the canvas, so the shelf settles flat. */
  near: boolean
}

/** How far a pointer reaches, in shelf units. About one cartridge each way. */
const REACH = 1.5

/** Radians of lean at full pull. Small on purpose: this is a lean, not a spin. */
const LEAN = 0.34

/**
 * How far a cartridge is tipped back when nothing is happening to it.
 *
 * A cartridge drawn square-on is a picture of a cartridge. Tipping the top away
 * by eight degrees puts the eye slightly above it, which is where you are when
 * something is on a shelf in front of you - and it is what makes the top edge
 * and the shoulder catch light, so the plastic reads as moulded rather than as
 * a coloured rectangle behind the cover.
 *
 * The pointer's lean is added on top of this rather than replacing it, so
 * pointing at one lifts it toward you *out of* the row's own angle.
 */
const REST_X = -0.14

/** How fast a cartridge catches up with where it should be, per second. */
const CATCH = 9

/** Below this, the pose is close enough that another frame would show nothing. */
const SETTLED = 0.0004

export function Cartridge({
  item,
  position,
  pointer,
  selected = false,
  onOpen,
}: {
  item: ShelfItem
  position: [number, number, number]
  pointer: React.RefObject<ShelfPointer>
  selected?: boolean
  onOpen: (ref: string) => void
}) {
  const parts = useCartridgeParts()
  const invalidate = useThree((state) => state.invalidate)

  const group = useRef<THREE.Group>(null)
  /*
    The two moulded meshes, so the glow can be driven per frame.

    Reached through refs rather than by touching `skin` directly: the materials
    come out of a `useMemo`, and writing to a memo's result from a frame
    callback is exactly what the immutability rule forbids - reasonably, since
    nothing would make React aware the value changed. The mesh owns its
    material; this asks the mesh.
  */
  const shellRef = useRef<THREE.Mesh>(null)
  const plateRef = useRef<THREE.Mesh>(null)
  /** The halo, whose one uniform rises with the pointer. See `rim.ts`. */
  const rimRef = useRef<THREE.Mesh>(null)
  /**
   * The neon, reached through the outline half.
   *
   * One ref for two sets of lines, because they share a material: brightening
   * the outline brightens the comb, which is what makes them one object rather
   * than two things lighting at their own rate.
   */
  const wireRef = useRef<THREE.LineSegments>(null)
  const [hovered, setHovered] = useState(false)

  // `??`, not `||`. Zero is red, and a level that asked for red would
  // otherwise silently get whatever its reference hashes to.
  const hue = item.hue ?? hueFor(item.ref)
  const finish = item.finish ?? DEFAULT_FINISH

  /*
    One set of materials per cartridge, because the colour is per cartridge -
    and disposed with it, because a shelf is remounted every time somebody
    types in the search box above it and leaked materials are how a picker ends
    up costing a hundred megabytes of GPU by lunchtime.
  */
  const skin = useMemo(
    () => ({
      shell: shellMaterial(finish, hue),
      plate: plateMaterial(finish, hue),
      rim: rimMaterial(hue),
      neon: neonMaterial(hue),
    }),
    [finish, hue],
  )

  useEffect(
    () => () => {
      skin.shell.dispose()
      skin.plate.dispose()
      skin.rim.dispose()
      skin.neon.dispose()
    },
    [skin],
  )

  /* --- the cover ---------------------------------------------------------- */

  /*
    The picture, carried with the URL it was loaded from.

    A bare texture would need clearing when a cartridge's cover changes to null,
    and clearing it means a `setState` in the body of an effect - a cascading
    render, and the thing the rule forbids. Keeping the URL beside the texture
    turns that into a comparison at render time instead: a texture that does not
    answer to the cover this cartridge is asking for is simply not used.
  */
  const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(null)
  const cover = loaded !== null && loaded.url === item.cover ? loaded.texture : null

  useEffect(() => {
    const url = item.cover
    if (!url) return

    let live = true
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        if (!live) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 4

        /*
          Cropped to the recess rather than squashed into it.

          A shot is 16:10 and the well is 1.577:1, which is close enough that a
          stretch would be *nearly* invisible - which is the worst kind, because
          it makes every level's art subtly wrong and nobody can say why. The
          picture is scaled to cover and centred, exactly as `object-cover`
          does it on the card version of the same image.
        */
        const image = texture.image as { width: number; height: number }
        const aspect = image.width / image.height
        if (aspect > LABEL_ASPECT) {
          texture.repeat.x = LABEL_ASPECT / aspect
          texture.offset.x = (1 - texture.repeat.x) / 2
        } else {
          texture.repeat.y = aspect / LABEL_ASPECT
          texture.offset.y = (1 - texture.repeat.y) / 2
        }

        setLoaded({ url, texture })
        // The scene is drawn on demand, and nothing else is about to ask for a
        // frame - so the picture would sit in memory unpainted without this.
        invalidate()
      },
      undefined,
      () => {
        // A cover that will not load leaves the empty well, which is what a
        // level with no shot yet looks like anyway.
      },
    )

    return () => {
      live = false
    }
  }, [item.cover, invalidate])

  useEffect(() => () => loaded?.texture.dispose(), [loaded])

  /* --- the name ----------------------------------------------------------- */

  const [plate, setPlate] = useState<Nameplate | null>(null)

  useEffect(() => {
    let live = true
    const tint = `hsl(${hue} 80% 55% / 0.85)`

    void makeNameplate(item.name, tint).then((painted) => {
      if (!live) {
        painted?.texture.dispose()
        return
      }
      setPlate(painted)
      invalidate()
    })

    return () => {
      live = false
    }
  }, [item.name, hue, invalidate])

  useEffect(() => () => plate?.texture.dispose(), [plate])

  /* --- the lean ----------------------------------------------------------- */

  /** Where the pose is now. Refs, not state: this changes sixty times a second. */
  const pose = useRef({ rx: 0, ry: 0, lift: 0, glow: 0 })

  useFrame((_state, delta) => {
    const node = group.current
    if (!node) return

    const here = pointer.current
    let pull = 0
    let toward = { x: 0, y: 0 }

    if (here?.near) {
      const dx = here.x - position[0]
      const dy = here.y - position[1]
      const distance = Math.hypot(dx, dy)
      // Squared falloff. Linear reads as a flat plate hinging, where this reads
      // as a crowd of separate objects each noticing at its own moment.
      const fade = Math.max(0, 1 - distance / REACH)
      pull = fade * fade
      toward = { x: dx, y: dy }
    }

    const want = {
      rx: REST_X - toward.y * pull * LEAN,
      ry: toward.x * pull * LEAN,
      lift: pull * 0.06 + (hovered ? 0.16 : 0) + (selected ? 0.1 : 0),
      glow: (hovered ? 0.5 : 0) + (selected ? 0.35 : 0) + pull * 0.08,
    }

    // Exponential damping, framerate-independent. `delta` is clamped because a
    // demand-driven canvas can hand over a whole second after an idle spell,
    // and `1 - e^-9` of the way there in one step is a jump rather than a move.
    const step = 1 - Math.exp(-CATCH * Math.min(delta, 0.05))
    const now = pose.current
    let moving = false

    for (const key of ['rx', 'ry', 'lift', 'glow'] as const) {
      const gap = want[key] - now[key]
      if (Math.abs(gap) > SETTLED) moving = true
      now[key] += gap * step
    }

    node.rotation.x = now.rx
    node.rotation.y = now.ry
    node.position.z = position[2] + now.lift
    /*
      The glow, and the galaxy's clock.

      Reached through the mesh rather than through `skin` for the reason the
      refs' own note gives. The two finishes take it differently: a lit material
      has an `emissiveIntensity` to raise, and the galaxy has a uniform, because
      it is not lit at all.
    */
    const shell = shellRef.current?.material as
      | (THREE.Material & {
          emissiveIntensity?: number
          uniforms?: Record<string, { value: number }>
        })
      | undefined
    const plate = plateRef.current?.material as
      | (THREE.Material & {
          emissiveIntensity?: number
          uniforms?: Record<string, { value: number } | undefined>
        })
      | undefined

    if (shell?.uniforms) {
      // Guarded per uniform rather than per material: the three shader finishes
      // do not all have a clock - `neon` deliberately has none - and reading
      // `.value` off an absent uniform is a crash that takes the canvas with it.
      if (shell.uniforms.uTime) shell.uniforms.uTime.value += Math.min(delta, 0.05)
      if (shell.uniforms.uGlow) shell.uniforms.uGlow.value = now.glow
    } else if (shell && shell.emissiveIntensity !== undefined) {
      shell.emissiveIntensity = now.glow
    }
    // The plate is a lit material on eight finishes and a shader on the ninth,
    // where the hologram projects its own sticker well - so it takes the glow
    // the same two ways the shell does.
    if (plate?.uniforms) {
      if (plate.uniforms.uTime) plate.uniforms.uTime.value += Math.min(delta, 0.05)
      if (plate.uniforms.uGlow) plate.uniforms.uGlow.value = now.glow * 0.4
    } else if (plate && plate.emissiveIntensity !== undefined) {
      plate.emissiveIntensity = now.glow * 0.4
    }

    const rim = rimRef.current?.material as THREE.ShaderMaterial | undefined
    if (rim) rim.uniforms.uStrength.value = now.glow

    // One material behind both sets of lines, so the outline and the comb
    // brighten together - a cartridge whose edges lit at different rates would
    // read as two objects.
    const neon = wireRef.current?.material as THREE.LineBasicMaterial | undefined
    if (neon) neon.opacity = Math.min(1, neonRest(finish) + now.glow * NEON_LIT)

    // The chain that keeps a demand-driven canvas running: as long as anything
    // is still moving, ask for one more frame. When everything has settled the
    // chain stops on its own and the shelf costs nothing until the pointer moves.
    // A galaxy is never done turning, so it asks for every frame for as long as
    // it is on the shelf. Everything else settles and the canvas goes quiet.
    if (moving || animates(finish)) invalidate()
  })

  if (!parts) return null

  const dimmed = item.dimmed === true

  return (
    <group
      ref={group}
      position={position}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
        invalidate()
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = ''
        invalidate()
      }}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(item.ref)
      }}
    >
      {/* Held back a little, for a level this surface may look at and not use.
          A size rather than a fade, because a translucent cartridge next to a
          solid one reads as one that is still loading. */}
      <group scale={dimmed ? 0.93 : 1}>
        {/* Before the shell, so the band is behind everything the cartridge
            actually is. It is not a click target: the raycast has to reach the
            plastic underneath it, which is a whisker further away. */}
        <mesh
          ref={rimRef}
          geometry={parts.shell}
          material={skin.rim}
          scale={RIM_SCALE}
          raycast={() => null}
        />

        <mesh ref={shellRef} geometry={parts.shell} material={skin.shell} />
        <mesh ref={plateRef} geometry={parts.plate} material={skin.plate} />

        {/*
          The neon, over the plastic rather than instead of it.

          Two sets because the shell and the sticker plate are two geometries -
          the outline and the shoulder come off the first, and every fin of the
          pin comb off the second, which is the half that makes a cartridge look
          like something you plug in. Neither is a click target: the raycast has
          to reach the solid underneath, and a hit on a hairline would be a
          cartridge you can only click on its edges.
        */}
        <lineSegments
          ref={wireRef}
          geometry={neonEdges(parts.shell)}
          material={skin.neon}
          raycast={() => null}
        />
        <lineSegments
          geometry={neonEdges(parts.plate)}
          material={skin.neon}
          raycast={() => null}
        />

        {cover && (
          <mesh
            position={[LABEL.x, LABEL.y, LABEL.z]}
            /* The picture is not a click target of its own: the whole cartridge
               is one, and a raycast that stopped at the sticker would make the
               plastic around it feel dead. */
            raycast={() => null}
          >
            <planeGeometry args={[LABEL.width, LABEL.height]} />
            {/* Declared here rather than built alongside the plastic: the mesh
                is only rendered once the picture has arrived, so the material
                is created with its map already set and never recompiles. Semi
                gloss, like a real printed sticker, and never metal. */}
            {/* `envMapIntensity` held right down: the room is there for the
                metals, and a printed picture that reflects it is a picture
                nobody can read. */}
            <meshStandardMaterial
              map={cover}
              roughness={0.52}
              metalness={0}
              envMapIntensity={0.25}
            />
          </mesh>
        )}

        {plate && (
          <mesh
            position={[0, -CART.height / 2 - PLATE_HEIGHT / 2 - 0.11, CART.depth / 2]}
            raycast={() => null}
          >
            <planeGeometry args={[plate.width, plate.height]} />
            <meshBasicMaterial
              map={plate.texture}
              transparent
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}
