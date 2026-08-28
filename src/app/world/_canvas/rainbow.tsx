'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { isPropModel } from '@/domain/lounge/palette'

/**
 * Rainbow road, as a material.
 *
 * Two jobs, one surface, and that is deliberate:
 *
 * - **Loading.** A block whose glTF has not arrived is drawn as a rainbow box
 *   the size of its cell. The lounge used to render nothing at all, so a world
 *   on a slow connection was an empty floor - which is indistinguishable from a
 *   broken one. A ghost is honest about the difference: the shape is already
 *   right, only the surface is missing.
 * - **Rainbow mode.** The same skin, put on the world on purpose - in the
 *   lounge by whoever throws the switch, in the studio by whoever composes the
 *   shot. Blocks and the ground, never the animals.
 *
 * They look identical on purpose. A block still arriving during a rainbow is
 * then indistinguishable from one that has arrived, which is the correct
 * behaviour and the reason there is one material here rather than two.
 */

/** A hair under a cell, so ghosts stay separated by the grid behind them. */
const GHOST_SIZE = 0.92

/**
 * The look.
 *
 * One Fresnel term doing all the work: the dot of the normal with the direction
 * to the camera is one where a face points at you and zero at its silhouette,
 * so its inverse is a band hugging every edge. That is the same trick the party
 * rim in `<AvatarModel>` uses - here it is the whole material rather than an
 * addition to a lit one, which is what makes a block read as glass rather than
 * as a solid that happens to glow.
 *
 * The hue is a function of world position and time, so it runs *through* the
 * scene as a band instead of every surface cycling in unison. A thousand cubes
 * blinking together looks like a fault; a wave travelling across them looks
 * like one thing.
 *
 * No tone mapping and no colour-space conversion on the output. Both would pull
 * the spectrum back toward white, and the whole point of this is to be
 * unmistakably not the ordinary world.
 */
function createRainbowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    // Off, because these overlap constantly and an InstancedMesh cannot sort
    // per instance anyway - one draw call is one sort position. The stacking
    // that results is the correct read for glass.
    depthWrite: false,
    // The Fresnel is taken from `abs(dot(...))`, so a back face lights its edge
    // exactly like a front one - which is what lets you see the far side of a
    // block through the near one.
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFogColour: { value: new THREE.Color('#0a0616') },
      uFogDensity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;

      varying vec3 vRainbowNormal;
      varying vec3 vRainbowView;
      varying vec3 vRainbowWorld;
      varying float vRainbowFogDepth;

      void main() {
        // The same material is used instanced (a field of blocks) and plain
        // (one model, one picture frame), and three only declares the
        // instanceMatrix attribute for the first, so the identity stands in.
        mat4 instance = mat4(1.0);
        #ifdef USE_INSTANCING
          instance = instanceMatrix;
        #endif

        vec4 anchor = modelMatrix * instance * vec4(0.0, 0.0, 0.0, 1.0);

        // Breathing, phase-shifted by where the thing stands, so the swell
        // crosses the world as a wave rather than pumping all at once.
        float wave = sin(uTime * 2.2 - (anchor.x + anchor.z) * 0.32 + anchor.y * 0.55);
        vec3 swollen = position * (1.0 + wave * 0.04);

        vec4 world = modelMatrix * instance * vec4(swollen, 1.0);
        vec4 view = viewMatrix * world;

        vRainbowWorld = world.xyz;
        // Uniform scale throughout, so the rotation part of the matrix is
        // enough - no inverse transpose needed to keep normals honest.
        vRainbowNormal = normalize(mat3(modelMatrix) * mat3(instance) * normal);
        vRainbowView = normalize(cameraPosition - world.xyz);
        vRainbowFogDepth = -view.z;

        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFogColour;
      uniform float uFogDensity;

      varying vec3 vRainbowNormal;
      varying vec3 vRainbowView;
      varying vec3 vRainbowWorld;
      varying float vRainbowFogDepth;

      /** Hue to RGB, full saturation and value. Six ramps, no branches. */
      vec3 spectrum(float hue) {
        return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }

      void main() {
        float facing = abs(dot(normalize(vRainbowNormal), normalize(vRainbowView)));
        float edge = pow(1.0 - facing, 2.2);

        // Diagonal in x/z with a steeper climb in y, so a tower is a gradient
        // and a floor is a slow sweep. Negative time so the band travels
        // outward rather than at you.
        float hue = fract(
          (vRainbowWorld.x + vRainbowWorld.z) * 0.035 + vRainbowWorld.y * 0.09 - uTime * 0.12
        );
        vec3 colour = spectrum(hue);

        // The faces carry enough alpha to stay legible against the public
        // lounge's near-white sky - a skin tuned only for the dark world washes
        // straight out over there - and the edges take the rest.
        vec3 lit = mix(colour * 0.4, colour * 1.7 + 0.18, edge);
        float alpha = 0.17 + edge * 0.7;

        // The scene's own fog, applied by hand: a ShaderMaterial gets none of
        // three's fog chunks for free, and a rainbow that ignores the fog hangs
        // in front of a world that has already faded.
        float fogged = 1.0 - exp(-uFogDensity * uFogDensity * vRainbowFogDepth * vRainbowFogDepth);
        lit = mix(lit, uFogColour, fogged);

        gl_FragColor = vec4(lit, alpha);
      }
    `,
  })
}

/**
 * Where the sweep has got to.
 *
 * `'clock'` runs it off the frame clock, which is what anywhere live wants. A
 * number is an instant, in seconds, and is what the studio passes: a still is
 * one frozen moment of the sweep, and a recording is the moment for the frame
 * being drawn. Same reasoning as `glowAt` in `@/domain/studio/shot` - a
 * document that resolved its own colour from a wall clock would record
 * differently every time it was recorded.
 */
export type RainbowPhase = number | 'clock'

/**
 * One long-lived material, wound forward every frame.
 *
 * Also where the scene's fog is read from, rather than hardcoded, because the
 * places this is used are lit from opposite ends: the member lounge is
 * near-black indigo, the public one near-white, and the studio has no fog at
 * all. A material tuned to one of them hangs wrongly in the others.
 */
function useRainbowMaterial(phase: RainbowPhase): THREE.ShaderMaterial {
  const fog = useThree((state) => state.scene.fog)
  const material = useMemo(() => createRainbowMaterial(), [])

  useEffect(() => {
    wearFog(material, fog)
  }, [fog, material])

  useEffect(() => () => material.dispose(), [material])

  // On the frame loop rather than in an effect, for the frozen case as much as
  // the live one: R3F runs its subscribers immediately before it draws, so a
  // scrubbed playhead is written into the uniform for the very frame that shows
  // it. An effect would land a frame late, which is visible on a slider.
  useFrame((state) => {
    windSweep(material, phase === 'clock' ? state.clock.elapsedTime : phase)
  })

  return material
}

/**
 * The two uniform writes, out here rather than inline.
 *
 * Not a style choice: a uniform is mutable state on a long-lived object, which
 * is the one thing a hook body is not allowed to touch - `react-hooks` refuses
 * both a memo value modified after render and a ref read during one. A plain
 * function taking the material as an argument is neither, and it is honest
 * about what it does: this is imperative renderer state being written from a
 * frame callback, which is what three.js is.
 */
function windSweep(material: THREE.ShaderMaterial, seconds: number) {
  material.uniforms.uTime.value = seconds
}

function wearFog(material: THREE.ShaderMaterial, fog: THREE.Fog | THREE.FogExp2 | null) {
  if (fog instanceof THREE.FogExp2) {
    material.uniforms.uFogColour.value.copy(fog.color)
    material.uniforms.uFogDensity.value = fog.density
  } else {
    // Linear fog and no fog at all both land here: the shader only knows the
    // exponential kind, and a studio scene has none, so the term goes to zero
    // rather than guessing a density that would fade a still to nothing.
    material.uniforms.uFogDensity.value = 0
  }
}

interface RainbowSkin {
  /** Terrain, colour blocks and the ground: everything that is not furniture. */
  world: boolean
  /** The furniture and clutter. Separate, because a rainbow tree is a choice. */
  props: boolean
  material: THREE.ShaderMaterial
}

const RainbowContext = createContext<RainbowSkin | null>(null)

/**
 * Turns the world inside it to rainbow glass.
 *
 * A context rather than a prop threaded through every piece, because the things
 * that have to know are leaves - an InstancedMesh here, a cloned glTF there,
 * two of them inside a ground patch that is drawn a hundred blocks at a time -
 * and the thing that decides is the scene. Passing a material down through
 * `GrassPatch`, `Block` and `WorldSet` would be the same value written into
 * eight signatures that have no other reason to mention it.
 *
 * Must sit inside a Canvas: it winds the material forward on the frame loop.
 */
export function Rainbow({
  world,
  props,
  phase = 'clock',
  children,
}: {
  world: boolean
  props: boolean
  phase?: RainbowPhase
  children: ReactNode
}) {
  const material = useRainbowMaterial(phase)

  // Null when neither switch is on, so `useRainbowFor` below is a single null
  // check rather than three - and so a scene with the mode off pays nothing but
  // the uniform write above.
  const skin = useMemo(
    () => (world || props ? { world, props, material } : null),
    [world, props, material],
  )

  return <RainbowContext.Provider value={skin}>{children}</RainbowContext.Provider>
}

/**
 * The skin for one model, or null if that model is not wearing it.
 *
 * Props are asked about separately because they are the case where the effect
 * costs something: a rainbow cube still reads as a cube, while a rainbow tree
 * is a tree-shaped smear of light. The lounge never turns them on. The studio
 * offers it, because a composed still is somebody choosing.
 */
export function useRainbowFor(model: string): THREE.ShaderMaterial | null {
  const skin = useContext(RainbowContext)
  if (!skin) return null
  return (isPropModel(model) ? skin.props : skin.world) ? skin.material : null
}

/**
 * The skin for something that is not a block - a picture frame, a marker.
 *
 * Follows the world switch, since anything asking is scenery rather than
 * furniture.
 */
export function useRainbowScenery(): THREE.ShaderMaterial | null {
  const skin = useContext(RainbowContext)
  return skin?.world ? skin.material : null
}

/**
 * Wears the skin, over a model that was loaded with its own materials.
 *
 * For the cloned-glTF pieces, where there is no `material` prop to override -
 * the mesh already has one and the clone is ours to repaint. The originals are
 * put back on the way out, because `scene.clone(true)` shares materials with
 * every other clone of the same model: leaving them swapped would put the whole
 * palette in rainbow for the rest of the session.
 */
export function useRainbowSkin(object: THREE.Object3D, material: THREE.ShaderMaterial | null) {
  useEffect(() => {
    if (!material) return

    const restore: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = []
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      restore.push({ mesh, material: mesh.material })
      mesh.material = material
    })

    return () => {
      for (const entry of restore) entry.mesh.material = entry.material
    }
  }, [object, material])
}

/**
 * The ghosts of one model's blocks, in one draw call.
 *
 * Deliberately the same instancing shape as the `BlockInstances` it stands in
 * for, holding the same positions - the only thing that differs is that the
 * geometry is a box rather than the model's, which is the entire admission this
 * component is making.
 *
 * `ignoreRay` because the crosshair must not target these. Placing a block
 * against a ghost would resolve the cell against something that is about to
 * stop existing, and the ghost's box is not the model's shape anyway.
 */
export function BlockPlaceholders({
  positions,
}: {
  positions: { x: number; y: number; z: number }[]
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const material = useRainbowMaterial('clock')

  const geometry = useMemo(
    () => new THREE.BoxGeometry(GHOST_SIZE, GHOST_SIZE, GHOST_SIZE),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    const translation = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3(1, 1, 1)

    positions.forEach((position, index) => {
      // Cell centres, exactly as `BlockInstances` places the real thing, so the
      // swap when the model lands is a change of surface and not of position.
      translation.set(position.x + 0.5, position.y + 0.5, position.z + 0.5)
      matrix.compose(translation, rotation, scale)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.count = positions.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [positions])

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.max(positions.length, 1)]}
      userData={{ ignoreRay: true }}
    />
  )
}

/**
 * A body-sized ghost, for the moment before somebody's animal has downloaded.
 *
 * Taller than it is wide and standing on the floor rather than centred on the
 * origin, so it occupies roughly the volume the animal will - a person walking
 * toward you should not change size when their model arrives.
 *
 * Note this is the *only* place an animal is ever rainbow. Rainbow mode leaves
 * bodies alone: a room where you cannot tell who is who is a room nobody can
 * play in.
 */
export function AvatarPlaceholder() {
  const material = useRainbowMaterial('clock')

  const geometry = useMemo(() => new THREE.BoxGeometry(0.62, 0.86, 0.62), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, 0.43, 0]}
      userData={{ ignoreRay: true }}
    />
  )
}
